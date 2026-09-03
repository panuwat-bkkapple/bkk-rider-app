// scripts/check-rider-standing.ts
//
// ตรวจก่อน merge PR 2: ไรเดอร์ที่ทำงานอยู่จริงบน production ทุกคนต้อง resolve
// เป็น ACTIVE ภายใต้ riderStanding.ts — ถ้ามีคนไหนไม่ผ่าน คนนั้นจะล็อกอินไม่ได้
// ทันทีที่ deploy
//
// **อ่านอย่างเดียว ไม่เขียนอะไรเลย**
//
// ใช้กฎตัวจริงจาก src/utils/riderStanding.ts (import ตรง ไม่ใช่ก๊อปมา) —
// สคริปต์ตรวจที่ถือสำเนาของกฎคือสคริปต์ที่วันหนึ่งจะตรวจกฎคนละตัวกับที่ ship
//
// วิธีรัน:
//   npm --prefix functions ci                       # firebase-admin
//   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
//   node --experimental-strip-types scripts/check-rider-standing.ts
//
// service account ใช้ตัวเดียวกับ GitHub Secret
// FIREBASE_SERVICE_ACCOUNT_BKK_APPLE_TRADEIN (Admin SDK ข้าม rules ได้ จึงอ่าน
// /riders ได้โดยไม่ต้องมีบัญชีแอดมินจริง)
//
// กฎค่า RTDB: **ไม่ดึง /riders ทั้งก้อน** — shallow อ่านแค่รายชื่อ id แล้วอ่าน
// ทีละ 2 ฟิลด์ที่ต้องใช้ ไม่ลากรูปเอกสาร/พิกัด/ประวัติมาทั้งหมด

import { createRequire } from 'node:module';
import { riderStanding, effectiveApprovalStatus, STANDING } from '../src/utils/riderStanding.ts';

const require = createRequire(import.meta.url);

// firebase-admin อยู่ใน functions/ ของ repo นี้ (ไม่ใช่ dependency ของตัวแอป)
const admin = require('../functions/node_modules/firebase-admin');

const DATABASE_URL =
  process.env.RIDER_DB_URL ||
  'https://bkk-apple-tradein-default-rtdb.asia-southeast1.firebasedatabase.app';

// "ทำงานอยู่จริง" = มีสัญญาณจากเครื่องภายใน N วัน (riders/{id}/last_updated
// ถูกเขียนโดย useRiderData ทุก ~10 วินาทีขณะเปิดรับงาน)
const ACTIVE_WINDOW_DAYS = Number(process.env.ACTIVE_WINDOW_DAYS || 30);

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) || 0) + 1);
}

function pad(s: string, n: number) {
  return s + ' '.repeat(Math.max(0, n - s.length));
}

async function main() {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: DATABASE_URL,
  });
  const db = admin.database();

  // shallow = คืนแค่ { id: true, ... } ไม่ลากเนื้อข้างในมา
  const idsSnap = await db.ref('riders').once('value', undefined, { shallow: true } as never)
    .catch(() => null);

  let ids: string[];
  if (idsSnap && idsSnap.exists()) {
    ids = Object.keys(idsSnap.val() || {});
  } else {
    // Admin SDK บางเวอร์ชันไม่รองรับ shallow ผ่าน once() — ตกมาที่ REST
    const token = await admin.credential.applicationDefault().getAccessToken();
    const res = await fetch(
      `${DATABASE_URL}/riders.json?shallow=true&access_token=${token.access_token}`
    );
    if (!res.ok) throw new Error(`shallow read failed: HTTP ${res.status}`);
    ids = Object.keys((await res.json()) || {});
  }

  console.log(`พบไรเดอร์ ${ids.length} คน — กำลังอ่าน approval_status / status / last_updated ทีละคน\n`);

  const rows: Array<{
    id: string;
    approval_status: string | null;
    status: string | null;
    lastUpdated: number | null;
  }> = [];

  for (const id of ids) {
    const [a, s, u] = await Promise.all([
      db.ref(`riders/${id}/approval_status`).once('value'),
      db.ref(`riders/${id}/status`).once('value'),
      db.ref(`riders/${id}/last_updated`).once('value'),
    ]);
    rows.push({
      id,
      approval_status: a.exists() ? String(a.val()) : null,
      status: s.exists() ? String(s.val()) : null,
      lastUpdated: u.exists() ? Number(u.val()) : null,
    });
  }

  // ---- ค่าที่พบจริง ----
  const byApproval = new Map<string, number>();
  const byStatus = new Map<string, number>();
  const byPair = new Map<string, number>();
  for (const r of rows) {
    bump(byApproval, r.approval_status ?? '(ไม่มีฟิลด์)');
    bump(byStatus, r.status ?? '(ไม่มีฟิลด์)');
    bump(byPair, `${r.approval_status ?? '(ไม่มี)'} | ${r.status ?? '(ไม่มี)'}`);
  }

  const table = (title: string, m: Map<string, number>) => {
    console.log(title);
    [...m.entries()]
      .sort((x, y) => y[1] - x[1])
      .forEach(([k, v]) => console.log(`  ${pad(k, 44)} ${String(v).padStart(4)}`));
    console.log('');
  };

  table('approval_status — ค่าที่พบและจำนวน', byApproval);
  table('status — ค่าที่พบและจำนวน', byStatus);
  table('คู่ (approval_status | status) — จำนวน', byPair);

  // ---- การเปรียบเทียบที่เป็นคำตอบจริงของ gate นี้ ----
  //
  // ความเสี่ยงของ PR 2 ไม่ใช่ "ใครไม่ ACTIVE" เฉยๆ แต่คือ **ใครที่เคยล็อกอินได้
  // แล้วจะล็อกอินไม่ได้** — ด่านเดิมบล็อกเฉพาะ status === 'Pending'
  const cutoff = Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const recentlyActive = (r: (typeof rows)[number]) =>
    r.lastUpdated !== null && r.lastUpdated >= cutoff;

  const oldBlocked = (r: (typeof rows)[number]) => r.status === 'Pending';
  const newBlocked = (r: (typeof rows)[number]) => riderStanding(r) !== STANDING.ACTIVE;

  const regressions = rows.filter((r) => newBlocked(r) && !oldBlocked(r));
  const newlyAllowed = rows.filter((r) => !newBlocked(r) && oldBlocked(r));
  const workingButBlocked = rows.filter((r) => recentlyActive(r) && newBlocked(r));

  console.log(`ไรเดอร์ที่มีสัญญาณภายใน ${ACTIVE_WINDOW_DAYS} วัน: ${rows.filter(recentlyActive).length} คน\n`);

  const report = (title: string, list: typeof rows) => {
    console.log(`${title}: ${list.length} คน`);
    for (const r of list) {
      console.log(
        `  ${r.id}  approval_status=${r.approval_status ?? '(ไม่มี)'}  ` +
          `status=${r.status ?? '(ไม่มี)'}  → ${riderStanding(r)} ` +
          `(effective=${effectiveApprovalStatus(r)})` +
          (recentlyActive(r) ? '  **มีสัญญาณล่าสุด**' : '')
      );
    }
    console.log('');
  };

  report('เคยล็อกอินได้ แต่ด่านใหม่จะบล็อก (REGRESSION)', regressions);
  report('ด่านเดิมบล็อก แต่ด่านใหม่ปล่อยผ่าน', newlyAllowed);
  report('ทำงานอยู่จริงแต่ด่านใหม่จะบล็อก', workingButBlocked);

  const fatal = workingButBlocked.length > 0 || regressions.length > 0;
  console.log(fatal ? 'ผล: ไม่ผ่าน — ห้าม merge จนกว่าจะแก้' : 'ผล: ผ่าน — ทุกคนที่ทำงานอยู่ resolve เป็น ACTIVE');
  await admin.app().delete();
  process.exit(fatal ? 1 : 0);
}

main().catch((err) => {
  console.error('ตรวจไม่สำเร็จ:', err?.message || err);
  process.exit(2);
});
