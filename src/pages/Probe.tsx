// หน้าเครื่องมือวัด P0 ของแผนคิวออฟไลน์ — ไม่ใช่ฟีเจอร์ของไรเดอร์
//
// แผน (docs/reports/2026-09-01-rider-upload-offline-queue-plan.md ข้อ 9) ระบุ 5 ข้อ
// ที่ต้อง**พิสูจน์บนเครื่องจริง** ก่อนเริ่มเขียนคิว เพราะทั้งหมดเป็นพฤติกรรมของ
// เบราว์เซอร์ที่อ่านจากเอกสารแล้วเชื่อไม่ได้ (iOS PWA ต่างจาก iOS แท็บ ต่างจาก Android)
//
//   (ก) Blob ลง IndexedDB บน iOS PWA แล้วอ่านกลับได้
//   (ข) RTDB set() ตอนออฟไลน์ + รีเฟรช → งานที่ค้างหายไหม
//   (ค) push().key ทำงานตอนออฟไลน์
//   (ง) เขียนทับ path เดิมใต้ riders/{uid}/** ได้
//   (จ) isStandalone() ตอบถูกทั้ง 4 สภาพ
//
// ข้อ (จ) มี unit test คุมแล้ว (src/utils/displayMode.test.ts) หน้านี้แสดงค่าดิบ
// เพื่อยืนยันบนเครื่องจริงว่าสัญญาณที่เทสสมมติไว้ตรงกับของจริง
//
// **ข้อ (ข) คือข้อที่สำคัญที่สุด** — ถ้าคำตอบคือ "ไม่หาย" แปลว่า SDK เก็บงานค้าง
// ข้ามการรีเฟรชให้เอง และคิวของเราเบาลงมาก ถ้า "หาย" คือเหตุผลทั้งหมดของการมีคิว
// จึงต้องได้คำตอบจากเครื่องจริงก่อน ไม่ใช่เดา
//
// ทุกอย่างที่หน้านี้เขียนอยู่ใต้ riders/{uid}/_probe ซึ่งเป็นคีย์ทิ้ง ไม่มีใครอ่าน
// และมีปุ่มลบให้เก็บกวาดเมื่อวัดเสร็จ

import { useCallback, useState, useSyncExternalStore } from 'react';
import { ref, set, get, push, goOffline, goOnline, serverTimestamp } from 'firebase/database';
import { db, auth } from '../api/firebase';
import { currentDisplayMode, detectDisplayMode } from '../utils/displayMode';

type Verdict = 'pass' | 'fail' | 'pending' | 'running';

interface Result {
  verdict: Verdict;
  detail: string;
}

const IDB_NAME = 'bkk_probe';
const IDB_STORE = 'blobs';
const PENDING_KEY = 'bkk_probe_offline_write';

// ---------------------------------------------------------------- IndexedDB

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('open failed'));
  });
}

function idbPut(dbi: IDBDatabase, key: string, value: Blob): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = dbi.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('put failed'));
  });
}

function idbGet(dbi: IDBDatabase, key: string): Promise<Blob | undefined> {
  return new Promise((resolve, reject) => {
    const tx = dbi.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error ?? new Error('get failed'));
  });
}

// ------------------------------------------------------------------- page

const btn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db',
  background: '#fff', fontSize: 14, cursor: 'pointer',
};

/** สมัครฟัง online/offline ให้ useSyncExternalStore (ไม่ setState ใน effect) */
const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

const Row = ({ result, title, note, actions }: {
  result: Result | undefined;
  title: string;
  note: string;
  actions: React.ReactNode;
}) => {
  const color = result?.verdict === 'pass' ? '#047857'
    : result?.verdict === 'fail' ? '#b91c1c' : '#374151';
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10, lineHeight: 1.5 }}>{note}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>{actions}</div>
      <div style={{ fontSize: 13, color, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {result ? `${result.verdict.toUpperCase()}: ${result.detail}` : 'ยังไม่ได้วัด'}
      </div>
    </div>
  );
};


export const Probe = ({ onBack }: { onBack: () => void }) => {
  const uid = auth.currentUser?.uid ?? null;
  const [results, setResults] = useState<Record<string, Result>>({});
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

  const put = (id: string, verdict: Verdict, detail: string) =>
    setResults((r) => ({ ...r, [id]: { verdict, detail } }));

  // (ก) เขียน Blob ลง IndexedDB → ปิด connection → เปิดใหม่ → อ่านกลับ เทียบไบต์
  // ปิดแล้วเปิดใหม่โดยตั้งใจ: อ่านจาก connection เดิมอาจได้ค่าจากแคชในหน่วยความจำ
  // ซึ่งไม่ได้พิสูจน์ว่ามันลงดิสก์จริง
  const runIdb = useCallback(async () => {
    put('idb', 'running', 'กำลังเขียน...');
    try {
      const bytes = new Uint8Array(64 * 1024);
      crypto.getRandomValues(bytes);
      const blob = new Blob([bytes], { type: 'image/jpeg' });

      const d1 = await openIdb();
      await idbPut(d1, 'probe', blob);
      d1.close();

      const d2 = await openIdb();
      const back = await idbGet(d2, 'probe');
      d2.close();

      if (!back) { put('idb', 'fail', 'อ่านกลับไม่เจอ (undefined)'); return; }
      const backBytes = new Uint8Array(await back.arrayBuffer());
      const same = backBytes.length === bytes.length && backBytes.every((b, i) => b === bytes[i]);
      put('idb', same ? 'pass' : 'fail',
        same
          ? `อ่านกลับได้ ${backBytes.length} ไบต์ ตรงกันทุกไบต์ (type=${back.type || 'ว่าง'})`
          : `ขนาด/เนื้อไม่ตรง: เขียน ${bytes.length} อ่านได้ ${backBytes.length}`);
    } catch (e) {
      put('idb', 'fail', `throw: ${(e as Error)?.message ?? String(e)}`);
    }
  }, []);

  // (ค) push().key ต้องได้คีย์โดยไม่ต้องคุยกับ server (client สร้างเองจาก timestamp+random)
  const runPushKey = useCallback(() => {
    put('pushkey', 'running', '...');
    try {
      const k = push(ref(db, `riders/${uid}/_probe/keys`)).key;
      put('pushkey', k ? 'pass' : 'fail', k ? `ได้คีย์: ${k}` : 'key เป็น null');
    } catch (e) {
      put('pushkey', 'fail', `throw: ${(e as Error)?.message ?? String(e)}`);
    }
  }, [uid]);

  // (ง) เขียนทับ path เดิมใต้ riders/{uid} ได้ไหม (กฎอนุญาต self-write อยู่แล้ว
  //     แต่มี .validate หลายตัวบนฟิลด์ที่แอดมินเป็นเจ้าของ — ต้องยืนยันว่าคีย์ใหม่ไม่ติด)
  const runOverwrite = useCallback(async () => {
    put('overwrite', 'running', 'กำลังเขียนรอบแรก...');
    try {
      const path = `riders/${uid}/_probe/overwrite`;
      await set(ref(db, path), { v: 1, at: Date.now() });
      await set(ref(db, path), { v: 2, at: Date.now() });
      const snap = await get(ref(db, path));
      const v = snap.val()?.v;
      put('overwrite', v === 2 ? 'pass' : 'fail', `อ่านกลับได้ v=${JSON.stringify(v)} (ต้องเป็น 2)`);
    } catch (e) {
      put('overwrite', 'fail', `throw: ${(e as Error)?.message ?? String(e)}`);
    }
  }, [uid]);

  // (ข) สองจังหวะ คนละการโหลดหน้า:
  //     จังหวะ 1 = ตัดเน็ตแล้ว set() ทิ้งไว้ (promise จะไม่ resolve จนกว่าเน็ตกลับ)
  //               แล้วจดโทเคนไว้ใน localStorage
  //     จังหวะ 2 = หลังรีเฟรช + เน็ตกลับ อ่านจาก server ว่าโทเคนนั้นไปถึงไหม
  const armOfflineWrite = useCallback(() => {
    const token = `t${Date.now()}`;
    localStorage.setItem(PENDING_KEY, token);
    // ตั้งใจไม่ await — จุดของการทดสอบคือ "งานที่ยังค้างอยู่ตอนรีเฟรช"
    void set(ref(db, `riders/${uid}/_probe/offline_write`), { token, at: serverTimestamp() });
    put('offline', 'pending',
      `ยิง set() ด้วยโทเคน ${token} แล้ว — ตอนนี้ให้ปิดแอปทิ้งแล้วรีเฟรช จากนั้นเปิดเน็ตกลับ แล้วกด "ตรวจผลหลังรีเฟรช"`);
  }, [uid]);

  const checkOfflineWrite = useCallback(async () => {
    const token = localStorage.getItem(PENDING_KEY);
    if (!token) { put('offline', 'fail', 'ไม่พบโทเคนใน localStorage — ยังไม่ได้เริ่มจังหวะ 1'); return; }
    put('offline', 'running', 'กำลังอ่านจาก server...');
    try {
      const snap = await get(ref(db, `riders/${uid}/_probe/offline_write`));
      const landed = snap.val()?.token === token;
      put('offline', landed ? 'pass' : 'fail',
        landed
          ? `โทเคน ${token} ไปถึง server แล้ว = SDK เก็บงานค้างข้ามการรีเฟรชได้`
          : `ไม่พบโทเคน ${token} บน server (เจอ ${JSON.stringify(snap.val()?.token ?? null)}) = งานค้างหายตอนรีเฟรช ซึ่งคือเหตุผลที่ต้องมีคิวของเราเอง`);
    } catch (e) {
      put('offline', 'fail', `throw: ${(e as Error)?.message ?? String(e)}`);
    }
  }, [uid]);

  const cleanup = useCallback(async () => {
    try {
      await set(ref(db, `riders/${uid}/_probe`), null);
      localStorage.removeItem(PENDING_KEY);
      indexedDB.deleteDatabase(IDB_NAME);
      put('cleanup', 'pass', 'ลบ riders/{uid}/_probe, localStorage และ IndexedDB แล้ว');
    } catch (e) {
      put('cleanup', 'fail', `throw: ${(e as Error)?.message ?? String(e)}`);
    }
  }, [uid]);

  const mode = currentDisplayMode();
  const rawStandalone = (window.navigator as unknown as { standalone?: unknown })?.standalone;
  const rawMm = typeof window.matchMedia === 'function'
    ? ['standalone', 'fullscreen', 'minimal-ui']
        .map((m) => `${m}=${window.matchMedia(`(display-mode: ${m})`).matches}`).join(' ')
    : 'ไม่มี matchMedia';

  if (!uid) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui' }}>
        <p>ต้องล็อกอินก่อนจึงจะวัดข้อ (ข)(ค)(ง) ได้ เพราะทุกข้อเขียนใต้ riders/&#123;uid&#125;</p>
        <button onClick={onBack}>กลับ</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui', maxWidth: 640, margin: '0 auto' }}>
      <button onClick={onBack} style={{ ...btn, marginBottom: 14 }}>กลับ</button>
      <h1 style={{ fontSize: 19, marginBottom: 4 }}>P0 probe — คิวอัปโหลดออฟไลน์</h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16, lineHeight: 1.6 }}>
        หน้านี้เป็นเครื่องมือวัด ไม่ใช่ฟีเจอร์ — ทุกอย่างเขียนใต้ riders/&#123;uid&#125;/_probe
        และลบได้ด้วยปุ่มล่างสุด · เน็ตตอนนี้: <b>{online ? 'ออนไลน์' : 'ออฟไลน์'}</b>
      </p>

      <Row
        result={results.mode}
        title="(จ) โหมดการแสดงผล"
        note={`ผลลัพธ์: ${mode} · navigator.standalone = ${JSON.stringify(rawStandalone)} · matchMedia: ${rawMm}`}
        actions={
          <button style={btn} onClick={() => put('mode', mode === 'unknown' ? 'fail' : 'pass',
            `${mode} (ต้องตรงกับสภาพจริงของเครื่องที่กำลังเปิดอยู่)`)}>
            บันทึกผล
          </button>
        }
      />

      <Row
        result={results.idb}
        title="(ก) Blob ลง IndexedDB แล้วอ่านกลับ"
        note="เขียน Blob 64 KB → ปิด connection → เปิดใหม่ → อ่านกลับแล้วเทียบทุกไบต์ (ปิดแล้วเปิดใหม่เพื่อไม่ให้ได้ค่าจากแคชในหน่วยความจำ)"
        actions={<button style={btn} onClick={runIdb}>วัด</button>}
      />

      <Row
        result={results.pushkey}
        title="(ค) push().key ตอนออฟไลน์"
        note="เปิดโหมดเครื่องบินก่อนแล้วค่อยกด — ถ้าได้คีย์แปลว่าไคลเอนต์สร้างเองได้ ไม่ต้องรอ server"
        actions={
          <>
            <button style={btn} onClick={runPushKey}>วัด</button>
            <button style={btn} onClick={() => { goOffline(db); put('pushkey', 'pending', 'สั่ง goOffline() แล้ว กดวัดต่อได้'); }}>
              goOffline()
            </button>
            <button style={btn} onClick={() => { goOnline(db); }}>goOnline()</button>
          </>
        }
      />

      <Row
        result={results.overwrite}
        title="(ง) เขียนทับ path เดิมใต้ riders/{uid}"
        note="เขียน v=1 แล้วทับด้วย v=2 แล้วอ่านกลับ — ต้องได้ 2 (ยืนยันว่ากฎ self-write ไม่ติด .validate ของฟิลด์ที่แอดมินเป็นเจ้าของ)"
        actions={<button style={btn} onClick={runOverwrite}>วัด</button>}
      />

      <Row
        result={results.offline}
        title="(ข) set() ตอนออฟไลน์ + รีเฟรช งานค้างหายไหม"
        note="ข้อที่สำคัญที่สุด ทำสองจังหวะ: 1) เปิดโหมดเครื่องบิน แล้วกด 'ยิง set() ทิ้งไว้' 2) ปิดแอปทิ้ง เปิดใหม่ เปิดเน็ตกลับ แล้วกด 'ตรวจผลหลังรีเฟรช'"
        actions={
          <>
            <button style={btn} onClick={armOfflineWrite}>1) ยิง set() ทิ้งไว้</button>
            <button style={btn} onClick={checkOfflineWrite}>2) ตรวจผลหลังรีเฟรช</button>
          </>
        }
      />

      <Row
        result={results.cleanup}
        title="เก็บกวาด"
        note="ลบ riders/{uid}/_probe, โทเคนใน localStorage และฐาน IndexedDB ของ probe"
        actions={<button style={btn} onClick={cleanup}>ลบทั้งหมด</button>}
      />

      <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 20, lineHeight: 1.6 }}>
        ตรวจซ้ำ: {JSON.stringify(detectDisplayMode({ navigatorStandalone: rawStandalone, matchMedia: (q) => window.matchMedia(q) }))}
      </p>
    </div>
  );
};
