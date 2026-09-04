// สวิตช์การแจ้งเตือนของแอดมินต้องครอบ push ที่ส่งจาก functions ของรีโปนี้
//
// สามชั้น: (1) พฤติกรรมของ riderPushDecision บนรูป settings จริง (2) parity —
// หมวดของ type ฝั่งนี้ต้องตรงกับ EVENT_CATEGORY ใน
// bkk-system/functions/notification-settings.js ตัวอักษรต่อตัวอักษร (อ่านไฟล์
// จริง ข้ามถ้าไม่ได้ checkout — CI sparse-checkout มาให้) (3) SOURCE —
// sendToRider ต้องเรียก gate ก่อน sendEachForMulticast
//
// ผล injection — วัดจริงหลังรันทีละตัว ไม่ได้เขียนไว้ก่อน:
//   ไม่เช็ค channel rider_push เลย                      → แดง 2 จาก 14
//   ใช้ falsy แทน === false (0/undefined กลายเป็นปิด)     → แดง 5
//   type ที่ไม่รู้จัก = ปิด (fail closed)                 → แดง 1
//   หมวด broadcast_job ผิด — parity กับ bkk-system จับ    → แดง 2
//   อ่าน settings พังแล้ว throw แทนคืน {}                → แดง 1
//   ไม่แคช                                             → แดง 1
//   sendToRider ไม่ผ่าน gate (ตรวจจาก SOURCE)            → แดง 1
// ทุกกฎมีเทสไปถึง ไม่มีด่านที่ไปไม่ถึงให้ลบ

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  riderPushDecision,
  RIDER_EVENT_CATEGORY,
  loadNotificationSettings,
  clearNotificationSettingsCache,
} from '../../functions/src/notificationGate';

const root = resolve(__dirname, '../..');

describe('riderPushDecision — fail-open มีแต่ false ที่ปิด', () => {
  it('ไม่มี settings เลย = ส่ง', () => {
    expect(riderPushDecision(null, 'chat').allowed).toBe(true);
    expect(riderPushDecision({}, 'job_status').allowed).toBe(true);
  });

  it('channel rider_push = false ปิดทุก type', () => {
    for (const t of ['chat', 'job_status', 'broadcast_job']) {
      const d = riderPushDecision({ channels: { rider_push: false } }, t);
      expect(d.allowed).toBe(false);
      expect(d.reason).toBe('channel:rider_push');
    }
  });

  it('channel เป็น true / undefined / สตริง = เปิด (ไม่ใช่ falsy check)', () => {
    expect(riderPushDecision({ channels: { rider_push: true } }, 'chat').allowed).toBe(true);
    expect(riderPushDecision({ channels: {} }, 'chat').allowed).toBe(true);
    expect(riderPushDecision({ channels: { rider_push: 0 as unknown as boolean } }, 'chat').allowed).toBe(true);
  });

  it('ปิดหมวด chat_message = แชทเงียบ แต่งานใหม่ยังเด้ง', () => {
    const s = { events: { chat_message: false } };
    expect(riderPushDecision(s, 'chat').allowed).toBe(false);
    expect(riderPushDecision(s, 'chat').reason).toBe('event:chat_message');
    expect(riderPushDecision(s, 'job_status').allowed).toBe(true);
    expect(riderPushDecision(s, 'broadcast_job').allowed).toBe(true);
  });

  it('ปิดหมวด status_change = job_status เงียบ', () => {
    expect(riderPushDecision({ events: { status_change: false } }, 'job_status').allowed).toBe(false);
  });

  it('ปิดหมวด new_ticket = broadcast เงียบ', () => {
    expect(riderPushDecision({ events: { new_ticket: false } }, 'broadcast_job').allowed).toBe(false);
  });

  it('type ที่ไม่รู้จัก / ไม่มี type = ไม่ gate แม้ปิดทุกหมวด', () => {
    const allOff = { events: { chat_message: false, status_change: false, new_ticket: false } };
    expect(riderPushDecision(allOff, 'something_new').allowed).toBe(true);
    expect(riderPushDecision(allOff, undefined).allowed).toBe(true);
  });

  it('channel ปิดชนะหมวดที่เปิด', () => {
    expect(riderPushDecision({ channels: { rider_push: false }, events: { chat_message: true } }, 'chat').allowed).toBe(false);
  });
});

describe('loadNotificationSettings — แคช + พังแล้วเปิด', () => {
  beforeEach(() => clearNotificationSettingsCache());

  it('อ่านครั้งเดียวภายใน 30 วิ', async () => {
    let reads = 0;
    const read = async () => { reads++; return { channels: { rider_push: false } }; };
    await loadNotificationSettings(read);
    await loadNotificationSettings(read);
    expect(reads).toBe(1);
  });

  it('อ่านพัง = {} (เปิดหมด) ไม่ throw', async () => {
    const s = await loadNotificationSettings(async () => { throw new Error('boom'); });
    expect(s).toEqual({});
    expect(riderPushDecision(s, 'chat').allowed).toBe(true);
  });

  it('ค่าที่ไม่ใช่ object (null จาก RTDB) = {}', async () => {
    expect(await loadNotificationSettings(async () => null)).toEqual({});
  });
});

describe('parity กับ bkk-system/functions/notification-settings.js', () => {
  const p = resolve(root, '../bkk-system/functions/notification-settings.js');

  it('ทุก type ฝั่งนี้ต้องมีใน EVENT_CATEGORY ฝั่ง bkk-system ด้วยหมวดเดียวกัน (ข้ามถ้าไม่ได้ checkout)', () => {
    if (!existsSync(p)) return; // ไม่มีรีโปข้างกัน = ข้าม ไม่ใช่แดง (CI มีให้)
    const src = readFileSync(p, 'utf-8');
    const m = src.match(/const EVENT_CATEGORY = \{([\s\S]*?)\n\};/);
    expect(m, 'หา EVENT_CATEGORY ไม่เจอ').toBeTruthy();
    const block = m![1];
    for (const [type, category] of Object.entries(RIDER_EVENT_CATEGORY)) {
      // บรรทัดฝั่ง bkk-system มีคอมเมนต์ท้ายบรรทัดได้ — จับเฉพาะ key: "value"
      const re = new RegExp(`^\\s*${type}:\\s*"([a-z_]+)",?\\s*(//.*)?$`, 'm');
      const hit = block.match(re);
      expect(hit, `bkk-system ไม่มี ${type} ใน EVENT_CATEGORY`).toBeTruthy();
      expect(hit![1], `หมวดของ ${type} ไม่ตรง`).toBe(category);
    }
  });
});

describe('sendToRider ต้องผ่าน gate — ตรวจจาก SOURCE', () => {
  const src = readFileSync(resolve(root, 'functions/src/index.ts'), 'utf-8');
  const start = src.indexOf('async function sendToRider(');
  const end = src.indexOf('\n// ====', start);
  const body = src.slice(start, end);

  it('เรียก riderPushDecision ก่อน sendEachForMulticast', () => {
    const gateAt = body.indexOf('riderPushDecision(');
    const sendAt = body.indexOf('sendEachForMulticast(');
    expect(gateAt).toBeGreaterThan(0);
    expect(sendAt).toBeGreaterThan(gateAt);
  });

  it('ไม่มี trigger ไหนยิง messaging ตรงโดยข้าม sendToRider', () => {
    const outside = src.slice(0, start) + src.slice(end);
    expect(outside).not.toMatch(/sendEachForMulticast|messaging\.send\(/);
  });
});
