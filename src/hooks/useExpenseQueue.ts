// สถานะคิว + ตัวกระตุ้นการส่ง — ที่เดียวที่ UI คุยกับคิว
//
// **ตัวกระตุ้น 5 ตัว ทุกตัวเป็น foreground** เพราะ iOS ไม่มี Background Sync
// และไม่มีกำหนดจะทำ (ดูข้อ 8 ของแผนคิว):
//
//   1. ทันทีหลัง enqueue ถ้าออนไลน์            (อยู่ที่ caller ของ enqueue)
//   2. event `online`
//   3. `visibilitychange` → visible            — ขับออกจากลานจอด จอดับ เปิดใหม่
//   4. ตอนบูต **หลัง uid มาแล้ว** ไม่ใช่ตอน mount — token ยังไม่พร้อม = ล้มฟรี
//   5. timer 30 วิ ขณะออนไลน์ เฉพาะเมื่อมีงานถึงเวลานัดแล้ว
//
// `navigator.onLine` เป็นตัวเร่ง **ไม่ใช่ตัวตัดสิน** (captive portal รายงาน
// true ได้) — ตัวตัดสินคือผลจริงของ uploadBytes ใน runner

import { useCallback, useEffect, useState } from 'react';
import type { QueuedUpload } from '../utils/uploadQueue/types';
import * as store from '../utils/uploadQueue/store';
import { flush } from '../utils/uploadQueue/runner';
import { isLive, isReady, ownedBy, staleItems } from '../utils/uploadQueue/policy';

const POLL_MS = 30_000;

export interface ExpenseQueueView {
  items: QueuedUpload[];
  /** ของที่ยังต้องส่ง — ใช้ทำ badge */
  liveCount: number;
  /** ของที่ค้างเกิน 3 วัน — ใช้ขึ้นแถบเตือนถาวร */
  staleCount: number;
  /** ต้องมีคนทำอะไรสักอย่าง (ถ่ายใหม่ / ติดต่อแอดมิน) */
  needsAttention: QueuedUpload[];
  refresh: () => Promise<void>;
  flushNow: () => Promise<void>;
}

interface Snapshot {
  items: QueuedUpload[];
  liveCount: number;
  staleCount: number;
  needsAttention: QueuedUpload[];
}

const EMPTY: Snapshot = { items: [], liveCount: 0, staleCount: 0, needsAttention: [] };

/** สรุปคิว ณ เวลาที่อ่าน — คำนวณตอน refresh ไม่ใช่ตอน render
 *
 *  `Date.now()` ตอน render ทำให้ผลลัพธ์ของ render ขึ้นกับนาฬิกา ซึ่งอ่านค่า
 *  ต่างกันทุกครั้งที่ React render ใหม่โดยที่ข้อมูลไม่ได้เปลี่ยน */
const summarize = (items: QueuedUpload[], now: number): Snapshot => ({
  items,
  liveCount: items.filter(isLive).length,
  staleCount: staleItems(items, now).length,
  needsAttention: items.filter(
    (i) => i.state === 'failed_permanent' || i.state === 'evidence_lost'
  ),
});

export function useExpenseQueue(uid: string | null): ExpenseQueueView {
  const [snap, setSnap] = useState<Snapshot>(EMPTY);

  const refresh = useCallback(async () => {
    const all = await store.listAll();
    // งานของคนอื่นไม่โชว์ **แต่ไม่ลบ** — เป็นเงินของเจ้าของเดิม
    const mine = uid ? all.filter((i) => ownedBy(i, uid)) : [];
    setSnap(summarize(mine, Date.now()));
  }, [uid]);

  const flushNow = useCallback(async () => {
    await flush();
    await refresh();
  }, [refresh]);

  // ตัวกระตุ้น 4: บูต — ผูกกับ uid ไม่ใช่กับ mount
  //
  // ใช้ `setTimeout(0)` แทนการเรียกตรง เพื่อให้การ setState ที่ตามมาไม่อยู่ใน
  // เส้น synchronous ของ effect (React 19 เตือนเรื่อง cascading render) และ
  // `cancelled` กัน setState หลัง unmount ตอนไรเดอร์สลับแท็บเร็วๆ
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const t = setTimeout(() => {
      if (!cancelled) void flushNow();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [uid, flushNow]);

  // ตัวกระตุ้น 2 + 3
  useEffect(() => {
    if (!uid) return;
    const onOnline = () => void flushNow();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void flushNow();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [uid, flushNow]);

  // ตัวกระตุ้น 5: timer — ยิงเฉพาะเมื่อมีงานถึงเวลานัดแล้วจริง
  // (ยิงทุก 30 วิโดยไม่ดูว่ามีงานไหม = เปลืองเปล่าและกินแบตของเครื่องที่
  //  ต้องอยู่กับไรเดอร์ทั้งวัน)
  useEffect(() => {
    if (!uid) return;
    const t = setInterval(() => {
      if (!navigator.onLine) return;
      const now = Date.now();
      if (snap.items.some((i) => isReady(i, now))) void flushNow();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [uid, snap.items, flushNow]);

  return { ...snap, refresh, flushNow };
}
