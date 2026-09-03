// ผล injection (วัดจริง ไม่ได้ประมาณ):
//   1. `loginErrorMessage` คืน LOGIN_FALLBACK เสมอ           → แดง 3/11
//   2. ถอด 'auth/user-disabled' ออกจากตาราง                  → แดง 1/11
//      ← เคสที่จุดชนวน PR นี้ แดงที่เทส "บัญชีถูกระงับ" ตัวเดียวพอดี
//   3. แยก 'auth/user-not-found' เป็นข้อความของตัวเอง
//      (ยกเลิกการยุบกัน)                                     → แดง 1/11
//   4. `resetPasswordErrorMessage` คืน RESET_FALLBACK เสมอ   → แดง 3/11
//   5. ให้ fallback คืน `String(code)` (เอา code ดิบมาโชว์)   → แดง 3/11
//
// ตัวเลขชุดแรกที่เขียนไว้เดาไปสองข้อ (1 กับ 5) วัดจริงแล้วไม่ตรง จึงแก้ให้ตรง —
// ตัวเลขที่เดาไว้ในหัวไฟล์เทสอันตรายกว่าไม่เขียนเลย เพราะคนอ่านรอบหน้าจะเชื่อมัน

import { describe, it, expect } from 'vitest';
import { loginErrorMessage, resetPasswordErrorMessage } from './authErrors';

describe('loginErrorMessage', () => {
  it('บัญชีถูกระงับ — เคสที่ทำให้ต้องมีไฟล์นี้', () => {
    expect(loginErrorMessage('auth/user-disabled')).toBe('บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อออฟฟิศ');
  });

  it('รหัสผ่านผิดกับอีเมลไม่มีในระบบ ต้องได้ข้อความเดียวกัน (กัน account enumeration)', () => {
    const wrong = loginErrorMessage('auth/wrong-password');
    expect(loginErrorMessage('auth/invalid-credential')).toBe(wrong);
    expect(loginErrorMessage('auth/user-not-found')).toBe(wrong);
  });

  it('เน็ตหลุดต้องแยกออกจากรหัสผ่านผิด — ไรเดอร์อยู่บนถนน', () => {
    const network = loginErrorMessage('auth/network-request-failed');
    expect(network).toContain('อินเทอร์เน็ต');
    expect(network).not.toBe(loginErrorMessage('auth/wrong-password'));
  });

  it('ลองผิดถี่เกินไป', () => {
    expect(loginErrorMessage('auth/too-many-requests')).toContain('รอสักครู่');
  });

  it('code ที่ไม่รู้จักได้ข้อความกลางที่ยังบอกทางออกได้', () => {
    expect(loginErrorMessage('auth/operation-not-allowed')).toContain('ติดต่อออฟฟิศ');
  });

  it('ไม่มี code เลย (undefined/null) ก็ต้องไม่พัง', () => {
    expect(loginErrorMessage(undefined)).toContain('ติดต่อออฟฟิศ');
    expect(loginErrorMessage(null)).toContain('ติดต่อออฟฟิศ');
  });

  // กติกาข้อ 1 ของไฟล์: ห้ามข้อความดิบของ SDK หลุดขึ้นจอ
  it('ห้ามมีข้อความดิบของ SDK หลุดออกมาไม่ว่า code จะเป็นอะไร', () => {
    for (const code of [
      'auth/user-disabled',
      'auth/internal-error',
      'Firebase: Error (auth/user-disabled).',
      'ห่านที่ไม่มีอยู่จริง',
      '',
    ]) {
      const msg = loginErrorMessage(code);
      expect(msg).not.toContain('Firebase');
      expect(msg).not.toContain('auth/');
      expect(msg).not.toMatch(/[a-z]{4,}/); // ไม่มีคำภาษาอังกฤษยาวๆ ปนมา
    }
  });
});

describe('resetPasswordErrorMessage', () => {
  it('รูปแบบอีเมลผิด', () => {
    expect(resetPasswordErrorMessage('auth/invalid-email')).toBe('รูปแบบอีเมลไม่ถูกต้อง');
  });

  it('เน็ตหลุดต้องไม่บอกว่า "ไม่พบอีเมลนี้ในระบบ" — ของเดิมบอกข้อมูลผิด', () => {
    const msg = resetPasswordErrorMessage('auth/network-request-failed');
    expect(msg).toContain('อินเทอร์เน็ต');
    expect(msg).not.toContain('ไม่พบอีเมล');
  });

  it('code ที่ไม่รู้จักต้องไม่ยืนยันว่ามีหรือไม่มีอีเมลนั้นในระบบ', () => {
    const msg = resetPasswordErrorMessage('auth/internal-error');
    expect(msg).not.toContain('ไม่พบอีเมล');
    expect(msg).toContain('ติดต่อออฟฟิศ');
  });

  it('ขอลิงก์ถี่เกินไป', () => {
    expect(resetPasswordErrorMessage('auth/too-many-requests')).toContain('รอสักครู่');
  });
});
