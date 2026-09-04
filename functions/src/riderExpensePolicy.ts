// กติกาเงินของการเบิกค่าใช้จ่ายที่ไรเดอร์สำรองจ่าย — pure ทั้งไฟล์ ไม่แตะ DB
//
// แยกออกมาเพราะสามข้อนี้เป็นสิ่งเดียวในฟีเจอร์ที่ "ผิดแล้วเงินออกจริง":
// เพดานต่อรายการ · เพดานรวมต่องาน · เส้นตายเบิกย้อนหลัง
// ตัวเลขทั้งหมดมาจากข้อ 6 ของ docs/reports/2026-09-02-rider-expense-claim-design.md
// และยึดจากของจริงในระบบ ไม่ใช่จากความรู้สึก:
//
//   ค่าวิ่งไรเดอร์ถูก clamp ที่ min_fee 100 / max_fee 500
//   (bkk-system/functions/index.js) → สำรองจ่ายก้อนเดียวที่แพงกว่าค่าจ้าง
//   ทั้งเที่ยวคือเรื่องผิดปกติ ควรมีคนบนสุดเห็น
//
//   เพดานแข็ง 2,000 มีไว้จับ "การพิมพ์เกินหนึ่งหลัก" (200 → 2000)
//   ไม่ใช่จับการโกง — ทางด่วนกรุงเทพจริงอยู่ที่ 25-115 บาท
//
//   เพดานรวมต่องาน 1,000 ปิดช่องหลบเพดานด้วยการซอยรายการ ถ้าไม่มีข้อนี้
//   2,000 กลายเป็นเพดานที่ข้ามได้ด้วยการกดสี่ครั้ง
//
//   เส้นตาย 31 วัน เพราะ /expenses ถูกรายงานเป็นเดือนปฏิทินไทย เพดานนี้
//   รับประกันว่ารายการตกงวดช้าที่สุดได้แค่หนึ่งเดือนบัญชี ไม่ย้อนไปกวนงวด
//   ที่ยื่น ภ.พ.30 (วันที่ 15) หรือ ภ.ง.ด.3 (วันที่ 7) ไปแล้ว
//
// ทุกค่าอ่านจาก settings/rider_expense ได้ — ค่าใน DEFAULTS คือค่าเริ่มต้น
// ไม่ใช่คำสาบาน และต้องกลับมาปรับหลังใช้จริงสักเดือน

export interface RiderExpenseSettings {
  manager_max_per_item: number;
  hard_max_per_item: number;
  ceo_threshold_per_job: number;
  normal_backdate_days: number;
  hard_backdate_days: number;
  reimbursement_taxable: boolean;
}

export const RIDER_EXPENSE_DEFAULTS: RiderExpenseSettings = {
  manager_max_per_item: 500,
  hard_max_per_item: 2000,
  ceo_threshold_per_job: 1000,
  normal_backdate_days: 7,
  hard_backdate_days: 31,
  reimbursement_taxable: false,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * อ่านค่าจาก snapshot ของ settings/rider_expense แบบ **fallback ทีละฟิลด์**
 *
 * ทำไมไม่ `{...DEFAULTS, ...raw}` เฉยๆ: ค่าที่แอดมินพิมพ์ผิดเป็นสตริงว่าง
 * หรือ null จะทับค่า default แล้วกลายเป็น NaN — เพดานที่เป็น NaN ทำให้
 * `amount > cap` เป็น false เสมอ = **ไม่มีเพดานเลยโดยไม่มีใครรู้**
 * (กับดักตระกูลเดียวกับ loadQuoteSettings ที่ CLAUDE.md เตือนไว้)
 */
export function resolveExpenseSettings(raw: unknown): RiderExpenseSettings {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (key: keyof RiderExpenseSettings): number => {
    const v = src[key];
    if (typeof v !== "number" && typeof v !== "string") return RIDER_EXPENSE_DEFAULTS[key] as number;
    if (typeof v === "string" && v.trim() === "") return RIDER_EXPENSE_DEFAULTS[key] as number;
    const n = Number(v);
    // ค่าติดลบหรือศูนย์ = การตั้งค่าที่ปิดฟีเจอร์ทั้งฟีเจอร์โดยไม่ได้ตั้งใจ
    return Number.isFinite(n) && n > 0 ? n : (RIDER_EXPENSE_DEFAULTS[key] as number);
  };
  return {
    manager_max_per_item: num("manager_max_per_item"),
    hard_max_per_item: num("hard_max_per_item"),
    ceo_threshold_per_job: num("ceo_threshold_per_job"),
    normal_backdate_days: num("normal_backdate_days"),
    hard_backdate_days: num("hard_backdate_days"),
    // boolean ต้องเป็น true ชัดๆ เท่านั้น — คำตอบของนักบัญชียังไม่มา
    // ค่าที่อ่านไม่ออกต้องไม่กลายเป็น "หักภาษี" โดยบังเอิญ
    reimbursement_taxable: src.reimbursement_taxable === true,
  };
}

export type ExpenseRejectReason =
  | "amount_not_positive"
  | "amount_over_hard_max"
  | "occurred_in_future"
  | "occurred_too_old";

export interface ExpenseVerdict {
  ok: boolean;
  reason?: ExpenseRejectReason;
  /** ข้อความไทยที่ส่งกลับให้ไรเดอร์อ่านได้ตรงๆ */
  message?: string;
  /** ต้องให้ CEO อนุมัติ (MANAGER กดไม่ผ่าน) */
  needsCeo: boolean;
  /** เบิกช้ากว่าปกติ — ติดธงให้แอดมินเห็น ไม่ใช่การปฏิเสธ */
  late: boolean;
}

export interface ExpenseCandidate {
  amountThb: number;
  occurredAt: number;
  /** ยอดรวมของรายการอื่นในงานเดียวกันที่ยังไม่ถูกปฏิเสธ (0 ถ้าไม่ผูกงาน) */
  jobTotalSoFar: number;
}

/**
 * ตัดสินรายการหนึ่งใบ — ตัวนี้คือด่านจริง ไม่ใช่ฟอร์ม
 *
 * ฟอร์มฝั่งไรเดอร์เตือนได้เพื่อความสุภาพ แต่การบังคับต้องอยู่ฝั่ง server เสมอ
 * เพราะไรเดอร์ยิง callable ตรงได้ (บทเรียนเดียวกับ accept_defective_devices
 * ที่เคยเช็คแค่ในเบราว์เซอร์ แล้วใครยิงตรงก็ขายเครื่องที่ร้านประกาศไม่รับได้)
 */
export function evaluateExpense(
  c: ExpenseCandidate,
  s: RiderExpenseSettings,
  now: number
): ExpenseVerdict {
  const base: ExpenseVerdict = { ok: false, needsCeo: false, late: false };

  if (!Number.isFinite(c.amountThb) || c.amountThb <= 0) {
    return { ...base, reason: "amount_not_positive", message: "ระบุจำนวนเงินให้ถูกต้อง" };
  }
  if (c.amountThb > s.hard_max_per_item) {
    return {
      ...base,
      reason: "amount_over_hard_max",
      message: `รายการเดียวเกิน ${s.hard_max_per_item.toLocaleString("th-TH")} บาท ตรวจสอบยอดอีกครั้ง หรือแจ้งแอดมินให้บันทึกให้`,
    };
  }

  // นาฬิกาเครื่องไรเดอร์เดินหน้าได้จริง (ตั้งเวลาผิด/timezone) — เผื่อไว้หนึ่งวัน
  // แล้วค่อยปฏิเสธ ไม่งั้นคนที่นาฬิกาเร็วไป 5 นาทีจะเบิกไม่ได้เลย
  if (c.occurredAt > now + DAY_MS) {
    return { ...base, reason: "occurred_in_future", message: "วันที่จ่ายเงินล้ำหน้าเกินไป ตรวจสอบวันที่อีกครั้ง" };
  }

  const ageDays = (now - c.occurredAt) / DAY_MS;
  if (ageDays > s.hard_backdate_days) {
    return {
      ...base,
      reason: "occurred_too_old",
      message: `เบิกย้อนหลังได้ไม่เกิน ${s.hard_backdate_days} วัน รายการนี้เก่ากว่านั้น แจ้งแอดมินให้บันทึกให้แทน`,
    };
  }

  return {
    ok: true,
    // สองทางที่ต้องขึ้น CEO: ก้อนเดียวใหญ่ หรือซอยหลายก้อนจนงานเดียวรวมกันใหญ่
    needsCeo:
      c.amountThb > s.manager_max_per_item ||
      c.jobTotalSoFar + c.amountThb > s.ceo_threshold_per_job,
    late: ageDays > s.normal_backdate_days,
  };
}

/**
 * URL หลักฐานต้องอยู่ใต้โฟลเดอร์ของผู้เรียกเอง
 *
 * ไม่ใช่การตรวจรูปแบบ URL ให้สวย แต่กันเคสเดียว: แนบ URL ที่ไม่ใช่หลักฐานของ
 * ตัวเองมาเป็นหลักฐาน — ทั้งของไรเดอร์คนอื่นและของโฟลเดอร์อื่นในบัญชีตัวเอง
 *
 * (หมายเหตุความถูกต้อง: `storage.rules` ของ `riders/{riderId}/**` ให้ read
 * เฉพาะ `auth.uid == riderId || isAdmin()` ไรเดอร์จึง **อ่านรูปของกันไม่ได้**
 * แต่การ *อ้าง* URL ยังทำได้เพราะ callable รับสตริง และ URL ที่มี token
 * ก็เปิดได้โดยไม่ผ่าน rules — ที่เสียหายคือแอดมินเปิดดูแล้วเห็นหลักฐานผิดใบ
 * แล้วอนุมัติเงินไปตามนั้น)
 *
 * เทียบบน pathname ที่ decode แล้ว เพราะ Firebase Storage download URL เก็บ
 * path เป็น %2F — เทียบบนสตริงดิบจะไม่เจอ `riders/{uid}/` เลยสักครั้ง
 */
export function evidenceBelongsTo(url: unknown, uid: string): boolean {
  if (typeof url !== "string" || url.trim() === "") return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    return false; // URL ที่ decode ไม่ได้ = ไม่รับ ดีกว่าเดา
  }
  return decoded.includes(`riders/${uid}/expenses/`);
}

// ---------------------------------------------------------------------------
// สองการตัดสินใจที่เหลือของ callable ซึ่ง "ผิดแล้วจ่ายเงินซ้ำ/จ่ายให้คนผิด"
//
// ถูกดึงออกมาเป็น pure เพราะ **ตอน injection พบว่ามันไม่มีด่านอะไรคุ้มอยู่เลย**
// (ถอด `status: "submitted"` ให้รับค่าจาก payload แล้ว build ผ่านฉลุย ถอดการ
// คืนค่าแถวเดิมตอนยิงซ้ำก็ผ่านเช่นกัน) — ส่วน rule อื่นที่ "compile ไม่ผ่าน"
// ตอนถอด ไม่ได้แปลว่ามีด่าน มันคือ noUnusedLocals บ่นว่าตัวแปรลอย ซึ่งไม่ใช่
// การจับบั๊ก (กับดัก "เทสที่เห็นด้วยกับตัวเอง" ใน CLAUDE.md)
// ---------------------------------------------------------------------------

export interface ExpenseRowInput {
  id: string;
  uid: string;
  jobId: string | null;
  category: string;
  amountThb: number;
  note: string;
  evidence: { url: string; uploaded_at: number }[];
  occurredAt: number;
  now: number;
  needsCeo: boolean;
  late: boolean;
}

/**
 * ประกอบแถวที่จะเขียนลง `rider_expenses/{id}`
 *
 * **`status` ถูกตั้งเป็น `submitted` ที่นี่เสมอ และไม่มีพารามิเตอร์ให้ส่งค่าอื่น**
 * — ไรเดอร์ยิง callable ตรงได้ และสิ่งแรกที่คนจะลองส่งมาคือ
 * `status: "approved"`. การกันด้วย "ก็อย่าอ่านจาก payload สิ" เป็นวินัย
 * ส่วนการไม่มีทางให้ส่งเข้ามาเลยเป็นโครงสร้าง
 *
 * ธง `needs_ceo`/`late` ใส่เฉพาะเมื่อเป็นจริง ไม่ใส่ `false` ค้างไว้ — RTDB
 * เก็บ false เป็นค่าจริง แถวที่มี `needs_ceo: false` ทำให้ฝั่งแอดมินที่กรอง
 * "รายการที่รอ CEO" ต้องแยกสองกรณีโดยไม่จำเป็น
 */
export function buildExpenseRow(i: ExpenseRowInput): Record<string, unknown> {
  return {
    id: i.id,
    rider_id: i.uid,
    job_id: i.jobId,
    category: i.category,
    amount_thb: i.amountThb,
    note: i.note,
    evidence: i.evidence,
    occurred_at: i.occurredAt,
    submitted_at: i.now,
    status: "submitted",
    ...(i.needsCeo ? { needs_ceo: true as const } : {}),
    ...(i.late ? { late: true as const } : {}),
  };
}

export type DuplicateAction =
  | "create"
  | "return_existing"
  | "reject_not_owner"
  /** ใบที่แอดมินตีกลับ (`needs_info`) และไรเดอร์**ตั้งใจ**ส่งใหม่ */
  | "resubmit";

/**
 * เจอ id ซ้ำแล้วทำอย่างไร
 *
 * คิวออฟไลน์ยิงซ้ำเป็น**เรื่องปกติ** ไม่ใช่ความผิดพลาด — id จึงมาจาก client
 * เพื่อให้ยิงซ้ำได้แถวเดียว. แต่การ "เขียนทับ" แถวที่มีอยู่แล้วคือหายนะ:
 * แถวที่แอดมินอนุมัติไปแล้ว (`status: "paid"`) จะกลับเป็น `submitted`
 * แล้วถูกอนุมัติได้อีกรอบ = **จ่ายสองครั้ง** ซึ่งไม่มีใครเห็นจนกระทบยอด
 *
 * และ id ที่ชนกันข้ามคนต้องปฏิเสธ ไม่ใช่คืนแถวของคนอื่นให้ดู
 *
 * **`resubmit` ต้องมาจากธงที่ client ตั้งใจส่ง ไม่ใช่อนุมานจากสถานะ** —
 * เคสจริงที่กันไว้: ไรเดอร์ส่งใบ → response หายกลางทาง → แอดมินตีกลับ →
 * คิวยิง*ใบเดิม*ซ้ำ ถ้าตัดสินจากสถานะอย่างเดียว ใบเดิมจะเขียนทับข้อมูลที่
 * แอดมินขอให้แก้แล้วเด้งกลับเป็น submitted เหมือนไม่เคยถูกตีกลับ
 */
export function duplicateDecision(
  existing: { rider_id?: unknown; status?: unknown } | null | undefined,
  uid: string,
  opts: { resubmit?: boolean } = {}
): DuplicateAction {
  if (!existing) return "create";
  if (existing.rider_id !== uid) return "reject_not_owner";
  if (opts.resubmit === true && existing.status === "needs_info") return "resubmit";
  return "return_existing";
}

export const MAX_EVIDENCE = 5;

/**
 * รวมหลักฐานเดิมกับที่ส่งมาใหม่ตอนส่งซ้ำ — ของเดิมอยู่ก่อน ไม่ซ้ำ url ไม่เกินเพดาน
 *
 * ทำไมไม่แทนที่ทั้งชุด: ใบถูกตีกลับเพราะ "ยอดไม่ตรง" ไม่ควรบังคับให้ถ่ายสลิป
 * ใหม่ และการทิ้งรูปเดิมโดยไม่ตั้งใจแปลว่าหลักฐานที่แอดมินเคยเห็นหายไป
 */
export function mergeEvidence(
  existing: unknown,
  incoming: { url: string; uploaded_at: number }[]
): { url: string; uploaded_at: number }[] {
  const out: { url: string; uploaded_at: number }[] = [];
  const seen = new Set<string>();
  const push = (e: unknown) => {
    if (!e || typeof e !== "object") return;
    const url = (e as { url?: unknown }).url;
    if (typeof url !== "string" || url === "" || seen.has(url)) return;
    seen.add(url);
    const at = Number((e as { uploaded_at?: unknown }).uploaded_at);
    out.push({ url, uploaded_at: Number.isFinite(at) ? at : 0 });
  };
  (Array.isArray(existing) ? existing : []).forEach(push);
  incoming.forEach(push);
  return out.slice(0, MAX_EVIDENCE);
}

export interface ResubmitInput {
  jobId: string | null;
  category: string;
  amountThb: number;
  note: string;
  evidence: { url: string; uploaded_at: number }[];
  occurredAt: number;
  now: number;
  needsCeo: boolean;
  late: boolean;
  /** ชื่อไรเดอร์สำหรับแถวประวัติ — แอดมินอ่านชื่อ ไม่ได้อ่าน uid */
  riderName: string;
  uid: string;
  historyKey: string;
}

/**
 * patch สำหรับ `rider_expenses/{id}` ตอนส่งซ้ำ — **update ไม่ใช่ set**
 *
 * ฟิลด์ที่แอดมินเขียน (`reviewed_by_*`, `history/*` ของขั้นก่อน) ต้องอยู่ครบ
 * ไม่งั้นการส่งซ้ำลบร่องรอยว่าใครตีกลับเพราะอะไร. `status` กลับเป็น
 * `submitted` ตรงนี้ที่เดียว และ**ไม่มีพารามิเตอร์ให้ส่งค่าอื่น** ด้วยเหตุผล
 * เดียวกับ `buildExpenseRow`
 *
 * `needs_ceo`/`late` ถูกคิดใหม่จากยอดใหม่ — ใบที่แก้ยอดจาก 400 เป็น 4,000
 * ต้องกลับมาติดเพดานเหมือนใบใหม่ (เขียน `null` เมื่อเป็นเท็จ = ลบคีย์ทิ้ง
 * เพราะธงเก่าที่ค้างจากยอดเดิมคือธงที่โกหก)
 *
 * `review_reason` ถูกล้างเพราะมันคือ "สิ่งที่ค้างอยู่ตอนนี้" ส่วนข้อความเดิม
 * ยังอยู่ในแถว history ของขั้นตีกลับ
 */
export function buildResubmitPatch(i: ResubmitInput): Record<string, unknown> {
  return {
    job_id: i.jobId,
    category: i.category,
    amount_thb: i.amountThb,
    note: i.note,
    evidence: i.evidence,
    occurred_at: i.occurredAt,
    submitted_at: i.now,
    resubmitted_at: i.now,
    status: "submitted",
    needs_ceo: i.needsCeo ? true : null,
    late: i.late ? true : null,
    review_reason: null,
    [`history/${i.historyKey}`]: {
      at: i.now,
      action: "resubmit",
      from: "needs_info",
      to: "submitted",
      by_rider_id: i.uid,
      by_name: i.riderName,
    },
  };
}
