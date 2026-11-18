import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { ArrowDownLeft, CheckCircle2, Plus, X } from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { hasPermission } from '../../core/rbac/permissions';
import { formatLak } from '../../core/utils/money';
import { INCOME_CATEGORY_LABELS, recordIncomeEntry } from './financeService';
import type { IncomeCategory, IncomeEntry } from '../../core/firebase/types';

function todayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Vientiane' }).format(new Date());
}

export function IncomePage() {
  const { userProfile, activeBranchId } = useFirebase();
  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<'all' | IncomeCategory>('all');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Add Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [amountLak, setAmountLak] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'qr'>('cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [entryDate, setEntryDate] = useState(todayYmd());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const canCreate = hasPermission(userProfile, 'income', 'create');

  useEffect(() => {
    if (!userProfile) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'incomeEntries'),
        where('organizationId', '==', userProfile.organizationId),
        where('branchId', '==', activeBranchId),
        orderBy('createdAt', 'desc'),
      ),
      (snap) => setEntries(snap.docs.map((d) => d.data() as IncomeEntry)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'incomeEntries'),
    );
    return () => unsub();
  }, [userProfile, activeBranchId]);

  const totals = useMemo(() => {
    let sales = 0;
    let ar = 0;
    let other = 0;
    for (const e of entries) {
      if (e.category === 'sales') sales += e.amountLak;
      else if (e.category === 'ar_collection') ar += e.amountLak;
      else other += e.amountLak;
    }
    return { sales, ar, other, total: sales + ar + other };
  }, [entries]);

  const filtered = useMemo(
    () =>
      categoryFilter === 'all' ? entries : entries.filter((e) => e.category === categoryFilter),
    [entries, categoryFilter],
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    setSaving(true);
    setFeedback(null);
    try {
      await recordIncomeEntry({
        db,
        user: userProfile,
        branchId: activeBranchId,
        category: 'other_income',
        title,
        amountLak: Number(amountLak) || 0,
        paymentMethod,
        referenceNo,
        notes,
        entryDate,
      });
      setModalOpen(false);
      setTitle('');
      setAmountLak('0');
      setReferenceNo('');
      setNotes('');
      setFeedback({ type: 'ok', text: 'บันทึกรายรับอื่น ๆ และลงบัญชีอัตโนมัติเรียบร้อยแล้ว' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ไม่สามารถบันทึกรายรับได้',
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

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">รายรับรวมทั้งหมด</div>
          <div className="text-2xl font-bold text-green-700 tabular-nums mt-1">
            {formatLak(totals.total)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">รายรับจากการขาย POS</div>
          <div className="text-xl font-bold text-blue-700 tabular-nums mt-1">
            {formatLak(totals.sales)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">รับชำระหนี้ลูกหนี้ (AR)</div>
          <div className="text-xl font-bold text-slate-900 tabular-nums mt-1">
            {formatLak(totals.ar)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">รายรับอื่น ๆ</div>
          <div className="text-xl font-bold text-slate-900 tabular-nums mt-1">
            {formatLak(totals.other)}
          </div>
        </div>
      </div>

      {/* Filter & Add Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex bg-slate-100 p-1 rounded-lg self-start flex-wrap">
          {(['all', 'sales', 'ar_collection', 'other_income'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                categoryFilter === cat ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              {cat === 'all' ? 'ทั้งหมด' : INCOME_CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-lg cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            บันทึกรายรับอื่น ๆ
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">วันที่</th>
                <th className="py-3 px-4">ประเภท</th>
                <th className="py-3 px-4">รายการรายรับ</th>
                <th className="py-3 px-4">อ้างอิง</th>
                <th className="py-3 px-4">ช่องทาง</th>
                <th className="py-3 px-4 text-right">จำนวนเงิน</th>
                <th className="py-3 px-4">ผู้บันทึก</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.map((item) => (
                <tr key={item.entryId} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 text-xs text-slate-600 tabular-nums">{item.entryDate}</td>
                  <td className="py-3 px-4 text-xs font-medium text-blue-700">
                    {INCOME_CATEGORY_LABELS[item.category]}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{item.title}</div>
                    {item.notes && <div className="text-xs text-slate-500">{item.notes}</div>}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-500">
                    {item.referenceNo || '-'}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">
                    {item.paymentMethod === 'cash'
                      ? 'เงินสด'
                      : item.paymentMethod === 'transfer'
                        ? 'โอนเงิน'
                        : 'QR Payment'}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-green-700 tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <ArrowDownLeft className="w-3.5 h-3.5" />
                      {formatLak(item.amountLak)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500">{item.recordedByName}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-xs text-slate-500">
                    ยังไม่มีรายการรายรับในช่วงที่เลือก
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-semibold text-slate-900">บันทึกรายรับอื่น ๆ</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ชื่อรายการรายรับ *
                </label>
                <input
                  type="text"
                  required
                  maxLength={160}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="เช่น ขายกล่องลังเก่า / ค่าเช่าตู้แช่ / ดอกเบี้ยรับ"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    จำนวนเงิน (₭) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={amountLak}
                    onChange={(e) => setAmountLak(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-bold border border-slate-200 rounded-lg text-right tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">วันที่รับเงิน</label>
                  <input
                    type="date"
                    required
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">ช่องทางรับ</label>
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
                  <label className="block text-xs font-medium text-slate-700 mb-1">เลขที่อ้างอิง</label>
                  <input
                    type="text"
                    maxLength={60}
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
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
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  {saving ? 'กำลังบันทึก...' : 'บันทึกรายรับ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
