// ผลการทำ injection:
//   1. ถอด dedupe (`alreadyLost`)                → แดง 1/9
//   2. `isPermissionDenied` คืน false เสมอ        → แดง 1/9
//   3. `isUnauthenticatedError` คืน true เสมอ     → แดง 1/9
//   4. ถอด try/catch รอบ listener                → แดง 2/9

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../api/firebase', () => ({ db: {} }));
vi.mock('./authEvents', () => ({ logAuthEvent: vi.fn() }));

import {
  notifySessionLost,
  onSessionLost,
  resetSessionLost,
  isPermissionDenied,
  isUnauthenticatedError,
} from './sessionState';

beforeEach(() => resetSessionLost());

describe('notifySessionLost', () => {
  it('ปลุก listener ที่ subscribe ไว้', () => {
    const seen: string[] = [];
    const off = onSessionLost((r) => seen.push(r));
    notifySessionLost('r1', 'firebase_session_lost');
    expect(seen).toEqual(['firebase_session_lost']);
    off();
  });

  it('ยิงซ้ำไม่ทำอะไร — token ตายทีเดียว listener ทุกตัว error พร้อมกัน', () => {
    let count = 0;
    const off = onSessionLost(() => { count += 1; });
    notifySessionLost('r1', 'firebase_session_lost');
    notifySessionLost('r1', 'firebase_session_lost');
    notifySessionLost('r1', 'firebase_session_lost');
    expect(count).toBe(1);
    off();
  });

  it('reset แล้วยิงได้อีก (ล็อกอินสำเร็จรอบใหม่)', () => {
    let count = 0;
    const off = onSessionLost(() => { count += 1; });
    notifySessionLost('r1', 'firebase_session_lost');
    resetSessionLost();
    notifySessionLost('r1', 'firebase_session_lost');
    expect(count).toBe(2);
    off();
  });

  it('listener ที่ throw ต้องไม่ทำให้ตัวอื่นไม่ถูกเรียก', () => {
    let reached = false;
    const off1 = onSessionLost(() => { throw new Error('boom'); });
    const off2 = onSessionLost(() => { reached = true; });
    expect(() => notifySessionLost('r1', 'firebase_session_lost')).not.toThrow();
    expect(reached).toBe(true);
    off1(); off2();
  });

  it('unsubscribe แล้วไม่ถูกเรียกอีก', () => {
    let count = 0;
    const off = onSessionLost(() => { count += 1; });
    off();
    notifySessionLost('r1', 'firebase_session_lost');
    expect(count).toBe(0);
  });
});

describe('isPermissionDenied — รูปที่ RTDB โยนมาจริง', () => {
  it('จับ code และ message', () => {
    expect(isPermissionDenied({ code: 'PERMISSION_DENIED' })).toBe(true);
    expect(isPermissionDenied({ code: 'permission-denied' })).toBe(true);
    expect(isPermissionDenied({ message: "Client doesn't have permission to access the desired data." })).toBe(false);
    expect(isPermissionDenied({ message: 'PERMISSION_DENIED: Permission denied' })).toBe(true);
  });

  it('error อื่นไม่ถูกอ่านเป็นเรื่อง auth', () => {
    expect(isPermissionDenied({ code: 'NETWORK_ERROR' })).toBe(false);
    expect(isPermissionDenied(null)).toBe(false);
    expect(isPermissionDenied(new Error('disconnected'))).toBe(false);
  });
});

describe('isUnauthenticatedError — รูปที่ callable โยนมาจริง', () => {
  it('จับเฉพาะ unauthenticated', () => {
    expect(isUnauthenticatedError({ code: 'unauthenticated' })).toBe(true);
    expect(isUnauthenticatedError({ code: 'functions/unauthenticated' })).toBe(true);
  });

  it('permission-denied ของ engine ไม่ใช่เรื่อง auth — engine ปฏิเสธเอง', () => {
    expect(isUnauthenticatedError({ code: 'permission-denied' })).toBe(false);
    expect(isUnauthenticatedError({ code: 'failed-precondition' })).toBe(false);
    expect(isUnauthenticatedError(null)).toBe(false);
  });
});
