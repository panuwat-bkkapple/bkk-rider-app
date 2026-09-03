// เทสของ foregroundAlert — เขียนจาก payload จริงของผู้ส่งทั้งสองราย
// ไม่ใช่จาก spec ที่นึกเอง
//
// ผล injection (วัดจริง ไม่ได้เดา — รัน `npx vitest run src/utils/pushDisplay.test.ts`
// หลังทำลายกฎทีละข้อ):
//   อ่านเฉพาะ payload.notification (ย้อนเป็นพฤติกรรมเดิม)  → แดง 10 จาก 15
//   อ่านเฉพาะ data (ทิ้ง fallback ของ bkk-system)          → แดง 2
//   ตัดเงื่อนไข "ไม่มีทั้ง title และ body = null"           → แดง 3
//   tag ไม่เอา jobId มาประกอบ                              → แดง 3
//   ตัด trim ของ str()                                     → แดง 1
//
// ตัวเลขชุดนี้เขียนหลังรันจริง — ฉบับร่างแรกใส่ 4/3/2/2/1 ไว้จากการเดา ซึ่งผิด
// สี่ในห้าตัว **ตัวเลขที่เดาแล้วอ่านเหมือนวัดมา อันตรายกว่าการไม่ใส่ตัวเลขเลย**
// เพราะคนอ่านรอบหน้าจะเชื่อว่ามีการวัด
//
// ข้อ 2 แดงแค่ 2 ตัวเพราะมีเทสแค่ 2 ตัวที่เดินผ่าน fallback นั้นจริงๆ (อีกตัวที่
// ส่ง notification มาด้วยคือ "data ชนะ notification" ซึ่งยังเขียวเพราะ data
// ครบอยู่แล้ว) — ไม่ใช่เทสกลวง แต่เป็นจำนวนทางที่ไปถึงกฎข้อนั้นได้จริง

import { describe, it, expect } from 'vitest';
import { foregroundAlert, alertLine } from './pushDisplay';

describe('foregroundAlert — รับได้ทั้งสองรูปที่ผู้ส่งจริงใช้', () => {
  it('data-only จาก bkk-rider-app (งานใหม่) — รูปที่เดิมเงียบสนิท', () => {
    const a = foregroundAlert({
      data: { type: 'job_status', jobId: 'J1', status: 'Rider Assigned', title: '📦 งานใหม่เข้า!', body: 'iPhone 15 - คุณเอ' },
    });
    expect(a).not.toBeNull();
    expect(a!.title).toBe('📦 งานใหม่เข้า!');
    expect(a!.body).toBe('iPhone 15 - คุณเอ');
  });

  it('data-only broadcast', () => {
    const a = foregroundAlert({ data: { type: 'broadcast_job', jobId: 'J2', title: '📦 งาน Broadcast ใหม่!', body: 'iPad - รีบกดรับก่อน!' } });
    expect(a!.body).toBe('iPad - รีบกดรับก่อน!');
  });

  it('data-only แชท', () => {
    const a = foregroundAlert({ data: { type: 'chat', jobId: 'J3', messageId: 'm1', title: '💬 แอดมิน', body: '📷 ส่งรูปภาพ' } });
    expect(a!.title).toBe('💬 แอดมิน');
    expect(a!.data.jobId).toBe('J3');
  });

  it('รูป notification จาก bkk-system (เลื่อนนัด) — data ไม่มี title/body', () => {
    const a = foregroundAlert({
      notification: { title: '🔄 นัดหมายถูกเลื่อน', body: 'iPhone 14 · เวลาใหม่ 5 ก.ย. 13:00' },
      data: { type: 'appointment_rescheduled', jobId: 'J4', newDate: '2026-09-05', newTime: '13:00' },
    });
    expect(a!.title).toBe('🔄 นัดหมายถูกเลื่อน');
    expect(a!.body).toBe('iPhone 14 · เวลาใหม่ 5 ก.ย. 13:00');
  });

  it('data ชนะ notification เมื่อมีทั้งคู่', () => {
    const a = foregroundAlert({
      data: { title: 'จาก data', body: 'เนื้อ data' },
      notification: { title: 'จาก notification', body: 'เนื้อ notification' },
    });
    expect(a!.title).toBe('จาก data');
    expect(a!.body).toBe('เนื้อ data');
  });
});

describe('foregroundAlert — ไม่แสดงใบเปล่า', () => {
  it('ไม่มีทั้ง title และ body = null (ใบ "BKK Rider" เนื้อว่างที่เจอบนเครื่องจริง)', () => {
    expect(foregroundAlert({ data: { type: 'job_status', jobId: 'J5' } })).toBeNull();
  });

  it('payload ว่าง / null = null', () => {
    expect(foregroundAlert({})).toBeNull();
    expect(foregroundAlert(null)).toBeNull();
    expect(foregroundAlert(undefined)).toBeNull();
  });

  it('ช่องว่างล้วนไม่นับว่ามีเนื้อ', () => {
    expect(foregroundAlert({ data: { title: '   ', body: '' } })).toBeNull();
  });

  it('มีแต่ body ก็แสดง โดยใช้หัวเรื่องกลางๆ', () => {
    const a = foregroundAlert({ notification: { body: 'มีอะไรบางอย่าง' } });
    expect(a!.title).toBe('BKK Rider');
    expect(a!.body).toBe('มีอะไรบางอย่าง');
  });
});

describe('tag — ยุบใบซ้ำของงานเดียวกัน รูปเดียวกับ Service Worker', () => {
  it('ประกอบจาก type กับ jobId', () => {
    expect(foregroundAlert({ data: { type: 'chat', jobId: 'J9', title: 'ก' } })!.tag).toBe('chat-J9');
  });

  it('ไม่มี type ใช้ rider แทน', () => {
    expect(foregroundAlert({ data: { jobId: 'J9', title: 'ก' } })!.tag).toBe('rider-J9');
  });

  it('ไม่มี jobId = ใบทั่วไป', () => {
    expect(foregroundAlert({ data: { title: 'ก' } })!.tag).toBe('bkk-rider');
  });

  it('งานคนละใบต้องไม่ยุบรวมกัน', () => {
    const a = foregroundAlert({ data: { type: 'chat', jobId: 'A', title: 'ก' } })!;
    const b = foregroundAlert({ data: { type: 'chat', jobId: 'B', title: 'ก' } })!;
    expect(a.tag).not.toBe(b.tag);
  });
});

describe('alertLine', () => {
  it('รวมหัวเรื่องกับเนื้อเมื่อมีทั้งคู่', () => {
    expect(alertLine(foregroundAlert({ data: { title: 'หัว', body: 'เนื้อ' } })!)).toBe('หัว · เนื้อ');
  });

  it('มีแต่หัวเรื่องก็ไม่ห้อยจุดคั่นทิ้งไว้', () => {
    expect(alertLine(foregroundAlert({ data: { title: 'หัว' } })!)).toBe('หัว');
  });
});
