// src/utils/pickupSchedule.ts — อ่านนัดหมายจาก jobs/{id}/pickup_schedule (pure)
//
// ฟิลด์นี้มีผู้เขียนสามรายและ **เขียนคนละรูป** ทั้งสามรูปอยู่บน production พร้อมกัน:
//
//   checkout ลูกค้า   { type: 'instant' | 'schedule', date, time }
//                     (bkk-frontend-next/functions/src/index.ts — validateAndCreateOrder)
//   แอดมินเลื่อนนัด    { type: 'scheduled', date, time, time_start, time_end, rescheduled_at? }
//                     (bkk-system/src/utils/appointment.ts — buildPickupSchedule)
//   งานเก่า           อาจมีแค่ appointment_time (epoch) โดยไม่มี pickup_schedule เลย
//
// `'scheduled'` ของแอดมินไม่เคยอยู่ใน union ที่แอปนี้ประกาศ และ
// `time_start`/`time_end` ไม่มีในนั้นเลย — แอปจึงอ่านเวลาได้แค่สตริงรวม
// (`"12:00 - 14:00"`) ซึ่งเรียงลำดับหรือเทียบเวลาไม่ได้
//
// MIRROR: กฎการแยกช่วงเวลาตรงกับ `parseTimeRange` ใน
// bkk-system/src/utils/appointment.ts — แก้ที่นั่นต้องดูที่นี่ด้วย
// (รวมเป็นโมดูลเดียวไม่ได้ คนละรีโปคนละ build)

/** ตัวคั่นช่วงเวลา — รับ hyphen/en dash/em dash เหมือนฝั่งแอดมิน */
const RANGE_SEP = /\s*[-–—]\s*/;

export interface PickupScheduleLike {
  /** `'instant'` (checkout) · `'schedule'` (checkout) · `'scheduled'` (แอดมิน) */
  type?: string;
  date?: string;
  time?: string;
  time_start?: string;
  time_end?: string;
  rescheduled_at?: number;
}

export interface AppointmentWindow {
  /** `YYYY-MM-DD` — null เมื่อเป็นงานรับด่วน */
  date: string | null;
  /** `HH:MM` — null เมื่ออ่านไม่ได้ */
  start: string | null;
  end: string | null;
  /** รับด่วน (1-2 ชม.) ไม่ใช่นัดตามเวลา */
  instant: boolean;
  /** แอดมินเลื่อนนัดมาแล้ว */
  rescheduled: boolean;
  /**
   * สตริงเวลาดิบตามที่ผู้เขียนใส่มา — เก็บไว้ให้ตัวแสดงผล fallback
   * เมื่อ parse ไม่ผ่าน (เช่นแอดมินพิมพ์ `"บ่าย"`) การกลืนค่าที่อ่านไม่ออก
   * ทิ้งแปลว่าไรเดอร์เห็นน้อยกว่าที่ระบบมี ซึ่งแย่กว่าเห็นข้อความแปลกๆ
   */
  rawTime: string | null;
}

const HHMM = /^(\d{1,2}):(\d{2})$/;

const cleanTime = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return HHMM.test(t) ? t : null;
};

/**
 * ช่วงเวลานัดของงานหนึ่งใบ — รับได้ทุกรูปที่มีอยู่จริงบน production
 *
 * เลือก `time_start`/`time_end` ก่อนเสมอเมื่อมี เพราะเป็นค่า structured ที่
 * แอดมินเขียน ส่วนสตริงรวมเป็น backward-compat ของงานที่ checkout สร้าง
 */
export function parseAppointmentWindow(job: any): AppointmentWindow | null {
  const ps = job?.pickup_schedule as PickupScheduleLike | undefined | null;
  if (!ps) return null;

  // `type: 'instant'` **ไม่ได้แปลว่าไม่มีช่วงเวลา** — คิวเช้า (ลูกค้ากดก่อน
  // ร้านเปิด/หลังร้านปิด) ถูกเขียนเป็น instant พร้อม date จริงและ
  // `"HH:00 - HH:00"` จริง โดยตั้งใจให้แอดมินกับไรเดอร์เห็นช่วงเวลาจริง
  // ไม่ใช่คำว่า Instant (bkk-frontend-next/functions/src/index.ts —
  // validateAndCreateOrder). ถ้าดู type อย่างเดียวจะทิ้งช่วงเวลานั้นแล้ว
  // ขึ้นว่า "รับด่วน" ซึ่งคือการลบข้อมูลที่ฝั่งโน้นตั้งใจส่งมาให้
  const date = ps.date && ps.date !== 'Instant' ? ps.date : null;
  const instant = date === null && (ps.type === 'instant' || ps.date === 'Instant');
  const rescheduled = typeof ps.rescheduled_at === 'number' && ps.rescheduled_at > 0;

  // structured ก่อน
  let start = cleanTime(ps.time_start);
  let end = cleanTime(ps.time_end);

  // ไม่มี structured ก็แยกจากสตริงรวม
  if (start === null && typeof ps.time === 'string' && ps.time !== 'Instant') {
    const parts = ps.time.split(RANGE_SEP);
    start = cleanTime(parts[0]);
    if (end === null) end = cleanTime(parts[1]);
  }

  const rawTime =
    typeof ps.time === 'string' && ps.time.trim() !== '' && ps.time !== 'Instant'
      ? ps.time.trim()
      : null;

  return { date, start, end, instant, rescheduled, rawTime };
}

/**
 * เวลาเริ่มนัด (epoch ms) — null เมื่อบอกไม่ได้
 *
 * ใช้เรียงลำดับงานในกอง งานรับด่วนไม่มีเวลาเริ่มที่แน่นอนจึงคืน null
 * (คนเรียกตัดสินเองว่าจะวางไว้ตรงไหน) และ **ห้ามเดาเป็น 0 หรือเวลาปัจจุบัน**
 * เพราะทั้งสองอย่างทำให้งานไปโผล่ผิดที่ในลำดับโดยไม่มีใครรู้
 */
export function appointmentStartAt(job: any): number | null {
  const w = parseAppointmentWindow(job);
  // งานรับด่วนไม่มี `date` ตามนิยามข้างบน จึงตกที่ `!w.date` อยู่แล้ว
  // (เคยมี guard `w.instant` ซ้ำตรงนี้ — injection พิสูจน์ว่าถอดออกแล้วเทส
  // ยังเขียวเพราะไม่มีทางไปถึงมัน จึงลบทิ้งตามกฎ "ด่านที่ไปไม่ถึงให้ลบ")
  if (!w || !w.date || !w.start) return null;
  const [y, m, d] = w.date.split('-').map(Number);
  const hm = HHMM.exec(w.start);
  if (!y || !m || !d || !hm) return null;
  const t = new Date(y, m - 1, d, Number(hm[1]), Number(hm[2]), 0, 0).getTime();
  return Number.isFinite(t) ? t : null;
}

/** `"12:00 - 14:00"` / `"12:00"` — null เมื่ออ่านเวลาไม่ได้เลย */
export function formatWindow(w: AppointmentWindow | null): string | null {
  if (!w || !w.start) return null;
  return w.end ? `${w.start} - ${w.end}` : w.start;
}

/**
 * เรียงงานตามเวลานัด — ใช้กับกองงานที่ยิงเข้ามา (dispatch pool)
 *
 * สามกลุ่มตามลำดับ: **รับด่วนขึ้นก่อน** (ต้องออกภายใน 1-2 ชม. จึงด่วนกว่าทุกนัด
 * ที่ระบุเวลา) · นัดตามเวลาเรียงจากใกล้ไปไกล · **งานที่อ่านเวลานัดไม่ได้อยู่ท้าย**
 *
 * งานกลุ่มสุดท้ายไม่ได้ถูกซ่อน — การ์ดของมันไม่มีบรรทัด "นัดหมาย:" อยู่แล้ว
 * ไรเดอร์จึงเห็นด้วยตาว่ามันไม่มีเวลานัด ไม่ใช่ถูกดันลงล่างเงียบๆ
 */
export function compareByAppointment(a: any, b: any): number {
  const rank = (job: any): number => {
    const w = parseAppointmentWindow(job);
    if (w?.instant) return 0;
    return appointmentStartAt(job) === null ? 2 : 1;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  const sa = appointmentStartAt(a);
  const sb = appointmentStartAt(b);
  // ห้ามลบกันเมื่อมีข้างใดเป็น null — `null - 5` คือ `-5` ไม่ใช่ NaN
  // (Number(null) === 0) แปลว่างานที่ไม่มีเวลานัดจะถูกอ่านเป็นเวลาต้นยุค
  // แล้วขึ้นหัวแถวเงียบๆ. เคยมี `as number` คาไว้ตรงนี้ซึ่งกลบเคสนั้นจาก
  // compiler ด้วย — injection จับได้เพราะกฎ rank ถูกถอดแล้วเทสยังเขียว
  if (sa === null || sb === null) return 0;
  return sa - sb;
}
