import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { formatLak } from '../../core/utils/money';
import type {
  Customer,
  ExpenseEntry,
  IncomeEntry,
  InventoryBalance,
  SaleOrder,
  Supplier,
} from '../../core/firebase/types';

function todayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Vientiane' }).format(new Date());
}

function tsToYmd(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Vientiane' }).format(
      (val as { toDate: () => Date }).toDate(),
    );
  }
  return '';
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csvContent = [
    headers.map(escape).join(','),
    ...rows.map((r) => r.map(escape).join(',')),
  ].join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ReportsPage() {
  const { userProfile, activeBranchId, organization } = useFirebase();
  const [activeTab, setActiveTab] = useState<'sales' | 'stock' | 'finance' | 'arap'>('sales');
  const today = todayYmd();
  const [startDate, setStartDate] = useState(`${today.slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(today);

  const [sales, setSales] = useState<SaleOrder[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  useEffect(() => {
    if (!userProfile) return;
    const orgId = userProfile.organizationId;

    const u1 = onSnapshot(
      query(
        collection(db, 'sales'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
        orderBy('createdAt', 'desc'),
      ),
      (snap) => setSales(snap.docs.map((d) => d.data() as SaleOrder)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'sales'),
    );
    const u2 = onSnapshot(
      query(
        collection(db, 'inventory'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
      ),
      (snap) => setBalances(snap.docs.map((d) => d.data() as InventoryBalance)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'inventory'),
    );
    const u3 = onSnapshot(
      query(
        collection(db, 'incomeEntries'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
      ),
      (snap) => setIncomes(snap.docs.map((d) => d.data() as IncomeEntry)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'incomeEntries'),
    );
    const u4 = onSnapshot(
      query(
        collection(db, 'expenseEntries'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
      ),
      (snap) => setExpenses(snap.docs.map((d) => d.data() as ExpenseEntry)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'expenseEntries'),
    );
    const u5 = onSnapshot(
      query(
        collection(db, 'customers'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
      ),
      (snap) => setCustomers(snap.docs.map((d) => d.data() as Customer)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'customers'),
    );
    const u6 = onSnapshot(
      query(collection(db, 'suppliers'), where('organizationId', '==', orgId)),
      (snap) => setSuppliers(snap.docs.map((d) => d.data() as Supplier)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'suppliers'),
    );

    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
      u6();
    };
  }, [userProfile, activeBranchId]);

  const filteredSales = useMemo(
    () =>
      sales.filter((s) => {
        if (s.status === 'voided') return false;
        const d = tsToYmd(s.createdAt);
        return d >= startDate && d <= endDate;
      }),
    [sales, startDate, endDate],
  );

  const filteredIncomes = useMemo(
    () => incomes.filter((i) => i.entryDate >= startDate && i.entryDate <= endDate),
    [incomes, startDate, endDate],
  );
  const filteredExpenses = useMemo(
    () => expenses.filter((e) => e.entryDate >= startDate && e.entryDate <= endDate),
    [expenses, startDate, endDate],
  );

  const handleExportCsv = () => {
    if (activeTab === 'sales') {
      downloadCsv(
        `sales-report-${startDate}-to-${endDate}.csv`,
        ['เลขที่บิล', 'วันที่', 'ลูกค้า', 'วิธีชำระ', 'ยอดสุทธิ (LAK)', 'ต้นทุน (LAK)', 'กำไรขั้นต้น (LAK)'],
        filteredSales.map((s) => [
          s.invoiceNumber,
          tsToYmd(s.createdAt),
          s.customerName,
          s.paymentMethod,
          s.grandTotalLak,
          s.cogsTotalLak,
          s.grossProfitLak,
        ]),
      );
    } else if (activeTab === 'stock') {
      downloadCsv(
        `stock-valuation-${today}.csv`,
        ['SKU', 'ชื่อสินค้า', 'หน่วยฐาน', 'คงเหลือ', 'ต้นทุนเฉลี่ย WAC (LAK)', 'มูลค่ารวม (LAK)', 'ตำแหน่งเก็บ'],
        balances.map((b) => [
          b.skuSnapshot,
          b.productNameSnapshot,
          b.baseUnitNameSnapshot,
          b.qtyOnHandBase,
          b.avgCostLak,
          Math.round(b.qtyOnHandBase * b.avgCostLak),
          b.storageLocationName,
        ]),
      );
    } else if (activeTab === 'finance') {
      downloadCsv(
        `finance-report-${startDate}-to-${endDate}.csv`,
        ['ประเภท', 'วันที่', 'รายการ', 'อ้างอิง', 'จำนวนเงิน (LAK)'],
        [
          ...filteredIncomes.map((i) => ['รายรับ', i.entryDate, i.title, i.referenceNo, i.amountLak]),
          ...filteredExpenses.map((e) => ['รายจ่าย', e.entryDate, e.title, e.referenceNo, e.amountLak]),
        ],
      );
    } else {
      downloadCsv(
        `arap-report-${today}.csv`,
        ['ประเภท', 'รหัส', 'ชื่อคู่ค้า/ลูกค้า', 'ยอดค้าง (LAK)'],
        [
          ...customers
            .filter((c) => c.creditBalanceLak > 0)
            .map((c) => ['ลูกหนี้ (AR)', c.code, c.name, c.creditBalanceLak]),
          ...suppliers
            .filter((s) => s.payableBalanceLak > 0)
            .map((s) => ['เจ้าหนี้ (AP)', s.code, s.name, s.payableBalanceLak]),
        ],
      );
    }
  };

  const totalSalesLak = filteredSales.reduce((s, o) => s + o.grandTotalLak, 0);
  const totalCogsLak = filteredSales.reduce((s, o) => s + o.cogsTotalLak, 0);
  const totalGrossProfitLak = filteredSales.reduce((s, o) => s + o.grossProfitLak, 0);
  const totalStockValLak = balances.reduce(
    (s, b) => s + (b.qtyOnHandBase > 0 ? Math.round(b.qtyOnHandBase * b.avgCostLak) : 0),
    0,
  );
  const totalIncomeLak = filteredIncomes.reduce((s, i) => s + i.amountLak, 0);
  const totalExpenseLak = filteredExpenses.reduce((s, e) => s + e.amountLak, 0);

  return (
    <div className="space-y-5">
      {/* Control Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 print:hidden">
        <div className="inline-flex bg-slate-100 p-1 rounded-lg self-start flex-wrap">
          {(
            [
              { key: 'sales', label: 'รายงานการขาย' },
              { key: 'stock', label: 'มูลค่าสต็อกคงเหลือ' },
              { key: 'finance', label: 'รายรับ-รายจ่าย' },
              { key: 'arap', label: 'ลูกหนี้-เจ้าหนี้' },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                activeTab === t.key ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
          />
          <span className="text-xs text-slate-500">ถึง</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
          />
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            ส่งออก CSV / Excel
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            พิมพ์ / PDF
          </button>
        </div>
      </div>

      {/* Print Header */}
      <div className="hidden print:block border-b border-slate-300 pb-3 mb-4">
        <div className="text-lg font-bold">{organization?.name ?? 'Grocery POS'}</div>
        <div className="text-xs text-slate-600">
          รายงานประจำช่วงวันที่ {startDate} ถึง {endDate}
        </div>
      </div>

      {/* Sales Report */}
      {activeTab === 'sales' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">ยอดขายรวม ({filteredSales.length} บิล)</div>
              <div className="text-xl font-bold text-blue-700 tabular-nums mt-1">
                {formatLak(totalSalesLak)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">ต้นทุนขายรวม (COGS)</div>
              <div className="text-xl font-bold text-slate-900 tabular-nums mt-1">
                {formatLak(totalCogsLak)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">กำไรขั้นต้นรวม</div>
              <div className="text-xl font-bold text-green-700 tabular-nums mt-1">
                {formatLak(totalGrossProfitLak)}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">เลขที่บิล</th>
                    <th className="py-3 px-4">วันที่</th>
                    <th className="py-3 px-4">ลูกค้า</th>
                    <th className="py-3 px-4">วิธีชำระ</th>
                    <th className="py-3 px-4 text-right">ยอดสุทธิ</th>
                    <th className="py-3 px-4 text-right">ต้นทุน</th>
                    <th className="py-3 px-4 text-right">กำไรขั้นต้น</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredSales.map((s) => (
                    <tr key={s.saleId}>
                      <td className="py-2.5 px-4 font-mono text-xs font-bold text-blue-700">
                        {s.invoiceNumber}
                      </td>
                      <td className="py-2.5 px-4 text-xs tabular-nums text-slate-600">
                        {tsToYmd(s.createdAt)}
                      </td>
                      <td className="py-2.5 px-4 text-slate-900">{s.customerName}</td>
                      <td className="py-2.5 px-4 text-xs text-slate-600">{s.paymentMethod}</td>
                      <td className="py-2.5 px-4 text-right font-semibold tabular-nums">
                        {formatLak(s.grandTotalLak)}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums text-slate-500">
                        {formatLak(s.cogsTotalLak)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-semibold text-green-700 tabular-nums">
                        {formatLak(s.grossProfitLak)}
                      </td>
                    </tr>
                  ))}
                  {filteredSales.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-xs text-slate-500">
                        ไม่พบข้อมูลการขายในช่วงเวลาที่เลือก
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Stock Valuation Report */}
      {activeTab === 'stock' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
              มูลค่าสินค้าคงคลังรวม (WAC)
            </div>
            <div className="text-xl font-bold text-blue-700 tabular-nums">
              {formatLak(totalStockValLak)}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">ชื่อสินค้า</th>
                  <th className="py-3 px-4 text-right">คงเหลือ</th>
                  <th className="py-3 px-4 text-right">ต้นทุน WAC</th>
                  <th className="py-3 px-4 text-right">มูลค่ารวม</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {balances.map((b) => (
                  <tr key={b.inventoryId}>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-600">{b.skuSnapshot}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">
                      {b.productNameSnapshot}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums">
                      {b.qtyOnHandBase.toLocaleString('en-US')} {b.baseUnitNameSnapshot}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-slate-600">
                      {formatLak(b.avgCostLak)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold tabular-nums text-slate-900">
                      {formatLak(Math.max(0, Math.round(b.qtyOnHandBase * b.avgCostLak)))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Finance Report */}
      {activeTab === 'finance' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">รายรับรวมในช่วง</div>
              <div className="text-xl font-bold text-green-700 tabular-nums mt-1">
                {formatLak(totalIncomeLak)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">รายจ่ายรวมในช่วง</div>
              <div className="text-xl font-bold text-red-700 tabular-nums mt-1">
                {formatLak(totalExpenseLak)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">กระแสเงินสดสุทธิ</div>
              <div className="text-xl font-bold text-blue-700 tabular-nums mt-1">
                {formatLak(totalIncomeLak - totalExpenseLak)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                รายการรายรับ ({filteredIncomes.length})
              </div>
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto text-xs">
                {filteredIncomes.map((i) => (
                  <div key={i.entryId} className="p-3 flex justify-between gap-2">
                    <div>
                      <div className="font-medium text-slate-900">{i.title}</div>
                      <div className="text-slate-400">{i.entryDate}</div>
                    </div>
                    <div className="font-bold text-green-700 tabular-nums">
                      +{formatLak(i.amountLak)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                รายการรายจ่าย ({filteredExpenses.length})
              </div>
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto text-xs">
                {filteredExpenses.map((e) => (
                  <div key={e.entryId} className="p-3 flex justify-between gap-2">
                    <div>
                      <div className="font-medium text-slate-900">{e.title}</div>
                      <div className="text-slate-400">{e.entryDate}</div>
                    </div>
                    <div className="font-bold text-red-700 tabular-nums">
                      -{formatLak(e.amountLak)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AR / AP Report */}
      {activeTab === 'arap' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
              ลูกหนี้ค้างรับ (Accounts Receivable)
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {customers
                .filter((c) => c.creditBalanceLak > 0)
                .map((c) => (
                  <div key={c.customerId} className="p-3 flex justify-between">
                    <span className="font-medium text-slate-900">{c.name}</span>
                    <span className="font-bold text-amber-700 tabular-nums">
                      {formatLak(c.creditBalanceLak)}
                    </span>
                  </div>
                ))}
              {customers.filter((c) => c.creditBalanceLak > 0).length === 0 && (
                <div className="p-8 text-center text-slate-400">ไม่มีลูกหนี้ค้างรับ</div>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
              เจ้าหนี้ค้างจ่าย (Accounts Payable)
            </div>
            <div className="divide-y divide-slate-100 text-xs">
              {suppliers
                .filter((s) => s.payableBalanceLak > 0)
                .map((s) => (
                  <div key={s.supplierId} className="p-3 flex justify-between">
                    <span className="font-medium text-slate-900">{s.name}</span>
                    <span className="font-bold text-red-700 tabular-nums">
                      {formatLak(s.payableBalanceLak)}
                    </span>
                  </div>
                ))}
              {suppliers.filter((s) => s.payableBalanceLak > 0).length === 0 && (
                <div className="p-8 text-center text-slate-400">ไม่มีเจ้าหนี้ค้างจ่าย</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
