import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  CheckCircle2,
  Edit3,
  Eye,
  EyeOff,
  History,
  Power,
  RotateCcw,
  Search,
  Shield,
  UserPlus,
  X,
} from 'lucide-react';
import { auth, createSecondaryStaffAuthUser, db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { appendAuditLogToBatch } from '../../core/firebase/auditService';
import {
  ACTION_LABELS,
  ALL_ACTIONS,
  DEFAULT_ROLE_PERMISSIONS,
  MENU_ITEMS,
  ROLE_LABELS,
  hasPermission,
} from '../../core/rbac/permissions';
import { formatDateTimeVientiane } from '../../core/utils/date';
import type {
  AuditLog,
  ModuleKey,
  PermissionAction,
  PermissionsMap,
  UserProfile,
  UserRole,
} from '../../core/firebase/types';

type TabKey = 'staff' | 'roles' | 'audit';

export function StaffManagementPage() {
  const { userProfile, activeBranchId } = useFirebase();
  const [activeTab, setActiveTab] = useState<TabKey>('staff');
  const [staffList, setStaffList] = useState<UserProfile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLimit, setAuditLimit] = useState(50);

  // Staff filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');

  // Audit filters
  const [auditSearch, setAuditSearch] = useState('');
  const [auditEntityFilter, setAuditEntityFilter] = useState<string>('all');

  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Modal state for Create or Edit Staff
  const [modalMode, setModalMode] = useState<'create_staff' | 'edit_staff' | null>(null);
  const [editingStaff, setEditingStaff] = useState<UserProfile | null>(null);
  const [createAuthMode, setCreateAuthMode] = useState<'email_password' | 'google_link'>(
    'email_password',
  );
  const [formEmployeeId, setFormEmployeeId] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('cashier');
  const [formStatus, setFormStatus] = useState<'active' | 'suspended'>('active');
  const [formPermissions, setFormPermissions] = useState<PermissionsMap>(
    DEFAULT_ROLE_PERMISSIONS.cashier,
  );
  const [showPermissionMatrix, setShowPermissionMatrix] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isTopAdmin =
    userProfile?.role === 'super_admin' || userProfile?.role === 'owner';
  const canCreate = hasPermission(userProfile, 'staff', 'create');
  const canEdit = hasPermission(userProfile, 'staff', 'edit');
  const assignableRoles = useMemo(
    () =>
      (Object.keys(ROLE_LABELS) as UserRole[]).filter((role) =>
        isTopAdmin ? true : role !== 'super_admin' && role !== 'owner',
      ),
    [isTopAdmin],
  );

  useEffect(() => {
    if (!userProfile) return;
    const orgId = userProfile.organizationId;

    const usersQ = query(collection(db, 'users'), where('organizationId', '==', orgId));
    const unsubUsers = onSnapshot(
      usersQ,
      (snap) => {
        setStaffList(snap.docs.map((d) => d.data() as UserProfile));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'users'),
    );

    return () => {
      unsubUsers();
    };
  }, [userProfile]);

  useEffect(() => {
    if (!userProfile || activeTab !== 'audit') return;
    const auditQ = query(
      collection(db, 'auditLogs'),
      where('organizationId', '==', userProfile.organizationId),
      orderBy('createdAt', 'desc'),
      limit(auditLimit),
    );
    const unsubAudit = onSnapshot(
      auditQ,
      (snap) => {
        setAuditLogs(snap.docs.map((d) => d.data() as AuditLog));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'auditLogs'),
    );
    return () => unsubAudit();
  }, [userProfile, activeTab, auditLimit]);

  const kpiSummary = useMemo(() => {
    const total = staffList.length;
    const active = staffList.filter((s) => s.status === 'active').length;
    const suspended = total - active;
    const activeRolesCount = new Set(staffList.map((s) => s.role)).size;
    return { total, active, suspended, activeRolesCount };
  }, [staffList]);

  const filteredStaff = useMemo(() => {
    const claimedInvitationIds = new Set(
      staffList.map((s) => s.invitationId).filter((id): id is string => Boolean(id)),
    );
    const q = search.trim().toLowerCase();
    return staffList.filter((s) => {
      if (claimedInvitationIds.has(s.uid)) return false;
      if (roleFilter !== 'all' && s.role !== roleFilter) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.employeeId || '').toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q) ||
        ROLE_LABELS[s.role].toLowerCase().includes(q)
      );
    });
  }, [staffList, search, roleFilter, statusFilter]);

  const auditEntities = useMemo(() => {
    const set = new Set<string>();
    auditLogs.forEach((l) => set.add(l.entityType));
    return Array.from(set).sort();
  }, [auditLogs]);

  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditLogs.filter((l) => {
      if (auditEntityFilter !== 'all' && l.entityType !== auditEntityFilter) return false;
      if (!q) return true;
      return (
        l.action.toLowerCase().includes(q) ||
        l.entityType.toLowerCase().includes(q) ||
        l.userNameSnapshot.toLowerCase().includes(q) ||
        l.entityId.toLowerCase().includes(q)
      );
    });
  }, [auditLogs, auditSearch, auditEntityFilter]);

  const openCreateStaffModal = () => {
    setEditingStaff(null);
    setCreateAuthMode('google_link');
    setFormEmployeeId('');
    setFormEmail('');
    setFormPassword('');
    setShowPassword(false);
    setFormName('');
    setFormPhone('');
    setFormRole('cashier');
    setFormStatus('active');
    setFormPermissions(structuredClone(DEFAULT_ROLE_PERMISSIONS.cashier));
    setShowPermissionMatrix(true);
    setErrorMsg(null);
    setModalMode('create_staff');
  };

  const openEditStaffModal = (staff: UserProfile) => {
    if (!isTopAdmin && (staff.role === 'super_admin' || staff.role === 'owner')) {
      setFeedback({
        type: 'err',
        text: 'เฉพาะ Super Admin หรือเจ้าของร้านเท่านั้นที่สามารถแก้ไขบัญชีผู้ดูแลระบบสูงสุดได้',
      });
      return;
    }
    setEditingStaff(staff);
    setFormEmployeeId(staff.employeeId || '');
    setFormEmail(staff.email);
    setFormPassword('');
    setShowPassword(false);
    setFormName(staff.name);
    setFormPhone(staff.phone || '');
    setFormRole(staff.role);
    setFormStatus(staff.status);
    setFormPermissions(
      structuredClone(staff.permissions || DEFAULT_ROLE_PERMISSIONS[staff.role]),
    );
    setShowPermissionMatrix(true);
    setErrorMsg(null);
    setModalMode('edit_staff');
  };

  const handleRoleSelect = (role: UserRole) => {
    setFormRole(role);
    setFormPermissions(structuredClone(DEFAULT_ROLE_PERMISSIONS[role]));
  };

  const togglePermission = (moduleKey: ModuleKey, action: PermissionAction) => {
    setFormPermissions((prev) => {
      const current = prev[moduleKey] ?? [];
      const next = current.includes(action)
        ? current.filter((a) => a !== action)
        : [...current, action];
      return {
        ...prev,
        [moduleKey]: next,
      };
    });
  };

  const toggleModuleAllActions = (moduleKey: ModuleKey) => {
    setFormPermissions((prev) => {
      const current = prev[moduleKey] ?? [];
      const hasAll = ALL_ACTIONS.every((a) => current.includes(a));
      return {
        ...prev,
        [moduleKey]: hasAll ? [] : [...ALL_ACTIONS],
      };
    });
  };

  const handleToggleStaffStatus = async (staff: UserProfile) => {
    if (!userProfile || !canEdit) return;
    if (!isTopAdmin && (staff.role === 'super_admin' || staff.role === 'owner')) {
      setFeedback({
        type: 'err',
        text: 'ไม่สามารถเปลี่ยนสถานะบัญชีผู้ดูแลระบบสูงสุดหรือเจ้าของร้านได้',
      });
      return;
    }
    if (staff.uid === userProfile.uid && staff.status === 'active') {
      setFeedback({
        type: 'err',
        text: 'ไม่สามารถระงับสิทธิ์บัญชีของท่านที่กำลังใช้งานอยู่ได้',
      });
      return;
    }

    const nextStatus = staff.status === 'active' ? 'suspended' : 'active';
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', staff.uid), {
        status: nextStatus,
        lastLoginAt: serverTimestamp(),
      });
      appendAuditLogToBatch(batch, {
        user: userProfile,
        branchId: activeBranchId,
        action: 'UPDATE_STAFF_STATUS',
        entityType: 'users',
        entityId: staff.uid,
        before: { status: staff.status, name: staff.name },
        after: { status: nextStatus, name: staff.name },
      });
      await batch.commit();
      setFeedback({
        type: 'ok',
        text: `${nextStatus === 'active' ? 'เปิดใช้งาน' : 'ระงับสิทธิ์'}พนักงาน "${staff.name}" เรียบร้อยแล้ว`,
      });
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `users/${staff.uid}`);
      } catch (err) {
        setFeedback({
          type: 'err',
          text: err instanceof Error ? err.message : 'ไม่สามารถเปลี่ยนสถานะพนักงานได้',
        });
      }
    }
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    const cleanName = formName.trim().slice(0, 120);
    const cleanEmail = formEmail.trim().toLowerCase().slice(0, 160);
    const cleanPhone = formPhone.trim().slice(0, 30);
    const cleanEmployeeId = formEmployeeId.trim().slice(0, 30);

    if (!cleanName) {
      setErrorMsg('กรุณากรอกชื่อพนักงาน');
      return;
    }

    if (!isTopAdmin && (formRole === 'super_admin' || formRole === 'owner')) {
      setErrorMsg('เฉพาะผู้ดูแลระบบสูงสุดหรือเจ้าของร้านเท่านั้นที่กำหนดบทบาทระดับ Admin ได้');
      return;
    }

    if (modalMode === 'create_staff') {
      if (!cleanEmail || !cleanEmail.includes('@')) {
        setErrorMsg('กรุณากรอกอีเมลที่ถูกต้องสำหรับให้พนักงานใช้เข้าสู่ระบบ');
        return;
      }
      if (createAuthMode === 'email_password' && formPassword.length < 6) {
        setErrorMsg('กรุณากำหนดรหัสผ่านเริ่มต้นอย่างน้อย 6 ตัวอักษร');
        return;
      }
      const duplicateEmail = staffList.find(
        (s) => s.email.trim().toLowerCase() === cleanEmail,
      );
      if (duplicateEmail) {
        setErrorMsg(`อีเมล ${cleanEmail} ถูกใช้งานโดยพนักงาน "${duplicateEmail.name}" แล้ว`);
        return;
      }
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      const batch = writeBatch(db);
      const singleBranchIds = [activeBranchId];

      if (modalMode === 'create_staff') {
        const expectedAdminUid = auth.currentUser?.uid;
        if (!expectedAdminUid || expectedAdminUid !== userProfile.uid) {
          throw new Error('เซสชันผู้ดูแลระบบไม่ตรงกับโปรไฟล์ปัจจุบัน กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
        }

        const realStaffUid =
          createAuthMode === 'email_password'
            ? await createSecondaryStaffAuthUser(cleanEmail, formPassword)
            : `invite_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

        if (auth.currentUser?.uid !== expectedAdminUid) {
          throw new Error('ตรวจพบการเปลี่ยนแปลงเซสชันระหว่างสร้างบัญชี กรุณารีเฟรชและตรวจสอบใหม่');
        }

        batch.set(doc(db, 'users', realStaffUid), {
          uid: realStaffUid,
          ...(cleanEmployeeId ? { employeeId: cleanEmployeeId } : {}),
          organizationId: userProfile.organizationId,
          ownerUid: userProfile.ownerUid,
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          role: formRole,
          branchIds: singleBranchIds,
          permissions: formPermissions,
          status: formStatus,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
        });

        appendAuditLogToBatch(batch, {
          user: userProfile,
          branchId: activeBranchId,
          action: 'CREATE_STAFF',
          entityType: 'users',
          entityId: realStaffUid,
          before: null,
          after: {
            uid: realStaffUid,
            employeeId: cleanEmployeeId || null,
            name: cleanName,
            email: cleanEmail,
            role: formRole,
            branchIds: singleBranchIds,
          },
        });
      } else if (modalMode === 'edit_staff' && editingStaff) {
        batch.update(doc(db, 'users', editingStaff.uid), {
          name: cleanName,
          employeeId: cleanEmployeeId,
          email: cleanEmail,
          phone: cleanPhone,
          role: formRole,
          branchIds: singleBranchIds,
          permissions: formPermissions,
          status: formStatus,
          lastLoginAt: serverTimestamp(),
        });

        appendAuditLogToBatch(batch, {
          user: userProfile,
          branchId: activeBranchId,
          action: 'UPDATE_STAFF_PERMISSIONS',
          entityType: 'users',
          entityId: editingStaff.uid,
          before: {
            role: editingStaff.role,
            status: editingStaff.status,
            employeeId: editingStaff.employeeId || null,
          },
          after: {
            role: formRole,
            status: formStatus,
            employeeId: cleanEmployeeId || null,
          },
        });
      }

      await batch.commit();
      setModalMode(null);
      setFormPassword('');
      setFeedback({
        type: 'ok',
        text:
          modalMode === 'create_staff'
            ? `สร้างบัญชีพนักงาน "${cleanName}" (${cleanEmail}) พร้อมสิทธิ์เข้าสู่ระบบเรียบร้อยแล้ว`
            : `อัปเดตข้อมูลและสิทธิ์ของ "${cleanName}" เรียบร้อยแล้ว`,
      });
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code)
          : '';
      if (code === 'auth/operation-not-allowed') {
        setErrorMsg(
          'ยังไม่ได้เปิดใช้งานผู้ให้บริการ Email/Password ใน Firebase Console > Authentication > Sign-in method กรุณาเปิดใช้งาน Email/Password ก่อนสร้างบัญชีพนักงานด้วยอีเมล',
        );
      } else if (code === 'auth/email-already-in-use') {
        setErrorMsg(
          'อีเมลนี้มีบัญชีอยู่ใน Firebase Authentication แล้ว กรุณาใช้อีเมลอื่นสำหรับบัญชีพนักงานนี้',
        );
      } else if (code === 'auth/weak-password') {
        setErrorMsg('รหัสผ่านสั้นเกินไป กรุณาตั้งอย่างน้อย 6 ตัวอักษร');
      } else if (code === 'auth/invalid-email') {
        setErrorMsg('รูปแบบอีเมลไม่ถูกต้อง');
      } else {
        try {
          handleFirestoreError(error, OperationType.WRITE, 'users');
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบันทึกข้อมูลพนักงานได้');
        }
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">พนักงานทั้งหมด</div>
          <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">
            {kpiSummary.total.toLocaleString('en-US')} คน
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">ใช้งานปกติ</div>
          <div className="text-xl font-bold text-green-700 mt-1 tabular-nums">
            {kpiSummary.active.toLocaleString('en-US')} คน
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">ถูกระงับสิทธิ์</div>
          <div className="text-xl font-bold text-red-600 mt-1 tabular-nums">
            {kpiSummary.suspended.toLocaleString('en-US')} คน
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">บทบาทที่มีผู้ใช้งาน</div>
          <div className="text-xl font-bold text-blue-700 mt-1 tabular-nums">
            {kpiSummary.activeRolesCount} / 7 บทบาท
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${
            feedback.type === 'ok'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'ok' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-current opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Tabs */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setActiveTab('staff')}
            className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'staff'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            รายชื่อพนักงาน ({staffList.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('roles')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'roles'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            สิทธิ์ 7 บทบาท (RBAC)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            ประวัติการใช้งาน (Audit Log)
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'staff' && (
            <>
              <div className="relative flex-1 sm:w-56">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ค้นหาชื่อ เบอร์โทร อีเมล..."
                  className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRole)}
                className="px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg"
              >
                <option value="all">ทุกบทบาท</option>
                {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'suspended')}
                className="px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg"
              >
                <option value="all">ทุกสถานะ</option>
                <option value="active">ใช้งานปกติ</option>
                <option value="suspended">ระงับสิทธิ์</option>
              </select>
            </>
          )}
          {canCreate && activeTab === 'staff' && (
            <button
              type="button"
              onClick={openCreateStaffModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              เพิ่มพนักงาน
            </button>
          )}
        </div>
      </div>

      {/* Staff List Tab */}
      {activeTab === 'staff' && (
        <>
          <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">ชื่อพนักงาน</th>
                  <th className="py-3 px-4">บทบาท (Role)</th>
                  <th className="py-3 px-4">จำนวนสิทธิ์โมดูล</th>
                  <th className="py-3 px-4">สถานะ</th>
                  <th className="py-3 px-4">อัปเดตล่าสุด</th>
                  <th className="py-3 px-4 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredStaff.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                      ไม่พบข้อมูลพนักงานตามเงื่อนไขที่เลือก
                    </td>
                  </tr>
                )}
                {filteredStaff.map((staff) => {
                  const grantedModulesCount = Object.values(staff.permissions ?? {}).filter(
                    (acts) => Array.isArray(acts) && acts.length > 0,
                  ).length;
                  const canModifyTarget =
                    canEdit &&
                    (isTopAdmin || (staff.role !== 'super_admin' && staff.role !== 'owner'));
                  return (
                    <tr key={staff.uid} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">
                          {staff.name}
                          {staff.employeeId && (
                            <span className="ml-2 text-xs font-mono text-slate-500">
                              [{staff.employeeId}]
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {staff.phone || '-'} {staff.email ? `· ${staff.email}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-blue-700">
                        {ROLE_LABELS[staff.role]}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 tabular-nums">
                        {grantedModulesCount} / {MENU_ITEMS.length} โมดูล
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <span
                          className={
                            staff.status === 'active'
                              ? 'text-green-700 font-medium'
                              : 'text-red-600 font-medium'
                          }
                        >
                          {staff.status === 'active' ? 'ใช้งานปกติ' : 'ระงับสิทธิ์'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 tabular-nums">
                        {formatDateTimeVientiane(staff.lastLoginAt)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {canModifyTarget && (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditStaffModal(staff)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                              title="แก้ไขบทบาทและสิทธิ์"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleStaffStatus(staff)}
                              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                                staff.status === 'active'
                                  ? 'text-slate-500 hover:text-red-600 hover:bg-red-50'
                                  : 'text-slate-500 hover:text-green-700 hover:bg-green-50'
                              }`}
                              title={staff.status === 'active' ? 'ระงับสิทธิ์' : 'เปิดใช้งาน'}
                            >
                              <Power className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {filteredStaff.map((staff) => {
              const canModifyTarget =
                canEdit &&
                (isTopAdmin || (staff.role !== 'super_admin' && staff.role !== 'owner'));
              return (
                <div key={staff.uid} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {staff.name}
                        {staff.employeeId ? ` (${staff.employeeId})` : ''}
                      </div>
                      <div className="text-xs text-slate-500">
                        {staff.phone || '-'} {staff.email ? `· ${staff.email}` : ''}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        staff.status === 'active' ? 'text-green-700' : 'text-red-600'
                      }`}
                    >
                      {staff.status === 'active' ? 'ใช้งานปกติ' : 'ระงับสิทธิ์'}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-blue-700">{ROLE_LABELS[staff.role]}</div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
                    <span className="tabular-nums">{formatDateTimeVientiane(staff.lastLoginAt)}</span>
                    {canModifyTarget && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditStaffModal(staff)}
                          className="px-2.5 py-1 text-slate-700 border border-slate-200 rounded-md cursor-pointer"
                        >
                          แก้ไขสิทธิ์
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStaffStatus(staff)}
                          className="px-2.5 py-1 text-slate-700 border border-slate-200 rounded-md cursor-pointer"
                        >
                          {staff.status === 'active' ? 'ระงับ' : 'เปิดใช้'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Roles & Default Permissions Overview Tab */}
      {activeTab === 'roles' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="py-3 px-4 sticky left-0 bg-slate-50 min-w-[180px]">โมดูลในระบบ</th>
                {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
                  <th key={role} className="py-3 px-3 min-w-[130px]">
                    {ROLE_LABELS[role].split(' (')[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MENU_ITEMS.map((item) => (
                <tr key={item.key} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 font-medium text-slate-900 sticky left-0 bg-white">
                    {item.label}
                  </td>
                  {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => {
                    const acts = DEFAULT_ROLE_PERMISSIONS[role]?.[item.key] ?? [];
                    return (
                      <td key={role} className="py-2.5 px-3 text-slate-600">
                        {acts.length === 0 ? (
                          <span className="text-slate-300">-</span>
                        ) : acts.length === ALL_ACTIONS.length ? (
                          <span className="font-semibold text-blue-700">ทั้งหมด (7)</span>
                        ) : (
                          <span>{acts.map((a) => ACTION_LABELS[a]).join(', ')}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Audit Log Tab */}
      {activeTab === 'audit' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="ค้นหา Action ผู้ดำเนินการ หรือรหัสเอกสาร..."
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>
            <select
              value={auditEntityFilter}
              onChange={(e) => setAuditEntityFilter(e.target.value)}
              className="px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg"
            >
              <option value="all">ทุกประเภทข้อมูล</option>
              {auditEntities.map((ent) => (
                <option key={ent} value={ent}>
                  {ent}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="divide-y divide-slate-100">
              {filteredAuditLogs.map((log) => (
                <div key={log.auditId} className="p-4 text-xs space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-slate-900">
                      {log.action} · <span className="text-blue-700">{log.entityType}</span>{' '}
                      <span className="font-mono text-slate-400 font-normal">({log.entityId})</span>
                    </div>
                    <div className="text-slate-500 tabular-nums">
                      {formatDateTimeVientiane(log.createdAt)}
                    </div>
                  </div>
                  <div className="text-slate-600">
                    ผู้ดำเนินการ: {log.userNameSnapshot} ({log.userRoleSnapshot}) · {log.deviceInfo}
                  </div>
                  {(log.before || log.after) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                      {log.before && (
                        <div className="p-2 bg-slate-50 border border-slate-200 rounded text-slate-600 overflow-x-auto">
                          เดิม: {JSON.stringify(log.before)}
                        </div>
                      )}
                      {log.after && (
                        <div className="p-2 bg-blue-50/50 border border-blue-100 rounded text-slate-800 overflow-x-auto">
                          ใหม่: {JSON.stringify(log.after)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {filteredAuditLogs.length === 0 && (
                <div className="p-8 text-center text-sm text-slate-500">
                  ไม่พบประวัติการใช้งานตามเงื่อนไขที่ค้นหา
                </div>
              )}
            </div>
          </div>

          {auditLogs.length >= auditLimit && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setAuditLimit((prev) => prev + 50)}
                className="px-4 py-2 text-xs font-medium text-blue-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                โหลดประวัติเพิ่มเติม
              </button>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Staff Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-xl p-6 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-semibold text-slate-900">
                  {modalMode === 'create_staff'
                    ? 'เพิ่มพนักงานใหม่'
                    : 'แก้ไขข้อมูลและสิทธิ์พนักงาน'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveStaff} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ชื่อ-นามสกุล *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    รหัสพนักงาน (Employee ID)
                  </label>
                  <input
                    type="text"
                    maxLength={30}
                    value={formEmployeeId}
                    onChange={(e) => setFormEmployeeId(e.target.value)}
                    placeholder="เช่น EMP-001"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    เบอร์โทรศัพท์
                  </label>
                  <input
                    type="text"
                    maxLength={30}
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    อีเมลสำหรับเข้าสู่ระบบ {modalMode === 'create_staff' ? '*' : ''}
                  </label>
                  <input
                    type="email"
                    required={modalMode === 'create_staff'}
                    readOnly={modalMode === 'edit_staff' && Boolean(editingStaff?.email)}
                    maxLength={160}
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="staff@store.com"
                    className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg ${
                      modalMode === 'edit_staff' && editingStaff?.email
                        ? 'bg-slate-50 text-slate-500'
                        : ''
                    }`}
                  />
                </div>
                {modalMode === 'create_staff' && (
                  <div className="sm:col-span-2 space-y-2">
                    <label className="block text-xs font-medium text-slate-700">
                      วิธีการเข้าสู่ระบบของพนักงาน
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setCreateAuthMode('google_link')}
                        className={`px-3 py-2 text-xs font-medium rounded-lg border text-left cursor-pointer transition-colors ${
                          createAuthMode === 'google_link'
                            ? 'bg-blue-50 border-blue-600 text-blue-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        บัญชี Google (แนะนำ — ผูกตามอีเมลอัตโนมัติ)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCreateAuthMode('email_password')}
                        className={`px-3 py-2 text-xs font-medium rounded-lg border text-left cursor-pointer transition-colors ${
                          createAuthMode === 'email_password'
                            ? 'bg-blue-50 border-blue-600 text-blue-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        อีเมลและรหัสผ่าน (ต้องเปิดใน Console)
                      </button>
                    </div>

                    {createAuthMode === 'email_password' ? (
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1 mt-1">
                          รหัสผ่านเริ่มต้นสำหรับเข้าสู่ระบบ * (อย่างน้อย 6 ตัวอักษร)
                        </label>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            minLength={6}
                            value={formPassword}
                            onChange={(e) => setFormPassword(e.target.value)}
                            placeholder="กำหนดรหัสผ่านให้พนักงาน"
                            className="w-full px-3 pr-10 py-2 text-sm border border-slate-200 rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            {showPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          ระบบจะสร้างบัญชี Firebase Authentication แยกสำหรับพนักงานโดยไม่ทำให้ผู้ดูแลระบบหลุดออกจากเซสชันปัจจุบัน และจะไม่บันทึกรหัสผ่านลงในฐานข้อมูล
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        เมื่อพนักงานเข้าสู่ระบบด้วยบัญชี Google ที่ใช้อีเมลเดียวกัน ระบบจะผูก Firebase UID จริงเข้ากับบทบาทและสิทธิ์ที่กำหนดไว้ให้โดยอัตโนมัติ
                      </p>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    บทบาท (Role) *
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => handleRoleSelect(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {assignableRoles.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">สถานะบัญชี</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as 'active' | 'suspended')}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="active">ใช้งานปกติ</option>
                    <option value="suspended">ระงับสิทธิ์</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPermissionMatrix((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline cursor-pointer"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    {showPermissionMatrix
                      ? 'ซ่อนตารางกำหนดสิทธิ์รายโมดูล'
                      : 'ปรับแต่งสิทธิ์รายโมดูล (7 ระดับ)'}
                  </button>
                  {showPermissionMatrix && (
                    <button
                      type="button"
                      onClick={() =>
                        setFormPermissions(structuredClone(DEFAULT_ROLE_PERMISSIONS[formRole]))
                      }
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-blue-600 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      รีเซ็ตสิทธิ์ตามค่าเริ่มต้นของบทบาท
                    </button>
                  )}
                </div>

                {showPermissionMatrix && (
                  <div className="mt-3 max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3 font-semibold text-slate-600">โมดูล</th>
                          {ALL_ACTIONS.map((act) => (
                            <th key={act} className="py-2 px-1.5 text-center font-medium text-slate-600">
                              {ACTION_LABELS[act]}
                            </th>
                          ))}
                          <th className="py-2 px-2 text-center font-medium text-slate-500">ทั้งหมด</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {MENU_ITEMS.map((item) => {
                          const currentActs = formPermissions[item.key] ?? [];
                          const hasAll = ALL_ACTIONS.every((a) => currentActs.includes(a));
                          return (
                            <tr key={item.key}>
                              <td className="py-1.5 px-3 font-medium text-slate-700">{item.label}</td>
                              {ALL_ACTIONS.map((act) => {
                                const checked = currentActs.includes(act);
                                return (
                                  <td key={act} className="py-1.5 px-1.5 text-center">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => togglePermission(item.key, act)}
                                      className="rounded border-slate-300 text-blue-600 cursor-pointer"
                                    />
                                  </td>
                                );
                              })}
                              <td className="py-1.5 px-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => toggleModuleAllActions(item.key)}
                                  className="text-[11px] font-medium text-blue-600 hover:underline cursor-pointer"
                                >
                                  {hasAll ? 'ล้าง' : 'เลือก'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {saving ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
