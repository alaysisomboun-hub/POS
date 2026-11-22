import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  CreditCard,
  PackagePlus,
  PauseCircle,
  PlayCircle,
  Plus,
  QrCode,
  ScanBarcode,
  ShoppingCart,
  Split,
  Trash2,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { hasPermission } from '../../core/rbac/permissions';
import { formatDateTimeVientiane } from '../../core/utils/date';
import { formatLak } from '../../core/utils/money';
import { BarcodeQrScannerModal } from '../../components/scanner/BarcodeQrScannerModal';
import { QuickAddProductModal } from '../products/QuickAddProductModal';
import { ReceiptPrintModal } from './ReceiptPrintModal';
import {
  computeBillTotals,
  createPosHeldBill,
  executePosCheckout,
  getUnitPriceByTier,
  updatePosHeldBillStatus,
  type PosCartItemInput,
} from './posService';
import type {
  Category,
  Customer,
  InventoryBalance,
  MembershipTier,
  PaymentMethodType,
  PaymentSplit,
  PosHeldBill,
  PriceTier,
  Product,
  ProductUnit,
  Promotion,
  SaleOrder,
} from '../../core/firebase/types';

interface CartLineState {
  lineKey: string;
  productId: string;
  unitId: string;
  qty: number;
  customUnitPriceLak: number | null;
  discountLak: number;
}

const PRICE_TIER_LABELS: Record<PriceTier, string> = {
  retail: 'ขายปลีก',
  wholesale: 'ขายส่ง',
  member: 'สมาชิก',
};

const QUICK_LAK_AMOUNTS = [10000, 20000, 50000, 100000, 200000, 500000];

export function PosTerminalPage() {
  const { userProfile, organization, activeBranchId, settings } = useFirebase();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [heldBills, setHeldBills] = useState<PosHeldBill[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [membershipTiers, setMembershipTiers] = useState<MembershipTier[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);

  const [searchText, setSearchText] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [priceTier, setPriceTier] = useState<PriceTier>('retail');

  const [cartLines, setCartLines] = useState<CartLineState[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState('ลูกค้าทั่วไป');
  const [selectedPromotionId, setSelectedPromotionId] = useState<string>('');
  const [billDiscountLak, setBillDiscountLak] = useState<number>(0);
  const [billNotes, setBillNotes] = useState('');
  const [activeHeldBillId, setActiveHeldBillId] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Quick Add Product from POS Modals
  const [notFoundPrompt, setNotFoundPrompt] = useState<{ query: string } | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddInitialQuery, setQuickAddInitialQuery] = useState('');

  // Hold Bill Modals
  const [holdModalOpen, setHoldModalOpen] = useState(false);
  const [holdLabel, setHoldLabel] = useState('');
  const [holdSaving, setHoldSaving] = useState(false);
  const [heldListModalOpen, setHeldListModalOpen] = useState(false);

  // Payment Checkout Modal
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [payMode, setPayMode] = useState<PaymentMethodType>('cash');
  const [cashTendered, setCashTendered] = useState<string>('0');
  const [splitRows, setSplitRows] = useState<PaymentSplit[]>([
    { method: 'cash', amountLak: 0 },
    { method: 'transfer', amountLak: 0 },
  ]);
  const [checkoutSaving, setCheckoutSaving] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Completed Receipt Modal
  const [completedSale, setCompletedSale] = useState<SaleOrder | null>(null);
  const [posScannerOpen, setPosScannerOpen] = useState(false);

  const canCreateSale = hasPermission(userProfile, 'pos', 'create');
  const canEditPrice = hasPermission(userProfile, 'pos', 'edit');
  const canCreateProduct = hasPermission(userProfile, 'products', 'create');
  const allowNegativeStock = settings?.inventorySettings?.allowNegativeStock ?? false;

  useEffect(() => {
    if (!userProfile) return;
    const orgId = userProfile.organizationId;

    const unsubProds = onSnapshot(
      query(collection(db, 'products'), where('organizationId', '==', orgId)),
      (snap) => {
        setAllProducts(
          snap.docs
            .map((d) => d.data() as Product)
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'products'),
    );

    const unsubCats = onSnapshot(
      query(collection(db, 'categories'), where('organizationId', '==', orgId)),
      (snap) => {
        setCategories(
          snap.docs
            .map((d) => d.data() as Category)
            .filter((c) => c.status === 'active' && !c.parentId)
            .sort((a, b) => a.sortOrder - b.sortOrder),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'categories'),
    );

    const unsubInv = onSnapshot(
      query(
        collection(db, 'inventory'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
      ),
      (snap) => setBalances(snap.docs.map((d) => d.data() as InventoryBalance)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'inventory'),
    );

    const unsubHeld = onSnapshot(
      query(
        collection(db, 'posHeldBills'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
        orderBy('createdAt', 'desc'),
      ),
      (snap) => {
        setHeldBills(
          snap.docs
            .map((d) => d.data() as PosHeldBill)
            .filter((b) => b.status === 'held'),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'posHeldBills'),
    );

    const unsubCustomers = onSnapshot(
      query(
        collection(db, 'customers'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
      ),
      (snap) => {
        setCustomers(
          snap.docs
            .map((d) => d.data() as Customer)
            .filter((c) => c.status === 'active')
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'customers'),
    );

    const unsubTiers = onSnapshot(
      query(collection(db, 'membershipTiers'), where('organizationId', '==', orgId)),
      (snap) => {
        setMembershipTiers(
          snap.docs.map((d) => d.data() as MembershipTier).filter((t) => t.status === 'active'),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'membershipTiers'),
    );

    const unsubPromos = onSnapshot(
      query(
        collection(db, 'promotions'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
      ),
      (snap) => {
        setPromotions(
          snap.docs.map((d) => d.data() as Promotion).filter((p) => p.status === 'active'),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'promotions'),
    );

    return () => {
      unsubProds();
      unsubCats();
      unsubInv();
      unsubHeld();
      unsubCustomers();
      unsubTiers();
      unsubPromos();
    };
  }, [userProfile, activeBranchId]);

  const products = useMemo(
    () => allProducts.filter((p) => p.status === 'active'),
    [allProducts],
  );

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.productId, p));
    return map;
  }, [products]);

  const balanceMap = useMemo(() => {
    const map = new Map<string, number>();
    balances.forEach((b) => map.set(b.productId, b.qtyOnHandBase));
    return map;
  }, [balances]);

  const filteredProducts = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return products.filter((p) => {
      if (selectedCategoryId !== 'all' && p.categoryId !== selectedCategoryId) {
        return false;
      }
      if (!q) return true;
      if (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) return true;
      if (p.barcode.toLowerCase().includes(q)) return true;
      if (p.barcodes.some((bc) => bc.toLowerCase().includes(q))) return true;
      return p.units.some((u) => u.barcode.toLowerCase().includes(q));
    });
  }, [products, selectedCategoryId, searchText]);

  const resolvedCartInputs = useMemo<PosCartItemInput[]>(() => {
    const list: PosCartItemInput[] = [];
    for (const line of cartLines) {
      const prod = productMap.get(line.productId);
      if (!prod) continue;
      const unit = prod.units.find((u) => u.unitId === line.unitId) ?? prod.units[0];
      if (!unit) continue;
      const tierPrice = getUnitPriceByTier(unit, priceTier);
      const unitPriceLak =
        line.customUnitPriceLak !== null ? line.customUnitPriceLak : tierPrice;
      list.push({
        product: prod,
        unit,
        qty: line.qty,
        unitPriceLak,
        discountLak: line.discountLak,
      });
    }
    return list;
  }, [cartLines, productMap, priceTier]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.customerId === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const selectedMembershipTier = useMemo(
    () =>
      selectedCustomer?.tierId
        ? membershipTiers.find((t) => t.tierId === selectedCustomer.tierId) ?? null
        : null,
    [selectedCustomer, membershipTiers],
  );

  const eligiblePromotions = useMemo(() => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Vientiane' }).format(
      new Date(),
    );
    return promotions.filter((p) => p.startDate <= today && p.endDate >= today);
  }, [promotions]);

  const rawCartNetAfterItemDiscount = useMemo(
    () =>
      resolvedCartInputs.reduce((sum, entry) => {
        const gross = Math.round(Math.max(1, Math.round(entry.qty)) * Math.max(0, Math.round(entry.unitPriceLak)));
        const disc = Math.min(gross, Math.max(0, Math.round(entry.discountLak)));
        return sum + Math.max(0, gross - disc);
      }, 0),
    [resolvedCartInputs],
  );

  const tierDiscountLak = useMemo(() => {
    if (!selectedMembershipTier || selectedMembershipTier.discountPercent <= 0) return 0;
    return Math.round((rawCartNetAfterItemDiscount * selectedMembershipTier.discountPercent) / 100);
  }, [selectedMembershipTier, rawCartNetAfterItemDiscount]);

  const promoDiscountLak = useMemo(() => {
    const promo = eligiblePromotions.find((p) => p.promotionId === selectedPromotionId);
    if (!promo || rawCartNetAfterItemDiscount < promo.minSpendLak) return 0;
    if (promo.promoType === 'percent_bill') {
      return Math.round((rawCartNetAfterItemDiscount * promo.discountValue) / 100);
    }
    return Math.round(promo.discountValue);
  }, [eligiblePromotions, selectedPromotionId, rawCartNetAfterItemDiscount]);

  const totalEffectiveBillDiscountLak = billDiscountLak + tierDiscountLak + promoDiscountLak;

  const billTotals = useMemo(
    () =>
      computeBillTotals({
        cartItems: resolvedCartInputs,
        billDiscountLak: totalEffectiveBillDiscountLak,
        taxSettings: settings?.taxSettings ?? null,
        roundingMode: settings?.currencySettings?.roundingMode ?? 'integer',
      }),
    [resolvedCartInputs, totalEffectiveBillDiscountLak, settings],
  );

  const getCartBaseQtyForProduct = (productId: string, overrideLines?: CartLineState[]): number => {
    const source = overrideLines ?? cartLines;
    const prod = productMap.get(productId);
    if (!prod) return 0;
    return source
      .filter((l) => l.productId === productId)
      .reduce((sum, l) => {
        const unit = prod.units.find((u) => u.unitId === l.unitId) ?? prod.units[0];
        return sum + l.qty * Math.max(1, unit?.conversionFactor ?? 1);
      }, 0);
  };

  const addProductUnitToCart = (product: Product, unit: ProductUnit) => {
    setFeedback(null);
    const stockBase = balanceMap.get(product.productId) ?? 0;
    const currentCartBase = getCartBaseQtyForProduct(product.productId);
    const neededBase = currentCartBase + Math.max(1, unit.conversionFactor);

    if (!allowNegativeStock && stockBase < neededBase) {
      setFeedback({
        type: 'err',
        text: `สินค้า "${product.name}" คงเหลือ ${stockBase.toLocaleString('en-US')} ${product.baseUnitName} ไม่พอตัดเพิ่ม (${neededBase.toLocaleString('en-US')} ${product.baseUnitName})`,
      });
      return;
    }

    setCartLines((prev) => {
      const idx = prev.findIndex(
        (l) => l.productId === product.productId && l.unitId === unit.unitId,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          lineKey: `${product.productId}_${unit.unitId}_${Date.now()}`,
          productId: product.productId,
          unitId: unit.unitId,
          qty: 1,
          customUnitPriceLak: null,
          discountLak: 0,
        },
      ];
    });
  };

  const openQuickAddProduct = (initialQueryStr: string) => {
    setNotFoundPrompt(null);
    if (!canCreateProduct) {
      setFeedback({
        type: 'err',
        text: 'บัญชีของคุณไม่มีสิทธิ์เพิ่มสินค้าใหม่ กรุณาติดต่อเจ้าของร้านหรือผู้จัดการร้าน',
      });
      return;
    }
    setQuickAddInitialQuery(initialQueryStr);
    setQuickAddOpen(true);
  };

  const handleQuickProductCreated = ({
    product,
    balance,
  }: {
    product: Product;
    balance: InventoryBalance;
  }) => {
    setQuickAddOpen(false);
    setNotFoundPrompt(null);
    setSearchText('');
    if (selectedCategoryId !== 'all' && product.categoryId !== selectedCategoryId) {
      setSelectedCategoryId('all');
    }

    setAllProducts((prev) =>
      prev.some((p) => p.productId === product.productId)
        ? prev
        : [...prev, product].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setBalances((prev) =>
      prev.some((b) => b.inventoryId === balance.inventoryId)
        ? prev
        : [...prev, balance],
    );

    const baseUnit = product.units.find((u) => u.isBaseUnit) ?? product.units[0];
    if (baseUnit) {
      const neededBase = Math.max(1, baseUnit.conversionFactor);
      if (!allowNegativeStock && balance.qtyOnHandBase < neededBase) {
        setFeedback({
          type: 'ok',
          text: `เพิ่มสินค้าสำเร็จ: "${product.name}" (สต็อกเริ่มต้น ${balance.qtyOnHandBase} ${product.baseUnitName} — กรุณารับสินค้าเข้าคลังก่อนเพิ่มลงรายการขาย)`,
        });
      } else {
        setCartLines((prev) => [
          ...prev,
          {
            lineKey: `${product.productId}_${baseUnit.unitId}_${Date.now()}`,
            productId: product.productId,
            unitId: baseUnit.unitId,
            qty: 1,
            customUnitPriceLak: null,
            discountLak: 0,
          },
        ]);
        setFeedback({
          type: 'ok',
          text: `เพิ่มสินค้าสำเร็จ: เพิ่ม "${product.name}" ลงในรายการขายเรียบร้อยแล้ว`,
        });
      }
    } else {
      setFeedback({
        type: 'ok',
        text: 'เพิ่มสินค้าสำเร็จ',
      });
    }

    window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 80);
  };

  const tryAddScannedCodeToCart = (rawCode: string, allowSingleFilteredFallback = false): boolean => {
    const raw = rawCode.trim();
    if (!raw) return false;
    const lower = raw.toLowerCase();

    for (const prod of products) {
      const matchedUnit = prod.units.find((u) => u.barcode.trim().toLowerCase() === lower);
      if (matchedUnit) {
        addProductUnitToCart(prod, matchedUnit);
        setSearchText('');
        return true;
      }
      if (
        prod.barcode.trim().toLowerCase() === lower ||
        prod.sku.trim().toLowerCase() === lower ||
        prod.barcodes.some((b) => b.trim().toLowerCase() === lower)
      ) {
        const baseUnit = prod.units.find((u) => u.isBaseUnit) ?? prod.units[0];
        if (baseUnit) {
          addProductUnitToCart(prod, baseUnit);
          setSearchText('');
          return true;
        }
      }
    }

    if (allowSingleFilteredFallback && filteredProducts.length === 1) {
      const prod = filteredProducts[0];
      const baseUnit = prod.units.find((u) => u.isBaseUnit) ?? prod.units[0];
      if (baseUnit) {
        addProductUnitToCart(prod, baseUnit);
        setSearchText('');
        return true;
      }
    }

    const inactiveMatch = allProducts.find(
      (p) =>
        p.status === 'inactive' &&
        (p.barcode.trim().toLowerCase() === lower ||
          p.sku.trim().toLowerCase() === lower ||
          p.barcodes.some((b) => b.trim().toLowerCase() === lower) ||
          p.units.some((u) => u.barcode.trim().toLowerCase() === lower)),
    );
    if (inactiveMatch) {
      setFeedback({
        type: 'err',
        text: `พบสินค้า "${inactiveMatch.name}" (${raw}) แต่อยู่ในสถานะหยุดขายชั่วคราว กรุณาเปิดขายในหน้าจัดการสินค้า`,
      });
      return false;
    }

    setFeedback(null);
    setNotFoundPrompt({ query: raw });
    return false;
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    tryAddScannedCodeToCart(searchText, true);
  };

  const updateCartQty = (lineKey: string, nextQty: number) => {
    const safeQty = Math.max(1, Math.round(nextQty));
    const target = cartLines.find((l) => l.lineKey === lineKey);
    if (!target) return;
    const prod = productMap.get(target.productId);
    if (!prod) return;

    const simulated = cartLines.map((l) =>
      l.lineKey === lineKey ? { ...l, qty: safeQty } : l,
    );
    const totalNeeded = getCartBaseQtyForProduct(prod.productId, simulated);
    const stockBase = balanceMap.get(prod.productId) ?? 0;

    if (!allowNegativeStock && stockBase < totalNeeded) {
      setFeedback({
        type: 'err',
        text: `สินค้า "${prod.name}" มีสต็อกคงเหลือ ${stockBase.toLocaleString('en-US')} ${prod.baseUnitName}`,
      });
      return;
    }

    setFeedback(null);
    setCartLines(simulated);
  };

  const updateCartUnit = (lineKey: string, nextUnitId: string) => {
    const target = cartLines.find((l) => l.lineKey === lineKey);
    if (!target) return;
    const prod = productMap.get(target.productId);
    if (!prod) return;

    const simulated = cartLines.map((l) =>
      l.lineKey === lineKey ? { ...l, unitId: nextUnitId, customUnitPriceLak: null } : l,
    );
    const totalNeeded = getCartBaseQtyForProduct(prod.productId, simulated);
    const stockBase = balanceMap.get(prod.productId) ?? 0;

    if (!allowNegativeStock && stockBase < totalNeeded) {
      setFeedback({
        type: 'err',
        text: `สต็อกคงเหลือไม่พอสำหรับเปลี่ยนเป็นหน่วยนี้ (คงเหลือ ${stockBase.toLocaleString('en-US')} ${prod.baseUnitName})`,
      });
      return;
    }

    setFeedback(null);
    setCartLines(simulated);
  };

  const updateCartPrice = (lineKey: string, value: number) => {
    setCartLines((prev) =>
      prev.map((l) =>
        l.lineKey === lineKey
          ? { ...l, customUnitPriceLak: Math.max(0, Math.round(value)) }
          : l,
      ),
    );
  };

  const updateCartDiscount = (lineKey: string, value: number) => {
    setCartLines((prev) =>
      prev.map((l) =>
        l.lineKey === lineKey ? { ...l, discountLak: Math.max(0, Math.round(value)) } : l,
      ),
    );
  };

  const removeCartLine = (lineKey: string) => {
    setCartLines((prev) => prev.filter((l) => l.lineKey !== lineKey));
  };

  const clearCart = () => {
    setCartLines([]);
    setSelectedCustomerId('');
    setCustomerName('ลูกค้าทั่วไป');
    setSelectedPromotionId('');
    setBillDiscountLak(0);
    setBillNotes('');
    setActiveHeldBillId(null);
    setFeedback(null);
  };

  const handleConfirmHoldBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || cartLines.length === 0) return;

    setHoldSaving(true);
    try {
      await createPosHeldBill({
        db,
        user: userProfile,
        branchId: activeBranchId,
        label: holdLabel || `บิลพัก · ${customerName}`,
        priceTier,
        customerName,
        billDiscountLak,
        items: cartLines.map((l) => ({
          productId: l.productId,
          unitId: l.unitId,
          qty: l.qty,
          discountLak: l.discountLak,
        })),
        notes: billNotes,
      });
      setHoldModalOpen(false);
      setHoldLabel('');
      clearCart();
      setFeedback({ type: 'ok', text: 'พักบิลเรียบร้อยแล้ว สามารถเรียกกลับมาขายได้ตลอดเวลา' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ไม่สามารถพักบิลได้',
      });
    } finally {
      setHoldSaving(false);
    }
  };

  const handleResumeHeldBill = (held: PosHeldBill) => {
    const restored: CartLineState[] = [];
    for (let i = 0; i < held.items.length; i++) {
      const it = held.items[i];
      if (!productMap.has(it.productId)) continue;
      restored.push({
        lineKey: `${it.productId}_${it.unitId}_${Date.now()}_${i}`,
        productId: it.productId,
        unitId: it.unitId,
        qty: it.qty,
        customUnitPriceLak: null,
        discountLak: it.discountLak,
      });
    }
    setCartLines(restored);
    setPriceTier(held.priceTier);
    setCustomerName(held.customerName);
    setBillDiscountLak(held.billDiscountLak);
    setBillNotes(held.notes);
    setActiveHeldBillId(held.heldId);
    setHeldListModalOpen(false);
    setFeedback({ type: 'ok', text: `ดึงบิล "${held.label}" กลับมาที่ตะกร้าแล้ว` });
  };

  const handleDiscardHeldBill = async (heldId: string) => {
    try {
      await updatePosHeldBillStatus({ db, heldId, status: 'discarded' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ไม่สามารถลบบิลพักได้',
      });
    }
  };

  const openCheckoutModal = () => {
    if (cartLines.length === 0) return;
    setPayMode('cash');
    setCashTendered(String(billTotals.grandTotalLak));
    setSplitRows([
      { method: 'cash', amountLak: billTotals.grandTotalLak },
      { method: 'transfer', amountLak: 0 },
    ]);
    setCheckoutError(null);
    setCheckoutOpen(true);
  };

  const computedPaymentSummary = useMemo(() => {
    const total = billTotals.grandTotalLak;
    if (payMode === 'cash') {
      const tendered = Math.max(0, Math.round(Number(cashTendered) || 0));
      return {
        splits: [{ method: 'cash' as const, amountLak: tendered }],
        covered: tendered,
        change: Math.max(0, tendered - total),
        remaining: Math.max(0, total - tendered),
      };
    }
    if (payMode === 'transfer' || payMode === 'qr' || payMode === 'credit') {
      return {
        splits: [{ method: payMode, amountLak: total }],
        covered: total,
        change: 0,
        remaining: 0,
      };
    }
    const validSplits = splitRows.filter((s) => s.amountLak > 0);
    const covered = validSplits.reduce((sum, s) => sum + Math.max(0, Math.round(s.amountLak)), 0);
    return {
      splits: validSplits,
      covered,
      change: Math.max(0, covered - total),
      remaining: Math.max(0, total - covered),
    };
  }, [payMode, cashTendered, splitRows, billTotals.grandTotalLak]);

  const handleSubmitCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !canCreateSale) return;

    if (computedPaymentSummary.remaining > 0) {
      setCheckoutError(
        `ยอดชำระยังขาดอีก ${formatLak(computedPaymentSummary.remaining)}`,
      );
      return;
    }

    setCheckoutSaving(true);
    setCheckoutError(null);

    try {
      const created = await executePosCheckout({
        db,
        user: userProfile,
        branchId: activeBranchId,
        priceTier,
        customerId: selectedCustomer?.customerId ?? null,
        customerName: selectedCustomer ? selectedCustomer.name : customerName,
        membershipTier: selectedMembershipTier,
        cartItems: resolvedCartInputs,
        billDiscountLak: totalEffectiveBillDiscountLak,
        taxSettings: settings?.taxSettings ?? null,
        roundingMode: settings?.currencySettings?.roundingMode ?? 'integer',
        invoicePrefix: settings?.receiptSettings?.prefix ?? 'INV',
        allowNegativeStock,
        paymentMethod: payMode,
        payments:
          computedPaymentSummary.splits.length > 0
            ? computedPaymentSummary.splits
            : [{ method: 'cash', amountLak: 0 }],
        notes: billNotes,
        heldBillId: activeHeldBillId,
      });

      setCheckoutOpen(false);
      clearCart();
      setCompletedSale(created);
      setFeedback({
        type: 'ok',
        text: `บันทึกการขายเลขที่ ${created.invoiceNumber} สำเร็จ (${formatLak(created.grandTotalLak)})`,
      });
      searchInputRef.current?.focus();
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : 'ไม่สามารถบันทึกการขายได้ กรุณาลองใหม่',
      );
    } finally {
      setCheckoutSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${
            feedback.type === 'ok'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'ok' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-current opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main 2-Column POS Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Scanner, Price Tier, Categories & Catalog */}
        <div className="xl:col-span-7 space-y-4">
          {/* Scanner & Price Tier Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-col md:flex-row gap-3">
              <form onSubmit={handleBarcodeSubmit} className="flex-1 flex gap-2">
                <div className="relative flex-1">
                  <ScanBarcode className="w-4 h-4 text-blue-600 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    autoFocus
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="สแกนบาร์โค้ด หรือพิมพ์ชื่อสินค้า / SKU แล้วกด Enter..."
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setPosScannerOpen(true)}
                  className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer"
                  title="สแกนบาร์โค้ด / QR ด้วยกล้อง"
                >
                  <QrCode className="w-4 h-4" />
                  สแกนกล้อง
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg whitespace-nowrap cursor-pointer"
                >
                  เพิ่มลงตะกร้า
                </button>
              </form>

              {/* Price Tier Switcher */}
              <div className="inline-flex items-center bg-slate-100 p-1 rounded-lg self-start shrink-0">
                {(['retail', 'wholesale', 'member'] as const).map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setPriceTier(tier)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      priceTier === tier
                        ? 'bg-white text-blue-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {PRICE_TIER_LABELS[tier]}
                  </button>
                ))}
              </div>
            </div>

            {/* Category Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setSelectedCategoryId('all')}
                className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer border ${
                  selectedCategoryId === 'all'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                ทั้งหมด ({products.length})
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.categoryId}
                  type="button"
                  onClick={() => setSelectedCategoryId(cat.categoryId)}
                  className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap cursor-pointer border ${
                    selectedCategoryId === cat.categoryId
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredProducts.length === 0 && (
              <div className="sm:col-span-2 lg:col-span-3 bg-white border border-slate-200 rounded-xl p-8 text-center">
                {searchText.trim() ? (
                  <div className="max-w-md mx-auto space-y-3">
                    <div className="w-11 h-11 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900">
                        ไม่พบสินค้านี้ในระบบ ต้องการเพิ่มสินค้าใหม่หรือไม่?
                      </p>
                      <p className="text-xs text-slate-500">
                        คำค้นหา / บาร์โค้ด:{' '}
                        <span className="font-mono font-semibold text-slate-800">
                          &ldquo;{searchText.trim()}&rdquo;
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => openQuickAddProduct(searchText.trim())}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        <PackagePlus className="w-4 h-4" />
                        เพิ่มสินค้าใหม่
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchText('');
                          setNotFoundPrompt(null);
                          searchInputRef.current?.focus();
                        }}
                        className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
                      >
                        ยกเลิก
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">
                    ไม่พบสินค้าที่เปิดขายตามเงื่อนไขที่ค้นหา
                  </div>
                )}
              </div>
            )}

            {filteredProducts.map((prod) => {
              const qtyOnHand = balanceMap.get(prod.productId) ?? 0;
              const isOut = qtyOnHand <= 0;
              const isLow = !isOut && qtyOnHand <= prod.minStockBaseQty;
              const baseUnit = prod.units.find((u) => u.isBaseUnit) ?? prod.units[0];
              const displayPrice = baseUnit ? getUnitPriceByTier(baseUnit, priceTier) : prod.retailPriceLak;

              return (
                <div
                  key={prod.productId}
                  className="bg-white border border-slate-200 hover:border-blue-400 rounded-xl p-3.5 flex flex-col justify-between gap-2.5 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => baseUnit && addProductUnitToCart(prod, baseUnit)}
                    className="text-left space-y-1 cursor-pointer group"
                  >
                    <div className="flex items-start gap-2.5">
                      {prod.imageUrl && (
                        <img
                          src={prod.imageUrl}
                          alt={prod.name}
                          className="w-11 h-11 rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-50"
                        />
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-mono text-slate-400 truncate">
                            {prod.sku}
                          </span>
                          <span
                            className={`text-[11px] font-semibold tabular-nums shrink-0 ${
                              isOut
                                ? 'text-red-600'
                                : isLow
                                  ? 'text-amber-600'
                                  : 'text-slate-500'
                            }`}
                          >
                            คงเหลือ {qtyOnHand.toLocaleString('en-US')} {prod.baseUnitName}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 line-clamp-2 leading-snug">
                          {prod.name}
                        </div>
                        <div className="text-base font-bold text-blue-700 tabular-nums pt-0.5">
                          {formatLak(displayPrice)}{' '}
                          <span className="text-xs font-normal text-slate-500">
                            / {baseUnit?.unitName ?? prod.baseUnitName}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Multi-unit Quick Buttons */}
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                    {prod.units.map((unit) => (
                      <button
                        key={unit.unitId}
                        type="button"
                        onClick={() => addProductUnitToCart(prod, unit)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 rounded cursor-pointer tabular-nums"
                      >
                        <Plus className="w-3 h-3" />
                        {unit.unitName} · {formatLak(getUnitPriceByTier(unit, priceTier), false)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: Cart, Discounts & Checkout */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden xl:sticky xl:top-20">
          {/* Cart Header */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-900">
                ตะกร้าสินค้า ({cartLines.length} รายการ)
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setHeldListModalOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 hover:border-blue-300 text-slate-700 rounded-lg cursor-pointer tabular-nums"
              >
                <PlayCircle className="w-3.5 h-3.5 text-blue-600" />
                บิลพัก ({heldBills.length})
              </button>
              {cartLines.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setHoldLabel('');
                      setHoldModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 hover:border-amber-300 text-amber-700 rounded-lg cursor-pointer"
                  >
                    <PauseCircle className="w-3.5 h-3.5" />
                    พักบิล
                  </button>
                  <button
                    type="button"
                    onClick={clearCart}
                    className="px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                  >
                    ล้าง
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Customer Selector & Name */}
          <div className="px-4 py-3 border-b border-slate-100 space-y-2">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={selectedCustomerId}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedCustomerId(id);
                  const found = customers.find((c) => c.customerId === id);
                  if (found) {
                    setCustomerName(found.name);
                    if (found.tierId) setPriceTier('member');
                  } else {
                    setCustomerName('ลูกค้าทั่วไป');
                  }
                }}
                className="flex-1 text-xs sm:text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 focus:outline-none"
              >
                <option value="">ลูกค้าทั่วไป (Walk-in)</option>
                {customers.map((c) => (
                  <option key={c.customerId} value={c.customerId}>
                    {c.name} {c.phone ? `(${c.phone})` : ''} {c.tierName ? `· ${c.tierName}` : ''}
                  </option>
                ))}
              </select>
              <span className="text-[11px] font-semibold text-blue-700 shrink-0">
                {PRICE_TIER_LABELS[priceTier]}
              </span>
            </div>

            {selectedCustomer ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 bg-blue-50/50 border border-blue-100 rounded-md px-2.5 py-1.5 tabular-nums">
                <span>
                  แต้มสะสม: <strong className="text-blue-700">{selectedCustomer.pointsBalance.toLocaleString('en-US')}</strong>
                  {selectedMembershipTier ? ` · ส่วนลดระดับ ${selectedMembershipTier.discountPercent}%` : ''}
                </span>
                <span>
                  ค้างชำระ: <strong className={selectedCustomer.creditBalanceLak > 0 ? 'text-amber-700' : 'text-slate-700'}>{formatLak(selectedCustomer.creditBalanceLak)}</strong>
                  {selectedCustomer.creditLimitLak > 0 ? ` / ${formatLak(selectedCustomer.creditLimitLak)}` : ''}
                </span>
              </div>
            ) : (
              <input
                type="text"
                maxLength={120}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="ระบุชื่อลูกค้า Walk-in (ค่าเริ่มต้น: ลูกค้าทั่วไป)"
                className="w-full text-xs text-slate-700 bg-transparent border-b border-slate-100 pb-1 focus:outline-none focus:border-blue-400"
              />
            )}
          </div>

          {/* Cart Items */}
          <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
            {cartLines.length === 0 && (
              <div className="py-14 px-6 text-center text-xs text-slate-500 space-y-1">
                <div className="font-medium text-slate-700">ยังไม่มีสินค้าในตะกร้า</div>
                <div>สแกนบาร์โค้ดหรือคลิกเลือกสินค้าจากรายการด้านซ้าย</div>
              </div>
            )}

            {cartLines.map((line, index) => {
              const prod = productMap.get(line.productId);
              const computedItem = billTotals.items[index];
              if (!prod || !computedItem) return null;

              return (
                <div key={line.lineKey} className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                        {prod.name}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">{prod.sku}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCartLine(line.lineKey)}
                      className="p-1 text-slate-400 hover:text-red-600 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-12 gap-2 items-center text-xs">
                    {/* Unit Switcher */}
                    <div className="col-span-4">
                      <select
                        value={line.unitId}
                        onChange={(e) => updateCartUnit(line.lineKey, e.target.value)}
                        className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
                      >
                        {prod.units.map((u) => (
                          <option key={u.unitId} value={u.unitId}>
                            {u.unitName}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Qty Control */}
                    <div className="col-span-4 flex items-center border border-slate-200 rounded-md overflow-hidden">
                      <button
                        type="button"
                        onClick={() =>
                          line.qty > 1
                            ? updateCartQty(line.lineKey, line.qty - 1)
                            : removeCartLine(line.lineKey)
                        }
                        className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={line.qty}
                        onChange={(e) => updateCartQty(line.lineKey, Number(e.target.value) || 1)}
                        className="w-full text-center py-1 text-xs font-semibold tabular-nums focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => updateCartQty(line.lineKey, line.qty + 1)}
                        className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                      >
                        +
                      </button>
                    </div>

                    {/* Line Total */}
                    <div className="col-span-4 text-right font-bold text-slate-900 tabular-nums">
                      {formatLak(computedItem.lineTotalLak)}
                    </div>
                  </div>

                  {/* Price & Line Discount */}
                  <div className="grid grid-cols-2 gap-2 pt-0.5 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 shrink-0">ราคา:</span>
                      {canEditPrice ? (
                        <input
                          type="number"
                          min={0}
                          value={computedItem.unitPriceLak}
                          onChange={(e) => updateCartPrice(line.lineKey, Number(e.target.value) || 0)}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-right tabular-nums"
                        />
                      ) : (
                        <span className="font-medium text-slate-700 tabular-nums">
                          {formatLak(computedItem.unitPriceLak)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-500 shrink-0">ลดรายการ:</span>
                      <input
                        type="number"
                        min={0}
                        value={line.discountLak}
                        onChange={(e) => updateCartDiscount(line.lineKey, Number(e.target.value) || 0)}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-right tabular-nums"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Totals & Checkout Footer */}
          <div className="p-4 border-t border-slate-200 bg-slate-50/70 space-y-2.5">
            <div className="flex justify-between text-xs text-slate-600 tabular-nums">
              <span>รวมเป็นเงิน</span>
              <span>{formatLak(billTotals.subtotalLak)}</span>
            </div>

            {billTotals.itemDiscountTotalLak > 0 && (
              <div className="flex justify-between text-xs text-slate-600 tabular-nums">
                <span>ส่วนลดรายสินค้า</span>
                <span>-{formatLak(billTotals.itemDiscountTotalLak)}</span>
              </div>
            )}

            {eligiblePromotions.length > 0 && (
              <div className="flex items-center justify-between gap-3 text-xs text-slate-700">
                <span className="shrink-0">โปรโมชั่น</span>
                <select
                  value={selectedPromotionId}
                  onChange={(e) => setSelectedPromotionId(e.target.value)}
                  className="flex-1 max-w-[220px] px-2 py-1 bg-white border border-slate-200 rounded-md text-xs"
                >
                  <option value="">ไม่ใช้โปรโมชั่น</option>
                  {eligiblePromotions.map((p) => (
                    <option key={p.promotionId} value={p.promotionId}>
                      {p.code} · {p.name} (ขั้นต่ำ {formatLak(p.minSpendLak, false)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {tierDiscountLak > 0 && (
              <div className="flex justify-between text-xs text-blue-700 tabular-nums">
                <span>ส่วนลดสมาชิก ({selectedMembershipTier?.name})</span>
                <span>-{formatLak(tierDiscountLak)}</span>
              </div>
            )}

            {promoDiscountLak > 0 && (
              <div className="flex justify-between text-xs text-blue-700 tabular-nums">
                <span>ส่วนลดโปรโมชั่น</span>
                <span>-{formatLak(promoDiscountLak)}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 text-xs text-slate-700">
              <span>ส่วนลดเพิ่มเติมท้ายบิล (₭)</span>
              <input
                type="number"
                min={0}
                value={billDiscountLak}
                onChange={(e) => setBillDiscountLak(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                className="w-28 px-2.5 py-1 bg-white border border-slate-200 rounded-md text-right tabular-nums font-medium"
              />
            </div>

            {billTotals.taxRate > 0 && (
              <div className="flex justify-between text-xs text-slate-600 tabular-nums">
                <span>
                  ภาษี ({billTotals.taxRate}%{settings?.taxSettings?.taxInclusive ? ' รวมในราคา' : ''})
                </span>
                <span>{formatLak(billTotals.taxAmountLak)}</span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-slate-900">ยอดชำระสุทธิ</span>
              <span className="text-2xl font-bold text-blue-700 tabular-nums">
                {formatLak(billTotals.grandTotalLak)}
              </span>
            </div>

            <button
              type="button"
              disabled={!canCreateSale || cartLines.length === 0}
              onClick={openCheckoutModal}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer tabular-nums"
            >
              ชำระเงิน · {formatLak(billTotals.grandTotalLak)}
            </button>
          </div>
        </div>
      </div>

      {/* Hold Bill Modal */}
      {holdModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-semibold text-slate-900">พักบิลขายชั่วคราว</h3>
              <button
                type="button"
                onClick={() => setHoldModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmHoldBill} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ป้ายชื่อ / หมายเลขอ้างอิงบิลพัก *
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={holdLabel}
                  onChange={(e) => setHoldLabel(e.target.value)}
                  placeholder="เช่น ลูกค้าเสื้อน้ำเงิน / รอหยิบของเพิ่ม"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">หมายเหตุ</label>
                <input
                  type="text"
                  maxLength={300}
                  value={billNotes}
                  onChange={(e) => setBillNotes(e.target.value)}
                  placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setHoldModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={holdSaving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  {holdSaving ? 'กำลังพักบิล...' : 'ยืนยันพักบิล'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Held Bills List Modal */}
      {heldListModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-6 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-semibold text-slate-900">
                รายการบิลที่พักไว้ ({heldBills.length})
              </h3>
              <button
                type="button"
                onClick={() => setHeldListModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {heldBills.length === 0 && (
                <div className="py-10 text-center text-xs text-slate-500">
                  ไม่มีบิลที่พักไว้ในขณะนี้
                </div>
              )}
              {heldBills.map((held) => (
                <div key={held.heldId} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">{held.label}</div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      {held.customerName} · {held.items.length} รายการ ·{' '}
                      {formatDateTimeVientiane(held.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleResumeHeldBill(held)}
                      className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer"
                    >
                      เรียกคืน
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDiscardHeldBill(held.heldId)}
                      className="px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                    >
                      ลบ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Checkout Payment Modal */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">รับชำระเงิน (Checkout)</h3>
                <p className="text-xs text-slate-500">
                  ลูกค้า: {customerName || 'ลูกค้าทั่วไป'} · {billTotals.items.length} รายการ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {checkoutError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {checkoutError}
              </div>
            )}

            <form onSubmit={handleSubmitCheckout} className="space-y-4">
              {/* Grand Total Display */}
              <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">ยอดที่ต้องชำระ</span>
                <span className="text-2xl font-bold text-blue-700 tabular-nums">
                  {formatLak(billTotals.grandTotalLak)}
                </span>
              </div>

              {/* Payment Method Tabs */}
              <div className="grid grid-cols-5 gap-1.5">
                {(
                  [
                    { key: 'cash', label: 'เงินสด', icon: Banknote },
                    { key: 'transfer', label: 'โอนเงิน', icon: Wallet },
                    { key: 'qr', label: 'QR Pay', icon: QrCode },
                    { key: 'credit', label: 'ขายเชื่อ', icon: CreditCard },
                    { key: 'split', label: 'หลายช่องทาง', icon: Split },
                  ] as const
                ).map((pm) => {
                  const Icon = pm.icon;
                  return (
                    <button
                      key={pm.key}
                      type="button"
                      onClick={() => {
                        setPayMode(pm.key);
                        setCheckoutError(null);
                      }}
                      className={`p-2 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 cursor-pointer transition-colors ${
                        payMode === pm.key
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{pm.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Cash Input + Quick LAK Denominations */}
              {payMode === 'cash' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      จำนวนเงินสดที่รับมา (₭)
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-lg font-bold border border-slate-200 rounded-lg text-right tabular-nums"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCashTendered(String(billTotals.grandTotalLak))}
                      className="px-2.5 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-md cursor-pointer"
                    >
                      รับพอดี
                    </button>
                    {QUICK_LAK_AMOUNTS.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setCashTendered(String(amt))}
                        className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md cursor-pointer tabular-nums"
                      >
                        {amt.toLocaleString('en-US')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Single Transfer / QR / Credit Confirmation */}
              {(payMode === 'transfer' || payMode === 'qr' || payMode === 'credit') && (
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                  {payMode === 'credit'
                    ? `บันทึกยอดค้างชำระ (Credit Sale) จำนวน ${formatLak(billTotals.grandTotalLak)} ในนาม "${customerName || 'ลูกค้าทั่วไป'}"`
                    : `รับชำระเต็มจำนวน ${formatLak(billTotals.grandTotalLak)} ผ่านช่องทาง ${payMode === 'transfer' ? 'โอนเงินผ่านธนาคาร' : 'QR Payment'}`}
                </div>
              )}

              {/* Split Payment Builder */}
              {payMode === 'split' && (
                <div className="space-y-2.5">
                  {splitRows.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <select
                        value={row.method}
                        onChange={(e) => {
                          const next = [...splitRows];
                          next[idx] = {
                            ...next[idx],
                            method: e.target.value as PaymentSplit['method'],
                          };
                          setSplitRows(next);
                        }}
                        className="col-span-5 px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                      >
                        <option value="cash">เงินสด</option>
                        <option value="transfer">โอนเงิน</option>
                        <option value="qr">QR Payment</option>
                        <option value="credit">ค้างชำระ (เครดิต)</option>
                      </select>
                      <input
                        type="number"
                        min={0}
                        value={row.amountLak}
                        onChange={(e) => {
                          const next = [...splitRows];
                          next[idx] = {
                            ...next[idx],
                            amountLak: Math.max(0, Math.round(Number(e.target.value) || 0)),
                          };
                          setSplitRows(next);
                        }}
                        className="col-span-6 px-3 py-2 text-sm border border-slate-200 rounded-lg text-right tabular-nums"
                      />
                      <button
                        type="button"
                        disabled={splitRows.length <= 1}
                        onClick={() => setSplitRows((prev) => prev.filter((_, i) => i !== idx))}
                        className="col-span-1 p-2 text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {splitRows.length < 5 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSplitRows((prev) => [...prev, { method: 'qr', amountLak: 0 }])
                      }
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      เพิ่มช่องทางชำระเงิน
                    </button>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  หมายเหตุบิล (ถ้ามี)
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={billNotes}
                  onChange={(e) => setBillNotes(e.target.value)}
                  placeholder="เช่น เลขที่อ้างอิงสลิปโอนเงิน หรือข้อมูลจัดส่ง"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              {/* Change / Remaining Summary */}
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-2 gap-3 text-xs tabular-nums">
                <div>
                  <span className="text-slate-500">ยอดที่รับ/ตัดชำระ</span>
                  <div className="text-base font-bold text-slate-900">
                    {formatLak(computedPaymentSummary.covered)}
                  </div>
                </div>
                <div className="text-right">
                  {computedPaymentSummary.remaining > 0 ? (
                    <>
                      <span className="text-red-600 font-medium">ยังขาดอีก</span>
                      <div className="text-base font-bold text-red-600">
                        {formatLak(computedPaymentSummary.remaining)}
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-green-700 font-medium">เงินทอน</span>
                      <div className="text-base font-bold text-green-700">
                        {formatLak(computedPaymentSummary.change)}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCheckoutOpen(false)}
                  className="px-4 py-2.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  กลับไปแก้ไข
                </button>
                <button
                  type="submit"
                  disabled={checkoutSaving || computedPaymentSummary.remaining > 0}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg cursor-pointer"
                >
                  {checkoutSaving ? 'กำลังบันทึกบิล...' : 'ยืนยันชำระเงิน & ออกใบเสร็จ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Completed Sale Receipt Modal */}
      {completedSale && (
        <ReceiptPrintModal
          sale={completedSale}
          settings={settings}
          storeName={organization?.name ?? 'Grocery POS'}
          onClose={() => setCompletedSale(null)}
        />
      )}

      {posScannerOpen && (
        <BarcodeQrScannerModal
          title="สแกนบาร์โค้ด / QR Code เพื่อขายสินค้า"
          subtitle="สแกนรหัสสินค้าเพื่อเพิ่มลงตะกร้าขายหน้าร้านทันที"
          onDetected={(code) => {
            setPosScannerOpen(false);
            tryAddScannedCodeToCart(code, false);
          }}
          onClose={() => setPosScannerOpen(false)}
        />
      )}

      {/* Product Not Found Confirmation Modal */}
      {notFoundPrompt && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-slate-900">
                  ไม่พบสินค้านี้ในระบบ ต้องการเพิ่มสินค้าใหม่หรือไม่?
                </h3>
                <p className="text-xs text-slate-600">
                  รหัส / คำค้นหา:{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    &ldquo;{notFoundPrompt.query}&rdquo;
                  </span>
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setNotFoundPrompt(null);
                  searchInputRef.current?.focus();
                }}
                className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => openQuickAddProduct(notFoundPrompt.query)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
              >
                <PackagePlus className="w-4 h-4" />
                เพิ่มสินค้าใหม่
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Product Modal from POS */}
      <QuickAddProductModal
        open={quickAddOpen}
        initialQuery={quickAddInitialQuery}
        initialCategoryId={selectedCategoryId}
        categories={categories}
        existingProducts={allProducts}
        userProfile={userProfile}
        activeBranchId={activeBranchId}
        canCreateProduct={canCreateProduct}
        allowNegativeStock={allowNegativeStock}
        onCreated={handleQuickProductCreated}
        onClose={() => {
          setQuickAddOpen(false);
          searchInputRef.current?.focus();
        }}
      />
    </div>
  );
}
