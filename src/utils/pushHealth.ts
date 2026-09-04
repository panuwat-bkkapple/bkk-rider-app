// src/utils/pushHealth.ts
//
// สถานะ "เครื่องนี้รับ push ได้ไหม" ที่ทั้งแอปอ่านได้ — และคำอธิบายที่ไรเดอร์
// อ่านแล้วรู้ว่าต้องทำอะไรต่อ
//
// ทำไมต้องมี (รายงานสำรวจ docs/reports/2026-09-03-rider-push-delivery-survey.md ข้อ B):
//
//   เดิมการ register Service Worker ทั้งแอปมีที่เดียว และอยู่ **ใต้**
//   `Notification.requestPermission()` ที่ยิงอัตโนมัติตอน mount — ไม่ได้ permission
//   = ไม่มี SW = ไม่มีทั้ง push เบื้องหลังและแคชออฟไลน์ และ**ไม่มีปุ่มหรือจอ
//   สถานะให้ซ่อมเองเลย** ไรเดอร์ที่พลาดครั้งเดียว (กดไม่อนุญาต / ลบแอปติดตั้งใหม่
//   แล้ว permission รีเซ็ต / iOS ปฏิเสธคำขอที่ไม่ได้มาจากการแตะ) จึงไม่มี push
//   ถาวรโดยไม่มีอะไรบอก ในขณะที่แอปแอดมินมีทั้งการ์ดสถานะและปุ่มซ่อม
//
// ทำไมเป็น module-level store ไม่ใช่ prop: hook ที่รู้สถานะอยู่ที่ App ส่วนการ์ด
// ที่แสดงอยู่ใน HomeTab/ProfileTab ลึกลงไปสามชั้น การร้อย prop ผ่าน RiderApp
// แปลว่าทุกชั้นต้องรู้เรื่อง push ซึ่งไม่ใช่เรื่องของมัน (รูปเดียวกับ
// sessionState.ts และ Toast.tsx)
//
// `describePushHealth` เป็น pure โดยตั้งใจ — ข้อความที่ไรเดอร์เห็นถูกตัดสินที่นี่
// ที่เดียว และเทสได้โดยไม่ต้องมี DOM/เบราว์เซอร์

export type PushPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export interface PushHealth {
  /** เบราว์เซอร์นี้มี Notification + Service Worker + FCM รองรับไหม */
  supported: boolean;
  permission: PushPermission;
  /** มี SW ที่ active คุมหน้านี้อยู่ไหม */
  swActive: boolean;
  /** token ถูกเขียนลง riders/{id}/fcm_tokens ล่าสุดเมื่อไหร่ (null = ยังไม่เคย/ไม่รู้) */
  tokenSavedAt: number | null;
  /** กำลังขอ permission / ดึง token อยู่ */
  busy: boolean;
  /** ความล้มเหลวล่าสุดที่ไรเดอร์ควรรู้ (ข้อความสั้น ไม่ใช่ error ดิบ) */
  lastError: string | null;
}

export const INITIAL_PUSH_HEALTH: PushHealth = {
  supported: true,
  permission: 'default',
  swActive: false,
  tokenSavedAt: null,
  busy: false,
  lastError: null,
};

export type PushHealthLevel =
  | 'ok'          // ทุกอย่างพร้อม
  | 'action'      // ไรเดอร์กดปุ่มเดียวแล้วน่าจะหาย
  | 'blocked'     // ต้องไปแก้ในตั้งค่าเครื่อง แอปทำเองไม่ได้
  | 'unsupported' // เบราว์เซอร์นี้ทำไม่ได้เลย
  | 'checking';   // ยังไม่รู้ (กำลังทำงาน)

export interface PushHealthCopy {
  level: PushHealthLevel;
  title: string;
  detail: string;
  /** ปุ่มที่ควรโชว์ — null = ไม่มีอะไรให้กด */
  cta: 'enable' | 'refresh' | null;
}

const AGE_STALE_MS = 7 * 24 * 60 * 60 * 1000;

function ago(ts: number, now: number): string {
  const m = Math.max(0, Math.round((now - ts) / 60000));
  if (m < 1) return 'เมื่อสักครู่';
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} ชั่วโมงที่แล้ว`;
  return `${Math.round(h / 24)} วันที่แล้ว`;
}

/** แปลงสถานะเป็นสิ่งที่ไรเดอร์อ่านแล้วรู้ว่าต้องทำอะไร
 *
 *  ลำดับเงื่อนไขเรียงตาม "ความถาวร" — เบราว์เซอร์ไม่รองรับแก้ไม่ได้เลย จึงตัดสิน
 *  ก่อน · ถูกปิดในตั้งค่าเครื่องแอปแก้เองไม่ได้แต่ไรเดอร์แก้ได้ · ยังไม่เคยขอ =
 *  กดปุ่มเดียว · ได้ permission แล้วแต่ยังไม่มี token = ลองใหม่ */
export function describePushHealth(h: PushHealth, now: number = Date.now()): PushHealthCopy {
  if (!h.supported || h.permission === 'unsupported') {
    return {
      level: 'unsupported',
      title: 'เบราว์เซอร์นี้รับการแจ้งเตือนไม่ได้',
      detail: 'บน iPhone ต้องเพิ่มแอปไว้ที่หน้าจอโฮม (แชร์ → เพิ่มลงหน้าจอโฮม) แล้วเปิดจากไอคอนนั้น ไม่ใช่จาก Safari หรือ LINE',
      cta: null,
    };
  }

  if (h.permission === 'denied') {
    return {
      level: 'blocked',
      title: 'การแจ้งเตือนถูกปิดไว้ในเครื่อง',
      detail: 'ไปที่ ตั้งค่า → การแจ้งเตือน → BKK Rider แล้วเปิด "อนุญาตการแจ้งเตือน" จากนั้นกลับมากดลองใหม่',
      cta: 'refresh',
    };
  }

  if (h.busy) {
    return { level: 'checking', title: 'กำลังตั้งค่าการแจ้งเตือน...', detail: '', cta: null };
  }

  if (h.permission === 'default') {
    return {
      level: 'action',
      title: 'ยังไม่ได้เปิดการแจ้งเตือน',
      detail: 'ถ้าไม่เปิด งานใหม่จะไม่เด้งขึ้นเครื่อง — กดปุ่มแล้วเลือก "อนุญาต"',
      cta: 'enable',
    };
  }

  // permission === 'granted' จากนี้ไป
  if (h.lastError) {
    return {
      level: 'action',
      title: 'ลงทะเบียนเครื่องไม่สำเร็จ',
      detail: h.lastError,
      cta: 'refresh',
    };
  }

  if (!h.swActive || h.tokenSavedAt === null) {
    return {
      level: 'action',
      title: 'เครื่องนี้ยังไม่ได้ลงทะเบียนรับการแจ้งเตือน',
      detail: 'อนุญาตแล้วแต่ยังไม่ได้ผูกเครื่องกับบัญชี — กดลองใหม่หนึ่งครั้ง',
      cta: 'refresh',
    };
  }

  if (now - h.tokenSavedAt > AGE_STALE_MS) {
    return {
      level: 'action',
      title: 'การแจ้งเตือนอาจหลุด',
      detail: `ลงทะเบียนล่าสุด ${ago(h.tokenSavedAt, now)} — กดลองใหม่เพื่อต่ออายุ`,
      cta: 'refresh',
    };
  }

  return {
    level: 'ok',
    title: 'การแจ้งเตือนเปิดอยู่',
    detail: `ลงทะเบียนเครื่องล่าสุด ${ago(h.tokenSavedAt, now)}`,
    cta: 'refresh',
  };
}

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------

type Listener = () => void;
const listeners = new Set<Listener>();
let current: PushHealth = INITIAL_PUSH_HEALTH;

export interface PushActions {
  /** ขอ permission (ต้องเรียกจาก user gesture) แล้วลงทะเบียน token */
  enable: () => Promise<void>;
  /** ดึง token ใหม่แล้วเขียนทับ — ใช้ตอน "ลองใหม่" */
  refresh: () => Promise<void>;
}
let actions: PushActions | null = null;

export function getPushHealth(): PushHealth {
  return current;
}

export function subscribePushHealth(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setPushHealth(patch: Partial<PushHealth>): void {
  const next = { ...current, ...patch };
  // ไม่ยิง listener ถ้าไม่มีอะไรเปลี่ยน — visibilitychange ยิงบ่อย
  const keys = Object.keys(patch) as (keyof PushHealth)[];
  if (keys.every((k) => current[k] === next[k])) return;
  current = next;
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.warn('[push] health listener threw:', (err as Error)?.message);
    }
  });
}

export function registerPushActions(a: PushActions | null): void {
  actions = a;
}

export function pushActions(): PushActions | null {
  return actions;
}

/** สำหรับเทส — ล้างกลับสภาพเริ่ม */
export function resetPushHealthForTest(): void {
  current = INITIAL_PUSH_HEALTH;
  actions = null;
  listeners.clear();
}
