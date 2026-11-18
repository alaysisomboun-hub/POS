import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Barcode,
  Edit3,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { appendAuditLogToBatch } from '../../core/firebase/auditService';
import { hasPermission } from '../../core/rbac/permissions';
import { generateEan13InternalBarcode, generateSkuCode } from '../../core/utils/barcode';
import { generateSafeId } from '../../core/utils/id';
import { formatLak } from '../../core/utils/money';
import { formatMultiUnitBreakdown } from '../inventory/stockService';
import { BarcodeLabelModal } from './BarcodeLabelModal';
import type {
  Category,
  InventoryBalance,
  Product,
  ProductUnit,
  StorageLocation,
} from '../../core/firebase/types';

export function ProductsPage() {
  const { userProfile, organization, activeBranchId } = useFirebase();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [balances, setBalances] = useState<Map<string, InventoryBalance>>(new Map());
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');

  const [labelProduct, setLabelProduct] = useState<Product | null>(null);

  // Add / Edit Product Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subCategoryId, setSubCategoryId] = useState('');
  const [storageLocationId, setStorageLocationId] = useState('');
  const [storageLocationName, setStorageLocationName] = useState('');
  const [costPriceLak, setCostPriceLak] = useState('0');
  const [minStockBaseQty, setMinStockBaseQty] = useState('5');
  const [reorderQtyBaseQty, setReorderQtyBaseQty] = useState('20');
  const [openingStockQty, setOpeningStockQty] = useState('0');
  const [openingLotNumber, setOpeningLotNumber] = useState('');
  const [openingExpiryDate, setOpeningExpiryDate] = useState('');
  const [trackExpiry, setTrackExpiry] = useState(false);
  const [taxable, setTaxable] = useState(false);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [units, setUnits] = useState<ProductUnit[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canCreate = hasPermission(userProfile, 'products', 'create');
  const canEdit = hasPermission(userProfile, 'products', 'edit');

  useEffect(() => {
    if (!userProfile) return;
    const orgId = userProfile.organizationId;

    const prodQ = query(collection(db, 'products'), where('organizationId', '==', orgId));
    const unsubProds = onSnapshot(
      prodQ,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Product)
          .sort((a, b) => a.name.localeCompare(b.name));
        setProducts(list);
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'products'),
    );

    const catQ = query(collection(db, 'categories'), where('organizationId', '==', orgId));
    const unsubCats = onSnapshot(
      catQ,
      (snap) => {
        setCategories(
          snap.docs
            .map((d) => d.data() as Category)
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'categories'),
    );

    const locQ = query(collection(db, 'storageLocations'), where('organizationId', '==', orgId));
    const unsubLocs = onSnapshot(
      locQ,
      (snap) => {
        setLocations(
          snap.docs
            .map((d) => d.data() as StorageLocation)
            .sort((a, b) => a.code.localeCompare(b.code)),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'storageLocations'),
    );

    const invQ = query(
      collection(db, 'inventory'),
      where('organizationId', '==', orgId),
      where('branchId', '==', activeBranchId),
    );
    const unsubInv = onSnapshot(
      invQ,
      (snap) => {
        const map = new Map<string, InventoryBalance>();
        snap.docs.forEach((d) => {
          const item = d.data() as InventoryBalance;
          map.set(item.productId, item);
        });
        setBalances(map);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'inventory'),
    );

    return () => {
      unsubProds();
      unsubCats();
      unsubLocs();
      unsubInv();
    };
  }, [userProfile, activeBranchId]);

  const mainCategories = useMemo(
    () => categories.filter((c) => !c.parentId && c.status === 'active'),
    [categories],
  );

  const subCategories = useMemo(
    () => categories.filter((c) => c.parentId === categoryId && c.status === 'active'),
    [categories, categoryId],
  );

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.categoryId, c.name));
    return map;
  }, [categories]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && p.categoryId !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.barcodes.some((b) => b.toLowerCase().includes(q))
      );
    });
  }, [products, search, categoryFilter, statusFilter]);

  const openCreateModal = () => {
    setEditingProduct(null);
    setSku(generateSkuCode('PRD'));
    setName('');
    setCategoryId(mainCategories[0]?.categoryId ?? '');
    setSubCategoryId('');
    setStorageLocationId('');
    setStorageLocationName('');
    setCostPriceLak('0');
    setMinStockBaseQty('5');
    setReorderQtyBaseQty('20');
    setOpeningStockQty('0');
    setOpeningLotNumber('');
    setOpeningExpiryDate('');
    setTrackExpiry(false);
    setTaxable(false);
    setNotes('');
    setStatus('active');
    setUnits([
      {
        unitId: generateSafeId('unt'),
        unitName: 'ชิ้น',
        conversionFactor: 1,
        barcode: generateEan13InternalBarcode(),
        retailPrice: 0,
        wholesalePrice: 0,
        memberPrice: 0,
        isBaseUnit: true,
      },
    ]);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEditModal = (prod: Product) => {
    setEditingProduct(prod);
    setSku(prod.sku);
    setName(prod.name);
    setCategoryId(prod.categoryId);
    setSubCategoryId(prod.subCategoryId ?? '');
    setStorageLocationId(prod.storageLocationId ?? '');
    setStorageLocationName(prod.storageLocationName || '');
    setCostPriceLak(String(prod.costPriceLak));
    setMinStockBaseQty(String(prod.minStockBaseQty));
    setReorderQtyBaseQty(String(prod.reorderQtyBaseQty));
    setOpeningStockQty('0');
    setOpeningLotNumber('');
    setOpeningExpiryDate('');
    setTrackExpiry(prod.trackExpiry);
    setTaxable(prod.taxable);
    setNotes(prod.notes || '');
    setStatus(prod.status);
    setUnits(structuredClone(prod.units));
    setErrorMsg(null);
    setModalOpen(true);
  };

  const addUnitRow = () => {
    if (units.length >= 10) return;
    const base = units[0];
    const defaultFactor = units.length === 1 ? 6 : 12;
    setUnits((prev) => [
      ...prev,
      {
        unitId: generateSafeId('unt'),
        unitName: units.length === 1 ? 'แพ็ค' : 'ลัง',
        conversionFactor: defaultFactor,
        barcode: generateEan13InternalBarcode(),
        retailPrice: Math.round((base?.retailPrice ?? 0) * defaultFactor),
        wholesalePrice: Math.round((base?.wholesalePrice ?? 0) * defaultFactor),
        memberPrice: Math.round((base?.memberPrice ?? 0) * defaultFactor),
        isBaseUnit: false,
      },
    ]);
  };

  const updateUnitRow = (index: number, patch: Partial<ProductUnit>) => {
    setUnits((prev) =>
      prev.map((u, idx) => (idx === index ? { ...u, ...patch } : u)),
    );
  };

  const removeUnitRow = (index: number) => {
    if (index === 0) return; // Base unit cannot be removed
    setUnits((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleLocationSelect = (locId: string) => {
    setStorageLocationId(locId);
    const found = locations.find((l) => l.locationId === locId);
    if (found) {
      setStorageLocationName(`${found.code} · ${found.name}`);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    const cleanSku = sku.trim().toUpperCase().slice(0, 50);
    const cleanName = name.trim().slice(0, 160);
    if (!cleanSku || !cleanName) {
      setErrorMsg('กรุณากรอกรหัส SKU และชื่อสินค้า');
      return;
    }

    const duplicateSku = products.find(
      (p) =>
        p.sku.toLowerCase() === cleanSku.toLowerCase() &&
        p.productId !== editingProduct?.productId,
    );
    if (duplicateSku) {
      setErrorMsg(`รหัส SKU "${cleanSku}" ถูกใช้งานแล้วกับสินค้า "${duplicateSku.name}"`);
      return;
    }

    const normalizedUnits: ProductUnit[] = units.map((u, idx) => ({
      unitId: u.unitId,
      unitName: u.unitName.trim().slice(0, 40) || (idx === 0 ? 'ชิ้น' : `หน่วย ${idx + 1}`),
      conversionFactor: idx === 0 ? 1 : Math.max(2, Math.round(Number(u.conversionFactor) || 2)),
      barcode: u.barcode.trim().slice(0, 64),
      retailPrice: Math.max(0, Math.round(Number(u.retailPrice) || 0)),
      wholesalePrice: Math.max(0, Math.round(Number(u.wholesalePrice) || 0)),
      memberPrice: Math.max(0, Math.round(Number(u.memberPrice) || 0)),
      isBaseUnit: idx === 0,
    }));

    const baseUnit = normalizedUnits[0];
    if (!baseUnit || !baseUnit.unitName) {
      setErrorMsg('กรุณากำหนดหน่วยฐานของสินค้า');
      return;
    }

    const allBarcodes = Array.from(
      new Set(normalizedUnits.map((u) => u.barcode).filter(Boolean)),
    ).slice(0, 15);

    // Check barcode conflicts against other products
    for (const code of allBarcodes) {
      const conflict = products.find(
        (p) =>
          p.productId !== editingProduct?.productId &&
          (p.barcode === code || p.barcodes.includes(code)),
      );
      if (conflict) {
        setErrorMsg(`บาร์โค้ด "${code}" ซ้ำกับสินค้า "${conflict.name}"`);
        return;
      }
    }

    const parsedCost = Math.max(0, Math.round(Number(costPriceLak) || 0));
    const parsedMin = Math.max(0, Math.round(Number(minStockBaseQty) || 0));
    const parsedReorder = Math.max(0, Math.round(Number(reorderQtyBaseQty) || 0));
    const parsedOpening = Math.max(0, Math.round(Number(openingStockQty) || 0));

    setSaving(true);
    setErrorMsg(null);

    try {
      const batch = writeBatch(db);
      const cleanLocationName = storageLocationName.trim().slice(0, 100);

      if (editingProduct) {
        batch.update(doc(db, 'products', editingProduct.productId), {
          sku: cleanSku,
          name: cleanName,
          categoryId,
          subCategoryId: subCategoryId || null,
          storageLocationId: storageLocationId || null,
          storageLocationName: cleanLocationName,
          baseUnitName: baseUnit.unitName,
          barcode: baseUnit.barcode,
          barcodes: allBarcodes,
          units: normalizedUnits,
          trackExpiry,
          costPriceLak: parsedCost,
          retailPriceLak: baseUnit.retailPrice,
          wholesalePriceLak: baseUnit.wholesalePrice,
          memberPriceLak: baseUnit.memberPrice,
          minStockBaseQty: parsedMin,
          reorderQtyBaseQty: parsedReorder,
          taxable,
          notes: notes.trim().slice(0, 500),
          status,
          updatedAt: serverTimestamp(),
        });

        const existingBalance = balances.get(editingProduct.productId);
        if (existingBalance) {
          batch.update(doc(db, 'inventory', existingBalance.inventoryId), {
            skuSnapshot: cleanSku,
            productNameSnapshot: cleanName,
            baseUnitNameSnapshot: baseUnit.unitName,
            minStockBaseQty: parsedMin,
            storageLocationName: cleanLocationName,
            updatedAt: serverTimestamp(),
          });
        }

        appendAuditLogToBatch(batch, {
          user: userProfile,
          branchId: activeBranchId,
          action: 'UPDATE_PRODUCT',
          entityType: 'products',
          entityId: editingProduct.productId,
          before: {
            sku: editingProduct.sku,
            name: editingProduct.name,
            retailPriceLak: editingProduct.retailPriceLak,
            status: editingProduct.status,
          },
          after: {
            sku: cleanSku,
            name: cleanName,
            retailPriceLak: baseUnit.retailPrice,
            status,
          },
        });
      } else {
        const productId = generateSafeId('prd');
        batch.set(doc(db, 'products', productId), {
          productId,
          organizationId: userProfile.organizationId,
          branchId: activeBranchId,
          ownerUid: userProfile.ownerUid,
          sku: cleanSku,
          name: cleanName,
          categoryId,
          subCategoryId: subCategoryId || null,
          storageLocationId: storageLocationId || null,
          storageLocationName: cleanLocationName,
          baseUnitName: baseUnit.unitName,
          barcode: baseUnit.barcode,
          barcodes: allBarcodes,
          units: normalizedUnits,
          trackExpiry,
          costPriceLak: parsedCost,
          retailPriceLak: baseUnit.retailPrice,
          wholesalePriceLak: baseUnit.wholesalePrice,
          memberPriceLak: baseUnit.memberPrice,
          minStockBaseQty: parsedMin,
          reorderQtyBaseQty: parsedReorder,
          taxable,
          notes: notes.trim().slice(0, 500),
          status,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Always initialize 0 or opening stock inventory record atomically
        const inventoryId = `${activeBranchId}_${productId}`;
        batch.set(doc(db, 'inventory', inventoryId), {
          inventoryId,
          organizationId: userProfile.organizationId,
          branchId: activeBranchId,
          ownerUid: userProfile.ownerUid,
          productId,
          skuSnapshot: cleanSku,
          productNameSnapshot: cleanName,
          baseUnitNameSnapshot: baseUnit.unitName,
          qtyOnHandBase: parsedOpening,
          reservedQtyBase: 0,
          avgCostLak: parsedCost,
          minStockBaseQty: parsedMin,
          storageLocationName: cleanLocationName,
          lastMovementAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (parsedOpening > 0) {
          const lotId = generateSafeId('lot');
          const lotNum =
            openingLotNumber.trim().slice(0, 60) ||
            `INIT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

          batch.set(doc(db, 'inventoryLots', lotId), {
            lotId,
            organizationId: userProfile.organizationId,
            branchId: activeBranchId,
            ownerUid: userProfile.ownerUid,
            productId,
            skuSnapshot: cleanSku,
            productNameSnapshot: cleanName,
            lotNumber: lotNum,
            expiryDate: openingExpiryDate.trim() ? openingExpiryDate.trim().slice(0, 20) : null,
            initialQtyBase: parsedOpening,
            remainingQtyBase: parsedOpening,
            unitCostBaseLak: parsedCost,
            storageLocationName: cleanLocationName,
            status: 'active',
            receivedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          const movementId = generateSafeId('mov');
          batch.set(doc(db, 'stockMovements', movementId), {
            movementId,
            organizationId: userProfile.organizationId,
            branchId: activeBranchId,
            ownerUid: userProfile.ownerUid,
            productId,
            skuSnapshot: cleanSku,
            productNameSnapshot: cleanName,
            lotId,
            lotNumberSnapshot: lotNum,
            movementType: 'initial',
            unitName: baseUnit.unitName,
            conversionFactor: 1,
            inputQty: parsedOpening,
            baseQtyDelta: parsedOpening,
            balanceBeforeBase: 0,
            balanceAfterBase: parsedOpening,
            unitCostBaseLak: parsedCost,
            totalCostLak: Math.round(parsedOpening * parsedCost),
            reason: 'ยอดยกมาตั้งต้นสินค้าใหม่',
            referenceNo: 'INIT',
            performedByUid: userProfile.uid,
            performedByName: userProfile.name.slice(0, 120),
            createdAt: serverTimestamp(),
          });
        }

        appendAuditLogToBatch(batch, {
          user: userProfile,
          branchId: activeBranchId,
          action: 'CREATE_PRODUCT',
          entityType: 'products',
          entityId: productId,
          before: null,
          after: {
            sku: cleanSku,
            name: cleanName,
            unitsCount: normalizedUnits.length,
            openingStockBase: parsedOpening,
          },
        });
      }

      await batch.commit();
      setModalOpen(false);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, 'products');
      } catch (wrapped) {
        setErrorMsg(wrapped instanceof Error ? wrapped.message : 'ไม่สามารถบันทึกข้อมูลสินค้าได้');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ SKU หรือสแกนบาร์โค้ด..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
          >
            <option value="all">ทุกหมวดหมู่</option>
            {categories
              .filter((c) => !c.parentId)
              .map((c) => (
                <option key={c.categoryId} value={c.categoryId}>
                  {c.name}
                </option>
              ))}
          </select>

          <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            {(['active', 'inactive', 'all'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === s
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {s === 'active' ? 'ขายอยู่' : s === 'inactive' ? 'หยุดขาย' : 'ทั้งหมด'}
              </button>
            ))}
          </div>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <PackagePlus className="w-4 h-4" />
            เพิ่มสินค้าใหม่
          </button>
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="py-3 px-4">สินค้า / SKU / บาร์โค้ด</th>
              <th className="py-3 px-4">หมวดหมู่ / ตำแหน่ง</th>
              <th className="py-3 px-4">หน่วยขาย</th>
              <th className="py-3 px-4 text-right">ต้นทุน</th>
              <th className="py-3 px-4 text-right">ปลีก / ส่ง / สมาชิก</th>
              <th className="py-3 px-4 text-right">คงเหลือ</th>
              <th className="py-3 px-4 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {loading && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                  กำลังโหลดรายการสินค้า...
                </td>
              </tr>
            )}
            {!loading && filteredProducts.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  ไม่พบรายการสินค้าตามเงื่อนไขที่เลือก
                </td>
              </tr>
            )}
            {filteredProducts.map((prod) => {
              const bal = balances.get(prod.productId);
              const qtyBase = bal?.qtyOnHandBase ?? 0;
              const isLow = qtyBase <= prod.minStockBaseQty;
              return (
                <tr key={prod.productId} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{prod.name}</div>
                    <div className="text-xs text-slate-500 font-mono">
                      {prod.sku} {prod.barcode ? `· ${prod.barcode}` : ''}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">
                    <div>{categoryMap.get(prod.categoryId) || '-'}</div>
                    <div className="text-slate-400">{prod.storageLocationName || '-'}</div>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-700">
                    {prod.units.map((u) => `${u.unitName} (x${u.conversionFactor})`).join(' · ')}
                  </td>
                  <td className="py-3 px-4 text-right text-xs text-slate-600 tabular-nums">
                    {formatLak(bal?.avgCostLak ?? prod.costPriceLak)}
                  </td>
                  <td className="py-3 px-4 text-right text-xs tabular-nums">
                    <div className="font-semibold text-slate-900">{formatLak(prod.retailPriceLak)}</div>
                    <div className="text-slate-500">
                      ส่ง {formatLak(prod.wholesalePriceLak, false)} / สมาชิก{' '}
                      {formatLak(prod.memberPriceLak, false)}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-xs tabular-nums">
                    <div
                      className={`font-semibold ${
                        qtyBase <= 0 ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-slate-900'
                      }`}
                    >
                      {formatMultiUnitBreakdown(qtyBase, prod.units, prod.baseUnitName)}
                    </div>
                    <div className="text-slate-400">
                      ({qtyBase.toLocaleString('en-US')} {prod.baseUnitName})
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setLabelProduct(prod)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-md cursor-pointer"
                        title="พิมพ์ฉลากบาร์โค้ด"
                      >
                        <Barcode className="w-4 h-4" />
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openEditModal(prod)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-md cursor-pointer"
                          title="แก้ไขสินค้า"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {filteredProducts.map((prod) => {
          const bal = balances.get(prod.productId);
          const qtyBase = bal?.qtyOnHandBase ?? 0;
          return (
            <div key={prod.productId} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900 text-sm">{prod.name}</div>
                  <div className="text-xs text-slate-500 font-mono">
                    {prod.sku} · {prod.barcode || 'ไม่มีบาร์โค้ด'}
                  </div>
                </div>
                <div className="text-right tabular-nums">
                  <div className="text-sm font-bold text-blue-700">{formatLak(prod.retailPriceLak)}</div>
                  <div className="text-[11px] text-slate-500">/{prod.baseUnitName}</div>
                </div>
              </div>
              <div className="text-xs text-slate-600">
                คงเหลือ: <strong>{formatMultiUnitBreakdown(qtyBase, prod.units, prod.baseUnitName)}</strong>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setLabelProduct(prod)}
                  className="px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-md"
                >
                  พิมพ์ฉลาก
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => openEditModal(prod)}
                    className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded-md"
                  >
                    แก้ไข
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Product Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-xl p-6 my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-semibold text-slate-900">
                {editingProduct ? 'แก้ไขข้อมูลสินค้า' : 'เพิ่มสินค้าใหม่'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-5">
              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">รหัสสินค้า (SKU) *</label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      required
                      maxLength={50}
                      value={sku}
                      onChange={(e) => setSku(e.target.value.toUpperCase())}
                      className="flex-1 px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => setSku(generateSkuCode('PRD'))}
                      className="px-2.5 py-2 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                      title="สร้าง SKU อัตโนมัติ"
                    >
                      <Wand2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">ชื่อสินค้า *</label>
                  <input
                    type="text"
                    required
                    maxLength={160}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="เช่น น้ำดื่มบริสุทธิ์ 600 มล."
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">หมวดหมู่หลัก</label>
                  <select
                    value={categoryId}
                    onChange={(e) => {
                      setCategoryId(e.target.value);
                      setSubCategoryId('');
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="">— ไม่ระบุหมวดหมู่ —</option>
                    {mainCategories.map((c) => (
                      <option key={c.categoryId} value={c.categoryId}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">หมวดหมู่ย่อย</label>
                  <select
                    value={subCategoryId}
                    onChange={(e) => setSubCategoryId(e.target.value)}
                    disabled={subCategories.length === 0}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white disabled:bg-slate-50"
                  >
                    <option value="">— ไม่ระบุ —</option>
                    {subCategories.map((c) => (
                      <option key={c.categoryId} value={c.categoryId}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ตำแหน่งจัดเก็บ (ชั้นวาง / ตู้แช่)
                  </label>
                  <div className="flex gap-1.5">
                    <select
                      value={storageLocationId}
                      onChange={(e) => handleLocationSelect(e.target.value)}
                      className="w-1/2 px-2 py-2 text-xs border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="">เลือกตำแหน่ง</option>
                      {locations
                        .filter((l) => l.status === 'active')
                        .map((l) => (
                          <option key={l.locationId} value={l.locationId}>
                            {l.code} · {l.name}
                          </option>
                        ))}
                    </select>
                    <input
                      type="text"
                      maxLength={100}
                      value={storageLocationName}
                      onChange={(e) => setStorageLocationName(e.target.value)}
                      placeholder="เช่น ชั้น A1"
                      className="w-1/2 px-2.5 py-2 text-xs border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Multi-Unit & Pricing Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-slate-900">
                      หน่วยขาย บาร์โค้ด และราคาหลายระดับ (LAK)
                    </div>
                    <div className="text-[11px] text-slate-500">
                      แถวแรกคือ &ldquo;หน่วยฐาน&rdquo; (ตัวคูณ = 1) สามารถเพิ่ม แพ็ค/โหล/ลัง พร้อมบาร์โค้ดและราคาแยกได้
                    </div>
                  </div>
                  {units.length < 10 && (
                    <button
                      type="button"
                      onClick={addUnitRow}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      เพิ่มหน่วยขาย
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-600 bg-white">
                        <th className="py-2 px-3">ชื่อหน่วย *</th>
                        <th className="py-2 px-3 w-24">ตัวคูณฐาน</th>
                        <th className="py-2 px-3">บาร์โค้ด</th>
                        <th className="py-2 px-3 w-28">ราคาปลีก (₭)</th>
                        <th className="py-2 px-3 w-28">ราคาส่ง (₭)</th>
                        <th className="py-2 px-3 w-28">สมาชิก (₭)</th>
                        <th className="py-2 px-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {units.map((u, idx) => (
                        <tr key={u.unitId}>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              required
                              maxLength={40}
                              value={u.unitName}
                              onChange={(e) => updateUnitRow(idx, { unitName: e.target.value })}
                              placeholder={idx === 0 ? 'ชิ้น / ขวด' : 'แพ็ค / ลัง'}
                              className="w-full px-2.5 py-1.5 border border-slate-200 rounded"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min={idx === 0 ? 1 : 2}
                              disabled={idx === 0}
                              value={u.conversionFactor}
                              onChange={(e) =>
                                updateUnitRow(idx, { conversionFactor: Number(e.target.value) || 2 })
                              }
                              className="w-full px-2.5 py-1.5 border border-slate-200 rounded tabular-nums disabled:bg-slate-50"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex gap-1">
                              <input
                                type="text"
                                maxLength={64}
                                value={u.barcode}
                                onChange={(e) => updateUnitRow(idx, { barcode: e.target.value })}
                                placeholder="สแกนหรือสร้าง"
                                className="w-full min-w-[120px] px-2.5 py-1.5 font-mono border border-slate-200 rounded"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateUnitRow(idx, { barcode: generateEan13InternalBarcode() })
                                }
                                className="px-2 py-1 text-slate-500 border border-slate-200 rounded hover:bg-slate-50"
                                title="สร้างบาร์โค้ด EAN-13 อัตโนมัติ"
                              >
                                <Wand2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min={0}
                              value={u.retailPrice}
                              onChange={(e) =>
                                updateUnitRow(idx, { retailPrice: Number(e.target.value) || 0 })
                              }
                              className="w-full px-2 py-1.5 border border-slate-200 rounded tabular-nums text-right"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min={0}
                              value={u.wholesalePrice}
                              onChange={(e) =>
                                updateUnitRow(idx, { wholesalePrice: Number(e.target.value) || 0 })
                              }
                              className="w-full px-2 py-1.5 border border-slate-200 rounded tabular-nums text-right"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min={0}
                              value={u.memberPrice}
                              onChange={(e) =>
                                updateUnitRow(idx, { memberPrice: Number(e.target.value) || 0 })
                              }
                              className="w-full px-2 py-1.5 border border-slate-200 rounded tabular-nums text-right"
                            />
                          </td>
                          <td className="py-2 px-2 text-center">
                            {idx > 0 && (
                              <button
                                type="button"
                                onClick={() => removeUnitRow(idx)}
                                className="p-1 text-slate-400 hover:text-red-600"
                                title="ลบหน่วย"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cost, Min Stock, Initial Stock */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ต้นทุนมาตรฐาน / {units[0]?.unitName || 'หน่วยฐาน'} (₭)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={costPriceLak}
                    onChange={(e) => setCostPriceLak(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    จุดแจ้งเตือนสต็อกต่ำ ({units[0]?.unitName || 'หน่วยฐาน'})
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={minStockBaseQty}
                    onChange={(e) => setMinStockBaseQty(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    จำนวนแนะนำสั่งซื้อ
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={reorderQtyBaseQty}
                    onChange={(e) => setReorderQtyBaseQty(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">สถานะสินค้า</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="active">เปิดขายปกติ</option>
                    <option value="inactive">หยุดขายชั่วคราว</option>
                  </select>
                </div>
              </div>

              {!editingProduct && (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      สต็อกยกมาตั้งต้น ({units[0]?.unitName || 'หน่วยฐาน'})
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={openingStockQty}
                      onChange={(e) => setOpeningStockQty(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      เลขล็อตเริ่มต้น (ถ้ามี)
                    </label>
                    <input
                      type="text"
                      maxLength={60}
                      value={openingLotNumber}
                      onChange={(e) => setOpeningLotNumber(e.target.value)}
                      placeholder="สร้างอัตโนมัติหากเว้นว่าง"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      วันหมดอายุ (ถ้ามี)
                    </label>
                    <input
                      type="date"
                      value={openingExpiryDate}
                      onChange={(e) => setOpeningExpiryDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-6">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={trackExpiry}
                    onChange={(e) => setTrackExpiry(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  ติดตามล็อตและวันหมดอายุ (FEFO)
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={taxable}
                    onChange={(e) => setTaxable(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  สินค้าคำนวณภาษี (เมื่อเปิดใช้ภาษีร้านค้า)
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">หมายเหตุสินค้า</label>
                <input
                  type="text"
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {saving ? 'กำลังบันทึก...' : 'บันทึกสินค้า'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {labelProduct && (
        <BarcodeLabelModal
          product={labelProduct}
          storeName={organization?.name || 'ร้านค้าหลัก'}
          onClose={() => setLabelProduct(null)}
        />
      )}
    </div>
  );
}
