import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider, testFirestoreConnection } from './config';
import { OperationType, handleFirestoreError } from './errorHandler';
import type {
  Branch,
  Organization,
  SystemSetting,
  UserInvitation,
  UserProfile,
} from './types';

interface FirebaseContextValue {
  firebaseUser: FirebaseUser | null;
  authReady: boolean;
  serverVerified: boolean;
  connectionOk: boolean;
  userProfile: UserProfile | null;
  profileLoading: boolean;
  organization: Organization | null;
  branches: Branch[];
  activeBranchId: string | null;
  setActiveBranchId: (branchId: string) => void;
  activeBranch: Branch | null;
  settings: SystemSetting | null;
  pendingInvitation: UserInvitation | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  authError: string | null;
}

const FirebaseContext = createContext<FirebaseContextValue | undefined>(undefined);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [serverVerified, setServerVerified] = useState(false);
  const [connectionOk, setConnectionOk] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranchId, setActiveBranchIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem('grocery_pos_active_branch');
    } catch {
      return null;
    }
  });
  const [settings, setSettings] = useState<SystemSetting | null>(null);
  const [pendingInvitation, setPendingInvitation] = useState<UserInvitation | null>(null);

  // Startup connection validation
  useEffect(() => {
    testFirestoreConnection().then(setConnectionOk);
  }, []);

  // Auth state observer
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setAuthError(null);
      if (!user) {
        setServerVerified(false);
        setUserProfile(null);
        setOrganization(null);
        setBranches([]);
        setSettings(null);
        setPendingInvitation(null);
        setProfileLoading(false);
        setAuthReady(true);
        return;
      }

      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setServerVerified(res.ok);
      } catch {
        setServerVerified(false);
      }

      setProfileLoading(true);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Listen to current user profile & pending invitations
  useEffect(() => {
    if (!authReady || !firebaseUser) return;

    const userDocPath = `users/${firebaseUser.uid}`;
    const unsubUser = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          setUserProfile(data);
          setPendingInvitation(null);
        } else {
          setUserProfile(null);
        }
        setProfileLoading(false);
      },
      (error) => {
        setProfileLoading(false);
        handleFirestoreError(error, OperationType.GET, userDocPath);
      },
    );

    let unsubInvite = () => {};
    if (firebaseUser.email) {
      const inviteQuery = query(
        collection(db, 'invitations'),
        where('email', '==', firebaseUser.email.toLowerCase()),
        where('status', '==', 'pending'),
      );
      unsubInvite = onSnapshot(
        inviteQuery,
        (snap) => {
          if (!snap.empty) {
            setPendingInvitation(snap.docs[0].data() as UserInvitation);
          } else {
            setPendingInvitation(null);
          }
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'invitations');
        },
      );
    }

    return () => {
      unsubUser();
      unsubInvite();
    };
  }, [authReady, firebaseUser]);

  // Update lastLoginAt once per session when active profile loads
  useEffect(() => {
    if (!firebaseUser || !userProfile || userProfile.uid !== firebaseUser.uid) return;
    const sessionKey = `pos_login_ping_${firebaseUser.uid}`;
    try {
      if (sessionStorage.getItem(sessionKey)) return;
      sessionStorage.setItem(sessionKey, '1');
    } catch {
      // ignore storage errors
    }
    updateDoc(doc(db, 'users', firebaseUser.uid), {
      lastLoginAt: serverTimestamp(),
    }).catch((err) => {
      console.warn('Could not update lastLoginAt:', err);
    });
  }, [firebaseUser, userProfile]);

  // Listen to organization, branches, and settings once profile is ready
  useEffect(() => {
    if (!firebaseUser || !userProfile || userProfile.status !== 'active') {
      setOrganization(null);
      setBranches([]);
      setSettings(null);
      return;
    }

    const orgId = userProfile.organizationId;

    const unsubOrg = onSnapshot(
      doc(db, 'organizations', orgId),
      (snap) => {
        setOrganization(snap.exists() ? (snap.data() as Organization) : null);
      },
      (error) => handleFirestoreError(error, OperationType.GET, `organizations/${orgId}`),
    );

    const unsubSettings = onSnapshot(
      doc(db, 'settings', orgId),
      (snap) => {
        setSettings(snap.exists() ? (snap.data() as SystemSetting) : null);
      },
      (error) => handleFirestoreError(error, OperationType.GET, `settings/${orgId}`),
    );

    const isOwnerOrSuperAdmin =
      userProfile.uid === userProfile.ownerUid || userProfile.role === 'super_admin';

    let unsubBranches = () => {};
    if (isOwnerOrSuperAdmin) {
      const branchQuery = query(
        collection(db, 'branches'),
        where('organizationId', '==', orgId),
      );
      unsubBranches = onSnapshot(
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
    } else {
      let cancelled = false;
      import('firebase/firestore').then(async ({ getDoc }) => {
        try {
          const branchDocs = await Promise.all(
            (userProfile.branchIds || []).map((bId) => getDoc(doc(db, 'branches', bId))),
          );
          if (cancelled) return;
          const list = branchDocs
            .filter((d) => d.exists())
            .map((d) => d.data() as Branch)
            .filter((b) => b.organizationId === orgId)
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
        } catch (error) {
          if (!cancelled) {
            handleFirestoreError(error, OperationType.GET, 'branches');
          }
        }
      });
      unsubBranches = () => {
        cancelled = true;
      };
    }

    return () => {
      unsubOrg();
      unsubSettings();
      unsubBranches();
    };
  }, [firebaseUser, userProfile]);

  const setActiveBranchId = useCallback((branchId: string) => {
    setActiveBranchIdState(branchId);
    try {
      localStorage.setItem('grocery_pos_active_branch', branchId);
    } catch {
      // ignore storage errors
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'ไม่สามารถเข้าสู่ระบบด้วย Google ได้';
      setAuthError(msg);
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    if (firebaseUser) {
      try {
        sessionStorage.removeItem(`pos_login_ping_${firebaseUser.uid}`);
      } catch {
        // ignore
      }
    }
    await firebaseSignOut(auth);
  }, [firebaseUser]);

  const activeBranch = useMemo(
    () => branches.find((b) => b.branchId === activeBranchId) ?? branches[0] ?? null,
    [branches, activeBranchId],
  );

  const value: FirebaseContextValue = {
    firebaseUser,
    authReady,
    serverVerified,
    connectionOk,
    userProfile,
    profileLoading,
    organization,
    branches,
    activeBranchId: activeBranch?.branchId ?? activeBranchId,
    setActiveBranchId,
    activeBranch,
    settings,
    pendingInvitation,
    signInWithGoogle,
    signOut,
    authError,
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
