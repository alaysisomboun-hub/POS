import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  CreditCard,
  DatabaseBackup,
  FileSpreadsheet,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PackageMinus,
  PackagePlus,
  Receipt,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Tags,
  Truck,
  Users,
  UserCog,
  Wallet,
  X,
} from 'lucide-react';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { ROLE_LABELS, getVisibleMenuGroups } from '../../core/rbac/permissions';
import type { ModuleKey } from '../../core/firebase/types';

const MODULE_ICONS: Record<ModuleKey, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  pos: ShoppingCart,
  sales_history: Receipt,
  products: Package,
  categories: FolderTree,
  inventory: Boxes,
  stock_in: PackagePlus,
  stock_out: PackageMinus,
  transfers: ArrowLeftRight,
  purchasing: ShoppingBag,
  suppliers: Truck,
  customers: Users,
  memberships_promotions: Tags,
  accounts_receivable: CreditCard,
  accounts_payable: Wallet,
  income: Activity,
  expenses: FileSpreadsheet,
  accounting: BarChart3,
  reports: FileSpreadsheet,
  staff: UserCog,
  branches: Building2,
  ai_analyst: Sparkles,
  notifications: Bell,
  backup: DatabaseBackup,
  settings: Settings,
};

interface AppShellProps {
  activeModule: ModuleKey;
  onSelectModule: (key: ModuleKey) => void;
  children: React.ReactNode;
}

export function AppShell({ activeModule, onSelectModule, children }: AppShellProps) {
  const {
    userProfile,
    organization,
    branches,
    activeBranch,
    setActiveBranchId,
    signOut,
  } = useFirebase();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const menuGroups = useMemo(() => getVisibleMenuGroups(userProfile), [userProfile]);

  const activeItemLabel = useMemo(() => {
    for (const g of menuGroups) {
      const found = g.items.find((i) => i.key === activeModule);
      if (found) return found.label;
    }
    return 'ระบบบริหารร้านค้า';
  }, [menuGroups, activeModule]);

  const handleNavClick = (key: ModuleKey) => {
    onSelectModule(key);
    setMobileMenuOpen(false);
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
            <Store className="w-4 h-4" />
          </div>
          <span className="font-bold text-sm text-slate-900 truncate">
            {organization?.name || 'Grocery POS'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
          aria-label="ปิดเมนู"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {menuGroups.map((group) => (
          <div key={group.group}>
            <div className="px-2.5 mb-1.5 text-[11px] font-semibold text-slate-400">
              {group.group}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = MODULE_ICONS[item.key];
                const isActive = item.key === activeModule;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleNavClick(item.key)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-blue-600' : 'text-slate-400'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-200 bg-slate-50/70 shrink-0">
        <div className="text-xs font-medium text-slate-900 truncate">{userProfile?.name}</div>
        <div className="text-[11px] text-slate-500 truncate">
          {userProfile ? ROLE_LABELS[userProfile.role] : ''}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{renderSidebarContent()}</div>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 shrink-0"
              aria-label="เปิดเมนู"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">
                {activeItemLabel}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {branches.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline text-xs text-slate-500">สาขา:</span>
                <select
                  value={activeBranch?.branchId || ''}
                  onChange={(e) => setActiveBranchId(e.target.value)}
                  className="px-2.5 py-1.5 text-xs sm:text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 max-w-[170px] sm:max-w-[220px] truncate"
                >
                  {branches.map((b) => (
                    <option key={b.branchId} value={b.branchId}>
                      {b.branchCode} · {b.branchName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-slate-500" />
              <span className="hidden sm:inline">ออกจากระบบ</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
