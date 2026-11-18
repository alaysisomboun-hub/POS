import React, { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  Camera,
  ImageUp,
  Keyboard,
  Loader2,
  RefreshCw,
  ScanBarcode,
  SwitchCamera,
  X,
} from 'lucide-react';

interface CameraOption {
  id: string;
  label: string;
}

interface BarcodeQrScannerModalProps {
  title?: string;
  subtitle?: string;
  onDetected: (code: string) => void;
  onClose: () => void;
}

function playScanBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1250, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 150);
  } catch {
    // Ignore audio errors on restricted browsers
  }
}

export function BarcodeQrScannerModal({
  title = 'สแกนบาร์โค้ด / QR Code สินค้า',
  subtitle = 'รองรับกล้องมือถือ/คอมพิวเตอร์ และเครื่องสแกนบาร์โค้ด USB หรือ Bluetooth',
  onDetected,
  onClose,
}: BarcodeQrScannerModalProps) {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const readerId = `scanner_view_${reactId}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const detectedLockRef = useRef(false);
  const manualInputRef = useRef<HTMLInputElement | null>(null);

  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [cameraState, setCameraState] = useState<'starting' | 'active' | 'error'>('starting');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [fileScanning, setFileScanning] = useState(false);

  const stopScannerSafely = async () => {
    const inst = scannerRef.current;
    if (!inst) return;
    try {
      if (inst.isScanning) {
        await inst.stop();
      }
    } catch {
      // Ignore stop errors if already stopped
    }
    try {
      inst.clear();
    } catch {
      // Ignore clear errors
    }
  };

  const emitCode = async (raw: string) => {
    const clean = raw.trim();
    if (!clean || detectedLockRef.current) return;
    detectedLockRef.current = true;
    playScanBeep();
    await stopScannerSafely();
    onDetected(clean);
  };

  const startCamera = async (preferredCameraId?: string) => {
    setCameraState('starting');
    setCameraError(null);
    await stopScannerSafely();

    if (!document.getElementById(readerId)) return;

    const inst = new Html5Qrcode(readerId, {
      useBarCodeDetectorIfSupported: true,
      verbose: false,
    });
    scannerRef.current = inst;

    const scanConfig = {
      fps: 12,
      qrbox: { width: 260, height: 170 },
      aspectRatio: 1.5,
    };

    const onSuccess = (decodedText: string) => {
      void emitCode(decodedText);
    };

    try {
      const target: string | MediaTrackConstraints = preferredCameraId
        ? preferredCameraId
        : { facingMode: 'environment' };

      await inst.start(target, scanConfig, onSuccess, () => {});
      setCameraState('active');

      if (cameras.length === 0) {
        Html5Qrcode.getCameras()
          .then((list) => {
            if (list.length > 0) {
              setCameras(list.map((c) => ({ id: c.id, label: c.label || `กล้อง ${c.id.slice(0, 6)}` })));
              if (preferredCameraId) {
                setSelectedCameraId(preferredCameraId);
              }
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      // Fallback to first enumerated camera if facingMode: environment failed on desktop webcam
      if (!preferredCameraId) {
        try {
          const list = await Html5Qrcode.getCameras();
          if (list.length > 0) {
            setCameras(list.map((c) => ({ id: c.id, label: c.label || `กล้อง ${c.id.slice(0, 6)}` })));
            setSelectedCameraId(list[0].id);
            await inst.start(list[0].id, scanConfig, onSuccess, () => {});
            setCameraState('active');
            return;
          }
        } catch {
          // Fall through to readable Thai error below
        }
      }

      const rawMsg = err instanceof Error ? err.message : String(err);
      let friendly = 'ไม่สามารถเปิดกล้องได้ กรุณาตรวจสอบสิทธิ์การใช้กล้อง หรือใช้เครื่องสแกน USB/Bluetooth ด้านล่าง';
      if (rawMsg.toLowerCase().includes('notallowed') || rawMsg.toLowerCase().includes('permission')) {
        friendly = 'เบราว์เซอร์ไม่ได้รับอนุญาตให้เข้าถึงกล้อง กรุณากดอนุญาตกล้อง หรือใช้การสแกนจากเครื่อง USB/Bluetooth หรืออัปโหลดรูปภาพ';
      } else if (rawMsg.toLowerCase().includes('notfound')) {
        friendly = 'ไม่พบกล้องในอุปกรณ์นี้ คุณยังสามารถสแกนผ่านเครื่อง USB / Bluetooth หรืออัปโหลดรูปบาร์โค้ด/QR ได้ทันที';
      }
      setCameraError(friendly);
      setCameraState('error');
    }
  };

  useEffect(() => {
    detectedLockRef.current = false;
    void startCamera();
    const focusTimer = setTimeout(() => {
      manualInputRef.current?.focus();
    }, 250);

    return () => {
      clearTimeout(focusTimer);
      void stopScannerSafely();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSwitchCamera = () => {
    if (cameras.length < 2) return;
    const currentIdx = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextCam = cameras[(currentIdx + 1) % cameras.length];
    if (nextCam) {
      setSelectedCameraId(nextCam.id);
      void startCamera(nextCam.id);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    void emitCode(manualCode);
  };

  const handleScanImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setFileScanning(true);
    setCameraError(null);
    try {
      await stopScannerSafely();
      const inst = new Html5Qrcode(readerId, { verbose: false });
      scannerRef.current = inst;
      const decoded = await inst.scanFile(file, false);
      await emitCode(decoded);
    } catch {
      setCameraError('ไม่พบบาร์โค้ดหรือ QR Code ในรูปภาพที่เลือก กรุณาลองรูปที่ชัดขึ้น');
      setCameraState('error');
    } finally {
      setFileScanning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden my-6">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <ScanBarcode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              void stopScannerSafely().finally(onClose);
            }}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Camera Viewfinder */}
          <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-200 min-h-[240px] flex items-center justify-center">
            <div id={readerId} className="w-full" />

            {cameraState === 'starting' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/80 text-white text-xs">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                <span>กำลังเปิดกล้องเพื่อสแกน Barcode / QR Code...</span>
              </div>
            )}

            {cameraState === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 bg-slate-900/95 text-center">
                <Camera className="w-8 h-8 text-slate-400" />
                <p className="text-xs text-slate-200 leading-relaxed max-w-sm">
                  {cameraError}
                </p>
                <button
                  type="button"
                  onClick={() => void startCamera(selectedCameraId || undefined)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  ลองเปิดกล้องอีกครั้ง
                </button>
              </div>
            )}
          </div>

          {/* Camera & File Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {cameras.length > 1 && (
                <button
                  type="button"
                  onClick={handleSwitchCamera}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
                >
                  <SwitchCamera className="w-3.5 h-3.5" />
                  สลับกล้อง ({cameras.length})
                </button>
              )}

              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer">
                {fileScanning ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ImageUp className="w-3.5 h-3.5" />
                )}
                สแกนจากรูปภาพ
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleScanImageFile}
                  className="hidden"
                />
              </label>
            </div>

            <span className="text-[11px] text-slate-400">
              EAN-13 · Code-128 · UPC · QR Code
            </span>
          </div>

          {/* USB / Bluetooth Hardware Scanner or Manual Input */}
          <form
            onSubmit={handleManualSubmit}
            className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <Keyboard className="w-4 h-4 text-blue-600" />
              เครื่องสแกน USB / Bluetooth หรือพิมพ์รหัสสินค้า
            </div>
            <div className="flex gap-2">
              <input
                ref={manualInputRef}
                type="text"
                maxLength={64}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="ยิงบาร์โค้ดด้วยเครื่องสแกน หรือพิมพ์รหัสแล้วกด Enter..."
                className="flex-1 px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                ตกลง
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
