# สำรวจวงจร auth session ของ bkk-rider-app — ทำไมไรเดอร์ถึงหลุดออกจากระบบ

> **สำรวจอย่างเดียว ไม่มีการแก้โค้ด** — ทุกบรรทัดในรายงานนี้อ่านจาก tree ที่
> `9f47c51` (ตรงกับ `origin/main` ตอนสำรวจ) ตัวเลขบรรทัดอ้างไฟล์ ณ commit นั้น
>
> คำถาม 6 ข้อที่ถูกสั่งให้ตอบ: (1) persistence mode ที่ตั้งจริง · (2) call site
> ของ `signOut()` ทุกตัวและอะไรเป็นตัวสั่ง · (3) การจัดการ `onAuthStateChanged`
> กับสถานะ null ก้อนแรกก่อนเด้งไป login · (4) การรับมือ 401 / token refresh ล้ม ·
> (5) กลยุทธ์ cache ของ service worker และ JS ฝั่ง auth ถูกเสิร์ฟของเก่าได้ไหม ·
> (6) แอปถูกเปิดด้วยวิธีไหน (manifest / start_url / ลิงก์ที่ส่งทาง LINE)

---

## สรุปสั้นก่อน

แอปนี้มี **"การล็อกอิน" สองตัวที่แยกจากกัน** และเกือบทุกอาการหลุดออกจากระบบเกิดจาก
ช่องว่างระหว่างสองตัวนี้:

| | เจ้าของสถานะ | เก็บที่ไหน | อายุ |
|---|---|---|---|
| **session ของแอป** (`riderId`) | `App.tsx:67-69` | `localStorage.rider_id` + `localStorage.device_pin` | ไม่มีวันหมดอายุด้วยตัวเอง |
| **session ของ Firebase** (`auth.currentUser`) | Firebase SDK | persistence ที่ SDK เลือกเอง (ดูข้อ 1) | refresh token ของ Firebase |

ประตูหน้าจอที่ไรเดอร์เห็นทุกวัน (จอ PIN) **ไม่แตะ Firebase Auth เลย** —
`Login.tsx:41-50` เทียบ hash ของ PIN กับ `localStorage.device_pin` แล้วเรียก
`onLoginSuccess(savedRiderId)` ตรงๆ. ฝั่ง Firebase ถูกตรวจแยกกันที่
`App.tsx:74-83` และ **กติกาของมันคือ: Firebase หาย → ล้าง localStorage ทิ้งทั้งคู่**

ผลที่ตามมาซึ่งเป็นหัวใจของรายงานนี้: **ทุกเส้นทางของการหลุด ล้าง `device_pin`
ไปด้วยเสมอ** ไม่มีเส้นทางไหนเลยที่พาไรเดอร์กลับมาที่จอ PIN — ทุกครั้งคือกลับไป
กรอกอีเมล + รหัสผ่านใหม่ทั้งชุด (ดูตารางข้อ 2)

---

## 1. Firebase Auth persistence mode ที่ตั้งจริง

**ไม่มีการตั้งเลย — ใช้ค่า default ของ SDK**

`src/api/firebase.ts:20`
```ts
export const auth = getAuth(app);
```

ยืนยันด้วยการ grep ทั้ง `src/`, `public/`, `index.html`, `functions/`:

```
setPersistence          → 0 ผลลัพธ์
initializeAuth          → 0 ผลลัพธ์
browserLocalPersistence → 0 ผลลัพธ์
indexedDB               → 0 ผลลัพธ์
popupRedirectResolver   → 0 ผลลัพธ์
```

`firebase` เวอร์ชัน `^10.13.0` (`package.json:15`)

**ความหมาย:** `getAuth()` บน entry point ฝั่งเบราว์เซอร์ของ firebase-js-sdk v10
ลงทะเบียน persistence ตามลำดับ `indexedDBLocalPersistence` →
`browserLocalPersistence` → `browserSessionPersistence` → `inMemoryPersistence`
แปลว่า **ตัวแรกที่ถูกลองคือ IndexedDB เสมอ**

> **หมายเหตุความน่าเชื่อถือ:** container นี้ไม่มี `node_modules` จึงเปิดซอร์สของ
> SDK มายืนยันลำดับนี้ไม่ได้ ข้อความข้างบนมาจากพฤติกรรมที่เอกสาร SDK ระบุไว้
> **และตรงกับสิ่งที่ทีมสืบเองแล้วบันทึกไว้** ในหัวข้อ "Firebase Auth ฝั่งเว็บ —
> ห้ามให้ IndexedDB กลับเข้ามาใน init" ของ `bkk-frontend-next/CLAUDE.md`
> (บทเรียน 22 ส.ค. 2569) ถ้าจะลงมือแก้ ควรยืนยันซ้ำบน clone ที่ `npm install` แล้ว

### ทำไมข้อนี้สำคัญที่สุดในรายงาน

นี่คือ **บั๊กตัวเดียวกันเป๊ะ** กับที่เว็บลูกค้าเจอและแก้ไปแล้วเมื่อ 22 ส.ค. 2569:

- อาการฝั่งเว็บลูกค้า: iOS Safari **โหมดปกติ** (incognito ผ่าน, desktop ผ่าน)
  เปิด IndexedDB ที่มี database เดิมอยู่แล้วแล้ว **แขวนเงียบ** — ไม่ success
  ไม่ error → `onAuthStateChanged` **ไม่ emit สักครั้ง**
- ทางแก้ที่ repo นั้นใช้: `initializeAuth(app, { persistence: browserLocalPersistence,
  popupRedirectResolver })` ตอนสร้าง app — ประกาศ**ก่อน** init จะเริ่มแตะ IDB
  (`setPersistence()` ทีหลังช่วยไม่ได้ เพราะต่อคิวหลัง init ที่แตะ IDB ไปแล้ว)

**แอปไรเดอร์ยังไม่ได้รับการแก้นั้น** และมันเป็น PWA ที่รันบน iOS เป็นหลัก
(`index.html:12-14` ตั้ง `apple-mobile-web-app-capable`) ซึ่งเป็นแพลตฟอร์มเดียว
กับที่บั๊กนั้นเกิด

---

## 2. `signOut()` — call site ทุกตัวและอะไรเป็นตัวสั่ง

grep `signOut` ทั้ง `src/`, `public/`, `functions/` ได้ **5 call site**:

| # | ที่อยู่ | ตัวสั่ง | ล้าง `rider_id` | ล้าง `device_pin` | reload |
|---|---|---|---|---|---|
| 1 | `src/hooks/useAutoLogout.ts:17` | หมดเวลา 30 นาทีโดยไม่มี input | ✅ (`:18`) | ✅ (`:19`) | ✅ (`:20`) |
| 2 | `src/hooks/useRiderData.ts:84` | listener บน `riders/{id}` เห็น `approval_status === 'Suspended'` | ✅ (`:85`) | ✅ (`:86`) | ✅ (`:87`) |
| 3 | `src/pages/Login.tsx:121` | ล็อกอินอีเมลสำเร็จ แต่ `riders/{uid}.status === 'Pending'` | — | — | — |
| 4 | `src/pages/Login.tsx:130` | ล็อกอินอีเมลสำเร็จ แต่ไม่มีแถว `riders/{uid}` | — | — | — |
| 5 | `src/pages/Login.tsx:179` | ไรเดอร์กดปุ่ม "สลับบัญชี" (`handleResetDevice`, ปุ่มที่ `:194`) | ✅ (`:180`) | ✅ (`:181`) | — |
| 6 | `src/pages/RiderApp.tsx:295` | ไรเดอร์กดออกจากระบบเอง → `ConfirmModal` (`:540-546`) → `confirmLogout` | ✅ (`:296`) | ✅ (`:297`) | ✅ (`:298`) |

*(#3 และ #4 ไม่ล้าง localStorage เพราะ `handleEmailLogin` ล้างทิ้งไปแล้วตั้งแต่
`Login.tsx:110-111` ก่อนเรียก `signInWithEmailAndPassword`)*

### สิ่งที่ตารางนี้บอก

**ก. ทุกเส้นทางล้าง `device_pin` — ไม่มีทางกลับไปที่จอ PIN**

`device_pin` ถูก**เขียน**ที่เดียวคือ `Login.tsx:75` ซึ่งอยู่ในโหมด `create_pin`
ที่เข้าถึงได้ทางเดียวคือหลัง `signInWithEmailAndPassword` สำเร็จ
(`Login.tsx:127`). ดังนั้น:

> auto-logout 30 นาที = ไรเดอร์ต้องพิมพ์อีเมล + รหัสผ่าน + ตั้ง PIN ใหม่
> ไม่ใช่แค่ใส่ PIN 4 หลัก

นี่น่าจะไม่ใช่เจตนาของ "auto-logout เพื่อความปลอดภัย" แต่เป็นผลข้างเคียงของ
การล้างสองคีย์พร้อมกัน

**ข. auto-logout 30 นาทีเชื่อถือไม่ได้บน iOS PWA — และเพี้ยนได้ทั้งสองทาง**

`useAutoLogout.ts:6,16-21` เป็น `setTimeout` ล้วน ไม่มีการเทียบเวลาจริง
(wall clock) เลย:

- **หลุดเร็วเกิน:** iOS แช่ timer ตอนแอปอยู่เบื้องหลัง พอกลับมา timer ที่เลย
  กำหนดยิงทันที — ไรเดอร์สลับไปเปิด Google Maps 31 นาทีแล้วกลับมา = โดนเตะ
- **ไม่หลุดเลย:** ถ้า iOS **ฆ่าหน้าเว็บทิ้ง** timer หายไปพร้อมกัน พอเปิดใหม่
  `localStorage` ยังมี `rider_id`+`device_pin` ครบ และ Firebase persistence
  ยังจำ session อยู่ → ไรเดอร์เข้าได้ด้วย PIN ทันที **ไม่ว่าจะทิ้งไว้นานแค่ไหน**

รายชื่อ event ที่รีเซ็ตตัวจับเวลา (`useAutoLogout.ts:24`) คือ
`mousedown`, `touchstart`, `keydown`, `scroll` — **ไม่มี `touchmove`,
`pointerdown`, `click`, `visibilitychange`** ไรเดอร์ที่จ้องหน้าจองานหรือ
ปัดแผนที่ (`MapBackground`) อาจไม่ยิง event ในลิสต์นี้เลย

**ค. #2 (Suspended) กับ #3 (Pending) อ่านคนละฟิลด์**

- `useRiderData.ts:81` อ่าน `approval_status === 'Suspended'`
- `Login.tsx:120` อ่าน `status === 'Pending'`
- ส่วน `Register.tsx:95` เขียนฟิลด์ `status: 'Pending'` ตอนสมัคร

สองฟิลด์นี้ต่างกัน ไม่ได้ตรวจซ้ำกัน — ยังไม่ได้ไล่ว่าฝั่งแอดมินเขียนตัวไหน
(อยู่นอกขอบเขตที่ถูกสั่งให้สำรวจ แต่บันทึกไว้เพราะเป็น call site ของ `signOut`)

**ง. สมัครใหม่แล้วค้างอยู่ในสถานะ "signed in แต่จอโชว์ login"**

`Register.tsx:79` เรียก `createUserWithEmailAndPassword` ซึ่ง **sign in ให้ทันที**
แล้ว `:100` เรียก `onBack()` กลับไปจอ login **โดยไม่มี `signOut`** — ผู้สมัคร
จึงมี Firebase session ค้างอยู่ขณะที่แอปแสดงจอล็อกอิน (ไม่พัง เพราะ `riderId`
ยังเป็น null และ `App.tsx:75` ตรวจเฉพาะทิศ `!user && riderId`)

---

## 3. `onAuthStateChanged` และสถานะ null ก้อนแรกก่อนเด้งไป login

มี listener **ตัวเดียวทั้งแอป** ที่ `src/App.tsx:73-85`:

```ts
const [riderId, setRiderId] = useState<string | null>(
  localStorage.getItem('rider_id') && localStorage.getItem('device_pin')
    ? localStorage.getItem('rider_id') : null       // App.tsx:67-69
);
const [authChecked, setAuthChecked] = useState(false);              // :70

useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {          // :74
    if (!user && riderId) {                                         // :75
      console.warn('Firebase Auth session expired, clearing local session');
      localStorage.removeItem('rider_id');                          // :78
      localStorage.removeItem('device_pin');                        // :79
      setRiderId(null);                                             // :80
    }
    setAuthChecked(true);                                           // :82
  });
  return () => unsubscribe();
}, [riderId]);                                                      // :85

// ...
if (!authChecked) return <LoadingSpinner />;                        // :112
```

### สิ่งที่ทำถูกแล้ว

การรอ `authChecked` ก่อน render (`:112`) **ป้องกัน flash ของจอ login ตอน cold
start ได้ถูกต้อง** — `onAuthStateChanged` ของ Firebase ไม่ยิง callback ก้อนแรก
จนกว่าจะกู้ session จาก persistence เสร็จ ดังนั้น null ก้อนแรกที่มาถึงจึงเป็น
คำตอบจริง ไม่ใช่ "ยังไม่รู้" — โครงนี้ถูกต้องตามที่ SDK สัญญาไว้

### ช่องโหว่ที่พบ

**ก. ไม่มีเพดานเวลา — auth แขวน = จอหมุนค้างถาวร**

`setAuthChecked(true)` ถูกเรียก**ในคอลแบ็กเท่านั้น** (`:82`) ถ้า
`onAuthStateChanged` ไม่ยิงสักครั้ง — ซึ่งคืออาการเป๊ะๆ ของ IndexedDB แขวนบน
iOS Safari ที่อธิบายในข้อ 1 — `authChecked` ค้างเป็น `false` ตลอดกาล และไรเดอร์
เห็น **`<LoadingSpinner />` ค้างไม่มีวันจบ ไม่มีข้อความ ไม่มีปุ่ม ไม่มี error**

เทียบกับที่เว็บลูกค้าทำหลังเจอบั๊กเดียวกัน: `ensureAuth` (`lib/anonAuth.ts`)
ตั้ง timeout 10 วิ + ล้าง `pending` cache ตอน timeout **แอปไรเดอร์ไม่มีตัวเทียบ
ของสิ่งนี้เลย**

**ข. `[riderId]` ใน dependency array ทำให้ subscribe ใหม่ทุกครั้งที่ล็อกอิน/ออก**

listener ถูกรื้อทิ้งแล้วสร้างใหม่ทุกครั้งที่ `riderId` เปลี่ยน แต่ละครั้ง
Firebase ยิง callback ทันทีด้วยค่าที่ cache ไว้ — ยังไม่พบว่าทำให้เกิดอาการผิด
(ทิศ `!user && riderId` ไม่ทำงานย้อนกลับ) แต่มันคือเหตุผลที่ `console.warn`
บรรทัด `:77` อาจโผล่ซ้ำได้เวลาไล่ log

**ค. การล้างเป็นแบบ "ทางเดียว ไม่มีทางถอย"**

เมื่อ Firebase ยิง null ครั้งเดียว `device_pin` หายทันทีและ**สร้างกลับไม่ได้
นอกจากล็อกอินอีเมลใหม่** ไม่มีการยืนยันกับไรเดอร์ ไม่มี toast ไม่มีการแยกแยะว่า
null ตัวนี้มาจากอะไร (token ถูกเพิกถอน / บัญชีถูก disable / เราเพิ่งเรียก
`signOut()` เอง) ทุกกรณีได้ผลเดียวกันคือกลับไปจอกรอกอีเมล

**ง. ไม่มีการแยก signOut ที่ตั้งใจ ออกจากการหลุดเอง**

call site #1, #2, #6 ในข้อ 2 เรียก `signOut()` แล้ว**ล้าง localStorage เอง
พร้อม reload** ซึ่งจะไปกระตุ้น `App.tsx:75` ด้วยอีกทาง — งานซ้ำแต่ไม่เป็นพิษ
อย่างไรก็ตามมันแปลว่า `console.warn('Firebase Auth session expired')` โผล่ใน log
ทั้งที่ไรเดอร์แค่กดออกจากระบบเอง ทำให้ไล่ปัญหาย้อนหลังจาก log แยกสองกรณีไม่ออก

---

## 4. การจัดการ 401 / token refresh ล้ม

**ไม่มีเลย — ไม่มีสักบรรทัดในทั้ง repo**

grep ทั้ง `src/`:

```
401                  → 0 ผลลัพธ์
unauthenticated      → 0 ผลลัพธ์
user-token-expired   → 0 ผลลัพธ์
invalid-user-token   → 0 ผลลัพธ์
user-disabled        → 0 ผลลัพธ์
requires-recent-login→ 0 ผลลัพธ์
getIdToken           → 0 ผลลัพธ์
onIdTokenChanged     → 0 ผลลัพธ์
```

*(`permission-denied` มีผลลัพธ์ 2 ที่ แต่เป็น `src/utils/riderTransitions.ts:120`
ซึ่งเป็นคอมเมนต์อธิบายว่ารหัส gRPC หยาบเกินกว่าจะบอกไรเดอร์ กับเทสของมัน —
ไม่ใช่การจัดการ auth)*

สิ่งที่เกิดขึ้นจริงเมื่อ token ตายขณะแอปเปิดอยู่ แยกเป็น 2 ท่อ:

### ท่อที่ 1 — RTDB listener → **กลืนเงียบ กลายเป็นจอว่าง**

`src/hooks/useDatabase.ts:25-29`
```ts
}, (error) => {
  console.error(`useDatabase error on "${path}":`, error.message);
  setData([]);          // ← จอว่าง แยกจาก "ไม่มีข้อมูล" ไม่ออก
  setLoading(false);
});
```

เหมือนกันที่ `src/hooks/useRiderJobs.ts:71-73` และ `:87-89` (`console.error`
อย่างเดียว)

**ผลกับไรเดอร์:** RTDB คืน `PERMISSION_DENIED` เมื่อ token หมดอายุหรือถูกเพิกถอน
→ รายการงานกลายเป็นว่าง ยอดกระเป๋าเป็น 0 → **หน้าจอบอกว่า "ไม่มีงาน" ทั้งที่
ความจริงคือ "คุณไม่ได้ล็อกอินอยู่แล้ว"** ไม่มีอะไรพาไปหน้า login และ
`App.tsx:75` ก็ไม่ช่วย เพราะ RTDB ปฏิเสธไม่ได้แปลว่า `auth.currentUser` เป็น null

### ท่อที่ 2 — callable functions → **toast ธรรมดา ไม่มีการ re-auth**

`src/hooks/useJobActions.ts:243-250` (`transitionJob`) จับ error แล้วอ่าน
`engineErrorCode(error)` ซึ่ง (`riderTransitions.ts:123-129`) อ่านเฉพาะ
`error.details.code` ที่ engine ใส่มา — **ถ้า Firebase ปฏิเสธที่ชั้น auth
(`functions/unauthenticated`) จะไม่มี `details` เลย** โค้ดจึงตกไปที่
`transitionErrorMessage(undefined, ...)` → `riderTransitions.ts:112`
→ ข้อความ **"เกิดข้อผิดพลาดในการอัปเดตสถานะ กรุณาลองใหม่"**

ไรเดอร์ที่ token ตายจึงเห็น *"กรุณาลองใหม่"* ซ้ำๆ ทุกครั้งที่กดปุ่ม —
คำแนะนำที่ไม่มีวันสำเร็จ

รูปเดียวกันที่ `useJobActions.ts:472-475` (`riderRequestWithdraw`),
`ClaimAssessment.tsx:71-75`, `utils/sickwApi.ts`, `utils/amendments.ts`,
`utils/diagnos.ts`, `utils/visionOcr.ts` — ทุกตัวใช้ `e?.message` แล้วโยนเข้า
`toast.error` โดยไม่ตรวจ `code`

### สรุปข้อ 4

**การกู้คืนเดียวที่มีอยู่จริงคือ `App.tsx:75`** ซึ่งทำงานเฉพาะเมื่อ SDK
ตัดสินใจ sign out เองแล้วยิง null ออกมา — ถ้า token แค่ "ใช้ไม่ได้"
แต่ SDK ยังถือ user object อยู่ (เช่น refresh ล้มเพราะเน็ต, rules ปฏิเสธ)
แอปจะอยู่ในสภาพ **"ดูเหมือนล็อกอินอยู่ แต่ทำอะไรไม่ได้เลย"** ไปเรื่อยๆ

---

## 5. Service worker caching และ JS ฝั่ง auth ถูกเสิร์ฟของเก่าได้ไหม

### โครงที่มี

ไม่มี Workbox, ไม่มี `vite-plugin-pwa` — service worker ตัวเดียวคือ
`public/firebase-messaging-sw.js` เขียนมือ (125 บรรทัด) ทำสองหน้าที่ในไฟล์เดียว:
FCM background push **และ** offline cache

**การลงทะเบียน — `src/hooks/usePushNotifications.ts:92-95`**
```ts
const permission = await Notification.requestPermission();
if (permission !== 'granted') { ...; return; }        // :86-90  ← ออกก่อนถึง register
if ('serviceWorker' in navigator) {
  swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
```

hook นี้ถูกเรียกที่ `App.tsx:109` และ**ออกทันทีถ้า `riderId` เป็น null**
(`usePushNotifications.ts:29`)

> **ผลที่ควรรู้:** SW ลงทะเบียนก็ต่อเมื่อ (ก) ล็อกอินแล้ว **และ** (ข) ไรเดอร์
> กด "อนุญาต" การแจ้งเตือน — **ไรเดอร์ที่ปฏิเสธการแจ้งเตือนจะไม่มี offline
> cache เลย** สองเรื่องที่ไม่เกี่ยวกันถูกมัดไว้ด้วยกัน

### กลยุทธ์ cache (`firebase-messaging-sw.js:48-70`)

```js
if (event.request.destination === 'document') {              // :55
  event.respondWith(fetch(event.request).catch(() => caches.match('/')));   // :57
} else if (['script','style','image','font'].includes(event.request.destination)) {  // :59
  event.respondWith(
    caches.match(event.request).then((cached) =>             // :61  ← CACHE-FIRST
      cached || fetch(event.request).then((response) => {
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));  // :64
```

- **document (HTML)** → network-first, fallback เป็น `caches.match('/')`
- **script / style / image / font** → **cache-first แบบไม่มีวันหมดอายุ**
  ไม่มี revalidate ไม่มี stale-while-revalidate
- `CACHE_NAME = 'bkk-rider-v3'` (`:12`) — **ฮาร์ดโค้ด** เปลี่ยนได้ด้วยมือคนเท่านั้น
- `activate` (`:39-46`) ลบเฉพาะ cache ที่**ชื่อไม่ตรง** `CACHE_NAME` — ตราบใดที่
  ยังเป็น v3 ของในนั้น**ไม่เคยถูกกวาดเลย**
- `STATIC_ASSETS` (`:13-17`) = `'/'`, `/manifest.json`, ไอคอน 192

### ตอบคำถาม: JS ฝั่ง auth ถูกเสิร์ฟของเก่าได้ไหม

**ตอบสั้น: ได้ แต่ไม่ใช่ทางที่น่าสงสัยที่สุด — และทางที่เป็นไปได้จริงมีสองทาง**

**ทางที่ปลอดภัยอยู่แล้ว (บันทึกไว้เพื่อไม่ให้ไล่ผิดทาง):** `vite.config.ts` ไม่ได้
override `build.rollupOptions.output` เลย บันเดิลจึงออกมาเป็น
`/assets/index-<hash>.js` ตาม default ของ Vite = **content-addressed** ทุก build
ใหม่ได้ URL ใหม่ → cache-first บน URL ที่ไม่เคยเห็น = cache miss = ไปดึงจากเน็ต
**ดังนั้นตราบใดที่ไรเดอร์ได้ index.html สดมา เขาจะได้โค้ด auth สดเสมอ**

**ทางที่ 1 — fallback offline พาไปหา index.html ที่เก่าได้ไม่จำกัด**

`'/'` ถูกเขียนลง cache ที่ `install` (`:26-33`) **ครั้งเดียว** ตอน CACHE_NAME
กลายเป็น `v3` และไม่เคยถูกเขียนทับอีก (document เป็น network-first จึงไม่เคย
`cache.put` ทับ). ทุกครั้งที่ `fetch` ของ document **reject** ไรเดอร์จะได้
index.html ของวันที่ SW v3 ติดตั้งครั้งแรก ซึ่งอาจเก่าเป็นเดือน → ชี้ไปยัง
`/assets/index-<hash เก่า>.js` → ตัวนั้นยังอยู่ใน cache (cache-first, ไม่เคยถูกกวาด)
→ **แอปทั้งตัวรวมโค้ด auth ย้อนกลับไปเป็นเวอร์ชันนั้น**

ซ้ำร้าย ถ้าบันเดิลเก่านั้น**ไม่ได้**อยู่ใน cache แล้ว (ไรเดอร์เพิ่งติดตั้ง SW
หลังจากที่ build ใหม่ไปแล้ว) → cache miss → fetch → 404 จาก hosting →
**แอปไม่บูตเลยตอนออฟไลน์** เห็นจอขาว

หมายเหตุ: `fetch(...).catch(...)` (`:57`) จับเฉพาะ **network rejection** ไม่จับ
HTTP status — 5xx หรือ 404 จะผ่านไปถึงเบราว์เซอร์ตรงๆ ไม่ได้ fallback

**ทางที่ 2 — ไม่มีนโยบาย cache header ฝั่ง hosting เลย**

`firebase.json:1-7` **ไม่มีบล็อก `headers`** ทั้ง `index.html` และไฟล์อื่น
จึงตกไปใช้ค่า default ของ Firebase Hosting ทั้งหมด ซึ่งแปลว่า **HTTP cache ของ
เบราว์เซอร์อาจเสิร์ฟ index.html เก่าให้กับ `fetch()` ของ SW เอง** (SW เป็น
network-first ก็จริง แต่ `fetch()` ยังผ่าน HTTP cache) → ได้ hash เก่า → ได้ JS เก่า
นี่คือทางที่**ทำงานแม้ไรเดอร์ออนไลน์เต็มที่** จึงน่าสงสัยกว่าทางที่ 1

> ยังไม่ได้วัดค่า header จริงที่ production ตอบกลับมา — งานถัดไปคือ
> `curl -sI https://bkk-rider-app.web.app/` แล้วอ่าน `cache-control` ตัวจริง
> ก่อนจะสรุปว่ากินเวลานานแค่ไหน

### ของแถมที่พบระหว่างทาง

- `importScripts` (`:72-73`) ตรึง firebase compat ไว้ที่ **10.12.2** ขณะที่แอป
  bundle `firebase ^10.13.0` — คนละเวอร์ชันในหน้าเดียวกัน (ไม่กระทบ auth
  โดยตรงเพราะ SW ใช้แค่ messaging แต่บันทึกไว้)
- `self.skipWaiting()` (`:36`) + `clients.claim()` (`:45`) เรียกทุกครั้ง —
  SW ตัวใหม่เข้าคุมทันทีโดยไม่รอปิดแท็บ ซึ่งถูกสำหรับกรณีนี้
- `cache.add` แยกทีละไฟล์พร้อม `.catch` (`:28-32`) — แก้บั๊ก v1 ที่
  `addAll` เป็น atomic แล้ว 404 ตัวเดียวทำให้ install ล้มทั้งก้อน (มีคอมเมนต์
  อธิบายไว้ที่ `:19-24` แล้ว ทำถูกแล้ว ไม่ต้องแตะ)

---

## 6. แอปถูกเปิดด้วยวิธีไหน

### manifest — `public/manifest.json`

```json
"short_name": "BKK Rider",
"start_url": ".",              // ← บรรทัด 18
"display": "standalone",       // ← บรรทัด 19
"theme_color": "#10b981"
```

**`start_url: "."`** — สัมพัทธ์กับที่อยู่ของ manifest ซึ่ง
`index.html:10` โหลดจาก `/manifest.json` จึง resolve เป็น `/` (root)

> **จุดที่ควรจับตา:** `"."` resolve จาก URL ของ **manifest** ไม่ใช่ของหน้าที่
> ติดตั้ง ตรงนี้ทำงานถูกเพราะ manifest อยู่ที่ root พอดี แต่มันเปราะกว่าการเขียน
> `"/"` ตรงๆ และ **ไม่มี `scope`** ประกาศไว้ (default = directory ของ start_url
> = `/` ซึ่งพอดีอยู่แล้ว)

`firebase.json:6` rewrite `**` → `/index.html` ดังนั้นทุก path เสิร์ฟ SPA เดียวกัน

**Hosting target:** `.firebaserc` map target `rider` → site `bkk-rider-app`
→ **`https://bkk-rider-app.web.app`** (ยืนยันตรงกับ
`bkk-system/functions/diagnostics.js:30` ที่ hardcode ค่าเดียวกันเป็น default)

`index.html:12-14` ตั้ง `apple-mobile-web-app-capable=yes` +
`apple-mobile-web-app-title="BKK Rider"` — ออกแบบมาเพื่อ **Add to Home Screen
บน iOS** ตามที่ CLAUDE.md ของ bkk-system บันทึกไว้สำหรับ PWA ฝั่งแอดมิน

### ลิงก์ที่ส่งทาง LINE

**ไม่มีการต่อกับ LINE ในระบบนี้เลย — ทั้งสามรีโป**

grep `line.me` / `liff` / `LINE Login` / `LINE OA` / `line_notify` /
`LINE Messaging` ทั้ง `/home/user` (ยกเว้น node_modules) ได้ผลลัพธ์ที่ไม่ใช่
integration ทั้งหมด:

- `bkk-frontend-next/app/components/ProductTrustSections.tsx:83` —
  ลิงก์ติดต่อ `https://line.me/R/ti/p/@bkkapple` (เว็บลูกค้า ไม่เกี่ยวไรเดอร์)
- `bkk-frontend-next/lib/searchAnalytics/traffic.ts:103` — `line.me`/`liff.line.me`
  ในลิสต์จำแนก referrer
- `bkk-frontend-next/app/utils/validators.ts:31` — คอมเมนต์ที่พูดถึง
  "LINE OA push" ในเชิงอนาคต ไม่ใช่โค้ดที่ทำงาน

และมีรายงานเก่ายืนยันข้อสรุปเดียวกันไว้แล้ว:
`bkk-frontend-next/docs/reports/2026-09-01-employee-lifecycle-survey.md:215`
— *"**LINE (any API)** — Does not exist."*

**ดังนั้นสมมติฐาน "ไรเดอร์เปิดแอปจากลิงก์ LINE แล้วเปิดใน in-app browser จน
storage คนละก้อน" ตัดทิ้งได้จากฝั่งโค้ด** ถ้าเกิดขึ้นจริงต้องเป็นเพราะมีคน
**คัดลอก URL ไปแปะใน LINE ด้วยมือ** ซึ่งโค้ดมองไม่เห็นและกันไม่ได้ —
และผลของมันร้ายจริง เพราะ in-app browser ของ LINE มี storage แยกจาก Safari
ทั้ง `localStorage` (`rider_id`/`device_pin`) และ persistence ของ Firebase
จึงเป็นคนละก้อน = **"ทำไมต้องล็อกอินใหม่ทุกครั้ง"** โดยที่ไม่มีอะไรพังเลย

### ทางเข้าอื่นที่มีจริง

| ทางเข้า | ที่มา | URL |
|---|---|---|
| Home Screen (PWA) | manifest `start_url` | `/` |
| กดการแจ้งเตือนแชท | `firebase-messaging-sw.js:110-111` | `/?openChat={jobId}` |
| กดการแจ้งเตือนอื่น | `firebase-messaging-sw.js:111` | `/` |
| สแกน QR ผลตรวจของลูกค้า | `bkk-system/functions/diagnostics.js:669` | `{riderAppUrl}/claim/{id}#c={code}` |

- `App.tsx:94-102` อ่าน `?openChat=` แล้ว `history.replaceState({}, '', '/')`
  **ล้าง query ทิ้งทันที**
- push จาก `pushToRider` (`bkk-system/functions/index.js:3613-3675`)
  **ไม่ได้แนบ URL มาด้วยเลย** — SW เป็นคนประกอบ target URL เองที่ `:110-111`
- เส้น `/claim/:assessmentId` มี round-trip กลับหลังล็อกอินอย่างถูกต้องแล้ว
  ผ่าน `?next=` (`App.tsx:57-64` และ `:42-55`) — **เป็นเส้นทางเดียวในแอปที่
  รักษาปลายทางไว้ข้ามการล็อกอิน** เส้นอื่นเด้งกลับ `/` เฉยๆ (`App.tsx:155`)

---

## ทบทวนรวม — ผู้ต้องสงสัยเรียงตามน้ำหนัก

ยังไม่ได้ทำ reproduction ใดๆ รายการนี้คือลำดับที่หลักฐานในโค้ดรองรับ ไม่ใช่
ข้อสรุป:

1. **`getAuth()` ปล่อยให้ IndexedDB เป็น persistence ตัวแรก** (`api/firebase.ts:20`)
   — บั๊กตัวเดียวกับที่เว็บลูกค้าเจอบน iOS Safari โหมดปกติและแก้ไปแล้วเมื่อ
   22 ส.ค. 2569 อาการที่จะเห็นคือ **จอหมุนค้าง** ไม่ใช่ "หลุดออกจากระบบ"
   เพราะไม่มี timeout ที่ `App.tsx:82`
2. **ไม่มีการจัดการ `PERMISSION_DENIED` / `unauthenticated`** (ข้อ 4) —
   token ตายแล้วแอปยังดูเหมือนล็อกอินอยู่ แสดง **จอ "ไม่มีงาน"** ทั้งที่
   ความจริงคือหมดสิทธิ์ ไม่มีอะไรพาไป login
3. **auto-logout 30 นาทีที่เพี้ยนได้ทั้งสองทางบน iOS PWA** (`useAutoLogout.ts`)
   — และเมื่อมันทำงาน มันล้าง `device_pin` ด้วย = ต้องกรอกอีเมล+รหัสผ่านใหม่
4. **index.html เก่าจาก HTTP cache / SW fallback** (ข้อ 5) — เสิร์ฟบันเดิล
   auth เก่าได้ ต้องวัด header จริงก่อนจึงจะรู้ว่าหน้าต่างกว้างแค่ไหน
5. **เปิดผ่าน in-app browser** — โค้ดไม่มีทางกัน แต่ก็ไม่มีทางทำให้เกิดเองด้วย
   (ไม่มี LINE integration) ต้องถามไรเดอร์ว่าเปิดจากไอคอนหน้าจอหรือจากลิงก์

## สิ่งที่ยังไม่ได้ตรวจ (ขอบเขตของรายงานนี้)

- **ไม่ได้เปิดซอร์ส firebase-js-sdk ยืนยันลำดับ persistence** — container ไม่มี
  `node_modules` (ดูหมายเหตุข้อ 1)
- **ไม่ได้วัด `cache-control` จริงที่ hosting ตอบ** — ต้อง `curl -sI` ที่ production
- **ไม่ได้ดู `database.rules.json`** ว่ากฎ read ของ `riders/{id}`, `jobs`,
  `transactions` เขียนไว้อย่างไร (อยู่ที่ `bkk-frontend-next` ตามกฎ canonical) —
  จำเป็นถ้าจะยืนยันข้อ 4 ว่า `PERMISSION_DENIED` เกิดจริงเมื่อไหร่
- **ไม่ได้ไล่ว่าฝั่งแอดมินเขียน `status` หรือ `approval_status`** — สองฟิลด์นี้
  ถูกอ่านคนละที่ (ข้อ 2 หัวข้อ ค.)
- **ไม่มี reproduction** — ทั้งหมดเป็นการอ่านโค้ด
