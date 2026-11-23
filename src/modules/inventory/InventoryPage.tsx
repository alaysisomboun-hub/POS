import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  History,
  MapPin,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { appendAuditLogToBatch } from '../../core/firebase/auditService';
import { hasPermission } from '../../core/rbac/permissions';
import { formatDateTimeVientiane, formatDateVientiane } from '../../core/utils/date';
import { generateSafeId } from '../../core/utils/id';
import { formatLak } from '../../core/utils/money';
import { StockInPage } from './StockInPage';
import { StockOutPage } from './StockOutPage';
import {
  executeStockCountAdjustment,
  formatMultiUnitBreakdown,
} from './stockService';
import type {
  InventoryBalance,
  InventoryLot,
  Product,
  StockMovement,
  StockMovementType,
  StorageLocation,
  StorageZoneType,
} from '../../core/firebase/types';

type InventoryTab = 'balances' | 'stock_in' | 'stock_out' | 'lots' | 'count' | 'ledger' | 'locations';

const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  initial: 'ຍອດຍົກມາ',
  stock_in: 'ຮັບສິນຄ້າເຂົ້າ',
  stock_out: 'ເບີກອອກ',
  damaged: 'ເສຍຫາຍ',
  expired: 'ໝົດອາຍຸ',
  lost: 'ສູນຫາຍ',
  adjustment_in: 'ປັບເພີ່ມ (ກວດນັບ)',
  adjustment_out: 'ປັບຫຼຸດ (ກວດນັບ)',
  sale: 'ຂາຍໜ້າຮ້ານ POS',
  sale_return: 'ຮັບຄືນສິນຄ້າ (POS)',
  sale_void: 'ຍົກເລີກບິນຂາຍ (POS)',
};

const ZONE_LABELS: Record<StorageZoneType, string> = {
  shelf: 'ຊັ້ນວາງໜ້າຮ້ານ',
  warehouse: 'ສາງສິນຄ້າຫຼັງຮ້ານ',
  cooler: 'ຕູ້ແຊ່ເຢັນ',
  freezer: 'ຕູ້ແຊ່ແຂງ',
  counter: 'ເຄົາເຕີຂາຍ',
};

export function InventoryPage() {
  const { userProfile, activeBranchId, settings } = useFirebase();
  const [activeTab, setActiveTab] = useState<InventoryTab>('balances');

  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [locations, setLocations] = useState<StorageLocation[]>([]);

  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
  const [lotFilter, setLotFilter] = useState<'active' | 'expiring' | 'all'>('active');

  // Stock Count State
  const [countProductId, setCountProductId] = useState('');
  const [countUnitId, setCountUnitId] = useState('');
  const [countQty, setCountQty] = useState('0');
  const [countReason, setCountReason] = useState('');
  const [countSaving, setCountSaving] = useState(false);
  const [countMessage, setCountMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );

  // Storage Location Modal State
  const [locModalOpen, setLocModalOpen] = useState(false);
  const [editingLoc, setEditingLoc] = useState<StorageLocation | null>(null);
  const [locCode, setLocCode] = useState('');
  const [locName, setLocName] = useState('');
  const [locZone, setLocZone] = useState<StorageZoneType>('shelf');
  const [locDesc, setLocDesc] = useState('');
  const [locStatus, setLocStatus] = useState<'active' | 'inactive'>('active');
  const [locSaving, setLocSaving] = useState(false);
  const locSavingRef = useRef(false);
  const countSavingRef = useRef(false);
  const [locError, setLocError] = useState<string | null>(null);

  const canEditInventory = hasPermission(userProfile, 'inventory', 'edit');
  const canStockIn = hasPermission(userProfile, 'stock_in', 'view');
  const canStockOut = hasPermission(userProfile, 'stock_out', 'view');

  useEffect(() => {
    if (!userProfile) return;
    const orgId = userProfile.organizationId;

    const unsubProds = onSnapshot(
      query(collection(db, 'products'), where('organizationId', '==', orgId)),
      (snap) => setProducts(snap.docs.map((d) => d.data() as Product)),
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

    const unsubLots = onSnapshot(
      query(
        collection(db, 'inventoryLots'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
      ),
      (snap) => setLots(snap.docs.map((d) => d.data() as InventoryLot)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'inventoryLots'),
    );

    const unsubMov = onSnapshot(
      query(
        collection(db, 'stockMovements'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
        orderBy('createdAt', 'desc'),
        limit(80),
      ),
      (snap) => setMovements(snap.docs.map((d) => d.data() as StockMovement)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'stockMovements'),
    );

    const unsubLocs = onSnapshot(
      query(collection(db, 'storageLocations'), where('organizationId', '==', orgId)),
      (snap) =>
        setLocations(
          snap.docs
            .map((d) => d.data() as StorageLocation)
            .sort((a, b) => a.code.localeCompare(b.code)),
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'storageLocations'),
    );

    return () => {
      unsubProds();
      unsubInv();
      unsubLots();
      unsubMov();
      unsubLocs();
    };
  }, [userProfile, activeBranchId]);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.productId, p));
    return map;
  }, [products]);

  const balanceMap = useMemo(() => {
    const map = new Map<string, InventoryBalance>();
    balances.forEach((b) => map.set(b.productId, b));
    return map;
  }, [balances]);

  const kpiSummary = useMemo(() => {
    let totalSkus = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let totalValueLak = 0;

    for (const prod of products) {
      if (prod.status !== 'active') continue;
      totalSkus += 1;
      const bal = balanceMap.get(prod.productId);
      const qty = bal?.qtyOnHandBase ?? 0;
      const avgCost = bal?.avgCostLak ?? prod.costPriceLak;
      if (qty <= 0) outOfStockCount += 1;
      else if (qty <= prod.minStockBaseQty) lowStockCount += 1;
      if (qty > 0) totalValueLak += Math.round(qty * avgCost);
    }

    return { totalSkus, lowStockCount, outOfStockCount, totalValueLak };
  }, [products, balanceMap]);

  const filteredBalanceRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => p.status === 'active')
      .map((p) => {
        const bal = balanceMap.get(p.productId);
        return {
          product: p,
          qtyBase: bal?.qtyOnHandBase ?? 0,
          avgCost: bal?.avgCostLak ?? p.costPriceLak,
          lastMovementAt: bal?.lastMovementAt ?? p.updatedAt,
        };
      })
      .filter((row) => {
        if (stockFilter === 'out' && row.qtyBase > 0) return false;
        if (
          stockFilter === 'low' &&
          (row.qtyBase <= 0 || row.qtyBase > row.product.minStockBaseQty)
        ) {
          return false;
        }
        if (!q) return true;
        return (
          row.product.name.toLowerCase().includes(q) ||
          row.product.sku.toLowerCase().includes(q) ||
          row.product.barcode.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.qtyBase - b.qtyBase);
  }, [products, balanceMap, search, stockFilter]);

  const expiryWarningDays = settings?.notificationSettings?.expiryWarningDays ?? 30;

  const lotRows = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const warnDate = new Date(now.getTime() + expiryWarningDays * 86400000)
      .toISOString()
      .slice(0, 10);

    const q = search.trim().toLowerCase();
    return lots
      .map((lot) => {
        let expiryStatus: 'normal' | 'warning' | 'expired' = 'normal';
        if (lot.expiryDate) {
          if (lot.expiryDate < todayStr) expiryStatus = 'expired';
          else if (lot.expiryDate <= warnDate) expiryStatus = 'warning';
        }
        return { lot, expiryStatus };
      })
      .filter(({ lot, expiryStatus }) => {
        if (lotFilter === 'active' && (lot.status !== 'active' || lot.remainingQtyBase <= 0)) {
          return false;
        }
        if (
          lotFilter === 'expiring' &&
          (lot.remainingQtyBase <= 0 || expiryStatus === 'normal')
        ) {
          return false;
        }
        if (!q) return true;
        return (
          lot.productNameSnapshot.toLowerCase().includes(q) ||
          lot.skuSnapshot.toLowerCase().includes(q) ||
          lot.lotNumber.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.lot.expiryDate && b.lot.expiryDate) {
          return a.lot.expiryDate.localeCompare(b.lot.expiryDate);
        }
        if (a.lot.expiryDate) return -1;
        if (b.lot.expiryDate) return 1;
        return (b.lot.receivedAt?.toMillis?.() ?? 0) - (a.lot.receivedAt?.toMillis?.() ?? 0);
      });
  }, [lots, lotFilter, search, expiryWarningDays]);

  const selectedCountProduct = useMemo(
    () => products.find((p) => p.productId === countProductId) ?? null,
    [products, countProductId],
  );

  const selectedCountUnit = useMemo(() => {
    if (!selectedCountProduct) return null;
    return (
      selectedCountProduct.units.find((u) => u.unitId === countUnitId) ??
      selectedCountProduct.units[0] ??
      null
    );
  }, [selectedCountProduct, countUnitId]);

  const handleSelectCountProduct = (prodId: string) => {
    setCountProductId(prodId);
    const prod = products.find((p) => p.productId === prodId);
    if (prod) {
      setCountUnitId(prod.units[0]?.unitId ?? '');
      const currentBase = balanceMap.get(prod.productId)?.qtyOnHandBase ?? 0;
      setCountQty(String(currentBase));
    }
    setCountMessage(null);
  };

  const handleApplyStockCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !selectedCountProduct || !selectedCountUnit || countSavingRef.current) return;

    const countedBase = Math.round(
      (Number(countQty) || 0) * Math.max(1, selectedCountUnit.conversionFactor),
    );

    countSavingRef.current = true;
    setCountSaving(true);
    setCountMessage(null);

    try {
      await executeStockCountAdjustment({
        db,
        user: userProfile,
        branchId: activeBranchId,
        product: selectedCountProduct,
        countedBaseQty: countedBase,
        reason: countReason || 'ປັບຍອດຈາກການກວດນັບສະຕ໋ອກຈິງ',
      });
      setCountMessage({
        type: 'ok',
        text: `ປັບປຸງຍອດຄົງເຫຼືອ "${selectedCountProduct.name}" ເປັນ ${countedBase.toLocaleString('en-US')} ${selectedCountProduct.baseUnitName} ສຳເລັດແລ້ວ`,
      });
      setCountReason('');
    } catch (err) {
      setCountMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'ບໍ່ສາມາດປັບປຸງຍອດກວດນັບໄດ້',
      });
    } finally {
      countSavingRef.current = false;
      setCountSaving(false);
    }
  };

  const openCreateLocationModal = () => {
    setEditingLoc(null);
    setLocCode('');
    setLocName('');
    setLocZone('shelf');
    setLocDesc('');
    setLocStatus('active');
    setLocError(null);
    setLocModalOpen(true);
  };

  const openEditLocationModal = (loc: StorageLocation) => {
    setEditingLoc(loc);
    setLocCode(loc.code);
    setLocName(loc.name);
    setLocZone(loc.zoneType);
    setLocDesc(loc.description || '');
    setLocStatus(loc.status);
    setLocError(null);
    setLocModalOpen(true);
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || locSavingRef.current) return;

    const cleanCode = locCode.trim().toUpperCase().slice(0, 30);
    const cleanName = locName.trim().slice(0, 100);
    if (!cleanCode || !cleanName) {
      setLocError('ກະລຸນາປ້ອນລະຫັດຕຳແໜ່ງ ແລະ ຊື່ຕຳແໜ່ງຈັດເກັບ');
      return;
    }

    locSavingRef.current = true;
    setLocSaving(true);
    setLocError(null);

    try {
      const batch = writeBatch(db);
      if (editingLoc) {
        batch.update(doc(db, 'storageLocations', editingLoc.locationId), {
          code: cleanCode,
          name: cleanName,
          zoneType: locZone,
          description: locDesc.trim().slice(0, 200),
          status: locStatus,
          updatedAt: serverTimestamp(),
        });

        appendAuditLogToBatch(batch, {
          user: userProfile,
          branchId: activeBranchId,
          action: 'UPDATE_STORAGE_LOCATION',
          entityType: 'storageLocations',
          entityId: editingLoc.locationId,
          before: { code: editingLoc.code, name: editingLoc.name },
          after: { code: cleanCode, name: cleanName, zoneType: locZone },
        });
      } else {
        const locationId = generateSafeId('loc');
        batch.set(doc(db, 'storageLocations', locationId), {
          locationId,
          organizationId: userProfile.organizationId,
          branchId: activeBranchId,
          ownerUid: userProfile.ownerUid,
          code: cleanCode,
          name: cleanName,
          zoneType: locZone,
          description: locDesc.trim().slice(0, 200),
          status: locStatus,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        appendAuditLogToBatch(batch, {
          user: userProfile,
          branchId: activeBranchId,
          action: 'CREATE_STORAGE_LOCATION',
          entityType: 'storageLocations',
          entityId: locationId,
          before: null,
          after: { code: cleanCode, name: cleanName, zoneType: locZone },
        });
      }
      await batch.commit();
      setLocModalOpen(false);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, 'storageLocations');
      } catch (wrapped) {
        setLocError(wrapped instanceof Error ? wrapped.message : 'ບໍ່ສາມາດບັນທຶກຕຳແໜ່ງຈັດເກັບໄດ້');
      }
    } finally {
      locSavingRef.current = false;
      setLocSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">ສິນຄ້າເປີດຂາຍທັງໝົດ</div>
          <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
            {kpiSummary.totalSkus.toLocaleString('en-US')} ລາຍການ
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">ໃກ້ໝົດ (ຕ່ຳກວ່າຈຸດສັ່ງຊື້)</div>
          <div className="text-xl font-bold text-amber-600 mt-1 tabular-nums">
            {kpiSummary.lowStockCount.toLocaleString('en-US')} ລາຍການ
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">ສິນຄ້າໝົດສະຕ໋ອກ</div>
          <div className="text-xl font-bold text-red-600 mt-1 tabular-nums">
            {kpiSummary.outOfStockCount.toLocaleString('en-US')} ລາຍການ
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">ມູນຄ່າສາງສິນຄ້າ (WAC)</div>
          <div className="text-xl font-bold text-blue-700 mt-1 tabular-nums">
            {formatLak(kpiSummary.totalValueLak)}
          </div>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
          {(
            [
              { key: 'balances', label: 'ຍອດຄົງເຫຼືອ', icon: Boxes, visible: true },
              { key: 'stock_in', label: 'ຮັບສິນຄ້າເຂົ້າ', icon: PackagePlus, visible: canStockIn },
              { key: 'stock_out', label: 'ເບີກ/ຕັດສະຕ໋ອກ', icon: PackageMinus, visible: canStockOut },
              { key: 'lots', label: 'ລ໋ອດ & ໝົດອາຍຸ', icon: AlertTriangle, visible: true },
              { key: 'count', label: 'ກວດນັບສະຕ໋ອກ', icon: ClipboardCheck, visible: true },
              { key: 'ledger', label: 'ປະຫວັດເຄື່ອນໄຫວ', icon: History, visible: true },
              { key: 'locations', label: 'ຕຳແໜ່ງຈັດເກັບ', icon: MapPin, visible: true },
            ] as const
          )
            .filter((t) => t.visible)
            .map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === t.key
                      ? 'bg-white text-blue-700 font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
        </div>

        {(activeTab === 'balances' || activeTab === 'lots') && (
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ຄົ້ນຫາສິນຄ້າ SKU ຫຼື ເລກລ໋ອດ..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>
        )}
      </div>

      {activeTab === 'stock_in' && <StockInPage />}
      {activeTab === 'stock_out' && <StockOutPage />}

      {/* TAB 1: Stock Balances */}
      {activeTab === 'balances' && (
        <div className="space-y-3">
          <div className="inline-flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg">
            {(
              [
                { key: 'all', label: 'ທັງໝົດ' },
                { key: 'low', label: 'ໃກ້ໝົດ' },
                { key: 'out', label: 'ໝົດສະຕ໋ອກ' },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setStockFilter(f.key)}
                className={`px-3 py-1 text-xs font-medium rounded cursor-pointer ${
                  stockFilter === f.key
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">ສິນຄ້າ / SKU</th>
                  <th className="py-3 px-4">ຕຳແໜ່ງຈັດເກັບ</th>
                  <th className="py-3 px-4 text-right">ຄົງເຫຼືອ (ແຍກໜ່ວຍ)</th>
                  <th className="py-3 px-4 text-right">ໜ່ວຍພື້ນຖານ</th>
                  <th className="py-3 px-4 text-right">ຈຸດເຕືອນຕ່ຳ</th>
                  <th className="py-3 px-4 text-right">ຕົ້ນທຶນ WAC</th>
                  <th className="py-3 px-4 text-right">ມູນຄ່າລວມ</th>
                  <th className="py-3 px-4">ສະຖານະ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredBalanceRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-sm text-slate-500">
                      ບໍ່ພົບຂໍ້ມູນສະຕ໋ອກສິນຄ້າ
                    </td>
                  </tr>
                )}
                {filteredBalanceRows.map(({ product, qtyBase, avgCost }) => {
                  const isOut = qtyBase <= 0;
                  const isLow = !isOut && qtyBase <= product.minStockBaseQty;
                  const value = qtyBase > 0 ? Math.round(qtyBase * avgCost) : 0;
                  return (
                    <tr key={product.productId} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{product.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{product.sku}</div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {product.storageLocationName || '-'}
                      </td>
                      <td className="py-3 px-4 text-right text-xs font-semibold text-slate-900 tabular-nums">
                        {formatMultiUnitBreakdown(qtyBase, product.units, product.baseUnitName)}
                      </td>
                      <td className="py-3 px-4 text-right text-xs text-slate-600 tabular-nums">
                        {qtyBase.toLocaleString('en-US')} {product.baseUnitName}
                      </td>
                      <td className="py-3 px-4 text-right text-xs text-slate-500 tabular-nums">
                        {product.minStockBaseQty.toLocaleString('en-US')}
                      </td>
                      <td className="py-3 px-4 text-right text-xs text-slate-700 tabular-nums">
                        {formatLak(avgCost)}
                      </td>
                      <td className="py-3 px-4 text-right text-xs font-semibold text-slate-900 tabular-nums">
                        {formatLak(value)}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium">
                        {isOut ? (
                          <span className="text-red-600">ໝົດສະຕ໋ອກ</span>
                        ) : isLow ? (
                          <span className="text-amber-600">ໃກ້ໝົດ</span>
                        ) : (
                          <span className="text-green-700">ປົກກະຕິ</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Lots & Expiry */}
      {activeTab === 'lots' && (
        <div className="space-y-3">
          <div className="inline-flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg">
            {(
              [
                { key: 'active', label: 'ລ໋ອດທີ່ມີຍອດຄົງເຫຼືອ' },
                { key: 'expiring', label: `ໃກ້ໝົດອາຍຸ / ໝົດອາຍຸ (≤ ${expiryWarningDays} ວັນ)` },
                { key: 'all', label: 'ລ໋ອດທັງໝົດ' },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setLotFilter(f.key)}
                className={`px-3 py-1 text-xs font-medium rounded cursor-pointer ${
                  lotFilter === f.key
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">ເລກລ໋ອດ (Lot No.)</th>
                  <th className="py-3 px-4">ສິນຄ້າ</th>
                  <th className="py-3 px-4">ວັນໝົດອາຍຸ</th>
                  <th className="py-3 px-4 text-right">ຮັບເຂົ້າ</th>
                  <th className="py-3 px-4 text-right">ຄົງເຫຼືອ</th>
                  <th className="py-3 px-4 text-right">ຕົ້ນທຶນ/ໜ່ວຍພື້ນຖານ</th>
                  <th className="py-3 px-4">ສະຖານະລ໋ອດ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {lotRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                      ບໍ່ພົບຂໍ້ມູນລ໋ອດສິນຄ້າ
                    </td>
                  </tr>
                )}
                {lotRows.map(({ lot, expiryStatus }) => {
                  const prod = productMap.get(lot.productId);
                  const unitLabel = prod?.baseUnitName ?? 'ໜ່ວຍ';
                  return (
                    <tr key={lot.lotId} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900">
                        {lot.lotNumber}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{lot.productNameSnapshot}</div>
                        <div className="text-xs text-slate-500 font-mono">{lot.skuSnapshot}</div>
                      </td>
                      <td className="py-3 px-4 text-xs tabular-nums">
                        {lot.expiryDate ? formatDateVientiane(lot.expiryDate) : 'ບໍ່ລະບຸ'}
                      </td>
                      <td className="py-3 px-4 text-right text-xs text-slate-500 tabular-nums">
                        {lot.initialQtyBase.toLocaleString('en-US')} {unitLabel}
                      </td>
                      <td className="py-3 px-4 text-right text-xs font-semibold text-slate-900 tabular-nums">
                        {lot.remainingQtyBase.toLocaleString('en-US')} {unitLabel}
                      </td>
                      <td className="py-3 px-4 text-right text-xs text-slate-600 tabular-nums">
                        {formatLak(lot.unitCostBaseLak)}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium">
                        {lot.remainingQtyBase <= 0 ? (
                          <span className="text-slate-400">ໝົດລ໋ອດແລ້ວ</span>
                        ) : expiryStatus === 'expired' ? (
                          <span className="text-red-600">ໝົດອາຍຸແລ້ວ</span>
                        ) : expiryStatus === 'warning' ? (
                          <span className="text-amber-600">ໃກ້ໝົດອາຍຸ</span>
                        ) : (
                          <span className="text-green-700">ປົກກະຕິ</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Physical Stock Count */}
      {activeTab === 'count' && (
        <div className="max-w-2xl bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h3 className="text-base font-semibold text-slate-900">ກວດນັບສະຕ໋ອກ ແລະ ປັບຍອດ</h3>
            <p className="text-xs text-slate-500">
              ບັນທຶກຍອດທີ່ກວດນັບໄດ້ຈິງ ລະບົບຈະຄິດໄລ່ຜົນຕ່າງ ແລະ ບັນທຶກລົງ Stock Ledger ແລະ Audit Log ອັດຕະໂນມັດ
            </p>
          </div>

          {countMessage && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                countMessage.type === 'ok'
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              {countMessage.type === 'ok' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              {countMessage.text}
            </div>
          )}

          <form onSubmit={handleApplyStockCount} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">ເລືອກສິນຄ້າ *</label>
              <select
                required
                value={countProductId}
                onChange={(e) => handleSelectCountProduct(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                <option value="">— ເລືອກສິນຄ້າທີ່ຕ້ອງການກວດນັບ —</option>
                {products
                  .filter((p) => p.status === 'active')
                  .map((p) => (
                    <option key={p.productId} value={p.productId}>
                      {p.sku} · {p.name}
                    </option>
                  ))}
              </select>
            </div>

            {selectedCountProduct && (
              <>
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-slate-500">ຍອດໃນລະບົບປັດຈຸບັນ</div>
                    <div className="text-base font-bold text-slate-900 mt-0.5 tabular-nums">
                      {(balanceMap.get(selectedCountProduct.productId)?.qtyOnHandBase ?? 0).toLocaleString(
                        'en-US',
                      )}{' '}
                      {selectedCountProduct.baseUnitName}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">ຍອດທີ່ນັບໄດ້ຈິງ (ຄິດໄລ່ເປັນໜ່ວຍພື້ນຖານ)</div>
                    <div className="text-base font-bold text-blue-700 mt-0.5 tabular-nums">
                      {Math.round(
                        (Number(countQty) || 0) * (selectedCountUnit?.conversionFactor ?? 1),
                      ).toLocaleString('en-US')}{' '}
                      {selectedCountProduct.baseUnitName}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">ໜ່ວຍທີ່ນັບ</label>
                    <select
                      value={selectedCountUnit?.unitId ?? ''}
                      onChange={(e) => setCountUnitId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                    >
                      {selectedCountProduct.units.map((u) => (
                        <option key={u.unitId} value={u.unitId}>
                          {u.unitName} (x{u.conversionFactor} {selectedCountProduct.baseUnitName})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      ຈຳນວນທີ່ນັບໄດ້ຈິງ *
                    </label>
                    <input
                      type="number"
                      min={0}
                      required
                      value={countQty}
                      onChange={(e) => setCountQty(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ໝາຍເຫດ / ສາເຫດຜົນຕ່າງ
                  </label>
                  <input
                    type="text"
                    maxLength={300}
                    value={countReason}
                    onChange={(e) => setCountReason(e.target.value)}
                    placeholder="ເຊັ່ນ ກວດນັບປະຈຳເດືອນ"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>

                {canEditInventory && (
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={countSaving}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg cursor-pointer"
                    >
                      <PackageCheck className="w-4 h-4" />
                      {countSaving ? 'ກຳລັງປັບຍອດ...' : 'ຢືນຢັນປັບຍອດສະຕ໋ອກ'}
                    </button>
                  </div>
                )}
              </>
            )}
          </form>
        </div>
      )}

      {/* TAB 4: Stock Ledger */}
      {activeTab === 'ledger' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">ວັນເວລາ</th>
                <th className="py-3 px-4">ປະເພດ</th>
                <th className="py-3 px-4">ສິນຄ້າ / ລ໋ອດ</th>
                <th className="py-3 px-4 text-right">ຈຳນວນທີ່ເຮັດລາຍການ</th>
                <th className="py-3 px-4 text-right">ປ່ຽນສຸດທິ (ພື້ນຖານ)</th>
                <th className="py-3 px-4 text-right">ຄົງເຫຼືອຫຼັງເຮັດລາຍການ</th>
                <th className="py-3 px-4 text-right">ມູນຄ່າຕົ້ນທຶນ</th>
                <th className="py-3 px-4">ຜູ້ດຳເນີນການ / ເຫດຜົນ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {movements.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-slate-500">
                    ຍັງບໍ່ມີລາຍການເຄື່ອນໄຫວສະຕ໋ອກສິນຄ້າ
                  </td>
                </tr>
              )}
              {movements.map((m) => (
                <tr key={m.movementId} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 text-slate-500 tabular-nums whitespace-nowrap">
                    {formatDateTimeVientiane(m.createdAt)}
                  </td>
                  <td className="py-3 px-4 font-medium">
                    <span className={m.baseQtyDelta >= 0 ? 'text-green-700' : 'text-red-600'}>
                      {MOVEMENT_LABELS[m.movementType]}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{m.productNameSnapshot}</div>
                    <div className="text-slate-500 font-mono">
                      {m.skuSnapshot} {m.lotNumberSnapshot ? `· ${m.lotNumberSnapshot}` : ''}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-slate-700">
                    {m.inputQty.toLocaleString('en-US')} {m.unitName}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-semibold tabular-nums ${
                      m.baseQtyDelta >= 0 ? 'text-green-700' : 'text-red-600'
                    }`}
                  >
                    {m.baseQtyDelta >= 0 ? `+${m.baseQtyDelta.toLocaleString('en-US')}` : m.baseQtyDelta.toLocaleString('en-US')}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-slate-900 font-medium">
                    {m.balanceBeforeBase.toLocaleString('en-US')} →{' '}
                    {m.balanceAfterBase.toLocaleString('en-US')}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-slate-700">
                    {formatLak(m.totalCostLak)}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    <div className="font-medium text-slate-800">{m.performedByName}</div>
                    <div className="truncate max-w-[200px]">{m.reason}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 5: Storage Locations */}
      {activeTab === 'locations' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              ຈັດການຊັ້ນວາງ ໂຊນສິນຄ້າ ຕູ້ແຊ່ ແລະ ຈຸດຈັດເກັບໃນຮ້ານຄ້າ
            </div>
            {canEditInventory && (
              <button
                type="button"
                onClick={openCreateLocationModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium rounded-lg cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                ເພີ່ມຕຳແໜ່ງຈັດເກັບ
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">ລະຫັດຕຳແໜ່ງ</th>
                  <th className="py-3 px-4">ຊື່ຕຳແໜ່ງ</th>
                  <th className="py-3 px-4">ປະເພດພື້ນທີ່</th>
                  <th className="py-3 px-4">ລາຍລະອຽດ</th>
                  <th className="py-3 px-4">ສະຖານະ</th>
                  <th className="py-3 px-4 text-right">ຈັດການ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {locations.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                      ຍັງບໍ່ມີຕຳແໜ່ງຈັດເກັບສິນຄ້າ
                    </td>
                  </tr>
                )}
                {locations.map((loc) => (
                  <tr key={loc.locationId} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-blue-700">
                      {loc.code}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">{loc.name}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{ZONE_LABELS[loc.zoneType]}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">{loc.description || '-'}</td>
                    <td className="py-3 px-4 text-xs">
                      <span className={loc.status === 'active' ? 'text-green-700 font-medium' : 'text-slate-400'}>
                        {loc.status === 'active' ? 'ໃຊ້ງານ' : 'ປິດໃຊ້ງານ'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {canEditInventory && (
                        <button
                          type="button"
                          onClick={() => openEditLocationModal(loc)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-md cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Storage Location Modal */}
      {locModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-semibold text-slate-900">
                {editingLoc ? 'ແກ້ໄຂຕຳແໜ່ງຈັດເກັບ' : 'ເພີ່ມຕຳແໜ່ງຈັດເກັບ'}
              </h3>
              <button
                type="button"
                onClick={() => setLocModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {locError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {locError}
              </div>
            )}

            <form onSubmit={handleSaveLocation} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">ລະຫັດຕຳແໜ່ງ *</label>
                  <input
                    type="text"
                    required
                    maxLength={30}
                    value={locCode}
                    onChange={(e) => setLocCode(e.target.value.toUpperCase())}
                    placeholder="ເຊັ່ນ A-01"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">ປະເພດພື້ນທີ່</label>
                  <select
                    value={locZone}
                    onChange={(e) => setLocZone(e.target.value as StorageZoneType)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {(Object.keys(ZONE_LABELS) as StorageZoneType[]).map((z) => (
                      <option key={z} value={z}>
                        {ZONE_LABELS[z]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">ຊື່ຕຳແໜ່ງ *</label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={locName}
                  onChange={(e) => setLocName(e.target.value)}
                  placeholder="ເຊັ່ນ ຊັ້ນເຄື່ອງດື່ມໂຊນໜ້າ"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">ໝາຍເຫດ</label>
                <input
                  type="text"
                  maxLength={200}
                  value={locDesc}
                  onChange={(e) => setLocDesc(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">ສະຖານະ</label>
                <select
                  value={locStatus}
                  onChange={(e) => setLocStatus(e.target.value as 'active' | 'inactive')}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="active">ໃຊ້ງານ</option>
                  <option value="inactive">ປິດໃຊ້ງານ</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setLocModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  ຍົກເລີກ
                </button>
                <button
                  type="submit"
                  disabled={locSaving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {locSaving ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
