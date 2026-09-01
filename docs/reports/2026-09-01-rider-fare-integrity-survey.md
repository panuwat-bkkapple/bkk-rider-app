# Survey: Rider Fare Integrity — เคสยอด 182 → 157 (1 ก.ย. 2569)

> ## สาเหตุยืนยันแล้วจากข้อมูลจริง — อ่านหัวข้อ "คำตอบของเคส" ก่อนอย่างอื่น
>
> **`settings/logistics_rates.travel_mode` ถูกเปลี่ยนจาก `DRIVE` เป็น `TWO_WHEELER`
> เวลา 16:57:14 ซึ่งเป็น 8 นาทีก่อนไรเดอร์ปิดจ๊อบ** การคำนวณตอนจบงานอ่านค่าสดจาก DB
> จึงวัดเส้นทางด้วยโหมดมอเตอร์ไซค์ (19.35 กม.) แทนโหมดรถยนต์ (24.37 กม.) → ค่ารอบ
> **182 กลายเป็น 157** โดย**ไม่มีอะไรพังเลยสักจุด** ทั้งสองครั้ง `reason: "calculated"`
> อัตราเท่ากันเป๊ะ ยานพาหนะเดียวกัน หมุดไม่ขยับ
>
> สมมติฐานทั้ง 8 ข้อใน §11 **ถูกตัดออกหมดแล้วด้วยข้อมูลจริง** — ตัวจริงเป็นข้อที่ฉบับแรก
> ไม่ได้เขียนไว้ (ดู **F11**) ข้อมูลดิบ ไทม์ไลน์ และการตรวจสูตรอยู่ในหัวข้อถัดจากสรุปผู้บริหาร

> **สำรวจล้วน ไม่มีการแก้โค้ดใดๆ** ตามคำสั่ง — ไม่มี patch ไม่มี commit โค้ด
> รอบสอง (1 ก.ย. เย็น) เพิ่มเฉพาะการอ่านข้อมูลจริงของงานนี้จาก RTDB แบบ read-only
> ยังไม่มีการแก้โค้ดและไม่มีการเขียนกลับลงฐานข้อมูล
>
> ขอบเขต: 3 repo — `bkk-frontend-next` (HEAD ของ branch `claude/new-session-w1i7tu`),
> `bkk-rider-app` @ `7b95f1a`, `bkk-system` @ `9aff98a` (ทั้งคู่ shallow clone ณ 1 ก.ย. 2569)
>
> เคส: งาน `OID-MTIAI3FH-851` (`jobs/-P0QekIHDPBe7phJhabu`) — ไรเดอร์คนแรกที่จ้าง วันแรกของงาน
> ยอดตอนกดรับ **182** บาท ยอดที่คำนวณตอนจบงาน **157** บาท ไม่มีคำอธิบาย
> (ตอนแจ้งจำเป็น "183 → 150 กว่า" — ตัวเลขจริงจาก DB คือ 182 → 157 หัวข้อรายงานแก้ตามแล้ว)
>
> **อ่านคู่กับ** `docs/reports/2026-08-31-rider-money-distance-survey.md` (สำรวจเส้นทางเงิน+ระยะทาง
> ทั้งระบบ เมื่อวาน) — รายงานฉบับนี้ไม่ทำซ้ำตารางฟิลด์ทั้งหมดของฉบับนั้น แต่โฟกัสที่
> **"ยอดเปลี่ยนได้ที่จุดไหน และระบบอธิบายส่วนต่างได้หรือไม่"** พร้อมยืนยัน/ขยายข้อที่เกี่ยวข้อง

---

## 1. สรุปผู้บริหาร

1. **ค่ารอบไม่ได้ถูกคำนวณครั้งเดียว — ถูกคำนวณใหม่ได้ถึง 5 ครั้งต่อหนึ่งงาน** โดย Cloud Function
   คนละตัว 5 ตัวใน `bkk-system/functions/index.js` แต่ละครั้งยิง Google Routes API ใหม่ทั้งหมด
2. **ยอดที่ไรเดอร์เห็นตอนกดรับ (`rider_fee_estimate`) กับยอดที่จ่ายจริง (`rider_fee`) เป็นคนละฟิลด์
   คนละการคำนวณ คนละเวลา** — ไม่มีกลไกใดผูกสองตัวนี้เข้าด้วยกัน และไม่มีการ freeze ตอนกดรับ
3. **จุดที่ค่าเปลี่ยนได้มี 7 จุด** (ตาราง §5) — สามจุดเป็น trigger อัตโนมัติที่ไม่ต้องมีใครสั่ง
4. **ระยะทางมาจากการเรียก Routes API แบบ `TRAFFIC_AWARE`** (`index.js:372`) ซึ่ง **เลือกเส้นทาง
   ตามสภาพจราจร ณ วินาทีที่เรียก** — ยิงคนละเวลาได้ระยะทางคนละค่าโดยไม่มีอะไรผิดพลาดเลย
5. **มี fallback เงียบจริง**: Routes API ล้ม/timeout 8 วิ/ไม่มีพิกัด → ค่ารอบกลายเป็น `min_fee` ทันที
   (`index.js:617-638`) ไรเดอร์ไม่เห็นอะไร แต่ `*_meta.reason` บันทึกไว้ ตามย้อนหลังได้
6. **ไม่มี audit trail ของการเปลี่ยนยอดค่ารอบ** — `onJobHandedOverCalcRiderFee` เขียน `rider_fee`
   โดย**ไม่เขียน `qc_logs`** ไม่บันทึกค่าเดิม ไม่บันทึกส่วนต่าง (`index.js:3427-3445`)
   ต่างจาก trigger เพื่อนบ้านที่เขียน log ทุกตัว
7. **สาเหตุของเคสนี้ยืนยันแล้ว: `travel_mode` ถูกสลับระหว่างที่งานยังไม่จบ** — ไม่ใช่ระยะทางแกว่ง
   ไม่ใช่ API ล้ม ไม่ใช่อัตราเปลี่ยน (ดู **F11** และหัวข้อ "คำตอบของเคส" ด้านล่าง)
8. **ระบบ "ตอบไม่ได้" แต่ "สืบได้"** — ไม่มี log ไหนบอกส่วนต่าง แต่ `rider_fee_estimate_meta`
   กับ `rider_fee_meta` ยังอยู่บนงานทั้งคู่พร้อม `distance_km` + `reason` + `computed_at` + `rates`
   **เปิดสองก้อนนี้เทียบกันจบเรื่องทันที** — ซึ่งคือสิ่งที่เกิดขึ้นจริงในรอบสอง
9. ตัวเลข `150` เป็น **hardcode fallback ตอนจ่ายเงิน** อยู่ 6 จุดใน 2 หน้าจอ finance
   (`RiderSettlements.tsx:39,50,77,138` · `SettlementPage.tsx:45,115`) — **เคสนี้ไม่ได้ตกช่องนั้น**
   (`rider_fee` = 157 เป็นค่าที่คำนวณจริง) แต่ช่องยังเปิดอยู่สำหรับงานที่ trigger พลาด

---

## คำตอบของเคส — ยืนยันจากข้อมูลจริง (เพิ่มรอบสอง 1 ก.ย. เย็น)

อ่าน `jobs/-P0QekIHDPBe7phJhabu` จาก RTDB จริงแบบ read-only ผ่าน Admin SDK

### ข้อมูลดิบ

```
rider_fee_estimate: 182          rider_fee: 157          rider_fee_status: "Pending"
receive_method: "Pickup"         status: "Pending QC"    vehicle_type: "motorcycle"
```

| ฟิลด์ | `rider_fee_estimate_meta` (ตอนกดรับ) | `rider_fee_meta` (ตอนจบงาน) |
|---|---|---|
| `computed_at` | 2026-09-01 13:32:58 | 2026-09-01 17:05:41 |
| `reason` | `calculated` | `calculated` |
| `rates.vehicle` | motorcycle | motorcycle |
| `rates.base_fee` | 60 | 60 |
| `rates.per_km` | 5 | 5 |
| `rates.min_fee` / `max_fee` | 100 / 500 | 100 / 500 |
| **`rates.travel_mode`** | **`DRIVE`** | **`TWO_WHEELER`** |
| **`distance_km`** | **24.37** | **19.35** |
| `fee_by_vehicle.motorcycle` | **182** | **157** |
| `fee_by_vehicle.car` | 222 | 197 |

**ตัวแปรเดียวที่ต่างกันคือ `travel_mode`** ที่เหลือเหมือนกันหมดทุกช่อง

### ตรวจสูตร — ตรงเป๊ะทั้งสี่ตัว ไม่มีอะไรพัง

`feeFromRates` (`bkk-system/functions/index.js:563-567`) = `round(clamp(base + per_km × d, min, max))`

```
มอเตอร์ไซค์ ตอนกดรับ :  60 + 5 × 24.37 = 181.85 → 182   (DB = 182)
มอเตอร์ไซค์ ตอนจบงาน :  60 + 5 × 19.35 = 156.75 → 157   (DB = 157)
รถยนต์      ตอนกดรับ : 100 + 5 × 24.37 = 221.85 → 222   (DB = 222)
รถยนต์      ตอนจบงาน : 100 + 5 × 19.35 = 196.75 → 197   (DB = 197)
```

ระยะหาย **5.02 กม.** × 5 บาท/กม. = **หายไป 25 บาทพอดี**

### ไทม์ไลน์ (เวลาไทย)

```
13:32:09  สร้างงาน (created_at) — ตรงกับ timestamp ที่ถอดจาก OID
13:32:55  ไรเดอร์กดรับงาน (qc_logs "Accepted")             <- เห็น 182
13:32:58  onRiderAssignedRecalcEstimate เขียน estimate=182 (DRIVE, 24.37 กม.)
14:29:24  เช็คอินถึงลูกค้า — ห่างหมุด 9 เมตร, is_within_zone: true
16:57:14  settings/logistics_rates.updated_at              <- แอดมินสลับ travel_mode
17:05:40  ไรเดอร์ปิดจ๊อบ (completed_at)
17:05:41  onJobHandedOverCalcRiderFee เขียน rider_fee=157 (TWO_WHEELER, 19.35 กม.)
```

การแก้ settings เกิดก่อนการคำนวณค่ารอบ **507 วินาที** — `computeRiderFee` อ่าน rate card สด
ทุกครั้ง (`index.js:602-605`) จึงหยิบโหมดใหม่ไปใช้ทันที ไม่มีเงื่อนไขใดกันไว้

### ทำไม `TWO_WHEELER` ได้ระยะสั้นกว่า — และทำไมค่าที่ตั้งไม่ได้ผิด

โค้ดอธิบายไว้เองที่ `index.js:436-439` และ `:473-481`: มอเตอร์ไซค์ขึ้นทางด่วนไม่ได้
เส้นทางรถยนต์จึง**ไกลกว่าเป็นกิโลเมตร** การสลับมาใช้ `TWO_WHEELER` กับกองไรเดอร์ที่ขี่
มอเตอร์ไซค์จริงจึงเป็นการตั้งค่าที่**สมเหตุสมผล**

**สิ่งที่ผิดไม่ใช่ค่าที่ตั้ง แต่คือการที่มันย้อนไปรีไพรซ์งานที่ไรเดอร์รับปากไปแล้ว
โดยไม่มีใครรู้และไม่มีบรรทัดไหนบันทึกไว้** — ดู F11

### สถานะปัจจุบัน

`rider_fee_status` ยังเป็น **`Pending`** — เงินยังไม่เข้ากระเป๋าไรเดอร์ ยังตัดสินใจได้ว่าจะจ่าย
182 ตามที่ตกลงตอนกดรับ หรือ 157 ตามฐานใหม่ (เป็นการตัดสินใจเชิงนโยบาย ไม่ใช่เรื่องที่โค้ดตอบ)

### วิธีที่ใช้ดึงข้อมูล (ทำซ้ำได้)

รันจากโฟลเดอร์ `bkk-system` (firebase-admin อยู่ใน `functions/node_modules` ไม่ใช่ที่ root —
`scripts/audit-rider-wallet.cjs:147` ก็ resolve แบบเดียวกัน) ด้วย service account +
`FIREBASE_DATABASE_URL` แล้วอ่าน `jobs/{id}` ตรงๆ **อ่านอย่างเดียว ไม่มี write path**

---

## 2. ข้อค้นพบเรียงตามความรุนแรง

### F1 — ยอดตอนกดรับงานไม่ได้ถูก freeze และไม่มีอะไรผูกกับยอดที่จ่ายจริง (สูง)

- **อาการ:** ไรเดอร์เห็นเลข ตัดสินใจรับงาน แล้วเลขเปลี่ยนตอนจบงาน โดยไม่มีสัญญาอะไรผูกไว้
- **หลักฐาน:**
  - ตอนกดรับ แอปโชว์ `getRiderPayout(job, riderVehicle)` ซึ่งอ่าน
    `rider_fee` → `rider_fee_estimate_meta.fee_by_vehicle[vehicle]` → `rider_fee_estimate`
    (`bkk-rider-app/src/utils/jobHelpers.ts:89-101`) — แสดงที่
    `src/components/home/IncomingJobCard.tsx:31` และ `src/pages/JobDetailPage.tsx:160`
  - การกดรับงานเขียนเฉพาะ `status` + `rider_id` + `qc_logs` **ไม่ snapshot ยอดใดๆ**
    (`bkk-rider-app/src/hooks/useJobActions.ts:173-179`)
  - ตอนจบงาน `onJobHandedOverCalcRiderFee` **คำนวณใหม่ทั้งหมด** แล้วเขียน `rider_fee`
    (`bkk-system/functions/index.js:3427-3439`) และ `getRiderPayout` ให้ `rider_fee`
    ชนะทุกตัว (`jobHelpers.ts:91-92`)
- **ผลกระทบ:** ตัวเลขบนการ์ดตอนกดรับไม่มีสถานะเป็นข้อเสนอในเชิงระบบ — มันเป็น
  "ค่าที่คำนวณล่าสุด" เท่านั้น และ UI **ไม่ได้บอกว่ามันเป็นประมาณการ** (การ์ดโชว์
  `+฿X` ด้วยไอคอนกระเป๋าเงิน ไม่มีคำว่า "ประมาณ" — `IncomingJobCard.tsx:30-32`)
- **ยืนยันด้วยเคสจริงแล้ว:** ไรเดอร์เห็น 182 ตอน 13:32:55 ได้ 157 ตอน 17:05:41 ไม่มีอะไรกันไว้

### F11 — เปลี่ยน `travel_mode` = รีไพรซ์ทุกงานที่ยังไม่จบย้อนหลัง เงียบสนิท (สูง — **สาเหตุของเคสนี้**)

- **อาการ:** แอดมินสลับ `settings/logistics_rates.travel_mode` แล้วงานที่ไรเดอร์รับไปแล้ว
  ถูกคิดเงินใหม่ด้วยฐานการวัดคนละแบบตอนปิดจ๊อบ ไรเดอร์เสีย 25 บาทโดยไม่มีใครแจ้ง
- **หลักฐาน:**
  - `getLogisticsRates` อ่าน `travel_mode` **สดจาก DB ทุกครั้งที่ถูกเรียก** และอ่านจาก
    **root ของ node เท่านั้น** ไม่แยกตามยานพาหนะ (`bkk-system/functions/index.js:468`)
  - `computeRiderFee` ส่งค่านั้นเข้า `fetchDrivingDistance` เป็น `travelMode` ของการวัดที่ใช้
    **คิดเงิน** (`index.js:628`) แล้วผล `route.distance_km` เข้า `feeFromRates` ตรงๆ (`:663`)
  - `onJobHandedOverCalcRiderFee` ไม่มีเงื่อนไขใดเทียบกับฐานที่ estimate เคยใช้
    (`index.js:3427-3439`) — มันแค่คำนวณใหม่ทั้งหมด
  - UI ที่แก้ค่านี้คือช่องเดียวใน `bkk-system/src/pages/admin/GlobalSettings.tsx:41, 181, 207`
    **ไม่มีคำเตือนใดว่าการเปลี่ยนกระทบงานที่ค้างอยู่**
  - **ไม่มี trigger เมื่อ `settings/logistics_rates` เปลี่ยน** (ยืนยันแล้ว: ค้น
    `ref: "/settings` ใน `bkk-system/functions/*.js` ได้ผลลัพธ์ว่าง) — จึงไม่มีทั้งการแจ้งเตือน
    การ freeze และการบันทึกว่าค่าเก่าคืออะไร
- **ทำไมฉบับแรกมองข้าม:** §11 เขียน H2 ไว้ในความหมายของ "อัตราเปลี่ยน" คือ**จำนวนเงิน**
  (`base_fee` / `per_km`) แต่ `travel_mode` อยู่ใน node เดียวกันและ**ไม่ใช่อัตรา —
  มันคือวิธีวัดระยะทาง** ซึ่งกระทบตัวตั้งของสูตร ไม่ใช่ตัวคูณ
- **ผลกระทบ:** กระทบ**ทุกงานที่ค้างอยู่ทั้งกอง**พร้อมกัน ไม่ใช่งานเดียว และเป็นการเปลี่ยน
  ที่ตรวจย้อนหลังได้เฉพาะเมื่อ meta ทั้งสองก้อนยังอยู่ครบ — งานที่ยังไม่มี `rider_fee`
  ตอนที่ค่าเปลี่ยน จะไม่มีอะไรเทียบเลย

### F12 — หลังสลับโหมด เก็บเงินลูกค้ากับจ่ายไรเดอร์คนละฐานถาวร (สูง)

- **อาการ:** ค่าบริการที่เก็บลูกค้าคิดจากระยะรถยนต์ ส่วนค่ารอบที่จ่ายไรเดอร์คิดจากระยะ
  มอเตอร์ไซค์ ส่วนต่างเข้าบริษัทโดยไม่มีใครตัดสินใจเรื่องนี้
- **หลักฐาน:**
  - ค่ารอบอ่าน `travel_mode` จาก **`settings/logistics_rates`** (`index.js:453, 468`)
  - ค่าส่งลูกค้าอ่าน `travel_mode` จาก **`settings/store/delivery_pricing`** ซึ่งเป็นคนละ node
    (`bkk-frontend-next/functions/src/deliveryZones.ts:97` → `normalizeDeliveryConfig`;
    ฝั่ง client `app/hooks/useDeliveryManager.ts:849` ส่ง `deliveryConfig.travelMode`)
  - **การแก้ node หนึ่งไม่แตะอีก node** — ไม่มีอะไรผูกสองค่านี้เข้าหากัน
  - ตรวจกับเคสจริง: `pickup_fee` = 244 = `50 + (24.37 − 5) × 10` ตามสูตร
    `calculateZoneFee` (`deliveryZones.ts:142-149`) → **ลูกค้าถูกคิดที่ 24.37 กม. (DRIVE)**
    ขณะที่ไรเดอร์ได้เงินที่ 19.35 กม. (TWO_WHEELER)
- **ผลกระทบ:** margin ของทุกงาน Pickup กว้างขึ้นเงียบๆ ตั้งแต่ 16:57 น. ของวันนั้น
  อาจเป็นสิ่งที่ต้องการก็ได้ แต่ควรเป็นการตัดสินใจที่รู้ตัว ไม่ใช่ผลข้างเคียงของสวิตช์ตัวเดียว

### F2 — ไม่มี audit trail ของค่ารอบเลย (สูง)

- **อาการ:** ยอดเปลี่ยน แต่ไม่มีบรรทัดไหนบอกว่าเปลี่ยนจากเท่าไรเป็นเท่าไร เพราะอะไร ใครทำ
- **หลักฐาน:**
  - `onJobHandedOverCalcRiderFee` เขียน `rider_fee` + `rider_fee_meta` + `rider_fee_status`
    **ไม่มี `qc_logs`** (`bkk-system/functions/index.js:3431-3439`)
  - เทียบกับ trigger พี่น้องที่เขียน `qc_logs` ทุกครั้ง:
    `onReceiveMethodChanged` (`index.js:3095-3100`), `onPickupLocationChanged` (`index.js:3228-3236`),
    `recomputeCustomerPickupFee` ฝั่ง frontend (`bkk-frontend-next/functions/src/index.ts:640-650`)
  - `onRiderAssignedRecalcEstimate` ก็ **ไม่เขียน log** เช่นกัน (`index.js:3494-3509`) — เขียนทับ
    `rider_fee_estimate` เงียบๆ
  - เส้นทางเดียวที่มี before/after ครบคือ **คำแย้งหมุด** (`functions/pin-dispute.js:112-128` เก็บ
    `fee_before`/`fee_after`/`delta` และ `:199-200` เก็บ `distance_km_before`)
- **ผลกระทบ:** เวลาไรเดอร์ถาม ไม่มีใครตอบได้จากระบบ ต้องมานั่งอ่าน Cloud Functions log
  ซึ่งมีอายุจำกัดและไม่ใช่ของที่ทีมปฏิบัติการเปิดได้

### F3 — ระยะทางถูกวัดด้วย `TRAFFIC_AWARE` ทำให้เลขแกว่งได้เองโดยไม่มีอะไรพัง (กลาง — **ไม่ใช่สาเหตุของเคสนี้**)

> **ปรับระดับลงหลังได้ข้อมูลจริง** — ฉบับแรกจัดเป็น "สูง" และให้เป็นสมมติฐานอันดับหนึ่ง
> ข้อมูลจริงชี้ว่าสาเหตุคือ F11 (`travel_mode`) ข้อนี้ยังเป็นความเสี่ยงที่มีอยู่จริง
> แต่ขนาดของมันเล็กกว่าที่เขียนไว้มาก และวัดแยกจาก F11 ไม่ได้จากข้อมูลชุดเดียว

- **อาการ:** ยิง Routes API ตอน 13:32 กับตอน 17:05 ได้เส้นทาง (และระยะทาง) คนละค่าได้ ทั้งที่
  หมุดเดิม สาขาเดิม รถประเภทเดิม โหมดเดิม
- **หลักฐาน:** `routingPreference: "TRAFFIC_AWARE"` (`bkk-system/functions/index.js:372`)
  และค่าที่นำไปคิดเงินคือ `route.distanceMeters` ของเส้นทางที่ Google เลือกในรอบนั้น
  (`index.js:396-407`, ใช้ที่ `index.js:663` ผ่าน `feeFromRates` `index.js:563-567`)
- **ผลกระทบ:** ค่ารอบเป็นฟังก์ชันของเวลาที่ระบบบังเอิญยิง API ไม่ใช่ของงานอย่างเดียว
  ที่ `per_km` = 5 บาท (**อัตราจริงบน production** ดู §10) ระยะทางต่างกัน 2 กม. = เงินต่างกัน 10 บาท
- **ข้อจำกัดที่ต้องพูดตรงๆ:** ส่วนต่าง 5.02 กม. ของเคสนี้อธิบายด้วย `travel_mode` ได้ทั้งหมด
  แต่ **แยกไม่ออกว่ามีส่วนของ traffic jitter ปนอยู่เท่าไร** เพราะไม่มีการวัดซ้ำในโหมดเดียวกัน
  ณ สองเวลานั้น — จะรู้ได้ต้องเก็บงานที่ไม่มีการเปลี่ยน config คั่นแล้วเทียบ meta สองก้อน

### F4 — Fallback เงียบเป็น `min_fee` เมื่อ Routes API ล้ม (สูง)

- **อาการ:** API ล้ม/ช้าเกิน 8 วิ/หาพิกัดไม่เจอ → ค่ารอบกลายเป็น `min_fee` แบนๆ ไม่มีใครรู้
- **หลักฐาน:**
  - ไม่มีพิกัดลูกค้าหรือสาขา → `fee: rates.min_fee`, `distance_km: null`,
    `reason: "missing_customer_coords" | "missing_branch_coords"` (`index.js:617-626`)
  - Routes API error → `fee: rates.min_fee`, `reason: "routes_api_<error>"` (`index.js:628-638`)
  - error ที่เป็นไปได้: `api_key_missing` (`:354-357`), `http_<status>` (`:391-394`),
    `no_route` (`:397-402`), `timeout` (abort 8 วิ `:378-379`, `:410-412`), `fetch_exception` (`:414-415`)
  - **ไม่คิด haversine** โดยตั้งใจ (คอมเมนต์ `:573-576`) — ต่างจากฝั่งค่าส่งลูกค้าที่ตก haversine×1.3
- **ตามย้อนหลังได้ไหม: ได้** — `reason` ถูก persist ลง `rider_fee_meta` / `rider_fee_estimate_meta`
  ผ่าน `riderFeeMeta()` (`index.js:697-705`) และมีสคริปต์ audit ที่อ่านฟิลด์นี้อยู่แล้ว
  (`bkk-system/scripts/audit-rider-wallet.cjs:128-140`, สรุปการกระจายของ reason ที่ `:198-218`)
- **แต่ไม่มีใครเห็นตอนเกิด** — ไม่มี UI ไหนใน 3 repo แสดง `reason` ให้แอดมินหรือไรเดอร์
  (grep `reason` ใน `bkk-system/src` และ `bkk-rider-app/src` ไม่พบผู้อ่าน `rider_fee_meta.reason`)

### F5 — `job.rider_fee || 150` hardcode ในหน้าจ่ายเงิน 2 หน้า (สูง)

- **อาการ:** งานที่ไม่มี `rider_fee` ถูกจ่าย 150 บาทแบน โดยตัวเลขนี้ไม่ได้มาจาก config ใดๆ
- **หลักฐาน:**
  - `bkk-system/src/pages/finance/components/RiderSettlements.tsx:39` (ข้อความ confirm),
    `:50` (amount ของ transaction), `:77` (batch), `:138` (ตัวเลขบนหน้าจอ)
  - `bkk-system/src/pages/finance/SettlementPage.tsx:45` (amount), `:115` (ตัวเลขบนหน้าจอ)
  - ฝั่งไรเดอร์ก็มี: `bkk-rider-app/src/components/history/HistoryTab.tsx:46` (ยอดรวมรายได้),
    `:136` (ตัวเลขต่อแถว)
- **ค่าคงที่ 150 นี้ไม่ปรากฏใน config ใดเลย** — `DEFAULT_LOGISTICS_RATES.min_fee` คือ **100**
  (`bkk-system/functions/index.js:339` และ `src/pages/admin/GlobalSettings.tsx:14`)
- **มีเส้นทางที่ทำถูกแล้วให้เทียบ:** `scripts/settle-pending-rider-fees.cjs:18-19` เขียนไว้ชัดว่า
  "จ่ายเฉพาะใบที่ `rider_fee` เป็นเลขจริง > 0 — **ไม่มี fallback 150**"
- **ผลกระทบ:** ถ้ายอดที่อนุมัติคือ **150 พอดี** สาเหตุคือ "ไม่มี `rider_fee`" ไม่ใช่ "คำนวณได้ 150"
  ซึ่งเป็นคนละบั๊กกันคนละเรื่อง

### F6 — สองหน้าจอ settlement ทำงานคนละแบบ และตัวหนึ่งไม่ atomic (กลาง-สูง)

- **อาการ:** จ่ายค่ารอบได้จากสองหน้า เงื่อนไข filter คนละชุด และหน้าหนึ่งอาจ mark ว่าจ่ายแล้ว
  โดยไม่มีแถวเงินเข้ากระเป๋า
- **หลักฐาน:**
  - `RiderSettlements.tsx:24-35` filter สถานะ `Pending QC | Completed | Waiting for Handover`
    → เขียนแบบ **atomic multi-path** (`:44-57`)
  - `SettlementPage.tsx:18` filter สถานะ `Delivered | Completed` (คนละชุด!) →
    เขียน `rider_fee_status='Paid'` ก่อน (`:41`) **แล้วค่อย** `logTransaction` แยกอีกครั้ง (`:48-55`)
    — ถ้าอันหลังล้ม งานขึ้นว่าจ่ายแล้วแต่กระเป๋าไรเดอร์ไม่ได้เงิน
- **ผลกระทบ:** ประวัติปัญหานี้มีจริงแล้ว — `scripts/settle-pending-rider-fees.cjs:11-15` เล่าว่า
  ปุ่มอนุมัติทั้งหมดจ่ายไป 121 ใบ เหลือค้าง 69 ใบ (24,134 บาท) เพราะ filter ของหน้าไม่ครอบ

### F7 — RTDB rules ล็อกตัวเลขเงิน แต่ไม่ล็อก meta / status ที่ตัวเลขพึ่งพา (กลาง)

- **อาการ:** ไรเดอร์ที่ถืองานเขียนฟิลด์ข้างเคียงของค่ารอบได้จากเบราว์เซอร์ตรงๆ
- **หลักฐาน** (`bkk-frontend-next/database.rules.json`):
  - `$jobId` `.write` เปิดให้ไรเดอร์ที่ `approval_status === 'Active'` และเป็นเจ้าของงาน (`:64`)
  - มี `.validate` กันเฉพาะ: `pickup_fee` (`:71-73`), `rider_fee` (`:74-76`),
    `rider_fee_estimate` (`:77-79`), `original_price` (`:68-70`), `uid` (`:65-67`),
    `applied_coupon(s)` (`:80-100`)
  - **ไม่มี `.validate`** สำหรับ: `rider_fee_estimate_meta`, `rider_fee_meta`, `rider_fee_status`,
    `rider_fee_breakdown`, `settled_at`, `rider_fee_discount`, `adjustments`
  - `rider_fee_estimate_meta.fee_by_vehicle` คือ**สิ่งที่แอปโชว์เป็นอันดับสอง**
    (`bkk-rider-app/src/utils/jobHelpers.ts:95-99`) → เขียนได้ = ปั่นเลขที่โชว์ได้
  - `rider_fee_status` คือ**คิว settlement** (`RiderSettlements.tsx:30`) → เขียนได้ = ดัน/ถอนตัวเองออกจากคิวได้
  - `final_price` / `price` / `net_payout` เปิดให้ไรเดอร์เขียนได้โดยตั้งใจ (`:101-109`) เพราะ
    inspection ต้อง recompute (`bkk-rider-app/src/pages/RiderApp.tsx:198-204`)
- **ผลกระทบ:** ไม่กระทบเคสนี้โดยตรง (183→150 เป็นการ**ลด** ไม่ใช่การปั่นขึ้น) แต่เป็นช่องที่
  เปิดอยู่และควรรู้ก่อนขยายกองไรเดอร์

### F8 — ค่ารอบไม่สะท้อนระยะวิ่งจริง (one-way, ไม่มี multi-stop) (กลาง — เชิงนโยบาย)

- **หลักฐาน:** `computeRiderFee` เรียก `fetchDrivingDistance(custCoords, branchCoords, ...)`
  **ครั้งเดียว** ทิศทางลูกค้า→สาขา (`bkk-system/functions/index.js:628`) แต่ไรเดอร์วิ่งจริง
  สาขา→ลูกค้า→สาขา — ชดเชยด้วย `base_fee` + clamp `min/max` เท่านั้น
- **หลักฐานเพิ่ม:** ไม่มีระบบ multi-stop — `computeRiderFee` รับ job เดียว (`:597`)
- **ผลกระทบ:** ไม่ใช่บั๊ก แต่เป็นสมมติฐานเชิงราคาที่ต้องอธิบายให้ไรเดอร์เข้าใจตั้งแต่วันแรก
  (ยืนยันข้อ 8 ของ survey 31 ส.ค.)

### F9 — ระยะทางฝั่งลูกค้ากับฝั่งไรเดอร์วัดคนละวิธี และฝั่งลูกค้าไม่เก็บหลักฐาน (กลาง)

- **หลักฐาน:**
  - ค่าส่งลูกค้าตอน checkout: **เบราว์เซอร์** ยิง `computeRouteMatrix` เอง
    (`bkk-frontend-next/app/hooks/useDeliveryManager.ts:242`) ส่ง `pickupDistanceKm` มาให้ server
    (`:530`) → server รับถ้าไม่ต่ำกว่า haversine×1.3 เกินครึ่ง (`functions/src/index.ts:1374-1385`)
  - ค่าส่งลูกค้าตอน**คิดใหม่** (หมุดขยับ/เปลี่ยนวิธีรับ): ใช้ **haversine × 1.3 ล้วน**
    ไม่ยิง Routes เลย (`functions/src/index.ts:563`)
  - ค่ารอบไรเดอร์: server ของ **bkk-system** ยิง `computeRoutes` เอง (`index.js:359`)
  - **`pickup_fee_meta` ถูกเขียนเฉพาะตอนคิดใหม่** (`functions/src/index.ts:633-638`)
    — job payload ตอนสร้างงานเขียนแค่ `pickup_fee` (`:1863`) **ไม่เก็บระยะทางที่ใช้คิด**
- **ผลกระทบ:** งานที่ไม่เคยถูกแก้หมุดจะ**ไม่มีหลักฐานเลย**ว่าค่าบริการ 244 บาทมาจากกี่กิโลเมตร
  ตรวจสอบย้อนหลังไม่ได้ และเทียบกับระยะทางฝั่งไรเดอร์ไม่ได้

### F10 — แอปไรเดอร์เล่าเรื่องค่ารอบไม่ตรงกันภายในหน้าจอเดียว (ต่ำ แต่กระทบความเชื่อใจโดยตรง)

- **หลักฐาน:** ในแท็บประวัติ แถวในลิสต์แสดง `job.rider_fee || 150` (`HistoryTab.tsx:136`)
  แต่ sheet ที่เปิดจากแถวเดียวกันเช็ค `Number.isFinite(fee) && fee > 0`
  (`HistoryJobSheet.tsx:85-86`) แล้วขึ้นว่า **"งานนี้ยังไม่ได้กำหนดค่ารอบ — ติดต่อแอดมิน"** (`:232`)
- **ผลกระทบ:** งานที่ไม่มี `rider_fee` โชว์ "+฿150" ในลิสต์ แล้วบอกว่า "ยังไม่ได้กำหนดค่ารอบ"
  เมื่อกดเข้าไป — และยอดรวมรายได้ของวัน (`HistoryTab.tsx:46`) นับ 150 นั้นเข้าไปด้วย

---

## 3. หัวข้อ 1 — Inventory: จุดคำนวณ/ประกอบยอดค่ารอบทั้งหมด

### 3.1 ตัวคำนวณจริง (pure/near-pure)

| # | path:line | ฟังก์ชัน | รันที่ไหน | input | อ่าน input จากไหน | output |
|---|---|---|---|---|---|---|
| C1 | `bkk-system/functions/index.js:563-567` | `feeFromRates(rates, distanceKm)` | Cloud Function (server) | rate card + ระยะทาง กม. | ผู้เรียกส่งให้ | คืนค่า `Math.round(clamp(base+per_km*d, min, max))` — ไม่เขียน DB |
| C2 | `bkk-system/functions/index.js:597-681` | `computeRiderFee(db, job, options)` | Cloud Function | job, `options.vehicleType`, `options.originCoords` | rate card จาก `settings/logistics_rates` (`:602-605`) · พิกัดลูกค้าจาก job (`:610`) · พิกัดสาขาจาก job/`settings/branches` (`:611`) · ระยะทางจาก Routes API (`:628`) | คืน `{fee, fee_by_vehicle, distance_km, duration_min, travel_mode, eta_*, vehicle, rates, reason}` — ไม่เขียน DB |
| C3 | `bkk-system/functions/index.js:718-721` | `computeRiderFeeForAssignee(db, job)` | Cloud Function | job | `riders/{job.rider_id}/vehicle_type` (`:687-691`) | เรียก C2 ต่อ |
| C4 | `bkk-system/functions/index.js:352-419` | `fetchDrivingDistance(origin, destination, travelMode)` | Cloud Function | พิกัด 2 จุด + โหมด | `process.env.GOOGLE_MAPS_API_KEY` (`:353`) | `{distance_km, duration_min}` หรือ `{error}` |
| C5 | `bkk-system/functions/index.js:452-470` | `getLogisticsRates(db, vehicleType)` | Cloud Function | ประเภทรถ | `settings/logistics_rates` (`:453`) → `by_vehicle.{v}` → ฟิลด์แบน root → `DEFAULT_LOGISTICS_RATES` (`:336-341`) ทีละฟิลด์ | rate card |
| C6 | `bkk-system/functions/index.js:697-705` | `riderFeeMeta(result)` | Cloud Function | ผลของ C2 | — | รูป meta ที่ทุกจุดเขียนเหมือนกัน |

### 3.2 จุดที่ **เขียนยอดลง DB**

| # | path:line | trigger / ผู้เรียก | เขียนฟิลด์ | เขียน qc_logs? |
|---|---|---|---|---|
| W1 | `bkk-system/functions/index.js:1796-1809` | `onNewTicketCreated` — `onValueCreated /jobs/{jobId}` (`:1649-1652`) | `rider_fee_estimate`, `rider_fee_estimate_meta` | **ไม่** |
| W2 | `bkk-system/functions/index.js:3090-3103` | `onReceiveMethodChanged` — `/jobs/{jobId}/receive_method` (`:3062-3066`) เฉพาะเมื่อเป็น `Pickup` | `rider_fee_estimate`, `rider_fee_estimate_meta` | **ใช่** (`:3095-3100`) |
| W3 | `bkk-system/functions/index.js:3216-3223` | `onPickupLocationChanged` — `/jobs/{jobId}/cust_lat` (`:3190-3193`) | `rider_fee_estimate`, `rider_fee_estimate_meta` | **ใช่** (`:3228-3236`) |
| W4 | `bkk-system/functions/index.js:3494-3502` | `onRiderAssignedRecalcEstimate` — `onValueWritten /jobs/{jobId}/rider_id` (`:3470-3474`) | `rider_fee_estimate`, `rider_fee_estimate_meta` | **ไม่** |
| W5 | `bkk-system/functions/index.js:3427-3439` | `onJobHandedOverCalcRiderFee` — `/jobs/{jobId}/status` เป็น `Pending QC` / `Sent to QC Lab` / `In Stock` (`:3382-3397`) | **`rider_fee`**, `rider_fee_meta`, `rider_fee_status='Pending'` (ถ้ายังไม่มี) | **ไม่** |
| W6 | `bkk-system/functions/index.js:4535-4543` | `reviewAmendment`/`consentAmendment` — ลูกค้ายกเลิกกลางทาง (`case "customer_request_cancel"`) | `rider_fee` = `settings/rider_compensation/customer_cancel_time_loss`, `rider_fee_status='Pending'`, `rider_fee_breakdown` | ผ่าน amendment log |
| W7 | `bkk-system/functions/pin-dispute.js:122-132` | `adminReviewPinDispute` (callable, CEO/MANAGER) | `rider_fee`, `rider_fee_meta`, `rider_fee_estimate`, `rider_fee_estimate_meta`, (+`transactions/{key}` ถ้าจ่ายไปแล้ว `:133-141`) | เก็บ `fee_before/fee_after/delta` ใน `pin_dispute` |
| W8 | `bkk-system/src/pages/finance/components/RiderSettlements.tsx:44-57`, `:66-86` | Finance กดอนุมัติ (client, admin) | `rider_fee_status='Paid'`, `settled_at`, `transactions/{key}` amount = `rider_fee \|\| 150` | ไม่ |
| W9 | `bkk-system/src/pages/finance/SettlementPage.tsx:41`, `:48-55`, `:69-73` | Finance กดอนุมัติ (อีกหน้า) | เหมือน W8 แต่**ไม่ atomic** | ไม่ |
| W10 | `bkk-system/scripts/settle-pending-rider-fees.cjs` | สคริปต์ maintenance (รันมือ, ต้อง `--apply`) | `rider_fee_status='Paid'`, `settled_at`, `transactions/{key}` — **ไม่มี fallback 150** (`:18-19`) | ไม่ |
| W11 | `bkk-rider-app/src/hooks/useJobActions.ts:362-364` | ไรเดอร์กดปิดจ๊อบ | `status='Pending QC'`, `completed_at`, **`rider_fee_status='Pending'`** — **ไม่เขียน `rider_fee`** โดยตั้งใจ (คอมเมนต์ `:355-361`) | ใช่ (ผ่าน `updateStatus` `:42-43`) |

### 3.3 จุดที่ **แสดงผลอย่างเดียว**

| # | path:line | อ่านจากฟิลด์ | หมายเหตุ |
|---|---|---|---|
| D1 | `bkk-rider-app/src/utils/jobHelpers.ts:89-101` | `rider_fee` → `rider_fee_estimate_meta.fee_by_vehicle[v]` → `rider_fee_estimate` → `0` | ตัวเลือกกลางของแอปไรเดอร์ |
| D2 | `bkk-rider-app/src/components/home/IncomingJobCard.tsx:31` | D1 | **การ์ดกองงาน — เลขที่ไรเดอร์เห็นตอนตัดสินใจรับ** |
| D3 | `bkk-rider-app/src/pages/JobDetailPage.tsx:160` | D1 | หน้ารายละเอียด (ทั้ง incoming และ active) |
| D4 | `bkk-rider-app/src/components/history/HistoryJobSheet.tsx:85-87, 207-235` | `rider_fee` + `rider_fee_status` เท่านั้น | ไม่ตก estimate — ถ้าไม่มี fee ขึ้นว่า "ยังไม่ได้กำหนดค่ารอบ" |
| D5 | `bkk-rider-app/src/components/history/HistoryTab.tsx:46, 136` | `rider_fee \|\| 150` | ยอดรวมรายได้ + แถวลิสต์ (ขัดกับ D4 — ดู F10) |
| D6 | `bkk-rider-app/src/utils/jobTimeline.ts:110-115` | `rider_fee_meta.distance_km` → `rider_fee_estimate_meta.distance_km` | ระยะทางที่โชว์ในไทม์ไลน์ |
| D7 | `bkk-system/src/pages/finance/components/RiderSettlements.tsx:138` · `SettlementPage.tsx:115` | `rider_fee \|\| 150` | หน้าจอ finance |
| D8 | `bkk-system/src/pages/finance/components/TransactionRepair.tsx:204-205` | `rider_fee` | แสดงเฉยๆ |
| D9 | `bkk-rider-app/src/hooks/useRiderData.ts:153-154` (ตาม survey 31 ส.ค.) | `transactions` ที่ `rider_id` ตัวเอง | ยอดกระเป๋า = ผลรวม ledger ไม่ได้อ่าน `rider_fee` |

### 3.4 Dead / ไม่เกี่ยวข้อง (ระบุพร้อมหลักฐาน)

- **`bkk-rider-app/functions/src/index.ts` ไม่มีการคำนวณค่ารอบเลย** — `grep -rn "rider_fee\|fare" functions/`
  ในรีโปนั้นได้ผลลัพธ์ว่าง; `onBroadcastJob` (`:347-404`) ส่ง push โดย**ไม่ใส่ยอดเงิน** (`:396-399`)
- **แอปไรเดอร์ไม่เรียก Routes API เลย** — เปิด Google Maps เป็น deep link เท่านั้น
  (`bkk-rider-app/src/hooks/useJobActions.ts:371-389`)
- **`bkk-rider-app/src/pages/Checkout.tsx`** มี `SERVICE_OPTIONS` 50/100/200 hardcode แต่เป็นหน้า demo
  กดยืนยันแล้วไม่เขียน DB (ยืนยันแล้วใน survey 31 ส.ค. ข้อ (ข) แถวสุดท้าย) — **ไม่เกี่ยวกับค่ารอบ**
- **`pickup_fee` / `rider_fee_discount` / `net_payout` ไม่ใช่เงินไรเดอร์** — เป็นเงินฝั่งลูกค้า
  ระบบแยกไว้ชัดและมีคอมเมนต์กำกับหลายจุด (`bkk-system/functions/index.js:707-713, 3084-3089, 3460-3464`;
  `bkk-frontend-next/functions/src/index.ts:536-542, 1864-1867`) — **ยอด 244 บาทในภาพหน้าจอคือ `pickup_fee` ไม่ใช่ค่ารอบ**

---

## 4. หัวข้อ 2 — แหล่งที่มาของระยะทางและ fallback

### 4.1 ระยะทางถูกคำนวณกี่วิธี — 4 วิธี

| วิธี | ใช้กับอะไร | path:line |
|---|---|---|
| Routes API `v2:computeRoutes` (server, bkk-system) | **ค่ารอบไรเดอร์** ทุกจุด | `bkk-system/functions/index.js:359-390` |
| Routes API `v2:computeRouteMatrix` (browser) | ค่าส่งลูกค้าตอน checkout | `bkk-frontend-next/app/hooks/useDeliveryManager.ts:242-260` |
| Routes API `v2:computeRoutes` (server, bkk-frontend-next) | `quotePickupServiceability` (หน้าแรก/แอป iOS) | `bkk-frontend-next/functions/src/index.ts:895-938`, ใช้ที่ `:1013` |
| Haversine × 1.3 | fallback ทุกฝั่งของค่าส่งลูกค้า + เลือกสาขาใกล้สุด + geofence | `bkk-frontend-next/functions/src/index.ts:281`, `:563`, `:1377-1391`, `:1019-1020`; client `app/hooks/useDeliveryManager.ts:840`, `:870-871`, `:876-877` |

**ค่ารอบไรเดอร์ไม่เคยใช้ haversine** — จงใจ มีคอมเมนต์กำกับที่ `bkk-system/functions/index.js:573-576`

### 4.2 เงื่อนไขการเลือกแต่ละ branch (ค่ารอบไรเดอร์)

```
computeRiderFee (index.js:597)
 ├ อ่าน rate card ทั้ง 2 คัน (:602-605)  → rates = ของ vehicleType ที่ผู้เรียกส่งมา (:606)
 ├ custCoords = options.originCoords ?? resolveCustomerCoords(job)        (:610)
 │    resolveCustomerCoords ไล่ 5 ชื่อฟิลด์: cust_lat/lng → customer_lat/lng
 │    → pickup_lat/lng → pickup_location.{lat,lng} → customer.{lat,lng}   (:542-556)
 ├ branchCoords = resolveBranchCoords(db, job)                            (:611)
 │    job.branch_details.{lat,lng} → settings/branches/{branch_id}
 │    → สาขา isActive!==false ตัวแรก → null                              (:496-533)
 ├ ถ้า custCoords หรือ branchCoords เป็น null → fee = min_fee, distance_km = null,
 │    reason = missing_customer_coords | missing_branch_coords            (:617-626)
 ├ fetchDrivingDistance(cust → branch, rates.travel_mode)                 (:628)
 │    ถ้า route.error → fee = min_fee, distance_km = null,
 │    reason = "routes_api_" + error                                      (:629-638)
 ├ (ETA เท่านั้น) ถ้าโหมดของยานพาหนะจริงต่างจาก rates.travel_mode → ยิงรอบสอง (:640-660)
 └ fee = feeFromRates(rates, route.distance_km), reason = "calculated"    (:662-680)
```

### 4.3 Fallback ที่ทำงานเงียบ — **มี**

- **เงียบต่อผู้ใช้:** ไม่มี UI ไหนใน `bkk-rider-app/src` หรือ `bkk-system/src` อ่าน
  `rider_fee_meta.reason` / `rider_fee_estimate_meta.reason` มาแสดง — ไรเดอร์และแอดมินเห็นแต่ตัวเลข
- **ไม่เงียบต่อ log:** `console.error` ทุกเส้นทางของ `fetchDrivingDistance`
  (`:355`, `:392`, `:398-400`, `:411`, `:414`) และ `console.log` สรุปทุกครั้งที่เขียนยอด
  (`:1804-1806`, `:3239-3241`, `:3440-3442`, `:3503-3506`)
- **ดูย้อนหลังได้:** `reason` ถูก persist ผ่าน `riderFeeMeta()` (`:697-705`) ทุกจุดที่เขียนยอด
  → `rider_fee_meta.reason` / `rider_fee_estimate_meta.reason`
  → มีสคริปต์อ่านอยู่แล้ว `bkk-system/scripts/audit-rider-wallet.cjs:128-140`
  ซึ่งสรุปการกระจายของ reason และ flag ใบที่ `reason !== 'calculated'` (`:198-218`)

### 4.4 ระยะทางตอนแสดงยอดรับงาน vs ตอนคำนวณยอดจบงาน — **คนละการเรียก คนละเวลา**

- ตอนแสดงยอดรับงาน: ค่าที่ค้างอยู่ใน `rider_fee_estimate_meta` ซึ่งเขียนล่าสุดโดย W1/W2/W3/W4
- ตอนจบงาน: `onJobHandedOverCalcRiderFee` เรียก `computeRiderFeeForAssignee` **ใหม่ทั้งหมด**
  (`index.js:3430`) → ยิง Routes API รอบใหม่
- **ไม่มีโค้ดใดเปรียบเทียบสองค่านี้ ไม่มี guard ไม่มี warning ไม่มี log ส่วนต่าง**

### 4.5 จุดตั้งต้น (origin) ของการวัดระยะ

| จุดคำนวณ | origin | destination | path:line |
|---|---|---|---|
| ค่ารอบไรเดอร์ (ทุก W1-W5) | **หมุดลูกค้า** `cust_lat/cust_lng` | สาขา | `index.js:610-611`, `:628` |
| ค่ารอบหลังคำแย้งหมุดอนุมัติ (W7) | **พิกัดที่ไรเดอร์เช็คอินจริง** `checkpoints.rider_arrived.{lat,lng}` (snapshot) | สาขา | `pin-dispute.js:52-66` → `options.originCoords` `index.js:607-610` |
| ค่าส่งลูกค้าตอน checkout | สาขา active ที่ใกล้ที่สุด | หมุดลูกค้า | `bkk-frontend-next/functions/src/index.ts:1371-1372` |
| ค่าส่งลูกค้าตอนคิดใหม่ | สาขา active ที่ใกล้ที่สุด | หมุดลูกค้า | `functions/src/index.ts:562-563` |
| ETA ไรเดอร์ (ไม่ใช่เงิน) | ตำแหน่ง GPS ไรเดอร์สด | หมุดลูกค้า | `bkk-frontend-next/functions/src/riderEta.ts` |

**origin ของค่ารอบทุกจุดปกติเหมือนกันหมด (หมุดลูกค้า)** — ต่างกันทางเดียวคือคำแย้งหมุดที่อนุมัติแล้ว
**ตำแหน่ง GPS ของไรเดอร์ไม่เคยเข้าสูตรเงินเลย** ยกเว้นทางนั้นทางเดียว

### 4.6 Routes API key แต่ละ path

| path | ตัวแปร | ตั้งค่าที่ไหน |
|---|---|---|
| ค่ารอบไรเดอร์ (bkk-system functions) | `process.env.GOOGLE_MAPS_API_KEY` (`index.js:353`) | GitHub Secret ของ **bkk-system** → เขียนลง `functions/.env` โดย `.github/workflows/firebase-hosting-deploy.yml:173, 191` |
| `drivingDistanceKm` / `riderEta` / geocode (bkk-frontend-next functions) | `process.env.GOOGLE_MAPS_API_KEY` | GitHub Secret ของ **bkk-frontend-next** → `.github/workflows/deploy-functions.yml:69, 74` |
| Routes API จากเบราว์เซอร์ (checkout) | `process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (`app/hooks/useDeliveryManager.ts:232`, `app/hooks/useGoogleMaps.ts:50`) | Vercel env — **เป็น key ฝั่งเบราว์เซอร์ ปกติผูก HTTP referrer** |

- **ตอบไม่ได้จากโค้ด — ต้องดูใน Google Cloud Console:** ค่าจริงของ secret ทั้งสามตัวเป็น key ใบเดียวกันหรือไม่
  และแต่ละใบเปิด API ใด / restrict แบบใด
- **มีบันทึกเคสนี้ไว้แล้วใน `bkk-frontend-next/CLAUDE.md`** หัวข้อ "Cloud Functions env vars":
  ใส่ Browser key (auto-created by Firebase) ให้ Cloud Function → **Routes API ตอบ 403** ไม่ใช่ 401
  จึงไม่เข้า guard "key is not set" แล้วตกไป fallback เงียบๆ — ตรงกับรูปของ F4 พอดี
- **วิธีเช็คว่า path ค่ารอบโดนอาการนี้ไหม:** ดู Cloud Functions log ของ bkk-system หา
  `[routesApi] HTTP 403` (`index.js:392`) หรือดู `reason` ที่ขึ้นต้นด้วย `routes_api_http_`

---

## 5. หัวข้อ 3 — Inventory: ฟิลด์ที่เก็บยอดใน job document

### 5.1 job document เก็บที่ไหน

- **Source of truth เดียวคือ Firebase Realtime Database node `/jobs/{jobId}`** — ทั้งสามรีโปเขียน/อ่านที่นี่
  (`bkk-frontend-next/functions/src/index.ts` เขียนตอนสร้างงาน; `bkk-system/functions/index.js` triggers;
  `bkk-rider-app` เขียนตรงผ่าน rules)
- **ไม่ใช่ Firestore** — Firestore ในโปรเจกต์ใช้เฉพาะ search analytics
  (`bkk-frontend-next/CLAUDE.md` หัวข้อ "Search Analytics — Firestore" ระบุชัดว่าห้ามย้าย operational data มา)
- **`/jobs_archived/{jobId}`** — งานที่จบแล้วถูกย้ายไปที่นี่ (`bkk-system/functions/index.js:727-730`
  `TERMINAL_STATUSES`); `audit-rider-wallet.cjs:128-140` อ่าน `jobs` ก่อนแล้ว fallback `jobs_archived`
- **`/public_track/{jobId}`** — กระจกสาธารณะ **ไม่มีฟิลด์เงินไรเดอร์**: allowlist
  `bkk-frontend-next/functions/src/publicTrackFields.ts:71` เขียนคอมเมนต์กำกับไว้ตรงๆ ว่า
  "DO NOT CONFUSE WITH rider_fee / rider_fee_estimate"

### 5.2 ฟิลด์เงินไรเดอร์ทั้งหมด

| ฟิลด์ | ชนิด / หน่วย | เขียนตอนไหน | เขียนทับได้ไหม |
|---|---|---|---|
| `rider_fee_estimate` | number, บาทจำนวนเต็ม | **สร้างงาน** (W1) | **ใช่** — W2, W3, W4, W7 ทับได้ทุกตัว |
| `rider_fee_estimate_meta.distance_km` | number, กม. ปัด 2 ตำแหน่ง (`index.js:668`) | คู่กับ estimate | ใช่ |
| `rider_fee_estimate_meta.fee_by_vehicle.{motorcycle,car}` | number, บาท | คู่กับ estimate (`:667`) | ใช่ |
| `rider_fee_estimate_meta.rates` | object `{vehicle, base_fee, per_km, min_fee, max_fee, travel_mode}` | คู่กับ estimate | ใช่ |
| `rider_fee_estimate_meta.reason` | string enum: `calculated` \| `missing_customer_coords` \| `missing_branch_coords` \| `routes_api_*` | คู่กับ estimate | ใช่ |
| `rider_fee_estimate_meta.computed_at` | number, epoch ms (`:703`) | คู่กับ estimate | ใช่ |
| **`rider_fee`** | number, บาทจำนวนเต็ม | **จบงาน / ส่งมอบ** (W5) | **มี guard**: W5 ข้ามถ้ามีค่า > 0 แล้ว (`:3419-3425`, `:3412-3415`) · W4 ข้ามถ้ามีค่า (`:3492`) · **แต่ W6 และ W7 เขียนทับได้เสมอ** |
| `rider_fee_meta.*` | เหมือน estimate_meta | คู่กับ `rider_fee` (`:3433`) | ตาม `rider_fee` |
| `rider_fee_status` | string `Pending` \| `Paid` | ไรเดอร์เขียนตอนปิดจ๊อบ (W11) หรือ W5 ตั้งให้ | ใช่ — finance flip เป็น `Paid` (W8/W9/W10) |
| `rider_fee_breakdown` | object `{type, amount, reason, computed_at, source}` | เฉพาะเคสลูกค้ายกเลิกกลางทาง (W6, `:4537-4543`) | ใช่ |
| `settled_at` | number, epoch ms | finance กดจ่าย (W8/W9) | ใช่ |
| `pin_dispute` | object `{status, fee_before, fee_after, delta, distance_km_before, distance_km_after, ...}` | คำแย้งหมุด (`pin-dispute.js:112-121`) | ตาม state machine |

### 5.3 ฟิลด์เงินฝั่งลูกค้าที่**อยู่บนงานเดียวกัน** (อย่าสับสน)

`price` / `final_price` / `original_price` / `initial_customer_price` / `net_payout` /
**`pickup_fee`** (ยอด 244 ในภาพ) / `rider_fee_discount` / `applied_rider_promo` /
`pickup_fee_meta` (เขียน**เฉพาะ**ตอนคิดใหม่ — `bkk-frontend-next/functions/src/index.ts:633-638`) /
`accessory_items[]` / `adjustments[]`

### 5.4 ฟิลด์ที่ตั้งใจให้เป็น snapshot / freeze

| ฟิลด์ | เจตนา | ยังถูกเขียนทับได้ไหม |
|---|---|---|
| `original_price` | audit ราคา quote ตอนสร้างงาน | rules ล็อก non-admin (`database.rules.json:68-70`) · แอปไรเดอร์มีคอมเมนต์ห้ามทับ (`RiderApp.tsx:195-197`) — **ถือว่า freeze จริง** |
| `price_locked_amount` / `price_locked_until` | ยืนราคาตลาด 7 วัน | เขียนครั้งเดียวตอนสร้างงาน (`functions/src/index.ts:1859-1860`) |
| `rider_fee` | "เลขจริง" หลังส่งมอบ | **มี guard 2 ชั้นแต่ไม่ครบ** — W6/W7 ทับได้ (W7 มี ledger delta รองรับ, W6 ไม่มี) |
| `rider_fee_estimate` | ประมาณการก่อนรับงาน | **ไม่ถือว่า freeze เลย** — ทับได้ทุก event ไม่มี guard |
| **ยอดตอนกดรับงาน** | — | **ไม่มีฟิลด์นี้อยู่จริง** ← นี่คือหัวใจของเคสนี้ |

---

## 6. หัวข้อ 4 — Write paths: อะไรเขียนฟิลด์ยอดได้บ้าง

### 6.1 สรุปตาม actor

| actor | เขียน `rider_fee` ได้ไหม | เขียน `rider_fee_estimate` ได้ไหม | เขียน meta/status ได้ไหม |
|---|---|---|---|
| Cloud Function (Admin SDK, bkk-system) | **ได้** (W5, W6, W7) — bypass rules | **ได้** (W1-W4, W7) | ได้ |
| Cloud Function (bkk-frontend-next) | ไม่เขียน (แตะเฉพาะเงินลูกค้า) | ไม่เขียน | ไม่เขียน |
| Admin ผ่าน bkk-system UI | **ได้ตาม rules** แต่**ไม่มี UI ให้กรอกเลย** (grep ไม่พบ form ที่เขียน `rider_fee`) — เขียนได้ทางเดียวคือ Firebase Console | ได้ตาม rules, ไม่มี UI | ได้ — `rider_fee_status` (W8/W9) |
| Rider ผ่านแอป (client เขียน RTDB ตรง) | **ไม่ได้** — `.validate` `database.rules.json:74-76` | **ไม่ได้** — `:77-79` | **ได้ทั้งหมด** — ไม่มี validate |
| ลูกค้า / คนนอก | ไม่ได้ — `jobs/$jobId` `.write` ต้องเป็นไรเดอร์ Active ที่ถืองาน หรือ admin (`:64`, `:49`) | ไม่ได้ | ไม่ได้ |
| สคริปต์ maintenance | `settle-pending-rider-fees.cjs` เขียน `rider_fee_status` + `transactions` เท่านั้น **ไม่แตะ `rider_fee`** | ไม่ | ได้ |

### 6.2 กฎที่เกี่ยวข้อง (ยกมาตรงๆ)

`bkk-frontend-next/database.rules.json`:

```
:62-64   "$jobId": {
           ".read": "auth != null && (data.child('uid').val() === auth.uid || data.child('rider_id').val() === auth.uid || root.child('admins')...)",
           ".write": "auth != null && root.child('riders').child(auth.uid).child('approval_status').val() === 'Active'
                      && (data.child('rider_id').val() === auth.uid
                          || (!data.child('rider_id').exists() && newData.child('rider_id').val() === auth.uid))",

:74-76     "rider_fee":          { ".validate": "newData.val() === data.val() || root.child('admins').child(auth.uid).child('role').val() === 'admin'" },
:77-79     "rider_fee_estimate": { ".validate": "newData.val() === data.val() || root.child('admins').child(auth.uid).child('role').val() === 'admin'" },
:71-73     "pickup_fee":         { ".validate": "newData.val() === data.val() || ...admin" },
:101-109   "final_price"/"price"/"net_payout": { ".validate": "... || data.parent().child('rider_id').val() === auth.uid || ...admin" }
```

**คำตอบตรงคำถาม "ฝั่ง client เขียนฟิลด์ยอดเงินเองได้หรือไม่":**

- **ยอดค่ารอบทั้งสองตัว (`rider_fee`, `rider_fee_estimate`) — เขียนไม่ได้** กฎปิดไว้ถูกต้อง
- **แต่ฟิลด์ที่ไม่มี `.validate` เขียนได้ทั้งหมด** เพราะ `.write` ที่ `$jobId` เปิดกว้าง:
  `rider_fee_estimate_meta` (รวม `fee_by_vehicle` ที่แอปเอาไปโชว์), `rider_fee_meta`,
  `rider_fee_status`, `rider_fee_breakdown`, `settled_at`, `adjustments`
- **`final_price` / `price` / `net_payout` เปิดให้ไรเดอร์เขียนโดยตั้งใจ** (เงินลูกค้า ไม่ใช่เงินไรเดอร์)
  เพราะ inspection ต้อง recompute — `bkk-rider-app/src/pages/RiderApp.tsx:198-204`
- **การกดรับงานเขียนทั้ง object กลับ** (`runTransaction` คืน `{...current, ...}`
  `useJobActions.ts:173-179`) — ผ่าน validate ได้เพราะค่าเท่าเดิม (`newData.val() === data.val()`)
  แต่ถ้าวันหนึ่งมี client เวอร์ชันที่ถือ snapshot เก่า การเขียนทั้งก้อนแบบนี้คือรูปที่เสี่ยง

---

## 7. หัวข้อ 5 — Trace: เส้นทางของยอดตั้งแต่รับงานถึงจบงาน

| # | ช่วง | อ่านจาก | คำนวณใหม่ที่ไหน | เขียนลงฟิลด์ | ไรเดอร์เห็นเลขจากไหน |
|---|---|---|---|---|---|
| 0 | ลูกค้า checkout → `validateAndCreateOrder` | — | ราคาเครื่อง + `pickup_fee` (ไม่ใช่ค่ารอบ) | `jobs/{id}` payload (`functions/src/index.ts:1820-1884`) | — |
| 1 | งานถูกสร้าง | job ที่เพิ่งเขียน | **`computeRiderFee` ครั้งที่ 1** — ไม่รู้ยานพาหนะ → อัตรามอเตอร์ไซค์ (`index.js:593-595`, `:1799`) | `rider_fee_estimate` + meta (W1) | — |
| 2 | แอดมินรับเคส → status `Active Lead` | — | ไม่คิดใหม่ | — | — |
| 3 | ไรเดอร์เห็นในกองงาน | `getRiderPayout` → `fee_by_vehicle[รถของตัวเอง]` หรือ `rider_fee_estimate` | ไม่คิดใหม่ (แอปไม่คำนวณเลย) | — | **`IncomingJobCard.tsx:31`** ← เลข 183 น่าจะมาจากตรงนี้ |
| 4 | **กดรับงาน** | — | ไม่คิดตอนกด แต่การเขียน `rider_id` **จุดชนวน `onRiderAssignedRecalcEstimate`** | `status`, `rider_id`, `qc_logs` (`useJobActions.ts:173-179`) — **ไม่ freeze ยอด** | ยังเป็นเลขเดิมจนกว่า trigger จะเขียนเสร็จ |
| 4b | (อัตโนมัติ, ~วินาทีถัดมา) | `riders/{id}/vehicle_type` | **`computeRiderFee` ครั้งที่ 2** — Routes API รอบใหม่ (`index.js:3498`) | **เขียนทับ `rider_fee_estimate` + meta** (W4) | เลขบนหน้าจอ**เปลี่ยนได้ทันทีหลังกดรับ** โดยไม่มีการแจ้ง |
| 5 | ระหว่างทาง | — | ไม่คิดใหม่ — **เว้นแต่**แอดมินขยับหมุด (`cust_lat`) → **ครั้งที่ 3** (W3) หรือเปลี่ยนวิธีรับ → (W2) | `rider_fee_estimate` + meta | `JobDetailPage.tsx:160` |
| 6 | เช็คอินถึงลูกค้า | — | ไม่คิดใหม่ | `checkpoints.rider_arrived.{lat,lng,at,distance_m}` | ไทม์ไลน์ |
| 7 | ตรวจสภาพ + ส่งผล | — | recompute **เงินลูกค้า** เท่านั้น | `devices`, `final_price`, `price`, `net_payout` (`RiderApp.tsx:198-204`) | ไม่กระทบค่ารอบ |
| 8 | **ปิดจ๊อบ / ส่งมอบสาขา** | — | ไรเดอร์เขียน status → **จุดชนวน `onJobHandedOverCalcRiderFee`** | ไรเดอร์เขียน `status='Pending QC'`, `completed_at`, `rider_fee_status='Pending'` (`useJobActions.ts:362-364`) | — |
| 8b | (อัตโนมัติ) | `riders/{id}/vehicle_type` | **`computeRiderFee` ครั้งที่ 4 — Routes API รอบใหม่อีกครั้ง** (`index.js:3430`) | **`rider_fee`** + `rider_fee_meta` (W5) | **เลขบนหน้าจอเปลี่ยนเป็น `rider_fee` ทันที** เพราะ `getRiderPayout` ให้มันชนะ (`jobHelpers.ts:91-92`) ← จุดที่ 183 กลายเป็น 150 กว่า |
| 9 | Finance อนุมัติ | `job.rider_fee \|\| 150` | ไม่คิดใหม่ | `rider_fee_status='Paid'`, `settled_at`, `transactions/{key}` CREDIT | `HistoryJobSheet.tsx:207-218` "ค่ารอบเข้ากระเป๋าแล้ว" |
| 10 | (ถ้ามี) คำแย้งหมุดอนุมัติ | snapshot พิกัดเช็คอิน | **`computeRiderFee` ครั้งที่ 5** — origin เปลี่ยน (`pin-dispute.js` → `index.js:607-610`) | `rider_fee`, `rider_fee_estimate`, meta ทั้งคู่, + `transactions` delta ถ้าจ่ายไปแล้ว | `HistoryJobSheet` แถบคำแย้งหมุด |

### 7.1 **จุดที่ค่าเปลี่ยนได้ — 7 จุด**

| จุด | ต้องมีคนสั่งไหม | มี log ไหม | ผลต่อยอด |
|---|---|---|---|
| P1 สร้างงาน (W1) | ไม่ (อัตโนมัติ) | Cloud log เท่านั้น | ตั้งค่าเริ่มต้น |
| P2 เปลี่ยน `receive_method` เป็น Pickup (W2) | แอดมิน | `qc_logs` ✓ | estimate ใหม่ |
| P3 แอดมินขยับหมุด `cust_lat` (W3) | แอดมิน | `qc_logs` ✓ | estimate ใหม่ |
| **P4 ไรเดอร์กดรับงาน (W4)** | **ไม่ (อัตโนมัติทันทีที่ `rider_id` ถูกเขียน)** | **ไม่มี** | **estimate ใหม่ — Routes API รอบใหม่** |
| **P5 ไรเดอร์ปิดจ๊อบ (W5)** | **ไม่ (อัตโนมัติทันทีที่ status เปลี่ยน)** | **ไม่มี** | **`rider_fee` ใหม่ — Routes API รอบใหม่ และเป็นตัวที่จ่ายจริง** |
| P6 ลูกค้ายกเลิกกลางทาง ผ่าน amendment (W6) | แอดมินอนุมัติ | amendment log ✓ | `rider_fee` = ค่าชดเชยจาก settings |
| P7 คำแย้งหมุดอนุมัติ (W7) | CEO/MANAGER | `pin_dispute` before/after ✓ | `rider_fee` + `rider_fee_estimate` + ledger delta |

**P4 และ P5 คือสองจุดที่ไม่มีใครสั่ง ไม่มีใครเห็น และไม่มี log** — และ P5 คือจุดที่ตรงกับ
อาการของเคสนี้เป๊ะ (ยอดเปลี่ยนตอนจบงาน)

---

## 8. หัวข้อ 6 — Rounding, ขั้นบันได และการหักเงิน

### 8.1 การปัดเศษ

| จุด | วิธีปัด | ระดับ | path:line |
|---|---|---|---|
| ค่ารอบ (คำนวณจริง) | `Math.round` (ครึ่งขึ้น) **หลัง** clamp | **1 บาท** | `bkk-system/functions/index.js:566` |
| ค่ารอบเมื่อไม่รู้ระยะทาง | `Math.round(rates.min_fee)` | 1 บาท | `:564` |
| `distance_km` ที่เก็บใน meta | `Math.round(x*100)/100` | 0.01 กม. | `:668` |
| `duration_min` ที่เก็บ | `Math.round` | 1 นาที | `:669` |
| ค่าส่งลูกค้า | `Math.round(baseFare + chargeableKm*perKmRate)` | 1 บาท | `bkk-frontend-next/functions/src/deliveryZones.ts:147` |
| แสดงผลฝั่งไรเดอร์ | `Intl.NumberFormat('th-TH', {style:'currency', currency:'THB', minimumFractionDigits:0})` | ไม่ปัด — แค่ format | `bkk-rider-app/src/utils/formatters.ts:4-12` |

- **ฝั่งแสดงผลกับฝั่งคำนวณจริงปัดเหมือนกัน** เพราะฝั่งแสดงผลไม่ปัดเลย มันโชว์เลขที่ server เขียนมา
  (ไม่ได้ตั้ง `maximumFractionDigits` ไว้ — ถ้าวันหนึ่งมีเลขไม่ลงตัวมาถึง จะโชว์ทศนิยม 2 ตำแหน่ง
  แต่ทุกเส้นทางที่เขียน `rider_fee` ผ่าน `Math.round` อยู่แล้ว)
- **กับดักที่ต้องรู้:** `distance_km` ที่เก็บใน meta ถูกปัด 2 ตำแหน่ง (`:668`) แต่**เงินคิดจากค่าดิบ**
  ก่อนปัด (`:663` ใช้ `route.distance_km` ตรงๆ) → คำนวณย้อนกลับจาก meta อาจคลาดจากเลขจริง ±0.075 บาท
  (ไม่มีนัยยะกับเคสนี้ที่ต่างกัน 30 บาท)

### 8.2 ขั้นบันได / ค่าขั้นต่ำ-ขั้นสูง

- **ค่ารอบไรเดอร์ไม่มี tier** — เป็นเส้นตรง `base_fee + per_km * d` แล้ว clamp
  `[min_fee, max_fee]` (`index.js:565-566`)
- **อยู่ใน config ไม่ใช่ hardcode:** `settings/logistics_rates` (+`by_vehicle/{motorcycle,car}`)
  แก้ผ่าน UI `bkk-system/src/pages/admin/GlobalSettings.tsx:187-216`
- **default ที่ใช้เมื่อยังไม่ตั้ง — hardcode 2 ที่ ต้องตรงกัน:**
  - `bkk-system/functions/index.js:336-341` → `{base_fee: 60, per_km: 15, min_fee: 100, max_fee: 500}`
  - `bkk-system/src/pages/admin/GlobalSettings.tsx:11-16` → **ค่าเดียวกันเป๊ะ** (ตรวจแล้ว)
- **fallback ทีละฟิลด์:** `by_vehicle.{v}.{field}` → ฟิลด์แบนที่ root → default (`index.js:458-460`)
  — แปลว่าตั้ง `by_vehicle` ไม่ครบ ฟิลด์ที่ขาดจะไปหยิบของ root ซึ่ง UI เขียน**อัตรามอเตอร์ไซค์**
  ลงไว้เสมอ (`GlobalSettings.tsx:203-205`)
- **ค่าส่งลูกค้า (คนละก้อน)** มี tier แบบโซน: `flat` หรือ `distance` (`baseFare`, `freeRadius`,
  `perKmRate`, `maxFee`) — `bkk-frontend-next/functions/src/deliveryZones.ts:142-149`,
  default zone `:107-129`

### 8.3 ตรรกะ "หัก" ตอนจบงาน

- **ไม่พบตรรกะหักเงินไรเดอร์ตอนจบงานเลย** — ค้น `PENALTY` ทั้งสามรีโปเจอเพียง:
  - `bkk-system/functions/pin-dispute.js:83` — DEBIT PENALTY เมื่อคำแย้งหมุดที่**อนุมัติแล้ว**
    ทำให้ค่ารอบ**ลดลง** และงานนั้นจ่ายเข้ากระเป๋าไปแล้ว (มีเทส `test/pin-dispute.test.mjs:59`)
  - `bkk-rider-app/src/utils/walletLedger.ts:23,32` — แค่ประกาศหมวด/ป้ายภาษาไทย
  - `bkk-system/src/utils/transactionLogger.ts:11` — แค่ type
- **ไม่มีค่าปรับ ไม่มีค่าธรรมเนียม ไม่มีการหักคืนอัตโนมัติ**
- **WHT (ภาษีหัก ณ ที่จ่าย) หักตอน "ถอนเงิน" ไม่ใช่ตอนจบงาน** — `settings/accounting/rider_wht`
  (ยืนยันใน survey 31 ส.ค. ตาราง (ข) แถว `wht_amount`)
- **สิ่งที่ดู "เหมือนหัก" แต่ไม่ใช่:** ยอด `-฿244` ในภาพหน้าจอคือ `pickup_fee` — **เงินที่เก็บจากลูกค้า**
  ไม่ได้หักจากค่ารอบไรเดอร์ ระบบแยกสองก้อนนี้ชัดเจน (`index.js:707-713`)
- **ไรเดอร์เห็นอะไร:** ไม่เห็น breakdown ใดๆ — เห็นแค่ตัวเลขก้อนเดียว (`IncomingJobCard.tsx:31`,
  `JobDetailPage.tsx:160`, `HistoryJobSheet.tsx:217/226`)

### 8.4 config เปลี่ยนระหว่างงานยังไม่จบ → งานค้างใช้ค่าไหน

- **`settings/logistics_rates` เปลี่ยนแล้ว งานที่ค้างอยู่ยังโชว์เลขเก่า** จนกว่าจะมี trigger ตัวถัดไปยิง
  — **ไม่มี trigger บน `/settings/...` เลย** (ตรวจแล้ว: `grep 'ref: "/settings\|ref: "settings'`
  ใน `bkk-system/functions/*.js` ได้ผลลัพธ์ว่าง)
- **แต่ยอดที่จ่ายจริงใช้ค่าใหม่เสมอ** เพราะ `rider_fee` ถูกคำนวณตอนจบงาน (W5) ด้วย rate card ที่อ่านสดจาก DB
- **แปลว่า:** แอดมินแก้อัตราตอนบ่าย งานที่ไรเดอร์รับไปตอนเช้าจะได้เงินตามอัตราใหม่
  **โดยที่ตัวเลขบนหน้าจอไรเดอร์ยังเป็นของอัตราเก่ามาตลอด** — เป็นสาเหตุที่เป็นไปได้ของเคสนี้ (H2 ใน §10)

---

## 9. หัวข้อ 7 — Audit trail

### 9.1 มีการบันทึกค่าเดิม/ค่าใหม่/เวลา/ผู้แก้ ตอนยอดเปลี่ยนหรือไม่

**ตอบตรงๆ: ไม่มี สำหรับเส้นทางหลัก**

| จุดเปลี่ยน | ค่าเดิม | ค่าใหม่ | เวลา | ผู้แก้ | qc_logs |
|---|---|---|---|---|---|
| P1 สร้างงาน | — | ✓ (`rider_fee_estimate`) | ✓ `meta.computed_at` | — | **ไม่** |
| P2 เปลี่ยนวิธีรับ | **ไม่มี** | ✓ | ✓ | "System" | ✓ (`index.js:3095-3100`) |
| P3 หมุดขยับ | **ไม่มี** | ✓ | ✓ | "System" | ✓ (`index.js:3228-3236`) |
| **P4 กดรับงาน** | **ไม่มี** | ✓ (ทับของเดิม) | ✓ `meta.computed_at` | **ไม่มี** | **ไม่** |
| **P5 ปิดจ๊อบ** | **ไม่มี** | ✓ (`rider_fee`) | ✓ `meta.computed_at` | **ไม่มี** | **ไม่** |
| P6 ยกเลิกกลางทาง | **ไม่มี** | ✓ | ✓ | ✓ (amendment) | ผ่าน amendment |
| **P7 คำแย้งหมุด** | **✓ `fee_before`** | **✓ `fee_after`** | ✓ | ✓ `reviewer` | + `delta` + ledger row |

**P7 คือรูปแบบที่ถูกต้องรูปเดียวในระบบ** — `pin-dispute.js:112-128` เก็บ before/after/delta,
`:199-200` เก็บ `distance_km_before`, และถ้าจ่ายไปแล้วยังลง ledger ส่วนต่างให้ด้วย
(`settlementDelta` `:72-85`) พร้อมคอมเมนต์เจตนาที่ `:23-25`:
"งานที่จ่ายค่ารอบไปแล้ว ต้องลงส่วนต่างใน ledger ห้ามเขียนทับเงียบๆ"

**ข้อสำคัญ: `rider_fee_estimate` ไม่ถูกลบตอน P5** — W5 เขียนเฉพาะ `rider_fee`/`rider_fee_meta`
(`index.js:3431-3434`) ดังนั้น **ค่า estimate ล่าสุดก่อนจบงานยังอยู่บนงานจริง**
นี่คือหลักฐานชิ้นที่ดีที่สุดที่เรามีสำหรับเคสนี้ (แต่เป็นค่าหลัง P4 ไม่ใช่ค่าตอนที่ไรเดอร์เห็นครั้งแรก
ถ้า P4 เปลี่ยนมัน — ค่าเดิมก่อน P4 **หายถาวร**)

### 9.2 log ทั่วไปที่ใช้สืบย้อนได้

| log | อยู่ที่ไหน | เนื้อหา | path:line ที่ผลิต |
|---|---|---|---|
| `[onNewTicket] rider_fee_estimate for job {id}: ฿{fee} ({reason}, {km} km)` | Cloud Functions log, bkk-system | ยอด + reason + ระยะทาง | `index.js:1804-1806` |
| `[onRiderAssignedRecalcEstimate] {id}: rider {a} → {b}, estimate=฿{fee} ({vehicle} rates, {km} km)` | เดียวกัน | **บอกว่ากดรับแล้วเลขเป็นเท่าไร** | `index.js:3503-3506` |
| `[riderFee] Job {id}: ฿{fee} ({reason}, {km} km)` | เดียวกัน | **ยอดจ่ายจริง + เหตุผล + ระยะทาง** | `index.js:3440-3442` |
| `[riderFee] Job {id} already has rider_fee={x}, skip` | เดียวกัน | บอกว่าข้ามเพราะมีค่าแล้ว | `index.js:3421-3423` |
| `[onPickupLocationChanged] {id}: pin moved → rider_fee_estimate={fee}` | เดียวกัน | หมุดถูกขยับ | `index.js:3239-3241` |
| `[routesApi] HTTP {status}: {body}` / `Fetch timed out after 8s` / `No route in response` | เดียวกัน | **สาเหตุ fallback** | `index.js:392`, `:411`, `:398-400` |
| `[routesApi] GOOGLE_MAPS_API_KEY not configured` | เดียวกัน | คีย์หาย | `index.js:355` |
| `[recomputeCustomerPickupFee] {id}: fee=..., distance...` | Vercel log (bkk-frontend-next functions) | ค่าส่ง**ลูกค้า** | `functions/src/index.ts:661` |
| `qc_logs[]` บน job | **RTDB — ทีมปฏิบัติการเปิดดูได้** | เฉพาะ P2/P3/P6/P7 | ตามตาราง 9.1 |
| **ไม่มี Sentry / error tracking** ในทั้งสามรีโป | — | — | grep `sentry` ไม่พบ |

### 9.3 ถ้าจะสืบว่างาน `OID-MTIAI3FH-851` เกิดอะไรขึ้น ต้องดูที่ไหนบ้าง

**ขั้นที่ 0 — หา jobId ก่อน (สำคัญ: `OID-...` ไม่ใช่ RTDB key)**
- `OID-MTIAI3FH-851` คือ `ref_no` ที่ `validateAndCreateOrder` สร้าง
  (`bkk-frontend-next/functions/src/index.ts:1751-1753`, เขียนลง `ref_no` ที่ `:1821`)
- **`ref_no` ไม่มี index** — `database.rules.json:50-61` `.indexOn` ของ `/jobs` มีแค่
  `status, created_at, type, rider_id, agent_name, uid, cust_email, cust_phone, crm_customer_id, kyc_verified_at`
  → หาโดยกรองที่ admin UI หรือ query ด้วย `rider_id` แล้วไล่หา
- **ถอด timestamp จาก OID ได้:** `parseInt("MTIAI3FH", 36)` = `1788244329437`
  = **1 ก.ย. 2569 13:32:09 (+07)** ตรงกับ "สร้างเมื่อ" ในภาพหน้าจอ
- ถ้างานเดินไปถึงสถานะปลายทางแล้ว ให้หาใน `/jobs_archived/{jobId}` ด้วย
  (`bkk-system/functions/index.js:727-730`)

**ขั้นที่ 1 — เปิด RTDB ดู 12 ฟิลด์นี้บน `/jobs/{jobId}`**

```
rider_fee_estimate               ← ยอดประมาณการล่าสุด (ควรเป็น 183 ถ้า P4 ไม่ได้เปลี่ยนมัน)
rider_fee_estimate_meta.distance_km
rider_fee_estimate_meta.reason        ← "calculated" หรือ "routes_api_*" / "missing_*"
rider_fee_estimate_meta.rates         ← base_fee / per_km / min_fee / max_fee / travel_mode / vehicle
rider_fee_estimate_meta.fee_by_vehicle ← {motorcycle, car} ← เลขที่แอปโชว์จริง
rider_fee_estimate_meta.computed_at   ← เทียบกับเวลาที่ไรเดอร์กดรับ
rider_fee                        ← ยอดที่จ่ายจริง (~150 กว่า)
rider_fee_meta.distance_km       ← **เทียบกับ estimate_meta.distance_km = คำตอบของเคสนี้**
rider_fee_meta.reason
rider_fee_meta.rates
rider_fee_meta.computed_at
rider_fee_status / settled_at
```

**ขั้นที่ 2 — ฟิลด์ประกอบที่บอกว่าหมุด/สาขา/รถเปลี่ยนไหม**

```
cust_lat / cust_lng              ← หมุดปัจจุบัน
branch_details.{lat,lng} / branch_id / branch_name
rider_id → riders/{rider_id}/vehicle_type   ← ถ้าเป็น null ตอนกดรับ แต่ถูกตั้งทีหลัง = คนละ rate card
receive_method                   ← ต้องเป็น "Pickup"
checkpoints.rider_arrived.{lat,lng,at,distance_m}  ← ไรเดอร์ไปยืนตรงไหนจริง
qc_logs[]                        ← หา action "Rider Estimate Updated" (P2/P3) — ถ้าไม่มี แปลว่าหมุดไม่ได้ถูกขยับ
pickup_fee / pickup_fee_meta     ← pickup_fee_meta มีก็ต่อเมื่อหมุดเคยถูกขยับ
pin_dispute                      ← ถ้ามี = ค่าถูกคิดใหม่จากจุดเช็คอิน
```

**ขั้นที่ 3 — Cloud Functions log ของ bkk-system (region `asia-southeast1`)**

```
firebase functions:log --only onNewTicketCreated            --project bkk-apple-tradein
firebase functions:log --only onRiderAssignedRecalcEstimate --project bkk-apple-tradein
firebase functions:log --only onJobHandedOverCalcRiderFee   --project bkk-apple-tradein
firebase functions:log --only onPickupLocationChanged       --project bkk-apple-tradein
```
กรองด้วย jobId แล้วหาสามบรรทัด: `[onNewTicket] rider_fee_estimate for job ...`,
`[onRiderAssignedRecalcEstimate] ... estimate=฿...`, `[riderFee] Job ...: ฿...`
**ทั้งสามบรรทัดมี `(reason, km)` ครบ — สามบรรทัดนี้ตอบเคสนี้ได้ทั้งหมด**
เช็คบรรทัด `[routesApi]` ในช่วงเวลาเดียวกันด้วย (ตัวมันไม่มี jobId ต้องดูตามเวลา)

**ขั้นที่ 4 — ledger**
- `/transactions` หาแถวที่ `ref_job_id === jobId` → ดู `amount` ที่จ่ายจริง
- ถ้า `amount` = 150 เป๊ะ และ `rider_fee` ไม่มีค่า → เข้ากรณี F5 (fallback hardcode) ไม่ใช่การคำนวณ

**ขั้นที่ 5 — เครื่องมือที่มีอยู่แล้ว**
```
GOOGLE_APPLICATION_CREDENTIALS=... FIREBASE_DATABASE_URL=... \
  node bkk-system/scripts/audit-rider-wallet.cjs
```
หมวด 4 จะสรุปการกระจายของ `rider_fee_meta.reason` และ flag ทุกใบที่
`reason !== 'calculated'` หรือยอดจ่ายไม่ตรง `rider_fee` (`:198-218`)

**ขั้นที่ 6 — `settings/logistics_rates`**
- ดู `updated_at` ว่าถูกแก้ระหว่าง 13:32 ถึงเวลาที่ปิดจ๊อบหรือไม่ (`GlobalSettings.tsx:208`)
- **ค่านี้ไม่มีประวัติ** — ถ้าถูกแก้ ค่าเดิมหายไปแล้ว ต้องดูจาก `rates` ที่ค้างอยู่ใน
  `rider_fee_estimate_meta.rates` เทียบกับ `rider_fee_meta.rates` แทน ← **สองก้อนนี้คือ
  หลักฐานเดียวที่บอกได้ว่าอัตราเปลี่ยนระหว่างทางไหม**

---

## 10. หัวข้อ 8 — ค่าคงที่และ config ที่เกี่ยวข้อง

### 10.0 ค่าจริงบน production (อ่านจาก `settings/logistics_rates` 1 ก.ย. เย็น)

**ตารางถัดไปเป็นค่า default ในโค้ด ซึ่ง production ไม่ได้ใช้แล้ว** — ค่าที่ใช้จริงคือ:

```
by_vehicle.motorcycle : base_fee 60  | per_km 5 | min_fee 100 | max_fee 500
by_vehicle.car        : base_fee 100 | per_km 5 | min_fee 100 | max_fee 500
root (fallback)       : base_fee 60  | per_km 5 | min_fee 100 | max_fee 500
travel_mode           : TWO_WHEELER  (เปลี่ยนจาก DRIVE เมื่อ 1 ก.ย. 16:57:14)
```

- **`per_km` จริงคือ 5 ไม่ใช่ 15** ตาม default ในโค้ด — เลขแปลงค่ารอบเป็นระยะทางทุกที่ในรายงาน
  ที่คำนวณจาก default จึงผิด และถูกแก้แล้วในฉบับนี้
- root ถือค่าของ**มอเตอร์ไซค์** ตามที่ `GlobalSettings.tsx:203-205` เขียนไว้ตั้งใจ
- **`travel_mode` เก็บที่ root เท่านั้น ไม่มีใน `by_vehicle`** (`index.js:468`) — จึงเป็นสวิตช์
  ตัวเดียวที่กระทบทั้งระบบพร้อมกัน ดู F11

### 10.1 ตารางค่าคงที่ในโค้ด

| ค่า | ค่าปัจจุบันในโค้ด | อยู่ที่ไหน | ซ้ำซ้อนไหม |
|---|---|---|---|
| `base_fee` (ค่ารอบ) | 60 | `bkk-system/functions/index.js:337` · `src/pages/admin/GlobalSettings.tsx:12` | **ซ้ำ 2 ที่ — ตรงกัน ✓** (runtime อ่านจาก `settings/logistics_rates` ก่อนเสมอ) |
| `per_km` (ค่ารอบ) | 15 | `index.js:338` · `GlobalSettings.tsx:13` | **ซ้ำ 2 ที่ — ตรงกัน ✓** |
| `min_fee` (ค่ารอบ) | 100 | `index.js:339` · `GlobalSettings.tsx:14` | **ซ้ำ 2 ที่ — ตรงกัน ✓** |
| `max_fee` (ค่ารอบ) | 500 | `index.js:340` · `GlobalSettings.tsx:15` | **ซ้ำ 2 ที่ — ตรงกัน ✓** |
| **`150` fallback ค่ารอบตอนจ่าย** | 150 | `RiderSettlements.tsx:39,50,77,138` · `SettlementPage.tsx:45,115` · `bkk-rider-app/HistoryTab.tsx:46,136` | **hardcode 8 จุด ใน 3 ไฟล์ 2 รีโป — ไม่มีที่มาจาก config ใดเลย และไม่ตรงกับ `min_fee`=100** |
| timeout Routes API | 8000 ms | `index.js:379` | ที่เดียว |
| `travel_mode` (คิดเงิน — ค่ารอบไรเดอร์) | default `DRIVE`, **production = `TWO_WHEELER`** | `index.js:468, 483-486` (`normalizeTravelMode`) · UI `GlobalSettings.tsx:41,181,207` | เก็บที่ `settings/logistics_rates` root |
| `travel_mode` (คิดเงิน — **ค่าส่งลูกค้า**) | default `DRIVE` | `bkk-frontend-next/functions/src/deliveryZones.ts:97` (`settings/store/delivery_pricing`) · client `useDeliveryManager.ts:849` | **คนละ node กับของไรเดอร์ ไม่ผูกกัน — ดู F12** |
| `routingPreference` | `TRAFFIC_AWARE` (hardcode) | `index.js:372` | ที่เดียว — **ไม่มี config ให้ปิด** |
| ตัวคูณ fallback haversine | ×1.3 | `bkk-frontend-next/functions/src/index.ts:563, 1380, 1391, 1019` · `app/hooks/useDeliveryManager.ts:840` | **hardcode 5 จุด ใน 2 ไฟล์ — ค่าตรงกันทุกจุด ✓** (ไม่แตะค่ารอบไรเดอร์) |
| `baseFare` ค่าส่งลูกค้า | 50 | `functions/src/deliveryZones.ts:114` (+ mirror `app/utils/deliveryZones.ts`) | mirror — survey 31 ส.ค. ยืนยันว่าตรงกัน |
| `freeRadius` / `perKmRate` / `maxFee` ค่าส่งลูกค้า | 5 / 10 / 300 | `deliveryZones.ts:115-117` | mirror |
| `flatFee` โซนตะวันออก | 500 | `deliveryZones.ts:126` | ที่เดียว |
| ค่าชดเชยลูกค้ายกเลิกกลางทาง | **ไม่มี default โดยตั้งใจ** — throw ถ้าไม่ตั้ง | `index.js:4522-4533` (`settings/rider_compensation/customer_cancel_time_loss`) | **ตัวอย่างที่ทำถูก** — คอมเมนต์ `:4526-4529` อธิบายว่าลบ fallback 100 ทิ้งเพราะ hardcode ไม่สะท้อนนโยบาย |
| WHT | 3% | `riderWht.ts` mirror 3 ที่ (survey 31 ส.ค.) | ตรงกัน |

**ข้อสรุปของหัวข้อนี้ (แก้หลังได้ค่าจริง):** มีค่าที่ไม่ตรงกัน **สองคู่** ไม่ใช่คู่เดียว

1. `150` ในหน้าจ่ายเงิน กับ `min_fee` = `100` ในตัวคำนวณ — สองตัวนี้ควรเป็นเลขเดียวกันในเชิง
   ความหมาย ("ค่ารอบขั้นต่ำ") แต่ต่างกัน 50 บาท และตัวหนึ่งอยู่นอก config ทั้งหมด
2. **`travel_mode` สองตัวที่คนละ node** — ของไรเดอร์ (`settings/logistics_rates`) เป็น
   `TWO_WHEELER` แล้ว ของลูกค้า (`settings/store/delivery_pricing`) ยังเป็น `DRIVE`
   ทั้งที่ทั้งคู่ตอบคำถามเดียวกันว่า "เส้นทางนี้ยาวกี่กิโลเมตร" — ดู F12

---

## 11. สาเหตุที่เป็นไปได้ของเคส 182 → 157 — **ปิดครบทุกข้อแล้ว**

> ## สรุปผลตรวจ: ทั้ง 8 ข้อถูกตัดออก สาเหตุจริงคือ F11 (`travel_mode` ถูกสลับกลางทาง)
>
> หัวข้อนี้เก็บไว้ทั้งหมด **ไม่ลบทิ้ง** เพราะสิ่งที่มีค่าที่สุดของมันตอนนี้ไม่ใช่คำตอบ
> แต่คือ**บันทึกว่าเราคิดอะไรไว้ก่อนเห็นข้อมูล และพลาดตรงไหน** — ดู "บทเรียน" ท้ายหัวข้อ
>
> | ข้อ | ผล | ตัดออกด้วยฟิลด์ไหน |
> |---|---|---|
> | H1 จราจร `TRAFFIC_AWARE` | **ตัด** | ส่วนต่าง 5.02 กม. อธิบายด้วย `travel_mode` ได้ทั้งหมด — แต่ดู F3 เรื่องข้อจำกัด |
> | H2 อัตราเปลี่ยน | **ตัดในรูปที่เขียนไว้** | `base_fee`/`per_km`/`min`/`max` เท่ากันเป๊ะทั้งสอง meta |
> | H3 ยานพาหนะ | **ตัด** | `rates.vehicle` = motorcycle ทั้งคู่ · `riders/{id}/vehicle_type` = motorcycle |
> | H4 หมุดขยับ / สาขาเปลี่ยน | **ตัด** | `qc_logs` มีบรรทัดเดียวคือ `Accepted` ไม่มี `Rider Estimate Updated` · ไม่มี `pickup_fee_meta` · เช็คอินห่างหมุด 9 ม. |
> | H5 Routes API ล้ม | **ตัด** | `reason: "calculated"` ทั้งคู่ · `distance_km` เป็นเลขจริงทั้งคู่ |
> | H6 fallback `150` | **ตัด** | `rider_fee` = 157 เป็นค่าที่คำนวณจริง ไม่ใช่ 150 |
> | H7 เห็นเลขยานพาหนะอื่น | **ตัด** | `fee_by_vehicle.motorcycle` = 182 ตรงกับที่ไรเดอร์เห็น |
> | H8 คำแย้งหมุด / amendment | **ตัด** | ไม่มี `pin_dispute` · ไม่มี `rider_fee_breakdown` บนงานนี้ |

> **ส่วนที่เหลือของหัวข้อนี้คือข้อความเดิมก่อนได้ข้อมูล** เก็บไว้อ่านประกอบ
>
> **เลขอ้างอิงเดิมด้านล่างผิด** เพราะคำนวณจาก default `per_km 15` ขณะที่ production ใช้ `per_km 5`
> เลขที่ถูกคือ: **฿182 → 24.37 กม.** · **฿157 → 19.35 กม.** · ส่วนต่าง 25 บาท = **5.02 กม.**
> (ดู §10.0 สำหรับ rate card จริง)

> เลขอ้างอิงเดิม (ถ้า rate card เป็น default `base 60 / per_km 15 / min 100 / max 500`):
> ~~**฿183 → 8.20 กม.** · ฿150 → 6.00 กม. · ฿155 → 6.33 กม. · ฿160 → 6.67 กม.
> ส่วนต่าง ~30 บาท = ระยะทางต่างกัน ~2 กม.~~
> **ข้อกำกับเดิมที่เขียนว่า "ถ้า rate card จริงไม่ใช่ default ตัวเลขข้างบนใช้ไม่ได้ — ดู
> `rider_fee_estimate_meta.rates` ก่อน" กลายเป็นสิ่งที่ช่วยไว้จริง** เพราะ rate card จริงไม่ใช่ default

### H1 — ระยะทางจาก Routes API ต่างกันระหว่างสองรอบ (น่าจะเป็นที่สุด)

- **กลไก:** P5 ยิง Routes API ใหม่ (`index.js:3430` → `:628`) ด้วย `TRAFFIC_AWARE` (`:372`)
  เวลาต่างกันหลายชั่วโมง (สร้าง 13:32 → ปิดงานเย็น) → Google เลือกเส้นทางคนละเส้น →
  `distanceMeters` คนละค่า → เงินคนละเลข **โดยไม่มีอะไรผิดพลาดเลยสักอย่าง**
- **ยืนยัน/ตัดออกได้ด้วย:** เทียบ `rider_fee_estimate_meta.distance_km` กับ `rider_fee_meta.distance_km`
  — ถ้าต่างกัน ~2 กม. และ `reason` ของทั้งคู่เป็น `"calculated"` **จบ ยืนยัน H1**

### H2 — แอดมินแก้ `settings/logistics_rates` ระหว่างวัน

- **กลไก:** ไม่มี trigger เมื่ออัตราเปลี่ยน (§8.4) → กองงานยังโชว์เลขอัตราเก่า
  แต่ P5 อ่านอัตราสดตอนจบงาน (`index.js:602-605`)
- **ยืนยัน/ตัดออกได้ด้วย:** เทียบ `rider_fee_estimate_meta.rates` กับ `rider_fee_meta.rates`
  — ต่างกัน = ยืนยัน H2 · เหมือนกัน = ตัดออก
  (ดู `settings/logistics_rates/updated_at` ประกอบ — `GlobalSettings.tsx:208`)

### H3 — `riders/{id}/vehicle_type` ถูกตั้ง/เปลี่ยนหลังไรเดอร์กดรับ

- **กลไก:** ไรเดอร์คนแรก วันแรก — โปรไฟล์อาจยังไม่ได้ตั้งประเภทรถ
  → ตอนกดรับ `riderVehicleType` คืน `null` (`index.js:687-690`) → ใช้ rate card มอเตอร์ไซค์
  ฝั่งแอปก็ตกไป `rider_fee_estimate` เพราะ `riderVehicle` เป็น null (`jobHelpers.ts:96`)
  → แอดมินตั้ง `vehicle_type = car` ทีหลัง → P5 ใช้ rate card รถยนต์ซึ่งอาจต่ำกว่า
- **ยืนยัน/ตัดออกได้ด้วย:** `rider_fee_estimate_meta.rates.vehicle` vs `rider_fee_meta.rates.vehicle`
  — ต่างกัน = ยืนยัน · และดู `riders/{rider_id}/vehicle_type` ปัจจุบัน
- **หมายเหตุ:** `by_vehicle` ที่ไม่ได้ตั้งจะ fallback มาที่ค่าเดียวกันหมด (`index.js:458-460`)
  ดังนั้น H3 จะอธิบายส่วนต่างได้ก็ต่อเมื่อแอดมินกรอก `by_vehicle` ไว้จริง

### H4 — หมุดลูกค้าถูกขยับ (P3) หรือสาขาปลายทางเปลี่ยน

- **กลไก:** `cust_lat` เปลี่ยน → W3 คิด estimate ใหม่ · หรือ `branch_details` ไม่มีพิกัด
  แล้ว `resolveBranchCoords` ตกไปเลือก "สาขา active ตัวแรก" (`index.js:514-530`) คนละใบระหว่างสองรอบ
- **ยืนยัน/ตัดออกได้ด้วย:** หา `qc_logs` action `"Rider Estimate Updated"` /
  `"Pickup Fee Recalculated"` — **ถ้าไม่มีเลย ตัด H4 ออกได้ทันที** (P3/P2 เขียน log เสมอ)
  · และดูว่า `branch_details.lat/lng` มีค่าไหม

### H5 — Routes API ล้มที่รอบ P5 → ตกไป `min_fee`

- **กลไก:** timeout 8 วิ / 403 จากคีย์ที่ restrict / no_route → `fee = min_fee` (`index.js:629-638`)
- **เงื่อนไขที่ต้องจริงพร้อมกัน:** `min_fee` ที่ตั้งไว้ต้องเป็น "150 กว่า" (ไม่ใช่ default 100)
- **ยืนยัน/ตัดออกได้ด้วย:** `rider_fee_meta.reason` — ถ้าเป็น `routes_api_*` หรือ `missing_*`
  **ยืนยันทันที** และ `rider_fee_meta.distance_km` จะเป็น `null`
  · ประกอบกับ log `[routesApi] HTTP ...` ในช่วงเวลานั้น
- **มีประวัติของตระกูลนี้แล้ว:** `bkk-frontend-next/CLAUDE.md` บันทึกเคส Routes API 403
  จาก Browser key ที่ผูก HTTP referrer (7 ส.ค. 2569)

### H6 — งานไม่เคยมี `rider_fee` เลย แล้ว finance จ่ายด้วย fallback `150`

- **กลไก:** `onJobHandedOverCalcRiderFee` throw/ไม่ยิง (สถานะข้าม หรือ function error `:3443-3445`)
  → `rider_fee` ไม่มี → `RiderSettlements.tsx:50` จ่าย `Number(job.rider_fee || 150)` = **150 เป๊ะ**
- **ยืนยัน/ตัดออกได้ด้วย:** ถ้ายอดที่อนุมัติเป็น **150 พอดี** (ไม่ใช่ 152/155/158) และ
  `/jobs/{id}/rider_fee` ไม่มีค่า → **ยืนยัน H6** และเป็นคนละบั๊กกับ H1-H5 ทั้งหมด
- **คำในโจทย์ว่า "150 กว่าบาท" ทำให้ข้อนี้น่าจะไม่ใช่** แต่ต้องตัดออกด้วยตัวเลขจริง ไม่ใช่ด้วยความจำ

### H7 — ไรเดอร์เห็นเลขของยานพาหนะอีกคันตอนอยู่ในกองงาน

- **กลไก:** `getRiderPayout` เลือก `fee_by_vehicle[vehicleType]` ตาม `riders/{id}/vehicle_type`
  ที่ client อ่านมา (`useRiderData.ts:102` → `jobHelpers.ts:95-99`) ถ้าค่านี้ไม่ตรงกับที่ server
  ใช้ตอน P5 (เช่นแอดมินเพิ่งแก้ แต่แอปยังถือค่าเก่าใน state) เลขสองฝั่งจะไม่ตรงกัน
- **ยืนยัน/ตัดออกได้ด้วย:** ดู `rider_fee_estimate_meta.fee_by_vehicle` ทั้งสองค่า —
  ถ้า `{motorcycle: 183, car: ~155}` (หรือกลับกัน) และ `rider_fee` ตรงกับค่าใดค่าหนึ่งเป๊ะ
  **ยืนยัน H7** และแปลว่าไม่ใช่ปัญหาระยะทางเลย

### H8 — คำแย้งหมุด / amendment ถูกใช้กับงานนี้ (น่าจะน้อยที่สุด)

- **ยืนยัน/ตัดออกได้ด้วย:** ดูว่า `/jobs/{id}/pin_dispute` หรือ `rider_fee_breakdown` มีอยู่ไหม
  — ทั้งสองเส้นทางนี้เก็บ before/after ไว้ครบ ถ้าเป็นสาเหตุจะเห็นทันทีและอธิบายได้เอง

### บทเรียนจากการที่ 8 ข้อไม่มีข้อไหนถูก

1. **ผมแบ่งประเภทของ "config เปลี่ยน" ผิด** — H2 เขียนว่า "แอดมินแก้ `settings/logistics_rates`"
   ซึ่ง**ครอบคลุมสาเหตุจริงในเชิงข้อความ** แต่ตอนเขียนวิธียืนยันกลับสั่งให้ดูเฉพาะ
   `rates.base_fee` / `per_km` — เพราะในหัวคิดว่า "อัตรา" แปลว่า "จำนวนเงิน"
   **`travel_mode` อยู่ในก้อน `rates` เดียวกันและถูกเก็บลง meta ให้เรียบร้อยแล้ว
   ผมแค่ไม่ได้บอกให้ดูมัน** — วิธียืนยันที่แคบกว่าสมมติฐาน ทำให้สมมติฐานที่ถูกถูกตัดทิ้ง
2. **เลขที่คำนวณจาก default ทำให้เดาผิดทิศ** — จาก `per_km 15` ได้ว่าส่วนต่าง 30 บาท = 2 กม.
   ซึ่ง "เล็กพอจะเป็นจราจร" เลยดัน H1 ขึ้นเป็นอันดับหนึ่ง ค่าจริง `per_km 5` แปลว่าส่วนต่าง
   25 บาท = **5 กม.** ซึ่งใหญ่เกินกว่าจราจรจะอธิบาย **ลำดับความน่าจะเป็นทั้งชุดพลิกทันที
   เมื่อรู้ค่าคงที่ตัวเดียว** — เขียนสมมติฐานโดยอิง default ที่ยังไม่ได้ยืนยันจึงอันตราย
3. **สิ่งที่ช่วยไว้คือประโยคกำกับ ไม่ใช่ตัวสมมติฐาน** — บรรทัด "ถ้า rate card จริงไม่ใช่
   default ตัวเลขข้างบนใช้ไม่ได้ ให้ดู `rider_fee_estimate_meta.rates` ก่อน" คือสิ่งเดียว
   ที่ทำให้ไม่หลงทาง **การเขียนกำกับว่าตัวเลขตั้งอยู่บนสมมติฐานอะไร มีค่ากว่าตัวเลขเอง**
4. **ข้อมูลจริงชุดเดียวปิดได้ 8 ข้อใน 30 วินาที** ขณะที่การอ่านโค้ดทั้งวันปิดไม่ได้สักข้อ
   — ยืนยันสิ่งที่ §9.3 เขียนไว้เอง: meta สองก้อนคือคำตอบ ควรไปหยิบมันตั้งแต่แรก

---

## 12. สิ่งที่ตอบไม่ได้จากโค้ด — ต้องเปิดดูข้อมูลจริง

> **ข้อ 1-9 และ 12-14 ตอบแล้วในรอบสอง** (ดูหัวข้อ "คำตอบของเคส") ตารางเก็บไว้เพราะมันคือ
> รายการที่ใช้ได้ซ้ำกับเคสหน้า — คอลัมน์สุดท้ายบอกคำตอบของงานนี้
>
> | ข้อ | คำตอบสำหรับ `OID-MTIAI3FH-851` |
> |---|---|
> | 1 ยอดตอนกดรับ | **182** (ไม่ใช่ 183) จาก `fee_by_vehicle.motorcycle` |
> | 2 ยอดที่คำนวณตอนจบ | **157** · ยังไม่มีแถว `transactions` เพราะ `rider_fee_status` ยัง `Pending` |
> | 3 ระยะทางต่างกันไหม | **ต่าง** 24.37 → 19.35 กม. |
> | 4 Routes API ล้มไหม | **ไม่ล้ม** `reason: "calculated"` ทั้งคู่ |
> | 5 rate card เปลี่ยนไหม | **จำนวนเงินไม่เปลี่ยน แต่ `travel_mode` เปลี่ยน** `DRIVE` → `TWO_WHEELER` |
> | 6 ประเภทรถ | motorcycle ทั้ง meta ทั้งสองก้อนและใน `riders/{id}` |
> | 7 หมุดขยับไหม | **ไม่ขยับ** `qc_logs` มีแต่ `Accepted` |
> | 8 สาขาปลายทาง | ไม่มี `branch_details` ในผลที่ดึง — `resolveBranchCoords` ตกไปใช้ `settings/branches` |
> | 9 คิดจากหมุดที่ไปจริงไหม | **ใช่โดยบังเอิญ** — เช็คอินห่างหมุดลูกค้า **9 เมตร**, `is_within_zone: true` |
> | 12 `by_vehicle` กรอกไว้ไหม | **กรอกครบ** moto `base 60`, car `base 100`, `per_km 5` ทั้งคู่ |
> | 13 เวลากดรับ vs computed_at | กดรับ 13:32:55 · estimate เขียน 13:32:58 (**หลังกดรับ 3 วินาที** = W4 ไม่ใช่ W1) |
> | 14 อยู่ node ไหน | `/jobs` (ยังไม่ archive) |
>
> **ข้อ 10 (Cloud Functions log) และ 11 (Maps API key) ยังไม่ได้ตรวจ** — ไม่จำเป็นแล้ว
> เพราะ meta ตอบครบ แต่ยังมีค่าถ้าจะยืนยัน H1 แยกออกจาก F11 ในอนาคต



| # | คำถาม | ต้องดูที่ไหน / field ไหน |
|---|---|---|
| 1 | ยอดที่ไรเดอร์เห็นตอนกดรับคือ 183 จริงไหม และมาจากฟิลด์ไหน | `/jobs/{id}/rider_fee_estimate` และ `rider_fee_estimate_meta.fee_by_vehicle.{motorcycle,car}` — **แต่ค่าตอนก่อนกดรับหายถาวรถ้า P4 เขียนทับ** ต้องพึ่ง Cloud log `[onNewTicket] rider_fee_estimate for job ...` |
| 2 | ยอดที่อนุมัติจริงคือเท่าไรเป๊ะๆ | `/jobs/{id}/rider_fee` และ `/transactions` แถวที่ `ref_job_id === jobId` field `amount` |
| 3 | ระยะทางสองรอบต่างกันไหม | `rider_fee_estimate_meta.distance_km` vs `rider_fee_meta.distance_km` |
| 4 | Routes API ล้มไหม | `rider_fee_meta.reason` และ `rider_fee_estimate_meta.reason` (คาดหวัง `"calculated"`) |
| 5 | rate card ที่ใช้จริงคืออะไร และเปลี่ยนระหว่างทางไหม | `rider_fee_estimate_meta.rates` vs `rider_fee_meta.rates` · `/settings/logistics_rates` (+`updated_at`) |
| 6 | ประเภทรถของไรเดอร์ตั้งไว้เมื่อไร | `/riders/{rider_id}/vehicle_type` — **ไม่มีประวัติการเปลี่ยน** ต้องเทียบผ่าน `meta.rates.vehicle` แทน |
| 7 | หมุดลูกค้าเคยถูกขยับไหม | `/jobs/{id}/qc_logs[]` หา `action: "Rider Estimate Updated"` / `"Pickup Fee Recalculated"` · `pickup_fee_meta` มีอยู่ไหม |
| 8 | สาขาปลายทางที่ใช้คำนวณคือใบไหน | `/jobs/{id}/branch_details.{lat,lng}` · `branch_id` · `/settings/branches` |
| 9 | ค่ารอบถูกคิดจากหมุดที่ไรเดอร์ไปจริงหรือเปล่า | `/jobs/{id}/checkpoints.rider_arrived.{lat,lng,distance_m}` เทียบกับ `cust_lat/cust_lng` |
| 10 | timeline ของ trigger ทั้ง 3 ตัว | Cloud Functions log region `asia-southeast1` project `bkk-apple-tradein` — `onNewTicketCreated`, `onRiderAssignedRecalcEstimate`, `onJobHandedOverCalcRiderFee`, และบรรทัด `[routesApi]` |
| 11 | GitHub Secret `GOOGLE_MAPS_API_KEY` ของ bkk-system เป็นคีย์ใบไหน restrict อย่างไร | Google Cloud Console → Credentials (ดู Selected APIs ต้องมี Routes API และ Application restrictions ต้องเป็น None) |
| 12 | `settings/logistics_rates` มี `by_vehicle` กรอกไว้จริงไหม | `/settings/logistics_rates` — ถ้าไม่มี H3 ตกไปเกือบทั้งหมด |
| 13 | เวลาที่ไรเดอร์กดรับ vs เวลาที่ trigger P4 เขียนเสร็จ | `qc_logs[]` action `"Accepted"` timestamp vs `rider_fee_estimate_meta.computed_at` |
| 14 | งานนี้อยู่ `/jobs` หรือ `/jobs_archived` แล้ว | ลองทั้งสอง node |

---

## 13. ตัวเลือกทางแก้ (เสนอเป็นทางเลือก ไม่ฟันธง ไม่ลงมือ)

> ทั้งหมดยังไม่ได้ทำ และรายงานนี้ไม่ได้เลือกให้ — เรียงจากเล็กไปใหญ่
>
> **เพิ่มรอบสอง: กลุ่ม E ตรงกับสาเหตุจริงที่สุด** (F11/F12) กลุ่ม A-D ยังคงเดิมทุกข้อ

### กลุ่ม E — ปิดช่องที่ทำให้เคสนี้เกิด (เพิ่มหลังรู้สาเหตุ)

**E1. ตัดสินใจเรื่องงานที่ค้างอยู่ตอนนี้ก่อน (ไม่ใช่งานโค้ด)**
งานใบนี้ `rider_fee_status` ยัง `Pending` และอาจมีใบอื่นที่ปิดจ๊อบหลัง 16:57 วันนั้นแบบเดียวกัน
- วิธีหา: หางาน Pickup ที่ `rider_fee_meta.rates.travel_mode` ต่างจาก `rider_fee_estimate_meta.rates.travel_mode`
- ข้อดี: จ่ายให้ถูกก่อนที่ไรเดอร์จะเห็นเลขในกระเป๋า — ตอนนี้ยังทันเพราะยังไม่ settle
- ข้อเสีย: ต้องเขียนสคริปต์สแกน และต้องตัดสินใจเชิงนโยบายว่ายึดเลขไหน

**E2. `travel_mode` เข้าไปอยู่ใน "สิ่งที่ freeze ตอนกดรับ" ไม่ใช่แค่ค่าที่อ่านสด**
- ข้อดี: แก้ที่ต้นเหตุตรงๆ — งานที่รับไปแล้วคิดด้วยฐานเดิมเสมอ ไม่ว่าแอดมินจะแก้อะไร
- ข้อเสีย: ทับซ้อนกับ B1 (freeze ทั้งยอด) ซึ่งครอบคลุมกว่า — ทำ B1 แล้วไม่ต้องทำข้อนี้

**E3. ใส่คำเตือนในหน้า Global Settings ว่าการเปลี่ยน `travel_mode` กระทบงานที่ยังไม่จบ**
- ข้อดี: ถูกที่สุด แก้ที่ `GlobalSettings.tsx` ไฟล์เดียว ไม่แตะเงินใคร
- ข้อเสีย: เป็นการเตือน ไม่ใช่การป้องกัน · คนกดตอนรีบก็ยังกดผ่านอยู่ดี

**E4. ผูก `travel_mode` ของสองฝั่งเข้าหากัน หรือประกาศให้ชัดว่าตั้งใจให้ต่าง (F12)**
- ข้อดี: ปิดช่องที่เก็บลูกค้ากับจ่ายไรเดอร์คนละฐานโดยไม่มีใครตัดสินใจ
- ข้อเสีย: การผูกให้เท่ากันทำให้ค่าส่งลูกค้าลดลงทันทีทุกงาน = รายได้หาย
  ส่วนการปล่อยให้ต่างก็ต้องมีคนรับผิดชอบตัวเลข margin นั้นอย่างเป็นทางการ
  **เป็นการตัดสินใจเชิงธุรกิจ ไม่ใช่เชิงเทคนิค**

**E5. บันทึกประวัติการเปลี่ยน `settings/logistics_rates`**
ทุกวันนี้มีแค่ `updated_at` ค่าเดิมหายทันทีที่เขียนทับ
- ข้อดี: เคสหน้าจะตอบได้โดยไม่ต้องพึ่งว่า meta สองก้อนบังเอิญยังอยู่ครบ
- ข้อเสีย: โหนดใหม่ + rules ใหม่ + ต้อง deploy rules (ดูบทเรียน deploy-rules ใน CLAUDE.md)

### กลุ่ม A — ทำให้อธิบายได้ (ไม่เปลี่ยนเงินที่ใคร)

**A1. เขียน `qc_logs` ตอน `rider_fee` / `rider_fee_estimate` เปลี่ยน พร้อมค่าเดิม-ค่าใหม่-ระยะทาง-reason**
- ข้อดี: เล็กที่สุด ไม่เปลี่ยนตัวเลขใคร ตอบไรเดอร์ได้ทันทีในครั้งหน้า มีแบบให้ลอกอยู่แล้ว
  (`onPickupLocationChanged` `index.js:3228-3236` และ `pin-dispute.js:112-121`)
- ข้อเสีย: แก้อดีตไม่ได้ · `qc_logs` เป็น array ที่ prepend ทุกครั้ง ยาวขึ้นเรื่อยๆ

**A2. โชว์ `distance_km` + `reason` ให้ไรเดอร์เห็นบนงาน**
- ข้อดี: ไรเดอร์ตรวจสอบเองได้ว่าเลขมาจากกี่กิโล — `jobDistanceKm` มีอยู่แล้ว
  (`bkk-rider-app/src/utils/jobTimeline.ts:110-115`) แค่ยังไม่ผูกกับตัวเลขเงิน
- ข้อเสีย: ต้องแปล `reason` เป็นภาษาลูกค้า (`routes_api_timeout` ไม่ใช่คำที่ไรเดอร์ควรอ่าน)
  และการโชว์ระยะทางเชิญให้เถียงเรื่องระยะทางแทนเรื่องเงิน

**A3. เตือนเมื่อ `rider_fee` ต่างจาก `rider_fee_estimate` เกินเกณฑ์ (push หาแอดมิน + แถบในแอปไรเดอร์)**
- ข้อดี: จับเคสนี้ได้เองในอนาคตโดยไม่ต้องรอไรเดอร์บ่น · มีท่อ `pushToRider` / `dispatchAdminPush` อยู่แล้ว
- ข้อเสีย: ต้องเลือกเกณฑ์ (บาท? เปอร์เซ็นต์?) — เกณฑ์ผิดคือ alert ที่ไม่มีใครอ่าน

### กลุ่ม B — ทำให้ยอดนิ่ง

**B1. Freeze ยอดตอนกดรับ — เขียน `rider_fee_accepted` (+meta) ครั้งเดียว ตอน `rider_id` ถูกเขียน แล้วจ่ายตามนั้น**
- ข้อดี: ตรงกับหลักการที่โจทย์ยกมา ("ยอดตอนกดรับเป็นข้อเสนอที่ผูกพัน") · เข้ากับรูปที่ระบบทำอยู่แล้ว
  (มี guard "ไม่ทับถ้ามีค่าแล้ว" อยู่ 2 จุด `index.js:3420`, `:3492`)
- ข้อเสีย: หมุดผิด/ลูกค้าย้ายที่กลางทาง = ล็อกเลขที่ผิดไว้เหมือนกัน ต้องมีเส้นทางแก้
  (ซึ่ง `pin-dispute.js` เป็นเส้นทางนั้นอยู่แล้ว) · ถ้ายอดที่ freeze ต่ำกว่าที่ควร ไรเดอร์เสียเปรียบเงียบๆ แทน

**B2. จ่ายเป็น `max(ยอดตอนกดรับ, ยอดที่คำนวณตอนจบงาน)`**
- ข้อดี: ไรเดอร์ไม่มีทางเสียจากความผันผวนของ API/config · แก้ปัญหาความเชื่อใจตรงจุด
- ข้อเสีย: ต้นทุนขึ้นทางเดียว · ปั่นได้ถ้าใครควบคุมเวลาที่ trigger ยิงได้ · ไม่ได้แก้ที่ต้นเหตุ

**B3. คิดระยะทางครั้งเดียวต่องาน แล้วใช้ระยะนั้นตลอด (คิดใหม่เฉพาะเมื่อหมุด/สาขาเปลี่ยนจริง)**
- ข้อดี: ตัดความผันผวนของ `TRAFFIC_AWARE` ออกทั้งหมด · ลดค่า Routes API ลง 60-80%
  (จาก 5 ครั้ง/งาน เหลือ 1-2) · ยังปล่อยให้ rate card เปลี่ยนได้อิสระ
- ข้อเสีย: ระยะเก่าค้างถ้ามี event ที่ควรคิดใหม่แต่เราไม่ได้ดัก · ต้องนิยาม "หมุดเปลี่ยนจริง"
  (ขยับ 5 เมตรไม่ควรคิดใหม่)

**B4. เปลี่ยน `routingPreference` จาก `TRAFFIC_AWARE` เป็น `TRAFFIC_UNAWARE` เฉพาะการวัดที่ใช้คิดเงิน**
- ข้อดี: เล็กมาก (`index.js:372`) · ระยะทางเสถียรขึ้นมากเพราะไม่เลือกเส้นตามจราจร
  · ยังใช้ TRAFFIC_AWARE ต่อไปได้สำหรับ ETA ซึ่งเป็นที่ที่จราจรมีความหมายจริง
- ข้อเสีย: ยังไม่การันตีว่าเท่ากันทุกครั้ง (Google เปลี่ยนถนน/ข้อมูลได้) · ETA ที่คิดพร้อมกันในรอบเดียว
  จะแม่นน้อยลงถ้าไม่แยกการเรียก

### กลุ่ม C — ล้าง fallback ที่ไม่ควรมี

**C1. เอา `|| 150` ออกจากหน้าจ่ายเงินทั้ง 6 จุด แล้วบล็อกการจ่ายใบที่ไม่มี `rider_fee`**
- ข้อดี: ตรงกับกติกาที่ `settle-pending-rider-fees.cjs:18-19` ตั้งไว้แล้ว ("ไม่เดาเงิน")
  · ทำให้ปัญหา "trigger ไม่ยิง" ดังแทนที่จะกลบด้วยเลขปลอม
- ข้อเสีย: ใบที่ trigger พลาดจะค้างจ่าย ต้องมีเส้นทางให้แอดมินสั่งคำนวณใหม่ (`needsFeeRecovery`
  มีอยู่แล้วที่ `B2CWorkspacePage.tsx:109-111` / `MobileTicketDetail.tsx:281-283`)

**C2. ยุบสองหน้า settlement เหลือหนึ่ง และทำให้ atomic ทั้งหมด**
- ข้อดี: ปิด F6 (`SettlementPage.tsx:41` + `:48` ไม่ atomic) · filter ชุดเดียวเลิกทำใบตกหล่น
- ข้อเสีย: งานรื้อ UI ที่ finance ใช้อยู่ทุกวัน ต้องมีช่วงเปลี่ยนผ่าน

**C3. เติม `.validate` ให้ `rider_fee_estimate_meta` / `rider_fee_meta` / `rider_fee_status` / `rider_fee_breakdown` ใน `database.rules.json`**
- ข้อดี: ปิด F7 · เป็นการแก้ที่ไฟล์เดียว
- ข้อเสีย: `rider_fee_status` ถูกไรเดอร์เขียนโดยตั้งใจตอนปิดจ๊อบ (`useJobActions.ts:363`)
  ล็อกตรงๆ = ปิดจ๊อบไม่ได้ ต้องย้ายการเขียนไปฝั่ง trigger ก่อน · ต้อง deploy rules
  (**เตือน:** `deploy-rules.yml` แดงติดกันมาแล้วในอดีต — ดู CLAUDE.md หัวข้อ "CI เขียว ไม่ได้แปลว่า deploy ขึ้น")

### กลุ่ม D — เชิงนโยบาย ไม่ใช่โค้ด

**D1. เขียนกติกาค่ารอบให้ไรเดอร์อ่านตั้งแต่วันแรก** — one-way, base+per_km, min/max,
เมื่อไรที่เลขเปลี่ยนได้และเปลี่ยนแล้วจะแจ้งอย่างไร (`src/data/faqFees.ts` มีที่วางอยู่แล้ว)
- ข้อดี: ถูกที่สุด แก้ปัญหาความเชื่อใจได้ทันทีโดยไม่ต้องแก้โค้ด
- ข้อเสีย: ไม่ได้ทำให้เลขนิ่งขึ้นเลย และ **ถ้าเขียนว่า "ยอดตอนกดรับคือยอดที่ได้" ทั้งที่โค้ดยังไม่เป็นแบบนั้น
  จะกลายเป็นสัญญาที่ระบบผิดเอง**

**D2. ตัดสินใจว่าค่ารอบควรอิงระยะ one-way หรือ round-trip** — ทุกวันนี้ one-way + `base_fee`
ชดเชยเที่ยวกลับโดยนัย (F8) การอธิบายเรื่องนี้ให้ตรงกันคือหน้าที่ก่อนขยายกองไรเดอร์
- ข้อดี: ทำให้สูตรอ่านแล้วเข้าใจได้ตรงกันทั้งสองฝ่าย
- ข้อเสีย: เปลี่ยนเป็น round-trip = ต้นทุนเพิ่มทันทีทุกงาน ต้องปรับ rate card พร้อมกัน

---

## ภาคผนวก — ข้อที่รายงาน 31 ส.ค. เขียนไว้แล้วและฉบับนี้ยืนยันซ้ำ

- ค่ารอบใช้ Routes API server-side เท่านั้น ไม่มี cache ยิงใหม่ทุก event — **ยืนยัน** (`index.js:352-419`, `:628`)
- fallback ค่ารอบเป็น `min_fee` ไม่ใช่ haversine — **ยืนยัน** (`index.js:617-638`, คอมเมนต์ `:573-576`)
- `getRiderPayout` chain 4 ชั้น — **ยืนยัน** (`jobHelpers.ts:89-101`)
- `|| 150` hardcode — **ยืนยันและขยาย**: ฉบับนี้พบว่าไม่ตรงกับ `min_fee`=100 ซึ่งเป็นค่าที่ควรตรงกัน
- one-way, ไม่มี multi-stop — **ยืนยัน** (`index.js:628`, `:597`)
- ไม่มี trigger เมื่อ `settings/logistics_rates` เปลี่ยน — **ยืนยันด้วยการค้นซ้ำ**
  (`grep 'ref: "/settings\|ref: "settings' functions/*.js` = ว่าง)
- ข้อ 5.4 ของฉบับนั้น ("ไรเดอร์กดรับงาน — เลขที่เห็นตอนกดรับกับหลังรับเปลี่ยนได้")
  — **ฉบับนี้ยกขึ้นเป็นข้อค้นพบระดับสูง F1** เพราะเป็นรูปเดียวกับเคสจริงที่เกิดขึ้นวันนี้

## ภาคผนวก — สิ่งที่ฉบับนี้เพิ่มจากฉบับ 31 ส.ค.

1. **F2 audit trail** — `onJobHandedOverCalcRiderFee` และ `onRiderAssignedRecalcEstimate`
   ไม่เขียน `qc_logs` ขณะที่ trigger เพื่อนบ้านเขียนทุกตัว
2. **F3 `TRAFFIC_AWARE`** — สาเหตุเชิงกลไกที่ทำให้ระยะทางแกว่งได้เองโดยไม่มีอะไรพัง (`index.js:372`)
3. **F6** — `SettlementPage.tsx` เขียนไม่ atomic (`:41` แยกจาก `:48`) ต่างจาก `RiderSettlements.tsx:44-57`
4. **F7** — รายการฟิลด์ค่ารอบที่ไม่มี `.validate` ใน `database.rules.json` (meta/status/breakdown)
5. **F9** — `pickup_fee_meta` ไม่ถูกเขียนตอนสร้างงาน จึงไม่มีหลักฐานระยะทางฝั่งลูกค้าเลยบนงานปกติ
6. **F10** — `HistoryTab` กับ `HistoryJobSheet` เล่าเรื่องค่ารอบไม่ตรงกันในหน้าจอเดียว
7. **§7.1 ตาราง 7 จุดที่ค่าเปลี่ยนได้** พร้อมคอลัมน์ "มี log ไหม"
8. **§9.3 ขั้นตอนสืบเคสทีละขั้น** รวมการถอด timestamp จาก OID
   (`parseInt("MTIAI3FH",36)` = 1 ก.ย. 2569 13:32:09 +07) และข้อเท็จจริงว่า `ref_no` **ไม่มี index**
9. **§11 สมมติฐาน 8 ข้อ** พร้อมวิธียืนยัน/ตัดออกทีละข้อจากฟิลด์จริง

## ภาคผนวก — สิ่งที่รอบสองเพิ่ม (1 ก.ย. เย็น หลังอ่านข้อมูลจริง)

1. **หัวข้อ "คำตอบของเคส"** — ข้อมูลดิบจาก `jobs/-P0QekIHDPBe7phJhabu` ไทม์ไลน์ที่มีวินาที
   และการตรวจสูตรทั้งสี่ตัวว่าตรงเป๊ะ (ไม่มีอะไรพังเลย)
2. **F11 — `travel_mode` ถูกสลับกลางทาง = รีไพรซ์งานที่ค้างอยู่ย้อนหลังทั้งกอง** สาเหตุจริง
   ของเคสนี้ และเป็นประเภทที่ฉบับแรกไม่ได้แยกออกมาจาก "อัตราเปลี่ยน"
3. **F12 — หลังสลับโหมด เก็บลูกค้ากับจ่ายไรเดอร์คนละฐานถาวร** เพราะ `travel_mode` อยู่คนละ node
   (`settings/logistics_rates` vs `settings/store/delivery_pricing`) และไม่มีอะไรผูกกัน
4. **§10.0 rate card จริงบน production** — `per_km` = **5** ไม่ใช่ 15 ตาม default
   ทำให้เลขแปลงค่ารอบเป็นระยะทางทุกที่ในฉบับแรกผิด และถูกแก้แล้ว
5. **F3 ถูกลดระดับจาก "สูง" เป็น "กลาง"** พร้อมข้อจำกัดที่พูดตรงๆ ว่าแยก traffic jitter
   ออกจาก F11 ด้วยข้อมูลชุดนี้ไม่ได้
6. **§11 ปิดสมมติฐานครบ 8 ข้อ** พร้อมตารางว่าแต่ละข้อถูกตัดด้วยฟิลด์ไหน
7. **บทเรียน 4 ข้อท้าย §11** — โดยเฉพาะข้อ 1: **วิธียืนยันที่แคบกว่าสมมติฐาน ทำให้สมมติฐาน
   ที่ถูกถูกตัดทิ้ง** (H2 ครอบคลุมสาเหตุจริงในเชิงข้อความ แต่วิธีตรวจสั่งให้ดูแค่ `base_fee`/`per_km`)
8. **§12 ตารางคำตอบของ 12 ใน 14 คำถาม** ที่ฉบับแรกบอกว่าตอบไม่ได้จากโค้ด
9. **กลุ่ม E ในตัวเลือกทางแก้** — 5 ข้อที่ตรงกับสาเหตุจริง รวมข้อที่ต้องทำก่อนเป็นงานโค้ด
   (E1: ตัดสินใจเรื่องงานที่ยังค้าง `Pending` อยู่ตอนนี้)
