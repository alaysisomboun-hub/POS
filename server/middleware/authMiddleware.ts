import { createRequire } from 'module';
import type { Request, Response, NextFunction } from 'express';
import { getApps, getApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const require = createRequire(import.meta.url);
const firebaseConfig = require('../../firebase-applet-config.json') as {
  projectId?: string;
};

function getFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }
  if (!firebaseConfig.projectId || firebaseConfig.projectId === 'remixed-project-id') {
    throw new Error('Firebase projectId is not configured in firebase-applet-config.json');
  }
  return initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

export interface AuthenticatedRequest extends Request {
  authUser?: {
    uid: string;
    email?: string;
    emailVerified: boolean;
  };
}

export async function verifyFirebaseToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'ไม่พบ Token ยืนยันตัวตน (Missing Bearer token)' });
    return;
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) {
    res.status(401).json({ error: 'Token ไม่ถูกต้อง' });
    return;
  }

  try {
    const app = getFirebaseAdminApp();
    const decoded = await getAuth(app).verifyIdToken(idToken);
    if (!decoded.email_verified) {
      res.status(403).json({ error: 'อีเมลยังไม่ได้รับการยืนยัน (Email not verified)' });
      return;
    }
    req.authUser = {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: Boolean(decoded.email_verified),
    };
    next();
  } catch (err) {
    console.error('Firebase ID token verification failed:', err);
    res.status(401).json({ error: 'Token หมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่' });
  }
}
