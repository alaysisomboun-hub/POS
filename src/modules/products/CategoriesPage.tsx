import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Edit3, FolderPlus, FolderTree, Search, X } from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { appendAuditLogToBatch } from '../../core/firebase/auditService';
import { hasPermission } from '../../core/rbac/permissions';
import { generateSafeId } from '../../core/utils/id';
import type { Category, Product } from '../../core/firebase/types';

export function CategoriesPage() {
  const { userProfile, activeBranchId } = useFirebase();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState('10');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canCreate = hasPermission(userProfile, 'categories', 'create');
  const canEdit = hasPermission(userProfile, 'categories', 'edit');

  useEffect(() => {
    if (!userProfile) return;
    const orgId = userProfile.organizationId;

    const catQ = query(collection(db, 'categories'), where('organizationId', '==', orgId));
    const unsubCats = onSnapshot(
      catQ,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Category)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
        setCategories(list);
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'categories'),
    );

    const prodQ = query(collection(db, 'products'), where('organizationId', '==', orgId));
    const unsubProds = onSnapshot(
      prodQ,
      (snap) => {
        setProducts(snap.docs.map((d) => d.data() as Product));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'products'),
    );

    return () => {
      unsubCats();
      unsubProds();
    };
  }, [userProfile]);

  const productCountByCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products) {
      if (p.categoryId) {
        map.set(p.categoryId, (map.get(p.categoryId) ?? 0) + 1);
      }
      if (p.subCategoryId) {
        map.set(p.subCategoryId, (map.get(p.subCategoryId) ?? 0) + 1);
      }
    }
    return map;
  }, [products]);

  const mainCategories = useMemo(
    () => categories.filter((c) => !c.parentId),
    [categories],
  );

  const categoryNameMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.categoryId, c.name));
    return map;
  }, [categories]);

  const orderedRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchesStatus = (c: Category) => statusFilter === 'all' || c.status === statusFilter;
    const matchesSearch = (c: Category) =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q);

    // Group main categories followed by their subcategories
    const result: Category[] = [];
    const mains = categories.filter((c) => !c.parentId);
    const childrenByParent = new Map<string, Category[]>();

    for (const c of categories) {
      if (c.parentId) {
        const arr = childrenByParent.get(c.parentId) ?? [];
        arr.push(c);
        childrenByParent.set(c.parentId, arr);
      }
    }

    for (const m of mains) {
      const subs = (childrenByParent.get(m.categoryId) ?? []).filter(
        (s) => matchesStatus(s) && matchesSearch(s),
      );
      if ((matchesStatus(m) && matchesSearch(m)) || subs.length > 0) {
        result.push(m);
        result.push(...subs);
      }
    }

    // Orphans (in case parent was filtered out)
    for (const c of categories) {
      if (c.parentId && !result.some((r) => r.categoryId === c.categoryId)) {
        if (matchesStatus(c) && matchesSearch(c)) result.push(c);
      }
    }

    return result;
  }, [categories, search, statusFilter]);

  const openCreateModal = (defaultParentId = '') => {
    setEditingCat(null);
    setName('');
    setParentId(defaultParentId);
    setDescription('');
    setSortOrder(String((categories.length + 1) * 10));
    setStatus('active');
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEditModal = (cat: Category) => {
    setEditingCat(cat);
    setName(cat.name);
    setParentId(cat.parentId ?? '');
    setDescription(cat.description || '');
    setSortOrder(String(cat.sortOrder));
    setStatus(cat.status);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    const cleanName = name.trim();
    if (!cleanName) {
      setErrorMsg('กรุณากรอกชื่อหมวดหมู่สินค้า');
      return;
    }

    if (editingCat && parentId === editingCat.categoryId) {
      setErrorMsg('ไม่สามารถกำหนดหมวดหมู่ย่อยให้อยู่ภายใต้ตัวเองได้');
      return;
    }

    const cleanParent = parentId.trim() || null;
    const duplicateCat = categories.find(
      (c) =>
        c.categoryId !== editingCat?.categoryId &&
        c.name.trim().toLowerCase() === cleanName.toLowerCase() &&
        (c.parentId || null) === cleanParent,
    );
    if (duplicateCat) {
      setErrorMsg(`มีหมวดหมู่ "${cleanName}" อยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น`);
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    try {
      const batch = writeBatch(db);
      const parsedOrder = Math.max(0, Math.min(99999, Math.round(Number(sortOrder) || 0)));

      if (editingCat) {
        batch.update(doc(db, 'categories', editingCat.categoryId), {
          name: cleanName.slice(0, 100),
          parentId: cleanParent,
          description: description.trim().slice(0, 300),
          sortOrder: parsedOrder,
          status,
          updatedAt: serverTimestamp(),
        });

        appendAuditLogToBatch(batch, {
          user: userProfile,
          branchId: activeBranchId,
          action: 'UPDATE_CATEGORY',
          entityType: 'categories',
          entityId: editingCat.categoryId,
          before: { name: editingCat.name, parentId: editingCat.parentId, status: editingCat.status },
          after: { name: cleanName, parentId: cleanParent, status },
        });
      } else {
        const categoryId = generateSafeId('cat');
        batch.set(doc(db, 'categories', categoryId), {
          categoryId,
          organizationId: userProfile.organizationId,
          ownerUid: userProfile.ownerUid,
          name: cleanName.slice(0, 100),
          parentId: cleanParent,
          description: description.trim().slice(0, 300),
          sortOrder: parsedOrder,
          status,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        appendAuditLogToBatch(batch, {
          user: userProfile,
          branchId: activeBranchId,
          action: 'CREATE_CATEGORY',
          entityType: 'categories',
          entityId: categoryId,
          before: null,
          after: { name: cleanName, parentId: cleanParent, status },
        });
      }

      await batch.commit();
      setModalOpen(false);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.WRITE, 'categories');
      } catch (wrapped) {
        setErrorMsg(wrapped instanceof Error ? wrapped.message : 'ไม่สามารถบันทึกหมวดหมู่ได้');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อหมวดหมู่..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            {(['all', 'active', 'inactive'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  statusFilter === key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {key === 'all' ? 'ทั้งหมด' : key === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'}
              </button>
            ))}
          </div>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={() => openCreateModal('')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" />
            เพิ่มหมวดหมู่สินค้า
          </button>
        )}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="py-3 px-4">ชื่อหมวดหมู่</th>
              <th className="py-3 px-4">ระดับ</th>
              <th className="py-3 px-4">รายละเอียด</th>
              <th className="py-3 px-4 text-right">จำนวนสินค้า</th>
              <th className="py-3 px-4 text-right">ลำดับ</th>
              <th className="py-3 px-4">สถานะ</th>
              <th className="py-3 px-4 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {loading && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                  กำลังโหลดข้อมูลหมวดหมู่...
                </td>
              </tr>
            )}
            {!loading && orderedRows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  ยังไม่มีหมวดหมู่สินค้า กด &ldquo;เพิ่มหมวดหมู่สินค้า&rdquo; เพื่อเริ่มต้นจัดโครงสร้างสินค้า
                </td>
              </tr>
            )}
            {orderedRows.map((cat) => {
              const isSub = Boolean(cat.parentId);
              const count = productCountByCat.get(cat.categoryId) ?? 0;
              return (
                <tr key={cat.categoryId} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <div className={`flex items-center gap-2 ${isSub ? 'pl-6' : ''}`}>
                      <FolderTree
                        className={`w-4 h-4 shrink-0 ${
                          isSub ? 'text-slate-400' : 'text-blue-600'
                        }`}
                      />
                      <span className={isSub ? 'text-slate-700 font-medium' : 'text-slate-900 font-semibold'}>
                        {cat.name}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-500">
                    {isSub ? `หมวดหมู่ย่อย · ${categoryNameMap.get(cat.parentId || '') ?? '-'}` : 'หมวดหมู่หลัก'}
                  </td>
                  <td className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate">
                    {cat.description || '-'}
                  </td>
                  <td className="py-3 px-4 text-right text-xs font-medium text-slate-800 tabular-nums">
                    {count.toLocaleString('en-US')} รายการ
                  </td>
                  <td className="py-3 px-4 text-right text-xs text-slate-500 tabular-nums">
                    {cat.sortOrder}
                  </td>
                  <td className="py-3 px-4 text-xs">
                    <span className={cat.status === 'active' ? 'text-green-700 font-medium' : 'text-slate-400'}>
                      {cat.status === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1">
                      {!isSub && canCreate && (
                        <button
                          type="button"
                          onClick={() => openCreateModal(cat.categoryId)}
                          className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                          title="เพิ่มหมวดหมู่ย่อย"
                        >
                          + หมวดย่อย
                        </button>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openEditModal(cat)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-md cursor-pointer"
                          title="แก้ไข"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {!loading && orderedRows.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-sm text-slate-500">
            ยังไม่มีหมวดหมู่สินค้า
          </div>
        )}
        {orderedRows.map((cat) => {
          const isSub = Boolean(cat.parentId);
          const count = productCountByCat.get(cat.categoryId) ?? 0;
          return (
            <div
              key={cat.categoryId}
              className={`bg-white border border-slate-200 rounded-xl p-4 space-y-2 ${isSub ? 'ml-4' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900 text-sm">{cat.name}</div>
                  <div className="text-xs text-slate-500">
                    {isSub ? `ย่อยของ ${categoryNameMap.get(cat.parentId || '') ?? '-'}` : 'หมวดหมู่หลัก'} ·{' '}
                    {count} สินค้า
                  </div>
                </div>
                <span className={`text-xs font-medium ${cat.status === 'active' ? 'text-green-700' : 'text-slate-400'}`}>
                  {cat.status === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'}
                </span>
              </div>
              {cat.description && <p className="text-xs text-slate-600">{cat.description}</p>}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                {!isSub && canCreate && (
                  <button
                    type="button"
                    onClick={() => openCreateModal(cat.categoryId)}
                    className="px-2.5 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-md"
                  >
                    + หมวดย่อย
                  </button>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => openEditModal(cat)}
                    className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 rounded-md"
                  >
                    แก้ไข
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-semibold text-slate-900">
                {editingCat ? 'แก้ไขหมวดหมู่สินค้า' : 'เพิ่มหมวดหมู่สินค้า'}
              </h3>
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
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ชื่อหมวดหมู่ *
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น เครื่องดื่ม, ขนมขบเคี้ยว, ของใช้ในบ้าน"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  หมวดหมู่หลัก (Parent Category)
                </label>
                <select
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="">— เป็นหมวดหมู่หลัก —</option>
                  {mainCategories
                    .filter((c) => !editingCat || c.categoryId !== editingCat.categoryId)
                    .map((c) => (
                      <option key={c.categoryId} value={c.categoryId}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  รายละเอียดเพิ่มเติม
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">ลำดับแสดงผล</label>
                  <input
                    type="number"
                    min={0}
                    max={99999}
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">สถานะ</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="active">ใช้งาน</option>
                    <option value="inactive">ปิดใช้งาน</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
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
