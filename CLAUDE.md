# BKK Rider — แอปไรเดอร์ (PWA)

รีโปนี้ไม่เคยมีไฟล์นี้จนถึง 4 ก.ย. 2569 — บทเรียนของสองวันที่ผ่านมา (auth #141–#146, push #148–#155) ถูกจดไว้ในคอมเมนต์ของโค้ด PR body และรายงานใต้ `docs/reports/` ไฟล์นี้คือแผนที่ไปหาของพวกนั้น ไม่ก๊อปเนื้อมาซ้ำ

## กฎที่ยกมาจากรีโปพี่น้อง (อ่านที่นั่น ไม่ก๊อปมาไว้ที่นี่)
- **`bkk-frontend-next/CLAUDE.md`** — กฎ async-stop · ตัด branch ต้อง `git fetch origin` ก่อน · ตรวจ NUL byte · **Injection test (ทำลายกฎทีละข้อแล้ววัดว่าเทสแดงกี่ตัว — commit checkpoint ก่อนเสมอ และเขียนตัวเลขหลังวัด ไม่ใช่ก่อน)** · CI เขียวไม่ได้แปลว่า deploy ขึ้น
- **`bkk-system/CLAUDE.md`** — Data Contracts (ชุดฟิลด์ที่ต้องไปด้วยกัน) · ชื่อ Cloud Function ต้อง unique ระดับ project (`{region}/{name}` — codebase ไม่ namespace ชื่อ เคยทับกันจริง) · คิว deploy ที่รวบ run ของคนอื่น
- **`database.rules.json` / `storage.rules` อยู่ที่ `bkk-frontend-next` เท่านั้น** ห้าม recreate ที่นี่ แก้ rules = PR ที่นั่นแล้วรอ `deploy-rules.yml`

## Auth — สองสถานะ "ล็อกอินอยู่" ที่คนละแกน (#141, #144, #146)
- **localStorage (`rider_id` + `device_pin`) = การลงทะเบียนเครื่อง · Firebase session = การล็อกอิน** — สองอย่างนี้ห้ามผูกกัน: session หลุด (token ถูกเพิกถอน/หมดอายุ) ต้องพาไปจอ "เซสชันหมดอายุ" ที่**ยังจำเครื่องได้** ไม่ใช่ล้าง `device_pin` ทิ้ง (ของเดิมล้าง = ไรเดอร์ต้องกรอกอีเมล+รหัสผ่าน+ตั้ง PIN ใหม่ทุกครั้ง) ดู `App.tsx` `authed = !!riderId && !sessionExpired`
- **`initializeAuth` ด้วย `browserLocalPersistence` เท่านั้น** (`src/api/firebase.ts`) — ห้ามใส่ `indexedDBLocalPersistence` กลับเข้ามาไม่ว่าลำดับไหน iOS Safari เปิด IDB แขวนเงียบได้ แล้ว `onAuthStateChanged` ไม่ emit เลย
- **กลอน PIN (`usePinLock`) = ล็อก ไม่ใช่ออกจากระบบ** — ไม่มี `signOut` ในฟีเจอร์นี้ 30 นาทีหลังพับแอป (`pinLock.ts`) เพราะงานนานๆ ที ไรเดอร์นั่งรอเป็นชั่วโมงเป็นเรื่องปกติ `useAutoLogout` ตัวเก่าถูกลบทิ้งแล้ว ห้ามเอากลับ
- **`PERMISSION_DENIED` ต้องไม่กลายเป็นจอ "ไม่มีงาน"** — `sessionState.ts` เป็น bus ตัวเดียวที่ listener ชั้นล่างบอกชั้นบน (dedupe เป็นของจำเป็น: token ตายทีเดียว listener ทุกตัว error พร้อมกัน) `useRiderJobs` คือตัวที่ผลิตอาการ "ไม่มีงาน" จริง ไม่ใช่ `useDatabase`
- **ด่านล็อกอินอ่าน `approval_status` ผ่าน `riderStanding.ts` เท่านั้น** (#145) — `status` แบกสองความหมาย (อนุมัติ + presence) และแอปนี้เองเขียน presence ทับทุก 10 วิ. fallback ไป `status` ยังจำเป็นสำหรับแถวเก่า ผู้สมัครใหม่เขียนทั้งสองฟิลด์ตั้งแต่ #156. **MIRROR:** `src/utils/riderStanding.ts` ↔ `functions/src/riderStanding.ts` ↔ `bkk-system/functions/actor.js` — ด่าน `riderStandingParity.test.ts` รันสองสำเนาแรกบน fixture เดียวกัน
- **ข้อความ error ของ Firebase ห้ามโชว์ดิบ** (`authErrors.ts`) — `invalid-credential`/`wrong-password`/`user-not-found` ใช้ข้อความเดียวกัน (กัน enumerate บัญชี) · `user-disabled` = "ถูกระงับ ติดต่อออฟฟิศ" · network แยกต่างหาก (ไรเดอร์อยู่บนถนน)
- **ช่องทางที่ล้างการลงทะเบียนเครื่องได้มีสองทางเท่านั้น:** ไรเดอร์กดออกเอง · server บอกว่าถูกระงับ (`approval_status: Suspended`)

## Push — ผู้ส่งสองราย ผู้แสดงสองทาง (รายงานเต็ม: `docs/reports/2026-09-03-rider-push-delivery-survey.md`)
- **ผู้ส่ง:** `functions/src/index.ts` `sendToRider` (งานใหม่ · broadcast · แชท) และ `bkk-system/functions/index.js` `pushToRider` (เลื่อนนัด ถอนงาน ฯลฯ) — **ทั้งคู่ต้อง data-only** (`data.title`/`data.body`) ห้ามมี `notification` เพราะ SDK ฝั่ง SW จะแสดงเองแล้ว**ยังเรียก** `onBackgroundMessage` ต่อ = สองใบ ใบที่สองเนื้อว่าง
- **แอปเปิดค้าง = SW ไม่แสดงอะไรเลย** (SDK ส่งเข้าหน้าเว็บแล้ว return) `onMessage` ใน `usePushNotifications` จึงต้องแสดงเอง — `foregroundAlert()` (`pushDisplay.ts`) อ่าน `data` ก่อน `notification` แล้วแสดงสองทาง: toast ในแอปเสมอ + `registration.showNotification()` **ห้ามใช้ `new Notification()`** (iOS ไม่รองรับ — ของเดิมพังตรงนี้แบบไม่มีใครเห็น)
- **Service Worker register ตั้งแต่เปิดแอป ไม่ขึ้นกับ permission และการล็อกอิน** · **ห้ามเรียก `Notification.requestPermission()` อัตโนมัติ** — iOS ปฏิเสธคำขอที่ไม่ได้มาจากการแตะเงียบๆ ขอผ่านปุ่มบนการ์ด (`PushStatusCard`) เท่านั้น · `serviceWorker.ready` มีเพดาน 10 วิ (แขวนได้ไม่จำกัดเหมือน IDB)
- **สถานะ push อยู่ที่ `pushHealth.ts` store ตัวเดียว** ข้อความที่ไรเดอร์เห็นตัดสินใน `describePushHealth` (pure) ที่เดียว เกณฑ์ stale 7 วัน **ต้องเท่ากับ** `bkk-system/src/utils/riderPushHealth.ts` และ `functions/rider-push-coverage.js` ฝั่งนั้น (แอดมินเห็นป้ายเดียวกันที่ `/riders` + probe `rider_push_tokens`)
- **"ปิดรับ" มีผลจริงแล้ว (4 ก.ย. 2569)** — กดปิดรับ = แอปเขียน `riders/{id}/status: 'Offline'` (`useRiderData` + `utils/presence.ts` ซึ่งถือกติกา "เขียนเฉพาะตอนเปิด→ปิด ไม่ใช่ตอน mount") · broadcast ข้ามคนที่ Offline (`functions/riderStanding.ts`) · DispatcherPage ของแอดมินกรองออกจากรายชื่อจ่ายงาน · สวิตช์บนจอเริ่มตามฐานข้อมูลตอนเปิดแอป (เดิมเริ่มปิดเสมอขณะที่ฐานข้อมูลบอกว่าเปิด). **ห้ามกรอง broadcast ด้วย Online/Busy** — ค่าเหล่านั้นค้างได้เมื่อปิดแอปโดยไม่กดปิดรับ และคนที่ยังไม่เคยกดรับงานถือค่าอนุมัติอยู่ในฟิลด์นี้ · **ไม่ใช้ `onDisconnect`** — iOS ตัดการเชื่อมต่อทุกครั้งที่พับ PWA ไรเดอร์ที่ขี่อยู่โดยล็อกหน้าจอจะหายจากรายชื่อทั้งที่เปิดรับอยู่
- **สวิตช์ `settings/notifications` ของแอดมินครอบ `sendToRider` แล้ว** (#155, `notificationGate.ts`) fail-open — หมวดของ type ฝั่งนี้ (`chat`/`job_status`/`broadcast_job`) เป็น MIRROR ของ `EVENT_CATEGORY` ใน `bkk-system/functions/notification-settings.js` ซึ่งเป็นต้นทาง เทส parity อ่านไฟล์นั้น (CI sparse-checkout มาให้)
- **ไม่ต้อง patch `atob` แบบแอปแอดมิน** — SDK เวอร์ชันที่ติดตั้งเติม padding base64url ให้เองแล้ว (ตรวจจากซอร์สใน node_modules) ลอกมาคือของที่ไม่มีวันถูกเรียก

## ค่ารอบที่ตรึงตอนกดรับ ≠ รายได้ (5 ก.ย. 2569)
- **bkk-system ตรึง `rider_fee` ลงงานตั้งแต่วินาทีที่กดรับ** (`onRiderAssignedRecalcEstimate` → `rider_fee_meta.frozen_source='accepted'`) โดย**ไม่**ตั้ง `rider_fee_status` — มันคือคำสัญญาว่าจะได้เท่านี้ถ้าทำงานจบ ไม่ใช่เงินที่ได้แล้ว. ลูกค้ายกเลิกจากเว็บ (`/api/cancel-order`) ไม่ล้าง `rider_id`/`rider_fee` ยอดจึงค้างบนงานที่ยกเลิก แล้วหน้าประวัติเคยอ่านเป็น "+฿324" ทั้งบนการ์ดและยอดรวม (ไรเดอร์กดรับ ยังไม่ออกเดินทาง)
- **ทุกที่ที่โชว์เงินของงานอ่านผ่าน `getRiderPayout` / `earnedRiderFee` (`src/utils/jobHelpers.ts`) เท่านั้น** — งานที่ยกเลิกจะมีค่ารอบก็ต่อเมื่อยอด**เข้าคิวจ่ายแล้ว** (`rider_fee_status` Pending/Paid = ค่าเสียเวลาที่ `reviewAmendment` ฝั่ง bkk-system เขียนคู่กัน) และ**ไม่ตกไปหาประมาณการ**. ฝั่งแอดมินปลอดภัยอยู่แล้ว (`RiderSettlements` กรอง `rider_fee_status === 'Pending'`) นี่เป็นบั๊กการแสดงผลของแอปนี้ล้วนๆ
- **`rider_fee_status` อ่านผ่าน `riderFeePaid` / `riderFeeQueued` ที่เดียว** — คำว่า `'Paid'` พ้องกับสถานะงาน `statusLiteralCensus.test.ts` แยกไม่ออก การเทียบ literal ตามจุดใช้จะดันเพดานสำมะโนขึ้น
- ด่าน: `src/utils/jobHelpers.test.ts` (ตาราง injection ในหัวไฟล์ — ข้อที่เขียวมีเหตุผลกำกับ ไม่ได้แต่ง fixture)

## งานหายจากจอไรเดอร์ตอนแอดมินส่ง QC — ลิสต์สถานะที่พิมพ์มือ (5 ก.ย. 2569)
- **อาการ:** แอดมินกด "ผ่าน QC → ส่ง QC Lab" (หรือ Ready To Sell / Reserved / Sold) แล้วงานหายจากแท็บประวัติของไรเดอร์ทันที ไม่มี error — `useRiderData` เคยกรองประวัติด้วยเซ็ตสถานะที่พิมพ์มือ (Pending QC / In Stock / Paid / Completed / Return Confirmed / Closed (Lost)) ซึ่งไม่มีสถานะที่คลังเดินต่อ และ `ChatModal` มีเซ็ตของตัวเองอีกชุดที่ขาดตัวเดียวกัน (กฎมีสองคนอ่าน ติดตั้งไว้คนละที่)
- **วันนี้:** `src/utils/riderJobLists.ts` (pure) เป็นเจ้าของ active/history ที่เดียว ตัดสินด้วย **phase** ของสถานะ (`INVENTORY`/`TERMINAL`/`PENDING_CLOSE`/`EXCEPTION` = ส่วนของไรเดอร์จบ → history **โดยไม่ต้องมี `completed_at`** เพราะแอดมินรับเครื่องเข้าคลังผ่าน engine ได้โดยไม่ประทับ) — เพิ่มสถานะใหม่ใน `job-statuses.ts` แล้วจัด phase = ครอบเอง ไม่ต้องแก้ที่นี่. ผู้อ่านสองคน (`useRiderData` · `ChatModal`) ห้ามพิมพ์เซ็ตเอง มีเทสสแกน source กันไว้
- ด่าน: `src/utils/riderJobLists.test.ts` (injection 5 ตัว แดงทุกตัว ตารางในหัวไฟล์)

## MIRROR ข้ามรีโป — รายการที่มีด่าน
| ของ | สำเนาที่นี่ | ต้นทาง/สำเนาอื่น | ด่าน |
|---|---|---|---|
| หมวดกระเป๋าไรเดอร์ | `src/utils/walletLedger.ts` · `functions/src/index.ts` | `bkk-system/src/utils/transactionLogger.ts` | `walletCategoryParity.test.ts` (เทียบตัวอักษร) |
| สถานะอนุมัติ | `src/utils/riderStanding.ts` · `functions/src/riderStanding.ts` | `bkk-system/functions/actor.js` | `riderStandingParity.test.ts` (รันจริง) |
| หมวดของ push type | `functions/src/notificationGate.ts` | `bkk-system/functions/notification-settings.js` | `riderNotificationGate.test.ts` (อ่านไฟล์ต้นทาง) |
| สูตร WHT | `src/utils/riderWht.ts` | `bkk-system/functions/rider-wht.js` + `src/utils/riderWht.ts` | — |
| job statuses | `src/types/job-statuses.ts` | อีก 2 รีโป | — |

**เพิ่มเทสที่อ่านไฟล์ของ bkk-system = ต้องเพิ่ม path นั้นใน sparse-checkout ของ `.github/workflows/ci.yml`** — ด่านในขั้น "ตรวจว่า sparse-checkout ครอบไฟล์ที่เทสอ้างครบ" จะแดงพร้อมบอกชื่อไฟล์ (#143 — ก่อนหน้านั้นเทสข้ามเงียบๆ ทุกรอบ)

## CI / deploy
- `ci.yml` รันบน `pull_request` **ทุก base** + `types` มี `edited` (#150) — PR ซ้อนชั้นเคยได้ศูนย์ check เงียบๆ และการย้าย base ไม่นับเป็น `synchronize`
- `firebase-hosting-deploy.yml` รันตอน push main สอง job: `Deploy Hosting (rider PWA)` + `Deploy Cloud Functions (rider-notifications)` — **ยืนยันทั้งสองโดยชื่อ** ไม่ใช่ run-level · `npm ci` บนรันเนอร์ช้าได้ถึง 7 นาทีโดยไม่ได้ค้าง
- Firebase Hosting: `/assets/**` immutable 1 ปี · อย่างอื่น `no-cache` · SW ใช้ `updateViaCache` เริ่มต้นจึงไม่ติดแคชของตัวเอง (ดู `docs/reports/2026-09-03-rider-auth-logout-survey.md` ข้อ 5)

## ประวัติ/รายงาน
- `docs/reports/2026-09-03-rider-auth-logout-survey.md` — ทำไมไรเดอร์โดนเตะออก (6 คำถาม พร้อม file:line)
- `docs/reports/2026-09-03-rider-push-delivery-survey.md` — ทำไม "บางทีมันไม่เด้ง" ไม่ใช่บางที (9 ข้อ + ของที่ตรวจแล้วว่าไม่ใช่)
