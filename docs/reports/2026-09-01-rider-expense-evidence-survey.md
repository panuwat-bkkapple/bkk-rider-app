# Survey: "ส่วนแนบหลักฐาน" สำหรับระบบเบิกค่าใช้จ่ายไรเดอร์ (1 ก.ย. 2569)

> **ขอบเขต:** เฉพาะการ **ถ่าย / อัปโหลด / เก็บ / เปิดดูรูป** เท่านั้น
> ไม่แตะ approval flow, สถานะการเบิก, การจ่ายเงิน, status model
> (ของที่เจอระหว่างทางแต่อยู่นอกขอบเขต รวมไว้บรรทัดเดียวท้ายไฟล์)
>
> **รายงานนี้เป็น survey ล้วน ไม่มีการแก้โค้ด**
>
> line number อิง HEAD ณ วันสำรวจ:
> `bkk-rider-app @ b9eabb2` · `bkk-system @ 19f1b9f` · `bkk-frontend-next @ f273005`
> (อ่าน bkk-frontend-next เพราะ `storage.rules` + `database.rules.json` เป็น canonical source อยู่ที่นั่น)

---

## 1. จุดที่ไรเดอร์อัปโหลดรูปได้ในวันนี้ (bkk-rider-app)

**มีทั้งหมด 9 จุด และทุกจุดวิ่งผ่านฟังก์ชันเดียวกันตัวเดียว** — `uploadImageToFirebase()`
ที่ `src/utils/uploadImage.ts:36` ไม่มี call site ไหนเรียก `uploadBytes` ตรงเลยสักตัว
(ยืนยันด้วย `grep uploadBytes src/` → เจอที่เดียวคือ `src/utils/uploadImage.ts:61`)

| # | จุดใช้งาน | Route ที่เข้าถึง | Component (file:line ของการอัปโหลด) | เวลาที่อัป |
|---|---|---|---|---|
| 1 | **KYC — บัตร ปชช. / บัตรคู่เครื่อง / ลูกค้าถือบัตร** | `/` → `RiderApp` (`src/App.tsx:146`) เปิด modal จาก `src/pages/RiderApp.tsx:443-446` | `src/components/kyc/KYCModal.tsx:92` | ทันทีที่เลือกรูป |
| 2 | **KYC — ลายเซ็นลูกค้า (fallback ไม่มีบัตร)** | เดียวกับ #1 | `src/components/kyc/KYCModal.tsx:364` (จาก `SignaturePad` `:370`) | ทันทีที่กดยืนยันลายเซ็น |
| 3 | **รูปสภาพเครื่อง (6 ด้าน + รอยตำหนิ)** | `/` → `InspectionModal` | ถือไฟล์ไว้ในหน่วยความจำที่ `src/components/inspection/InspectionModal.tsx:228-248` แล้วอัปตอน submit ที่ `src/pages/RiderApp.tsx:152` | **ตอน submit ผลตรวจ** |
| 4 | **รูปหน้าจอ Find My (OCR)** | เดียวกับ #3 | `src/components/inspection/InspectionModal.tsx:212` | ทันที |
| 5 | **รูปหน้าจอ Battery (OCR)** | เดียวกับ #3 | `src/components/inspection/BatteryCheck.tsx:32` | ทันที |
| 6 | **รูปหน้าจอ About/Serial (SickW)** | เดียวกับ #3 | `src/components/inspection/SickwDeviceCheck.tsx:130` | ทันที |
| 7 | **รูปประกอบคำขอแก้ไขงาน (amendment)** | `/` → `RequestAmendmentModal` | `src/components/amendments/RequestAmendmentModal.tsx:232` (หลายไฟล์พร้อมกันผ่าน `Promise.all`) | ทันที |
| 8 | **ลายเซ็นลูกค้ายืนยัน amendment** | `/` → `CustomerConsentModal` | `src/components/amendments/CustomerConsentModal.tsx:63` | ตอนกดส่ง |
| 9 | **รูปแนบในแชท** | `/` → `ChatModal` | `src/components/chat/ChatModal.tsx:71` | ทันที |
| 10 | **รูปแจ้งข้อมูลไม่ตรง (discrepancy)** | `/` → hook | `src/hooks/useJobActions.ts:425` | ตอนกดส่ง |
| 11 | **รูปโปรไฟล์ไรเดอร์** | `/` → `ProfileTab` | `src/pages/RiderApp.tsx:259` | ทันที |
| 12 | **เอกสารสมัครงาน (บัตร ปชช./เซลฟี่/ใบขับขี่)** | `/register` (`src/App.tsx:139`) | `src/pages/Register.tsx:82-84` | ตอนกดสมัคร |

**ไม่มีจุดไหนที่เป็นเรื่องค่าใช้จ่าย/สลิปของไรเดอร์เลย** — `grep -i "expense|reimburse|ค่าทางด่วน|ค่าจอด|สำรองจ่าย"`
ทั่ว `src/`, `functions/`, `docs/` ของ bkk-rider-app ได้ 0 ผลลัพธ์ (ยืนยันแล้ว)
โฟลเดอร์ `src/components/wallet/` มีแค่ `WalletTab.tsx` กับ `WithdrawModal.tsx`

### hook/utility ที่ใช้จริง — มีตัวเดียว

```ts
// src/utils/uploadImage.ts:36-67
export const uploadImageToFirebase = async (file, path, options?) => {
  const validationError = validateImageFile(file);          // :43
  if (validationError) throw new Error(validationError);
  const compressedFile = await imageCompression(file, compressionOptions); // :47
  ... fileName = opaque UUID หรือ `${Date.now()}_${file.name}`             // :49-58
  const snapshot = await uploadBytes(storageRef, compressedFile);          // :61
  return await getDownloadURL(snapshot.ref);                              // :62
};
```

- **ไม่มี hook** — เป็นฟังก์ชัน async ธรรมดา ทุก component จัดการ state `uploading` ของตัวเอง
  (เช่น `uploadingSlot` ที่ `KYCModal.tsx:78`, `fmUploading` ที่ `InspectionModal.tsx:210`)
- **`options.opaqueFilename`** (`:33`) = สุ่มชื่อไฟล์เป็น UUID แทน `timestamp_ชื่อเดิม`
  ใช้กับ KYC / amendment / verification / profile — **ไม่ใช้** กับ chat, discrepancy, inspection, register
- `path` เป็นสตริงอิสระ ไม่มี validation ว่าต้องอยู่ใต้ prefix ไหน — **ผู้เรียกกำหนดเองทั้งหมด**

---

## 2. รูปไปเก็บที่ไหน + storage rules คุมอะไร

### 2.1 ตาราง path ที่ไรเดอร์เขียนจริง

| ประเภท | Storage path | ชื่อไฟล์ | ที่มา |
|---|---|---|---|
| KYC ทุกรูป + ลายเซ็น | `jobs/{jobId}/kyc/{uuid}.{ext}` | opaque | `KYCModal.tsx:92`, `:364` |
| รูปสภาพเครื่อง | `jobs/{jobId}/inspection/device_{i}/{ts}_{ชื่อเดิม}` | **ไม่ opaque** | `RiderApp.tsx:152` |
| Find My / Battery / SickW screenshot | `jobs/{jobId}/verification/{uuid}.{ext}` | opaque | `InspectionModal.tsx:212`, `BatteryCheck.tsx:32`, `SickwDeviceCheck.tsx:130` |
| amendment + ลายเซ็น consent | `jobs/{jobId}/amendments/{uuid}.{ext}` | opaque | `RequestAmendmentModal.tsx:232`, `CustomerConsentModal.tsx:63` |
| รูปแชท | `jobs/{jobId}/chats/images/{ts}_{ชื่อเดิม}` | **ไม่ opaque** | `ChatModal.tsx:71` |
| discrepancy | `jobs/{jobId}/discrepancy/{ts}_{ชื่อเดิม}` | **ไม่ opaque** | `useJobActions.ts:425` |
| โปรไฟล์ไรเดอร์ | `riders/{riderId}/profile/{uuid}.{ext}` | opaque | `RiderApp.tsx:259` |
| เอกสารสมัคร | `riders_docs/{uid}/idCard|selfie|license/{ts}_{ชื่อเดิม}` | **ไม่ opaque** | `Register.tsx:82-84` |

**สรุปรูปแบบ path: `{โดเมน}/{คีย์}/{ชนิดหลักฐาน}/{ชื่อไฟล์}`** — โดเมนมี 3 ตัวเท่านั้นวันนี้
คือ `jobs/`, `riders/`, `riders_docs/` และการแยกชนิดหลักฐานทำที่ **segment ที่ 3**
ซึ่งตรงกับ 1 rule block ต่อ 1 ชนิดใน `storage.rules`

`riderId` ในการ์ดที่ 7 **คือ Firebase Auth uid** — `Login.tsx:115-126` เก็บ `userCred.user.uid`
ลง `localStorage('rider_id')` แล้วส่งเป็น `riderId` เข้า `App.tsx:115`; `Register.tsx:80-86` ใช้ uid
ตัวเดียวกันเป็นคีย์ของ `riders/{uid}` (ข้อนี้สำคัญกับข้อ 6)

### 2.2 Storage rules — ยกโค้ดที่เกี่ยวมาตรงๆ

**ไฟล์: `bkk-frontend-next/storage.rules`** (canonical source ตาม comment `:5-10` —
bkk-system ไม่มีไฟล์นี้แล้ว, deploy ด้วย `firebase deploy --only storage` จาก repo นั้น)

Allowlist ชนิดไฟล์ที่ใช้ร่วมกัน:

```
// bkk-frontend-next/storage.rules:69-72
function isImage() {
  return request.resource.contentType
    .matches('^image/(jpeg|png|webp|heic|heif)$');
}
```

KYC — **write-once, ลบได้เฉพาะแอดมิน, filename เป็น segment เดียว**:

```
// bkk-frontend-next/storage.rules:142-154
match /jobs/{jobId}/kyc/{filename} {
  allow read: if request.auth != null;
  allow create: if request.auth != null && resource == null
    && request.resource.size < 25 * 1024 * 1024
    && isImage();
  allow update: if false;
  allow delete: if request.auth != null
    && firestore.get(/databases/(default)/documents/admins/$(request.auth.uid)).data.role == 'admin';
}
```

ชนิดอื่นๆ ที่ไรเดอร์เขียน — **หลวมกว่า KYC: `allow write` ก้อนเดียว ไม่มี write-once ไม่มี delete rule**:

```
// bkk-frontend-next/storage.rules:159-164 (inspection)
match /jobs/{jobId}/inspection/{filename=**} {
  allow read: if request.auth != null;
  allow write: if request.auth != null
    && request.resource.size < 25 * 1024 * 1024
    && isImage();
}
// :213-218 discrepancy — รูปเดียวกันเป๊ะ
// :225-230 amendments — รูปเดียวกันเป๊ะ
// :235-240 verification — รูปเดียวกันเป๊ะ
// :178-183 chats — เหมือนกันแต่เพดาน 10 MB
```

โฟลเดอร์ของไรเดอร์เอง — **self-write only (`auth.uid == riderId`)**:

```
// bkk-frontend-next/storage.rules:310-315
match /riders/{riderId}/{filename=**} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && request.auth.uid == riderId
    && request.resource.size < 25 * 1024 * 1024
    && isImage();
}

// :332-337
match /riders_docs/{riderId}/{filename=**} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && request.auth.uid == riderId
    && request.resource.size < 25 * 1024 * 1024
    && isImage();
}
```

สลิปโอนเงินของแอดมิน (ตัวที่ใกล้กับ "สลิป" ที่สุดวันนี้) — **ไม่มีเพดานขนาดและไม่มี type check**:

```
// bkk-frontend-next/storage.rules:247-250
match /slips/{allPaths=**} {
  allow read: if request.auth != null;
  allow write: if request.auth != null;
}
```

**Catch-all ปิดสนิท — path ใหม่ที่ไม่มี rule = อัปไม่ขึ้น (`storage/unauthorized`) ทันที:**

```
// bkk-frontend-next/storage.rules:356-358
match /{allPaths=**} {
  allow read, write: if false;
}
```

### 2.3 สิ่งที่ rules **ไม่ได้** คุม (สำคัญต่อการออกแบบ)

- **ไม่มีการเช็ค role/ownership บน path `jobs/**` เลย** — comment `:14-15` และ `:224` บอกตรงๆ ว่า
  "Application-layer authorisation ... lives at the RTDB validate rules" เพราะ Storage rules
  query RTDB ไม่ได้ แปลว่า **auth user คนไหนก็เขียน `jobs/{อะไรก็ได้}/inspection/` ได้**
- `read: if request.auth != null` และ comment `:46-61` ระบุชัดว่า เพราะเว็บลูกค้าใช้ anonymous auth
  สิทธิ์นี้จึงมีค่าเท่ากับ "ใครก็ตามที่เดา path ถูก" — ตัวป้องกันจริงคือ **opaque filename**
  (ทดสอบกับ production แล้วตาม comment: anonymous token ดึงรูป inspection ได้ 200, ไม่มี auth = 403,
  list โฟลเดอร์ = 403 ทุกกรณี)
- **rider app ไม่ได้ส่ง `contentType` ตอน `uploadBytes`** (`src/utils/uploadImage.ts:61` เรียกแบบ 2 argument)
  ต่างจาก bkk-system ที่ส่งชัดเจนพร้อม comment อธิบายว่าทำไม
  (`bkk-system/src/utils/uploadImage.ts:73-76`: Blob บาง picker มี `type` ว่าง → Firebase ติดป้าย
  `application/octet-stream` → `isImage()` ปฏิเสธ) — **นี่คือความเสี่ยงที่มีอยู่แล้ววันนี้ ไม่ใช่ของใหม่**

---

## 3. resize / บีบอัด ก่อนอัป

**มี — บังคับทุกไฟล์ ไม่มีทางข้าม** เพราะ `imageCompression()` ถูกเรียกก่อน `uploadBytes` เสมอ
ใน `uploadImageToFirebase` ซึ่งเป็นทางเดียวที่แอปนี้อัปรูป

```ts
// src/utils/uploadImage.ts:6-10
const compressionOptions = {
  maxSizeMB: 0.8,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
};
```

| พารามิเตอร์ | ค่า | หมายเหตุ |
|---|---|---|
| `maxSizeMB` | **0.8** | เพดานขนาดผลลัพธ์ |
| `maxWidthOrHeight` | **1920 px** | ด้านยาวสุด |
| `useWebWorker` | `true` | บีบใน worker ไม่บล็อก UI |
| `fileType` | **ไม่ตั้ง** | ต่างจาก bkk-system ที่บังคับ `image/jpeg` (`bkk-system/src/utils/uploadImage.ts:38-42`) |
| ค่าเดียวทั้งแอป | ใช่ | **ไม่มี option ให้ผู้เรียกปรับ** — ต่างจาก bkk-system ที่รับ `maxWidthOrHeight`/`maxSizeMB` ต่อ call site (`bkk-system/src/utils/uploadImage.ts:6-17`) |

Validation ก่อนบีบ:

```ts
// src/utils/uploadImage.ts:12-23
const MAX_FILE_SIZE_MB = 20;
const ALLOWED_TYPES = ['image/jpeg','image/png','image/webp','image/heic','image/heif'];
// ปฏิเสธถ้า type ไม่อยู่ในลิสต์ และนามสกุลก็ไม่ตรง regex
// ปฏิเสธถ้า file.size > 20 MB
```

การถ่าย: input ที่ตั้ง `capture="environment"` (เปิดกล้องหลังตรง) มี 5 จุด —
`InspectionModal.tsx:682,777,799`, `BatteryCheck.tsx:138`, `SickwDeviceCheck.tsx:199-201`,
`RequestAmendmentModal.tsx:581-583`
**KYC ไม่ตั้ง `capture`** (`KYCModal.tsx:567-572`) — ปุ่มเขียนว่า "ถ่ายภาพหรือเลือกจากอัลบั้ม" (`:562`)
ซึ่งเป็นพฤติกรรมที่สลิปค่าใช้จ่ายต้องการพอดี (สลิปทางด่วนอาจเป็น screenshot ในอัลบั้ม ไม่ใช่การถ่ายสด)

หมายเหตุจาก `storage.rules:17-33`: วัดจริง 80 รูป inspection บน production ได้
min 0.25 / p50 0.64 / p90 0.74 / **max 0.80 MB** — คือ compression ทำงานครบทุกใบ
เพดาน 25 MB ใน rules เป็นตาข่ายเผื่อกรณี compression ล้ม (HEIC ที่เบราว์เซอร์ decode ไม่ได้ /
worker ถูกฆ่าตอนสลับแอป) ไม่ใช่ขนาดที่คาดหวัง

---

## 4. เน็ตหลุดระหว่างอัปโหลด — เกิดอะไรขึ้น

### สรุปตรงๆ: **ไม่มี retry ระดับแอป ไม่มี queue ไม่มี offline persistence ของรูป — งานที่ค้างจะหายไปเฉยๆ**

หลักฐาน:

- `grep -i "retry|backoff|resumable|queue"` ทั่ว `src/` → เจอแค่ `ProductTour.tsx:152,174-175,193`
  (retry การจัดตำแหน่ง tooltip) กับ `usePushNotifications.ts:76-77` (retry FCM token) —
  **ไม่มีอะไรเกี่ยวกับ upload เลย**
- ใช้ `uploadBytes` ไม่ใช่ `uploadBytesResumable` (`src/utils/uploadImage.ts:2,61`) →
  ไม่มี progress event, resume ไม่ได้, ยกเลิกไม่ได้
- `grep "setMaxUploadRetryTime|maxUploadRetryTime|maxOperationRetryTime"` ทั้ง 3 repo → **0 ผลลัพธ์**
  (SDK ของ Firebase มี retry ภายในตัวมันเอง แต่ **repo นี้ไม่ได้ตั้งค่าใดๆ และผมไม่ได้ verify
  พฤติกรรมภายใน SDK จาก source เพราะ `node_modules` ไม่ได้ติดตั้งใน container นี้** —
  ที่ยืนยันได้คือ "ไม่มีโค้ดของเราตัวไหนทำ retry")
- Service worker ทำแค่ **cache ของ GET เท่านั้น** — `public/firebase-messaging-sw.js:48-50`
  `if (event.request.method !== 'GET') return;` แปลว่า POST/PUT ของ Storage ไม่ถูกแตะเลย
  และ **ไม่มี `sync` / Background Sync listener** ในไฟล์นี้ (มีแค่ `install` `:19`, `activate` `:39`,
  `fetch` `:48`) → ไม่มีทางส่งซ้ำเมื่อเน็ตกลับมา
- `CACHE_NAME = 'bkk-rider-v3'` (`:12`) แคชแค่ `/`, `/manifest.json`, ไอคอน (`:13-17`) —
  cache-first เฉพาะ `script/style/image/font` (`:58`) network-first สำหรับ document (`:55-57`)
- ไม่มีการเปิด offline persistence ใดๆ ตอน init (`src/api/firebase.ts:18-23`)
  — RTDB web SDK มี in-memory queue ของตัวเองสำหรับ `set/update` แต่ **Storage ไม่มี**
  และไม่มีโค้ดของเราที่ persist ไฟล์รอไว้

### สิ่งที่ผู้ใช้เห็นจริงเมื่อล้ม (แยกตามจุด — พฤติกรรมไม่เหมือนกัน)

| จุด | โค้ด | ผลเมื่ออัปล้ม |
|---|---|---|
| KYC รูป | `KYCModal.tsx:101-105` | toast `'อัปโหลดรูปไม่สำเร็จ: ...'` ช่องนั้นว่างเหมือนเดิม **กดใหม่ได้** (ไฟล์ยังอยู่ในอัลบั้ม) |
| KYC ลายเซ็น | `KYCModal.tsx:365-370` | toast แล้ว `signatureUrl` ยังเป็น null — **แต่ลายเซ็นที่ลูกค้าเพิ่งเซ็นบน canvas หายไปจาก state ไม่ได้** (ยังอยู่ใน `SignaturePad`) กดยืนยันซ้ำได้ |
| amendment หลายรูป | `RequestAmendmentModal.tsx:230-243` | `Promise.all` → **ล้มใบเดียว ทิ้งทั้งชุด** (`setPhotos(p => p.slice(0, startIdx))` `:241`) รูปที่อัปสำเร็จไปแล้วกลายเป็น orphan ใน Storage |
| รูปสภาพเครื่อง | `RiderApp.tsx:151-153` | `Promise.all` เหมือนกัน และอยู่ **ก่อน** การเขียน RTDB → ล้ม = ทั้งฟอร์มผลตรวจไม่ถูกบันทึก แต่ **`File` ยังอยู่ใน state ของ modal** (`InspectionModal.tsx:356`) กด submit ใหม่ได้ตราบใดที่ไม่ปิดหน้า/รีเฟรช |
| profile / discrepancy / chat | `RiderApp.tsx:262-264`, `useJobActions.ts:425`, `ChatModal.tsx:71` | โยน error ขึ้นไปให้ caller แสดง toast |

**สิ่งเดียวที่มีวันนี้เกี่ยวกับ offline คือแบนเนอร์แจ้งสถานะ** —
`src/components/common/OfflineBanner.tsx:5-49` (mount ที่ `src/App.tsx:125`) ฟัง
`window online/offline` แล้วโชว์แถบแดง "ไม่มีการเชื่อมต่ออินเทอร์เน็ต กำลังใช้ข้อมูลแคช" (`:47`)
**มันไม่ได้บล็อกปุ่มอัปโหลดใดๆ** — ไรเดอร์ยังกดอัปได้ระหว่างออฟไลน์และจะได้ toast แดงเปล่าๆ

> **สำหรับงานเบิกค่าใช้จ่าย นี่คือช่องว่างที่ใหญ่ที่สุดในรายงานนี้** —
> เงื่อนไข "ไม่มีรูป = ส่งไม่ได้" บวกกับ "ไม่มี queue" แปลว่าไรเดอร์ที่อยู่ใต้ทางด่วน/ลานจอดใต้ดิน
> (ที่ซึ่งค่าทางด่วนกับค่าจอดรถเกิดขึ้นพอดี) จะส่งเบิกไม่ได้เลยจนกว่าจะออกมาหาสัญญาณ

---

## 5. หน้าที่แอดมินเปิดดูรูปที่ไรเดอร์อัปมา (bkk-system)

**มีครบทุกประเภทแล้ว แต่กระจายเป็นการ์ดเฉพาะกิจ ไม่มี viewer กลางตัวเดียว**

| รูปที่ดูได้ | หน้า / route | ไฟล์:บรรทัดที่ render |
|---|---|---|
| **KYC ทั้ง 4 ใบ** (บัตร, บัตร+เครื่อง, ลูกค้าถือบัตร, ลายเซ็น) | `/workspace/:id` (`src/App.tsx:135`) → `B2CWorkspacePage.tsx:518`; มือถือ `/mobile/job/:id` (`:122`) → `MobileTicketDetail.tsx:18` | `src/pages/admin/components/KYCInfoCard.tsx:439-446` (PhotoTile), lightbox `:494-516`, thumbnail `:547` |
| **รูปสภาพเครื่อง (inspection)** | `/workspace/:id` | `src/features/trade-in/components/b2c/B2CWorkspace.tsx:352-355` ("Inspection Gallery") |
| รูปสภาพเครื่อง (มือถือ) | `/mobile/job/:id` | `src/pages/mobile/MobileTicketDetail.tsx:1484` |
| รูปสภาพเครื่อง (ตอนตรวจซ้ำ) | QC | `src/pages/admin/components/ConditionVerification.tsx:58` |
| **รูป discrepancy จากไรเดอร์** | `/workspace/:id` | `src/features/trade-in/components/b2c/B2CWorkspace.tsx:394-397` |
| **รูปประกอบ amendment จากไรเดอร์** | `/workspace/:id` (`B2CWorkspacePage.tsx:516` → `AmendmentBanner.tsx:84`) และ `/mobile/job/:id` (`MobileTicketDetail.tsx:1404`) | `src/pages/admin/components/AmendmentReviewModal.tsx:312, 322-338` + lightbox |
| **รูปหน้าจอ Battery ที่ไรเดอร์ถ่าย** | ในหน้างาน | `src/components/device/BatteryHealthCard.tsx:36, 155-157, 205-207` (เปิดแท็บใหม่ ไม่ใช่ lightbox) |
| **รูปแชท** | Fleet chat | `src/components/Fleet/AdminChatBox.tsx:123-124` |
| **เอกสารสมัครของไรเดอร์** (บัตร/เซลฟี่/ใบขับขี่) | `/riders` (`src/App.tsx:153`) | `src/pages/fleet/RiderManagement.tsx:494-508` (`documents.idCard/selfie/license` map ที่ `:67-70`) |
| สลิปโอน (แอดมินเป็นคนอัปเอง ไม่ใช่ไรเดอร์) | Finance | อัปที่ `src/pages/finance/components/RiderWithdrawals.tsx:98` เขียน `withdrawals/{id}/payment_slip` `:107` |

รูปแบบที่ใช้ซ้ำได้ 2 แบบ:
1. **`PhotoTile` + lightbox ของ `KYCInfoCard`** (`KYCInfoCard.tsx:532-560` + `:494-516`) — สมบูรณ์ที่สุด
   มีทั้ง placeholder เมื่อไม่มีรูป, `loading="lazy"`, ปุ่ม "เปิดในแท็บใหม่" — **แต่ไม่ได้ export
   เป็น component กลาง มันเป็น local const ในไฟล์ KYCInfoCard**
2. `<a target="_blank"><img></a>` เปล่าๆ — ที่เหลือเกือบทั้งหมดใช้แบบนี้

**ไม่มีหน้าไหนที่แอดมินดูรูปของไรเดอร์ที่ไม่ผูกกับงานใบใดใบหนึ่ง** ยกเว้น `/riders` ซึ่งอ่านจาก
`riders/{id}/documents` — ถ้าค่าใช้จ่ายผูกกับ "รอบ/กะ" แทน "งาน" จะไม่มีที่ยืนในหน้าใดเลยวันนี้

---

## 6. คำถามหลัก: pattern KYC เอามาใช้ซ้ำกับสลิปค่าใช้จ่ายได้ตรงๆ ไหม

### คำตอบ: **ตัวอัปโหลดใช้ซ้ำได้ 100% ตรงๆ ไม่ต้องแก้อะไร — แต่ "path convention + storage rules + สิทธิ์" ของ KYC ใช้ซ้ำไม่ได้ ต้องแยกทาง 3 เรื่อง**

แยกเป็นชั้นๆ พร้อมหลักฐาน:

#### ชั้นที่ใช้ซ้ำได้ตรงๆ — `uploadImageToFirebase`

`src/utils/uploadImage.ts:36-67` **ไม่มีอะไรผูกกับ KYC เลยแม้แต่บรรทัดเดียว**:
- รับ `path` เป็นสตริงอิสระ ไม่ validate prefix (`:39`, `:59`)
- validation (`:15-23`) เป็นเรื่องชนิดไฟล์/ขนาดล้วนๆ ไม่มี logic KYC
- `opaqueFilename` (`:33`) เป็น option ธรรมดา — comment `:31` บอกว่า "KYC photos use this"
  แต่ที่จริง amendment/verification/profile ก็ใช้ (`RequestAmendmentModal.tsx:232`, `RiderApp.tsx:259`)
  **มันคือ option ทั่วไป ไม่ใช่ของ KYC**
- **สรุป: เรียก `uploadImageToFirebase(file, 'บาง/path/ใหม่', { opaqueFilename: true })` ได้ทันที**

รูป UI ก็ยกมาได้ — `PhotoSlot` ของ KYC (`KYCModal.tsx:536-575`) เป็น presentational ล้วน
รับ `url/uploading/onUpload` และ **ไม่ตั้ง `capture`** (`:567-572`) ซึ่งเหมาะกับสลิปพอดี
(สลิปทางด่วนมักเป็นภาพในอัลบั้มหรือใบเสร็จที่ถ่ายทีหลัง)

#### เรื่องที่ 1 ที่ **ต้องแยก** — path convention กับ Storage rules

KYC ผูกกับงาน: `jobs/{jobId}/kyc/{filename}` (`KYCModal.tsx:92`) และ rule ที่รับมันคือ
`storage.rules:142` ซึ่ง match ชื่อ **segment เดียว** (`{filename}` ไม่ใช่ `{filename=**}`)
→ **ยัดสลิปเข้าไปใต้ `jobs/{id}/kyc/` ตรงๆ ไม่ได้** เพราะจะปนกับหลักฐาน AMLO
ในโฟลเดอร์เดียวกัน ทั้งที่ `KYCInfoCard.tsx:158` ไล่ลบ Storage จาก URL ที่อยู่ในเรคคอร์ด
(ไม่ได้ list โฟลเดอร์) — สลิปจะรอดจากการลบ KYC แต่ไปนั่งอยู่ในโฟลเดอร์ที่ถูกประกาศว่าเป็น
พื้นที่ write-once ของ AMLO ซึ่งอ่านย้อนหลังแล้วอธิบายไม่ได้

**สองทางเลือกที่มีจริง — ต่างกันที่ "ต้อง deploy rules ไหม":**

| ทาง | path | ต้องแก้ `storage.rules` ไหม | rule ที่รองรับ |
|---|---|---|---|
| **A. ผูกกับงาน** | `jobs/{jobId}/expenses/{uuid}.jpg` | **ต้อง** — ไม่มี match ตัวไหนรับ segment `expenses` → ตกไป catch-all `storage.rules:356-358` **อัปไม่ขึ้นทันที** | ต้องเพิ่ม block ใหม่ (ก๊อป `:213-218` มาได้เลย) |
| **B. ผูกกับตัวไรเดอร์** | `riders/{uid}/expenses/{uuid}.jpg` | **ไม่ต้อง** — `storage.rules:310-315` ใช้ `{filename=**}` จึง match หลาย segment และ `request.auth.uid == riderId` ผ่านอยู่แล้วเพราะ `riderId === auth uid` (`Login.tsx:115-126`, `Register.tsx:80-86`) | มีอยู่แล้ว, 25 MB, `isImage()` |

ทาง B **ทำงานได้วันนี้โดยไม่ต้อง deploy อะไรเลย** และได้ self-write scope ฟรี
(ไรเดอร์เขียนโฟลเดอร์คนอื่นไม่ได้ — ซึ่ง `jobs/**` ทุกตัวทำไม่ได้) แลกกับการที่รูปไม่ผูกกับ jobId
ในตัว path — ถ้าค่าใช้จ่ายเป็นรายงาน (เกิดตอนวิ่งงานใบนั้น) ทาง A ตรงความหมายกว่า
**ข้อนี้ตัดสินไม่ได้จากโค้ด ต้องรู้ก่อนว่าค่าใช้จ่ายผูกกับงานหรือผูกกับรอบ**

#### เรื่องที่ 2 ที่ **ต้องแยก** — write-once / delete

KYC เป็น **`allow create` + `allow update: if false`** (`storage.rules:144-147`)
เพราะเป็นหลักฐาน AMLO ที่ต้องแก้ไม่ได้ และลบได้เฉพาะ admin ผ่าน Firestore role check (`:152-153`)

สลิปค่าใช้จ่าย **ไม่ควรได้ระบอบเดียวกัน**: ไรเดอร์ถ่ายสลิปเบลอ/ผิดใบ แล้วอยากถ่ายใหม่ก่อนกดส่ง
เป็นเรื่องปกติ — write-once จะทำให้ทำไม่ได้ (ต้องอัปไฟล์ใหม่แล้วทิ้งใบเก่าเป็น orphan)
path อื่นๆ ที่ไรเดอร์เขียนวันนี้ (`:159-164`, `:213-218`, `:225-230`) ใช้ `allow write` ก้อนเดียว
ซึ่งเป็นระบอบที่ตรงกับสลิปมากกว่า

#### เรื่องที่ 3 ที่ **ต้องแยก** — สิทธิ์อ่าน / ทางที่แอดมินเปิดดู

KYC มีสองชั้น: Storage อ่านได้ทุก auth user (`:143`) แต่ **URL ถูกซ่อนอยู่ใน RTDB ที่ปิดแน่น**

```
// bkk-frontend-next/database.rules.json:145-148
"$jobId": {
  ".read": "auth != null && (root.child('admins').child(auth.uid).child('role').val() === 'admin'
            || root.child('jobs').child($jobId).child('rider_id').val() === auth.uid)",
  ".write": "auth != null && ((!data.exists() && (... rider_id === auth.uid || admin)) || (data.exists() && !newData.exists() && admin))",
  ".validate": "newData.hasChildren(['method','id_number','id_address','verified_at','verified_by_rider_uid','verified_by_rider_name'])",
```

สังเกต `.validate` ที่ `:149` — **บังคับให้ทุกเรคคอร์ดต้องมี `id_number`, `id_address`, `method`
เป็น `'photo'|'typed_fallback'` (`:151`) และ `id_number` ยาว 13 ตัวเป๊ะ (`:154`)**
→ **โครง `/jobs_kyc` ใช้เก็บสลิปค่าใช้จ่ายไม่ได้เด็ดขาด** rules จะปฏิเสธการเขียนทุกครั้ง
(นี่คือหลักฐานตรงที่สุดว่า "ผูกกับ flow KYC จนต้องแยกทาง" ในระดับ data)

และการเขียนก็แยกเป็นสองที่โดยตั้งใจ — `src/hooks/useJobActions.ts:489-495` เขียน
เรคคอร์ดเต็มลง `jobs_kyc/{id}` แล้วเขียนแค่ **ธง 2 ตัว** (`kyc_verified_at`, `kyc_method`)
ลง `jobs/{id}` ด้วย multi-path update ตัวเดียว (comment อธิบายเหตุผลที่ `:454-462`)
ค่าใช้จ่ายไม่มีเหตุผล PII แบบนั้น — เก็บบนงาน/บนไรเดอร์ตรงๆ ได้

ฝั่งดู: `KYCInfoCard` (`bkk-system/src/pages/admin/components/KYCInfoCard.tsx`) **ก๊อปมาใช้ตรงๆ ไม่ได้**
เพราะทั้งไฟล์ผูกกับ KYC — subscribe `jobs_kyc/{id}` (`:140-144`), เกณฑ์ AMLO (`:146-147`),
mask เลขบัตร (`:32-36`), แปลงวันบนบัตร (`:50+`), gate ลบเฉพาะ CEO/MANAGER (`:151`)
**สิ่งที่ยกมาใช้ซ้ำได้จริงคือ `PhotoTile` (`:531-560`) กับ lightbox (`:494-516`) ซึ่งเป็น
local const ในไฟล์นั้น ต้องแยกออกมาเป็น component กลางก่อน**

#### ตารางสรุปคำตอบข้อ 6

| ชิ้นส่วน | ใช้ซ้ำได้? | หลักฐาน |
|---|---|---|
| `uploadImageToFirebase` + compression + validation | ✅ ตรงๆ | `src/utils/uploadImage.ts:36-67` ไม่มี logic KYC |
| `opaqueFilename` | ✅ ตรงๆ | `:33`, ใช้อยู่แล้วนอก KYC |
| UI `PhotoSlot` (ปุ่มถ่าย/เลือกอัลบั้ม + spinner) | ✅ ก๊อปได้ | `KYCModal.tsx:536-575` presentational ล้วน, ไม่ตั้ง `capture` |
| Storage path `jobs/{id}/kyc/` | ❌ | rule `storage.rules:142` เป็นพื้นที่ AMLO write-once, `{filename}` segment เดียว |
| Storage rule (write-once + admin delete) | ❌ | `:144-153` — สลิปต้องถ่ายใหม่ทับได้ |
| RTDB node `/jobs_kyc` | ❌ **แข็ง** | `database.rules.json:149-155` `.validate` บังคับ `id_number` 13 หลัก + `method` enum |
| viewer `KYCInfoCard` | ❌ (แต่ `PhotoTile`/lightbox ยกได้) | `KYCInfoCard.tsx:140-151` ผูก `jobs_kyc` + AMLO + role gate |
| retry / offline queue | — **ไม่มีให้ใช้ซ้ำเลย** | ข้อ 4 |

**ทางที่ถูกที่สุดตามหลักฐานข้างบน:** ใช้ `uploadImageToFirebase` เดิม + `opaqueFilename: true`
ยิงไป path ของตัวเอง (`riders/{uid}/expenses/...` ถ้าอยากเลี่ยงการ deploy rules,
หรือ `jobs/{id}/expenses/...` พร้อมเพิ่ม rule block ใหม่ 6 บรรทัดตามแบบ `:213-218`)
เก็บ URL ในโหนดของตัวเอง **ห้ามแตะ `/jobs_kyc`** และฝั่งแอดมินยก `PhotoTile` + lightbox
ออกจาก `KYCInfoCard` มาเป็น component กลางก่อนใช้

---

## ข้อจำกัดของ survey นี้

- `node_modules` ไม่ได้ติดตั้งใน container จึง **ไม่ได้ตรวจพฤติกรรม retry ภายในของ Firebase Storage SDK
  จาก source** — ที่ยืนยันได้คือไม่มีโค้ดของเราตัวไหนตั้งค่าหรือทำ retry เอง
- ไม่ได้รันแอปหรือทดสอบ upload จริง ทุกข้อสรุปมาจากการอ่านโค้ดกับไฟล์ rules
- ไม่ได้ตรวจ `bkk-frontend-next` ฝั่งเว็บลูกค้า นอกจาก `storage.rules` + `database.rules.json`
  ซึ่งเป็น canonical source ของกฎที่ทั้งสาม repo ใช้ร่วมกัน

---

## ของนอกขอบเขตที่เจอระหว่างทาง (บรรทัดเดียวตามที่สั่ง)

- ยังไม่มีโครงค่าใช้จ่าย/การเบิกใดๆ ในโค้ดเลย (`grep expense|reimburse|ค่าทางด่วน|ค่าจอด|สำรองจ่าย` = 0 ผลลัพธ์ทั้ง `src/` + `functions/`); ท่อเงินไรเดอร์ที่มีอยู่คือ wallet → `riderRequestWithdraw` (`src/hooks/useJobActions.ts:403-416`) → แอดมินโอน + แนบสลิปที่ `bkk-system/src/pages/finance/components/RiderWithdrawals.tsx:98`, มี WHT หักตอนถอน และ `/riders` เป็นหน้าเดียวที่ดูของไรเดอร์แบบไม่ผูกกับงาน
