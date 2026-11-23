import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { CheckCircle2, PackagePlus, Search } from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { hasPermission } from '../../core/rbac/permissions';
import { formatDateTimeVientiane } from '../../core/utils/date';
import { formatLak } from '../../core/utils/money';
import { executeStockIn } from './stockService';
import type { InventoryBalance, Product, StockMovement } from '../../core/firebase/types';

export function StockInPage() {
  const { userProfile, activeBranchId } = useFirebase();
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<Map<string, InventoryBalance>>(new Map());
  const [recentMoves, setRecentMoves] = useState<StockMovement[]>([]);

  const [productSearch, setProductSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [inputQty, setInputQty] = useState('1');
  const [unitCostLak, setUnitCostLak] = useState('0');
  const [lotNumber, setLotNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [storageLocationName, setStorageLocationName] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [reason, setReason] = useState('');

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const canCreate = hasPermission(userProfile, 'stock_in', 'create');

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
            .filter((m) => m.movementType === 'stock_in' || m.movementType === 'initial'),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'stockMovements'),
    );

    return () => {
      unsubProds();
      unsubInv();
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

  const handleSelectProduct = (prodId: string) => {
    setSelectedProductId(prodId);
    const prod = products.find((p) => p.productId === prodId);
    if (prod) {
      const unit = prod.units[0];
      setSelectedUnitId(unit?.unitId ?? '');
      const baseCost = balances.get(prod.productId)?.avgCostLak ?? prod.costPriceLak;
      setUnitCostLak(String(Math.round(baseCost * (unit?.conversionFactor ?? 1))));
      setStorageLocationName(prod.storageLocationName || '');
    }
    setNotice(null);
  };

  const handleUnitChange = (unitId: string) => {
    setSelectedUnitId(unitId);
    if (!selectedProduct) return;
    const unit = selectedProduct.units.find((u) => u.unitId === unitId);
    if (unit) {
      const baseCost =
        balances.get(selectedProduct.productId)?.avgCostLak ?? selectedProduct.costPriceLak;
      setUnitCostLak(String(Math.round(baseCost * unit.conversionFactor)));
    }
  };

  const addedBaseQty = useMemo(() => {
    const qty = Math.max(0, Number(inputQty) || 0);
    const factor = selectedUnit?.conversionFactor ?? 1;
    return Math.round(qty * factor);
  }, [inputQty, selectedUnit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !selectedProduct || !selectedUnit || !canCreate || savingRef.current) return;

    if (selectedProduct.trackExpiry && !expiryDate.trim()) {
      setNotice({
        type: 'err',
        text: 'ສິນຄ້ານີ້ຕັ້ງຄ່າຕິດຕາມວັນໝົດອາຍຸ ກະລຸນາລະບຸວັນໝົດອາຍຸຂອງລ໋ອດ',
      });
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setNotice(null);

    try {
      await executeStockIn({
        db,
        user: userProfile,
        branchId: activeBranchId,
        product: selectedProduct,
        unitName: selectedUnit.unitName,
        conversionFactor: selectedUnit.conversionFactor,
        inputQty: Number(inputQty) || 0,
        unitCostPerInputUnitLak: Number(unitCostLak) || 0,
        lotNumber,
        expiryDate: expiryDate || null,
        storageLocationName,
        reason: reason || 'ຮັບສິນຄ້າເຂົ້າສາງ',
        referenceNo,
      });

      setNotice({
        type: 'ok',
        text: `ຮັບສິນຄ້າ "${selectedProduct.name}" ເຂົ້າສາງຈຳນວນ +${addedBaseQty.toLocaleString('en-US')} ${selectedProduct.baseUnitName} ສຳເລັດແລ້ວ`,
      });
      setInputQty('1');
      setLotNumber('');
      setExpiryDate('');
      setReferenceNo('');
      setReason('');
    } catch (err) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'ບໍ່ສາມາດຮັບສິນຄ້າເຂົ້າສາງໄດ້',
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">ຮັບສິນຄ້າເຂົ້າສາງ</h2>
          <p className="text-xs text-slate-500">
            ຮອງຮັບການຮັບເຂົ້າຕາມໜ່ວຍໃຫຍ່ (ແພັກ/ລັງ) ຄິດໄລ່ຕົ້ນທຶນ WAC ແລະ ອັບເດດສະຕັອກທັນທີ
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
                ຄົ້ນຫາສິນຄ້າ (ຊື່ / SKU / ບາໂຄ້ດ)
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
                  placeholder="ພິມຊື່ສິນຄ້າ ຫຼື ສະແກນບາໂຄ້ດ..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">ເລືອກສິນຄ້າ *</label>
              <select
                required
                value={selectedProductId}
                onChange={(e) => handleSelectProduct(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
              >
                <option value="">— ເລືອກສິນຄ້າ —</option>
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
                  ຄົງເຫຼືອປັດຈຸບັນ:{' '}
                  <strong className="text-slate-900 tabular-nums">
                    {(balances.get(selectedProduct.productId)?.qtyOnHandBase ?? 0).toLocaleString('en-US')}{' '}
                    {selectedProduct.baseUnitName}
                  </strong>
                </div>
                <div>
                  ຈະຮັບເຂົ້າເພີ່ມ:{' '}
                  <strong className="text-blue-700 tabular-nums">
                    +{addedBaseQty.toLocaleString('en-US')} {selectedProduct.baseUnitName}
                  </strong>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">ໜ່ວຍທີ່ຮັບເຂົ້າ *</label>
                  <select
                    value={selectedUnit?.unitId ?? ''}
                    onChange={(e) => handleUnitChange(e.target.value)}
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
                  <label className="block text-xs font-medium text-slate-700 mb-1">ຈຳນວນຮັບເຂົ້າ *</label>
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
                    ລາຄາທຶນຕໍ່ {selectedUnit?.unitName || 'ໜ່ວຍ'} (LAK) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={unitCostLak}
                    onChange={(e) => setUnitCostLak(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">ເລກລ໋ອດ (Lot No.)</label>
                  <input
                    type="text"
                    maxLength={60}
                    value={lotNumber}
                    onChange={(e) => setLotNumber(e.target.value)}
                    placeholder="ສ້າງອັດຕະໂນມັດຫາກປ່ອຍວ່າງ"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ວັນໝົດອາຍຸ {selectedProduct.trackExpiry ? '*' : '(ຖ້າມີ)'}
                  </label>
                  <input
                    type="date"
                    required={selectedProduct.trackExpiry}
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">ຕຳແໜ່ງຈັດເກັບ</label>
                  <input
                    type="text"
                    maxLength={100}
                    value={storageLocationName}
                    onChange={(e) => setStorageLocationName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ເລກທີເອກະສານອ້າງອີງ (ຖ້າມີ)
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    placeholder="ເຊັ່ນ ເລກບິນຜູ້ສະໜອງ"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">ໝາຍເຫດ</label>
                  <input
                    type="text"
                    maxLength={300}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="ເຊັ່ນ ຮັບສິນຄ້າເຂົ້າຮອບເຊົ້າ"
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
                    <PackagePlus className="w-4 h-4" />
                    {saving ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກຮັບສິນຄ້າເຂົ້າສາງ'}
                  </button>
                </div>
              )}
            </>
          )}
        </form>
      </div>

      {/* Recent Stock In History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-semibold text-slate-900">
          ປະຫວັດຮັບສິນຄ້າເຂົ້າຫຼ້າສຸດ
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-2.5 px-4">ວັນເວລາ</th>
                <th className="py-2.5 px-4">ສິນຄ້າ / ລ໋ອດ</th>
                <th className="py-2.5 px-4 text-right">ຈຳນວນຮັບເຂົ້າ</th>
                <th className="py-2.5 px-4 text-right">ລວມໜ່ວຍພື້ນຖານ</th>
                <th className="py-2.5 px-4 text-right">ມູນຄ່າລວມ</th>
                <th className="py-2.5 px-4">ຜູ້ບັນທຶກ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {recentMoves.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    ຍັງບໍ່ມີລາຍການຮັບສິນຄ້າເຂົ້າ
                  </td>
                </tr>
              )}
              {recentMoves.map((m) => (
                <tr key={m.movementId} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 text-slate-500 tabular-nums whitespace-nowrap">
                    {formatDateTimeVientiane(m.createdAt)}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-slate-900">{m.productNameSnapshot}</div>
                    <div className="text-slate-500 font-mono">
                      {m.skuSnapshot} {m.lotNumberSnapshot ? `· ${m.lotNumberSnapshot}` : ''}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-slate-700">
                    {m.inputQty.toLocaleString('en-US')} {m.unitName}
                  </td>
                  <td className="py-2.5 px-4 text-right font-semibold text-green-700 tabular-nums">
                    +{m.baseQtyDelta.toLocaleString('en-US')}
                  </td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-slate-800">
                    {formatLak(m.totalCostLak)}
                  </td>
                  <td className="py-2.5 px-4 text-slate-600">{m.performedByName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
