// เทสของ detectDisplayMode — ข้อ (จ) ใน P0 ของแผนคิว
//
// fixture ทั้งสี่ตัวแรกคือสี่สภาพที่แผนระบุให้พิสูจน์: iOS ติดตั้ง / iOS แท็บ /
// Android ติดตั้ง / desktop. สองสภาพแรกกับสองสภาพหลัง**เดินคนละสาขาของโค้ด**
// (iOS ตอบผ่าน navigator.standalone ส่วน Android/desktop ตอบผ่าน matchMedia)
// จึงต้องมีทั้งสี่ตัว ไม่ใช่ตัวใดตัวหนึ่งแทนกันได้ — ถอดสาขาไหนออกก็ต้องมีตัวแดง
//
// เทสท้ายไฟล์คุมเส้นแบ่ง browser/unknown ซึ่งเป็นจุดที่พลาดง่ายที่สุด:
// ทั้งคู่ทำให้ isStandalone() เป็น false เหมือนกัน การ assert แค่ isStandalone()
// จึงพิสูจน์อะไรไม่ได้เลย ต้อง assert ค่าที่ detectDisplayMode คืนตรงๆ

import { describe, it, expect } from 'vitest';
import { detectDisplayMode } from './displayMode';

/** matchMedia จำลอง — ตอบ true เฉพาะ query ที่อยู่ในลิสต์ */
const mm = (trueFor: string[]) => (q: string) => ({ matches: trueFor.includes(q) });

describe('detectDisplayMode — สี่สภาพจริงตาม P0', () => {
  it('iOS ติดตั้งลงจอโฮม: navigator.standalone = true ขณะที่ matchMedia ตอบ false ทุกตัว', () => {
    // นี่คือพฤติกรรมจริงของ iOS ที่ทำให้ต้องมีสาขาแยก — ถ้าดูแต่ matchMedia
    // จะอ่าน iOS PWA ว่าเป็นแท็บทุกครั้ง ซึ่งคือเคสที่คิวถูกปิดทั้งที่ควรเปิด
    expect(detectDisplayMode({ navigatorStandalone: true, matchMedia: mm([]) })).toBe('standalone');
  });

  it('iOS เปิดในแท็บ Safari: navigator.standalone = false', () => {
    expect(detectDisplayMode({ navigatorStandalone: false, matchMedia: mm([]) })).toBe('browser');
  });

  it('Android ติดตั้งลงจอโฮม: ไม่มี navigator.standalone แต่ matchMedia ตอบ standalone', () => {
    expect(
      detectDisplayMode({ matchMedia: mm(['(display-mode: standalone)']) })
    ).toBe('standalone');
  });

  it('desktop เปิดในแท็บ: ไม่มี navigator.standalone และ matchMedia ตอบ false ทุกตัว', () => {
    expect(detectDisplayMode({ matchMedia: mm([]) })).toBe('browser');
  });
});

describe('detectDisplayMode — การติดตั้งที่ manifest ไม่ได้ใช้คำว่า standalone', () => {
  for (const q of ['(display-mode: fullscreen)', '(display-mode: minimal-ui)']) {
    it(`${q} นับเป็นติดตั้งแล้ว (storage อยู่ในกลุ่มที่ ITP ยกเว้นเหมือนกัน)`, () => {
      expect(detectDisplayMode({ matchMedia: mm([q]) })).toBe('standalone');
    });
  }
});

describe('detectDisplayMode — เส้นแบ่ง browser กับ unknown', () => {
  it('ไม่มี matchMedia เลย = unknown ไม่ใช่ browser', () => {
    expect(detectDisplayMode({})).toBe('unknown');
  });

  it('มี matchMedia แต่ throw ทุก query = unknown (ถามแล้วไม่ได้คำตอบ)', () => {
    const throwing = () => { throw new Error('unsupported media feature'); };
    expect(detectDisplayMode({ matchMedia: throwing })).toBe('unknown');
  });

  it('throw บางตัวแต่ยังมีตัวที่ตอบได้ = browser (ได้คำตอบแล้วว่าไม่ใช่)', () => {
    const partial = (q: string) => {
      if (q === '(display-mode: standalone)') throw new Error('unsupported');
      return { matches: false };
    };
    expect(detectDisplayMode({ matchMedia: partial })).toBe('browser');
  });

  it('navigator.standalone เป็นค่าที่ไม่ใช่ boolean true ห้ามอ่านว่าติดตั้งแล้ว', () => {
    // เคสจริงที่กัดได้: บาง WebView ใส่สตริง "true" มา ซึ่ง truthy แต่ไม่ใช่ true
    // ถ้าเช็คด้วย if (navigatorStandalone) จะอ่านผิดเป็นติดตั้งแล้ว = คิวเปิดผิดที่
    expect(detectDisplayMode({ navigatorStandalone: 'true', matchMedia: mm([]) })).toBe('browser');
    expect(detectDisplayMode({ navigatorStandalone: 1, matchMedia: mm([]) })).toBe('browser');
  });
});
