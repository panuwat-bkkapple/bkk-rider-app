// เทสของกติกาคิว — เขียนจากสถานการณ์ที่เกิดจริงหน้างาน ไม่ใช่จากตาราง spec
//
// สถานการณ์ที่ยกมาเป็นชื่อเทส มาจากข้อ 9 (P3) ของแผนคิว: เน็ตหลุดกลางอัป /
// ปิดแอปกลางคิว / rules ปฏิเสธ / สลับบัญชี / Blob หาย / คิวเต็ม

import { describe, it, expect } from 'vitest';
import {
  afterAttempt, backoffFor, canEnqueue, classifyFailure, editPayload,
  isReady, lease, ownedBy, staleItems, LEASE_MS, MAX_QUEUED_ITEMS,
  EVIDENCE_LOST_MESSAGE,
} from './policy';
import type { QueuedUpload } from './types';

const NOW = 1_756_000_000_000;

const item = (over: Partial<QueuedUpload> = {}): QueuedUpload => ({
  id: 'q1',
  uid: 'riderA',
  created_at: NOW,
  kind: 'expense_evidence',
  files: [{ blob: new Blob([new Uint8Array(1024)]), content_type: 'image/jpeg', storage_path: 'riders/riderA/expenses/q1/a.jpg' }],
  payload: { category: 'toll', amount_thb: 65, note: '', occurred_at: NOW, job_id: null },
  state: 'pending',
  attempts: 0,
  next_attempt_at: NOW,
  ...over,
});

describe('เน็ตหลุดกลางอัป — ต้องลองใหม่ ไม่ใช่ตายทิ้ง', () => {
  it('ล้มแบบ retryable → กลับเป็น pending พร้อมเวลานัดใหม่', () => {
    const r = afterAttempt(item(), { ok: false, kind: 'retryable', message: 'เน็ตหลุด' }, NOW);
    expect(r.state).toBe('pending');
    expect(r.attempts).toBe(1);
    expect(r.next_attempt_at).toBe(NOW + 5_000);
    expect(r.last_error).toBe('เน็ตหลุด');
  });

  it('backoff ยืดขึ้นตามจำนวนครั้ง แล้วหยุดที่ 15 นาที', () => {
    expect([1, 2, 3, 4, 5, 6, 99].map(backoffFor))
      .toEqual([5_000, 15_000, 60_000, 300_000, 900_000, 900_000, 900_000]);
  });

  it('ยังไม่ถึงเวลานัด = ยังไม่หยิบไปทำ', () => {
    expect(isReady(item({ next_attempt_at: NOW + 1 }), NOW)).toBe(false);
    expect(isReady(item({ next_attempt_at: NOW }), NOW)).toBe(true);
  });

  it('error ที่ไม่รู้จักถือเป็น retryable — เดาว่าถาวรแล้วผิดคือให้เขาถ่ายใหม่ฟรีๆ', () => {
    expect(classifyFailure('storage/retry-limit-exceeded')).toBe('retryable');
    expect(classifyFailure('unavailable')).toBe('retryable');
    expect(classifyFailure(undefined)).toBe('retryable');
    expect(classifyFailure(500)).toBe('retryable');
  });
});

describe('ปิดแอปกลางอัป — งานต้องไม่ค้างถาวร', () => {
  it('งานที่ถูก lease อยู่ ยังไม่หมดอายุ = คนอื่นห้ามแย่ง', () => {
    const held = lease(item(), NOW);
    expect(held.state).toBe('uploading');
    expect(isReady(held, NOW + 1)).toBe(false);
  });

  it('lease หมดอายุ = ถือว่าคนถือตายไปแล้ว หยิบต่อได้', () => {
    // นี่คือกลไกเดียวที่กู้งานจากแท็บที่ถูก iOS ฆ่ากลางอัป
    const held = lease(item(), NOW);
    expect(isReady(held, NOW + LEASE_MS + 1)).toBe(true);
  });

  it('lease ถูกเขียนลง record ไม่ใช่แค่ตัวแปรในหน่วยความจำ', () => {
    expect(lease(item(), NOW).leased_until).toBe(NOW + LEASE_MS);
  });
});

describe('rules ปฏิเสธ — ต้องหยุด ไม่ใช่ลองวนไม่จบ', () => {
  it('storage/unauthorized = ถาวร', () => {
    const r = afterAttempt(item(), { ok: false, kind: classifyFailure('storage/unauthorized'), message: 'ไม่มีสิทธิ์' }, NOW);
    expect(r.state).toBe('failed_permanent');
  });

  it('callable ปฏิเสธเพราะเกินเพดาน (failed-precondition) = ถาวร', () => {
    // ยอดเกิน 2,000 จะถูกปฏิเสธเสมอไม่ว่าจะลองกี่ครั้ง
    expect(classifyFailure('failed-precondition')).toBe('permanent');
  });

  it('งานที่ตายถาวรแล้วไม่ถูกหยิบไปทำอีก', () => {
    expect(isReady(item({ state: 'failed_permanent' }), NOW + 1e9)).toBe(false);
  });

  it('ล้างธง lease ทิ้งทุกครั้งที่จบรอบ ไม่ว่าจบแบบไหน', () => {
    // lease ค้างบนงานที่ตายแล้วทำให้ตัวนับ "กำลังส่ง" บนจอไม่มีวันลง
    for (const kind of ['retryable', 'permanent'] as const) {
      const r = afterAttempt(lease(item(), NOW), { ok: false, kind, message: 'x' }, NOW);
      expect(r.leased_until).toBeUndefined();
    }
    expect(afterAttempt(lease(item(), NOW), { ok: true }, NOW).leased_until).toBeUndefined();
  });
});

describe('สำเร็จ', () => {
  it('สำเร็จแล้วเป็น done และไม่มี error ค้างจากรอบก่อน', () => {
    const retried = item({ attempts: 2, last_error: 'เน็ตหลุด' });
    const r = afterAttempt(retried, { ok: true }, NOW);
    expect(r.state).toBe('done');
    expect(r.last_error).toBeUndefined();
  });

  it('สำเร็จไม่เพิ่ม attempts — ไม่งั้นอ่านย้อนหลังเหมือนเคยล้มมาก่อน', () => {
    expect(afterAttempt(item(), { ok: true }, NOW).attempts).toBe(0);
  });

  it('งานที่ done แล้วไม่ถูกส่งซ้ำ', () => {
    expect(isReady(item({ state: 'done' }), NOW + 1e9)).toBe(false);
  });
});

describe('Blob หาย — เป็นสถานะ ไม่ใช่ความเงียบ', () => {
  it('evidence_lost แยกจาก failed_permanent เพราะทางแก้คนละทาง', () => {
    // failed_permanent = แอดมินหรือกติกาต้องเปลี่ยน
    // evidence_lost   = ไรเดอร์ต้องถ่ายใหม่ ซึ่งเขาทำเองได้ทันที
    const r = afterAttempt(item(), { ok: false, kind: 'evidence_lost' }, NOW);
    expect(r.state).toBe('evidence_lost');
  });

  it('ข้อความเป็นของ policy ไม่ใช่ของ caller และต้องบอกทางแก้', () => {
    // เทสรอบแรกปล่อยให้ caller ส่งข้อความอะไรก็ได้ แล้ว assert ว่ามีคำว่า
    // "ถ่าย" — ซึ่งเป็นการเทสข้อความที่เทสเองส่งเข้าไป (เทสที่เห็นด้วยกับ
    // ตัวเอง) ตอนนี้ค่าคงที่อยู่ใน policy จึงพิสูจน์ได้จริงว่า caller ที่ลืม
    // ส่งข้อความก็ยังได้ประโยคที่ใช้ได้
    const r = afterAttempt(item(), { ok: false, kind: 'evidence_lost' }, NOW);
    expect(r.last_error).toBe(EVIDENCE_LOST_MESSAGE);
    expect(EVIDENCE_LOST_MESSAGE).toContain('ถ่ายใหม่');
  });
});

describe('สลับบัญชี — งานเก่าห้ามถูกส่งในนามคนใหม่', () => {
  it('ownedBy แยกเจ้าของด้วย uid ที่บันทึกตอน enqueue', () => {
    expect(ownedBy(item(), 'riderA')).toBe(true);
    expect(ownedBy(item(), 'riderB')).toBe(false);
  });
});

describe('คิวเต็ม — ปฏิเสธที่ทางเข้า ห้ามลบของเก่า', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => item({ id: `q${i}` }));

  it(`ครบ ${MAX_QUEUED_ITEMS} ชิ้นแล้วปฏิเสธ พร้อมบอกจำนวนที่ค้าง`, () => {
    const v = canEnqueue(many(MAX_QUEUED_ITEMS), 1024);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('too_many');
    expect(v.message).toContain(String(MAX_QUEUED_ITEMS));
  });

  it('งานที่จบแล้วไม่กินโควตา — ไม่งั้นคิวตันด้วยของที่ส่งไปแล้ว', () => {
    const done = many(MAX_QUEUED_ITEMS).map((i) => ({ ...i, state: 'done' as const }));
    expect(canEnqueue(done, 1024).ok).toBe(true);
  });

  it('ไฟล์ก้อนใหญ่เกินพื้นที่ที่เหลือ = ปฏิเสธด้วยเหตุผลคนละข้อ', () => {
    const v = canEnqueue([item()], 50 * 1024 * 1024);
    expect(v.ok).toBe(false);
    expect(v.reason).toBe('too_large');
  });

  it('ข้อความปฏิเสธห้ามบอกว่า "ผิดพลาด" — ต้องบอกทางออก', () => {
    // คนที่ชนเพดานไม่ได้ทำอะไรผิด และของที่ค้างก็เป็นเงินของเขา
    const v = canEnqueue(many(MAX_QUEUED_ITEMS), 1024);
    expect(v.message).not.toContain('ผิดพลาด');
    expect(v.message).toContain('ก่อน');
  });
});

describe('ของค้างนาน — แถบเตือนถาวร', () => {
  const FOUR_DAYS = 4 * 24 * 3600 * 1000;

  it('ค้างเกิน 3 วันถึงเตือน', () => {
    expect(staleItems([item({ created_at: NOW - FOUR_DAYS })], NOW)).toHaveLength(1);
    expect(staleItems([item({ created_at: NOW - 3600_000 })], NOW)).toHaveLength(0);
  });

  it('ของที่ส่งขึ้นระบบไปแล้วไม่นับเป็นของค้าง แม้จะเก่า', () => {
    expect(staleItems([item({ created_at: NOW - FOUR_DAYS, state: 'done' })], NOW)).toHaveLength(0);
  });
});

describe('แนบงานทีหลัง — แก้ได้เฉพาะตอนยังไม่ถูกส่ง', () => {
  it('ยัง pending = แก้ job_id ได้', () => {
    const r = editPayload(item(), { job_id: 'OID-X' });
    expect(r?.payload.job_id).toBe('OID-X');
    expect(r?.payload.amount_thb).toBe(65); // ฟิลด์อื่นไม่หาย
  });

  it('ส่งขึ้นระบบแล้ว = ปฏิเสธตรงๆ ไม่ใช่แก้เงียบๆ แล้วไม่มีผล', () => {
    // ถ้าคืน item ที่แก้แล้วมา UI จะโชว์ว่าแก้สำเร็จ ทั้งที่แถวจริงบน server
    // ไม่เปลี่ยน — การแก้แถวที่ส่งไปแล้วต้องเป็น RTDB update คนละ path
    expect(editPayload(item({ state: 'done' }), { job_id: 'OID-X' })).toBeNull();
    expect(editPayload(item({ state: 'uploading' }), { job_id: 'OID-X' })).toBeNull();
  });
});
