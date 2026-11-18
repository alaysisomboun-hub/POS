import type { Timestamp } from 'firebase/firestore';

export type UserRole =
  | 'super_admin'
  | 'owner'
  | 'branch_manager'
  | 'cashier'
  | 'warehouse_staff'
  | 'purchasing_staff'
  | 'accountant';

export type PermissionAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'approve'
  | 'export'
  | 'manage';

export type ModuleKey =
  | 'dashboard'
  | 'pos'
  | 'sales_history'
  | 'products'
  | 'categories'
  | 'inventory'
  | 'stock_in'
  | 'stock_out'
  | 'purchasing'
  | 'suppliers'
  | 'customers'
  | 'memberships_promotions'
  | 'accounts_receivable'
  | 'accounts_payable'
  | 'income'
  | 'expenses'
  | 'accounting'
  | 'reports'
  | 'staff'
  | 'ai_analyst'
  | 'notifications'
  | 'backup'
  | 'settings';

export type PermissionsMap = Partial<Record<ModuleKey, PermissionAction[]>>;

export interface Organization {
  organizationId: string;
  name: string;
  ownerUid: string;
  currency: 'LAK';
  timezone: 'Asia/Vientiane';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Branch {
  branchId: string;
  organizationId: string;
  ownerUid: string;
  branchCode: string;
  branchName: string;
  address: string;
  phone: string;
  managerId: string;
  assignedUids: string[];
  isMainBranch: boolean;
  status: 'active' | 'inactive';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserProfile {
  uid: string;
  organizationId: string;
  ownerUid: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  branchIds: string[];
  permissions: PermissionsMap;
  invitationId?: string;
  status: 'active' | 'suspended';
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
}

export interface UserInvitation {
  invitationId: string;
  organizationId: string;
  ownerUid: string;
  email: string;
  name: string;
  role: UserRole;
  branchIds: string[];
  permissions: PermissionsMap;
  status: 'pending' | 'accepted' | 'revoked';
  invitedBy: string;
  acceptedByUid?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AuditLog {
  auditId: string;
  organizationId: string;
  ownerUid: string;
  branchId?: string | null;
  userId: string;
  userNameSnapshot: string;
  userRoleSnapshot: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  deviceInfo: string;
  createdAt: Timestamp;
}

export interface SystemSetting {
  organizationId: string;
  ownerUid: string;
  storeProfile?: {
    name: string;
    logoUrl: string;
    address: string;
    phone: string;
  };
  receiptSettings: {
    prefix: string;
    paperSize: '80mm' | '58mm';
    headerText: string;
    footerText: string;
    showQr: boolean;
    showTaxId: boolean;
  };
  taxSettings: {
    taxEnabled: boolean;
    taxRate: number;
    taxInclusive: boolean;
    taxId: string;
  };
  currencySettings: {
    code: 'LAK';
    symbol: string;
    roundingMode: 'integer' | 'nearest_100' | 'nearest_500';
  };
  notificationSettings: {
    expiryWarningDays: number;
    highExpenseThresholdPercent: number;
  };
  inventorySettings: {
    allowNegativeStock: boolean;
    costingMethod: 'WAC';
  };
  updatedAt: Timestamp;
}
