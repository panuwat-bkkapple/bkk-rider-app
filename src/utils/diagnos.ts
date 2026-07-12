// BKK Diagnos — rider-side helpers. The rider creates a session (Cloud
// Function in bkk-system, asia-southeast1 like the amendment callables),
// shows the returned URL as a QR for the customer's device, then watches
// the session live. The rider only ever writes ONE step: the Face ID
// verdict, which staff must confirm (the customer cannot self-certify it).

import { getFunctions, httpsCallable } from 'firebase/functions';
import { ref, set, onValue } from 'firebase/database';
import { app, db } from '../api/firebase';

export interface DiagnosStep {
  result: 'pass' | 'fail' | 'skipped';
  value?: unknown;
  skip_reason?: string;
  at: number;
  duration_ms: number;
}

export interface DiagnosSession {
  job_id: string;
  device_index: number;
  mode: 'customer' | 'staff';
  status: 'open' | 'in_progress' | 'submitted' | 'expired' | 'cancelled';
  created_at: number;
  expires_at: number;
  claimed_by?: string | null;
  device_label?: string;
  steps?: Record<string, DiagnosStep>;
  summary?: { pass: number; fail: number; skipped: number };
}

export const DIAGNOS_STEP_ORDER = [
  'device_identity',
  'find_my',
  'touch_grid',
  'display',
  'camera_back',
  'camera_front',
  'mic_speaker',
  'gps',
  'motion',
  'haptic_guided',
  'battery_guided',
  'faceid_guided',
] as const;

export const DIAGNOS_STEP_LABEL: Record<string, string> = {
  device_identity: 'ข้อมูลเครื่อง',
  find_my: 'Find My',
  touch_grid: 'ทัชสกรีน',
  display: 'จอภาพ',
  camera_back: 'กล้องหลัง',
  camera_front: 'กล้องหน้า',
  mic_speaker: 'ไมค์/ลำโพง',
  gps: 'GPS',
  motion: 'เซ็นเซอร์',
  haptic_guided: 'ระบบสั่น',
  battery_guided: 'แบตเตอรี่',
  faceid_guided: 'Face ID',
};

// One live session per job+device — the panel now lives inside the
// per-device inspection stepper, so the key is device-scoped.
const storageKey = (jobId: string, deviceIndex: number) =>
  `diagnos_session_${jobId}_${deviceIndex}`;

export const rememberSession = (jobId: string, deviceIndex: number, sessionId: string) => {
  try {
    localStorage.setItem(storageKey(jobId, deviceIndex), sessionId);
  } catch { /* private mode */ }
};

export const recallSession = (jobId: string, deviceIndex: number): string | null => {
  try {
    return localStorage.getItem(storageKey(jobId, deviceIndex));
  } catch {
    return null;
  }
};

export const forgetSession = (jobId: string, deviceIndex: number) => {
  try {
    localStorage.removeItem(storageKey(jobId, deviceIndex));
  } catch { /* private mode */ }
};

export async function createDiagnosSession(
  jobId: string,
  deviceIndex: number,
): Promise<{ sessionId: string; url: string; expiresAt: number }> {
  const fns = getFunctions(app, 'asia-southeast1');
  const create = httpsCallable(fns, 'createDiagnosticSession');
  const res = await create({ jobId, deviceIndex, mode: 'customer' });
  const data = res.data as { ok: boolean; sessionId: string; url: string; expiresAt: number };
  rememberSession(jobId, deviceIndex, data.sessionId);
  return data;
}

export function subscribeDiagnosSession(
  sessionId: string,
  cb: (session: DiagnosSession | null) => void,
): () => void {
  return onValue(
    ref(db, `diagnostic_sessions/${sessionId}`),
    (snap) => cb(snap.exists() ? (snap.val() as DiagnosSession) : null),
    () => cb(null), // permission/read error — treat as gone
  );
}

/** Staff verdict for the Face ID step (the customer device is waiting on
 *  this write — see the FaceIdStep on the customer side). */
export async function writeFaceIdVerdict(
  sessionId: string,
  result: 'pass' | 'fail',
): Promise<void> {
  await set(ref(db, `diagnostic_sessions/${sessionId}/steps/faceid_guided`), {
    result,
    value: { observed: result === 'pass' ? 'unlock_ok' : 'unlock_failed', confirmed_by: 'staff' },
    at: Date.now(),
    duration_ms: 0,
  });
}
