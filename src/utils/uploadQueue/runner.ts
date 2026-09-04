// ตัวส่งคิว — ลำดับการทำงานคือหัวใจ ไม่ใช่รายละเอียด
//
// **รูปต้องขึ้นครบก่อนแถวจะถูกเขียน** (invariant ข้อ 1 ของแผน) — สลับลำดับ
// เมื่อไหร่ได้แถวขอเบิกเงินที่ไม่มีหลักฐาน ซึ่งละเมิดกฎ "ไม่มีรูป = ส่งไม่ได้"
// ที่เป็นเหตุผลทั้งหมดของฟีเจอร์นี้
//
// **single-flight สองชั้น:** mutex ในหน่วยความจำกันสองรอบในแท็บเดียวกัน
// ส่วน `leased_until` ใน record กันแท็บที่ตายกลางทางไม่ให้ล็อกงานถาวร
// (ชั้นเดียวไม่พอ: mutex หายไปพร้อมแท็บ lease อยู่รอด)
//
// **ห้าม throw ออกไปถึง UI** (invariant ข้อ 7) — ทุกความล้มเหลวกลายเป็น
// state ของ item เท่านั้น

import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { storage, functions, auth } from '../../api/firebase';
import { declaredImageType } from '../uploadImage';
import type { QueuedUpload } from './types';
import * as store from './store';
import {
  afterAttempt, classifyFailure, isReady, lease, ownedBy,
  type AttemptOutcome,
} from './policy';

let running = false;

const errCode = (e: unknown): string =>
  (e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '');

const errMessage = (e: unknown): string => {
  const code = errCode(e);
  if (code.includes('unauthorized')) return 'ไม่มีสิทธิ์อัปโหลด ติดต่อแอดมิน';
  if (code.includes('unauthenticated')) return 'เซสชันหมดอายุ เข้าสู่ระบบใหม่แล้วลองอีกครั้ง';
  if (code.includes('failed-precondition') || code.includes('invalid-argument')) {
    // ข้อความจาก callable เขียนมาให้ไรเดอร์อ่านอยู่แล้ว (เพดาน/เส้นตาย)
    const m = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : '';
    return m || 'รายการนี้ส่งไม่ได้ตามเงื่อนไข';
  }
  return 'ส่งไม่สำเร็จ จะลองใหม่ให้อัตโนมัติ';
};

/**
 * ส่งงานหนึ่งชิ้น — คืน outcome ไม่เขียน store เอง (ให้ flush เป็นคนเขียน
 * ที่เดียว เพื่อให้ลำดับการเขียน state อ่านได้จากที่เดียว)
 */
async function attempt(item: QueuedUpload): Promise<{ outcome: AttemptOutcome; item: QueuedUpload }> {
  let cur = item;

  // 1) รูปก่อน — ไฟล์ที่มี url แล้วข้าม (retry ไม่อัปซ้ำของที่ขึ้นไปแล้ว)
  for (let i = 0; i < cur.files.length; i += 1) {
    const f = cur.files[i];
    if (f.url) continue;

    // Blob หายจาก IndexedDB = สถานะ ไม่ใช่ความเงียบ (invariant ข้อ 6)
    // เช็ค size > 0 ด้วย: Blob ที่รอดมาแบบว่างเปล่าอัปผ่านแต่เปิดดูไม่ได้
    if (!f.blob || typeof f.blob.size !== 'number' || f.blob.size === 0) {
      return { outcome: { ok: false, kind: 'evidence_lost' }, item: cur };
    }

    try {
      const snap = await uploadBytes(storageRef(storage, f.storage_path), f.blob, {
        contentType: declaredImageType(f.content_type || f.blob.type),
      });
      const url = await getDownloadURL(snap.ref);
      // เขียน url ลง item ทันทีทีละไฟล์ แล้วบันทึก — ขาดกลางคันหลังไฟล์ที่ 2
      // จะไม่ต้องอัปไฟล์ที่ 1 ใหม่
      const files = cur.files.slice();
      files[i] = { ...f, url };
      cur = { ...cur, files };
      await store.put(cur);
    } catch (e) {
      return {
        outcome: { ok: false, kind: classifyFailure(errCode(e)), message: errMessage(e) },
        item: cur,
      };
    }
  }

  // 2) แถวทีหลัง — id เดิมเสมอ ทำให้ยิงซ้ำได้แถวเดียว (server มี
  //    duplicateDecision รับอยู่อีกชั้น)
  try {
    await httpsCallable(functions, 'riderSubmitExpense')({
      id: cur.id,
      category: cur.payload.category,
      amount_thb: cur.payload.amount_thb,
      note: cur.payload.note,
      occurred_at: cur.payload.occurred_at,
      job_id: cur.payload.job_id,
      evidence: cur.files.map((f) => ({ url: f.url })),
      // ธงส่งซ้ำต้องไปถึง server เป็นค่า boolean เป๊ะ — ไม่ส่ง = ใบใหม่/retry
      ...(cur.payload.resubmit === true ? { resubmit: true } : {}),
    });
    return { outcome: { ok: true }, item: cur };
  } catch (e) {
    return {
      outcome: { ok: false, kind: classifyFailure(errCode(e)), message: errMessage(e) },
      item: cur,
    };
  }
}

/**
 * ส่งทุกงานที่ถึงคิว — เรียกซ้ำได้ปลอดภัย
 *
 * `navigator.onLine` เป็นตัวเร่ง **ไม่ใช่ตัวตัดสิน** (captive portal รายงาน
 * true ได้) ตัวตัดสินคือผลจริงของ uploadBytes — จึงไม่มี early return
 * ตอน offline นอกจากเพื่อประหยัดรอบเปล่า
 */
export async function flush(): Promise<{ sent: number; failed: number }> {
  if (running) return { sent: 0, failed: 0 };
  running = true;
  let sent = 0;
  let failed = 0;
  try {
    const uid = auth.currentUser?.uid;
    // ไม่มี uid = auth ยังไม่ settle หรือ logout อยู่ — ส่งตอนนี้จะล้มฟรี
    // และงานยังอยู่ในคิวครบ (ห้ามลบ) รอรอบหน้า
    if (!uid) return { sent: 0, failed: 0 };

    const now = Date.now();
    const all = await store.listAll();
    // งานของคนอื่นข้ามไป **แต่ไม่ลบ** — เป็นเงินของเจ้าของเดิม
    const ready = all.filter((i) => ownedBy(i, uid) && isReady(i, now));

    for (const item of ready) {
      const held = lease(item, Date.now());
      if (!(await store.put(held))) continue; // เขียน lease ไม่ลง = ข้ามรอบนี้

      const { outcome, item: latest } = await attempt(held);
      const next = afterAttempt(latest, outcome, Date.now());
      await store.put(next);
      if (outcome.ok) sent += 1; else failed += 1;
    }
  } catch (e) {
    // ห้าม throw ขึ้นไปถึง UI
    console.error('[uploadQueue] flush failed:', e);
  } finally {
    running = false;
  }
  return { sent, failed };
}

/** เผื่อเทส/หน้า debug อยากรู้ว่ามีรอบไหนค้างอยู่ */
export const isFlushing = (): boolean => running;
