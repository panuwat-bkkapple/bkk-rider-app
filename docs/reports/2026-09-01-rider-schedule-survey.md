# Survey: ระบบตารางงานไรเดอร์ (rider job scheduling & compensation)

วันที่สำรวจ: 1 ก.ย. 2569 · ขอบเขต: `bkk-rider-app`, `bkk-system`, `bkk-frontend-next`

> **SURVEY ONLY** — ไม่มีการแก้โค้ดในรอบนี้ ทุกข้อสรุปมี `file:line` กำกับ
> line number อิง HEAD ณ วันสำรวจ: bkk-rider-app `b9eabb2` · bkk-system `19f1b9f` ·
> bkk-frontend-next `66a5c90`
>
> path ที่ไม่มี prefix repo = ไฟล์ใน **bkk-rider-app** (repo ที่ report นี้อยู่)
>
> ของที่หาไม่เจอเขียนว่า **"ไม่พบ"** ตรงๆ ไม่มีการเดา และไม่มี fixture/ตัวอย่างสมมติในรายงานนี้
>
> **อ่านคู่กับ:** `docs/reports/2026-08-31-rider-money-distance-survey.md` (เส้นทางตัวเลขเงิน
> ฝั่งไรเดอร์ ละเอียดกว่าหัวข้อ 3 ที่นี่) ·
> `bkk-frontend-next/docs/reports/2026-08-30-bkk-system-terminal-status-survey.md`
> (การรื้อ status model ที่ค้างอยู่ — ผูกกับหัวข้อ 7) ·
> `bkk-frontend-next/docs/reports/2026-09-01-employee-lifecycle-survey.md` @ `396df9a3`
> branch `claude/new-session-pyizp6` (**[EMP]** — ผูกกับคอลัมน์ขวาสุดของหัวข้อ 7)

---

## 1. JOB IDENTITY — งานหนึ่งชิ้นคืออะไร

### 1.1 ที่อยู่ของ schema

**ไม่มี schema ของ "งานไรเดอร์" แยกต่างหาก — ไรเดอร์อ่าน `jobs/{jobId}` ใน RTDB ก้อนเดียวกับที่
แอดมินและลูกค้าอ่าน** (Firestore ถูกใช้เฉพาะ search analytics เท่านั้น ไม่เกี่ยวกับงานไรเดอร์)

| สิ่งที่ประกาศ | ไฟล์ |
|---|---|
| type ฝั่งไรเดอร์ (`interface Job`) | `src/types/index.ts:20-88` |
| ตัวเขียนแถวตอนลูกค้า checkout | `bkk-frontend-next/functions/src/index.ts:1820-1965` (payload ของ `validateAndCreateOrder`) |
| type ฝั่งแอดมิน | `bkk-system/src/types/domain.ts` |
| กระจกสาธารณะสำหรับลูกค้า (allowlist) | `bkk-frontend-next/functions/src/publicTrackFields.ts` |

**การที่ไรเดอร์เห็นงานเป็นเรื่องของ query ไม่ใช่ของ schema** — `src/hooks/useRiderJobs.ts:64-93`
subscribe 5 query: `orderByChild('rider_id') == ตัวเอง` หนึ่งตัว + `orderByChild('status')` อีก 4 ตัว
ตามค่า raw ใน `POOL_RAW_STATUSES` (`useRiderJobs.ts:24-29`) แล้ว merge เป็นลิสต์เดียว
(`useRiderJobs.ts:98-105`)

**หมายเหตุด้านสิทธิ์ (สำคัญกับหัวข้อ 4):** `bkk-frontend-next/database.rules.json` ให้ `.read` ที่
โหนด `jobs` แก่ **ไรเดอร์ทุกคนที่มีแถวใน `/riders`** (`root.child('riders').child(auth.uid).exists()`)
— การจำกัดว่าไรเดอร์เห็นงานไหนจึงเป็น **การกรองฝั่ง client เท่านั้น** ไม่ใช่กฎ

### 1.2 ฟิลด์เวลานัดหมาย — ลูกค้าเลือกช่วงเวลาตอน checkout จริง และไรเดอร์อ่านฟิลด์เดียวกัน

**มี** ลูกค้าเลือกวัน + ช่วงเวลาตอน checkout (`pickupType` / `pickupDate` / `pickupTimeSlot` —
`bkk-frontend-next/functions/src/index.ts:81-83`) ผ่านการตรวจ business hours ที่
`functions/src/index.ts:1191-1210` แล้วถูกเขียนลง **`jobs/{id}/pickup_schedule`**
(`functions/src/index.ts:1891-1905`) เป็นรูป `{ type, date, time }`

ไรเดอร์อ่าน **ฟิลด์เดียวกัน** ผ่าน `getAppointmentDisplay()` / `getAppointmentDateKey()`
(`src/utils/jobHelpers.ts:23-53`) → การ์ดในกองงานและตัวกรอง "วันนี้/พรุ่งนี้" ที่
`src/components/home/HomeTab.tsx:46-59`

**แต่รูปของ `pickup_schedule` ไม่ตรงกันสามฝั่ง — ทุกฝั่งเขียนคนละชุดฟิลด์:**

| ผู้เขียน | ไฟล์ | `type` ที่เขียน | ฟิลด์ที่เขียน |
|---|---|---|---|
| checkout ลูกค้า | `bkk-frontend-next/functions/src/index.ts:1891-1905` | `'instant'` \| `'schedule'` | `type, date, time` |
| แอดมิน (เลื่อนนัด) | `bkk-system/src/utils/appointment.ts:50-64` | `'scheduled'` | `type, date, time, time_start, time_end, rescheduled_at?` |
| type ฝั่งไรเดอร์ | `src/types/index.ts:266-270` | ประกาศรับแค่ `'instant' \| 'schedule'` | `type, date, time` |

`'scheduled'` (แอดมิน) ไม่อยู่ใน union ที่ไรเดอร์ประกาศ และ `time_start`/`time_end` ไม่มีใน type
ฝั่งไรเดอร์เลย — ตอนนี้ยังไม่พังบนจอเพราะ `getAppointmentDisplay` ตัดสินจาก `ps.date === 'Instant'`
ก่อนถึงการเทียบ `type` (`src/utils/jobHelpers.ts:26`) แต่แปลว่า **แอปไรเดอร์ไม่มีทางรู้เวลาเริ่ม/จบ
แบบ structured ได้เลย มันอ่านได้แค่สตริงรวม** ซึ่งเป็นข้อจำกัดโดยตรงถ้าจะทำตารางงานแบบมีช่วงเวลา

`appointment_time` (epoch) มีใน type ฝั่งไรเดอร์ (`src/types/index.ts:57`) และถูกอ่านเป็น fallback
(`jobHelpers.ts:32,48`) — **ไม่พบผู้เขียนฟิลด์นี้ในเส้นทางสร้างงานปกติ** (`validateAndCreateOrder`
ไม่เขียน) มีเพียง amendment ประเภท `appointment_reschedule` ที่ target เป็น `new_appointment_time`
(`src/types/index.ts:199`)

### 1.3 การแยกประเภทงาน

แกนเดียวที่ใช้จริงคือ **`receive_method`** — `'Pickup' | 'Store-in' | 'Mail-in'`
(`src/types/job-statuses.ts:316-320`)

**ประเภทที่ไม่มีตัวแทนในแอปไรเดอร์เลย:**

1. **Store-in / Mail-in** — `incomingList` ตัดทิ้งที่บรรทัดแรกสุด:
   `if (j.receive_method !== RECEIVE_METHOD.PICKUP) return false;` (`src/hooks/useRiderData.ts:173`)
   งานสองประเภทนี้แอดมินรับที่เคาน์เตอร์เอง (`bkk-system/src/pages/mobile/MobileTicketDetail.tsx:2163-2181`)
2. **การส่งคืนเครื่องให้ลูกค้า** — สถานะ `Returning To Customer` มีอยู่ในเอนุม
   (`src/types/job-statuses.ts:80`) และถูกเขียนจริงเมื่อลูกค้าปฏิเสธราคาใหม่
   (`bkk-frontend-next/app/api/jobs/action/route.ts:252`) แต่**ไม่อยู่ใน `ACTIVE_LIST_STATUSES`**
   (`src/hooks/useRiderData.ts:21-33`) ไม่มี checkpoint stage (`src/utils/checkpoints.ts:33-46`)
   และไม่มีการคิดค่ารอบขากลับ — **เที่ยววิ่งคืนเครื่องไม่มีอยู่ในระบบไรเดอร์**
3. **"iPhone แลกเงิน"** — **ไม่พบ** ทั้ง 3 repo (grep `แลกเงิน|จำนำ|pawn` ได้ 0 แถวที่เกี่ยวข้อง)
   ไม่มี product line นี้ในโค้ด
4. **ประเภทงานที่ไม่ใช่ trade-in** — `type: 'Withdrawal'` ถูกกรองออกจากหน้า dispatcher
   (`bkk-system/src/pages/fleet/DispatcherPage.tsx:81,86`) และ `type: 'Accessory'`
   (child job อุปกรณ์เสริม) ไม่มีเส้นทางไรเดอร์

---

## 2. ROUTE — วิ่งจากไหนไปไหน

### 2.1 ต้นทาง

**ไม่มีฟิลด์ใดบนงานที่บอกว่าไรเดอร์เริ่มวิ่งจากไหน** — ต้นทางเป็น implicit ว่า "สาขา" เสมอ และ
resolve ใหม่ทุกครั้งที่คำนวณ:

- ฝั่งค่าจ้างไรเดอร์: `resolveBranchCoords()` (`bkk-system/functions/index.js:493-533`) —
  ลำดับ `job.branch_details.{lat,lng}` → `settings/branches/{job.branch_id}` → สาขา `isActive` ตัวแรก
- ฝั่งค่าบริการลูกค้า: `nearestActiveBranchCoord()` แล้ว fallback เป็นค่าคงที่
  `STORE_LOCATION = { lat: 13.8481527, lng: 100.6123554 }`
  (`bkk-frontend-next/functions/src/index.ts:296, 1001, 562`)

**พิกัดจริงของไรเดอร์ถูกเขียนอยู่ (`riders/{id}/lat|lng|last_updated` —
`src/hooks/useJobActions.ts:54-58`, `src/hooks/useRiderData.ts:123-127`) แต่ไม่เคยถูกใช้เป็น
ต้นทางในการคำนวณระยะทางหรือค่าจ้างเลยสักจุด** — ใช้เฉพาะโชว์หมุดบนแผนที่ dispatcher และคิด ETA
สดให้ลูกค้า (`bkk-frontend-next/functions/src/riderEta.ts`)

### 2.2 ปลายทาง

| ใช้ทำอะไร | ฟิลด์ | หลักฐาน |
|---|---|---|
| นำทาง (ตัวหลัก) | `cust_lat` / `cust_lng` | `src/hooks/useJobActions.ts:379-385` เปิด Google Maps directions ด้วยพิกัดตรงๆ |
| นำทาง (fallback) | `cust_address` → `address` | `src/hooks/useJobActions.ts:387-389` — text search เมื่อไม่มีหมุด |
| geofence เช็คอิน | `cust_lat` / `cust_lng` | `src/utils/checkpoints.ts:115-116` |
| คิดค่าจ้าง | `cust_lat/cust_lng` (+ alias อีก 4 รูป) | `bkk-system/functions/index.js:541-556` (`resolveCustomerCoords`) |

ตัวเขียนพิกัดคือ checkout: `cust_lat: input.userLocation?.lat` (`bkk-frontend-next/functions/src/index.ts:1838-1839`)

**"ชื่อโครงการ / จุดสังเกต" ไม่มีฟิลด์ของตัวเอง** — ระบบ Address Descriptors เลือก landmark ได้
(`bkk-frontend-next/app/utils/addressDescriptor.ts`) แต่ค่าที่ลูกค้าเลือกถูก**พับเข้าไปใน
ข้อความ notes** เป็น prefix `[จุดสังเกต] ...` (`bkk-frontend-next/app/checkout/page.tsx:1646-1655`)
แล้วลงที่ `cust_notes` (`bkk-frontend-next/functions/src/index.ts:1831`) ไรเดอร์เห็นเป็นก้อนข้อความ
เดียวที่ `src/pages/JobDetailPage.tsx:233-241` — **แยกออกมาเป็นข้อมูลเชิงโครงสร้างไม่ได้**
(คอมเมนต์ที่ `checkout/page.tsx:1650-1651` บอกเหตุผลเองว่าเลี่ยง schema migration ข้าม repo)
ที่อยู่แบบ structured มีจริงแต่เป็นคนละชุด (`cust_address_components` —
`bkk-frontend-next/functions/src/index.ts:2029`) และไม่มี slot สำหรับ landmark

### 2.3 หลาย stop ต่อรอบ

**ไม่พบแนวคิดหลาย stop ใดๆ ทั้งสิ้น** — grep `multi_stop|waypoint|route_optimi|trip_id|round_trip`
ทั้ง 3 repo เจอเฉพาะ `waypoint` ที่เป็น payload ของ Routes API (1 origin → 1 destination)
ไม่มีเอนทิตี "รอบ"/"trip"/"route" ไม่มี id ที่ผูกหลายงานเข้าด้วยกัน

**1 งาน = 1 รอบ และรอบนั้นคิดเงินเป็น "ขาเดียว"** — `computeRiderFee` ยิง
`fetchDrivingDistance(custCoords, branchCoords, ...)` ครั้งเดียว
(`bkk-system/functions/index.js:614`) ระยะที่ได้คือ **ลูกค้า → สาขา** ไม่ใช่ สาขา → ลูกค้า → สาขา

ไรเดอร์ถือได้หลายงานพร้อมกัน (`activeList` เป็น array — `src/hooks/useRiderData.ts:185-188`,
dispatcher นับ `rider.tasks.length` ที่ `bkk-system/src/pages/fleet/DispatcherPage.tsx:105,168`)
แต่ระบบไม่รู้ว่างานเหล่านั้นวิ่งด้วยกันหรือแยกกัน — คิดเงินแยกใบเสมอ

### 2.4 ระยะทางถูกคำนวณกี่ที่

**5 ที่ ใน 3 repo — ไม่มีที่ไหนแชร์ผลลัพธ์กัน**

| # | ผู้เรียก | endpoint | ที่ | fallback |
|---|---|---|---|---|
| 1 | `getDistanceMatrix()` (เบราว์เซอร์ลูกค้า) | `distanceMatrix/v2:computeRouteMatrix` | `bkk-frontend-next/app/hooks/useDeliveryManager.ts:242` (เรียกที่ `:849`) | haversine × 1.3 — seed ก่อนยิง (`:837-845`) และเมื่อ API ล้ม/timeout 10 วิ (`:867-877`) |
| 2 | `drivingDistanceKm()` (`quotePickupServiceability`) | `computeRouteMatrix` | `bkk-frontend-next/functions/src/index.ts:910` (เรียกที่ `:1013`) | haversine × 1.3 (`:1019`) + รายงานว่าเป็นเส้นตรงผ่าน `distance_is_driving` (`:1037`) |
| 3 | `validateAndCreateOrder` (ตอนสร้างงาน) | **ไม่ยิงเอง** — รับ `pickupDistanceKm` จาก client | `bkk-frontend-next/functions/src/index.ts:1374-1391` | haversine × 1.3 ทั้งกรณีไม่ส่งมา และกรณี client ส่งเลขต่ำกว่า haversine เกิน 50% (`:1383-1385`) |
| 4 | `recomputeCustomerPickupFee` (แอดมินขยับหมุด) | **ไม่ยิงเลย** | `bkk-frontend-next/functions/src/index.ts:563` | ใช้ haversine × 1.3 **เป็นค่าหลัก** ไม่ใช่ fallback |
| 5 | `fetchDrivingDistance()` (ค่าจ้างไรเดอร์) | `directions/v2:computeRoutes` | `bkk-system/functions/index.js:359` (เรียกที่ `:614, :646`) | **ไม่มี haversine** — ล้มแล้วได้ `min_fee` พร้อม `reason: routes_api_*` (`:616-626`) โดยเจตนา (คอมเมนต์ `:576`) |

(+ `bkk-system/functions/health-check.js:186` เป็น probe ไม่ใช่การคิดเงิน · `src/utils/checkpoints.ts:53-62`
กับ `bkk-frontend-next/functions/src/riderEtaLogic.ts:56-64` เป็น haversine สำหรับ geofence/threshold
ไม่ใช่ระยะทางคิดเงิน)

**ข้อสังเกต:** #4 (แอดมินขยับหมุด → คิดค่าบริการลูกค้าใหม่) ใช้เส้นตรง × 1.3 เป็นค่าหลัก ขณะที่
#3 (ตอนสร้างงาน) ใช้ระยะขับจริง — **หมุดเดิมที่ถูกขยับแล้วขยับกลับที่เดิม ให้ค่าบริการคนละเลขได้**
ส่วน #5 (ค่าจ้างไรเดอร์) วัดคนละคู่พิกัดกับ #1-#4 (ลูกค้า→สาขา vs สาขา→ลูกค้า) และคนละ endpoint

---

## 3. MONEY

> เส้นทางตัวเลขเต็มรูปแบบพร้อมตารางฟิลด์อยู่แล้วที่
> `docs/reports/2026-08-31-rider-money-distance-survey.md` หัวข้อ (ก)/(ข) — ที่นี่ตอบเฉพาะ
> 3 คำถามของโจทย์

### 3a. ฝั่งลูกค้า — `pickup_fee`

**สูตร: ราคาตามโซนจังหวัด ไม่ใช่ตามระยะทางล้วน**

```
zone = findZoneByProvinceId(config.zones, provinceId)
  ไม่เจอ zone  → ปฏิเสธ (out-of-range)
  zone แบบ flat     → flatFee
  zone แบบ distance → min(maxFee, round(baseFare + max(0, distance − freeRadius) × perKmRate))
```
`bkk-frontend-next/app/utils/deliveryZones.ts:162-177` (`findZoneByProvinceId` + `calculateZoneFee`)

**คำนวณที่ 4 จุด ทุกจุดเรียก `calculateZoneFee` ตัวเดียวกัน:**

| จุด | ไฟล์ | หมายเหตุ |
|---|---|---|
| checkout (โชว์ให้ลูกค้า) | `bkk-frontend-next/app/utils/serviceResolution.ts:134-151` | |
| สร้างงาน (ตัวจริง) | `bkk-frontend-next/functions/src/index.ts:1420-1427` | เขียนลง `jobs/{id}/pickup_fee` ที่ `:1863` |
| แอดมินขยับหมุด/เปลี่ยนวิธีรับ | `bkk-frontend-next/functions/src/index.ts:574, 628` | `recomputeCustomerPickupFee` |
| แอป iOS (`quotePickupServiceability`) | `bkk-frontend-next/functions/src/index.ts:1040` | |

**เรตอยู่ใน config ไม่ฮาร์ดโค้ด** — `settings/store/delivery_pricing` ใน RTDB
(อ่าน: `bkk-frontend-next/functions/src/index.ts:556, 997, 1163` · เขียน:
`bkk-frontend-next/app/admin/settings/page.tsx:228`) ค่าตั้งต้นในโค้ดใช้เฉพาะตอนโหนดว่าง
(`DEFAULT_ZONES` — `app/utils/deliveryZones.ts:76-100`: metro base 50 / free 5 กม. / 10 บาทต่อ กม. /
เพดาน 300 · eastern flat 500)

**ใครแก้ได้:** หน้า `bkk-frontend-next/app/admin/settings` (หน้าแอดมินฝั่งเว็บลูกค้า) —
**ไม่พบ UI แก้ค่านี้ใน bkk-system** (grep `delivery_pricing` ใน bkk-system ได้ 0 แถว)
ต่างจากอัตราค่าจ้างไรเดอร์ซึ่งแก้ที่ bkk-system `/global-settings`

**เส้นทาง fallback ที่ยังมีชีวิต:** ถ้า client ไม่ส่ง `provinceId` มา จะตกไปใช้โมเดลระยะทางแบบเก่า
`calculatePickupFee()` (`bkk-frontend-next/functions/src/index.ts:270-279`, เรียกที่ `:1432`)
ซึ่ง**ปฏิเสธด้วย `maxDistance`** (คืน -1) — คนละกติกากับเส้นทางโซน (ที่ในโซนแล้วไม่ปฏิเสธตามระยะ)

**คูปองฟรีค่าส่ง — สองกลไกแยกกัน ห้ามสับสน:**

1. **คูปอง `type: 'service'`** — ทำให้ค่าบริการเป็น 0 ทั้งก้อน ไม่ใช่การบวกเงินเข้า payout:
   `hasServiceCoupon(couponLines)` → `isFreeDeliveryCoupon` (`bkk-frontend-next/functions/src/index.ts:1600`)
   → `grossFee = 0` (`:1643-1645`) และไม่ถูกนับใน `sumAppliedCoupons` (`couponEngine.ts:398`,
   `functions/src/index.ts:525`)
2. **`rider_fee_promotions`** — ส่วนลดค่าไรเดอร์ที่**บริษัทรับภาระ** ลด `pickup_fee` ที่ลูกค้าจ่าย
   โดย**ไม่แตะค่าจ้างไรเดอร์** (`bkk-frontend-next/app/utils/riderFeePromotion.ts:1-23`)
   เลือกโดย `selectRiderFeePromoServer` (`functions/src/index.ts:1628-1637`) เขียนลง
   `rider_fee_discount` + `applied_rider_promo` (`:1867-1868`)

   ค่าที่ลูกค้าจ่ายจริง = `effective_pickup_fee = max(0, pickup_fee − rider_fee_discount)`
   (`functions/src/index.ts:1646`) · คูปอง service มาก่อน promo (promo = 0 เมื่อมีคูปอง service —
   `:1628`) · promo ที่เคยให้ไปแล้วเป็น **sticky** ตอน reprice (`functions/src/index.ts:596-608`)

### 3b. ฝั่งไรเดอร์ — **มีฟิลด์ และมี 2 ตัวคนละความหมาย**

| ฟิลด์ | ความหมาย | ผู้เขียน (server เท่านั้น) |
|---|---|---|
| `jobs/{id}/rider_fee_estimate` (+ `rider_fee_estimate_meta`) | ประมาณการ ก่อน/ระหว่างถืองาน | `bkk-system/functions/index.js:1796-1799` (สร้างงาน), `:3089-3091` (เปลี่ยนวิธีรับ), `:3214-3217` (หมุดขยับ), `:3495-3499` (rider_id เปลี่ยน) |
| `jobs/{id}/rider_fee` (+ `rider_fee_meta`) | **ยอดจริงที่ finance จ่าย** — ประทับตอนส่งมอบ | `bkk-system/functions/index.js:3427-3432` (`onJobHandedOverCalcRiderFee`) |
| `jobs/{id}/rider_fee_status` | `'Pending'` → `'Paid'` | ไรเดอร์ตั้ง Pending (`src/hooks/useJobActions.ts:363`) · finance ตั้ง Paid (`bkk-system/src/pages/finance/components/RiderSettlements.tsx:46,71`) |

**สูตรค่าจ้าง:** `round(clamp(base_fee + per_km × distance_km, min_fee, max_fee))`
(`feeFromRates` — `bkk-system/functions/index.js:557-562`)
เรตอยู่ที่ `settings/logistics_rates` แยกตามยานพาหนะได้ที่ `by_vehicle/{motorcycle|car}`
(`getLogisticsRates` — `bkk-system/functions/index.js:451-469`) ค่า default ในโค้ดคือ
base 60 / 15 บาทต่อ กม. / min 100 / max 500 (`bkk-system/functions/index.js:336-341`)
ตั้งที่ bkk-system `/global-settings`

**สามเรื่องที่แยกกันโดยเจตนา** (คอมเมนต์ `bkk-system/functions/index.js:576-596`):
ระยะทางที่ใช้คิดเงินใช้ `rates.travel_mode` ฐานเดียวทั้งระบบ · อัตราแยกตามยานพาหนะได้ ·
ETA ใช้โหมดของยานพาหนะจริง

**ที่ไรเดอร์เห็นเลข:** `getRiderPayout(job, vehicleType)` (`src/utils/jobHelpers.ts:89-101`)
ลำดับ `rider_fee` → `rider_fee_estimate_meta.fee_by_vehicle[vehicleType]` → `rider_fee_estimate`

**ค่าจ้างไรเดอร์ถูกกันออกจากกระจกสาธารณะโดยเจตนา** — `bkk-frontend-next/functions/src/publicTrackFields.ts:71-72`

### 3c. snapshot บนแถวงาน — **มี แต่ไม่ครบ 3 อย่างที่โจทย์ถาม**

`riderFeeMeta(result)` (`bkk-system/functions/index.js:696-704`) เขียน:

| เก็บ | ฟิลด์ | มี? |
|---|---|---|
| ระยะที่ใช้จริง | `distance_km` | **มี** |
| การ์ดอัตราที่ใช้ | `rates` (`{vehicle, base_fee, per_km, min_fee, max_fee, travel_mode}`) | **มี** — เป็นค่าจริงทั้งชุด ไม่ใช่ pointer |
| วิธีที่ใช้ / เหตุผล | `reason` (`calculated` \| `missing_customer_coords` \| `missing_branch_coords` \| `routes_api_*`) | **มี** |
| เวลาที่คำนวณ | `computed_at` | **มี** |
| ค่าจ้างของอีกยานพาหนะ | `fee_by_vehicle` | **มี** |
| **เวอร์ชันของเรตการ์ด** | — | **ไม่พบ** — ไม่มี `rates_version`/`rev` ที่ไหนเลย ต้องอนุมานจาก `computed_at` + ค่าที่ copy ไว้ |
| **ต้นทาง/ปลายทางที่ใช้วัด** | — | **ไม่พบ** — เก็บแค่ระยะทาง ไม่เก็บว่าสาขาไหนหรือหมุดไหน ตรวจย้อนหลังไม่ได้ |
| **เวลาเดินทาง** | `duration_min` คำนวณแล้วที่ `:660` | **ไม่ถูกเก็บ** — `riderFeeMeta` ไม่มีฟิลด์นี้ ค่าที่ยิง API มาได้ถูกทิ้ง |

ฝั่งค่าบริการลูกค้ามี snapshot คู่ขนานคือ `pickup_fee_meta`
(`zone_status`, `province_id`, `distance_km`, `computed_at` —
`bkk-frontend-next/functions/src/index.ts:633-638`) แต่ **เขียนเฉพาะตอน `recomputeCustomerPickupFee`
เท่านั้น ตอนสร้างงานไม่เขียน** (grep `pickup_fee_meta` ใน `functions/src/index.ts` เจอที่เดียว) —
งานที่ไม่เคยถูกแอดมินขยับหมุดจึงไม่มีหลักฐานว่าค่าบริการมาจากระยะเท่าไร โซนไหน

**คำนวณสดทุกครั้งที่เปิดหน้าไหม:** ไม่ — ทุกจุดข้างต้นเป็น DB trigger ฝั่ง server เขียนแถวไว้
UI ทั้ง 3 repo อ่านค่าจากแถว ไม่คำนวณเอง (ยกเว้นสูตร `net_payout` ที่ recompute ตอนไรเดอร์
ส่งผลตรวจ — `src/pages/RiderApp.tsx:182-193`)

---

## 4. ASSIGNMENT & CAPACITY

### 4.1 broadcast / claim

**สวิตช์กลาง `settings/system/dispatch_mode`** = `'manual'` (ค่าเริ่มต้น) หรือ `'broadcast'`
สลับที่ `bkk-system/src/pages/fleet/DispatcherPage.tsx:135-145` · อ่านฝั่งไรเดอร์ที่
`src/hooks/useRiderData.ts:66-71`

**ใครเห็นงาน / เห็นตอนไหน** — `src/hooks/useRiderData.ts:172-182`:

- **direct assign:** เห็นเมื่อ `status` normalize เป็น `Rider Assigned` **และ** `rider_id === ตัวเอง`
  (เห็นได้ทุกโหมด)
- **broadcast:** เห็นเมื่อ `dispatchMode === 'broadcast'` **และ** status เป็น `Active Lead`
  หรือ `Rider Assigned` ที่ยังไม่มี `rider_id`
- ทั้งสองกรณีต้อง `receive_method === 'Pickup'` (`:173`)
- ถูกกรองซ้ำด้วยวันนัด (ค่าเริ่มต้น "วันนี้") ที่ `src/components/home/HomeTab.tsx:46-59` และ
  ต้องเปิดสวิตช์ "รับงาน" ก่อนถึงจะ render (`HomeTab.tsx:145`)

**ไม่มี push notification แจ้งไรเดอร์ตอนมีงานใหม่เข้ากอง** — `pushToRider` ถูกเรียก 6 จุด
(`bkk-system/functions/index.js:2940, 3145, 3243, 4647, 4707, 4769` + `:4895`) ทั้งหมดยิงหา
`job.rider_id` ที่มีอยู่แล้ว **ไม่พบ** จุดที่ยิงหาไรเดอร์ทั้งกองตอนงานเข้าสถานะ `Active Lead`
→ ไรเดอร์ต้องเปิดแอปค้างไว้เอง

**แย่งกันแล้วใครชนะ:** `runTransaction` บน `jobs/{id}` (`src/hooks/useJobActions.ts:154-180`)
— broadcast: คนแรกที่ยังเห็น `rider_id` ว่างชนะ (`:162-164`) · direct assign: เฉพาะคนที่ถูก assign
(`:165-167`) · คนแพ้ได้ `result.committed === false` + toast (`:182-185`)

**ช่องโหว่:** transaction เป็นกติกาฝั่ง client ล้วน — RTDB rule อนุญาตให้**ไรเดอร์คนใดก็ได้**เขียน
`jobs/{id}` ที่ `rider_id` ยังว่าง โดยไม่ตรวจ status:
`".write": "auth != null && (data.child('rider_id').val() === auth.uid || (!data.child('rider_id').exists() && newData.child('rider_id').val() === auth.uid))"`
(`bkk-frontend-next/database.rules.json`) และ `.read` ที่ระดับโหนด `jobs` เปิดให้ไรเดอร์ทุกคน
**การจำกัดว่าเห็นงานไหน/รับได้เมื่อไหร่ทั้งหมดอยู่ฝั่ง client**

### 4.2 assign ตรง / ดึงคืน / โอนงาน

- **assign ตรง: มี** — `handleAssignJob` (drag & drop ลงการ์ดไรเดอร์) เขียน
  `{ status: 'Rider Assigned', rider_id, assigned_at }` (`bkk-system/src/pages/fleet/DispatcherPage.tsx:117`)
  **`assigned_at` เป็นจุดเดียวในระบบที่เขียนฟิลด์นี้** (grep ทั้ง 3 repo)
- **ดึงคืน: มี** — `handleUnassignJob` (`DispatcherPage.tsx:123-132`) เขียน
  `{ status: 'Active Lead', rider_id: null, assigned_at: null }` มี `window.confirm` แต่**ไม่มี
  push แจ้งไรเดอร์ที่ถืออยู่ และไม่มี log**
- **ไรเดอร์คืนงานเอง: มี** — `handleRejectOrCancelJob` (`src/hooks/useJobActions.ts:230-323`)
  พาร์คไว้ที่ `Following Up` + `rider_id: null` โดยเจตนา (ไม่เด้งกลับกองเอง — เหตุผลที่ `:278-288`)
- **โอนงานจากไรเดอร์ A → B โดยตรง: ไม่พบ** — ต้อง unassign แล้ว assign ใหม่ (สองการเขียนแยกกัน
  ไม่ atomic ไม่มี audit ว่าใครถือมาก่อน)

### 4.3 การกันชนเวลา

**ไม่มี — ระบบปล่อยทั้งหมด**

- `handleAssignJob` ไม่อ่านงานอื่นของไรเดอร์คนนั้น ไม่อ่าน `pickup_schedule` ไม่มี validation ใดๆ
  (`bkk-system/src/pages/fleet/DispatcherPage.tsx:115-121` — 7 บรรทัดทั้งฟังก์ชัน)
- `acceptIncomingJob` transaction ตรวจแค่ status + `rider_id` ของ**งานใบนั้น** ไม่ดูงานอื่นเลย
  (`src/hooks/useJobActions.ts:154-180`)
- ไม่พบการเทียบเวลานัดของสองงานที่ไหนใน 3 repo
- สิ่งเดียวที่ใกล้เคียงคือ `rider.tasks.length` ที่โชว์เป็นตัวเลขให้แอดมินอ่านเอาเอง
  (`DispatcherPage.tsx:105, 168-170`) — เป็นการแสดงผล ไม่ใช่กติกา

### 4.4 shift / เวลาว่าง / on-duty

**ไม่พบแนวคิด shift / roster / availability / working hours ของไรเดอร์ใดๆ ทั้ง 3 repo**
(grep `shift|availability|on_duty|working_hours|roster` เจอเฉพาะ `turns.shift()` ใน chat-ai
และคำว่า availability ในบริบทเขตบริการลูกค้า)

สิ่งที่มีคือ 3 อย่างที่ **ไม่ใช่** ตารางเวร:

| ฟิลด์ | ค่า | ที่มา | ข้อจำกัด |
|---|---|---|---|
| `riders/{id}/status` | `Online` / `Busy` / `Offline` | เขียนโดยแอปเองระหว่าง watch GPS (`src/hooks/useRiderData.ts:123-127`) — `Busy` = มี activeList | **ไม่ถูกเขียนเป็น `Offline` ตอนปิดสวิตช์หรือปิดแอป** ค่าจึงค้างที่เดิม |
| สวิตช์ "รับงาน/ปิดรับ" | boolean ใน memory | `useState(false)` (`src/hooks/useRiderData.ts:58`) toggle ที่ `src/pages/RiderApp.tsx:289` | **ไม่ persist** — เปิดแอปใหม่กลับเป็นปิดรับเสมอ และ server ไม่รู้ค่านี้ |
| `riders/{id}/approval_status` | `Active` / `Pending` / `Suspended` / `Rejected` | `bkk-system/src/pages/fleet/RiderManagement.tsx:148-198` | สถานะบัญชี ไม่ใช่สถานะกะ |

---

## 5. TIMELINE & CUSTODY

### 5.1 สถานะที่ไรเดอร์ขับเอง (Pickup)

| # | สถานะ | ปุ่ม/ตัวเขียน | checkpoint stage | verify |
|---|---|---|---|---|
| 0 | `Active Lead` / `Rider Assigned` | แอดมิน (`MobileTicketDetail.tsx:2156-2160` / `DispatcherPage.tsx:117`) | — | — |
| 1 | `Rider Accepted` | `acceptIncomingJob` (`useJobActions.ts:175`) | `rider_accepted` | ไม่ verify |
| 2 | `Rider En Route` | `ActiveJobCard.tsx:139` | `rider_en_route` | ไม่ verify |
| 3 | `Rider Arrived` | `ActiveJobCard.tsx:146` | `rider_arrived` | เทียบหมุดลูกค้า 200 ม. |
| 4 | `Being Inspected` | `ActiveJobCard.tsx:157` | **ไม่มี** | — |
| 5 | `QC Review` | `RiderApp.tsx:235` (ส่งผลตรวจ) | **ไม่มี** | — |
| 6 | `Revised Offer` / `Negotiation` / `Price Accepted` | แอดมิน (ไรเดอร์เห็นอย่างเดียว) | **ไม่มี** | — |
| 7 | `Payout Processing` | `ActiveJobCard.tsx:259` (ลูกค้ายอมรับ) | **ไม่มี** | — |
| 8 | `Waiting For Handover` / `Paid` | แอดมิน/finance | **ไม่มี** | — |
| 9 | `Rider Returning` | `ActiveJobCard.tsx:240` | `customer_left` | เทียบหมุดลูกค้า 250 ม. |
| 10 | `Pending QC` | `handleCompleteJob` (`useJobActions.ts:362`) | `branch_handover` | เทียบสาขาใกล้สุด 300 ม. |

mapping สถานะ → stage: `src/utils/checkpoints.ts:33-46` (รับทั้งชื่อ canonical และ legacy)

**ไม่พบระบบ QR handoff** — grep `qr|handoff` ทั้ง 3 repo: `QRCode` ถูกใช้เฉพาะสร้างลิงก์เซสชัน
BKK Diagnos (`src/components/diagnos/DiagnosPanel.tsx:82`, `bkk-system/src/components/DiagnosStartPanel.tsx:11`)
**ไม่มีการสแกนอะไรตอนส่งมอบเครื่องเข้าสาขา** — การส่งมอบคือ **ไรเดอร์กดปุ่มเอง** แล้วระบบเก็บ
GPS snapshot เทียบสาขาในรัศมี 300 ม. แบบ **non-blocking** (เกินเกณฑ์ = แค่ toast เตือน + flag
ให้แอดมินดูทีหลัง — `src/utils/checkpoints.ts:10-13`, `useJobActions.ts:74-81`)
**ไม่มีฝั่งสาขายืนยันรับของ** — `Pending QC` ถูกเขียนโดยไรเดอร์ฝ่ายเดียว

### 5.2 timestamp ที่ถูกบันทึกจริง

**บน `jobs/{id}/checkpoints/{stage}`** (`{at, rider_id, lat, lng, accuracy?, target?, distance_m?,
is_within_zone?, zone_m?}` — `src/utils/checkpoints.ts:125-139`) 5 จุด: `rider_accepted`,
`rider_en_route`, `rider_arrived`, `customer_left`, `branch_handover`

**บนตัว job:**

| ฟิลด์ | ความหมาย | ตัวเขียน |
|---|---|---|
| `created_at` | สร้างงาน | `bkk-frontend-next/functions/src/index.ts:1937` |
| `assigned_at` | แอดมิน assign ตรง | `bkk-system/src/pages/fleet/DispatcherPage.tsx:117` (จุดเดียว — broadcast ไม่เขียน) |
| `inspected_at` | ส่งผลตรวจ | `src/pages/RiderApp.tsx:203` |
| `customer_accepted_at` | ลูกค้ายอมรับราคา | `src/components/home/ActiveJobCard.tsx:259` |
| `kyc_verified_at` | บันทึก KYC | `src/hooks/useJobActions.ts:492` |
| `completed_at` | กดส่งมอบเข้าสาขา | `src/hooks/useJobActions.ts:363` |
| `cancelled_at` | ยกเลิก | `src/hooks/useJobActions.ts:297` |
| `updated_at` | ทุกการเขียน | `src/hooks/useJobActions.ts:43` |
| `qc_logs[]` | log ทุก transition (`{action, by, timestamp, details}`) | `src/hooks/useJobActions.ts:36-39` |

**บน `jobs_offers/{jobId}/{riderId}`:** `offered_at` / `accepted_at` / `rejected_at`
(`src/utils/offerLog.ts:15-55`)

**สิ่งที่ไม่ถูกบันทึก:** ไม่มี `rider_fee_meta.duration_min` (ดู 3c) และ **checkpoint ทุกจุด
พึ่ง `navigator.geolocation.getCurrentPosition` แบบ callback ที่ล้มเงียบได้** —
`recordCheckpoint` อยู่ **ข้างใน** success callback (`src/hooks/useJobActions.ts:52-86`)
ปฏิเสธสิทธิ์ GPS หรือ timeout = **ไม่มี checkpoint แถวนั้นเลย** ทั้งที่ status เปลี่ยนสำเร็จไปแล้ว
→ ไทม์ไลน์ขาดเป็นช่วงๆ ได้โดยไม่มี error (`jobTimeline.ts:7-9` รับรู้ข้อนี้: ข้อมูลขาด = null
ห้ามตีเป็น 0)

### 5.3 ช่วงที่ "เครื่องอยู่กับไรเดอร์" แต่ไม่มี state รองรับ

**เครื่องเปลี่ยนมือตอนไหน ระบบไม่มีบันทึก** — ระหว่าง `Rider Arrived` → `Being Inspected` →
`QC Review` ไม่มี event ที่แปลว่า "ลูกค้ายื่นเครื่องให้แล้ว" `Being Inspected` เป็นตัวใกล้เคียง
ที่สุดแต่หมายถึง "เริ่มตรวจ" และ**ไม่มี checkpoint** (`src/utils/checkpoints.ts:33-46`)

ช่วงที่ไม่มี state:

1. **`QC Review` → `Payout Processing`** — เครื่องอยู่ในมือไรเดอร์ รอแอดมินอนุมัติราคา แล้วรอ
   ลูกค้าตอบ ไม่มีขอบเขตเวลา ไม่มีสถานะบอกว่าไรเดอร์กำลังรออยู่ที่หน้าบ้านลูกค้าหรือกลับไปแล้ว
2. **`Waiting For Handover` / `Paid` → `Rider Returning`** — รอ finance โอนเงิน ปุ่ม
   "เดินทางกลับสาขา" ขึ้นเฉพาะเมื่อสถานะเป็น `Waiting For Handover`/`Paid`
   (`ActiveJobCard.tsx:231`) แปลว่า **ไรเดอร์ถือเครื่องรอโอนเงินอยู่โดยไม่มีสถานะแยก**
3. **`Rider Returning` → `Pending QC`** — มี stage `customer_left` และ `branch_handover`
   แต่ไม่มีอะไรระหว่างนั้น (แวะรับงานอื่น/แวะร้าน/รถเสีย = มองไม่เห็น)
4. **หลัง `Pending QC`** — งานหลุดจาก `activeList` ทันที (`useRiderData.ts:21-33` ไม่มี `Pending QC`)
   ไปโผล่ใน history **โดยไม่มีใครฝั่งสาขายืนยันว่าได้รับเครื่อง** — ถ้าเครื่องหายระหว่างนั้น
   ระบบชี้ไม่ได้ว่าหายก่อนหรือหลังส่งมอบ
5. **การยกเลิกหลังรับเครื่องแล้ว** — `handleRejectOrCancelJob` เขียน `rider_id: null` เสมอ
   (`useJobActions.ts:290`) **ไม่มีการถามว่าเครื่องอยู่ที่ใคร** ถ้ายกเลิกตอนถือเครื่องอยู่
   งานจะไม่มีเจ้าของและไม่มีบันทึกว่าเครื่องต้องคืน (ดูข้อ 1.3 ข้อ 2: ไม่มีเที่ยวคืนเครื่อง)

---

## 6. HISTORY & REPORTING

### 6.1 "ไรเดอร์คนนี้วันนี้/สัปดาห์นี้ วิ่งกี่งาน กี่กม. ได้เงินเท่าไหร่"

**ไม่มีหน้าไหนตอบครบทั้ง 3 อย่าง** ของที่มีอยู่ตอบได้คนละส่วน:

| หน้า | กี่งาน | กี่ กม. | ได้เงินเท่าไหร่ | ช่วงเวลา |
|---|---|---|---|---|
| แอปไรเดอร์ `HistoryTab` (`src/components/history/HistoryTab.tsx:44-48`) | **ได้** (`count`) | **ไม่ได้** | **ได้แต่ผิด** (ดูล่าง) | วันนี้/เมื่อวาน/7 วัน/ทั้งหมด (`:36-41`) |
| แอปไรเดอร์ `HistoryJobSheet` (`src/components/history/HistoryJobSheet.tsx:42-45`) | รายใบ | **ได้** รายใบ (`jobDistanceKm`) | ได้รายใบ | ต่อ 1 งาน |
| bkk-system `/rider-performance` (`RiderPerformance.tsx:60-73`) | **ได้** (active/completed/cancelled/acceptance) | **ไม่มี** | **ไม่มี** | 7/30/90/ทั้งหมด (`:107`) |
| bkk-system `/rider-performance/:id` (`RiderPerformanceDetail.tsx`) | รายใบ + timeline | ระยะจาก**หมุด**ตอนเช็คอิน (`:143-145`) ไม่ใช่ระยะวิ่ง | **ไม่มี** | ทั้งหมด |
| bkk-system `/finance` → RiderSettlements (`RiderSettlements.tsx:28-33`) | คิวรออนุมัติเท่านั้น | ไม่มี | รายใบ (`rider_fee`) | ไม่มีตัวกรองช่วงเวลา |
| bkk-system `/wht-report` | ไม่มี | ไม่มี | ยอดถอน + ภาษีหัก ณ ที่จ่าย รายเดือน | รายเดือน |
| แอปไรเดอร์ `WalletTab` | ไม่มี | ไม่มี | ยอดคงเหลือ + รายการเดินบัญชี | ไม่มี |

**บั๊กที่เจอระหว่างสำรวจ (ไม่แก้ในรอบนี้):** สรุปรายได้ใน `HistoryTab.tsx:46` คำนวณจาก
`Number(j.rider_fee) || 150` — hardcode 150 เมื่อ `rider_fee` ยังไม่ถูกประทับ และ**ไม่ผ่าน
`getRiderPayout()`** ที่มีอยู่แล้ว (`src/utils/jobHelpers.ts:89-101`) → ตัวเลข "รายได้วันนี้"
ที่ไรเดอร์เห็นไม่ตรงกับเลขบนการ์ดของงานเดียวกัน เลข 150 ตัวเดียวกันนี้อยู่ใน
`bkk-system/src/pages/finance/components/RiderSettlements.tsx:39,50,77,138` ด้วย

### 6.2 ข้อมูลดิบพอสร้างรายงานย้อนหลังได้ไหม

**พอสำหรับ "กี่งาน" และ "ได้เงินเท่าไหร่" · ไม่พอสำหรับ "กี่กิโลเมตร"**

| คำถาม | สร้างย้อนหลังได้ไหม | ข้อจำกัด |
|---|---|---|
| กี่งาน / วัน | **ได้** | `completed_at` + `rider_id` + `.indexOn: rider_id` มีครบ |
| ได้เงินเท่าไหร่ | **ได้** | `rider_fee` + `rider_fee_status` บนงาน และ `transactions` category `JOB_PAYOUT` (`src/utils/walletLedger.ts`) — เป็นเงิน**ที่ได้รับอนุมัติ** ไม่ใช่เงินที่เกิดในวันนั้น |
| กี่กิโลเมตร | **ไม่ได้ตามความหมายที่ควรจะเป็น** | `rider_fee_meta.distance_km` คือระยะ **ลูกค้า→สาขา ขาเดียว** ไม่ใช่ระยะที่ไรเดอร์วิ่งจริง (ไม่มีขาไป ไม่มีการวิ่งข้ามงาน ไม่มีต้นทางจริง — ดู 2.1/2.3) |
| เวลาต่อขั้นตอน | **ได้บางส่วน** | `buildJobTimeline` (`src/utils/jobTimeline.ts:70-89`) คำนวณจาก checkpoints ที่มี — แต่ checkpoints หายได้เมื่อ GPS ล้ม (ดู 5.2) และ 4 สถานะกลาง (Being Inspected/QC Review/Payout/Paid) ไม่มี stage เลย ช่วงที่หายไปคือช่วงที่ยาวที่สุดของงาน |
| งานที่ยกเลิก / ปฏิเสธ | **ได้** | `cancel_category` + `cancelled_by` + `cancelled_at` (`useJobActions.ts:294-297`) และ `jobs_offers` (`offerLog.ts`) |
| ไรเดอร์ทำงานกี่ชั่วโมง | **ไม่ได้เลย** | ไม่มี shift ไม่มี log การเปิด/ปิดรับงาน `riders/{id}/status` ถูกเขียนทับไม่มีประวัติ (ดู 4.4) |
| งานที่ไม่ได้เกิดจาก Pickup | **ไม่ได้** | Store-in/Mail-in/คืนเครื่อง ไม่มีไรเดอร์ผูกอยู่ (ดู 1.3) |

**ข้อจำกัดเชิงต้นทุนที่ต้องรู้ก่อนออกแบบรายงาน:** `RiderPerformance.tsx` subscribe
`/jobs` และ `/jobs_offers` **ทั้งโหนด** (`:133` และบรรทัดใกล้เคียง) โดยรู้ตัว
(คอมเมนต์ `:9-10` "Heavy queries (whole /jobs scan) are fine at the current scale")
— ขัดกับกฎ RTDB Cost Rules ใน CLAUDE.md ของ bkk-system รายงานใหม่ต้องไม่ทำแบบเดียวกัน

---

## 7. GAP LIST — เรียงตามความเสี่ยง

> คอลัมน์ "status model" = ทับซ้อนกับการรื้อ status model ที่ค้างอยู่หรือไม่
> (`bkk-frontend-next/docs/reports/2026-08-30-bkk-system-terminal-status-survey.md` —
> ~245 จุดที่เทียบ status ด้วย string literal, `job-statuses.ts` mirror 3 repo + CI
> `sync-status-enum.yml`)
>
> **เอกสาร employees — แก้ไขเมื่อ 2 ก.ย. 2569:** ฉบับแรกของรายงานนี้เขียนว่า
> "ไม่พบไฟล์นี้ในทั้ง 3 repo" ซึ่ง **ผิด** — ตอนนั้นค้นเฉพาะไฟล์บนดิสก์ของ working tree
> (ซึ่งชี้ที่ `main`) ไม่ได้ค้นทุก branch ของ remote
>
> ของจริงอยู่ที่ **`bkk-frontend-next` → `docs/reports/2026-09-01-employee-lifecycle-survey.md`**
> commit `396df9a3` บน branch `origin/claude/new-session-pyizp6` (ยังไม่ merge เข้า main
> จึงไม่โผล่ใน working tree — ค้นด้วย `git log --all --name-only` ถึงจะเจอ)
>
> คอลัมน์ "ผูกกับ employees" ด้านล่าง **ถูก re-check กับเอกสารนั้นแล้ว** ตามที่หมายเหตุเดิม
> สัญญาไว้ — ผลสรุปอยู่ในหัวข้อย่อยถัดไป อ้างเป็น **[EMP §n]**
>
> **บทเรียนของความพลาดนี้ตรงกับกฎที่มีอยู่แล้วใน CLAUDE.md:** "ถามก่อนสรุปว่าแก้เสร็จแล้ว —
> กฎนี้ถูกเรียกจากกี่ที่ / มีสำเนาอยู่อีกรีโปไหม" คำถามข้อที่สามคือคำถามเดียวกับที่พลาดตรงนี้
> ต่างกันแค่ว่ารอบนี้ของอยู่คนละ **branch** ไม่ใช่คนละ repo

### ผลการ re-check กับ [EMP] — สิ่งที่เอกสารจริงเปลี่ยน/ทำให้คมขึ้น

เอกสารนั้นสำรวจ 3 รีโปเดียวกันที่ `origin/main` ณ 31 ส.ค. และยืนยันสมมติฐานหลักที่รายงานนี้
เดาไว้ถูก (มีสามระบบ "คนที่ทำงานที่นี่" แยกกัน: `/staff`, `/riders`, และ `QC_SUPERVISORS`
ที่ฮาร์ดโค้ด · `employment.type` มีเฉพาะบน riders) แต่มีสามเรื่องที่มันรู้มากกว่าและกระทบ
คอลัมน์ขวาสุดโดยตรง:

1. **[EMP §Q8.1] ตัวตนพนักงานถูกประทับลงงานใน 4 รูปที่เข้ากันไม่ได้** — ชื่อที่แสดงผล
   (`qc_logs[].by`, `paid_by`, `agent_name`), staff push-id (`adjustments[].by_uid`,
   `cancelled_by` ที่ขึ้นต้น `staff:`), Firebase Auth uid (`agent_uid`, KYC `by_uid`), และ
   **ค่าคงที่ฮาร์ดโค้ด** (`qc_by` จาก `QC_SUPERVISORS`) · `/jobs` ยัง `.indexOn: agent_name`
   และตัวกรอง "งานของฉัน" join ด้วย**ชื่อ** → ของที่ต้องประทับตัวตนคนรับเครื่อง (ช่องว่าง #1)
   จะไปลงในส่วนที่เละที่สุดของระบบพอดี
2. **[EMP §Q3] การพักงานไรเดอร์บังคับที่ client เท่านั้น** — ไม่มีกฎไหนอ่าน `approval_status`
   เลย แถวใน `/riders` ที่ `exists()` (รวม `Pending` ที่เพิ่งสมัครเอง) เปิดสิทธิ์อ่าน `/jobs`
   ทั้งโหนด **และอ่าน `/riders` ทั้งหมด** (เลขบัญชี ลิงก์เอกสารบัตรประชาชน `tax_id` ของ
   ไรเดอร์คนอื่น) → ช่องว่าง #3 ของรายงานนี้ประเมินไว้**ต่ำกว่าความจริง**
3. **[EMP §Q3] `.validate` ไม่ทำงานตอน delete** — ไรเดอร์ null ฟิลด์ของตัวเองได้ รวม
   `employment` (ตัวที่ตัดสินการหักภาษี ณ ที่จ่าย) และ `vehicle_type` (ตัวที่ตัดสินการ์ดอัตรา
   ค่าวิ่ง) ทั้งที่ทั้งคู่มี validate แบบ admin-only → อะไรก็ตามที่จะเพิ่มลง `riders/{id}`
   ในอนาคต (เช่นตารางเวรของช่องว่าง #5) รับความอ่อนแอข้อนี้ไปด้วยโดยอัตโนมัติ

**สิ่งที่เอกสารนั้นสรุปและรายงานนี้เห็นด้วย:** `employees` ต้องอยู่ใน **RTDB** ไม่ใช่ Firestore
(กฎ RTDB อ่าน Firestore ไม่ได้ และมิเรอร์ `admins` ฝั่ง Firestore ที่ `storage.rules` พึ่งอยู่
**ไม่มีคนเขียนเลย = พังอยู่**) และ **การแยก applicant ออกจาก employee มีอยู่แล้วสองที่**
(`job_applications`, `dealer_applications` → `dealers`)

**ของที่เอกสารนั้นเก่าไปแล้วหนึ่งจุด** (ไม่กระทบข้อสรุปด้านบน): §Q3 เขียนว่าท่อขอถอนเงินพัง
ทั้งเส้นเพราะแอปไรเดอร์ push ตรงไปที่ `/withdrawals` ซึ่งไม่มีกฎและไม่มีคนอ่าน — ตอนนี้แอป
เรียก callable `riderRequestWithdraw` แล้ว (`useJobActions.ts:401-416`) และกฎฝั่ง
`/withdrawals` ถูกแก้ไปที่ `bkk-frontend-next` PR #918

| # | ช่องว่าง | ชนิด | status model | ผูกกับ employees |
|---|---|---|---|---|
| 1 | **ไม่มี custody chain ตอนส่งมอบเครื่อง** — `Pending QC` ไรเดอร์กดเอง ไม่มี QR ไม่มีสแกน ไม่มีฝั่งสาขายืนยัน มีแค่ GPS 300 ม. แบบ non-blocking (5.1) | **ไม่มีเลย** | **ใช่ — ต้องออกแบบร่วม** ต้องเพิ่มสถานะ/สอง-เฟส (`Handover Pending` → `Received`) ซึ่งแตะ `job-statuses.ts` ทั้ง 3 repo + CI | ผู้รับต้องเป็น**พนักงานที่ระบุตัวได้** — ปลายทางของ audit คือ `staff` ไม่ใช่ `riders` · **[EMP §Q8.1]** เตือนว่าการประทับตัวตนลงงานมี 4 รูปที่เข้ากันไม่ได้ และ `qc_logs[].by` (ที่การส่งมอบจะไปลง) ใช้รูป "ชื่อที่แสดงผล" ซึ่งเป็นรูปที่แย่ที่สุดสำหรับ audit |
| 2 | **ยกเลิกงานตอนถือเครื่องอยู่ = งานไม่มีเจ้าของ** เขียน `rider_id: null` เสมอ ไม่ถามว่าเครื่องอยู่ที่ใคร (5.3 ข้อ 5) และไม่มีเที่ยวคืนเครื่อง (1.3 ข้อ 2) | **ไม่มีเลย** | **ใช่ — ต้องออกแบบร่วม** `Returning To Customer` มีในเอนุมแต่ไม่มีเส้นทางไรเดอร์ | ค่าเที่ยวคืน = เงินที่ต้องจ่ายใครสักคน → ผูกกับ `employment.type` (freelance หัก WHT / employee ไม่หัก) · **[EMP §Q8.2]** ชี้เพิ่มว่าความหมายของการยกเลิกถูกตัดสินจาก**คำนำหน้าใน `cancelled_by`** และมี defect ค้างอยู่: ตัวอ่านเช็ค `admin:` แต่ทุกตัวเขียนส่ง `staff:` |
| 3 | **สิทธิ์อ่าน/เขียนงานฝั่งไรเดอร์กว้างกว่าที่ UI แสดง** — `.read` ทั้งโหนด `jobs` และ `.write` ได้ทุกงานที่ `rider_id` ว่างโดยไม่ตรวจ status (4.1) | **มีแต่พึ่ง client** | ใช่บางส่วน — rule ที่จะตรวจ status ได้ต้องมีชุด status ที่นิ่งก่อน | ผูกโดยตรง: rule ตัดสินจากการมีแถวใน `/riders` ถ้า employees ถูกรวมศูนย์ ต้องแก้ rule ด้วย · **[EMP §Q3] ประเมินไว้ต่ำไป** — ไม่มีกฎไหนอ่าน `approval_status` เลย ไรเดอร์ที่ถูกพักงาน (และคนที่เพิ่งสมัครสถานะ `Pending`) ยังอ่าน `/jobs` ทั้งโหนดและ `/riders` ทั้งหมดได้ รวมเลขบัญชีและเอกสารบัตรของคนอื่น |
| 4 | **ไม่มี capacity / กันชนเวลาใดๆ** — assign ตรงและ claim ไม่ดูงานอื่นและไม่ดูเวลานัดเลย (4.3) | **ไม่มีเลย** | ไม่ — เป็นชั้นใหม่บนข้อมูลที่มีอยู่ (`pickup_schedule` + `rider_id`) | ผูก: เพดานงานต่อคนน่าจะเป็น attribute ของ employee/rider record |
| 5 | **ไม่มี shift / on-duty ที่ persist** — สวิตช์รับงานอยู่ใน memory, `riders/{id}/status` ไม่เคยถูกตั้งเป็น Offline, ไม่มี log ชั่วโมงทำงาน (4.4) | **ไม่มีเลย** | ไม่ | **ผูกหนักที่สุด** — ตารางเวร/ชั่วโมงทำงานคือของ employee ไม่ใช่ของ job; ถ้า employees จะโตจาก `riders` ต้องออกแบบพร้อมกันตั้งแต่แรก · **[EMP §Q3]** เพิ่มข้อควรระวัง: `/riders` เป็น self-registered ไม่มี choke point ฝั่ง server และ `.validate` ไม่ทำงานตอน delete — ฟิลด์เวรที่วางบนโหนดนี้ไรเดอร์ลบเองได้ |
| 6 | **`pickup_schedule` มี 3 รูปจากผู้เขียน 3 ราย** และแอปไรเดอร์อ่าน `time_start`/`time_end` ไม่ได้ (1.2) | **มีแต่กระจัดกระจาย** | เกี่ยวข้อง — ไฟล์ mirror ชุดเดียวกัน (`job-statuses.ts` / `appointment.ts`) แต่แก้แยกได้ | ไม่ |
| 7 | **ไม่มี push แจ้งไรเดอร์ตอนงานเข้ากอง** ต้องเปิดแอปค้าง (4.1) | **ไม่มีเลย** | ไม่ | ไม่ |
| 8 | **ระยะทางคำนวณ 5 ที่ คนละ endpoint คนละคู่พิกัด ไม่มีที่ไหนแชร์ผล** และ `recomputeCustomerPickupFee` ใช้เส้นตรงเป็นค่าหลักขณะที่ตอนสร้างงานใช้ระยะขับจริง (2.4) | **มีแต่ซ้ำซ้อน** | ไม่ | ไม่ |
| 9 | **snapshot การคำนวณไม่ครบ** — ไม่มีเวอร์ชันเรต ไม่มีต้นทาง/ปลายทางที่ใช้วัด, `duration_min` คำนวณแล้วแต่ถูกทิ้ง, `pickup_fee_meta` เขียนเฉพาะตอน reprice ไม่เขียนตอนสร้างงาน (3c) | **มีแต่ไม่ครบ** | ไม่ | ไม่ |
| 10 | **checkpoint หายเงียบเมื่อ GPS ล้ม** — `recordCheckpoint` อยู่ใน success callback ของ geolocation (5.2) | **มีแต่เปราะ** | ไม่ | ไม่ |
| 11 | **ไม่มีหน้าไหนตอบ "วันนี้วิ่งกี่งาน กี่กม. ได้เงินเท่าไหร่"** ครบในที่เดียว และ `HistoryTab` ใช้ `\|\| 150` แทน `getRiderPayout()` (6.1) | **มีแต่กระจัดกระจาย + มีบั๊ก** | ไม่ | ผูก: รายงานค่าตอบแทนย้อนหลังเป็นอินพุตของ payroll/WHT ซึ่งอยู่ฝั่ง employee · **[EMP §Q3]** กระเป๋าเงินเป็นค่า **derived** (fold ฝั่ง client จาก `transactions`) ไม่ได้เก็บยอด และ `employment` ที่ตัดสินการหักภาษีไรเดอร์ null ทิ้งเองได้ |
| 12 | **ระยะทางที่เก็บไม่ใช่ระยะที่วิ่งจริง** (ขาเดียว ลูกค้า→สาขา, ไม่มีขาไป, ไม่มี multi-stop) — ทำให้ "กี่กม." สร้างย้อนหลังไม่ได้ (2.3, 6.2) | **มีแต่ผิดความหมาย** | ไม่ | ผูก: ถ้าจ่ายตามระยะจริงในอนาคต ฐานคำนวณนี้ต้องเปลี่ยนก่อน |
| 13 | **`DispatcherPage` ปักหมุดงานด้วยพิกัดที่สังเคราะห์จาก hash ของ job id** ไม่ใช่ `cust_lat/cust_lng` (`bkk-system/src/pages/fleet/DispatcherPage.tsx:49-55`) แล้วเอาไปเรียงไรเดอร์ตาม "ระยะทาง" (`:104-105,113`) — แผนที่จ่ายงานแสดงตำแหน่งงานที่ไม่มีอยู่จริง | **มีแต่ผิด** | ไม่ | ไม่ |
| 14 | **ไม่มีการโอนงานระหว่างไรเดอร์** ต้อง unassign + assign ใหม่ (สองการเขียน ไม่ atomic ไม่มี audit) และ unassign ไม่แจ้งไรเดอร์ที่ถืออยู่ (4.2) | **ไม่มีเลย** | ไม่ | ไม่ |
| 15 | **Store-in / Mail-in ไม่มีตัวแทนในแอปไรเดอร์เลย** (`useRiderData.ts:173`) — ถ้าวันหนึ่งต้องให้ไรเดอร์ไปรับพัสดุที่ไปรษณีย์หรือส่งของระหว่างสาขา ไม่มีที่ให้ยืน (1.3) | **ไม่มีเลย** | **ใช่ — ต้องออกแบบร่วม** งานที่ไม่ใช่ trade-in ต้องมีชุดสถานะของตัวเอง ไม่ใช่ยัดเข้า `job-statuses.ts` เดิม | ไม่ |
| 16 | **`assigned_at` เขียนจากที่เดียว** (`DispatcherPage.tsx:117`) — งาน broadcast ไม่มีฟิลด์นี้ ทำให้ "เวลาที่งานถูกจ่าย" คำนวณข้ามโหมดไม่ได้ (5.2) | **มีแต่ไม่ครบ** | ไม่ | ไม่ |

### ข้อเสนอลำดับการทำ (ไม่ใช่การตัดสินใจ)

1. **#1 + #2 + #15 ต้องออกแบบร่วมกับการรื้อ status model** — ทั้งสามข้อคือ "สถานะที่หายไป"
   ไม่ใช่ "ฟีเจอร์ที่ขาด" การเพิ่มทีละใบเข้าไปใน `job-statuses.ts` ที่ mirror 3 repo และมี
   ~245 จุดเทียบ literal จะแพงกว่าการรื้อรอบเดียว
2. **#5 ต้องรอ (หรือไปพร้อม) การตัดสินใจเรื่อง employees** — ตารางเวรเป็นของคน ไม่ใช่ของงาน
   ทำเป็น `riders/{id}/shifts` ตอนนี้แล้วย้ายทีหลังคือการสร้าง mirror ตัวที่ n
3. **#3, #10, #13, #11(บั๊ก 150) แก้แยกได้ทันที** ไม่ผูกกับการออกแบบใหญ่
