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

export interface Category {
  categoryId: string;
  organizationId: string;
  ownerUid: string;
  name: string;
  parentId: string | null;
  description: string;
  sortOrder: number;
  status: 'active' | 'inactive';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type StorageZoneType = 'shelf' | 'warehouse' | 'cooler' | 'freezer' | 'counter';

export interface StorageLocation {
  locationId: string;
  organizationId: string;
  branchId: string;
  ownerUid: string;
  code: string;
  name: string;
  zoneType: StorageZoneType;
  description: string;
  status: 'active' | 'inactive';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ProductUnit {
  unitId: string;
  unitName: string;
  conversionFactor: number;
  barcode: string;
  retailPrice: number;
  wholesalePrice: number;
  memberPrice: number;
  isBaseUnit: boolean;
}

export interface Product {
  productId: string;
  organizationId: string;
  branchId: string;
  ownerUid: string;
  sku: string;
  name: string;
  categoryId: string;
  subCategoryId: string | null;
  storageLocationId: string | null;
  storageLocationName: string;
  baseUnitName: string;
  barcode: string;
  barcodes: string[];
  units: ProductUnit[];
  trackExpiry: boolean;
  costPriceLak: number;
  retailPriceLak: number;
  wholesalePriceLak: number;
  memberPriceLak: number;
  minStockBaseQty: number;
  reorderQtyBaseQty: number;
  taxable: boolean;
  notes: string;
  status: 'active' | 'inactive';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InventoryBalance {
  inventoryId: string;
  organizationId: string;
  branchId: string;
  ownerUid: string;
  productId: string;
  skuSnapshot: string;
  productNameSnapshot: string;
  baseUnitNameSnapshot: string;
  qtyOnHandBase: number;
  reservedQtyBase: number;
  avgCostLak: number;
  minStockBaseQty: number;
  storageLocationName: string;
  lastMovementAt: Timestamp;
  updatedAt: Timestamp;
}

export interface InventoryLot {
  lotId: string;
  organizationId: string;
  branchId: string;
  ownerUid: string;
  productId: string;
  skuSnapshot: string;
  productNameSnapshot: string;
  lotNumber: string;
  expiryDate: string | null;
  initialQtyBase: number;
  remainingQtyBase: number;
  unitCostBaseLak: number;
  storageLocationName: string;
  status: 'active' | 'depleted' | 'expired';
  receivedAt: Timestamp;
  updatedAt: Timestamp;
}

export type StockMovementType =
  | 'initial'
  | 'stock_in'
  | 'stock_out'
  | 'damaged'
  | 'expired'
  | 'lost'
  | 'adjustment_in'
  | 'adjustment_out'
  | 'sale'
  | 'sale_return'
  | 'sale_void';

export interface StockMovement {
  movementId: string;
  organizationId: string;
  branchId: string;
  ownerUid: string;
  productId: string;
  skuSnapshot: string;
  productNameSnapshot: string;
  lotId: string | null;
  lotNumberSnapshot: string | null;
  movementType: StockMovementType;
  unitName: string;
  conversionFactor: number;
  inputQty: number;
  baseQtyDelta: number;
  balanceBeforeBase: number;
  balanceAfterBase: number;
  unitCostBaseLak: number;
  totalCostLak: number;
  reason: string;
  referenceNo: string;
  performedByUid: string;
  performedByName: string;
  createdAt: Timestamp;
}

export type PriceTier = 'retail' | 'wholesale' | 'member';
export type PaymentMethodType = 'cash' | 'transfer' | 'qr' | 'credit' | 'split';

export interface SaleItem {
  productId: string;
  sku: string;
  name: string;
  unitId: string;
  unitName: string;
  conversionFactor: number;
  qty: number;
  baseQty: number;
  unitPriceLak: number;
  discountLak: number;
  lineTotalLak: number;
  unitCostBaseLak: number;
  cogsTotalLak: number;
  taxable: boolean;
}

export interface PaymentSplit {
  method: 'cash' | 'transfer' | 'qr' | 'credit';
  amountLak: number;
}

export interface SaleOrder {
  saleId: string;
  invoiceNumber: string;
  organizationId: string;
  branchId: string;
  ownerUid: string;
  priceTier: PriceTier;
  customerId: string | null;
  customerName: string;
  items: SaleItem[];
  subtotalLak: number;
  itemDiscountTotalLak: number;
  billDiscountLak: number;
  taxableAmountLak: number;
  taxRate: number;
  taxAmountLak: number;
  grandTotalLak: number;
  cogsTotalLak: number;
  grossProfitLak: number;
  paymentMethod: PaymentMethodType;
  payments: PaymentSplit[];
  paidAmountLak: number;
  changeAmountLak: number;
  creditDueLak: number;
  status: 'completed' | 'partial_return' | 'returned' | 'voided';
  notes: string;
  cashierUid: string;
  cashierName: string;
  voidedReason: string | null;
  voidedByName: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface SaleReturnItem {
  productId: string;
  sku: string;
  name: string;
  unitName: string;
  conversionFactor: number;
  qty: number;
  baseQty: number;
  refundPerUnitLak: number;
  lineRefundLak: number;
  restock: boolean;
}

export interface SaleReturn {
  returnId: string;
  returnNumber: string;
  saleId: string;
  invoiceNumber: string;
  organizationId: string;
  branchId: string;
  ownerUid: string;
  items: SaleReturnItem[];
  totalRefundLak: number;
  refundMethod: 'cash' | 'transfer' | 'credit_adjust';
  reason: string;
  performedByUid: string;
  performedByName: string;
  createdAt: Timestamp;
}

export interface HeldBillItem {
  productId: string;
  unitId: string;
  qty: number;
  discountLak: number;
}

export interface PosHeldBill {
  heldId: string;
  organizationId: string;
  branchId: string;
  ownerUid: string;
  label: string;
  priceTier: PriceTier;
  customerName: string;
  billDiscountLak: number;
  items: HeldBillItem[];
  notes: string;
  status: 'held' | 'resumed' | 'discarded';
  createdByUid: string;
  createdByName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MembershipTier {
  tierId: string;
  organizationId: string;
  ownerUid: string;
  name: string;
  discountPercent: number;
  pointsPer1000Lak: number;
  minSpendLak: number;
  description: string;
  status: 'active' | 'inactive';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Promotion {
  promotionId: string;
  organizationId: string;
  branchId: string;
  ownerUid: string;
  code: string;
  name: string;
  promoType: 'percent_bill' | 'fixed_bill';
  discountValue: number;
  minSpendLak: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'inactive';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Customer {
  customerId: string;
  organizationId: string;
  branchId: string;
  ownerUid: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  tierId: string | null;
  tierName: string;
  pointsBalance: number;
  creditLimitLak: number;
  creditBalanceLak: number;
  totalSpentLak: number;
  notes: string;
  status: 'active' | 'inactive';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Supplier {
  supplierId: string;
  organizationId: string;
  ownerUid: string;
  code: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  paymentTermDays: number;
  payableBalanceLak: number;
  notes: string;
  status: 'active' | 'inactive';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PurchaseOrderItem {
  productId: string;
  sku: string;
  name: string;
  unitId: string;
  unitName: string;
  conversionFactor: number;
  qty: number;
  baseQty: number;
  unitCostLak: number;
  lineTotalLak: number;
  lotNumber: string;
  expiryDate: string | null;
}

export interface PurchaseOrder {
  poId: string;
  poNumber: string;
  organizationId: string;
  branchId: string;
  ownerUid: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseOrderItem[];
  subtotalLak: number;
  discountLak: number;
  shippingFeeLak: number;
  taxAmountLak: number;
  grandTotalLak: number;
  paymentType: 'cash' | 'credit';
  paidAmountLak: number;
  creditDueLak: number;
  dueDate: string | null;
  status: 'ordered' | 'received' | 'cancelled';
  notes: string;
  createdByUid: string;
  createdByName: string;
  receivedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ArPayment {
  paymentId: string;
  organizationId: string;
  branchId: string;
  ownerUid: string;
  customerId: string;
  customerName: string;
  saleId: string | null;
  invoiceNumber: string;
  amountLak: number;
  paymentMethod: 'cash' | 'transfer' | 'qr';
  notes: string;
  recordedByUid: string;
  recordedByName: string;
  createdAt: Timestamp;
}

export interface ApPayment {
  paymentId: string;
  organizationId: string;
  branchId: string;
  ownerUid: string;
  supplierId: string;
  supplierName: string;
  poId: string | null;
  poNumber: string;
  amountLak: number;
  paymentMethod: 'cash' | 'transfer' | 'qr';
  notes: string;
  recordedByUid: string;
  recordedByName: string;
  createdAt: Timestamp;
}

export type IncomeCategory = 'sales' | 'ar_collection' | 'other_income';

export interface IncomeEntry {
  entryId: string;
  organizationId: string;
  branchId: string;
  ownerUid: string;
  category: IncomeCategory;
  title: string;
  amountLak: number;
  paymentMethod: 'cash' | 'transfer' | 'qr';
  referenceNo: string;
  notes: string;
  entryDate: string;
  recordedByUid: string;
  recordedByName: string;
  createdAt: Timestamp;
}

export type ExpenseCategory =
  | 'inventory_purchase'
  | 'rent'
  | 'utilities'
  | 'salary'
  | 'transport'
  | 'marketing'
  | 'maintenance_other';

export interface ExpenseEntry {
  entryId: string;
  organizationId: string;
  branchId: string;
  ownerUid: string;
  category: ExpenseCategory;
  title: string;
  amountLak: number;
  paymentMethod: 'cash' | 'transfer' | 'qr';
  referenceNo: string;
  notes: string;
  entryDate: string;
  recordedByUid: string;
  recordedByName: string;
  createdAt: Timestamp;
}

export interface JournalLine {
  accountCode: string;
  accountName: string;
  debitLak: number;
  creditLak: number;
}

export interface JournalEntry {
  journalId: string;
  entryNumber: string;
  organizationId: string;
  branchId: string;
  ownerUid: string;
  entryDate: string;
  description: string;
  sourceType: 'manual' | 'sale' | 'purchase' | 'expense' | 'income' | 'ar_payment' | 'ap_payment';
  referenceNo: string;
  lines: JournalLine[];
  totalDebitLak: number;
  totalCreditLak: number;
  createdByUid: string;
  createdByName: string;
  createdAt: Timestamp;
}
