// โหมดการแสดงผลของแอป — ติดตั้งลงจอโฮมแล้วหรือเปิดในแท็บเบราว์เซอร์
//
// ทำไมต้องมีไฟล์นี้ และทำไมมันตัดสินใจแบบเอียงข้างเดียว:
//
// คิวอัปโหลดออฟไลน์ (docs/reports/2026-09-01-rider-upload-offline-queue-plan.md)
// เก็บรูปหลักฐานไว้ใน IndexedDB ระหว่างรอเน็ต แต่ ITP ของ Safari **ลบ storage
// ที่สคริปต์เขียนเองทิ้งหลัง 7 วัน** ยกเว้นโดเมนที่ผู้ใช้ Add to Home Screen
// การเปิดคิวบนแท็บธรรมดาจึงไม่ใช่ "ฟีเจอร์ที่ทำงานได้บ้าง" แต่คือ **หลักฐาน
// การเบิกเงินหายเงียบๆ** โดยไม่มีใครรู้จนถึงวันที่ไรเดอร์ทวงเงิน
//
// ต้นทุนของการเดาผิดจึงไม่สมมาตร:
//   เดาว่าไม่ standalone ทั้งที่ใช่ = ไรเดอร์ต้องรอสัญญาณก่อนกดส่ง (รำคาญ)
//   เดาว่า standalone ทั้งที่ไม่ใช่ = รูปหายหลัง 7 วัน (เงินหาย ตามกลับไม่ได้)
//
// `isStandalone()` จึงคืน true **เฉพาะเมื่อมีสัญญาณยืนยันจริง** เท่านั้น
// ไม่มี API ให้ถาม / ถามแล้ว throw = `unknown` ซึ่งอ่านว่า "ไม่ใช่"

export type DisplayMode = 'standalone' | 'browser' | 'unknown';

/** ค่าที่แต่ละแพลตฟอร์มตอบ — แยกพารามิเตอร์เพื่อให้เทสได้โดยไม่ต้องมี jsdom global */
export interface DisplayModeInputs {
  /** `navigator.standalone` — มีเฉพาะ Safari บน iOS/iPadOS (ไม่ standard) */
  navigatorStandalone?: unknown;
  /** `window.matchMedia` — Android/desktop ใช้ตัวนี้ ส่วน iOS ตอบ false เสมอ */
  matchMedia?: ((q: string) => { matches: boolean }) | undefined;
}

// installed PWA ตอบ standalone เป็นหลัก แต่ manifest ที่ตั้ง display เป็น
// fullscreen/minimal-ui ก็คือการติดตั้งลงจอโฮมเหมือนกัน (storage อยู่ในกลุ่ม
// ที่ ITP ยกเว้นเช่นกัน) จึงนับให้ครบ ไม่ใช่นับเฉพาะคำว่า standalone
const INSTALLED_QUERIES = [
  '(display-mode: standalone)',
  '(display-mode: fullscreen)',
  '(display-mode: minimal-ui)',
];

export function detectDisplayMode(inputs: DisplayModeInputs): DisplayMode {
  const { navigatorStandalone, matchMedia } = inputs;

  // iOS: navigator.standalone === true คือคำตอบที่เชื่อได้ตัวเดียว
  // (บน iOS `matchMedia('(display-mode: standalone)')` ตอบ false แม้ติดตั้งแล้ว)
  if (navigatorStandalone === true) return 'standalone';

  if (typeof matchMedia === 'function') {
    let answered = false;
    for (const q of INSTALLED_QUERIES) {
      try {
        if (matchMedia(q)?.matches === true) return 'standalone';
        answered = true;
      } catch {
        // เบราว์เซอร์ที่ไม่รู้จัก query นี้ throw ได้ — ข้ามไปตัวถัดไป
      }
    }
    // ตอบได้อย่างน้อยหนึ่ง query และไม่มีตัวไหนใช่ + iOS ก็ตอบ false ไปแล้ว
    // = อยู่ในแท็บจริง ไม่ใช่ "ไม่รู้"
    // ถ้า throw ครบทุก query = ถามแล้วไม่ได้คำตอบ ต้องเป็น unknown ไม่ใช่ browser
    if (answered) return 'browser';
  }

  // ไม่มี matchMedia (หรือถามแล้ว throw ครบ) และ navigator.standalone ไม่ตอบ true
  return 'unknown';
}

/** อ่านจาก global ปัจจุบัน — ปลอดภัยเมื่อรันฝั่ง server หรือใน worker */
export function currentDisplayMode(): DisplayMode {
  if (typeof window === 'undefined') return 'unknown';
  return detectDisplayMode({
    navigatorStandalone: (window.navigator as unknown as { standalone?: unknown })?.standalone,
    matchMedia: typeof window.matchMedia === 'function' ? (q: string) => window.matchMedia(q) : undefined,
  });
}

/**
 * ประตูของคิวออฟไลน์ — `unknown` อ่านว่า "ไม่ใช่" โดยตั้งใจ (ดูหัวไฟล์)
 * ห้ามเปลี่ยนให้ `unknown` ผ่าน เพราะราคาของการเดาผิดคือหลักฐานการเบิกหาย
 */
export function isStandalone(): boolean {
  return currentDisplayMode() === 'standalone';
}
