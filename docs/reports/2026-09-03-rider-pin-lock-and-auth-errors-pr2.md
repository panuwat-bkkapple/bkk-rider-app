# PR 2 — `feat/rider-pin-lock-and-auth-errors`

**Stacked PR — ฐานคือ `fix/rider-auth-persistence` ไม่ใช่ `main`**
(PR 1 ยังไม่ merge และ PR นี้ใช้ `sessionExpired`, `logAuthEvent`, `authed`
ที่ PR 1 สร้าง) — diff ที่อ่านควรอ่านเทียบกับ `fix/rider-auth-persistence`
**merge PR 1 ก่อนเสมอ**

อ้างอิงบรีฟ §2 + amendment วันที่ 3 ก.ย. 2569 (มาตรฐาน `approval_status` จาก Task 3)

`tsc -b` ผ่าน · `npm run build` ผ่าน · `npm test` **144/144** ผ่าน (11 ไฟล์, เพิ่ม 27 เทสใหม่)

---

## ⚠️ ข้อเดียวที่ทำไม่ตรง amendment — และเป็นข้อที่สำคัญที่สุด

amendment เขียนว่า:

> Change `Login.tsx:120` to gate on `approval_status === 'Pending'`

**ทำตามตัวอักษรไม่ได้ — มันจะเปิดช่องให้ไรเดอร์ที่ยังไม่ได้รับอนุมัติล็อกอินผ่าน**

`Register.tsx:95` เขียน `status: 'Pending'` และ **ไม่เขียน `approval_status` เลย**
ผู้สมัครใหม่ทุกคนจึงมี `approval_status === undefined` ถ้าเทียบตรงๆ:

```ts
undefined === 'Pending'   // false → ผ่านด่าน → เข้าระบบได้
```

และ amendment เองก็สั่ง (ถูกแล้ว) ว่าห้ามแตะ `Register.tsx` ดังนั้น fallback ไป
`status` จึงเป็น**ของจำเป็น ไม่ใช่ของเผื่อ**

**ทำแทน:** สร้าง `src/utils/riderStanding.ts` ซึ่งเป็น **mirror ของ
`bkk-system/functions/actor.js:106-123`** (`effectiveApprovalStatus` +
`riderStanding`) — `approval_status` มาก่อนเสมอ, `status` เป็น fallback,
presence (`Online`/`Offline`/`Busy`) อ่านว่า `Active`, ไม่มีอะไรเลยอ่านว่า `Pending`

นี่**คือ**การ "standardise on `approval_status`" ตามเจตนา: `approval_status`
เป็นผู้มีอำนาจ ส่วน `status` ถูกลดชั้นเป็นแหล่งข้อมูลสำรองของแถวเก่าเท่านั้น
และไม่มีที่ไหนในแอปเทียบ `status` ตรงๆ เพื่อตัดสินสิทธิ์อีกแล้ว

**ส่วนที่เกินจาก amendment เล็กน้อย (ตั้งใจ):** ด่านบล็อกทุก standing ที่ไม่ใช่
`ACTIVE` ไม่ใช่เฉพาะ `PENDING` — ตามกฎ fail-closed ของ `riderStanding` ต้นทาง
(`actor.js:113-116`: *"Anything not explicitly Active or Pending is BLOCKED —
including values this code has never seen"*) วันนี้ `Rejected`/`Suspended` ถูกกัน
ด้วย `setAuthDisabled` + `revokeRefreshTokens` ที่ `rider-accounts.js:146` อยู่แล้ว
ด่านนี้จึงเป็นชั้นที่สอง — แต่ `rider-accounts.js` เองรายงาน `hadAuthAccount:
false` ได้สำหรับ record ที่สร้างด้วยมือ ชั้นที่สองจึงไม่ใช่ของเกิน

---

## §2.1 — ลบ `useAutoLogout`, เพิ่ม `usePinLock`

**`src/hooks/useAutoLogout.ts` ถูกลบทั้งไฟล์** — นี่คือการปิดเส้นทางสุดท้ายที่
ทำลายการลงทะเบียนเครื่องโดยไม่มีใครสั่ง (ที่ค้างไว้ตอน PR 1) ตอนนี้เหลือผู้ล้าง
enrolment แค่ 2 ราย ตามหลักการข้อ 2 เป๊ะ:

| ผู้ล้าง enrolment | ที่อยู่ |
|---|---|
| ไรเดอร์กดออกจากระบบเอง | `RiderApp.tsx:confirmLogout` |
| ไรเดอร์กด "สลับบัญชี" | `Login.tsx:handleResetDevice` |
| สัญญาณ server (Suspended) | `useRiderData.ts` |
| ~~ตัวจับเวลา 30 นาที~~ | **ลบแล้ว** |

*(สองรายการแรกคือ "explicit logout" ตามหลักการข้อ 2(a) รายการที่สามคือ 2(b))*

**`src/utils/pinLock.ts`** (pure) + **`src/hooks/usePinLock.ts`**:
- ประทับ `Date.now()` ลง `localStorage.last_hidden_at` ตอน `visibilitychange` → hidden
  **และตอน `pagehide`** — iOS ไม่ยิง `visibilitychange` เสมอไปตอนแอปถูกฆ่า
  ถ้าไม่ประทับไว้ cold start ครั้งถัดไปจะไม่รู้ว่าห่างไปนานแค่ไหน
- `shouldLock()` เทียบ **นาฬิกาจริง** ไม่ใช่ `setTimeout` → แก้ทั้งสองอาการที่
  รายงานสำรวจข้อ 2 บันทึกไว้ (หลุดเร็วเกินตอนกลับจาก background / ไม่หลุดเลย
  ตอน iOS ฆ่าหน้าเว็บ)
- ประเมินตั้งแต่ mount → **cold start ก็ล็อก** ซึ่งของเดิมทำไม่ได้เลย
- **ไม่มี `signOut` ในไฟล์ไหนของฟีเจอร์นี้** และไม่แตะ `rider_id`/`device_pin`
- ปลดกลอน = ประทับเวลาใหม่ (ไม่ใช่ลบคีย์) — ลบแล้วถ้าแอปถูกฆ่าโดยไม่ทันยิง
  `pagehide` การเปิดครั้งถัดไปจะไม่มีอะไรให้เทียบแล้วไม่ล็อกทั้งที่ควรล็อก

**จอที่ขึ้นตอนล็อก** อยู่**เหนือ router** ใน `App.tsx` โดยตั้งใจ — ไม่มี
`<Navigate>` เส้นทางที่ไรเดอร์ค้างอยู่จึงไม่ถูกทิ้ง ปลดกลอนแล้วกลับมาที่เดิมพอดี
ใช้ `Login` ตัวเดิมด้วย prop `lockMode` (ตามบรีฟ: "render the PIN screen
(Login.tsx:41-50 path)") + `onUnlock` แยกจาก `onLoginSuccess` เพราะ**ปลดกลอน
ไม่ใช่ล็อกอิน** — Firebase session ยังอยู่ครบ การเรียก `onLoginSuccess` จะไป
รีเซ็ต state ที่ไม่ควรถูกแตะ

ปุ่ม "สลับบัญชี" **ยังอยู่ตอนล็อก** โดยตั้งใจ — เป็นทางออกเดียวของไรเดอร์ที่ลืม PIN
และมันคือ explicit logout ซึ่งได้รับอนุญาตให้ล้าง enrolment อยู่แล้ว

`enabled` = `riderId && !sessionExpired && device_pin มีอยู่` — ไม่มี PIN แล้วล็อก
= จอที่ไม่มีทางผ่าน

## §2.2 — ทำให้ auth error มองเห็นได้

**`src/utils/sessionState.ts`** (ใหม่) = bus ตัวเดียวที่ชั้นล่างใช้บอกชั้นบน
เลือกเป็น module-level bus ไม่ใช่ prop/context เพราะ `useDatabase` เป็น hook ทั่วไป
ที่ error handler อยู่ลึกกว่า `App` หลายชั้น — ร้อย callback ลงไปแปลว่าทุก call site
ต้องรู้เรื่อง auth ซึ่งไม่ใช่เรื่องของมัน

**dedupe เป็นคุณสมบัติที่ขาดไม่ได้** — ตอน token ตาย listener ทุกตัว error พร้อมกัน
(jobs × 4 query, transactions, withdrawals, condition_sets) ถ้ายิงทุกครั้งจะได้
log ท่วมและ `setState` ซ้ำสิบกว่ารอบ

**RTDB — `PERMISSION_DENIED` ไม่กลายเป็นจอว่างอีกแล้ว:**

| ไฟล์ | เดิม | ใหม่ |
|---|---|---|
| `useDatabase.ts` | `setData([])` | `error: 'auth'` + `notifySessionLost` · **ไม่** `setData([])` |
| `useRiderJobs.ts` (rider_id query) | `console.error` เฉยๆ | + `notifySessionLost` |
| `useRiderJobs.ts` (pool status × 4) | `console.error` เฉยๆ | + `notifySessionLost` |
| `usePaginatedDatabase.ts` | `console.error` เฉยๆ | + `notifySessionLost` |

> บรีฟระบุแค่ `useDatabase.ts:25-29` แต่ **`useRiderJobs` คือตัวที่ผลิตอาการ
> "ไม่มีงาน" จริงๆ** (กองงานของไรเดอร์มาจากที่นั่นที่เดียว ไม่ได้ผ่าน
> `useDatabase`) การแก้แค่ที่บรีฟระบุจะได้หลักการข้อ 4 แค่บนกระดาษ
> `usePaginatedDatabase` เพิ่มด้วยเหตุผลเดียวกัน — ยอดกระเป๋าที่กลายเป็น 0
> เพราะหมดสิทธิ์ อ่านออกมาเหมือน "ไม่มีเงิน"

`useDatabase` **ไม่** `setData([])` ตอน auth error — ปล่อยข้อมูลชุดเดิมค้างบนจอ
ระหว่างที่ App กำลังสลับไปจอ "เซสชันหมดอายุ" ดีกว่าล้างให้ว่างแล้วกระพริบ
(error อื่นที่ไม่ใช่ auth ยัง `setData([])` ตามเดิม)

**callable `unauthenticated`** — ดักที่ `useJobActions.ts` **ก่อน**
`engineErrorCode` ทั้ง `transitionJob` และ `riderRequestWithdraw` ตามบรีฟ
(error ชั้น auth ไม่มี `details` → `engineErrorCode` คืน null → ตกไปที่
"เกิดข้อผิดพลาด กรุณาลองใหม่" ซึ่งลองกี่ครั้งก็ไม่สำเร็จ)

**`onIdTokenChanged`** ใน `App.tsx` = **seam ทั่วไปของเรื่องนี้** ไม่ใช่ของแถม
token ถูกเพิกถอนเมื่อไหร่ SDK ยิง null ที่นี่ ไม่ว่า request ไหนจะเป็นตัวสะดุดก่อน
— นี่คือเหตุผลที่**ไม่**ไล่ใส่การเช็ค `unauthenticated` ทีละ call site ทั้ง 9 จุด
(`sickwApi`, `visionOcr`, `diagnos`, `amendments`, `ClaimAssessment`,
`SelfAssessmentClaim`, `HistoryJobSheet`): สำเนาของกฎที่ `onIdTokenChanged`
ครอบอยู่แล้วคือสำเนาที่วันหนึ่งจะไม่ตรงกัน ตามบทเรียน "mirror ต้อง mirror *กฎ*
ไม่ใช่ *จำนวนจุดที่เรียกกฎ*" ใน CLAUDE.md
`isUnauthenticatedError` export ไว้แล้วสำหรับจุดที่อยากได้ทางลัดในอนาคต

## §2.3 — Suspended / revoked

- `useRiderData.ts` เทียบผ่าน `isSuspended()` (approval_status ก่อน) แทน
  `data.approval_status === 'Suspended'` ตรงๆ
- ข้อความ: **"บัญชีถูกระงับ กรุณาติดต่อออฟฟิศ"** (ต่อท้ายด้วย `suspend_reason`
  ในวงเล็บเมื่อมี — เพิ่มจากบรีฟ เพราะเหตุผลที่ระบุไว้มีค่ากับไรเดอร์ และเป็น
  การเติม ไม่ใช่การขัด)
- ยัง `signOut` + ล้าง enrolment ตามบรีฟ (นี่คือหลักการข้อ 2(b))

**บั๊กที่เจอระหว่างทางและแก้ไปด้วย:** เส้นทางนี้เรียก `toast.error()` แล้ว
`window.location.reload()` ทันที — **toast ตายไปกับหน้าเก่า** ไรเดอร์เห็นแค่จอ
กรอกอีเมลเปล่าๆ โดยไม่รู้ว่าเพิ่งเกิดอะไรขึ้น ซึ่งขัดหลักการข้อ 4 ตรงๆ
เพิ่ม `src/utils/authNotice.ts` ฝากข้อความไว้ใน `sessionStorage` ให้จอล็อกอิน
อ่านต่อ (อ่านครั้งเดียวแล้วลบ, ใช้ `sessionStorage` ไม่ใช่ `localStorage`
เพราะข้อความนี้เป็นของ "รอบนี้" ไม่ควรโผล่อีกในอีกสามวัน)

---

## เทสที่เพิ่ม (27 ตัว) และผล injection

amendment ขอเทสสองเรื่องโดยเฉพาะ — ทั้งคู่อยู่ใน `riderStanding.test.ts`:

1. **ด่าน Pending** — ผู้สมัครใหม่จาก `Register` (มีแค่ `status: 'Pending'`)
   ต้องถูกบล็อก · แบบมี `approval_status: 'Pending'` ก็ต้องถูกบล็อก
2. **presence write ต้องไม่ขยับด่าน** — `{approval_status:'Suspended',
   status:'Online'}` ยังต้องถูกบล็อก (นี่คือบั๊กที่ Task 3 หาเจอ) และ
   `{approval_status:'Active', status:'Busy'}` ยังต้องผ่านตามเดิม
   มีเทสที่เขียนเทียบให้เห็นกันตรงๆ ว่าโค้ดเดิม (`status === 'Suspended'`)
   ปล่อยผ่าน ส่วนโค้ดใหม่บล็อก

**ผล injection ทั้งหมดวัดจริง ไม่ได้ประมาณ** (commit checkpoint ก่อนเริ่ม ตาม
วินัยใน CLAUDE.md แล้ว `git checkout` restore ทีละตัว ปิดท้ายด้วย full suite):

| ไฟล์ | injection | ผล |
|---|---|---|
| `riderStanding` | คืน `'Active'` เสมอ | แดง 9/12 |
| | ถอด fallback ไป `status` | แดง 2/12 |
| | ถอด `PRESENCE_VALUES` | แดง 1/12 |
| | ยกเลิก fail-closed | แดง 2/12 |
| | ให้ `status` ชนะ `approval_status` | แดง 7/12 |
| `pinLock` | `return true` เสมอ | แดง 4/6 |
| | `return false` เสมอ | แดง 2/6 |
| | ถอด guard เวลาติดลบ | **ไม่แดง → ลบ guard ทิ้ง** |
| | ถอด guard ค่าที่ parse ไม่ได้ | แดง 1/6 |
| | `>` เป็น `>=` | ไม่แดง (ตั้งใจไม่ดัก) |
| `sessionState` | ถอด dedupe | แดง 1/9 |
| | `isPermissionDenied` → false เสมอ | แดง 1/9 |
| | `isUnauthenticatedError` → true เสมอ | แดง 1/9 |
| | ถอด try/catch รอบ listener | แดง 2/9 |

**สองอย่างที่ injection จับได้จริงในรอบนี้ (ทั้งคู่ไม่ใช่บั๊กในโค้ดทำงาน):**

1. **ลบโค้ดที่ไปไม่ถึงออกหนึ่งที่** — `if (elapsed < 0) return false;` ใน
   `shouldLock` ถอดออกแล้วเทสยังเขียวทุกตัว เพราะ elapsed ที่ติดลบเทียบกับ
   `LOCK_AFTER_MS` ที่เป็นบวกได้ `false` อยู่แล้ว **ไม่มีอินพุตไหนไปถึงมันได้เลย**
   → ลบทิ้งตามกฎ "ด่านที่ไปไม่ถึง ให้ลบ ไม่ใช่ ship" (เทสของเคสนี้เก็บไว้เพราะ
   มันตรึง*พฤติกรรม* ที่ยังถูกอยู่ ไม่ใช่ตรึงบรรทัดที่ถูกลบ)
2. **เกือบรายงานว่าเทสไม่คุ้มทั้งที่คุ้ม** — injection "ให้ `status` ชนะ" รอบแรก
   เขียนอ่อนไป (ให้ชนะเฉพาะเมื่อไม่ใช่ค่า presence) ได้ **แดงแค่ 1** เพราะเคส
   สำคัญที่สุดมี `status` เป็น presence จึงตกกลับไปอ่าน `approval_status` แล้ว
   ได้คำตอบถูก**โดยบังเอิญ** ทำ injection ให้ถึงแก่นแล้วได้ **แดง 7**
   — บันทึกไว้ในหัวไฟล์เทสเพราะเป็นกับดักที่จะกัดคนถัดไป

---

## ผลตรวจ standing บน production — **gate ผ่านแล้ว** (3 ก.ย. 2569 ~15:30 UTC)

รันโดยเจ้าของงานบนเครื่องตัวเอง (`scripts/check-rider-standing.ts` พร้อม service
account) เพราะ session นี้เข้า RTDB ไม่ได้ — egress policy บล็อกโฮสต์

```
approval_status      Active 2
status               Busy 1 · Active 1
คู่                   Active|Busy 1 · Active|Active 1
มีสัญญาณใน 30 วัน     2 คน
REGRESSION           0 คน
ด่านเดิมบล็อก/ใหม่ผ่าน  0 คน
ทำงานอยู่แต่จะถูกบล็อก  0 คน
→ ผ่าน
```

**ไม่มีใครถูกบล็อกเพิ่มจากการย้ายด่านมาที่ `approval_status`** และ **รูปแถวที่กลัว
ที่สุด (ไม่มีทั้งสองฟิลด์) ไม่มีอยู่จริงบน production** ทั้งสองแถวมี
`approval_status: 'Active'` ครบ

### สามข้อที่ตัวเลขนี้บอก และหนึ่งข้อที่มันบอกไม่ได้

1. **เห็นกลไกที่ Task 3 อธิบายไว้ ในข้อมูลจริง** — ไรเดอร์คนหนึ่งมี
   `status: 'Busy'` (presence ที่แอปเขียนทับ) อีกคนมี `status: 'Active'`
   (ค่าอนุมัติที่ `rider-accounts.js` เขียนไว้ ยังไม่ถูกทับเพราะยังไม่เคยเปิดรับงาน)
   **ฟิลด์เดียวกันถือความหมายคนละอย่างอยู่พร้อมกันบน production ตอนนี้** ซึ่งเป็น
   หลักฐานตรงๆ ว่าทำไมด่านล็อกอินต้องเลิกอ่าน `status`

2. **fallback ไป `status` ใน `riderStanding` ยังไม่มีแถวไหนบน production ไปถึงมัน**
   (ทุกแถวมี `approval_status`) — **แต่ห้ามลบทิ้ง** เพราะ `Register.tsx:95` ยัง
   เขียนแค่ `status: 'Pending'` ผู้สมัครคนถัดไปจะสร้างแถวรูปนั้นทันที fallback จึง
   **ไปถึงได้ผ่านเส้นทางสมัคร ไม่ใช่ผ่านแถวที่มีอยู่** ต่างจากเคส "ด่านที่ไปไม่ถึง
   ให้ลบ" เพราะรูปนั้นถูกผลิตโดยโค้ดที่ยังทำงานอยู่ fixture ในเทสจึงไม่ใช่ของแต่ง

3. **กลุ่มตัวอย่างมีแค่ 2 แถว — คำยืนยันนี้อ่อนกว่าที่มันฟังดู** มันตอบคำถามที่ gate
   ถามได้ครบ ("ไรเดอร์ที่ทำงานอยู่ทุกคนผ่านไหม") แต่มัน **ไม่ได้ทดสอบ fallback กับ
   แถว legacy** เพราะไม่มีแถว legacy ให้ทดสอบ ถ้าวันหนึ่งมีการ import ไรเดอร์เก่า
   เข้ามา ต้องรันสคริปต์นี้ซ้ำก่อนเชื่อ

4. **สิ่งที่มันบอกไม่ได้เลย:** ทั้งหมดนี้เป็นเรื่อง *ข้อมูล* ไม่ใช่เรื่อง *พฤติกรรมแอป*
   กลอน PIN / เพดานเวลา / จอเซสชันหมดอายุ **ยังไม่ถูกทดสอบบนอุปกรณ์จริงเลย**
   (ดูรายการข้างล่าง)

## รายการทดสอบด้วยมือ (ยังไม่ได้ทำ — ไม่มีอุปกรณ์จริงใน session นี้)

ต้องทำบน **iPhone จริง ทั้ง Safari โหมดปกติ และแบบ Add to Home Screen**

### A. กลอน PIN (§2.1)
1. ล็อกอิน → ตั้ง PIN → ใช้งานปกติ → พักแอปไว้เบื้องหลัง **31 นาที** → กลับมา
   **คาดหวัง:** จอ PIN เท่านั้น · ใส่ PIN ถูก → กลับมาที่แท็บเดิม · **งานยังโหลดครบ**
   (ไม่ต้องกรอกอีเมล ไม่ต้องตั้ง PIN ใหม่)
2. พักแอปไว้ **5 นาที** → กลับมา → **คาดหวัง:** ไม่ล็อก เข้าใช้งานต่อได้เลย
3. **ปิดแอปทิ้ง (swipe kill) แล้วเปิดใหม่วันรุ่งขึ้น** → **คาดหวัง:** จอ PIN
   *(เคสนี้ของเดิมทำไม่ได้เลย — timer ตายไปกับหน้าเว็บ)*
4. ล็อกอยู่แล้วกด "สลับบัญชี" → **คาดหวัง:** ออกจากระบบได้จริง (ทางออกของคนลืม PIN)

### B. Token ถูกเพิกถอน (§2.2) — **เวอร์ชันแก้ไขแล้ว**
> บรีฟเดิมเขียนว่า "ล้าง website data แล้วเปิดใหม่" ซึ่ง**พิสูจน์สิ่งที่ตั้งใจไม่ได้**
> เพราะการล้าง website data ลบ `localStorage` ไปด้วย = ลบ `device_pin` และ
> `rider_email` เคสนั้นจึงกลายเป็นการลงทะเบียนใหม่ ไม่ใช่การกู้ session

5. เปิดแอปค้างไว้บนเครื่อง (ล็อกอินอยู่ กำลังดูรายการงาน) →
   **Firebase console → Authentication → ผู้ใช้คนนั้น → Revoke refresh tokens**
   → กลับมาที่แอปแล้วรอ/ดึงรีเฟรช
   **คาดหวัง:** จอ **"เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง"** พร้อมอีเมล prefill
   — **ห้ามเป็นรายการงานว่าง** และห้ามเป็น toast "กรุณาลองใหม่"
6. จากจอนั้น ใส่รหัสผ่าน → **คาดหวัง:** กลับเข้าใช้งานทันที **ไม่ต้องตั้ง PIN ใหม่**
   (นี่คือ acceptance ของ PR 1 ข้อ 1.3 ที่เพิ่งทดสอบได้จริงเป็นครั้งแรก)
7. ระหว่างที่ token ตาย ลองกดปุ่มเปลี่ยนสถานะงาน →
   **คาดหวัง:** ไปจอเซสชันหมดอายุ ไม่ใช่ toast "เกิดข้อผิดพลาด กรุณาลองใหม่"

### C. ระงับบัญชี (§2.3)
8. เปิดแอปค้างไว้ → แอดมินกดระงับที่ `/riders` ของ bkk-system →
   **คาดหวัง:** ข้อความ **"บัญชีถูกระงับ กรุณาติดต่อออฟฟิศ"** และ**ยังอ่านได้
   หลังหน้าเว็บ reload แล้ว** (นี่คือสิ่งที่ `authNotice` แก้ — ก่อนหน้านี้ toast
   ตายไปกับ reload) · ต้องออกจากระบบจริงและกลับเข้าไม่ได้

### D. ด่านล็อกอิน (amendment / Task 3)
9. สมัครไรเดอร์ใหม่ (ยังไม่อนุมัติ) → ลองล็อกอิน →
   **คาดหวัง:** "บัญชีของคุณอยู่ระหว่างรอการตรวจสอบจากแอดมิน"
   *(เคสนี้คือเหตุผลที่ต้องมี fallback ไป `status` — ดูหัวข้อบนสุด)*
10. ไรเดอร์ที่อนุมัติแล้วและเคยออนไลน์ (`status` เป็น `Online`/`Busy`) → ล็อกอิน
    → **คาดหวัง:** ผ่านตามปกติ presence ไม่ทำให้ด่านเพี้ยน

### E. ไม่ถดถอย
11. ใช้งานปกติ 40 นาทีโดยไม่พักแอป → **คาดหวัง:** ไม่มีอะไรเกิดขึ้น
    *(ของเดิมจะเตะออกที่ 30 นาทีถ้าไม่มี `mousedown`/`touchstart`/`keydown`/`scroll`)*

---

## Follow-up (จงใจไม่ทำใน PR นี้)

จาก Task 3 — amendment สั่งให้ list ไว้ ไม่ให้แตะ:

1. **`bkk-rider-app/src/pages/Register.tsx:95` ยังเขียนแค่ `status: 'Pending'`**
   ควรเขียน `approval_status: 'Pending'` คู่ไปด้วย เพื่อให้แถวใหม่ไม่ต้องพึ่ง
   fallback ตั้งแต่แรก **ต้องทำก่อน**จึงจะถอด fallback ใน `riderStanding` ได้
2. **`bkk-system` ยังมีผู้อ่าน 5 รายที่ fallback ไป `status`**
   (`actor.js`, `RiderManagement.tsx`, `RiderPerformance.tsx`,
   `RiderPerformanceDetail.tsx`, `index.js:5126`) — **ห้ามถอด `status` ออกจาก
   `rider-accounts.js` จนกว่าจะ backfill `approval_status` ครบทุกแถว**
   (กฎ "ย้าย writer: ถามว่าใครอ่านของเดิม" ใน CLAUDE.md)
3. ~~นับแถวบน production ที่ยังไม่มี `approval_status`~~ **วัดแล้ว: 0 จาก 2 แถว**
   (ดูหัวข้อผลตรวจด้านบน) — fallback ยังจำเป็นเพราะเส้นทางสมัคร ไม่ใช่เพราะแถวที่มีอยู่
4. **`bkk-system/functions/hr-core.js:205,211` เทียบกับสตริง `'approved'`**
   ซึ่งไม่มีผู้เขียนคนไหนในระบบเขียน (ของจริงคือ `'Active'`) — นอกขอบเขต
   ยังไม่ได้ยืนยันด้วยการรัน
5. **`rider_auth_events` rules ยังไม่ deploy** — ค้างจาก PR 1 อยู่บน
   `bkk-frontend-next` branch `claude/bkk-rider-auth-survey-3onl5v`
   จนกว่าจะ deploy ตาราง log จะว่าง **ห้ามอ่านความว่างนั้นว่าไม่มีใครหลุด**
6. **`useDatabase` คืน `error` แล้วแต่ยังไม่มีใครอ่าน** — จงใจ ตัวที่ทำงานจริง
   คือ `notifySessionLost` ฟิลด์นี้มีไว้ให้ UI ที่อยากแยก "โหลดไม่ได้" ออกจาก
   "ไม่มีข้อมูล" ในอนาคต ถ้าอีกสาม PR แล้วยังไม่มีใครอ่าน **ให้ลบ**
   (กฎ "ด่านที่ไปไม่ถึง ให้ลบ")
