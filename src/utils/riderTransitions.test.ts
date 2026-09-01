import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  RIDER_EVENT,
  EVENT_CHECKPOINT_STAGE,
  engineErrorCode,
  transitionErrorMessage,
} from './riderTransitions';
import { STAGE_LABEL_TH } from './jobTimeline';

describe('RIDER_EVENT', () => {
  // ถ้าชื่อ event ที่นี่ไม่ตรงกับคีย์ใน TRANSITIONS ฝั่ง engine ปุ่มจะยิงไปแล้ว
  // โดน "unknown_event" กลับมา — ไรเดอร์กดแล้วไม่ไป ทุกใบ ทุกคน และไม่มีเทส
  // ฝั่งไหนแดงเลยเพราะสองฝั่งอยู่คนละ repo
  //
  // เทสนี้อ่านไฟล์จริงของ bkk-system เมื่อมันถูก checkout ไว้ข้างกัน และ SKIP
  // เมื่อไม่มี (แบบเดียวกับ scripts/mirror-parity.mjs)
  //
  // **CI วาง bkk-system ไว้ข้างกันให้แล้ว** (ขั้น "Checkout bkk-system" ใน
  // .github/workflows/ci.yml) ด่านนี้จึงรันจริงบนทุก PR ไม่ใช่เฉพาะตอนรันใน
  // เครื่องที่บังเอิญ clone สองรีโปไว้ข้างกัน — ก่อนหน้านั้นมันว่างมาตลอด
  //
  // ถ้าวันไหน checkout ล้ม (เช่น bkk-system เปลี่ยนเป็น private) CI จะไม่แดง
  // ยกแผง แต่จะขึ้น warning annotation + บรรทัดใน job summary บอกว่ารอบนั้น
  // ด่านนี้ไม่ได้รัน — ห้ามแก้ให้มันเงียบ
  const enginePath = resolve(__dirname, '../../../bkk-system/functions/status-engine.js');

  it.skipIf(!existsSync(enginePath))('ทุก event มีอยู่จริงในตาราง TRANSITIONS ของ engine', () => {
    const engine = readFileSync(enginePath, 'utf8');
    const table = engine.slice(engine.indexOf('const TRANSITIONS'));
    for (const event of Object.values(RIDER_EVENT)) {
      expect(table, `engine ไม่มี event "${event}"`).toMatch(new RegExp(`^\\s{2}${event}:\\s*\\{`, 'm'));
    }
  });

  it('ไม่มี event ซ้ำกัน', () => {
    const values = Object.values(RIDER_EVENT);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('การรับงาน', () => {
  const apiPath = resolve(__dirname, '../../../bkk-system/functions/status-transition-api.js');

  it.skipIf(!existsSync(apiPath))('rider_accepted อยู่ใน CLAIMING_EVENTS ของ callable', () => {
    // สมมติฐานทั้งหมดของเส้นรับงานอยู่ตรงนี้: guard ฝั่ง server ยอมให้ยิง
    // event นี้ตอนงาน "ยังไม่มีเจ้าของ" ได้ ส่วน event อื่นต้องเป็นของเราก่อน
    //
    // ถ้าชื่อหลุดออกจากเซ็ตนั้นเมื่อไหร่ ไรเดอร์จะรับงานไม่ได้เลยสักใบ ทุกคน
    // ทุกงาน โดยได้ not_job_owner กลับมา — และไม่มีเทสฝั่งไหนแดง เพราะสองฝั่ง
    // อยู่คนละ repo
    const api = readFileSync(apiPath, 'utf8');
    const line = api.match(/const CLAIMING_EVENTS = new Set\(\[([^\]]*)\]\)/)?.[1] ?? '';
    expect(line).toContain(RIDER_EVENT.ACCEPTED);
  });

  it('การรับงานมีจุดเช็คอิน — เป็นจุดเริ่มนับเวลาของงาน', () => {
    // totalJobMs() ใน jobTimeline เริ่มนับจาก rider_accepted เสมอ ไม่มีแถวนี้
    // = คืน null ทั้งใบ แล้วแถว "รวม X นาที" หายไปจากหน้าประวัติทั้งหมด
    expect(EVENT_CHECKPOINT_STAGE[RIDER_EVENT.ACCEPTED]).toBe('rider_accepted');
  });
});

describe('การ์ด Revised Offer', () => {
  const enginePath = resolve(__dirname, '../../../bkk-system/functions/status-engine.js');

  it.skipIf(!existsSync(enginePath))('ขายอมรับพาไป Payout Processing ไม่ใช่ Price Accepted', () => {
    // เจ้าของงานเคาะให้คงพฤติกรรมวันนี้ (1 ก.ย. 2569) — ปลายทางนี้เป็นการ
    // ตัดสินใจเชิงธุรกิจ ไม่ใช่รายละเอียดการ implement ถ้าวันหนึ่งมีคนย้าย
    // event ไปชี้ Price Accepted "ให้เหมือนทางเว็บ" เงินจะค้างอีกหนึ่งขั้น
    // โดยไม่มีใครเห็น เทสนี้อ่านตาราง engine จริงเพื่อกันเรื่องนั้น
    const engine = readFileSync(enginePath, 'utf8');
    const rule = engine.slice(engine.indexOf('  revised_offer_accepted: {'));
    const to = rule.slice(0, rule.indexOf('},')).match(/to:\s*S\.([A-Z_]+)/)?.[1];
    expect(to).toBe('PAYOUT_PROCESSING');
  });

  it('ขายกเลิกใช้ event กลาง ไม่ใช่ event เฉพาะของการ์ด', () => {
    // engine บังคับ cancel taxonomy ผ่าน `requires` ของ event นี้ — การ์ดนี้
    // ส่ง cancel_category/cancelled_by/cancelled_at ครบอยู่แล้ว
    expect(RIDER_EVENT.CANCELLED).toBe('cancelled');
  });

  it('ทั้งสองปุ่มไม่มีจุดเช็คอิน — ไรเดอร์ไม่ได้เคลื่อนที่ไปไหน', () => {
    expect(EVENT_CHECKPOINT_STAGE[RIDER_EVENT.REVISED_OFFER_ACCEPTED]).toBeUndefined();
    expect(EVENT_CHECKPOINT_STAGE[RIDER_EVENT.CANCELLED]).toBeUndefined();
  });
});

describe('เส้นทางที่เขียน status ตรง', () => {
  // P2 ฝั่งแอปไรเดอร์จบแล้ว: ทุกปุ่มยิง event ผ่าน transitionJob และ **ไม่เหลือ
  // โค้ดบรรทัดไหนที่เขียน jobs/{id} เองอีก** เทสนี้เคยตรึงไว้ที่ "เหลือหนึ่ง"
  // (เส้นยกเลิกที่ติด coordinated change ข้าม repo) ตอนนี้ปิดจบแล้วจึงเป็นศูนย์
  //
  // ไม่ได้มีไว้ห้ามแก้ แต่ทำให้การเปิดทางเขียนตรงทางใหม่เป็นการตัดสินใจที่มีคนเห็น
  // ไม่ใช่ของที่ไหลกลับเข้ามาเงียบๆ ตอนใครสักคนรีบ
  //
  // การเขียน **โหนดลูก** ไม่เข้าข่าย: checkpoints/{stage} กับ chat_flags เป็น
  // ข้อมูลคนละแกนกับสถานะ engine ไม่ได้เป็นเจ้าของและไม่ควรเป็น
  it('ไม่เหลือการเขียน jobs/{id} ตรงเลย', () => {
    const hook = readFileSync(resolve(__dirname, '../hooks/useJobActions.ts'), 'utf8');
    const directWrites = hook.match(/update\(ref\(db, `jobs\/\$\{[A-Za-z.]+\}`\)/g) ?? [];
    expect(directWrites).toEqual([]);
  });
});

describe('EVENT_CHECKPOINT_STAGE', () => {
  it('ทุก stage ที่ map ไว้เป็น stage ที่มีจริง', () => {
    for (const stage of Object.values(EVENT_CHECKPOINT_STAGE)) {
      expect(Object.keys(STAGE_LABEL_TH)).toContain(stage);
    }
  });

  it('ทุกคีย์เป็น event ที่แอปยิงได้จริง', () => {
    const known = new Set<string>(Object.values(RIDER_EVENT));
    for (const event of Object.keys(EVENT_CHECKPOINT_STAGE)) {
      expect(known.has(event), `${event} ไม่ใช่ event ของแอปไรเดอร์`).toBe(true);
    }
  });

  it('inspection_started ไม่มีจุดเช็คอิน — ไรเดอร์ยังอยู่ที่เดิมกับตอนกด "ถึงแล้ว"', () => {
    // ไม่ใช่ของที่ลืม: เพิ่ม stage ให้มันเมื่อไหร่ ไทม์ไลน์จะมีสองจุดที่พิกัด
    // เดียวกันห่างกันไม่กี่วินาที และ totalJobMs จะนับช่วงที่ไม่มีความหมาย
    expect(EVENT_CHECKPOINT_STAGE[RIDER_EVENT.INSPECTION_STARTED]).toBeUndefined();
  });

  it('ขาไปและขากลับเทียบพิกัดคนละจุดกัน', () => {
    expect(EVENT_CHECKPOINT_STAGE[RIDER_EVENT.ARRIVED]).toBe('rider_arrived');
    expect(EVENT_CHECKPOINT_STAGE[RIDER_EVENT.RETURN_STARTED]).toBe('customer_left');
    expect(EVENT_CHECKPOINT_STAGE[RIDER_EVENT.RETURN_ARRIVED]).toBe('branch_handover');
  });
});

describe('engineErrorCode', () => {
  it('อ่านรหัสของ engine จาก details ของ callable', () => {
    expect(engineErrorCode({ code: 'functions/failed-precondition', details: { code: 'illegal_from' } }))
      .toBe('illegal_from');
  });

  it('ไม่มี details = null (ไม่ใช่ error ของ engine เช่น เน็ตหลุด)', () => {
    expect(engineErrorCode({ code: 'functions/unavailable' })).toBe(null);
    expect(engineErrorCode(null)).toBe(null);
    expect(engineErrorCode(undefined)).toBe(null);
  });

  it('ไม่หยิบ error.code ของ gRPC มาใช้แทน', () => {
    // "permission-denied" ครอบทั้ง wrong_actor และ not_job_owner ซึ่งบอกไรเดอร์
    // คนละเรื่องกัน — หยิบผิดชั้นเมื่อไหร่ ข้อความจะกลายเป็นค่ากลางเสมอ
    expect(engineErrorCode({ code: 'permission-denied' })).toBe(null);
  });

  it('details ที่ไม่ใช่ object หรือ code ไม่ใช่ string = null', () => {
    expect(engineErrorCode({ details: 'illegal_from' })).toBe(null);
    expect(engineErrorCode({ details: { code: 42 } })).toBe(null);
  });
});

describe('transitionErrorMessage', () => {
  // รหัสทั้งหมดที่ CODE_TO_HTTPS ฝั่ง callable ส่งกลับมาได้
  const ENGINE_CODES = [
    'unknown_event', 'missing_field', 'patch_conflict', 'wrong_actor', 'not_job_owner',
    'job_not_found', 'illegal_from', 'unreadable_status', 'wrong_receive_method',
    'already_paid', 'not_paid', 'write_contended',
  ];

  it('ทุกรหัสได้ข้อความไทยที่ไม่ใช่ค่า default (ยกเว้นที่ผู้ใช้ทำอะไรไม่ได้)', () => {
    const generic = transitionErrorMessage('อะไรก็ไม่รู้');
    // unknown_event / patch_conflict = บั๊กของแอปเอง ไรเดอร์ทำอะไรไม่ได้
    // ปล่อยให้ตกค่ากลางถูกแล้ว
    const expectSpecific = ENGINE_CODES.filter(c => !['unknown_event', 'patch_conflict'].includes(c));
    for (const code of expectSpecific) {
      expect(transitionErrorMessage(code), code).not.toBe(generic);
    }
  });

  it('illegal_from บอกวิธีแก้ ไม่ใช่แค่บอกว่าผิดพลาด', () => {
    // เคสที่เจอบ่อยที่สุด: แอดมินเลื่อนสถานะไปก่อน หน้าจอไรเดอร์เลยเก่า
    expect(transitionErrorMessage('illegal_from')).toContain('รีเฟรช');
  });

  it('ไม่มีรหัส = ใช้ข้อความ fallback ที่ส่งมา', () => {
    expect(transitionErrorMessage(null, 'เน็ตหลุด')).toBe('เน็ตหลุด');
    expect(transitionErrorMessage(undefined, 'เน็ตหลุด')).toBe('เน็ตหลุด');
  });

  it('ไม่มีทั้งรหัสและ fallback = ยังต้องได้ข้อความ ไม่ใช่ undefined', () => {
    expect(transitionErrorMessage(null)).toBeTruthy();
    expect(transitionErrorMessage(null)).toContain('ลองใหม่');
  });

  it('รหัสที่ engine ยังไม่มี = ตกค่ากลาง ไม่ throw', () => {
    expect(() => transitionErrorMessage('รหัสใหม่ที่ยังไม่มี')).not.toThrow();
  });
});
