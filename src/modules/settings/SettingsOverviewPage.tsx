import React, { useEffect, useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { CheckCircle2, Save } from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { appendAuditLogToBatch } from '../../core/firebase/auditService';
import { hasPermission } from '../../core/rbac/permissions';

export function SettingsOverviewPage() {
  const { userProfile, organization, settings } = useFirebase();
  const [storeName, setStoreName] = useState('');
  const [paperSize, setPaperSize] = useState<'80mm' | '58mm'>('80mm');
  const [receiptPrefix, setReceiptPrefix] = useState('INV');
  const [footerText, setFooterText] = useState('');
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState('0');
  const [taxId, setTaxId] = useState('');
  const [roundingMode, setRoundingMode] = useState<'integer' | 'nearest_100' | 'nearest_500'>('integer');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canManage = hasPermission(userProfile, 'settings', 'edit') || userProfile?.role === 'owner' || userProfile?.role === 'super_admin';

  useEffect(() => {
    if (organization) {
      setStoreName(organization.name);
    }
    if (settings) {
      setPaperSize(settings.receiptSettings?.paperSize ?? '80mm');
      setReceiptPrefix(settings.receiptSettings?.prefix ?? 'INV');
      setFooterText(settings.receiptSettings?.footerText ?? '');
      setTaxEnabled(Boolean(settings.taxSettings?.taxEnabled));
      setTaxRate(String(settings.taxSettings?.taxRate ?? 0));
      setTaxId(settings.taxSettings?.taxId ?? '');
      setRoundingMode(settings.currencySettings?.roundingMode ?? 'integer');
    }
  }, [organization, settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !organization || !settings || !canManage) return;

    setSaving(true);
    setSavedNotice(false);
    setErrorMsg(null);

    const parsedTaxRate = taxEnabled ? Math.max(0, Math.min(100, Number(taxRate) || 0)) : 0;

    try {
      const batch = writeBatch(db);

      if (storeName.trim() && storeName.trim() !== organization.name) {
        batch.update(doc(db, 'organizations', organization.organizationId), {
          name: storeName.trim().slice(0, 120),
          updatedAt: serverTimestamp(),
        });
      }

      batch.update(doc(db, 'settings', organization.organizationId), {
        storeProfile: {
          name: storeName.trim().slice(0, 120) || organization.name,
          logoUrl: settings.storeProfile?.logoUrl ?? '',
          address: settings.storeProfile?.address ?? '',
          phone: settings.storeProfile?.phone ?? '',
        },
        receiptSettings: {
          ...settings.receiptSettings,
          prefix: receiptPrefix.trim().toUpperCase().slice(0, 10) || 'INV',
          paperSize,
          footerText: footerText.trim().slice(0, 200),
          showTaxId: taxEnabled,
        },
        taxSettings: {
          ...settings.taxSettings,
          taxEnabled,
          taxRate: parsedTaxRate,
          taxId: taxId.trim().slice(0, 40),
        },
        currencySettings: {
          code: 'LAK',
          symbol: '₭',
          roundingMode,
        },
        updatedAt: serverTimestamp(),
      });

      appendAuditLogToBatch(batch, {
        user: userProfile,
        branchId: null,
        action: 'UPDATE_SYSTEM_SETTINGS',
        entityType: 'settings',
        entityId: organization.organizationId,
        before: {
          storeName: organization.name,
          taxEnabled: settings.taxSettings?.taxEnabled,
          taxRate: settings.taxSettings?.taxRate,
          paperSize: settings.receiptSettings?.paperSize,
        },
        after: {
          storeName: storeName.trim(),
          taxEnabled,
          taxRate: parsedTaxRate,
          paperSize,
          roundingMode,
        },
      });

      await batch.commit();
      setSavedNotice(true);
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `settings/${organization.organizationId}`);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถบันทึกการตั้งค่าได้');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-900">ตั้งค่าองค์กร ใบเสร็จ และภาษี</h2>
        <p className="text-xs text-slate-500">
          สกุลเงินหลัก: LAK (กีบ) · เขตเวลา: Asia/Vientiane · รูปแบบวันที่: DD/MM/YYYY
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      {savedNotice && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-xs text-green-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
          บันทึกการตั้งค่าและประวัติการแก้ไขเรียบร้อยแล้ว
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">ชื่อร้าน / องค์กร</label>
            <input
              type="text"
              disabled={!canManage}
              maxLength={120}
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">คำนำหน้าเลขใบเสร็จ</label>
            <input
              type="text"
              disabled={!canManage}
              maxLength={10}
              value={receiptPrefix}
              onChange={(e) => setReceiptPrefix(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">ขนาดกระดาษใบเสร็จ</label>
            <select
              disabled={!canManage}
              value={paperSize}
              onChange={(e) => setPaperSize(e.target.value as '80mm' | '58mm')}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white disabled:bg-slate-50"
            >
              <option value="80mm">80mm</option>
              <option value="58mm">58mm</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">การปัดเศษเงิน (LAK)</label>
            <select
              disabled={!canManage}
              value={roundingMode}
              onChange={(e) =>
                setRoundingMode(e.target.value as 'integer' | 'nearest_100' | 'nearest_500')
              }
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white disabled:bg-slate-50"
            >
              <option value="integer">จำนวนเต็ม (1 ₭)</option>
              <option value="nearest_100">ปัดหลัก 100 ₭</option>
              <option value="nearest_500">ปัดหลัก 500 ₭</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">ข้อความท้ายใบเสร็จ</label>
          <input
            type="text"
            disabled={!canManage}
            maxLength={200}
            value={footerText}
            onChange={(e) => setFooterText(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
          />
        </div>

        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-slate-900">ตั้งค่าภาษี (ตามกฎหมายที่ยืนยัน)</div>
              <div className="text-xs text-slate-500">
                ระบบจะคิดภาษีเฉพาะเมื่อเปิดใช้งานและกำหนดอัตราที่ถูกต้องแล้วเท่านั้น
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canManage}
                checked={taxEnabled}
                onChange={(e) => setTaxEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600"
              />
              เปิดใช้งานภาษี
            </label>
          </div>
          {taxEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">อัตราภาษี (%)</label>
                <input
                  type="number"
                  disabled={!canManage}
                  min={0}
                  max={100}
                  step="0.01"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  เลขประจำตัวผู้เสียภาษี (TIN)
                </label>
                <input
                  type="text"
                  disabled={!canManage}
                  maxLength={40}
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg font-mono"
                />
              </div>
            </div>
          )}
        </div>

        {canManage && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
