import type { ModuleKey, PermissionAction, PermissionsMap, UserProfile, UserRole } from '../firebase/types';

export interface MenuItemConfig {
  key: ModuleKey;
  label: string;
  group: string;
  phase: number;
  description: string;
}

export const MENU_ITEMS: MenuItemConfig[] = [
  // ຫຼັກຂອງລະບົບ POS (9 ເມນູຫຼັກ)
  { key: 'pos', label: 'ໜ້າຂາຍສິນຄ້າ', group: 'ເມນູຫຼັກ', phase: 4, description: 'ຂາຍຍ່ອຍ-ຂາຍສົ່ງ ສະແກນບາໂຄ້ດ ຊຳລະເງິນ ແລະ ພິມໃບບິນ' },
  { key: 'products', label: 'ສິນຄ້າ', group: 'ເມນູຫຼັກ', phase: 3, description: 'ຈັດການສິນຄ້າ SKU ບາໂຄ້ດ ລາຄາ ແລະ ໜ່ວຍຂາຍ' },
  { key: 'categories', label: 'ໝວດໝູ່ສິນຄ້າ', group: 'ເມນູຫຼັກ', phase: 3, description: 'ຈັດລະບຽບໝວດໝູ່ສິນຄ້າຫຼັກ ແລະ ໝວດໝູ່ຍ່ອຍ' },
  { key: 'inventory', label: 'ສະຕັອກສິນຄ້າ', group: 'ເມນູຫຼັກ', phase: 3, description: 'ຍອດຄົງເຫຼືອ ຮັບສິນຄ້າເຂົ້າ ເບີກອອກ ແລະ ກວດນັບສະຕັອກ' },
  { key: 'sales_history', label: 'ປະຫວັດການຂາຍ', group: 'ເມນູຫຼັກ', phase: 4, description: 'ກວດສອບບິນຂາຍ ພິມໃບບິນຄືນ ຄືນສິນຄ້າ ແລະ ຍົກເລີກບິນ' },
  { key: 'income', label: 'ລາຍຮັບ ແລະ ລາຍຈ່າຍ', group: 'ເມນູຫຼັກ', phase: 8, description: 'ສະຫຼຸບລາຍຮັບ ລາຍຈ່າຍ ແລະ ຍອດຄົງເຫຼືອສຸດທິຂອງຮ້ານ' },
  { key: 'reports', label: 'ລາຍງານ', group: 'ເມນູຫຼັກ', phase: 9, description: 'ລາຍງານຍອດຂາຍ ສະຕັອກຄົງເຫຼືອ ການເງິນ ແລະ ສົ່ງອອກ CSV' },
  { key: 'staff', label: 'ພະນັກງານ', group: 'ເມນູຫຼັກ', phase: 2, description: 'ຈັດການພະນັກງານ ບົດບາດ ແລະ ສິດການໃຊ້ງານ' },
  { key: 'settings', label: 'ຕັ້ງຄ່າຮ້ານຄ້າ', group: 'ເມນູຫຼັກ', phase: 2, description: 'ຕັ້ງຄ່າຮ້ານຄ້າ ໃບບິນ ພາສີ ແລະ ສຳຮອງຂໍ້ມູນ' },

  // ໂມດູນເສີມ (ຮັກສາໄວ້ເພື່ອຄວາມເຂົ້າກັນໄດ້ຂອງສິດເດີມ)
  { key: 'dashboard', label: 'ພາບລວມ (Dashboard)', group: 'ໂມດູນເສີມ', phase: 9, description: 'ສະຫຼຸບຍອດຂາຍ ຕົ້ນທຶນ ແລະ ກຳໄລ' },
  { key: 'stock_in', label: 'ຮັບສິນຄ້າເຂົ້າ', group: 'ໂມດູນເສີມ', phase: 3, description: 'ຮັບສິນຄ້າເຂົ້າສາງ ແລະ ບັນທຶກລັອດ' },
  { key: 'stock_out', label: 'ເບີກສິນຄ້າອອກ', group: 'ໂມດູນເສີມ', phase: 3, description: 'ເບີກສິນຄ້າ ສິນຄ້າເສຍຫາຍ ແລະ ໝົດອາຍຸ' },
  { key: 'expenses', label: 'ລາຍຈ່າຍ', group: 'ໂມດູນເສີມ', phase: 8, description: 'ບັນທຶກຄ່າໃຊ້ຈ່າຍດຳເນີນງານຂອງຮ້ານ' },
  { key: 'purchasing', label: 'ຈັດຊື້ສິນຄ້າ', group: 'ໂມດູນເສີມ', phase: 6, description: 'ໃບສັ່ງຊື້ (PO)' },
  { key: 'suppliers', label: 'ຜູ້ສະໜອງ', group: 'ໂມດູນເສີມ', phase: 6, description: 'ຂໍ້ມູນຄູ່ຄ້າ' },
  { key: 'customers', label: 'ລູກຄ້າ', group: 'ໂມດູນເສີມ', phase: 7, description: 'ຖານຂໍ້ມູນລູກຄ້າ' },
  { key: 'memberships_promotions', label: 'ສະມາຊິກ ແລະ ໂປຣໂມຊັ່ນ', group: 'ໂມດູນເສີມ', phase: 5, description: 'ລະດັບສະມາຊິກ ແລະ ໂປຣໂມຊັ່ນ' },
  { key: 'accounts_receivable', label: 'ລູກໜີ້', group: 'ໂມດູນເສີມ', phase: 7, description: 'ຕິດຕາມໜີ້ລູກຄ້າ' },
  { key: 'accounts_payable', label: 'ເຈົ້າໜີ້', group: 'ໂມດູນເສີມ', phase: 7, description: 'ຕິດຕາມຍອດຄ້າງຈ່າຍ' },
  { key: 'accounting', label: 'ບັນຊີ', group: 'ໂມດູນເສີມ', phase: 8, description: 'ປຶ້ມລາຍວັນ ແລະ ຜັງບັນຊີ' },
  { key: 'ai_analyst', label: 'AI ວິເຄາະທຸລະກິດ', group: 'ໂມດູນເສີມ', phase: 10, description: 'ວິເຄາະຂໍ້ມູນດ້ວຍ AI' },
  { key: 'notifications', label: 'ການແຈ້ງເຕືອນ', group: 'ໂມດູນເສີມ', phase: 10, description: 'ແຈ້ງເຕືອນສິນຄ້າໃກ້ໝົດ' },
  { key: 'backup', label: 'ສຳຮອງຂໍ້ມູນ', group: 'ໂມດູນເສີມ', phase: 10, description: 'ສຳຮອງ ແລະ ກູ້ຄືນຂໍ້ມູນ' },
];

export const PRIMARY_SIDEBAR_KEYS: ModuleKey[] = [
  'pos',
  'products',
  'categories',
  'inventory',
  'sales_history',
  'income',
  'reports',
  'staff',
  'settings',
];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin (ຜູ້ດູແລລະບົບສູງສຸດ)',
  owner: 'Owner (ເຈົ້າຂອງຮ້ານ)',
  branch_manager: 'Store Manager (ຜູ້ຈັດການຮ້ານ)',
  cashier: 'Cashier (ພະນັກງານຂາຍ)',
  warehouse_staff: 'Warehouse Staff (ພະນັກງານສາງ)',
  purchasing_staff: 'Purchasing Staff (ພະນັກງານຈັດຊື້)',
  accountant: 'Accountant (ພະນັກງານບັນຊີ)',
};

export const ALL_ACTIONS: PermissionAction[] = [
  'view',
  'create',
  'edit',
  'delete',
  'approve',
  'export',
  'manage',
];

export const ACTION_LABELS: Record<PermissionAction, string> = {
  view: 'ເບິ່ງຂໍ້ມູນ',
  create: 'ເພີ່ມຂໍ້ມູນ',
  edit: 'ແກ້ໄຂ',
  delete: 'ລຶບ/ປິດໃຊ້ງານ',
  approve: 'ອະນຸມັດ',
  export: 'ສົ່ງອອກ',
  manage: 'ຈັດການລະບົບ',
};

const ALL_MODULES = MENU_ITEMS.map((m) => m.key);

function fullMap(modules: ModuleKey[], actions: PermissionAction[]): PermissionsMap {
  const map: PermissionsMap = {};
  for (const mod of modules) {
    map[mod] = [...actions];
  }
  return map;
}

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, PermissionsMap> = {
  super_admin: fullMap(ALL_MODULES, ALL_ACTIONS),
  owner: fullMap(ALL_MODULES, ALL_ACTIONS),
  branch_manager: {
    dashboard: ['view', 'export'],
    pos: ['view', 'create', 'edit', 'approve'],
    sales_history: ['view', 'edit', 'approve', 'export'],
    products: ['view', 'create', 'edit', 'delete', 'export'],
    categories: ['view', 'create', 'edit', 'delete'],
    inventory: ['view', 'create', 'edit', 'approve', 'export'],
    stock_in: ['view', 'create', 'approve'],
    stock_out: ['view', 'create', 'approve'],
    purchasing: ['view', 'create', 'approve'],
    suppliers: ['view', 'create', 'edit'],
    customers: ['view', 'create', 'edit'],
    memberships_promotions: ['view', 'create', 'edit'],
    accounts_receivable: ['view', 'create', 'approve'],
    accounts_payable: ['view'],
    income: ['view', 'create'],
    expenses: ['view', 'create'],
    reports: ['view', 'export'],
    staff: ['view', 'create', 'edit'],
    notifications: ['view', 'edit'],
    settings: ['view'],
  },
  cashier: {
    pos: ['view', 'create'],
    sales_history: ['view'],
    products: ['view'],
    categories: ['view'],
    customers: ['view', 'create'],
    memberships_promotions: ['view'],
    accounts_receivable: ['view', 'create'],
    notifications: ['view'],
  },
  warehouse_staff: {
    products: ['view', 'create', 'edit'],
    categories: ['view'],
    inventory: ['view', 'create', 'edit', 'export'],
    stock_in: ['view', 'create'],
    stock_out: ['view', 'create'],
    purchasing: ['view', 'edit'],
    notifications: ['view'],
  },
  purchasing_staff: {
    products: ['view', 'create', 'edit'],
    inventory: ['view'],
    purchasing: ['view', 'create', 'edit', 'export'],
    suppliers: ['view', 'create', 'edit'],
    accounts_payable: ['view'],
    notifications: ['view'],
  },
  accountant: {
    dashboard: ['view', 'export'],
    sales_history: ['view', 'export'],
    inventory: ['view', 'export'],
    purchasing: ['view', 'export'],
    accounts_receivable: ['view', 'create', 'edit', 'approve', 'export'],
    accounts_payable: ['view', 'create', 'edit', 'approve', 'export'],
    income: ['view', 'create', 'edit', 'export'],
    expenses: ['view', 'create', 'edit', 'approve', 'export'],
    accounting: ['view', 'create', 'edit', 'approve', 'export', 'manage'],
    reports: ['view', 'export'],
    notifications: ['view'],
  },
};

export function hasPermission(
  user: UserProfile | null,
  moduleKey: ModuleKey,
  action: PermissionAction = 'view',
): boolean {
  if (!user || user.status !== 'active') return false;
  if (user.role === 'super_admin' || user.role === 'owner') return true;
  const custom = user.permissions?.[moduleKey];
  if (Array.isArray(custom)) {
    return custom.includes(action);
  }
  const fallback = DEFAULT_ROLE_PERMISSIONS[user.role]?.[moduleKey] ?? [];
  return fallback.includes(action);
}

export function canAccessPrimaryModule(user: UserProfile | null, key: ModuleKey): boolean {
  if (key === 'income') {
    return hasPermission(user, 'income', 'view') || hasPermission(user, 'expenses', 'view');
  }
  if (key === 'inventory') {
    return (
      hasPermission(user, 'inventory', 'view') ||
      hasPermission(user, 'stock_in', 'view') ||
      hasPermission(user, 'stock_out', 'view')
    );
  }
  return hasPermission(user, key, 'view');
}

export function getVisiblePrimaryMenuItems(user: UserProfile | null): MenuItemConfig[] {
  const byKey = new Map(MENU_ITEMS.map((m) => [m.key, m]));
  return PRIMARY_SIDEBAR_KEYS.map((k) => byKey.get(k))
    .filter((item): item is MenuItemConfig => Boolean(item))
    .filter((item) => canAccessPrimaryModule(user, item.key));
}

export function getVisibleMenuGroups(user: UserProfile | null): {
  group: string;
  items: MenuItemConfig[];
}[] {
  const items = getVisiblePrimaryMenuItems(user);
  return items.length > 0 ? [{ group: 'ເມນູຫຼັກ', items }] : [];
}
