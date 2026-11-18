import { doc, serverTimestamp, setDoc, type WriteBatch } from 'firebase/firestore';
import { db } from './config';
import { OperationType, handleFirestoreError } from './errorHandler';
import { generateSafeId, getDeviceSummary } from '../utils/id';
import type { UserProfile } from './types';

export interface AuditLogInput {
  user: Pick<UserProfile, 'uid' | 'organizationId' | 'ownerUid' | 'name' | 'role'>;
  branchId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

export function buildAuditLogPayload(input: AuditLogInput) {
  const auditId = generateSafeId('aud');
  return {
    auditId,
    ref: doc(db, 'auditLogs', auditId),
    data: {
      auditId,
      organizationId: input.user.organizationId,
      ownerUid: input.user.ownerUid,
      branchId: input.branchId ?? null,
      userId: input.user.uid,
      userNameSnapshot: input.user.name.slice(0, 120),
      userRoleSnapshot: input.user.role.slice(0, 40),
      action: input.action.slice(0, 80),
      entityType: input.entityType.slice(0, 60),
      entityId: input.entityId.slice(0, 128),
      before: input.before ?? null,
      after: input.after ?? null,
      deviceInfo: getDeviceSummary(),
      createdAt: serverTimestamp(),
    },
  };
}

export function appendAuditLogToBatch(batch: WriteBatch, input: AuditLogInput): string {
  const { auditId, ref, data } = buildAuditLogPayload(input);
  batch.set(ref, data);
  return auditId;
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  const { auditId, ref, data } = buildAuditLogPayload(input);
  try {
    await setDoc(ref, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `auditLogs/${auditId}`);
  }
}
