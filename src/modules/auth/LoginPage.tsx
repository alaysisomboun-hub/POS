import React, { useState } from 'react';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Mail,
  Store,
} from 'lucide-react';
import { auth, googleProvider } from '../../core/firebase/config';

function mapAuthErrorToThai(error: unknown): {
  message: string;
  isUnauthorizedDomain: boolean;
  isEmailDisabled: boolean;
} {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  const rawMessage = error instanceof Error ? error.message : String(error ?? '');

  if (code === 'auth/unauthorized-domain' || rawMessage.includes('auth/unauthorized-domain')) {
    return {
      isUnauthorizedDomain: true,
      isEmailDisabled: false,
      message: 'โดเมนนี้ยังไม่ได้รับอนุญาตให้เข้าสู่ระบบผ่าน Google OAuth ใน Firebase Console',
    };
  }
  if (code === 'auth/operation-not-allowed') {
    return {
      isUnauthorizedDomain: false,
      isEmailDisabled: true,
      message:
        'ระบบยืนยันตัวตนด้วยอีเมลและรหัสผ่าน (Email/Password) ยังไม่ถูกเปิดใช้งานใน Firebase Console (โปรเจกต์ peppy-palace-rnj8s) กรุณากดปุ่ม "เข้าสู่ระบบด้วยบัญชี Google" ด้านบนแทน',
    };
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    code === 'auth/invalid-email'
  ) {
    return {
      isUnauthorizedDomain: false,
      isEmailDisabled: false,
      message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบและลองใหม่อีกครั้ง',
    };
  }
  if (code === 'auth/user-disabled') {
    return {
      isUnauthorizedDomain: false,
      isEmailDisabled: false,
      message: 'บัญชีผู้ใช้งานนี้ถูกปิดใช้งานในระบบยืนยันตัวตน กรุณาติดต่อผู้ดูแลระบบ',
    };
  }
  if (code === 'auth/too-many-requests') {
    return {
      isUnauthorizedDomain: false,
      isEmailDisabled: false,
      message: 'มีการพยายามเข้าสู่ระบบผิดพลาดหลายครั้ง กรุณารอสักครู่แล้วลองใหม่',
    };
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return {
      isUnauthorizedDomain: false,
      isEmailDisabled: false,
      message: 'ยกเลิกการเข้าสู่ระบบด้วยบัญชี Google',
    };
  }
  if (code === 'auth/popup-blocked') {
    return {
      isUnauthorizedDomain: false,
      isEmailDisabled: false,
      message: 'เบราว์เซอร์บล็อกหน้าต่างป๊อปอัปของ Google กรุณาอนุญาตป๊อปอัปแล้วลองใหม่อีกครั้ง',
    };
  }
  if (code === 'auth/network-request-failed') {
    return {
      isUnauthorizedDomain: false,
      isEmailDisabled: false,
      message: 'ไม่สามารถเชื่อมต่อเครือข่ายได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต',
    };
  }
  return {
    isUnauthorizedDomain: false,
    isEmailDisabled: false,
    message: rawMessage || 'ไม่สามารถเข้าสู่ระบบได้ กรุณาลองใหม่อีกครั้ง',
  };
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [unauthorizedDomain, setUnauthorizedDomain] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);

  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setErrorMsg(null);
    setUnauthorizedDomain(false);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const mapped = mapAuthErrorToThai(error);
      setErrorMsg(mapped.message);
      setUnauthorizedDomain(mapped.isUnauthorizedDomain);
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setErrorMsg('กรุณากรอกอีเมลและรหัสผ่าน');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    setUnauthorizedDomain(false);
    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password);
    } catch (error) {
      const mapped = mapAuthErrorToThai(error);
      setErrorMsg(mapped.message);
      setUnauthorizedDomain(mapped.isUnauthorizedDomain);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyHostname = async () => {
    if (!currentHostname) return;
    try {
      await navigator.clipboard.writeText(currentHostname);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 2000);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-5">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-blue-600">Grocery POS</div>
              <h1 className="text-xl font-bold text-slate-900">เข้าสู่ระบบเพื่อเริ่มใช้งาน</h1>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            ระบบยืนยันตัวตนผ่าน Firebase Authentication เพื่อโหลดโปรไฟล์ บทบาท และสิทธิ์การใช้งานตามบัญชีของท่านอย่างถูกต้อง
          </p>
        </div>

        {unauthorizedDomain && currentHostname && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-2.5 text-xs text-red-800">
            <div className="flex items-start gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>
                โดเมนปัจจุบัน ({currentHostname}) ยังไม่ได้รับอนุญาตใน Firebase Authentication (Authorized domains)
              </span>
            </div>
            <p className="text-red-700 leading-relaxed">
              กรุณาเพิ่มโดเมนด้านล่างใน Firebase Console &gt; Authentication &gt; Settings &gt; Authorized domains (โปรเจกต์ peppy-palace-rnj8s):
            </p>
            <div className="flex items-center justify-between gap-2 bg-white border border-red-200 rounded-lg px-3 py-2">
              <code className="font-mono text-slate-800 truncate">{currentHostname}</code>
              <button
                type="button"
                onClick={handleCopyHostname}
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium shrink-0 cursor-pointer"
              >
                {copiedDomain ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    คัดลอกแล้ว
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    คัดลอก
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {errorMsg && !unauthorizedDomain && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Primary Google Sign-In CTA (configured & active out of the box) */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={submitting || googleLoading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer"
          >
            <span>
              {googleLoading ? 'กำลังเปิดหน้าต่าง Google...' : 'เข้าสู่ระบบด้วยบัญชี Google →'}
            </span>
          </button>
          <p className="text-[11px] text-slate-500 text-center">
            แนะนำ: เจ้าของร้าน ผู้จัดการ และพนักงานสามารถเข้าสู่ระบบด้วยบัญชี Google ที่ได้รับสิทธิ์ได้ทันที
          </p>
        </div>

        {/* Secondary Email / Password Sign-In (for stores that enable Email/Password provider) */}
        <div className="border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={() => setShowEmailForm((prev) => !prev)}
            className="w-full flex items-center justify-between text-xs font-medium text-slate-600 hover:text-slate-900 py-1 cursor-pointer"
          >
            <span>เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน (สำหรับบัญชีที่เปิดใช้งานแล้ว)</span>
            {showEmailForm ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {showEmailForm && (
            <form onSubmit={handleEmailLogin} className="space-y-3.5 pt-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  อีเมลพนักงาน / ผู้ดูแลระบบ
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@store.com"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">รหัสผ่าน</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="กรอกรหัสผ่าน"
                    className="w-full pl-9 pr-10 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || googleLoading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                {submitting ? 'กำลังตรวจสอบบัญชี...' : 'เข้าสู่ระบบด้วยอีเมล'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
