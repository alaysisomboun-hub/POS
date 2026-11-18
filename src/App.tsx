import { useEffect, useMemo, useState } from 'react';
import { ShieldOff, LogOut } from 'lucide-react';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { AppShell } from './components/layout/AppShell';
import { FirebaseProvider, useFirebase } from './core/firebase/FirebaseProvider';
import { RoleGuard } from './core/rbac/RoleGuard';
import { getVisibleMenuGroups, hasPermission } from './core/rbac/permissions';
import { LoginScreen } from './modules/auth/LoginScreen';
import { OnboardingSetup } from './modules/auth/OnboardingSetup';
import { BranchManagementPage } from './modules/organization/BranchManagementPage';
import { StaffManagementPage } from './modules/organization/StaffManagementPage';
import { SettingsOverviewPage } from './modules/settings/SettingsOverviewPage';
import { PhaseRoadmapPage } from './modules/common/PhaseRoadmapPage';
import type { ModuleKey } from './core/firebase/types';

function MainRouter() {
  const {
    firebaseUser,
    authReady,
    userProfile,
    profileLoading,
    signOut,
  } = useFirebase();

  const visibleGroups = useMemo(() => getVisibleMenuGroups(userProfile), [userProfile]);

  const defaultModule = useMemo<ModuleKey>(() => {
    if (!userProfile) return 'branches';
    if (hasPermission(userProfile, 'staff', 'view')) return 'staff';
    if (hasPermission(userProfile, 'branches', 'view')) return 'branches';
    const first = visibleGroups[0]?.items[0]?.key;
    return first ?? 'pos';
  }, [userProfile, visibleGroups]);

  const [activeModule, setActiveModule] = useState<ModuleKey>(defaultModule);

  useEffect(() => {
    if (!userProfile) return;
    if (!hasPermission(userProfile, activeModule, 'view')) {
      setActiveModule(defaultModule);
    }
  }, [userProfile, activeModule, defaultModule]);

  if (!authReady || (firebaseUser && profileLoading)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl px-6 py-5 text-sm text-slate-600">
          กำลังตรวจสอบสิทธิ์และโหลดข้อมูลร้านค้า...
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <LoginScreen />;
  }

  if (!userProfile) {
    return <OnboardingSetup />;
  }

  if (userProfile.status !== 'active') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <ShieldOff className="w-6 h-6" />
          </div>
          <h1 className="text-base font-semibold text-slate-900">บัญชีถูกระงับการใช้งาน</h1>
          <p className="text-sm text-slate-600">
            บัญชี {userProfile.email} ถูกระงับสิทธิ์ชั่วคราว กรุณาติดต่อเจ้าของกิจการหรือผู้ดูแลระบบ
          </p>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            ออกจากระบบ
          </button>
        </div>
      </div>
    );
  }

  const renderModuleContent = () => {
    switch (activeModule) {
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
