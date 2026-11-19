import { useEffect, useState } from 'react';
import { LogOut, ShieldAlert, UserCheck } from 'lucide-react';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { AppShell } from './components/layout/AppShell';
import { FirebaseProvider, useFirebase } from './core/firebase/FirebaseProvider';
import { getVisibleMenuGroups, hasPermission } from './core/rbac/permissions';
import { RoleGuard } from './core/rbac/RoleGuard';
import { LoginPage } from './modules/auth/LoginPage';
import { DashboardPage } from './modules/dashboard/DashboardPage';
import { ReportsPage } from './modules/reports/ReportsPage';
import { AiAnalystPage } from './modules/analytics/AiAnalystPage';
import { NotificationsPage } from './modules/notifications/NotificationsPage';
import { PosTerminalPage } from './modules/pos/PosTerminalPage';
import { SalesHistoryPage } from './modules/pos/SalesHistoryPage';
import { CategoriesPage } from './modules/products/CategoriesPage';
import { ProductsPage } from './modules/products/ProductsPage';
import { InventoryPage } from './modules/inventory/InventoryPage';
import { StockInPage } from './modules/inventory/StockInPage';
import { StockOutPage } from './modules/inventory/StockOutPage';
import { SuppliersPage } from './modules/purchasing/SuppliersPage';
import { PurchaseOrdersPage } from './modules/purchasing/PurchaseOrdersPage';
import { CustomersPage } from './modules/customers/CustomersPage';
import { MembershipsPromotionsPage } from './modules/customers/MembershipsPromotionsPage';
import { AccountsReceivablePage } from './modules/finance/AccountsReceivablePage';
import { AccountsPayablePage } from './modules/finance/AccountsPayablePage';
import { IncomePage } from './modules/finance/IncomePage';
import { ExpensesPage } from './modules/finance/ExpensesPage';
import { AccountingPage } from './modules/finance/AccountingPage';
import { StaffManagementPage } from './modules/organization/StaffManagementPage';
import { BackupRestorePage } from './modules/settings/BackupRestorePage';
import { SettingsOverviewPage } from './modules/settings/SettingsOverviewPage';
import type { ModuleKey } from './core/firebase/types';

function MainRouter() {
  const {
    authReady,
    authUser,
    profileLoading,
    profileError,
    canClaimLegacyOwner,
    connectionOk,
    userProfile,
    signOutUser,
    claimLegacyOwnerProfile,
  } = useFirebase();
  const [activeModule, setActiveModule] = useState<ModuleKey>('dashboard');
  const [claimingOwner, setClaimingOwner] = useState(false);

  useEffect(() => {
    if (!userProfile) return;
    if (!hasPermission(userProfile, activeModule, 'view')) {
      const preferredOrder: ModuleKey[] = [
        'dashboard',
        'pos',
        'inventory',
        'purchasing',
        'products',
        'accounting',
      ];
      const preferred = preferredOrder.find((m) => hasPermission(userProfile, m, 'view'));
      const visibleGroups = getVisibleMenuGroups(userProfile);
      const firstPermitted = preferred || visibleGroups[0]?.items[0]?.key;
      if (firstPermitted && firstPermitted !== activeModule) {
        setActiveModule(firstPermitted);
      }
    }
  }, [userProfile, activeModule]);

  if (!authReady || (authUser && profileLoading)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl px-6 py-5 text-sm text-slate-600">
          กำลังตรวจสอบสิทธิ์ผู้ใช้งานและโหลดโปรไฟล์จากฐานข้อมูล...
        </div>
      </div>
    );
  }

  if (!authUser) {
    return <LoginPage />;
  }

  if (profileError || !userProfile || userProfile.status !== 'active') {
    const handleClaimOwner = async () => {
      setClaimingOwner(true);
      try {
        await claimLegacyOwnerProfile();
      } finally {
        setClaimingOwner(false);
      }
    };

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-5 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-1 min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                ไม่สามารถเข้าใช้งานระบบด้วยบัญชีนี้ได้
              </h2>
              <p className="text-xs sm:text-sm text-slate-600">
                {profileError || 'บัญชีของท่านไม่มีสิทธิ์เข้าใช้งานหรือถูกระงับสิทธิ์'}
              </p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs space-y-1.5 text-slate-700">
            <div>
              <span className="text-slate-500">อีเมลที่เข้าสู่ระบบ:</span>{' '}
              <span className="font-semibold">{authUser.email || '-'}</span>
            </div>
            <div className="break-all">
              <span className="text-slate-500">Firebase UID ปัจจุบัน:</span>{' '}
              <code className="font-mono text-slate-800">{authUser.uid}</code>
            </div>
          </div>

          {canClaimLegacyOwner && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2.5 text-xs text-amber-900">
              <div className="font-semibold">
                ตรวจพบร้านค้าเดิมที่ยังไม่เคยผูกสิทธิ์เจ้าของร้านกับ Firebase UID
              </div>
              <p className="leading-relaxed text-amber-800">
                หากท่านเป็นเจ้าของร้านค้าและกำลังเข้าสู่ระบบครั้งแรกหลังเปิดใช้งานการยืนยันตัวตน สามารถกดปุ่มด้านล่างเพื่อผูกบัญชีนี้เป็น Super Admin ได้เพียงครั้งเดียว
              </p>
              <button
                type="button"
                onClick={handleClaimOwner}
                disabled={claimingOwner}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <UserCheck className="w-4 h-4" />
                {claimingOwner ? 'กำลังผูกสิทธิ์เจ้าของร้าน...' : 'ยืนยันสิทธิ์เจ้าของร้านครั้งแรก'}
              </button>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              ออกจากระบบ / เปลี่ยนบัญชี
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderModuleContent = () => {
    switch (activeModule) {
      case 'dashboard':
        return (
          <RoleGuard moduleKey="dashboard" action="view">
            <DashboardPage onNavigate={setActiveModule} />
          </RoleGuard>
        );
      case 'reports':
        return (
          <RoleGuard moduleKey="reports" action="view">
            <ReportsPage />
          </RoleGuard>
        );
      case 'ai_analyst':
        return (
          <RoleGuard moduleKey="ai_analyst" action="view">
            <AiAnalystPage />
          </RoleGuard>
        );
      case 'notifications':
        return (
          <RoleGuard moduleKey="notifications" action="view">
            <NotificationsPage onNavigate={setActiveModule} />
          </RoleGuard>
        );
      case 'pos':
        return (
          <RoleGuard moduleKey="pos" action="view">
            <PosTerminalPage />
          </RoleGuard>
        );
      case 'sales_history':
        return (
          <RoleGuard moduleKey="sales_history" action="view">
            <SalesHistoryPage />
          </RoleGuard>
        );
      case 'products':
        return (
          <RoleGuard moduleKey="products" action="view">
            <ProductsPage />
          </RoleGuard>
        );
      case 'categories':
        return (
          <RoleGuard moduleKey="categories" action="view">
            <CategoriesPage />
          </RoleGuard>
        );
      case 'inventory':
        return (
          <RoleGuard moduleKey="inventory" action="view">
            <InventoryPage />
          </RoleGuard>
        );
      case 'stock_in':
        return (
          <RoleGuard moduleKey="stock_in" action="view">
            <StockInPage />
          </RoleGuard>
        );
      case 'stock_out':
        return (
          <RoleGuard moduleKey="stock_out" action="view">
            <StockOutPage />
          </RoleGuard>
        );
      case 'purchasing':
        return (
          <RoleGuard moduleKey="purchasing" action="view">
            <PurchaseOrdersPage />
          </RoleGuard>
        );
      case 'suppliers':
        return (
          <RoleGuard moduleKey="suppliers" action="view">
            <SuppliersPage />
          </RoleGuard>
        );
      case 'customers':
        return (
          <RoleGuard moduleKey="customers" action="view">
            <CustomersPage />
          </RoleGuard>
        );
      case 'memberships_promotions':
        return (
          <RoleGuard moduleKey="memberships_promotions" action="view">
            <MembershipsPromotionsPage />
          </RoleGuard>
        );
      case 'accounts_receivable':
        return (
          <RoleGuard moduleKey="accounts_receivable" action="view">
            <AccountsReceivablePage />
          </RoleGuard>
        );
      case 'accounts_payable':
        return (
          <RoleGuard moduleKey="accounts_payable" action="view">
            <AccountsPayablePage />
          </RoleGuard>
        );
      case 'income':
        return (
          <RoleGuard moduleKey="income" action="view">
            <IncomePage />
          </RoleGuard>
        );
      case 'expenses':
        return (
          <RoleGuard moduleKey="expenses" action="view">
            <ExpensesPage />
          </RoleGuard>
        );
      case 'accounting':
        return (
          <RoleGuard moduleKey="accounting" action="view">
            <AccountingPage />
          </RoleGuard>
        );
      case 'staff':
        return (
          <RoleGuard moduleKey="staff" action="view">
            <StaffManagementPage />
          </RoleGuard>
        );
      case 'backup':
        return (
          <RoleGuard moduleKey="backup" action="view">
            <BackupRestorePage />
          </RoleGuard>
        );
      case 'settings':
        return (
          <RoleGuard moduleKey="settings" action="view">
            <SettingsOverviewPage />
          </RoleGuard>
        );
    }
  };

  return (
    <AppShell key={userProfile.uid} activeModule={activeModule} onSelectModule={setActiveModule}>
      {!connectionOk && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          ไม่สามารถเชื่อมต่อ Cloud Firestore ได้ในขณะนี้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต
        </div>
      )}
      {renderModuleContent()}
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <FirebaseProvider>
        <MainRouter />
      </FirebaseProvider>
    </ErrorBoundary>
  );
}
