import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { CheckCircle2, Eye, PackageCheck, Plus, Trash2, X, XCircle } from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { hasPermission } from '../../core/rbac/permissions';
import { formatDateTimeVientiane } from '../../core/utils/date';
import { formatLak } from '../../core/utils/money';
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  receivePurchaseOrder,
} from './purchasingService';
import type {
  Product,
  PurchaseOrder,
  PurchaseOrderItem,
  Supplier,
} from '../../core/firebase/types';

interface DraftPoLine {
  productId: string;
  unitId: string;
  qty: number;
  unitCostLak: number;
  lotNumber: string;
  expiryDate: string;
}

function addDaysYmd(days: number): string {
  const d = new Date(Date.now() + days * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Vientiane' }).format(d);
}

const PO_STATUS_LABELS: Record<PurchaseOrder['status'], string> = {
  ordered: 'ລໍຖ້າຮັບເຂົ້າສາງ',
  received: 'ຮັບເຂົ້າສາງແລ້ວ',
  cancelled: 'ຍົກເລີກແລ້ວ',
};

export function PurchaseOrdersPage() {
  const { userProfile, activeBranchId } = useFirebase();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | PurchaseOrder['status']>('all');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Create Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('cash');
  const [dueDate, setDueDate] = useState(addDaysYmd(30));
  const [discountLak, setDiscountLak] = useState('0');
  const [shippingFeeLak, setShippingFeeLak] = useState('0');
  const [taxAmountLak, setTaxAmountLak] = useState('0');
  const [notes, setNotes] = useState('');
  const [draftLines, setDraftLines] = useState<DraftPoLine[]>([]);
  const [saving, setSaving] = useState(false);

  // Detail Modal
  const [viewingPo, setViewingPo] = useState<PurchaseOrder | null>(null);

  const canCreate = hasPermission(userProfile, 'purchasing', 'create');
  const canApprove = hasPermission(userProfile, 'purchasing', 'approve');

  useEffect(() => {
    if (!userProfile) return;
    const orgId = userProfile.organizationId;

    const unsubPos = onSnapshot(
      query(
        collection(db, 'purchaseOrders'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
        orderBy('createdAt', 'desc'),
      ),
      (snap) => setOrders(snap.docs.map((d) => d.data() as PurchaseOrder)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'purchaseOrders'),
    );

    const unsubSup = onSnapshot(
      query(collection(db, 'suppliers'), where('organizationId', '==', orgId)),
      (snap) =>
        setSuppliers(
          snap.docs
            .map((d) => d.data() as Supplier)
            .filter((s) => s.status === 'active')
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      (err) => handleFirestoreError(err, OperationType.LIST, 'suppliers'),
    );

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

    return () => {
      unsubPos();
      unsubSup();
      unsubProds();
    };
  }, [userProfile, activeBranchId]);

  const productsMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.productId, p));
    return map;
  }, [products]);

  const filteredOrders = useMemo(
    () => (statusFilter === 'all' ? orders : orders.filter((o) => o.status === statusFilter)),
    [orders, statusFilter],
  );

  const openCreateModal = () => {
    const firstSup = suppliers[0];
    const firstProd = products[0];
    const firstUnit = firstProd ? firstProd.units.find((u) => u.isBaseUnit) ?? firstProd.units[0] : null;
    setSelectedSupplierId(firstSup?.supplierId ?? '');
    setPaymentType(firstSup && firstSup.paymentTermDays > 0 ? 'credit' : 'cash');
    setDueDate(addDaysYmd(firstSup?.paymentTermDays || 30));
    setDiscountLak('0');
    setShippingFeeLak('0');
    setTaxAmountLak('0');
    setNotes('');
    setDraftLines(
      firstProd && firstUnit
        ? [
            {
              productId: firstProd.productId,
              unitId: firstUnit.unitId,
              qty: 1,
              unitCostLak: Math.round(firstProd.costPriceLak * firstUnit.conversionFactor),
              lotNumber: `LOT-${addDaysYmd(0).replace(/-/g, '')}`,
              expiryDate: '',
            },
          ]
        : [],
    );
    setCreateOpen(true);
  };

  const addDraftLine = () => {
    const firstProd = products[0];
    if (!firstProd) return;
    const firstUnit = firstProd.units.find((u) => u.isBaseUnit) ?? firstProd.units[0];
    if (!firstUnit) return;
    setDraftLines((prev) => [
      ...prev,
      {
        productId: firstProd.productId,
        unitId: firstUnit.unitId,
        qty: 1,
        unitCostLak: Math.round(firstProd.costPriceLak * firstUnit.conversionFactor),
        lotNumber: `LOT-${addDaysYmd(0).replace(/-/g, '')}`,
        expiryDate: '',
      },
    ]);
  };

  const draftSubtotalLak = useMemo(
    () =>
      draftLines.reduce(
        (sum, l) => sum + Math.round(Math.max(1, l.qty) * Math.max(0, l.unitCostLak)),
        0,
      ),
    [draftLines],
  );

  const draftGrandTotalLak = useMemo(() => {
    const disc = Math.min(draftSubtotalLak, Math.max(0, Math.round(Number(discountLak) || 0)));
    const ship = Math.max(0, Math.round(Number(shippingFeeLak) || 0));
    const tax = Math.max(0, Math.round(Number(taxAmountLak) || 0));
    return Math.max(0, draftSubtotalLak - disc + ship + tax);
  }, [draftSubtotalLak, discountLak, shippingFeeLak, taxAmountLak]);

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    const sup = suppliers.find((s) => s.supplierId === selectedSupplierId);
    if (!sup) {
      setFeedback({ type: 'err', text: 'ກະລຸນາເລືອກຜູ້ສະໜອງ (ເພີ່ມຜູ້ສະໜອງກ່ອນຖ້າຍັງບໍ່ມີ)' });
      return;
    }

    const poItems: PurchaseOrderItem[] = [];
    for (const line of draftLines) {
      const prod = productsMap.get(line.productId);
      if (!prod) continue;
      const unit = prod.units.find((u) => u.unitId === line.unitId) ?? prod.units[0];
      if (!unit) continue;
      const qty = Math.max(1, Math.round(line.qty));
      const unitCostLak = Math.max(0, Math.round(line.unitCostLak));
      const factor = Math.max(1, Math.round(unit.conversionFactor));
      poItems.push({
        productId: prod.productId,
        sku: prod.sku,
        name: prod.name,
        unitId: unit.unitId,
        unitName: unit.unitName,
        conversionFactor: factor,
        qty,
        baseQty: qty * factor,
        unitCostLak,
        lineTotalLak: Math.round(qty * unitCostLak),
        lotNumber: line.lotNumber.trim() || `LOT-${addDaysYmd(0).replace(/-/g, '')}`,
        expiryDate: line.expiryDate || null,
      });
    }

    if (poItems.length === 0) return;

    setSaving(true);
    setFeedback(null);
    try {
      const created = await createPurchaseOrder({
        db,
        user: userProfile,
        branchId: activeBranchId,
        supplier: sup,
        items: poItems,
        discountLak: Number(discountLak) || 0,
        shippingFeeLak: Number(shippingFeeLak) || 0,
        taxAmountLak: Number(taxAmountLak) || 0,
        paymentType,
        dueDate: paymentType === 'credit' ? dueDate : null,
        notes,
      });
      setCreateOpen(false);
      setFeedback({
        type: 'ok',
        text: `ສ້າງໃບສັ່ງຊື້ ${created.poNumber} ສຳເລັດ ກົດ "ຮັບສິນຄ້າເຂົ້າສາງ" ເມື່ອສິນຄ້າມາຮອດ`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ບໍ່ສາມາດສ້າງໃບສັ່ງຊື້ໄດ້',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReceivePo = async (po: PurchaseOrder) => {
    if (!userProfile) return;
    setProcessingId(po.poId);
    setFeedback(null);
    try {
      await receivePurchaseOrder({
        db,
        user: userProfile,
        branchId: activeBranchId,
        po,
        productsMap,
      });
      setFeedback({
        type: 'ok',
        text: `ຮັບສິນຄ້າຕາມໃບສັ່ງຊື້ ${po.poNumber} ເຂົ້າສາງ ແລະ ຄຳນວນຕົ້ນທຶນ WAC ຮຽບຮ້ອຍແລ້ວ`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ບໍ່ສາມາດຮັບສິນຄ້າຕາມ PO ໄດ້',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancelPo = async (po: PurchaseOrder) => {
    if (!userProfile) return;
    setProcessingId(po.poId);
    setFeedback(null);
    try {
      await cancelPurchaseOrder({ db, user: userProfile, branchId: activeBranchId, po });
      setFeedback({ type: 'ok', text: `ຍົກເລີກໃບສັ່ງຊື້ ${po.poNumber} ແລ້ວ` });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ບໍ່ສາມາດຍົກເລີກໃບສັ່ງຊື້ໄດ້',
      });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {feedback && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
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

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">ລໍຖ້າຮັບເຂົ້າສາງ (Ordered)</div>
          <div className="text-2xl font-bold text-amber-700 tabular-nums mt-1">
            {orders.filter((o) => o.status === 'ordered').length} ໃບ
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">ຮັບສິນຄ້າແລ້ວ (Received)</div>
          <div className="text-2xl font-bold text-green-700 tabular-nums mt-1">
            {orders.filter((o) => o.status === 'received').length} ໃບ
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">ມູນຄ່າຮັບຊື້ສະສົມ</div>
          <div className="text-2xl font-bold text-blue-700 tabular-nums mt-1">
            {formatLak(
              orders
                .filter((o) => o.status === 'received')
                .reduce((s, o) => s + o.grandTotalLak, 0),
            )}
          </div>
        </div>
      </div>

      {/* Filter & Create Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex bg-slate-100 p-1 rounded-lg self-start flex-wrap">
          {(['all', 'ordered', 'received', 'cancelled'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                statusFilter === st
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st === 'all' ? 'ທັງໝົດ' : PO_STATUS_LABELS[st]}
            </button>
          ))}
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-lg cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            ສ້າງໃບສັ່ງຊື້ (PO)
          </button>
        )}
      </div>

      {/* PO Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">ເລກທີ PO</th>
                <th className="py-3 px-4">ຜູ້ສະໜອງ</th>
                <th className="py-3 px-4">ປະເພດຊຳລະ</th>
                <th className="py-3 px-4 text-right">ຍອດສຸດທິ</th>
                <th className="py-3 px-4">ສະຖານະ</th>
                <th className="py-3 px-4">ວັນທີສ້າງ</th>
                <th className="py-3 px-4 text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredOrders.map((po) => (
                <tr key={po.poId} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono text-xs font-bold text-blue-700">
                    {po.poNumber}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{po.supplierName}</div>
                    <div className="text-xs text-slate-500">{po.items.length} ລາຍການສິນຄ້າ</div>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-700">
                    {po.paymentType === 'credit'
                      ? `ເຄຣດິດ (ຄົບກຳນົດ ${po.dueDate || '-'})`
                      : 'ເງິນສົດ'}
                  </td>
                  <td className="py-3 px-4 text-right font-bold tabular-nums text-slate-900">
                    {formatLak(po.grandTotalLak)}
                  </td>
                  <td className="py-3 px-4 text-xs">
                    <span
                      className={`font-semibold ${
                        po.status === 'received'
                          ? 'text-green-700'
                          : po.status === 'ordered'
                            ? 'text-amber-700'
                            : 'text-slate-400'
                      }`}
                    >
                      {PO_STATUS_LABELS[po.status]}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500 tabular-nums">
                    {formatDateTimeVientiane(po.createdAt)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setViewingPo(po)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        ເບິ່ງ
                      </button>
                      {po.status === 'ordered' && canApprove && (
                        <>
                          <button
                            type="button"
                            disabled={processingId === po.poId}
                            onClick={() => handleReceivePo(po)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded cursor-pointer disabled:opacity-50"
                          >
                            <PackageCheck className="w-3.5 h-3.5" />
                            ຮັບເຂົ້າສາງ
                          </button>
                          <button
                            type="button"
                            disabled={processingId === po.poId}
                            onClick={() => handleCancelPo(po)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            ຍົກເລີກ
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-xs text-slate-500">
                    ຍັງບໍ່ມີລາຍການໃບສັ່ງຊື້ໃນສະຖານະທີ່ເລືອກ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create PO Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-xl p-6 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-semibold text-slate-900">ສ້າງໃບສັ່ງຊື້ສິນຄ້າໃໝ່ (PO)</h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreatePo} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ຜູ້ສະໜອງ *
                  </label>
                  <select
                    required
                    value={selectedSupplierId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedSupplierId(id);
                      const sup = suppliers.find((s) => s.supplierId === id);
                      if (sup && sup.paymentTermDays > 0) {
                        setPaymentType('credit');
                        setDueDate(addDaysYmd(sup.paymentTermDays));
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="">-- ເລືອກຜູ້ສະໜອງ --</option>
                    {suppliers.map((s) => (
                      <option key={s.supplierId} value={s.supplierId}>
                        {s.code} · {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ເງື່ອນໄຂຊຳລະເງິນ
                  </label>
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value as 'cash' | 'credit')}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="cash">ເງິນສົດ (ຊຳລະທັນທີເມື່ອຮັບເຄື່ອງ)</option>
                    <option value="credit">ເຄຣດິດ (ຕັ້ງເຈົ້າໜີ້ AP)</option>
                  </select>
                </div>
                {paymentType === 'credit' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      ວັນຄົບກຳນົດຊຳລະ
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                    />
                  </div>
                )}
              </div>

              {/* Line items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">ລາຍການສິນຄ້າທີ່ສັ່ງຊື້</span>
                  <button
                    type="button"
                    onClick={addDraftLine}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    ເພີ່ມລາຍການສິນຄ້າ
                  </button>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {draftLines.map((line, idx) => {
                    const prod = productsMap.get(line.productId);
                    const units = prod?.units ?? [];
                    return (
                      <div
                        key={idx}
                        className="grid grid-cols-12 gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg items-center text-xs"
                      >
                        <select
                          value={line.productId}
                          onChange={(e) => {
                            const nextProd = productsMap.get(e.target.value);
                            const nextUnit = nextProd
                              ? nextProd.units.find((u) => u.isBaseUnit) ?? nextProd.units[0]
                              : null;
                            const next = [...draftLines];
                            next[idx] = {
                              ...next[idx],
                              productId: e.target.value,
                              unitId: nextUnit?.unitId ?? '',
                              unitCostLak: nextProd
                                ? Math.round(nextProd.costPriceLak * (nextUnit?.conversionFactor ?? 1))
                                : 0,
                            };
                            setDraftLines(next);
                          }}
                          className="col-span-4 px-2 py-1.5 bg-white border border-slate-200 rounded"
                        >
                          {products.map((p) => (
                            <option key={p.productId} value={p.productId}>
                              {p.sku} · {p.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={line.unitId}
                          onChange={(e) => {
                            const nextUnit = units.find((u) => u.unitId === e.target.value);
                            const next = [...draftLines];
                            next[idx] = {
                              ...next[idx],
                              unitId: e.target.value,
                              unitCostLak: prod
                                ? Math.round(prod.costPriceLak * (nextUnit?.conversionFactor ?? 1))
                                : next[idx].unitCostLak,
                            };
                            setDraftLines(next);
                          }}
                          className="col-span-2 px-2 py-1.5 bg-white border border-slate-200 rounded"
                        >
                          {units.map((u) => (
                            <option key={u.unitId} value={u.unitId}>
                              {u.unitName} (x{u.conversionFactor})
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={1}
                          value={line.qty}
                          onChange={(e) => {
                            const next = [...draftLines];
                            next[idx] = { ...next[idx], qty: Math.max(1, Number(e.target.value) || 1) };
                            setDraftLines(next);
                          }}
                          placeholder="ຈຳນວນ"
                          className="col-span-1 px-2 py-1.5 bg-white border border-slate-200 rounded text-right tabular-nums"
                        />
                        <input
                          type="number"
                          min={0}
                          value={line.unitCostLak}
                          onChange={(e) => {
                            const next = [...draftLines];
                            next[idx] = {
                              ...next[idx],
                              unitCostLak: Math.max(0, Math.round(Number(e.target.value) || 0)),
                            };
                            setDraftLines(next);
                          }}
                          placeholder="ທຶນ/ໜ່ວຍ"
                          className="col-span-2 px-2 py-1.5 bg-white border border-slate-200 rounded text-right tabular-nums"
                        />
                        <input
                          type="date"
                          value={line.expiryDate}
                          onChange={(e) => {
                            const next = [...draftLines];
                            next[idx] = { ...next[idx], expiryDate: e.target.value };
                            setDraftLines(next);
                          }}
                          title="ວັນໝົດອາຍຸ (ຖ້າມີ)"
                          className="col-span-2 px-2 py-1.5 bg-white border border-slate-200 rounded"
                        />
                        <button
                          type="button"
                          disabled={draftLines.length <= 1}
                          onClick={() => setDraftLines((prev) => prev.filter((_, i) => i !== idx))}
                          className="col-span-1 p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer flex justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Costs Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">ສ່ວນຫຼຸດຮັບ (₭)</label>
                  <input
                    type="number"
                    min={0}
                    value={discountLak}
                    onChange={(e) => setDiscountLak(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-right tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">ຄ່າຂົນສົ່ງ (₭)</label>
                  <input
                    type="number"
                    min={0}
                    value={shippingFeeLak}
                    onChange={(e) => setShippingFeeLak(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-right tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">ພາສີຊື້ (₭)</label>
                  <input
                    type="number"
                    min={0}
                    value={taxAmountLak}
                    onChange={(e) => setTaxAmountLak(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-right tabular-nums"
                  />
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 flex flex-col justify-center text-right tabular-nums">
                  <span className="text-[11px] text-slate-600">ຍອດສັ່ງຊື້ສຸດທິ</span>
                  <span className="text-lg font-bold text-blue-700">{formatLak(draftGrandTotalLak)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">ໝາຍເຫດ</label>
                <input
                  type="text"
                  maxLength={300}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg cursor-pointer"
                >
                  ຍົກເລີກ
                </button>
                <button
                  type="submit"
                  disabled={saving || draftLines.length === 0}
                  className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  {saving ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກໃບສັ່ງຊື້'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PO Detail Modal */}
      {viewingPo && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  ລາຍລະອຽດໃບສັ່ງຊື້ {viewingPo.poNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  ຜູ້ສະໜອງ: {viewingPo.supplierName} · {PO_STATUS_LABELS[viewingPo.status]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingPo(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto text-xs mb-4">
              {viewingPo.items.map((it, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{it.name}</div>
                    <div className="text-slate-500 font-mono">
                      {it.sku} · {it.qty} {it.unitName} ({it.baseQty} ໜ່ວຍພື້ນຖານ) · ລ໋ອດ {it.lotNumber}
                      {it.expiryDate ? ` · EXP ${it.expiryDate}` : ''}
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="font-bold text-slate-900">{formatLak(it.lineTotalLak)}</div>
                    <div className="text-slate-400">@{formatLak(it.unitCostLak)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1 text-xs tabular-nums">
              <div className="flex justify-between text-slate-600">
                <span>ລວມຄ່າສິນຄ້າ</span>
                <span>{formatLak(viewingPo.subtotalLak)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>ສ່ວນຫຼຸດ / ຄ່າຂົນສົ່ງ / ພາສີ</span>
                <span>
                  -{formatLak(viewingPo.discountLak)} / +{formatLak(viewingPo.shippingFeeLak)} / +{formatLak(viewingPo.taxAmountLak)}
                </span>
              </div>
              <div className="flex justify-between font-bold text-sm text-blue-700 pt-1 border-t border-slate-200">
                <span>ຍອດສຸດທິທັງໝົດ</span>
                <span>{formatLak(viewingPo.grandTotalLak)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
