import {
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { buildAuditLogPayload, writeAuditLog } from '../../core/firebase/auditService';
import { generateSafeId } from '../../core/utils/id';
import { getInventoryDocId } from '../inventory/stockService';
import type {
  InventoryBalance,
  JournalLine,
  Product,
  PurchaseOrder,
  PurchaseOrderItem,
  Supplier,
  UserProfile,
} from '../../core/firebase/types';

function todayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Vientiane' }).format(new Date());
}

export function generatePoNumber(): string {
  const stamp = todayYmd().replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PO-${stamp}-${rand}`;
}

export async function createPurchaseOrder(params: {
  db: Firestore;
  user: UserProfile;
  branchId: string;
  supplier: Supplier;
  items: PurchaseOrderItem[];
  discountLak: number;
  shippingFeeLak: number;
  taxAmountLak: number;
  paymentType: 'cash' | 'credit';
  dueDate: string | null;
  notes: string;
}): Promise<PurchaseOrder> {
  const {
    db,
    user,
    branchId,
    supplier,
    items,
    discountLak,
    shippingFeeLak,
    taxAmountLak,
    paymentType,
    dueDate,
    notes,
  } = params;

  if (items.length === 0) {
    throw new Error('ກະລຸນາເພີ່ມລາຍການສິນຄ້າໃນໃບສັ່ງຊື້ຢ່າງໜ້ອຍ 1 ລາຍການ');
  }

  const subtotalLak = items.reduce((s, it) => s + it.lineTotalLak, 0);
  const safeDiscount = Math.min(subtotalLak, Math.max(0, Math.round(discountLak)));
  const safeShipping = Math.max(0, Math.round(shippingFeeLak));
  const safeTax = Math.max(0, Math.round(taxAmountLak));
  const grandTotalLak = Math.max(0, subtotalLak - safeDiscount + safeShipping + safeTax);

  const poId = generateSafeId('po');
  const poNumber = generatePoNumber();

  await setDoc(doc(db, 'purchaseOrders', poId), {
    poId,
    poNumber,
    organizationId: user.organizationId,
    branchId,
    ownerUid: user.ownerUid,
    supplierId: supplier.supplierId,
    supplierName: supplier.name.slice(0, 140),
    items: items.slice(0, 100),
    subtotalLak,
    discountLak: safeDiscount,
    shippingFeeLak: safeShipping,
    taxAmountLak: safeTax,
    grandTotalLak,
    paymentType,
    paidAmountLak: 0,
    creditDueLak: paymentType === 'credit' ? grandTotalLak : 0,
    dueDate: paymentType === 'credit' && dueDate ? dueDate.slice(0, 20) : null,
    status: 'ordered',
    notes: notes.trim().slice(0, 300),
    createdByUid: user.uid,
    createdByName: user.name.slice(0, 120),
    receivedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await writeAuditLog({
    user,
    branchId,
    action: 'CREATE_PURCHASE_ORDER',
    entityType: 'purchaseOrders',
    entityId: poId,
    before: null,
    after: {
      poNumber,
      supplierName: supplier.name,
      grandTotalLak,
      paymentType,
      itemCount: items.length,
    },
  });

  return {
    poId,
    poNumber,
    organizationId: user.organizationId,
    branchId,
    ownerUid: user.ownerUid,
    supplierId: supplier.supplierId,
    supplierName: supplier.name,
    items,
    subtotalLak,
    discountLak: safeDiscount,
    shippingFeeLak: safeShipping,
    taxAmountLak: safeTax,
    grandTotalLak,
    paymentType,
    paidAmountLak: 0,
    creditDueLak: paymentType === 'credit' ? grandTotalLak : 0,
    dueDate: paymentType === 'credit' ? dueDate : null,
    status: 'ordered',
    notes,
    createdByUid: user.uid,
    createdByName: user.name,
    receivedAt: null,
    createdAt: null as never,
    updatedAt: null as never,
  };
}

export async function receivePurchaseOrder(params: {
  db: Firestore;
  user: UserProfile;
  branchId: string;
  po: PurchaseOrder;
  productsMap: Map<string, Product>;
}): Promise<void> {
  const { db, user, branchId, po, productsMap } = params;
  if (po.status !== 'ordered') {
    throw new Error('ໃບສັ່ງຊື້ນີ້ບໍ່ໄດ້ຢູ່ໃນສະຖານະລໍຖ້າຮັບເຂົ້າ');
  }

  const uniqueProductIds = Array.from(new Set(po.items.map((i) => i.productId)));

  await runTransaction(db, async (tx) => {
    // 1. ALL READS FIRST
    const poRef = doc(db, 'purchaseOrders', po.poId);
    const poSnap = await tx.get(poRef);
    if (!poSnap.exists()) throw new Error('ບໍ່ພົບຂໍ້ມູນໃບສັ່ງຊື້');
    const latestPo = poSnap.data() as PurchaseOrder;
    if (latestPo.status !== 'ordered') {
      throw new Error('ໃບສັ່ງຊື້ນີ້ຖືກຮັບເຂົ້າ ຫຼື ຍົກເລີກໄປແລ້ວ');
    }

    const supRef = doc(db, 'suppliers', latestPo.supplierId);
    const supSnap = await tx.get(supRef);
    const latestSup = supSnap.exists() ? (supSnap.data() as Supplier) : null;

    const invSnaps = new Map<string, { exists: boolean; data: InventoryBalance | null }>();
    for (const prodId of uniqueProductIds) {
      const invRef = doc(db, 'inventory', getInventoryDocId(branchId, prodId));
      const snap = await tx.get(invRef);
      invSnaps.set(prodId, {
        exists: snap.exists(),
        data: snap.exists() ? (snap.data() as InventoryBalance) : null,
      });
    }

    // 2. COMPUTE PRO-RATED LANDED COST & WAC PER PRODUCT
    const addedBaseByProd = new Map<string, number>();
    const allocatedCostByProd = new Map<string, number>();
    const itemAllocatedCost: number[] = [];

    for (const item of latestPo.items) {
      const shareRatio =
        latestPo.subtotalLak > 0
          ? item.lineTotalLak / latestPo.subtotalLak
          : 1 / Math.max(1, latestPo.items.length);
      const landedTotal = Math.max(0, Math.round(latestPo.grandTotalLak * shareRatio));
      itemAllocatedCost.push(landedTotal);

      addedBaseByProd.set(
        item.productId,
        (addedBaseByProd.get(item.productId) ?? 0) + item.baseQty,
      );
      allocatedCostByProd.set(
        item.productId,
        (allocatedCostByProd.get(item.productId) ?? 0) + landedTotal,
      );
    }

    // 3. ALL WRITES
    const runningBal = new Map<string, number>();

    for (const prodId of uniqueProductIds) {
      const inv = invSnaps.get(prodId)!;
      const prod = productsMap.get(prodId);
      const prevQty = inv.data?.qtyOnHandBase ?? 0;
      const prevAvgCost = inv.data?.avgCostLak ?? prod?.costPriceLak ?? 0;
      const addedBase = addedBaseByProd.get(prodId) ?? 0;
      const addedCost = allocatedCostByProd.get(prodId) ?? 0;
      const nextQty = prevQty + addedBase;
      const nextAvgCost =
        prevQty > 0 && nextQty > 0
          ? Math.round((prevQty * prevAvgCost + addedCost) / nextQty)
          : addedBase > 0
            ? Math.round(addedCost / addedBase)
            : prevAvgCost;

      runningBal.set(prodId, prevQty);

      const invId = getInventoryDocId(branchId, prodId);
      const invRef = doc(db, 'inventory', invId);
      if (inv.exists) {
        tx.update(invRef, {
          qtyOnHandBase: nextQty,
          avgCostLak: nextAvgCost,
          lastMovementAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else if (prod) {
        tx.set(invRef, {
          inventoryId: invId,
          organizationId: user.organizationId,
          branchId,
          ownerUid: user.ownerUid,
          productId: prod.productId,
          skuSnapshot: prod.sku,
          productNameSnapshot: prod.name,
          baseUnitNameSnapshot: prod.baseUnitName,
          qtyOnHandBase: nextQty,
          reservedQtyBase: 0,
          avgCostLak: nextAvgCost,
          minStockBaseQty: prod.minStockBaseQty,
          storageLocationName: prod.storageLocationName,
          lastMovementAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    const todayStamp = todayYmd().replace(/-/g, '');
    for (let i = 0; i < latestPo.items.length; i++) {
      const item = latestPo.items[i];
      const landedTotal = itemAllocatedCost[i] ?? item.lineTotalLak;
      const unitCostBaseLak =
        item.baseQty > 0 ? Math.round(landedTotal / item.baseQty) : item.unitCostLak;

      const beforeQty = runningBal.get(item.productId) ?? 0;
      const afterQty = beforeQty + item.baseQty;
      runningBal.set(item.productId, afterQty);

      const prod = productsMap.get(item.productId);
      const lotId = generateSafeId('lot');
      const lotNumber =
        item.lotNumber.trim().slice(0, 60) || `PO-${todayStamp}-${i + 1}`;

      tx.set(doc(db, 'inventoryLots', lotId), {
        lotId,
        organizationId: user.organizationId,
        branchId,
        ownerUid: user.ownerUid,
        productId: item.productId,
        skuSnapshot: item.sku,
        productNameSnapshot: item.name,
        lotNumber,
        expiryDate: item.expiryDate || null,
        initialQtyBase: item.baseQty,
        remainingQtyBase: item.baseQty,
        unitCostBaseLak,
        storageLocationName: prod?.storageLocationName ?? '',
        status: 'active',
        receivedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const movId = generateSafeId('mov');
      tx.set(doc(db, 'stockMovements', movId), {
        movementId: movId,
        organizationId: user.organizationId,
        branchId,
        ownerUid: user.ownerUid,
        productId: item.productId,
        skuSnapshot: item.sku,
        productNameSnapshot: item.name,
        lotId,
        lotNumberSnapshot: lotNumber,
        movementType: 'stock_in',
        unitName: item.unitName.slice(0, 40),
        conversionFactor: item.conversionFactor,
        inputQty: item.qty,
        baseQtyDelta: item.baseQty,
        balanceBeforeBase: beforeQty,
        balanceAfterBase: afterQty,
        unitCostBaseLak,
        totalCostLak: landedTotal,
        reason: `ຮັບສິນຄ້າຈາກໃບສັ່ງຊື້ ${latestPo.poNumber} (${latestPo.supplierName})`.slice(0, 300),
        referenceNo: latestPo.poNumber.slice(0, 60),
        performedByUid: user.uid,
        performedByName: user.name.slice(0, 120),
        createdAt: serverTimestamp(),
      });
    }

    const isCredit = latestPo.paymentType === 'credit';
    tx.update(poRef, {
      status: 'received',
      paidAmountLak: isCredit ? 0 : latestPo.grandTotalLak,
      creditDueLak: isCredit ? latestPo.grandTotalLak : 0,
      receivedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (isCredit && latestSup) {
      tx.update(supRef, {
        payableBalanceLak: latestSup.payableBalanceLak + latestPo.grandTotalLak,
        updatedAt: serverTimestamp(),
      });
    }

    const entryDate = todayYmd();
    if (!isCredit && latestPo.grandTotalLak > 0) {
      const expId = generateSafeId('exp');
      tx.set(doc(db, 'expenseEntries', expId), {
        entryId: expId,
        organizationId: user.organizationId,
        branchId,
        ownerUid: user.ownerUid,
        category: 'inventory_purchase',
        title: `ຊື້ສິນຄ້າເຂົ້າສາງ ${latestPo.poNumber} (${latestPo.supplierName})`.slice(0, 160),
        amountLak: latestPo.grandTotalLak,
        paymentMethod: 'cash',
        referenceNo: latestPo.poNumber.slice(0, 60),
        notes: latestPo.notes.slice(0, 300),
        entryDate,
        recordedByUid: user.uid,
        recordedByName: user.name.slice(0, 120),
        createdAt: serverTimestamp(),
      });
    }

    if (latestPo.grandTotalLak > 0) {
      const lines: JournalLine[] = [
        {
          accountCode: '1140',
          accountName: 'ສິນຄ້າຄົງເຫຼືອ',
          debitLak: latestPo.grandTotalLak,
          creditLak: 0,
        },
        isCredit
          ? {
              accountCode: '2110',
              accountName: 'ເຈົ້າໜີ້ການຄ້າ',
              debitLak: 0,
              creditLak: latestPo.grandTotalLak,
            }
          : {
              accountCode: '1110',
              accountName: 'ເງິນສົດໃນມື',
              debitLak: 0,
              creditLak: latestPo.grandTotalLak,
            },
      ];
      const journalId = generateSafeId('jnl');
      tx.set(doc(db, 'journalEntries', journalId), {
        journalId,
        entryNumber: `JV-${latestPo.poNumber}`.slice(0, 40),
        organizationId: user.organizationId,
        branchId,
        ownerUid: user.ownerUid,
        entryDate,
        description: `ຮັບສິນຄ້າຕາມໃບສັ່ງຊື້ ${latestPo.poNumber} (${latestPo.supplierName})`.slice(0, 300),
        sourceType: 'purchase',
        referenceNo: latestPo.poNumber.slice(0, 60),
        lines,
        totalDebitLak: latestPo.grandTotalLak,
        totalCreditLak: latestPo.grandTotalLak,
        createdByUid: user.uid,
        createdByName: user.name.slice(0, 120),
        createdAt: serverTimestamp(),
      });
    }

    const audit = buildAuditLogPayload({
      user,
      branchId,
      action: 'PURCHASE_ORDER_RECEIVED',
      entityType: 'purchaseOrders',
      entityId: latestPo.poId,
      before: { status: 'ordered' },
      after: {
        poNumber: latestPo.poNumber,
        grandTotalLak: latestPo.grandTotalLak,
        paymentType: latestPo.paymentType,
      },
    });
    tx.set(audit.ref, audit.data);
  });
}

export async function cancelPurchaseOrder(params: {
  db: Firestore;
  user: UserProfile;
  branchId: string;
  po: PurchaseOrder;
}): Promise<void> {
  const { db, user, branchId, po } = params;
  if (po.status !== 'ordered') {
    throw new Error('ຍົກເລີກໄດ້ສະເພາະໃບສັ່ງຊື້ທີ່ຍັງບໍ່ຮັບສິນຄ້າເຂົ້າສາງເທົ່ານັ້ນ');
  }
  await updateDoc(doc(db, 'purchaseOrders', po.poId), {
    status: 'cancelled',
    creditDueLak: 0,
    updatedAt: serverTimestamp(),
  });
  await writeAuditLog({
    user,
    branchId,
    action: 'PURCHASE_ORDER_CANCELLED',
    entityType: 'purchaseOrders',
    entityId: po.poId,
    before: { status: 'ordered' },
    after: { status: 'cancelled', poNumber: po.poNumber },
  });
}
