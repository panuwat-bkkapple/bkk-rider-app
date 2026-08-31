# แผนแก้: กระเป๋าเงินไรเดอร์ + ท่อถอนเงิน (31 ส.ค. 2569 — ข้อเสนอ ยังไม่แตะโค้ด)

> ต่อจาก survey `2026-08-31-rider-money-distance-survey.md` ((ค)#1, #2) และคำตอบเจ้าของงาน 2 ข้อ:
> (1) ไรเดอร์ยังไม่เคยกดถอนจริงในระบบใหม่ · (2) "รายได้ค่าไรเดอร์ของบริษัท" (`pickup_fee` ที่เก็บจากลูกค้า)
> กับ "ค่าวิ่งของไรเดอร์" (`rider_fee`) เป็นคนละก้อนโดยนิยาม

## หลักการของแผน

1. **wallet ไรเดอร์ต้องอ่านเฉพาะหมวดที่เป็นเงินไรเดอร์** — ไม่ใช่ทุกแถวที่ `rider_id` ตรง. หมวดเงินไรเดอร์มีประกาศอยู่แล้วในโค้ด: `JOB_PAYOUT | WITHDRAWAL | PENALTY | BONUS` (bkk-rider-app/src/utils/transactionLogger.ts:11)
2. **แถวรายได้บริษัทต้องไม่ถือ `rider_id` ของไรเดอร์** และยอดต้องเป็นเงินที่เก็บจากลูกค้าจริง ไม่ใช่ต้นทุนที่จ่ายไรเดอร์
3. **แก้ทั้งฝั่งอ่านและฝั่งเขียน** — ฝั่งอ่านคือด่านโครงสร้าง (หมวดบัญชีใหม่ในอนาคตจะไม่ทะลุเข้ากระเป๋าอีก) ฝั่งเขียนคือความถูกต้องของ ledger. ตามบทเรียน "กฎมีกี่คนอ่าน" ใน CLAUDE.md — แก้ที่เดียวคือแก้ครึ่งเดียว
4. ทุกเฟสมี dry-run/เทสก่อน และ **เฟสเรียงให้หยุดเลือดก่อน แล้วค่อยล้างของเก่า**

ข้อเท็จจริงที่แผนพิง (ตรวจแล้ว):
- `LOGISTICS_REVENUE` ไม่มีผู้อ่านที่ไหนเลยทั้ง 3 repo นอกจาก 3 จุดเขียน (grep 31 ส.ค. 2569: TradeInPayouts.tsx:177, MobileFinancePage.tsx:192, TransactionRepair.tsx:108) → เปลี่ยน semantics ได้โดยไม่มีรายงานไหนพัง (P&L/ภ.พ.30 อ่าน `/sales` + `/accounting_documents` ไม่ใช่ `/transactions`)
- `onNewTicketCreated` กรองเฉพาะ status งานใหม่ (bkk-system/functions/index.js:1670) แต่ `onJobCreatedSendEmails` ยิงทุก create บน `/jobs` → เหตุผลหนึ่งที่ไม่ควรใช้ `/jobs` เป็นทางเดินคำขอถอนต่อ
- ใบ 50 ทวิเขียนสำเนาลง `jobs/{ref_job_id}/wht_certificate` (bkk-system/functions/rider-wht-issue.js:113,159) — ต้องย้ายปลายทางถ้าแถวถอนย้าย node

---

## เฟส 0 — วัดความเสียหายจริง (read-only, ทำได้ทันที)

สคริปต์ dry-run (pattern เดียวกับ `bkk-system/scripts/strip-ledger-emails.cjs`) อ่าน `/transactions` ทั้งก้อนครั้งเดียว แล้วรายงาน:
- ต่อ rider: Σ แยกตาม `category` + balance ตามสูตรปัจจุบัน (ทุกแถว) เทียบสูตรใหม่ (allowlist) → คอลัมน์ "ส่วนที่บวม"
- นับแถว `LOGISTICS_REVENUE` ที่ `rider_id !== 'SYSTEM'` (เป้าของ backfill เฟส 3)
- จับความผิดปกติอื่นที่ survey ชี้ไว้: แถว `amount` ไม่ใช่ตัวเลข (ทำ balance เป็น NaN ได้ — useRiderData.ts:154 ไม่มี guard), แถว JOB_PAYOUT ที่ amount = 150 เป๊ะ (ร่องรอย fallback)

ผลลัพธ์ = ตารางยืนยันสาเหตุด้วยข้อมูลจริง ก่อนแตะโค้ดแม้แต่บรรทัดเดียว

## เฟส 1 — PR bkk-rider-app: กระเป๋าอ่านเฉพาะเงินไรเดอร์ (เห็นผลทันที ไม่ต้องรอ backfill)

- `useRiderData.ts:153-154`: กรอง `myTx` ด้วย allowlist หมวดเงินไรเดอร์ + `Number.isFinite(amount)` ก่อนเข้า balance (กัน NaN ทั้งก้อน) — ประกาศ allowlist ที่เดียว (เช่นใน `transactionLogger.ts` ซึ่งมี type อยู่แล้ว) ให้ WalletTab ใช้ร่วม
- `WalletTab.tsx:45`: แสดง label ไทยต่อหมวด แทนชื่อ category ดิบ
- เก็บกวาด: `logTransaction` (transactionLogger.ts:16-26) เป็นโค้ดตายที่เขียนไม่ได้ตาม rules — ลบทิ้ง เหลือแต่ type/allowlist
- เทส (vitest มีอยู่แล้วใน repo): fixture มีแถว LOGISTICS_REVENUE + แถว amount เพี้ยน → balance ต้องไม่รวม; ทำ injection test ตามระเบียบ CLAUDE.md (ถอด filter แล้วเทสต้องแดง)
- **ผลข้างเคียงที่ต้องสื่อสาร: ตัวเลขบนจอไรเดอร์จะ "ลดลง"** เท่ากับเงินที่ไม่เคยเป็นของเขา — ต้องแจ้งไรเดอร์ก่อน deploy (ดูเฟส 5)

## เฟส 2 — PR bkk-system: หยุดสร้างข้อมูลผิดเพิ่ม (3 จุดเขียน)

- helper กลางตัวเดียว (ทั้งสามไฟล์อยู่ repo เดียว import ร่วมได้จริง — ไม่เกิด mirror ใหม่) ใช้แทนก้อน inline ทั้ง 3 ที่:
  - `rider_id: 'SYSTEM'` (รายได้บริษัท — TradeInPayouts.tsx:174, MobileFinancePage.tsx:189, TransactionRepair.tsx:105)
  - `amount` = ค่าบริการที่เก็บจากลูกค้าจริง = `max(0, pickup_fee − rider_fee_discount)` (นิยามเดียวกับ effective fee ในสูตร net ทุกจุด); คูปอง free-delivery ทำให้เป็น 0 → ไม่เขียนแถว
  - เก็บ `ref_job_id` เดิมไว้ join ได้ตามปกติ
- เงื่อนไข `if (riderFee > 0)` ที่ครอบการเขียน (TradeInPayouts.tsx:171, MobileFinancePage.tsx:187) เปลี่ยนเป็นอิง fee ใหม่
- ตรวจก่อน merge: grep ซ้ำทั้ง 3 repo ว่ายังไม่มีใครอ่าน category นี้เพิ่ม (กติกา "กฎมีกี่คนอ่าน")

## เฟส 3 — backfill ข้อมูลเก่าบน production (สคริปต์ + dry-run บังคับ)

- เป้า: แถว `LOGISTICS_REVENUE` ที่ `rider_id !== 'SYSTEM'` → เขียน `rider_id: 'SYSTEM'` + ประทับ `retagged_at`
- **แนะนำ retag อย่างเดียว ไม่ restate `amount` ย้อนหลัง**: ไม่มีรายงานไหนอ่านหมวดนี้ จึงไม่มีเลขที่แสดงผิดค้างอยู่ และการแก้ยอดย้อนหลังใน ledger เสี่ยงกว่าประโยชน์ — แต่ประทับหมายเหตุ `amount_basis: 'legacy_rider_fee'` ต่อแถวไว้ให้บัญชีอ่านออก (เจ้าของเคาะข้อนี้ — คำถามเปิด #1)
- ลำดับ: รันหลังเฟส 1 deploy แล้ว (กระเป๋าถูกก่อนแล้ว backfill เป็นการล้าง ledger ไม่ใช่ตัวแก้อาการ) และหลังเฟส 2 merge (ไม่งั้นล้างแล้วมีของใหม่ไหลเข้า)
- ตรวจรับ: รันสคริปต์เฟส 0 ซ้ำ → คอลัมน์ "ส่วนที่บวม" ต้องเป็น 0 ทุก rider

## เฟส 4 — ท่อถอนเงิน (อิสระจากเฟส 1-3; คำตอบข้อ 1 = ไม่มีข้อมูลเก่าต้อง migrate)

ทางเลือก 2 ทาง — **แนะนำทาง A**:

- **ทาง A (แนะนำ): callable `riderRequestWithdraw`** ใน `bkk-rider-app/functions` (codebase มีอยู่แล้ว มีท่อ deploy แล้ว; ชื่อต้อง unique ระดับ project ตามกฎ `{region}/{name}`)
  - server ตรวจของจริงก่อนสร้างคำขอ: balance คิดจาก `/transactions` ฝั่ง server (ช่องโหว่ปัจจุบัน: เช็คแค่ client ที่ useJobActions.ts:400-402 และหน้า finance ก็ไม่เช็คซ้ำ — ใครยิงตรงก็ขอเกินได้), ขั้นต่ำ 100, กันคำขอค้างซ้ำ
  - เขียน `/withdrawals/{id}` ผ่าน Admin SDK; rules: read = admin + เจ้าของ (`rider_id === auth.uid`), client write ปิดสนิท
- **ทาง B (เร็วกว่า):** เพิ่ม rule ให้ rider push `/withdrawals` เอง (create-only + `.validate` ฟิลด์บังคับ + `rider_id === auth.uid`) — แลกกับการตรวจ balance ใน rules ไม่ได้ (อ่านข้าม node เพื่อรวมยอดไม่ได้) จึงเหลือด่านเดียวคือคนกดโอน
- ฝั่งอ่าน (ทำทั้งสองทาง): `RiderWithdrawals.tsx` เปลี่ยน source จาก `/jobs` (:16,45-53) → `/withdrawals` และย้ายการเขียนตอบกลับ (status/paid_at/slip — ปัจจุบันเขียน `jobs/{selectedTx.id}` :98-101,118-121) ไปที่แถว `/withdrawals` เดียวกัน
- ผลพ่วงที่ต้องแก้ในชุดเดียวกัน: `rider-wht-issue.js:113,159` เขียนสำเนา 50 ทวิลง `jobs/{ref_job_id}/wht_certificate` — เมื่อแถวถอนอยู่ `/withdrawals` ต้องย้ายปลายทางเป็น `withdrawals/{id}/wht_certificate` + rule ให้เจ้าของอ่าน (ไม่งั้นเขียน node ผีลง `/jobs`)
- เหตุผลที่ไม่กลับไปใช้ `/jobs` แบบ legacy: trigger บน `/jobs` ยิงทุก create (`onJobCreatedSendEmails`) และแถวถอนจะปนกับงานจริงในทุกหน้าที่ subscribe jobs — จ่ายค่ากรอง `type !== 'Withdrawal'` ไปตลอด
- rules ทั้งหมดแก้ที่ `bkk-frontend-next/database.rules.json` (canonical) + deploy จาก repo นั้น + **ดู deploy-rules run ให้เขียวหลัง merge** (บทเรียน CI เขียว ≠ deploy ขึ้น)

## เฟส 5 — ตรวจรับรวม + สื่อสาร

- ก่อน deploy เฟส 1: แจ้งไรเดอร์ (ผ่านช่องทางที่ใช้ประจำ) ว่ายอดในกระเป๋าจะแสดงลดลง เพราะระบบเดิมนับรายได้บริษัทปนเข้ามา — เงินที่ถอนได้จริงไม่เปลี่ยน
- ต่อเฟส: `tsc --noEmit` + เทสเขียว + (เฟส 4) เทสยิง callable จริงบน preview ก่อนเปิดปุ่มในแอป
- ปิดงานเมื่อ: เฟส 0 rerun = บวมศูนย์ · ไรเดอร์ทดสอบกดถอน 1 รายการไหลถึง finance และได้ DEBIT + (ถ้าเปิด WHT) 50 ทวิครบวง

## นอกขอบเขตแผนนี้ (รอคำตอบข้อ 3-7 ของ survey)

fallback 150 ตอน settle · นโยบาย one-way · การยืนเลข estimate ตอนกดรับ · หน้า `/checkout` demo · gate `receive_method` ในสูตร net ของ RiderApp.tsx:182 ((ค)#5 — เป็น one-liner ที่พ่วงเฟส 1 ได้ถ้าต้องการ แต่แยกเคาะ)

## คำถามเปิดให้เคาะก่อนลงมือ

1. เฟส 3: retag `rider_id` อย่างเดียว (แนะนำ) หรือ restate `amount` ย้อนหลังด้วย
2. เฟส 4: ทาง A (callable — แนะนำ) หรือทาง B (rules อย่างเดียว)
3. ข้อความ/ช่องทางแจ้งไรเดอร์เรื่องยอดที่แสดงจะลดลง (ก่อน deploy เฟส 1)
