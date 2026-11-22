import React, { useEffect, useRef, useState } from 'react';
import { Timestamp, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  ImagePlus,
  Package,
  PackagePlus,
  QrCode,
  ShieldAlert,
  Wand2,
  X,
} from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { appendAuditLogToBatch } from '../../core/firebase/auditService';
import { generateEan13InternalBarcode, generateSkuCode } from '../../core/utils/barcode';
import { generateSafeId } from '../../core/utils/id';
import { compressProductImageFile } from '../../core/utils/image';
import { BarcodeQrScannerModal } from '../../components/scanner/BarcodeQrScannerModal';
import type {
  Category,
  InventoryBalance,
  Product,
  ProductUnit,
  UserProfile,
} from '../../core/firebase/types';

interface QuickAddProductModalProps {
  open: boolean;
  initialQuery: string;
  initialCategoryId?: string;
  categories: Category[];
  existingProducts: Product[];
  userProfile: UserProfile | null;
  activeBranchId: string;
  canCreateProduct: boolean;
  allowNegativeStock: boolean;
  onCreated: (result: { product: Product; balance: InventoryBalance }) => void;
  onClose: () => void;
}

const QUICK_UNIT_PRESETS = ['ອັນ', 'ຕຸກ', 'ຊອງ', 'ກ່ອງ', 'ແພັກ', 'ຖົງ', 'ກິໂລ'];

function looksLikeBarcode(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.length >= 4 && /^[A-Za-z0-9\-_.]+$/.test(trimmed);
}

export function QuickAddProductModal({
  open,
  initialQuery,
  initialCategoryId,
  categories,
  existingProducts,
  userProfile,
  activeBranchId,
  canCreateProduct,
  allowNegativeStock,
  onCreated,
  onClose,
}: QuickAddProductModalProps) {
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [costPriceLak, setCostPriceLak] = useState('0');
  const [wholesalePriceLak, setWholesalePriceLak] = useState('0');
  const [retailPriceLak, setRetailPriceLak] = useState('');
  const [openingStockQty, setOpeningStockQty] = useState('1');
  const [baseUnitName, setBaseUnitName] = useState('ອັນ');
  const [imageUrl, setImageUrl] = useState('');
  const [notes, setNotes] = useState('');

  const [imageUploading, setImageUploading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const trimmed = initialQuery.trim();
    const isCode = looksLikeBarcode(trimmed);

    setName(isCode ? '' : trimmed.slice(0, 160));
    setSku(generateSkuCode('PRD'));
    setBarcode(isCode ? trimmed.slice(0, 64) : generateEan13InternalBarcode());
    const matchedInitialCategory =
      initialCategoryId &&
      initialCategoryId !== 'all' &&
      categories.some((c) => c.categoryId === initialCategoryId);
    setCategoryId(
      matchedInitialCategory
        ? initialCategoryId
        : (categories[0]?.categoryId ?? ''),
    );
    setCostPriceLak('0');
    setWholesalePriceLak('0');
    setRetailPriceLak('');
    setOpeningStockQty('1');
    setBaseUnitName('ອັນ');
    setImageUrl('');
    setNotes('');
    setScannerOpen(false);
    setErrorMsg(null);

    const timer = window.setTimeout(() => {
      nameInputRef.current?.focus();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [open, initialQuery, initialCategoryId, categories]);

  if (!open) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    if (!canCreateProduct) {
      setErrorMsg(
        'ບັນຊີຂອງທ່ານບໍ່ມີສິດເພີ່ມສິນຄ້າໃໝ່ ກະລຸນາຕິດຕໍ່ເຈົ້າຂອງຮ້ານ ຫຼື ຜູ້ຈັດການຮ້ານ',
      );
      return;
    }

    const cleanName = name.trim().slice(0, 160);
    const cleanSku = sku.trim().toUpperCase().slice(0, 50);
    const cleanBarcode = barcode.trim().slice(0, 64);
    const cleanUnitName = baseUnitName.trim().slice(0, 40);
    const cleanImageUrl = imageUrl.trim();
    const cleanNotes = notes.trim().slice(0, 500);

    if (!cleanName) {
      setErrorMsg('ກະລຸນາປ້ອນຊື່ສິນຄ້າ');
      return;
    }
    if (!cleanSku) {
      setErrorMsg('ກະລຸນາປ້ອນລະຫັດສິນຄ້າ (SKU)');
      return;
    }
    if (!cleanUnitName) {
      setErrorMsg('ກະລຸນາປ້ອນໜ່ວຍນັບສິນຄ້າ');
      return;
    }
    if (retailPriceLak.trim() === '' || Number(retailPriceLak) < 0 || Number.isNaN(Number(retailPriceLak))) {
      setErrorMsg('ກະລຸນາປ້ອນລາຄາຂາຍຍ່ອຍໃຫ້ຖືກຕ້ອງ');
      return;
    }
    if (openingStockQty.trim() === '' || Number(openingStockQty) < 0 || Number.isNaN(Number(openingStockQty))) {
      setErrorMsg('ກະລຸນາປ້ອນຈຳນວນສິນຄ້າເລີ່ມຕົ້ນໃຫ້ຖືກຕ້ອງ');
      return;
    }
    if (cleanImageUrl.length > 45000) {
      setErrorMsg('ຮູບພາບສິນຄ້າມີຂະໜາດໃຫຍ່ເກີນກຳນົດ ກະລຸນາອັບໂຫຼດໃໝ່ ຫຼື ໃຊ້ລິ້ງ URL ຮູບພາບ');
      return;
    }

    const duplicateSku = existingProducts.find(
      (p) => p.sku.trim().toLowerCase() === cleanSku.toLowerCase(),
    );
    if (duplicateSku) {
      setErrorMsg(`ລະຫັດສິນຄ້າ SKU "${cleanSku}" ຊ້ຳກັບສິນຄ້າ "${duplicateSku.name}" ໃນລະບົບ`);
      return;
    }

    if (cleanBarcode) {
      const lowerCode = cleanBarcode.toLowerCase();
      const duplicateBarcode = existingProducts.find(
        (p) =>
          p.barcode.trim().toLowerCase() === lowerCode ||
          p.sku.trim().toLowerCase() === lowerCode ||
          p.barcodes.some((b) => b.trim().toLowerCase() === lowerCode) ||
          p.units.some((u) => u.barcode.trim().toLowerCase() === lowerCode),
      );
      if (duplicateBarcode) {
        setErrorMsg(
          `ບາໂຄດ "${cleanBarcode}" ຊ້ຳກັບສິນຄ້າ "${duplicateBarcode.name}" ໃນລະບົບ`,
        );
        return;
      }
    }

    const parsedCost = Math.max(0, Math.round(Number(costPriceLak) || 0));
    const parsedWholesale = Math.max(0, Math.round(Number(wholesalePriceLak) || 0));
    const parsedRetail = Math.max(0, Math.round(Number(retailPriceLak) || 0));
    const parsedOpening = Math.max(0, Math.round(Number(openingStockQty) || 0));

    const unitId = generateSafeId('unt');
    const baseUnit: ProductUnit = {
      unitId,
      unitName: cleanUnitName,
      conversionFactor: 1,
      barcode: cleanBarcode,
      retailPrice: parsedRetail,
      wholesalePrice: parsedWholesale,
      memberPrice: parsedRetail,
      isBaseUnit: true,
    };

    const productId = generateSafeId('prd');
    const inventoryId = `${activeBranchId}_${productId}`;
    const barcodes = cleanBarcode ? [cleanBarcode] : [];
    const nowTs = Timestamp.now();

    setSaving(true);
    setErrorMsg(null);

    try {
      const batch = writeBatch(db);

      const productDocPayload = {
        productId,
        organizationId: userProfile.organizationId,
        branchId: activeBranchId,
        ownerUid: userProfile.ownerUid,
        sku: cleanSku,
        name: cleanName,
        categoryId,
        subCategoryId: null,
        storageLocationId: null,
        storageLocationName: '',
        baseUnitName: cleanUnitName,
        barcode: cleanBarcode,
        barcodes,
        units: [baseUnit],
        trackExpiry: false,
        costPriceLak: parsedCost,
        retailPriceLak: parsedRetail,
        wholesalePriceLak: parsedWholesale,
        memberPriceLak: parsedRetail,
        minStockBaseQty: 5,
        reorderQtyBaseQty: 20,
        taxable: false,
        imageUrl: cleanImageUrl,
        notes: cleanNotes,
        status: 'active' as const,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      batch.set(doc(db, 'products', productId), productDocPayload);

      const balanceDocPayload = {
        inventoryId,
        organizationId: userProfile.organizationId,
        branchId: activeBranchId,
        ownerUid: userProfile.ownerUid,
        productId,
        skuSnapshot: cleanSku,
        productNameSnapshot: cleanName,
        baseUnitNameSnapshot: cleanUnitName,
        qtyOnHandBase: parsedOpening,
        reservedQtyBase: 0,
        avgCostLak: parsedCost,
        minStockBaseQty: 5,
        storageLocationName: '',
        lastMovementAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      batch.set(doc(db, 'inventory', inventoryId), balanceDocPayload);

      if (parsedOpening > 0) {
        const lotId = generateSafeId('lot');
        const lotNumber = `INIT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

        batch.set(doc(db, 'inventoryLots', lotId), {
          lotId,
          organizationId: userProfile.organizationId,
          branchId: activeBranchId,
          ownerUid: userProfile.ownerUid,
          productId,
          skuSnapshot: cleanSku,
          productNameSnapshot: cleanName,
          lotNumber,
          expiryDate: null,
          initialQtyBase: parsedOpening,
          remainingQtyBase: parsedOpening,
          unitCostBaseLak: parsedCost,
          storageLocationName: '',
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
          lotNumberSnapshot: lotNumber,
          movementType: 'initial',
          unitName: cleanUnitName,
          conversionFactor: 1,
          inputQty: parsedOpening,
          baseQtyDelta: parsedOpening,
          balanceBeforeBase: 0,
          balanceAfterBase: parsedOpening,
          unitCostBaseLak: parsedCost,
          totalCostLak: Math.round(parsedOpening * parsedCost),
          reason: 'ເພີ່ມສິນຄ້າໃໝ່ຈາກໜ້າຂາຍ (POS)',
          referenceNo: 'POS-QUICK-ADD',
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
          retailPriceLak: parsedRetail,
          wholesalePriceLak: parsedWholesale,
          openingStockBase: parsedOpening,
          source: 'POS_TERMINAL',
        },
      });

      await batch.commit();

      onCreated({
        product: {
          ...productDocPayload,
          createdAt: nowTs,
          updatedAt: nowTs,
        },
        balance: {
          ...balanceDocPayload,
          lastMovementAt: nowTs,
          updatedAt: nowTs,
        },
      });
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, 'products');
      } catch (wrapped) {
        setErrorMsg(
          wrapped instanceof Error ? wrapped.message : 'ບໍ່ສາມາດບັນທຶກສິນຄ້າໃໝ່ໄດ້ ກະລຸນາລອງອີກຄັ້ງ',
        );
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl p-5 sm:p-6 my-6 max-h-[92vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <PackagePlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                ເພີ່ມສິນຄ້າໃໝ່ຈາກໜ້າຂາຍ (POS)
              </h3>
              <p className="text-xs text-slate-500">
                ບັນທຶກແລ້ວລະບົບຈະເພີ່ມສິນຄ້າໃສ່ກະຕ່າຂາຍ ແລະ ຊິ້ງເຂົ້າສາງສິນຄ້າທັນທີ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!canCreateProduct && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <span>
              ບັນຊີຂອງທ່ານບໍ່ມີສິດເພີ່ມສິນຄ້າໃໝ່ ກະລຸນາຕິດຕໍ່ເຈົ້າຂອງຮ້ານ ຫຼື ຜູ້ຈັດການຮ້ານເພື່ອດຳເນີນການ
            </span>
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Product Name */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ຊື່ສິນຄ້າ *
              </label>
              <input
                ref={nameInputRef}
                type="text"
                required
                maxLength={160}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ເຊັ່ນ ນ້ຳດື່ມບໍລິສຸດ 600 ມລ."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>

            {/* Barcode */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ບາໂຄດ
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  maxLength={64}
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="ສະແກນ ຫຼື ປ້ອນບາໂຄດ"
                  className="flex-1 px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="px-2.5 py-2 text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                  title="ສະແກນບາໂຄດ / QR ດ້ວຍກ້ອງ"
                >
                  <QrCode className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setBarcode(generateEan13InternalBarcode())}
                  className="px-2.5 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                  title="ສ້າງບາໂຄດ EAN-13 ອັດຕະໂນມັດ"
                >
                  <Wand2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* SKU */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ລະຫັດສິນຄ້າ (SKU) *
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase())}
                  placeholder="ເຊັ່ນ PRD-123456"
                  className="flex-1 px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={() => setSku(generateSkuCode('PRD'))}
                  className="px-2.5 py-2 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                  title="ສ້າງລະຫັດ SKU ອັດຕະໂນມັດ"
                >
                  <Wand2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ໝວດໝູ່ສິນຄ້າ
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-600"
              >
                <option value="">— ບໍ່ລະບຸໝວດໝູ່ —</option>
                {categories.map((c) => (
                  <option key={c.categoryId} value={c.categoryId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Unit */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ໜ່ວຍນັບ *
              </label>
              <input
                type="text"
                required
                maxLength={40}
                value={baseUnitName}
                onChange={(e) => setBaseUnitName(e.target.value)}
                placeholder="ເຊັ່ນ ອັນ / ຕຸກ / ກ່ອງ"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {QUICK_UNIT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setBaseUnitName(preset)}
                    className={`px-2 py-0.5 text-[11px] rounded border cursor-pointer ${
                      baseUnitName === preset
                        ? 'bg-blue-50 border-blue-500 text-blue-700 font-medium'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Pricing & Initial Stock */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ລາຄາທຶນ (₭)
              </label>
              <input
                type="number"
                min={0}
                value={costPriceLak}
                onChange={(e) => setCostPriceLak(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg tabular-nums text-right focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ລາຄາຂາຍຍ່ອຍ (₭) *
              </label>
              <input
                type="number"
                min={0}
                required
                value={retailPriceLak}
                onChange={(e) => setRetailPriceLak(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 text-sm font-semibold border border-blue-300 rounded-lg tabular-nums text-right focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ລາຄາຂາຍສົ່ງ (₭)
              </label>
              <input
                type="number"
                min={0}
                value={wholesalePriceLak}
                onChange={(e) => setWholesalePriceLak(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg tabular-nums text-right focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ຈຳນວນເລີ່ມຕົ້ນ *
              </label>
              <input
                type="number"
                min={0}
                required
                value={openingStockQty}
                onChange={(e) => setOpeningStockQty(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg tabular-nums text-right focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          {!allowNegativeStock && Number(openingStockQty) <= 0 && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ໝາຍເຫດ: ຮ້ານຕັ້ງຄ່າບໍ່ອະນຸຍາດຂາຍຕິດລົບ ຫາກລະບຸຈຳນວນເລີ່ມຕົ້ນເປັນ 0 ລະບົບຈະບັນທຶກສິນຄ້າເຂົ້າສາງ ແຕ່ຈະຍັງບໍ່ສາມາດເພີ່ມໃສ່ກະຕ່າຂາຍໄດ້ທັນທີ (ແນະນຳໃສ່ຈຳນວນເລີ່ມຕົ້ນຢ່າງໜ້ອຍ 1)
            </div>
          )}

          {/* Optional Image */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5">
            <label className="block text-xs font-medium text-slate-700">
              ຮູບພາບສິນຄ້າ (ບໍ່ບັງຄັບ)
            </label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={name || 'ຮູບສິນຄ້າ'}
                  className="w-16 h-16 rounded-lg object-cover border border-slate-200 bg-white shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg border border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-slate-400 shrink-0 text-[10px]">
                  <Package className="w-4 h-4 mb-0.5" />
                  ບໍ່ມີຮູບ
                </div>
              )}

              <div className="flex-1 w-full space-y-2">
                <div className="flex flex-wrap gap-2">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer">
                    <ImagePlus className="w-3.5 h-3.5 text-blue-600" />
                    {imageUploading ? 'ກຳລັງຫຍໍ້ຮູບພາບ...' : 'ເລືອກຮູບ / ຖ່າຍຮູບ'}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={imageUploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        setImageUploading(true);
                        setErrorMsg(null);
                        try {
                          const compressed = await compressProductImageFile(file);
                          setImageUrl(compressed);
                        } catch (err) {
                          setErrorMsg(
                            err instanceof Error ? err.message : 'ບໍ່ສາມາດອັບໂຫຼດຮູບພາບໄດ້',
                          );
                        } finally {
                          setImageUploading(false);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-white text-xs font-medium text-rose-700 hover:bg-rose-50 cursor-pointer"
                    >
                      ລຶບຮູບ
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={imageUrl.startsWith('data:image/') ? '' : imageUrl}
                  onChange={(e) => setImageUrl(e.target.value.slice(0, 500))}
                  placeholder={
                    imageUrl.startsWith('data:image/')
                      ? 'ອັບໂຫຼດຮູບພາບສຳເລັດແລ້ວ (ຫຼື ວາງລິ້ງ URL ທັບໄດ້)'
                      : 'ຫຼື ວາງລິ້ງຮູບພາບສິນຄ້າ https://...'
                  }
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Optional Description */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              ລາຍລະອຽດສິນຄ້າ (ບໍ່ບັງຄັບ)
            </label>
            <textarea
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ລາຍລະອຽດເພີ່ມເຕີມ ເຊັ່ນ ລົດຊາດ ຂະໜາດ ປະລິມານ..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-none focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              ຍົກເລີກ
            </button>
            <button
              type="submit"
              disabled={saving || imageUploading || !canCreateProduct}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg cursor-pointer"
            >
              {saving ? 'ກຳລັງບັນທຶກສິນຄ້າ...' : 'ບັນທຶກ ແລະ ເພີ່ມໃສ່ກະຕ່າ'}
            </button>
          </div>
        </form>
      </div>

      {scannerOpen && (
        <BarcodeQrScannerModal
          title="ສະແກນບາໂຄດ / QR Code ສິນຄ້າໃໝ່"
          subtitle="ສະແກນເພື່ອປ້ອນລະຫັດບາໂຄດລົງໃນຟອມສິນຄ້າທັນທີ"
          onDetected={(code) => {
            setBarcode(code.trim().slice(0, 64));
            setScannerOpen(false);
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </div>
  );
}
