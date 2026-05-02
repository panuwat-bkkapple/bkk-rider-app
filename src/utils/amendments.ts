// Thin wrappers around the amendment Cloud Functions deployed by bkk-system.
// All three callables sit in asia-southeast1 alongside the existing rider
// callables (extractFromImage, validateAndCreateOrder).

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../api/firebase';
import type { JobAmendmentType } from '../types';

interface RequestAmendmentInput {
  jobId: string;
  type: JobAmendmentType;
  riderNote?: string;
  evidenceUrls: string[];
}
interface RequestAmendmentResult {
  ok: boolean;
  amendmentId: string;
}

interface ConsentAmendmentInput {
  amendmentId: string;
  signatureUrl: string;
}
interface ConsentAmendmentResult {
  ok: boolean;
}

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
