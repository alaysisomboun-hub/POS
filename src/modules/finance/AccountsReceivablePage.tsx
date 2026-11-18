import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { CheckCircle2, CreditCard, History, X } from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { hasPermission } from '../../core/rbac/permissions';
import { formatDateTimeVientiane } from '../../core/utils/date';
import { formatLak } from '../../core/utils/money';
import { recordArPayment } from './financeService';
import type { ArPayment, Customer, SaleOrder } from '../../core/firebase/types';

export function AccountsReceivablePage() {
  const { userProfile, activeBranchId } = useFirebase();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [creditSales, setCreditSales] = useState<SaleOrder[]>([]);
  const [payments, setPayments] = useState<ArPayment[]>([]);
  const [activeTab, setActiveTab] = useState<'receivables' | 'history'>('receivables');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Payment Modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [targetCustomer, setTargetCustomer] = useState<Customer | null>(null);
  const [targetSale, setTargetSale] = useState<SaleOrder | null>(null);
  const [amountLak, setAmountLak] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'qr'>('cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const canRecord = hasPermission(userProfile, 'accounts_receivable', 'create');

  useEffect(() => {
    if (!userProfile) return;
    const orgId = userProfile.organizationId;

    const unsubCust = onSnapshot(
      query(
        collection(db, 'customers'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
      ),
      (snap) => setCustomers(snap.docs.map((d) => d.data() as Customer)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'customers'),
    );

    const unsubSales = onSnapshot(
      query(
        collection(db, 'sales'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
        orderBy('createdAt', 'desc'),
      ),
      (snap) => {
        setCreditSales(
          snap.docs
            .map((d) => d.data() as SaleOrder)
            .filter((s) => s.status !== 'voided' && s.creditDueLak > 0),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'sales'),
    );

    const unsubPay = onSnapshot(
      query(
        collection(db, 'arPayments'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
        orderBy('createdAt', 'desc'),
      ),
      (snap) => setPayments(snap.docs.map((d) => d.data() as ArPayment)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'arPayments'),
    );

    return () => {
      unsubCust();
      unsubSales();
      unsubPay();
    };
  }, [userProfile, activeBranchId]);

  const debtors = useMemo(
    () =>
      customers
        .filter((c) => c.creditBalanceLak > 0)
        .sort((a, b) => b.creditBalanceLak - a.creditBalanceLak),
    [customers],
  );

  const totalArLak = useMemo(
    () => debtors.reduce((sum, c) => sum + c.creditBalanceLak, 0),
    [debtors],
  );

  const openPaymentModal = (cust: Customer, sale: SaleOrder | null = null) => {
    setTargetCustomer(cust);
    setTargetSale(sale);
    setAmountLak(String(sale ? sale.creditDueLak : cust.creditBalanceLak));
    setPaymentMethod('cash');
    setNotes('');
    setPayModalOpen(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !targetCustomer) return;
    setSaving(true);
    setFeedback(null);
    try {
      const amt = Math.round(Number(amountLak) || 0);
      await recordArPayment({
        db,
        user: userProfile,
        branchId: activeBranchId,
        customer: targetCustomer,
        sale: targetSale,
        amountLak: amt,
        paymentMethod,
        notes,
      });
      setPayModalOpen(false);
      setFeedback({
        type: 'ok',
        text: `รับชำระหนี้จาก "${targetCustomer.name}" จำนวน ${formatLak(amt)} เรียบร้อยแล้ว`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ไม่สามารถบันทึกรับชำระหนี้ได้',
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
          <div className="text-xs text-slate-500">ยอดลูกหนี้ค้างรับรวม (AR)</div>
          <div className="text-2xl font-bold text-amber-700 tabular-nums mt-1">
            {formatLak(totalArLak)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">จำนวนลูกค้าที่มียอดค้างชำระ</div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {debtors.length} ราย
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">บิลขายเชื่อที่รอปิดยอด</div>
          <div className="text-2xl font-bold text-blue-700 tabular-nums mt-1">
            {creditSales.length} บิล
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
        <div className="inline-flex bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('receivables')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
              activeTab === 'receivables' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            ลูกหนี้คงค้าง
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
              activeTab === 'history' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            ประวัติรับชำระ ({payments.length})
          </button>
        </div>
      </div>

      {activeTab === 'receivables' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Debtors by Customer */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
              ยอดลูกหนี้คงค้างตามรายลูกค้า
            </div>
            <div className="divide-y divide-slate-100">
              {debtors.map((c) => (
                <div key={c.customerId} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{c.name}</div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      {c.phone || '-'} · วงเงิน {c.creditLimitLak > 0 ? formatLak(c.creditLimitLak) : 'ไม่จำกัด'}
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <div className="text-sm font-bold text-amber-700 tabular-nums">
                      {formatLak(c.creditBalanceLak)}
                    </div>
                    {canRecord && (
                      <button
                        type="button"
                        onClick={() => openPaymentModal(c, null)}
                        className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer"
                      >
                        รับชำระหนี้
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {debtors.length === 0 && (
                <div className="py-10 text-center text-xs text-slate-500">
                  ไม่มีลูกค้าที่มียอดหนี้ค้างชำระ
                </div>
              )}
            </div>
          </div>

          {/* Unpaid Credit Invoices */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
              บิลขายเชื่อที่มียอดค้างชำระ
            </div>
            <div className="divide-y divide-slate-100">
              {creditSales.map((s) => {
                const matchedCust = customers.find((c) => c.customerId === s.customerId);
                return (
                  <div key={s.saleId} className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-mono font-bold text-blue-700">
                        {s.invoiceNumber}
                      </div>
                      <div className="text-sm font-medium text-slate-900">{s.customerName}</div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        {formatDateTimeVientiane(s.createdAt)} · ยอดบิล {formatLak(s.grandTotalLak)}
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-3">
                      <div className="text-sm font-bold text-amber-700 tabular-nums">
                        {formatLak(s.creditDueLak)}
                      </div>
                      {canRecord && matchedCust && (
                        <button
                          type="button"
                          onClick={() => openPaymentModal(matchedCust, s)}
                          className="px-3 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-lg cursor-pointer"
                        >
                          ตัดบิลนี้
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {creditSales.length === 0 && (
                <div className="py-10 text-center text-xs text-slate-500">
                  ไม่มีบิลขายเชื่อค้างชำระในขณะนี้
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
                  <th className="py-3 px-4">วันเวลา</th>
                  <th className="py-3 px-4">ลูกค้า</th>
                  <th className="py-3 px-4">อ้างอิงบิล</th>
                  <th className="py-3 px-4">ช่องทาง</th>
                  <th className="py-3 px-4 text-right">จำนวนรับชำระ</th>
                  <th className="py-3 px-4">ผู้บันทึก</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {payments.map((p) => (
                  <tr key={p.paymentId} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 text-xs text-slate-500 tabular-nums">
                      {formatDateTimeVientiane(p.createdAt)}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">{p.customerName}</td>
                    <td className="py-3 px-4 font-mono text-xs text-blue-700">{p.invoiceNumber}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {p.paymentMethod === 'cash'
                        ? 'เงินสด'
                        : p.paymentMethod === 'transfer'
                          ? 'โอนเงิน'
                          : 'QR Payment'}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-green-700 tabular-nums">
                      {formatLak(p.amountLak)}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500">{p.recordedByName}</td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-xs text-slate-500">
                      ยังไม่มีประวัติรับชำระหนี้ลูกหนี้
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {payModalOpen && targetCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">บันทึกรับชำระหนี้ลูกหนี้</h3>
                <p className="text-xs text-slate-500">
                  {targetCustomer.name}
                  {targetSale ? ` · บิล ${targetSale.invoiceNumber}` : ''}
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
                  จำนวนเงินที่รับชำระ (₭) *
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
                <label className="block text-xs font-medium text-slate-700 mb-1">ช่องทางรับเงิน</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'transfer' | 'qr')}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="cash">เงินสด</option>
                  <option value="transfer">โอนเงินธนาคาร</option>
                  <option value="qr">QR Payment</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">หมายเหตุ</label>
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
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  {saving ? 'กำลังบันทึก...' : 'ยืนยันรับชำระ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
