// กติกาของคิว — pure ทั้งไฟล์ ไม่แตะ IndexedDB ไม่แตะเครือข่าย
//
// แยกออกมาเพราะทุกข้อในนี้คือ "ผิดแล้วเงินหรือหลักฐานหาย" และเป็นข้อที่
// พิสูจน์ได้โดยไม่ต้องมีเบราว์เซอร์จริง ส่วนที่ต้องมีเบราว์เซอร์จริง
// (Blob ลง IndexedDB บน iOS PWA อ่านกลับได้ไหม) อยู่ที่หน้า /probe
// **และยังไม่มีคำตอบ** — ดูข้อ 6.5 ของเอกสารออกแบบ

import type { QueuedUpload, QueueState } from './types';

/** 5s → 15s → 1m → 5m → 15m แล้วคงที่
 *
 *  มีเพดานเพราะไรเดอร์เปิดแอปจ้ออยู่หน้างาน การรอเกิน 15 นาทีไม่ได้ช่วยอะไร
 *  นอกจากทำให้เขาคิดว่าระบบพัง แล้วไปกดส่งใหม่จนได้แถวซ้ำ (ซึ่งกันไว้แล้ว
 *  ด้วย id คงที่ แต่ความรู้สึกว่าพังก็ยังเป็นต้นทุน) */
export const BACKOFF_MS = [5_000, 15_000, 60_000, 300_000, 900_000] as const;

export function backoffFor(attempts: number): number {
  if (!Number.isFinite(attempts) || attempts < 1) return BACKOFF_MS[0];
  return BACKOFF_MS[Math.min(Math.floor(attempts) - 1, BACKOFF_MS.length - 1)];
}

/** อายุ lease — สั้นพอที่งานจะไม่ค้างเมื่อแท็บถูกฆ่ากลางอัป
 *  ยาวพอที่การอัปรูป 0.8 MB บนเน็ตแย่ๆ จะไม่ถูกแย่งไปทำซ้ำ */
export const LEASE_MS = 120_000;

/** กั้นที่ทางเข้า ไม่ใช่ทางออก — เพราะห้ามลบของเก่าทิ้งเพื่อรับของใหม่
 *  ตัวเลขยังไม่มีข้อมูลจริงรองรับ ต้องกลับมาปรับหลังใช้จริง */
export const MAX_QUEUED_ITEMS = 20;
export const MAX_QUEUED_BYTES = 40 * 1024 * 1024;

/** เตือนเมื่อของค้างนานเกินนี้ — แถบถาวรในแอป ไม่ใช่ toast ที่หายไปเอง */
export const STALE_WARN_MS = 3 * 24 * 60 * 60 * 1000;

/** สถานะที่ยังต้องส่งต่อ — ใช้ทั้งตอนเลือกงานมา flush และตอนนับของค้าง */
const LIVE: ReadonlySet<QueueState> = new Set<QueueState>(['pending', 'uploading']);

export const isLive = (item: QueuedUpload): boolean => LIVE.has(item.state);

/**
 * งานชิ้นนี้หยิบไปส่งได้ไหม ณ เวลานี้
 *
 * เงื่อนไขสามข้อ ไม่ใช่ข้อเดียว:
 *   - สถานะยังมีชีวิต (`done`/`failed_permanent`/`evidence_lost` จบแล้ว)
 *   - ถึงเวลา backoff แล้ว
 *   - ไม่มีใครถืออยู่ (lease หมดอายุ = ถือว่าคนถือตายไปแล้ว หยิบต่อได้)
 *
 * ข้อสุดท้ายคือสิ่งที่ทำให้ "ปิดแอปกลางอัป" ไม่ทำให้งานค้างถาวร
 */
export function isReady(item: QueuedUpload, now: number): boolean {
  if (!isLive(item)) return false;
  if (item.next_attempt_at > now) return false;
  if (item.state === 'uploading' && (item.leased_until ?? 0) > now) return false;
  return true;
}

/** งานของ uid นี้เท่านั้น — สลับบัญชีแล้วงานเก่าต้องไม่ถูกส่งในนามคนใหม่
 *  (แต่ **ห้ามลบทิ้ง** ตอน logout — มันเป็นเงินของเจ้าของเดิม) */
export const ownedBy = (item: QueuedUpload, uid: string): boolean => item.uid === uid;

export type FailureKind = 'retryable' | 'permanent';

/**
 * error นี้ควร retry หรือหยุด
 *
 * **เอียงไปทาง retryable โดยตั้งใจ** — เดาว่าถาวรทั้งที่ชั่วคราว = งานตายทั้งที่
 * รออีกสิบวินาทีก็ผ่าน และไรเดอร์ต้องถ่ายใหม่ทั้งที่ไม่มีอะไรผิด
 * ส่วนเดาว่าชั่วคราวทั้งที่ถาวร = เสียแค่ retry ไม่กี่รอบแล้วชนเพดาน backoff
 * ต้นทุนสองทางไม่เท่ากัน จึงต้องระบุรายชื่อ "ถาวร" ให้ชัด แล้วที่เหลือ retry
 */
const PERMANENT_CODES: readonly string[] = [
  'storage/unauthorized',
  'storage/invalid-argument',
  'storage/no-default-bucket',
  'permission-denied',
  'permission_denied',
  'invalid-argument',
  'failed-precondition',
  'unauthenticated',
];

export function classifyFailure(code: unknown): FailureKind {
  const c = typeof code === 'string' ? code.toLowerCase() : '';
  return PERMANENT_CODES.includes(c) ? 'permanent' : 'retryable';
}

/**
 * ข้อความของ `evidence_lost` เป็นของ policy ไม่ใช่ของ caller
 *
 * เพราะมันไม่ใช่ "รายงาน error" แต่เป็น **คำสั่งงานถัดไปของไรเดอร์** —
 * ทางแก้มีทางเดียวคือถ่ายใหม่ และประโยคนี้ต้องพูดตรงกันทุกที่ที่โผล่
 * (เขียนเป็นค่าคงที่หลังเทสจับได้ว่าตอนแรกปล่อยให้ caller ส่งข้อความอะไรก็ได้
 * ซึ่งแปลว่า caller ที่ลืมจะได้ข้อความว่างบนจอ)
 */
export const EVIDENCE_LOST_MESSAGE =
  'ไฟล์หลักฐานหายจากเครื่อง ต้องถ่ายใหม่';

/** ผลของความพยายามหนึ่งรอบ — reducer ข้างล่างแปลงเป็นสถานะถัดไป
 *
 *  `evidence_lost` ไม่รับ `message` โดยตั้งใจ (ดูค่าคงที่ข้างบน) */
export type AttemptOutcome =
  | { ok: true }
  | { ok: false; kind: FailureKind; message: string }
  | { ok: false; kind: 'evidence_lost' };

/**
 * สถานะถัดไปหลังพยายามหนึ่งรอบ — คืน **item ใหม่ทั้งก้อน** ไม่แก้ของเดิม
 *
 * `attempts` เพิ่มเฉพาะตอนล้ม — ไม่งั้นงานที่สำเร็จรอบแรกจะดูเหมือนเคยล้มมาก่อน
 * เวลาอ่านย้อนหลัง
 */
export function afterAttempt(
  item: QueuedUpload,
  outcome: AttemptOutcome,
  now: number
): QueuedUpload {
  if (outcome.ok) {
    const { leased_until: _drop, last_error: _err, ...rest } = item;
    void _drop; void _err;
    return { ...rest, state: 'done', next_attempt_at: now };
  }

  const message =
    outcome.kind === 'evidence_lost' ? EVIDENCE_LOST_MESSAGE : outcome.message;
  const base = { ...item, last_error: message, attempts: item.attempts + 1 };
  delete base.leased_until;

  if (outcome.kind === 'evidence_lost') {
    return { ...base, state: 'evidence_lost', next_attempt_at: now };
  }
  if (outcome.kind === 'permanent') {
    return { ...base, state: 'failed_permanent', next_attempt_at: now };
  }
  return {
    ...base,
    state: 'pending',
    next_attempt_at: now + backoffFor(base.attempts),
  };
}

/** จองงานไว้ทำ — เขียน lease ลง record ไม่ใช่แค่ตัวแปรในหน่วยความจำ
 *  (ตัวแปรในหน่วยความจำหายไปพร้อมแท็บที่ถูกฆ่า lease ใน record ไม่หาย) */
export function lease(item: QueuedUpload, now: number): QueuedUpload {
  return { ...item, state: 'uploading', leased_until: now + LEASE_MS };
}

export interface CapacityVerdict {
  ok: boolean;
  reason?: 'too_many' | 'too_large';
  message?: string;
}

/**
 * รับงานใหม่เข้าคิวได้ไหม
 *
 * **ชนเพดานแล้วปฏิเสธ ห้าม evict ของเก่า** — ของเก่าก็เป็นเงินของเขาเหมือนกัน
 * และคนที่จะเสียคือคนที่ถ่ายไว้ก่อนแล้วยังไม่ได้ส่ง ซึ่งไม่ได้ทำอะไรผิดเลย
 * ข้อความจึงต้องบอกจำนวนที่ค้างและพาไปหน้าคิว ไม่ใช่บอกว่า "ผิดพลาด"
 */
export function canEnqueue(
  existing: readonly QueuedUpload[],
  incomingBytes: number
): CapacityVerdict {
  const live = existing.filter(isLive);
  if (live.length >= MAX_QUEUED_ITEMS) {
    return {
      ok: false,
      reason: 'too_many',
      message: `มีรายการค้างส่งอยู่ ${live.length} รายการแล้ว ส่งของเดิมให้ขึ้นระบบก่อนจึงจะเพิ่มใหม่ได้`,
    };
  }
  const used = live.reduce(
    (sum, i) => sum + i.files.reduce((s, f) => s + (f.blob?.size || 0), 0),
    0
  );
  if (used + incomingBytes > MAX_QUEUED_BYTES) {
    return {
      ok: false,
      reason: 'too_large',
      message: 'พื้นที่เก็บรายการค้างเต็ม ส่งของเดิมให้ขึ้นระบบก่อนจึงจะเพิ่มใหม่ได้',
    };
  }
  return { ok: true };
}

/** ของค้างที่เก่าเกินเกณฑ์ — ใช้ตัดสินว่าจะขึ้นแถบเตือนถาวรไหม */
export function staleItems(
  items: readonly QueuedUpload[],
  now: number,
  windowMs: number = STALE_WARN_MS
): QueuedUpload[] {
  return items.filter((i) => isLive(i) && now - i.created_at > windowMs);
}

/** แก้ payload ได้เฉพาะตอนยังไม่ถูกส่ง
 *
 *  เคสจริง: ถ่ายสลิปที่ด่านโดยยังไม่รู้ว่าจะแนบงานไหน แล้วมาเลือกทีหลัง
 *  พอส่งขึ้นระบบแล้วการแก้ต้องเป็น RTDB update บนแถวจริง ซึ่งเป็นคนละ
 *  code path — ฟังก์ชันนี้จึงปฏิเสธตรงๆ แทนที่จะแก้เงียบๆ แล้วไม่มีผล */
export function editPayload(
  item: QueuedUpload,
  patch: Partial<QueuedUpload['payload']>
): QueuedUpload | null {
  if (item.state !== 'pending') return null;
  return { ...item, payload: { ...item.payload, ...patch } };
}
