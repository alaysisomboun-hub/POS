import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import {
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  Loader2,
  PackageX,
  RefreshCw,
  Send,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import {
  DEFAULT_MAIN_BRANCH_ID,
  DEFAULT_ORG_ID,
  useFirebase,
} from '../../core/firebase/FirebaseProvider';
import { formatLak } from '../../core/utils/money';
import type {
  Customer,
  ExpenseEntry,
  IncomeEntry,
  InventoryBalance,
  InventoryLot,
  Product,
  PurchaseOrder,
  SaleOrder,
  SaleReturn,
  Supplier,
} from '../../core/firebase/types';

interface AiAnalysisResult {
  executiveSummary: string;
  directAnswer: string;
  salesInsights: string[];
  stockAndExpiryRisks: string[];
  profitAndExpenseInsights: string[];
  actionRecommendations: string[];
}

function toYmd(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Vientiane' }).format(date);
}

function tsToYmd(val: unknown): string {
  if (!val) return '';
  if (
    typeof val === 'object' &&
    val !== null &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    return toYmd((val as { toDate: () => Date }).toDate());
  }
  if (val instanceof Date) return toYmd(val);
  return '';
}

const PRESET_QUESTIONS = [
  'สินค้าไหนควรสั่งซื้อเพิ่มด่วน และสินค้าไหนขายช้าควรจัดโปรโมชั่น?',
  'วิเคราะห์ความเสี่ยงสินค้าหมดอายุ ใกล้หมด และยอดลูกหนี้ค้างชำระ',
  'วิเคราะห์กำไรขั้นต้นและค่าใช้จ่าย 30 วันล่าสุด พร้อมวิธีเพิ่มกำไรสุทธิ',
];

export function AiAnalystPage() {
  const { organization, settings } = useFirebase();

  const [sales, setSales] = useState<SaleOrder[]>([]);
  const [returns, setReturns] = useState<SaleReturn[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);

  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AiAnalysisResult | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [lastAsked, setLastAsked] = useState<string | null>(null);

  useEffect(() => {
    const unsubSales = onSnapshot(
      query(
        collection(db, 'sales'),
        where('organizationId', '==', DEFAULT_ORG_ID),
        where('branchId', '==', DEFAULT_MAIN_BRANCH_ID),
        orderBy('createdAt', 'desc'),
      ),
      (snap) => setSales(snap.docs.map((d) => d.data() as SaleOrder)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'sales'),
    );

    const unsubReturns = onSnapshot(
      query(
        collection(db, 'saleReturns'),
        where('organizationId', '==', DEFAULT_ORG_ID),
        where('branchId', '==', DEFAULT_MAIN_BRANCH_ID),
      ),
      (snap) => setReturns(snap.docs.map((d) => d.data() as SaleReturn)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'saleReturns'),
    );

    const unsubProds = onSnapshot(
      query(
        collection(db, 'products'),
        where('organizationId', '==', DEFAULT_ORG_ID),
        where('branchId', '==', DEFAULT_MAIN_BRANCH_ID),
      ),
      (snap) =>
        setProducts(
          snap.docs.map((d) => d.data() as Product).filter((p) => p.status === 'active'),
        ),
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

    const unsubLots = onSnapshot(
      query(
        collection(db, 'inventoryLots'),
        where('organizationId', '==', DEFAULT_ORG_ID),
        where('branchId', '==', DEFAULT_MAIN_BRANCH_ID),
      ),
      (snap) => setLots(snap.docs.map((d) => d.data() as InventoryLot)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'inventoryLots'),
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

    const unsubInc = onSnapshot(
      query(
        collection(db, 'incomeEntries'),
        where('organizationId', '==', DEFAULT_ORG_ID),
        where('branchId', '==', DEFAULT_MAIN_BRANCH_ID),
      ),
      (snap) => setIncomes(snap.docs.map((d) => d.data() as IncomeEntry)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'incomeEntries'),
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

    const unsubPo = onSnapshot(
      query(
        collection(db, 'purchaseOrders'),
        where('organizationId', '==', DEFAULT_ORG_ID),
        where('branchId', '==', DEFAULT_MAIN_BRANCH_ID),
      ),
      (snap) => setPurchaseOrders(snap.docs.map((d) => d.data() as PurchaseOrder)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'purchaseOrders'),
    );

    return () => {
      unsubSales();
      unsubReturns();
      unsubProds();
      unsubInv();
      unsubLots();
      unsubExp();
      unsubInc();
      unsubCust();
      unsubSup();
      unsubPo();
    };
  }, []);

  const businessMetrics = useMemo(() => {
    const now = new Date();
    const todayYmd = toYmd(now);
    const d30 = new Date(now);
    d30.setDate(d30.getDate() - 29);
    const start30Ymd = toYmd(d30);

    const expiryWarningDays = settings?.notificationSettings?.expiryWarningDays ?? 30;
    const expiryCutoffDate = new Date(now);
    expiryCutoffDate.setDate(expiryCutoffDate.getDate() + expiryWarningDays);
    const expiryCutoffYmd = toYmd(expiryCutoffDate);

    const validSales = sales.filter((s) => s.status !== 'voided');
    const todaySales = validSales.filter((s) => tsToYmd(s.createdAt) === todayYmd);
    const sales30d = validSales.filter((s) => {
      const ymd = tsToYmd(s.createdAt);
      return ymd >= start30Ymd && ymd <= todayYmd;
    });

    const todaySalesLak = todaySales.reduce((sum, s) => sum + s.grandTotalLak, 0);
    const sales30dLak = sales30d.reduce((sum, s) => sum + s.grandTotalLak, 0);
    const grossProfit30dLak = sales30d.reduce((sum, s) => sum + s.grossProfitLak, 0);
    const cogs30dLak = sales30d.reduce((sum, s) => sum + s.cogsTotalLak, 0);
    const returns30dLak = returns
      .filter((r) => {
        const ymd = tsToYmd(r.createdAt);
        return ymd >= start30Ymd && ymd <= todayYmd;
      })
      .reduce((sum, r) => sum + r.totalRefundLak, 0);

    const expenses30d = expenses.filter(
      (e) => e.entryDate >= start30Ymd && e.entryDate <= todayYmd,
    );
    const expenses30dLak = expenses30d.reduce((sum, e) => sum + e.amountLak, 0);
    const expenseByCategory: Record<string, number> = {};
    for (const e of expenses30d) {
      expenseByCategory[e.category] = (expenseByCategory[e.category] ?? 0) + e.amountLak;
    }

    const otherIncome30dLak = incomes
      .filter(
        (i) =>
          i.category === 'other_income' &&
          i.entryDate >= start30Ymd &&
          i.entryDate <= todayYmd,
      )
      .reduce((sum, i) => sum + i.amountLak, 0);

    const productSalesMap = new Map<
      string,
      { productId: string; name: string; sku: string; qtyBase: number; revenueLak: number }
    >();
    for (const s of sales30d) {
      for (const item of s.items) {
        const prev = productSalesMap.get(item.productId) ?? {
          productId: item.productId,
          name: item.name,
          sku: item.sku,
          qtyBase: 0,
          revenueLak: 0,
        };
        prev.qtyBase += item.baseQty;
        prev.revenueLak += item.lineTotalLak;
        productSalesMap.set(item.productId, prev);
      }
    }

    const topProducts = Array.from(productSalesMap.values())
      .sort((a, b) => b.revenueLak - a.revenueLak)
      .slice(0, 10);

    const slowMovingProducts = products
      .filter((p) => !productSalesMap.has(p.productId))
      .slice(0, 10)
      .map((p) => ({ sku: p.sku, name: p.name }));

    const lowStockProducts = balances
      .filter((b) => b.qtyOnHandBase <= b.minStockBaseQty)
      .sort((a, b) => a.qtyOnHandBase - b.qtyOnHandBase)
      .slice(0, 15)
      .map((b) => ({
        sku: b.skuSnapshot,
        name: b.productNameSnapshot,
        qtyOnHand: b.qtyOnHandBase,
        minStock: b.minStockBaseQty,
        unit: b.baseUnitNameSnapshot,
      }));

    const outOfStockCount = balances.filter((b) => b.qtyOnHandBase <= 0).length;
    const totalInventoryValueLak = balances.reduce(
      (sum, b) => sum + Math.round(Math.max(0, b.qtyOnHandBase) * b.avgCostLak),
      0,
    );

    const expiringLots = lots
      .filter(
        (l) =>
          l.status === 'active' &&
          l.remainingQtyBase > 0 &&
          l.expiryDate &&
          l.expiryDate <= expiryCutoffYmd,
      )
      .sort((a, b) => (a.expiryDate ?? '').localeCompare(b.expiryDate ?? ''))
      .slice(0, 15)
      .map((l) => ({
        name: l.productNameSnapshot,
        lotNumber: l.lotNumber,
        expiryDate: l.expiryDate,
        remainingQtyBase: l.remainingQtyBase,
        isExpired: (l.expiryDate ?? '') < todayYmd,
      }));

    const totalReceivableLak = customers.reduce((sum, c) => sum + (c.creditBalanceLak || 0), 0);
    const totalPayableLak = suppliers.reduce((sum, s) => sum + (s.payableBalanceLak || 0), 0);
    const openCreditBillsCount = validSales.filter((s) => s.creditDueLak > 0).length;
    const openCreditPosCount = purchaseOrders.filter(
      (po) => po.status !== 'cancelled' && po.creditDueLak > 0,
    ).length;

    const grossMarginPercent =
      sales30dLak > 0 ? Number(((grossProfit30dLak / sales30dLak) * 100).toFixed(1)) : 0;

    return {
      storeName: organization?.name ?? 'ร้านค้าหลัก',
      currency: 'LAK',
      snapshotDate: todayYmd,
      window30Days: `${start30Ymd} ถึง ${todayYmd}`,
      activeProductsCount: products.length,
      todaySalesLak,
      todayBillsCount: todaySales.length,
      sales30dLak,
      bills30dCount: sales30d.length,
      avgTicketLak: sales30d.length > 0 ? Math.round(sales30dLak / sales30d.length) : 0,
      cogs30dLak,
      grossProfit30dLak,
      grossMarginPercent,
      returns30dLak,
      expenses30dLak,
      otherIncome30dLak,
      estimatedOperatingProfit30dLak: grossProfit30dLak + otherIncome30dLak - expenses30dLak,
      expenseByCategory,
      highExpenseThresholdPercent: settings?.notificationSettings?.highExpenseThresholdPercent ?? 30,
      totalInventoryValueLak,
      outOfStockCount,
      lowStockCount: lowStockProducts.length,
      lowStockProducts,
      expiryWarningDays,
      expiringLotsCount: expiringLots.length,
      expiringLots,
      totalReceivableLak,
      openCreditBillsCount,
      totalPayableLak,
      openCreditPosCount,
      topProducts,
      slowMovingProducts,
    };
  }, [
    organization,
    settings,
    sales,
    returns,
    products,
    balances,
    lots,
    expenses,
    incomes,
    customers,
    suppliers,
    purchaseOrders,
  ]);

  const runAnalysis = async (customQuestion?: string) => {
    const q = (customQuestion ?? question).trim();
    setLoading(true);
    setErrorMsg(null);
    setLastAsked(q || 'วิเคราะห์ภาพรวมธุรกิจรอบ 30 วัน');

    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metrics: businessMetrics,
          question: q || undefined,
        }),
      });

      const data = (await res.json()) as {
        analysis?: AiAnalysisResult;
        generatedAt?: string;
        error?: string;
      };

      if (!res.ok || !data.analysis) {
        throw new Error(data.error || `เซิร์ฟเวอร์ตอบกลับสถานะ ${res.status}`);
      }

      setAnalysis(data.analysis);
      setGeneratedAt(data.generatedAt ?? new Date().toISOString());
      if (customQuestion) setQuestion(customQuestion);
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : 'ไม่สามารถเชื่อมต่อบริการวิเคราะห์ AI ได้',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Bot className="w-6 h-6 text-indigo-600" />
            AI Business Analyst (วิเคราะห์ธุรกิจอัจฉริยะ)
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            วิเคราะห์ยอดขาย กำไร สต็อก วันหมดอายุ ค่าใช้จ่าย และหนี้ค้างจากข้อมูลจริงของร้านด้วย Gemini AI
          </p>
        </div>

        <button
          type="button"
          onClick={() => runAnalysis()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              กำลังวิเคราะห์ข้อมูลร้าน...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              วิเคราะห์ภาพรวมธุรกิจด้วย AI
            </>
          )}
        </button>
      </div>

      {/* Live Metrics Context Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">ยอดขาย 30 วันล่าสุด ({businessMetrics.bills30dCount} บิล)</div>
          <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">
            {formatLak(businessMetrics.sales30dLak)}
          </div>
          <div className="text-xs text-emerald-700 mt-1 tabular-nums">
            กำไรขั้นต้น {formatLak(businessMetrics.grossProfit30dLak)} ({businessMetrics.grossMarginPercent}%)
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">รายจ่ายดำเนินงาน 30 วัน</div>
          <div className="text-lg font-bold text-rose-700 mt-1 tabular-nums">
            {formatLak(businessMetrics.expenses30dLak)}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            กำไรสุทธิประมาณการ {formatLak(businessMetrics.estimatedOperatingProfit30dLak)}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">ความเสี่ยงสต็อก &amp; หมดอายุ</div>
          <div className="text-lg font-bold text-amber-700 mt-1 tabular-nums">
            ใกล้หมด {businessMetrics.lowStockCount} | หมดอายุ/ใกล้หมด {businessMetrics.expiringLotsCount}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            มูลค่าคงคลัง {formatLak(businessMetrics.totalInventoryValueLak)}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="text-xs text-slate-500">ลูกหนี้ (AR) / เจ้าหนี้ (AP)</div>
          <div className="text-sm font-bold text-slate-900 mt-1 tabular-nums">
            AR: {formatLak(businessMetrics.totalReceivableLak)}
          </div>
          <div className="text-sm font-bold text-slate-700 mt-0.5 tabular-nums">
            AP: {formatLak(businessMetrics.totalPayableLak)}
          </div>
        </div>
      </div>

      {/* Question Input & Quick Prompts */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="text-sm font-semibold text-slate-900">ถามเจาะลึกกับ AI จากข้อมูลร้านปัจจุบัน</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runAnalysis();
          }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="เช่น สินค้าไหนควรสั่งเพิ่มสัปดาห์นี้ หรือทำไมกำไรขั้นต้นลดลง..."
            className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 transition"
          >
            <Send className="w-4 h-4" />
            ส่งคำถาม
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          {PRESET_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              disabled={loading}
              onClick={() => runAnalysis(q)}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition text-left"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-start gap-3 text-sm text-rose-800">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
          <div className="space-y-1">
            <div className="font-semibold">ไม่สามารถวิเคราะห์ข้อมูลได้</div>
            <div>{errorMsg}</div>
          </div>
        </div>
      )}

      {!analysis && !loading && !errorMsg && (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center space-y-3">
          <Bot className="w-10 h-10 text-indigo-500 mx-auto" />
          <div className="text-base font-semibold text-slate-900">
            พร้อมวิเคราะห์ข้อมูลร้านค้าของคุณแบบเรียลไทม์
          </div>
          <p className="text-sm text-slate-500 max-w-xl mx-auto">
            กดปุ่ม &ldquo;วิเคราะห์ภาพรวมธุรกิจด้วย AI&rdquo; หรือเลือกคำถามแนะนำด้านบนเพื่อให้ Gemini AI
            ตรวจสอบยอดขาย สต็อกคงเหลือ ล็อตใกล้หมดอายุ ค่าใช้จ่าย และแผนเพิ่มกำไรจากข้อมูลจริงใน Firestore
          </p>
        </div>
      )}

      {analysis && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>โจทย์ที่วิเคราะห์: {lastAsked}</span>
            {generatedAt && (
              <button
                type="button"
                onClick={() => runAnalysis()}
                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 font-medium"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                อัปเดตผลวิเคราะห์ล่าสุด
              </button>
            )}
          </div>

          {/* Executive Summary & Direct Answer */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-indigo-900">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                สรุปภาพรวมผู้บริหาร
              </div>
              <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">
                {analysis.executiveSummary}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Bot className="w-4 h-4 text-slate-700" />
                คำตอบตรงประเด็น
              </div>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                {analysis.directAnswer}
              </p>
            </div>
          </div>

          {/* Detailed Insights Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                วิเคราะห์ยอดขายและสินค้า
              </div>
              <ul className="space-y-2 text-sm text-slate-700">
                {analysis.salesInsights.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-emerald-600 font-bold">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <PackageX className="w-4 h-4 text-amber-600" />
                ความเสี่ยงสต็อกและวันหมดอายุ
              </div>
              <ul className="space-y-2 text-sm text-slate-700">
                {analysis.stockAndExpiryRisks.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-amber-600 font-bold">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <BarChart3 className="w-4 h-4 text-sky-600" />
                วิเคราะห์กำไร ค่าใช้จ่าย และหนี้ค้าง
              </div>
              <ul className="space-y-2 text-sm text-slate-700">
                {analysis.profitAndExpenseInsights.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-sky-600 font-bold">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                แผนปฏิบัติการที่แนะนำทันที
              </div>
              <ol className="space-y-2 text-sm text-slate-800">
                {analysis.actionRecommendations.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-600 text-white text-xs font-bold shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
