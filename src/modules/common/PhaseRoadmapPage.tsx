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
            ກຳນົດພັດທະນາໃນ Phase {item?.phase ?? '-'} ຕາມແຜນການພັດທະນາແບບແບ່ງໄລຍະ
          </p>
        </div>
      </div>

      <p className="text-sm text-slate-600 leading-relaxed">
        {item?.description}
      </p>

      <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">
        ປັດຈຸບັນລະບົບພັດທະນາສຳເລັດເຖິງ <strong>Phase 4 (ອົງກອນ, ສິດ 7 ລະດັບ, ສິນຄ້າ, ສາງສິນຄ້າ, ລະບົບຂາຍໜ້າຮ້ານ POS, ພິມໃບບິນ ແລະ ປະຫວັດການຂາຍ/ຮັບຄືນ)</strong>{' '}
        ໂມດູນນີ້ຈະຖືກສ້າງພ້ອມຖານຂໍ້ມູນຈິງໃນ Phase {item?.phase ?? '-'} ໂດຍບໍ່ມີຂໍ້ມູນຈຳລອງຫຼືປຸ່ມຕົວຢ່າງ
      </div>

      <div className="flex flex-wrap gap-2.5 pt-2">
        <button
          type="button"
          onClick={() => onNavigate('pos')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium rounded-lg cursor-pointer"
        >
          ໄປທີ່ POS ຂາຍສິນຄ້າ
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onNavigate('products')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-medium rounded-lg cursor-pointer"
        >
          ໄປທີ່ຈັດການສິນຄ້າ
        </button>
        <button
          type="button"
          onClick={() => onNavigate('inventory')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-medium rounded-lg cursor-pointer"
        >
          ໄປທີ່ສາງສິນຄ້າ
        </button>
      </div>
    </div>
  );
}
