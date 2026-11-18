import {
  Timestamp,
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { buildAuditLogPayload } from '../../core/firebase/auditService';
import { generateSafeId } from '../../core/utils/id';
import { roundLak, type RoundingMode } from '../../core/utils/money';
import { getInventoryDocId } from '../inventory/stockService';
import type {
  Customer,
  HeldBillItem,
  InventoryBalance,
  InventoryLot,
  JournalLine,
  MembershipTier,
  PaymentMethodType,
  PaymentSplit,
  PosHeldBill,
  PriceTier,
  Product,
  ProductUnit,
  SaleItem,
  SaleOrder,
  SaleReturn,
  SaleReturnItem,
  SystemSetting,
  UserProfile,
} from '../../core/firebase/types';

export interface PosCartItemInput {
  product: Product;
  unit: ProductUnit;
  qty: number;
  unitPriceLak: number;
  discountLak: number;
}

export interface ComputedBillTotals {
  items: SaleItem[];
  subtotalLak: number;
  itemDiscountTotalLak: number;
  billDiscountLak: number;
  taxableAmountLak: number;
  taxRate: number;
  taxAmountLak: number;
  grandTotalLak: number;
}

function getVientianeDateStamp(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Vientiane',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}${m}${d}`;
}

function getVientianeYmd(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Vientiane' }).format(new Date());
}

export function generateInvoiceNumber(prefix = 'INV'): string {
  const cleanPrefix = prefix.replace(/[^A-Z0-9-]/gi, '').toUpperCase().slice(0, 8) || 'INV';
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${cleanPrefix}-${getVientianeDateStamp()}-${rand}`.slice(0, 40);
}

export function generateReturnNumber(): string {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RET-${getVientianeDateStamp()}-${rand}`.slice(0, 40);
}

export function getUnitPriceByTier(unit: ProductUnit, tier: PriceTier): number {
  if (tier === 'wholesale') return Math.max(0, Math.round(unit.wholesalePrice));
  if (tier === 'member') return Math.max(0, Math.round(unit.memberPrice));
  return Math.max(0, Math.round(unit.retailPrice));
}

export function computeBillTotals(params: {
  cartItems: PosCartItemInput[];
  billDiscountLak: number;
  taxSettings?: SystemSetting['taxSettings'] | null;
  roundingMode?: RoundingMode;
}): ComputedBillTotals {
  const { cartItems, billDiscountLak, taxSettings, roundingMode = 'integer' } = params;

  let subtotalLak = 0;
  let itemDiscountTotalLak = 0;
  let taxableLineNetSum = 0;

  const saleItems: SaleItem[] = cartItems.map((entry) => {
    const qty = Math.max(1, Math.round(entry.qty));
    const unitPriceLak = Math.max(0, Math.round(entry.unitPriceLak));
    const grossLine = Math.round(qty * unitPriceLak);
    const discountLak = Math.min(grossLine, Math.max(0, Math.round(entry.discountLak)));
    const lineTotalLak = Math.max(0, grossLine - discountLak);
    const conversionFactor = Math.max(1, Math.round(entry.unit.conversionFactor));
    const baseQty = qty * conversionFactor;

    subtotalLak += grossLine;
    itemDiscountTotalLak += discountLak;
    if (entry.product.taxable) {
      taxableLineNetSum += lineTotalLak;
    }

    return {
      productId: entry.product.productId,
      sku: entry.product.sku,
      name: entry.product.name,
      unitId: entry.unit.unitId,
      unitName: entry.unit.unitName,
      conversionFactor,
      qty,
      baseQty,
      unitPriceLak,
      discountLak,
      lineTotalLak,
      unitCostBaseLak: entry.product.costPriceLak,
      cogsTotalLak: Math.round(baseQty * entry.product.costPriceLak),
      taxable: entry.product.taxable,
    };
  });

  const afterItemDiscountLak = Math.max(0, subtotalLak - itemDiscountTotalLak);
  const clampedBillDiscount = Math.min(
    afterItemDiscountLak,
    Math.max(0, Math.round(billDiscountLak)),
  );
  const netAfterAllDiscountLak = Math.max(0, afterItemDiscountLak - clampedBillDiscount);

  const taxableRatio =
    afterItemDiscountLak > 0 ? taxableLineNetSum / afterItemDiscountLak : 0;
  const rawTaxableBase = Math.round(netAfterAllDiscountLak * taxableRatio);

  const taxEnabled = Boolean(taxSettings?.taxEnabled) && (taxSettings?.taxRate ?? 0) > 0;
  const taxRate = taxEnabled ? Number(taxSettings?.taxRate ?? 0) : 0;

  let taxableAmountLak = netAfterAllDiscountLak;
  let taxAmountLak = 0;
  let rawGrandTotal = netAfterAllDiscountLak;

  if (taxEnabled && taxRate > 0) {
    if (taxSettings?.taxInclusive) {
      taxAmountLak = Math.round(rawTaxableBase - rawTaxableBase / (1 + taxRate / 100));
      taxableAmountLak = Math.max(0, rawTaxableBase - taxAmountLak);
      rawGrandTotal = netAfterAllDiscountLak;
    } else {
      taxableAmountLak = rawTaxableBase;
      taxAmountLak = Math.round((rawTaxableBase * taxRate) / 100);
      rawGrandTotal = netAfterAllDiscountLak + taxAmountLak;
    }
  }

  const grandTotalLak = Math.max(0, roundLak(rawGrandTotal, roundingMode));

  return {
    items: saleItems,
    subtotalLak,
    itemDiscountTotalLak,
    billDiscountLak: clampedBillDiscount,
    taxableAmountLak,
    taxRate,
    taxAmountLak,
    grandTotalLak,
  };
}

export interface ExecutePosCheckoutParams {
  db: Firestore;
  user: UserProfile;
  branchId: string;
  priceTier: PriceTier;
  customerId?: string | null;
  customerName: string;
  membershipTier?: MembershipTier | null;
  cartItems: PosCartItemInput[];
  billDiscountLak: number;
  taxSettings?: SystemSetting['taxSettings'] | null;
  roundingMode?: RoundingMode;
  invoicePrefix?: string;
  allowNegativeStock: boolean;
  paymentMethod: PaymentMethodType;
  payments: PaymentSplit[];
  notes: string;
  heldBillId?: string | null;
}

export async function executePosCheckout(
  params: ExecutePosCheckoutParams,
): Promise<SaleOrder> {
  const {
    db,
    user,
    branchId,
    priceTier,
    customerId = null,
    customerName,
    membershipTier = null,
    cartItems,
    billDiscountLak,
    taxSettings,
    roundingMode = 'integer',
    invoicePrefix = 'INV',
    allowNegativeStock,
    paymentMethod,
    payments,
    notes,
    heldBillId = null,
  } = params;

  if (cartItems.length === 0) {
    throw new Error('กรุณาเพิ่มสินค้าลงในตะกร้าก่อนชำระเงิน');
  }
  if (cartItems.length > 100) {
    throw new Error('รายการสินค้าต่อ 1 บิลต้องไม่เกิน 100 รายการ');
  }

  const computed = computeBillTotals({
    cartItems,
    billDiscountLak,
    taxSettings,
    roundingMode,
  });

  const cleanPayments = payments
    .map((p) => ({
      method: p.method,
      amountLak: Math.max(0, Math.round(p.amountLak)),
    }))
    .filter((p) => p.amountLak > 0 || (computed.grandTotalLak === 0 && payments.length === 1))
    .slice(0, 5);

  if (cleanPayments.length === 0) {
    throw new Error('กรุณาระบุยอดชำระเงินให้ถูกต้อง');
  }

  const creditDueLak = cleanPayments
    .filter((p) => p.method === 'credit')
    .reduce((sum, p) => sum + p.amountLak, 0);
  const nonCreditTenderedLak = cleanPayments
    .filter((p) => p.method !== 'credit')
    .reduce((sum, p) => sum + p.amountLak, 0);

  const totalCoveredLak = nonCreditTenderedLak + creditDueLak;
  if (totalCoveredLak < computed.grandTotalLak) {
    throw new Error(
      `ยอดชำระยังไม่ครบ (ขาดอีก ${(computed.grandTotalLak - totalCoveredLak).toLocaleString('en-US')} ₭)`,
    );
  }

  const nonCreditDueLak = Math.max(0, computed.grandTotalLak - creditDueLak);
  const changeAmountLak = Math.max(0, nonCreditTenderedLak - nonCreditDueLak);
  const paidAmountLak = Math.min(nonCreditTenderedLak, nonCreditDueLak);

  // Aggregate base qty needed per productId
  const uniqueProductIds = Array.from(new Set(computed.items.map((i) => i.productId)));
  const requiredBaseByProduct = new Map<string, number>();
  const productLookup = new Map<string, Product>();
  for (let i = 0; i < computed.items.length; i++) {
    const item = computed.items[i];
    requiredBaseByProduct.set(
      item.productId,
      (requiredBaseByProduct.get(item.productId) ?? 0) + item.baseQty,
    );
    productLookup.set(item.productId, cartItems[i].product);
  }

  // Pre-query active lots for FEFO before entering transaction
  const lotsQuery = query(
    collection(db, 'inventoryLots'),
    where('organizationId', '==', user.organizationId),
    where('branchId', '==', branchId),
  );
  const lotsSnap = await getDocs(lotsQuery);
  const candidateLotIdsByProduct = new Map<string, string[]>();
  const lotsByProduct = new Map<string, InventoryLot[]>();

  for (const docSnap of lotsSnap.docs) {
    const lot = docSnap.data() as InventoryLot;
    if (!requiredBaseByProduct.has(lot.productId)) continue;
    if (lot.status !== 'active' || lot.remainingQtyBase <= 0) continue;
    const list = lotsByProduct.get(lot.productId) ?? [];
    list.push(lot);
    lotsByProduct.set(lot.productId, list);
  }

  for (const [prodId, list] of lotsByProduct.entries()) {
    list.sort((a, b) => {
      if (a.expiryDate && b.expiryDate) return a.expiryDate.localeCompare(b.expiryDate);
      if (a.expiryDate) return -1;
      if (b.expiryDate) return 1;
      return (a.receivedAt?.toMillis?.() ?? 0) - (b.receivedAt?.toMillis?.() ?? 0);
    });
    candidateLotIdsByProduct.set(
      prodId,
      list.slice(0, 10).map((l) => l.lotId),
    );
  }

  const saleId = generateSafeId('sale');
  const invoiceNumber = generateInvoiceNumber(invoicePrefix);
  const resolvedCustomerName = customerName.trim().slice(0, 120) || 'ลูกค้าทั่วไป';
  const resolvedNotes = notes.trim().slice(0, 300);

  let finalCogsTotalLak = 0;
  let finalItems: SaleItem[] = [];

  await runTransaction(db, async (tx) => {
    // 1. ALL READS FIRST
    const invSnaps = new Map<string, { exists: boolean; data: InventoryBalance | null }>();
    for (const prodId of uniqueProductIds) {
      const invRef = doc(db, 'inventory', getInventoryDocId(branchId, prodId));
      const snap = await tx.get(invRef);
      invSnaps.set(prodId, {
        exists: snap.exists(),
        data: snap.exists() ? (snap.data() as InventoryBalance) : null,
      });
    }

    const txLotsByProduct = new Map<string, InventoryLot[]>();
    for (const prodId of uniqueProductIds) {
      const lotIds = candidateLotIdsByProduct.get(prodId) ?? [];
      const loaded: InventoryLot[] = [];
      for (const lotId of lotIds) {
        const lSnap = await tx.get(doc(db, 'inventoryLots', lotId));
        if (lSnap.exists()) {
          const lotData = lSnap.data() as InventoryLot;
          if (lotData.remainingQtyBase > 0 && lotData.status === 'active') {
            loaded.push({ ...lotData });
          }
        }
      }
      txLotsByProduct.set(prodId, loaded);
    }

    let heldBillRef: ReturnType<typeof doc> | null = null;
    let shouldMarkHeldResumed = false;
    if (heldBillId) {
      heldBillRef = doc(db, 'posHeldBills', heldBillId);
      const heldSnap = await tx.get(heldBillRef);
      if (heldSnap.exists() && (heldSnap.data() as PosHeldBill).status === 'held') {
        shouldMarkHeldResumed = true;
      }
    }

    let customerRef: ReturnType<typeof doc> | null = null;
    let loadedCustomer: Customer | null = null;
    if (customerId) {
      customerRef = doc(db, 'customers', customerId);
      const custSnap = await tx.get(customerRef);
      if (custSnap.exists()) {
        loadedCustomer = custSnap.data() as Customer;
      }
    }

    // 2. VALIDATIONS
    if (
      loadedCustomer &&
      creditDueLak > 0 &&
      loadedCustomer.creditLimitLak > 0 &&
      loadedCustomer.creditBalanceLak + creditDueLak > loadedCustomer.creditLimitLak
    ) {
      throw new Error(
        `ลูกค้า "${loadedCustomer.name}" มียอดหนี้เกินวงเงินเครดิตที่กำหนด (คงเหลือได้อีก ${Math.max(0, loadedCustomer.creditLimitLak - loadedCustomer.creditBalanceLak).toLocaleString('en-US')} ₭)`,
      );
    }

    const runningBalanceByProduct = new Map<string, number>();
    const avgCostByProduct = new Map<string, number>();

    for (const prodId of uniqueProductIds) {
      const prod = productLookup.get(prodId)!;
      const inv = invSnaps.get(prodId);
      const currentQty = inv?.data?.qtyOnHandBase ?? 0;
      const requiredQty = requiredBaseByProduct.get(prodId) ?? 0;

      if (!allowNegativeStock && currentQty < requiredQty) {
        throw new Error(
          `สินค้า "${prod.name}" คงเหลือไม่พอ (คงเหลือ ${currentQty.toLocaleString('en-US')} ${prod.baseUnitName} ต้องการตัด ${requiredQty.toLocaleString('en-US')} ${prod.baseUnitName})`,
        );
      }

      runningBalanceByProduct.set(prodId, currentQty);
      avgCostByProduct.set(prodId, inv?.data?.avgCostLak ?? prod.costPriceLak);
    }

    // 3. ALL WRITES
    finalItems = computed.items.map((item) => {
      const avgCost = avgCostByProduct.get(item.productId) ?? item.unitCostBaseLak;
      const cogs = Math.round(item.baseQty * avgCost);
      finalCogsTotalLak += cogs;
      return {
        ...item,
        unitCostBaseLak: avgCost,
        cogsTotalLak: cogs,
      };
    });

    // Deduct inventory balances once per unique product
    for (const prodId of uniqueProductIds) {
      const prod = productLookup.get(prodId)!;
      const inv = invSnaps.get(prodId)!;
      const invId = getInventoryDocId(branchId, prodId);
      const invRef = doc(db, 'inventory', invId);
      const prevQty = inv.data?.qtyOnHandBase ?? 0;
      const avgCost = avgCostByProduct.get(prodId) ?? prod.costPriceLak;
      const deductTotal = requiredBaseByProduct.get(prodId) ?? 0;
      const nextQty = prevQty - deductTotal;

      if (inv.exists) {
        tx.update(invRef, {
          skuSnapshot: prod.sku,
          productNameSnapshot: prod.name,
          baseUnitNameSnapshot: prod.baseUnitName,
          qtyOnHandBase: nextQty,
          minStockBaseQty: prod.minStockBaseQty,
          storageLocationName: prod.storageLocationName,
          lastMovementAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
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
          avgCostLak: avgCost,
          minStockBaseQty: prod.minStockBaseQty,
          storageLocationName: prod.storageLocationName,
          lastMovementAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    // Deduct FEFO lots & create stock movements per cart line
    const touchedLotFinalState = new Map<string, InventoryLot>();

    for (const item of finalItems) {
      const prod = productLookup.get(item.productId)!;
      const beforeQty = runningBalanceByProduct.get(item.productId) ?? 0;
      const afterQty = beforeQty - item.baseQty;
      runningBalanceByProduct.set(item.productId, afterQty);

      const lots = txLotsByProduct.get(item.productId) ?? [];
      let remToDeduct = item.baseQty;
      let primaryLotId: string | null = null;
      let primaryLotNumber: string | null = null;

      for (const lot of lots) {
        if (remToDeduct <= 0) break;
        if (lot.remainingQtyBase <= 0) continue;

        const take = Math.min(lot.remainingQtyBase, remToDeduct);
        lot.remainingQtyBase -= take;
        if (lot.remainingQtyBase <= 0) {
          lot.status = 'depleted';
        }
        touchedLotFinalState.set(lot.lotId, lot);

        if (!primaryLotId) {
          primaryLotId = lot.lotId;
          primaryLotNumber = lot.lotNumber;
        }
        remToDeduct -= take;
      }

      const movementId = generateSafeId('mov');
      tx.set(doc(db, 'stockMovements', movementId), {
        movementId,
        organizationId: user.organizationId,
        branchId,
        ownerUid: user.ownerUid,
        productId: item.productId,
        skuSnapshot: prod.sku,
        productNameSnapshot: prod.name,
        lotId: primaryLotId,
        lotNumberSnapshot: primaryLotNumber,
        movementType: 'sale',
        unitName: item.unitName.slice(0, 40),
        conversionFactor: item.conversionFactor,
        inputQty: item.qty,
        baseQtyDelta: -item.baseQty,
        balanceBeforeBase: beforeQty,
        balanceAfterBase: afterQty,
        unitCostBaseLak: item.unitCostBaseLak,
        totalCostLak: item.cogsTotalLak,
        reason: `ขายหน้าร้าน POS (${invoiceNumber})`,
        referenceNo: invoiceNumber,
        performedByUid: user.uid,
        performedByName: user.name.slice(0, 120),
        createdAt: serverTimestamp(),
      });
    }

    for (const lot of touchedLotFinalState.values()) {
      tx.update(doc(db, 'inventoryLots', lot.lotId), {
        remainingQtyBase: lot.remainingQtyBase,
        status: lot.remainingQtyBase <= 0 ? 'depleted' : lot.status,
        updatedAt: serverTimestamp(),
      });
    }

    const grossProfitLak = computed.grandTotalLak - computed.taxAmountLak - finalCogsTotalLak;

    const salePayload = {
      saleId,
      invoiceNumber,
      organizationId: user.organizationId,
      branchId,
      ownerUid: user.ownerUid,
      priceTier,
      customerId,
      customerName: resolvedCustomerName,
      items: finalItems,
      subtotalLak: computed.subtotalLak,
      itemDiscountTotalLak: computed.itemDiscountTotalLak,
      billDiscountLak: computed.billDiscountLak,
      taxableAmountLak: computed.taxableAmountLak,
      taxRate: computed.taxRate,
      taxAmountLak: computed.taxAmountLak,
      grandTotalLak: computed.grandTotalLak,
      cogsTotalLak: finalCogsTotalLak,
      grossProfitLak,
      paymentMethod,
      payments: cleanPayments,
      paidAmountLak,
      changeAmountLak,
      creditDueLak,
      status: 'completed' as const,
      notes: resolvedNotes,
      cashierUid: user.uid,
      cashierName: user.name.slice(0, 120),
      voidedReason: null,
      voidedByName: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    tx.set(doc(db, 'sales', saleId), salePayload);

    if (shouldMarkHeldResumed && heldBillRef) {
      tx.update(heldBillRef, {
        status: 'resumed',
        updatedAt: serverTimestamp(),
      });
    }

    if (customerRef && loadedCustomer) {
      const pointsPer1000 = membershipTier?.pointsPer1000Lak ?? 1;
      const earnedPoints = Math.floor(computed.grandTotalLak / 1000) * pointsPer1000;
      tx.update(customerRef, {
        pointsBalance: Math.max(0, Math.round(loadedCustomer.pointsBalance + earnedPoints)),
        totalSpentLak: loadedCustomer.totalSpentLak + computed.grandTotalLak,
        creditBalanceLak: loadedCustomer.creditBalanceLak + creditDueLak,
        updatedAt: serverTimestamp(),
      });
    }

    const entryDate = getVientianeYmd();
    if (paidAmountLak > 0) {
      const firstNonCredit = cleanPayments.find((p) => p.method !== 'credit');
      const incomeMethod: 'cash' | 'transfer' | 'qr' =
        firstNonCredit && firstNonCredit.method !== 'credit' ? firstNonCredit.method : 'cash';
      const incId = generateSafeId('inc');
      tx.set(doc(db, 'incomeEntries', incId), {
        entryId: incId,
        organizationId: user.organizationId,
        branchId,
        ownerUid: user.ownerUid,
        category: 'sales',
        title: `รายได้ขายหน้าร้าน ${invoiceNumber}`.slice(0, 160),
        amountLak: paidAmountLak,
        paymentMethod: incomeMethod,
        referenceNo: invoiceNumber.slice(0, 60),
        notes: `ลูกค้า: ${resolvedCustomerName}`.slice(0, 300),
        entryDate,
        recordedByUid: user.uid,
        recordedByName: user.name.slice(0, 120),
        createdAt: serverTimestamp(),
      });
    }

    // Balanced Double-Entry Journal
    const cashTendered = cleanPayments
      .filter((p) => p.method === 'cash')
      .reduce((s, p) => s + p.amountLak, 0);
    const cashApplied = Math.min(paidAmountLak, cashTendered);
    const bankApplied = Math.max(0, paidAmountLak - cashApplied);
    const netRevenueLak = Math.max(0, computed.grandTotalLak - computed.taxAmountLak);

    const journalLines: JournalLine[] = [];
    if (cashApplied > 0) {
      journalLines.push({
        accountCode: '1110',
        accountName: 'เงินสดในมือ',
        debitLak: cashApplied,
        creditLak: 0,
      });
    }
    if (bankApplied > 0) {
      journalLines.push({
        accountCode: '1120',
        accountName: 'เงินฝากธนาคาร / QR',
        debitLak: bankApplied,
        creditLak: 0,
      });
    }
    if (creditDueLak > 0) {
      journalLines.push({
        accountCode: '1130',
        accountName: 'ลูกหนี้การค้า',
        debitLak: creditDueLak,
        creditLak: 0,
      });
    }
    if (finalCogsTotalLak > 0) {
      journalLines.push({
        accountCode: '5100',
        accountName: 'ต้นทุนขาย (COGS)',
        debitLak: finalCogsTotalLak,
        creditLak: 0,
      });
    }
    if (netRevenueLak > 0) {
      journalLines.push({
        accountCode: '4100',
        accountName: 'รายได้จากการขายสินค้า',
        debitLak: 0,
        creditLak: netRevenueLak,
      });
    }
    if (computed.taxAmountLak > 0) {
      journalLines.push({
        accountCode: '2120',
        accountName: 'ภาษีขายค้างจ่าย',
        debitLak: 0,
        creditLak: computed.taxAmountLak,
      });
    }
    if (finalCogsTotalLak > 0) {
      journalLines.push({
        accountCode: '1140',
        accountName: 'สินค้าคงเหลือ',
        debitLak: 0,
        creditLak: finalCogsTotalLak,
      });
    }

    const totalDr = journalLines.reduce((s, l) => s + l.debitLak, 0);
    const totalCr = journalLines.reduce((s, l) => s + l.creditLak, 0);
    if (journalLines.length >= 2 && totalDr > 0 && totalDr === totalCr) {
      const journalId = generateSafeId('jnl');
      tx.set(doc(db, 'journalEntries', journalId), {
        journalId,
        entryNumber: `JV-${invoiceNumber}`.slice(0, 40),
        organizationId: user.organizationId,
        branchId,
        ownerUid: user.ownerUid,
        entryDate,
        description: `บันทึกการขายหน้าร้าน ${invoiceNumber} (${resolvedCustomerName})`.slice(0, 300),
        sourceType: 'sale',
        referenceNo: invoiceNumber.slice(0, 60),
        lines: journalLines,
        totalDebitLak: totalDr,
        totalCreditLak: totalCr,
        createdByUid: user.uid,
        createdByName: user.name.slice(0, 120),
        createdAt: serverTimestamp(),
      });
    }

    const audit = buildAuditLogPayload({
      user,
      branchId,
      action: 'POS_SALE_COMPLETED',
      entityType: 'sales',
      entityId: saleId,
      before: null,
      after: {
        invoiceNumber,
        grandTotalLak: computed.grandTotalLak,
        cogsTotalLak: finalCogsTotalLak,
        grossProfitLak,
        paymentMethod,
        itemCount: finalItems.length,
      },
    });
    tx.set(audit.ref, audit.data);
  });

  const nowTs = Timestamp.now();
  const grossProfitLak = computed.grandTotalLak - computed.taxAmountLak - finalCogsTotalLak;

  return {
    saleId,
    invoiceNumber,
    organizationId: user.organizationId,
    branchId,
    ownerUid: user.ownerUid,
    priceTier,
    customerId,
    customerName: resolvedCustomerName,
    items: finalItems,
    subtotalLak: computed.subtotalLak,
    itemDiscountTotalLak: computed.itemDiscountTotalLak,
    billDiscountLak: computed.billDiscountLak,
    taxableAmountLak: computed.taxableAmountLak,
    taxRate: computed.taxRate,
    taxAmountLak: computed.taxAmountLak,
    grandTotalLak: computed.grandTotalLak,
    cogsTotalLak: finalCogsTotalLak,
    grossProfitLak,
    paymentMethod,
    payments: cleanPayments,
    paidAmountLak,
    changeAmountLak,
    creditDueLak,
    status: 'completed',
    notes: resolvedNotes,
    cashierUid: user.uid,
    cashierName: user.name.slice(0, 120),
    voidedReason: null,
    voidedByName: null,
    createdAt: nowTs,
    updatedAt: nowTs,
  };
}

export async function executeVoidSale(params: {
  db: Firestore;
  user: UserProfile;
  branchId: string;
  sale: SaleOrder;
  reason: string;
  productsMap: Map<string, Product>;
}): Promise<void> {
  const { db, user, branchId, sale, reason, productsMap } = params;
  const cleanReason = reason.trim().slice(0, 300);
  if (!cleanReason) {
    throw new Error('กรุณาระบุเหตุผลการยกเลิกบิลขาย');
  }
  if (sale.status === 'voided') {
    throw new Error('บิลขายนี้ถูกยกเลิกไปแล้ว');
  }
  if (sale.status !== 'completed') {
    throw new Error('บิลที่มีการรับคืนสินค้าแล้ว ไม่สามารถยกเลิกทั้งบิลได้');
  }

  const restockByProduct = new Map<string, number>();
  for (const item of sale.items) {
    restockByProduct.set(
      item.productId,
      (restockByProduct.get(item.productId) ?? 0) + item.baseQty,
    );
  }
  const uniqueProductIds = Array.from(restockByProduct.keys());

  await runTransaction(db, async (tx) => {
    const saleRef = doc(db, 'sales', sale.saleId);
    const saleSnap = await tx.get(saleRef);
    if (!saleSnap.exists()) {
      throw new Error('ไม่พบข้อมูลบิลขายในระบบ');
    }
    const latestSale = saleSnap.data() as SaleOrder;
    if (latestSale.status !== 'completed') {
      throw new Error('สถานะบิลเปลี่ยนแปลงแล้ว ไม่สามารถยกเลิกซ้ำได้');
    }

    const invSnaps = new Map<string, { exists: boolean; data: InventoryBalance | null }>();
    for (const prodId of uniqueProductIds) {
      const invRef = doc(db, 'inventory', getInventoryDocId(branchId, prodId));
      const snap = await tx.get(invRef);
      invSnaps.set(prodId, {
        exists: snap.exists(),
        data: snap.exists() ? (snap.data() as InventoryBalance) : null,
      });
    }

    const runningBalanceByProduct = new Map<string, number>();
    for (const prodId of uniqueProductIds) {
      const inv = invSnaps.get(prodId)!;
      const prod = productsMap.get(prodId);
      const prevQty = inv.data?.qtyOnHandBase ?? 0;
      const addBase = restockByProduct.get(prodId) ?? 0;
      const nextQty = prevQty + addBase;
      runningBalanceByProduct.set(prodId, prevQty);

      const invRef = doc(db, 'inventory', getInventoryDocId(branchId, prodId));
      if (inv.exists) {
        tx.update(invRef, {
          qtyOnHandBase: nextQty,
          lastMovementAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else if (prod) {
        tx.set(invRef, {
          inventoryId: getInventoryDocId(branchId, prodId),
          organizationId: user.organizationId,
          branchId,
          ownerUid: user.ownerUid,
          productId: prod.productId,
          skuSnapshot: prod.sku,
          productNameSnapshot: prod.name,
          baseUnitNameSnapshot: prod.baseUnitName,
          qtyOnHandBase: nextQty,
          reservedQtyBase: 0,
          avgCostLak: prod.costPriceLak,
          minStockBaseQty: prod.minStockBaseQty,
          storageLocationName: prod.storageLocationName,
          lastMovementAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    for (const item of latestSale.items) {
      const beforeQty = runningBalanceByProduct.get(item.productId) ?? 0;
      const afterQty = beforeQty + item.baseQty;
      runningBalanceByProduct.set(item.productId, afterQty);

      const prod = productsMap.get(item.productId);
      const lotId = generateSafeId('lot');
      const lotNumber = `VOID-${latestSale.invoiceNumber}`.slice(0, 60);

      tx.set(doc(db, 'inventoryLots', lotId), {
        lotId,
        organizationId: user.organizationId,
        branchId,
        ownerUid: user.ownerUid,
        productId: item.productId,
        skuSnapshot: item.sku,
        productNameSnapshot: item.name,
        lotNumber,
        expiryDate: null,
        initialQtyBase: item.baseQty,
        remainingQtyBase: item.baseQty,
        unitCostBaseLak: item.unitCostBaseLak,
        storageLocationName: prod?.storageLocationName ?? '',
        status: 'active',
        receivedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const movementId = generateSafeId('mov');
      tx.set(doc(db, 'stockMovements', movementId), {
        movementId,
        organizationId: user.organizationId,
        branchId,
        ownerUid: user.ownerUid,
        productId: item.productId,
        skuSnapshot: item.sku,
        productNameSnapshot: item.name,
        lotId,
        lotNumberSnapshot: lotNumber,
        movementType: 'sale_void',
        unitName: item.unitName.slice(0, 40),
        conversionFactor: item.conversionFactor,
        inputQty: item.qty,
        baseQtyDelta: item.baseQty,
        balanceBeforeBase: beforeQty,
        balanceAfterBase: afterQty,
        unitCostBaseLak: item.unitCostBaseLak,
        totalCostLak: item.cogsTotalLak,
        reason: `ยกเลิกบิล ${latestSale.invoiceNumber}: ${cleanReason}`.slice(0, 300),
        referenceNo: latestSale.invoiceNumber,
        performedByUid: user.uid,
        performedByName: user.name.slice(0, 120),
        createdAt: serverTimestamp(),
      });
    }

    tx.update(saleRef, {
      status: 'voided',
      voidedReason: cleanReason,
      voidedByName: user.name.slice(0, 120),
      updatedAt: serverTimestamp(),
    });

    const audit = buildAuditLogPayload({
      user,
      branchId,
      action: 'POS_SALE_VOIDED',
      entityType: 'sales',
      entityId: latestSale.saleId,
      before: { status: latestSale.status, grandTotalLak: latestSale.grandTotalLak },
      after: { status: 'voided', voidedReason: cleanReason },
    });
    tx.set(audit.ref, audit.data);
  });
}

export interface SaleReturnLineInput {
  saleItemIndex: number;
  qty: number;
  restock: boolean;
}

export async function executeSaleReturn(params: {
  db: Firestore;
  user: UserProfile;
  branchId: string;
  sale: SaleOrder;
  existingReturns: SaleReturn[];
  returnLines: SaleReturnLineInput[];
  refundMethod: 'cash' | 'transfer' | 'credit_adjust';
  reason: string;
  productsMap: Map<string, Product>;
}): Promise<SaleReturn> {
  const {
    db,
    user,
    branchId,
    sale,
    existingReturns,
    returnLines,
    refundMethod,
    reason,
    productsMap,
  } = params;

  const cleanReason = reason.trim().slice(0, 300);
  if (!cleanReason) {
    throw new Error('กรุณาระบุสาเหตุการรับคืนสินค้า');
  }
  if (sale.status === 'voided' || sale.status === 'returned') {
    throw new Error('บิลนี้ไม่สามารถรับคืนสินค้าเพิ่มเติมได้');
  }

  // Sum already returned base qty per product + unitName
  const alreadyReturnedBaseByKey = new Map<string, number>();
  for (const ret of existingReturns) {
    if (ret.saleId !== sale.saleId) continue;
    for (const ri of ret.items) {
      const k = `${ri.productId}__${ri.unitName}`;
      alreadyReturnedBaseByKey.set(k, (alreadyReturnedBaseByKey.get(k) ?? 0) + ri.baseQty);
    }
  }

  const activeLines = returnLines.filter((l) => l.qty > 0);
  if (activeLines.length === 0) {
    throw new Error('กรุณาระบุจำนวนสินค้าที่ต้องการคืนอย่างน้อย 1 รายการ');
  }

  const returnItems: SaleReturnItem[] = [];
  let totalRefundLak = 0;

  // Proportional effective net multiplier considering billDiscount + tax
  const billNetRatio =
    sale.subtotalLak - sale.itemDiscountTotalLak > 0
      ? sale.grandTotalLak / (sale.subtotalLak - sale.itemDiscountTotalLak)
      : 1;

  for (const line of activeLines) {
    const saleItem = sale.items[line.saleItemIndex];
    if (!saleItem) continue;
    const k = `${saleItem.productId}__${saleItem.unitName}`;
    const alreadyReturnedBase = alreadyReturnedBaseByKey.get(k) ?? 0;
    const remainingQty = Math.max(
      0,
      saleItem.qty - Math.floor(alreadyReturnedBase / saleItem.conversionFactor),
    );
    const reqQty = Math.round(line.qty);
    if (reqQty > remainingQty) {
      throw new Error(
        `สินค้า "${saleItem.name}" คืนได้สูงสุด ${remainingQty} ${saleItem.unitName}`,
      );
    }

    const baseQty = reqQty * saleItem.conversionFactor;
    const perUnitNet =
      saleItem.qty > 0 ? Math.round((saleItem.lineTotalLak * billNetRatio) / saleItem.qty) : 0;
    const lineRefundLak = Math.round(reqQty * perUnitNet);
    totalRefundLak += lineRefundLak;

    returnItems.push({
      productId: saleItem.productId,
      sku: saleItem.sku,
      name: saleItem.name,
      unitName: saleItem.unitName,
      conversionFactor: saleItem.conversionFactor,
      qty: reqQty,
      baseQty,
      refundPerUnitLak: perUnitNet,
      lineRefundLak,
      restock: line.restock,
    });
  }

  const returnId = generateSafeId('ret');
  const returnNumber = generateReturnNumber();

  // Check if after this return, every item in the sale is 100% returned
  const postReturnBaseByKey = new Map(alreadyReturnedBaseByKey);
  for (const ri of returnItems) {
    const k = `${ri.productId}__${ri.unitName}`;
    postReturnBaseByKey.set(k, (postReturnBaseByKey.get(k) ?? 0) + ri.baseQty);
  }
  const soldBaseByKey = new Map<string, number>();
  for (const si of sale.items) {
    const k = `${si.productId}__${si.unitName}`;
    soldBaseByKey.set(k, (soldBaseByKey.get(k) ?? 0) + si.baseQty);
  }
  let allReturned = true;
  for (const [k, soldBase] of soldBaseByKey.entries()) {
    if ((postReturnBaseByKey.get(k) ?? 0) < soldBase) {
      allReturned = false;
      break;
    }
  }
  const nextSaleStatus = allReturned ? 'returned' : 'partial_return';

  const restockProductIds = Array.from(
    new Set(returnItems.filter((i) => i.restock).map((i) => i.productId)),
  );

  await runTransaction(db, async (tx) => {
    const saleRef = doc(db, 'sales', sale.saleId);
    const saleSnap = await tx.get(saleRef);
    if (!saleSnap.exists()) {
      throw new Error('ไม่พบข้อมูลบิลขายในระบบ');
    }
    const latestSale = saleSnap.data() as SaleOrder;
    if (latestSale.status !== 'completed' && latestSale.status !== 'partial_return') {
      throw new Error('บิลขายนี้ไม่อยู่ในสถานะที่รับคืนสินค้าได้');
    }

    const invSnaps = new Map<string, { exists: boolean; data: InventoryBalance | null }>();
    for (const prodId of restockProductIds) {
      const invRef = doc(db, 'inventory', getInventoryDocId(branchId, prodId));
      const snap = await tx.get(invRef);
      invSnaps.set(prodId, {
        exists: snap.exists(),
        data: snap.exists() ? (snap.data() as InventoryBalance) : null,
      });
    }

    const restockTotalByProd = new Map<string, number>();
    for (const ri of returnItems) {
      if (!ri.restock) continue;
      restockTotalByProd.set(
        ri.productId,
        (restockTotalByProd.get(ri.productId) ?? 0) + ri.baseQty,
      );
    }

    const runningBal = new Map<string, number>();
    for (const prodId of restockProductIds) {
      const inv = invSnaps.get(prodId)!;
      const prevQty = inv.data?.qtyOnHandBase ?? 0;
      const addQty = restockTotalByProd.get(prodId) ?? 0;
      runningBal.set(prodId, prevQty);
      const prod = productsMap.get(prodId);

      const invRef = doc(db, 'inventory', getInventoryDocId(branchId, prodId));
      if (inv.exists) {
        tx.update(invRef, {
          qtyOnHandBase: prevQty + addQty,
          lastMovementAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else if (prod) {
        tx.set(invRef, {
          inventoryId: getInventoryDocId(branchId, prodId),
          organizationId: user.organizationId,
          branchId,
          ownerUid: user.ownerUid,
          productId: prod.productId,
          skuSnapshot: prod.sku,
          productNameSnapshot: prod.name,
          baseUnitNameSnapshot: prod.baseUnitName,
          qtyOnHandBase: prevQty + addQty,
          reservedQtyBase: 0,
          avgCostLak: prod.costPriceLak,
          minStockBaseQty: prod.minStockBaseQty,
          storageLocationName: prod.storageLocationName,
          lastMovementAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    for (const ri of returnItems) {
      if (!ri.restock) continue;
      const beforeQty = runningBal.get(ri.productId) ?? 0;
      const afterQty = beforeQty + ri.baseQty;
      runningBal.set(ri.productId, afterQty);

      const prod = productsMap.get(ri.productId);
      const unitCost =
        latestSale.items.find((si) => si.productId === ri.productId)?.unitCostBaseLak ??
        prod?.costPriceLak ??
        0;

      const lotId = generateSafeId('lot');
      const lotNumber = returnNumber;
      tx.set(doc(db, 'inventoryLots', lotId), {
        lotId,
        organizationId: user.organizationId,
        branchId,
        ownerUid: user.ownerUid,
        productId: ri.productId,
        skuSnapshot: ri.sku,
        productNameSnapshot: ri.name,
        lotNumber,
        expiryDate: null,
        initialQtyBase: ri.baseQty,
        remainingQtyBase: ri.baseQty,
        unitCostBaseLak: unitCost,
        storageLocationName: prod?.storageLocationName ?? '',
        status: 'active',
        receivedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const movementId = generateSafeId('mov');
      tx.set(doc(db, 'stockMovements', movementId), {
        movementId,
        organizationId: user.organizationId,
        branchId,
        ownerUid: user.ownerUid,
        productId: ri.productId,
        skuSnapshot: ri.sku,
        productNameSnapshot: ri.name,
        lotId,
        lotNumberSnapshot: lotNumber,
        movementType: 'sale_return',
        unitName: ri.unitName.slice(0, 40),
        conversionFactor: ri.conversionFactor,
        inputQty: ri.qty,
        baseQtyDelta: ri.baseQty,
        balanceBeforeBase: beforeQty,
        balanceAfterBase: afterQty,
        unitCostBaseLak: unitCost,
        totalCostLak: Math.round(ri.baseQty * unitCost),
        reason: `รับคืนสินค้า (${returnNumber}): ${cleanReason}`.slice(0, 300),
        referenceNo: returnNumber,
        performedByUid: user.uid,
        performedByName: user.name.slice(0, 120),
        createdAt: serverTimestamp(),
      });
    }

    tx.set(doc(db, 'saleReturns', returnId), {
      returnId,
      returnNumber,
      saleId: latestSale.saleId,
      invoiceNumber: latestSale.invoiceNumber,
      organizationId: user.organizationId,
      branchId,
      ownerUid: user.ownerUid,
      items: returnItems,
      totalRefundLak,
      refundMethod,
      reason: cleanReason,
      performedByUid: user.uid,
      performedByName: user.name.slice(0, 120),
      createdAt: serverTimestamp(),
    });

    tx.update(saleRef, {
      status: nextSaleStatus,
      updatedAt: serverTimestamp(),
    });

    const audit = buildAuditLogPayload({
      user,
      branchId,
      action: 'POS_SALE_RETURN',
      entityType: 'saleReturns',
      entityId: returnId,
      before: { saleId: latestSale.saleId, status: latestSale.status },
      after: {
        returnNumber,
        totalRefundLak,
        refundMethod,
        nextSaleStatus,
      },
    });
    tx.set(audit.ref, audit.data);
  });

  return {
    returnId,
    returnNumber,
    saleId: sale.saleId,
    invoiceNumber: sale.invoiceNumber,
    organizationId: user.organizationId,
    branchId,
    ownerUid: user.ownerUid,
    items: returnItems,
    totalRefundLak,
    refundMethod,
    reason: cleanReason,
    performedByUid: user.uid,
    performedByName: user.name.slice(0, 120),
    createdAt: Timestamp.now(),
  };
}

export async function createPosHeldBill(params: {
  db: Firestore;
  user: UserProfile;
  branchId: string;
  label: string;
  priceTier: PriceTier;
  customerName: string;
  billDiscountLak: number;
  items: HeldBillItem[];
  notes: string;
}): Promise<string> {
  const { db, user, branchId, label, priceTier, customerName, billDiscountLak, items, notes } =
    params;

  if (items.length === 0) {
    throw new Error('ไม่มีสินค้าในตะกร้าสำหรับพักบิล');
  }

  const heldId = generateSafeId('hold');
  await setDoc(doc(db, 'posHeldBills', heldId), {
    heldId,
    organizationId: user.organizationId,
    branchId,
    ownerUid: user.ownerUid,
    label: label.trim().slice(0, 100) || `บิลพัก ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
    priceTier,
    customerName: customerName.trim().slice(0, 120) || 'ลูกค้าทั่วไป',
    billDiscountLak: Math.max(0, Math.round(billDiscountLak)),
    items: items.slice(0, 100).map((it) => ({
      productId: it.productId,
      unitId: it.unitId,
      qty: Math.max(1, Math.round(it.qty)),
      discountLak: Math.max(0, Math.round(it.discountLak)),
    })),
    notes: notes.trim().slice(0, 300),
    status: 'held',
    createdByUid: user.uid,
    createdByName: user.name.slice(0, 120),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return heldId;
}

export async function updatePosHeldBillStatus(params: {
  db: Firestore;
  heldId: string;
  status: 'resumed' | 'discarded';
}): Promise<void> {
  await updateDoc(doc(params.db, 'posHeldBills', params.heldId), {
    status: params.status,
    updatedAt: serverTimestamp(),
  });
}
