# สำรวจเส้นทาง push ของแอปไรเดอร์ — ทำไม "บางทีมันไม่เด้ง"

**3 ก.ย. 2569 · อ่านอย่างเดียว ไม่แก้โค้ด · ฐาน `c84bec5` (bkk-rider-app), `ad12360` (bkk-system), `b046401` (bkk-frontend-next)**

โจทย์จากเจ้าของงาน: *"งานจริงๆ มีนานๆ ที ครึ่งวันทีอาจจะมีแค่งานเดียว โดนเตะออก บางทีมันไม่เด้ง"*
ส่วน "โดนเตะออก" ปิดไปแล้วด้วย #141/#144 รายงานนี้ตอบเฉพาะ **"ไม่เด้ง"**

---

## 0. สรุปสั้น

พบผู้ต้องสงสัย 9 ข้อ **ข้อ A คือตัวที่อธิบายคำว่า "บางที" ได้ตรงที่สุด**: push ที่ส่งจาก
`bkk-rider-app/functions` (งานใหม่ · broadcast · แชท) **ไม่แสดงอะไรเลยเมื่อแอปเปิดอยู่หน้าจอ** —
ซึ่งคือสภาพของไรเดอร์ที่กำลังนั่งรองานพอดี. เด้งตอนแอปอยู่เบื้องหลัง ไม่เด้งตอนเปิดค้าง
จึงดูเหมือน "บางที" ทั้งที่จริงๆ แล้วมันแน่นอน

| # | สิ่งที่พบ | มั่นใจ | ผลที่ไรเดอร์เจอ |
|---|---|---|---|
| A | foreground = เงียบสนิท สำหรับ push ทุกใบจากฝั่ง rider-app | **สูง (อ่านโค้ด SDK ยืนยัน)** | เปิดแอปรออยู่ = ไม่เด้ง |
| B | Service Worker + token ผูกกับ permission ที่ขอแบบอัตโนมัติ ไม่มีปุ่ม ไม่มีจอสถานะ | **สูง** | ปฏิเสธ/พลาดครั้งเดียว = ไม่มี push ถาวร ไม่มีทางซ่อม |
| C | broadcast ส่งเฉพาะคนที่ `riders/{id}/status` เป็น `Online`/`Busy` | **สูง (มีข้อมูล production)** | ไม่ได้กด "รับงาน" = ไม่ได้ push งาน broadcast เลย |
| D | push จาก bkk-system เด้ง **สองใบ** ใบที่สองเป็น "BKK Rider" เนื้อว่าง | **สูง (11 จุด)** | รก และสอนให้ไรเดอร์เลิกอ่าน |
| E | token ต่ออายุได้เฉพาะตอนเปิดแอป | สูง | งานนานๆ ที = token ตายระหว่างรอ |
| F | session หลุดแต่ `rider_id` ยังอยู่ → เขียน token ไม่ผ่าน rules เงียบๆ | สูง | ดูเหมือนล็อกอินอยู่ แต่ token ไม่ถูกต่ออายุ |
| G | `await navigator.serviceWorker.ready` ไม่มีเพดานเวลา | กลาง | แขวนเงียบ = ไม่มี token ไม่มี error |
| H | ไม่มีใครมองเห็นสถานะ token ของไรเดอร์เลย (ไม่มีจอ ไม่มี probe) | **สูง** | รู้ว่าพังก็ต่อเมื่อไรเดอร์บ่น |
| I | สวิตช์ `rider_push` ครอบแค่ฝั่ง bkk-system | สูง | ปิดสวิตช์แล้วยังเด้งครึ่งหนึ่ง |

---

## 1. แผนที่: ใครส่ง ส่งรูปไหน ใครแสดง

**มีผู้ส่งสองราย และส่งคนละรูป** — นี่คือรากของทั้งข้อ A และ D

| ผู้ส่ง | รูปข้อความ | ตัวอย่าง |
|---|---|---|
| `bkk-rider-app/functions/src/index.ts:49-70` (`sendToRider`) | **data-only** — `data: {...data, title, body}` ไม่มี `notification` | งานใหม่, broadcast, แชท |
| `bkk-system/functions/index.js:3675` (`pushToRider`) | **`notification: {title, body}`** + `data` ที่ไม่มี title/body | เลื่อนนัด, ถอนงาน, ย้ายหมุด, amendment, pin dispute, เบิกค่าใช้จ่าย (11 จุด) |

ฝั่งรับมีสองทาง:

* **เบื้องหลัง** → `public/firebase-messaging-sw.js:141-155` `onBackgroundMessage` อ่าน `data.title`/`data.body`
* **เบื้องหน้า** → `src/hooks/usePushNotifications.ts:115-131` `onMessage` แสดงก็ต่อเมื่อ `payload.notification` มี

กติกาของ SDK (อ่านจากซอร์สที่ติดตั้งจริง `node_modules/@firebase/messaging/dist/index.sw.cjs:1066-1088`,
`@firebase/messaging@0.12.12` / `firebase@10.14.1`):

```
ถ้ามี client ที่ visible อยู่  → ส่งต่อเข้าหน้าเว็บ แล้ว return (SW ไม่แสดงอะไรเลย)
ไม่งั้น: ถ้ามี payload.notification → SDK เรียก showNotification ให้เอง
        แล้ว **ยังเรียก** onBackgroundMessage ต่ออีก
```

ตารางผลลัพธ์จริงจึงเป็นแบบนี้:

| | แอปเปิดอยู่ (visible) | แอปอยู่เบื้องหลัง |
|---|---|---|
| **data-only (rider-app: งาน/broadcast/แชท)** | **ไม่แสดงอะไรเลย** ← ข้อ A | เด้ง 1 ใบ ถูกต้อง |
| **notification (bkk-system: 11 จุด)** | `new Notification()` ซึ่ง **iOS ไม่รองรับ** | เด้ง **2 ใบ** ← ข้อ D |

---

## 2. รายละเอียดทีละข้อ

### A. เปิดแอปรออยู่ = ไม่เด้ง (ตัวหลัก)

`usePushNotifications.ts:115-131`

```ts
onMessage(messaging, (payload) => {
  const data = payload.data;
  if (payload.notification) {        // ← data-only ตกตรงนี้ทุกใบ
    const notification = new Notification(...)
  }
});
```

ข้อความจาก rider-app functions ไม่มี `payload.notification` โดยตั้งใจ (คอมเมนต์ที่
`functions/src/index.ts:46-48` อธิบายว่าเอาออกเพื่อกัน iOS เด้งซ้ำ) **แต่ตอนเอาออกไม่ได้แก้ฝั่ง
foreground ให้อ่าน `data` แทน** — ทางเดินเบื้องหน้าจึงเหลือกิ่งเดียวที่ไม่มีวันเข้า

และต่อให้แก้เงื่อนไขนั้น `new Notification()` ก็ยังใช้บน iOS ไม่ได้ — WebKit ให้แสดงผ่าน
`ServiceWorkerRegistration.showNotification()` เท่านั้น *(ข้อนี้เป็นข้อจำกัดที่รู้กันของ WebKit
ยังไม่ได้ยืนยันบนเครื่องจริงใน session นี้ — ดูวิธีเช็คในข้อ 4)*

**ทำไมมันอธิบายคำว่า "บางที" ได้ดีที่สุด:** ไรเดอร์ที่รองานมักเปิดแอปค้างไว้ พอเปิดค้าง =
เงียบ พอปิดหน้าจอ = เด้ง ผลจึงสลับไปมาตามพฤติกรรมของตัวเอง ไม่ใช่ตามระบบ

### B. ไม่มี Service Worker ถ้าไม่ได้ permission และไม่มีทางซ่อม

`usePushNotifications.ts:84-95` — **การ register SW ทั้งแอปมีที่เดียว และอยู่ใต้ permission**

```ts
const permission = await Notification.requestPermission();
if (permission !== 'granted') return;          // ← ออกก่อนถึง register
swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
```

ยืนยันด้วย `git grep serviceWorker -- src index.html` → ไม่มีจุด register อื่นเลย

ผลที่ตามมาสามชั้น:
1. ไม่ได้ permission = ไม่มี SW = **ไม่มีทั้ง push เบื้องหลังและแคชออฟไลน์**
2. `Notification.requestPermission()` ถูกเรียกอัตโนมัติตอน mount — บน iOS ต้องมาจากการ
   **แตะของผู้ใช้** ไม่งั้นถูกปฏิเสธ. แอปแอดมิน (`bkk-system`) เจอเรื่องนี้มาแล้วและเขียน
   กันไว้ที่ `src/hooks/useAdminPushNotifications.ts:58-63` ว่า *"Re-calling requestPermission()
   on every mount re-asks on iOS and is fragile"* — **แอปไรเดอร์ไม่มีการกันแบบนั้น**
3. **ไม่มีปุ่ม "เปิดการแจ้งเตือน" และไม่มีจอบอกสถานะ** (`git grep requestPermission -- src`
   เจอที่เดียวคือบรรทัด 86) ไรเดอร์ที่พลาดครั้งเดียวจึงไม่มีทางกลับมาเปิดเองได้ในแอป
   เทียบกับแอดมินที่มี `NotificationStatusCard` + `refreshAdminPushToken` ให้กดซ่อม

**เกี่ยวกับตอนนี้โดยตรง:** การลบแอปแล้วติดตั้งใหม่ = permission ถูกรีเซ็ต ต้องขอใหม่ทั้งหมด

### C. broadcast กรองด้วยฟิลด์ที่มีสองความหมาย

`functions/src/index.ts:391` (ใน `onBroadcastJob`)

```ts
if (riderData.status !== "Online" && riderData.status !== "Busy") return;
```

`riders/{id}/status` ถูกเขียนที่เดียวคือ `src/hooks/useRiderData.ts:147` และเขียนก็ต่อเมื่อ
**ไรเดอร์กดสวิตช์ "รับงาน" แล้ว GPS ยิงพิกัดกลับมา** ส่วน `isOnline` เริ่มที่ `false` ทุกครั้ง
ที่เปิดแอป (`useRiderData.ts:60`) และไม่มี `onDisconnect` มาคืนค่าให้

ฟิลด์เดียวกันนี้ยังถือ**ค่าสถานะการอนุมัติ**ของไรเดอร์ที่ยังไม่เคยถูก presence เขียนทับ —
ข้อมูล production ที่วัดไว้เมื่อเช้านี้ (ก่อน #145) คือ `status: Busy 1 / Active 1` แปลว่า
**ไรเดอร์หนึ่งในสองคนถูกกรองออกจาก broadcast ทุกใบ ณ ตอนนี้**

*ยังพิสูจน์จากที่นี่ไม่ได้:* `settings/system/dispatch_mode` ปัจจุบันเป็น `manual` หรือ
`broadcast` — ถ้าเป็น manual ข้อนี้ยังไม่กัด (ทางจ่ายงานคือ `onJobStatusChanged` ซึ่งไม่ดู
`status`) แต่เป็นระเบิดเวลาสำหรับวันที่สลับโหมด

### D. push จาก bkk-system เด้งสองใบ ใบที่สองว่างเปล่า

ทั้ง 11 จุดของ `pushToRider` ส่ง `notification: {title, body}` โดยที่ `data` ไม่มี `title`/`body`
(นับด้วย `grep -A10 "pushToRider(" functions/*.js | grep -c "notification: {"` → 11)

ตามกติกาของ SDK ในข้อ 1: SDK แสดงใบที่ถูกต้องให้เอง **แล้วยังเรียก** `onBackgroundMessage` ต่อ
ซึ่งอ่าน `data.title`/`data.body` ไม่เจอ → `showNotification('BKK Rider', {body: ''})`
(`firebase-messaging-sw.js:145-154`) และ `tag` คนละตัว จึงไม่ยุบรวมกัน

### E. token ต่ออายุได้เฉพาะตอนเปิดแอป

`usePushNotifications.ts:104-113` — `fetchAndSaveToken` ถูกเรียกตอน setup, ทุก 12 ชม.
**ขณะแอปเปิดอยู่**, และตอน `visibilitychange` เป็น visible เท่านั้น

ฝั่ง server ตัด token ที่ FCM ปฏิเสธทิ้งทันที (`functions/src/index.ts:85-98` และ
`bkk-system/functions/index.js:3714-3725`) โดยไม่มีที่ไหนบันทึกว่าเคยตัดไป

รูปธุรกิจนี้ทำให้มันแย่กว่าปกติ: งานนานๆ ที → ไรเดอร์ไม่มีเหตุให้เปิดแอป → token ไม่ถูกต่ออายุ
→ ตาย → ถูกตัด → ไม่มี push → ไม่มีเหตุให้เปิดแอป **วนแบบนี้ไปเรื่อยๆ โดยไม่มีสัญญาณ**
(#144 ตัดลูปครึ่งหนึ่งไปแล้วโดยเลิกเตะออก — แต่ส่วนที่เหลือยังอยู่)

### F. session หลุดแต่ยังถือ `rider_id`

หลัง #141/#144 สภาพ "session หมดอายุแต่ยังจำเครื่องได้" เป็นสภาพปกติที่ตั้งใจให้เกิด
`usePushNotifications` ขึ้นต้นด้วย `if (!riderId) return;` เท่านั้น (บรรทัด 29) จึงยังทำงานต่อ
แต่ `set(ref(db, 'riders/{id}/fcm_tokens/{deviceId}'))` ต้องใช้ `auth.uid === $uid`
(`bkk-frontend-next/database.rules.json` → `riders/$uid/.write`) → PERMISSION_DENIED
→ ถูกกลืนที่ `catch` บรรทัด 79-81 เหลือแค่ `console.warn`

**#146 (`feat/rider-auth-errors-visible`) ทำให้สภาพนี้มองเห็นได้ จึงเกี่ยวกับเรื่อง push โดยตรง**

### G. `serviceWorker.ready` ไม่มีเพดานเวลา

`usePushNotifications.ts:94` — `await navigator.serviceWorker.ready` แขวนได้ไม่จำกัดถ้ามี
registration ค้างสภาพแปลกๆ (ตระกูลเดียวกับบั๊ก IndexedDB ที่ #141 แก้: ไม่ error ไม่ resolve
แค่ไม่ไปไหนต่อ) ผลคือไม่ถึง `getToken` เลย และไม่มีอะไรบอก

### H. ไม่มีใครมองเห็นสถานะ token ของไรเดอร์

`grep -rn "fcm_tokens\|fcm_updated_at" bkk-system/src/` → เจอเฉพาะของ **แอดมิน**
(`admin_fcm_tokens`) ไม่มีจอไหนอ่านของไรเดอร์ และ `functions/health-check.js` ไม่มี probe
เกี่ยวกับไรเดอร์เลย

แปลว่าคำถาม "ตอนนี้ไรเดอร์คนนี้มี token ใช้ได้อยู่ไหม" **ยังไม่มีใครตอบได้** — ทั้งที่
`riders/{id}/fcm_updated_at` ถูกเขียนไว้อยู่แล้วที่ `usePushNotifications.ts:59`

### I. สวิตช์ `rider_push` ครอบแค่ครึ่งเดียว

`bkk-system/functions/index.js:3677` เรียก `shouldNotify(..., "rider_push", message)` ก่อนส่ง
แต่ `bkk-rider-app/functions/src/index.ts` **ไม่เรียก gate ใดๆ เลย** — ปิดสวิตช์ที่
`/notification-settings` แล้ว งานใหม่/broadcast/แชท ยังเด้งตามปกติ
(fail-open ทั้งระบบ จึงไม่ทำให้ "ไม่เด้ง" เว้นแต่มีคนตั้ง `false` ไว้จริง — ควรเช็คค่าปัจจุบัน)

---

## 3. ตรวจแล้วว่า **ไม่ใช่** สาเหตุ (บันทึกไว้กันไล่ซ้ำ)

* **VAPID / การ patch `atob`** — แอดมินต้อง patch `window.atob` (`bkk-system/src/utils/adminPush.ts:28-43`)
  แต่ **แอปไรเดอร์ไม่ต้องและไม่ควรลอกมา**: SDK ที่ติดตั้งอยู่เติม padding และแปลง base64url
  ให้เองแล้วที่ `node_modules/@firebase/messaging/dist/index.cjs.js:84-95`
* **แชทเด้งซ้ำจากสองรีโป** — `bkk-system/functions/index.js:2400` มี `if (sender !== "rider") return;`
  ตัวมันจึงส่งให้แอดมินเท่านั้น ไม่ทับกับ `onNewJobChatMessage` ของฝั่งไรเดอร์
* **`onNewChatMessage` กับ `onNewJobChatMessage` ยิงซ้อนกัน** — คนละ path (`jobs/{id}/chats`
  กับ `job_chats/{id}`) ไม่ซ้ำ
* **gate ของ notification-settings ทำให้เงียบ** — fail-open ทุกทาง (`functions/notification-settings.js:14-16`)
  มีแต่ `false` ที่แอดมินเขียนเองเท่านั้นที่ปิด
* **การจ่ายงานแบบ manual ไม่ยิง push** — `DispatcherPage.handleAssignJob` ส่ง
  `JOB_EVENT.RIDER_ASSIGNED` ซึ่งลงสถานะ `Rider Assigned` ตรงกับ case ที่
  `functions/src/index.ts:181-183` รับอยู่
* **สิทธิ์เขียน token ของไรเดอร์เอง** — rule ที่ `riders/$uid` อนุญาต และ `.validate` ของ
  `approval_status`/`employment`/`vehicle_type`/`score` ไม่ขวางการเขียน `fcm_tokens`

---

## 4. สิ่งที่พิสูจน์จาก container นี้ไม่ได้ + วิธีเช็ค

| ต้องรู้ | วิธีเช็ค |
|---|---|
| `settings/system/dispatch_mode` ปัจจุบัน | หน้า Dispatcher ของแอดมิน (ปุ่มสลับโหมด) หรืออ่าน RTDB |
| `settings/notifications/channels/rider_push` | หน้า `/notification-settings` |
| SW ที่ deploy อยู่แทนค่า placeholder ครบไหม | `curl -s https://bkk-rider-app.web.app/firebase-messaging-sw.js \| grep -c __FIREBASE` → ต้องได้ `0` (proxy ของ container นี้ตอบ 403 จึงเช็คจากที่นี่ไม่ได้) |
| `new Notification()` บน iOS PWA | เปิดแอปค้างไว้ แล้วให้แอดมินส่งแชท — ถ้าเงียบสนิทคือยืนยันข้อ A |
| token ของไรเดอร์แต่ละคนยังสดไหม | อ่าน `riders/{id}/fcm_updated_at` เทียบกับตอนนี้ |

---

## 5. ถ้าจะแก้ ควรเรียงแบบนี้ (ยังไม่ได้ทำ — รอเคาะ)

1. **A** — ให้ `onMessage` อ่าน `data.title`/`data.body` และแสดงผ่าน
   `registration.showNotification()` แทน `new Notification()` *(เล็ก แก้ที่เดียว
   ได้ผลกับ push ทุกใบที่ไรเดอร์รอ)*
2. **B** — ย้ายการ register SW ออกมาก่อน permission + เพิ่มปุ่ม/การ์ดสถานะการแจ้งเตือน
   แบบเดียวกับที่แอดมินมี *(กลาง แต่เป็นตัวเดียวที่ทำให้ "ซ่อมเองได้")*
3. **D** — ให้ `pushToRider` ใส่ `title`/`body` ลง `data` ด้วย แล้วค่อยตัด `notification` ทิ้ง
   ทีละก้าว *(แตะ bkk-system 11 จุด ควรเป็น PR ของตัวเอง)*
4. **C** — เลิกให้ broadcast ตัดสินด้วยฟิลด์ที่มีสองความหมาย (ต่อยอดจาก #145)
5. **H** — โชว์ `fcm_updated_at` ในหน้าจัดการไรเดอร์ ให้มีใครสักคนเห็นก่อนไรเดอร์บ่น

**ข้อ A กับ D อยู่คนละรีโปและแก้ได้อิสระจากกัน** — ทำ A ก่อนได้เลย ไม่ต้องรอ D
