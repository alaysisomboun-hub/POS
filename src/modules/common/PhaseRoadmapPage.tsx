import { Layers, ArrowRight } from 'lucide-react';
import { MENU_ITEMS } from '../../core/rbac/permissions';
import type { ModuleKey } from '../../core/firebase/types';

interface PhaseRoadmapPageProps {
  moduleKey: ModuleKey;
  onNavigate: (key: ModuleKey) => void;
}

export function PhaseRoadmapPage({ moduleKey, onNavigate }: PhaseRoadmapPageProps) {
  const item = MENU_ITEMS.find((m) => m.key === moduleKey);

  return (
    <div className="max-w-2xl bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
          <Layers className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {item?.label ?? moduleKey}
          </h2>
          <p className="text-xs text-slate-500">
            กำหนดพัฒนาใน Phase {item?.phase ?? '-'} ตามแผนการพัฒนาแบบแบ่งระยะ
          </p>
        </div>
      </div>

      <p className="text-sm text-slate-600 leading-relaxed">
        {item?.description}
      </p>

      <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">
        ขณะนี้ระบบอยู่ใน <strong>Phase 2 (ระบบร้านค้าเดี่ยว, สิทธิ์พนักงาน 7 ระดับ และ Audit Log)</strong>{' '}
        โมดูลนี้จะถูกสร้างพร้อมฐานข้อมูลจริงใน Phase {item?.phase ?? '-'} โดยไม่มีข้อมูลจำลองหรือปุ่มตัวอย่าง
      </div>

      <div className="flex flex-wrap gap-2.5 pt-2">
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium rounded-lg cursor-pointer"
        >
          ไปที่ตั้งค่าร้านค้า
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onNavigate('staff')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-medium rounded-lg cursor-pointer"
        >
          ไปที่จัดการพนักงานและสิทธิ์
        </button>
      </div>
    </div>
  );
}
