import React, { useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Building2, CheckCircle2, LogOut, Store, UserCheck } from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { appendAuditLogToBatch } from '../../core/firebase/auditService';
import { DEFAULT_ROLE_PERMISSIONS, ROLE_LABELS } from '../../core/rbac/permissions';
import { generateSafeId } from '../../core/utils/id';
import type { UserRole } from '../../core/firebase/types';

export function OnboardingSetup() {
  const { firebaseUser, pendingInvitation, signOut } = useFirebase();
  const [storeName, setStoreName] = useState('');
  const [ownerName, setOwnerName] = useState(firebaseUser?.displayName || '');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [branchCode, setBranchCode] = useState('HQ-01');
  const [branchName, setBranchName] = useState('สาขาหลัก (สำนักงานใหญ่)');
  const [branchAddress, setBranchAddress] = useState('');
  const [paperSize, setPaperSize] = useState<'80mm' | '58mm'>('80mm');
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState('0');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!firebaseUser) return null;

  const isBootstrappedEmail =
    firebaseUser.email?.toLowerCase() === 'alaysisomboun@gmail.com' &&
    firebaseUser.emailVerified;

  const handleAcceptInvitation = async () => {
    if (!pendingInvitation) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', firebaseUser.uid);
      const inviteRef = doc(db, 'invitations', pendingInvitation.invitationId);

      batch.set(userRef, {
        uid: firebaseUser.uid,
        organizationId: pendingInvitation.organizationId,
        ownerUid: pendingInvitation.ownerUid,
        name: pendingInvitation.name || firebaseUser.displayName || 'พนักงาน',
        email: (firebaseUser.email || pendingInvitation.email).toLowerCase(),
        phone: '',
        role: pendingInvitation.role,
        branchIds: pendingInvitation.branchIds,
        permissions: pendingInvitation.permissions,
        invitationId: pendingInvitation.invitationId,
        status: 'active',
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });

      batch.update(inviteRef, {
        status: 'accepted',
        acceptedByUid: firebaseUser.uid,
        updatedAt: serverTimestamp(),
      });

      appendAuditLogToBatch(batch, {
        user: {
          uid: firebaseUser.uid,
          organizationId: pendingInvitation.organizationId,
          ownerUid: pendingInvitation.ownerUid,
          name: pendingInvitation.name || firebaseUser.displayName || 'พนักงาน',
          role: pendingInvitation.role,
        },
        branchId: pendingInvitation.branchIds[0] ?? null,
        action: 'ACCEPT_INVITATION',
        entityType: 'users',
        entityId: firebaseUser.uid,
        before: null,
        after: {
          role: pendingInvitation.role,
          branchIds: pendingInvitation.branchIds,
          invitationId: pendingInvitation.invitationId,
        },
      });

      await batch.commit();
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, `users/${firebaseUser.uid}`);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : 'ไม่สามารถยืนยันคำเชิญได้');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCreateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim() || !ownerName.trim() || !branchName.trim()) {
      setErrorMsg('กรุณากรอกชื่อร้าน ชื่อผู้ดูแล และชื่อสาขาหลักให้ครบถ้วน');
      return;
    }
    const cleanBranchCode = branchCode.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!cleanBranchCode) {
      setErrorMsg('รหัสสาขาต้องเป็นตัวอักษรภาษาอังกฤษพิมพ์ใหญ่ ตัวเลข หรือขีดกลาง (-) เท่านั้น');
      return;
    }

    const parsedTaxRate = taxEnabled ? Math.max(0, Math.min(100, Number(taxRate) || 0)) : 0;
    const role: UserRole = isBootstrappedEmail ? 'super_admin' : 'owner';

    setSaving(true);
    setErrorMsg(null);

    const orgId = generateSafeId('org');
    const branchId = generateSafeId('br');

    try {
      const batch = writeBatch(db);

      batch.set(doc(db, 'organizations', orgId), {
        organizationId: orgId,
        name: storeName.trim().slice(0, 120),
        ownerUid: firebaseUser.uid,
        currency: 'LAK',
        timezone: 'Asia/Vientiane',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'branches', branchId), {
        branchId,
        organizationId: orgId,
        ownerUid: firebaseUser.uid,
        branchCode: cleanBranchCode.slice(0, 20),
        branchName: branchName.trim().slice(0, 120),
        address: branchAddress.trim().slice(0, 300),
        phone: ownerPhone.trim().slice(0, 30),
        managerId: firebaseUser.uid,
        assignedUids: [firebaseUser.uid],
        isMainBranch: true,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'users', firebaseUser.uid), {
        uid: firebaseUser.uid,
        organizationId: orgId,
        ownerUid: firebaseUser.uid,
        name: ownerName.trim().slice(0, 120),
        email: (firebaseUser.email || '').toLowerCase(),
        phone: ownerPhone.trim().slice(0, 30),
        role,
        branchIds: [branchId],
        permissions: DEFAULT_ROLE_PERMISSIONS[role],
        status: 'active',
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });

      batch.set(doc(db, 'settings', orgId), {
        organizationId: orgId,
        ownerUid: firebaseUser.uid,
        storeProfile: {
          name: storeName.trim().slice(0, 120),
          logoUrl: '',
          address: branchAddress.trim().slice(0, 300),
          phone: ownerPhone.trim().slice(0, 30),
        },
        receiptSettings: {
          prefix: 'INV',
          paperSize,
          headerText: storeName.trim().slice(0, 120),
          footerText: 'ขอบคุณที่ใช้บริการ',
          showQr: true,
          showTaxId: taxEnabled,
        },
        taxSettings: {
          taxEnabled,
          taxRate: parsedTaxRate,
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
          uid: firebaseUser.uid,
          organizationId: orgId,
          ownerUid: firebaseUser.uid,
          name: ownerName.trim(),
          role,
        },
        branchId,
        action: 'INITIALIZE_ORGANIZATION',
        entityType: 'organizations',
        entityId: orgId,
        before: null,
        after: {
          storeName: storeName.trim(),
          branchCode: cleanBranchCode,
          branchName: branchName.trim(),
          taxEnabled,
          taxRate: parsedTaxRate,
          paperSize,
        },
      });

      await batch.commit();
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.WRITE, `organizations/${orgId}`);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : 'ไม่สามารถสร้างข้อมูลร้านค้าได้');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 flex items-center justify-center">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              {pendingInvitation ? <UserCheck className="w-5 h-5" /> : <Store className="w-5 h-5" />}
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                {pendingInvitation ? 'พบคำเชิญเข้าร่วมร้านค้า' : 'ตั้งค่าองค์กรและสาขาหลักเริ่มต้น'}
              </h1>
              <p className="text-xs text-slate-500">
                บัญชีที่เข้าสู่ระบบ: {firebaseUser.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            ออกจากระบบ
          </button>
        </div>

        {errorMsg && (
          <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 break-words">
            {errorMsg}
          </div>
        )}

        {pendingInvitation ? (
          <div className="space-y-5">
            <div className="p-4 rounded-lg bg-blue-50 border border-blue-100 space-y-2 text-sm">
              <div className="font-semibold text-slate-900">
                คุณได้รับเชิญให้เข้าใช้งานระบบในฐานะพนักงาน
              </div>
              <div className="text-slate-700">
                ชื่อพนักงาน: <span className="font-medium">{pendingInvitation.name}</span>
              </div>
              <div className="text-slate-700">
                บทบาทที่ได้รับ:{' '}
                <span className="font-medium text-blue-700">
                  {ROLE_LABELS[pendingInvitation.role]}
                </span>
              </div>
              <div className="text-slate-600 text-xs">
                จำนวนสาขาที่ได้รับสิทธิ์: {pendingInvitation.branchIds.length} สาขา
              </div>
            </div>
            <button
              type="button"
              onClick={handleAcceptInvitation}
              disabled={saving}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              {saving ? 'กำลังเปิดใช้งานบัญชี...' : 'ยอมรับคำเชิญและเข้าสู่ระบบ'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreateOrganization} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  ชื่อร้าน / ชื่อองค์กร *
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="เช่น ร้านของชำเวียงจันทน์ มาร์ท"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  ชื่อผู้ดูแล / เจ้าของร้าน *
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  รหัสสาขาหลัก *
                </label>
                <input
                  type="text"
                  required
                  maxLength={20}
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  ชื่อสาขาหลัก *
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  เบอร์โทรศัพท์ติดต่อร้าน
                </label>
                <input
                  type="text"
                  maxLength={30}
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  placeholder="เช่น 020 5555 0000"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  ขนาดกระดาษใบเสร็จเริ่มต้น
                </label>
                <select
                  value={paperSize}
                  onChange={(e) => setPaperSize(e.target.value as '80mm' | '58mm')}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                >
                  <option value="80mm">80mm (มาตรฐาน)</option>
                  <option value="58mm">58mm (ขนาดเล็ก)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                ที่อยู่สาขาหลัก
              </label>
              <input
                type="text"
                maxLength={300}
                value={branchAddress}
                onChange={(e) => setBranchAddress(e.target.value)}
                placeholder="บ้าน เมือง แขวง..."
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-slate-900">การคำนวณภาษีขาย/ภาษีซื้อ</div>
                  <div className="text-xs text-slate-500">
                    ระบบจะไม่กำหนดอัตราภาษีเองโดยไม่ยืนยัน (ค่าเริ่มต้น: ปิดการใช้งาน 0%)
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={taxEnabled}
                    onChange={(e) => setTaxEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600"
                  />
                  เปิดใช้ภาษี
                </label>
              </div>
              {taxEnabled && (
                <div className="max-w-xs">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    อัตราภาษี (%) ที่ร้านค้ายืนยันใช้งาน
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white tabular-nums"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-blue-600" />
                สกุลเงิน: LAK · เขตเวลา: Asia/Vientiane · บทบาทเริ่มต้น: {isBootstrappedEmail ? 'Super Admin' : 'Owner'}
              </span>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              {saving ? 'กำลังสร้างฐานข้อมูลองค์กร...' : 'สร้างองค์กรและเริ่มใช้งานระบบ'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
