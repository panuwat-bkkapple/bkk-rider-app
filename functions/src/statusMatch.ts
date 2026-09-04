// functions/src/statusMatch.ts — เทียบสถานะงานใน rider-notifications โดย normalize ก่อน
//
// functions/ มี rootDir ของตัวเอง import `src/types/job-statuses.ts` ไม่ได้ จึงถือ
// **สำเนาเฉพาะส่วนที่ trigger ในไฟล์นี้ใช้**: ค่า canonical ที่ switch อ้างถึง + alias
// สะกดเก่าของสถานะพวกนั้น. ไม่ใช่สำเนาทั้ง enum โดยตั้งใจ — สำเนาที่ 4 ของไฟล์ 400
// บรรทัดคือของที่ drift; สำเนาย่อยที่มีเทสตรวจกับตารางจริงทุกแถวไม่ drift
//
// ด่าน: src/utils/statusMatchParity.test.ts import ทั้งไฟล์นี้กับ normalizeStatus ของ
// แอปมาเทียบ: (1) ทุกค่าใน JOB_STATUS ตรงกับ enum จริง (2) ทุก alias ที่นี่ normalize
// ไปที่เดียวกับของจริง (3) ทุก alias ในตารางจริงที่ลงสถานะในเซ็ตนี้ต้องอยู่ที่นี่ครบ
// — เพิ่มสถานะให้ trigger = เพิ่มที่นี่ แล้วเทส (3) จะบอกว่าลืม alias ไหน
//
// ที่มา: เดิม switch ใน index.ts list "ทั้งสองสะกด" ทุก case ด้วยมือ (bkk-system
// docs/reports/2026-09-04-status-literal-compare-survey-cross-repo.md ข้อ 1)

/** ค่า canonical ที่ trigger ในรีโปนี้อ้างถึง — ตัวอักษรต้องตรงกับ src/types/job-statuses.ts */
export const JOB_STATUS = {
  ACTIVE_LEAD: "Active Lead",
  RIDER_ASSIGNED: "Rider Assigned",
  RIDER_EN_ROUTE: "Rider En Route",
  QC_REVIEW: "QC Review",
  PRICE_ACCEPTED: "Price Accepted",
  REVISED_OFFER: "Revised Offer",
  COMPLETED: "Completed",
  PAID: "Paid",
  WAITING_FOR_HANDOVER: "Waiting For Handover",
  CANCELLED: "Cancelled",
  RETURNING_TO_CUSTOMER: "Returning To Customer",
  RETURN_CONFIRMED: "Return Confirmed",
  PENDING_FINANCE_APPROVAL: "Pending Finance Approval",
} as const;

/** สะกดเก่าที่ DB ยังถืออยู่ → canonical (เฉพาะสถานะข้างบน) */
export const LEGACY_ALIAS: Record<string, string> = {
  "Active Leads": JOB_STATUS.ACTIVE_LEAD,
  Assigned: JOB_STATUS.RIDER_ASSIGNED,
  "Heading to Customer": JOB_STATUS.RIDER_EN_ROUTE,
  PAID: JOB_STATUS.PAID,
  "Payment Completed": JOB_STATUS.PAID,
  "PRICE ACCEPTED": JOB_STATUS.PRICE_ACCEPTED,
  "Waiting for Handover": JOB_STATUS.WAITING_FOR_HANDOVER,
  Returned: JOB_STATUS.RETURN_CONFIRMED,
};

/** canonical ถ้ารู้จัก ไม่งั้นค่าดิบ (string ไม่ว่าง) ไม่งั้น null */
export function canonicalStatus(raw: unknown): string | null {
  const text = typeof raw === "string" && raw ? raw : null;
  if (!text) return null;
  return LEGACY_ALIAS[text] ?? text;
}

/** สถานะดิบ (before/after ของ trigger) ตรงกับ canonical ตัวใดตัวหนึ่งไหม */
export function rawStatusIs(raw: unknown, ...canonical: readonly string[]): boolean {
  const s = canonicalStatus(raw);
  return !!s && canonical.includes(s);
}
