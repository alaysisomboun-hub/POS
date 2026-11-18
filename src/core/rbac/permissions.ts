import type { ModuleKey, PermissionAction, PermissionsMap, UserProfile, UserRole } from '../firebase/types';

export interface MenuItemConfig {
  key: ModuleKey;
  label: string;
  group: string;
  phase: number;
  description: string;
}

export const MENU_ITEMS: MenuItemConfig[] = [
  // ภาพรวมและวิเคราะห์
  { key: 'dashboard', label: 'Dashboard', group: 'ภาพรวมและวิเคราะห์', phase: 9, description: 'สรุปยอดขาย ต้นทุน กำไร สต็อก และกราฟแบบ Real-time' },
  { key: 'reports', label: 'รายงาน', group: 'ภาพรวมและวิเคราะห์', phase: 9, description: 'รายงานขาย สินค้า การเงิน บัญชี และส่งออก PDF/Excel/CSV' },
  { key: 'ai_analyst', label: 'AI Business Analyst', group: 'ภาพรวมและวิเคราะห์', phase: 10, description: 'วิเคราะห์ยอดขาย กำไร คาดการณ์สต็อก และความเสี่ยงด้วย Gemini AI' },
  { key: 'notifications', label: 'การแจ้งเตือน', group: 'ภาพรวมและวิเคราะห์', phase: 10, description: 'แจ้งเตือนสินค้าใกล้หมด หมดอายุ หนี้เกินกำหนด และความผิดปกติ' },

  // ขายหน้าร้าน
  { key: 'pos', label: 'POS ขายสินค้า', group: 'ขายหน้าร้าน POS', phase: 4, description: 'ขายปลีก-ขายส่ง สแกนบาร์โค้ด ชำระหลายช่องทาง และพิมพ์ใบเสร็จ' },
  { key: 'sales_history', label: 'ประวัติการขาย', group: 'ขายหน้าร้าน POS', phase: 4, description: 'ตรวจสอบบิลขาย คืนสินค้า และยกเลิกบิลตามสิทธิ์' },

  // สินค้าและคลัง
  { key: 'products', label: 'สินค้าทั้งหมด', group: 'สินค้าและคลังสินค้า', phase: 3, description: 'จัดการ SKU บาร์โค้ด หลายหน่วย ราคาหลายระดับ และพิมพ์ฉลาก' },
  { key: 'categories', label: 'หมวดหมู่สินค้า', group: 'สินค้าและคลังสินค้า', phase: 3, description: 'จัดโครงสร้างหมวดหมู่สินค้าหลักและย่อย' },
  { key: 'inventory', label: 'คลังสินค้า', group: 'สินค้าและคลังสินค้า', phase: 3, description: 'ยอดคงเหลือ ล็อต/วันหมดอายุ ตรวจนับ และ Stock Ledger' },
  { key: 'stock_in', label: 'รับสินค้าเข้า', group: 'สินค้าและคลังสินค้า', phase: 3, description: 'รับสินค้าเข้าคลังและบันทึกล็อตพร้อมวันหมดอายุ' },
  { key: 'stock_out', label: 'เบิกสินค้าออก', group: 'สินค้าและคลังสินค้า', phase: 3, description: 'เบิกสินค้า สินค้าเสียหาย หมดอายุ และสูญหาย' },

  // จัดซื้อและซัพพลายเออร์
  { key: 'purchasing', label: 'จัดซื้อสินค้า', group: 'จัดซื้อและซัพพลายเออร์', phase: 6, description: 'ใบสั่งซื้อ (PO) คำนวณส่วนลด ค่าขนส่ง ภาษี และต้นทุน WAC' },
  { key: 'suppliers', label: 'ซัพพลายเออร์', group: 'จัดซื้อและซัพพลายเออร์', phase: 6, description: 'ข้อมูลคู่ค้า เงื่อนไขชำระเงิน และยอดค้างจ่าย' },

  // ลูกค้าและโปรโมชั่น
  { key: 'customers', label: 'ลูกค้า', group: 'ลูกค้าและโปรโมชั่น', phase: 7, description: 'ฐานข้อมูลลูกค้า วงเงินเครดิต ประวัติการซื้อ และคะแนนสะสม' },
  { key: 'memberships_promotions', label: 'สมาชิกและโปรโมชั่น', group: 'ลูกค้าและโปรโมชั่น', phase: 5, description: 'ระดับสมาชิก ราคาพิเศษ และโปรโมชั่นตามเงื่อนไข' },

  // การเงินและบัญชี
  { key: 'accounts_receivable', label: 'ลูกหนี้', group: 'การเงินและบัญชี', phase: 7, description: 'ติดตามหนี้ลูกค้า รับชำระบางส่วน/เต็มจำนวน และแจ้งเตือนเกินกำหนด' },
  { key: 'accounts_payable', label: 'เจ้าหนี้', group: 'การเงินและบัญชี', phase: 7, description: 'ติดตามยอดค้างจ่ายซัพพลายเออร์และบันทึกชำระหนี้' },
  { key: 'income', label: 'รายรับ', group: 'การเงินและบัญชี', phase: 8, description: 'รายรับจากการขาย ชำระหนี้ และรายรับอื่น ๆ' },
  { key: 'expenses', label: 'รายจ่าย', group: 'การเงินและบัญชี', phase: 8, description: 'บันทึกค่าใช้จ่ายดำเนินงาน 7 หมวดหมู่ของร้าน' },
  { key: 'accounting', label: 'บัญชีและการเงิน', group: 'การเงินและบัญชี', phase: 8, description: 'ผังบัญชี สมุดรายวัน แยกประเภท งบทดลอง งบกำไรขาดทุน และงบดุล' },

  // องค์กรและระบบ
  { key: 'staff', label: 'พนักงาน', group: 'องค์กรและระบบ', phase: 2, description: 'จัดการพนักงาน บทบาท 7 ระดับ กำหนดสิทธิ์ และประวัติการใช้งาน (Audit Log)' },
  { key: 'backup', label: 'สำรองข้อมูล', group: 'องค์กรและระบบ', phase: 10, description: 'สำรอง ตรวจสอบความสมบูรณ์ กู้คืน และรีเซ็ตข้อมูลอย่างปลอดภัย' },
  { key: 'settings', label: 'ตั้งค่าระบบ', group: 'องค์กรและระบบ', phase: 2, description: 'ตั้งค่าร้านค้า สกุลเงิน LAK ภาษี และรูปแบบใบเสร็จ' },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin (ผู้ดูแลระบบสูงสุด)',
  owner: 'Owner (เจ้าของกิจการ)',
  branch_manager: 'Store Manager (ผู้จัดการร้าน)',
  cashier: 'Cashier (พนักงานขาย)',
  warehouse_staff: 'Warehouse Staff (พนักงานคลังสินค้า)',
  purchasing_staff: 'Purchasing Staff (พนักงานจัดซื้อ)',
  accountant: 'Accountant (พนักงานบัญชี)',
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
  view: 'ดูข้อมูล',
  create: 'เพิ่มข้อมูล',
  edit: 'แก้ไข',
  delete: 'ลบ/ปิดใช้งาน',
  approve: 'อนุมัติ',
  export: 'ส่งออก',
  manage: 'จัดการระบบ',
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
