import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Edit2, Eye, Plus, Search, Users, X } from 'lucide-react';
import { writeAuditLog } from '../../core/firebase/auditService';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { hasPermission } from '../../core/rbac/permissions';
import { formatDateTimeVientiane } from '../../core/utils/date';
import { generateSafeId } from '../../core/utils/id';
import { formatLak } from '../../core/utils/money';
import type { Customer, MembershipTier, SaleOrder } from '../../core/firebase/types';

export function CustomersPage() {
  const { userProfile, activeBranchId } = useFirebase();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tiers, setTiers] = useState<MembershipTier[]>([]);
  const [sales, setSales] = useState<SaleOrder[]>([]);
  const [searchText, setSearchText] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Add/Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [tierId, setTierId] = useState('');
  const [pointsBalance, setPointsBalance] = useState('0');
  const [creditLimitLak, setCreditLimitLak] = useState('0');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [saving, setSaving] = useState(false);

  // History Modal
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);

  const canCreate = hasPermission(userProfile, 'customers', 'create');
  const canEdit = hasPermission(userProfile, 'customers', 'edit');

  useEffect(() => {
    if (!userProfile) return;
    const orgId = userProfile.organizationId;

    const unsubCust = onSnapshot(
      query(
        collection(db, 'customers'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
      ),
      (snap) => {
        setCustomers(
          snap.docs
            .map((d) => d.data() as Customer)
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'customers'),
    );

    const unsubTiers = onSnapshot(
      query(collection(db, 'membershipTiers'), where('organizationId', '==', orgId)),
      (snap) => {
        setTiers(
          snap.docs.map((d) => d.data() as MembershipTier).filter((t) => t.status === 'active'),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'membershipTiers'),
    );

    const unsubSales = onSnapshot(
      query(
        collection(db, 'sales'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
        orderBy('createdAt', 'desc'),
      ),
      (snap) => setSales(snap.docs.map((d) => d.data() as SaleOrder)),
      (err) => handleFirestoreError(err, OperationType.LIST, 'sales'),
    );

    return () => {
      unsubCust();
      unsubTiers();
      unsubSales();
    };
  }, [userProfile, activeBranchId]);

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q),
    );
  }, [customers, searchText]);

  const totalCreditBalance = useMemo(
    () => customers.reduce((s, c) => s + c.creditBalanceLak, 0),
    [customers],
  );

  const openNewModal = () => {
    setEditingCustomer(null);
    setCode(`CUS-${String(customers.length + 1).padStart(4, '0')}`);
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setTierId('');
    setPointsBalance('0');
    setCreditLimitLak('0');
    setNotes('');
    setStatus('active');
    setModalOpen(true);
  };

  const openEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setCode(c.code);
    setName(c.name);
    setPhone(c.phone);
    setEmail(c.email);
    setAddress(c.address);
    setTierId(c.tierId ?? '');
    setPointsBalance(String(c.pointsBalance));
    setCreditLimitLak(String(c.creditLimitLak));
    setNotes(c.notes);
    setStatus(c.status);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !name.trim()) return;
    setSaving(true);
    setFeedback(null);

    try {
      const selectedTier = tiers.find((t) => t.tierId === tierId) ?? null;
      const payload = {
        code: code.trim().toUpperCase().slice(0, 30) || 'CUS',
        name: name.trim().slice(0, 120),
        phone: phone.trim().slice(0, 30),
        email: email.trim().slice(0, 160),
        address: address.trim().slice(0, 300),
        tierId: selectedTier ? selectedTier.tierId : null,
        tierName: selectedTier ? selectedTier.name.slice(0, 80) : '',
        pointsBalance: Math.max(0, Math.round(Number(pointsBalance) || 0)),
        creditLimitLak: Math.max(0, Math.round(Number(creditLimitLak) || 0)),
        notes: notes.trim().slice(0, 300),
        status,
      };

      if (editingCustomer) {
        await updateDoc(doc(db, 'customers', editingCustomer.customerId), {
          ...payload,
          creditBalanceLak: editingCustomer.creditBalanceLak,
          totalSpentLak: editingCustomer.totalSpentLak,
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog({
          user: userProfile,
          branchId: activeBranchId,
          action: 'UPDATE_CUSTOMER',
          entityType: 'customers',
          entityId: editingCustomer.customerId,
          before: { name: editingCustomer.name, creditLimitLak: editingCustomer.creditLimitLak },
          after: payload,
        });
        setFeedback({ type: 'ok', text: `ອັບເດດຂໍ້ມູນລູກຄ້າ "${payload.name}" ແລ້ວ` });
      } else {
        const customerId = generateSafeId('cus');
        await setDoc(doc(db, 'customers', customerId), {
          customerId,
          organizationId: userProfile.organizationId,
          branchId: activeBranchId,
          ownerUid: userProfile.ownerUid,
          ...payload,
          creditBalanceLak: 0,
          totalSpentLak: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog({
          user: userProfile,
          branchId: activeBranchId,
          action: 'CREATE_CUSTOMER',
          entityType: 'customers',
          entityId: customerId,
          before: null,
          after: payload,
        });
        setFeedback({ type: 'ok', text: `ເພີ່ມລູກຄ້າ "${payload.name}" ຮຽບຮ້ອຍແລ້ວ` });
      }
      setModalOpen(false);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ບໍ່ສາມາດບັນທຶກຂໍ້ມູນລູກຄ້າໄດ້',
      });
    } finally {
      setSaving(false);
    }
  };

  const customerSales = useMemo(() => {
    if (!viewingCustomer) return [];
    return sales.filter((s) => s.customerId === viewingCustomer.customerId);
  }, [viewingCustomer, sales]);

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

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">ລູກຄ້າໃນຖານຂໍ້ມູນ</div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {customers.filter((c) => c.status === 'active').length} ລາຍ
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">ຍອດລູກໜີ້ຄ້າງຮັບ (AR)</div>
          <div className="text-2xl font-bold text-amber-700 tabular-nums mt-1">
            {formatLak(totalCreditBalance)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">ຄະແນນສະສົມສະມາຊິກລວມ</div>
            <div className="text-xl font-bold text-blue-700 tabular-nums mt-1">
              {customers.reduce((s, c) => s + c.pointsBalance, 0).toLocaleString('en-US')} ແຕ້ມ
            </div>
          </div>
          <Users className="w-7 h-7 text-blue-600 shrink-0" />
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="ຄົ້ນຫາຊື່ລູກຄ້າ ລະຫັດ ຫຼື ເບີໂທລະສັບ..."
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
            ເພີ່ມລູກຄ້າໃໝ່
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">ລະຫັດ</th>
                <th className="py-3 px-4">ຊື່ລູກຄ້າ / ເບີໂທ</th>
                <th className="py-3 px-4">ລະດັບສະມາຊິກ</th>
                <th className="py-3 px-4 text-right">ແຕ້ມສະສົມ</th>
                <th className="py-3 px-4 text-right">ຍອດຊື້ສະສົມ</th>
                <th className="py-3 px-4 text-right">ໜີ້ຄ້າງ / ວົງເງິນ</th>
                <th className="py-3 px-4 text-right">ຈັດການ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.map((c) => (
                <tr key={c.customerId} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono text-xs text-slate-600">{c.code}</td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{c.name}</div>
                    <div className="text-xs text-slate-500 tabular-nums">{c.phone || '-'}</div>
                  </td>
                  <td className="py-3 px-4 text-xs text-blue-700 font-medium">
                    {c.tierName || 'ລູກຄ້າທົ່ວໄປ'}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums font-medium text-slate-800">
                    {c.pointsBalance.toLocaleString('en-US')}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-slate-700">
                    {formatLak(c.totalSpentLak)}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-xs">
                    <div
                      className={`font-bold ${
                        c.creditBalanceLak > 0 ? 'text-amber-700' : 'text-slate-700'
                      }`}
                    >
                      {formatLak(c.creditBalanceLak)}
                    </div>
                    <div className="text-slate-400">
                      ວົງເງິນ: {c.creditLimitLak > 0 ? formatLak(c.creditLimitLak) : 'ບໍ່ຈຳກັດ'}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setViewingCustomer(c)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        ປະຫວັດ
                      </button>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openEditModal(c)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          ແກ້ໄຂ
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-xs text-slate-500">
                    ຍັງບໍ່ມີຂໍ້ມູນລູກຄ້າໃນລະບົບ
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-semibold text-slate-900">
                {editingCustomer ? 'ແກ້ໄຂຂໍ້ມູນລູກຄ້າ' : 'ເພີ່ມລູກຄ້າໃໝ່'}
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
                  <label className="block text-xs font-medium text-slate-700 mb-1">ລະຫັດລູກຄ້າ *</label>
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
                    ຊື່ລູກຄ້າ / ຮ້ານຄ້າ *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">ເບີໂທລະສັບ</label>
                  <input
                    type="text"
                    maxLength={30}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">ລະດັບສະມາຊິກ</label>
                  <select
                    value={tierId}
                    onChange={(e) => setTierId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="">ລູກຄ້າທົ່ວໄປ</option>
                    {tiers.map((t) => (
                      <option key={t.tierId} value={t.tierId}>
                        {t.name} (ຫຼຸດ {t.discountPercent}%)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ວົງເງິນເຄຣດິດສູງສຸດ (₭, 0 = ບໍ່ຈຳກັດ)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={creditLimitLak}
                    onChange={(e) => setCreditLimitLak(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-right tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ຄະແນນສະສົມປັດຈຸບັນ
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={pointsBalance}
                    onChange={(e) => setPointsBalance(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-right tabular-nums"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">ອີເມວ</label>
                  <input
                    type="email"
                    maxLength={160}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">ສະຖານະ</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="active">ໃຊ້ງານຢູ່</option>
                    <option value="inactive">ປິດໃຊ້ງານ</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">ທີ່ຢູ່</label>
                <input
                  type="text"
                  maxLength={300}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">ໝາຍເຫດ</label>
                <input
                  type="text"
                  maxLength={300}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg cursor-pointer"
                >
                  ຍົກເລີກ
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  {saving ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກລູກຄ້າ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer History Modal */}
      {viewingCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  ປະຫວັດການຊື້: {viewingCustomer.name}
                </h3>
                <p className="text-xs text-slate-500 tabular-nums">
                  ຍອດຊື້ສະສົມ {formatLak(viewingCustomer.totalSpentLak)} · ຄົງຄ້າງ{' '}
                  {formatLak(viewingCustomer.creditBalanceLak)} · ແຕ້ມ{' '}
                  {viewingCustomer.pointsBalance.toLocaleString('en-US')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingCustomer(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto text-xs">
              {customerSales.map((s) => (
                <div key={s.saleId} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-mono font-bold text-blue-700">{s.invoiceNumber}</div>
                    <div className="text-slate-500 tabular-nums">
                      {formatDateTimeVientiane(s.createdAt)} · {s.items.length} ລາຍການ
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="font-bold text-slate-900">{formatLak(s.grandTotalLak)}</div>
                    {s.creditDueLak > 0 && (
                      <div className="text-amber-700">ຄ້າງຊຳລະ {formatLak(s.creditDueLak)}</div>
                    )}
                  </div>
                </div>
              ))}
              {customerSales.length === 0 && (
                <div className="py-10 text-center text-slate-500">
                  ຍັງບໍ່ມີປະຫວັດການຊື້ໃນນາມລູກຄ້າລາຍນີ້
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
