import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { CheckCircle2, PackageMinus, Search } from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { hasPermission } from '../../core/rbac/permissions';
import { formatDateTimeVientiane, formatDateVientiane } from '../../core/utils/date';
import { formatLak } from '../../core/utils/money';
import { executeStockOut, formatMultiUnitBreakdown } from './stockService';
import type {
  InventoryBalance,
  InventoryLot,
  Product,
  StockMovement,
} from '../../core/firebase/types';

type OutReasonType = 'stock_out' | 'damaged' | 'expired' | 'lost';

const OUT_TYPE_LABELS: Record<OutReasonType, string> = {
  stock_out: 'เบิกใช้งาน / เบิกหน้าร้าน',
  damaged: 'สินค้าชำรุด / เสียหาย',
  expired: 'ตัดสินค้าหมดอายุ',
  lost: 'สินค้าสูญหาย',
};

export function StockOutPage() {
  const { userProfile, activeBranchId, settings } = useFirebase();
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<Map<string, InventoryBalance>>(new Map());
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [recentMoves, setRecentMoves] = useState<StockMovement[]>([]);

  const [productSearch, setProductSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [movementType, setMovementType] = useState<OutReasonType>('stock_out');
  const [specificLotId, setSpecificLotId] = useState('');
  const [inputQty, setInputQty] = useState('1');
  const [referenceNo, setReferenceNo] = useState('');
  const [reason, setReason] = useState('');

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const canCreate = hasPermission(userProfile, 'stock_out', 'create');
  const allowNegativeStock = Boolean(settings?.inventorySettings?.allowNegativeStock);

  useEffect(() => {
    if (!userProfile) return;
    const orgId = userProfile.organizationId;

    const unsubProds = onSnapshot(
      query(collection(db, 'products'), where('organizationId', '==', orgId)),
      (snap) =>
        setProducts(
          snap.docs
            .map((d) => d.data() as Product)
            .filter((p) => p.status === 'active')
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'products'),
    );

    const unsubInv = onSnapshot(
      query(
        collection(db, 'inventory'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
      ),
      (snap) => {
        const map = new Map<string, InventoryBalance>();
        snap.docs.forEach((d) => {
          const b = d.data() as InventoryBalance;
          map.set(b.productId, b);
        });
        setBalances(map);
      },
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
        limit(30),
      ),
      (snap) => {
        setRecentMoves(
          snap.docs
            .map((d) => d.data() as StockMovement)
            .filter((m) =>
              ['stock_out', 'damaged', 'expired', 'lost'].includes(m.movementType),
            ),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'stockMovements'),
    );

    return () => {
      unsubProds();
      unsubInv();
      unsubLots();
      unsubMov();
    };
  }, [userProfile, activeBranchId]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.barcodes.some((b) => b.toLowerCase().includes(q)),
    );
  }, [products, productSearch]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.productId === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  const selectedUnit = useMemo(() => {
    if (!selectedProduct) return null;
    return (
      selectedProduct.units.find((u) => u.unitId === selectedUnitId) ??
      selectedProduct.units[0] ??
      null
    );
  }, [selectedProduct, selectedUnitId]);

  const productActiveLots = useMemo(() => {
    if (!selectedProduct) return [];
    return lots
      .filter(
        (l) =>
          l.productId === selectedProduct.productId &&
          l.status === 'active' &&
          l.remainingQtyBase > 0,
      )
      .sort((a, b) => {
        if (a.expiryDate && b.expiryDate) return a.expiryDate.localeCompare(b.expiryDate);
        if (a.expiryDate) return -1;
        if (b.expiryDate) return 1;
        return (a.receivedAt?.toMillis?.() ?? 0) - (b.receivedAt?.toMillis?.() ?? 0);
      });
  }, [lots, selectedProduct]);

  const handleSelectProduct = (prodId: string) => {
    setSelectedProductId(prodId);
    const prod = products.find((p) => p.productId === prodId);
    if (prod) {
      setSelectedUnitId(prod.units[0]?.unitId ?? '');
      setSpecificLotId('');
    }
    setNotice(null);
  };

  const deductBaseQty = useMemo(() => {
    const qty = Math.max(0, Number(inputQty) || 0);
    const factor = selectedUnit?.conversionFactor ?? 1;
    return Math.round(qty * factor);
  }, [inputQty, selectedUnit]);

  const currentBaseQty = selectedProduct
    ? (balances.get(selectedProduct.productId)?.qtyOnHandBase ?? 0)
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !selectedProduct || !selectedUnit || !canCreate) return;

    setSaving(true);
    setNotice(null);

    try {
      await executeStockOut({
        db,
        user: userProfile,
        branchId: activeBranchId,
        product: selectedProduct,
        unitName: selectedUnit.unitName,
        conversionFactor: selectedUnit.conversionFactor,
        inputQty: Number(inputQty) || 0,
        movementType,
        specificLotId: specificLotId || null,
        reason: reason || OUT_TYPE_LABELS[movementType],
        referenceNo,
        allowNegativeStock,
      });

      setNotice({
        type: 'ok',
        text: `บันทึกตัดสต็อก "${selectedProduct.name}" จำนวน -${deductBaseQty.toLocaleString('en-US')} ${selectedProduct.baseUnitName} เรียบร้อยแล้ว`,
      });
      setInputQty('1');
      setSpecificLotId('');
      setReferenceNo('');
      setReason('');
    } catch (err) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'ไม่สามารถเบิกสินค้าออกได้',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            เบิกสินค้าออก / ตัดสินค้าเสียหาย หมดอายุ สูญหาย
          </h2>
          <p className="text-xs text-slate-500">
            รองรับการตัดสต็อกแบบ FEFO (ล็อตหมดอายุก่อนออกก่อน) หรือเลือกล็อตเฉพาะ พร้อมอัปเดต Stock Ledger ทันที
          </p>
        </div>

        {notice && (
          <div
            className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
              notice.type === 'ok'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {notice.type === 'ok' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {notice.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ค้นหาสินค้า (ชื่อ / SKU / บาร์โค้ด)
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => {
                    const val = e.target.value;
                    setProductSearch(val);
                    const exact = products.find(
                      (p) =>
                        p.barcode.toLowerCase() === val.trim().toLowerCase() ||
                        p.barcodes.some((b) => b.toLowerCase() === val.trim().toLowerCase()),
                    );
                    if (exact) handleSelectProduct(exact.productId);
                  }}
                  placeholder="พิมพ์ชื่อสินค้า หรือยิงสแกนบาร์โค้ด..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">เลือกสินค้า *</label>
              <select
                required
                value={selectedProductId}
                onChange={(e) => handleSelectProduct(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                <option value="">— เลือกสินค้า —</option>
                {filteredProducts.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {p.sku} · {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedProduct && (
            <>
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  คงเหลือปัจจุบัน:{' '}
                  <strong className="text-slate-900 tabular-nums">
                    {formatMultiUnitBreakdown(
                      currentBaseQty,
                      selectedProduct.units,
                      selectedProduct.baseUnitName,
                    )}{' '}
                    ({currentBaseQty.toLocaleString('en-US')} {selectedProduct.baseUnitName})
                  </strong>
                </div>
                <div>
                  หลังตัดสต็อก:{' '}
                  <strong
                    className={`tabular-nums ${
                      currentBaseQty - deductBaseQty < 0 ? 'text-red-600' : 'text-blue-700'
                    }`}
                  >
                    {(currentBaseQty - deductBaseQty).toLocaleString('en-US')}{' '}
                    {selectedProduct.baseUnitName}
                  </strong>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">ประเภทการเบิกออก *</label>
                  <select
                    value={movementType}
                    onChange={(e) => setMovementType(e.target.value as OutReasonType)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {(Object.keys(OUT_TYPE_LABELS) as OutReasonType[]).map((k) => (
                      <option key={k} value={k}>
                        {OUT_TYPE_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">หน่วยที่เบิก *</label>
                  <select
                    value={selectedUnit?.unitId ?? ''}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {selectedProduct.units.map((u) => (
                      <option key={u.unitId} value={u.unitId}>
                        {u.unitName} (x{u.conversionFactor} {selectedProduct.baseUnitName})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">จำนวนที่เบิก *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={inputQty}
                    onChange={(e) => setInputQty(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    เลือกล็อต (ค่าเริ่มต้น: FEFO)
                  </label>
                  <select
                    value={specificLotId}
                    onChange={(e) => setSpecificLotId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="">ตัดอัตโนมัติ (FEFO)</option>
                    {productActiveLots.map((l) => (
                      <option key={l.lotId} value={l.lotId}>
                        {l.lotNumber} · คงเหลือ {l.remainingQtyBase}{' '}
                        {l.expiryDate ? `(หมดอายุ ${formatDateVientiane(l.expiryDate)})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    เลขที่เอกสารอ้างอิง (ถ้ามี)
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    เหตุผล / หมายเหตุ *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={300}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="ระบุสาเหตุการเบิกหรือตัดสต็อก"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {canCreate && (
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg cursor-pointer"
                  >
                    <PackageMinus className="w-4 h-4" />
                    {saving ? 'กำลังบันทึก...' : 'ยืนยันเบิกสินค้าออก'}
                  </button>
                </div>
              )}
            </>
          )}
        </form>
      </div>

      {/* Recent Stock Out History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-semibold text-slate-900">
          ประวัติการเบิกและตัดสต็อกล่าสุด
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-4">วันเวลา</th>
                <th className="py-2.5 px-4">ประเภท</th>
                <th className="py-2.5 px-4">สินค้า / ล็อต</th>
                <th className="py-2.5 px-4 text-right">จำนวนตัดออก (ฐาน)</th>
                <th className="py-2.5 px-4 text-right">มูลค่าต้นทุน</th>
                <th className="py-2.5 px-4">เหตุผล / ผู้บันทึก</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {recentMoves.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    ยังไม่มีรายการเบิกสินค้าออก
                  </td>
                </tr>
              )}
              {recentMoves.map((m) => (
                <tr key={m.movementId} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 text-slate-500 tabular-nums whitespace-nowrap">
                    {formatDateTimeVientiane(m.createdAt)}
                  </td>
                  <td className="py-2.5 px-4 font-medium text-red-600">
                    {OUT_TYPE_LABELS[m.movementType as OutReasonType] ?? m.movementType}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-slate-900">{m.productNameSnapshot}</div>
                    <div className="text-slate-500 font-mono">
                      {m.skuSnapshot} {m.lotNumberSnapshot ? `· ${m.lotNumberSnapshot}` : ''}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right font-semibold text-red-600 tabular-nums">
                    {m.baseQtyDelta.toLocaleString('en-US')}
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-slate-800">
                    {formatLak(m.totalCostLak)}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600">
                    <div className="font-medium text-slate-800">{m.reason}</div>
                    <div className="text-slate-400">โดย {m.performedByName}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
