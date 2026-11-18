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
  History,
  Package,
  Settings,
  Store,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase, DEFAULT_ORG_ID } from '../../core/firebase/FirebaseProvider';
import { formatDateTimeVientiane } from '../../core/utils/date';
import { formatLak } from '../../core/utils/money';
import type { AuditLog, ModuleKey, UserProfile } from '../../core/firebase/types';

interface DashboardPageProps {
  onNavigate: (key: ModuleKey) => void;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { organization, activeBranch, settings } = useFirebase();
  const [staffCount, setStaffCount] = useState<number>(0);
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
            onClick={() => onNavigate('staff')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            พนักงานและสิทธิ์
            <ArrowRight className="w-4 h-4" />
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
            <span>ยอดขายวันนี้</span>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">{formatLak(0)}</div>
          <div className="text-xs text-slate-500 mt-1">รอเปิดใช้งานระบบขาย POS (Phase 4)</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>รายรับสุทธิ / ค่าใช้จ่าย</span>
            <Wallet className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">{formatLak(0)}</div>
          <div className="text-xs text-slate-500 mt-1">รอเปิดใช้งานโมดูลบัญชีคู่ (Phase 8)</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>โครงสร้างร้านค้า</span>
            <Store className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            1 ร้านค้า
          </div>
          <div className="text-xs text-slate-500 mt-1 truncate">
            {activeBranch?.branchName || organization?.name || 'ร้านค้าหลัก'} · เชื่อมโยงอัตโนมัติ
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
              onClick={() => onNavigate('staff')}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <UserCog className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-slate-900">พนักงานและสิทธิ์</div>
                  <div className="text-xs text-slate-500">เพิ่มพนักงาน กำหนด 7 บทบาท และ Audit Log</div>
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
                  <div className="text-xs text-slate-500">ข้อมูลร้าน ขนาดกระดาษ 80mm/58mm และภาษี</div>
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
                  <div className="text-sm font-medium text-slate-900">สินค้าและคลังสินค้า</div>
                  <div className="text-xs text-slate-500">แผนพัฒนาถัดไป (Phase 3)</div>
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
