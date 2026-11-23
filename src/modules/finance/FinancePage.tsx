import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Plus,
  X,
} from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { hasPermission } from '../../core/rbac/permissions';
import { formatLak } from '../../core/utils/money';
import {
  EXPENSE_CATEGORY_META,
  INCOME_CATEGORY_LABELS,
  recordExpenseEntry,
  recordIncomeEntry,
} from './financeService';
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

type FinanceTab = 'all' | 'income' | 'expense';

interface UnifiedTransactionRow {
  id: string;
  kind: 'income' | 'expense';
  entryDate: string;
  categoryLabel: string;
  title: string;
  notes: string;
  referenceNo: string;
  paymentMethod: 'cash' | 'transfer' | 'qr';
  amountLak: number;
  recordedByName: string;
  createdAtMs: number;
}

export function FinancePage() {
  const { userProfile, activeBranchId, settings } = useFirebase();
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [activeTab, setActiveTab] = useState<FinanceTab>('all');
  const [expenseCatFilter, setExpenseCatFilter] = useState<'all' | ExpenseCategory>('all');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Modal State ('income' | 'expense' | null)
  const [modalKind, setModalKind] = useState<'income' | 'expense' | null>(null);
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('rent');
  const [title, setTitle] = useState('');
  const [amountLak, setAmountLak] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'qr'>('cash');
  const [referenceNo, setReferenceNo] = useState('');
  const [entryDate, setEntryDate] = useState(todayYmd());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const canCreateIncome = hasPermission(userProfile, 'income', 'create');
  const canCreateExpense = hasPermission(userProfile, 'expenses', 'create');
  const highExpenseThreshold = settings?.notificationSettings?.highExpenseThresholdPercent ?? 30;

  useEffect(() => {
    if (!userProfile) return;
    const orgId = userProfile.organizationId;

    const unsubInc = onSnapshot(
      query(
        collection(db, 'incomeEntries'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
        orderBy('createdAt', 'desc'),
      ),
      (snap) => setIncomes(snap.docs.map((d) => d.data() as IncomeEntry)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'incomeEntries'),
    );

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

    return () => {
      unsubInc();
      unsubExp();
    };
  }, [userProfile, activeBranchId]);

  const totals = useMemo(() => {
    const totalIncome = incomes.reduce((sum, i) => sum + i.amountLak, 0);
    const totalExpense = expenses.reduce((sum, e) => sum + e.amountLak, 0);
    const operatingExpense = expenses
      .filter((e) => e.category !== 'inventory_purchase')
      .reduce((sum, e) => sum + e.amountLak, 0);
    const netBalance = totalIncome - totalExpense;
    const opExRatioPercent =
      totalIncome > 0 ? Math.round((operatingExpense / totalIncome) * 100) : 0;

    return { totalIncome, totalExpense, netBalance, opExRatioPercent };
  }, [incomes, expenses]);

  const unifiedRows = useMemo<UnifiedTransactionRow[]>(() => {
    const list: UnifiedTransactionRow[] = [];

    if (activeTab === 'all' || activeTab === 'income') {
      for (const i of incomes) {
        list.push({
          id: `inc_${i.entryId}`,
          kind: 'income',
          entryDate: i.entryDate,
          categoryLabel: INCOME_CATEGORY_LABELS[i.category],
          title: i.title,
          notes: i.notes,
          referenceNo: i.referenceNo,
          paymentMethod: i.paymentMethod,
          amountLak: i.amountLak,
          recordedByName: i.recordedByName,
          createdAtMs: i.createdAt?.toMillis?.() ?? 0,
        });
      }
    }

    if (activeTab === 'all' || activeTab === 'expense') {
      for (const e of expenses) {
        if (activeTab === 'expense' && expenseCatFilter !== 'all' && e.category !== expenseCatFilter) {
          continue;
        }
        list.push({
          id: `exp_${e.entryId}`,
          kind: 'expense',
          entryDate: e.entryDate,
          categoryLabel: EXPENSE_CATEGORY_META[e.category].label,
          title: e.title,
          notes: e.notes,
          referenceNo: e.referenceNo,
          paymentMethod: e.paymentMethod,
          amountLak: e.amountLak,
          recordedByName: e.recordedByName,
          createdAtMs: e.createdAt?.toMillis?.() ?? 0,
        });
      }
    }

    return list.sort((a, b) => b.createdAtMs - a.createdAtMs || b.entryDate.localeCompare(a.entryDate));
  }, [incomes, expenses, activeTab, expenseCatFilter]);

  const openModal = (kind: 'income' | 'expense') => {
    setModalKind(kind);
    setExpenseCategory('rent');
    setTitle('');
    setAmountLak('');
    setPaymentMethod('cash');
    setReferenceNo('');
    setEntryDate(todayYmd());
    setNotes('');
    setFeedback(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !modalKind || savingRef.current) return;

    const parsedAmount = Math.round(Number(amountLak) || 0);
    if (parsedAmount <= 0) {
      setFeedback({ type: 'err', text: 'ກະລຸນາປ້ອນຈຳນວນເງິນໃຫ້ຫຼາຍກວ່າ 0 ກີບ' });
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setFeedback(null);

    try {
      if (modalKind === 'income') {
        await recordIncomeEntry({
          db,
          user: userProfile,
          branchId: activeBranchId,
          category: 'other_income',
          title,
          amountLak: parsedAmount,
          paymentMethod,
          referenceNo,
          notes,
          entryDate,
        });
        setFeedback({ type: 'ok', text: 'ບັນທຶກລາຍຮັບສຳເລັດແລ້ວ' });
      } else {
        await recordExpenseEntry({
          db,
          user: userProfile,
          branchId: activeBranchId,
          category: expenseCategory,
          title,
          amountLak: parsedAmount,
          paymentMethod,
          referenceNo,
          notes,
          entryDate,
        });
        setFeedback({ type: 'ok', text: 'ບັນທຶກລາຍຈ່າຍສຳເລັດແລ້ວ' });
      }
      setModalKind(null);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ບໍ່ສາມາດບັນທຶກລາຍການໄດ້',
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {feedback && (
        <div
          className={`p-3 rounded-xl border text-xs sm:text-sm flex items-center justify-between ${
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

      {totals.totalIncome > 0 && totals.opExRatioPercent >= highExpenseThreshold && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            ຄ່າໃຊ້ຈ່າຍດຳເນີນງານຄິດເປັນ <strong className="tabular-nums">{totals.opExRatioPercent}%</strong> ຂອງລາຍຮັບລວມ
            (ເກີນເກນທີ່ຕັ້ງໄວ້ {highExpenseThreshold}%)
          </span>
        </div>
      )}

      {/* 3 Clean Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">ລາຍຮັບລວມທັງໝົດ</div>
          <div className="text-2xl font-bold text-green-700 tabular-nums mt-1">
            {formatLak(totals.totalIncome)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">ລາຍຈ່າຍລວມທັງໝົດ</div>
          <div className="text-2xl font-bold text-red-600 tabular-nums mt-1">
            {formatLak(totals.totalExpense)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">ຄົງເຫຼືອສຸດທິ (ລາຍຮັບ - ລາຍຈ່າຍ)</div>
          <div
            className={`text-2xl font-bold tabular-nums mt-1 ${
              totals.netBalance >= 0 ? 'text-blue-600' : 'text-red-600'
            }`}
          >
            {formatLak(totals.netBalance)}
          </div>
        </div>
      </div>

      {/* Filter Tabs & Quick Record Buttons */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex bg-slate-100 p-1 rounded-lg">
            {(
              [
                { key: 'all', label: `ທັງໝົດ (${incomes.length + expenses.length})` },
                { key: 'income', label: `ລາຍຮັບ (${incomes.length})` },
                { key: 'expense', label: `ລາຍຈ່າຍ (${expenses.length})` },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                  activeTab === t.key ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === 'expense' && (
            <select
              value={expenseCatFilter}
              onChange={(e) => setExpenseCatFilter(e.target.value as 'all' | ExpenseCategory)}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
            >
              <option value="all">ທຸກໝວດໝູ່ລາຍຈ່າຍ</option>
              {ALL_EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXPENSE_CATEGORY_META[c].label}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canCreateIncome && (
            <button
              type="button"
              onClick={() => openModal('income')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-lg cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              ບັນທຶກລາຍຮັບ
            </button>
          )}
          {canCreateExpense && (
            <button
              type="button"
              onClick={() => openModal('expense')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold rounded-lg cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              ບັນທຶກລາຍຈ່າຍ
            </button>
          )}
        </div>
      </div>

      {/* Unified Desktop Table */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">ວັນທີ</th>
                <th className="py-3 px-4">ປະເພດ</th>
                <th className="py-3 px-4">ລາຍການ</th>
                <th className="py-3 px-4">ຊ່ອງທາງ / ອ້າງອີງ</th>
                <th className="py-3 px-4 text-right">ຈຳນວນເງິນ</th>
                <th className="py-3 px-4">ຜູ້ບັນທຶກ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {unifiedRows.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 text-xs text-slate-600 tabular-nums">{item.entryDate}</td>
                  <td className="py-3 px-4 text-xs font-medium">
                    <span className={item.kind === 'income' ? 'text-green-700' : 'text-red-600'}>
                      {item.categoryLabel}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{item.title}</div>
                    {item.notes && <div className="text-xs text-slate-500">{item.notes}</div>}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600">
                    <div>
                      {item.paymentMethod === 'cash'
                        ? 'ເງິນສົດ'
                        : item.paymentMethod === 'transfer'
                          ? 'ໂອນເງິນ'
                          : 'QR Pay'}
                    </div>
                    {item.referenceNo && (
                      <div className="font-mono text-slate-400">{item.referenceNo}</div>
                    )}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-bold tabular-nums ${
                      item.kind === 'income' ? 'text-green-700' : 'text-red-600'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {item.kind === 'income' ? (
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      )}
                      {item.kind === 'income' ? '+' : '-'}
                      {formatLak(item.amountLak)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500">{item.recordedByName}</td>
                </tr>
              ))}
              {unifiedRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-xs text-slate-500">
                    ຍັງບໍ່ມີລາຍການລາຍຮັບ ຫຼື ລາຍຈ່າຍ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-2.5">
        {unifiedRows.map((item) => (
          <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-sm text-slate-900">{item.title}</div>
                <div className="text-xs text-slate-500">
                  {item.entryDate} · {item.categoryLabel}
                </div>
              </div>
              <div
                className={`text-sm font-bold tabular-nums shrink-0 ${
                  item.kind === 'income' ? 'text-green-700' : 'text-red-600'
                }`}
              >
                {item.kind === 'income' ? '+' : '-'}
                {formatLak(item.amountLak)}
              </div>
            </div>
            {item.notes && <div className="text-xs text-slate-500">{item.notes}</div>}
          </div>
        ))}
        {unifiedRows.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
            ຍັງບໍ່ມີລາຍການລາຍຮັບ ຫຼື ລາຍຈ່າຍ
          </div>
        )}
      </div>

      {/* Add Income / Expense Modal */}
      {modalKind && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-semibold text-slate-900">
                {modalKind === 'income' ? 'ບັນທຶກລາຍຮັບ' : 'ບັນທຶກລາຍຈ່າຍ'}
              </h3>
              <button
                type="button"
                onClick={() => setModalKind(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              {modalKind === 'expense' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ໝວດໝູ່ລາຍຈ່າຍ *
                  </label>
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value as ExpenseCategory)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {ALL_EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {EXPENSE_CATEGORY_META[c].label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {modalKind === 'income' ? 'ຊື່ລາຍການລາຍຮັບ *' : 'ຊື່ລາຍການຄ່າໃຊ້ຈ່າຍ *'}
                </label>
                <input
                  type="text"
                  required
                  maxLength={160}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    modalKind === 'income'
                      ? 'ເຊັ່ນ ຄ່າເຊົ່າຕູ້ແຊ່ / ຂາຍກ່ອງເຈ້ຍ'
                      : 'ເຊັ່ນ ຄ່າໄຟຟ້າ / ເງິນເດືອນພະນັກງານ'
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ຈຳນວນເງິນ (₭) *
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
                  <label className="block text-xs font-medium text-slate-700 mb-1">ວັນທີ</label>
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
                  <label className="block text-xs font-medium text-slate-700 mb-1">ຊ່ອງທາງ</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'transfer' | 'qr')}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="cash">ເງິນສົດ</option>
                    <option value="transfer">ໂອນເງິນ</option>
                    <option value="qr">QR Pay</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">ເລກທີອ້າງອີງ</label>
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
                  onClick={() => setModalKind(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg cursor-pointer"
                >
                  ຍົກເລີກ
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {saving ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
