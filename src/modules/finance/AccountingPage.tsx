import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { BookOpen, CheckCircle2, FileSpreadsheet, Layers, Plus, Scale, Trash2, X } from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { hasPermission } from '../../core/rbac/permissions';
import { formatLak } from '../../core/utils/money';
import { CHART_OF_ACCOUNTS, createManualJournalEntry } from './financeService';
import type { JournalEntry, JournalLine } from '../../core/firebase/types';

function todayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Vientiane' }).format(new Date());
}

const ACCOUNT_TYPE_LABELS = {
  asset: 'ຊັບສິນ (Assets)',
  liability: 'ໜີ້ສິນ (Liabilities)',
  equity: 'ທຶນຂອງເຈົ້າຂອງ (Equity)',
  revenue: 'ລາຍໄດ້ (Revenue)',
  expense: 'ຕົ້ນທຶນ ແລະ ຄ່າໃຊ້ຈ່າຍ (Expenses)',
};

export function AccountingPage() {
  const { userProfile, activeBranchId } = useFirebase();
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [activeTab, setActiveTab] = useState<
    'journals' | 'coa' | 'ledger' | 'trial' | 'statements'
  >('journals');
  const [selectedLedgerAccount, setSelectedLedgerAccount] = useState('1110');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Manual Journal Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(todayYmd());
  const [description, setDescription] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([
    { accountCode: '1110', accountName: 'ເງິນສົດໃນມື', debitLak: 0, creditLak: 0 },
    { accountCode: '3100', accountName: 'ທຶນຂອງເຈົ້າຂອງກິດຈະການ', debitLak: 0, creditLak: 0 },
  ]);
  const [saving, setSaving] = useState(false);

  const canCreate = hasPermission(userProfile, 'accounting', 'create');

  useEffect(() => {
    if (!userProfile) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'journalEntries'),
        where('organizationId', '==', userProfile.organizationId),
        where('branchId', '==', activeBranchId),
        orderBy('createdAt', 'desc'),
      ),
      (snap) => setJournals(snap.docs.map((d) => d.data() as JournalEntry)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'journalEntries'),
    );
    return () => unsub();
  }, [userProfile, activeBranchId]);

  const accountBalances = useMemo(() => {
    const map = new Map<string, { debit: number; credit: number }>();
    for (const acc of CHART_OF_ACCOUNTS) {
      map.set(acc.code, { debit: 0, credit: 0 });
    }
    for (const j of journals) {
      for (const l of j.lines) {
        const cur = map.get(l.accountCode) ?? { debit: 0, credit: 0 };
        cur.debit += l.debitLak || 0;
        cur.credit += l.creditLak || 0;
        map.set(l.accountCode, cur);
      }
    }
    return CHART_OF_ACCOUNTS.map((acc) => {
      const totals = map.get(acc.code) ?? { debit: 0, credit: 0 };
      const isNormalDebit = acc.type === 'asset' || acc.type === 'expense';
      const net = isNormalDebit ? totals.debit - totals.credit : totals.credit - totals.debit;
      return {
        ...acc,
        totalDebit: totals.debit,
        totalCredit: totals.credit,
        netBalance: net,
      };
    });
  }, [journals]);

  const trialTotals = useMemo(() => {
    let dr = 0;
    let cr = 0;
    for (const row of accountBalances) {
      if (row.totalDebit > row.totalCredit) dr += row.totalDebit - row.totalCredit;
      else cr += row.totalCredit - row.totalDebit;
    }
    return { dr, cr };
  }, [accountBalances]);

  const financialStatements = useMemo(() => {
    const sumType = (t: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense') =>
      accountBalances.filter((a) => a.type === t).reduce((s, a) => s + a.netBalance, 0);

    const revenue = sumType('revenue');
    const cogs = accountBalances.find((a) => a.code === '5100')?.netBalance ?? 0;
    const opExpenses = accountBalances
      .filter((a) => a.type === 'expense' && a.code !== '5100')
      .reduce((s, a) => s + a.netBalance, 0);
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - opExpenses;

    const assets = sumType('asset');
    const liabilities = sumType('liability');
    const equity = sumType('equity');

    return {
      revenue,
      cogs,
      opExpenses,
      grossProfit,
      netProfit,
      assets,
      liabilities,
      equity,
      totalLiabAndEquity: liabilities + equity + netProfit,
    };
  }, [accountBalances]);

  const ledgerRows = useMemo(() => {
    const list: {
      entryNumber: string;
      entryDate: string;
      description: string;
      debit: number;
      credit: number;
    }[] = [];
    const chronological = [...journals].reverse();
    for (const j of chronological) {
      for (const l of j.lines) {
        if (l.accountCode === selectedLedgerAccount) {
          list.push({
            entryNumber: j.entryNumber,
            entryDate: j.entryDate,
            description: j.description,
            debit: l.debitLak,
            credit: l.creditLak,
          });
        }
      }
    }
    return list;
  }, [journals, selectedLedgerAccount]);

  const modalDebitTotal = lines.reduce((s, l) => s + (l.debitLak || 0), 0);
  const modalCreditTotal = lines.reduce((s, l) => s + (l.creditLak || 0), 0);

  const handleCreateJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    setSaving(true);
    setFeedback(null);
    try {
      await createManualJournalEntry({
        db,
        user: userProfile,
        branchId: activeBranchId,
        entryDate,
        description,
        referenceNo,
        lines,
      });
      setModalOpen(false);
      setDescription('');
      setReferenceNo('');
      setFeedback({ type: 'ok', text: 'ບັນທຶກປຶ້ມບັນຊີປະຈຳວັນທົ່ວໄປ (Double-Entry) ຮຽບຮ້ອຍແລ້ວ' });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ບໍ່ສາມາດບັນທຶກປຶ້ມບັນຊີປະຈຳວັນໄດ້',
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

      {/* Sub-navigation Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="inline-flex bg-slate-100 p-1 rounded-lg self-start flex-wrap gap-0.5">
          {(
            [
              { key: 'journals', label: `ປຶ້ມບັນຊີປະຈຳວັນ (${journals.length})`, icon: BookOpen },
              { key: 'coa', label: 'ຜັງບັນຊີ (COA)', icon: Layers },
              { key: 'ledger', label: 'ບັນຊີແຍກປະເພດ', icon: FileSpreadsheet },
              { key: 'trial', label: 'ໃບດຸ່ນດ່ຽງທົດລອງ', icon: Scale },
              { key: 'statements', label: 'ໃບລາຍງານຜົນໄດ້ຮັບ & ໃບສະຫຼຸບຊັບສົມບັດ', icon: FileSpreadsheet },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                  activeTab === tab.key ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-lg cursor-pointer self-start lg:self-auto"
          >
            <Plus className="w-4 h-4" />
            ລົງບັນຊີປະຈຳວັນ (JV)
          </button>
        )}
      </div>

      {/* TAB 1: Journal Entries */}
      {activeTab === 'journals' && (
        <div className="space-y-3">
          {journals.map((j) => (
            <div key={j.journalId} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 mb-2">
                <div>
                  <span className="font-mono text-xs font-bold text-blue-700 mr-2">
                    {j.entryNumber}
                  </span>
                  <span className="text-sm font-semibold text-slate-900">{j.description}</span>
                </div>
                <div className="text-xs text-slate-500 tabular-nums">
                  {j.entryDate} · ໂດຍ {j.createdByName}
                </div>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-100">
                    <th className="py-1.5 text-left">ລະຫັດບັນຊີ</th>
                    <th className="py-1.5 text-left">ຊື່ບັນຊີ</th>
                    <th className="py-1.5 text-right">ເດບິດ (Dr)</th>
                    <th className="py-1.5 text-right">ເຄຣດິດ (Cr)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {j.lines.map((l, idx) => (
                    <tr key={idx}>
                      <td className="py-1.5 font-mono text-slate-600">{l.accountCode}</td>
                      <td className={`py-1.5 ${l.creditLak > 0 ? 'pl-4 text-slate-600' : 'text-slate-900 font-medium'}`}>
                        {l.accountName}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-slate-900">
                        {l.debitLak > 0 ? formatLak(l.debitLak) : '-'}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-slate-900">
                        {l.creditLak > 0 ? formatLak(l.creditLak) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {journals.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl py-12 text-center text-xs text-slate-500">
              ຍັງບໍ່ມີລາຍການປຶ້ມບັນຊີປະຈຳວັນ ລະບົບຈະບັນທຶກລາຍການຄູ່ໃຫ້ອັດຕະໂນມັດເມື່ອມີການຂາຍ ຊື້ ຮັບ/ຈ່າຍໜີ້ ຫຼື ລົງລາຍຮັບ-ລາຍຈ່າຍ
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Chart of Accounts */}
      {activeTab === 'coa' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">ລະຫັດບັນຊີ</th>
                <th className="py-3 px-4">ຊື່ບັນຊີ</th>
                <th className="py-3 px-4">ໝວດບັນຊີ</th>
                <th className="py-3 px-4 text-right">ຍອດຄົງເຫຼືອສຸດທິ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {accountBalances.map((acc) => (
                <tr key={acc.code} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 font-mono text-xs font-bold text-blue-700">{acc.code}</td>
                  <td className="py-2.5 px-4 font-medium text-slate-900">{acc.name}</td>
                  <td className="py-2.5 px-4 text-xs text-slate-500">
                    {ACCOUNT_TYPE_LABELS[acc.type]}
                  </td>
                  <td className="py-2.5 px-4 text-right font-semibold tabular-nums text-slate-900">
                    {formatLak(acc.netBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: General Ledger */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-700">ເລືອກບັນຊີແຍກປະເພດ:</label>
            <select
              value={selectedLedgerAccount}
              onChange={(e) => setSelectedLedgerAccount(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
            >
              {CHART_OF_ACCOUNTS.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">ວັນທີ</th>
                  <th className="py-3 px-4">ເລກທີ JV</th>
                  <th className="py-3 px-4">ລາຍລະອຽດ</th>
                  <th className="py-3 px-4 text-right">ເດບິດ</th>
                  <th className="py-3 px-4 text-right">ເຄຣດິດ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {ledgerRows.map((r, i) => (
                  <tr key={i}>
                    <td className="py-2.5 px-4 text-xs text-slate-500 tabular-nums">{r.entryDate}</td>
                    <td className="py-2.5 px-4 font-mono text-xs text-blue-700">{r.entryNumber}</td>
                    <td className="py-2.5 px-4 text-slate-800">{r.description}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">
                      {r.debit > 0 ? formatLak(r.debit) : '-'}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums">
                      {r.credit > 0 ? formatLak(r.credit) : '-'}
                    </td>
                  </tr>
                ))}
                {ledgerRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-xs text-slate-500">
                      ຍັງບໍ່ມີການເຄື່ອນໄຫວໃນບັນຊີນີ້
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Trial Balance */}
      {activeTab === 'trial' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">ລະຫັດບັນຊີ</th>
                <th className="py-3 px-4">ຊື່ບັນຊີ</th>
                <th className="py-3 px-4 text-right">ເດບິດຄົງເຫຼືອ</th>
                <th className="py-3 px-4 text-right">ເຄຣດິດຄົງເຫຼືອ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {accountBalances.map((acc) => {
                const drBal = acc.totalDebit > acc.totalCredit ? acc.totalDebit - acc.totalCredit : 0;
                const crBal = acc.totalCredit > acc.totalDebit ? acc.totalCredit - acc.totalDebit : 0;
                if (drBal === 0 && crBal === 0) return null;
                return (
                  <tr key={acc.code}>
                    <td className="py-2.5 px-4 font-mono text-xs text-blue-700">{acc.code}</td>
                    <td className="py-2.5 px-4 text-slate-900">{acc.name}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums">
                      {drBal > 0 ? formatLak(drBal) : '-'}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums">
                      {crBal > 0 ? formatLak(crBal) : '-'}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-blue-50/70 font-bold text-slate-900 border-t-2 border-slate-200">
                <td colSpan={2} className="py-3 px-4">ລວມໃບດຸ່ນດ່ຽງທົດລອງ (Trial Balance)</td>
                <td className="py-3 px-4 text-right tabular-nums text-blue-700">
                  {formatLak(trialTotals.dr)}
                </td>
                <td className="py-3 px-4 text-right tabular-nums text-blue-700">
                  {formatLak(trialTotals.cr)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 5: Income Statement & Balance Sheet */}
      {activeTab === 'statements' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Income Statement */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              ໃບລາຍງານຜົນໄດ້ຮັບ (Income Statement)
            </h3>
            <div className="space-y-2 text-sm tabular-nums">
              <div className="flex justify-between">
                <span className="text-slate-600">ລາຍໄດ້ຈາກການຂາຍ ແລະ ລາຍໄດ້ອື່ນ</span>
                <span className="font-semibold text-slate-900">
                  {formatLak(financialStatements.revenue)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">ຫັກ ຕົ້ນທຶນຂາຍ (COGS)</span>
                <span className="text-red-700">-{formatLak(financialStatements.cogs)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-100 font-semibold">
                <span>ກຳໄລຂັ້ນຕົ້ນ (Gross Profit)</span>
                <span className="text-blue-700">
                  {formatLak(financialStatements.grossProfit)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">ຫັກ ຄ່າໃຊ້ຈ່າຍດຳເນີນງານ</span>
                <span className="text-red-700">-{formatLak(financialStatements.opExpenses)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t-2 border-slate-200 font-bold text-base">
                <span>ກຳໄລສຸດທິ (Net Profit)</span>
                <span
                  className={
                    financialStatements.netProfit >= 0 ? 'text-green-700' : 'text-red-700'
                  }
                >
                  {formatLak(financialStatements.netProfit)}
                </span>
              </div>
            </div>
          </div>

          {/* Balance Sheet */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              ໃບສະຫຼຸບຊັບສົມບັດ / ງົບດຸນ (Balance Sheet)
            </h3>
            <div className="space-y-2 text-sm tabular-nums">
              <div className="flex justify-between font-semibold text-slate-900">
                <span>ລວມຊັບສິນ (Assets)</span>
                <span className="text-blue-700">{formatLak(financialStatements.assets)}</span>
              </div>
              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                <div className="flex justify-between text-slate-600">
                  <span>ໜີ້ສິນ (Liabilities)</span>
                  <span>{formatLak(financialStatements.liabilities)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>ທຶນຂອງເຈົ້າຂອງ (Equity)</span>
                  <span>{formatLak(financialStatements.equity)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>ກຳໄລ (ຂາດທຶນ) ສະສົມງວດນີ້</span>
                  <span>{formatLak(financialStatements.netProfit)}</span>
                </div>
              </div>
              <div className="flex justify-between pt-2 border-t-2 border-slate-200 font-bold text-base">
                <span>ລວມໜີ້ສິນ ແລະ ສ່ວນຂອງເຈົ້າຂອງ</span>
                <span className="text-blue-700">
                  {formatLak(financialStatements.totalLiabAndEquity)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Journal Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-semibold text-slate-900">
                ບັນທຶກລາຍການປຶ້ມບັນຊີປະຈຳວັນທົ່ວໄປ (Double-Entry)
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateJournal} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
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
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ຄຳອະທິບາຍລາຍການ *
                </label>
                <input
                  type="text"
                  required
                  maxLength={300}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="ເຊັ່ນ ເພີ່ມທຶນໝູນວຽນຮ້ານ / ປັບປຸງບັນຊີ"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">ແຖວບັນຊີ (ເດບິດ / ເຄຣດິດ)</span>
                  <button
                    type="button"
                    onClick={() =>
                      setLines((prev) => [
                        ...prev,
                        { accountCode: '1110', accountName: 'ເງິນສົດໃນມື', debitLak: 0, creditLak: 0 },
                      ])
                    }
                    className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                  >
                    + ເພີ່ມແຖວ
                  </button>
                </div>
                {lines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center text-xs">
                    <select
                      value={line.accountCode}
                      onChange={(e) => {
                        const acc = CHART_OF_ACCOUNTS.find((a) => a.code === e.target.value);
                        const next = [...lines];
                        next[idx] = {
                          ...next[idx],
                          accountCode: e.target.value,
                          accountName: acc?.name ?? e.target.value,
                        };
                        setLines(next);
                      }}
                      className="col-span-5 px-2.5 py-2 border border-slate-200 rounded-lg bg-white"
                    >
                      {CHART_OF_ACCOUNTS.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} · {a.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      placeholder="ເດບິດ"
                      value={line.debitLak}
                      onChange={(e) => {
                        const next = [...lines];
                        next[idx] = {
                          ...next[idx],
                          debitLak: Math.max(0, Math.round(Number(e.target.value) || 0)),
                        };
                        setLines(next);
                      }}
                      className="col-span-3 px-2.5 py-2 border border-slate-200 rounded-lg text-right tabular-nums"
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="ເຄຣດິດ"
                      value={line.creditLak}
                      onChange={(e) => {
                        const next = [...lines];
                        next[idx] = {
                          ...next[idx],
                          creditLak: Math.max(0, Math.round(Number(e.target.value) || 0)),
                        };
                        setLines(next);
                      }}
                      className="col-span-3 px-2.5 py-2 border border-slate-200 rounded-lg text-right tabular-nums"
                    />
                    <button
                      type="button"
                      disabled={lines.length <= 2}
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                      className="col-span-1 p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-30 cursor-pointer flex justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex justify-between text-xs tabular-nums">
                <span>
                  ລວມເດບິດ: <strong>{formatLak(modalDebitTotal)}</strong>
                </span>
                <span>
                  ລວມເຄຣດິດ: <strong>{formatLak(modalCreditTotal)}</strong>
                </span>
                <span
                  className={
                    modalDebitTotal > 0 && modalDebitTotal === modalCreditTotal
                      ? 'text-green-700 font-bold'
                      : 'text-red-600 font-bold'
                  }
                >
                  {modalDebitTotal > 0 && modalDebitTotal === modalCreditTotal
                    ? 'ດຸ່ນດ່ຽງແລ້ວ'
                    : 'ຍອດຍັງບໍ່ດຸ່ນດ່ຽງ'}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg cursor-pointer"
                >
                  ຍົກເລີກ
                </button>
                <button
                  type="submit"
                  disabled={saving || modalDebitTotal <= 0 || modalDebitTotal !== modalCreditTotal}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg cursor-pointer"
                >
                  {saving ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກລົງປຶ້ມບັນຊີປະຈຳວັນ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
