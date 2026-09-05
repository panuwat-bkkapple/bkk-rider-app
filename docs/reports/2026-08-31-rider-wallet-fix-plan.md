# แผนแก้: กระเป๋าเงินไรเดอร์ + ท่อถอนเงิน (31 ส.ค. 2569 — เคาะแล้ว, ยังไม่แตะโค้ด)

> ต่อจาก survey `2026-08-31-rider-money-distance-survey.md` ((ค)#1, #2). ฉบับนี้รวมผลการเคาะของ
> เจ้าของงาน (31 ส.ค.) ครบทั้ง 3 คำถามเปิด + 2 เรื่องที่แผนร่างแรกยังไม่ครอบ

## หลักการของแผน

1. **wallet ไรเดอร์ต้องอ่านเฉพาะหมวดที่เป็นเงินไรเดอร์** — ไม่ใช่ทุกแถวที่ `rider_id` ตรง. หมวดเงินไรเดอร์มีประกาศอยู่แล้ว: `JOB_PAYOUT | WITHDRAWAL | PENALTY | BONUS` (bkk-rider-app/src/utils/transactionLogger.ts:11)
2. **แถวรายได้บริษัทต้องไม่ถือ `rider_id` ของไรเดอร์** และยอดต้องเป็นเงินที่เก็บจากลูกค้าจริง ไม่ใช่ต้นทุนที่จ่ายไรเดอร์
3. **แก้ทั้งฝั่งอ่านและฝั่งเขียน** — ฝั่งอ่านคือด่านโครงสร้าง ฝั่งเขียนคือความถูกต้องของ ledger (บทเรียน "กฎมีกี่คนอ่าน")
4. `amount` ในแถว ledger เก่าคือบันทึกประวัติ **ห้ามแก้ย้อนหลัง** — เก็บเลขที่ถูกไว้เป็นฟิลด์ใหม่ข้าง ๆ แทน
5. ทุกเฟสมี dry-run/เทสก่อน และเฟสเรียงให้หยุดเลือดก่อน แล้วค่อยล้างของเก่า

## ข้อเท็จจริงที่แผนพิง (ตรวจจากโค้ดแล้ว 31 ส.ค. 2569)

1. `LOGISTICS_REVENUE` ไม่มีผู้อ่าน**แบบเจาะหมวด**ที่ไหนเลยทั้ง 3 repo (grep เจอแค่ 3 จุดเขียน: TradeInPayouts.tsx:177, MobileFinancePage.tsx:192, TransactionRepair.tsx:108)
2. **แต่มีผู้อ่านแบบทั้งตาราง — ข้อนี้แก้คำในแผนร่างแรกที่เขียนว่า "ไม่มีผู้อ่านเลย":** `FinanceAuditLog.tsx` subscribe `/transactions` ทั้งก้อน (บรรทัด 11) แล้วรวม รายรับ = Σ CREDIT / รายจ่าย = Σ DEBIT **ข้ามทุกหมวด** (บรรทัด 45-48) + export CSV — `/transactions` จึงเป็นสมุดเงินสดของร้านที่ finance เปิดดูจริงอยู่แล้ว ไม่ใช่ node ที่ไม่มีอนาคต. หมายเหตุพ่วง: การ์ดสถิติหน้านี้ปน "เงินสดบริษัท" กับ "ยอดตั้งหนี้เข้ากระเป๋าไรเดอร์ (JOB_PAYOUT)" ในเลขเดียว — เป็นข้อจำกัดเดิมที่มีอยู่ก่อนแผนนี้ จดไว้ ไม่แก้ในรอบนี้
3. trigger บน `/jobs` ยิงทุก create (`onJobCreatedSendEmails`) แม้ `onNewTicketCreated` จะกรอง status (bkk-system/functions/index.js:1670) → เหตุผลที่ไม่ใช้ `/jobs` เป็นทางเดินคำขอถอน · ใบ 50 ทวิเขียนสำเนาลง `jobs/{ref_job_id}/wht_certificate` (rider-wht-issue.js:113,159) — ต้องย้ายปลายทางเมื่อแถวถอนย้าย node
4. **rules ของ `/transactions` ปิด client write แล้ว** (เรื่องที่เจ้าของให้ตรวจ): `.write` = admin เท่านั้น, `.read` = admin หรือ query `orderByChild('rider_id').equalTo(auth.uid)` (bkk-frontend-next/database.rules.json:848-856) — ไรเดอร์ push แถว `BONUS` เข้ากระเป๋าตัวเองไม่ได้ ด่านความปลอดภัยมีอยู่แล้ว allowlist ในเฟส 1 จึงเป็นเรื่องความถูกต้องของการแสดงผล ไม่ใช่ด่านเดียวที่กันเงินปลอม
5. P&L/ภ.พ.30 อ่าน `/sales` + `/accounting_documents` ไม่แตะ `/transactions` — การเปลี่ยนนิยาม amount ของหมวดนี้ไม่กระทบรายงานภาษี (กระทบแค่การ์ดรวมของ FinanceAuditLog ตามข้อ 2 ซึ่งเปลี่ยนไปทาง**ถูกขึ้น**)

## ผลการเคาะ (เจ้าของงาน 31 ส.ค. 2569)

- **ข้อ 1 — retag อย่างเดียว ไม่ restate `amount`**: เคาะแล้ว. และคำถามใหญ่กว่า "หมวดนี้มีอนาคตไหม" ตัดสินด้วยข้อเท็จจริงข้อ 2: **มีอนาคต — เก็บหมวดไว้ แก้ semantics ตามเฟส 2 เต็มรูป** (`/transactions` เป็นสมุดเงินสดร้านที่มีคนอ่านจริง และแถว DEBIT ฝั่งบริษัท `TRADE_IN_PAYOUT`/`B2B_PURCHASE` อยู่ในนั้นอยู่แล้ว — ถอด LOGISTICS_REVENUE ทิ้ง = เหตุการณ์จ่ายลูกค้าเหลือครึ่งเดียวในสมุด) → เฟส 3 พ่วงเขียน `amount_customer_fee` ตามข้อเสนอเจ้าของงาน (รายละเอียดในเฟส 3)
- **ข้อ 2 — ทาง A (callable)**: เคาะแล้ว + spec เพิ่มตามที่เจ้าของงานให้ (state machine / atomicity / ยังไม่ denormalize balance) — รายละเอียดในเฟส 4
- **ข้อ 3 — สื่อสารไรเดอร์**: มีผลเฉพาะเมื่อมีไรเดอร์คนอื่นนอกจากเจ้าของ ถ้ายังวิ่งคนเดียว deploy เฟส 1 ได้เลย — template อยู่ในเฟส 5

---

## เฟส 0 — วัดความเสียหายจริง (read-only, ทำได้ทันที)

สคริปต์ dry-run (pattern `bkk-system/scripts/strip-ledger-emails.cjs`) อ่าน `/transactions` ครั้งเดียว รายงาน:

1. ต่อ rider: Σ แยกตาม `category` + balance สูตรเดิม (ทุกแถว) เทียบสูตรใหม่ (allowlist) → คอลัมน์ "ส่วนที่บวม" — เลขนี้คือ X−Y ในข้อความสื่อสารเฟส 5
2. นับแถว `LOGISTICS_REVENUE` ที่ `rider_id !== 'SYSTEM'` (เป้า backfill เฟส 3)
3. แถวผิดปกติ: `amount` ไม่ใช่ตัวเลข (ทำ balance เป็น NaN ได้) และแถวที่ขาดฟิลด์บังคับ
4. **ความถูกต้องเชิงตัวเลขของ JOB_PAYOUT (เพิ่มตามรอบเคาะ):** แยกรายงาน (ก) แถว `amount === 150` เป๊ะ (ร่องรอย fallback hardcode ตอน settle — RiderSettlements.tsx:50,77) และ (ข) join ผ่าน `ref_job_id` → อ่าน `jobs/{id}/rider_fee_meta.reason` (fallback `jobs_archived`) — **`reason !== 'calculated'` คือตัวชี้แม่นกว่า time window**: มันบอกตรง ๆ ว่าค่ารอบใบนั้นคิดจาก `min_fee` fallback ไม่ใช่ระยะจริง (bkk-system/functions/index.js:614-635) ครอบคลุมช่วง Routes API พังโดยไม่ต้องเดาวันที่ (หมายเหตุความแม่น: ฝั่งค่ารอบไรเดอร์ fallback คือ `min_fee` คงที่ — ส่วน haversine×1.3 เป็น fallback ของ*ค่าส่งลูกค้า*ฝั่งเว็บ คนละก้อน ไม่เข้ากระเป๋าไรเดอร์). ถ้าพบใบที่คิดจาก fallback ในช่วงที่ควรคิดได้จริง → ต้องเคลียร์ก่อนหรือรวมในข้อความสื่อสารทีเดียว — **ห้ามประกาศ "ยอดใหม่ถูกแล้ว" ทั้งที่ฐานตัวเลขบางใบยังผิด**
5. **ยืนยันสมมุติฐานของเฟส 4 จากข้อมูลจริง (เพิ่มตามรอบเคาะ):** นับ (ก) แถว `/transactions` category `WITHDRAWAL` (ข) เนื้อใน node `/withdrawals` (ค) แถว `/jobs` ที่ `type === 'Withdrawal'` — ทั้งสามต้องเป็นศูนย์ตามที่จำกันไว้ ถ้าไม่ศูนย์ เฟส 4 ต้องมี migration ที่ตอนนี้ไม่ได้วางไว้

### ผลเฟส 0 — รันบน production แล้ว (31 ส.ค. 2569, สคริปต์ `bkk-system/scripts/audit-rider-wallet.cjs`)

- ledger ทั้งหมด 253 แถว, ไรเดอร์ใน `/riders` มี **1 คน** (`GmxKmv51QxNr0HTuZ5FqmIB50kQ2` — ภาณุวัฒน์ นักทอง = เจ้าของธุรกิจเอง)
- **ข้อ 1-2 ยืนยันสมมุติฐาน 100%:** X (จอโชว์) = 3,776 / Y (allowlist) = **0** / ส่วนที่บวม = 3,776 = Σ `LOGISTICS_REVENUE` 15 แถวที่ติด rider_id พอดีเป๊ะ ไม่มีสาเหตุอื่นปน · ฝั่ง SYSTEM มี LOGISTICS_REVENUE อีก 24 แถว (6,369) ซึ่งถูก tag ถูกแล้ว (งานที่ไม่มี rider ตอนจ่าย) — เป้า backfill เฟส 3 = 15 แถวเท่านั้น
- **ข้อ 3-4 สะอาด:** ไม่มีแถว amount เสีย, ไม่มีแถวขาดฟิลด์, `JOB_PAYOUT = 0 แถว` → ไม่มีร่องรอย 150, ไม่มีใบ fallback — **งานแก้เชิงตัวเลขก่อนเฟส 1 ไม่มี** และความกังวลช่วง Routes API พังตกไปทั้งข้อ
- **ข้อ 5 ยืนยันศูนย์ทั้งสามที่** → เฟส 4 ไม่มี migration ตามแผน
- **ข้อ 6 — เรื่องใหม่ที่ข้อมูลเผย: settlement ไม่เคยถูกใช้เลย** — งานที่ไรเดอร์ถือ 224 ใบ: `rider_fee_status Pending` 190 ใบ (ค่ารอบตั้งแล้วรอจ่ายรวม **68,334 บาท**), ไม่มี fee เลย 34 ใบ, `JOB_PAYOUT` เข้ากระเป๋า = 0. **ผลต่อเฟส 1: กระเป๋าจะโชว์ 0 บาท** (ถูกตาม ledger) จนกว่าจะกดอนุมัติค่ารอบใน RiderSettlements — เป็นการตัดสินใจเชิงปฏิบัติการของเจ้าของ ไม่ใช่บั๊ก (ไรเดอร์คนเดียว = เจ้าของเอง เงินก้อนนี้คือกระเป๋าซ้ายขวาของคนเดียวกัน)
  - ข้อควรระวังถ้าจะกด "อนุมัติทั้งหมด": ปุ่ม batch ใช้ `rider_fee || 150` (RiderSettlements.tsx:77) — ใบไหนใน 190 ที่ไม่มี `rider_fee` จริงจะถูกจ่าย 150 แทน **ควรกดหลังเฟส 1-2 merge หรืออย่างน้อยรู้ตัวเลขนี้ก่อนกด**
- **ผลต่อข้อ 3 (สื่อสาร): ตกไปทั้งข้อ** — ไรเดอร์คนเดียวคือเจ้าของเอง deploy เฟส 1 ได้ทันที

## สถานะการลงมือ (31 ส.ค. 2569)

- เฟส 0: **เสร็จ** (ผลด้านบน) · เฟส 1: **เสร็จ** — bkk-rider-app commit `6a22c8a` (walletLedger allowlist + เทส 12 เคส) · เฟส 2: **เสร็จ** — bkk-system commit `52524e6` (helper `src/utils/logisticsRevenue.ts` + แก้ 3 จุดเขียน + เทส 9 เคส; rebase ทับ #603 แล้วรันเทสใหม่ทั้งชุด 211 ผ่าน) · เฟส 3: **เสร็จและตรวจรับแล้ว** (31 ส.ค. 2569) — เจ้าของรัน dry-run (15 แถว Σ 3,776 ตรงเฟส 0 เป๊ะ; 12 แถว join งานได้และ `amount_customer_fee` เท่ากับ amount เดิมทุกแถว = rider_fee กับ pickup_fee ของข้อมูลชุดนี้บังเอิญเท่ากัน; 3 แถวเก่าสุด `job_not_found` ได้ null+reason ตามดีไซน์) → `--apply` เขียน 15 แถว/78 path → audit ซ้ำยืนยัน: เป้า retag = 0, ledger ทั้ง 253 แถวเป็น SYSTEM, LOGISTICS_REVENUE 39 แถวรวม 10,145 (6,369+3,776) — **กระเป๋าไรเดอร์บน production โชว์ถูกแล้วแม้ยังไม่ deploy เฟส 1** (ไม่มีแถวที่ rider_id ตรงเหลือ) · เฟส 4: **เสร็จ** (รายละเอียดด้านล่าง)
- **Merge + deploy ครบทั้งสองรอบแล้ว (31 ส.ค. 2569):** รอบแรก — เฟส 1 = bkk-rider-app #111 (`cda77fd`, deploy เขียว), เฟส 2 = bkk-system #604 (`d8b8ddd`, deploy เขียว) · รอบสอง (เฟส 4) — rules = bkk-frontend-next #916 (`0afde1c`), rider app = #112 (`0ddf450`), finance = bkk-system #606 (`6ee0c79`) — CI ตัวเทสที่มีชื่อเขียวครบก่อน merge ทุกใบ
- **เหตุการณ์ระหว่างทาง (31 ส.ค. 2569): เจ้าของเผลอกด "อนุมัติทั้งหมด" ใน RiderSettlements ก่อนเฟส 4 merge** — จ่าย 121 ใบ Σ 44,200 เข้ากระเป๋า. audit ยืนยัน: ทุกแถวตรง `rider_fee` ของงานจริง (6 แถว @150 มี `fee_on_job=150` จริงจากข้อมูลยุคเก่า ~900 บาท ไม่ใช่ fallback ที่ยิงผิด — รับไว้ตามนั้น). เหลือค้าง `Pending` 69 ใบ Σ 24,134 (สถานะงานอยู่นอก filter ของปุ่ม) + 34 ใบไม่มี `rider_fee` เลย
- ~~**สคริปต์เก็บตก: `bkk-system/scripts/settle-pending-rider-fees.cjs`** (merge ไปกับ #606) — จ่ายเฉพาะใบที่ `rider_fee` เป็นเลขจริง > 0 ไม่สน status, **ไม่มี fallback 150**, ใบไม่มี fee = รายงานแยกให้เจ้าของตัดสินฐานเงินเอง. เจ้าของต้องรันเอง: dry-run → `--apply` → audit ตรวจรับ (ดูหัวเรื่องในไฟล์สคริปต์)~~
  - **DEPRECATED ตั้งแต่ 5 ก.ย. 2569 (bkk-system #728) — รันไม่ได้แล้ว (`main()` throw ทันที ไฟล์เก็บไว้เพื่อประวัติ)** เหตุผล: (1) `/rider-audit` อนุมัติใบ `rider_fee_status = 'Pending'` ได้จาก UI แล้วโดยไม่กรองสถานะงาน (bkk-system #643) ใบ 69 ใบที่สคริปต์นี้เกิดมาเพื่อเก็บตกจึงมีทางอนุมัติปกติ (2) สคริปต์ไม่มี lock กันจ่ายซ้ำ — กันด้วยเงื่อนไข "ใบยัง Pending" อย่างเดียว. **ไม่มีบันทึกว่าเคยถูก `--apply`** — ตรวจได้ด้วย `bkk-system/scripts/rider-wallet-audit.cjs` (T4 นับแถวที่ description มี `[Backfill Settle]`; 0 = ไม่เคย apply). รายละเอียดใน `bkk-frontend-next/docs/reports/2026-09-05-rider-wallet-status-survey.md` ส่วน D
- **จอแอปไรเดอร์บอกที่มาของเงินแล้ว** — WalletTab โชว์ `description` (ชื่อรุ่น + เลขงาน) ใต้ป้ายหมวด แก้ปัญหา "เห็นแค่ JOB_PAYOUT ไม่รู้ของงานไหน" (แถวที่ finance เขียนมี description อยู่แล้วทุกแถว จอเดิมแค่ไม่แสดง)
- ระหว่างทำเฟส 2 พบว่า `pickup_fee` บนงานที่มีคูปองส่งฟรีถูก persist เป็นค่า gross (validateAndCreateOrder เขียน `pickup_fee: pickupFee` ดิบ — bkk-frontend-next/functions/src/index.ts:1863) helper จึงเช็คคูปอง `type: 'service'` เองจาก `applied_coupons` เพื่อให้ตรงเศรษฐศาสตร์ตอนสร้างงาน (`grossFee = 0` เมื่อ free delivery — index.ts:1643-1645)

## เฟส 1 — PR bkk-rider-app: กระเป๋าอ่านเฉพาะเงินไรเดอร์ (เห็นผลทันที ไม่รอ backfill)

- `useRiderData.ts:153-154`: กรอง `myTx` ด้วย allowlist หมวดเงินไรเดอร์ + `Number.isFinite(amount)` (กัน NaN ทั้งก้อน) — allowlist ประกาศที่เดียวใน `transactionLogger.ts` ให้ WalletTab ใช้ร่วม
- `WalletTab.tsx:45`: label ไทยต่อหมวด แทน category ดิบ
- ลบ `logTransaction` ที่เป็นโค้ดตาย (transactionLogger.ts:16-26 — ไม่มีผู้เรียก และ rules ก็ไม่ให้เขียนอยู่แล้วตามข้อเท็จจริง 4) เหลือ type/allowlist
- เทส vitest: fixture มีแถว LOGISTICS_REVENUE + แถว amount เพี้ยน → balance ต้องไม่รวม + injection test (ถอด filter แล้วเทสต้องแดง)
- ขอบเขตชัด: เฟสนี้ทำให้ยอด**ถูกเชิงหมวด** — ความถูก**เชิงตัวเลข**ของ JOB_PAYOUT รายแถวเป็นของเฟส 0 ข้อ 4 (ตรวจ) + งานแก้แยกถ้าพบจริง

## เฟส 2 — PR bkk-system: หยุดสร้างข้อมูลผิดเพิ่ม (3 จุดเขียน)

- helper กลางตัวเดียว (สามไฟล์อยู่ repo เดียว import ร่วมได้จริง) แทนก้อน inline ทั้ง 3 ที่:
  - `rider_id: 'SYSTEM'` (TradeInPayouts.tsx:174, MobileFinancePage.tsx:189, TransactionRepair.tsx:105)
  - `amount` = ค่าบริการที่เก็บจากลูกค้าจริง = `max(0, pickup_fee − rider_fee_discount)`; คูปอง free-delivery → 0 → ไม่เขียนแถว; เก็บ `ref_job_id` เดิม
- เงื่อนไข `if (riderFee > 0)` ที่ครอบการเขียน (TradeInPayouts.tsx:171, MobileFinancePage.tsx:187) เปลี่ยนเป็นอิง fee ใหม่
- **ผลข้างเคียงที่ประกาศไว้ล่วงหน้า:** การ์ดรายรับของ `FinanceAuditLog` จะเปลี่ยนฐานจาก "ต้นทุนไรเดอร์" เป็น "ค่าบริการที่เก็บจริง" ตั้งแต่แถวใหม่เป็นต้นไป — เป็นทิศที่ถูกขึ้น แต่ต้องบอก finance ไม่ให้งงว่าทำไมเลขไม่ต่อเนื่อง

## เฟส 3 — backfill ข้อมูลเก่า (สคริปต์ + dry-run บังคับ)

- เป้า: แถว `LOGISTICS_REVENUE` ที่ `rider_id !== 'SYSTEM'` ในลูปเดียวเขียน:
  - `rider_id: 'SYSTEM'` + `retagged_at`
  - `amount_basis: 'legacy_rider_fee'` (บอกคนอ่านย้อนหลังว่ายอดแถวนี้คือต้นทุนไรเดอร์ ไม่ใช่ค่าบริการ)
  - **`amount_customer_fee` (เพิ่มตามรอบเคาะ):** เลขที่ถูกตามนิยามใหม่ คำนวณจาก job ผ่าน `ref_job_id` (`max(0, pickup_fee − rider_fee_discount)` อ่านจาก `jobs/{id}` แล้ว fallback `jobs_archived/{id}`; หาไม่เจอทั้งคู่ = `null` + `amount_customer_fee_missing_reason`) — **ไม่แตะ `amount` เดิม** (หลักการข้อ 4: audit trail) แต่เก็บเลขถูกไว้ข้าง ๆ เพราะรอบที่ join ครบแบบนี้คือรอบนี้รอบเดียว
- ลำดับ: หลังเฟส 1 deploy (กระเป๋าถูกก่อน ไม่พึ่ง backfill) และหลังเฟส 2 merge (กันของใหม่ไหลเข้าหลังล้าง)
- ตรวจรับ: rerun เฟส 0 → "ส่วนที่บวม" = 0 ทุก rider และทุกแถวเป้ามี `amount_customer_fee` หรือ reason

## เฟส 4 — ท่อถอนเงิน: callable `riderRequestWithdraw` (เคาะทาง A แล้ว — **ทำเสร็จและ merge แล้ว 31 ส.ค. 2569**)

> คำตอบข้อ 1 ของ survey (ยังไม่เคยมีคำขอจริง) + เฟส 0 ข้อ 5 ยืนยันซ้ำจากข้อมูล → ไม่มี migration

**สิ่งที่ลงจริง (ตรง spec ด้านล่างทุกข้อ):** rules `/withdrawals` + `/withdrawal_locks` ที่ bkk-frontend-next #916 · callable `riderRequestWithdraw` (functions/src/index.ts — lock transaction ต่อ rider + เคลียร์ lock ค้างที่คำขอปิดไปแล้ว + ตรวจ available ฝั่ง server ด้วยสูตร MIRROR ของ walletLedger) + UI (`useRiderData` หัก `pendingWithdrawalHold`, WalletTab แถบ "คำขอถอนเงิน (รอโอน)", WithdrawModal เรียก callable) ที่ #112 · ฝั่ง finance `RiderWithdrawals` อ่าน `/withdrawals` + จ่าย (เขียน DEBIT + ปิด lock ใน update ก้อนเดียว) + ปุ่มปฏิเสธ + ย้ายสำเนา 50 ทวิไป `withdrawals/{id}/wht_certificate` ที่ bkk-system #606

**spec ของ callable (รวมข้อกำหนดจากรอบเคาะ):**

- **State machine ชัด — DEBIT เขียนตอน `paid` เท่านั้น:**
  - `requested` = จองยอด **ไม่แตะ ledger** (คำขอที่ถูกปฏิเสธต้องไม่กินยอดถาวร)
  - `paid` = finance กดจ่าย → เขียน `transactions` DEBIT `WITHDRAWAL` (+`wht_amount`/`net_paid` ตามเดิม) + ปิดการจอง — ใน multi-path update เดียว
  - `rejected` = คืนการจอง ไม่มีรอย ledger
- **สูตร balance ต้องหักยอดจองค้าง:** `available = Σ(ledger allowlist) − Σ(คำขอ status='requested')` — ใช้ทั้งใน callable และ**จอแอปไรเดอร์** (ไม่งั้นกดขอแล้วยอดบนจอไม่ขยับ ขอซ้ำได้เต็มยอดจนกว่า finance จะจ่าย)
- **Atomicity:** เช็ค-แล้ว-สร้างต้องอยู่ใน `runTransaction` บน guard node ต่อ rider (เช่น `withdrawal_locks/{riderId}` ถือ id คำขอที่เปิดอยู่) — เสนอกติกา **หนึ่งคำขอเปิดได้ครั้งละหนึ่งใบต่อ rider** ซึ่งทำให้ guard เป็น "สร้างได้เมื่อ node ว่าง" ตัดปัญหายิงพร้อมกันทั้งชนิด; finance จ่าย/ปฏิเสธแล้วเคลียร์ guard ใน update ก้อนเดียวกัน
- **balance ฝั่ง server = scan `/transactions` ตาม query rider_id** — ยอมรับแล้วว่าทำแบบนี้ก่อน (ข้อมูลยังน้อย) **ยังไม่ทำ denormalized `wallet/{riderId}/balance`** จนกว่าจะช้าจริง และถ้าวันนั้นมาถึง client ต้องเขียนไม่ได้เด็ดขาด
- ตรวจใน callable: ขั้นต่ำ 100 (ย้ายจาก client useJobActions.ts:401), available พอ, ไม่มีคำขอเปิดค้าง
- **โครงรอบข้าง:** เขียน `/withdrawals/{id}` ผ่าน Admin SDK; rules: read = admin + เจ้าของ (`rider_id === auth.uid`), client write ปิดสนิท · `RiderWithdrawals.tsx` เปลี่ยน source `/jobs` → `/withdrawals` (:16,45-53) และเขียนตอบกลับลงแถวเดียวกัน (แทน `jobs/{id}` ที่ :98-101,118-121) · ย้ายปลายทางสำเนา 50 ทวิ (rider-wht-issue.js:113,159) → `withdrawals/{id}/wht_certificate` + rule ให้เจ้าของอ่าน · ชื่อ function unique ระดับ project · rules แก้ที่ `bkk-frontend-next/database.rules.json` + deploy จาก repo นั้น + ดู deploy-rules run เขียวหลัง merge

## เฟส 5 — ตรวจรับรวม + สื่อสาร

- **เงื่อนไขการสื่อสาร (เคาะแล้ว):** ยังวิ่งคนเดียว = ข้ามข้อนี้ deploy เฟส 1 ได้เลย · มีไรเดอร์คนอื่น = ส่งข้อความ**หลังเฟส 0** (มีเลข X/Y จริงใส่) และ**ก่อน deploy เฟส 1** ตาม template ของเจ้าของงาน:
  > พรุ่งนี้จะอัปเดตแอปนะครับ ยอดในกระเป๋าจะแสดงลดลงจาก X เหลือ Y
  > สาเหตุคือระบบเดิมนับค่าบริการที่บริษัทเก็บจากลูกค้าปนเข้ามาในกระเป๋าด้วย ซึ่งไม่ใช่เงินของเรา ยอดใหม่คือค่ารอบที่ได้จริงล้วน ๆ
  > ไม่มีการหักเงินใครทั้งนั้น และเงินที่ถอนได้จริงเท่าเดิม เพราะยอดเดิมไม่เคยถูกใช้จ่ายจริง อยากดูว่าแต่ละงานได้เท่าไหร่ บอกได้ ส่งให้ดูทั้งหมด
  หลัก: บอกก่อน · ให้ตัวเลขทั้งสองตัว · บอกว่าไม่มีใครโดนหัก · เสนอ breakdown ให้ตรวจเอง — และถ้าเฟส 0 ข้อ 4 พบใบที่ค่ารอบคิดจาก fallback จริง ให้แก้/ชี้แจงรวมในข้อความเดียวกัน ไม่แยกสองรอบ
- ต่อเฟส: `tsc --noEmit` + เทสเขียว · เฟส 4 เทสยิง callable จริงก่อนเปิดปุ่มในแอป
- ปิดงานเมื่อ: เฟส 0 rerun = บวมศูนย์ · คำขอถอนทดสอบ 1 รายการไหลครบวง requested → paid → DEBIT (+50 ทวิถ้าเปิด WHT) และ guard ถูกเคลียร์

## นอกขอบเขตแผนนี้ (รอคำตอบข้อ 3-7 ของ survey)

fallback 150 ตอน settle (แต่**การตรวจว่ามีแถว 150 กี่แถวอยู่ในเฟส 0 แล้ว**) · นโยบาย one-way · การยืนเลข estimate ตอนกดรับ · หน้า `/checkout` demo · gate `receive_method` ใน RiderApp.tsx:182 · การแยกสมุด "เงินสดบริษัท" ออกจาก "กระเป๋าไรเดอร์" ใน FinanceAuditLog (ข้อเท็จจริง 2 — จดไว้เป็นงานอนาคต)

## สถานะการเคาะ

| ข้อ | สถานะ |
|---|---|
| 1. retag เฉย ๆ + เก็บหมวดไว้ + พ่วง `amount_customer_fee` ตอน backfill | **เคาะแล้ว** |
| 2. ทาง A callable + state machine + guard transaction + ยังไม่ denormalize | **เคาะแล้ว** |
| 3. สื่อสารไรเดอร์ | **เคาะแล้ว** (เงื่อนไข: ข้ามได้ถ้ายังวิ่งคนเดียว — เจ้าของยืนยันตอนสั่งลงมือ) |
| ข้อเท็จจริง 4 (rules /transactions) | **ตรวจแล้ว — ปิดอยู่** ไม่มีงานเพิ่ม |
| ความถูกเชิงตัวเลข JOB_PAYOUT + ยืนยันศูนย์แถว Withdrawal | **เข้าเฟส 0 แล้ว** (ข้อ 4, 5) |
