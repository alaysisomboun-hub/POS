import { useState } from 'react';
import { Store, ShieldCheck, ArrowRight, Lock, Copy, Check } from 'lucide-react';
import { useFirebase } from '../../core/firebase/FirebaseProvider';
import firebaseConfig from '../../../firebase-applet-config.json';

export function LoginScreen() {
  const { signInWithGoogle, authError, connectionOk } = useFirebase();
  const [submitting, setSubmitting] = useState(false);
  const [copiedHost, setCopiedHost] = useState(false);

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const isUnauthorizedDomain = authError?.startsWith('auth/unauthorized-domain|') ?? false;
  const displayError = authError?.includes('|') ? authError.split('|')[1] : authError;

  const handleLogin = async () => {
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyHost = async () => {
    if (!currentHost) return;
    try {
      await navigator.clipboard.writeText(currentHost);
      setCopiedHost(true);
      setTimeout(() => setCopiedHost(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 leading-tight">
              Grocery POS Management
            </h1>
            <p className="text-xs text-slate-500">
              ระบบบริหารจัดการร้านขายของชำครบวงจร · สกุลเงิน LAK
            </p>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-6 mb-6">
          <h2 className="text-base font-semibold text-slate-900 mb-2">
            เข้าสู่ระบบเพื่อเริ่มใช้งาน
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            ระบบยืนยันตัวตนผ่าน Firebase Authentication เพื่อกำหนดสิทธิ์การใช้งานตามตำแหน่งงานและสาขาที่ได้รับมอบหมาย
          </p>
        </div>

        {!connectionOk && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
            ไม่สามารถเชื่อมต่อ Firestore ได้ในขณะนี้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต
          </div>
        )}

        {displayError && (
          <div className="mb-4 p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 space-y-2 break-words">
            <div className="font-semibold">{displayError}</div>
            {isUnauthorizedDomain && currentHost && (
              <div className="pt-1 space-y-2 text-slate-700">
                <p>
                  กรุณาเพิ่มโดเมนด้านล่างใน Firebase Console &gt; Authentication &gt; Settings &gt; Authorized domains (โปรเจกต์ <span className="font-mono font-semibold">{firebaseConfig.projectId}</span>):
                </p>
                <div className="flex items-center justify-between gap-2 bg-white border border-red-200 rounded px-2.5 py-1.5">
                  <code className="text-[11px] font-mono text-slate-900 truncate">{currentHost}</code>
                  <button
                    type="button"
                    onClick={handleCopyHost}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 rounded shrink-0 cursor-pointer"
                  >
                    {copiedHost ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedHost ? 'คัดลอกแล้ว' : 'คัดลอก'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleLogin}
          disabled={submitting}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
        >
          <span>{submitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วยบัญชี Google'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        <div className="mt-6 pt-5 border-t border-slate-100 space-y-2.5 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
            <span>ควบคุมสิทธิ์ 7 บทบาท แยกข้อมูลตามองค์กรและสาขา</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-blue-600 shrink-0" />
            <span>บันทึกประวัติการใช้งาน (Audit Log) ทุกการเปลี่ยนแปลง</span>
          </div>
        </div>
      </div>
    </div>
  );
}
