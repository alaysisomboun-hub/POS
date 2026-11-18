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
import { Edit3, History, MailPlus, Search, Shield, UserPlus, X } from 'lucide-react';
import { db } from '../../core/firebase/config';
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
import { generateSafeId } from '../../core/utils/id';
import type {
  AuditLog,
  ModuleKey,
  PermissionAction,
  PermissionsMap,
  UserInvitation,
  UserProfile,
  UserRole,
} from '../../core/firebase/types';

type TabKey = 'staff' | 'invitations' | 'audit';

export function StaffManagementPage() {
  const { userProfile, branches } = useFirebase();
  const [activeTab, setActiveTab] = useState<TabKey>('staff');
  const [staffList, setStaffList] = useState<UserProfile[]>([]);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLimit, setAuditLimit] = useState(25);
  const [search, setSearch] = useState('');

  // Modal state for Invite or Edit Staff
  const [modalMode, setModalMode] = useState<'invite' | 'edit_staff' | null>(null);
  const [editingStaff, setEditingStaff] = useState<UserProfile | null>(null);
  const [formEmail, setFormEmail] = useState('');
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('cashier');
  const [formBranchIds, setFormBranchIds] = useState<string[]>([]);
  const [formStatus, setFormStatus] = useState<'active' | 'suspended'>('active');
  const [formPermissions, setFormPermissions] = useState<PermissionsMap>(
    DEFAULT_ROLE_PERMISSIONS.cashier,
  );
  const [showPermissionMatrix, setShowPermissionMatrix] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canCreate = hasPermission(userProfile, 'staff', 'create');
  const canEdit = hasPermission(userProfile, 'staff', 'edit');

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

    const invQ = query(
      collection(db, 'invitations'),
      where('organizationId', '==', orgId),
      orderBy('createdAt', 'desc'),
    );
    const unsubInv = onSnapshot(
      invQ,
      (snap) => {
        setInvitations(snap.docs.map((d) => d.data() as UserInvitation));
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'invitations'),
    );

    return () => {
      unsubUsers();
      unsubInv();
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

  const branchNameMap = useMemo(() => {
    const map = new Map<string, string>();
    branches.forEach((b) => map.set(b.branchId, `${b.branchCode} · ${b.branchName}`));
    return map;
  }, [branches]);

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staffList;
    return staffList.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        ROLE_LABELS[s.role].toLowerCase().includes(q),
    );
  }, [staffList, search]);

  const openInviteModal = () => {
    setEditingStaff(null);
    setFormEmail('');
    setFormName('');
    setFormPhone('');
    setFormRole('cashier');
    setFormBranchIds(branches.slice(0, 1).map((b) => b.branchId));
    setFormStatus('active');
    setFormPermissions(structuredClone(DEFAULT_ROLE_PERMISSIONS.cashier));
    setShowPermissionMatrix(false);
    setErrorMsg(null);
    setModalMode('invite');
  };

  const openEditStaffModal = (staff: UserProfile) => {
    setEditingStaff(staff);
    setFormEmail(staff.email);
    setFormName(staff.name);
    setFormPhone(staff.phone || '');
    setFormRole(staff.role);
    setFormBranchIds(staff.branchIds);
    setFormStatus(staff.status);
    setFormPermissions(
      structuredClone(staff.permissions || DEFAULT_ROLE_PERMISSIONS[staff.role]),
    );
    setShowPermissionMatrix(false);
    setErrorMsg(null);
    setModalMode('edit_staff');
  };

  const handleRoleSelect = (role: UserRole) => {
    setFormRole(role);
    setFormPermissions(structuredClone(DEFAULT_ROLE_PERMISSIONS[role]));
  };

  const toggleBranch = (branchId: string) => {
    setFormBranchIds((prev) =>
      prev.includes(branchId) ? prev.filter((id) => id !== branchId) : [...prev, branchId],
    );
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

  const handleSaveInviteOrStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    if (!formName.trim() || formBranchIds.length === 0) {
      setErrorMsg('กรุณากรอกชื่อพนักงานและเลือกอย่างน้อย 1 สาขา');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      const batch = writeBatch(db);

      if (modalMode === 'invite') {
        const cleanEmail = formEmail.trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@')) {
          setErrorMsg('กรุณากรอกอีเมล Google ที่ถูกต้อง');
          setSaving(false);
          return;
        }
        const invitationId = generateSafeId('inv');
        batch.set(doc(db, 'invitations', invitationId), {
          invitationId,
          organizationId: userProfile.organizationId,
          ownerUid: userProfile.ownerUid,
          email: cleanEmail.slice(0, 160),
          name: formName.trim().slice(0, 120),
          role: formRole,
          branchIds: formBranchIds,
          permissions: formPermissions,
          status: 'pending',
          invitedBy: userProfile.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        appendAuditLogToBatch(batch, {
          user: userProfile,
          branchId: formBranchIds[0] ?? null,
          action: 'CREATE_INVITATION',
          entityType: 'invitations',
          entityId: invitationId,
          before: null,
          after: { email: cleanEmail, role: formRole, branchIds: formBranchIds },
        });
      } else if (modalMode === 'edit_staff' && editingStaff) {
        batch.update(doc(db, 'users', editingStaff.uid), {
          name: formName.trim().slice(0, 120),
          phone: formPhone.trim().slice(0, 30),
          role: formRole,
          branchIds: formBranchIds,
          permissions: formPermissions,
          status: formStatus,
          lastLoginAt: serverTimestamp(),
        });

        appendAuditLogToBatch(batch, {
          user: userProfile,
          branchId: formBranchIds[0] ?? null,
          action: 'UPDATE_STAFF_PERMISSIONS',
          entityType: 'users',
          entityId: editingStaff.uid,
          before: {
            role: editingStaff.role,
            branchIds: editingStaff.branchIds,
            status: editingStaff.status,
          },
          after: {
            role: formRole,
            branchIds: formBranchIds,
            status: formStatus,
          },
        });
      }

      await batch.commit();
      setModalMode(null);
    } catch (error) {
      try {
        handleFirestoreError(
          error,
          OperationType.WRITE,
          modalMode === 'invite' ? 'invitations' : 'users',
        );
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบันทึกข้อมูลได้');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeInvitation = async (inv: UserInvitation) => {
    if (!userProfile) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'invitations', inv.invitationId), {
        status: 'revoked',
        updatedAt: serverTimestamp(),
      });
      appendAuditLogToBatch(batch, {
        user: userProfile,
        branchId: inv.branchIds[0] ?? null,
        action: 'REVOKE_INVITATION',
        entityType: 'invitations',
        entityId: inv.invitationId,
        before: { status: inv.status },
        after: { status: 'revoked' },
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `invitations/${inv.invitationId}`);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
            พนักงาน ({staffList.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('invitations')}
            className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'invitations'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            คำเชิญ ({invitations.filter((i) => i.status === 'pending').length})
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
            ประวัติการใช้งาน
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          {activeTab === 'staff' && (
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาชื่อ อีเมล บทบาท..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>
          )}
          {canCreate && (
            <button
              type="button"
              onClick={openInviteModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              เชิญพนักงาน
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
                  <th className="py-3 px-4">สาขาที่รับผิดชอบ</th>
                  <th className="py-3 px-4">สถานะ</th>
                  <th className="py-3 px-4">เข้าใช้งานล่าสุด</th>
                  <th className="py-3 px-4 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredStaff.map((staff) => (
                  <tr key={staff.uid} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{staff.name}</div>
                      <div className="text-xs text-slate-500">
                        {staff.email} {staff.phone ? `· ${staff.phone}` : ''}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-blue-700">
                      {ROLE_LABELS[staff.role]}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {staff.branchIds.map((id) => branchNameMap.get(id) ?? id).join(', ') || '-'}
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
                      {canEdit && staff.uid !== userProfile?.ownerUid && (
                        <button
                          type="button"
                          onClick={() => openEditStaffModal(staff)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                          title="แก้ไขบทบาทและสิทธิ์"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {filteredStaff.map((staff) => (
              <div key={staff.uid} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900">{staff.name}</div>
                    <div className="text-xs text-slate-500">{staff.email}</div>
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
                  {canEdit && staff.uid !== userProfile?.ownerUid && (
                    <button
                      type="button"
                      onClick={() => openEditStaffModal(staff)}
                      className="px-2.5 py-1 text-slate-700 border border-slate-200 rounded-md"
                    >
                      แก้ไขสิทธิ์
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Invitations Tab */}
      {activeTab === 'invitations' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="divide-y divide-slate-100">
            {invitations.map((inv) => (
              <div
                key={inv.invitationId}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="font-medium text-sm text-slate-900">
                    {inv.name} · <span className="text-slate-600">{inv.email}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {ROLE_LABELS[inv.role]} · สถานะ:{' '}
                    <span
                      className={
                        inv.status === 'pending'
                          ? 'text-amber-700 font-medium'
                          : inv.status === 'accepted'
                            ? 'text-green-700 font-medium'
                            : 'text-slate-500'
                      }
                    >
                      {inv.status === 'pending'
                        ? 'รอพนักงานเข้าสู่ระบบด้วย Google'
                        : inv.status === 'accepted'
                          ? 'ตอบรับแล้ว'
                          : 'ยกเลิกแล้ว'}
                    </span>
                  </div>
                </div>
                {inv.status === 'pending' && canEdit && (
                  <button
                    type="button"
                    onClick={() => handleRevokeInvitation(inv)}
                    className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 self-start sm:self-center cursor-pointer"
                  >
                    ยกเลิกคำเชิญ
                  </button>
                )}
              </div>
            ))}
            {invitations.length === 0 && (
              <div className="p-8 text-center text-sm text-slate-500">
                ยังไม่มีประวัติคำเชิญพนักงาน กดปุ่ม &ldquo;เชิญพนักงาน&rdquo; เพื่อเพิ่มบัญชีใหม่
              </div>
            )}
          </div>
        </div>
      )}

      {/* Audit Log Tab */}
      {activeTab === 'audit' && (
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="divide-y divide-slate-100">
              {auditLogs.map((log) => (
                <div key={log.auditId} className="p-4 text-xs space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-slate-900">
                      {log.action} · <span className="text-blue-700">{log.entityType}</span>
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
              {auditLogs.length === 0 && (
                <div className="p-8 text-center text-sm text-slate-500">ยังไม่มีประวัติการใช้งาน</div>
              )}
            </div>
          </div>

          {auditLogs.length >= auditLimit && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setAuditLimit((prev) => prev + 25)}
                className="px-4 py-2 text-xs font-medium text-blue-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                โหลดประวัติเพิ่มเติม
              </button>
            </div>
          )}
        </div>
      )}

      {/* Invite / Edit Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl p-6 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <MailPlus className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-semibold text-slate-900">
                  {modalMode === 'invite'
                    ? 'เชิญพนักงานเข้าใช้งานระบบ'
                    : 'แก้ไขบทบาทและสิทธิ์พนักงาน'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveInviteOrStaff} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    อีเมล Google ของพนักงาน *
                  </label>
                  <input
                    type="email"
                    required
                    disabled={modalMode === 'edit_staff'}
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="staff@gmail.com"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
                  />
                </div>
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
                    บทบาท (Role) *
                  </label>
                  <select
                    value={formRole}
                    onChange={(e) => handleRoleSelect(e.target.value as UserRole)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {(Object.keys(ROLE_LABELS) as UserRole[])
                      .filter((r) => r !== 'super_admin' || userProfile?.role === 'super_admin')
                      .map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                  </select>
                </div>
                {modalMode === 'edit_staff' ? (
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
                ) : (
                  <div className="text-xs text-slate-500 flex items-end pb-2">
                    พนักงานจะเข้าสู่ระบบด้วยอีเมล Google นี้เพื่อรับสิทธิ์อัตโนมัติ
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  สาขาที่อนุญาตให้เข้าถึง *
                </label>
                <div className="flex flex-wrap gap-2">
                  {branches.map((b) => {
                    const checked = formBranchIds.includes(b.branchId);
                    return (
                      <label
                        key={b.branchId}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs border rounded-lg cursor-pointer ${
                          checked
                            ? 'bg-blue-50 border-blue-200 text-blue-800 font-medium'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBranch(b.branchId)}
                          className="rounded border-slate-300 text-blue-600"
                        />
                        {b.branchCode} · {b.branchName}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowPermissionMatrix((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:underline cursor-pointer"
                >
                  <Shield className="w-3.5 h-3.5" />
                  {showPermissionMatrix
                    ? 'ซ่อนตารางกำหนดสิทธิ์รายโมดูล'
                    : 'ปรับแต่งสิทธิ์รายโมดูล (View / Create / Edit / Delete / Approve / Export / Manage)'}
                </button>

                {showPermissionMatrix && (
                  <div className="mt-3 max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3 font-semibold text-slate-600">โมดูล</th>
                          {ALL_ACTIONS.map((act) => (
                            <th key={act} className="py-2 px-1.5 text-center font-medium text-slate-600">
                              {ACTION_LABELS[act]}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {MENU_ITEMS.map((item) => (
                          <tr key={item.key}>
                            <td className="py-1.5 px-3 font-medium text-slate-700">{item.label}</td>
                            {ALL_ACTIONS.map((act) => {
                              const checked = (formPermissions[item.key] ?? []).includes(act);
                              return (
                                <td key={act} className="py-1.5 px-1.5 text-center">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => togglePermission(item.key, act)}
                                    className="rounded border-slate-300 text-blue-600"
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
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
