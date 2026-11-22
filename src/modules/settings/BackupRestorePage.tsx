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
  organizations: 'ຂໍ້ມູນຮ້ານຄ້າຫຼັກ (Organizations)',
  branches: 'ຂໍ້ມູນສາຂາຫຼັກ (Branches)',
  settings: 'ຕັ້ງຄ່າລະບົບ (Settings)',
  users: 'ພະນັກງານ ແລະ ສິດ (Users)',
  categories: 'ໝວດໝູ່ສິນຄ້າ (Categories)',
  storageLocations: 'ຕຳແໜ່ງຈັດເກັບ (Storage Locations)',
  products: 'ສິນຄ້າ (Products)',
  inventory: 'ຍອດຄົງເຫຼືອສະຕັອກ (Inventory)',
  inventoryLots: 'ລ໋ອດສິນຄ້າ (Inventory Lots)',
  stockMovements: 'ຄວາມເຄື່ອນໄຫວສະຕັອກ (Stock Movements)',
  membershipTiers: 'ລະດັບສະມາຊິກ (Membership Tiers)',
  promotions: 'ໂປຣໂມຊັນ (Promotions)',
  customers: 'ລູກຄ້າ (Customers)',
  suppliers: 'ຜູ້ສະໜອງ (Suppliers)',
  purchaseOrders: 'ໃບສັ່ງຊື້ (Purchase Orders)',
  sales: 'ບິນຂາຍ POS (Sales)',
  saleReturns: 'ໃບຄືນສິນຄ້າ (Sale Returns)',
  posHeldBills: 'ບິນພັກຊົ່ວຄາວ (Held Bills)',
  arPayments: 'ຮັບຊຳລະລູກໜີ້ (AR Payments)',
  apPayments: 'ຊຳລະເຈົ້າໜີ້ (AP Payments)',
  incomeEntries: 'ລາຍຮັບ (Income Entries)',
  expenseEntries: 'ລາຍຈ່າຍ (Expense Entries)',
  journalEntries: 'ປຶ້ມລາຍວັນບັນຊີ (Journal Entries)',
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
        text: `ສຳຮອງຂໍ້ມູນຮຽບຮ້ອຍແລ້ວ ຈຳນວນທັງໝົດ ${totalDocuments.toLocaleString()} ລາຍການ`,
      });
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'ບໍ່ສາມາດສຳຮອງຂໍ້ມູນໄດ້',
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
        throw new Error('ໂຄງສ້າງໄຟລ໌ສຳຮອງຂໍ້ມູນບໍ່ຖືກຕ້ອງ');
      }
      if (
        json.metadata.organizationId !== DEFAULT_ORG_ID ||
        json.metadata.branchId !== DEFAULT_MAIN_BRANCH_ID
      ) {
        throw new Error('ໄຟລ໌ສຳຮອງຂໍ້ມູນບໍ່ກົງກັບອົງກອນ ຫຼື ສາຂາຫຼັກຂອງລະບົບ (br_hq_01)');
      }
      const expected = computeChecksum(json.collections);
      if (json.metadata.checksum && json.metadata.checksum !== expected) {
        throw new Error('ຜົນການກວດສອບຄວາມສົມບູນ (Checksum) ບໍ່ກົງກັນ ໄຟລ໌ອາດຖືກແກ້ໄຂ ຫຼື ບໍ່ສົມບູນ');
      }
      setParsedBackup(json);
      setStatusMessage({
        type: 'success',
        text: `ກວດສອບໄຟລ໌ "${file.name}" ຜ່ານຄວາມສົມບູນ (${json.metadata.totalDocuments.toLocaleString()} ລາຍການ) ພ້ອມກູ້ຄືນ`,
      });
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'ບໍ່ສາມາດອ່ານໄຟລ໌ສຳຮອງຂໍ້ມູນໄດ້',
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
            branchName: String(brDoc.data.branchName ?? organization?.name ?? 'ຮ້ານຄ້າຫຼັກ').slice(
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
            'imageUrl',
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
        text: `ກູ້ຄືນຂໍ້ມູນສຳເລັດ: ເພີ່ມໃໝ່ ${createdCount} ລາຍການ, ອັບເດດ ${updatedCount} ລາຍການ, ຂ້າມລາຍການຊ້ຳ ${skippedCount} ລາຍການ`,
      });
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'ເກີດຂໍ້ຜິດພາດລະຫວ່າງກູ້ຄືນຂໍ້ມູນ',
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
            headerText: organization?.name ?? 'ຮ້ານຄ້າຫຼັກ (Grocery POS)',
            footerText: 'ຂອບໃຈທີ່ໃຊ້ບໍລິການ',
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
            uid: userProfile.uid,
            organizationId: DEFAULT_ORG_ID,
            ownerUid: userProfile.ownerUid,
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
        text: `ຣີເຊັດລະບົບຢ່າງປອດໄພຮຽບຮ້ອຍແລ້ວ (ຣີເຊັດການຕັ້ງຄ່າ ແລະ ປິດໃຊ້ງານຂໍ້ມູນຫຼັກ ${deactivatedCount} ລາຍການ ໂດຍຍັງຮັກສາປະຫວັດບັນຊີ ແລະ Audit Log ໄວ້ຄົບຖ້ວນ)`,
      });
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'ບໍ່ສາມາດຣີເຊັດຂໍ້ມູນໄດ້',
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
            ສຳຮອງ ແລະ ກູ້ຄືນຂໍ້ມູນ (Backup &amp; Safe Restore)
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            ສົ່ງອອກຂໍ້ມູນຮ້ານຄ້າທັງລະບົບເປັນໄຟລ໌ JSON ກວດສອບຄວາມສົມບູນ ແລະ ກູ້ຄືນ ຫຼື ຣີເຊັດຢ່າງປອດໄພ
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
              ກຳລັງສ້າງໄຟລ໌ສຳຮອງ...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              ດາວໂຫຼດໄຟລ໌ສຳຮອງຂໍ້ມູນ (.json)
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
            ກວດສອບຄວາມສົມບູນ ແລະ ກູ້ຄືນຂໍ້ມູນ (Safe Restore)
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            ເລືອກໄຟລ໌ JSON ທີ່ສຳຮອງໄວ້ຈາກລະບົບ ເພື່ອກວດສອບ Checksum ແລະ ກູ້ຄືນຂໍ້ມູນຫຼັກ ຫຼື ລາຍການທີ່ຂາດຫາຍ
            ໂດຍບໍ່ທຳລາຍບັນທຶກບັນຊີ ແລະ ປະຫວັດການຂາຍເດີມທີ່ມີຢູ່
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
              {selectedFileName || 'ກົດເພື່ອເລືອກໄຟລ໌ສຳຮອງຂໍ້ມູນ (.json)'}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              ຮອງຮັບສະເພາະໄຟລ໌ສຳຮອງຂອງອົງກອນຫຼັກ (org_main) ແລະ ສາຂາ br_hq_01
            </div>
          </label>

          {parsedBackup && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-3">
              <div className="text-xs text-slate-600 space-y-1">
                <div>ວັນທີສຳຮອງ: {new Date(parsedBackup.metadata.exportedAt).toLocaleString('en-GB')}</div>
                <div>ຈຳນວນເອກະສານໃນໄຟລ໌: {parsedBackup.metadata.totalDocuments.toLocaleString()} ລາຍການ</div>
                <div>ສະຖານະ Checksum: ຜ່ານການກວດສອບແລ້ວ</div>
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
                    ກຳລັງກູ້ຄືນຂໍ້ມູນລົງ Cloud Firestore...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    ຢືນຢັນກູ້ຄືນຂໍ້ມູນ (Safe Restore)
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
            ຣີເຊັດການຕັ້ງຄ່າ ແລະ ປິດໃຊ້ງານຂໍ້ມູນຫຼັກ (Safe Reset)
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            ໃຊ້ເມື່ອຕ້ອງການເລີ່ມຕົ້ນຈັດໝວດໝູ່ສິນຄ້າ, ສິນຄ້າ, ລູກຄ້າ, ຜູ້ສະໜອງ ແລະ ໂປຣໂມຊັນໃໝ່
            ລະບົບຈະຣີເຊັດການຕັ້ງຄ່າໃບບິນ/ພາສີກັບສູ່ຄ່າເລີ່ມຕົ້ນ ແລະ ປິດໃຊ້ງານລາຍການຂໍ້ມູນຫຼັກທັງໝົດ
            ໂດຍຍັງຄົງຮັກສາເອກະສານບັນຊີ, ປຶ້ມລາຍວັນ ແລະ Audit Log ຕາມມາດຕະຖານຄວາມປອດໄພຂອງຖານຂໍ້ມູນ
          </p>

          <div className="rounded-lg bg-rose-50 border border-rose-100 p-3.5 text-xs text-rose-800">
            ຄຳແນະນຳ: ຄວນດາວໂຫຼດໄຟລ໌ສຳຮອງຂໍ້ມູນເກັບໄວ້ກ່ອນດຳເນີນການຣີເຊັດທຸກຄັ້ງ
          </div>

          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            disabled={!canManage}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-rose-300 bg-rose-50 text-rose-700 text-sm font-medium hover:bg-rose-100 disabled:opacity-50 transition"
          >
            <RotateCcw className="w-4 h-4" />
            ເປີດໜ້າຕ່າງຣີເຊັດຢ່າງປອດໄພ
          </button>
        </div>
      </div>

      {/* Live Collection Integrity Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              ສະຖານະຂໍ້ມູນປັດຈຸບັນໃນ Cloud Firestore
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ຈຳນວນເອກະສານລວມທັງໝົດ {totalLiveDocs.toLocaleString()} ລາຍການ ໃນ 23 ຄໍເລັກຊັນ
            </p>
          </div>
          <button
            type="button"
            onClick={loadLiveCounts}
            disabled={loadingCounts}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg border border-slate-200"
          >
            {loadingCounts ? 'ກຳລັງນັບ...' : 'ຣີເຟຣຊຈຳນວນ'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-5 py-3 font-medium">ໝວດຂໍ້ມູນ (Collection)</th>
                <th className="px-5 py-3 font-medium text-right">ຈຳນວນໃນລະບົບປັດຈຸບັນ</th>
                {parsedBackup && (
                  <th className="px-5 py-3 font-medium text-right">ຈຳນວນໃນໄຟລ໌ສຳຮອງ</th>
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
              ຢືນຢັນການຣີເຊັດລະບົບຢ່າງປອດໄພ
            </div>
            <p className="text-sm text-slate-600">
              ການດຳເນີນການນີ້ຈະປິດໃຊ້ງານຂໍ້ມູນສິນຄ້າ, ໝວດໝູ່, ລູກຄ້າ, ຜູ້ສະໜອງ ແລະ ໂປຣໂມຊັນທັງໝົດ
              ລວມທັງຄືນຄ່າການຕັ້ງຄ່າລະບົບເປັນຄ່າເລີ່ມຕົ້ນ ກະລຸນາພິມຄຳວ່າ{' '}
              <span className="font-mono font-bold text-rose-700">RESET</span> ເພື່ອຢືນຢັນ
            </p>
            <input
              type="text"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="ພິມ RESET ເພື່ອຢືນຢັນ"
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
                ຍົກເລີກ
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
                    ກຳລັງຣີເຊັດ...
                  </>
                ) : (
                  'ຢືນຢັນຣີເຊັດລະບົບ'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
