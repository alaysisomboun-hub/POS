import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, testFirestoreConnection } from './config';
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
const LEGACY_UNCLAIMED_OWNER_UID = 'usr_owner_main';
const BOOTSTRAPPED_ADMIN_EMAIL = 'alaysisomboun@gmail.com';

interface FirebaseContextValue {
  ready: boolean;
  authReady: boolean;
  authUser: User | null;
  profileLoading: boolean;
  profileError: string | null;
  canClaimLegacyOwner: boolean;
  connectionOk: boolean;
  userProfile: UserProfile | null;
  organization: Organization | null;
  activeBranchId: string;
  activeBranch: Branch | null;
  settings: SystemSetting | null;
  signOutUser: () => Promise<void>;
  claimLegacyOwnerProfile: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextValue | undefined>(undefined);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [canClaimLegacyOwner, setCanClaimLegacyOwner] = useState(false);
  const [connectionOk, setConnectionOk] = useState(true);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const [settings, setSettings] = useState<SystemSetting | null>(null);

  const sessionSeqRef = useRef(0);
  const unsubRef = useRef<Unsubscribe[]>([]);

  const clearSubscriptions = useCallback(() => {
    for (const unsub of unsubRef.current) {
      try {
        unsub();
      } catch {
        // Ignore cleanup errors
      }
    }
    unsubRef.current = [];
  }, []);

  const clearSessionState = useCallback(() => {
    setUserProfile(null);
    setOrganization(null);
    setActiveBranch(null);
    setSettings(null);
    setProfileError(null);
    setCanClaimLegacyOwner(false);
  }, []);

  const subscribeToUserAndWorkspace = useCallback(
    (uid: string, seq: number) => {
      clearSubscriptions();

      let userResolved = false;
      const markReadyIfUserResolved = () => {
        if (seq !== sessionSeqRef.current) return;
        if (userResolved) {
          setProfileLoading(false);
        }
      };

      const unsubUser = onSnapshot(
        doc(db, 'users', uid),
        (snap) => {
          if (seq !== sessionSeqRef.current) return;
          userResolved = true;
          if (!snap.exists()) {
            setUserProfile(null);
            setProfileError(
              `ไม่พบบัญชีพนักงานสำหรับ UID: ${uid} กรุณาติดต่อผู้ดูแลระบบหรือเจ้าของร้าน`,
            );
            markReadyIfUserResolved();
            return;
          }

          const loaded = snap.data() as UserProfile;
          if (loaded.uid !== uid) {
            setUserProfile(null);
            setProfileError('ข้อมูล UID ของบัญชีผู้ใช้งานไม่ตรงกับการยืนยันตัวตน กรุณาติดต่อผู้ดูแลระบบ');
            markReadyIfUserResolved();
            return;
          }

          if (loaded.status !== 'active') {
            setUserProfile(loaded);
            setProfileError('บัญชีผู้ใช้งานของท่านถูกระงับสิทธิ์ กรุณาติดต่อผู้ดูแลระบบหรือเจ้าของร้าน');
            markReadyIfUserResolved();
            return;
          }

          setProfileError(null);
          setCanClaimLegacyOwner(false);
          setUserProfile(loaded);
          markReadyIfUserResolved();
        },
        (error) => {
          if (seq !== sessionSeqRef.current) return;
          setProfileLoading(false);
          handleFirestoreError(error, OperationType.GET, `users/${uid}`);
        },
      );

      const unsubOrg = onSnapshot(
        doc(db, 'organizations', DEFAULT_ORG_ID),
        (snap) => {
          if (seq !== sessionSeqRef.current) return;
          setOrganization(snap.exists() ? (snap.data() as Organization) : null);
        },
        (error) => {
          if (seq !== sessionSeqRef.current) return;
          handleFirestoreError(error, OperationType.GET, `organizations/${DEFAULT_ORG_ID}`);
        },
      );

      const unsubSettings = onSnapshot(
        doc(db, 'settings', DEFAULT_ORG_ID),
        (snap) => {
          if (seq !== sessionSeqRef.current) return;
          setSettings(snap.exists() ? (snap.data() as SystemSetting) : null);
        },
        (error) => {
          if (seq !== sessionSeqRef.current) return;
          handleFirestoreError(error, OperationType.GET, `settings/${DEFAULT_ORG_ID}`);
        },
      );

      const unsubBranch = onSnapshot(
        doc(db, 'branches', DEFAULT_MAIN_BRANCH_ID),
        (snap) => {
          if (seq !== sessionSeqRef.current) return;
          setActiveBranch(snap.exists() ? (snap.data() as Branch) : null);
        },
        (error) => {
          if (seq !== sessionSeqRef.current) return;
          handleFirestoreError(error, OperationType.GET, `branches/${DEFAULT_MAIN_BRANCH_ID}`);
        },
      );

      unsubRef.current = [unsubUser, unsubOrg, unsubSettings, unsubBranch];
    },
    [clearSubscriptions],
  );

  useEffect(() => {
    let active = true;
    testFirestoreConnection().then((ok) => {
      if (active) setConnectionOk(ok);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      const seq = ++sessionSeqRef.current;
      clearSubscriptions();
      clearSessionState();
      setAuthUser(fbUser);
      setAuthReady(true);

      if (!fbUser) {
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      const currentUid = fbUser.uid;
      const cleanEmail = (fbUser.email || '').trim().toLowerCase();

      try {
        const userRef = doc(db, 'users', currentUid);
        const orgRef = doc(db, 'organizations', DEFAULT_ORG_ID);
        const branchRef = doc(db, 'branches', DEFAULT_MAIN_BRANCH_ID);
        const settingsRef = doc(db, 'settings', DEFAULT_ORG_ID);

        const userSnap = await getDoc(userRef);
        if (seq !== sessionSeqRef.current) return;

        if (userSnap.exists()) {
          const existingProfile = userSnap.data() as UserProfile;
          if (existingProfile.uid === currentUid && existingProfile.status === 'active') {
            // Ensure branch/settings exist without altering owner/admin privileges
            const [orgSnap, branchSnap] = await Promise.all([getDoc(orgRef), getDoc(branchRef)]);
            if (seq !== sessionSeqRef.current) return;
            if (!orgSnap.exists() || !branchSnap.exists()) {
              if (
                existingProfile.role === 'super_admin' ||
                existingProfile.role === 'owner'
              ) {
                const fixBatch = writeBatch(db);
                const storeName = orgSnap.exists()
                  ? (orgSnap.data() as Organization).name
                  : 'ร้านค้าหลัก (Grocery POS)';
                if (!branchSnap.exists()) {
                  fixBatch.set(branchRef, {
                    branchId: DEFAULT_MAIN_BRANCH_ID,
                    organizationId: DEFAULT_ORG_ID,
                    ownerUid: existingProfile.ownerUid,
                    branchCode: 'HQ-01',
                    branchName: storeName,
                    address: '',
                    phone: '',
                    managerId: existingProfile.uid,
                    assignedUids: [existingProfile.uid],
                    isMainBranch: true,
                    status: 'active',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  });
                }
                await fixBatch.commit();
              }
            }
            // Refresh non-privilege lastLoginAt timestamp safely
            updateDoc(userRef, { lastLoginAt: serverTimestamp() }).catch(() => undefined);
          }

          if (seq !== sessionSeqRef.current) return;
          subscribeToUserAndWorkspace(currentUid, seq);
          return;
        }

        // User document at /users/{fbUser.uid} does NOT exist yet.
        const orgSnap = await getDoc(orgRef);
        if (seq !== sessionSeqRef.current) return;

        if (!orgSnap.exists()) {
          // Brand-new workspace bootstrap using authenticated user's real UID (never usr_owner_main)
          const ownerDisplayName =
            fbUser.displayName?.trim() ||
            cleanEmail ||
            'ผู้ดูแลระบบหลัก (เจ้าของร้าน)';

          const bootstrapBatch = writeBatch(db);
          bootstrapBatch.set(orgRef, {
            organizationId: DEFAULT_ORG_ID,
            name: 'ร้านค้าหลัก (Grocery POS)',
            ownerUid: currentUid,
            currency: 'LAK',
            timezone: 'Asia/Vientiane',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          bootstrapBatch.set(userRef, {
            uid: currentUid,
            organizationId: DEFAULT_ORG_ID,
            ownerUid: currentUid,
            name: ownerDisplayName.slice(0, 120),
            email: cleanEmail.slice(0, 160),
            phone: '',
            role: 'super_admin',
            branchIds: [DEFAULT_MAIN_BRANCH_ID],
            permissions: DEFAULT_ROLE_PERMISSIONS.super_admin,
            status: 'active',
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
          });

          bootstrapBatch.set(settingsRef, {
            organizationId: DEFAULT_ORG_ID,
            ownerUid: currentUid,
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

          bootstrapBatch.set(branchRef, {
            branchId: DEFAULT_MAIN_BRANCH_ID,
            organizationId: DEFAULT_ORG_ID,
            ownerUid: currentUid,
            branchCode: 'HQ-01',
            branchName: 'ร้านค้าหลัก (Grocery POS)',
            address: '',
            phone: '',
            managerId: currentUid,
            assignedUids: [currentUid],
            isMainBranch: true,
            status: 'active',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          appendAuditLogToBatch(bootstrapBatch, {
            user: {
              uid: currentUid,
              organizationId: DEFAULT_ORG_ID,
              ownerUid: currentUid,
              name: ownerDisplayName.slice(0, 120),
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
              ownerUid: currentUid,
              currency: 'LAK',
              mode: 'single_branch',
            },
          });

          await bootstrapBatch.commit();
          if (seq !== sessionSeqRef.current) return;
          subscribeToUserAndWorkspace(currentUid, seq);
          return;
        }

        // Workspace exists: check if there is a legacy pre-Auth staff record matching this user's email
        const orgData = orgSnap.data() as Organization;
        setOrganization(orgData);

        if (cleanEmail) {
          const legacySnap = await getDocs(
            query(
              collection(db, 'users'),
              where('organizationId', '==', DEFAULT_ORG_ID),
              where('email', '==', cleanEmail),
            ),
          );
          if (seq !== sessionSeqRef.current) return;

          const matchedDoc = legacySnap.docs.find((d) => {
            const p = d.data() as UserProfile;
            return p.email?.toLowerCase() === cleanEmail;
          });

          if (matchedDoc) {
            const legacyProfile = matchedDoc.data() as UserProfile;
            if (legacyProfile.status !== 'active') {
              setProfileError('บัญชีพนักงานของท่านถูกระงับสิทธิ์ กรุณาติดต่อผู้ดูแลระบบ');
              setProfileLoading(false);
              return;
            }

            // Link pre-created record under real Auth UID keeping its exact assigned role & permissions (never escalate!)
            const linkBatch = writeBatch(db);
            linkBatch.set(userRef, {
              uid: currentUid,
              invitationId: legacyProfile.uid,
              ...(legacyProfile.employeeId ? { employeeId: legacyProfile.employeeId } : {}),
              organizationId: DEFAULT_ORG_ID,
              ownerUid: orgData.ownerUid,
              name: legacyProfile.name,
              email: cleanEmail,
              phone: legacyProfile.phone || '',
              role: legacyProfile.role,
              branchIds:
                legacyProfile.branchIds?.length > 0
                  ? legacyProfile.branchIds
                  : [DEFAULT_MAIN_BRANCH_ID],
              permissions:
                legacyProfile.permissions || DEFAULT_ROLE_PERMISSIONS[legacyProfile.role],
              status: legacyProfile.status,
              createdAt: serverTimestamp(),
              lastLoginAt: serverTimestamp(),
            });

            appendAuditLogToBatch(linkBatch, {
              user: {
                uid: currentUid,
                organizationId: DEFAULT_ORG_ID,
                ownerUid: orgData.ownerUid,
                name: legacyProfile.name,
                role: legacyProfile.role,
              },
              branchId: DEFAULT_MAIN_BRANCH_ID,
              action: 'LINK_AUTH_UID_PROFILE',
              entityType: 'users',
              entityId: currentUid,
              before: { legacyUid: legacyProfile.uid },
              after: { uid: currentUid, role: legacyProfile.role },
            });

            await linkBatch.commit();
            if (seq !== sessionSeqRef.current) return;
            subscribeToUserAndWorkspace(currentUid, seq);
            return;
          }
        }

        if (fbUser.emailVerified && cleanEmail === BOOTSTRAPPED_ADMIN_EMAIL) {
          const adminName = (
            fbUser.displayName?.trim() ||
            'ผู้ดูแลระบบหลัก (เจ้าของร้าน)'
          ).slice(0, 120);
          const nextOwnerUid =
            orgData.ownerUid === LEGACY_UNCLAIMED_OWNER_UID ? currentUid : orgData.ownerUid;

          const adminBatch = writeBatch(db);
          adminBatch.set(userRef, {
            uid: currentUid,
            organizationId: DEFAULT_ORG_ID,
            ownerUid: nextOwnerUid,
            name: adminName,
            email: cleanEmail,
            phone: '',
            role: 'super_admin',
            branchIds: [DEFAULT_MAIN_BRANCH_ID],
            permissions: DEFAULT_ROLE_PERMISSIONS.super_admin,
            status: 'active',
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp(),
          });

          if (orgData.ownerUid === LEGACY_UNCLAIMED_OWNER_UID) {
            adminBatch.update(orgRef, {
              ownerUid: currentUid,
              updatedAt: serverTimestamp(),
            });
          }

          appendAuditLogToBatch(adminBatch, {
            user: {
              uid: currentUid,
              organizationId: DEFAULT_ORG_ID,
              ownerUid: nextOwnerUid,
              name: adminName,
              role: 'super_admin',
            },
            branchId: DEFAULT_MAIN_BRANCH_ID,
            action: 'BOOTSTRAP_ADMIN_PROFILE',
            entityType: 'users',
            entityId: currentUid,
            before: { orgOwnerUid: orgData.ownerUid },
            after: { uid: currentUid, email: cleanEmail, role: 'super_admin' },
          });

          await adminBatch.commit();
          if (seq !== sessionSeqRef.current) return;
          subscribeToUserAndWorkspace(currentUid, seq);
          return;
        }

        // No /users/{uid} and no legacy email match: deny access (never fall back to Super Admin!)
        const isLegacyUnclaimed = orgData.ownerUid === LEGACY_UNCLAIMED_OWNER_UID;
        setCanClaimLegacyOwner(isLegacyUnclaimed);
        setProfileError(
          `ไม่พบบัญชีพนักงานสำหรับ ${cleanEmail || currentUid} ในระบบ กรุณาติดต่อผู้ดูแลระบบหรือเจ้าของร้านเพื่อเพิ่มบัญชีและกำหนดสิทธิ์`,
        );
        setProfileLoading(false);
      } catch (error) {
        if (seq !== sessionSeqRef.current) return;
        setProfileLoading(false);
        setProfileError(
          error instanceof Error ? error.message : 'ไม่สามารถโหลดข้อมูลบัญชีผู้ใช้งานได้',
        );
      }
    });

    return () => {
      sessionSeqRef.current += 1;
      clearSubscriptions();
      unsubscribeAuth();
    };
  }, [clearSessionState, clearSubscriptions, subscribeToUserAndWorkspace]);

  const signOutUser = useCallback(async () => {
    sessionSeqRef.current += 1;
    clearSubscriptions();
    clearSessionState();
    setProfileLoading(false);
    await signOut(auth);
  }, [clearSessionState, clearSubscriptions]);

  const claimLegacyOwnerProfile = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return;
    const seq = sessionSeqRef.current;
    setProfileLoading(true);
    setProfileError(null);

    try {
      const orgRef = doc(db, 'organizations', DEFAULT_ORG_ID);
      const orgSnap = await getDoc(orgRef);
      if (!orgSnap.exists()) {
        throw new Error('ไม่พบข้อมูลร้านค้าหลัก');
      }
      const orgData = orgSnap.data() as Organization;
      if (orgData.ownerUid !== LEGACY_UNCLAIMED_OWNER_UID) {
        throw new Error('ร้านค้านี้ถูกผูกสิทธิ์เจ้าของร้านกับบัญชีอื่นเรียบร้อยแล้ว');
      }

      const cleanEmail = (current.email || '').trim().toLowerCase().slice(0, 160);
      const displayName = (
        current.displayName?.trim() ||
        cleanEmail ||
        'ผู้ดูแลระบบหลัก (เจ้าของร้าน)'
      ).slice(0, 120);

      const batch = writeBatch(db);
      batch.set(doc(db, 'users', current.uid), {
        uid: current.uid,
        organizationId: DEFAULT_ORG_ID,
        ownerUid: current.uid,
        name: displayName,
        email: cleanEmail,
        phone: '',
        role: 'super_admin',
        branchIds: [DEFAULT_MAIN_BRANCH_ID],
        permissions: DEFAULT_ROLE_PERMISSIONS.super_admin,
        status: 'active',
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });

      batch.update(orgRef, {
        ownerUid: current.uid,
        updatedAt: serverTimestamp(),
      });

      appendAuditLogToBatch(batch, {
        user: {
          uid: current.uid,
          organizationId: DEFAULT_ORG_ID,
          ownerUid: current.uid,
          name: displayName,
          role: 'super_admin',
        },
        branchId: DEFAULT_MAIN_BRANCH_ID,
        action: 'CLAIM_INITIAL_OWNER',
        entityType: 'organizations',
        entityId: DEFAULT_ORG_ID,
        before: { ownerUid: LEGACY_UNCLAIMED_OWNER_UID },
        after: { ownerUid: current.uid },
      });

      await batch.commit();
      if (seq !== sessionSeqRef.current) return;
      setCanClaimLegacyOwner(false);
      subscribeToUserAndWorkspace(current.uid, seq);
    } catch (error) {
      setProfileLoading(false);
      setProfileError(
        error instanceof Error ? error.message : 'ไม่สามารถยืนยันสิทธิ์เจ้าของร้านได้',
      );
    }
  }, [subscribeToUserAndWorkspace]);

  const value: FirebaseContextValue = {
    ready: authReady && !profileLoading,
    authReady,
    authUser,
    profileLoading,
    profileError,
    canClaimLegacyOwner,
    connectionOk,
    userProfile,
    organization,
    activeBranchId: DEFAULT_MAIN_BRANCH_ID,
    activeBranch,
    settings,
    signOutUser,
    claimLegacyOwnerProfile,
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
