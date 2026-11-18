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
import { Award, Edit2, Plus, Tag, X } from 'lucide-react';
import { writeAuditLog } from '../../core/firebase/auditService';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { hasPermission } from '../../core/rbac/permissions';
import { generateSafeId } from '../../core/utils/id';
import { formatLak } from '../../core/utils/money';
import type { MembershipTier, Promotion } from '../../core/firebase/types';

function todayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Vientiane' }).format(new Date());
}

export function MembershipsPromotionsPage() {
  const { userProfile, activeBranchId } = useFirebase();
  const [activeTab, setActiveTab] = useState<'tiers' | 'promotions'>('tiers');

  const [tiers, setTiers] = useState<MembershipTier[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Tier Modal
  const [tierModalOpen, setTierModalOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<MembershipTier | null>(null);
  const [tierName, setTierName] = useState('');
  const [tierDiscountPercent, setTierDiscountPercent] = useState('0');
  const [tierPointsPer1000, setTierPointsPer1000] = useState('1');
  const [tierMinSpendLak, setTierMinSpendLak] = useState('0');
  const [tierDescription, setTierDescription] = useState('');
  const [tierStatus, setTierStatus] = useState<'active' | 'inactive'>('active');
  const [tierSaving, setTierSaving] = useState(false);

  // Promotion Modal
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoName, setPromoName] = useState('');
  const [promoType, setPromoType] = useState<'percent_bill' | 'fixed_bill'>('percent_bill');
  const [promoValue, setPromoValue] = useState('5');
  const [promoMinSpendLak, setPromoMinSpendLak] = useState('0');
  const [promoStartDate, setPromoStartDate] = useState(todayYmd());
  const [promoEndDate, setPromoEndDate] = useState(todayYmd());
  const [promoStatus, setPromoStatus] = useState<'active' | 'inactive'>('active');
  const [promoSaving, setPromoSaving] = useState(false);

  const canCreate = hasPermission(userProfile, 'memberships_promotions', 'create');
  const canEdit = hasPermission(userProfile, 'memberships_promotions', 'edit');

  useEffect(() => {
    if (!userProfile) return;
    const orgId = userProfile.organizationId;

    const unsubTiers = onSnapshot(
      query(collection(db, 'membershipTiers'), where('organizationId', '==', orgId)),
      (snap) => {
        setTiers(
          snap.docs
            .map((d) => d.data() as MembershipTier)
            .sort((a, b) => a.minSpendLak - b.minSpendLak),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'membershipTiers'),
    );

    const unsubPromos = onSnapshot(
      query(
        collection(db, 'promotions'),
        where('organizationId', '==', orgId),
        where('branchId', '==', activeBranchId),
      ),
      (snap) => {
        setPromotions(
          snap.docs
            .map((d) => d.data() as Promotion)
            .sort((a, b) => b.startDate.localeCompare(a.startDate)),
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'promotions'),
    );

    return () => {
      unsubTiers();
      unsubPromos();
    };
  }, [userProfile, activeBranchId]);

  const activePromoCount = useMemo(() => {
    const today = todayYmd();
    return promotions.filter(
      (p) => p.status === 'active' && p.startDate <= today && p.endDate >= today,
    ).length;
  }, [promotions]);

  const openNewTierModal = () => {
    setEditingTier(null);
    setTierName('');
    setTierDiscountPercent('0');
    setTierPointsPer1000('1');
    setTierMinSpendLak('0');
    setTierDescription('');
    setTierStatus('active');
    setTierModalOpen(true);
  };

  const openEditTierModal = (tier: MembershipTier) => {
    setEditingTier(tier);
    setTierName(tier.name);
    setTierDiscountPercent(String(tier.discountPercent));
    setTierPointsPer1000(String(tier.pointsPer1000Lak));
    setTierMinSpendLak(String(tier.minSpendLak));
    setTierDescription(tier.description);
    setTierStatus(tier.status);
    setTierModalOpen(true);
  };

  const handleSaveTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    if (!tierName.trim()) return;

    setTierSaving(true);
    setFeedback(null);
    try {
      const cleanName = tierName.trim().slice(0, 80);
      const discountPercent = Math.min(100, Math.max(0, Number(tierDiscountPercent) || 0));
      const pointsPer1000Lak = Math.max(0, Number(tierPointsPer1000) || 0);
      const minSpendLak = Math.max(0, Math.round(Number(tierMinSpendLak) || 0));
      const description = tierDescription.trim().slice(0, 300);

      if (editingTier) {
        await updateDoc(doc(db, 'membershipTiers', editingTier.tierId), {
          name: cleanName,
          discountPercent,
          pointsPer1000Lak,
          minSpendLak,
          description,
          status: tierStatus,
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog({
          user: userProfile,
          branchId: activeBranchId,
          action: 'UPDATE_MEMBERSHIP_TIER',
          entityType: 'membershipTiers',
          entityId: editingTier.tierId,
          before: { name: editingTier.name, discountPercent: editingTier.discountPercent },
          after: { name: cleanName, discountPercent, status: tierStatus },
        });
        setFeedback({ type: 'ok', text: `อัปเดตระดับสมาชิก "${cleanName}" เรียบร้อยแล้ว` });
      } else {
        const tierId = generateSafeId('tier');
        await setDoc(doc(db, 'membershipTiers', tierId), {
          tierId,
          organizationId: userProfile.organizationId,
          ownerUid: userProfile.ownerUid,
          name: cleanName,
          discountPercent,
          pointsPer1000Lak,
          minSpendLak,
          description,
          status: tierStatus,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog({
          user: userProfile,
          branchId: activeBranchId,
          action: 'CREATE_MEMBERSHIP_TIER',
          entityType: 'membershipTiers',
          entityId: tierId,
          before: null,
          after: { name: cleanName, discountPercent, pointsPer1000Lak },
        });
        setFeedback({ type: 'ok', text: `เพิ่มระดับสมาชิก "${cleanName}" เรียบร้อยแล้ว` });
      }
      setTierModalOpen(false);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ไม่สามารถบันทึกระดับสมาชิกได้',
      });
    } finally {
      setTierSaving(false);
    }
  };

  const openNewPromoModal = () => {
    setEditingPromo(null);
    setPromoCode(`PROMO${Math.floor(100 + Math.random() * 900)}`);
    setPromoName('');
    setPromoType('percent_bill');
    setPromoValue('5');
    setPromoMinSpendLak('0');
    setPromoStartDate(todayYmd());
    setPromoEndDate(todayYmd());
    setPromoStatus('active');
    setPromoModalOpen(true);
  };

  const openEditPromoModal = (promo: Promotion) => {
    setEditingPromo(promo);
    setPromoCode(promo.code);
    setPromoName(promo.name);
    setPromoType(promo.promoType);
    setPromoValue(String(promo.discountValue));
    setPromoMinSpendLak(String(promo.minSpendLak));
    setPromoStartDate(promo.startDate);
    setPromoEndDate(promo.endDate);
    setPromoStatus(promo.status);
    setPromoModalOpen(true);
  };

  const handleSavePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !promoName.trim()) return;

    setPromoSaving(true);
    setFeedback(null);
    try {
      const cleanCode = promoCode.trim().toUpperCase().slice(0, 40) || 'PROMO';
      const cleanName = promoName.trim().slice(0, 120);
      const rawVal = Math.max(0, Number(promoValue) || 0);
      const discountValue =
        promoType === 'percent_bill' ? Math.min(100, rawVal) : Math.round(rawVal);
      const minSpendLak = Math.max(0, Math.round(Number(promoMinSpendLak) || 0));

      if (editingPromo) {
        await updateDoc(doc(db, 'promotions', editingPromo.promotionId), {
          code: cleanCode,
          name: cleanName,
          promoType,
          discountValue,
          minSpendLak,
          startDate: promoStartDate.slice(0, 20),
          endDate: promoEndDate.slice(0, 20),
          status: promoStatus,
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog({
          user: userProfile,
          branchId: activeBranchId,
          action: 'UPDATE_PROMOTION',
          entityType: 'promotions',
          entityId: editingPromo.promotionId,
          before: { code: editingPromo.code, status: editingPromo.status },
          after: { code: cleanCode, name: cleanName, status: promoStatus },
        });
        setFeedback({ type: 'ok', text: `อัปเดตโปรโมชั่น "${cleanName}" เรียบร้อยแล้ว` });
      } else {
        const promotionId = generateSafeId('promo');
        await setDoc(doc(db, 'promotions', promotionId), {
          promotionId,
          organizationId: userProfile.organizationId,
          branchId: activeBranchId,
          ownerUid: userProfile.ownerUid,
          code: cleanCode,
          name: cleanName,
          promoType,
          discountValue,
          minSpendLak,
          startDate: promoStartDate.slice(0, 20),
          endDate: promoEndDate.slice(0, 20),
          status: promoStatus,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await writeAuditLog({
          user: userProfile,
          branchId: activeBranchId,
          action: 'CREATE_PROMOTION',
          entityType: 'promotions',
          entityId: promotionId,
          before: null,
          after: { code: cleanCode, name: cleanName, promoType, discountValue },
        });
        setFeedback({ type: 'ok', text: `สร้างโปรโมชั่น "${cleanName}" เรียบร้อยแล้ว` });
      }
      setPromoModalOpen(false);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'ไม่สามารถบันทึกโปรโมชั่นได้',
      });
    } finally {
      setPromoSaving(false);
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
          <div className="text-xs text-slate-500">ระดับสมาชิกทั้งหมด</div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {tiers.filter((t) => t.status === 'active').length} ระดับ
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            เชื่อมต่อกับระบบคำนวณส่วนลดและแต้มบนหน้าจอ POS
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">โปรโมชั่นที่ใช้งานได้วันนี้</div>
          <div className="text-2xl font-bold text-blue-700 tabular-nums mt-1">
            {activePromoCount} รายการ
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            จากโปรโมชั่นทั้งหมด {promotions.length} รายการ
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500">การสะสมแต้ม</div>
            <div className="text-sm font-semibold text-slate-900 mt-1">
              คำนวณอัตโนมัติทุกบิลขายสมาชิก
            </div>
          </div>
          <Award className="w-7 h-7 text-blue-600 shrink-0" />
        </div>
      </div>

      {/* Tab Header & Action */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex bg-slate-100 p-1 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setActiveTab('tiers')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
              activeTab === 'tiers'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            ระดับสมาชิก ({tiers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('promotions')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
              activeTab === 'promotions'
                ? 'bg-white text-blue-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            โปรโมชั่น ({promotions.length})
          </button>
        </div>

        {activeTab === 'tiers' && canCreate && (
          <button
            type="button"
            onClick={openNewTierModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-lg cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            เพิ่มระดับสมาชิก
          </button>
        )}

        {activeTab === 'promotions' && canCreate && (
          <button
            type="button"
            onClick={openNewPromoModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-lg cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            สร้างโปรโมชั่นใหม่
          </button>
        )}
      </div>

      {/* Tiers Table */}
      {activeTab === 'tiers' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">ชื่อระดับสมาชิก</th>
                  <th className="py-3 px-4 text-right">ส่วนลดสมาชิก (%)</th>
                  <th className="py-3 px-4 text-right">แต้ม / 1,000 ₭</th>
                  <th className="py-3 px-4 text-right">ยอดสะสมขั้นต่ำ</th>
                  <th className="py-3 px-4">สถานะ</th>
                  <th className="py-3 px-4 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {tiers.map((tier) => (
                  <tr key={tier.tierId} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{tier.name}</div>
                      {tier.description && (
                        <div className="text-xs text-slate-500">{tier.description}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-blue-700 tabular-nums">
                      {tier.discountPercent}%
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-slate-700">
                      {tier.pointsPer1000Lak} แต้ม
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-slate-700">
                      {formatLak(tier.minSpendLak)}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span
                        className={`font-semibold ${
                          tier.status === 'active' ? 'text-green-700' : 'text-slate-400'
                        }`}
                      >
                        {tier.status === 'active' ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openEditTierModal(tier)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          แก้ไข
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {tiers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-xs text-slate-500">
                      ยังไม่มีระดับสมาชิก กดปุ่ม "เพิ่มระดับสมาชิก" เพื่อกำหนดส่วนลดและอัตราการให้คะแนน
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Promotions Table */}
      {activeTab === 'promotions' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">โค้ด</th>
                  <th className="py-3 px-4">ชื่อโปรโมชั่น</th>
                  <th className="py-3 px-4 text-right">ส่วนลด</th>
                  <th className="py-3 px-4 text-right">ซื้อขั้นต่ำ</th>
                  <th className="py-3 px-4">ระยะเวลา</th>
                  <th className="py-3 px-4">สถานะ</th>
                  <th className="py-3 px-4 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {promotions.map((promo) => {
                  const today = todayYmd();
                  const inDateRange = promo.startDate <= today && promo.endDate >= today;
                  return (
                    <tr key={promo.promotionId} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono text-xs font-bold text-blue-700">
                        {promo.code}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">{promo.name}</td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-900 tabular-nums">
                        {promo.promoType === 'percent_bill'
                          ? `${promo.discountValue}%`
                          : formatLak(promo.discountValue)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-slate-600">
                        {formatLak(promo.minSpendLak)}
                      </td>
                      <td className="py-3 px-4 text-xs tabular-nums text-slate-600">
                        {promo.startDate} ถึง {promo.endDate}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {promo.status === 'active' ? (
                          <span
                            className={`font-semibold ${
                              inDateRange ? 'text-green-700' : 'text-amber-600'
                            }`}
                          >
                            {inDateRange ? 'กำลังใช้งาน' : 'นอกช่วงเวลา'}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-semibold">ปิดใช้งาน</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => openEditPromoModal(promo)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            แก้ไข
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {promotions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-xs text-slate-500">
                      ยังไม่มีโปรโมชั่นหน้าร้าน กดปุ่ม "สร้างโปรโมชั่นใหม่" เพื่อเริ่มสร้างแคมเปญส่วนลด
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Membership Tier Modal */}
      {tierModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-semibold text-slate-900">
                {editingTier ? 'แก้ไขระดับสมาชิก' : 'เพิ่มระดับสมาชิกใหม่'}
              </h3>
              <button
                type="button"
                onClick={() => setTierModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveTier} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  ชื่อระดับสมาชิก *
                </label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={tierName}
                  onChange={(e) => setTierName(e.target.value)}
                  placeholder="เช่น Silver / Gold / VIP"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ส่วนลดสมาชิก (%)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={tierDiscountPercent}
                    onChange={(e) => setTierDiscountPercent(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-right tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    แต้มต่อทุก 1,000 ₭
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={tierPointsPer1000}
                    onChange={(e) => setTierPointsPer1000(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-right tabular-nums"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ยอดซื้อสะสมขั้นต่ำ (₭)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={tierMinSpendLak}
                    onChange={(e) => setTierMinSpendLak(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-right tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">สถานะ</label>
                  <select
                    value={tierStatus}
                    onChange={(e) => setTierStatus(e.target.value as 'active' | 'inactive')}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="active">เปิดใช้งาน</option>
                    <option value="inactive">ปิดใช้งาน</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  รายละเอียดสิทธิประโยชน์
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={tierDescription}
                  onChange={(e) => setTierDescription(e.target.value)}
                  placeholder="คำอธิบายเพิ่มเติม (ถ้ามี)"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTierModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={tierSaving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  {tierSaving ? 'กำลังบันทึก...' : 'บันทึกระดับสมาชิก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Promotion Modal */}
      {promoModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-semibold text-slate-900">
                {editingPromo ? 'แก้ไขโปรโมชั่น' : 'สร้างโปรโมชั่นใหม่'}
              </h3>
              <button
                type="button"
                onClick={() => setPromoModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSavePromo} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">รหัสโค้ด *</label>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ชื่อโปรโมชั่น *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={promoName}
                    onChange={(e) => setPromoName(e.target.value)}
                    placeholder="เช่น ลด 5% เมื่อซื้อครบ 200,000 ₭"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    รูปแบบส่วนลด
                  </label>
                  <select
                    value={promoType}
                    onChange={(e) =>
                      setPromoType(e.target.value as 'percent_bill' | 'fixed_bill')
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="percent_bill">เปอร์เซ็นต์ท้ายบิล (%)</option>
                    <option value="fixed_bill">จำนวนเงินคงที่ (₭)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    มูลค่าส่วนลด {promoType === 'percent_bill' ? '(%)' : '(₭)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={promoType === 'percent_bill' ? 100 : undefined}
                    value={promoValue}
                    onChange={(e) => setPromoValue(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-right tabular-nums"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ยอดซื้อขั้นต่ำ (₭)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={promoMinSpendLak}
                    onChange={(e) => setPromoMinSpendLak(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg text-right tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">สถานะ</label>
                  <select
                    value={promoStatus}
                    onChange={(e) => setPromoStatus(e.target.value as 'active' | 'inactive')}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="active">เปิดใช้งาน</option>
                    <option value="inactive">ปิดใช้งาน</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">วันเริ่มต้น</label>
                  <input
                    type="date"
                    required
                    value={promoStartDate}
                    onChange={(e) => setPromoStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">วันสิ้นสุด</label>
                  <input
                    type="date"
                    required
                    value={promoEndDate}
                    onChange={(e) => setPromoEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPromoModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={promoSaving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  {promoSaving ? 'กำลังบันทึก...' : 'บันทึกโปรโมชั่น'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
