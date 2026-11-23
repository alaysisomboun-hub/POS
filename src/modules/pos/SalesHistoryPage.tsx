import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import {
  Ban,
  CheckCircle2,
  Eye,
  Printer,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { hasPermission } from '../../core/rbac/permissions';
import { formatDateTimeVientiane } from '../../core/utils/date';
import { formatLak } from '../../core/utils/money';
import { ReceiptPrintModal } from './ReceiptPrintModal';
import { executeSaleReturn, executeVoidSale } from './posService';
import type {
  PaymentMethodType,
  Product,
  SaleOrder,
  SaleReturn,
} from '../../core/firebase/types';

const STATUS_LABELS: Record<SaleOrder['status'], string> = {
  completed: 'ສຳເລັດ',
  partial_return: 'ຄືນບາງສ່ວນ',
  returned: 'ຄືນທັງບິນ',
  voided: 'ຍົກເລີກບິນ',
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethodType, string> = {
  cash: 'ເງິນສົດ',
  transfer: 'ໂອນເງິນ',
  qr: 'QR Pay',
  credit: 'ຂາຍເຊື່ອ',
  split: 'ຫຼາຍຊ່ອງທາງ',
};

const REFUND_METHOD_LABELS: Record<SaleReturn['refundMethod'], string> = {
  cash: 'ຄືນເງິນສົດ',
  transfer: 'ໂອນເງິນຄືນ',
  credit_adjust: 'ປັບຫຼຸດຍອດໜີ້',
};

export function SalesHistoryPage() {
  const { userProfile, organization, activeBranchId, settings } = useFirebase();

  const [sales, setSales] = useState<SaleOrder[]>([]);
  const [saleReturns, setSaleReturns] = useState<SaleReturn[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [activeTab, setActiveTab] = useState<'sales' | 'returns'>('sales');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SaleOrder['status']>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | PaymentMethodType>('all');

  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Modals
  const [receiptSale, setReceiptSale] = useState<SaleOrder | null>(null);
  const [detailSale, setDetailSale] = useState<SaleOrder | null>(null);

  // Void Modal
  const [voidTarget, setVoidTarget] = useState<SaleOrder | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidSaving, setVoidSaving] = useState(false);

  // Return Modal
  const [returnTarget, setReturnTarget] = useState<SaleOrder | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const [returnRestock, setReturnRestock] = useState<Record<number, boolean>>({});
  const [refundMethod, setRefundMethod] = useState<SaleReturn['refundMethod']>('cash');
  const [returnReason, setReturnReason] = useState('');
  const [returnSaving, setReturnSaving] = useState(false);
  const voidSavingRef = useRef(false);
  const returnSavingRef = useRef(false);

  const canApproveOrEdit =
    hasPermission(userProfile, 'sales_history', 'approve') ||
    hasPermission(userProfile, 'sales_history', 'edit');

  useEffect(() => {
    if (!userProfile) return;
    const orgId = userProfile.organizationId;

    const unsubSales = onSnapshot(
      query(
        collection(db, 'sales'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
        orderBy('createdAt', 'desc'),
        limit(150),
      ),
      (snap) => setSales(snap.docs.map((d) => d.data() as SaleOrder)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'sales'),
    );

    const unsubReturns = onSnapshot(
      query(
        collection(db, 'saleReturns'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
        orderBy('createdAt', 'desc'),
        limit(100),
      ),
      (snap) => setSaleReturns(snap.docs.map((d) => d.data() as SaleReturn)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'saleReturns'),
    );

    const unsubProds = onSnapshot(
      query(collection(db, 'products'), where('organizationId', '==', orgId)),
      (snap) => setProducts(snap.docs.map((d) => d.data() as Product)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'products'),
    );

    return () => {
      unsubSales();
      unsubReturns();
      unsubProds();
    };
  }, [userProfile, activeBranchId]);

  const productsMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.productId, p));
    return map;
  }, [products]);

  const kpiSummary = useMemo(() => {
    let grossSalesLak = 0;
    let activeBillCount = 0;
    let grossProfitLak = 0;
    let voidedAmountLak = 0;

    for (const s of sales) {
      if (s.status === 'voided') {
        voidedAmountLak += s.grandTotalLak;
      } else {
        grossSalesLak += s.grandTotalLak;
        activeBillCount += 1;
        grossProfitLak += s.grossProfitLak;
      }
    }

    const totalRefundLak = saleReturns.reduce((sum, r) => sum + r.totalRefundLak, 0);
    const netSalesLak = Math.max(0, grossSalesLak - totalRefundLak);

    return {
      netSalesLak,
      activeBillCount,
      grossProfitLak,
      refundAndVoidLak: totalRefundLak + voidedAmountLak,
    };
  }, [sales, saleReturns]);

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (paymentFilter !== 'all' && s.paymentMethod !== paymentFilter) return false;
      if (!q) return true;
      return (
        s.invoiceNumber.toLowerCase().includes(q) ||
        s.customerName.toLowerCase().includes(q) ||
        s.cashierName.toLowerCase().includes(q)
      );
    });
  }, [sales, search, statusFilter, paymentFilter]);

  const filteredReturns = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return saleReturns;
    return saleReturns.filter(
      (r) =>
        r.returnNumber.toLowerCase().includes(q) ||
        r.invoiceNumber.toLowerCase().includes(q) ||
        r.performedByName.toLowerCase().includes(q),
    );
  }, [saleReturns, search]);

  const getReturnedBaseByKeyForSale = (saleId: string) => {
    const map = new Map<string, number>();
    for (const ret of saleReturns) {
      if (ret.saleId !== saleId) continue;
      for (const ri of ret.items) {
        const k = `${ri.productId}__${ri.unitName}`;
        map.set(k, (map.get(k) ?? 0) + ri.baseQty);
      }
    }
    return map;
  };

  const openReturnModal = (sale: SaleOrder) => {
    setReturnTarget(sale);
    const initialQtys: Record<number, number> = {};
    const initialRestock: Record<number, boolean> = {};
    sale.items.forEach((_, idx) => {
      initialQtys[idx] = 0;
      initialRestock[idx] = true;
    });
    setReturnQtys(initialQtys);
    setReturnRestock(initialRestock);
    setRefundMethod(sale.creditDueLak > 0 ? 'credit_adjust' : 'cash');
    setReturnReason('');
    setFeedback(null);
  };

  const returnPreviewTotalLak = useMemo(() => {
    if (!returnTarget) return 0;
    const baseNet = returnTarget.subtotalLak - returnTarget.itemDiscountTotalLak;
    const ratio = baseNet > 0 ? returnTarget.grandTotalLak / baseNet : 1;
    return returnTarget.items.reduce((sum, item, idx) => {
      const q = Math.max(0, Math.round(returnQtys[idx] ?? 0));
      if (q <= 0) return sum;
      const perUnit = item.qty > 0 ? Math.round((item.lineTotalLak * ratio) / item.qty) : 0;
      return sum + q * perUnit;
    }, 0);
  }, [returnTarget, returnQtys]);

  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !voidTarget || voidSavingRef.current) return;

    voidSavingRef.current = true;
    setVoidSaving(true);
    try {
      await executeVoidSale({
        db,
        user: userProfile,
        branchId: activeBranchId,
        sale: voidTarget,
        reason: voidReason,
        productsMap,
      });
      setFeedback({
        type: 'ok',
        text: `ຍົກເລີກບິນ ${voidTarget.invoiceNumber} ແລະ ຄືນສະຕັອກສິນຄ້າສຳເລັດແລ້ວ`,
      });
      setVoidTarget(null);
      setVoidReason('');
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ບໍ່ສາມາດຍົກເລີກບິນຂາຍໄດ້',
      });
    } finally {
      voidSavingRef.current = false;
      setVoidSaving(false);
    }
  };

  const handleConfirmReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !returnTarget || returnSavingRef.current) return;

    const lines = returnTarget.items.map((_, idx) => ({
      saleItemIndex: idx,
      qty: Math.max(0, Math.round(returnQtys[idx] ?? 0)),
      restock: returnRestock[idx] ?? true,
    }));

    returnSavingRef.current = true;
    setReturnSaving(true);
    try {
      const createdRet = await executeSaleReturn({
        db,
        user: userProfile,
        branchId: activeBranchId,
        sale: returnTarget,
        existingReturns: saleReturns,
        returnLines: lines,
        refundMethod,
        reason: returnReason,
        productsMap,
      });
      setFeedback({
        type: 'ok',
        text: `ບັນທຶກໃບຮັບຄືນສິນຄ້າ ${createdRet.returnNumber} ຍອດຄືນ ${formatLak(createdRet.totalRefundLak)} ສຳເລັດແລ້ວ`,
      });
      setReturnTarget(null);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ບໍ່ສາມາດບັນທຶກການຄືນສິນຄ້າໄດ້',
      });
    } finally {
      returnSavingRef.current = false;
      setReturnSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">ຍອດຂາຍສຸດທິ (ຫັກຄືນ/ຍົກເລີກ)</div>
          <div className="text-xl font-bold text-blue-700 mt-1 tabular-nums">
            {formatLak(kpiSummary.netSalesLak)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">ຈຳນວນບິນສຳເລັດ</div>
          <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
            {kpiSummary.activeBillCount.toLocaleString('en-US')} ບິນ
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">ກຳໄລຂັ້ນຕົ້ນຈາກບິນຂາຍ</div>
          <div className="text-xl font-bold text-green-700 mt-1 tabular-nums">
            {formatLak(kpiSummary.grossProfitLak)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">ຍອດຄືນສິນຄ້າ / ຍົກເລີກບິນ</div>
          <div className="text-xl font-bold text-red-600 mt-1 tabular-nums">
            {formatLak(kpiSummary.refundAndVoidLak)}
          </div>
        </div>
      </div>

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

      {/* Tabs + Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setActiveTab('sales')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              activeTab === 'sales'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ລາຍການບິນຂາຍ ({sales.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('returns')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              activeTab === 'returns'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ປະຫວັດຄືນສິນຄ້າ ({saleReturns.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ຄົ້ນຫາເລກບິນ ລູກຄ້າ ພະນັກງານຂາຍ..."
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          {activeTab === 'sales' && (
            <>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | SaleOrder['status'])}
                className="px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg"
              >
                <option value="all">ສະຖານະທັງໝົດ</option>
                <option value="completed">ສຳເລັດ</option>
                <option value="partial_return">ຄືນບາງສ່ວນ</option>
                <option value="returned">ຄືນທັງບິນ</option>
                <option value="voided">ຍົກເລີກບິນ</option>
              </select>

              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value as 'all' | PaymentMethodType)}
                className="px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg"
              >
                <option value="all">ທຸກຊ່ອງທາງຊຳລະ</option>
                <option value="cash">ເງິນສົດ</option>
                <option value="transfer">ໂອນເງິນ</option>
                <option value="qr">QR Pay</option>
                <option value="credit">ຂາຍເຊື່ອ</option>
                <option value="split">ຫຼາຍຊ່ອງທາງ</option>
              </select>
            </>
          )}
        </div>
      </div>

      {/* TAB 1: Sales Table */}
      {activeTab === 'sales' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">ເລກທີບິນ / ວັນເວລາ</th>
                <th className="py-3 px-4">ລູກຄ້າ / ລະດັບລາຄາ</th>
                <th className="py-3 px-4">ຊ່ອງທາງຊຳລະ</th>
                <th className="py-3 px-4 text-right">ຍອດສຸດທິ</th>
                <th className="py-3 px-4 text-right">ກຳໄລຂັ້ນຕົ້ນ</th>
                <th className="py-3 px-4">ສະຖານະ</th>
                <th className="py-3 px-4 text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredSales.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                    ຍັງບໍ່ມີປະຫວັດບິນຂາຍໃນລະບົບ
                  </td>
                </tr>
              )}

              {filteredSales.map((sale) => (
                <tr key={sale.saleId} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <div className="font-mono text-xs font-semibold text-blue-700">
                      {sale.invoiceNumber}
                    </div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      {formatDateTimeVientiane(sale.createdAt)} · {sale.cashierName}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900 text-xs sm:text-sm">
                      {sale.customerName}
                    </div>
                    <div className="text-xs text-slate-500">
                      {sale.items.length} ລາຍການ ·{' '}
                      {sale.priceTier === 'wholesale'
                        ? 'ຂາຍສົ່ງ'
                        : sale.priceTier === 'member'
                          ? 'ສະມາຊິກ'
                          : 'ຂາຍຍ່ອຍ'}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-700">
                    <div>{PAYMENT_METHOD_LABELS[sale.paymentMethod]}</div>
                    {sale.creditDueLak > 0 && (
                      <div className="text-amber-700 font-medium tabular-nums">
                        ຄ້າງ {formatLak(sale.creditDueLak)}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-900 tabular-nums">
                    {formatLak(sale.grandTotalLak)}
                  </td>
                  <td className="py-3 px-4 text-right text-xs font-medium text-green-700 tabular-nums">
                    {sale.status === 'voided' ? '-' : formatLak(sale.grossProfitLak)}
                  </td>
                  <td className="py-3 px-4 text-xs font-medium">
                    <span
                      className={
                        sale.status === 'completed'
                          ? 'text-green-700'
                          : sale.status === 'partial_return'
                            ? 'text-amber-600'
                            : 'text-red-600'
                      }
                    >
                      {STATUS_LABELS[sale.status]}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setDetailSale(sale)}
                        title="ເບິ່ງລາຍລະອຽດບິນ"
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-md cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setReceiptSale(sale)}
                        title="ພິມໃບບິນຄືນ"
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-md cursor-pointer"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      {canApproveOrEdit &&
                        (sale.status === 'completed' || sale.status === 'partial_return') && (
                          <button
                            type="button"
                            onClick={() => openReturnModal(sale)}
                            title="ຮັບຄືນສິນຄ້າ"
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-md cursor-pointer"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                      {canApproveOrEdit && sale.status === 'completed' && (
                        <button
                          type="button"
                          onClick={() => {
                            setVoidTarget(sale);
                            setVoidReason('');
                          }}
                          title="ຍົກເລີກບິນ (Void)"
                          className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md cursor-pointer"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: Returns Table */}
      {activeTab === 'returns' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">ເລກທີໃບຮັບຄືນ / ອ້າງອີງບິນ</th>
                <th className="py-3 px-4">ວັນເວລາ</th>
                <th className="py-3 px-4">ລາຍການສິນຄ້າທີ່ຄືນ</th>
                <th className="py-3 px-4">ວິທີຄືນເງິນ</th>
                <th className="py-3 px-4 text-right">ຍອດເງິນຄືນລວມ</th>
                <th className="py-3 px-4">ຜູ້ດຳເນີນການ / ເຫດຜົນ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredReturns.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                    ຍັງບໍ່ມີລາຍການຮັບຄືນສິນຄ້າ
                  </td>
                </tr>
              )}
              {filteredReturns.map((ret) => (
                <tr key={ret.returnId} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <div className="font-mono font-semibold text-amber-700">{ret.returnNumber}</div>
                    <div className="font-mono text-slate-500">ອ້າງອີງ: {ret.invoiceNumber}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-500 tabular-nums whitespace-nowrap">
                    {formatDateTimeVientiane(ret.createdAt)}
                  </td>
                  <td className="py-3 px-4 text-slate-800 space-y-0.5">
                    {ret.items.map((ri, i) => (
                      <div key={i}>
                        {ri.name} ({ri.qty} {ri.unitName}){ri.restock ? ' · ຄືນສະຕັອກ' : ''}
                      </div>
                    ))}
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    {REFUND_METHOD_LABELS[ret.refundMethod]}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-red-600 tabular-nums">
                    {formatLak(ret.totalRefundLak)}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    <div className="font-medium text-slate-800">{ret.performedByName}</div>
                    <div className="truncate max-w-[220px]">{ret.reason}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sale Detail Modal */}
      {detailSale && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  ລາຍລະອຽດບິນ {detailSale.invoiceNumber}
                </h3>
                <p className="text-xs text-slate-500 tabular-nums">
                  {formatDateTimeVientiane(detailSale.createdAt)} · ພະນັກງານຂາຍ: {detailSale.cashierName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailSale(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailSale.status === 'voided' && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                ບິນນີ້ຖືກຍົກເລີກໂດຍ {detailSale.voidedByName} · ເຫດຜົນ: {detailSale.voidedReason}
              </div>
            )}

            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2 px-3">ສິນຄ້າ</th>
                    <th className="py-2 px-3 text-right">ຈຳນວນ</th>
                    <th className="py-2 px-3 text-right">ລາຄາ/ໜ່ວຍ</th>
                    <th className="py-2 px-3 text-right">ສ່ວນຫຼຸດ</th>
                    <th className="py-2 px-3 text-right">ລວມ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {detailSale.items.map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-3">
                        <div className="font-medium text-slate-900">{it.name}</div>
                        <div className="font-mono text-[11px] text-slate-400">{it.sku}</div>
                      </td>
                      <td className="py-2 px-3 text-right">
                        {it.qty} {it.unitName}
                      </td>
                      <td className="py-2 px-3 text-right">{formatLak(it.unitPriceLak)}</td>
                      <td className="py-2 px-3 text-right">{formatLak(it.discountLak)}</td>
                      <td className="py-2 px-3 text-right font-semibold">{formatLak(it.lineTotalLak)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs tabular-nums">
              <div>
                <div className="text-slate-500">ຍອດສຸດທິ</div>
                <div className="font-bold text-slate-900">{formatLak(detailSale.grandTotalLak)}</div>
              </div>
              <div>
                <div className="text-slate-500">ຕົ້ນທຶນລວມ (COGS)</div>
                <div className="font-semibold text-slate-700">{formatLak(detailSale.cogsTotalLak)}</div>
              </div>
              <div>
                <div className="text-slate-500">ກຳໄລຂັ້ນຕົ້ນ</div>
                <div className="font-bold text-green-700">{formatLak(detailSale.grossProfitLak)}</div>
              </div>
              <div>
                <div className="text-slate-500">ສະຖານະ</div>
                <div className="font-semibold text-slate-900">{STATUS_LABELS[detailSale.status]}</div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setReceiptSale(detailSale);
                  setDetailSale(null);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                ພິມໃບບິນ
              </button>
              <button
                type="button"
                onClick={() => setDetailSale(null)}
                className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                ປິດ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Void Sale Modal */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-semibold text-red-700">
                ຢືນຢັນຍົກເລີກບິນ {voidTarget.invoiceNumber}
              </h3>
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleConfirmVoid} className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                ການຍົກເລີກບິນຈະຄືນສິນຄ້າທັງໝົດ ({voidTarget.items.length} ລາຍການ) ກັບເຂົ້າສູ່ສາງສິນຄ້າ
                ແລະ ບັນທຶກປະຫວັດລົງໃນ Stock Ledger ແລະ Audit Log
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ສາເຫດການຍົກເລີກບິນ *
                </label>
                <input
                  type="text"
                  required
                  maxLength={300}
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="ເຊັ່ນ ຄີສິນຄ້າຜິດ / ລູກຄ້າຍົກເລີກລາຍການ"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setVoidTarget(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  ປິດ
                </button>
                <button
                  type="submit"
                  disabled={voidSaving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer"
                >
                  {voidSaving ? 'ກຳລັງຍົກເລີກບິນ...' : 'ຢືນຢັນຍົກເລີກບິນ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Items Modal */}
      {returnTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  ຮັບຄືນສິນຄ້າ · ບິນ {returnTarget.invoiceNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  ລະບຸຈຳນວນທີ່ລູກຄ້າຕ້ອງການຄືນ ລະບົບຈະຄຳນວນຍອດຄືນເງິນ ແລະ ປັບສະຕັອກອັດຕະໂນມັດ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReturnTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmReturn} className="space-y-4">
              {(() => {
                const alreadyReturnedMap = getReturnedBaseByKeyForSale(returnTarget.saleId);
                return (
                  <div className="border border-slate-200 rounded-lg overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="py-2 px-3">ສິນຄ້າ</th>
                          <th className="py-2 px-3 text-right">ຄືນໄດ້ສູງສຸດ</th>
                          <th className="py-2 px-3 text-right">ຈຳນວນທີ່ຄືນ</th>
                          <th className="py-2 px-3 text-center">ຄືນເຂົ້າສະຕັອກ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 tabular-nums">
                        {returnTarget.items.map((it, idx) => {
                          const k = `${it.productId}__${it.unitName}`;
                          const alreadyBase = alreadyReturnedMap.get(k) ?? 0;
                          const maxReturnable = Math.max(
                            0,
                            it.qty - Math.floor(alreadyBase / it.conversionFactor),
                          );
                          return (
                            <tr key={idx}>
                              <td className="py-2 px-3">
                                <div className="font-medium text-slate-900">{it.name}</div>
                                <div className="text-[11px] text-slate-500">
                                  ຂາຍ {it.qty} {it.unitName} · {formatLak(it.unitPriceLak)}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-right text-slate-700">
                                {maxReturnable} {it.unitName}
                              </td>
                              <td className="py-2 px-3 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  max={maxReturnable}
                                  disabled={maxReturnable === 0}
                                  value={returnQtys[idx] ?? 0}
                                  onChange={(e) =>
                                    setReturnQtys((prev) => ({
                                      ...prev,
                                      [idx]: Math.max(
                                        0,
                                        Math.min(maxReturnable, Number(e.target.value) || 0),
                                      ),
                                    }))
                                  }
                                  className="w-20 px-2 py-1 border border-slate-200 rounded text-right tabular-nums"
                                />
                              </td>
                              <td className="py-2 px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={returnRestock[idx] ?? true}
                                  onChange={(e) =>
                                    setReturnRestock((prev) => ({
                                      ...prev,
                                      [idx]: e.target.checked,
                                    }))
                                  }
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ວິທີຄືນເງິນ
                  </label>
                  <select
                    value={refundMethod}
                    onChange={(e) =>
                      setRefundMethod(e.target.value as SaleReturn['refundMethod'])
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="cash">ຄືນເງິນສົດ</option>
                    <option value="transfer">ໂອນເງິນຄືນ</option>
                    <option value="credit_adjust">ປັບຫຼຸດຍອດໜີ້ (ຂາຍເຊື່ອ)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ຍອດຄືນເງິນໂດຍປະມານ
                  </label>
                  <div className="px-3 py-2 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg tabular-nums">
                    {formatLak(returnPreviewTotalLak)}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ສາເຫດການຮັບຄືນສິນຄ້າ *
                </label>
                <input
                  type="text"
                  required
                  maxLength={300}
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="ເຊັ່ນ ສິນຄ້າຊຳລຸດ / ລູກຄ້າປ່ຽນໃຈ"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReturnTarget(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  ຍົກເລີກ
                </button>
                <button
                  type="submit"
                  disabled={returnSaving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  {returnSaving ? 'ກຳລັງບັນທຶກ...' : 'ຢືນຢັນຮັບຄືນສິນຄ້າ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reprint Receipt Modal */}
      {receiptSale && (
        <ReceiptPrintModal
          sale={receiptSale}
          settings={settings}
          storeName={organization?.name ?? 'Grocery POS'}
          onClose={() => setReceiptSale(null)}
        />
      )}
    </div>
  );
}
