import { useEffect, useState } from 'react';
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
import { formatDateTimeVientiane, formatDateVientiane } from '../../core/utils/date';
import { formatLak } from '../../core/utils/money';
import type {
  AuditLog,
  InventoryBalance,
  ModuleKey,
  Product,
  SaleOrder,
  SaleReturn,
  UserProfile,
} from '../../core/firebase/types';

interface DashboardPageProps {
  onNavigate: (key: ModuleKey) => void;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { organization, settings } = useFirebase();
  const [staffCount, setStaffCount] = useState<number>(0);
  const [productCount, setProductCount] = useState<number>(0);
  const [lowStockCount, setLowStockCount] = useState<number>(0);
  const [inventoryValueLak, setInventoryValueLak] = useState<number>(0);
  const [todaySalesNetLak, setTodaySalesNetLak] = useState<number>(0);
  const [todayBillCount, setTodayBillCount] = useState<number>(0);
  const [todayGrossProfitLak, setTodayGrossProfitLak] = useState<number>(0);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    const usersQ = query(
      collection(db, 'users'),
      where('organizationId', '==', DEFAULT_ORG_ID),
    );
    const unsubUsers = onSnapshot(
      usersQ,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as UserProfile);
        setStaffCount(list.filter((u) => u.status === 'active').length);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'users'),
    );

    const prodsQ = query(
      collection(db, 'products'),
      where('organizationId', '==', DEFAULT_ORG_ID),
    );
    const unsubProds = onSnapshot(
      prodsQ,
      (snap) => {
        const activeProds = snap.docs
          .map((d) => d.data() as Product)
          .filter((p) => p.status === 'active');
        setProductCount(activeProds.length);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'products'),
    );

    const invQ = query(
      collection(db, 'inventory'),
      where('organizationId', '==', DEFAULT_ORG_ID),
      where('branchId', '==', DEFAULT_MAIN_BRANCH_ID),
    );
    const unsubInv = onSnapshot(
      invQ,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as InventoryBalance);
        let low = 0;
        let val = 0;
        for (const b of list) {
          if (b.qtyOnHandBase <= b.minStockBaseQty) low += 1;
          if (b.qtyOnHandBase > 0) val += Math.round(b.qtyOnHandBase * b.avgCostLak);
        }
        setLowStockCount(low);
        setInventoryValueLak(val);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'inventory'),
    );

    let latestSales: SaleOrder[] = [];
    let latestReturns: SaleReturn[] = [];

    const recomputeTodaySales = () => {
      const todayKey = formatDateVientiane(new Date());
      let grossSales = 0;
      let bills = 0;
      let profit = 0;
      for (const s of latestSales) {
        if (s.status === 'voided') continue;
        if (formatDateVientiane(s.createdAt) !== todayKey) continue;
        grossSales += s.grandTotalLak;
        bills += 1;
        profit += s.grossProfitLak;
      }
      let refundsToday = 0;
      for (const r of latestReturns) {
        if (formatDateVientiane(r.createdAt) !== todayKey) continue;
        refundsToday += r.totalRefundLak;
      }
      setTodaySalesNetLak(Math.max(0, grossSales - refundsToday));
      setTodayBillCount(bills);
      setTodayGrossProfitLak(profit);
    };

    const salesQ = query(
      collection(db, 'sales'),
      where('organizationId', '==', DEFAULT_ORG_ID),
      where('branchId', '==', DEFAULT_MAIN_BRANCH_ID),
      orderBy('createdAt', 'desc'),
      limit(150),
    );
    const unsubSales = onSnapshot(
      salesQ,
      (snap) => {
        latestSales = snap.docs.map((d) => d.data() as SaleOrder);
        recomputeTodaySales();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'sales'),
    );

    const returnsQ = query(
      collection(db, 'saleReturns'),
      where('organizationId', '==', DEFAULT_ORG_ID),
      where('branchId', '==', DEFAULT_MAIN_BRANCH_ID),
      orderBy('createdAt', 'desc'),
      limit(100),
    );
    const unsubReturns = onSnapshot(
      returnsQ,
      (snap) => {
        latestReturns = snap.docs.map((d) => d.data() as SaleReturn);
        recomputeTodaySales();
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'saleReturns'),
    );

    const logsQ = query(
      collection(db, 'auditLogs'),
      where('organizationId', '==', DEFAULT_ORG_ID),
      orderBy('createdAt', 'desc'),
      limit(8),
    );
    const unsubLogs = onSnapshot(
      logsQ,
      (snap) => {
        setRecentLogs(snap.docs.map((d) => d.data() as AuditLog));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'auditLogs'),
    );

    return () => {
      unsubUsers();
      unsubProds();
      unsubInv();
      unsubSales();
      unsubReturns();
      unsubLogs();
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header Summary */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {organization?.name ?? 'Grocery POS Management System'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            ระบบร้านค้าเดี่ยว (1 สาขา) · สกุลเงินหลัก: LAK · เขตเวลา: Asia/Vientiane
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('pos')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            เปิด POS ขายสินค้า
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate('products')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            จัดการสินค้าและสต็อก
          </button>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            ตั้งค่าร้านค้า
          </button>
        </div>
      </div>

      {/* Real-time KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>ยอดขายวันนี้ (สุทธิ)</span>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {formatLak(todaySalesNetLak)}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            {todayBillCount} บิล · กำไรขั้นต้น {formatLak(todayGrossProfitLak)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>มูลค่าสินค้าคงคลัง (WAC)</span>
            <Wallet className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {formatLak(inventoryValueLak)}
          </div>
          <div className="text-xs text-slate-500 mt-1">คำนวณจากยอดคงเหลือจริงในคลัง</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>สินค้าและแจ้งเตือนสต็อก</span>
            <Boxes className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {productCount.toLocaleString('en-US')} <span className="text-sm font-normal text-slate-500">รายการ</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {lowStockCount > 0 ? (
              <span className="text-amber-600 font-medium">
                สต็อกต่ำ/หมด {lowStockCount} รายการ
              </span>
            ) : (
              'สต็อกสินค้าทุกรายการปกติ'
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>พนักงานที่ใช้งานอยู่</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">{staffCount} คน</div>
          <div className="text-xs text-slate-500 mt-1">
            ภาษี: {settings?.taxSettings?.taxEnabled ? `${settings.taxSettings.taxRate}%` : 'ปิดใช้งาน (0%)'}
          </div>
        </div>
      </div>

      {/* Quick Actions + Live Audit Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">โมดูลที่พร้อมใช้งานในระบบ</h3>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => onNavigate('pos')}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-blue-200 bg-blue-50/40 hover:border-blue-400 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <ShoppingCart className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-slate-900">POS ขายสินค้าหน้าร้าน</div>
                  <div className="text-xs text-slate-500">สแกนบาร์โค้ด ราคาปลีก-ส่ง พักบิล และพิมพ์ใบเสร็จ</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-blue-600" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('sales_history')}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <ReceiptText className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-slate-900">ประวัติการขายและรับคืน</div>
                  <div className="text-xs text-slate-500">ตรวจสอบบิลขาย พิมพ์ซ้ำ รับคืนสินค้า และยกเลิกบิล</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('products')}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Package className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-slate-900">สินค้าและหลายหน่วย</div>
                  <div className="text-xs text-slate-500">SKU บาร์โค้ด ราคาปลีก-ส่ง และพิมพ์ฉลาก</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('stock_in')}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <PackagePlus className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-slate-900">รับสินค้าเข้าคลัง</div>
                  <div className="text-xs text-slate-500">บันทึกล็อต วันหมดอายุ และต้นทุน WAC</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Boxes className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-slate-900">คลังสินค้าและตรวจนับ</div>
                  <div className="text-xs text-slate-500">ยอดคงเหลือ ล็อต Stock Ledger และตำแหน่ง</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('staff')}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <UserCog className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-slate-900">พนักงานและสิทธิ์</div>
                  <div className="text-xs text-slate-500">กำหนด 7 บทบาท และตรวจสอบ Audit Log</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <Settings className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-slate-900">ตั้งค่าระบบและใบเสร็จ</div>
                  <div className="text-xs text-slate-500">ข้อมูลร้าน กระดาษ 80mm/58mm และภาษี</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-900">กิจกรรมล่าสุดในฐานข้อมูล (Audit Log)</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('staff')}
              className="text-xs font-medium text-blue-600 hover:underline cursor-pointer"
            >
              ดูทั้งหมด
            </button>
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
