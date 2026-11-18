import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
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
  activeBranchId: string;
  activeBranch: Branch | null;
  settings: SystemSetting | null;
}

const FirebaseContext = createContext<FirebaseContextValue | undefined>(undefined);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [connectionOk, setConnectionOk] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const [settings, setSettings] = useState<SystemSetting | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapWorkspace() {
      const ok = await testFirestoreConnection();
      if (!cancelled) setConnectionOk(ok);

      try {
        const orgRef = doc(db, 'organizations', DEFAULT_ORG_ID);
        const branchRef = doc(db, 'branches', DEFAULT_MAIN_BRANCH_ID);
        const ownerRef = doc(db, 'users', DEFAULT_OWNER_UID);
        const settingsRef = doc(db, 'settings', DEFAULT_ORG_ID);

        const [orgSnap, branchSnap] = await Promise.all([
          getDoc(orgRef),
          getDoc(branchRef),
        ]);

        if (!orgSnap.exists() || !branchSnap.exists()) {
          const batch = writeBatch(db);

          if (!orgSnap.exists()) {
            batch.set(orgRef, {
              organizationId: DEFAULT_ORG_ID,
              name: 'ร้านค้าหลัก (Grocery POS)',
              ownerUid: DEFAULT_OWNER_UID,
              currency: 'LAK',
              timezone: 'Asia/Vientiane',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });

            batch.set(ownerRef, {
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

            batch.set(settingsRef, {
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
                mode: 'single_branch',
              },
            });
          }

          if (!branchSnap.exists()) {
            const storeName = orgSnap.exists()
              ? (orgSnap.data() as Organization).name
              : 'ร้านค้าหลัก (Grocery POS)';

            batch.set(branchRef, {
              branchId: DEFAULT_MAIN_BRANCH_ID,
              organizationId: DEFAULT_ORG_ID,
              ownerUid: DEFAULT_OWNER_UID,
              branchCode: 'HQ-01',
              branchName: storeName,
              address: '',
              phone: '',
              managerId: DEFAULT_OWNER_UID,
              assignedUids: [DEFAULT_OWNER_UID],
              isMainBranch: true,
              status: 'active',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }

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

    const unsubBranch = onSnapshot(
      doc(db, 'branches', DEFAULT_MAIN_BRANCH_ID),
      (snap) => {
        setActiveBranch(snap.exists() ? (snap.data() as Branch) : null);
      },
      (error) => handleFirestoreError(error, OperationType.GET, `branches/${DEFAULT_MAIN_BRANCH_ID}`),
    );

    return () => {
      unsubUser();
      unsubOrg();
      unsubSettings();
      unsubBranch();
    };
  }, [ready]);

  const value: FirebaseContextValue = {
    ready,
    connectionOk,
    userProfile,
    organization,
    activeBranchId: DEFAULT_MAIN_BRANCH_ID,
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
