# Survey: เส้นทางตัวเลขเงิน + ระยะทาง ของแอปไรเดอร์ (31 ส.ค. 2569)

> ขอบเขต: bkk-rider-app เป็นหลัก, อ่าน bkk-frontend-next + bkk-system เท่าที่จำเป็น.
> ทุกข้อสรุปมี `file:line` กำกับ — line number อิง HEAD ของแต่ละ repo ณ วันสำรวจ
> (bkk-rider-app @ `d85f6c5`). **รายงานนี้เป็น survey ล้วน ไม่มีการแก้โค้ด**

---

## (ก) แผนผังเส้นทางตัวเลขเงิน (text)

```
[ลูกค้า checkout เว็บ]                                      [แอดมิน bkk-system]
bkk-frontend-next/functions/src/index.ts
  validateAndCreateOrder
    ├─ ราคาเครื่อง = priceCart (server)  ──────────────┐
    ├─ pickup_fee = calculateZoneFee(zone, distKm)      │  (index.ts:1427)
    │     distKm = client Routes API หรือ haversine×1.3 │  (index.ts:1374-1391)
    ├─ rider_fee_discount = โปรโมชั่นค่าส่ง             │  (index.ts:1620-1637)
    └─ net_payout = max(0, subtotal + coupon − effFee)  │  (index.ts:1646-1650, 1869)
                    เขียนลง jobs/{id}                    ▼
                                            jobs/{id}: price, final_price, pickup_fee,
                                            rider_fee_discount, applied_coupons, net_payout
                                                         │
        [DB trigger ฝั่ง bkk-system/functions/index.js]  │
  สร้างงาน → onNewTicketCreated: rider_fee_estimate (+_meta) จาก computeRiderFee (1793-1806)
  rider_id เปลี่ยน → onRiderAssignedRecalcEstimate: estimate ใหม่ตามยานพาหนะ (3467-3508)
  หมุดขยับ → onPickupLocationChanged: estimate ใหม่ (3182-3237)
           → ฝั่ง frontend: onPickupPinCustomerFee คิด pickup_fee+net_payout ใหม่ (668-676)
  เปลี่ยนวิธีรับ → onReceiveMethodChanged (3086-3112) + onMethodChangeCustomerFee (679-686)
                                                         │
[แอปไรเดอร์ bkk-rider-app]                               ▼
  กองงาน/รายละเอียด: getRiderPayout(job, vehicle)  ← rider_fee → fee_by_vehicle → estimate
                      (src/utils/jobHelpers.ts:89-101)
  ราคาเครื่องที่โชว์: getDisplayPrice = net_payout → final_price → price (jobHelpers.ts:4-7)
  ตรวจสภาพ: InspectionModal คิดหักด้วย pricingResolver (mirror) → final_price ต่อเครื่อง
    → handleInspectionSubmit เขียนทับ jobs/{id}: devices[], final_price, price, net_payout
      (src/pages/RiderApp.tsx:182-202) — สูตร net = max(0, ราคารวม − effFee + coupon + adj)
  ส่งมอบสาขา: handleCompleteJob เขียน rider_fee_status='Pending' (useJobActions.ts:361-363)
    → trigger onJobHandedOverCalcRiderFee เขียน jobs/{id}/rider_fee (settlement, ตัวจริง)
      (bkk-system/functions/index.js:3379-3444; Routes API ระยะจริง × rate card)
                                                         │
[Finance bkk-system]                                     ▼
  RiderSettlements อนุมัติค่ารอบ → transactions/{key} CREDIT JOB_PAYOUT (amount = rider_fee||150)
      + jobs/{id}/rider_fee_status='Paid' (RiderSettlements.tsx:38-90)
  TradeInPayouts จ่ายลูกค้า → transactions DEBIT TRADE_IN_PAYOUT (rider_id='SYSTEM')
      + CREDIT LOGISTICS_REVENUE (rider_id = ไรเดอร์!) (TradeInPayouts.tsx:157-182)
  RiderWithdrawals โอนถอน → transactions DEBIT WITHDRAWAL (+wht_amount/net_paid)
      (RiderWithdrawals.tsx:96-123)
                                                         │
[Wallet แอปไรเดอร์]                                      ▼
  balance = Σ(CREDIT) − Σ(DEBIT) ของ transactions ที่ rider_id = ตัวเอง **ไม่กรอง category**
  (src/hooks/useRiderData.ts:153-154; query scoped ที่ usePaginatedDatabase.ts:35-37)
  ขอถอน: handleRequestWithdraw push ลง /withdrawals (useJobActions.ts:404-409)
    ⚠ แต่ finance อ่านจาก /jobs type='Withdrawal' และ rules ไม่มี node /withdrawals — ดู (ค)#1
```

---

## (ข) ตารางฟิลด์เงิน → ที่เขียน → ที่อ่าน → ที่แสดง

| ฟิลด์ (path จริงใน RTDB) | ความหมาย | ที่เขียน | ที่อ่าน/แสดง (ฝั่ง rider เว้นแต่ระบุ) |
|---|---|---|---|
| `jobs/{id}/price`, `final_price` | ราคารับซื้อรวมของงาน (รวมอุปกรณ์เสริม) | สร้างงาน: `validateAndCreateOrder` (bkk-frontend-next/functions/src/index.ts:1860-1869 บริเวณ payload) · rider ตรวจสภาพเขียนทับ (bkk-rider-app/src/pages/RiderApp.tsx:200-201) · แอดมินแก้ราคา (bkk-system/src/pages/mobile/MobileTicketDetail.tsx:338, 843-850) · Internal QC (bkk-system/src/features/trade-in/components/qc/InternalQCModal.tsx:289-312) | `getDisplayPrice` (jobHelpers.ts:4-7) → ActiveJobCard.tsx:83, IncomingJobCard.tsx:42, JobDetailPage.tsx:167, receiptGenerator.ts:78-82 |
| `jobs/{id}/original_price` | ยอด quote ตอนสร้างงาน (audit) | สร้างงานครั้งเดียว; rules ห้ามแก้โดย non-admin (database.rules.json:66-68 บริเวณ `original_price`) | ไม่แสดงในแอป rider (comment RiderApp.tsx:195-197) |
| `jobs/{id}/net_payout` | ยอดโอนสุทธิให้ลูกค้า | สร้างงาน (index.ts:1869) · rider inspection (RiderApp.tsx:193,202) · cloud functions (bkk-system/functions/index.js:3108, 4579; bkk-frontend-next/functions/src/index.ts:631) · แอดมิน client (MobileTicketDetail.tsx:396,427,446,461,477; InternalQCModal.tsx:312) | `getDisplayPrice` ตัวแรกสุด (jobHelpers.ts:5) — ทุกการ์ด/หน้า detail |
| `jobs/{id}/pickup_fee` | ค่าส่งที่**หักจากลูกค้า** (โซนราคาเว็บ) | `validateAndCreateOrder` (index.ts:1427,1432) · `recomputeCustomerPickupFee` (index.ts:628) · `onReceiveMethodChanged` เซ็ต 0 เมื่อไม่ใช่ Pickup (bkk-system/functions/index.js:3106) — rules ล็อกให้ admin เท่านั้น (database.rules.json:69-71) | rider อ่านเข้าไปในสูตร net ตอน inspection (RiderApp.tsx:182) — ไม่แสดงเป็นบรรทัดแยก |
| `jobs/{id}/rider_fee_discount` | ส่วนลดค่าส่งที่บริษัท absorb | สร้างงาน (index.ts:1620-1637) · แก้/ลบโดยแอดมิน (MobileTicketDetail.tsx:468-477) · เคลียร์เมื่อออกจาก Pickup (bkk-system index.js:3107) | rider ใช้ในสูตร net ตอน inspection (RiderApp.tsx:183) |
| `jobs/{id}/applied_coupons[]` / `applied_coupon` | คูปองบวกเข้ายอดลูกค้า | `validateAndCreateOrder` (couponEngine) — rules ล็อก code/value (database.rules.json บริเวณ 78-96) | `sumAppliedCoupons` (src/utils/adjustments.ts:35-41) เข้าสูตร net (RiderApp.tsx:185) |
| `jobs/{id}/adjustments[]` | รายการหัก/เพิ่ม ad-hoc (เฉพาะ `status='applied'`) | rider เสนอผ่าน amendment → server apply (bkk-system/functions/index.js:4544-4580) · แอดมิน (MobileTicketDetail.tsx:374-427) | `sumAppliedAdjustments` (src/utils/adjustments.ts:5-15) เข้าสูตร net (RiderApp.tsx:193) |
| `jobs/{id}/rider_fee_estimate` (+`rider_fee_estimate_meta.fee_by_vehicle/distance_km/rates/reason`) | ค่ารอบ**ประมาณการ**ก่อนรับงาน | bkk-system triggers เท่านั้น: onNewTicketCreated (index.js:1796-1799), onReceiveMethodChanged (3089-3091), onPickupLocationChanged (3214-3217), onRiderAssignedRecalcEstimate (3495-3499) — rules ล็อก admin (database.rules.json:75-77) | `getRiderPayout` (jobHelpers.ts:89-101) → IncomingJobCard.tsx:31, JobDetailPage.tsx:160 |
| `jobs/{id}/rider_fee` (+`rider_fee_meta`) | ค่ารอบ**จริง** (settlement) | `onJobHandedOverCalcRiderFee` (bkk-system index.js:3427-3436; ไม่ทับถ้ามีแล้ว :3417) — rules ล็อก admin (database.rules.json:72-74) | `getRiderPayout` เลือกก่อนทุกตัว (jobHelpers.ts:91-92) · HistoryTab.tsx:35,102 (`|| 150`) · RiderSettlements.tsx:39,50,77,138 (`|| 150`) |
| `jobs/{id}/rider_fee_status` | คิว settlement (`Pending`→`Paid`) | rider ตอนปิดงาน (useJobActions.ts:362) · trigger (index.js:3433-3434) · finance flip Paid (RiderSettlements.tsx:46,71) | filter หน้า settlement (RiderSettlements.tsx:24-35) |
| `jobs/{id}/wht_amount`, `wht_rate_percent`, `net_paid` | ภาษีหัก ณ ที่จ่ายของ "แถวถอน" | RiderWithdrawals.tsx:118-121 | รายงาน WHT ฝั่งแอดมิน; แอป rider โชว์แค่ประมาณการก่อนกด (WithdrawModal.tsx:30,51-71) |
| `transactions/{key}` (`amount`, `type CREDIT/DEBIT`, `category`, `rider_id`, `wht_amount`, `net_paid`) | ledger กระเป๋าไรเดอร์ | finance เท่านั้น: JOB_PAYOUT (RiderSettlements.tsx:48-56,75-83), WITHDRAWAL (RiderWithdrawals.tsx:105-117), TRADE_IN_PAYOUT + LOGISTICS_REVENUE (TradeInPayouts.tsx:159-182) — rules: write admin, read ตาม query rider_id (database.rules.json:848+) | balance (useRiderData.ts:153-154) · WalletTab.tsx:19,50 |
| `/withdrawals` (rider เขียน) | คำขอถอน | **rider app push** (useJobActions.ts:404-409) | **ไม่พบผู้อ่านใดๆ ทั้ง 3 repo** — ดู (ค)#1 |
| `devices[].estimated_price` / `price` / `base_price` / `deductions` | ราคารายเครื่อง + รายการหัก | สร้างงาน (server freeze `base_price`) · rider inspection ทับ estimated_price/price = final_price ต่อเครื่อง (RiderApp.tsx:156-158) | JobDetailPage.tsx:268; InspectionModal ใช้ `base_price` เป็นฐานคิดหัก (InspectionModal.tsx:159-171) |
| `accessory_items[]` (`price` ต่อชิ้น) | breakdown อุปกรณ์เสริม (มูลค่ารวมอยู่ใน price แล้ว) | สร้างงาน (index.ts:1934 บริเวณ) | `sumAccessoryItems` บวกกลับตอน recompute (jobHelpers.ts:60-61 → RiderApp.tsx:189-190), แสดง JobDetailPage.tsx:321 |
| `riders/{id}/vehicle_type` | ตัวเลือก rate card | แอดมินหน้า /riders (bkk-system) | useRiderData.ts:98 → `getRiderPayout(job, vehicleType)` |
| `settings/logistics_rates` (+`by_vehicle`) | rate card ค่ารอบ (default base 60 / km 15 / min 100 / max 500) | แอดมิน /global-settings | `getLogisticsRates` (bkk-system index.js:452-470); default index.js:336-341 |
| `settings/store/delivery_pricing` (zones) | ราคาโซนค่าส่งลูกค้า | แอดมิน | `calculateZoneFee` (bkk-frontend-next/functions/src/deliveryZones.ts:142-150; mirror app/utils/deliveryZones.ts:170-177) |
| `settings/accounting/rider_wht` | สวิตช์+อัตรา WHT | แอดมิน /accounting-settings | rider: WithdrawModal.tsx:22-28; finance: RiderWithdrawals.tsx:20-24; server: bkk-system/functions/rider-wht.js:31-45 |
| (hardcode) `SERVICE_OPTIONS` 50/100/200 | หน้า demo `/checkout` ในแอป rider | bkk-rider-app/src/pages/Checkout.tsx:21-43 — hardcode ล้วน กดยืนยันแล้วไม่เขียน DB (Checkout.tsx:58-60) แต่ route จริงอยู่ (App.tsx:142) | หน้าเดียวกัน |

---

## คำตอบรายข้อ

### ส่วนที่ 1 — money path

**2. คำนวณที่ไหน**
- **Server (cloud functions):** ราคาเครื่อง+pickup_fee+coupon+net_payout ตอนสร้างงาน (bkk-frontend-next/functions/src/index.ts:1427,1646-1650,1869) · pickup_fee/net_payout เมื่อหมุด/วิธีรับเปลี่ยน (index.ts:543-661) · rider_fee_estimate/rider_fee ทุกตัว (bkk-system/functions/index.js:597-678, 3379-3508) · WHT ตัวจริงตอนออก 50 ทวิ (bkk-system/functions/rider-wht.js:59-70)
- **Client:** rider inspection คิดหักและเขียน final_price/net_payout เอง (RiderApp.tsx:141-202 + InspectionModal.tsx:305-327) · แอดมิน client เขียน net_payout หลายจุด (MobileTicketDetail.tsx:396,427,446,461,477; InternalQCModal.tsx:312; TradeInPayouts.tsx:41-49) · wallet balance คิดใน client (useRiderData.ts:154) · WHT ที่โชว์ก่อนถอนคิดใน client (WithdrawModal.tsx:30)
- **Hardcode:** `150` fallback ค่ารอบ (RiderSettlements.tsx:39,50,77,138 และ bkk-rider-app HistoryTab.tsx:35,102) · ราคา demo 50/100/200 (Checkout.tsx:27,34,41) · ขั้นต่ำถอน 100 (useJobActions.ts:401) · default WHT 3% (riderWht.ts:13) · default logistics rates (bkk-system index.js:336-341)

**3. คำนวณซ้ำมากกว่าหนึ่งที่** — ดูรายละเอียดคู่ที่ไม่ตรงใน (ค); สรุปตำแหน่ง:
- สูตร `net_payout = max(0, base − effFee + coupon + Σadj)` มี ≥6 สำเนา: RiderApp.tsx:193 · MobileTicketDetail.tsx:273-277+446 · InternalQCModal.tsx:301-312 · TradeInPayouts.tsx:41-49 · bkk-system/functions/index.js:3108,4573-4579 · bkk-frontend-next/functions/src/index.ts:614-631,1646-1650 — สูตรตรงกัน ยกเว้น gate `receive_method` ฝั่ง rider (ดู (ค)#5)
- ตัวหักสภาพ `pricingResolver` mirror 3 repo — diff แล้ว **โค้ดตรงกัน byte-level (ต่างแค่คอมเมนต์)**: bkk-rider-app/src/utils/pricingResolver.ts ↔ bkk-system/src/utils/pricingResolver.ts ↔ bkk-frontend-next/app/utils/pricingResolver.ts
- สูตร WHT mirror 3 ที่ ตรงกัน (round2 + 3%): bkk-rider-app/src/utils/riderWht.ts:40-52 ↔ bkk-system/src/utils/riderWht.ts:41-59 ↔ bkk-system/functions/rider-wht.js:59-70
- `calculateZoneFee` mirror 2 ที่ ตรงกัน (functions/src/deliveryZones.ts:142-150 ↔ app/utils/deliveryZones.ts:170-177)

**4. Rounding / หน่วย** — ทั้งระบบเป็น **บาทจำนวนเต็ม** ยกเว้น WHT เป็นสตางค์ 2 ตำแหน่ง:
- ค่ารอบไรเดอร์: `Math.round(clamp(base+per_km×d, min, max))` (bkk-system index.js:563-567); `distance_km` เก็บปัด 2 ตำแหน่ง (index.js:665) แต่**คิดเงินจากค่าดิบก่อนปัด** (index.js:660)
- ค่าส่งลูกค้า: `Math.round(baseFare + chargeableKm×perKm)` (deliveryZones.ts:146-148); ระยะ haversine×1.3 ไม่ปัดก่อนเข้าโซน (index.ts:563,1380)
- ตัวหักสภาพ: `Math.round` ต่อ option หลังคูณ liquidity factor (pricingResolver.ts:81-94) — ปัดรายบรรทัดเหมือนกันทุก mirror
- WHT: `round2` (สตางค์) ทั้ง gross/wht/net (riderWht.ts:20,50-51) → `transactions.net_paid` อาจมีเศษสตางค์ ขณะ `amount` เป็นเต็ม (RiderWithdrawals.tsx:107,115)

**5. จุดที่ค่าเงินถูกเขียนทับหลังคำนวณครั้งแรก**
1. rider ส่งผลตรวจ: ทับ `final_price`/`price`/`net_payout` ทั้งงาน (RiderApp.tsx:198-202)
2. rider ย้อนผลตรวจ: ลบ `photos/deductions/inspection_status` แต่ **ไม่คืน `estimated_price` เดิม** — ราคาที่ inspection เขียนไว้ค้างบน devices และ `final_price`/`net_payout` ระดับ job ก็ค้างจนกว่าจะ submit ใหม่ (useJobActions.ts:333-345)
3. หมุดขยับ/เปลี่ยนวิธีรับ: functions สองฝั่งเขียนทับ pickup_fee, net_payout, rider_fee_estimate (bkk-frontend-next index.ts:668-686; bkk-system index.js:3086-3112, 3182-3237)
4. ไรเดอร์กดรับงาน (rider_id เปลี่ยน): estimate ถูกคิดใหม่ด้วย rate card ของคนรับ (bkk-system index.js:3495-3499) — เลขที่เห็นตอนกดรับกับหลังรับ**เปลี่ยนได้**
5. ส่งมอบสาขา: `rider_fee` ตัวจริงทับ estimate ในสายตา UI (jobHelpers.ts:91-92; เขียน index.js:3429)
6. amendment ถูกอนุมัติ: server append adjustment + net_payout ใหม่ (bkk-system index.js:4570-4579)
7. Finance จ่ายลูกค้า: **ไม่เชื่อ `net_payout` ใน DB** — คิดสดจาก final_price แล้วโอนตามนั้น (TradeInPayouts.tsx:39-49,124)

**6. Fallback path ทั้งหมดที่ทำให้ได้เลขคนละแบบ**
1. Routes API ล้ม/ไม่มีคีย์/timeout 8 วิ/ไม่มีพิกัด → ค่ารอบ = `min_fee` flat (ไม่ใช่ haversine) พร้อม `reason` ใน meta (bkk-system index.js:614-635, 563-567; timeout index.js:378-379)
2. `rider_fee` ไม่มีตอน settle → **hardcode 150** (RiderSettlements.tsx:39,50,77)
3. รายได้ในแท็บประวัติ rider → `rider_fee || 150` (HistoryTab.tsx:35,102)
4. `getRiderPayout` chain: `rider_fee` → `fee_by_vehicle[vehicle]` → `rider_fee_estimate` → 0; ไม่รู้ยานพาหนะ = เห็นเลขมอเตอร์ไซค์ (jobHelpers.ts:89-101)
5. ค่าส่งลูกค้า: Routes (client) → haversine×1.3; server ตรวจ client distance ต่ำกว่า 50% ของ haversine = ใช้ haversine แทน (bkk-frontend-next index.ts:1374-1391; quotePickupServiceability index.ts:1019-1020; client useDeliveryManager.ts:834-875)
6. อ่าน `settings/accounting/rider_wht` ล้มใน WithdrawModal → โชว์ว่าไม่หัก แต่ฝั่ง finance/server ยังหักจริง (WithdrawModal.tsx:24-27 vs RiderWithdrawals.tsx:30-35)
7. `device.base_price` หาย → InspectionModal ใช้ `estimated_price` เป็นฐาน = เสี่ยงหักซ้ำ (log เตือนไว้) (InspectionModal.tsx:159-171)
8. `getDisplayPrice`: `net_payout` → `final_price` → `price` → 0 (jobHelpers.ts:4-7)
9. rate card: `by_vehicle` ไม่กรอก → fallback ฟิลด์แบน root → DEFAULT ทีละฟิลด์ (bkk-system index.js:452-470)
10. legacy: client ไม่ส่ง `provinceId` → `calculatePickupFee` โมเดลระยะทาง global เดิม (คืน −1 = นอกเขต) (index.ts:1428-1433, 270-279)

### ส่วนที่ 2 — distance

**7. origin → destination**
- **ค่ารอบไรเดอร์ (เงินไรเดอร์):** origin = **หมุดลูกค้า** `cust_lat/cust_lng` (fallback หลายชื่อฟิลด์: `resolveCustomerCoords` bkk-system index.js:540-557) → destination = **สาขา**: `job.branch_details.{lat,lng}` → `settings/branches/{branch_id}` → สาขา active แรก (`resolveBranchCoords` index.js:496-533). **ไม่ใช้พิกัดปัจจุบันของ rider เลย** — พิกัด rider (riders/{id}/lat,lng อัปเดตทุก 10 วิ + ทุกครั้งเปลี่ยนสถานะ: useRiderData.ts:119-144, useJobActions.ts:51-57) ใช้แค่ tracking/geofence ไม่เข้าเงิน
- **ค่าส่งลูกค้า:** origin = **สาขา active ที่ใกล้สุด** (haversine เลือกสาขา: index.ts:308-326, fallback `STORE_LOCATION` index.ts:296) → destination = หมุดลูกค้า
- **geofence เช็คอิน (ไม่ใช่เงิน):** haversine พิกัด GPS rider ขณะกด ↔ หมุดลูกค้า/สาขาใกล้สุด, threshold 200/250/300 ม. (src/utils/checkpoints.ts:34-47,54-63,108-140)

**8. one-way หรือ round-trip** — **one-way ทั้งสองระบบ**: ค่ารอบ = ระยะลูกค้า→สาขา เที่ยวเดียว (index.js:625 เรียก `fetchDrivingDistance(custCoords, branchCoords)` ครั้งเดียว) และค่าส่งลูกค้า = สาขา→ลูกค้า เที่ยวเดียว (index.ts:563). ไรเดอร์วิ่งจริงเป็น สาขา→ลูกค้า→สาขา แต่สูตรจ่ายชดเชยด้วย `base_fee` + clamp min/max — เป็นการออกแบบ ไม่ใช่บั๊ก แต่ **เงินที่จ่ายไม่ได้สะท้อนระยะวิ่งจริงสองเที่ยว**

**9. หลายจุดต่อรอบ** — **ไม่พบระบบ multi-stop/สะสมระยะใดๆ**: ทุก job คิดแยกอิสระต่อใบ (`computeRiderFee` รับ job เดียว: index.js:597) และ settlement เข้ากระเป๋าเป็น CREDIT ต่อ job (RiderSettlements.tsx:48-56). ไรเดอร์ถือหลายงานพร้อมกันได้ (activeList) แต่ได้ค่ารอบเต็มทุกใบ

**10. ใคร call Routes API**
- **ค่ารอบไรเดอร์:** server เท่านั้น — bkk-system/functions/index.js:352-419 (`fetchDrivingDistance`, endpoint `routes.googleapis.com/directions/v2:computeRoutes`, คีย์ `process.env.GOOGLE_MAPS_API_KEY` ของ bkk-system functions, index.js:353) **ไม่มี cache** — ยิงใหม่ทุก trigger event (สร้างงาน/เปลี่ยนวิธีรับ/หมุดขยับ/รับงาน/ส่งมอบ) แล้ว persist ผลใน `*_meta`; ETA อาจยิงรอบสองถ้าโหมดยานพาหนะต่าง (index.js:645-657)
- **ค่าส่งลูกค้า (ตอน checkout):** client เบราว์เซอร์ยิง Routes API เอง (bkk-frontend-next/app/hooks/useDeliveryManager.ts:207-278) ด้วยคีย์ Maps ฝั่งเว็บ แล้วส่ง `pickupDistanceKm` ให้ server ตรวจ (index.ts:1374-1385); ฝั่ง server มี `drivingDistanceKm` ของตัวเอง (index.ts:895-938 ใช้ใน `quotePickupServiceability` index.ts:1013) คีย์ `GOOGLE_MAPS_API_KEY` ของ bkk-frontend-next functions. **ไม่มี cache ทั้งคู่** — invalidate จึงไม่มี; ความสดมาจากการคิดใหม่ต่อ event/ต่อ request
- **แอป rider ไม่เรียก Routes API เลย** — เปิด Google Maps เป็น deep link นำทางเท่านั้น (useJobActions.ts:370-389)

**11. persist หรือคิดใหม่ทุกครั้ง** — **persist**: `rider_fee_estimate` + `rider_fee_estimate_meta.distance_km`, `rider_fee` + `rider_fee_meta`, `pickup_fee` (+`pickup_fee_meta` index.ts:633). แอป rider อ่านค่าที่เก็บไว้เสมอ ไม่คิดระยะใหม่. **เคสค่าเก่าค้าง:**
- แก้ `settings/logistics_rates` หลัง estimate ถูกเขียน → กองงานยังโชว์เลขเก่าจน มี event ใหม่ (ไม่มี trigger on rates change — ไม่พบใน bkk-system/functions/index.js)
- `onJobHandedOverCalcRiderFee` ข้ามถ้า `rider_fee` มีแล้ว (index.js:3412,3417) — แอดมินตั้งมือไว้ = ระยะจริงไม่ถูกคิดเลย (by design)
- estimate ที่คิดตอนยังไม่มีคนรับ = อัตรามอเตอร์ไซค์ (index.js:593-595) จนกว่า `onRiderAssignedRecalcEstimate` ยิง; ถ้า trigger fail (index.js:3504-3506 แค่ log) เลขมอเตอร์ไซค์ค้างให้คนขับรถยนต์
- `net_payout` ใน DB ค้างได้ (path เก่าอัปเดต final_price ไม่ sync) — finance จึงคิดสดก่อนโอน (TradeInPayouts.tsx:39-49) แต่ **หน้า track ลูกค้ากับแอป rider ยังโชว์ค่าที่ค้าง**

### ส่วนที่ 3 — cross-repo

**12. checkout (ลูกค้า) vs rider app: สูตรค่าเดินทาง**
แอป rider **ไม่ได้คิดค่าเดินทางเอง** — คู่ที่ต้องเทียบจริงคือ "ค่าส่งลูกค้า (bkk-frontend-next)" กับ "ค่ารอบไรเดอร์ (bkk-system)" ซึ่ง**คนละสูตร คนละระยะทาง คนละ settings โดยตั้งใจ** (invariant #3 ใน bkk-system/CLAUDE.md):

| | ค่าส่งลูกค้า (`pickup_fee`) | ค่ารอบไรเดอร์ (`rider_fee*`) |
|---|---|---|
| สูตร | flat ต่อโซน หรือ `round(baseFare + max(0,d−freeRadius)×perKm)` cap `maxFee`, d≤0 → 0 (deliveryZones.ts:142-150) | `round(clamp(base_fee + per_km×d, min_fee, max_fee))`; ไม่รู้ d → `min_fee` (bkk-system index.js:563-567) |
| ระยะ d | client Routes API หรือ **haversine×1.3** สาขาใกล้สุด→ลูกค้า (index.ts:563,1374-1391) | **Routes API จริง** ลูกค้า→สาขา ตาม `rates.travel_mode` (index.js:625) |
| free radius | มี (`freeRadius`) | ไม่มี — มี `min_fee` floor แทน |
| settings | `settings/store/delivery_pricing` (โซนตามจังหวัด) | `settings/logistics_rates` (+`by_vehicle`) |
| ใครคิด | frontend functions + client เว็บ | bkk-system functions เท่านั้น |

ผลคือเลขสองตัวนี้ **ไม่มีวันเท่ากันโดยโครงสร้าง** (จ่ายลูกค้าจากเส้นตรง×1.3, จ่ายไรเดอร์จากถนนจริง) — ตรงตามเจตนาที่จดไว้ (bkk-frontend-next/functions/src/index.ts:536-542, bkk-system/functions/index.js:3059-3086)

**13. bkk-system แสดง/แก้เงินได้ที่ไหน และเขียนกลับฟิลด์ไหน**
- แก้ราคาเครื่อง (mobile): `MobileTicketDetail.tsx:338` และ `843-850` → `final_price` + `net_payout` (+devices เมื่อเครื่องเดียว)
- Internal QC (desktop): `InternalQCModal.tsx:225,289-312` → `devices[].final_price`, `final_price`, `net_payout` (บวก `sumAccessoryItems` กลับ :298)
- Adjustments/Offer: `MobileTicketDetail.tsx:374-427` → `adjustments[]` + `net_payout`; อนุมัติ rider amendment ฝั่ง server `functions/index.js:4544-4580` → `adjustments[]` + `net_payout`
- ลบคูปองรายใบ: `MobileTicketDetail.tsx:446,461` → `applied_coupons[]`/`applied_coupon` + `net_payout` (ledger คืนโดย trigger `onJobCouponsRevoked`)
- แก้ส่วนลดค่าไรเดอร์: `MobileTicketDetail.tsx:468-477` → `rider_fee_discount` + `net_payout` (sync ledger โดย `onRiderFeeDiscountEdited`)
- เปลี่ยนวิธีรับ/ย้ายหมุด: client เขียนเฉพาะ `receive_method`/พิกัด — เงินเป็นของ triggers (bkk-system index.js:3086-3112, 3182-3237 + bkk-frontend-next index.ts:668-686)
- Finance: จ่ายลูกค้า `TradeInPayouts.tsx:105-184` → `jobs/{id}` (status/paid_at/slip) + `transactions` DEBIT TRADE_IN_PAYOUT + CREDIT LOGISTICS_REVENUE; อนุมัติค่ารอบ `RiderSettlements.tsx:38-90` → `rider_fee_status='Paid'` + `transactions` CREDIT JOB_PAYOUT; โอนถอน `RiderWithdrawals.tsx:96-123` → `transactions` DEBIT WITHDRAWAL + `jobs/{withdrawalRow}` + `wht_*`
- `PricingSidebar.tsx:206-207` แสดง net breakdown (desktop); การเจรจาตั้ง `final_price` ผ่าน workflow ของหน้า ticket

---

## (ค) จุดที่ตัวเลขไม่ตรงกันได้ — เรียงตามความน่าจะเป็นสาเหตุจริง

1. **ท่อขอถอนเงินขาดกลาง: rider เขียน `/withdrawals` แต่ finance อ่าน `/jobs`** —
   แอป rider push คำขอถอนลง `push(ref(db,'withdrawals'))` (bkk-rider-app/src/hooks/useJobActions.ts:404) แต่หน้า finance กรองจาก `useDatabase('jobs')` เอาเฉพาะ `status==='Withdrawal Requested' && type==='Withdrawal'` (bkk-system/src/pages/finance/components/RiderWithdrawals.tsx:16,45-53) และ **ไม่มีใครอ่าน `/withdrawals` เลยทั้ง 3 repo** (grep พบผู้เขียนที่เดียวคือ useJobActions.ts:404) ยิ่งกว่านั้น `database.rules.json` **ไม่มี node `withdrawals`** จึงตกกฎ root `".write": false` (bkk-frontend-next/database.rules.json:3-4) — การ push จาก rider ควรโดน PERMISSION_DENIED และเข้า catch แสดง error (useJobActions.ts:413-414) **สรุป: คำขอถอนจากแอปไปไม่ถึง finance ไม่ทางใดก็ทางหนึ่ง** (เขียนไม่ได้ หรือเขียนได้แต่ไม่มีคนอ่าน)

2. **wallet ไรเดอร์นับ `LOGISTICS_REVENUE` เป็นเงินเข้าของตัวเอง**
   **(อัปเดต 31 ส.ค. 2569: เจ้าของงานยืนยันอาการจริง "กระเป๋าเงินในแอปไรเดอร์แสดงค่าไม่ถูกต้อง" — ข้อนี้คือผู้ต้องสงสัยอันดับหนึ่ง)** —
   ตอน finance จ่ายลูกค้า มีการเขียน CREDIT `category:'LOGISTICS_REVENUE'` ด้วย `rider_id` ของไรเดอร์ ยอด = `rider_fee` จาก **3 จุดเขียน**:
   - desktop finance: bkk-system/src/pages/finance/components/TradeInPayouts.tsx:170-182
   - mobile finance: bkk-system/src/pages/mobile/MobileFinancePage.tsx:186-193 (`rider_id: selectedTx.rider_id || 'SYSTEM'`, `amount: riderFee` — riderFee จาก :152)
   - เครื่องมือซ่อม ledger ก็ backfill รูปเดียวกัน: bkk-system/src/pages/finance/components/TransactionRepair.tsx:101-108 (และเขียน WITHDRAWAL DEBIT ด้วย `rider_id: job.rider_id || 'SYSTEM'` ที่ :75-84)
   ขณะที่ balance ฝั่งแอป rider รวม**ทุก CREDIT ที่ rider_id ตรง โดยไม่กรอง category** (bkk-rider-app/src/hooks/useRiderData.ts:153-154) → ลายเซ็นของอาการ: balance บวมทีละ `rider_fee` ทุกครั้งที่ finance กดจ่ายลูกค้าของงาน Pickup (**ก่อน** settlement ด้วยซ้ำ) และถ้างานเดียวกันถูกอนุมัติค่ารอบ (JOB_PAYOUT) ก็เข้าซ้ำเป็น **สองก้อนต่องาน** = เกินจริง 2×rider_fee; แถว "LOGISTICS_REVENUE" โผล่ใน WalletTab เป็นชื่อ category ดิบ (WalletTab.tsx:45,50)
   วิธียืนยันจากข้อมูลจริงโดยไม่ต้องแก้โค้ด: ดึง `transactions` ที่ `rider_id` ของไรเดอร์คนนั้น แล้วแยกยอดตาม `category` — ถ้า Σ(LOGISTICS_REVENUE) ≈ ส่วนที่ balance เกิน ก็ปิดเคสได้เลย

3. **fallback 150 บาท hardcode ตอน settle/แสดงรายได้** —
   `Number(job.rider_fee || 150)` ตอนอนุมัติค่ารอบทั้งรายตัวและ batch (bkk-system RiderSettlements.tsx:50,77 + confirm :39 + แสดง :138) และแท็บประวัติแอป rider `job.rider_fee || 150` (bkk-rider-app/src/components/history/HistoryTab.tsx:35,102) — ถ้า trigger settlement ไม่ยิง (เช่น งานข้าม status ที่ไม่อยู่ใน `FEE_TRIGGER_STATUSES` index.js:3393 หรือ function error) เงินที่เข้ากระเป๋าจะเป็น 150 คงที่ ไม่ใช่ค่าที่ rate card คิด และไม่ตรงกับ `rider_fee_estimate` ที่ไรเดอร์เห็นตอนรับงาน

4. **เลขที่เห็นตอนกดรับงาน ≠ เลขที่ได้จริง (สามชั้น)** —
   (ก) กองงานไม่มีคนถือ → estimate เป็นอัตรามอเตอร์ไซค์เสมอ; แอปพยายามแก้ด้วย `fee_by_vehicle` แต่ต้องมี `vehicle_type` ตั้งไว้ ไม่ตั้ง = โชว์เลขผิดกลุ่มอัตรา (bkk-rider-app/src/utils/jobHelpers.ts:76-101, useRiderData.ts:96-98)
   (ข) Routes API ล้มตอนคิด estimate → `min_fee` แต่ตอน settle อาจคิดสำเร็จได้ระยะจริง (หรือกลับกัน) — สอง event คนละเวลา คนละผล (bkk-system index.js:614-635 vs 3427)
   (ค) admin แก้ `logistics_rates` ระหว่างทาง → estimate ค้างค่าเก่า (ไม่มี trigger on rates change)

5. **สูตร net ฝั่ง rider ไม่ gate `receive_method` เหมือนฝั่งแอดมิน** —
   rider inspection: `grossPickupFee = Number(job.pickup_fee||0)` โดยไม่เช็ควิธีรับ (หัก fee เสมอ) (bkk-rider-app/src/pages/RiderApp.tsx:182-184) ขณะ mirror ฝั่งแอดมิน gate ด้วย `receive_method==='Pickup'` (bkk-system MobileTicketDetail.tsx:276-277, TradeInPayouts.tsx:44-45, functions/index.js:4575-4576) — วันนี้ไม่ระเบิดเพราะ rider จับเฉพาะงาน Pickup และ `onReceiveMethodChanged` เซ็ต `pickup_fee=0` เมื่อออกจาก Pickup (index.js:3106) แต่ถ้างานถูกสลับวิธีรับระหว่าง trigger ยังไม่ทัน/ล้ม จะได้ net คนละค่ากับทุกจุดอื่น

6. **`net_payout` ใน DB กับยอดที่โอนจริงไม่ตรงกันได้ และหน้าอื่นเชื่อ DB** —
   finance ตั้งใจไม่เชื่อ `net_payout` (คิดสดจาก final_price: TradeInPayouts.tsx:39-49) พร้อมโค้ดเตือน mismatch (:66-71) — แปลว่ายอมรับแล้วว่าฟิลด์นี้ค้างได้ แต่แอป rider (`getDisplayPrice` jobHelpers.ts:5), หน้า track ลูกค้า และใบเสร็จ rider (receiptGenerator.ts:78-82 ใช้ `job.price`) ยังอ่านค่าที่เก็บ → สามหน้าจอโชว์เงินสามค่าได้ในงานเดียวกัน

7. **WithdrawModal โชว์ "ไม่หักภาษี" ทั้งที่จะถูกหัก เมื่ออ่าน settings ล้ม/ช้า** —
   rider อ่าน `settings/accounting/rider_wht` แบบ get ครั้งเดียว catch แล้วเงียบ (default enabled:false) (bkk-rider-app/src/components/wallet/WithdrawModal.tsx:21-28) ส่วนตัวหักจริงอยู่ฝั่ง finance/server (RiderWithdrawals.tsx:30-35, rider-wht.js:59-70) — เลขที่ rider เห็นก่อนกดกับเงินที่เข้าบัญชีต่างกัน 3% ในเคสนี้ (ความเสี่ยงเป็น display เท่านั้น wallet ตัดเต็มยอดถูกต้องตามดีไซน์)

8. **ย้อนผลตรวจแล้วราคาที่ inspection เขียนไว้ค้าง** —
   `handleRevertInspection` ตัดเฉพาะ `photos/deductions/inspection_status` ออกจาก devices — `estimated_price`/`price` ที่ถูกทับด้วยราคาหลังหัก และ `final_price`/`net_payout` ระดับ job ยังเป็นค่าหลังหักเดิม (bkk-rider-app/src/hooks/useJobActions.ts:333-345 เทียบกับตอนเขียน RiderApp.tsx:156-158,198-202) — ถ้ารอบสอง base_price ต่อ device หาย จะเข้า fallback `estimated_price` (ที่ถูกหักแล้ว) = หักซ้ำ ตามที่ InspectionModal เตือนเอง (InspectionModal.tsx:159-171)

9. **หน้า `/checkout` ในแอป rider เป็น mock ที่ยัง route ได้จริง** —
   ราคา 50/100/200 hardcode และกดยืนยันแล้วโชว์ success โดยไม่เขียนอะไรเลย (bkk-rider-app/src/pages/Checkout.tsx:21-43,58-60; route App.tsx:142) — ใครหลงเข้าไปจะเห็น "ราคา" ที่ไม่มีอยู่ในระบบ

10. **โค้ดตาย: `logTransaction` ฝั่ง rider ไม่มีผู้เรียก และเขียนไม่ได้ตาม rules** —
    bkk-rider-app/src/utils/transactionLogger.ts:16-26 ไม่ถูก import ที่ไหน (grep ทั้ง src ไม่พบ) และ `/transactions` write = admin เท่านั้น (database.rules.json:848+) — ไม่ก่อบั๊กวันนี้ แต่ชวนให้เข้าใจผิดว่า rider เขียน ledger เองได้

หมายเหตุที่ตรวจแล้ว **ไม่พบปัญหา**: pricingResolver 3 mirror โค้ดตรงกัน byte-level (ต่างแค่คอมเมนต์) · สูตร WHT 3 mirror ตรงกัน · `calculateZoneFee` 2 mirror ตรงกัน · balance ใน wallet ไม่โดน pagination ตัด (query แบบ scoped ดึงทั้งชุด ไม่แบ่งหน้า: usePaginatedDatabase.ts:35-37,49-50)

---

## (ง) คำถามที่ต้องตอบก่อนเสนอแผนแก้

1. **การถอนเงินของไรเดอร์ทุกวันนี้ทำงานอยู่จริงไหม?** ((ค)#1)
   **ตอบแล้ว (เจ้าของงาน, 31 ส.ค. 2569): ไรเดอร์ยังไม่เคยกดถอนจริงในระบบใหม่** — ผลต่อการอ่าน (ค)#1:
   - เป็นรอยขาดที่**ยังไม่เคยกัดใคร** (latent) ไม่ใช่ incident: ไม่มีคำขอถอนค้าง/หาย ไม่มีเงินต้อง reconcile ย้อนหลัง
   - การกดถอนครั้งแรกจริงจะจบที่ error toast ทันที เพราะ `/withdrawals` ตกกฎ root `".write": false` (bkk-frontend-next/database.rules.json:3-4 → catch ที่ useJobActions.ts:413-414) — ไม่ใช่ "เขียนได้แต่ไม่มีคนอ่าน"
   - แถว `type:'Withdrawal'` ใน `/jobs` ที่หน้า finance กรองหา จึงน่าจะไม่มีอยู่จริงบน production (หรือเป็นซากระบบเก่า) — ยืนยันได้ด้วย query เดียวตอนวางแผนแก้
   - เพราะยังไม่มีข้อมูลจริงทั้งสองฝั่ง การแก้จึงเลือก canonical path ได้อิสระ (ฝั่งเขียนหรือฝั่งอ่าน) โดยไม่ต้อง migrate อะไร — ตัดสินใจในรอบแผนแก้
2. **`LOGISTICS_REVENUE` ตั้งใจให้เป็นเงินของใคร?** ((ค)#2)
   **ตอบแล้ว (เจ้าของงาน, 31 ส.ค. 2569): เป็นคนละก้อนกันโดยนิยามธุรกิจ** — "รายได้ค่าไรเดอร์ของบริษัท" (ค่าบริการที่เก็บจากลูกค้า = `pickup_fee`) กับ "รายได้ค่าวิ่งของไรเดอร์" (`rider_fee`) **ไม่ใช่ค่าเดียวกัน**. ผลต่อการอ่าน (ค)#2 — โค้ดปัจจุบันผิดจากเจตนา **สองชั้น**:
   - **ชั้นเจ้าของเงิน:** แถว `LOGISTICS_REVENUE` เป็นรายได้บริษัท แต่ถูกประทับ `rider_id` ของไรเดอร์ (TradeInPayouts.tsx:174, MobileFinancePage.tsx:189, TransactionRepair.tsx:105) ทำให้ wallet ไรเดอร์ (ซึ่งไม่กรอง category — useRiderData.ts:153-154) นับเป็นเงินตัวเอง = ต้นเหตุ balance บวมที่รายงานไว้
   - **ชั้นจำนวนเงิน:** ยอดที่บันทึกเป็นรายได้บริษัทคือ `amount: riderFee` (= ต้นทุนที่จ่ายไรเดอร์, TradeInPayouts.tsx:126,175; MobileFinancePage.tsx:152,190; TransactionRepair.tsx:65,106) ไม่ใช่ `pickup_fee` ที่เก็บจากลูกค้าจริง — ต่อให้ย้าย rider_id ออก ยอดฝั่งบัญชีก็ยังเป็นเลขผิดก้อนตามนิยามนี้
   คำถามย่อยที่ยังเปิด: มีข้อมูล production ที่ balance บวมจากคู่ transaction นี้แล้วมากน้อยแค่ไหน (นับได้จาก Σ LOGISTICS_REVENUE ต่อ rider_id)
3. **fallback 150 ยังต้องมีไหม?** ((ค)#3) — ในเมื่อ `computeRiderFee` fallback เป็น `min_fee` (ค่า config) อยู่แล้ว การ settle งานที่ `rider_fee` หายควร block ให้คนตรวจ แทนที่จะจ่าย 150 เงียบๆ หรือไม่? และ 150 มาจากนโยบายจริงข้อไหน
4. **นโยบายค่ารอบตั้งใจเป็น one-way ใช่ไหม?** ((ข้อ 8)) — base_fee ถูกตั้งโดยคิดชดเชยขากลับแล้วหรือเปล่า ถ้าใช่จะจดเป็น invariant, ถ้าไม่ใช่ค่อยคุยเรื่อง round-trip
5. **เลข estimate ที่ไรเดอร์เห็นก่อนกดรับ ควร "ยืน" ไหม?** ((ค)#4) — ยอมรับได้ไหมที่ตัวเลขเปลี่ยนหลังรับงาน (rate card ของยานพาหนะ) หรืออยากล็อกเลขที่โชว์ตอนกดรับเป็นขั้นต่ำที่จ่ายจริง
6. **งานที่แอดมินตั้ง `rider_fee` มือไว้ก่อนส่งมอบ** ((ข้อ 11)) — เจตนาคือ override ถาวรใช่ไหม (trigger ข้ามให้ตาม index.js:3417) ควรจดเป็นกติกา หรืออยากให้มี flag แยกว่า "ตั้งมือ"
7. **หน้า `/checkout` demo ในแอป rider ยังต้องเก็บไว้ไหม?** ((ค)#9) — ถ้าเป็นซาก prototype จะเสนอถอด route ในรอบแก้
