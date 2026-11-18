import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { AlertTriangle, ArrowUpRight, CheckCircle2, Plus, X } from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { hasPermission } from '../../core/rbac/permissions';
import { formatLak } from '../../core/utils/money';
import { EXPENSE_CATEGORY_META, recordExpenseEntry } from './financeService';
import type { ExpenseCategory, ExpenseEntry, IncomeEntry } from '../../core/firebase/types';

function todayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Vientiane' }).format(new Date());
}

const ALL_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'inventory_purchase',
  'rent',
  'utilities',
  'salary',
  'transport',
  'marketing',
  'maintenance_other',
];

export function ExpensesPage() {
  const { userProfile, activeBranchId, settings } = useFirebase();
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [catFilter, setCatFilter] = useState<'all' | ExpenseCategory>('all');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('rent');
  const [title, setTitle] = useState('');
  const [amountLak, setAmountLak] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'qr'>('cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [entryDate, setEntryDate] = useState(todayYmd());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const canCreate = hasPermission(userProfile, 'expenses', 'create');
  const highExpenseThreshold = settings?.notificationSettings?.highExpenseThresholdPercent ?? 30;

  useEffect(() => {
    if (!userProfile) return;
    const orgId = userProfile.organizationId;

    const unsubExp = onSnapshot(
      query(
        collection(db, 'expenseEntries'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
        orderBy('createdAt', 'desc'),
      ),
      (snap) => setExpenses(snap.docs.map((d) => d.data() as ExpenseEntry)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'expenseEntries'),
    );

    const unsubInc = onSnapshot(
      query(
        collection(db, 'incomeEntries'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
      ),
      (snap) => setIncomes(snap.docs.map((d) => d.data() as IncomeEntry)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'incomeEntries'),
    );

    return () => {
      unsubExp();
      unsubInc();
    };
  }, [userProfile, activeBranchId]);

  const summaryByCategory = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    ALL_EXPENSE_CATEGORIES.forEach((c) => map.set(c, 0));
    for (const e of expenses) {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amountLak);
    }
    return map;
  }, [expenses]);

  const totalExpenseLak = useMemo(
    () => expenses.reduce((s, e) => s + e.amountLak, 0),
    [expenses],
  );
  const operatingExpenseLak = useMemo(
    () =>
      expenses
        .filter((e) => e.category !== 'inventory_purchase')
        .reduce((s, e) => s + e.amountLak, 0),
    [expenses],
  );
  const totalIncomeLak = useMemo(
    () => incomes.reduce((s, i) => s + i.amountLak, 0),
    [incomes],
  );
  const opExRatioPercent =
    totalIncomeLak > 0 ? Math.round((operatingExpenseLak / totalIncomeLak) * 100) : 0;

  const filtered = useMemo(
    () => (catFilter === 'all' ? expenses : expenses.filter((e) => e.category === catFilter)),
    [expenses, catFilter],
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    setSaving(true);
    setFeedback(null);
    try {
      await recordExpenseEntry({
        db,
        user: userProfile,
        branchId: activeBranchId,
        category,
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
      setFeedback({ type: 'ok', text: 'บันทึกรายจ่ายและลงสมุดรายวันอัตโนมัติเรียบร้อยแล้ว' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ไม่สามารถบันทึกรายจ่ายได้',
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

      {totalIncomeLak > 0 && opExRatioPercent >= highExpenseThreshold && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            แจ้งเตือนค่าใช้จ่ายสูง: ค่าใช้จ่ายดำเนินงานคิดเป็น{' '}
            <strong className="tabular-nums">{opExRatioPercent}%</strong> ของรายรับรวม
            (เกินเกณฑ์ที่ตั้งไว้ {highExpenseThreshold}%)
          </span>
        </div>
      )}

      {/* 7 Categories Breakdown Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">รายจ่ายรวมทั้งหมด</div>
          <div className="text-xl font-bold text-red-700 tabular-nums mt-1">
            {formatLak(totalExpenseLak)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
            ค่าใช้จ่ายดำเนินงาน {formatLak(operatingExpenseLak)}
          </div>
        </div>
        {ALL_EXPENSE_CATEGORIES.map((c) => (
          <div key={c} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500 truncate">{EXPENSE_CATEGORY_META[c].label}</div>
            <div className="text-lg font-bold text-slate-900 tabular-nums mt-1">
              {formatLak(summaryByCategory.get(c) ?? 0)}
            </div>
          </div>
        ))}
      </div>

      {/* Filter & Add Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-600">หมวดหมู่:</span>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value as 'all' | ExpenseCategory)}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
          >
            <option value="all">ทุกหมวดหมู่ (7 หมวด)</option>
            {ALL_EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_META[c].label}
              </option>
            ))}
          </select>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-lg cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            บันทึกรายจ่ายใหม่
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
                <th className="py-3 px-4">หมวดหมู่ (7 หมวด)</th>
                <th className="py-3 px-4">รายการค่าใช้จ่าย</th>
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
                  <td className="py-3 px-4 text-xs font-medium text-slate-700">
                    {EXPENSE_CATEGORY_META[item.category].label}
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
                  <td className="py-3 px-4 text-right font-bold text-red-700 tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      {formatLak(item.amountLak)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500">{item.recordedByName}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-xs text-slate-500">
                    ยังไม่มีรายการรายจ่ายในหมวดหมู่ที่เลือก
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Expense Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-semibold text-slate-900">บันทึกรายจ่ายร้านค้า</h3>
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
                  หมวดหมู่ค่าใช้จ่าย (7 หมวด) *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {ALL_EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {EXPENSE_CATEGORY_META[c].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ชื่อรายการค่าใช้จ่าย *
                </label>
                <input
                  type="text"
                  required
                  maxLength={160}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="เช่น ค่าไฟฟ้าประจำเดือน / เงินเดือนแคชเชียร์"
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
                  <label className="block text-xs font-medium text-slate-700 mb-1">วันที่จ่าย</label>
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
                  <label className="block text-xs font-medium text-slate-700 mb-1">ช่องทางจ่าย</label>
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
                  <label className="block text-xs font-medium text-slate-700 mb-1">เลขที่ใบเสร็จ/อ้างอิง</label>
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
                  {saving ? 'กำลังบันทึก...' : 'บันทึกรายจ่าย'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
