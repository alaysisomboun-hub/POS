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
    title: 'วิธีค้นหาสินค้า',
    shortLabel: 'ค้นหาสินค้า',
    summary: 'พิมพ์ชื่อสินค้า รหัสสินค้า (SKU) หรือบาร์โค้ด ลงในช่องค้นหาขนาดใหญ่ด้านบนสุด',
    tips: [
      'พิมพ์คำค้นหาบางส่วนได้ทันที ระบบจะกรองสินค้าให้โดยไม่ต้องโหลดหน้าใหม่',
      'หากค้นหาแล้วไม่พบสินค้า สามารถกดปุ่ม "เพิ่มสินค้าใหม่" ได้จากหน้าขายทันที',
    ],
    icon: Search,
  },
  {
    stepNumber: 2,
    sectionId: 'scanner',
    title: 'วิธีสแกนบาร์โค้ด',
    shortLabel: 'สแกนบาร์โค้ด',
    summary: 'ใช้เครื่องยิงบาร์โค้ดที่ช่องค้นหาแล้วกด Enter หรือกดปุ่ม "สแกนด้วยกล้อง"',
    tips: [
      'ถ้าใช้เครื่องสแกนบาร์โค้ด ให้คลิกช่องค้นหาหรือกดปุ่ม "สแกนบาร์โค้ด" แล้วยิงรหัสได้เลย',
      'ถ้าไม่มีเครื่องสแกน กดปุ่ม "สแกนด้วยกล้อง" เพื่อเปิดกล้องมือถือหรือกล้องคอมพิวเตอร์สแกน Barcode / QR Code',
    ],
    icon: QrCode,
  },
  {
    stepNumber: 3,
    sectionId: 'categories',
    title: 'วิธีเลือกหมวดหมู่',
    shortLabel: 'เลือกหมวดหมู่',
    summary: 'กดปุ่มหมวดหมู่เพื่อดูสินค้าแยกตามประเภท หรือกด "ทั้งหมด" เพื่อดูสินค้าทุกรายการ',
    tips: [
      'เลื่อนแถบหมวดหมู่ไปซ้าย–ขวาได้เมื่อร้านมีหลายหมวดหมู่',
      'ใช้ช่อง "ค้นหาหมวดหมู่..." เพื่อหาชื่อหมวดหมู่ที่ต้องการอย่างรวดเร็ว',
    ],
    icon: FolderKanban,
  },
  {
    stepNumber: 4,
    sectionId: 'products',
    title: 'วิธีเพิ่มสินค้าลงตะกร้า',
    shortLabel: 'เพิ่มลงตะกร้า',
    summary: 'กดปุ่ม "เพิ่มลงตะกร้า" บนการ์ดสินค้า หรือเลือกหน่วยขาย (เช่น ชิ้น / แพ็ค / ลัง) ที่ต้องการ',
    tips: [
      'ราคาขายจะเปลี่ยนตามประเภทราคาที่เลือกด้านบน (ขายปลีก / ขายส่ง / สมาชิก)',
      'จำนวนสินค้าคงเหลือจะแสดงบนการ์ดสินค้าเพื่อป้องกันสินค้าขาดสต็อก',
    ],
    icon: PlusCircle,
  },
  {
    stepNumber: 5,
    sectionId: 'cart',
    title: 'วิธีแก้ไขจำนวนสินค้า',
    shortLabel: 'แก้ไขจำนวน',
    summary: 'ในส่วนตะกร้าสินค้า สามารถกดปุ่ม + / - พิมพ์จำนวน เปลี่ยนหน่วย หรือกด "ลบสินค้า" ได้',
    tips: [
      'กดปุ่ม + เพื่อเพิ่มจำนวน หรือกดปุ่ม - เพื่อลดจำนวนทีละ 1',
      'สามารถกดปุ่ม "พักบิล" ไว้ชั่วคราวได้หากลูกค้าขอไปหยิบสินค้าเพิ่ม',
    ],
    icon: SlidersHorizontal,
  },
  {
    stepNumber: 6,
    sectionId: 'checkout',
    title: 'วิธีชำระเงิน',
    shortLabel: 'ชำระเงิน',
    summary: 'ตรวจสอบยอดรวมสินค้าและส่วนลด จากนั้นกดปุ่ม "ชำระเงิน" ด้านล่างตะกร้า',
    tips: [
      'เลือกวิธีชำระเงินที่ลูกค้าใช้ (เงินสด, โอนเงิน, QR Pay, ขายเชื่อ หรือหลายช่องทาง)',
      'หากรับเงินสด กรอกจำนวนเงินที่รับมา ระบบจะคำนวณ "เงินทอน" ให้อัตโนมัติ แล้วกด "ยืนยันการขาย"',
    ],
    icon: CreditCard,
  },
  {
    stepNumber: 7,
    sectionId: 'receipt',
    title: 'วิธีพิมพ์ใบเสร็จ',
    shortLabel: 'พิมพ์ใบเสร็จ',
    summary: 'เมื่อบันทึกการขายสำเร็จ หน้าต่างใบเสร็จรับเงินจะเปิดขึ้นทันที',
    tips: [
      'เลือกขนาดกระดาษใบเสร็จ (80mm หรือ 58mm) แล้วกดปุ่ม "พิมพ์ใบเสร็จ"',
      'กด "ปิดหน้าต่าง" เพื่อเริ่มขายให้ลูกค้าคนถัดไปได้ทันที',
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
                คำแนะนำการใช้งานหน้าขายสินค้า (POS)
              </h2>
              <p className="text-xs text-slate-500">
                เรียนรู้การใช้งานง่าย ๆ 7 ขั้นตอน สำหรับพนักงานใหม่ · ขั้นตอนที่ {currentStep.stepNumber} จาก{' '}
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
            <span>ข้ามคำแนะนำ</span>
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
                ขั้นตอนที่ {currentStep.stepNumber} จาก {POS_GUIDE_STEPS.length}
              </div>
              <h3 className="text-lg font-bold text-slate-900">{currentStep.title}</h3>
              <p className="text-sm text-slate-700 leading-relaxed">{currentStep.summary}</p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
            <div className="text-xs font-semibold text-slate-700">วิธีทำทีละขั้น</div>
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
              <span>สามารถกดปุ่ม &ldquo;คู่มือใช้งาน POS&rdquo; ด้านบนเพื่อเปิดดูอีกครั้งได้ตลอดเวลา</span>
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
            ข้ามไปหน้าขายเลย
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isFirst}
              onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
              className="inline-flex items-center gap-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>ย้อนกลับ</span>
            </button>

            {isLast ? (
              <button
                type="button"
                onClick={onComplete}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>เริ่มขายสินค้าเลย</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setStepIndex((prev) => Math.min(POS_GUIDE_STEPS.length - 1, prev + 1))
                }
                className="inline-flex items-center gap-1 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
              >
                <span>ขั้นตอนถัดไป</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
