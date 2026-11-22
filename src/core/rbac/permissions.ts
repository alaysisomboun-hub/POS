import type { ModuleKey, PermissionAction, PermissionsMap, UserProfile, UserRole } from '../firebase/types';

export interface MenuItemConfig {
  key: ModuleKey;
  label: string;
  group: string;
  phase: number;
  description: string;
}

export const MENU_ITEMS: MenuItemConfig[] = [
  // ພາບລວມ ແລະ ການວິເຄາະ
  { key: 'dashboard', label: 'ໜ້າຫຼັກ (Dashboard)', group: 'ພາບລວມ ແລະ ການວິເຄາະ', phase: 9, description: 'ສະຫຼຸບຍອດຂາຍ ຕົ້ນທຶນ ກຳໄລ ສະຕັອກ ແລະ ກຣາຟແບບ Real-time' },
  { key: 'reports', label: 'ລາຍງານ', group: 'ພາບລວມ ແລະ ການວິເຄາະ', phase: 9, description: 'ລາຍງານຍອດຂາຍ ສິນຄ້າ ການເງິນ ບັນຊີ ແລະ ສົ່ງອອກ PDF/Excel/CSV' },
  { key: 'ai_analyst', label: 'AI ວິເຄາະທຸລະກິດ', group: 'ພາບລວມ ແລະ ການວິເຄາະ', phase: 10, description: 'ວິເຄາະຍອດຂາຍ ກຳໄລ ຄາດການສະຕັອກ ແລະ ຄວາມສ່ຽງດ້ວຍ Gemini AI' },
  { key: 'notifications', label: 'ການແຈ້ງເຕືອນ', group: 'ພາບລວມ ແລະ ການວິເຄາະ', phase: 10, description: 'ແຈ້ງເຕືອນສິນຄ້າໃກ້ໝົດ ໝົດອາຍຸ ໜີ້ກາຍກຳນົດ ແລະ ຄວາມຜິດປົກກະຕິ' },

  // ໜ້າຂາຍສິນຄ້າ POS
  { key: 'pos', label: 'ໜ້າຂາຍສິນຄ້າ (POS)', group: 'ຂາຍໜ້າຮ້ານ POS', phase: 4, description: 'ຂາຍຍ່ອຍ-ຂາຍສົ່ງ ສະແກນບາໂຄດ ຊຳລະຫຼາຍຊ່ອງທາງ ແລະ ພິມໃບບິນ' },
  { key: 'sales_history', label: 'ປະຫວັດການຂາຍ', group: 'ຂາຍໜ້າຮ້ານ POS', phase: 4, description: 'ກວດສອບບິນຂາຍ ຄືນສິນຄ້າ ແລະ ຍົກເລີກບິນຕາມສິດ' },

  // ສິນຄ້າ ແລະ ສາງສິນຄ້າ
  { key: 'products', label: 'ຈັດການສິນຄ້າ', group: 'ສິນຄ້າ ແລະ ສາງສິນຄ້າ', phase: 3, description: 'ຈັດການ SKU ບາໂຄດ ຫຼາຍໜ່ວຍ ລາຄາຫຼາຍລະດັບ ແລະ ພິມສະຫຼາກ' },
  { key: 'categories', label: 'ໝວດໝູ່ສິນຄ້າ', group: 'ສິນຄ້າ ແລະ ສາງສິນຄ້າ', phase: 3, description: 'ຈັດໂຄງສ້າງໝວດໝູ່ສິນຄ້າຫຼັກ ແລະ ໝວດໝູ່ຍ່ອຍ' },
  { key: 'inventory', label: 'ສາງສິນຄ້າ', group: 'ສິນຄ້າ ແລະ ສາງສິນຄ້າ', phase: 3, description: 'ຍອດຄົງເຫຼືອ ລັອດ/ວັນໝົດອາຍຸ ກວດນັບ ແລະ Stock Ledger' },
  { key: 'stock_in', label: 'ຮັບສິນຄ້າເຂົ້າ', group: 'ສິນຄ້າ ແລະ ສາງສິນຄ້າ', phase: 3, description: 'ຮັບສິນຄ້າເຂົ້າສາງ ແລະ ບັນທຶກລັອດພ້ອມວັນໝົດອາຍຸ' },
  { key: 'stock_out', label: 'ເບີກສິນຄ້າອອກ', group: 'ສິນຄ້າ ແລະ ສາງສິນຄ້າ', phase: 3, description: 'ເບີກສິນຄ້າ ສິນຄ້າເສຍຫາຍ ໝົດອາຍຸ ແລະ ສູນຫາຍ' },

  // ຈັດຊື້ ແລະ ຜູ້ສະໜອງ
  { key: 'purchasing', label: 'ຈັດຊື້ສິນຄ້າ', group: 'ຈັດຊື້ ແລະ ຜູ້ສະໜອງ', phase: 6, description: 'ໃບສັ່ງຊື້ (PO) ຄຳນວນສ່ວນຫຼຸດ ຄ່າຂົນສົ່ງ ພາສີ ແລະ ຕົ້ນທຶນ WAC' },
  { key: 'suppliers', label: 'ຜູ້ສະໜອງ (Suppliers)', group: 'ຈັດຊື້ ແລະ ຜູ້ສະໜອງ', phase: 6, description: 'ຂໍ້ມູນຄູ່ຄ້າ ເງື່ອນໄຂຊຳລະເງິນ ແລະ ຍອດຄ້າງຈ່າຍ' },

  // ລູກຄ້າ ແລະ ໂປຣໂມຊັ່ນ
  { key: 'customers', label: 'ລູກຄ້າ', group: 'ລູກຄ້າ ແລະ ໂປຣໂມຊັ່ນ', phase: 7, description: 'ຖານຂໍ້ມູນລູກຄ້າ ວົງເງິນເຄຣດິດ ປະຫວັດການຊື້ ແລະ ຄະແນນສະສົມ' },
  { key: 'memberships_promotions', label: 'ສະມາຊິກ ແລະ ໂປຣໂມຊັ່ນ', group: 'ລູກຄ້າ ແລະ ໂປຣໂມຊັ່ນ', phase: 5, description: 'ລະດັບສະມາຊິກ ລາຄາພິເສດ ແລະ ໂປຣໂມຊັ່ນຕາມເງື່ອນໄຂ' },

  // ການເງິນ ແລະ ບັນຊີ
  { key: 'accounts_receivable', label: 'ລູກໜີ້', group: 'ການເງິນ ແລະ ບັນຊີ', phase: 7, description: 'ຕິດຕາມໜີ້ລູກຄ້າ ຮັບຊຳລະບາງສ່ວນ/ເຕັມຈຳນວນ ແລະ ແຈ້ງເຕືອນກາຍກຳນົດ' },
  { key: 'accounts_payable', label: 'ເຈົ້າໜີ້', group: 'ການເງິນ ແລະ ບັນຊີ', phase: 7, description: 'ຕິດຕາມຍອດຄ້າງຈ່າຍຜູ້ສະໜອງ ແລະ ບັນທຶກຊຳລະໜີ້' },
  { key: 'income', label: 'ລາຍຮັບ', group: 'ການເງິນ ແລະ ບັນຊີ', phase: 8, description: 'ລາຍຮັບຈາກການຂາຍ ຊຳລະໜີ້ ແລະ ລາຍຮັບອື່ນໆ' },
  { key: 'expenses', label: 'ລາຍຈ່າຍ', group: 'ການເງິນ ແລະ ບັນຊີ', phase: 8, description: 'ບັນທຶກຄ່າໃຊ້ຈ່າຍດຳເນີນງານ 7 ໝວດໝູ່ຂອງຮ້ານ' },
  { key: 'accounting', label: 'ບັນຊີ ແລະ ການເງິນ', group: 'ການເງິນ ແລະ ບັນຊີ', phase: 8, description: 'ຜັງບັນຊີ ປຶ້ມລາຍວັນ ແຍກປະເພດ ໃບດຸ່ນດ່ຽງ ແລະ ໃບສະຫຼຸບກຳໄລຂາດທຶນ' },

  // ອົງກອນ ແລະ ລະບົບ
  { key: 'staff', label: 'ພະນັກງານ', group: 'ອົງກອນ ແລະ ລະບົບ', phase: 2, description: 'ຈັດການພະນັກງານ ບົດບາດ 7 ລະດັບ ກຳນົດສິດ ແລະ ປະຫວັດການໃຊ້ງານ' },
  { key: 'backup', label: 'ສຳຮອງຂໍ້ມູນ', group: 'ອົງກອນ ແລະ ລະບົບ', phase: 10, description: 'ສຳຮອງ ກວດສອບຄວາມສົມບູນ ກູ້ຄືນ ແລະ ຣີເຊັດຂໍ້ມູນຢ່າງປອດໄພ' },
  { key: 'settings', label: 'ຕັ້ງຄ່າລະບົບ', group: 'ອົງກອນ ແລະ ລະບົບ', phase: 2, description: 'ຕັ້ງຄ່າຮ້ານຄ້າ ສະກຸນເງິນ LAK ພາສີ ແລະ ຮູບແບບໃບບິນ' },
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
    products: ['view', 'create', 'edit', 'export'],
    categories: ['view', 'create', 'edit'],
    inventory: ['view', 'create', 'edit', 'approve', 'export'],
    stock_in: ['view', 'create', 'approve'],
    stock_out: ['view', 'create', 'approve'],
    purchasing: ['view', 'create', 'approve'],
    suppliers: ['view', 'create', 'edit'],
    customers: ['view', 'create', 'edit'],
    memberships_promotions: ['view', 'create', 'edit'],
    accounts_receivable: ['view', 'create', 'approve'],
    accounts_payable: ['view'],
    income: ['view'],
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

export function getVisibleMenuGroups(user: UserProfile | null): {
  group: string;
  items: MenuItemConfig[];
}[] {
  const groups = new Map<string, MenuItemConfig[]>();
  for (const item of MENU_ITEMS) {
    if (!hasPermission(user, item.key, 'view')) continue;
    const list = groups.get(item.group) ?? [];
    list.push(item);
    groups.set(item.group, list);
  }
  return Array.from(groups.entries()).map(([group, items]) => ({ group, items }));
}
