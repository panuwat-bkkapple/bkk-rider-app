# PR 1 — `fix/rider-auth-persistence`

อ้างอิงบรีฟ "bkk-rider-app — Auth session redesign" ข้อ 1.1–1.5
ฐาน: `origin/main` @ `9f47c51` (fetch สดก่อนตัด branch, `merge-base --is-ancestor` ผ่าน)

`tsc -b` ผ่าน · `npm run build` ผ่าน · `npm test` 117/117 ผ่าน (8 ไฟล์)

---

## ⚠️ สองข้อที่ทำไม่ตรงบรีฟ — อ่านก่อน

### 1. ข้อ 1.1 บรีฟขัดกันเอง เลือกทำตามครึ่งที่ปลอดภัย

บรีฟข้อ 1.1 เขียนสองอย่างที่เป็นไปพร้อมกันไม่ได้:

> "Replace bare `getAuth(app)` with `initializeAuth(app, { persistence:
> [indexedDBLocalPersistence, browserLocalPersistence] })` — **copy the exact
> form used in bkk-frontend-next's 22 Aug fix; do not invent a new one.**"

รูปที่เขียนไว้ใน array **ไม่ใช่** รูปที่ bkk-frontend-next ใช้ และมันใส่
`indexedDBLocalPersistence` เป็นตัวแรก ซึ่งคือสิ่งที่ fix 22 ส.ค. ตั้งใจกำจัด
ออกไปพอดี ตัวจริงที่ `bkk-frontend-next/lib/firebase.ts:57-61` คือ:

```ts
initializeAuth(app, {
  persistence: browserLocalPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});
```

และคอมเมนต์เหนือมัน (`:46-56`) ระบุเหตุผลไว้ตรงๆ ว่า **ทางเดียวที่ไม่เปิด IDB
เลย** คือประกาศ persistence ที่ไม่มี IDB ตั้งแต่ init ส่วน CLAUDE.md ของ repo
นั้นตั้งชื่อหัวข้อว่า *"ห้ามให้ IndexedDB กลับเข้ามาใน init"*

**SDK ลอง persistence ตัวแรกที่ใช้ได้เสมอ** — บนเบราว์เซอร์ที่มี IDB (ทุกตัวที่
เราสนใจ) `[indexedDBLocalPersistence, browserLocalPersistence]` จึงได้ IDB
ทุกครั้ง = บั๊กเดิมกลับมาเต็มรูป ไม่ใช่ครึ่งเดียว

**ทำไปแล้ว:** ยกรูปของ bkk-frontend-next มาทั้งก้อน (`src/api/firebase.ts:38-46`)
พร้อม try/catch กัน already-initialized เหมือนต้นทาง
**ต้องเคาะ:** ถ้าตั้งใจให้มี IDB ใน array จริงๆ บอกมา แล้วจะเปลี่ยนให้ —
แต่ต้องรู้ว่านั่นคือการเดินกลับเข้าไปในบั๊กที่รายงานสำรวจข้อ 1 ชี้ไว้

*(`popupRedirectResolver` ยกมาด้วยเพื่อให้รูปตรงต้นทาง วันนี้แอปไรเดอร์ยังไม่มี
`signInWithRedirect`/`Popup` — ยืนยันด้วย grep แล้ว — แต่ค่า default ของ
`getAuth` หายไปเมื่อใช้ `initializeAuth` ถ้าวันหนึ่งมีจะได้ไม่พังเงียบ)*

### 2. ข้อ 1.4 วัดจาก session นี้ไม่ได้ — **แต่มีตัวเลข baseline แล้ว (วัดจากภายนอก)**

บรีฟสั่ง `curl -sI` production ก่อนแตะอะไร ทำจาก session นี้แล้วได้ 403 ที่
**มาจาก agent proxy ไม่ใช่จาก Firebase Hosting** — ยืนยันที่
`$HTTPS_PROXY/__agentproxy/status`:

```json
"recentRelayFailures": [
  { "kind": "connect_rejected",
    "detail": "gateway answered 403 to CONNECT (policy denial or upstream failure)",
    "host": "bkk-rider-app.web.app:443" }
]
```

ได้ผลเหมือนกันทั้ง `/`, `/firebase-messaging-sw.js` และ `/sw.js`

**baseline ก่อนแก้ — วัดจากเครื่องภายนอกโดยเจ้าของงาน 3 ก.ย. 2569
(ไม่ใช่ตัวเลขที่ session นี้วัดเอง และไม่ใช่ค่าที่เดาจากเอกสาร):**

| path | `cache-control` ก่อนแก้ |
|---|---|
| `/` (index.html) | `max-age=3600` |
| `/firebase-messaging-sw.js` | `max-age=3600` |

ทั้งคู่คือ **ค่า default ของ Firebase Hosting** ซึ่งสอดคล้องกับที่ `firebase.json`
เดิมไม่มีบล็อก `headers` เลย

**ตัวเลขนี้ปิดคำถามที่ค้างจากรายงานสำรวจข้อ 5 — และยืนยันว่า "ทางที่ 2" คือของจริง:**

> `/` ถูกเสิร์ฟด้วย `max-age=3600` แปลว่า **HTTP cache ของเบราว์เซอร์เสิร์ฟ
> index.html เก่าได้นานถึง 1 ชั่วโมง** และเพราะ service worker เป็น network-first
> ที่เรียก `fetch(event.request)` ธรรมดา ตัว `fetch` นั้น**ก็ผ่าน HTTP cache
> ชั้นนั้นด้วย** → ได้ HTML เก่า → ได้ `/assets/index-<hash เก่า>.js` →
> **โค้ด auth เก่านานได้ถึงหนึ่งชั่วโมงหลัง deploy โดยที่ไรเดอร์ออนไลน์เต็มที่**
>
> นี่คือทางที่อันตรายกว่าทางที่ 1 (fallback ออฟไลน์) เพราะมันทำงาน**ตอน
> ออนไลน์ปกติ** ไม่ต้องรอให้เน็ตหลุด — ตรงกับที่รายงานสำรวจจัดอันดับไว้

**ข้อควรรู้เรื่อง `firebase-messaging-sw.js`: 3600 ของมันไม่ใช่ตัวการ**
เบราว์เซอร์ข้าม HTTP cache ตอนตรวจอัปเดตสคริปต์ service worker เองอยู่แล้ว
(`updateViaCache` ค่า default คือ `'imports'` ซึ่งบังคับใช้ cache กับ
`importScripts` เท่านั้น ไม่ใช่กับตัวสคริปต์หลัก) การตั้ง `no-cache` ให้มันจึง
เป็นการ**ปิดช่องเผื่อไว้ ไม่ใช่การแก้บั๊กที่วัดได้** — ตัวที่วัดได้และเป็นเหตุจริง
คือ `/` เท่านั้น **อย่าเครดิตการแก้ผิดที่**

**after ยังไม่มี** — ต้อง deploy ก่อนแล้ววัดซ้ำด้วยสองคำสั่งเดิม:
```bash
curl -sI https://bkk-rider-app.web.app/ | grep -i cache-control
# คาดหวัง: no-cache
curl -sI https://bkk-rider-app.web.app/assets/<ไฟล์ที่ build ออกมา>.js | grep -i cache-control
# คาดหวัง: public, max-age=31536000, immutable
```

**หมายเหตุชื่อไฟล์:** บรีฟเขียน `sw.js` แต่ไฟล์จริงชื่อ
`firebase-messaging-sw.js` — ใช้ชื่อจริง ถ้าตั้ง header ให้ `/sw.js` จะเป็นกฎที่
ไม่ match อะไรเลย (การวัดจากภายนอกยืนยันด้วยว่า `/sw.js` ไม่มีอยู่จริง)

---

## สิ่งที่แก้ไป

### 1.1 Persistence — `src/api/firebase.ts`

`getAuth(app)` เปล่า → `initializeAuth(app, { persistence: browserLocalPersistence,
popupRedirectResolver: browserPopupRedirectResolver })` ใน try/catch แล้วค่อย
`getAuth(app)` เพื่อ export

**ลำดับ fallback ที่ได้จริง (ตามที่บรีฟขอให้บันทึก):** ไม่มี fallback —
ประกาศไว้ตัวเดียวคือ `browserLocalPersistence` **โดยเจตนา** ถ้า localStorage
ใช้ไม่ได้ (Safari private mode บางรุ่น) SDK จะตกไป `inMemoryPersistence` เอง
ซึ่งแปลว่า session อยู่แค่ชั่วอายุแท็บ — ยอมรับได้ และดีกว่าการแขวนค้างที่ IDB
เพราะอย่างน้อยแอปยัง**ตอบสนอง**

### 1.2 เพดานเวลา 10 วินาที — `src/App.tsx`

- `AUTH_CHECK_TIMEOUT_MS = 10_000` (ยกค่าจาก `bkk-frontend-next/lib/anonAuth.ts:39`)
- `setTimeout` คู่กับ `onAuthStateChanged` ธง `settled` กันไม่ให้ทั้งสองทางชนกัน
- ครบเวลาแล้วยังไม่มี user → `logAuthEvent('auth_check_timeout')` +
  `setSessionExpired(true)` (ถ้ามี `riderId`) + `setAuthChecked(true)`
- **ผลที่ต่างจากต้นทาง:** ฝั่งเว็บลูกค้า timeout แล้ว reject promise ให้ caller
  เข้า catch ของตัวเอง ที่นี่ไม่มี promise ให้ reject — สิ่งที่ต้องปลดคือ
  `authChecked` เพื่อให้ได้ **จอที่กดอะไรได้** แทน spinner ที่หมุนไม่จบ

### 1.3 เลิกล้างการลงทะเบียนเครื่องเมื่อ auth เป็น null

**`src/App.tsx`** — กิ่ง `!user && riderId` ไม่ลบ `rider_id`/`device_pin` อีกแล้ว
เปลี่ยนเป็น `logAuthEvent('firebase_session_lost')` + `setSessionExpired(true)`

เพิ่ม `authed = !!riderId && !sessionExpired` แล้วให้ทุก route ใช้ตัวนี้แทน
`riderId` — เพราะ `riderId` เปลี่ยนความหมายเป็น "เครื่องนี้ลงทะเบียนไว้กับใคร"
ซึ่งอยู่ต่อได้ข้าม session ที่หมดอายุ ส่วน "เข้าใช้งานได้ไหม" เป็นคนละคำถาม
(หลักการข้อ 1)

**`src/pages/Login.tsx`** — รับ props ใหม่ `sessionExpired` + `prefillEmail`:
- `sessionExpired` บังคับ `mode = 'email'` (ข้ามจอ PIN เพราะ PIN ปลดกลอนใน
  เครื่องได้ แต่สร้าง Firebase session ใหม่ไม่ได้) + prefill อีเมล +
  แถบข้อความ **"เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง"**
- ซ่อนปุ่ม "สลับบัญชี" ตอน `sessionExpired` (เราอยู่จอ email อยู่แล้ว)

**`handleEmailLogin` รื้อลำดับใหม่ — นี่คือหัวใจของ 1.3:**

เดิมบรรทัด `:110-111` ล้าง `rider_id` + `device_pin` **ก่อนรู้ผลการล็อกอินด้วยซ้ำ**
แปลว่าการเข้าระบบใหม่ของไรเดอร์**คนเดิม**ก็ทำลายการลงทะเบียนเสมอ (และล็อกอิน
ผิดรหัสก็ยังทำลาย) ตอนนี้ตัดสิน**หลัง**รู้ว่าเป็นใคร:

| สถานการณ์ | `device_pin` | ผลลัพธ์ |
|---|---|---|
| ไรเดอร์คนเดิมกลับเข้ามา (session หมดอายุ) | **เก็บไว้** | `onLoginSuccess` ทันที ไม่ตั้ง PIN ใหม่ |
| คนละคน (`priorRiderId !== uid`) | ลบ | เข้าโหมด `create_pin` |
| เครื่องใหม่ ไม่มี PIN | ไม่มีอยู่แล้ว | เข้าโหมด `create_pin` |
| ล็อกอินไม่ผ่าน / Pending / ไม่มีโปรไฟล์ | **เก็บไว้** | ไม่แตะอะไรเลย |

ตรงตามบรีฟข้อ 1.3 บรรทัดที่สอง ("Login.tsx:75 — only run PIN setup when
`device_pin` is absent") และแก้เหตุที่ทำให้มันจำเป็นไปพร้อมกัน

เพิ่มคีย์ `rider_email` ใน localStorage (เขียนตอนล็อกอินสำเร็จ) เพราะ
**ไม่มีที่ไหนเก็บอีเมลไว้เลย** และตอน session หมดอายุจะอ่าน `riders/{uid}/email`
จาก RTDB ไม่ได้ (token ตายไปแล้ว = permission denied) — ไม่มีคีย์นี้ก็ไม่พัง
แค่ช่อง prefill ว่าง (เครื่องที่ติดตั้งอยู่ก่อนหน้าจะเป็นแบบนั้นหนึ่งรอบ)

### 1.4 Hosting headers + service worker

**`firebase.json`** — เพิ่ม `headers` ตามรูปของ target `dealer` ใน
`bkk-system/firebase.json` (ธรรมเนียมที่มีอยู่แล้วใน codebase: `**` กว้างก่อน
แล้ว `/assets/**` เฉพาะเจาะจงทีหลัง):

```json
{ "source": "**",         "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
{ "source": "/assets/**", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
```

ใช้ `**` แทนการระบุ `/index.html` เพราะ **rewrite ไม่เปลี่ยน path ที่ใช้ match
header** — `/login`, `/claim/xxx` เสิร์ฟเนื้อ index.html แต่ path ที่ Hosting
เห็นคือ `/login` กฎที่เขียน `/index.html` เฉยๆ จึงไม่ครอบเส้นทาง SPA เลย
`firebase-messaging-sw.js` ถูกครอบด้วย `**` อยู่แล้ว
บันเดิลปลอดภัยเพราะ Vite ตั้งชื่อด้วย hash (ยืนยันจาก build รอบนี้:
`dist/assets/index-D5wTCaMa.js`)

**`public/firebase-messaging-sw.js`** — `CACHE_NAME` v3 → **v4**:
- navigation ตัดสินด้วย `request.mode === 'navigate' || destination === 'document'`
  (destination เป็น `''` ได้ในบางเบราว์เซอร์ แล้ว navigation จะร่วงไม่เข้ากิ่งไหนเลย)
- network-first เหมือนเดิม แต่ **ทุก navigation ที่สำเร็จเขียนทับสำเนาออฟไลน์**
  → สำเนาตามหลังของจริงไม่เกินหนึ่งครั้งที่เปิดแอปแบบออนไลน์ แทนที่จะเป็น
  snapshot ตอน install ที่เก่าได้ไม่จำกัด
- `activate` ดึง `/` สดด้วย `fetch(..., { cache: 'reload' })` มาทับสำเนาทันที
  (`cache: 'reload'` เพื่อข้าม HTTP cache ของเบราว์เซอร์ ไม่งั้นได้ของเก่าจาก
  ชั้นนั้นมาแทน)
- ออฟไลน์และไม่มีสำเนาเลย → `throw` ให้เบราว์เซอร์แสดงหน้า offline ของตัวเอง
  ดีกว่าคืน Response ว่างที่อ่านไม่ออก

### 1.5 `logAuthEvent` — `src/utils/authEvents.ts` (ไฟล์ใหม่)

เขียน `rider_auth_events/{riderId}/{pushId}` = `{ reason, at, ua, appVersion, online }`
**ห้าม throw ห้าม block** — ทุก call site คือเส้นทางที่กำลังพาไรเดอร์ออกจากระบบ
อยู่แล้ว และเคสที่ใช้บ่อยที่สุดคือตอน token ตาย ซึ่งเป็นตอนที่ write จะล้มพอดี
`console.warn` ยิงก่อนเสมอและไม่ขึ้นกับผลของ RTDB (คนอ่านคนที่สองที่ยังใช้ได้
ตอน rules ยังไม่ deploy)

`riderId` ต้องส่งเข้ามาเอง ไม่อ่านจาก `auth.currentUser` เพราะ ณ จุดนั้น
`currentUser` มักเป็น null ไปแล้ว — นั่นคือเหตุผลที่กำลังเขียน log อยู่

ต่อครบทั้ง 6 call site จากตารางในรายงานสำรวจ บวกอีก 3 จุดใหม่:

| reason | ที่มา |
|---|---|
| `firebase_session_lost` | `App.tsx` กิ่ง null |
| `auth_check_timeout` | `App.tsx` เพดาน 10 วิ |
| `session_recovered` | `App.tsx` `handleLoginSuccess` ตอนกำลัง expired |
| `explicit_logout` | `RiderApp.tsx:confirmLogout` |
| `auto_logout_timeout` | `useAutoLogout.ts` |
| `account_suspended` | `useRiderData.ts` (แนบ `suspend_reason` ตัดที่ 120 ตัวอักษร) |
| `login_rejected_pending` | `Login.tsx` |
| `login_rejected_no_profile` | `Login.tsx` |
| `device_reset` | `Login.tsx:handleResetDevice` |

**RTDB rules** — อยู่คนละ repo ตามกฎ canonical (`bkk-frontend-next/database.rules.json`)
อยู่บน branch `claude/bkk-rider-auth-survey-3onl5v` ของ repo นั้น:

```
rider_auth_events/
  .read              admin
  $riderId/.read     เจ้าตัว หรือ admin
  $riderId/$eventId/.write   auth.uid === $riderId && !data.exists() && hasChildren(['reason','at'])
```

`!data.exists()` = **append-only** ไรเดอร์เขียนทับแถวเดิมของตัวเองไม่ได้
(log ที่คนถูก log แก้ได้ ไม่ใช่ log) + `.validate` จำกัดชนิดและความยาวทุกฟิลด์
กัน `ua` ยาวผิดปกติมาถมโหนด
`lib/databaseRules.test.ts` ผ่าน 7/7 (ด่านที่จับคีย์รูป `"//"` — ไม่ได้ใส่คอมเมนต์
ลงไฟล์กฎ)

> **ต้อง deploy rules ก่อน log ถึงจะเข้า** ระหว่างที่ยังไม่ deploy
> `logAuthEvent` จะเขียนไม่สำเร็จและ `console.warn` แทน — ตั้งใจให้เป็นแบบนั้น
> (fail-soft) แต่แปลว่า **ตาราง `rider_auth_events` จะว่างจนกว่าจะ deploy จาก
> bkk-frontend-next** ห้ามอ่านความว่างนั้นว่า "ไม่มีใครหลุด"

---

## ไฟล์ที่แตะ

| ไฟล์ | ข้อ |
|---|---|
| `src/api/firebase.ts` | 1.1 |
| `src/App.tsx` | 1.2, 1.3, 1.5 |
| `src/pages/Login.tsx` | 1.3, 1.5 |
| `src/utils/authEvents.ts` *(ใหม่)* | 1.5 |
| `src/hooks/useAutoLogout.ts` | 1.5 (log อย่างเดียว) |
| `src/hooks/useRiderData.ts` | 1.5 |
| `src/pages/RiderApp.tsx` | 1.5 |
| `firebase.json` | 1.4 |
| `public/firebase-messaging-sw.js` | 1.4 |
| `bkk-frontend-next/database.rules.json` *(คนละ repo)* | 1.5 |

ตรวจ NUL byte ทุกไฟล์แล้ว = 0 (`git diff --stat` ไม่มีคำว่า `Bin`)

---

## ที่จงใจไม่แตะ

- **`useAutoLogout` ยังล้าง `device_pin` อยู่** ซึ่ง**ขัดหลักการข้อ 2 และข้อ 3**
  ตรงๆ — บรีฟมอบการถอดมันทิ้งให้ PR 2 (ข้อ 2.1 `usePinLock`) จึงใส่แค่ log
  แล้วปล่อยพฤติกรรมเดิม **ระหว่างนี้ยังมีทางเดียวที่ทำลายการลงทะเบียนโดยไม่มี
  ใครสั่ง คือตัวจับเวลา 30 นาทีตัวนี้** ใส่คอมเมนต์ชี้ไป PR 2 ไว้ในโค้ดแล้ว
- `useDatabase` `PERMISSION_DENIED` → ยังเป็น `setData([])` (ข้อ 2.2)
- callable `unauthenticated` → ยังตกไปที่ "กรุณาลองใหม่" (ข้อ 2.2)
- `onIdTokenChanged` → ยังไม่มี (ข้อ 2.3)

---

## ยังไม่ได้ทดสอบ

**ไม่มีการรันบนอุปกรณ์จริงเลย** — acceptance ของบรีฟระบุ iPhone จริง
(Safari โหมดปกติ + Home Screen) ซึ่งทำจาก session นี้ไม่ได้ ทุกอย่างข้างบน
พิสูจน์ด้วย `tsc -b` + build + unit test เท่านั้น

**สองเคสที่ต้องลองด้วยมือก่อนเชื่อ:**

1. **เส้น session-expired** — ล็อกอิน → ตั้ง PIN → ปิดแอป → Settings > Safari >
   ล้าง website data ของโฮสต์ → เปิดใหม่
   คาดหวัง: จอ "เซสชันหมดอายุ" + อีเมล prefill + ใส่รหัสผ่านครั้งเดียว →
   กลับเข้าใช้งานโดย**ไม่ต้องตั้ง PIN ใหม่**
   ⚠️ การล้าง website data ลบ `localStorage` ไปด้วย จึงลบ `device_pin` และ
   `rider_email` — เคสนี้จะ**ไม่**พิสูจน์ "ไม่ต้องตั้ง PIN ใหม่" ตามที่บรีฟคาด
   เส้นที่พิสูจน์ได้จริงคือ **ให้ Firebase session ตายโดย localStorage ยังอยู่**
   เช่นสั่ง revoke refresh tokens ของไรเดอร์คนนั้นจาก Firebase console แล้วเปิดแอป
2. **เพดาน 10 วินาที** — ต้องได้จอล็อกอิน ไม่ใช่ spinner ค้าง

**baseline ของ header วัดแล้ว** (จากภายนอก โดยเจ้าของงาน — ดูข้อ 2 ด้านบน:
`/` และ `/firebase-messaging-sw.js` เดิมเป็น `max-age=3600` ทั้งคู่)
**ค่า after ยังไม่มี** ต้องวัดซ้ำหลัง deploy

**ยังไม่ได้เปิดซอร์ส firebase-js-sdk** ยืนยันลำดับ persistence ด้วยตา (ยกจาก fix
ที่ใช้งานจริงบน production ของ repo พี่น้องแทน)
