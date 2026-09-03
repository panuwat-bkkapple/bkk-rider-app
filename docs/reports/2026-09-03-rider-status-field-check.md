# Task 3 — `status` vs `approval_status` ของไรเดอร์: ใครเขียน ใครอ่าน

อ่านอย่างเดียว ไม่แก้อะไร · ขอบเขต: `bkk-system` (+ `functions/`),
`bkk-rider-app`, และ `database.rules.json` (canonical อยู่ที่ `bkk-frontend-next`)

---

## ตารางที่ 1 — ผู้เขียน → ฟิลด์

| ผู้เขียน | `approval_status` | `status` | หมายเหตุ |
|---|---|---|---|
| `bkk-system/functions/rider-accounts.js:40-45` **(ทางหลักของ approve/reject/suspend/unsuspend)** | ✅ | ✅ | เขียน**ทั้งคู่**เสมอ: approve→`Active`/`Active` · reject→`Rejected`/`Rejected` · suspend→`Suspended`/`Suspended` · unsuspend→`Active`/`Active` |
| `bkk-rider-app/src/hooks/useRiderData.ts:147` | — | ✅ | **เขียน presence ทับ:** `'Busy'` เมื่อถืองาน / `'Online'` เมื่อว่าง — ทุก ~10 วินาทีขณะเปิดรับงาน |
| `bkk-rider-app/src/pages/Register.tsx:95` | — | ✅ | สมัครใหม่ → `'Pending'` (**ไม่เขียน `approval_status` เลย**) |
| `bkk-system/src/pages/fleet/RiderManagement.tsx:236` | — | — | `handleSaveProfile` เขียน score/zone/โปรไฟล์/employment/vehicle เท่านั้น **ไม่แตะสองฟิลด์นี้** |

**ข้อสังเกตสำคัญ:** `rider-accounts.js:37-39` มีคอมเมนต์กำกับไว้แล้วว่าเขียนสอง
ฟิลด์โดยเจตนา — *"เขียนทั้ง `approval_status` (ธงที่แอดมินใช้) และ `status`
(ธงที่แอปไรเดอร์อ่าน) เสมอ เพราะมีคนอ่านคนละตัวกัน"* คือทีมรู้ปัญหานี้อยู่แล้ว
และเลือกวิธี "เขียนสองรูป" เป็นทางออกชั่วคราว

---

## ตารางที่ 2 — ผู้อ่าน → ฟิลด์

| ผู้อ่าน | ฟิลด์ที่อ่าน | ใช้ตัดสินอะไร |
|---|---|---|
| **`bkk-rider-app/src/hooks/useRiderData.ts:81`** | `approval_status === 'Suspended'` | เตะไรเดอร์ออกกลางการใช้งาน |
| **`bkk-rider-app/src/pages/Login.tsx:120`** | `status === 'Pending'` | บล็อกการล็อกอินของบัญชีที่ยังไม่อนุมัติ |
| **`bkk-rider-app/src/pages/Register.tsx:95`** | *(เขียนอย่างเดียว)* | — |
| `bkk-system/functions/actor.js:106-111` `effectiveApprovalStatus()` | `approval_status` **แล้ว fallback** `status` | นิยามกลางของ "standing" — `Online`/`Offline`/`Busy` → `Active`, ว่าง → `Pending` |
| `bkk-system/functions/actor.js:118-123` `riderStanding()` | ผ่าน `effectiveApprovalStatus` | ACTIVE / PENDING / **BLOCKED (fail closed)** |
| `bkk-system/src/pages/fleet/RiderManagement.tsx:87-94` `normalizeRider` | `approval_status` fallback `status` | ตัวกรอง/ป้ายบนหน้าแอดมิน (mirror ของ `effectiveApprovalStatus` — คอมเมนต์ที่ `actor.js:101-104` ระบุว่าต้องแก้คู่กัน) |
| `bkk-system/src/pages/fleet/RiderManagement.tsx:302` | **ทั้งสอง** | `approval_status === 'Active' && (status === 'Online' \|\| status === 'Busy')` — จุดเดียวที่ใช้ `status` เป็น **presence** อย่างถูกต้อง |
| `bkk-system/src/pages/fleet/RiderPerformance.tsx:137` · `RiderPerformanceDetail.tsx:115` | `approval_status \|\| status` | normalise ก่อนกรอง |
| `bkk-system/functions/index.js:5126` (`autoFlagRiders`) | `approval_status \|\| status` | ข้ามคนที่ถูกระงับ/ปฏิเสธไปแล้ว |
| `bkk-system/functions/hr-core.js:205,211` | `approval_status` **(lowercase)** | `riderOpen = approval_status === 'approved'` — **สำนวนที่สาม** ตัวพิมพ์เล็ก + default `'approved'` เมื่อไม่มีค่า |
| **`database.rules.json:48, 64, 830, 831`** | `approval_status` **เท่านั้น** | gate การอ่าน/เขียน `jobs` และโหนดข้างเคียง: ต้องไม่ใช่ `Suspended` และไม่ใช่ `Rejected` |
| `database.rules.json:557-559` | `approval_status` | `.validate` — ไรเดอร์แก้ค่าตัวเองไม่ได้ มีแต่ admin |
| `database.rules.json:599-600` | `status` | `.read: true` (สาธารณะ) — **ไม่มี `.validate`** |

---

## สิ่งที่ตารางสองใบนี้เปิดออกมา

### 1. `status` ถูกใช้สองความหมายพร้อมกัน — และ presence เป็นฝ่ายชนะ

`status` แบกทั้ง **สถานะการอนุมัติ** (`Pending`/`Active`/`Rejected`/`Suspended`)
และ **สถานะออนไลน์** (`Online`/`Offline`/`Busy`) อยู่ในฟิลด์เดียว

ผู้เขียนที่ถี่ที่สุดของฟิลด์นี้คือ **แอปไรเดอร์เอง** (`useRiderData.ts:147`
ทุก ~10 วินาทีขณะเปิดรับงาน) และมันเขียนได้เพราะ rules ไม่มี `.validate` ใต้
`riders/$uid/status` ต่างจาก `approval_status` ที่ถูกตรึงไว้ที่ `:557-559`

**ผลตรงๆ:** ไรเดอร์ที่ผ่านการอนุมัติแล้วและเคยเปิดรับงานสักครั้ง จะมี
`status` เป็น `'Online'`/`'Busy'` ตลอดไป — ค่าการอนุมัติที่ `rider-accounts.js`
เขียนลงไปถูกทับหายภายในสิบวินาที ส่วน `approval_status` อยู่ครบ

### 2. `Login.tsx:120` อ่านฟิลด์ที่ถูกทับได้ — ทำงานถูกด้วยอุบัติเหตุ

ด่าน `status === 'Pending'` ยังทำงานอยู่จริงวันนี้ แต่ด้วยเหตุผลบังเอิญ:
ไรเดอร์ที่ยัง `Pending` **ยังไม่เคยล็อกอินสำเร็จ** จึงไม่เคยมีโอกาสเขียน
presence ทับ ค่า `'Pending'` จาก `Register.tsx:95` เลยอยู่ครบ

ทันทีที่มีเส้นทางไหนทำให้ไรเดอร์เขียน `status` ได้ก่อนถูกอนุมัติ ด่านนี้จะเงียบ
และ **ไม่มีเทสไหนคุ้มมันอยู่** (ทั้งสามไฟล์ที่เกี่ยวข้องไม่มีเทส)

เทียบกับ `useRiderData.ts:81` ที่อ่าน `approval_status` — ตัวนั้นอ่านฟิลด์ที่
rules ตรึงไว้ จึงเชื่อถือได้จริง **สองด่านของแอปเดียวกันยืนอยู่บนพื้นคนละแบบ**

### 3. rules เชื่อ `approval_status` อย่างเดียว — นี่คือตัวตัดสิน

`database.rules.json` gate การเข้าถึง `jobs` ด้วย `approval_status` ที่ 4 จุด
(`:48`, `:64`, `:830`, `:831`) และ**ไม่เคยอ้าง `status` เลยสักที่**

แปลว่าฟิลด์ที่เป็น "ความจริงเชิงสิทธิ์" ของระบบคือ `approval_status` อยู่แล้ว
ส่วน `status` เป็นสำเนาที่ผู้ถูกควบคุมเขียนทับได้เอง

### 4. มีสามสำนวนของค่าเดียวกัน

| ที่ | รูปแบบ | ค่าเมื่อไม่มีข้อมูล |
|---|---|---|
| `actor.js:106-111` · `RiderManagement.tsx:87-94` | `Active` / `Pending` (ตัวใหญ่) | `'Pending'` |
| `hr-core.js:205,211` | `active` / `approved` (**ตัวเล็ก**) | `'approved'` |
| `rider-accounts.js:40-45` | `Active` / `Rejected` / `Suspended` | — |

`hr-core.js` เทียบกับสตริง `'approved'` ซึ่ง **ไม่มีผู้เขียนคนไหนในระบบเขียน
ค่านี้เลย** — ค่าที่เขียนจริงคือ `'Active'` → `.toLowerCase()` ได้ `'active'`
ไม่ใช่ `'approved'` ดังนั้น `riderOpen` (`:211`) จะเป็น `false` สำหรับไรเดอร์ที่
อนุมัติแล้วทุกคน และเป็น `true` เฉพาะไรเดอร์ที่**ไม่มี `approval_status` เลย**
(ตกไป default `'approved'`) ซึ่งกลับด้านกับที่ชื่อฟังก์ชันสัญญาไว้

> อยู่นอกขอบเขตงานนี้ (เป็น HR ไม่ใช่ auth ของแอปไรเดอร์) แต่บันทึกไว้เพราะเจอ
> ระหว่างไล่ผู้อ่าน — **ยังไม่ได้ยืนยันด้วยการรัน** อ่านจากโค้ดอย่างเดียว

---

## คำแนะนำ

**ให้ `approval_status` เป็นฟิลด์เดียวของ "สถานะการอนุมัติ" และปล่อยให้ `status`
เป็นฟิลด์ของ presence (`Online`/`Offline`/`Busy`) เท่านั้น** — เพราะ
`database.rules.json` ตัดสินสิทธิ์ด้วย `approval_status` อยู่แล้วทั้ง 4 จุด และ
มันเป็นฟิลด์เดียวในสองตัวที่ไรเดอร์เขียนทับเองไม่ได้ (`.validate` ที่ `:557-559`)
ส่วน `status` มีผู้เขียนที่ถี่ที่สุดคือแอปไรเดอร์เอง

**การแก้ที่เล็กที่สุดที่ได้ผล** (ไม่ได้ทำในงานนี้ — ต้องเคาะก่อน):
เปลี่ยน `Login.tsx:120` จาก `riderData.status === 'Pending'` เป็นการอ่าน
standing ผ่านนิยามเดียวกับฝั่ง server (`effectiveApprovalStatus`) แล้วบล็อกทุก
ค่าที่ไม่ใช่ `Active` — ซึ่งจะปิดช่องของ `Rejected`/`Suspended` ที่ด่านปัจจุบัน
ไม่ได้ตรวจไปด้วย และทำให้ทั้งสองด่านของแอปยืนบนฟิลด์เดียวกัน

*(หมายเหตุ: วันนี้ `Rejected`/`Suspended` ถูกกันด้วย `setAuthDisabled` +
`revokeRefreshTokens` ที่ `rider-accounts.js:146` อยู่แล้ว ด่านฝั่ง client จึงเป็น
ชั้นที่สอง ไม่ใช่ชั้นเดียว — แต่ชั้นที่สองที่อ่านฟิลด์ผิดก็ยังคือชั้นที่ไม่ทำงาน)*

**ห้ามทำ:** ถอด `status` ออกจาก `rider-accounts.js` ตอนนี้ — ยังมีผู้อ่านที่
fallback ไปหามันอยู่ 5 ที่ (`actor.js`, `RiderManagement`, `RiderPerformance`,
`RiderPerformanceDetail`, `index.js:5126`) สำหรับแถวเก่าที่ไม่มี
`approval_status` การเขียนสองรูปต้องอยู่ต่อจนกว่าจะ backfill ครบ
(กฎเดียวกับหัวข้อ "ย้าย writer: ถามว่าใครอ่านของเดิม" ใน CLAUDE.md)

---

## ยังไม่ได้ตรวจ

- ไม่ได้นับว่ามีกี่แถวใน production ที่ยังไม่มี `approval_status` (ตัวเลขนี้คือ
  สิ่งที่บอกว่า fallback ยังจำเป็นอยู่ไหม)
- ไม่ได้ยืนยันข้อ 4 (`hr-core.js` `'approved'`) ด้วยการรันจริง
- ไม่ได้ไล่ `bkk-frontend-next` ว่ามีคนอ่านสองฟิลด์นี้ไหม (โจทย์ระบุขอบเขตแค่
  `bkk-system` + rules)
