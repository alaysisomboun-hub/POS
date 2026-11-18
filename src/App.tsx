import { useState } from 'react';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { AppShell } from './components/layout/AppShell';
import { FirebaseProvider, useFirebase } from './core/firebase/FirebaseProvider';
import { RoleGuard } from './core/rbac/RoleGuard';
import { DashboardPage } from './modules/dashboard/DashboardPage';
import { BranchManagementPage } from './modules/organization/BranchManagementPage';
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
      case 'staff':
        return (
          <RoleGuard moduleKey="staff" action="view">
            <StaffManagementPage />
          </RoleGuard>
        );
      case 'branches':
        return (
          <RoleGuard moduleKey="branches" action="view">
            <BranchManagementPage />
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
