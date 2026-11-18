import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Edit2, Plus, Search, Truck, X } from 'lucide-react';
import { writeAuditLog } from '../../core/firebase/auditService';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { hasPermission } from '../../core/rbac/permissions';
import { generateSafeId } from '../../core/utils/id';
import { formatLak } from '../../core/utils/money';
import type { Supplier } from '../../core/firebase/types';

export function SuppliersPage() {
  const { userProfile, activeBranchId } = useFirebase();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchText, setSearchText] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [paymentTermDays, setPaymentTermDays] = useState('0');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [saving, setSaving] = useState(false);

  const canCreate = hasPermission(userProfile, 'suppliers', 'create');
  const canEdit = hasPermission(userProfile, 'suppliers', 'edit');

  useEffect(() => {
    if (!userProfile) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'suppliers'),
        where('organizationId', '==', userProfile.organizationId),
      ),
      (snap) => {
        setSuppliers(
          snap.docs
            .map((d) => d.data() as Supplier)
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'suppliers'),
    );
    return () => unsub();
  }, [userProfile]);

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q) ||
        s.contactName.toLowerCase().includes(q),
    );
  }, [suppliers, searchText]);

  const totalPayableLak = useMemo(
    () => suppliers.reduce((sum, s) => sum + (s.payableBalanceLak || 0), 0),
    [suppliers],
  );

  const openNewModal = () => {
    setEditingSupplier(null);
    setCode(`SUP-${String(suppliers.length + 1).padStart(3, '0')}`);
    setName('');
    setContactName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setPaymentTermDays('30');
    setNotes('');
    setStatus('active');
    setModalOpen(true);
  };

  const openEditModal = (sup: Supplier) => {
    setEditingSupplier(sup);
    setCode(sup.code);
    setName(sup.name);
    setContactName(sup.contactName);
    setPhone(sup.phone);
    setEmail(sup.email);
    setAddress(sup.address);
    setPaymentTermDays(String(sup.paymentTermDays));
    setNotes(sup.notes);
    setStatus(sup.status);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !name.trim()) return;
    setSaving(true);
    setFeedback(null);

    try {
      const payload = {
        code: code.trim().toUpperCase().slice(0, 30) || 'SUP',
        name: name.trim().slice(0, 140),
        contactName: contactName.trim().slice(0, 100),
        phone: phone.trim().slice(0, 30),
        email: email.trim().slice(0, 160),
        address: address.trim().slice(0, 300),
        paymentTermDays: Math.max(0, Math.round(Number(paymentTermDays) || 0)),
        notes: notes.trim().slice(0, 300),
        status,
      };

      if (editingSupplier) {
        await updateDoc(doc(db, 'suppliers', editingSupplier.supplierId), {
          ...payload,
          payableBalanceLak: editingSupplier.payableBalanceLak,
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog({
          user: userProfile,
          branchId: activeBranchId,
          action: 'UPDATE_SUPPLIER',
          entityType: 'suppliers',
          entityId: editingSupplier.supplierId,
          before: { name: editingSupplier.name, status: editingSupplier.status },
          after: payload,
        });
        setFeedback({ type: 'ok', text: `อัปเดตซัพพลายเออร์ "${payload.name}" เรียบร้อยแล้ว` });
      } else {
        const supplierId = generateSafeId('sup');
        await setDoc(doc(db, 'suppliers', supplierId), {
          supplierId,
          organizationId: userProfile.organizationId,
          ownerUid: userProfile.ownerUid,
          ...payload,
          payableBalanceLak: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog({
          user: userProfile,
          branchId: activeBranchId,
          action: 'CREATE_SUPPLIER',
          entityType: 'suppliers',
          entityId: supplierId,
          before: null,
          after: payload,
        });
        setFeedback({ type: 'ok', text: `เพิ่มซัพพลายเออร์ "${payload.name}" เรียบร้อยแล้ว` });
      }
      setModalOpen(false);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ไม่สามารถบันทึกข้อมูลซัพพลายเออร์ได้',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {feedback && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
            feedback.type === 'ok'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-current opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">ซัพพลายเออร์ที่ใช้งาน</div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {suppliers.filter((s) => s.status === 'active').length} ราย
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">จากทั้งหมด {suppliers.length} ราย</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">ยอดเจ้าหนี้ค้างจ่ายรวม (AP)</div>
          <div className="text-2xl font-bold text-amber-700 tabular-nums mt-1">
            {formatLak(totalPayableLak)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">อัปเดตอัตโนมัติจากใบสั่งซื้อและชำระหนี้</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">คู่ค้าที่มีเครดิตเทอม</div>
            <div className="text-xl font-bold text-blue-700 tabular-nums mt-1">
              {suppliers.filter((s) => s.paymentTermDays > 0).length} ราย
            </div>
          </div>
          <Truck className="w-7 h-7 text-blue-600 shrink-0" />
        </div>
      </div>

      {/* Filter & Add Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="ค้นหาชื่อคู่ค้า รหัส ผู้ติดต่อ หรือเบอร์โทร..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
          />
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={openNewModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-lg cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            เพิ่มซัพพลายเออร์
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">รหัส</th>
                <th className="py-3 px-4">ชื่อซัพพลายเออร์ / ที่อยู่</th>
                <th className="py-3 px-4">ผู้ติดต่อ / เบอร์โทร</th>
                <th className="py-3 px-4 text-right">เครดิตเทอม</th>
                <th className="py-3 px-4 text-right">ยอดค้างจ่าย</th>
                <th className="py-3 px-4">สถานะ</th>
                <th className="py-3 px-4 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.map((sup) => (
                <tr key={sup.supplierId} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono text-xs text-slate-600">{sup.code}</td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{sup.name}</div>
                    {sup.address && (
                      <div className="text-xs text-slate-500 truncate max-w-xs">{sup.address}</div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-700">
                    <div>{sup.contactName || '-'}</div>
                    <div className="text-slate-500 tabular-nums">{sup.phone || '-'}</div>
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-xs text-slate-700">
                    {sup.paymentTermDays > 0 ? `${sup.paymentTermDays} วัน` : 'เงินสด'}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold tabular-nums">
                    <span className={sup.payableBalanceLak > 0 ? 'text-amber-700' : 'text-slate-600'}>
                      {formatLak(sup.payableBalanceLak)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs">
                    <span
                      className={`font-semibold ${
                        sup.status === 'active' ? 'text-green-700' : 'text-slate-400'
                      }`}
                    >
                      {sup.status === 'active' ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openEditModal(sup)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        แก้ไข
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-xs text-slate-500">
                    ยังไม่มีข้อมูลซัพพลายเออร์ในระบบ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Supplier Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-semibold text-slate-900">
                {editingSupplier ? 'แก้ไขซัพพลายเออร์' : 'เพิ่มซัพพลายเออร์ใหม่'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">รหัส *</label>
                  <input
                    type="text"
                    required
                    maxLength={30}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ชื่อบริษัท / ซัพพลายเออร์ *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={140}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">ผู้ติดต่อ</label>
                  <input
                    type="text"
                    maxLength={100}
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">เบอร์โทรศัพท์</label>
                  <input
                    type="text"
                    maxLength={30}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">อีเมล</label>
                  <input
                    type="email"
                    maxLength={160}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    เครดิตเทอม (วัน)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={paymentTermDays}
                    onChange={(e) => setPaymentTermDays(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-right tabular-nums"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">ที่อยู่</label>
                <input
                  type="text"
                  maxLength={300}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">หมายเหตุ</label>
                  <input
                    type="text"
                    maxLength={300}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">สถานะ</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="active">ใช้งานอยู่</option>
                    <option value="inactive">ปิดใช้งาน</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  {saving ? 'กำลังบันทึก...' : 'บันทึกซัพพลายเออร์'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
