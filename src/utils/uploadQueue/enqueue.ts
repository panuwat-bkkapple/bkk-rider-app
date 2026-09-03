// ทางเข้าคิว — จุดเดียวที่งานใหม่เกิดได้
//
// **ตรวจ standalone ตอน enqueue ไม่ใช่ตอน mount** (กติกาข้อ 3 ของแผน) —
// iOS เปลี่ยนบริบทได้ระหว่าง session และผลการตรวจห้าม cache ข้ามการเปิดแอป
//
// **เกตนี้คุมแค่ "รับงานใหม่เข้าคิวไหม" ไม่ใช่ "ส่งงานเก่าออกไหม"** — งานที่
// อยู่ในคิวแล้วยัง flush ต่อได้แม้รอบนี้จะเปิดจากแท็บ ไม่งั้นงานจะติดค้าง
// เพราะเปิดผิดทาง ซึ่งไม่ใช่ความผิดของไรเดอร์
//
// **ต่างจากแผนเดิมหนึ่งข้อ: ไม่มี `target.key` จาก `push().key`** — แผนเสนอให้
// คำนวณ key ของแถวปลายทางตอน enqueue แต่ P1 ทำให้ `riderSubmitExpense` ตั้ง id
// ของแถวจาก `payload.id` ซึ่งก็คือ id ของงานในคิวอยู่แล้ว การมี key สองชุด
// จึงเป็นของที่ต้องคอย sync ฟรีๆ (และ `newClientKey` ที่เขียนไว้ตามแผนถูกลบ
// เพราะไม่มีใครเรียก — กฎ "ด่านที่ไปไม่ถึง ให้ลบ ไม่ใช่ ship")

import { isStandalone } from '../displayMode';
import { validateImageFile } from '../uploadImage';
import imageCompression from 'browser-image-compression';
import type { QueuedUpload } from './types';
import * as store from './store';
import { canEnqueue } from './policy';

/** เท่ากับ compressionOptions ใน uploadImage.ts — บีบตอน enqueue ไม่ใช่ตอนส่ง
 *  เพราะตอนส่งอาจเป็นอีกวันแล้ว และไฟล์ดิบกินพื้นที่คิวสี่เท่า */
const COMPRESSION = { maxSizeMB: 0.8, maxWidthOrHeight: 1920, useWebWorker: true };

const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

export type EnqueueResult =
  | { ok: true; id: string; queued: boolean }
  | { ok: false; reason: 'not_standalone' | 'offline_not_standalone' | 'invalid_file' | 'capacity' | 'storage_unavailable'; message: string };

export interface EnqueueInput {
  uid: string;
  files: File[];
  payload: QueuedUpload['payload'];
  /** ออนไลน์อยู่ไหม — ส่งมาจาก caller เพื่อให้เทสได้ */
  online: boolean;
}

/**
 * รับงานเข้าคิว
 *
 * `queued: false` = เข้าคิวแล้วและออนไลน์อยู่ caller ควรเรียก flush ทันที
 * (ไรเดอร์แทบไม่รู้ว่ามีคิว) · `queued: true` = ออฟไลน์ รอสัญญาณ
 */
export async function enqueue(input: EnqueueInput): Promise<EnqueueResult> {
  const standalone = isStandalone();

  // เส้น B: เปิดจากแท็บ — ออฟไลน์แล้วรับงานไว้ไม่ได้ เพราะ ITP ลบ
  // script-writeable storage หลัง 7 วันสำหรับโดเมนที่ไม่ได้ติดตั้ง
  // **ข้อความต้องพูดความจริง: ระบบไม่ได้ขัดข้อง มันปฏิเสธที่จะสัญญาสิ่งที่
  // รับประกันไม่ได้**
  if (!standalone && !input.online) {
    return {
      ok: false,
      reason: 'offline_not_standalone',
      message:
        'เครื่องนี้เปิดจากเบราว์เซอร์ ระบบเก็บรูปไว้รอส่งไม่ได้ (ข้อมูลอาจถูกลบใน 7 วัน) — ติดตั้งแอปไว้หน้าจอโฮมเพื่อส่งตอนไม่มีสัญญาณได้',
    };
  }

  if (input.files.length === 0) {
    return { ok: false, reason: 'invalid_file', message: 'แนบรูปสลิปหรือหลักฐานอย่างน้อย 1 รูป' };
  }
  for (const f of input.files) {
    const err = validateImageFile(f);
    if (err) return { ok: false, reason: 'invalid_file', message: err };
  }

  const id = uuid();
  const compressed: QueuedUpload['files'] = [];
  for (const f of input.files) {
    // บีบล้มเหลว = ใช้ไฟล์ดิบ ดีกว่าปฏิเสธทั้งรายการ (ไฟล์ ≤ 20 MB ผ่าน rules
    // ที่เพดาน 25 MB อยู่แล้ว แค่กินพื้นที่คิวมากกว่า)
    let blob: Blob = f;
    try {
      blob = await imageCompression(f, COMPRESSION);
    } catch (e) {
      console.warn('[uploadQueue] compression failed, using original:', e);
    }
    const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    compressed.push({
      blob,
      content_type: blob.type || f.type,
      // path คงที่ตลอดชีพของงาน → retry เขียนทับที่เดิม = idempotent
      storage_path: `riders/${input.uid}/expenses/${id}/${uuid()}.${ext}`,
    });
  }

  const existing = await store.listAll();
  const bytes = compressed.reduce((s, f) => s + (f.blob?.size || 0), 0);
  const capacity = canEnqueue(existing, bytes);
  if (!capacity.ok) {
    return { ok: false, reason: 'capacity', message: capacity.message || 'คิวเต็ม' };
  }

  const item: QueuedUpload = {
    id,
    uid: input.uid,
    created_at: Date.now(),
    kind: 'expense_evidence',
    files: compressed,
    payload: input.payload,
    state: 'pending',
    attempts: 0,
    next_attempt_at: Date.now(),
  };

  // เขียนไม่ลง = **ห้ามบอกว่าอยู่ในคิวแล้ว** การสัญญาสิ่งที่ไม่มีอยู่
  // แย่กว่าการบอกตรงๆ ว่าส่งไม่ได้
  if (!(await store.put(item))) {
    return {
      ok: false,
      reason: 'storage_unavailable',
      message: 'เครื่องนี้เก็บรายการไว้รอส่งไม่ได้ ลองส่งใหม่ตอนมีสัญญาณ',
    };
  }

  return { ok: true, id, queued: !input.online };
}
