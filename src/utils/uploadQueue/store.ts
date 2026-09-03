// ที่เก็บคิวบนเครื่อง — IndexedDB ดิบ ไม่เพิ่ม dependency
//
// **ทำไม IndexedDB ไม่ใช่ localStorage:** localStorage เก็บได้แต่สตริง รูปที่
// บีบแล้วยัง ~0.8 MB ต่อใบ ถ้าแปลงเป็น base64 จะโตอีก ~33% และเพดานของ
// localStorage คือ ~5 MB ต่อโดเมน = เก็บได้ราวสามใบก่อนพัง IndexedDB เก็บ
// Blob ได้ตรงๆ
//
// **ทุกฟังก์ชันในไฟล์นี้ fail-soft** — คิวที่พังต้องไม่ทำให้แอปไรเดอร์พัง
// เบราว์เซอร์ที่ปิด storage (private mode บางตัว, โควตาเต็ม) จะได้คิวว่าง
// แทนที่จะได้หน้าขาว. ตัวที่ต้องรู้ว่าเขียนไม่สำเร็จคือ `put` — มันคืน
// boolean ให้ caller ตัดสินใจ ไม่กลืนเงียบ
//
// **ข้อที่ยังไม่ได้พิสูจน์บนเครื่องจริง:** Blob รอดข้ามการปิดแอปบน iOS PWA
// ไหม — อยู่ในข้อ (ก) ของ P0 ที่หน้า /probe และ **ยังไม่มีคำตอบ** ถ้าคำตอบคือ
// ไม่รอด ดีไซน์คิวทั้งชุดต้องคิดใหม่ ไม่ใช่แค่แก้ไฟล์นี้

import type { QueuedUpload } from './types';

const DB_NAME = 'bkk_rider_upload_queue';
const DB_VERSION = 1;
const STORE = 'items';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      // เบราว์เซอร์ที่ปิด storage โยนตั้งแต่ open()
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB.open failed'));
    // iOS Safari แขวน open() เงียบได้เมื่อมี database เดิมอยู่ (บทเรียนเดียวกับ
    // ที่ bkk-frontend-next เจอกับ Firebase Auth) — เพดานเวลาจึงเป็นของฟีเจอร์
    // ไม่ใช่ของแถม ไม่มีเพดาน = ทุก flow ที่รอคิวค้างถาวร
    setTimeout(() => reject(new Error('indexedDB.open timed out')), 10_000);
  });
  // การ reject ต้องล้าง cache ไม่งั้น promise ที่พังถูกเสิร์ฟตลอดชีพหน้า
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('idb request failed'));
        t.onabort = () => reject(t.error ?? new Error('idb transaction aborted'));
      })
  );
}

/** อ่านทั้งคิว — คิวที่อ่านไม่ได้คืนอาเรย์ว่าง ไม่ throw ขึ้นไปถึง UI */
export async function listAll(): Promise<QueuedUpload[]> {
  try {
    const rows = await tx<QueuedUpload[]>('readonly', (s) => s.getAll() as IDBRequest<QueuedUpload[]>);
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.error('[uploadQueue] listAll failed:', e);
    return [];
  }
}

/**
 * เขียน/ทับหนึ่งงาน — คืน `false` เมื่อเขียนไม่สำเร็จ
 *
 * caller **ต้องเช็คค่าที่คืน** ตอน enqueue: ถ้าเขียนไม่ลง แล้วเราบอกไรเดอร์ว่า
 * "อยู่ในคิวแล้ว" นั่นคือการสัญญาสิ่งที่ไม่มีอยู่ ซึ่งแย่กว่าการบอกว่าส่งไม่ได้
 */
export async function put(item: QueuedUpload): Promise<boolean> {
  try {
    await tx('readwrite', (s) => s.put(item) as IDBRequest<IDBValidKey>);
    return true;
  } catch (e) {
    console.error('[uploadQueue] put failed:', e);
    return false;
  }
}

/** ลบหนึ่งงาน — **มีทางเดียวที่เรียกได้คือไรเดอร์กดยืนยันลบเอง**
 *  ห้ามเรียกจากตอน logout / คิวเต็ม / ค้างนาน (invariant ข้อ 5 ของแผน) */
export async function remove(id: string): Promise<boolean> {
  try {
    await tx('readwrite', (s) => s.delete(id) as IDBRequest<undefined>);
    return true;
  } catch (e) {
    console.error('[uploadQueue] remove failed:', e);
    return false;
  }
}

export async function get(id: string): Promise<QueuedUpload | null> {
  try {
    const row = await tx<QueuedUpload | undefined>('readonly', (s) => s.get(id) as IDBRequest<QueuedUpload | undefined>);
    return row ?? null;
  } catch (e) {
    console.error('[uploadQueue] get failed:', e);
    return null;
  }
}

/** ใช้ในเทสเท่านั้น — production ไม่มีเส้นทางล้างคิวทั้งก้อน */
export async function __clearForTests(): Promise<void> {
  try {
    await tx('readwrite', (s) => s.clear() as IDBRequest<undefined>);
  } catch {
    // ignore
  }
}
