import { useMemo, useState } from 'react';
import { Printer, X } from 'lucide-react';
import { encodeCode128B } from '../../core/utils/barcode';
import { formatLak } from '../../core/utils/money';
import type { Product } from '../../core/firebase/types';

interface BarcodeLabelModalProps {
  product: Product;
  storeName: string;
  onClose: () => void;
}

export function BarcodeLabelModal({ product, storeName, onClose }: BarcodeLabelModalProps) {
  const [selectedUnitId, setSelectedUnitId] = useState(product.units[0]?.unitId ?? '');
  const [priceTier, setPriceTier] = useState<'retail' | 'wholesale' | 'member'>('retail');
  const [copies, setCopies] = useState(4);

  const selectedUnit = useMemo(
    () => product.units.find((u) => u.unitId === selectedUnitId) ?? product.units[0],
    [product.units, selectedUnitId],
  );

  const codeToEncode = selectedUnit?.barcode?.trim() || product.barcode?.trim() || product.sku;

  const encoded = useMemo(() => encodeCode128B(codeToEncode), [codeToEncode]);

  const unitPrice = useMemo(() => {
    if (!selectedUnit) return product.retailPriceLak;
    if (priceTier === 'wholesale') return selectedUnit.wholesalePrice;
    if (priceTier === 'member') return selectedUnit.memberPrice;
    return selectedUnit.retailPrice;
  }, [selectedUnit, priceTier, product.retailPriceLak]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4 overflow-y-auto print:bg-white print:p-0 print:static">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl p-6 print:border-none print:p-0 print:max-w-none">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 print:hidden">
          <h3 className="text-base font-semibold text-slate-900">
            พิมพ์ฉลากบาร์โค้ด · {product.name}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5 print:hidden">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">หน่วยสินค้า</label>
            <select
              value={selectedUnit?.unitId ?? ''}
              onChange={(e) => setSelectedUnitId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
            >
              {product.units.map((u) => (
                <option key={u.unitId} value={u.unitId}>
                  {u.unitName} (x{u.conversionFactor})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">ระดับราคา</label>
            <select
              value={priceTier}
              onChange={(e) => setPriceTier(e.target.value as 'retail' | 'wholesale' | 'member')}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
            >
              <option value="retail">ราคาปลีก</option>
              <option value="wholesale">ราคาส่ง</option>
              <option value="member">ราคาสมาชิก</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">จำนวนดวงที่พิมพ์</label>
            <input
              type="number"
              min={1}
              max={24}
              value={copies}
              onChange={(e) => setCopies(Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg tabular-nums"
            />
          </div>
        </div>

        {/* Label Sheet Preview & Print Area */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 print:bg-white print:border-none print:p-0">
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 print:grid-cols-3 print:gap-2">
            {Array.from({ length: copies }).map((_, idx) => (
              <div
                key={idx}
                className="bg-white border border-slate-300 rounded-lg p-3 text-center space-y-1 break-inside-avoid"
              >
                <div className="text-[10px] text-slate-500 truncate">{storeName}</div>
                <div className="text-xs font-semibold text-slate-900 truncate">
                  {product.name} ({selectedUnit?.unitName ?? product.baseUnitName})
                </div>
                <div className="text-sm font-bold text-blue-700 tabular-nums">
                  {formatLak(unitPrice)}
                </div>
                {encoded.totalWidth > 0 && (
                  <svg
                    viewBox={`0 0 ${encoded.totalWidth} 44`}
                    className="w-full h-10 mx-auto"
                    preserveAspectRatio="none"
                    aria-label={`Barcode ${codeToEncode}`}
                  >
                    {encoded.bars.map((bar, bIdx) => (
                      <rect
                        key={bIdx}
                        x={bar.x}
                        y={0}
                        width={bar.width}
                        height={44}
                        fill="#0f172a"
                      />
                    ))}
                  </svg>
                )}
                <div className="text-[10px] font-mono text-slate-700 tracking-wider">
                  {codeToEncode}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            ปิด
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            สั่งพิมพ์ฉลาก
          </button>
        </div>
      </div>
    </div>
  );
}
