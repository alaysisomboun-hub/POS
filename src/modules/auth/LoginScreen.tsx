import { useState } from 'react';
import { Store, ShieldCheck, ArrowRight, Lock } from 'lucide-react';
import { useFirebase } from '../../core/firebase/FirebaseProvider';

export function LoginScreen() {
  const { signInWithGoogle, authError, connectionOk } = useFirebase();
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } finally {
      setSubmitting(false);
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

        {authError && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 break-words">
            {authError}
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
