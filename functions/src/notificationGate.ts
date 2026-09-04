// functions/src/notificationGate.ts
//
// สวิตช์การแจ้งเตือนของแอดมิน (settings/notifications ตั้งที่ bkk-system
// /notification-settings) ต้องครอบ push ที่ส่งจาก codebase นี้ด้วย
//
// ก่อนหน้านี้ไม่ครอบ (รายงานสำรวจ push ข้อ I): bkk-system gate ที่ pushToRider
// ของตัวเอง แต่ push งานใหม่ · broadcast · แชท ส่งจากที่นี่ผ่าน sendToRider ซึ่ง
// ไม่เคยอ่านสวิตช์เลย — ปิด "Push ไรเดอร์" แล้วยังเด้งครึ่งหนึ่ง สวิตช์เดียว
// ปิดได้ครึ่งเดียวคือสวิตช์ที่แอดมินจะเลิกเชื่อ
//
// กติกาลอกจาก bkk-system/functions/notification-settings.js **ทั้งความหมาย**:
//   · fail-open ทุกทาง — ไม่มี node / อ่านพัง / type ที่ไม่รู้จัก = ส่งตามเดิม
//     มีแต่ `false` ที่แอดมินเขียนเองเท่านั้นที่ปิด
//   · ตัดสินสองชั้น: ช่อง `rider_push` ก่อน แล้วค่อยหมวดของ event
//   · หมวดของ type ฝั่งนี้ (chat/job_status/broadcast_job) ต้องมีอยู่ใน
//     EVENT_CATEGORY ของไฟล์นั้นด้วยตัวอักษรเดียวกัน — ด่านอยู่ที่
//     src/utils/riderNotificationGate.test.ts ซึ่งอ่านไฟล์ฝั่ง bkk-system มาเทียบ
//     (CI sparse-checkout ไฟล์นั้นมาให้)
//
// แคช 30 วินาทีต่อ container เหมือนต้นทาง — push ทุกใบไม่ควรจ่าย RTDB
// round-trip เพิ่ม และ 30 วิสั้นพอที่การกดสวิตช์จะมีผลขณะแอดมินยังดูหน้าอยู่

export const SETTINGS_PATH = "settings/notifications";
const CACHE_TTL_MS = 30 * 1000;

/** data.type ที่ codebase นี้ส่ง → หมวดในหน้า /notification-settings
 *  MIRROR ของสามบรรทัดใน EVENT_CATEGORY ฝั่ง bkk-system */
export const RIDER_EVENT_CATEGORY: Record<string, string> = {
  chat: "chat_message",
  job_status: "status_change",
  broadcast_job: "new_ticket",
};

export interface NotificationSettings {
  channels?: Record<string, unknown>;
  events?: Record<string, unknown>;
}

export interface GateDecision {
  allowed: boolean;
  /** เหตุผลสำหรับ log — null เมื่ออนุญาต */
  reason: string | null;
}

/** การตัดสินล้วนๆ — ไม่แตะฐานข้อมูล เทสได้ตรงๆ */
export function riderPushDecision(
  settings: NotificationSettings | null | undefined,
  type: string | null | undefined
): GateDecision {
  const channels = (settings && settings.channels) || {};
  if (channels.rider_push === false) return { allowed: false, reason: "channel:rider_push" };

  const category = type ? RIDER_EVENT_CATEGORY[type] : undefined;
  if (!category) return { allowed: true, reason: null }; // type ที่ไม่รู้จัก — ห้าม gate
  const events = (settings && settings.events) || {};
  if (events[category] === false) return { allowed: false, reason: `event:${category}` };
  return { allowed: true, reason: null };
}

let cache: { at: number; value: NotificationSettings } | null = null;

/** อ่าน settings/notifications ผ่านแคชสั้นๆ — พังเมื่อไหร่คืน {} (= เปิดหมด) */
export async function loadNotificationSettings(
  read: () => Promise<unknown>
): Promise<NotificationSettings> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  try {
    const raw = await read();
    const value = raw && typeof raw === "object" ? (raw as NotificationSettings) : {};
    cache = { at: Date.now(), value };
    return value;
  } catch (err) {
    console.error("[notifyGate] read failed, defaulting to enabled:", err);
    return {};
  }
}

/** สำหรับเทส */
export function clearNotificationSettingsCache(): void {
  cache = null;
}
