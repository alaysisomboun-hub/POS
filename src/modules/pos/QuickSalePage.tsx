import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Minus,
  Plus,
  QrCode,
  ScanBarcode,
  Trash2,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { hasPermission } from '../../core/rbac/permissions';
import { formatLak } from '../../core/utils/money';
import { BarcodeQrScannerModal } from '../../components/scanner/BarcodeQrScannerModal';
import { ReceiptPrintModal } from './ReceiptPrintModal';
import {
  computeBillTotals,
  executePosCheckout,
  getUnitPriceByTier,
  type PosCartItemInput,
} from './posService';
import type {
  InventoryBalance,
  PaymentMethodType,
  Product,
  ProductUnit,
  SaleOrder,
} from '../../core/firebase/types';

interface QuickSaleLine {
  lineKey: string;
  productId: string;
  unitId: string;
  scannedCode: string;
  qty: number;
}

type QuickPaymentMethod = Extract<PaymentMethodType, 'cash' | 'transfer' | 'qr'>;

const QUICK_PAYMENT_METHODS: Array<{
  key: QuickPaymentMethod;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'cash', label: 'ເງິນສົດ', icon: Banknote },
  { key: 'transfer', label: 'ໂອນເງິນ', icon: Wallet },
  { key: 'qr', label: 'QR Pay', icon: QrCode },
];

const QUICK_LAK_AMOUNTS = [10000, 20000, 50000, 100000, 200000, 500000];

export function QuickSalePage() {
  const { userProfile, organization, activeBranchId, settings } = useFirebase();

  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  const checkoutLockRef = useRef(false);
  const processScanRef = useRef<(rawCode: string) => void>(() => {});

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [lines, setLines] = useState<QuickSaleLine[]>([]);
  const [lastScannedKey, setLastScannedKey] = useState<string | null>(null);

  const [payMethod, setPayMethod] = useState<QuickPaymentMethod>('cash');
  const [cashTendered, setCashTendered] = useState<string>('0');
  const [cashManuallyEdited, setCashManuallyEdited] = useState(false);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<SaleOrder | null>(null);

  const canCreateSale =
    hasPermission(userProfile, 'quick_sale', 'create') ||
    hasPermission(userProfile, 'pos', 'create');
  const allowNegativeStock = settings?.inventorySettings?.allowNegativeStock ?? false;

  useEffect(() => {
    if (!userProfile) return;
    const orgId = userProfile.organizationId;

    const unsubProds = onSnapshot(
      query(collection(db, 'products'), where('organizationId', '==', orgId)),
      (snap) => {
        setAllProducts(snap.docs.map((d) => d.data() as Product));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'products'),
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

    return () => {
      unsubProds();
      unsubInv();
    };
  }, [userProfile, activeBranchId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!lastScannedKey) return;
    const timer = window.setTimeout(() => setLastScannedKey(null), 1200);
    return () => window.clearTimeout(timer);
  }, [lastScannedKey]);

  const activeProducts = useMemo(
    () => allProducts.filter((p) => p.status === 'active'),
    [allProducts],
  );

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    activeProducts.forEach((p) => map.set(p.productId, p));
    return map;
  }, [activeProducts]);

  const balanceMap = useMemo(() => {
    const map = new Map<string, number>();
    balances.forEach((b) => map.set(b.productId, b.qtyOnHandBase));
    return map;
  }, [balances]);

  const resolvedCartInputs = useMemo<PosCartItemInput[]>(() => {
    const list: PosCartItemInput[] = [];
    for (const line of lines) {
      const prod = productMap.get(line.productId);
      if (!prod) continue;
      const unit = prod.units.find((u) => u.unitId === line.unitId) ?? prod.units[0];
      if (!unit) continue;
      list.push({
        product: prod,
        unit,
        qty: line.qty,
        unitPriceLak: getUnitPriceByTier(unit, 'retail'),
        discountLak: 0,
      });
    }
    return list;
  }, [lines, productMap]);

  const billTotals = useMemo(
    () =>
      computeBillTotals({
        cartItems: resolvedCartInputs,
        billDiscountLak: 0,
        taxSettings: settings?.taxSettings ?? null,
        roundingMode: settings?.currencySettings?.roundingMode ?? 'integer',
      }),
    [resolvedCartInputs, settings],
  );

  const totalUnitsCount = useMemo(
    () => lines.reduce((sum, line) => sum + line.qty, 0),
    [lines],
  );

  useEffect(() => {
    if (lines.length === 0) {
      setCashTendered('0');
      setCashManuallyEdited(false);
      return;
    }
    if (payMethod === 'cash' && !cashManuallyEdited) {
      setCashTendered(String(billTotals.grandTotalLak));
    }
  }, [billTotals.grandTotalLak, lines.length, payMethod, cashManuallyEdited]);

  const getCartBaseQtyForProduct = (productId: string, sourceLines: QuickSaleLine[]): number => {
    const prod = productMap.get(productId);
    if (!prod) return 0;
    return sourceLines
      .filter((l) => l.productId === productId)
      .reduce((sum, l) => {
        const unit = prod.units.find((u) => u.unitId === l.unitId) ?? prod.units[0];
        return sum + l.qty * Math.max(1, unit?.conversionFactor ?? 1);
      }, 0);
  };

  const addScannedLine = (prod: Product, unit: ProductUnit, scannedCode: string) => {
    const stockBase = balanceMap.get(prod.productId) ?? 0;
    const currentBase = getCartBaseQtyForProduct(prod.productId, lines);
    const neededBase = currentBase + Math.max(1, unit.conversionFactor);

    if (!allowNegativeStock && stockBase < neededBase) {
      setFeedback({
        type: 'err',
        text: `ສິນຄ້າ "${prod.name}" ຄົງເຫຼືອ ${stockBase.toLocaleString('en-US')} ${prod.baseUnitName} ບໍ່ພໍຂາຍ`,
      });
      return;
    }

    const existing = lines.find(
      (l) => l.productId === prod.productId && l.unitId === unit.unitId,
    );
    const key = existing ? existing.lineKey : `${prod.productId}_${unit.unitId}_${Date.now()}`;

    setLines((prev) => {
      const idx = prev.findIndex(
        (l) => l.productId === prod.productId && l.unitId === unit.unitId,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          lineKey: key,
          productId: prod.productId,
          unitId: unit.unitId,
          scannedCode,
          qty: 1,
        },
      ];
    });

    setLastScannedKey(key);
    const unitPrice = getUnitPriceByTier(unit, 'retail');
    setFeedback({
      type: 'ok',
      text: `${prod.name} (${unit.unitName}) · ${formatLak(unitPrice)}`,
    });
  };

  const processScannedBarcode = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) {
      barcodeInputRef.current?.focus();
      return;
    }
    const lower = code.toLowerCase();

    for (const prod of activeProducts) {
      const matchedUnit = prod.units.find(
        (u) => u.barcode.trim() !== '' && u.barcode.trim().toLowerCase() === lower,
      );
      if (matchedUnit) {
        addScannedLine(prod, matchedUnit, code);
        setBarcodeInput('');
        barcodeInputRef.current?.focus();
        return;
      }

      const matchesMainCode =
        (prod.barcode.trim() !== '' && prod.barcode.trim().toLowerCase() === lower) ||
        (prod.sku.trim() !== '' && prod.sku.trim().toLowerCase() === lower) ||
        prod.barcodes.some((bc) => bc.trim() !== '' && bc.trim().toLowerCase() === lower);

      if (matchesMainCode) {
        const baseUnit = prod.units.find((u) => u.isBaseUnit) ?? prod.units[0];
        if (baseUnit) {
          addScannedLine(prod, baseUnit, code);
          setBarcodeInput('');
          barcodeInputRef.current?.focus();
          return;
        }
      }
    }

    const inactiveMatch = allProducts.find(
      (p) =>
        p.status === 'inactive' &&
        (p.barcode.trim().toLowerCase() === lower ||
          p.sku.trim().toLowerCase() === lower ||
          p.barcodes.some((bc) => bc.trim().toLowerCase() === lower) ||
          p.units.some((u) => u.barcode.trim().toLowerCase() === lower)),
    );

    if (inactiveMatch) {
      setFeedback({
        type: 'err',
        text: `ພົບສິນຄ້າ "${inactiveMatch.name}" (${code}) ແຕ່ຢູ່ໃນສະຖານະຢຸດຂາຍຊົ່ວຄາວ`,
      });
    } else {
      setFeedback({
        type: 'err',
        text: `ບໍ່ພົບສິນຄ້າລະຫັດ "${code}" ໃນລະບົບ`,
      });
    }

    setBarcodeInput('');
    barcodeInputRef.current?.focus();
  };

  processScanRef.current = processScannedBarcode;

  // Global USB / Bluetooth HID barcode scanner listener when focus is outside numeric/other inputs
  useEffect(() => {
    if (scannerOpen || Boolean(completedSale)) return;

    let buffer = '';
    let lastTime = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      if (active === barcodeInputRef.current) return;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT')
      ) {
        return;
      }

      const now = Date.now();
      if (now - lastTime > 70) {
        buffer = '';
      }
      lastTime = now;

      if (e.key === 'Enter') {
        if (buffer.trim().length >= 3) {
          e.preventDefault();
          const scanned = buffer.trim();
          buffer = '';
          processScanRef.current(scanned);
        } else {
          buffer = '';
        }
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [scannerOpen, completedSale]);

  const handleBarcodeFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processScannedBarcode(barcodeInput);
  };

  const updateLineQty = (lineKey: string, nextQty: number) => {
    const safeQty = Math.max(1, Math.round(nextQty));
    const target = lines.find((l) => l.lineKey === lineKey);
    if (!target) return;
    const prod = productMap.get(target.productId);
    if (!prod) return;

    const simulated = lines.map((l) => (l.lineKey === lineKey ? { ...l, qty: safeQty } : l));
    const neededBase = getCartBaseQtyForProduct(prod.productId, simulated);
    const stockBase = balanceMap.get(prod.productId) ?? 0;

    if (!allowNegativeStock && stockBase < neededBase) {
      setFeedback({
        type: 'err',
        text: `ສິນຄ້າ "${prod.name}" ຄົງເຫຼືອ ${stockBase.toLocaleString('en-US')} ${prod.baseUnitName}`,
      });
      return;
    }

    setFeedback(null);
    setLines(simulated);
  };

  const removeLine = (lineKey: string) => {
    setLines((prev) => prev.filter((l) => l.lineKey !== lineKey));
    barcodeInputRef.current?.focus();
  };

  const clearAllLines = () => {
    setLines([]);
    setCashTendered('0');
    setCashManuallyEdited(false);
    setFeedback(null);
    barcodeInputRef.current?.focus();
  };

  const paymentSummary = useMemo(() => {
    const total = billTotals.grandTotalLak;
    if (payMethod === 'cash') {
      const tendered = Math.max(0, Math.round(Number(cashTendered) || 0));
      return {
        tendered,
        change: Math.max(0, tendered - total),
        remaining: Math.max(0, total - tendered),
      };
    }
    return {
      tendered: total,
      change: 0,
      remaining: 0,
    };
  }, [payMethod, cashTendered, billTotals.grandTotalLak]);

  const handleCheckout = async () => {
    if (!userProfile || !canCreateSale || lines.length === 0 || checkoutLockRef.current) return;

    if (paymentSummary.remaining > 0) {
      setFeedback({
        type: 'err',
        text: `ຍອດເງິນທີ່ຮັບມາຍັງຂາດອີກ ${formatLak(paymentSummary.remaining)}`,
      });
      return;
    }

    checkoutLockRef.current = true;
    setSaving(true);
    setFeedback(null);

    try {
      const created = await executePosCheckout({
        db,
        user: userProfile,
        branchId: activeBranchId,
        priceTier: 'retail',
        customerId: null,
        customerName: 'ລູກຄ້າທົ່ວໄປ',
        membershipTier: null,
        cartItems: resolvedCartInputs,
        billDiscountLak: 0,
        taxSettings: settings?.taxSettings ?? null,
        roundingMode: settings?.currencySettings?.roundingMode ?? 'integer',
        invoicePrefix: settings?.receiptSettings?.prefix ?? 'INV',
        allowNegativeStock,
        paymentMethod: payMethod,
        payments: [{ method: payMethod, amountLak: paymentSummary.tendered }],
        notes: 'ຂາຍດ່ວນ (Quick Sale)',
        heldBillId: null,
      });

      setLines([]);
      setCashTendered('0');
      setCashManuallyEdited(false);
      setCompletedSale(created);
      setFeedback({
        type: 'ok',
        text: `ຊຳລະເງິນສຳເລັດ · ເລກທີ ${created.invoiceNumber} (${formatLak(created.grandTotalLak)})`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ບໍ່ສາມາດບັນທຶກການຂາຍໄດ້ ກະລຸນາລອງໃໝ່',
      });
    } finally {
      checkoutLockRef.current = false;
      setSaving(false);
      barcodeInputRef.current?.focus();
    }
  };

  return (
    <div className="space-y-4">
      {/* Barcode Scan Input Bar */}
      <section className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                ຂາຍດ່ວນ (ສະແກນບາໂຄ້ດ)
              </h2>
              <p className="text-xs text-slate-500">
                ຍິງບາໂຄ້ດເພື່ອເພີ່ມສິນຄ້າອັດຕະໂນມັດ ຫາກສະແກນລະຫັດເດີມຊ້ຳຈະເພີ່ມຈຳນວນ +1 ທັນທີ
              </p>
            </div>
          </div>

          {lines.length > 0 && (
            <button
              type="button"
              onClick={clearAllLines}
              className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-white border border-red-200 hover:bg-red-50 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>ລ້າງລາຍການທັງໝົດ</span>
            </button>
          )}
        </div>

        <form onSubmit={handleBarcodeFormSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <ScanBarcode className="w-5 h-5 text-blue-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={barcodeInputRef}
              type="text"
              autoFocus
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="ສະແກນບາໂຄ້ດ ຫຼື ພິມລະຫັດສິນຄ້າແລ້ວກົດ Enter..."
              className="w-full min-h-[50px] pl-11 pr-10 py-2.5 text-base font-mono bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
            {barcodeInput && (
              <button
                type="button"
                onClick={() => {
                  setBarcodeInput('');
                  barcodeInputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="ລ້າງຊ່ອງບາໂຄ້ດ"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            type="submit"
            className="min-h-[50px] px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0"
          >
            <ScanBarcode className="w-4 h-4 shrink-0" />
            <span>ເພີ່ມດ້ວຍບາໂຄ້ດ</span>
          </button>

          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="min-h-[50px] px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap shrink-0"
          >
            <QrCode className="w-4 h-4 shrink-0" />
            <span>ສະແກນກ້ອງ</span>
          </button>
        </form>

        {feedback && (
          <div
            className={`p-3 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-2 ${
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
              onClick={() => {
                setFeedback(null);
                barcodeInputRef.current?.focus();
              }}
              className="p-1 text-current opacity-70 hover:opacity-100 cursor-pointer"
              aria-label="ປິດຂໍ້ຄວາມແຈ້ງເຕືອນ"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </section>

      {/* Main Layout: Scanned Items Table + Checkout Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Scanned Items List (No images, no cards, no product grid) */}
        <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">ລາຍການຂາຍ</h3>
            <span className="text-xs text-slate-500 tabular-nums">
              {lines.length} ລາຍການ · {totalUnitsCount.toLocaleString('en-US')} ອັນ
            </span>
          </div>

          {lines.length === 0 ? (
            <div className="py-16 px-6 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <ScanBarcode className="w-6 h-6" />
              </div>
              <div className="text-sm font-semibold text-slate-700">
                ພ້ອມສະແກນບາໂຄ້ດແລ້ວ
              </div>
              <p className="text-xs text-slate-500">
                ກະລຸນາສະແກນບາໂຄ້ດສິນຄ້າ ລະບົບຈະສະແດງຊື່ສິນຄ້າ ລາຄາ ແລະ ຄຳນວນຍອດລວມອັດຕະໂນມັດ
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">ລະຫັດສິນຄ້າ</th>
                    <th className="py-3 px-4">ຊື່ສິນຄ້າ</th>
                    <th className="py-3 px-4 text-right">ລາຄາຂາຍຕໍ່ໜ່ວຍ</th>
                    <th className="py-3 px-4 text-center">ຈຳນວນສິນຄ້າ</th>
                    <th className="py-3 px-4 text-right">ລາຄາລວມ</th>
                    <th className="py-3 px-3 text-center">ລຶບ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {lines.map((line, index) => {
                    const prod = productMap.get(line.productId);
                    const computedItem = billTotals.items[index];
                    if (!prod || !computedItem) return null;
                    const isHighlighted = line.lineKey === lastScannedKey;

                    return (
                      <tr
                        key={line.lineKey}
                        className={`transition-colors ${
                          isHighlighted ? 'bg-blue-50/70' : 'hover:bg-slate-50/70'
                        }`}
                      >
                        <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                          {line.scannedCode || prod.barcode || prod.sku}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{prod.name}</div>
                          <div className="text-xs text-slate-500">
                            ໜ່ວຍ: {computedItem.unitName}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-slate-800 tabular-nums whitespace-nowrap">
                          {formatLak(computedItem.unitPriceLak)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white mx-auto">
                            <button
                              type="button"
                              onClick={() =>
                                line.qty > 1
                                  ? updateLineQty(line.lineKey, line.qty - 1)
                                  : removeLine(line.lineKey)
                              }
                              className="w-8 h-9 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
                              aria-label="ຫຼຸດຈຳນວນ"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={line.qty}
                              onChange={(e) =>
                                updateLineQty(line.lineKey, Number(e.target.value) || 1)
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  barcodeInputRef.current?.focus();
                                }
                              }}
                              className="w-14 text-center text-sm font-bold text-slate-900 tabular-nums focus:outline-none"
                              aria-label="ຈຳນວນສິນຄ້າ"
                            />
                            <button
                              type="button"
                              onClick={() => updateLineQty(line.lineKey, line.qty + 1)}
                              className="w-8 h-9 flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
                              aria-label="ເພີ່ມຈຳນວນ"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-blue-600 tabular-nums whitespace-nowrap">
                          {formatLak(computedItem.lineTotalLak)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => removeLine(line.lineKey)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                            title="ລຶບລາຍການ"
                            aria-label="ລຶບລາຍການ"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right Summary & Instant Payment Column */}
        <section className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4 lg:sticky lg:top-20">
          <div className="space-y-1 pb-3 border-b border-slate-200">
            <div className="text-xs font-medium text-slate-500">ຍອດລວມທັງໝົດ</div>
            <div className="text-3xl font-bold text-blue-600 tabular-nums">
              {formatLak(billTotals.grandTotalLak)}
            </div>
            {billTotals.taxAmountLak > 0 && (
              <div className="text-xs text-slate-500 tabular-nums">
                ລວມອາກອນ ({billTotals.taxRate}%): {formatLak(billTotals.taxAmountLak)}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700">ຊ່ອງທາງຊຳລະເງິນ</div>
            <div className="grid grid-cols-3 gap-1.5">
              {QUICK_PAYMENT_METHODS.map((pm) => {
                const Icon = pm.icon;
                const active = payMethod === pm.key;
                return (
                  <button
                    key={pm.key}
                    type="button"
                    onClick={() => setPayMethod(pm.key)}
                    className={`min-h-[46px] px-2 py-2 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{pm.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {payMethod === 'cash' && (
            <div className="space-y-2.5 pt-1 tabular-nums">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  ເງິນທີ່ຮັບຈາກລູກຄ້າ (₭)
                </label>
                <input
                  type="number"
                  min={0}
                  value={cashTendered}
                  onChange={(e) => {
                    setCashManuallyEdited(true);
                    setCashTendered(e.target.value);
                  }}
                  className="w-full min-h-[44px] px-3 py-2 text-lg font-bold bg-slate-50 border border-slate-200 rounded-xl text-right text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setCashManuallyEdited(false);
                    setCashTendered(String(billTotals.grandTotalLak));
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg cursor-pointer"
                >
                  ຮັບພໍດີ
                </button>
                {QUICK_LAK_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setCashManuallyEdited(true);
                      setCashTendered(String(amt));
                    }}
                    className="px-2.5 py-1.5 text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg cursor-pointer"
                  >
                    {amt.toLocaleString('en-US')}
                  </button>
                ))}
              </div>

              <div
                className={`p-3 rounded-xl border flex items-center justify-between ${
                  paymentSummary.remaining > 0
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-green-50 border-green-200 text-green-700'
                }`}
              >
                <span className="text-xs font-semibold">
                  {paymentSummary.remaining > 0 ? 'ຍັງຂາດອີກ' : 'ເງິນທອນ'}
                </span>
                <span className="text-lg font-bold">
                  {paymentSummary.remaining > 0
                    ? formatLak(paymentSummary.remaining)
                    : formatLak(paymentSummary.change)}
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={
              !canCreateSale ||
              lines.length === 0 ||
              saving ||
              paymentSummary.remaining > 0
            }
            onClick={handleCheckout}
            className="w-full min-h-[54px] px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded-xl font-bold text-base transition-colors cursor-pointer flex items-center justify-center gap-2 tabular-nums"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>
              {saving
                ? 'ກຳລັງບັນທຶກການຂາຍ...'
                : `ຊຳລະເງິນ · ${formatLak(billTotals.grandTotalLak)}`}
            </span>
          </button>
        </section>
      </div>

      {scannerOpen && (
        <BarcodeQrScannerModal
          title="ສະແກນບາໂຄ້ດ / QR Code (ຂາຍດ່ວນ)"
          subtitle="ສະແກນລະຫັດສິນຄ້າເພື່ອເພີ່ມເຂົ້າລາຍການຂາຍດ່ວນທັນທີ"
          onDetected={(code) => {
            setScannerOpen(false);
            processScannedBarcode(code);
          }}
          onClose={() => {
            setScannerOpen(false);
            window.setTimeout(() => barcodeInputRef.current?.focus(), 60);
          }}
        />
      )}

      {completedSale && (
        <ReceiptPrintModal
          sale={completedSale}
          settings={settings}
          storeName={organization?.name ?? 'Grocery POS'}
          onClose={() => {
            setCompletedSale(null);
            window.setTimeout(() => barcodeInputRef.current?.focus(), 60);
          }}
        />
      )}
    </div>
  );
}
