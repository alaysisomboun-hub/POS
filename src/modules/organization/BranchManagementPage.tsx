import React, { useMemo, useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Building2, Check, Edit3, Plus, Search, X } from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { appendAuditLogToBatch } from '../../core/firebase/auditService';
import { hasPermission } from '../../core/rbac/permissions';
import { formatDateVientiane } from '../../core/utils/date';
import { generateSafeId } from '../../core/utils/id';
import type { Branch } from '../../core/firebase/types';

export function BranchManagementPage() {
  const { userProfile, branches, activeBranchId, setActiveBranchId } = useFirebase();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  const [branchCode, setBranchCode] = useState('');
  const [branchName, setBranchName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canCreate = hasPermission(userProfile, 'branches', 'create');
  const canEdit = hasPermission(userProfile, 'branches', 'edit');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter(
      (b) =>
        b.branchName.toLowerCase().includes(q) ||
        b.branchCode.toLowerCase().includes(q) ||
        b.address.toLowerCase().includes(q),
    );
  }, [branches, search]);

  const openCreateModal = () => {
    setEditingBranch(null);
    setBranchCode('');
    setBranchName('');
    setAddress('');
    setPhone('');
    setStatus('active');
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEditModal = (branch: Branch) => {
    setEditingBranch(branch);
    setBranchCode(branch.branchCode);
    setBranchName(branch.branchName);
    setAddress(branch.address);
    setPhone(branch.phone);
    setStatus(branch.status);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    const cleanCode = branchCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!cleanCode || !branchName.trim()) {
      setErrorMsg('กรุณากรอกรหัสสาขา (A-Z, 0-9, -) และชื่อสาขาให้ครบถ้วน');
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      const batch = writeBatch(db);
      if (editingBranch) {
        const branchRef = doc(db, 'branches', editingBranch.branchId);
        const afterData = {
          branchCode: cleanCode.slice(0, 20),
          branchName: branchName.trim().slice(0, 120),
          address: address.trim().slice(0, 300),
          phone: phone.trim().slice(0, 30),
          managerId: editingBranch.managerId,
          assignedUids: editingBranch.assignedUids,
          isMainBranch: editingBranch.isMainBranch,
          status,
          updatedAt: serverTimestamp(),
        };
        batch.update(branchRef, afterData);
        appendAuditLogToBatch(batch, {
          user: userProfile,
          branchId: editingBranch.branchId,
          action: 'UPDATE_BRANCH',
          entityType: 'branches',
          entityId: editingBranch.branchId,
          before: {
            branchCode: editingBranch.branchCode,
            branchName: editingBranch.branchName,
            status: editingBranch.status,
          },
          after: {
            branchCode: afterData.branchCode,
            branchName: afterData.branchName,
            status: afterData.status,
          },
        });
      } else {
        const branchId = generateSafeId('br');
        const branchRef = doc(db, 'branches', branchId);
        const newBranch = {
          branchId,
          organizationId: userProfile.organizationId,
          ownerUid: userProfile.ownerUid,
          branchCode: cleanCode.slice(0, 20),
          branchName: branchName.trim().slice(0, 120),
          address: address.trim().slice(0, 300),
          phone: phone.trim().slice(0, 30),
          managerId: userProfile.uid,
          assignedUids: [userProfile.uid],
          isMainBranch: false,
          status,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        batch.set(branchRef, newBranch);
        appendAuditLogToBatch(batch, {
          user: userProfile,
          branchId,
          action: 'CREATE_BRANCH',
          entityType: 'branches',
          entityId: branchId,
          before: null,
          after: {
            branchCode: newBranch.branchCode,
            branchName: newBranch.branchName,
            status: newBranch.status,
          },
        });
      }

      await batch.commit();
      setModalOpen(false);
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, 'branches');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบันทึกข้อมูลสาขาได้');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">รายการสาขาทั้งหมด</h2>
          <p className="text-xs text-slate-500">
            จัดการสาขาในองค์กร แยกคลังสินค้าและสิทธิ์พนักงานตามสาขา
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อหรือรหัสสาขา..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              เพิ่มสาขา
            </button>
          )}
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="py-3 px-4">รหัสสาขา</th>
              <th className="py-3 px-4">ชื่อสาขา</th>
              <th className="py-3 px-4">เบอร์โทร / ที่อยู่</th>
              <th className="py-3 px-4">สถานะ</th>
              <th className="py-3 px-4">วันที่สร้าง</th>
              <th className="py-3 px-4 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filtered.map((branch) => {
              const isActiveContext = branch.branchId === activeBranchId;
              return (
                <tr key={branch.branchId} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900">
                    {branch.branchCode}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{branch.branchName}</div>
                    <div className="text-xs text-slate-500">
                      {branch.isMainBranch ? 'สาขาหลัก' : 'สาขาย่อย'}
                      {isActiveContext ? ' · กำลังใช้งาน' : ''}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate">
                    {branch.phone || '-'} · {branch.address || '-'}
                  </td>
                  <td className="py-3 px-4 text-xs">
                    <span
                      className={
                        branch.status === 'active'
                          ? 'text-green-700 font-medium'
                          : 'text-slate-500 font-medium'
                      }
                    >
                      {branch.status === 'active' ? 'เปิดใช้งาน' : 'ปิดชั่วคราว'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500 tabular-nums">
                    {formatDateVientiane(branch.createdAt)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      {!isActiveContext && branch.status === 'active' && (
                        <button
                          type="button"
                          onClick={() => setActiveBranchId(branch.branchId)}
                          className="px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                        >
                          สลับใช้งาน
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openEditModal(branch)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                          title="แก้ไขสาขา"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                  ไม่พบข้อมูลสาขา
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {filtered.map((branch) => {
          const isActiveContext = branch.branchId === activeBranchId;
          return (
            <div key={branch.branchId} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-mono font-semibold text-blue-600">
                    {branch.branchCode}
                  </div>
                  <div className="font-semibold text-slate-900">{branch.branchName}</div>
                </div>
                <span
                  className={`text-xs font-medium ${
                    branch.status === 'active' ? 'text-green-700' : 'text-slate-500'
                  }`}
                >
                  {branch.status === 'active' ? 'เปิดใช้งาน' : 'ปิดชั่วคราว'}
                </span>
              </div>
              <div className="text-xs text-slate-600">
                {branch.phone || '-'} · {branch.address || '-'}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                <span className="text-slate-500 tabular-nums">
                  สร้างเมื่อ {formatDateVientiane(branch.createdAt)}
                </span>
                <div className="flex items-center gap-2">
                  {!isActiveContext && branch.status === 'active' ? (
                    <button
                      type="button"
                      onClick={() => setActiveBranchId(branch.branchId)}
                      className="px-2.5 py-1 text-blue-600 font-medium hover:bg-blue-50 rounded-md"
                    >
                      สลับใช้งาน
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-blue-600 font-medium">
                      <Check className="w-3.5 h-3.5" /> ใช้งานอยู่
                    </span>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => openEditModal(branch)}
                      className="px-2.5 py-1 text-slate-700 border border-slate-200 rounded-md"
                    >
                      แก้ไข
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-semibold text-slate-900">
                  {editingBranch ? 'แก้ไขข้อมูลสาขา' : 'เพิ่มสาขาใหม่'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
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

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    รหัสสาขา (A-Z, 0-9, -) *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={20}
                    value={branchCode}
                    onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                    placeholder="เช่น BR-02"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">สถานะ</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="active">เปิดใช้งาน</option>
                    <option value="inactive">ปิดชั่วคราว</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">ชื่อสาขา *</label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">เบอร์โทรศัพท์</label>
                <input
                  type="text"
                  maxLength={30}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">ที่อยู่</label>
                <textarea
                  rows={2}
                  maxLength={300}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg cursor-pointer"
                >
                  {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
