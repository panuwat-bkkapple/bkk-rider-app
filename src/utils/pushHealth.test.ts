// เทสของ describePushHealth — ข้อความที่ไรเดอร์เห็นถูกตัดสินที่นี่ที่เดียว
//
// สถานะแต่ละแบบเขียนจากเคสจริงที่รายงานสำรวจ (3 ก.ย. 2569 ข้อ B) ระบุไว้:
// ลบแอปติดตั้งใหม่แล้ว permission รีเซ็ต · iOS ปฏิเสธคำขอที่ไม่ได้มาจากการแตะ
// · เปิดจาก LINE/Safari แทนหน้าจอโฮม · token ถูก server ตัดทิ้งแล้วไม่มีใครรู้
//
// ผล injection — วัดจริงหลังรันทีละตัว (ไม่ได้เขียนตัวเลขไว้ก่อนวัด):
//   ทิ้งกิ่ง unsupported                       → แดง 2 จาก 16
//   busy ตัดสินก่อน denied (สลับลำดับ)          → แดง 1
//   default ให้ปุ่ม refresh แทน enable          → แดง 2
//   ทิ้งกิ่ง lastError                         → แดง 1
//   เส้น stale 7 → 30 วัน                      → แดง 1
//   ok โดยไม่ต้องมี swActive                    → แดง 1
//   store ไม่ dedupe                            → แดง 1
// ทุกกฎมีเทสที่ไปถึงอย่างน้อยหนึ่งตัว — ไม่มีด่านที่ไปไม่ถึงให้ลบ

import { describe, it, expect, beforeEach } from 'vitest';
import {
  describePushHealth,
  INITIAL_PUSH_HEALTH,
  setPushHealth,
  getPushHealth,
  subscribePushHealth,
  resetPushHealthForTest,
  type PushHealth,
} from './pushHealth';

const NOW = 1_800_000_000_000;
const h = (patch: Partial<PushHealth>): PushHealth => ({ ...INITIAL_PUSH_HEALTH, ...patch });

describe('describePushHealth — ลำดับตามความถาวร', () => {
  it('เบราว์เซอร์ไม่รองรับ (เปิดจาก LINE/Safari tab) = unsupported ไม่มีปุ่ม', () => {
    const c = describePushHealth(h({ supported: false }), NOW);
    expect(c.level).toBe('unsupported');
    expect(c.cta).toBeNull();
    expect(c.detail).toContain('หน้าจอโฮม');
  });

  it('permission unsupported ก็ถือว่า unsupported แม้ supported จะ true', () => {
    expect(describePushHealth(h({ permission: 'unsupported' }), NOW).level).toBe('unsupported');
  });

  it('denied = blocked บอกทางไปตั้งค่าเครื่อง + ปุ่มลองใหม่ (เผื่อกลับมาหลังเปิดแล้ว)', () => {
    const c = describePushHealth(h({ permission: 'denied' }), NOW);
    expect(c.level).toBe('blocked');
    expect(c.cta).toBe('refresh');
    expect(c.detail).toContain('ตั้งค่า');
  });

  it('denied ชนะ busy — กำลังทำงานอยู่ก็แก้ในตั้งค่าไม่ได้อยู่ดี', () => {
    expect(describePushHealth(h({ permission: 'denied', busy: true }), NOW).level).toBe('blocked');
  });

  it('default = action พร้อมปุ่ม enable (เคสหลังลบแอปติดตั้งใหม่)', () => {
    const c = describePushHealth(h({ permission: 'default' }), NOW);
    expect(c.level).toBe('action');
    expect(c.cta).toBe('enable');
  });

  it('busy = checking ไม่มีปุ่ม (กันกดซ้ำระหว่างขอ permission)', () => {
    const c = describePushHealth(h({ permission: 'default', busy: true }), NOW);
    expect(c.level).toBe('checking');
    expect(c.cta).toBeNull();
  });

  it('granted แต่มี lastError = action โชว์ข้อความนั้น + refresh', () => {
    const c = describePushHealth(h({ permission: 'granted', swActive: true, lastError: 'เขียนลงฐานข้อมูลไม่ได้' }), NOW);
    expect(c.level).toBe('action');
    expect(c.detail).toBe('เขียนลงฐานข้อมูลไม่ได้');
    expect(c.cta).toBe('refresh');
  });

  it('granted แต่ไม่มี SW = action (SW ไม่เคย register)', () => {
    const c = describePushHealth(h({ permission: 'granted', swActive: false, tokenSavedAt: NOW }), NOW);
    expect(c.level).toBe('action');
    expect(c.cta).toBe('refresh');
  });

  it('granted + SW แต่ไม่เคยเขียน token = action', () => {
    const c = describePushHealth(h({ permission: 'granted', swActive: true, tokenSavedAt: null }), NOW);
    expect(c.level).toBe('action');
    expect(c.title).toContain('ยังไม่ได้ลงทะเบียน');
  });

  it('token เก่ากว่า 7 วัน = action เตือนต่ออายุ (server ตัด token ตายเงียบๆ)', () => {
    const c = describePushHealth(h({ permission: 'granted', swActive: true, tokenSavedAt: NOW - 8 * 24 * 3600 * 1000 }), NOW);
    expect(c.level).toBe('action');
    expect(c.detail).toContain('วันที่แล้ว');
  });

  it('token 6 วันยังไม่เตือน — เส้นอยู่ที่ 7', () => {
    expect(describePushHealth(h({ permission: 'granted', swActive: true, tokenSavedAt: NOW - 6 * 24 * 3600 * 1000 }), NOW).level).toBe('ok');
  });

  it('ครบทุกอย่าง = ok ยังมีปุ่ม refresh ให้กดได้ (การ์ดในโปรไฟล์)', () => {
    const c = describePushHealth(h({ permission: 'granted', swActive: true, tokenSavedAt: NOW - 5 * 60000 }), NOW);
    expect(c.level).toBe('ok');
    expect(c.cta).toBe('refresh');
    expect(c.detail).toContain('5 นาทีที่แล้ว');
  });

  it('เวลาที่อ่านง่าย: เมื่อสักครู่ / ชั่วโมง', () => {
    expect(describePushHealth(h({ permission: 'granted', swActive: true, tokenSavedAt: NOW - 10_000 }), NOW).detail).toContain('เมื่อสักครู่');
    expect(describePushHealth(h({ permission: 'granted', swActive: true, tokenSavedAt: NOW - 3 * 3600 * 1000 }), NOW).detail).toContain('3 ชั่วโมงที่แล้ว');
  });
});

describe('store', () => {
  beforeEach(() => resetPushHealthForTest());

  it('setPushHealth ปลุก listener และ getPushHealth เห็นค่าใหม่', () => {
    let calls = 0;
    subscribePushHealth(() => { calls++; });
    setPushHealth({ permission: 'granted' });
    expect(getPushHealth().permission).toBe('granted');
    expect(calls).toBe(1);
  });

  it('patch ที่ไม่เปลี่ยนอะไร ไม่ปลุก listener (visibilitychange ยิงบ่อย)', () => {
    let calls = 0;
    setPushHealth({ permission: 'granted' });
    subscribePushHealth(() => { calls++; });
    setPushHealth({ permission: 'granted' });
    expect(calls).toBe(0);
  });

  it('listener ที่ throw ไม่ทำให้ตัวอื่นไม่ถูกเรียก', () => {
    let second = 0;
    subscribePushHealth(() => { throw new Error('boom'); });
    subscribePushHealth(() => { second++; });
    setPushHealth({ swActive: true });
    expect(second).toBe(1);
  });
});
