// เทสของทางเข้าคิว — เน้นเส้นแบ่ง A/B ซึ่งเป็นจุดที่ผิดแล้วหลักฐานหายเงียบ
//
// เทสนี้ mock สามอย่าง: การตรวจ standalone, ที่เก็บ IndexedDB, และตัวบีบรูป
// เพราะทั้งสามต้องมีเบราว์เซอร์จริง ส่วนสิ่งที่พิสูจน์คือ **การตัดสินใจ**
// ซึ่งเป็นของเรา ไม่ใช่ของเบราว์เซอร์

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../displayMode', () => ({ isStandalone: vi.fn() }));
vi.mock('./store', () => ({ listAll: vi.fn(), put: vi.fn() }));
vi.mock('browser-image-compression', () => ({
  default: vi.fn(async (f: File) => f),
}));
vi.mock('../uploadImage', () => ({
  validateImageFile: vi.fn(() => null),
  declaredImageType: (t: string) => t || 'image/jpeg',
}));

import { enqueue } from './enqueue';
import { isStandalone } from '../displayMode';
import * as store from './store';
import { validateImageFile } from '../uploadImage';
import { MAX_QUEUED_ITEMS } from './policy';
import type { QueuedUpload } from './types';

const file = (name = 'slip.jpg', size = 1024) =>
  new File([new Uint8Array(size)], name, { type: 'image/jpeg' });

const PAYLOAD = { category: 'toll', amount_thb: 65, note: '', occurred_at: 1, job_id: null };

const run = (over: Partial<Parameters<typeof enqueue>[0]> = {}) =>
  enqueue({ uid: 'riderA', files: [file()], payload: PAYLOAD, online: true, ...over });

beforeEach(() => {
  // ต้องล้างก่อนทุกเทส ไม่งั้น `mock.calls[0]` ชี้ไปที่การเรียกของเทสก่อนหน้า
  // แล้ว assert ผ่าน/ไม่ผ่านโดยไม่เกี่ยวกับเทสที่กำลังรัน (เจอจริงตอนเขียนไฟล์นี้:
  // เทส "ไม่มีรูป = ไม่เขียนอะไรลงเครื่อง" แดงเพราะนับการเขียนของเทสอื่น)
  vi.clearAllMocks();
  vi.mocked(isStandalone).mockReturnValue(true);
  vi.mocked(store.listAll).mockResolvedValue([]);
  vi.mocked(store.put).mockResolvedValue(true);
  vi.mocked(validateImageFile).mockReturnValue(null);
});

describe('เส้น B — เปิดจากแท็บเบราว์เซอร์', () => {
  it('ออฟไลน์ + ไม่ standalone = ปฏิเสธ พร้อมบอกวิธีติดตั้ง', () => {
    vi.mocked(isStandalone).mockReturnValue(false);
    return run({ online: false }).then((r) => {
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toBe('offline_not_standalone');
      expect(r.message).toContain('ติดตั้งแอป');
    });
  });

  it('ข้อความห้ามบอกว่าระบบขัดข้อง — มันไม่ได้ขัดข้อง', async () => {
    // มันกำลังปฏิเสธที่จะสัญญาสิ่งที่รับประกันไม่ได้ ซึ่งเป็นเรื่องคนละเรื่อง
    // และไรเดอร์ที่อ่านว่า "ขัดข้อง" จะรอให้หายเอง แทนที่จะไปติดตั้งแอป
    vi.mocked(isStandalone).mockReturnValue(false);
    const r = await run({ online: false });
    if (r.ok) throw new Error('ควรถูกปฏิเสธ');
    expect(r.message).not.toContain('ขัดข้อง');
    expect(r.message).not.toContain('ผิดพลาด');
  });

  it('ออนไลน์ + ไม่ standalone = ผ่าน (โค้ดเดิมทุกบรรทัด ส่งทันที)', async () => {
    vi.mocked(isStandalone).mockReturnValue(false);
    const r = await run({ online: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.queued).toBe(false); // caller ต้อง flush ทันที
  });
});

describe('เส้น A — ติดตั้งลงจอโฮมแล้ว', () => {
  it('ออฟไลน์ = เข้าคิวรอสัญญาณ', async () => {
    const r = await run({ online: false });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.queued).toBe(true);
  });

  it('ออนไลน์ = เข้าคิวแล้วส่งทันที ไรเดอร์แทบไม่รู้ว่ามีคิว', async () => {
    const r = await run({ online: true });
    if (!r.ok) return;
    expect(r.queued).toBe(false);
  });
});

describe('path ของไฟล์ — คงที่ตลอดชีพของงาน', () => {
  it('อยู่ใต้ riders/{uid}/expenses/{id}/ ตรงกับที่ callable ตรวจ', async () => {
    const r = await run();
    if (!r.ok) throw new Error('ควรผ่าน');
    const written = vi.mocked(store.put).mock.calls[0][0] as QueuedUpload;
    const path = written.files[0].storage_path;
    // prefix ต้องตรงกับที่ callable ตรวจ (evidenceBelongsTo) เป๊ะๆ
    expect(path.startsWith(`riders/riderA/expenses/${r.id}/`)).toBe(true);
    // ชื่อไฟล์เป็น uuid ของตัวเอง ไม่ใช่ชื่อไฟล์จากเครื่องลูกค้า
    expect(path.split('/').pop()).not.toBe('slip.jpg');
    expect(path.endsWith('.jpg')).toBe(true);
  });

  it('content_type ถูกประกาศไว้ ไม่ปล่อยว่าง', async () => {
    // ว่าง = Firebase เดาเป็น octet-stream = rules ปฏิเสธ (isImage())
    await run();
    const written = vi.mocked(store.put).mock.calls[0][0] as QueuedUpload;
    expect(written.files[0].content_type).toBe('image/jpeg');
  });

  it('สองงานได้ id ต่างกัน — ไม่งั้นเขียนทับกันเอง', async () => {
    const a = await run();
    const b = await run();
    if (!a.ok || !b.ok) throw new Error('ควรผ่าน');
    expect(a.id).not.toBe(b.id);
  });
});

describe('สถานะตอนเข้าคิว', () => {
  it('เริ่มที่ pending พร้อมส่งทันที ไม่มี backoff ค้าง', async () => {
    await run();
    const w = vi.mocked(store.put).mock.calls[0][0] as QueuedUpload;
    expect(w.state).toBe('pending');
    expect(w.attempts).toBe(0);
    expect(w.next_attempt_at).toBeLessThanOrEqual(Date.now());
  });

  it('บันทึก uid ตอน enqueue — สลับบัญชีแล้วงานเก่าต้องยังรู้เจ้าของ', async () => {
    await run({ uid: 'riderZ' });
    expect((vi.mocked(store.put).mock.calls[0][0] as QueuedUpload).uid).toBe('riderZ');
  });
});

describe('ปฏิเสธก่อนเขียน', () => {
  it('ไม่มีรูป = ปฏิเสธ (ไม่มีรูป = ส่งไม่ได้ คือเหตุผลทั้งหมดของฟีเจอร์)', async () => {
    const r = await run({ files: [] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('invalid_file');
    expect(store.put).not.toHaveBeenCalled();
  });

  it('ไฟล์ไม่ผ่าน validateImageFile = ปฏิเสธด้วยข้อความของตัวตรวจเอง', async () => {
    vi.mocked(validateImageFile).mockReturnValue('ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 20MB)');
    const r = await run();
    if (r.ok) throw new Error('ควรถูกปฏิเสธ');
    expect(r.message).toContain('20MB');
    expect(store.put).not.toHaveBeenCalled();
  });

  it('คิวเต็ม = ปฏิเสธ ไม่ evict ของเก่า', async () => {
    const full = Array.from({ length: MAX_QUEUED_ITEMS }, (_, i) => ({
      id: `q${i}`, uid: 'riderA', created_at: 1, kind: 'expense_evidence' as const,
      files: [{ blob: new Blob([new Uint8Array(10)]), content_type: 'image/jpeg', storage_path: 'p' }],
      payload: PAYLOAD, state: 'pending' as const, attempts: 0, next_attempt_at: 1,
    }));
    vi.mocked(store.listAll).mockResolvedValue(full);
    const r = await run();
    if (r.ok) throw new Error('ควรถูกปฏิเสธ');
    expect(r.reason).toBe('capacity');
    expect(store.put).not.toHaveBeenCalled();
  });
});

describe('เขียนลงเครื่องไม่ได้ — ห้ามบอกว่าอยู่ในคิวแล้ว', () => {
  it('put ล้ม = ปฏิเสธ ไม่ใช่รายงานว่าสำเร็จ', async () => {
    // การสัญญาสิ่งที่ไม่มีอยู่แย่กว่าการบอกตรงๆ ว่าส่งไม่ได้ —
    // ไรเดอร์ที่เชื่อว่ารายการอยู่ในคิวจะไม่ถ่ายใหม่ แล้วเงินหายจริง
    vi.mocked(store.put).mockResolvedValue(false);
    const r = await run({ online: false });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('storage_unavailable');
  });
});
