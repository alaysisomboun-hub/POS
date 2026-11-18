import { useState } from 'react';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { AppShell } from './components/layout/AppShell';
import { FirebaseProvider, useFirebase } from './core/firebase/FirebaseProvider';
import { RoleGuard } from './core/rbac/RoleGuard';
import { DashboardPage } from './modules/dashboard/DashboardPage';
import { PosTerminalPage } from './modules/pos/PosTerminalPage';
import { SalesHistoryPage } from './modules/pos/SalesHistoryPage';
import { CategoriesPage } from './modules/products/CategoriesPage';
import { ProductsPage } from './modules/products/ProductsPage';
import { InventoryPage } from './modules/inventory/InventoryPage';
import { StockInPage } from './modules/inventory/StockInPage';
import { StockOutPage } from './modules/inventory/StockOutPage';
import { StaffManagementPage } from './modules/organization/StaffManagementPage';
import { SettingsOverviewPage } from './modules/settings/SettingsOverviewPage';
import { PhaseRoadmapPage } from './modules/common/PhaseRoadmapPage';
import type { ModuleKey } from './core/firebase/types';

function MainRouter() {
  const { ready, connectionOk } = useFirebase();
  const [activeModule, setActiveModule] = useState<ModuleKey>('dashboard');

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl px-6 py-5 text-sm text-slate-600">
          กำลังเตรียมข้อมูลร้านค้าและเชื่อมต่อฐานข้อมูล...
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
      case 'staff':
        return (
          <RoleGuard moduleKey="staff" action="view">
            <StaffManagementPage />
          </RoleGuard>
        );
      case 'settings':
        return (
          <RoleGuard moduleKey="settings" action="view">
            <SettingsOverviewPage />
          </RoleGuard>
        );
      default:
        return (
          <RoleGuard moduleKey={activeModule} action="view">
            <PhaseRoadmapPage moduleKey={activeModule} onNavigate={setActiveModule} />
          </RoleGuard>
        );
    }
  };

  return (
    <AppShell activeModule={activeModule} onSelectModule={setActiveModule}>
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
