import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, testFirestoreConnection } from './config';
import { OperationType, handleFirestoreError } from './errorHandler';
import { appendAuditLogToBatch } from './auditService';
import { DEFAULT_ROLE_PERMISSIONS } from '../rbac/permissions';
import type {
  Branch,
  Organization,
  SystemSetting,
  UserProfile,
} from './types';

export const DEFAULT_ORG_ID = 'org_main';
export const DEFAULT_MAIN_BRANCH_ID = 'br_hq_01';
export const DEFAULT_OWNER_UID = 'usr_owner_main';

interface FirebaseContextValue {
  ready: boolean;
  connectionOk: boolean;
  userProfile: UserProfile | null;
  organization: Organization | null;
  branches: Branch[];
  activeBranchId: string | null;
  setActiveBranchId: (branchId: string) => void;
  activeBranch: Branch | null;
  settings: SystemSetting | null;
}

const FirebaseContext = createContext<FirebaseContextValue | undefined>(undefined);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [connectionOk, setConnectionOk] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem('grocery_pos_active_branch') || DEFAULT_MAIN_BRANCH_ID;
    } catch {
      return DEFAULT_MAIN_BRANCH_ID;
    }
  });
  const [settings, setSettings] = useState<SystemSetting | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapWorkspace() {
      const ok = await testFirestoreConnection();
      if (!cancelled) setConnectionOk(ok);

      try {
        const orgRef = doc(db, 'organizations', DEFAULT_ORG_ID);
        const orgSnap = await getDoc(orgRef);

        if (!orgSnap.exists()) {
          const batch = writeBatch(db);

          batch.set(orgRef, {
            organizationId: DEFAULT_ORG_ID,
            name: 'ร้านค้าหลัก (Grocery POS)',
            ownerUid: DEFAULT_OWNER_UID,
            currency: 'LAK',
            timezone: 'Asia/Vientiane',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          batch.set(doc(db, 'branches', DEFAULT_MAIN_BRANCH_ID), {
            branchId: DEFAULT_MAIN_BRANCH_ID,
            organizationId: DEFAULT_ORG_ID,
            ownerUid: DEFAULT_OWNER_UID,
            branchCode: 'HQ-01',
            branchName: 'สาขาหลัก (สำนักงานใหญ่)',
            address: '',
            phone: '',
            managerId: DEFAULT_OWNER_UID,
            assignedUids: [DEFAULT_OWNER_UID],
            isMainBranch: true,
            status: 'active',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          batch.set(doc(db, 'users', DEFAULT_OWNER_UID), {
            uid: DEFAULT_OWNER_UID,
            organizationId: DEFAULT_ORG_ID,
            ownerUid: DEFAULT_OWNER_UID,
            name: 'ผู้ดูแลระบบหลัก (เจ้าของร้าน)',
            email: '',
            phone: '',
            role: 'super_admin',
            branchIds: [DEFAULT_MAIN_BRANCH_ID],
            permissions: DEFAULT_ROLE_PERMISSIONS.super_admin,
            status: 'active',
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
          });

          batch.set(doc(db, 'settings', DEFAULT_ORG_ID), {
            organizationId: DEFAULT_ORG_ID,
            ownerUid: DEFAULT_OWNER_UID,
            storeProfile: {
              name: 'ร้านค้าหลัก (Grocery POS)',
              logoUrl: '',
              address: '',
              phone: '',
            },
            receiptSettings: {
              prefix: 'INV',
              paperSize: '80mm',
              headerText: 'ร้านค้าหลัก (Grocery POS)',
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
          });

          appendAuditLogToBatch(batch, {
            user: {
              uid: DEFAULT_OWNER_UID,
              organizationId: DEFAULT_ORG_ID,
              ownerUid: DEFAULT_OWNER_UID,
              name: 'ผู้ดูแลระบบหลัก (เจ้าของร้าน)',
              role: 'super_admin',
            },
            branchId: DEFAULT_MAIN_BRANCH_ID,
            action: 'INITIALIZE_ORGANIZATION',
            entityType: 'organizations',
            entityId: DEFAULT_ORG_ID,
            before: null,
            after: {
              organizationId: DEFAULT_ORG_ID,
              branchId: DEFAULT_MAIN_BRANCH_ID,
              currency: 'LAK',
            },
          });

          await batch.commit();
        }
      } catch (error) {
        if (!cancelled) {
          handleFirestoreError(error, OperationType.WRITE, `organizations/${DEFAULT_ORG_ID}`);
        }
      }

      if (!cancelled) setReady(true);
    }

    bootstrapWorkspace();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;

    const unsubUser = onSnapshot(
      doc(db, 'users', DEFAULT_OWNER_UID),
      (snap) => {
        setUserProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      },
      (error) => handleFirestoreError(error, OperationType.GET, `users/${DEFAULT_OWNER_UID}`),
    );

    const unsubOrg = onSnapshot(
      doc(db, 'organizations', DEFAULT_ORG_ID),
      (snap) => {
        setOrganization(snap.exists() ? (snap.data() as Organization) : null);
      },
      (error) => handleFirestoreError(error, OperationType.GET, `organizations/${DEFAULT_ORG_ID}`),
    );

    const unsubSettings = onSnapshot(
      doc(db, 'settings', DEFAULT_ORG_ID),
      (snap) => {
        setSettings(snap.exists() ? (snap.data() as SystemSetting) : null);
      },
      (error) => handleFirestoreError(error, OperationType.GET, `settings/${DEFAULT_ORG_ID}`),
    );

    const branchQuery = query(
      collection(db, 'branches'),
      where('organizationId', '==', DEFAULT_ORG_ID),
    );
    const unsubBranches = onSnapshot(
      branchQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Branch)
          .sort((a, b) => Number(b.isMainBranch) - Number(a.isMainBranch));
        setBranches(list);
        if (list.length > 0) {
          setActiveBranchIdState((prev) => {
            if (prev && list.some((b) => b.branchId === prev && b.status === 'active')) {
              return prev;
            }
            const firstActive = list.find((b) => b.status === 'active') ?? list[0];
            return firstActive.branchId;
          });
        }
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'branches'),
    );

    return () => {
      unsubUser();
      unsubOrg();
      unsubSettings();
      unsubBranches();
    };
  }, [ready]);

  const setActiveBranchId = useCallback((branchId: string) => {
    setActiveBranchIdState(branchId);
    try {
      localStorage.setItem('grocery_pos_active_branch', branchId);
    } catch {
      // ignore storage errors
    }
  }, []);

  const activeBranch = useMemo(
    () => branches.find((b) => b.branchId === activeBranchId) ?? branches[0] ?? null,
    [branches, activeBranchId],
  );

  const value: FirebaseContextValue = {
    ready,
    connectionOk,
    userProfile,
    organization,
    branches,
    activeBranchId: activeBranch?.branchId ?? activeBranchId,
    setActiveBranchId,
    activeBranch,
    settings,
  };

  return <FirebaseContext.Provider value={value}>{children}</FirebaseContext.Provider>;
}

export function useFirebase() {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error('useFirebase must be used inside FirebaseProvider');
  }
  return ctx;
}
