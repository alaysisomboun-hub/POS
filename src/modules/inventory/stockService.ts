import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Firestore,
} from 'firebase/firestore';
import { buildAuditLogPayload } from '../../core/firebase/auditService';
import { generateSafeId } from '../../core/utils/id';
import type {
  InventoryBalance,
  InventoryLot,
  Product,
  ProductUnit,
  StockMovementType,
  UserProfile,
} from '../../core/firebase/types';

export function getInventoryDocId(branchId: string, productId: string): string {
  return `${branchId}_${productId}`;
}

export function formatMultiUnitBreakdown(
  totalBaseQty: number,
  units: ProductUnit[],
  baseUnitName: string,
): string {
  const sign = totalBaseQty < 0 ? '-' : '';
  let remaining = Math.abs(Math.round(totalBaseQty));
  const sorted = [...units]
    .filter((u) => u.conversionFactor > 1)
    .sort((a, b) => b.conversionFactor - a.conversionFactor);

  if (sorted.length === 0 || remaining === 0) {
    return `${sign}${remaining.toLocaleString('en-US')} ${baseUnitName}`;
  }

  const parts: string[] = [];
  for (const unit of sorted) {
    const factor = Math.max(1, Math.round(unit.conversionFactor));
    const count = Math.floor(remaining / factor);
    if (count > 0) {
      parts.push(`${count.toLocaleString('en-US')} ${unit.unitName}`);
      remaining = remaining % factor;
    }
  }
  if (remaining > 0 || parts.length === 0) {
    parts.push(`${remaining.toLocaleString('en-US')} ${baseUnitName}`);
  }
  return `${sign}${parts.join(' ')}`;
}

interface StockInParams {
  db: Firestore;
  user: UserProfile;
  branchId: string;
  product: Product;
  unitName: string;
  conversionFactor: number;
  inputQty: number;
  unitCostPerInputUnitLak: number;
  lotNumber: string;
  expiryDate: string | null;
  storageLocationName: string;
  reason: string;
  referenceNo: string;
  movementType?: 'stock_in' | 'initial';
}

export async function executeStockIn(params: StockInParams): Promise<void> {
  const {
    db,
    user,
    branchId,
    product,
    unitName,
    conversionFactor,
    inputQty,
    unitCostPerInputUnitLak,
    lotNumber,
    expiryDate,
    storageLocationName,
    reason,
    referenceNo,
    movementType = 'stock_in',
  } = params;

  const safeFactor = Math.max(1, Math.round(conversionFactor));
  const safeInputQty = Math.max(0, Number(inputQty));
  const addedBaseQty = Math.round(safeInputQty * safeFactor);

  if (addedBaseQty <= 0) {
    throw new Error('จำนวนที่รับเข้าต้องมากกว่า 0');
  }

  const safeUnitCostInput = Math.max(0, Math.round(unitCostPerInputUnitLak));
  const unitCostBaseLak = Math.round(safeUnitCostInput / safeFactor);
  const totalCostLak = Math.round(safeInputQty * safeUnitCostInput);

  const inventoryId = getInventoryDocId(branchId, product.productId);
  const inventoryRef = doc(db, 'inventory', inventoryId);
  const lotId = generateSafeId('lot');
  const lotRef = doc(db, 'inventoryLots', lotId);
  const movementId = generateSafeId('mov');
  const movementRef = doc(db, 'stockMovements', movementId);

  const resolvedLotNumber =
    lotNumber.trim().slice(0, 60) ||
    `LOT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  const resolvedLocation = (storageLocationName || product.storageLocationName || '').slice(0, 100);

  await runTransaction(db, async (tx) => {
    const invSnap = await tx.get(inventoryRef);
    const prevQty = invSnap.exists() ? (invSnap.data() as InventoryBalance).qtyOnHandBase : 0;
    const prevAvgCost = invSnap.exists()
      ? (invSnap.data() as InventoryBalance).avgCostLak
      : product.costPriceLak;

    const nextQty = prevQty + addedBaseQty;
    const nextAvgCost =
      prevQty > 0 && nextQty > 0
        ? Math.round((prevQty * prevAvgCost + totalCostLak) / nextQty)
        : unitCostBaseLak;

    if (invSnap.exists()) {
      tx.update(inventoryRef, {
        skuSnapshot: product.sku,
        productNameSnapshot: product.name,
        baseUnitNameSnapshot: product.baseUnitName,
        qtyOnHandBase: nextQty,
        avgCostLak: nextAvgCost,
        minStockBaseQty: product.minStockBaseQty,
        storageLocationName: resolvedLocation,
        lastMovementAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      tx.set(inventoryRef, {
        inventoryId,
        organizationId: user.organizationId,
        branchId,
        ownerUid: user.ownerUid,
        productId: product.productId,
        skuSnapshot: product.sku,
        productNameSnapshot: product.name,
        baseUnitNameSnapshot: product.baseUnitName,
        qtyOnHandBase: nextQty,
        reservedQtyBase: 0,
        avgCostLak: nextAvgCost,
        minStockBaseQty: product.minStockBaseQty,
        storageLocationName: resolvedLocation,
        lastMovementAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    tx.set(lotRef, {
      lotId,
      organizationId: user.organizationId,
      branchId,
      ownerUid: user.ownerUid,
      productId: product.productId,
      skuSnapshot: product.sku,
      productNameSnapshot: product.name,
      lotNumber: resolvedLotNumber,
      expiryDate: expiryDate && expiryDate.trim() ? expiryDate.trim().slice(0, 20) : null,
      initialQtyBase: addedBaseQty,
      remainingQtyBase: addedBaseQty,
      unitCostBaseLak,
      storageLocationName: resolvedLocation,
      status: 'active',
      receivedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    tx.set(movementRef, {
      movementId,
      organizationId: user.organizationId,
      branchId,
      ownerUid: user.ownerUid,
      productId: product.productId,
      skuSnapshot: product.sku,
      productNameSnapshot: product.name,
      lotId,
      lotNumberSnapshot: resolvedLotNumber,
      movementType,
      unitName: unitName.slice(0, 40),
      conversionFactor: safeFactor,
      inputQty: safeInputQty,
      baseQtyDelta: addedBaseQty,
      balanceBeforeBase: prevQty,
      balanceAfterBase: nextQty,
      unitCostBaseLak,
      totalCostLak,
      reason: reason.trim().slice(0, 300) || 'รับสินค้าเข้าคลัง',
      referenceNo: referenceNo.trim().slice(0, 60),
      performedByUid: user.uid,
      performedByName: user.name.slice(0, 120),
      createdAt: serverTimestamp(),
    });

    const audit = buildAuditLogPayload({
      user,
      branchId,
      action: movementType === 'initial' ? 'INITIAL_STOCK_IN' : 'STOCK_IN',
      entityType: 'inventory',
      entityId: product.productId,
      before: { qtyOnHandBase: prevQty, avgCostLak: prevAvgCost },
      after: {
        qtyOnHandBase: nextQty,
        avgCostLak: nextAvgCost,
        addedBaseQty,
        lotNumber: resolvedLotNumber,
      },
    });
    tx.set(audit.ref, audit.data);
  });
}

interface StockOutParams {
  db: Firestore;
  user: UserProfile;
  branchId: string;
  product: Product;
  unitName: string;
  conversionFactor: number;
  inputQty: number;
  movementType: Extract<StockMovementType, 'stock_out' | 'damaged' | 'expired' | 'lost'>;
  specificLotId?: string | null;
  reason: string;
  referenceNo: string;
  allowNegativeStock: boolean;
}

export async function executeStockOut(params: StockOutParams): Promise<void> {
  const {
    db,
    user,
    branchId,
    product,
    unitName,
    conversionFactor,
    inputQty,
    movementType,
    specificLotId,
    reason,
    referenceNo,
    allowNegativeStock,
  } = params;

  const safeFactor = Math.max(1, Math.round(conversionFactor));
  const safeInputQty = Math.max(0, Number(inputQty));
  const deductBaseQty = Math.round(safeInputQty * safeFactor);

  if (deductBaseQty <= 0) {
    throw new Error('จำนวนที่เบิกออกต้องมากกว่า 0');
  }

  // Query active lots for FEFO before entering transaction, then re-read inside transaction
  const lotsQuery = query(
    collection(db, 'inventoryLots'),
    where('organizationId', '==', user.organizationId),
    where('branchId', '==', branchId),
  );
  const lotsSnap = await getDocs(lotsQuery);
  const candidateLotIds = lotsSnap.docs
    .map((d) => d.data() as InventoryLot)
    .filter((l) => l.productId === product.productId && l.status === 'active' && l.remainingQtyBase > 0)
    .sort((a, b) => {
      if (a.expiryDate && b.expiryDate) return a.expiryDate.localeCompare(b.expiryDate);
      if (a.expiryDate) return -1;
      if (b.expiryDate) return 1;
      const aTime = a.receivedAt?.toMillis?.() ?? 0;
      const bTime = b.receivedAt?.toMillis?.() ?? 0;
      return aTime - bTime;
    })
    .map((l) => l.lotId);

  const lotIdsToRead = specificLotId
    ? [specificLotId]
    : candidateLotIds.slice(0, 15);

  const inventoryId = getInventoryDocId(branchId, product.productId);
  const inventoryRef = doc(db, 'inventory', inventoryId);
  const movementId = generateSafeId('mov');
  const movementRef = doc(db, 'stockMovements', movementId);

  await runTransaction(db, async (tx) => {
    const invSnap = await tx.get(inventoryRef);
    const prevQty = invSnap.exists() ? (invSnap.data() as InventoryBalance).qtyOnHandBase : 0;
    const avgCost = invSnap.exists()
      ? (invSnap.data() as InventoryBalance).avgCostLak
      : product.costPriceLak;

    if (!allowNegativeStock && prevQty < deductBaseQty) {
      throw new Error(
        `สต็อกคงเหลือไม่เพียงพอ (คงเหลือ ${prevQty} ${product.baseUnitName} ต้องการตัด ${deductBaseQty} ${product.baseUnitName})`,
      );
    }

    const lotDocs: InventoryLot[] = [];
    for (const lotId of lotIdsToRead) {
      const lSnap = await tx.get(doc(db, 'inventoryLots', lotId));
      if (lSnap.exists()) {
        lotDocs.push(lSnap.data() as InventoryLot);
      }
    }

    if (specificLotId) {
      const target = lotDocs[0];
      if (!target || target.remainingQtyBase < deductBaseQty) {
        throw new Error(
          `ล็อตที่เลือกมียอดคงเหลือไม่พอ (คงเหลือ ${target?.remainingQtyBase ?? 0} ${product.baseUnitName})`,
        );
      }
    }

    const nextQty = prevQty - deductBaseQty;

    if (invSnap.exists()) {
      tx.update(inventoryRef, {
        skuSnapshot: product.sku,
        productNameSnapshot: product.name,
        baseUnitNameSnapshot: product.baseUnitName,
        qtyOnHandBase: nextQty,
        minStockBaseQty: product.minStockBaseQty,
        storageLocationName: product.storageLocationName,
        lastMovementAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      tx.set(inventoryRef, {
        inventoryId,
        organizationId: user.organizationId,
        branchId,
        ownerUid: user.ownerUid,
        productId: product.productId,
        skuSnapshot: product.sku,
        productNameSnapshot: product.name,
        baseUnitNameSnapshot: product.baseUnitName,
        qtyOnHandBase: nextQty,
        reservedQtyBase: 0,
        avgCostLak: avgCost,
        minStockBaseQty: product.minStockBaseQty,
        storageLocationName: product.storageLocationName,
        lastMovementAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    let remainingToDeduct = deductBaseQty;
    let primaryLotId: string | null = null;
    let primaryLotNumber: string | null = null;

    for (const lot of lotDocs) {
      if (remainingToDeduct <= 0) break;
      if (lot.remainingQtyBase <= 0) continue;

      const take = Math.min(lot.remainingQtyBase, remainingToDeduct);
      const nextLotQty = lot.remainingQtyBase - take;
      if (!primaryLotId) {
        primaryLotId = lot.lotId;
        primaryLotNumber = lot.lotNumber;
      }

      tx.update(doc(db, 'inventoryLots', lot.lotId), {
        remainingQtyBase: nextLotQty,
        status: nextLotQty <= 0 ? 'depleted' : lot.status,
        updatedAt: serverTimestamp(),
      });

      remainingToDeduct -= take;
    }

    const totalCostLak = Math.round(deductBaseQty * avgCost);

    tx.set(movementRef, {
      movementId,
      organizationId: user.organizationId,
      branchId,
      ownerUid: user.ownerUid,
      productId: product.productId,
      skuSnapshot: product.sku,
      productNameSnapshot: product.name,
      lotId: primaryLotId,
      lotNumberSnapshot: primaryLotNumber,
      movementType,
      unitName: unitName.slice(0, 40),
      conversionFactor: safeFactor,
      inputQty: safeInputQty,
      baseQtyDelta: -deductBaseQty,
      balanceBeforeBase: prevQty,
      balanceAfterBase: nextQty,
      unitCostBaseLak: avgCost,
      totalCostLak,
      reason: reason.trim().slice(0, 300) || 'เบิกสินค้าออก',
      referenceNo: referenceNo.trim().slice(0, 60),
      performedByUid: user.uid,
      performedByName: user.name.slice(0, 120),
      createdAt: serverTimestamp(),
    });

    const audit = buildAuditLogPayload({
      user,
      branchId,
      action: `STOCK_${movementType.toUpperCase()}`,
      entityType: 'inventory',
      entityId: product.productId,
      before: { qtyOnHandBase: prevQty },
      after: { qtyOnHandBase: nextQty, deductBaseQty, movementType },
    });
    tx.set(audit.ref, audit.data);
  });
}

interface StockCountParams {
  db: Firestore;
  user: UserProfile;
  branchId: string;
  product: Product;
  countedBaseQty: number;
  reason: string;
}

export async function executeStockCountAdjustment(params: StockCountParams): Promise<void> {
  const { db, user, branchId, product, countedBaseQty, reason } = params;
  const safeCounted = Math.round(countedBaseQty);
  if (safeCounted < 0) {
    throw new Error('ยอดตรวจนับจริงต้องไม่ติดลบ');
  }

  const inventoryId = getInventoryDocId(branchId, product.productId);
  const inventoryRef = doc(db, 'inventory', inventoryId);
  const movementId = generateSafeId('mov');
  const movementRef = doc(db, 'stockMovements', movementId);

  const lotsQuery = query(
    collection(db, 'inventoryLots'),
    where('organizationId', '==', user.organizationId),
    where('branchId', '==', branchId),
  );
  const lotsSnap = await getDocs(lotsQuery);
  const candidateLotIds = lotsSnap.docs
    .map((d) => d.data() as InventoryLot)
    .filter((l) => l.productId === product.productId && l.status === 'active' && l.remainingQtyBase > 0)
    .sort((a, b) => {
      if (a.expiryDate && b.expiryDate) return a.expiryDate.localeCompare(b.expiryDate);
      if (a.expiryDate) return -1;
      if (b.expiryDate) return 1;
      return (a.receivedAt?.toMillis?.() ?? 0) - (b.receivedAt?.toMillis?.() ?? 0);
    })
    .map((l) => l.lotId)
    .slice(0, 15);

  await runTransaction(db, async (tx) => {
    const invSnap = await tx.get(inventoryRef);
    const prevQty = invSnap.exists() ? (invSnap.data() as InventoryBalance).qtyOnHandBase : 0;
    const avgCost = invSnap.exists()
      ? (invSnap.data() as InventoryBalance).avgCostLak
      : product.costPriceLak;

    const delta = safeCounted - prevQty;
    if (delta === 0) {
      throw new Error('ยอดตรวจนับตรงกับยอดในระบบ ไม่มีการปรับปรุง');
    }

    const lotDocs: InventoryLot[] = [];
    if (delta < 0) {
      for (const lotId of candidateLotIds) {
        const lSnap = await tx.get(doc(db, 'inventoryLots', lotId));
        if (lSnap.exists()) lotDocs.push(lSnap.data() as InventoryLot);
      }
    }

    if (invSnap.exists()) {
      tx.update(inventoryRef, {
        skuSnapshot: product.sku,
        productNameSnapshot: product.name,
        baseUnitNameSnapshot: product.baseUnitName,
        qtyOnHandBase: safeCounted,
        minStockBaseQty: product.minStockBaseQty,
        storageLocationName: product.storageLocationName,
        lastMovementAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      tx.set(inventoryRef, {
        inventoryId,
        organizationId: user.organizationId,
        branchId,
        ownerUid: user.ownerUid,
        productId: product.productId,
        skuSnapshot: product.sku,
        productNameSnapshot: product.name,
        baseUnitNameSnapshot: product.baseUnitName,
        qtyOnHandBase: safeCounted,
        reservedQtyBase: 0,
        avgCostLak: avgCost,
        minStockBaseQty: product.minStockBaseQty,
        storageLocationName: product.storageLocationName,
        lastMovementAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    let refLotId: string | null = null;
    let refLotNumber: string | null = null;

    if (delta > 0) {
      const lotId = generateSafeId('lot');
      const lotNumber = `ADJ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
      refLotId = lotId;
      refLotNumber = lotNumber;
      tx.set(doc(db, 'inventoryLots', lotId), {
        lotId,
        organizationId: user.organizationId,
        branchId,
        ownerUid: user.ownerUid,
        productId: product.productId,
        skuSnapshot: product.sku,
        productNameSnapshot: product.name,
        lotNumber,
        expiryDate: null,
        initialQtyBase: delta,
        remainingQtyBase: delta,
        unitCostBaseLak: avgCost,
        storageLocationName: product.storageLocationName,
        status: 'active',
        receivedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      let rem = Math.abs(delta);
      for (const lot of lotDocs) {
        if (rem <= 0) break;
        const take = Math.min(lot.remainingQtyBase, rem);
        const nextLotQty = lot.remainingQtyBase - take;
        if (!refLotId) {
          refLotId = lot.lotId;
          refLotNumber = lot.lotNumber;
        }
        tx.update(doc(db, 'inventoryLots', lot.lotId), {
          remainingQtyBase: nextLotQty,
          status: nextLotQty <= 0 ? 'depleted' : lot.status,
          updatedAt: serverTimestamp(),
        });
        rem -= take;
      }
    }

    const absDelta = Math.abs(delta);
    tx.set(movementRef, {
      movementId,
      organizationId: user.organizationId,
      branchId,
      ownerUid: user.ownerUid,
      productId: product.productId,
      skuSnapshot: product.sku,
      productNameSnapshot: product.name,
      lotId: refLotId,
      lotNumberSnapshot: refLotNumber,
      movementType: delta > 0 ? 'adjustment_in' : 'adjustment_out',
      unitName: product.baseUnitName,
      conversionFactor: 1,
      inputQty: absDelta,
      baseQtyDelta: delta,
      balanceBeforeBase: prevQty,
      balanceAfterBase: safeCounted,
      unitCostBaseLak: avgCost,
      totalCostLak: Math.round(absDelta * avgCost),
      reason: reason.trim().slice(0, 300) || 'ปรับปรุงยอดจากการตรวจนับสต็อก',
      referenceNo: 'COUNT',
      performedByUid: user.uid,
      performedByName: user.name.slice(0, 120),
      createdAt: serverTimestamp(),
    });

    const audit = buildAuditLogPayload({
      user,
      branchId,
      action: 'STOCK_COUNT_ADJUSTMENT',
      entityType: 'inventory',
      entityId: product.productId,
      before: { qtyOnHandBase: prevQty },
      after: { qtyOnHandBase: safeCounted, delta },
    });
    tx.set(audit.ref, audit.data);
  });
}
