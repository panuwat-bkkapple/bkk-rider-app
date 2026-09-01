# แผน: Offline queue ของการแนบหลักฐาน (แอปไรเดอร์) — ฉบับปรับปรุงหลังตัดสินใจ 4 ข้อ

> **1 ก.ย. 2569 · ฉบับที่ 2** (เขียนทับฉบับแรกของวันเดียวกัน)
> ต่อจาก `docs/reports/2026-09-01-rider-expense-evidence-survey.md`
>
> **ยังไม่ได้เขียนโค้ด** · ขอบเขต: **bkk-rider-app เท่านั้น ยังไม่แตะ bkk-system**
> approval flow / สถานะการเบิก / การจ่ายเงิน ยังอยู่นอกแผน
>
> จุดที่แผนนี้ชนกับฝั่งอื่นถูกทำเครื่องหมาย **[นอกขอบเขต]** ไว้เป็นข้อสังเกต ไม่ใช่ข้อสรุป

---

## 0. ต้องบอกก่อนอย่างอื่น — 3 จุดที่การตัดสินใจชนกับโค้ดจริง

ตามที่สั่งว่า *"ถ้ามีข้อไหนขัดกับสิ่งที่สำรวจเจอในโค้ดจริง ให้บอกทันที อย่าเงียบแล้วปรับให้เข้ากันเอง"* —
มี 3 จุด **ข้อ 0.1 กระทบการตัดสินใจข้อ 2 โดยตรงและต้องเคาะใหม่**

### 0.1 ⚠️ ข้อ 2 ตัด **storage** rules deploy ได้จริง แต่ **ไม่ได้ตัด database rules deploy**

ครึ่งแรกของการตัดสินใจ **ถูกต้องตามที่ยืนยันในโค้ด** — path `riders/{uid}/expenses/...`
ถูกครอบด้วย rule ที่มีอยู่แล้ว ไม่ต้อง deploy อะไร:

```
// bkk-frontend-next/storage.rules:310-315
match /riders/{riderId}/{filename=**} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && request.auth.uid == riderId
    && request.resource.size < 25 * 1024 * 1024
    && isImage();
}
```

`{filename=**}` match หลาย segment → `riders/{uid}/expenses/{expenseId}/{uuid}.jpg` เข้าเงื่อนไข
และ `auth.uid == riderId` ให้ self-write scope ตามที่ต้องการทุกประการ
(`riderId` = auth uid จริง ยืนยันที่ `src/pages/Login.tsx:115-126` และ `src/pages/Register.tsx:80-86`)

**แต่รูปเป็นแค่ครึ่งเดียวของงาน** — อีกครึ่งคือ record ฝั่ง RTDB ที่ต้องถือ `jobId` ตามข้อ 3
และตรงนั้นคนละไฟล์ คนละ deploy:

```json
// bkk-frontend-next/database.rules.json:2-4
"rules": {
  ".read": false,
  ".write": false,
```

root ปิดสนิท → **โหนดใหม่ชื่ออะไรก็ตาม (เช่น `rider_expenses`) จะได้ `permission_denied` ทันที**
จนกว่าจะมีคนเพิ่ม rule แล้ว `firebase deploy --only database` จาก bkk-frontend-next
ซึ่งเป็น workflow แยกที่ CLAUDE.md เตือนไว้ว่าเคยแดงเงียบติดกัน 3 รอบ

**มีทางเลี่ยง deploy จริงหนึ่งทาง แต่แพงฝั่งแอดมิน** — เขียน record ไว้ใต้ `riders/{uid}` ด้วย
เพราะ rule เดิมให้ไรเดอร์เขียนใต้ตัวเองได้อยู่แล้ว:

```json
// bkk-frontend-next/database.rules.json:554-556
"$uid": {
  ".read": "auth != null && auth.uid === $uid",
  ".write": "auth != null && (root.child('admins').child(auth.uid).child('role').val() === 'admin'
             || (auth.uid === $uid && (!data.child('approval_status').exists()
                 || newData.child('approval_status').exists())))",
```

| ทาง | RTDB path ของ record | deploy rules? | ราคาที่จ่าย |
|---|---|---|---|
| **A** | `riders/{uid}/expenses/{expenseId}` | **ไม่ต้องเลย** | **[นอกขอบเขต]** แอดมินจะดูรายการเบิกของทุกคนต้องอ่าน `/riders` ทั้งก้อน (`database.rules.json:553` read = admin ทั้ง node) และ **ไม่มี `.indexOn` ให้ query ข้ามไรเดอร์** — ชนกฎค่า RTDB ใน CLAUDE.md ตรงๆ |
| **B** | `rider_expenses/{expenseId}` + `.indexOn: ["rider_id","job_id","created_at"]` | **ต้อง 1 ครั้ง** | deploy ข้าม repo หนึ่งรอบ แล้วจบ ฝั่งแอดมิน query ถูกและตรง |

**เสนอ B** — ทาง A ประหยัด deploy ครั้งเดียวแล้วไปสร้างปัญหาค่า RTDB ถาวรที่ CLAUDE.md
มีทั้งหัวข้อไว้กัน. แต่นี่คือ **การตัดสินใจที่ต้องเคาะ** ไม่ใช่สิ่งที่ผมเลือกเองได้
เพราะเหตุผลที่ยกมาตอนเลือกข้อ 2 คือ "ไม่ต้อง deploy ข้าม repo" ซึ่งเป็นจริงแค่ครึ่งเดียว

> ระหว่างยังไม่เคาะ แผนนี้เขียนโดยสมมติ **B** และจุดที่ต่างกันมีแค่ค่าคงที่ `RECORD_ROOT` ตัวเดียว
> (ดูข้อ 4) — เปลี่ยนทีหลังไม่ต้องรื้อ queue

### 0.2 ⚠️ ตัวอัปโหลดวันนี้ไม่ส่ง `contentType` — ภายใต้ queue เรื่องนี้เปลี่ยนจาก "ลองใหม่" เป็น "เงินตาย"

rule บังคับ allowlist ชนิดไฟล์:

```
// bkk-frontend-next/storage.rules:69-72
function isImage() {
  return request.resource.contentType
    .matches('^image/(jpeg|png|webp|heic|heif)$');
}
```

แต่ฝั่งไรเดอร์เรียกแบบ 2 argument ไม่ประกาศ type:

```ts
// src/utils/uploadImage.ts:61
const snapshot = await uploadBytes(storageRef, compressedFile);
```

และไม่ได้บังคับ `fileType` ตอนบีบอัดด้วย (`src/utils/uploadImage.ts:6-10` มีแค่
`maxSizeMB` / `maxWidthOrHeight` / `useWebWorker`) → ชนิดของ Blob ที่ได้ขึ้นกับไฟล์ขาเข้า

**bkk-system เจอปัญหานี้มาแล้วและแก้พร้อมคอมเมนต์อธิบาย** — Blob จาก picker บางตัวมี `type` ว่าง
Firebase จึงติดป้าย `application/octet-stream` แล้ว rule ปฏิเสธ:

```ts
// bkk-system/src/utils/uploadImage.ts:73-76
const snapshot = await uploadBytes(storageRef, compressedFile, {
  contentType: outputType,
  cacheControl: `${options.opaqueFilename ? 'private' : 'public'}, max-age=31536000, immutable`,
});
```

**ทำไมเรื่องนี้ใหญ่ขึ้นเมื่อมี queue:** วันนี้อาการคือ toast แดงต่อหน้าไรเดอร์ที่กำลังจ้องจออยู่
เขาเห็นและลองใหม่ได้. ภายใต้ queue มันกลายเป็น `storage/unauthorized` = **error ถาวร**
(ข้อ 5) → รายการเบิกเข้าสถานะ `failed_permanent` ทั้งที่ไรเดอร์เดินจากไปแล้ว
= **เงินที่สำรองจ่ายไปแล้วค้างอยู่ในเครื่อง**

→ **P1 ต้องแก้ `src/utils/uploadImage.ts` ให้ส่ง `contentType` (และบังคับ `fileType` ตอนบีบ)
ก่อนต่อสาย queue** เป็นงานที่เพิ่มเข้ามาจากการตัดสินใจข้อ 2 ไม่ได้อยู่ในแผนเดิม

### 0.3 ⚠️ ข้อ 1 พึ่ง standalone แต่แอปไม่เคยบอกไรเดอร์ให้ Add to Home Screen เลย

`grep -rn "beforeinstallprompt|Add to Home|หน้าจอโฮม|standalone" src/ index.html` →
**เจอที่เดียวคือ `public/manifest.json:19` (`"display": "standalone"`)**
ไม่มีโค้ดตรวจ ไม่มีหน้าจอสอน ไม่มี prompt ไม่มีข้อความไหนบอกไรเดอร์เลยสักที่

แปลว่าถ้าปล่อยตามนี้ **ไรเดอร์ที่เปิดผ่านลิงก์ใน Safari ปกติจะตกเส้นทาง degraded ทั้งหมด
โดยไม่มีใครเคยบอกเขาว่าต้องติดตั้งก่อน** — ฟีเจอร์จะทำงานเฉพาะกับคนที่บังเอิญติดตั้งไว้

→ ขอบเขตเพิ่ม: **หน้าจอสอนติดตั้ง + การตรวจ standalone + ข้อความอธิบายเหตุผล**
เป็นส่วนหนึ่งของ P2 ไม่ใช่ของแถม (รายละเอียดข้อ 3)

*หมายเหตุที่ช่วยได้:* iOS ต้อง Add to Home Screen อยู่แล้วถึงจะรับ push ได้ ไรเดอร์ที่เปิด
push ไว้จึงน่าจะติดตั้งอยู่แล้ว — แต่นี่เป็นการเดา **ยังไม่มีตัวเลขจริงว่ากี่เปอร์เซ็นต์ติดตั้ง**
ซึ่งเป็นตัวเลขที่ควรรู้ก่อนเริ่ม P2 (วัดได้ด้วยการ log `display-mode` ตอนบูต — งานครึ่งชั่วโมง)

---

## 1. การตัดสินใจที่รับมาแล้ว (decision record)

| # | ตัดสินว่า | ผลต่อสถาปัตยกรรม |
|---|---|---|
| **1** | กดส่งตอนออฟไลน์ = **"ส่งแล้ว รอขึ้นระบบ"** แต่ **เข้าคิวได้เฉพาะ standalone mode** | มีสองเส้นทางถาวรในโค้ด ไม่ใช่เส้นทางเดียว (ข้อ 3) |
| **2** | Storage path = **`riders/{uid}/expenses/...`** | ไม่ต้อง deploy storage rules ✅ · แต่ยังต้อง deploy database rules ⚠️ (ข้อ 0.1) |
| **3** | ค่าใช้จ่ายผูกกับ **งาน** ผ่านฟิลด์ `job_id` ใน record **ไม่ใช่ผ่าน path** · enqueue ได้โดยยังไม่รู้ jobId | payload ต้อง**แก้ได้ขณะอยู่ในคิว** (ข้อ 4) — นี่คือความต่างที่ใหญ่ที่สุดจากแผนเดิม |
| **4** | **ไม่มี TTL** · เตือนที่ 3 วัน · ล้มถาวร/Blob หาย ต้องแจ้ง · เส้นตายเบิกย้อนหลังเป็นกติกาธุรกิจคนละเรื่อง | ต้องมี **backpressure ตอนเข้า** แทนการ evict ตอนออก (ข้อ 6) |

---

## 2. สิ่งที่เปลี่ยนจากแผนฉบับแรก

| หัวข้อ | ฉบับแรก | ฉบับนี้ | ทำไม |
|---|---|---|---|
| เส้นทางการส่ง | ทางเดียว (optimistic) | **สองทางถาวร** — standalone เข้าคิว / ไม่ standalone ต้องออนไลน์ | ข้อ 1 |
| Storage path | เปิดสองทางเลือก | **ล็อกแล้ว** `riders/{uid}/expenses/...` | ข้อ 2 |
| RTDB path | "ผู้เรียกคำนวณมาให้" ลอยๆ | ต้องเป็นโหนดที่ **key ไม่ต้องใช้ jobId** + ต้องเคาะ A/B | ข้อ 3 + 0.1 |
| payload | คงที่ตั้งแต่ enqueue | **แก้ได้ขณะ pending** (แนบงานทีหลัง) | ข้อ 3 |
| TTL | เสนอเตือน 3 วัน (ยังไม่เคาะ) | **ไม่มี TTL เด็ดขาด** + สถานะ `evidence_lost` | ข้อ 4 |
| ขอบเขต | ไม่ได้พูดถึง | **+ แก้ `uploadImage.ts` ให้ส่ง contentType** | ข้อ 0.2 |
| ขอบเขต | ไม่ได้พูดถึง | **+ หน้าจอสอนติดตั้ง / ตรวจ standalone** | ข้อ 0.3 |
| ขอบเขต | ไม่ได้พูดถึง | **+ badge บน BottomNav** (`src/components/layout/BottomNav.tsx` ยังไม่มี badge เลย) | ข้อ 1 |
| งานที่หายไป | "งานค้างเกิน N วันทำอย่างไร" เป็นคำถามเปิด | ตอบแล้ว ไม่ต้องออกแบบ TTL | ข้อ 4 |

**สรุปทิศทาง: ขอบเขตโตขึ้น ไม่ได้เล็กลง** — ข้อ 1 กับ 4 เพิ่มงาน UI, ข้อ 2 เพิ่มงานแก้ตัวอัปโหลด,
ข้อ 3 เพิ่มความซับซ้อนของ state. สิ่งที่ลดลงมีอย่างเดียวคือไม่ต้องออกแบบกติกา TTL

---

## 3. เส้นทางสองเส้น (ผลจากข้อ 1)

```
กดส่งเบิก
   │
   ├─ standalone? ──ไม่──► เส้น B "ต้องออนไลน์"
   │                        ├─ ออนไลน์: อัปทันที (โค้ดเดิมทุกบรรทัด) → "ขึ้นระบบแล้ว"
   │                        └─ ออฟไลน์: ปุ่มส่งถูกปิด + อธิบายว่าทำไม + วิธีติดตั้ง
   │
   └─ ใช่ ──► เส้น A "เข้าคิวได้"
              ├─ ออนไลน์:  enqueue → flush ทันที → "ขึ้นระบบแล้ว" (ไรเดอร์แทบไม่รู้ว่ามีคิว)
              └─ ออฟไลน์: enqueue → "อยู่ในคิว" → flush เมื่อมีสัญญาณ
```

**การตรวจ standalone** (ต้องเป็นฟังก์ชัน pure ตัวเดียว มีเทส — `src/utils/standalone.ts`):

```ts
export const isStandalone = (): boolean =>
  window.matchMedia?.('(display-mode: standalone)').matches === true
  // iOS เก่า: non-standard, ไม่มีใน type ของ TS ต้อง cast
  || (navigator as Navigator & { standalone?: boolean }).standalone === true;
```

**กติกาที่ห้ามพลาด:**
- ตรวจ **ตอน enqueue** ไม่ใช่ตอน mount — iOS เปลี่ยนบริบทได้ระหว่าง session
- ผลการตรวจ **ห้าม cache ข้ามการเปิดแอป**
- งานที่อยู่ในคิวแล้ว **ยัง flush ต่อได้แม้รอบนี้จะเปิดแบบไม่ standalone** — เกตนี้คุมแค่
  "รับงานใหม่เข้าคิวไหม" ไม่ใช่ "ส่งงานเก่าออกไหม" (ไม่งั้นงานจะติดค้างเพราะเปิดผิดทาง)
- ข้อความบนเส้น B ต้องพูดความจริง: *"เครื่องนี้เปิดจากเบราว์เซอร์ ระบบเก็บรูปไว้รอส่งไม่ได้
  (ข้อมูลอาจถูกลบใน 7 วัน) — ติดตั้งแอปไว้หน้าจอโฮมเพื่อส่งตอนไม่มีสัญญาณได้"*
  **ห้ามเขียนว่า "ระบบขัดข้อง"** — มันไม่ได้ขัดข้อง มันกำลังปฏิเสธที่จะสัญญาสิ่งที่รับประกันไม่ได้

**เส้น B คือโค้ดวันนี้เป๊ะๆ** (`src/utils/uploadImage.ts` + call site เดิม) ไม่ต้องเขียนใหม่ —
เพิ่มแค่การปิดปุ่มตอนออฟไลน์ + ข้อความ

---

## 4. โครงของ queue item (ปรับตามข้อ 3 และ 4)

```ts
// src/utils/uploadQueue/types.ts  (เสนอ)
type QueueState =
  | 'pending'           // รอส่ง
  | 'uploading'         // กำลังส่งอยู่รอบนี้
  | 'failed_permanent'  // rules ปฏิเสธ / payload ไม่ผ่าน — ต้องมีคนทำอะไรสักอย่าง
  | 'evidence_lost';    // Blob หายจาก IndexedDB — ต้องถ่ายใหม่ (ข้อ 4)

interface QueuedUpload {
  id: string;              // UUID ฝั่ง client = idempotency key ของทั้งงาน
  uid: string;             // เจ้าของงาน ตอน enqueue
  created_at: number;      // เวลาที่ไรเดอร์กดส่ง (ไม่ใช่เวลาที่ขึ้นระบบ)
  kind: 'expense_evidence';

  files: QueuedFile[];

  target: {
    root: string;          // ค่าคงที่ตัวเดียวที่ต่างกันระหว่างทาง A/B ในข้อ 0.1
    key: string;           // push().key คำนวณตอน enqueue — ไม่ต้องใช้ jobId
    payload: Record<string, unknown>;  // *** แก้ได้ขณะ state === 'pending' ***
    urlField: string;
  };

  state: QueueState;
  attempts: number;
  next_attempt_at: number;
  last_error?: string;     // ข้อความภาษาคน ไม่ใช่ error code ดิบ
  leased_until?: number;   // กัน flush ซ้อน
}

interface QueuedFile {
  blob: Blob;              // บีบอัดแล้วตั้งแต่ enqueue
  content_type: string;    // *** ประกาศชัด ส่งต่อให้ uploadBytes (ข้อ 0.2) ***
  storage_path: string;    // riders/{uid}/expenses/{id}/{uuid}.jpg — คงที่ตลอดชีพ
  url?: string;            // มีค่า = ขึ้นแล้ว ห้ามอัปซ้ำ
}
```

**สิ่งที่ตั้งใจ:**

- **`target.key` คำนวณตอน enqueue ด้วย `push(ref(db, root)).key`** — SDK สร้าง key ฝั่ง client
  (pattern เดิมที่ `src/hooks/useJobActions.ts:427-428` ใช้อยู่) → **ไม่ต้องรู้ jobId** ตรงตามข้อ 3
  และ retry เขียนลง key เดิมเสมอ = ไม่มีแถวซ้ำ
- **`storage_path` คงที่ตั้งแต่ enqueue** → retry เขียนทับ object เดิม = idempotent โดยโครงสร้าง
  (ทำได้เพราะ rule `storage.rules:310-315` เป็น `allow write` ก้อนเดียว ไม่ใช่ `create`-only
  แบบ KYC — ดู `survey` ข้อ 6)
- **`payload` แก้ได้ขณะ pending** (ผลจากข้อ 3): ไรเดอร์ถ่ายสลิปที่ด่านโดยยังไม่รู้ว่าจะแนบงานไหน
  แล้วมาเลือกงานทีหลัง. เมื่อ `state` ไม่ใช่ `pending` แล้ว การแก้ต้องเป็น **RTDB update
  บนแถวจริง คนละ code path** — UI ต้องแยกสองกรณีนี้ให้ชัด ไม่ใช่ปุ่มเดียวกัน
- **`content_type` ติดมากับไฟล์** ไม่ปล่อยให้ Firebase เดา (ข้อ 0.2)
- **ทริปเดียวหลายงาน** (ข้อ 3): แนบกับงานเดียว + ช่องโน้ต — `payload` มี `job_id` เดี่ยว
  กับ `note` เท่านั้น **ไม่มีโครงแบ่งยอดข้ามงาน** ตามที่สั่ง

---

## 5. Invariant ที่ห้ามละเมิด

1. **รูปต้องขึ้นครบก่อน record จะถูกเขียน** — ผิดลำดับ = แถวเบิกเงินที่ไม่มีหลักฐาน
   ซึ่งละเมิดกฎ "ไม่มีรูป = ส่งไม่ได้" ที่เป็นเหตุผลทั้งหมดของฟีเจอร์
2. **งานหนึ่งชิ้น = แถวไม่เกินหนึ่งแถว** — บังคับด้วย client-generated key ไม่ใช่ด้วยการเช็คก่อนเขียน
3. **flush เป็น single-flight** — mutex ในหน่วยความจำ + `leased_until` ใน record
4. **error ถาวรต้องหยุด** — retryable (network, token หมดอายุ, `storage/retry-limit-exceeded`)
   → backoff · ถาวร (`storage/unauthorized`, `permission_denied`, ไฟล์ไม่ผ่าน
   `validateImageFile` ที่ `src/utils/uploadImage.ts:15-23`) → `failed_permanent` **แจ้งไรเดอร์**
5. **ห้ามลบรายการค้างทิ้งเอง ไม่ว่ากรณีใด** (ข้อ 4) — รวมถึงตอน logout, ตอนคิวเต็ม,
   ตอนค้างนาน. การลบมีทางเดียวคือไรเดอร์กดยืนยันเอง
6. **Blob หาย = สถานะ ไม่ใช่ความเงียบ** — ก่อนอัปทุกครั้งเช็ค `blob` มีจริงและ `size > 0`
   ไม่งั้น `evidence_lost` + ข้อความ *"ไฟล์หลักฐานหายจากเครื่อง ต้องถ่ายใหม่"*
7. **ห้าม throw ออกจาก flush ไปถึง UI** — สื่อสารผ่าน state ของ item เท่านั้น
8. **`created_at` (เวลาที่ไรเดอร์กดส่ง) กับเวลาที่แถวขึ้นระบบเป็นคนละฟิลด์**
   **[นอกขอบเขต]** ฝั่งแอดมินจะเห็นแถวมาช้ากว่าเวลาที่เกิดจริงได้เป็นชั่วโมง — ต้องไม่ถูกอ่านว่า
   ไรเดอร์ย้อนวันที่

---

## 6. คิวเต็มทำอย่างไร (ผลจากข้อ 4)

ไม่มี TTL + ห้ามลบเอง = คิวโตได้ไม่จำกัดถ้าไม่มีอะไรกั้น → **กั้นที่ทางเข้า ไม่ใช่ทางออก**

- เพดาน: `MAX_QUEUED_ITEMS` และ `MAX_QUEUED_BYTES` (ตัวเลขรอข้อมูลจริง — ดูข้อ 11)
- ชนเพดาน → **ปฏิเสธการ enqueue พร้อมบอกตรงๆ** ว่ามีของค้างกี่ชิ้น และพาไปหน้าคิว
  **ห้าม evict ของเก่าเพื่อรับของใหม่** — ของเก่าก็เป็นเงินของเขาเหมือนกัน
- เตือนที่ **3 วัน**: แถบถาวรในแอป (ไม่ใช่ toast) *"มีรายการเบิก N รายการค้างส่งมา X วัน"*

---

## 7. เมื่อไหร่ที่ flush ทำงาน

foreground ทั้งหมด (iOS ไม่มี Background Sync — ข้อ 8):

1. ทันทีหลัง enqueue ถ้าออนไลน์
2. `window` event `online` — ตัวเดิมที่ `src/components/common/OfflineBanner.tsx:24-25` ใช้อยู่
3. `visibilitychange` → `visible` — เคสจริง: ขับออกจากลานจอด จอดับ แล้วเปิดแอปใหม่
4. ตอนบูต **หลัง auth settle** ไม่ใช่ตอน mount (token ยังไม่พร้อม = ล้มฟรี)
5. timer ทุก ~30 วิ ขณะออนไลน์ เฉพาะเมื่อมีงานถึง `next_attempt_at` แล้ว

`navigator.onLine` เป็นตัวเร่ง **ไม่ใช่ตัวตัดสิน** (captive portal รายงาน `true` ได้)
ตัวตัดสินคือผลจริงของ `uploadBytes`

**Backoff:** 5s → 15s → 1m → 5m → 15m แล้วคงที่ (มีเพดาน — ไรเดอร์เปิดแอปจ้ออยู่ การรอเกิน
15 นาทีไม่มีประโยชน์)

---

## 8. ข้อเท็จจริงของแพลตฟอร์ม (ตรวจแล้ว — ไม่เปลี่ยนจากฉบับแรก)

| ข้อเท็จจริง | ผล |
|---|---|
| **iOS ไม่มี Background Sync API** และไม่มีกำหนดจะทำ | flush ต้อง foreground เท่านั้น |
| **ITP ลบ script-writeable storage รวม IndexedDB หลังไม่ใช้ 7 วัน — ยกเว้นโดเมนที่ Add to Home Screen** | **นี่คือฐานของการตัดสินใจข้อ 1 ทั้งข้อ** |
| RTDB web SDK **ไม่มี disk persistence** | คิวต้องเป็นของเรา ไม่ใช่ของ SDK — **P0 ต้องเทสจริง** |
| ใช้ `uploadBytes` ไม่ใช่ `uploadBytesResumable` (`src/utils/uploadImage.ts:2,61`) | ไม่มี resume — ขาดกลางคันต้องอัปใหม่ทั้งไฟล์ (รับได้ เพราะ ≤0.8 MB) |
| SW แตะเฉพาะ GET (`public/firebase-messaging-sw.js:48-50`) ไม่มี `sync` listener | **ห้ามแก้ SW ให้ดักการอัปโหลด** |

---

## 9. เฟสการทำงาน (ปรับตามขอบเขตใหม่)

| เฟส | ทำอะไร | เสร็จเมื่อ |
|---|---|---|
| **P0 พิสูจน์ + เคาะ** (ครึ่งวัน) | เทสบนเครื่องจริง: (ก) Blob ลง IndexedDB บน iOS PWA อ่านกลับได้ (ข) RTDB `set()` ออฟไลน์ + รีเฟรช → หายจริงไหม (ค) `push().key` ทำงานออฟไลน์ (ง) เขียนทับ path เดิมใต้ `riders/{uid}/**` ได้ (จ) `isStandalone()` ตอบถูกทั้ง 4 สภาพ (iOS ติดตั้ง/iOS tab/Android ติดตั้ง/desktop) · **+ เคาะ A หรือ B ในข้อ 0.1** · **+ วัดสัดส่วนไรเดอร์ที่รันแบบ standalone** | มีผลครบ 5 ข้อ + เคาะ A/B แล้ว |
| **P1 แกน + แก้หนี้เดิม** | `src/utils/uploadQueue/` (IDB wrapper ไม่เพิ่ม dependency + reducer pure) · `src/utils/standalone.ts` · **แก้ `src/utils/uploadImage.ts` ให้ส่ง `contentType` + บังคับ `fileType`** (ข้อ 0.2) | vitest เขียว + injection test ผ่าน (ข้อ 10) · **การแก้ uploadImage ต้องไม่ทำให้ 12 call site เดิมพัง** |
| **P2 ต่อสาย + สองเส้นทาง** | ปุ่มส่งเบิก → เส้น A/B ตามข้อ 3 · หน้าจอสอนติดตั้ง (ข้อ 0.3) · การแนบงานทีหลัง (ข้อ 3) | ถ่าย+กรอกออฟไลน์ ปิดแอป เปิดใหม่ตอนออนไลน์ → แถวขึ้นครบพร้อมรูป · เปิดแบบไม่ standalone → ปุ่มปิดพร้อมเหตุผล |
| **P3 สถานะ + ตัวกระตุ้น** | flush triggers 5 ตัว · backoff · หน้าคิว · badge บน `BottomNav` · แถบเตือน 3 วัน · backpressure | ทดสอบ 6 สถานการณ์: เน็ตหลุดกลางอัป / ปิดแอปกลางคิว / rules ปฏิเสธ / สลับบัญชี / Blob หาย / คิวเต็ม |
| **P4 (ยังไม่ทำ)** | ย้าย KYC / รูปสภาพเครื่อง / amendment มาใช้ queue | **PR แยก ตัดสินใจแยก** — KYC เป็น `create`-only (`storage.rules:144-147`) queue รุ่นแรกไม่รองรับ |

**สิ่งที่แลก:** P1 ไม่ส่งคุณค่าถึงไรเดอร์เลย (~3 วันที่ไม่มีอะไรให้ดู) แลกกับการที่กติกาถูกล็อก
ด้วยเทสก่อนมี UI มาบังคับรูปทรง — และ **การแก้ `uploadImage.ts` ใน P1 เป็นการปิดหนี้ที่มีอยู่แล้ว
วันนี้** (12 call site เดิมได้ประโยชน์ด้วย ไม่ใช่แค่ฟีเจอร์ใหม่)

---

## 10. เทส

pure unit test ที่ `src/utils/uploadQueue/*.test.ts` ตามแบบ `src/utils/walletLedger.test.ts`
(เขียนจากเคสจริง ไม่ใช่จาก spec)

เคสบังคับ:
1. ลานจอดใต้ดิน: enqueue ออฟไลน์ → ขึ้นชั้นบน → flush → **แถวเดียว รูปครบ**
2. อัป 3 ใบ ล้มใบที่ 3 → retry อัปเฉพาะใบที่ 3 (ใบ 1-2 ต้องไม่ถูกอัปซ้ำ)
3. flush สองตัวยิงพร้อมกัน (`online` + `visibilitychange`) → งานถูกหยิบครั้งเดียว
4. `storage/unauthorized` → `failed_permanent` ทันที ไม่ retry
5. network error → backoff ตามลำดับ ไม่เกินเพดาน
6. ไรเดอร์คนที่สอง login → งานคนแรกไม่ถูก flush **และไม่ถูกลบ**
7. record เขียนสำเร็จแล้วแอปปิดก่อนลบงานออกจากคิว → รอบหน้าเขียนซ้ำ key เดิม = ไม่เกิดแถวที่สอง
8. **(ใหม่ — ข้อ 1)** ไม่ standalone → `enqueue()` ปฏิเสธ ไม่เขียน IDB เลย
9. **(ใหม่ — ข้อ 1)** งานที่อยู่ในคิวแล้ว ยัง flush ได้แม้รอบนี้ไม่ standalone
10. **(ใหม่ — ข้อ 3)** แก้ `payload.job_id` ขณะ pending → flush แล้วแถวมี job_id ใหม่
11. **(ใหม่ — ข้อ 4)** `blob.size === 0` → `evidence_lost` ไม่ใช่ retry วนไม่จบ
12. **(ใหม่ — ข้อ 4)** คิวเต็ม → ปฏิเสธของใหม่ **ของเก่าต้องยังอยู่ครบ**

**Injection test บังคับ** (`commit checkpoint ก่อนเสมอ` ตาม CLAUDE.md) — ทำลายทีละกฎ เทสต้องแดง:
- ตัด `leased_until` → เคส 3 แดง
- `classifyError` คืน retryable ทุกกรณี → เคส 4 + 11 แดง
- `storage_path` สุ่มใหม่ทุก upload → เคส 2 หรือ 7 แดง
- flush ข้ามการเช็ค `uid` → เคส 6 แดง
- `isStandalone()` คืน true เสมอ → เคส 8 แดง
- คิวเต็มแล้ว evict ตัวเก่า → เคส 12 แดง

**ถอดทีละคู่ด้วย** — คู่ที่ต้องระวังเป็นพิเศษคือ `leased_until` กับ mutex ในหน่วยความจำ
ซึ่งกลบกันเองได้พอดีตามกับดักข้อ 1 ในหัวข้อ Injection test ของ CLAUDE.md

---

## 11. สิ่งที่ห้ามทำ

1. **ห้ามพึ่ง Background Sync เป็นทางหลัก** — iOS ไม่มี
2. **ห้ามเก็บรูปเป็น base64 ใน localStorage** — โควตา ~5 MB, เขียน synchronous บล็อก main thread,
   ขนาดโต ~33%
3. **ห้ามให้ queue เขียน record ก่อนรูปขึ้นครบ**
4. **ห้าม retry ไม่จำกัดกับ error ถาวร**
5. **ห้ามล้าง queue ตอน logout** — งานค้างคือเงินที่ยังไม่ได้เบิก
6. **ห้าม evict ของเก่าเมื่อคิวเต็ม** (ข้อ 6)
7. **ห้ามแก้ service worker ให้ดักการอัปโหลด**
8. **ห้ามต่อ queue เข้ากับ 11 จุดเดิมในรอบนี้** — KYC เป็น `create`-only, queue ยังไม่รองรับ
9. **ห้ามบอกว่า "ส่งสำเร็จ" เมื่อยังไม่ถึง server** — ต้องเป็น "อยู่ในคิว" กับ "ขึ้นระบบแล้ว"
   สองคำที่ต่างกันชัด (ข้อ 1)
10. **ห้ามเปิดเส้นทางเข้าคิวให้ non-standalone แม้จะ "แค่ชั่วคราว"** — นั่นคือการสัญญาสิ่งที่
    ITP รับประกันให้ไม่ได้ ซึ่งเป็นเหตุผลทั้งหมดของเกตนี้

---

## 12. ต้องเคาะก่อนเริ่ม P1

1. **⚠️ ทาง A หรือ B ในข้อ 0.1** — RTDB path ของ record (กระทบว่าต้อง deploy database rules ไหม
   และกระทบฝั่งแอดมินถาวร) **ข้อนี้ค้างอยู่ ยังไม่ได้ตัดสิน**
2. `MAX_QUEUED_ITEMS` / `MAX_QUEUED_BYTES` — รอตัวเลขจริงว่าเบิกกี่ครั้ง/วัน กี่รูป/ครั้ง
3. ฟิลด์ใน `payload` ของรายการเบิก (ประเภท/ยอด/โน้ต/job_id) — เป็นเรื่องของฟีเจอร์
   ไม่ใช่ของ queue แต่ต้องรู้ก่อนเขียน P2

---

## 13. ยังไม่ได้พิสูจน์

- ยังไม่ได้เทสบนเครื่องจริงสักข้อ — ทั้งหมดอยู่ใน P0
- **ไม่รู้ว่าไรเดอร์กี่ % รันแบบ standalone จริง** ซึ่งเป็นตัวเลขที่ตัดสินว่าข้อ 1 ครอบคลุมคนส่วนใหญ่
  หรือกลายเป็นฟีเจอร์ของคนไม่กี่คน (วัดได้ใน P0)
- ไม่รู้ปริมาณการเบิกจริง → เพดานคิวยังเป็นตัวเลขลอย
- **ยังไม่ได้สำรวจ bkk-system** จึงไม่ทราบว่าฝั่งแอดมินต้องแก้อะไรบ้างเพื่อรับแถวที่มาช้า
  และเพื่ออ่านรูปใต้ `riders/{uid}/expenses/` (จุด **[นอกขอบเขต]** ทั้งหมดคือที่ที่ต้องไปดู)
- `node_modules` ไม่ได้ติดตั้งใน container นี้ จึงยังไม่ได้ตรวจว่า `firebase ^10.13.0`
  มี retry ภายในแค่ไหน — อาจซ้อนกับ backoff ชั้นของเรา

---

## แหล่งอ้างอิงของข้อเท็จจริงในข้อ 8

- [Background Sync API — caniuse](https://caniuse.com/background-sync)
- [PWA iOS Limitations and Safari Support (2026)](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [Tracking Prevention in WebKit](https://webkit.org/tracking-prevention/) — 7-day cap
  และการยกเว้นให้ home screen web application
- [Storage quotas and eviction criteria — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
