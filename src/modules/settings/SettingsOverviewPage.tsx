import React, { useEffect, useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  Bell,
  Boxes,
  CheckCircle2,
  Coins,
  Printer,
  Save,
  Store,
} from 'lucide-react';
import { db } from '../../core/firebase/config';
import { OperationType, handleFirestoreError } from '../../core/firebase/errorHandler';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import { appendAuditLogToBatch } from '../../core/firebase/auditService';
import { hasPermission } from '../../core/rbac/permissions';

export function SettingsOverviewPage() {
  const { userProfile, organization, activeBranch, activeBranchId, settings } = useFirebase();

  // Store Profile
  const [storeName, setStoreName] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  // Receipt Settings
  const [paperSize, setPaperSize] = useState<'80mm' | '58mm'>('80mm');
  const [receiptPrefix, setReceiptPrefix] = useState('INV');
  const [headerText, setHeaderText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [showQr, setShowQr] = useState(true);
  const [showTaxId, setShowTaxId] = useState(false);

  // Currency & Tax Settings
  const [roundingMode, setRoundingMode] = useState<'integer' | 'nearest_100' | 'nearest_500'>(
    'integer',
  );
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState('0');
  const [taxInclusive, setTaxInclusive] = useState(false);
  const [taxId, setTaxId] = useState('');

  // Inventory & Notification Settings
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [expiryWarningDays, setExpiryWarningDays] = useState('30');
  const [highExpenseThresholdPercent, setHighExpenseThresholdPercent] = useState('30');

  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canManage =
    hasPermission(userProfile, 'settings', 'edit') ||
    userProfile?.role === 'owner' ||
    userProfile?.role === 'super_admin';

  useEffect(() => {
    if (organization) {
      setStoreName(organization.name);
    }
    if (settings) {
      setStorePhone(settings.storeProfile?.phone || activeBranch?.phone || '');
      setStoreAddress(settings.storeProfile?.address || activeBranch?.address || '');
      setLogoUrl(settings.storeProfile?.logoUrl || '');
      setPaperSize(settings.receiptSettings?.paperSize ?? '80mm');
      setReceiptPrefix(settings.receiptSettings?.prefix ?? 'INV');
      setHeaderText(settings.receiptSettings?.headerText ?? organization?.name ?? '');
      setFooterText(settings.receiptSettings?.footerText ?? 'ຂອບໃຈທີ່ໃຊ້ບໍລິການ');
      setShowQr(settings.receiptSettings?.showQr ?? true);
      setShowTaxId(Boolean(settings.receiptSettings?.showTaxId));
      setRoundingMode(settings.currencySettings?.roundingMode ?? 'integer');
      setTaxEnabled(Boolean(settings.taxSettings?.taxEnabled));
      setTaxRate(String(settings.taxSettings?.taxRate ?? 0));
      setTaxInclusive(Boolean(settings.taxSettings?.taxInclusive));
      setTaxId(settings.taxSettings?.taxId ?? '');
      setAllowNegativeStock(Boolean(settings.inventorySettings?.allowNegativeStock));
      setExpiryWarningDays(String(settings.notificationSettings?.expiryWarningDays ?? 30));
      setHighExpenseThresholdPercent(
        String(settings.notificationSettings?.highExpenseThresholdPercent ?? 30),
      );
    } else if (activeBranch) {
      setStorePhone(activeBranch.phone || '');
      setStoreAddress(activeBranch.address || '');
    }
  }, [organization, activeBranch, settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !organization || !settings || !canManage) return;

    setSaving(true);
    setSavedNotice(false);
    setErrorMsg(null);

    const parsedTaxRate = taxEnabled
      ? Math.max(0, Math.min(100, Number(taxRate) || 0))
      : 0;
    const parsedExpiryDays = Math.max(1, Math.min(365, Math.round(Number(expiryWarningDays) || 30)));
    const parsedExpensePct = Math.max(
      1,
      Math.min(500, Math.round(Number(highExpenseThresholdPercent) || 30)),
    );

    try {
      const batch = writeBatch(db);

      const resolvedStoreName = storeName.trim().slice(0, 120) || organization.name;
      const resolvedPhone = storePhone.trim().slice(0, 30);
      const resolvedAddress = storeAddress.trim().slice(0, 300);
      const resolvedLogoUrl = logoUrl.trim().slice(0, 500);
      const resolvedHeaderText = headerText.trim().slice(0, 120) || resolvedStoreName;
      const resolvedFooterText = footerText.trim().slice(0, 200);
      const resolvedPrefix = receiptPrefix.trim().toUpperCase().slice(0, 10) || 'INV';
      const resolvedTaxId = taxId.trim().slice(0, 40);

      if (resolvedStoreName !== organization.name) {
        batch.update(doc(db, 'organizations', organization.organizationId), {
          name: resolvedStoreName,
          updatedAt: serverTimestamp(),
        });
      }

      if (activeBranch) {
        batch.update(doc(db, 'branches', activeBranchId), {
          branchName: resolvedStoreName,
          address: resolvedAddress,
          phone: resolvedPhone,
          updatedAt: serverTimestamp(),
        });
      }

      batch.update(doc(db, 'settings', organization.organizationId), {
        storeProfile: {
          name: resolvedStoreName,
          logoUrl: resolvedLogoUrl,
          address: resolvedAddress,
          phone: resolvedPhone,
        },
        receiptSettings: {
          prefix: resolvedPrefix,
          paperSize,
          headerText: resolvedHeaderText,
          footerText: resolvedFooterText,
          showQr,
          showTaxId: taxEnabled && showTaxId,
        },
        taxSettings: {
          taxEnabled,
          taxRate: parsedTaxRate,
          taxInclusive,
          taxId: resolvedTaxId,
        },
        currencySettings: {
          code: 'LAK',
          symbol: '₭',
          roundingMode,
        },
        notificationSettings: {
          expiryWarningDays: parsedExpiryDays,
          highExpenseThresholdPercent: parsedExpensePct,
        },
        inventorySettings: {
          allowNegativeStock,
          costingMethod: 'WAC',
        },
        updatedAt: serverTimestamp(),
      });

      appendAuditLogToBatch(batch, {
        user: userProfile,
        branchId: activeBranchId,
        action: 'UPDATE_SYSTEM_SETTINGS',
        entityType: 'settings',
        entityId: organization.organizationId,
        before: {
          storeName: organization.name,
          phone: settings.storeProfile?.phone ?? '',
          taxEnabled: settings.taxSettings?.taxEnabled,
          taxRate: settings.taxSettings?.taxRate,
          paperSize: settings.receiptSettings?.paperSize,
          allowNegativeStock: settings.inventorySettings?.allowNegativeStock ?? false,
          expiryWarningDays: settings.notificationSettings?.expiryWarningDays ?? 30,
        },
        after: {
          storeName: resolvedStoreName,
          phone: resolvedPhone,
          taxEnabled,
          taxRate: parsedTaxRate,
          taxInclusive,
          paperSize,
          roundingMode,
          allowNegativeStock,
          expiryWarningDays: parsedExpiryDays,
          highExpenseThresholdPercent: parsedExpensePct,
        },
      });

      await batch.commit();
      setSavedNotice(true);
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.UPDATE, `settings/${organization.organizationId}`);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'ບໍ່ສາມາດບັນທຶກການຕັ້ງຄ່າໄດ້');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          ຕັ້ງຄ່າຮ້ານຄ້າ ໃບບິນ ພາສີ ແລະ ນະໂຍບາຍລະບົບ
        </h2>
        <p className="text-xs text-slate-500">
          ລະບົບຮ້ານຄ້າດ່ຽວ (1 ສາຂາ) · ສະກຸນເງິນຫຼັກ: LAK (ກີບ) · ເຂດເວລາ: Asia/Vientiane · ຮູບແບບວັນທີ: DD/MM/YYYY
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
          ບັນທຶກການຕັ້ງຄ່າ ແລະ ປະຫວັດການແກ້ໄຂລົງ Audit Log ຮຽບຮ້ອຍແລ້ວ
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* Section 1: Store Profile */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Store className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900">ຂໍ້ມູນຮ້ານຄ້າ</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">ຊື່ຮ້ານຄ້າ *</label>
              <input
                type="text"
                required
                disabled={!canManage}
                maxLength={120}
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ເບີໂທລະສັບຮ້ານ
              </label>
              <input
                type="text"
                disabled={!canManage}
                maxLength={30}
                value={storePhone}
                onChange={(e) => setStorePhone(e.target.value)}
                placeholder="020-xxxx-xxxx"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ທີ່ຢູ່ຮ້ານຄ້າ (ສຳລັບຫົວໃບບິນ)
              </label>
              <input
                type="text"
                disabled={!canManage}
                maxLength={300}
                value={storeAddress}
                onChange={(e) => setStoreAddress(e.target.value)}
                placeholder="ບ້ານ ຖະໜົນ ເມືອງ ແຂວງ"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                URL ໂລໂກ້ຮ້ານ (ຖ້າມີ)
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="url"
                  disabled={!canManage}
                  maxLength={500}
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
                />
                {logoUrl.trim() && (
                  <img
                    src={logoUrl.trim()}
                    alt="ໂລໂກ້ຮ້ານ"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    className="w-10 h-10 object-contain rounded border border-slate-200 bg-white shrink-0"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Receipt Settings */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Printer className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900">ຮູບແບບໃບບິນຮັບເງິນ</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ຄຳນຳໜ້າເລກທີບິນ
              </label>
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
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ຂະໜາດເຈ້ຍເຄື່ອງພິມຄວາມຮ້ອນ
              </label>
              <select
                disabled={!canManage}
                value={paperSize}
                onChange={(e) => setPaperSize(e.target.value as '80mm' | '58mm')}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white disabled:bg-slate-50"
              >
                <option value="80mm">80mm (ມາດຕະຖານ)</option>
                <option value="58mm">58mm (ຂະໜາດນ້ອຍ)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ຂໍ້ຄວາມຫົວໃບບິນ
              </label>
              <input
                type="text"
                disabled={!canManage}
                maxLength={120}
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                placeholder="ຂໍ້ຄວາມແຖວເທິງຂອງໃບບິນ"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ຂໍ້ຄວາມທ້າຍໃບບິນ
              </label>
              <input
                type="text"
                disabled={!canManage}
                maxLength={200}
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                placeholder="ເຊັ່ນ ຂອບໃຈທີ່ໃຊ້ບໍລິການ"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg disabled:bg-slate-50"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-5 pt-1">
            <label className="inline-flex items-center gap-2 text-xs sm:text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canManage}
                checked={showQr}
                onChange={(e) => setShowQr(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600"
              />
              ສະແດງບາໂຄດເລກທີບິນທ້າຍໃບບິນ
            </label>
            <label className="inline-flex items-center gap-2 text-xs sm:text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canManage || !taxEnabled}
                checked={taxEnabled && showTaxId}
                onChange={(e) => setShowTaxId(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 disabled:opacity-50"
              />
              ສະແດງເລກປະຈຳຕົວຜູ້ເສຍພາສີ (TIN) ເທິງໃບບິນ
            </label>
          </div>
        </div>

        {/* Section 3: Currency & Tax */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Coins className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900">ສະກຸນເງິນ (LAK) ແລະ ພາສີ</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ສະກຸນເງິນຫຼັກຂອງລະບົບ
              </label>
              <input
                type="text"
                disabled
                value="LAK (₭ · ກີບລາວ)"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ການປັດເສດຍອດຂາຍ (LAK)
              </label>
              <select
                disabled={!canManage}
                value={roundingMode}
                onChange={(e) =>
                  setRoundingMode(e.target.value as 'integer' | 'nearest_100' | 'nearest_500')
                }
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white disabled:bg-slate-50"
              >
                <option value="integer">ຈຳນວນເຕັມ (1 ₭)</option>
                <option value="nearest_100">ປັດຫຼັກ 100 ₭</option>
                <option value="nearest_500">ປັດຫຼັກ 500 ₭</option>
              </select>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-slate-900">
                  ຕັ້ງຄ່າພາສີ (ເປີດໃຊ້ງານຕາມກົດໝາຍທີ່ຮ້ານຄ້າຈົດທະບຽນ)
                </div>
                <div className="text-xs text-slate-500">
                  ລະບົບຈະຄຳນວນພາສີສະເພາະເມື່ອເປີດໃຊ້ງານ ແລະ ກຳນົດອັດຕາທີ່ຖືກຕ້ອງແລ້ວເທົ່ານັ້ນ
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  disabled={!canManage}
                  checked={taxEnabled}
                  onChange={(e) => setTaxEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600"
                />
                ເປີດໃຊ້ງານພາສີ
              </label>
            </div>
            {taxEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ອັດຕາພາສີ (%)
                  </label>
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
                    ຮູບແບບການຄິດພາສີ
                  </label>
                  <select
                    disabled={!canManage}
                    value={taxInclusive ? 'inclusive' : 'exclusive'}
                    onChange={(e) => setTaxInclusive(e.target.value === 'inclusive')}
                    className="w-full px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="exclusive">ບວກເພີ່ມຈາກລາຄາສິນຄ້າ (Exclusive)</option>
                    <option value="inclusive">ລວມໃນລາຄາສິນຄ້າແລ້ວ (Inclusive)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    ເລກປະຈຳຕົວຜູ້ເສຍພາສີ (TIN)
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
        </div>

        {/* Section 4: Inventory & Notifications */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Boxes className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900">ນະໂຍບາຍຄັງສິນຄ້າ ແລະ ການແຈ້ງເຕືອນ</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ວິທີຄຳນວນຕົ້ນທຶນສິນຄ້າ
              </label>
              <input
                type="text"
                disabled
                value="WAC (Weighted Average Cost · ຕົ້ນທຶນສະເລ່ຍຖ່ວງນ້ຳໜັກ)"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-600"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div>
                <div className="text-xs font-semibold text-slate-900">
                  ອະນຸຍາດໃຫ້ຂາຍເມື່ອສະຕັອກຕິດລົບ
                </div>
                <div className="text-[11px] text-slate-500">
                  ຫາກປິດໄວ້ ລະບົບ POS ຈະປ້ອງກັນການຂາຍເກີນຈຳນວນຄົງເຫຼືອຕົວຈິງ
                </div>
              </div>
              <input
                type="checkbox"
                disabled={!canManage}
                checked={allowNegativeStock}
                onChange={(e) => setAllowNegativeStock(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 shrink-0 cursor-pointer"
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1">
                <Bell className="w-3.5 h-3.5 text-blue-600" />
                ແຈ້ງເຕືອນສິນຄ້າໃກ້ໝົດອາຍຸລ່ວງໜ້າ (ມື້)
              </label>
              <input
                type="number"
                disabled={!canManage}
                min={1}
                max={365}
                value={expiryWarningDays}
                onChange={(e) => setExpiryWarningDays(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg tabular-nums disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ເກນແຈ້ງເຕືອນລາຍຈ່າຍສູງຜິດປົກກະຕິ (%)
              </label>
              <input
                type="number"
                disabled={!canManage}
                min={1}
                max={500}
                value={highExpenseThresholdPercent}
                onChange={(e) => setHighExpenseThresholdPercent(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg tabular-nums disabled:bg-slate-50"
              />
            </div>
          </div>
        </div>

        {canManage && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? 'ກຳລັງບັນທຶກ...' : 'ບັນທຶກການຕັ້ງຄ່າທັງໝົດ'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
