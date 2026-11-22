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
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CreditCard,
  Minus,
  Package,
  PackagePlus,
  PauseCircle,
  PlayCircle,
  Plus,
  QrCode,
  ScanBarcode,
  Search,
  ShoppingCart,
  Split,
  Tag,
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
import { PosBeginnerGuideModal, type PosGuideStep } from './PosBeginnerGuideModal';
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
  retail: 'ຂາຍຍ່ອຍ',
  wholesale: 'ຂາຍສົ່ງ',
  member: 'ສະມາຊິກ',
};

const PAYMENT_METHOD_OPTIONS: Array<{
  key: PaymentMethodType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'cash', label: 'ເງິນສົດ', icon: Banknote },
  { key: 'transfer', label: 'ໂອນເງິນ', icon: Wallet },
  { key: 'qr', label: 'QR Pay', icon: QrCode },
  { key: 'credit', label: 'ຂາຍເຊື່ອ', icon: CreditCard },
  { key: 'split', label: 'ຫຼາຍຊ່ອງທາງ', icon: Split },
];

const QUICK_LAK_AMOUNTS = [10000, 20000, 50000, 100000, 200000, 500000];

function ProductImageThumb({ src, name }: { src?: string; name: string }) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  if (!src || imgError) {
    return (
      <div className="w-full h-28 rounded-lg bg-slate-50 border border-slate-100 flex flex-col items-center justify-center text-slate-400 gap-1">
        <Package className="w-7 h-7 stroke-[1.5]" />
        <span className="text-[11px] text-slate-400">ບໍ່ມີຮູບສິນຄ້າ</span>
      </div>
    );
  }

  return (
    <div className="w-full h-28 rounded-lg bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center">
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className="w-full h-full object-cover"
      />
    </div>
  );
}

export function PosTerminalPage() {
  const { userProfile, organization, activeBranchId, settings } = useFirebase();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const categoryScrollRef = useRef<HTMLDivElement | null>(null);
  const cartSectionRef = useRef<HTMLDivElement | null>(null);

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [heldBills, setHeldBills] = useState<PosHeldBill[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [membershipTiers, setMembershipTiers] = useState<MembershipTier[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);

  const [searchText, setSearchText] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [priceTier, setPriceTier] = useState<PriceTier>('retail');

  const [cartLines, setCartLines] = useState<CartLineState[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState('ລູກຄ້າທົ່ວໄປ');
  const [selectedPromotionId, setSelectedPromotionId] = useState<string>('');
  const [billDiscountLak, setBillDiscountLak] = useState<number>(0);
  const [billNotes, setBillNotes] = useState('');
  const [activeHeldBillId, setActiveHeldBillId] = useState<string | null>(null);
  const [showDiscountOptions, setShowDiscountOptions] = useState(false);

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

  // Payment Checkout Modal & Inline Payment Choice
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [payMode, setPayMode] = useState<PaymentMethodType>('cash');
  const [cashTendered, setCashTendered] = useState<string>('0');
  const [splitRows, setSplitRows] = useState<PaymentSplit[]>([
    { method: 'cash', amountLak: 0 },
    { method: 'transfer', amountLak: 0 },
  ]);
  const [checkoutSaving, setCheckoutSaving] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Completed Receipt & Camera Scanner Modals
  const [completedSale, setCompletedSale] = useState<SaleOrder | null>(null);
  const [posScannerOpen, setPosScannerOpen] = useState(false);

  // First-time POS Beginner Guide
  const [guideOpen, setGuideOpen] = useState(false);
  const [activeGuideSection, setActiveGuideSection] = useState<
    PosGuideStep['sectionId'] | null
  >(null);

  const canCreateSale = hasPermission(userProfile, 'pos', 'create');
  const canEditPrice = hasPermission(userProfile, 'pos', 'edit');
  const canCreateProduct = hasPermission(userProfile, 'products', 'create');
  const allowNegativeStock = settings?.inventorySettings?.allowNegativeStock ?? false;

  const guideStorageKey = useMemo(
    () => `grocery_pos_beginner_guide_seen_v1_${userProfile?.uid ?? 'default'}`,
    [userProfile?.uid],
  );

  useEffect(() => {
    if (!userProfile) return;
    try {
      const seen = window.localStorage.getItem(guideStorageKey);
      if (seen !== 'true') {
        setGuideOpen(true);
      }
    } catch {
      // Ignore storage access restriction
    }
  }, [userProfile, guideStorageKey]);

  const dismissBeginnerGuide = () => {
    try {
      window.localStorage.setItem(guideStorageKey, 'true');
    } catch {
      // Ignore storage access restriction
    }
    setGuideOpen(false);
    setActiveGuideSection(null);
    window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 80);
  };

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
            .filter((c) => c.status === 'active')
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
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

  useEffect(() => {
    if (
      selectedCategoryId !== 'all' &&
      !categories.some((c) => c.categoryId === selectedCategoryId)
    ) {
      setSelectedCategoryId('all');
    }
  }, [categories, selectedCategoryId]);

  const mainCategories = useMemo(
    () => categories.filter((c) => !c.parentId),
    [categories],
  );

  const selectedMainCategoryId = useMemo(() => {
    if (selectedCategoryId === 'all') return 'all';
    const selected = categories.find((c) => c.categoryId === selectedCategoryId);
    if (!selected) return 'all';
    return selected.parentId || selected.categoryId;
  }, [categories, selectedCategoryId]);

  const products = useMemo(
    () => allProducts.filter((p) => p.status === 'active'),
    [allProducts],
  );

  const categoryProductCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      if (p.categoryId) {
        counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
      }
      if (p.subCategoryId && p.subCategoryId !== p.categoryId) {
        counts.set(p.subCategoryId, (counts.get(p.subCategoryId) ?? 0) + 1);
      }
    }
    return counts;
  }, [products]);

  const filteredCategories = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q)),
    );
  }, [categories, categorySearch]);

  const scrollCategories = (direction: 'left' | 'right') => {
    const el = categoryScrollRef.current;
    if (!el) return;
    const offset = direction === 'left' ? -240 : 240;
    el.scrollBy({ left: offset, behavior: 'smooth' });
  };

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
      if (
        selectedCategoryId !== 'all' &&
        p.categoryId !== selectedCategoryId &&
        p.subCategoryId !== selectedCategoryId
      ) {
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

  const totalCartUnits = useMemo(
    () => cartLines.reduce((sum, l) => sum + l.qty, 0),
    [cartLines],
  );

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
        const gross = Math.round(
          Math.max(1, Math.round(entry.qty)) * Math.max(0, Math.round(entry.unitPriceLak)),
        );
        const disc = Math.min(gross, Math.max(0, Math.round(entry.discountLak)));
        return sum + Math.max(0, gross - disc);
      }, 0),
    [resolvedCartInputs],
  );

  const tierDiscountLak = useMemo(() => {
    if (!selectedMembershipTier || selectedMembershipTier.discountPercent <= 0) return 0;
    return Math.round(
      (rawCartNetAfterItemDiscount * selectedMembershipTier.discountPercent) / 100,
    );
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

  const totalCombinedDiscountLak =
    billTotals.itemDiscountTotalLak + billTotals.billDiscountLak;

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
        text: `ສິນຄ້າ "${product.name}" ຄົງເຫຼືອ ${stockBase.toLocaleString('en-US')} ${product.baseUnitName} ບໍ່ພໍຕັດເພີ່ມ (${neededBase.toLocaleString('en-US')} ${product.baseUnitName})`,
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
        text: 'ບັນຊີຂອງທ່ານບໍ່ມີສິດເພີ່ມສິນຄ້າໃໝ່ ກະລຸນາຕິດຕໍ່ເຈົ້າຂອງຮ້ານ ຫຼື ຜູ້ຈັດການຮ້ານ',
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
          text: `ເພີ່ມສິນຄ້າສຳເລັດແລ້ວ: "${product.name}" (ສະຕັອກເລີ່ມຕົ້ນ ${balance.qtyOnHandBase} ${product.baseUnitName} — ກະລຸນາຮັບສິນຄ້າເຂົ້າສາງກ່ອນເພີ່ມລົງກະຕ່າ)`,
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
          text: `ເພີ່ມສິນຄ້າສຳເລັດແລ້ວ: ເພີ່ມ "${product.name}" ລົງໃນກະຕ່າສິນຄ້າຮຽບຮ້ອຍແລ້ວ`,
        });
      }
    } else {
      setFeedback({
        type: 'ok',
        text: 'ເພີ່ມສິນຄ້າສຳເລັດແລ້ວ',
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
        text: `ພົບສິນຄ້າ "${inactiveMatch.name}" (${raw}) ແຕ່ຢູ່ໃນສະຖານະຢຸດຂາຍຊົ່ວຄາວ ກະລຸນາເປີດຂາຍໃນໜ້າຈັດການສິນຄ້າ`,
      });
      return false;
    }

    setFeedback(null);
    setNotFoundPrompt({ query: raw });
    return false;
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchText.trim()) {
      searchInputRef.current?.focus();
      setFeedback({
        type: 'ok',
        text: 'ພ້ອມຮັບບາໂຄ້ດແລ້ວ — ຍິງບາໂຄ້ດຈາກເຄື່ອງສະແກນ ຫຼື ພິມຊື່ສິນຄ້າແລ້ວກົດ Enter ໄດ້ເລີຍ',
      });
      return;
    }
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
        text: `ສິນຄ້າ "${prod.name}" ມີສະຕັອກຄົງເຫຼືອ ${stockBase.toLocaleString('en-US')} ${prod.baseUnitName}`,
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
        text: `ສະຕັອກຄົງເຫຼືອບໍ່ພໍສຳລັບປ່ຽນເປັນໜ່ວຍນີ້ (ຄົງເຫຼືອ ${stockBase.toLocaleString('en-US')} ${prod.baseUnitName})`,
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

  const clearCart = () => {
    setCartLines([]);
    setSelectedCustomerId('');
    setCustomerName('ລູກຄ້າທົ່ວໄປ');
    setSelectedPromotionId('');
    setBillDiscountLak(0);
    setBillNotes('');
    setActiveHeldBillId(null);
    setShowDiscountOptions(false);
    setCashTendered('0');
    setFeedback(null);
  };

  const removeCartLine = (lineKey: string) => {
    setCartLines((prev) => prev.filter((l) => l.lineKey !== lineKey));
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
        label: holdLabel || `ບິນພັກ · ${customerName}`,
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
      setFeedback({ type: 'ok', text: 'ພັກບິນສຳເລັດແລ້ວ ສາມາດເອີ້ນກັບມາຂາຍໄດ້ຕະຫຼອດເວລາ' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ບໍ່ສາມາດພັກບິນໄດ້',
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
    setFeedback({ type: 'ok', text: `ດຶງບິນ "${held.label}" ກັບມາທີ່ກະຕ່າແລ້ວ` });
  };

  const handleDiscardHeldBill = async (heldId: string) => {
    try {
      await updatePosHeldBillStatus({ db, heldId, status: 'discarded' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ບໍ່ສາມາດລຶບບິນພັກໄດ້',
      });
    }
  };

  useEffect(() => {
    if (payMode === 'cash') {
      setCashTendered((prev) => {
        if (cartLines.length === 0) return '0';
        const numeric = Number(prev) || 0;
        return numeric === 0 ? String(billTotals.grandTotalLak) : prev;
      });
    }
  }, [billTotals.grandTotalLak, cartLines.length, payMode]);

  const openCheckoutModal = () => {
    if (cartLines.length === 0) return;
    if (payMode === 'cash') {
      const currentCash = Math.max(0, Math.round(Number(cashTendered) || 0));
      if (currentCash < billTotals.grandTotalLak) {
        setCashTendered(String(billTotals.grandTotalLak));
      }
    }
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
        `ຍອດຊຳລະຍັງຂາດອີກ ${formatLak(computedPaymentSummary.remaining)}`,
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
        text: `ບັນທຶກການຂາຍສຳເລັດ ເລກທີ ${created.invoiceNumber} (${formatLak(created.grandTotalLak)})`,
      });
      searchInputRef.current?.focus();
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : 'ບໍ່ສາມາດບັນທຶກການຂາຍໄດ້ ກະລຸນາລອງໃໝ່',
      );
    } finally {
      setCheckoutSaving(false);
    }
  };

  const selectedCategoryName = useMemo(() => {
    if (selectedCategoryId === 'all') return 'ທັງໝົດ';
    return categories.find((c) => c.categoryId === selectedCategoryId)?.name ?? 'ທັງໝົດ';
  }, [categories, selectedCategoryId]);

  return (
    <div className="space-y-4 pb-20 lg:pb-0">
      {/* Top Helper Toolbar: Price Tier, Held Bills & First-time Guide */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-xs font-semibold text-slate-600">ປະເພດລາຄາຂາຍ</div>
          <div className="inline-flex items-center bg-slate-100 p-1 rounded-lg">
            {(['retail', 'wholesale', 'member'] as const).map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => setPriceTier(tier)}
                className={`min-h-[36px] px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  priceTier === tier
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {PRICE_TIER_LABELS[tier]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setHeldListModalOpen(true)}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg cursor-pointer tabular-nums whitespace-nowrap shrink-0"
          >
            <PlayCircle className="w-4 h-4 text-blue-600" />
            <span>ບິນພັກ ({heldBills.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
          >
            <BookOpen className="w-4 h-4" />
            <span>ຄູ່ມືໃຊ້ງານ POS</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-2 ${
            feedback.type === 'ok'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 text-current opacity-70 hover:opacity-100 cursor-pointer"
            aria-label="ປິດຂໍ້ຄວາມແຈ້ງເຕືອນ"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main 2-Column POS Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Section 1 (Search & Scan), Section 2 (Categories), Section 3 (Products) */}
        <div className="lg:col-span-7 space-y-4">
          {/* SECTION 1: Search & Barcode Scanner */}
          <section
            className={`bg-white border rounded-xl p-4 sm:p-5 space-y-3 transition-shadow ${
              activeGuideSection === 'search' || activeGuideSection === 'scanner'
                ? 'border-blue-600 ring-2 ring-blue-200'
                : 'border-slate-200'
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm sm:text-base font-bold text-slate-900">1. ຄົ້ນຫາສິນຄ້າ</h2>
              <span className="text-xs text-slate-500">
                ພິມຊື່ສິນຄ້າ ລະຫັດ SKU ຫຼື ຍິງບາໂຄ້ດແລ້ວກົດ Enter
              </span>
            </div>

            <form onSubmit={handleBarcodeSubmit} className="space-y-2.5">
              <div className="relative">
                <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  autoFocus
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="ຄົ້ນຫາຊື່ສິນຄ້າ ຫຼື ສະແກນບາໂຄ້ດ"
                  className="w-full min-h-[48px] pl-11 pr-10 py-2.5 text-base bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
                {searchText && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchText('');
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                    aria-label="ລ້າງຄຳຄົ້ນຫາ"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="submit"
                  className="min-h-[46px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <ScanBarcode className="w-5 h-5 shrink-0" />
                  <div className="text-left leading-tight">
                    <div className="text-sm font-semibold whitespace-nowrap">ສະແກນບາໂຄ້ດ</div>
                    <div className="text-[11px] text-blue-100">ຄົ້ນຫາ ຫຼື ຍິງລະຫັດສິນຄ້າ</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setPosScannerOpen(true)}
                  className="min-h-[46px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <QrCode className="w-5 h-5 shrink-0" />
                  <div className="text-left leading-tight">
                    <div className="text-sm font-semibold whitespace-nowrap">ສະແກນດ້ວຍກ້ອງ</div>
                    <div className="text-[11px] text-slate-300">ເປີດກ້ອງສະແກນ Barcode / QR</div>
                  </div>
                </button>
              </div>
            </form>
          </section>

          {/* SECTION 2: Product Categories */}
          <section
            className={`bg-white border rounded-xl p-4 space-y-3 transition-shadow ${
              activeGuideSection === 'categories'
                ? 'border-blue-600 ring-2 ring-blue-200'
                : 'border-slate-200'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    2. ເລືອກໝວດໝູ່ ({categories.length} ໝວດໝູ່)
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="relative flex-1 sm:w-56">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    placeholder="ຄົ້ນຫາໝວດໝູ່..."
                    className="w-full min-h-[38px] pl-8 pr-8 py-1.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:border-blue-600"
                  />
                  {categorySearch && (
                    <button
                      type="button"
                      onClick={() => setCategorySearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                      aria-label="ລ້າງຄຳຄົ້ນຫາໝວດໝູ່"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {categories.length > 0 && (
                  <div className="hidden sm:inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => scrollCategories('left')}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-600 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 rounded-lg cursor-pointer"
                      aria-label="ເລື່ອນເບິ່ງໝວດໝູ່ທາງຊ້າຍ"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollCategories('right')}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-600 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 rounded-lg cursor-pointer"
                      aria-label="ເລື່ອນເບິ່ງໝວດໝູ່ທາງຂວາ"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div
              ref={categoryScrollRef}
              className="flex items-center gap-2 overflow-x-auto pb-1 scroll-smooth"
            >
              <button
                type="button"
                onClick={() => setSelectedCategoryId('all')}
                className={`min-h-[42px] px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer border transition-colors tabular-nums ${
                  selectedCategoryId === 'all'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200'
                }`}
              >
                ທັງໝົດ ({products.length})
              </button>

              {filteredCategories.map((cat) => {
                const isSelected = selectedCategoryId === cat.categoryId;
                const count = categoryProductCounts.get(cat.categoryId) ?? 0;
                return (
                  <button
                    key={cat.categoryId}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.categoryId)}
                    className={`min-h-[42px] px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer border transition-colors tabular-nums ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200'
                    }`}
                  >
                    {cat.name} ({count})
                  </button>
                );
              })}

              {categorySearch.trim() && filteredCategories.length === 0 && (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                  <span>ບໍ່ພົບໝວດໝູ່ &ldquo;{categorySearch.trim()}&rdquo;</span>
                  <button
                    type="button"
                    onClick={() => setCategorySearch('')}
                    className="text-blue-600 font-semibold hover:underline cursor-pointer"
                  >
                    ສະແດງທັງໝົດ
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* SECTION 3: Product Grid */}
          <section
            className={`space-y-3 rounded-xl transition-shadow ${
              activeGuideSection === 'products' ? 'ring-2 ring-blue-200 p-1' : ''
            }`}
          >
            <div className="flex items-center justify-between px-1">
              <div className="text-sm font-bold text-slate-900">
                3. ລາຍການສິນຄ້າ ({selectedCategoryName})
              </div>
              <div className="text-xs text-slate-500 tabular-nums">
                ສະແດງ {filteredProducts.length} ລາຍການ · ລາຄາ{PRICE_TIER_LABELS[priceTier]}
              </div>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
                {searchText.trim() ? (
                  <div className="max-w-md mx-auto space-y-4">
                    <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mx-auto">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-bold text-slate-900">
                        ບໍ່ພົບສິນຄ້າໃນລະບົບ ທ່ານຕ້ອງການເພີ່ມສິນຄ້າໃໝ່ຫຼືບໍ່?
                      </p>
                      <p className="text-xs sm:text-sm text-slate-500">
                        ຄຳຄົ້ນຫາ / ບາໂຄ້ດ:{' '}
                        <span className="font-mono font-semibold text-slate-800">
                          &ldquo;{searchText.trim()}&rdquo;
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => openQuickAddProduct(searchText.trim())}
                        className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
                      >
                        <PackagePlus className="w-4 h-4" />
                        <span>ເພີ່ມສິນຄ້າໃໝ່</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchText('');
                          setNotFoundPrompt(null);
                          searchInputRef.current?.focus();
                        }}
                        className="min-h-[44px] px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
                      >
                        ຍົກເລີກ
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-sm text-slate-500">
                    <p>ບໍ່ມີສິນຄ້າໃນໝວດໝູ່ &ldquo;{selectedCategoryName}&rdquo;</p>
                    {selectedCategoryId !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setSelectedCategoryId('all')}
                        className="text-blue-600 font-semibold hover:underline cursor-pointer"
                      >
                        ເບິ່ງສິນຄ້າທັງໝົດ
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {filteredProducts.map((prod) => {
                  const qtyOnHand = balanceMap.get(prod.productId) ?? 0;
                  const isOut = qtyOnHand <= 0;
                  const isLow = !isOut && qtyOnHand <= prod.minStockBaseQty;
                  const baseUnit = prod.units.find((u) => u.isBaseUnit) ?? prod.units[0];
                  const displayPrice = baseUnit
                    ? getUnitPriceByTier(baseUnit, priceTier)
                    : prod.retailPriceLak;
                  const disableBaseAdd = !allowNegativeStock && isOut;

                  return (
                    <div
                      key={prod.productId}
                      className="bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-3.5 flex flex-col justify-between gap-3 transition-colors"
                    >
                      <div className="space-y-2.5">
                        <ProductImageThumb src={prod.imageUrl} name={prod.name} />

                        {/* Full Product Name - no unnecessary truncation */}
                        <div className="space-y-1">
                          <h3 className="text-sm sm:text-[15px] font-semibold text-slate-900 leading-snug break-words">
                            {prod.name}
                          </h3>
                          <div className="text-[11px] font-mono text-slate-400">
                            ລະຫັດ: {prod.sku}
                          </div>
                        </div>

                        {/* Price & Stock Info */}
                        <div className="pt-1 border-t border-slate-100 space-y-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-lg font-bold text-blue-600 tabular-nums">
                              {formatLak(displayPrice)}
                            </span>
                            <span className="text-xs font-medium text-slate-500">
                              / {baseUnit?.unitName ?? prod.baseUnitName}
                            </span>
                          </div>

                          <div
                            className={`text-xs font-medium tabular-nums flex items-center gap-1 ${
                              isOut
                                ? 'text-red-600'
                                : isLow
                                  ? 'text-amber-600'
                                  : 'text-slate-600'
                            }`}
                          >
                            {isOut ? (
                              <>
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>ສິນຄ້າໝົດ (0 {prod.baseUnitName})</span>
                              </>
                            ) : (
                              <span>
                                {isLow ? 'ໃກ້ໝົດ · ' : ''}ຄົງເຫຼືອ {qtyOnHand.toLocaleString('en-US')}{' '}
                                {prod.baseUnitName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 pt-1">
                        {/* Primary Add to Cart Button */}
                        <button
                          type="button"
                          disabled={disableBaseAdd || !baseUnit}
                          onClick={() => baseUnit && addProductUnitToCart(prod, baseUnit)}
                          className="w-full min-h-[44px] px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <Plus className="w-4 h-4 shrink-0" />
                          <span>{disableBaseAdd ? 'ສິນຄ້າໝົດ' : 'ເພີ່ມໃສ່ກະຕ່າ'}</span>
                        </button>

                        {/* Additional Unit Options (Wholesale / Pack / Box) */}
                        {prod.units.length > 1 && (
                          <div className="flex flex-wrap gap-1.5">
                            {prod.units.map((unit) => (
                              <button
                                key={unit.unitId}
                                type="button"
                                onClick={() => addProductUnitToCart(prod, unit)}
                                className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 hover:border-blue-300 rounded-lg cursor-pointer tabular-nums"
                              >
                                <Plus className="w-3 h-3" />
                                <span>
                                  {unit.unitName} ·{' '}
                                  {formatLak(getUnitPriceByTier(unit, priceTier), false)}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN: Section 4 (Cart) & Section 5 (Checkout) */}
        <div
          ref={cartSectionRef}
          className={`lg:col-span-5 bg-white border rounded-xl overflow-hidden lg:sticky lg:top-20 transition-shadow ${
            activeGuideSection === 'cart' || activeGuideSection === 'checkout'
              ? 'border-blue-600 ring-2 ring-blue-200'
              : 'border-slate-200'
          }`}
        >
          {/* Cart Header */}
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900">
                  4. ກະຕ່າສິນຄ້າ
                </h2>
                <div className="text-xs text-slate-500 tabular-nums">
                  {cartLines.length} ລາຍການ · ລວມ {totalCartUnits.toLocaleString('en-US')} ອັນ
                </div>
              </div>
            </div>

            {cartLines.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setHoldLabel('');
                    setHoldModalOpen(true);
                  }}
                  className="min-h-[38px] inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 hover:border-amber-400 text-amber-600 rounded-lg cursor-pointer"
                  title="ພັກບິນນີ້ໄວ້ກ່ອນ ເພື່ອຂາຍໃຫ້ລູກຄ້າຄົນຕໍ່ໄປ"
                >
                  <PauseCircle className="w-4 h-4" />
                  <span>ພັກບິນ</span>
                </button>
                <button
                  type="button"
                  onClick={clearCart}
                  className="min-h-[38px] inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-lg cursor-pointer"
                  title="ລຶບສິນຄ້າທັງໝົດອອກຈາກກະຕ່າ"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>ລ້າງກະຕ່າ</span>
                </button>
              </div>
            )}
          </div>

          {/* Customer Selector */}
          <div className="px-4 py-3 border-b border-slate-100 space-y-2 bg-white">
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
                    setCustomerName('ລູກຄ້າທົ່ວໄປ');
                  }
                }}
                className="flex-1 min-h-[38px] text-xs sm:text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-600"
              >
                <option value="">ລູກຄ້າທົ່ວໄປ (Walk-in)</option>
                {customers.map((c) => (
                  <option key={c.customerId} value={c.customerId}>
                    {c.name} {c.phone ? `(${c.phone})` : ''} {c.tierName ? `· ${c.tierName}` : ''}
                  </option>
                ))}
              </select>
              <span className="text-xs font-semibold text-blue-600 shrink-0">
                {PRICE_TIER_LABELS[priceTier]}
              </span>
            </div>

            {selectedCustomer ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 tabular-nums">
                <span>
                  ຄະແນນສະສົມ:{' '}
                  <strong className="text-blue-600">
                    {selectedCustomer.pointsBalance.toLocaleString('en-US')}
                  </strong>
                  {selectedMembershipTier
                    ? ` · ສ່ວນຫຼຸດສະມາຊິກ ${selectedMembershipTier.discountPercent}%`
                    : ''}
                </span>
                <span>
                  ຄ້າງຊຳລະ:{' '}
                  <strong
                    className={
                      selectedCustomer.creditBalanceLak > 0 ? 'text-amber-600' : 'text-slate-800'
                    }
                  >
                    {formatLak(selectedCustomer.creditBalanceLak)}
                  </strong>
                </span>
              </div>
            ) : (
              <input
                type="text"
                maxLength={120}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="ຊື່ລູກຄ້າ (ຄ່າເລີ່ມຕົ້ນ: ລູກຄ້າທົ່ວໄປ)"
                className="w-full text-xs text-slate-700 bg-transparent border-b border-slate-200 pb-1.5 focus:outline-none focus:border-blue-600"
              />
            )}
          </div>

          {/* Cart Items List */}
          <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto bg-white">
            {cartLines.length === 0 && (
              <div className="py-12 px-6 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <ShoppingCart className="w-6 h-6" />
                </div>
                <div className="text-sm font-semibold text-slate-700">ຍັງບໍ່ມີສິນຄ້າໃນກະຕ່າ</div>
                <div className="text-xs text-slate-500">
                  ກົດປຸ່ມ &ldquo;ເພີ່ມໃສ່ກະຕ່າ&rdquo; ທີ່ສິນຄ້າດ້ານຊ້າຍ ຫຼື ສະແກນບາໂຄ້ດເພື່ອເລີ່ມຂາຍ
                </div>
              </div>
            )}

            {cartLines.map((line, index) => {
              const prod = productMap.get(line.productId);
              const computedItem = billTotals.items[index];
              if (!prod || !computedItem) return null;

              return (
                <div key={line.lineKey} className="p-4 space-y-3">
                  {/* Product Title & Remove Button */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-sm font-semibold text-slate-900 leading-snug break-words">
                        {prod.name}
                      </div>
                      <div className="text-xs text-slate-500 tabular-nums">
                        ລາຄາຕໍ່ໜ່ວຍ: {formatLak(computedItem.unitPriceLak)} / {computedItem.unitName}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeCartLine(line.lineKey)}
                      className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 border border-red-100 rounded-lg cursor-pointer shrink-0"
                      title="ລຶບສິນຄ້າອອກຈາກກະຕ່າ"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>ລຶບສິນຄ້າ</span>
                    </button>
                  </div>

                  {/* Unit, Qty +/- and Line Subtotal */}
                  <div className="grid grid-cols-12 gap-2.5 items-center">
                    <div className="col-span-4">
                      <label className="block text-[10px] text-slate-500 mb-0.5">ໜ່ວຍສິນຄ້າ</label>
                      <select
                        value={line.unitId}
                        onChange={(e) => updateCartUnit(line.lineKey, e.target.value)}
                        className="w-full min-h-[40px] px-2 text-xs font-medium border border-slate-200 rounded-lg bg-slate-50 text-slate-800 focus:outline-none focus:border-blue-600"
                      >
                        {prod.units.map((u) => (
                          <option key={u.unitId} value={u.unitId}>
                            {u.unitName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-4">
                      <label className="block text-[10px] text-slate-500 mb-0.5 text-center">
                        ເພີ່ມ / ຫຼຸດຈຳນວນ
                      </label>
                      <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white min-h-[40px]">
                        <button
                          type="button"
                          onClick={() =>
                            line.qty > 1
                              ? updateCartQty(line.lineKey, line.qty - 1)
                              : removeCartLine(line.lineKey)
                          }
                          className="w-9 min-h-[40px] flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
                          aria-label="ຫຼຸດຈຳນວນສິນຄ້າ"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={line.qty}
                          onChange={(e) => updateCartQty(line.lineKey, Number(e.target.value) || 1)}
                          className="w-full text-center text-sm font-bold text-slate-900 tabular-nums focus:outline-none"
                          aria-label="ຈຳນວນສິນຄ້າ"
                        />
                        <button
                          type="button"
                          onClick={() => updateCartQty(line.lineKey, line.qty + 1)}
                          className="w-9 min-h-[40px] flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
                          aria-label="ເພີ່ມຈຳນວນສິນຄ້າ"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="col-span-4 text-right">
                      <div className="text-[10px] text-slate-500 mb-0.5">ລວມລາຍການ</div>
                      <div className="text-sm sm:text-base font-bold text-slate-900 tabular-nums">
                        {formatLak(computedItem.lineTotalLak)}
                      </div>
                    </div>
                  </div>

                  {/* Optional Edit Price / Item Discount */}
                  {(canEditPrice || line.discountLak > 0 || showDiscountOptions) && (
                    <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                      {canEditPrice && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-500 shrink-0">ແກ້ລາຄາ:</span>
                          <input
                            type="number"
                            min={0}
                            value={computedItem.unitPriceLak}
                            onChange={(e) =>
                              updateCartPrice(line.lineKey, Number(e.target.value) || 0)
                            }
                            className="w-full px-2 py-1 border border-slate-200 rounded-md text-right tabular-nums bg-slate-50 focus:bg-white"
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500 shrink-0">ຫຼຸດລາຍການ:</span>
                        <input
                          type="number"
                          min={0}
                          value={line.discountLak}
                          onChange={(e) =>
                            updateCartDiscount(line.lineKey, Number(e.target.value) || 0)
                          }
                          className="w-full px-2 py-1 border border-slate-200 rounded-md text-right tabular-nums bg-slate-50 focus:bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* SECTION 5: Checkout Summary & Primary CTA */}
          <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">5. ສະຫຼຸບຍອດ ແລະ ຊຳລະເງິນ</h3>
              <button
                type="button"
                onClick={() => setShowDiscountOptions((prev) => !prev)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline cursor-pointer"
              >
                <span>{showDiscountOptions ? 'ເຊື່ອງສ່ວນຫຼຸດ/ໂປຣໂມຊັນ' : 'ໃສ່ສ່ວນຫຼຸດ / ໂປຣໂມຊັນ'}</span>
                {showDiscountOptions ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {showDiscountOptions && (
              <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2.5 text-xs">
                {eligiblePromotions.length > 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-600 shrink-0">ໂປຣໂມຊັນ:</span>
                    <select
                      value={selectedPromotionId}
                      onChange={(e) => setSelectedPromotionId(e.target.value)}
                      className="flex-1 min-h-[36px] px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    >
                      <option value="">ບໍ່ໃຊ້ໂປຣໂມຊັນ</option>
                      {eligiblePromotions.map((p) => (
                        <option key={p.promotionId} value={p.promotionId}>
                          {p.code} · {p.name} (ຂັ້ນຕ່ຳ {formatLak(p.minSpendLak, false)})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-600">ສ່ວນຫຼຸດທ້າຍບິນ (₭):</span>
                  <input
                    type="number"
                    min={0}
                    value={billDiscountLak}
                    onChange={(e) =>
                      setBillDiscountLak(Math.max(0, Math.round(Number(e.target.value) || 0)))
                    }
                    className="w-32 min-h-[36px] px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-right tabular-nums font-semibold"
                  />
                </div>
              </div>
            )}

            {/* Financial Totals */}
            <div className="space-y-1.5 text-xs sm:text-sm tabular-nums">
              <div className="flex justify-between text-slate-600">
                <span>ຍອດລວມສິນຄ້າ ({totalCartUnits.toLocaleString('en-US')} ອັນ)</span>
                <span className="font-medium text-slate-800">
                  {formatLak(billTotals.subtotalLak)}
                </span>
              </div>

              {totalCombinedDiscountLak > 0 && (
                <div className="flex justify-between text-amber-600">
                  <span>ສ່ວນຫຼຸດລວມ</span>
                  <span className="font-semibold">-{formatLak(totalCombinedDiscountLak)}</span>
                </div>
              )}

              {billTotals.taxRate > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>
                    ອາກອນ ({billTotals.taxRate}%
                    {settings?.taxSettings?.taxInclusive ? ' ລວມໃນລາຄາ' : ''})
                  </span>
                  <span>{formatLak(billTotals.taxAmountLak)}</span>
                </div>
              )}
            </div>

            {/* Quick Payment Method Preview */}
            {cartLines.length > 0 && (
              <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="font-semibold text-slate-700">ວິທີຊຳລະເງິນ</span>
                  <span>
                    {PAYMENT_METHOD_OPTIONS.find((m) => m.key === payMode)?.label ?? 'ເງິນສົດ'}
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1">
                  {PAYMENT_METHOD_OPTIONS.map((pm) => {
                    const Icon = pm.icon;
                    const active = payMode === pm.key;
                    return (
                      <button
                        key={pm.key}
                        type="button"
                        onClick={() => setPayMode(pm.key)}
                        className={`min-h-[42px] px-1 py-1.5 rounded-lg border text-[11px] font-medium flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
                          active
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate max-w-full">{pm.label}</span>
                      </button>
                    );
                  })}
                </div>

                {payMode === 'cash' && (
                  <div className="grid grid-cols-2 gap-2 pt-1 items-center text-xs tabular-nums">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">
                        ຈຳນວນເງິນທີ່ລູກຄ້າຊຳລະ (₭)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={cashTendered}
                        onChange={(e) => setCashTendered(e.target.value)}
                        className="w-full min-h-[38px] px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-right font-bold text-slate-900"
                      />
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-slate-500 mb-0.5">ເງິນທອນ</div>
                      <div
                        className={`text-base font-bold ${
                          computedPaymentSummary.remaining > 0
                            ? 'text-red-600'
                            : 'text-green-600'
                        }`}
                      >
                        {computedPaymentSummary.remaining > 0
                          ? `ຂາດ ${formatLak(computedPaymentSummary.remaining)}`
                          : formatLak(computedPaymentSummary.change)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Net Total + Prominent Checkout CTA */}
            <div className="pt-2 border-t border-slate-200 flex items-baseline justify-between">
              <span className="text-sm sm:text-base font-bold text-slate-900">ຍອດລວມທີ່ຕ້ອງຊຳລະ</span>
              <span className="text-2xl sm:text-3xl font-bold text-blue-600 tabular-nums">
                {formatLak(billTotals.grandTotalLak)}
              </span>
            </div>

            <button
              type="button"
              disabled={!canCreateSale || cartLines.length === 0}
              onClick={openCheckoutModal}
              className="w-full min-h-[56px] px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-xl shadow-sm transition-colors cursor-pointer flex flex-col items-center justify-center"
            >
              <span className="text-base font-bold tabular-nums">
                ຊຳລະເງິນ · {formatLak(billTotals.grandTotalLak)}
              </span>
              <span className="text-[11px] font-normal text-blue-100">
                {cartLines.length === 0
                  ? 'ກະລຸນາເພີ່ມສິນຄ້າໃສ່ກະຕ່າກ່ອນຊຳລະເງິນ'
                  : 'ກົດເພື່ອກວດສອບເງິນທອນ ຢືນຢັນການຂາຍ ແລະ ພິມໃບບິນ'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Compact Sticky Cart Bar (only on < lg screens, <= 15% height) */}
      {cartLines.length > 0 && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 px-4 py-2.5 shadow-lg flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 tabular-nums">
              ກະຕ່າ: {totalCartUnits} ອັນ ({cartLines.length} ລາຍການ)
            </div>
            <div className="text-base font-bold text-blue-600 tabular-nums truncate">
              {formatLak(billTotals.grandTotalLak)}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                cartSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              ເບິ່ງກະຕ່າ
            </button>
            <button
              type="button"
              disabled={!canCreateSale}
              onClick={openCheckoutModal}
              className="min-h-[42px] px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
            >
              ຊຳລະເງິນ
            </button>
          </div>
        </div>
      )}

      {/* Hold Bill Modal */}
      {holdModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-semibold text-slate-900">ພັກບິນຂາຍຊົ່ວຄາວ</h3>
              <button
                type="button"
                onClick={() => setHoldModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="ປິດ"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmHoldBill} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ປ້າຍຊື່ / ເລກອ້າງອີງບິນພັກ *
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={holdLabel}
                  onChange={(e) => setHoldLabel(e.target.value)}
                  placeholder="ເຊັ່ນ ລູກຄ້າເສື້ອສີຟ້າ / ລໍຖ້າເລືອກເຄື່ອງເພີ່ມ"
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">ໝາຍເຫດ</label>
                <input
                  type="text"
                  maxLength={300}
                  value={billNotes}
                  onChange={(e) => setBillNotes(e.target.value)}
                  placeholder="ໝາຍເຫດເພີ່ມເຕີມ (ຖ້າມີ)"
                  className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setHoldModalOpen(false)}
                  className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  ຍົກເລີກ
                </button>
                <button
                  type="submit"
                  disabled={holdSaving}
                  className="min-h-[42px] px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  {holdSaving ? 'ກຳລັງພັກບິນ...' : 'ຢືນຢັນພັກບິນ'}
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
                ລາຍການບິນທີ່ພັກໄວ້ ({heldBills.length})
              </h3>
              <button
                type="button"
                onClick={() => setHeldListModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="ປິດ"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {heldBills.length === 0 && (
                <div className="py-10 text-center text-xs text-slate-500">
                  ບໍ່ມີບິນທີ່ພັກໄວ້ໃນຂະນະນີ້
                </div>
              )}
              {heldBills.map((held) => (
                <div key={held.heldId} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 truncate">
                      {held.label}
                    </div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      {held.customerName} · {held.items.length} ລາຍການ ·{' '}
                      {formatDateTimeVientiane(held.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleResumeHeldBill(held)}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer"
                    >
                      ເອີ້ນຄືນ
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDiscardHeldBill(held.heldId)}
                      className="min-h-[38px] px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                    >
                      ລຶບ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Checkout Payment Confirmation Modal */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl p-5 sm:p-6 my-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  ຮັບຊຳລະເງິນ ແລະ ຢືນຢັນການຂາຍ
                </h3>
                <p className="text-xs text-slate-500">
                  ລູກຄ້າ: {customerName || 'ລູກຄ້າທົ່ວໄປ'} · {billTotals.items.length} ລາຍການ (
                  {totalCartUnits} ອັນ)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="ປິດໜ້າຕ່າງຊຳລະເງິນ"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {checkoutError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-700">
                {checkoutError}
              </div>
            )}

            <form onSubmit={handleSubmitCheckout} className="space-y-4">
              {/* Totals Summary Box */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 tabular-nums">
                <div className="flex justify-between text-xs text-slate-600">
                  <span>ຍອດລວມສິນຄ້າ</span>
                  <span>{formatLak(billTotals.subtotalLak)}</span>
                </div>
                {totalCombinedDiscountLak > 0 && (
                  <div className="flex justify-between text-xs text-amber-600 font-medium">
                    <span>ສ່ວນຫຼຸດ</span>
                    <span>-{formatLak(totalCombinedDiscountLak)}</span>
                  </div>
                )}
                <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">ຍອດທີ່ຕ້ອງຊຳລະສຸດທິ</span>
                  <span className="text-2xl font-bold text-blue-600">
                    {formatLak(billTotals.grandTotalLak)}
                  </span>
                </div>
              </div>

              {/* Payment Method Tabs */}
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-slate-700">ເລືອກວິທີຊຳລະເງິນ</div>
                <div className="grid grid-cols-5 gap-1.5">
                  {PAYMENT_METHOD_OPTIONS.map((pm) => {
                    const Icon = pm.icon;
                    return (
                      <button
                        key={pm.key}
                        type="button"
                        onClick={() => {
                          setPayMode(pm.key);
                          setCheckoutError(null);
                        }}
                        className={`min-h-[54px] p-2 rounded-lg border text-xs font-semibold flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
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
              </div>

              {/* Cash Input + Quick LAK Denominations */}
              {payMode === 'cash' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      ຈຳນວນເງິນທີ່ລູກຄ້າຊຳລະ (₭)
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      className="w-full min-h-[48px] px-3.5 py-2.5 text-xl font-bold border border-slate-200 rounded-xl text-right tabular-nums focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCashTendered(String(billTotals.grandTotalLak))}
                      className="min-h-[38px] px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg cursor-pointer"
                    >
                      ຮັບພໍດີ
                    </button>
                    {QUICK_LAK_AMOUNTS.map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setCashTendered(String(amt))}
                        className="min-h-[38px] px-3 py-1.5 text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg cursor-pointer tabular-nums"
                      >
                        {amt.toLocaleString('en-US')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Single Transfer / QR / Credit Confirmation */}
              {(payMode === 'transfer' || payMode === 'qr' || payMode === 'credit') && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-700">
                  {payMode === 'credit'
                    ? `ບັນທຶກຍອດຄ້າງຊຳລະ (ຂາຍເຊື່ອ) ຈຳນວນ ${formatLak(billTotals.grandTotalLak)} ໃນນາມ "${customerName || 'ລູກຄ້າທົ່ວໄປ'}"`
                    : `ຮັບຊຳລະເຕັມຈຳນວນ ${formatLak(billTotals.grandTotalLak)} ຜ່ານຊ່ອງທາງ ${payMode === 'transfer' ? 'ໂອນເງິນຜ່ານທະນາຄານ' : 'QR Payment'}`}
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
                        className="col-span-5 min-h-[42px] px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                      >
                        <option value="cash">ເງິນສົດ</option>
                        <option value="transfer">ໂອນເງິນ</option>
                        <option value="qr">QR Payment</option>
                        <option value="credit">ຄ້າງຊຳລະ (ເຄຣດິດ)</option>
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
                        className="col-span-6 min-h-[42px] px-3 py-2 text-sm border border-slate-200 rounded-lg text-right tabular-nums"
                      />
                      <button
                        type="button"
                        disabled={splitRows.length <= 1}
                        onClick={() => setSplitRows((prev) => prev.filter((_, i) => i !== idx))}
                        className="col-span-1 p-2 text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer"
                        aria-label="ລຶບຊ່ອງທາງ"
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
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      ເພີ່ມຊ່ອງທາງຊຳລະເງິນ
                    </button>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ໝາຍເຫດບິນ (ບໍ່ບັງຄັບ)
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={billNotes}
                  onChange={(e) => setBillNotes(e.target.value)}
                  placeholder="ເຊັ່ນ ເລກທີອ້າງອີງສະລິບໂອນເງິນ ຫຼື ຂໍ້ມູນຈັດສົ່ງ"
                  className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              {/* Payment Received & Change Display */}
              <div
                className={`p-4 rounded-xl border grid grid-cols-2 gap-3 tabular-nums ${
                  computedPaymentSummary.remaining > 0
                    ? 'bg-red-50 border-red-200'
                    : 'bg-green-50 border-green-200'
                }`}
              >
                <div>
                  <span className="text-xs text-slate-600">ຈຳນວນເງິນທີ່ລູກຄ້າຊຳລະ</span>
                  <div className="text-lg font-bold text-slate-900">
                    {formatLak(computedPaymentSummary.covered)}
                  </div>
                </div>
                <div className="text-right">
                  {computedPaymentSummary.remaining > 0 ? (
                    <>
                      <span className="text-xs text-red-600 font-semibold">ຍັງຂາດອີກ</span>
                      <div className="text-lg font-bold text-red-600">
                        {formatLak(computedPaymentSummary.remaining)}
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-green-700 font-semibold">ເງິນທອນ</span>
                      <div className="text-xl font-bold text-green-600">
                        {formatLak(computedPaymentSummary.change)}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setCheckoutOpen(false)}
                  className="min-h-[48px] px-4 py-2.5 text-sm font-medium text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  ກັບໄປແກ້ໄຂ
                </button>
                <button
                  type="submit"
                  disabled={checkoutSaving || computedPaymentSummary.remaining > 0}
                  className="min-h-[48px] flex-1 sm:flex-none px-6 py-2.5 text-sm sm:text-base font-bold text-white bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl cursor-pointer inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>{checkoutSaving ? 'ກຳລັງບັນທຶກການຂາຍ...' : 'ຢືນຢັນການຂາຍ'}</span>
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
          title="ສະແກນບາໂຄ້ດ / QR Code ເພື່ອຂາຍສິນຄ້າ"
          subtitle="ສະແກນລະຫັດສິນຄ້າເພື່ອເພີ່ມໃສ່ກະຕ່າຂາຍໜ້າຮ້ານທັນທີ"
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
              <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-slate-900">
                  ບໍ່ພົບສິນຄ້າໃນລະບົບ ທ່ານຕ້ອງການເພີ່ມສິນຄ້າໃໝ່ຫຼືບໍ່?
                </h3>
                <p className="text-xs text-slate-600">
                  ລະຫັດ / ຄຳຄົ້ນຫາ:{' '}
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
                className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                ຍົກເລີກ
              </button>
              <button
                type="button"
                onClick={() => openQuickAddProduct(notFoundPrompt.query)}
                className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
              >
                <PackagePlus className="w-4 h-4" />
                <span>ເພີ່ມສິນຄ້າໃໝ່</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Product Modal from POS */}
      <QuickAddProductModal
        open={quickAddOpen}
        initialQuery={quickAddInitialQuery}
        initialCategoryId={selectedMainCategoryId}
        categories={mainCategories}
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

      {/* First-time POS Beginner Guide */}
      <PosBeginnerGuideModal
        open={guideOpen}
        onStepChange={setActiveGuideSection}
        onComplete={dismissBeginnerGuide}
        onSkip={dismissBeginnerGuide}
      />
    </div>
  );
}
