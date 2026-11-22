import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  PackageX,
  Receipt,
  Search,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import {
  DEFAULT_MAIN_BRANCH_ID,
  DEFAULT_ORG_ID,
  useFirebase,
} from '../../core/firebase/FirebaseProvider';
import { formatDateVientiane } from '../../core/utils/date';
import { formatLak } from '../../core/utils/money';
import type {
  ExpenseEntry,
  InventoryBalance,
  InventoryLot,
  ModuleKey,
  Product,
  PurchaseOrder,
  SaleOrder,
} from '../../core/firebase/types';

interface NotificationsPageProps {
  onNavigate?: (key: ModuleKey) => void;
}

type AlertCategory = 'all' | 'stock' | 'expiry' | 'payable' | 'receivable' | 'expense';
type AlertSeverity = 'all' | 'critical' | 'warning';

interface AlertItem {
  id: string;
  category: Exclude<AlertCategory, 'all'>;
  severity: Exclude<AlertSeverity, 'all'>;
  title: string;
  description: string;
  metricLabel: string;
  targetModule: ModuleKey;
  actionLabel: string;
}

function toYmd(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Vientiane' }).format(date);
}

function diffDaysYmd(fromYmd: string, toDateYmd: string): number {
  const a = new Date(`${fromYmd}T00:00:00Z`).getTime();
  const b = new Date(`${toDateYmd}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
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

const CATEGORY_LABELS: Record<AlertCategory, string> = {
  all: 'ທັງໝົດ',
  stock: 'ສະຕ໋ອກໃກ້ໝົດ/ໝົດ',
  expiry: 'ໃກ້ໝົດອາຍຸ/ໝົດອາຍຸ',
  payable: 'ເຈົ້າໜີ້ PO',
  receivable: 'ລູກໜີ້ຄ້າງຮັບ',
  expense: 'ຄ່າໃຊ້ຈ່າຍສູງ',
};

export function NotificationsPage({ onNavigate }: NotificationsPageProps) {
  const { settings } = useFirebase();

  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [sales, setSales] = useState<SaleOrder[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);

  const [categoryFilter, setCategoryFilter] = useState<AlertCategory>('all');
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const unsubProds = onSnapshot(
      query(
        collection(db, 'products'),
        where('organizationId', '==', DEFAULT_ORG_ID),
        where('branchId', '==', DEFAULT_MAIN_BRANCH_ID),
      ),
      (snap) => setProducts(snap.docs.map((d) => d.data() as Product)),
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

    const unsubPo = onSnapshot(
      query(
        collection(db, 'purchaseOrders'),
        where('organizationId', '==', DEFAULT_ORG_ID),
        where('branchId', '==', DEFAULT_MAIN_BRANCH_ID),
      ),
      (snap) => setPurchaseOrders(snap.docs.map((d) => d.data() as PurchaseOrder)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'purchaseOrders'),
    );

    const unsubSales = onSnapshot(
      query(
        collection(db, 'sales'),
        where('organizationId', '==', DEFAULT_ORG_ID),
        where('branchId', '==', DEFAULT_MAIN_BRANCH_ID),
      ),
      (snap) => setSales(snap.docs.map((d) => d.data() as SaleOrder)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'sales'),
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

    return () => {
      unsubProds();
      unsubInv();
      unsubLots();
      unsubPo();
      unsubSales();
      unsubExp();
    };
  }, []);

  const alerts = useMemo<AlertItem[]>(() => {
    const list: AlertItem[] = [];
    const todayYmd = toYmd(new Date());
    const expiryWarningDays = settings?.notificationSettings?.expiryWarningDays ?? 30;
    const highExpenseThresholdPercent =
      settings?.notificationSettings?.highExpenseThresholdPercent ?? 30;

    const activeProductMap = new Map(
      products.filter((p) => p.status === 'active').map((p) => [p.productId, p]),
    );

    // 1. Stock alerts (out of stock / below minimum)
    for (const bal of balances) {
      if (!activeProductMap.has(bal.productId)) continue;
      if (bal.qtyOnHandBase <= 0) {
        list.push({
          id: `stock_out_${bal.inventoryId}`,
          category: 'stock',
          severity: 'critical',
          title: `ສິນຄ້າໝົດສະຕ໋ອກ: ${bal.productNameSnapshot}`,
          description: `SKU ${bal.skuSnapshot} ຄົງເຫຼືອ ${bal.qtyOnHandBase} ${bal.baseUnitNameSnapshot} (ຂັ້ນຕ່ຳ ${bal.minStockBaseQty} ${bal.baseUnitNameSnapshot})`,
          metricLabel: `${bal.qtyOnHandBase} ${bal.baseUnitNameSnapshot}`,
          targetModule: 'purchasing',
          actionLabel: 'ສັ່ງຊື້ເພີ່ມ',
        });
      } else if (bal.qtyOnHandBase <= bal.minStockBaseQty) {
        list.push({
          id: `stock_low_${bal.inventoryId}`,
          category: 'stock',
          severity: 'warning',
          title: `ສິນຄ້າໃກ້ໝົດ: ${bal.productNameSnapshot}`,
          description: `SKU ${bal.skuSnapshot} ຄົງເຫຼືອ ${bal.qtyOnHandBase} ${bal.baseUnitNameSnapshot} (ຈຸດສັ່ງຊື້ຂັ້ນຕ່ຳ ${bal.minStockBaseQty})`,
          metricLabel: `ເຫຼືອ ${bal.qtyOnHandBase} ${bal.baseUnitNameSnapshot}`,
          targetModule: 'inventory',
          actionLabel: 'ເບິ່ງສາງສິນຄ້າ',
        });
      }
    }

    // 2. Expiry alerts
    for (const lot of lots) {
      if (lot.status !== 'active' || lot.remainingQtyBase <= 0 || !lot.expiryDate) continue;
      const daysLeft = diffDaysYmd(todayYmd, lot.expiryDate);
      if (daysLeft < 0) {
        list.push({
          id: `exp_expired_${lot.lotId}`,
          category: 'expiry',
          severity: 'critical',
          title: `ລ໋ອດສິນຄ້າໝົດອາຍຸແລ້ວ: ${lot.productNameSnapshot}`,
          description: `ລ໋ອດ ${lot.lotNumber} ໝົດອາຍຸເມື່ອ ${formatDateVientiane(lot.expiryDate)} ຄົງເຫຼືອຄ້າງສາງ ${lot.remainingQtyBase} ໜ່ວຍພື້ນຖານ`,
          metricLabel: `ກາຍກຳນົດ ${Math.abs(daysLeft)} ວັນ`,
          targetModule: 'stock_out',
          actionLabel: 'ເບີກອອກ/ຕັດໝົດອາຍຸ',
        });
      } else if (daysLeft <= expiryWarningDays) {
        list.push({
          id: `exp_soon_${lot.lotId}`,
          category: 'expiry',
          severity: daysLeft <= 7 ? 'critical' : 'warning',
          title: `ສິນຄ້າໃກ້ໝົດອາຍຸ: ${lot.productNameSnapshot}`,
          description: `ລ໋ອດ ${lot.lotNumber} ຈະໝົດອາຍຸວັນທີ ${formatDateVientiane(lot.expiryDate)} (ຄົງເຫຼືອ ${lot.remainingQtyBase} ໜ່ວຍພື້ນຖານ)`,
          metricLabel: daysLeft === 0 ? 'ໝົດອາຍຸມື້ນີ້' : `ອີກ ${daysLeft} ວັນ`,
          targetModule: 'inventory',
          actionLabel: 'ກວດສອບລ໋ອດ',
        });
      }
    }

    // 3. Accounts Payable (PO due / overdue)
    for (const po of purchaseOrders) {
      if (po.status === 'cancelled' || po.creditDueLak <= 0) continue;
      const daysUntilDue = po.dueDate ? diffDaysYmd(todayYmd, po.dueDate) : 999;
      if (po.dueDate && daysUntilDue < 0) {
        list.push({
          id: `ap_overdue_${po.poId}`,
          category: 'payable',
          severity: 'critical',
          title: `ເຈົ້າໜີ້ PO ກາຍກຳນົດຊຳລະ: ${po.poNumber}`,
          description: `ຜູ້ສະໜອງ ${po.supplierName} ຄົບກຳນົດວັນທີ ${formatDateVientiane(po.dueDate)}`,
          metricLabel: formatLak(po.creditDueLak),
          targetModule: 'accounts_payable',
          actionLabel: 'ຊຳລະເຈົ້າໜີ້',
        });
      } else if (po.dueDate && daysUntilDue <= 7) {
        list.push({
          id: `ap_soon_${po.poId}`,
          category: 'payable',
          severity: 'warning',
          title: `ເຈົ້າໜີ້ PO ໃກ້ຄົບກຳນົດ: ${po.poNumber}`,
          description: `ຜູ້ສະໜອງ ${po.supplierName} ຄົບກຳນົດວັນທີ ${formatDateVientiane(po.dueDate)}`,
          metricLabel: formatLak(po.creditDueLak),
          targetModule: 'accounts_payable',
          actionLabel: 'ເບິ່ງລາຍການເຈົ້າໜີ້',
        });
      }
    }

    // 4. Accounts Receivable (credit sales)
    for (const sale of sales) {
      if (sale.status === 'voided' || sale.creditDueLak <= 0) continue;
      const saleYmd = tsToYmd(sale.createdAt) || todayYmd;
      const ageDays = diffDaysYmd(saleYmd, todayYmd);
      list.push({
        id: `ar_due_${sale.saleId}`,
        category: 'receivable',
        severity: ageDays >= 14 ? 'critical' : 'warning',
        title: `ບິນຂາຍຕິດໜີ້ຄ້າງຮັບ: ${sale.invoiceNumber}`,
        description: `ລູກຄ້າ ${sale.customerName} | ເປີດບິນວັນທີ ${formatDateVientiane(sale.createdAt)} (ຄ້າງ ${ageDays} ວັນ)`,
        metricLabel: formatLak(sale.creditDueLak),
        targetModule: 'accounts_receivable',
        actionLabel: 'ຮັບຊຳລະໜີ້',
      });
    }

    // 5. High expense alert (current month vs sales)
    const monthPrefix = todayYmd.slice(0, 7);
    const monthSalesLak = sales
      .filter((s) => s.status !== 'voided' && tsToYmd(s.createdAt).startsWith(monthPrefix))
      .reduce((sum, s) => sum + s.grandTotalLak, 0);
    const monthExpensesLak = expenses
      .filter((e) => e.entryDate.startsWith(monthPrefix))
      .reduce((sum, e) => sum + e.amountLak, 0);

    if (monthExpensesLak > 0) {
      const ratio =
        monthSalesLak > 0
          ? Math.round((monthExpensesLak / monthSalesLak) * 100)
          : 100;
      if (ratio >= highExpenseThresholdPercent) {
        list.push({
          id: `exp_ratio_${monthPrefix}`,
          category: 'expense',
          severity: ratio >= highExpenseThresholdPercent + 15 ? 'critical' : 'warning',
          title: `ສັດສ່ວນລາຍຈ່າຍເດືອນນີ້ສູງກວ່າເກນ (${ratio}%)`,
          description: `ລາຍຈ່າຍເດືອນນີ້ ${formatLak(monthExpensesLak)} ທຽບກັບຍອດຂາຍ ${formatLak(monthSalesLak)} (ເກນແຈ້ງເຕືອນ ${highExpenseThresholdPercent}%)`,
          metricLabel: `${ratio}% ຂອງຍອດຂາຍ`,
          targetModule: 'expenses',
          actionLabel: 'ກວດສອບລາຍຈ່າຍ',
        });
      }
    }

    return list.sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
      return a.category.localeCompare(b.category);
    });
  }, [products, balances, lots, purchaseOrders, sales, expenses, settings]);

  const filteredAlerts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return alerts.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (severityFilter !== 'all' && item.severity !== severityFilter) return false;
      if (
        q &&
        !item.title.toLowerCase().includes(q) &&
        !item.description.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [alerts, categoryFilter, severityFilter, searchTerm]);

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const warningCount = alerts.filter((a) => a.severity === 'warning').length;

  const getCategoryIcon = (cat: AlertItem['category']) => {
    switch (cat) {
      case 'stock':
        return <PackageX className="w-5 h-5" />;
      case 'expiry':
        return <CalendarClock className="w-5 h-5" />;
      case 'payable':
        return <Wallet className="w-5 h-5" />;
      case 'receivable':
        return <Receipt className="w-5 h-5" />;
      case 'expense':
        return <TrendingDown className="w-5 h-5" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Bell className="w-6 h-6 text-amber-600" />
            ສູນການແຈ້ງເຕືອນ (Notifications Center)
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            ຕິດຕາມສະຕ໋ອກໃກ້ໝົດ ສິນຄ້າໝົດອາຍຸ ເຈົ້າໜີ້/ລູກໜີ້ຄ້າງຊຳລະ ແລະ ຄ່າໃຊ້ຈ່າຍເກີນເກນແບບສົດ
          </p>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">ການແຈ້ງເຕືອນທັງໝົດ</div>
            <div className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
              {alerts.length}
            </div>
          </div>
          <Bell className="w-8 h-8 text-slate-300" />
        </div>

        <div className="bg-rose-50/70 rounded-xl border border-rose-200 p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-rose-700 font-medium">ລະດັບວິກິດ (ຕ້ອງຈັດການດ່ວນ)</div>
            <div className="text-2xl font-bold text-rose-700 mt-1 tabular-nums">
              {criticalCount}
            </div>
          </div>
          <AlertCircle className="w-8 h-8 text-rose-400" />
        </div>

        <div className="bg-amber-50/70 rounded-xl border border-amber-200 p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-amber-800 font-medium">ລະດັບເຝົ້າລະວັງ</div>
            <div className="text-2xl font-bold text-amber-800 mt-1 tabular-nums">
              {warningCount}
            </div>
          </div>
          <AlertTriangle className="w-8 h-8 text-amber-400" />
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(CATEGORY_LABELS) as AlertCategory[]).map((cat) => {
            const count =
              cat === 'all' ? alerts.length : alerts.filter((a) => a.category === cat).length;
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {CATEGORY_LABELS[cat]} ({count})
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ຄົ້ນຫາຊື່ສິນຄ້າ ເລກທີບິນ PO ຫຼື ລາຍລະອຽດ..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as AlertSeverity)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            <option value="all">ທຸກລະດັບຄວາມສຳຄັນ</option>
            <option value="critical">ສະເພາະວິກິດ</option>
            <option value="warning">ສະເພາະເຝົ້າລະວັງ</option>
          </select>
        </div>
      </div>

      {/* Alerts List */}
      {filteredAlerts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
          <div className="text-base font-semibold text-slate-900">
            ບໍ່ພົບການແຈ້ງເຕືອນໃນໝວດທີ່ເລືອກ
          </div>
          <p className="text-sm text-slate-500">
            ສະຕ໋ອກສິນຄ້າ ວັນໝົດອາຍຸ ໜີ້ຄ້າງຮັບ/ຄ້າງຈ່າຍ ແລະ ຄ່າໃຊ້ຈ່າຍຢູ່ໃນເກນປົກກະຕິ
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((item) => {
            const isCrit = item.severity === 'critical';
            return (
              <div
                key={item.id}
                className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white ${
                  isCrit ? 'border-rose-200' : 'border-amber-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2.5 rounded-lg shrink-0 ${
                      isCrit
                        ? 'bg-rose-50 text-rose-600'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {getCategoryIcon(item.category)}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                          isCrit
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {isCrit ? 'ວິກິດ' : 'ເຝົ້າລະວັງ'}
                      </span>
                      <span className="text-xs text-slate-500">
                        {CATEGORY_LABELS[item.category]}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 mt-1">{item.title}</h3>
                    <p className="text-xs text-slate-600 mt-0.5">{item.description}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                  <div className="text-right">
                    <div className="text-[11px] text-slate-400">ສະຖານະຕົວເລກ</div>
                    <div
                      className={`text-sm font-bold tabular-nums ${
                        isCrit ? 'text-rose-700' : 'text-amber-800'
                      }`}
                    >
                      {item.metricLabel}
                    </div>
                  </div>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate(item.targetModule)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 transition"
                    >
                      {item.actionLabel}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
