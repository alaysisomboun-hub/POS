import React, { useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileJson,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import {
  DEFAULT_MAIN_BRANCH_ID,
  DEFAULT_ORG_ID,
  DEFAULT_OWNER_UID,
  useFirebase,
} from '../../core/firebase/FirebaseProvider';
import { appendAuditLogToBatch, writeAuditLog } from '../../core/firebase/auditService';
import { hasPermission } from '../../core/rbac/permissions';

const ORG_SCOPED_COLLECTIONS = [
  'users',
  'categories',
  'storageLocations',
  'products',
  'inventory',
  'inventoryLots',
  'stockMovements',
  'membershipTiers',
  'promotions',
  'customers',
  'suppliers',
  'purchaseOrders',
  'sales',
  'saleReturns',
  'posHeldBills',
  'arPayments',
  'apPayments',
  'incomeEntries',
  'expenseEntries',
  'journalEntries',
] as const;

type CollectionKey =
  | 'organizations'
  | 'branches'
  | 'settings'
  | (typeof ORG_SCOPED_COLLECTIONS)[number];

interface BackupPayload {
  metadata: {
    version: string;
    exportedAt: string;
    organizationId: string;
    branchId: string;
    currency: 'LAK';
    timezone: 'Asia/Vientiane';
    totalDocuments: number;
    checksum: string;
  };
  collections: Partial<Record<CollectionKey, Array<{ id: string; data: Record<string, unknown> }>>>;
}

const COLLECTION_LABELS: Record<CollectionKey, string> = {
  organizations: 'ข้อมูลร้านค้าหลัก (Organizations)',
  branches: 'ข้อมูลสาขาหลัก (Branches)',
  settings: 'ตั้งค่าระบบ (Settings)',
  users: 'พนักงานและสิทธิ์ (Users)',
  categories: 'หมวดหมู่สินค้า (Categories)',
  storageLocations: 'ตำแหน่งจัดเก็บ (Storage Locations)',
  products: 'สินค้า (Products)',
  inventory: 'ยอดคงเหลือสต็อก (Inventory)',
  inventoryLots: 'ล็อตสินค้า (Inventory Lots)',
  stockMovements: 'ความเคลื่อนไหวสต็อก (Stock Movements)',
  membershipTiers: 'ระดับสมาชิก (Membership Tiers)',
  promotions: 'โปรโมชั่น (Promotions)',
  customers: 'ลูกค้า (Customers)',
  suppliers: 'ซัพพลายเออร์ (Suppliers)',
  purchaseOrders: 'ใบสั่งซื้อ (Purchase Orders)',
  sales: 'บิลขาย POS (Sales)',
  saleReturns: 'ใบคืนสินค้า (Sale Returns)',
  posHeldBills: 'บิลพักชั่วคราว (Held Bills)',
  arPayments: 'รับชำระลูกหนี้ (AR Payments)',
  apPayments: 'ชำระเจ้าหนี้ (AP Payments)',
  incomeEntries: 'รายรับ (Income Entries)',
  expenseEntries: 'รายจ่าย (Expense Entries)',
  journalEntries: 'สมุดรายวันบัญชี (Journal Entries)',
};

function serializeValue(val: unknown): unknown {
  if (val instanceof Timestamp) {
    return { __fsTimestamp: val.toDate().toISOString() };
  }
  if (Array.isArray(val)) {
    return val.map(serializeValue);
  }
  if (val && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = serializeValue(v);
    }
    return out;
  }
  return val;
}

function deserializeValue(val: unknown): unknown {
  if (val && typeof val === 'object' && '__fsTimestamp' in (val as Record<string, unknown>)) {
    const iso = (val as { __fsTimestamp: string }).__fsTimestamp;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? serverTimestamp() : Timestamp.fromDate(d);
  }
  if (Array.isArray(val)) {
    return val.map(deserializeValue);
  }
  if (val && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = deserializeValue(v);
    }
    return out;
  }
  return val;
}

function computeChecksum(collections: BackupPayload['collections']): string {
  const keys = (Object.keys(collections) as CollectionKey[]).sort();
  let total = 0;
  const parts: string[] = [];
  for (const k of keys) {
    const len = collections[k]?.length ?? 0;
    total += len;
    parts.push(`${k}:${len}`);
  }
  return `${DEFAULT_ORG_ID}|${DEFAULT_MAIN_BRANCH_ID}|${total}|${parts.join(',')}`;
}

async function commitBatchedOps(
  ops: Array<(batch: ReturnType<typeof writeBatch>) => void>,
): Promise<void> {
  const CHUNK_SIZE = 380;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const chunk = ops.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const fn of chunk) fn(batch);
    await batch.commit();
  }
}

export function BackupRestorePage() {
  const { userProfile, organization } = useFirebase();

  const canExport =
    hasPermission(userProfile, 'backup', 'export') ||
    userProfile?.role === 'owner' ||
    userProfile?.role === 'super_admin';
  const canManage =
    hasPermission(userProfile, 'backup', 'manage') ||
    userProfile?.role === 'owner' ||
    userProfile?.role === 'super_admin';

  const [liveCounts, setLiveCounts] = useState<Partial<Record<CollectionKey, number>>>({});
  const [loadingCounts, setLoadingCounts] = useState(true);

  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [parsedBackup, setParsedBackup] = useState<BackupPayload | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');

  const loadLiveCounts = async () => {
    setLoadingCounts(true);
    try {
      const counts: Partial<Record<CollectionKey, number>> = {
        organizations: 1,
        branches: 1,
        settings: 1,
      };
      await Promise.all(
        ORG_SCOPED_COLLECTIONS.map(async (colName) => {
          const snap = await getDocs(
            query(collection(db, colName), where('organizationId', '==', DEFAULT_ORG_ID)),
          );
          counts[colName] = snap.size;
        }),
      );
      setLiveCounts(counts);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'backup_counts');
    } finally {
      setLoadingCounts(false);
    }
  };

  useEffect(() => {
    loadLiveCounts();
  }, []);

  const handleExportBackup = async () => {
    if (!userProfile || !canExport) return;
    setExporting(true);
    setStatusMessage(null);

    try {
      const collectionsData: BackupPayload['collections'] = {};

      const [orgSnap, branchSnap, settingsSnap] = await Promise.all([
        getDoc(doc(db, 'organizations', DEFAULT_ORG_ID)),
        getDoc(doc(db, 'branches', DEFAULT_MAIN_BRANCH_ID)),
        getDoc(doc(db, 'settings', DEFAULT_ORG_ID)),
      ]);

      collectionsData.organizations = orgSnap.exists()
        ? [{ id: orgSnap.id, data: serializeValue(orgSnap.data()) as Record<string, unknown> }]
        : [];
      collectionsData.branches = branchSnap.exists()
        ? [{ id: branchSnap.id, data: serializeValue(branchSnap.data()) as Record<string, unknown> }]
        : [];
      collectionsData.settings = settingsSnap.exists()
        ? [{ id: settingsSnap.id, data: serializeValue(settingsSnap.data()) as Record<string, unknown> }]
        : [];

      let totalDocuments =
        collectionsData.organizations.length +
        collectionsData.branches.length +
        collectionsData.settings.length;

      for (const colName of ORG_SCOPED_COLLECTIONS) {
        const snap = await getDocs(
          query(collection(db, colName), where('organizationId', '==', DEFAULT_ORG_ID)),
        );
        const docs = snap.docs.map((d) => ({
          id: d.id,
          data: serializeValue(d.data()) as Record<string, unknown>,
        }));
        collectionsData[colName] = docs;
        totalDocuments += docs.length;
      }

      const payload: BackupPayload = {
        metadata: {
          version: '1.0-single-branch',
          exportedAt: new Date().toISOString(),
          organizationId: DEFAULT_ORG_ID,
          branchId: DEFAULT_MAIN_BRANCH_ID,
          currency: 'LAK',
          timezone: 'Asia/Vientiane',
          totalDocuments,
          checksum: computeChecksum(collectionsData),
        },
        collections: collectionsData,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      const a = document.createElement('a');
      a.href = url;
      a.download = `grocery-pos-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await writeAuditLog({
        user: userProfile,
        branchId: DEFAULT_MAIN_BRANCH_ID,
        action: 'EXPORT_BACKUP',
        entityType: 'backup',
        entityId: DEFAULT_ORG_ID,
        after: { totalDocuments },
      });

      setStatusMessage({
        type: 'success',
        text: `สำรองข้อมูลเรียบร้อยแล้ว จำนวนทั้งหมด ${totalDocuments.toLocaleString()} รายการ`,
      });
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'ไม่สามารถสำรองข้อมูลได้',
      });
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setStatusMessage(null);
    setParsedBackup(null);
    if (!file) return;

    setSelectedFileName(file.name);
    try {
      const text = await file.text();
      const json = JSON.parse(text) as BackupPayload;
      if (!json?.metadata || !json?.collections) {
        throw new Error('โครงสร้างไฟล์สำรองข้อมูลไม่ถูกต้อง');
      }
      if (
        json.metadata.organizationId !== DEFAULT_ORG_ID ||
        json.metadata.branchId !== DEFAULT_MAIN_BRANCH_ID
      ) {
        throw new Error('ไฟล์สำรองข้อมูลไม่ตรงกับองค์กรหรือสาขาหลักของระบบ (br_hq_01)');
      }
      const expected = computeChecksum(json.collections);
      if (json.metadata.checksum && json.metadata.checksum !== expected) {
        throw new Error('ผลการตรวจสอบความสมบูรณ์ (Checksum) ไม่ตรงกัน ไฟล์อาจถูกแก้ไขหรือไม่สมบูรณ์');
      }
      setParsedBackup(json);
      setStatusMessage({
        type: 'success',
        text: `ตรวจสอบไฟล์ "${file.name}" ผ่านความสมบูรณ์ (${json.metadata.totalDocuments.toLocaleString()} รายการ) พร้อมกู้คืน`,
      });
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'ไม่สามารถอ่านไฟล์สำรองข้อมูลได้',
      });
    }
  };

  const handleSafeRestore = async () => {
    if (!userProfile || !canManage || !parsedBackup) return;
    setRestoring(true);
    setStatusMessage(null);

    try {
      let updatedCount = 0;
      let createdCount = 0;
      let skippedCount = 0;

      const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

      // 1. Core workspace docs (organizations, branches, settings)
      const orgDoc = parsedBackup.collections.organizations?.[0];
      if (orgDoc && typeof orgDoc.data.name === 'string' && orgDoc.data.name.trim()) {
        ops.push((b) =>
          b.update(doc(db, 'organizations', DEFAULT_ORG_ID), {
            name: String(orgDoc.data.name).slice(0, 120),
            updatedAt: serverTimestamp(),
          }),
        );
        updatedCount += 1;
      }

      const brDoc = parsedBackup.collections.branches?.[0];
      if (brDoc) {
        ops.push((b) =>
          b.update(doc(db, 'branches', DEFAULT_MAIN_BRANCH_ID), {
            branchName: String(brDoc.data.branchName ?? organization?.name ?? 'ร้านค้าหลัก').slice(
              0,
              120,
            ),
            address: String(brDoc.data.address ?? '').slice(0, 300),
            phone: String(brDoc.data.phone ?? '').slice(0, 30),
            updatedAt: serverTimestamp(),
          }),
        );
        updatedCount += 1;
      }

      const setDocItem = parsedBackup.collections.settings?.[0];
      if (setDocItem) {
        const d = setDocItem.data;
        ops.push((b) =>
          b.update(doc(db, 'settings', DEFAULT_ORG_ID), {
            ...(d.storeProfile ? { storeProfile: d.storeProfile } : {}),
            ...(d.receiptSettings ? { receiptSettings: d.receiptSettings } : {}),
            ...(d.taxSettings ? { taxSettings: d.taxSettings } : {}),
            ...(d.currencySettings ? { currencySettings: d.currencySettings } : {}),
            ...(d.notificationSettings ? { notificationSettings: d.notificationSettings } : {}),
            ...(d.inventorySettings ? { inventorySettings: d.inventorySettings } : {}),
            updatedAt: serverTimestamp(),
          }),
        );
        updatedCount += 1;
      }

      // Helper to check existing doc IDs in a collection
      const fetchExistingIds = async (colName: string) => {
        const snap = await getDocs(
          query(collection(db, colName), where('organizationId', '==', DEFAULT_ORG_ID)),
        );
        return new Set(snap.docs.map((d) => d.id));
      };

      // 2. Mutable master collections (create missing or update allowed fields)
      const mutableMasterConfigs: Array<{
        col: CollectionKey;
        allowedUpdateFields: string[];
      }> = [
        {
          col: 'categories',
          allowedUpdateFields: ['name', 'parentId', 'description', 'sortOrder', 'status'],
        },
        {
          col: 'storageLocations',
          allowedUpdateFields: ['code', 'name', 'zoneType', 'description', 'status'],
        },
        {
          col: 'products',
          allowedUpdateFields: [
            'sku',
            'name',
            'categoryId',
            'subCategoryId',
            'storageLocationId',
            'storageLocationName',
            'baseUnitName',
            'barcode',
            'barcodes',
            'units',
            'trackExpiry',
            'costPriceLak',
            'retailPriceLak',
            'wholesalePriceLak',
            'memberPriceLak',
            'minStockBaseQty',
            'reorderQtyBaseQty',
            'taxable',
            'notes',
            'status',
          ],
        },
        {
          col: 'membershipTiers',
          allowedUpdateFields: [
            'name',
            'discountPercent',
            'pointsPer1000Lak',
            'minSpendLak',
            'description',
            'status',
          ],
        },
        {
          col: 'promotions',
          allowedUpdateFields: [
            'code',
            'name',
            'promoType',
            'discountValue',
            'minSpendLak',
            'startDate',
            'endDate',
            'status',
          ],
        },
        {
          col: 'customers',
          allowedUpdateFields: [
            'code',
            'name',
            'phone',
            'email',
            'address',
            'tierId',
            'tierName',
            'pointsBalance',
            'creditLimitLak',
            'creditBalanceLak',
            'totalSpentLak',
            'notes',
            'status',
          ],
        },
        {
          col: 'suppliers',
          allowedUpdateFields: [
            'code',
            'name',
            'contactName',
            'phone',
            'email',
            'address',
            'paymentTermDays',
            'payableBalanceLak',
            'notes',
            'status',
          ],
        },
      ];

      for (const cfg of mutableMasterConfigs) {
        const items = parsedBackup.collections[cfg.col] ?? [];
        if (items.length === 0) continue;
        const existingIds = await fetchExistingIds(cfg.col);
        for (const item of items) {
          const ref = doc(db, cfg.col, item.id);
          const deserialized = deserializeValue(item.data) as Record<string, unknown>;
          if (existingIds.has(item.id)) {
            const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
            for (const f of cfg.allowedUpdateFields) {
              if (f in deserialized) patch[f] = deserialized[f];
            }
            ops.push((b) => b.update(ref, patch));
            updatedCount += 1;
          } else {
            ops.push((b) =>
              b.set(ref, {
                ...deserialized,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }),
            );
            createdCount += 1;
          }
        }
      }

      // Commit master docs first so exists(...) checks in Firestore rules pass for dependent records
      if (ops.length > 0) {
        await commitBatchedOps(ops);
        ops.length = 0;
      }

      // 3. Create missing inventory, lots, transactions & ledgers
      const missingOnlyCols: CollectionKey[] = [
        'users',
        'inventory',
        'inventoryLots',
        'stockMovements',
        'purchaseOrders',
        'sales',
        'saleReturns',
        'posHeldBills',
        'arPayments',
        'apPayments',
        'incomeEntries',
        'expenseEntries',
        'journalEntries',
      ];

      const postCreateSaleUpdates: Array<{
        ref: DocumentReference;
        status: unknown;
        voidedReason: unknown;
        voidedByName: unknown;
      }> = [];

      for (const colName of missingOnlyCols) {
        const items = parsedBackup.collections[colName] ?? [];
        if (items.length === 0) continue;
        const existingIds = await fetchExistingIds(colName);

        for (const item of items) {
          if (existingIds.has(item.id)) {
            skippedCount += 1;
            continue;
          }
          const ref = doc(db, colName, item.id);
          const data = deserializeValue(item.data) as Record<string, unknown>;

          if (colName === 'users') {
            ops.push((b) =>
              b.set(ref, {
                ...data,
                createdAt: serverTimestamp(),
                lastLoginAt: serverTimestamp(),
              }),
            );
          } else if (colName === 'inventory') {
            ops.push((b) =>
              b.set(ref, {
                ...data,
                lastMovementAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }),
            );
          } else if (colName === 'inventoryLots') {
            ops.push((b) =>
              b.set(ref, {
                ...data,
                receivedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }),
            );
          } else if (colName === 'sales') {
            const origStatus = data.status;
            ops.push((b) =>
              b.set(ref, {
                ...data,
                status: 'completed',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }),
            );
            if (origStatus && origStatus !== 'completed') {
              postCreateSaleUpdates.push({
                ref,
                status: origStatus,
                voidedReason: data.voidedReason ?? null,
                voidedByName: data.voidedByName ?? null,
              });
            }
          } else if (colName === 'posHeldBills') {
            ops.push((b) =>
              b.set(ref, {
                ...data,
                status: 'held',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }),
            );
          } else if (colName === 'purchaseOrders') {
            if (data.status === 'cancelled') {
              skippedCount += 1;
              continue;
            }
            ops.push((b) =>
              b.set(ref, {
                ...data,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              }),
            );
          } else if (
            colName === 'stockMovements' ||
            colName === 'saleReturns' ||
            colName === 'arPayments' ||
            colName === 'apPayments' ||
            colName === 'incomeEntries' ||
            colName === 'expenseEntries' ||
            colName === 'journalEntries'
          ) {
            ops.push((b) =>
              b.set(ref, {
                ...data,
                createdAt: serverTimestamp(),
              }),
            );
          }
          createdCount += 1;
        }
      }

      if (ops.length > 0) {
        await commitBatchedOps(ops);
      }

      if (postCreateSaleUpdates.length > 0) {
        const updateOps = postCreateSaleUpdates.map(
          (u) => (b: ReturnType<typeof writeBatch>) =>
            b.update(u.ref, {
              status: u.status,
              voidedReason: u.voidedReason,
              voidedByName: u.voidedByName,
              updatedAt: serverTimestamp(),
            }),
        );
        await commitBatchedOps(updateOps);
      }

      await writeAuditLog({
        user: userProfile,
        branchId: DEFAULT_MAIN_BRANCH_ID,
        action: 'RESTORE_BACKUP',
        entityType: 'backup',
        entityId: DEFAULT_ORG_ID,
        after: { createdCount, updatedCount, skippedCount, fileName: selectedFileName },
      });

      await loadLiveCounts();

      setStatusMessage({
        type: 'success',
        text: `กู้คืนข้อมูลสำเร็จ: เพิ่มใหม่ ${createdCount} รายการ, อัปเดต ${updatedCount} รายการ, ข้ามรายการซ้ำ ${skippedCount} รายการ`,
      });
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'เกิดข้อผิดพลาดระหว่างกู้คืนข้อมูล',
      });
    } finally {
      setRestoring(false);
    }
  };

  const handleSafeReset = async () => {
    if (!userProfile || !canManage || resetConfirmText.trim() !== 'RESET') return;
    setResetting(true);
    setStatusMessage(null);

    try {
      const ops: Array<(batch: ReturnType<typeof writeBatch>) => void> = [];

      ops.push((b) =>
        b.update(doc(db, 'settings', DEFAULT_ORG_ID), {
          receiptSettings: {
            prefix: 'INV',
            paperSize: '80mm',
            headerText: organization?.name ?? 'ร้านค้าหลัก (Grocery POS)',
            footerText: 'ขอบคุณที่ใช้บริการ',
            showQr: true,
            showTaxId: false,
          },
          taxSettings: {
            taxEnabled: false,
            taxRate: 0,
            taxInclusive: false,
            taxId: '',
          },
          currencySettings: {
            code: 'LAK',
            symbol: '₭',
            roundingMode: 'integer',
          },
          notificationSettings: {
            expiryWarningDays: 30,
            highExpenseThresholdPercent: 30,
          },
          inventorySettings: {
            allowNegativeStock: false,
            costingMethod: 'WAC',
          },
          updatedAt: serverTimestamp(),
        }),
      );

      const deactivateCols = [
        'categories',
        'storageLocations',
        'products',
        'membershipTiers',
        'promotions',
        'customers',
        'suppliers',
      ] as const;

      let deactivatedCount = 0;
      for (const colName of deactivateCols) {
        const snap = await getDocs(
          query(collection(db, colName), where('organizationId', '==', DEFAULT_ORG_ID)),
        );
        for (const d of snap.docs) {
          if ((d.data() as { status?: string }).status === 'active') {
            ops.push((b) =>
              b.update(d.ref, {
                status: 'inactive',
                updatedAt: serverTimestamp(),
              }),
            );
            deactivatedCount += 1;
          }
        }
      }

      ops.push((b) =>
        appendAuditLogToBatch(b, {
          user: {
            uid: userProfile.uid || DEFAULT_OWNER_UID,
            organizationId: DEFAULT_ORG_ID,
            ownerUid: userProfile.ownerUid || DEFAULT_OWNER_UID,
            name: userProfile.name,
            role: userProfile.role,
          },
          branchId: DEFAULT_MAIN_BRANCH_ID,
          action: 'SYSTEM_SAFE_RESET',
          entityType: 'backup',
          entityId: DEFAULT_ORG_ID,
          after: { deactivatedCount },
        }),
      );

      await commitBatchedOps(ops);
      await loadLiveCounts();

      setShowResetModal(false);
      setResetConfirmText('');
      setStatusMessage({
        type: 'success',
        text: `รีเซ็ตระบบอย่างปลอดภัยเรียบร้อยแล้ว (รีเซ็ตการตั้งค่าและปิดใช้งานข้อมูลหลัก ${deactivatedCount} รายการ โดยคงประวัติบัญชีและ Audit Log ไว้ครบถ้วน)`,
      });
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'ไม่สามารถรีเซ็ตข้อมูลได้',
      });
    } finally {
      setResetting(false);
    }
  };

  const totalLiveDocs = Object.values(liveCounts).reduce((sum, v) => sum + (v ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-6 h-6 text-slate-800" />
            สำรองและกู้คืนข้อมูล (Backup &amp; Safe Restore)
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            ส่งออกข้อมูลร้านค้าทั้งระบบเป็นไฟล์ JSON ตรวจสอบความสมบูรณ์ และกู้คืนหรือรีเซ็ตอย่างปลอดภัย
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportBackup}
          disabled={exporting || !canExport}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-60 transition"
        >
          {exporting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              กำลังสร้างไฟล์สำรอง...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              ดาวน์โหลดไฟล์สำรองข้อมูล (.json)
            </>
          )}
        </button>
      </div>

      {statusMessage && (
        <div
          className={`rounded-xl border p-4 flex items-start gap-3 text-sm ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
          )}
          <div>{statusMessage.text}</div>
        </div>
      )}

      {/* Restore & Safe Reset Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Upload className="w-5 h-5 text-indigo-600" />
            ตรวจสอบความสมบูรณ์และกู้คืนข้อมูล (Safe Restore)
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            เลือกไฟล์ JSON ที่สำรองไว้จากระบบ เพื่อตรวจสอบ Checksum และกู้คืนข้อมูลหลักหรือรายการที่ขาดหาย
            โดยไม่ทำลายบันทึกบัญชีและประวัติการขายเดิมที่มีอยู่
          </p>

          <label className="block border-2 border-dashed border-slate-300 rounded-xl p-5 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition">
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleFileSelect}
              disabled={!canManage || restoring}
              className="hidden"
            />
            <FileJson className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-800">
              {selectedFileName || 'คลิกเพื่อเลือกไฟล์สำรองข้อมูล (.json)'}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              รองรับเฉพาะไฟล์สำรองขององค์กรหลัก (org_main) และสาขา br_hq_01
            </div>
          </label>

          {parsedBackup && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-3">
              <div className="text-xs text-slate-600 space-y-1">
                <div>วันที่สำรอง: {new Date(parsedBackup.metadata.exportedAt).toLocaleString('th-TH')}</div>
                <div>จำนวนเอกสารในไฟล์: {parsedBackup.metadata.totalDocuments.toLocaleString()} รายการ</div>
                <div>สถานะ Checksum: ผ่านการตรวจสอบแล้ว</div>
              </div>
              <button
                type="button"
                onClick={handleSafeRestore}
                disabled={restoring || !canManage}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition"
              >
                {restoring ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    กำลังกู้คืนข้อมูลลง Cloud Firestore...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    ยืนยันกู้คืนข้อมูล (Safe Restore)
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Safe Reset Card */}
        <div className="bg-white rounded-xl border border-rose-200 p-5 space-y-4">
          <div className="flex items-center gap-2 text-base font-bold text-rose-800">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
            รีเซ็ตการตั้งค่าและปิดใช้งานข้อมูลหลัก (Safe Reset)
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            ใช้เมื่อต้องการเริ่มต้นจัดหมวดหมู่สินค้า สินค้า ลูกค้า ซัพพลายเออร์ และโปรโมชั่นใหม่
            ระบบจะรีเซ็ตการตั้งค่าใบเสร็จ/ภาษีกลับสู่ค่าเริ่มต้นและปิดใช้งานรายการข้อมูลหลักทั้งหมด
            โดยยังคงรักษาเอกสารบัญชี สมุดรายวัน และ Audit Log ตามมาตรฐานความปลอดภัยของฐานข้อมูล
          </p>

          <div className="rounded-lg bg-rose-50 border border-rose-100 p-3.5 text-xs text-rose-800">
            คำแนะนำ: ควรดาวน์โหลดไฟล์สำรองข้อมูลเก็บไว้ก่อนดำเนินการรีเซ็ตทุกครั้ง
          </div>

          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            disabled={!canManage}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-rose-300 bg-rose-50 text-rose-700 text-sm font-medium hover:bg-rose-100 disabled:opacity-50 transition"
          >
            <RotateCcw className="w-4 h-4" />
            เปิดหน้าต่างรีเซ็ตอย่างปลอดภัย
          </button>
        </div>
      </div>

      {/* Live Collection Integrity Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              สถานะข้อมูลปัจจุบันใน Cloud Firestore
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              จำนวนเอกสารรวมทั้งหมด {totalLiveDocs.toLocaleString()} รายการ ใน 23 คอลเลกชัน
            </p>
          </div>
          <button
            type="button"
            onClick={loadLiveCounts}
            disabled={loadingCounts}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200"
          >
            {loadingCounts ? 'กำลังนับ...' : 'รีเฟรชจำนวน'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3 font-medium">หมวดข้อมูล (Collection)</th>
                <th className="px-5 py-3 font-medium text-right">จำนวนในระบบปัจจุบัน</th>
                {parsedBackup && (
                  <th className="px-5 py-3 font-medium text-right">จำนวนในไฟล์สำรอง</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(Object.keys(COLLECTION_LABELS) as CollectionKey[]).map((key) => (
                <tr key={key} className="hover:bg-slate-50/70">
                  <td className="px-5 py-2.5 text-slate-800">{COLLECTION_LABELS[key]}</td>
                  <td className="px-5 py-2.5 text-right font-semibold text-slate-900 tabular-nums">
                    {(liveCounts[key] ?? 0).toLocaleString()}
                  </td>
                  {parsedBackup && (
                    <td className="px-5 py-2.5 text-right font-semibold text-indigo-700 tabular-nums">
                      {(parsedBackup.collections[key]?.length ?? 0).toLocaleString()}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Safe Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-rose-700 font-bold text-base">
              <ShieldAlert className="w-5 h-5" />
              ยืนยันการรีเซ็ตระบบอย่างปลอดภัย
            </div>
            <p className="text-sm text-slate-600">
              การดำเนินการนี้จะปิดใช้งานข้อมูลสินค้า หมวดหมู่ ลูกค้า ซัพพลายเออร์ และโปรโมชั่นทั้งหมด
              รวมถึงคืนค่าการตั้งค่าระบบเป็นค่าเริ่มต้น กรุณาพิมพ์คำว่า{' '}
              <span className="font-mono font-bold text-rose-700">RESET</span> เพื่อยืนยัน
            </p>
            <input
              type="text"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="พิมพ์ RESET เพื่อยืนยัน"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(false);
                  setResetConfirmText('');
                }}
                disabled={resetting}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSafeReset}
                disabled={resetting || resetConfirmText.trim() !== 'RESET'}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-50"
              >
                {resetting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    กำลังรีเซ็ต...
                  </>
                ) : (
                  'ยืนยันรีเซ็ตระบบ'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
