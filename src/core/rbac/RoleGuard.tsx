import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useFirebase } from '../firebase/FirebaseProvider';
import { hasPermission } from './permissions';
import type { ModuleKey, PermissionAction } from '../firebase/types';

interface RoleGuardProps {
  moduleKey: ModuleKey;
  action?: PermissionAction;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RoleGuard({
  moduleKey,
  action = 'view',
  children,
  fallback,
}: RoleGuardProps) {
  const { userProfile } = useFirebase();

  if (!hasPermission(userProfile, moduleKey, action)) {
    if (fallback !== undefined) {
      return <>{fallback}</>;
    }
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-lg mx-auto my-8">
        <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-3">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-base font-semibold text-slate-900 mb-1">ไม่มีสิทธิ์เข้าถึงส่วนนี้</h2>
        <p className="text-sm text-slate-600">
          บัญชีของคุณยังไม่ได้รับอนุญาตให้ดำเนินการในโมดูลนี้ กรุณาติดต่อผู้ดูแลระบบหรือเจ้าของร้าน
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
