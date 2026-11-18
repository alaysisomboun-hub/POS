import { useMemo, useState } from 'react';
import { Printer, X } from 'lucide-react';
import { encodeCode128B } from '../../core/utils/barcode';
import { formatDateTimeVientiane } from '../../core/utils/date';
import { formatLak } from '../../core/utils/money';
import type { SaleOrder, SystemSetting } from '../../core/firebase/types';

interface ReceiptPrintModalProps {
  sale: SaleOrder;
  settings: SystemSetting | null;
  storeName: string;
  onClose: () => void;
}

const PRICE_TIER_LABEL: Record<SaleOrder['priceTier'], string> = {
  retail: 'ขายปลีก',
  wholesale: 'ขายส่ง',
  member: 'ราคาสมาชิก',
};

const PAYMENT_SPLIT_LABEL: Record<'cash' | 'transfer' | 'qr' | 'credit', string> = {
  cash: 'เงินสด',
  transfer: 'โอนเงิน',
  qr: 'QR Payment',
  credit: 'ขายเชื่อ/ค้างชำระ',
};

export function ReceiptPrintModal({
  sale,
  settings,
  storeName,
  onClose,
}: ReceiptPrintModalProps) {
  const [paperSize, setPaperSize] = useState<'80mm' | '58mm'>(
    settings?.receiptSettings?.paperSize ?? '80mm',
  );

  const encodedInvoice = useMemo(
    () => encodeCode128B(sale.invoiceNumber),
    [sale.invoiceNumber],
  );

  const displayStoreName = settings?.storeProfile?.name?.trim() || storeName;
  const logoUrl = settings?.storeProfile?.logoUrl?.trim() || '';
  const address = settings?.storeProfile?.address?.trim() || '';
  const phone = settings?.storeProfile?.phone?.trim() || '';
  const headerText = settings?.receiptSettings?.headerText?.trim() || '';
  const footerText = settings?.receiptSettings?.footerText?.trim() || 'ขอบคุณที่ใช้บริการ';
  const showTaxId =
    Boolean(settings?.receiptSettings?.showTaxId) &&
    Boolean(settings?.taxSettings?.taxId?.trim());
  const showBarcode = settings?.receiptSettings?.showQr ?? true;

  const totalDiscountLak = sale.itemDiscountTotalLak + sale.billDiscountLak;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto print:bg-white print:p-0 print:static">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-5 print:border-none print:p-0 print:max-w-none">
        {/* Toolbar (hidden on print) */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 print:hidden">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-slate-900">ใบเสร็จรับเงิน</h3>
            <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-md text-xs">
              <button
                type="button"
                onClick={() => setPaperSize('80mm')}
                className={`px-2.5 py-1 rounded cursor-pointer font-medium ${
                  paperSize === '80mm'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                80mm
              </button>
              <button
                type="button"
                onClick={() => setPaperSize('58mm')}
                className={`px-2.5 py-1 rounded cursor-pointer font-medium ${
                  paperSize === '58mm'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                58mm
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Receipt Body Preview & Print */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex justify-center overflow-x-auto print:bg-white print:border-none print:p-0">
          <div
            className={`bg-white text-slate-900 border border-slate-200 print:border-none shadow-xs print:shadow-none p-4 font-sans ${
              paperSize === '58mm' ? 'w-[220px] text-[11px]' : 'w-[302px] text-xs'
            }`}
          >
            {/* Store Header */}
            <div className="text-center space-y-0.5 pb-2 border-b border-dashed border-slate-300">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt={displayStoreName}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                  className="h-10 max-w-[120px] object-contain mx-auto mb-1"
                />
              )}
              <div className="font-bold text-sm leading-tight">{displayStoreName}</div>
              {headerText && headerText !== displayStoreName && (
                <div className="text-[11px] text-slate-700">{headerText}</div>
              )}
              {address && <div className="text-[10px] text-slate-600">{address}</div>}
              {phone && <div className="text-[10px] text-slate-600">โทร: {phone}</div>}
              {showTaxId && (
                <div className="text-[10px] font-mono text-slate-700">
                  TIN: {settings?.taxSettings?.taxId}
                </div>
              )}
            </div>

            {/* Meta Info */}
            <div className="py-2 border-b border-dashed border-slate-300 space-y-0.5 text-[11px]">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">เลขที่บิล:</span>
                <span className="font-mono font-semibold">{sale.invoiceNumber}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">วันที่:</span>
                <span className="tabular-nums">{formatDateTimeVientiane(sale.createdAt)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">แคชเชียร์:</span>
                <span className="truncate">{sale.cashierName}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">ลูกค้า:</span>
                <span className="truncate">
                  {sale.customerName} ({PRICE_TIER_LABEL[sale.priceTier]})
                </span>
              </div>
              {sale.status === 'voided' && (
                <div className="text-center font-bold text-red-600 pt-1">
                  *** บิลถูกยกเลิก (VOIDED) ***
                </div>
              )}
            </div>

            {/* Items */}
            <div className="py-2 border-b border-dashed border-slate-300 space-y-1.5">
              {sale.items.map((item, idx) => (
                <div key={`${item.productId}_${item.unitId}_${idx}`} className="space-y-0.5">
                  <div className="font-medium leading-tight">{item.name}</div>
                  <div className="flex justify-between gap-2 text-[11px] text-slate-700 tabular-nums">
                    <span>
                      {item.qty} {item.unitName} x {formatLak(item.unitPriceLak, false)}
                    </span>
                    <span className="font-semibold text-slate-900">
                      {formatLak(item.lineTotalLak)}
                    </span>
                  </div>
                  {item.discountLak > 0 && (
                    <div className="flex justify-between text-[10px] text-slate-500 tabular-nums">
                      <span>ส่วนลดรายการ</span>
                      <span>-{formatLak(item.discountLak)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="py-2 border-b border-dashed border-slate-300 space-y-1 text-[11px] tabular-nums">
              <div className="flex justify-between">
                <span className="text-slate-600">รวมเป็นเงิน</span>
                <span>{formatLak(sale.subtotalLak)}</span>
              </div>
              {totalDiscountLak > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>ส่วนลดรวม</span>
                  <span>-{formatLak(totalDiscountLak)}</span>
                </div>
              )}
              {sale.taxRate > 0 && (
                <>
                  <div className="flex justify-between text-slate-600">
                    <span>มูลค่าก่อนภาษี</span>
                    <span>{formatLak(sale.taxableAmountLak)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>ภาษี ({sale.taxRate}%)</span>
                    <span>{formatLak(sale.taxAmountLak)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-1 border-t border-slate-200">
                <span>ยอดสุทธิ</span>
                <span>{formatLak(sale.grandTotalLak)}</span>
              </div>
            </div>

            {/* Payments */}
            <div className="py-2 border-b border-dashed border-slate-300 space-y-0.5 text-[11px] tabular-nums">
              {sale.payments.map((p, idx) => (
                <div key={idx} className="flex justify-between text-slate-700">
                  <span>ชำระ ({PAYMENT_SPLIT_LABEL[p.method]})</span>
                  <span>{formatLak(p.amountLak)}</span>
                </div>
              ))}
              {sale.changeAmountLak > 0 && (
                <div className="flex justify-between font-semibold text-slate-900">
                  <span>เงินทอน</span>
                  <span>{formatLak(sale.changeAmountLak)}</span>
                </div>
              )}
              {sale.creditDueLak > 0 && (
                <div className="flex justify-between font-semibold text-amber-700">
                  <span>ยอดค้างชำระ</span>
                  <span>{formatLak(sale.creditDueLak)}</span>
                </div>
              )}
            </div>

            {/* Barcode & Footer */}
            <div className="pt-3 text-center space-y-1.5">
              {showBarcode && encodedInvoice.totalWidth > 0 && (
                <div>
                  <svg
                    viewBox={`0 0 ${encodedInvoice.totalWidth} 36`}
                    className="w-full h-8 mx-auto"
                    preserveAspectRatio="none"
                    aria-label={`Invoice Barcode ${sale.invoiceNumber}`}
                  >
                    {encodedInvoice.bars.map((bar, bIdx) => (
                      <rect
                        key={bIdx}
                        x={bar.x}
                        y={0}
                        width={bar.width}
                        height={36}
                        fill="#0f172a"
                      />
                    ))}
                  </svg>
                  <div className="text-[9px] font-mono text-slate-600">{sale.invoiceNumber}</div>
                </div>
              )}
              <div className="text-[11px] text-slate-700">{footerText}</div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-4 print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            พิมพ์ใบเสร็จ
          </button>
        </div>
      </div>
    </div>
  );
}
