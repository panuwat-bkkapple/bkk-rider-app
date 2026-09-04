// เทสของกติกาเงิน — เขียนจากเคสที่จะเกิดจริงหน้างาน ไม่ใช่จากตาราง spec
//
// (CLAUDE.md: "เขียนเทสจากเคสที่ลูกค้าทำจริง ไม่ใช่จากกฎที่เพิ่งตกลงกัน" —
// กติกา refinement เคยถูกรีวิวและ confirm แล้วยังผิด และตัวที่จับได้คือเทส
// ที่เขียนตามโซ่จริง ไม่ใช่คนอ่านโค้ด)

import { describe, it, expect } from "vitest";
import {
  MAX_EVIDENCE,
  RIDER_EXPENSE_DEFAULTS as D,
  resolveExpenseSettings,
  evaluateExpense,
  evidenceBelongsTo,
  buildExpenseRow,
  buildResubmitPatch,
  duplicateDecision,
  mergeEvidence,
} from "./riderExpensePolicy";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 3, 5, 0, 0);
const ev = (amountThb: number, ageDays = 0, jobTotalSoFar = 0) =>
  evaluateExpense({ amountThb, occurredAt: NOW - ageDays * DAY, jobTotalSoFar }, D, NOW);

describe("ยอดเงิน — เคสจริงของค่าทางด่วนกับที่จอดรถ", () => {
  it("ทางด่วน 65 บาทเมื่อเช้า ผ่านฉลุย ไม่ต้องขึ้น CEO ไม่ติดธงช้า", () => {
    expect(ev(65)).toEqual({ ok: true, needsCeo: false, late: false });
  });

  it("ที่จอดรถห้าง 120 บาท ผ่านเหมือนกัน", () => {
    expect(ev(120).ok).toBe(true);
  });

  it("501 บาท ผ่านแต่ต้องขึ้น CEO — แพงกว่าค่าจ้างทั้งเที่ยวที่แพงที่สุด", () => {
    const r = ev(501);
    expect(r.ok).toBe(true);
    expect(r.needsCeo).toBe(true);
  });

  it("500 บาทพอดี ยังเป็นของ MANAGER — เส้นแบ่งคือ 'เกิน' ไม่ใช่ 'ถึง'", () => {
    expect(ev(500).needsCeo).toBe(false);
  });

  it("พิมพ์ 2000 แทน 200 → ปฏิเสธ ไม่เข้าระบบเลย", () => {
    // นี่คือเหตุผลทั้งหมดของเพดานแข็ง: จับการพิมพ์เกินหนึ่งหลัก
    const r = ev(2001);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("amount_over_hard_max");
    expect(r.message).toContain("2,000");
  });

  it("0 กับติดลบ ปฏิเสธ", () => {
    expect(ev(0).reason).toBe("amount_not_positive");
    expect(ev(-50).reason).toBe("amount_not_positive");
  });

  it("NaN ปฏิเสธ ไม่ใช่หลุดไปเป็น 0 เงียบๆ", () => {
    expect(ev(Number.NaN).reason).toBe("amount_not_positive");
  });
});

describe("ซอยรายการเพื่อหลบเพดาน — เพดานรวมต่องาน", () => {
  it("สี่รายการ 400 บาทในงานเดียว: ใบที่สามเริ่มต้องขึ้น CEO", () => {
    // 400 → รวม 400 (ok) · 400 → รวม 800 (ok) · 400 → รวม 1200 (เกิน 1,000)
    expect(ev(400, 0, 0).needsCeo).toBe(false);
    expect(ev(400, 0, 400).needsCeo).toBe(false);
    expect(ev(400, 0, 800).needsCeo).toBe(true);
  });

  it("ยอดเดี่ยวเล็กแต่งานนั้นรวมแล้วเกินเพดาน ก็ยังต้องขึ้น CEO", () => {
    expect(ev(50, 0, 990).needsCeo).toBe(true);
  });

  it("รายการที่ไม่ผูกงาน (jobTotalSoFar = 0) ตัดสินด้วยยอดเดี่ยวอย่างเดียว", () => {
    expect(ev(300, 0, 0).needsCeo).toBe(false);
  });
});

describe("เส้นตายเบิกย้อนหลัง", () => {
  it("7 วันพอดี ยังไม่ติดธงช้า", () => {
    expect(ev(100, 7).late).toBe(false);
  });

  it("8 วัน ติดธง late แต่ยังรับเข้าระบบ — ไม่ยึดเงินที่เขาจ่ายไปจริง", () => {
    const r = ev(100, 8);
    expect(r.ok).toBe(true);
    expect(r.late).toBe(true);
  });

  it("31 วันพอดี ยังรับ", () => {
    expect(ev(100, 31).ok).toBe(true);
  });

  it("32 วัน ปฏิเสธ พร้อมบอกทางออกว่าให้แจ้งแอดมิน", () => {
    const r = ev(100, 32);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("occurred_too_old");
    expect(r.message).toContain("แอดมิน");
  });

  it("นาฬิกาเครื่องเร็วไปไม่กี่ชั่วโมง ยังต้องเบิกได้", () => {
    // เคสจริง: เครื่องตั้ง timezone ผิด หรือเวลาคลาดไปเอง — ปฏิเสธคนกลุ่มนี้
    // แปลว่าเขาเบิกไม่ได้เลยทั้งที่จ่ายเงินไปจริง
    expect(evaluateExpense({ amountThb: 100, occurredAt: NOW + 3 * 3600_000, jobTotalSoFar: 0 }, D, NOW).ok).toBe(true);
  });

  it("วันที่ล้ำหน้าเกินหนึ่งวัน ปฏิเสธ", () => {
    const r = evaluateExpense({ amountThb: 100, occurredAt: NOW + 2 * DAY, jobTotalSoFar: 0 }, D, NOW);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("occurred_in_future");
  });
});

describe("resolveExpenseSettings — ค่าที่ตั้งผิดต้องไม่ปิดเพดานเงียบๆ", () => {
  it("โหนดยังไม่มี = ได้ค่าเริ่มต้นครบทุกฟิลด์", () => {
    expect(resolveExpenseSettings(null)).toEqual(D);
    expect(resolveExpenseSettings(undefined)).toEqual(D);
  });

  it("สตริงว่างจากฟอร์มแอดมิน ต้องตกกลับค่าเริ่มต้น ไม่ใช่ NaN", () => {
    // NaN เป็นเพดานแปลว่า `amount > cap` เป็น false เสมอ = ไม่มีเพดานเลย
    const s = resolveExpenseSettings({ hard_max_per_item: "" });
    expect(s.hard_max_per_item).toBe(D.hard_max_per_item);
  });

  it("ค่า 0 หรือติดลบ ตกกลับค่าเริ่มต้น", () => {
    expect(resolveExpenseSettings({ hard_max_per_item: 0 }).hard_max_per_item).toBe(D.hard_max_per_item);
    expect(resolveExpenseSettings({ manager_max_per_item: -5 }).manager_max_per_item).toBe(D.manager_max_per_item);
  });

  it("ตัวเลขที่ส่งมาเป็นสตริง (RTDB เก็บจากฟอร์ม) ใช้ได้", () => {
    expect(resolveExpenseSettings({ hard_max_per_item: "3000" }).hard_max_per_item).toBe(3000);
  });

  it("แก้ค่าเดียวไม่ทำให้ฟิลด์อื่นหาย", () => {
    const s = resolveExpenseSettings({ normal_backdate_days: 14 });
    expect(s.normal_backdate_days).toBe(14);
    expect(s.hard_backdate_days).toBe(D.hard_backdate_days);
  });

  it("reimbursement_taxable ต้องเป็น true ชัดๆ เท่านั้น", () => {
    // คำตอบของนักบัญชียังไม่มา ค่าที่อ่านไม่ออกต้องไม่กลายเป็น "หักภาษี" โดยบังเอิญ
    expect(resolveExpenseSettings({ reimbursement_taxable: true }).reimbursement_taxable).toBe(true);
    expect(resolveExpenseSettings({ reimbursement_taxable: "true" }).reimbursement_taxable).toBe(false);
    expect(resolveExpenseSettings({ reimbursement_taxable: 1 }).reimbursement_taxable).toBe(false);
    expect(resolveExpenseSettings({}).reimbursement_taxable).toBe(false);
  });

  it("เพดานที่ตั้งใหม่มีผลจริงกับการตัดสิน ไม่ใช่แค่เก็บค่าไว้เฉยๆ", () => {
    const s = resolveExpenseSettings({ hard_max_per_item: 300 });
    expect(evaluateExpense({ amountThb: 400, occurredAt: NOW, jobTotalSoFar: 0 }, s, NOW).ok).toBe(false);
  });
});

describe("evidenceBelongsTo — กันแนบรูปของคนอื่น", () => {
  const UID = "rider123";

  it("URL ของ Firebase Storage ที่ path ถูก encode เป็น %2F ต้องผ่าน", () => {
    // เคสจริง: getDownloadURL คืน path แบบ encode เสมอ เทียบบนสตริงดิบ
    // จะไม่เจอ `riders/{uid}/` เลยสักครั้ง = ปฏิเสธหลักฐานที่ถูกต้องทุกใบ
    const url =
      "https://firebasestorage.googleapis.com/v0/b/x.appspot.com/o/riders%2Frider123%2Fexpenses%2Fe1%2Fa.jpg?alt=media&token=t";
    expect(evidenceBelongsTo(url, UID)).toBe(true);
  });

  it("รูปของไรเดอร์คนอื่น ปฏิเสธ", () => {
    const url =
      "https://firebasestorage.googleapis.com/v0/b/x.appspot.com/o/riders%2FriderOTHER%2Fexpenses%2Fe1%2Fa.jpg?alt=media";
    expect(evidenceBelongsTo(url, UID)).toBe(false);
  });

  it("รูปของตัวเองแต่คนละโฟลเดอร์ (เช่นรูปงาน) ปฏิเสธ", () => {
    // โฟลเดอร์ riders/{uid}/ ถูกใช้เก็บรูปอย่างอื่นด้วย — หลักฐานการเบิกต้องมา
    // จากโฟลเดอร์ของการเบิกเท่านั้น ไม่งั้นเอารูปเครื่องลูกค้ามาเป็นสลิปได้
    const url = "https://x/o/riders%2Frider123%2Fjobs%2Fj1%2Fa.jpg";
    expect(evidenceBelongsTo(url, UID)).toBe(false);
  });

  it("uid ที่เป็น prefix ของ uid คนอื่นต้องไม่ผ่าน", () => {
    const url = "https://x/o/riders%2Frider1234%2Fexpenses%2Fe1%2Fa.jpg";
    expect(evidenceBelongsTo(url, "rider123")).toBe(false);
  });

  it("ค่าที่ไม่ใช่สตริง หรือว่าง ปฏิเสธ", () => {
    expect(evidenceBelongsTo(null, UID)).toBe(false);
    expect(evidenceBelongsTo(123, UID)).toBe(false);
    expect(evidenceBelongsTo("   ", UID)).toBe(false);
  });

  it("URL ที่ decode ไม่ได้ ปฏิเสธ ไม่ throw", () => {
    expect(() => evidenceBelongsTo("%E0%A4%A", UID)).not.toThrow();
    expect(evidenceBelongsTo("%E0%A4%A", UID)).toBe(false);
  });
});

describe("buildExpenseRow — status ต้องมาจาก server เสมอ", () => {
  const base = {
    id: "e1", uid: "riderA", jobId: null, category: "toll",
    amountThb: 65, note: "", evidence: [{ url: "u", uploaded_at: 1 }],
    occurredAt: NOW, now: NOW, needsCeo: false, late: false,
  };

  it("status เป็น submitted เสมอ และไม่มีทางส่งค่าอื่นเข้ามาได้", () => {
    // ถ้าวันหนึ่งมีคนเพิ่มพารามิเตอร์ status เข้ามา เทสนี้จะยังเขียว —
    // สิ่งที่กันจริงคือ signature ไม่มีช่องให้ส่ง ไม่ใช่ assert บรรทัดนี้
    expect(buildExpenseRow(base).status).toBe("submitted");
    // ไรเดอร์ยิง payload แปลกๆ มาแล้ว caller เผลอ spread เข้ามา ก็ยังไม่หลุด
    expect(buildExpenseRow({ ...base, ...({ status: "approved" } as object) } as never).status)
      .toBe("submitted");
  });

  it("ธง needs_ceo / late ถูกใส่เฉพาะเมื่อเป็นจริง ไม่ใส่ false ค้างไว้", () => {
    // RTDB เก็บ false เป็นค่าจริง แถวที่มี needs_ceo: false จะทำให้ query
    // ฝั่งแอดมินที่กรอง "รายการที่รอ CEO" ต้องแยกสองกรณีโดยไม่จำเป็น
    const plain = buildExpenseRow(base);
    expect("needs_ceo" in plain).toBe(false);
    expect("late" in plain).toBe(false);

    const flagged = buildExpenseRow({ ...base, needsCeo: true, late: true });
    expect(flagged.needs_ceo).toBe(true);
    expect(flagged.late).toBe(true);
  });

  it("occurred_at กับ submitted_at เป็นคนละฟิลด์ ไม่ทับกัน", () => {
    // คิวออฟไลน์ทำให้สองค่านี้ห่างกันเป็นชั่วโมงได้ ถ้าเก็บค่าเดียว
    // ฝ่ายบัญชีจะเห็นค่าทางด่วนของเมื่อวานไปโผล่ในวันนี้
    const r = buildExpenseRow({ ...base, occurredAt: NOW - 5 * DAY, now: NOW });
    expect(r.occurred_at).toBe(NOW - 5 * DAY);
    expect(r.submitted_at).toBe(NOW);
  });
});

describe("duplicateDecision — คิวยิงซ้ำต้องไม่กลายเป็นจ่ายสองรอบ", () => {
  it("ยังไม่มีแถว = สร้างใหม่", () => {
    expect(duplicateDecision(null, "riderA")).toBe("create");
    expect(duplicateDecision(undefined, "riderA")).toBe("create");
  });

  it("แถวของตัวเองมีอยู่แล้ว = คืนของเดิม ห้ามเขียนทับ", () => {
    // นี่คือข้อที่แพงที่สุด: เขียนทับแถวที่ status เป็น paid จะทำให้มันกลับไป
    // เป็น submitted แล้วอนุมัติได้อีกรอบ
    expect(duplicateDecision({ rider_id: "riderA" }, "riderA")).toBe("return_existing");
    expect(duplicateDecision({ rider_id: "riderA", status: "paid" } as never, "riderA"))
      .toBe("return_existing");
  });

  it("id ชนกับของคนอื่น = ปฏิเสธ ไม่ใช่คืนแถวของเขามาให้ดู", () => {
    expect(duplicateDecision({ rider_id: "riderB" }, "riderA")).toBe("reject_not_owner");
  });

  it("แถวที่ไม่มี rider_id (ข้อมูลเสีย) นับเป็นของคนอื่น ไม่ใช่ของเรา", () => {
    expect(duplicateDecision({}, "riderA")).toBe("reject_not_owner");
  });

  it("ใบที่ถูกตีกลับ + ธง resubmit = ส่งซ้ำได้", () => {
    expect(
      duplicateDecision({ rider_id: "riderA", status: "needs_info" }, "riderA", { resubmit: true })
    ).toBe("resubmit");
  });

  it("ใบที่ถูกตีกลับ แต่ไม่มีธง = คืนของเดิม (คิวยิงใบเดิมซ้ำหลังโดนตีกลับ)", () => {
    // เคสจริงที่กันไว้: response หายกลางทาง → แอดมินตีกลับ → คิวยิงใบเดิมซ้ำ
    // ถ้าอนุมานจากสถานะ ใบเดิมจะทับข้อมูลที่แอดมินขอให้แก้แล้วเด้งกลับเป็น
    // submitted เหมือนไม่เคยถูกตีกลับ
    expect(
      duplicateDecision({ rider_id: "riderA", status: "needs_info" }, "riderA")
    ).toBe("return_existing");
  });

  it("ธง resubmit ส่งซ้ำได้เฉพาะสถานะ needs_info — ใบที่จ่ายแล้วเด้งกลับไม่ได้", () => {
    for (const status of ["submitted", "approved", "finance_approved", "paid", "rejected"]) {
      expect(
        duplicateDecision({ rider_id: "riderA", status }, "riderA", { resubmit: true })
      ).toBe("return_existing");
    }
  });

  it("ธง resubmit บนใบของคนอื่นยังโดนปฏิเสธ", () => {
    expect(
      duplicateDecision({ rider_id: "riderB", status: "needs_info" }, "riderA", { resubmit: true })
    ).toBe("reject_not_owner");
  });
});

describe("mergeEvidence — ส่งซ้ำไม่ต้องถ่ายใหม่ทั้งชุด", () => {
  const e = (url: string, at = 1) => ({ url, uploaded_at: at });

  it("ของเดิมอยู่ก่อน ของใหม่ต่อท้าย", () => {
    const out = mergeEvidence([e("a")], [e("b", 2)]);
    expect(out.map((x) => x.url)).toEqual(["a", "b"]);
  });

  it("ส่งซ้ำโดยไม่มีรูปใหม่ = รูปเดิมยังอยู่ครบ (ใบที่แก้แค่ยอด)", () => {
    expect(mergeEvidence([e("a"), e("b")], []).length).toBe(2);
  });

  it("url ซ้ำนับครั้งเดียว", () => {
    expect(mergeEvidence([e("a")], [e("a", 9)]).length).toBe(1);
  });

  it("ไม่เกินเพดาน MAX_EVIDENCE", () => {
    const many = Array.from({ length: MAX_EVIDENCE + 3 }, (_, i) => e(`u${i}`));
    expect(mergeEvidence(many, [e("z")]).length).toBe(MAX_EVIDENCE);
  });

  it("ของเดิมที่เสีย (ไม่มี url / ไม่ใช่ array) ไม่ทำให้พัง", () => {
    expect(mergeEvidence(null, [e("a")]).map((x) => x.url)).toEqual(["a"]);
    expect(mergeEvidence([{ foo: 1 }, e("b")], []).map((x) => x.url)).toEqual(["b"]);
  });
});

describe("buildResubmitPatch — ส่งซ้ำต้องไม่ลบร่องรอยของแอดมิน", () => {
  const patch = (over: Partial<Parameters<typeof buildResubmitPatch>[0]> = {}) =>
    buildResubmitPatch({
      jobId: null,
      category: "toll",
      amountThb: 65,
      note: "",
      evidence: [{ url: "a", uploaded_at: 1 }],
      occurredAt: 100,
      now: 200,
      needsCeo: false,
      late: false,
      riderName: "สมชาย",
      uid: "riderA",
      historyKey: "h1",
      ...over,
    });

  it("กลับเป็น submitted และไม่มีทางส่งสถานะอื่น", () => {
    expect(patch().status).toBe("submitted");
  });

  it("ไม่แตะฟิลด์ที่แอดมินเขียน — เป็น patch ไม่ใช่แถวเต็ม", () => {
    const keys = Object.keys(patch());
    for (const k of ["reviewed_by_staff_id", "reviewed_by_name", "reviewed_at", "reject_reason", "history", "rider_id", "id"]) {
      expect(keys).not.toContain(k);
    }
  });

  it("ทิ้งแถวประวัติว่าไรเดอร์ส่งซ้ำ พร้อมชื่อที่แอดมินอ่านออก", () => {
    const h = patch()["history/h1"] as Record<string, unknown>;
    expect(h.action).toBe("resubmit");
    expect(h.from).toBe("needs_info");
    expect(h.to).toBe("submitted");
    expect(h.by_name).toBe("สมชาย");
  });

  it("ล้าง review_reason (สิ่งที่ค้างอยู่) แต่ข้อความเดิมยังอยู่ใน history ของขั้นก่อน", () => {
    expect(patch().review_reason).toBeNull();
  });

  it("ธงเพดานคิดใหม่จากยอดใหม่ — เท็จต้องลบคีย์ (null) ไม่ใช่ปล่อยธงเก่าค้าง", () => {
    expect(patch({ needsCeo: false }).needs_ceo).toBeNull();
    expect(patch({ needsCeo: true }).needs_ceo).toBe(true);
    expect(patch({ late: false }).late).toBeNull();
  });

  it("submitted_at เดินใหม่ (คิวของแอดมินเรียงตามมัน) และจำเวลาส่งซ้ำแยกไว้", () => {
    const p = patch();
    expect(p.submitted_at).toBe(200);
    expect(p.resubmitted_at).toBe(200);
  });
});
