import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import {
  ArrowRight,
  BarChart3,
  Boxes,
  History,
  Package,
  PackagePlus,
  ReceiptText,
  Settings,
  ShoppingCart,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import {
  useFirebase,
  DEFAULT_MAIN_BRANCH_ID,
  DEFAULT_ORG_ID,
} from '../../core/firebase/FirebaseProvider';
import { formatDateTimeVientiane } from '../../core/utils/date';
import { formatLak } from '../../core/utils/money';
import type {
  AuditLog,
  Customer,
  ExpenseEntry,
  IncomeEntry,
  InventoryBalance,
  ModuleKey,
  Product,
  SaleOrder,
  SaleReturn,
  Supplier,
  UserProfile,
} from '../../core/firebase/types';

interface DashboardPageProps {
  onNavigate: (key: ModuleKey) => void;
}

type DatePreset = 'today' | '7d' | 'month' | 'year' | 'custom';

function toYmd(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Vientiane' }).format(date);
}

function tsToYmd(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return toYmd((val as { toDate: () => Date }).toDate());
  }
  if (val instanceof Date) return toYmd(val);
  return '';
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { organization, settings } = useFirebase();

  const [preset, setPreset] = useState<DatePreset>('month');
  const [customStart, setCustomStart] = useState(toYmd(new Date()));
  const [customEnd, setCustomEnd] = useState(toYmd(new Date()));

  const [staffCount, setStaffCount] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [sales, setSales] = useState<SaleOrder[]>([]);
  const [returns, setReturns] = useState<SaleReturn[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    const unsubUsers = onSnapshot(
      query(collection(db, 'users'), where('organizationId', '==', DEFAULT_ORG_ID)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as UserProfile);
        setStaffCount(list.filter((u) => u.status === 'active').length);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'users'),
    );

    const unsubProds = onSnapshot(
      query(collection(db, 'products'), where('organizationId', '==', DEFAULT_ORG_ID)),
      (snap) => {
        setProducts(
          snap.docs.map((d) => d.data() as Product).filter((p) => p.status === 'active'),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'products'),
    );

    const unsubInv = onSnapshot(
      query(
        collection(db, 'inventory'),
        where('organizationId', '==', DEFAULT_ORG_ID),
        where('branchId', '==', DEFAULT_MAIN_BRANCH_ID),
      ),
      (snap) => setBalances(snap.docs.map((d) => d.data() as InventoryBalance)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'inventory'),
    );

    const unsubSales = onSnapshot(
      query(
        collection(db, 'sales'),
        where('organizationId', '==', DEFAULT_ORG_ID),
        where('branchId', '==', DEFAULT_MAIN_BRANCH_ID),
        orderBy('createdAt', 'desc'),
        limit(500),
      ),
      (snap) => setSales(snap.docs.map((d) => d.data() as SaleOrder)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'sales'),
    );

    const unsubReturns = onSnapshot(
      query(
        collection(db, 'saleReturns'),
        where('organizationId', '==', DEFAULT_ORG_ID),
        where('branchId', '==', DEFAULT_MAIN_BRANCH_ID),
        orderBy('createdAt', 'desc'),
        limit(300),
      ),
      (snap) => setReturns(snap.docs.map((d) => d.data() as SaleReturn)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'saleReturns'),
    );

    const unsubCust = onSnapshot(
      query(
        collection(db, 'customers'),
        where('organizationId', '==', DEFAULT_ORG_ID),
        where('branchId', '==', DEFAULT_MAIN_BRANCH_ID),
      ),
      (snap) => setCustomers(snap.docs.map((d) => d.data() as Customer)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'customers'),
    );

    const unsubSup = onSnapshot(
      query(collection(db, 'suppliers'), where('organizationId', '==', DEFAULT_ORG_ID)),
      (snap) => setSuppliers(snap.docs.map((d) => d.data() as Supplier)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'suppliers'),
    );

    const unsubInc = onSnapshot(
      query(
        collection(db, 'incomeEntries'),
        where('organizationId', '==', DEFAULT_ORG_ID),
        where('branchId', '==', DEFAULT_MAIN_BRANCH_ID),
      ),
      (snap) => setIncomes(snap.docs.map((d) => d.data() as IncomeEntry)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'incomeEntries'),
    );

    const unsubExp = onSnapshot(
      query(
        collection(db, 'expenseEntries'),
        where('organizationId', '==', DEFAULT_ORG_ID),
        where('branchId', '==', DEFAULT_MAIN_BRANCH_ID),
      ),
      (snap) => setExpenses(snap.docs.map((d) => d.data() as ExpenseEntry)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'expenseEntries'),
    );

    const unsubLogs = onSnapshot(
      query(
        collection(db, 'auditLogs'),
        where('organizationId', '==', DEFAULT_ORG_ID),
        orderBy('createdAt', 'desc'),
        limit(8),
      ),
      (snap) => setRecentLogs(snap.docs.map((d) => d.data() as AuditLog)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'auditLogs'),
    );

    return () => {
      unsubUsers();
      unsubProds();
      unsubInv();
      unsubSales();
      unsubReturns();
      unsubCust();
      unsubSup();
      unsubInc();
      unsubExp();
      unsubLogs();
    };
  }, []);

  const dateRange = useMemo(() => {
    const today = toYmd(new Date());
    if (preset === 'today') return { start: today, end: today };
    if (preset === '7d') return { start: toYmd(new Date(Date.now() - 6 * 86400000)), end: today };
    if (preset === 'month') return { start: `${today.slice(0, 7)}-01`, end: today };
    if (preset === 'year') return { start: `${today.slice(0, 4)}-01-01`, end: today };
    return { start: customStart || today, end: customEnd || today };
  }, [preset, customStart, customEnd]);

  const analytics = useMemo(() => {
    const today = toYmd(new Date());
    const monthPrefix = today.slice(0, 7);
    const yearPrefix = today.slice(0, 4);

    let periodSalesGross = 0;
    let periodRefunds = 0;
    let periodBills = 0;
    let periodGrossProfit = 0;

    let todaySales = 0;
    let monthSales = 0;
    let yearSales = 0;

    const productSalesMap = new Map<
      string,
      { sku: string; name: string; baseQty: number; revenueLak: number; profitLak: number }
    >();
    const dailyChartMap = new Map<string, { sales: number; profit: number }>();

    for (const s of sales) {
      if (s.status === 'voided') continue;
      const ymd = tsToYmd(s.createdAt);
      if (!ymd) continue;

      if (ymd === today) todaySales += s.grandTotalLak;
      if (ymd.startsWith(monthPrefix)) monthSales += s.grandTotalLak;
      if (ymd.startsWith(yearPrefix)) yearSales += s.grandTotalLak;

      if (ymd >= dateRange.start && ymd <= dateRange.end) {
        periodSalesGross += s.grandTotalLak;
        periodBills += 1;
        periodGrossProfit += s.grossProfitLak;

        const dayEntry = dailyChartMap.get(ymd) ?? { sales: 0, profit: 0 };
        dayEntry.sales += s.grandTotalLak;
        dayEntry.profit += s.grossProfitLak;
        dailyChartMap.set(ymd, dayEntry);

        for (const it of s.items) {
          const cur = productSalesMap.get(it.productId) ?? {
            sku: it.sku,
            name: it.name,
            baseQty: 0,
            revenueLak: 0,
            profitLak: 0,
          };
          cur.baseQty += it.baseQty;
          cur.revenueLak += it.lineTotalLak;
          cur.profitLak += it.lineTotalLak - it.cogsTotalLak;
          productSalesMap.set(it.productId, cur);
        }
      }
    }

    for (const r of returns) {
      const ymd = tsToYmd(r.createdAt);
      if (ymd === today) todaySales = Math.max(0, todaySales - r.totalRefundLak);
      if (ymd.startsWith(monthPrefix)) monthSales = Math.max(0, monthSales - r.totalRefundLak);
      if (ymd.startsWith(yearPrefix)) yearSales = Math.max(0, yearSales - r.totalRefundLak);
      if (ymd >= dateRange.start && ymd <= dateRange.end) {
        periodRefunds += r.totalRefundLak;
      }
    }

    const periodIncomeTotal = incomes
      .filter((i) => i.entryDate >= dateRange.start && i.entryDate <= dateRange.end)
      .reduce((s, i) => s + i.amountLak, 0);

    const periodOpExpense = expenses
      .filter(
        (e) =>
          e.category !== 'inventory_purchase' &&
          e.entryDate >= dateRange.start &&
          e.entryDate <= dateRange.end,
      )
      .reduce((s, e) => s + e.amountLak, 0);

    const periodAllExpense = expenses
      .filter((e) => e.entryDate >= dateRange.start && e.entryDate <= dateRange.end)
      .reduce((s, e) => s + e.amountLak, 0);

    const periodNetSales = Math.max(0, periodSalesGross - periodRefunds);
    const periodNetProfit = periodGrossProfit - periodOpExpense;

    let lowStock = 0;
    let outStock = 0;
    let invValue = 0;
    for (const b of balances) {
      if (b.qtyOnHandBase <= 0) outStock += 1;
      else if (b.qtyOnHandBase <= b.minStockBaseQty) lowStock += 1;
      if (b.qtyOnHandBase > 0) invValue += Math.round(b.qtyOnHandBase * b.avgCostLak);
    }

    const totalAr = customers.reduce((s, c) => s + c.creditBalanceLak, 0);
    const totalAp = suppliers.reduce((s, sup) => s + sup.payableBalanceLak, 0);

    const topProducts = Array.from(productSalesMap.values())
      .sort((a, b) => b.revenueLak - a.revenueLak)
      .slice(0, 10);

    const chartPoints = Array.from(dailyChartMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([date, val]) => ({ date, ...val }));

    return {
      periodNetSales,
      periodBills,
      periodGrossProfit,
      periodIncomeTotal,
      periodOpExpense,
      periodAllExpense,
      periodNetProfit,
      todaySales,
      monthSales,
      yearSales,
      lowStock,
      outStock,
      invValue,
      totalAr,
      totalAp,
      topProducts,
      chartPoints,
    };
  }, [sales, returns, balances, customers, suppliers, incomes, expenses, dateRange]);

  const maxChartSales = Math.max(1, ...analytics.chartPoints.map((c) => c.sales));

  return (
    <div className="space-y-6">
      {/* Header & Date Range Selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {organization?.name ?? 'Grocery POS Management System'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            ระบบร้านค้าเดี่ยว (1 สาขา) · สกุลเงินหลัก: LAK · เขตเวลา: Asia/Vientiane
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex bg-slate-100 p-1 rounded-lg">
            {(
              [
                { key: 'today', label: 'วันนี้' },
                { key: '7d', label: '7 วัน' },
                { key: 'month', label: 'เดือนนี้' },
                { key: 'year', label: 'ปีนี้' },
                { key: 'custom', label: 'กำหนดเอง' },
              ] as const
            ).map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPreset(p.key)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                  preset === p.key ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-1.5 text-xs">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2 py-1 border border-slate-200 rounded-md"
              />
              <span>ถึง</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2 py-1 border border-slate-200 rounded-md"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => onNavigate('pos')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer"
          >
            เปิด POS ขายสินค้า
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Primary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>ยอดขายสุทธิ (ช่วงที่เลือก)</span>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-blue-700 tabular-nums">
            {formatLak(analytics.periodNetSales)}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            {analytics.periodBills} บิล · วันนี้ {formatLak(analytics.todaySales)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>กำไรขั้นต้น / กำไรสุทธิ</span>
            <Wallet className="w-4 h-4 text-green-600" />
          </div>
          <div
            className={`text-2xl font-bold tabular-nums ${
              analytics.periodNetProfit >= 0 ? 'text-green-700' : 'text-red-700'
            }`}
          >
            {formatLak(analytics.periodNetProfit)}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            ขั้นต้น {formatLak(analytics.periodGrossProfit)} · ค่าใช้จ่าย {formatLak(analytics.periodOpExpense)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>มูลค่าสต็อกคงเหลือ (WAC)</span>
            <Boxes className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {formatLak(analytics.invValue)}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            {products.length} สินค้า ·{' '}
            <span className={analytics.lowStock + analytics.outStock > 0 ? 'text-amber-600 font-medium' : ''}>
              ต่ำ {analytics.lowStock} / หมด {analytics.outStock}
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>ลูกหนี้ (AR) / เจ้าหนี้ (AP)</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-base font-bold text-amber-700 tabular-nums">
            AR: {formatLak(analytics.totalAr)}
          </div>
          <div className="text-base font-bold text-red-700 tabular-nums mt-0.5">
            AP: {formatLak(analytics.totalAp)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            ลูกค้า {customers.length} ราย · พนักงาน {staffCount} คน
          </div>
        </div>
      </div>

      {/* Period Benchmarks Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-center tabular-nums">
          <span className="text-xs text-slate-500">ยอดขายเดือนนี้</span>
          <span className="text-base font-bold text-slate-900">{formatLak(analytics.monthSales)}</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-center tabular-nums">
          <span className="text-xs text-slate-500">ยอดขายปีนี้</span>
          <span className="text-base font-bold text-slate-900">{formatLak(analytics.yearSales)}</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-center tabular-nums">
          <span className="text-xs text-slate-500">รายรับ / รายจ่ายรวม (ช่วงที่เลือก)</span>
          <span className="text-sm font-bold text-slate-900">
            <span className="text-green-700">+{formatLak(analytics.periodIncomeTotal, false)}</span> /{' '}
            <span className="text-red-700">-{formatLak(analytics.periodAllExpense, false)}</span> ₭
          </span>
        </div>
      </div>

      {/* Chart + Top 10 Products */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Daily Sales vs Gross Profit SVG Chart */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-900">
                กราฟยอดขายและกำไรขั้นต้นรายวัน (สูงสุด 14 วันล่าสุดในช่วง)
              </h3>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-blue-600 rounded-xs inline-block" /> ยอดขาย
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-xs inline-block" /> กำไรขั้นต้น
              </span>
            </div>
          </div>

          {analytics.chartPoints.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400">
              ยังไม่มีข้อมูลยอดขายในช่วงเวลาที่เลือก
            </div>
          ) : (
            <div className="flex items-end gap-2 h-52 pt-4 pb-2 overflow-x-auto">
              {analytics.chartPoints.map((pt) => {
                const salesH = Math.max(4, Math.round((pt.sales / maxChartSales) * 150));
                const profitH = Math.max(
                  2,
                  Math.round((Math.max(0, pt.profit) / maxChartSales) * 150),
                );
                return (
                  <div
                    key={pt.date}
                    className="flex-1 min-w-[36px] flex flex-col items-center gap-1 group"
                  >
                    <div className="w-full flex items-end justify-center gap-1 h-[155px]">
                      <div
                        style={{ height: `${salesH}px` }}
                        title={`ยอดขาย ${pt.date}: ${formatLak(pt.sales)}`}
                        className="w-3 sm:w-4 bg-blue-600 rounded-t transition-all"
                      />
                      <div
                        style={{ height: `${profitH}px` }}
                        title={`กำไรขั้นต้น ${pt.date}: ${formatLak(pt.profit)}`}
                        className="w-2.5 sm:w-3 bg-emerald-500 rounded-t transition-all"
                      />
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">
                      {pt.date.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top 10 Best-Selling Products */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">10 อันดับสินค้าขายดี</h3>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="text-xs font-medium text-blue-600 hover:underline cursor-pointer"
            >
              รายงานทั้งหมด
            </button>
          </div>
          <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto text-xs">
            {analytics.topProducts.map((tp, idx) => (
              <div key={tp.sku + idx} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 truncate">
                    {idx + 1}. {tp.name}
                  </div>
                  <div className="text-[11px] text-slate-400 tabular-nums">
                    ขายออก {tp.baseQty.toLocaleString('en-US')} หน่วยฐาน · กำไร {formatLak(tp.profitLak)}
                  </div>
                </div>
                <div className="font-bold text-blue-700 tabular-nums shrink-0">
                  {formatLak(tp.revenueLak)}
                </div>
              </div>
            ))}
            {analytics.topProducts.length === 0 && (
              <div className="py-10 text-center text-slate-400">
                ยังไม่มีรายการสินค้าขายในช่วงนี้
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions + Live Audit Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
          <h3 className="text-sm font-semibold text-slate-900">ทางลัดโมดูลหลัก</h3>
          <div className="grid grid-cols-1 gap-2">
            {[
              { key: 'pos' as ModuleKey, icon: ShoppingCart, title: 'POS ขายสินค้าหน้าร้าน' },
              { key: 'sales_history' as ModuleKey, icon: ReceiptText, title: 'ประวัติการขาย & รับคืน' },
              { key: 'purchasing' as ModuleKey, icon: PackagePlus, title: 'จัดซื้อสินค้า (PO)' },
              { key: 'products' as ModuleKey, icon: Package, title: 'สินค้าทั้งหมดและราคา' },
              { key: 'inventory' as ModuleKey, icon: Boxes, title: 'คลังสินค้าและตรวจนับ' },
              { key: 'accounting' as ModuleKey, icon: UserCog, title: 'บัญชีและการเงิน' },
              { key: 'settings' as ModuleKey, icon: Settings, title: 'ตั้งค่าระบบและภาษี' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onNavigate(item.key)}
                  className="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="text-xs font-medium text-slate-900">{item.title}</span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-900">
                กิจกรรมล่าสุดในฐานข้อมูล (Audit Log)
              </h3>
            </div>
            <span className="text-xs text-slate-400 tabular-nums">
              ภาษีปัจจุบัน: {settings?.taxSettings?.taxEnabled ? `${settings.taxSettings.taxRate}%` : '0% (ปิด)'}
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {recentLogs.map((log) => (
              <div key={log.auditId} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 truncate">
                    {log.action} · <span className="text-blue-700">{log.entityType}</span>
                  </div>
                  <div className="text-slate-500 truncate">
                    โดย {log.userNameSnapshot} · {log.deviceInfo}
                  </div>
                </div>
                <div className="text-slate-500 tabular-nums shrink-0">
                  {formatDateTimeVientiane(log.createdAt)}
                </div>
              </div>
            ))}
            {recentLogs.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-500">
                ยังไม่มีประวัติการทำรายการในระบบ
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
