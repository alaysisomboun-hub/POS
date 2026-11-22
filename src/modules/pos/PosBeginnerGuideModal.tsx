import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FolderKanban,
  PlusCircle,
  Printer,
  QrCode,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  X,
} from 'lucide-react';

export interface PosGuideStep {
  stepNumber: number;
  sectionId: 'search' | 'scanner' | 'categories' | 'products' | 'cart' | 'checkout' | 'receipt';
  title: string;
  shortLabel: string;
  summary: string;
  tips: string[];
  icon: React.ComponentType<{ className?: string }>;
}

export const POS_GUIDE_STEPS: PosGuideStep[] = [
  {
    stepNumber: 1,
    sectionId: 'search',
    title: 'ວິທີຄົ້ນຫາສິນຄ້າ',
    shortLabel: 'ຄົ້ນຫາສິນຄ້າ',
    summary: 'ພິມຊື່ສິນຄ້າ ລະຫັດສິນຄ້າ (SKU) ຫຼື ບາໂຄດ ລົງໃນຊ່ອງຄົ້ນຫາຂະໜາດໃຫຍ່ດ້ານເທິງ',
    tips: [
      'ພິມຄຳຄົ້ນຫາບາງສ່ວນໄດ້ທັນທີ ລະບົບຈະກັ່ນຕອງສິນຄ້າໃຫ້ໂດຍບໍ່ຕ້ອງໂຫຼດໜ້າໃໝ່',
      'ຫາກຄົ້ນຫາແລ້ວບໍ່ພົບສິນຄ້າ ສາມາດກົດປຸ່ມ "ເພີ່ມສິນຄ້າໃໝ່" ໄດ້ຈາກໜ້າຂາຍທັນທີ',
    ],
    icon: Search,
  },
  {
    stepNumber: 2,
    sectionId: 'scanner',
    title: 'ວິທີສະແກນບາໂຄດ',
    shortLabel: 'ສະແກນບາໂຄດ',
    summary: 'ໃຊ້ເຄື່ອງຍິງບາໂຄດທີ່ຊ່ອງຄົ້ນຫາແລ້ວກົດ Enter ຫຼື ກົດປຸ່ມ "ສະແກນດ້ວຍກ້ອງ"',
    tips: [
      'ຖ້າໃຊ້ເຄື່ອງສະແກນບາໂຄດ ໃຫ້ຄລິກຊ່ອງຄົ້ນຫາ ຫຼື ກົດປຸ່ມ "ສະແກນບາໂຄດ" ແລ້ວຍິງລະຫັດໄດ້ເລີຍ',
      'ຖ້າບໍ່ມີເຄື່ອງສະແກນ ກົດປຸ່ມ "ສະແກນດ້ວຍກ້ອງ" ເພື່ອເປີດກ້ອງມືຖື ຫຼື ຄອມພິວເຕີສະແກນ Barcode / QR Code',
    ],
    icon: QrCode,
  },
  {
    stepNumber: 3,
    sectionId: 'categories',
    title: 'ວິທີເລືອກໝວດໝູ່',
    shortLabel: 'ເລືອກໝວດໝູ່',
    summary: 'ກົດປຸ່ມໝວດໝູ່ເພື່ອເບິ່ງສິນຄ້າແຍກຕາມປະເພດ ຫຼື ກົດ "ທັງໝົດ" ເພື່ອເບິ່ງສິນຄ້າທຸກລາຍການ',
    tips: [
      'ເລື່ອນແຖບໝວດໝູ່ໄປຊ້າຍ–ຂວາໄດ້ເມື່ອຮ້ານມີຫຼາຍໝວດໝູ່',
      'ໃຊ້ຊ່ອງ "ຄົ້ນຫາໝວດໝູ່..." ເພື່ອຫາຊື່ໝວດໝູ່ທີ່ຕ້ອງການຢ່າງວ່ອງໄວ',
    ],
    icon: FolderKanban,
  },
  {
    stepNumber: 4,
    sectionId: 'products',
    title: 'ວິທີເພີ່ມສິນຄ້າລົງກະຕ່າ',
    shortLabel: 'ເພີ່ມໃສ່ກະຕ່າ',
    summary: 'ກົດປຸ່ມ "ເພີ່ມໃສ່ກະຕ່າ" ເທິງກາດສິນຄ້າ ຫຼື ເລືອກໜ່ວຍຂາຍ (ເຊັ່ນ ອັນ / ແພັກ / ລັງ) ທີ່ຕ້ອງການ',
    tips: [
      'ລາຄາຂາຍຈະປ່ຽນຕາມປະເພດລາຄາທີ່ເລືອກດ້ານເທິງ (ຂາຍຍ່ອຍ / ຂາຍສົ່ງ / ສະມາຊິກ)',
      'ຈຳນວນສິນຄ້າຄົງເຫຼືອຈະສະແດງເທິງກາດສິນຄ້າເພື່ອປ້ອງກັນສິນຄ້າຂາດສະຕັອກ',
    ],
    icon: PlusCircle,
  },
  {
    stepNumber: 5,
    sectionId: 'cart',
    title: 'ວິທີແກ້ໄຂຈຳນວນສິນຄ້າ',
    shortLabel: 'ແກ້ໄຂຈຳນວນ',
    summary: 'ໃນສ່ວນກະຕ່າສິນຄ້າ ສາມາດກົດປຸ່ມ + / - ພິມຈຳນວນ ປ່ຽນໜ່ວຍ ຫຼື ກົດ "ລຶບສິນຄ້າ" ໄດ້',
    tips: [
      'ກົດປຸ່ມ + ເພື່ອເພີ່ມຈຳນວນ ຫຼື ກົດປຸ່ມ - ເພື່ອຫຼຸດຈຳນວນເທື່ອລະ 1',
      'ສາມາດກົດປຸ່ມ "ພັກບິນ" ໄວ້ຊົ່ວຄາວໄດ້ຫາກລູກຄ້າຂໍໄປຈັບສິນຄ້າເພີ່ມ',
    ],
    icon: SlidersHorizontal,
  },
  {
    stepNumber: 6,
    sectionId: 'checkout',
    title: 'ວິທີຊຳລະເງິນ',
    shortLabel: 'ຊຳລະເງິນ',
    summary: 'ກວດສອບຍອດລວມສິນຄ້າ ແລະ ສ່ວນຫຼຸດ ຈາກນັ້ນກົດປຸ່ມ "ຊຳລະເງິນ" ດ້ານລຸ່ມກະຕ່າ',
    tips: [
      'ເລືອກວິທີຊຳລະເງິນທີ່ລູກຄ້າໃຊ້ (ເງິນສົດ, ໂອນເງິນ, QR Pay, ຂາຍເຊື່ອ ຫຼື ຫຼາຍຊ່ອງທາງ)',
      'ຫາກຮັບເງິນສົດ ປ້ອນຈຳນວນເງິນທີ່ຮັບມາ ລະບົບຈະຄຳນວນ "ເງິນທອນ" ໃຫ້ອັດຕະໂນມັດ ແລ້ວກົດ "ຢືນຢັນການຂາຍ"',
    ],
    icon: CreditCard,
  },
  {
    stepNumber: 7,
    sectionId: 'receipt',
    title: 'ວິທີພິມໃບບິນ',
    shortLabel: 'ພິມໃບບິນ',
    summary: 'ເມື່ອບັນທຶກການຂາຍສຳເລັດ ໜ້າຕ່າງໃບບິນຮັບເງິນຈະເປີດຂຶ້ນທັນທີ',
    tips: [
      'ເລືອກຂະໜາດເຈ້ຍໃບບິນ (80mm ຫຼື 58mm) ແລ້ວກົດປຸ່ມ "ພິມໃບບິນ"',
      'ກົດ "ປິດໜ້າຕ່າງ" ເພື່ອເລີ່ມຂາຍໃຫ້ລູກຄ້າຄົນຕໍ່ໄປໄດ້ທັນທີ',
    ],
    icon: Printer,
  },
];

interface PosBeginnerGuideModalProps {
  open: boolean;
  onStepChange?: (sectionId: PosGuideStep['sectionId'] | null) => void;
  onComplete: () => void;
  onSkip: () => void;
}

export function PosBeginnerGuideModal({
  open,
  onStepChange,
  onComplete,
  onSkip,
}: PosBeginnerGuideModalProps) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setStepIndex(0);
    }
  }, [open]);

  const currentStep = POS_GUIDE_STEPS[stepIndex] ?? POS_GUIDE_STEPS[0];

  useEffect(() => {
    if (!onStepChange) return;
    if (open) {
      onStepChange(currentStep.sectionId);
    } else {
      onStepChange(null);
    }
  }, [open, currentStep.sectionId, onStepChange]);

  if (!open) return null;

  const Icon = currentStep.icon;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === POS_GUIDE_STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pos-guide-title"
    >
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden my-4">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 id="pos-guide-title" className="text-base font-bold text-slate-900">
                ຄຳແນະນຳການໃຊ້ງານໜ້າຂາຍສິນຄ້າ (POS)
              </h2>
              <p className="text-xs text-slate-500">
                ຮຽນຮູ້ການໃຊ້ງານງ່າຍໆ 7 ຂັ້ນຕອນ ສຳລັບພະນັກງານໃໝ່ · ຂັ້ນຕອນທີ {currentStep.stepNumber} ຈາກ{' '}
                {POS_GUIDE_STEPS.length}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>ຂ້າມຄຳແນະນຳ</span>
          </button>
        </div>

        {/* Clickable Step Navigation Strip */}
        <div className="px-5 py-3 border-b border-slate-100 bg-white overflow-x-auto">
          <div className="flex items-center gap-1.5 min-w-max">
            {POS_GUIDE_STEPS.map((step, idx) => {
              const active = idx === stepIndex;
              const completed = idx < stepIndex;
              return (
                <button
                  key={step.stepNumber}
                  type="button"
                  onClick={() => setStepIndex(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer transition-colors border ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : completed
                        ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className="tabular-nums font-bold">{step.stepNumber}.</span>
                  <span>{step.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="p-5 sm:p-6 space-y-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
              <Icon className="w-6 h-6" />
            </div>
            <div className="space-y-1.5 min-w-0">
              <div className="text-xs font-semibold text-blue-600">
                ຂັ້ນຕອນທີ {currentStep.stepNumber} ຈາກ {POS_GUIDE_STEPS.length}
              </div>
              <h3 className="text-lg font-bold text-slate-900">{currentStep.title}</h3>
              <p className="text-sm text-slate-700 leading-relaxed">{currentStep.summary}</p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
            <div className="text-xs font-semibold text-slate-700">ວິທີປະຕິບັດເທື່ອລະຂັ້ນ</div>
            <ul className="space-y-2">
              {currentStep.tips.map((tip, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Preview of POS Flow */}
          <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
            <div className="flex items-center gap-1.5">
              <ShoppingCart className="w-4 h-4 text-slate-400" />
              <span>ສາມາດກົດປຸ່ມ &ldquo;ຄູ່ມືໃຊ້ງານ POS&rdquo; ດ້ານເທິງເພື່ອເປີດເບິ່ງອີກຄັ້ງໄດ້ຕະຫຼອດເວລາ</span>
            </div>
          </div>
        </div>

        {/* Footer Controls */}
        <div className="px-5 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-lg cursor-pointer"
          >
            ຂ້າມໄປໜ້າຂາຍເລີຍ
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isFirst}
              onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
              className="inline-flex items-center gap-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>ຍ້ອນກັບ</span>
            </button>

            {isLast ? (
              <button
                type="button"
                onClick={onComplete}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>ເລີ່ມຂາຍສິນຄ້າເລີຍ</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setStepIndex((prev) => Math.min(POS_GUIDE_STEPS.length - 1, prev + 1))
                }
                className="inline-flex items-center gap-1 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
              >
                <span>ຂັ້ນຕອນຕໍ່ໄປ</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
