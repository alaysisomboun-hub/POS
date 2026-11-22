import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { CheckCircle2, FileSpreadsheet, History, X } from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { hasPermission } from '../../core/rbac/permissions';
import { formatDateTimeVientiane } from '../../core/utils/date';
import { formatLak } from '../../core/utils/money';
import { recordApPayment } from './financeService';
import type { ApPayment, PurchaseOrder, Supplier } from '../../core/firebase/types';

export function AccountsPayablePage() {
  const { userProfile, activeBranchId } = useFirebase();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [creditPos, setCreditPos] = useState<PurchaseOrder[]>([]);
  const [payments, setPayments] = useState<ApPayment[]>([]);
  const [activeTab, setActiveTab] = useState<'payables' | 'history'>('payables');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [targetSupplier, setTargetSupplier] = useState<Supplier | null>(null);
  const [targetPo, setTargetPo] = useState<PurchaseOrder | null>(null);
  const [amountLak, setAmountLak] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'qr'>('transfer');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const canRecord = hasPermission(userProfile, 'accounts_payable', 'create');

  useEffect(() => {
    if (!userProfile) return;
    const orgId = userProfile.organizationId;

    const unsubSup = onSnapshot(
      query(collection(db, 'suppliers'), where('organizationId', '==', orgId)),
      (snap) => setSuppliers(snap.docs.map((d) => d.data() as Supplier)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'suppliers'),
    );

    const unsubPos = onSnapshot(
      query(
        collection(db, 'purchaseOrders'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
        orderBy('createdAt', 'desc'),
      ),
      (snap) => {
        setCreditPos(
          snap.docs
            .map((d) => d.data() as PurchaseOrder)
            .filter((po) => po.status === 'received' && po.creditDueLak > 0),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'purchaseOrders'),
    );

    const unsubPay = onSnapshot(
      query(
        collection(db, 'apPayments'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
        orderBy('createdAt', 'desc'),
      ),
      (snap) => setPayments(snap.docs.map((d) => d.data() as ApPayment)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'apPayments'),
    );

    return () => {
      unsubSup();
      unsubPos();
      unsubPay();
    };
  }, [userProfile, activeBranchId]);

  const creditors = useMemo(
    () =>
      suppliers
        .filter((s) => s.payableBalanceLak > 0)
        .sort((a, b) => b.payableBalanceLak - a.payableBalanceLak),
    [suppliers],
  );

  const totalApLak = useMemo(
    () => creditors.reduce((s, sup) => s + sup.payableBalanceLak, 0),
    [creditors],
  );

  const openPayModal = (sup: Supplier, po: PurchaseOrder | null = null) => {
    setTargetSupplier(sup);
    setTargetPo(po);
    setAmountLak(String(po ? po.creditDueLak : sup.payableBalanceLak));
    setPaymentMethod('transfer');
    setNotes('');
    setPayModalOpen(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !targetSupplier) return;
    setSaving(true);
    setFeedback(null);
    try {
      const amt = Math.round(Number(amountLak) || 0);
      await recordApPayment({
        db,
        user: userProfile,
        branchId: activeBranchId,
        supplier: targetSupplier,
        po: targetPo,
        amountLak: amt,
        paymentMethod,
        notes,
      });
      setPayModalOpen(false);
      setFeedback({
        type: 'ok',
        text: `ບັນທຶກຈ່າຍຊຳລະໜີ້ໃຫ້ "${targetSupplier.name}" ຈຳນວນ ${formatLak(amt)} ແລ້ວ`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ບໍ່ສາມາດບັນທຶກການຈ່າຍຊຳລະໜີ້ໄດ້',
      });
    } finally {
      setSaving(false);
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

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">ຍອດເຈົ້າໜີ້ຄ້າງຈ່າຍລວມ (AP)</div>
          <div className="text-2xl font-bold text-red-700 tabular-nums mt-1">
            {formatLak(totalApLak)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">ຈຳນວນຜູ້ສະໜອງທີ່ຄ້າງຈ່າຍ</div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {creditors.length} ລາຍ
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">ໃບສັ່ງຊື້ເຄຣດິດຄ້າງຈ່າຍ</div>
          <div className="text-2xl font-bold text-blue-700 tabular-nums mt-1">
            {creditPos.length} ໃບ
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
        <div className="inline-flex bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('payables')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
              activeTab === 'payables' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            ເຈົ້າໜີ້ຄົງຄ້າງ
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
              activeTab === 'history' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            ປະຫວັດຈ່າຍຊຳລະ ({payments.length})
          </button>
        </div>
      </div>

      {activeTab === 'payables' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
              ຍອດເຈົ້າໜີ້ຄົງຄ້າງຕາມຜູ້ສະໜອງ
            </div>
            <div className="divide-y divide-slate-100">
              {creditors.map((sup) => (
                <div key={sup.supplierId} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{sup.name}</div>
                    <div className="text-xs text-slate-500">
                      {sup.phone || '-'} · ເຄຣດິດ {sup.paymentTermDays} ວັນ
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <div className="text-sm font-bold text-red-700 tabular-nums">
                      {formatLak(sup.payableBalanceLak)}
                    </div>
                    {canRecord && (
                      <button
                        type="button"
                        onClick={() => openPayModal(sup, null)}
                        className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer"
                      >
                        ຈ່າຍຊຳລະໜີ້
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {creditors.length === 0 && (
                <div className="py-10 text-center text-xs text-slate-500">
                  ບໍ່ມີຜູ້ສະໜອງທີ່ມີຍອດຄ້າງຈ່າຍ
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
              ໃບສັ່ງຊື້ເຄຣດິດຄ້າງຈ່າຍ
            </div>
            <div className="divide-y divide-slate-100">
              {creditPos.map((po) => {
                const sup = suppliers.find((s) => s.supplierId === po.supplierId);
                return (
                  <div key={po.poId} className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-mono font-bold text-blue-700">{po.poNumber}</div>
                      <div className="text-sm font-medium text-slate-900">{po.supplierName}</div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        ຄົບກຳນົດ: {po.dueDate || '-'} · ຍອດເຕັມ {formatLak(po.grandTotalLak)}
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div className="text-sm font-bold text-red-700 tabular-nums">
                        {formatLak(po.creditDueLak)}
                      </div>
                      {canRecord && sup && (
                        <button
                          type="button"
                          onClick={() => openPayModal(sup, po)}
                          className="px-3 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg cursor-pointer"
                        >
                          ຊຳລະ PO ນີ້
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {creditPos.length === 0 && (
                <div className="py-10 text-center text-xs text-slate-500">
                  ບໍ່ມີໃບສັ່ງຊື້ເຄຣດິດທີ່ຄ້າງຊຳລະ
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">ວັນເວລາ</th>
                  <th className="py-3 px-4">ຜູ້ສະໜອງ</th>
                  <th className="py-3 px-4">ອ້າງອີງ PO</th>
                  <th className="py-3 px-4">ຊ່ອງທາງ</th>
                  <th className="py-3 px-4 text-right">ຈຳນວນຈ່າຍຊຳລະ</th>
                  <th className="py-3 px-4">ຜູ້ບັນທຶກ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {payments.map((p) => (
                  <tr key={p.paymentId} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 text-xs text-slate-500 tabular-nums">
                      {formatDateTimeVientiane(p.createdAt)}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">{p.supplierName}</td>
                    <td className="py-3 px-4 font-mono text-xs text-blue-700">{p.poNumber}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {p.paymentMethod === 'cash'
                        ? 'ເງິນສົດ'
                        : p.paymentMethod === 'transfer'
                          ? 'ໂອນເງິນ'
                          : 'QR Payment'}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-red-700 tabular-nums">
                      {formatLak(p.amountLak)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500">{p.recordedByName}</td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-xs text-slate-500">
                      ຍັງບໍ່ມີປະຫວັດຈ່າຍຊຳລະໜີ້ຜູ້ສະໜອງ
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pay AP Modal */}
      {payModalOpen && targetSupplier && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">ຈ່າຍຊຳລະໜີ້ຜູ້ສະໜອງ</h3>
                <p className="text-xs text-slate-500">
                  {targetSupplier.name}
                  {targetPo ? ` · ${targetPo.poNumber}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ຈຳນວນເງິນທີ່ຈ່າຍຊຳລະ (₭) *
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={amountLak}
                  onChange={(e) => setAmountLak(e.target.value)}
                  className="w-full px-3 py-2 text-base font-bold border border-slate-200 rounded-lg text-right tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">ຊ່ອງທາງຈ່າຍເງິນ</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'transfer' | 'qr')}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="transfer">ໂອນເງິນທະນາຄານ</option>
                  <option value="cash">ເງິນສົດ</option>
                  <option value="qr">QR Payment</option>
                </select>
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
                  onClick={() => setPayModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg cursor-pointer"
                >
                  ຍົກເລີກ
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  {saving ? 'ກຳລັງບັນທຶກ...' : 'ຢືນຢັນຈ່າຍຊຳລະ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
