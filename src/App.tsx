import { useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { AppShell } from './components/layout/AppShell';
import { FirebaseProvider, useFirebase } from './core/firebase/FirebaseProvider';
import { canAccessPrimaryModule, getVisiblePrimaryMenuItems } from './core/rbac/permissions';
import { RoleGuard } from './core/rbac/RoleGuard';
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
import { FinancePage } from './modules/finance/FinancePage';
import { AccountingPage } from './modules/finance/AccountingPage';
import { StaffManagementPage } from './modules/organization/StaffManagementPage';
import { BackupRestorePage } from './modules/settings/BackupRestorePage';
import { SettingsOverviewPage } from './modules/settings/SettingsOverviewPage';
import type { ModuleKey } from './core/firebase/types';

function MainRouter() {
  const { ready, connectionOk, userProfile } = useFirebase();
  const [activeModule, setActiveModule] = useState<ModuleKey>('pos');

  useEffect(() => {
    if (!ready || !userProfile) return;
    if (!canAccessPrimaryModule(userProfile, activeModule)) {
      const firstAllowed = getVisiblePrimaryMenuItems(userProfile)[0];
      if (firstAllowed) {
        setActiveModule(firstAllowed.key);
      }
    }
  }, [ready, userProfile, activeModule]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl px-6 py-5 text-sm text-slate-600">
          ກຳລັງກຽມຂໍ້ມູນຮ້ານຄ້າ ແລະ ເຊື່ອມຕໍ່ຖານຂໍ້ມູນ...
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
          <RoleGuard
            moduleKey="inventory"
            action="view"
            fallback={
              <RoleGuard moduleKey="stock_in" action="view">
                <InventoryPage />
              </RoleGuard>
            }
          >
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
      case 'expenses':
        return (
          <RoleGuard
            moduleKey="income"
            action="view"
            fallback={
              <RoleGuard moduleKey="expenses" action="view">
                <FinancePage />
              </RoleGuard>
            }
          >
            <FinancePage />
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
    <AppShell activeModule={activeModule} onSelectModule={setActiveModule}>
      {!connectionOk && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          ບໍ່ສາມາດເຊື່ອມຕໍ່ Cloud Firestore ໄດ້ໃນຂະນະນີ້ ກະລຸນາກວດສອບການເຊື່ອມຕໍ່ອິນເຕີເນັດ
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
