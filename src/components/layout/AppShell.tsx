import React, { useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  Boxes,
  CreditCard,
  DatabaseBackup,
  FileSpreadsheet,
  FolderTree,
  LayoutDashboard,
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
import { MENU_ITEMS, ROLE_LABELS, getVisiblePrimaryMenuItems } from '../../core/rbac/permissions';
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
  const { userProfile, organization } = useFirebase();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const visibleItems = useMemo(() => getVisiblePrimaryMenuItems(userProfile), [userProfile]);

  const activeItemLabel = useMemo(() => {
    const primary = visibleItems.find((i) => i.key === activeModule);
    if (primary) return primary.label;
    const anyMatch = MENU_ITEMS.find((i) => i.key === activeModule);
    return anyMatch?.label ?? 'ໜ້າຂາຍສິນຄ້າ';
  }, [visibleItems, activeModule]);

  const handleNavClick = (key: ModuleKey) => {
    onSelectModule(key);
    setMobileMenuOpen(false);
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Store className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sm text-slate-900 truncate">
              {organization?.name || 'Grocery POS'}
            </div>
            <div className="text-[11px] text-slate-500 truncate">ລະບົບຂາຍໜ້າຮ້ານ POS</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
          aria-label="ປິດເມນູ"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleItems.map((item) => {
          const Icon = MODULE_ICONS[item.key];
          const isActive = item.key === activeModule;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleNavClick(item.key)}
              className={`w-full min-h-[42px] flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white font-semibold shadow-xs'
                  : 'text-slate-700 hover:bg-blue-50/70 hover:text-blue-700 font-medium'
              }`}
            >
              <Icon
                className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`}
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3.5 border-t border-slate-200 bg-slate-50/70 shrink-0">
        <div className="text-xs font-semibold text-slate-900 truncate">{userProfile?.name}</div>
        <div className="text-[11px] text-slate-500 truncate">
          {userProfile ? ROLE_LABELS[userProfile.role].split(' (')[0] : ''}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-60 shrink-0 sticky top-0 h-screen">
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
        <header className="h-14 sm:h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 shrink-0 cursor-pointer"
              aria-label="ເປີດເມນູ"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
              {activeItemLabel}
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-xs font-medium text-slate-500">
              {organization?.name || 'ຮ້ານຄ້າຫຼັກ'}
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
