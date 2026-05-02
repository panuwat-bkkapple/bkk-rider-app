// Thin wrappers around the v2 amendment Cloud Functions deployed by
// bkk-system. All in asia-southeast1 alongside extractFromImage and
// validateAndCreateOrder.

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../api/firebase';
import type {
  JobAmendmentType, AmendmentTarget, AmendmentEvidence,
} from '../types';

interface RequestAmendmentInput {
  jobId: string;
  type: JobAmendmentType;
  riderNote?: string;
  /** v2 — preferred. Server normalizes if v1 evidenceUrls is sent instead. */
  evidence?: AmendmentEvidence[];
  /** v1 fallback — kept for migration but new clients should use evidence */
  evidenceUrls?: string[];
  /** Optional rider seed for the change (admin can edit during review) */
  target?: AmendmentTarget;
  /** For replace/remove — which device slot is being changed */
  target_device_index?: number;
  /** Idempotency key (UUID v4 generated client-side). Prevents duplicate
   *  amendments if the rider double-taps submit on a flaky network. */
  clientRequestId?: string;
}

interface RequestAmendmentResult {
  ok: boolean;
  amendmentId: string;
  deduplicated?: boolean;
}

interface ConsentAmendmentInput {
  amendmentId: string;
  signatureUrl: string;
  /** Disclosure text snapshot — what customer was shown when they signed.
   *  Server stores this for legal replay. */
  disclosureText?: string;
  disclosureVersion?: string;
}
interface ConsentAmendmentResult { ok: boolean; }

export async function requestAmendment(input: RequestAmendmentInput): Promise<RequestAmendmentResult> {
  const fn = httpsCallable<RequestAmendmentInput, RequestAmendmentResult>(
    getFunctions(app, 'asia-southeast1'),
    'requestAmendment',
  );
  const r = await fn(input);
  return r.data;
}

export async function consentAmendment(input: ConsentAmendmentInput): Promise<ConsentAmendmentResult> {
  const fn = httpsCallable<ConsentAmendmentInput, ConsentAmendmentResult>(
    getFunctions(app, 'asia-southeast1'),
    'consentAmendment',
  );
  const r = await fn(input);
  return r.data;
}

/** Generate a UUIDv4 for client_request_id. Uses crypto.randomUUID
 *  when available (modern browsers + iOS 15.4+), falls back to
 *  Math.random for ancient runtimes. */
export function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
