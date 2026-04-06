# BKK Rider App - Development Roadmap

> แผนพัฒนาแอปไรเดอร์ ระยะสั้น-กลาง-ยาว
> อัพเดทล่าสุด: 2026-04-06

---

## สถาปัตยกรรมปัจจุบัน (Current Architecture)

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  bkk-rider-app  │    │  bkk-frontend-   │    │   bkk-system    │
│  (React PWA)    │    │  next (Admin)    │    │   (Backend)     │
│                 │    │                  │    │                 │
│  - ไรเดอร์ใช้งาน │    │  - แอดมินจัดการ    │    │  - API / Logic   │
│  - ตรวจสภาพ     │    │  - QC อนุมัติ      │    │  - Cloud Funcs   │
│  - แชท/แจ้งเตือน │    │  - จัดการ Lead    │    │  - Cron Jobs     │
└────────┬────────┘    └────────┬─────────┘    └────────┬────────┘
         │                      │                       │
         └──────────────────────┼───────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │  Firebase RTDB        │
                    │  Firebase Auth        │
                    │  Firebase Storage     │
                    │  Firebase Cloud Msg   │
                    └───────────────────────┘
```

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite 5 |
| Styling | Tailwind CSS 3 |
| Database | Firebase Realtime Database |
| Auth | Firebase Auth (Email/Password) |
| Storage | Firebase Storage |
| Push | Firebase Cloud Messaging (FCM) |
| Functions | Firebase Cloud Functions v2 |
| PWA | Service Worker (manual) |

### Firebase Database Schema (ใช้ร่วม 3 repos)
```
├── jobs/{jobId}                    # ข้อมูลงาน (ใช้ร่วมทุก repo)
│   ├── status                      # สถานะงาน
│   ├── rider_id                    # ไรเดอร์ที่รับงาน
│   ├── uid                         # Customer UID
│   ├── devices/                    # รายการเครื่อง
│   ├── chats/{msgId}               # ข้อความแชท
│   ├── qc_logs/                    # ประวัติการอัพเดท
│   └── discrepancy_reports/        # รายงานข้อมูลไม่ตรง
│
├── riders/{riderId}                # ข้อมูลไรเดอร์
│   ├── name, bank, documents
│   ├── lat, lng, status            # ตำแหน่ง GPS
│   ├── fcm_tokens/{tokenKey}       # Push notification tokens
│   └── approval_status             # สถานะอนุมัติ
│
├── notifications/                  # แจ้งเตือนแอดมิน
├── transactions/{txId}             # ธุรกรรมการเงิน
├── withdrawals/{wdId}              # คำขอถอนเงิน
├── models/                         # ข้อมูลรุ่นมือถือ + ราคา
└── settings/
    ├── system/dispatch_mode        # manual | broadcast
    └── condition_sets/             # เงื่อนไขตรวจสภาพ
```

---

## ระยะสั้น (1-2 เดือน) - Foundation & Stability

เป้าหมาย: แก้ปัญหาพื้นฐาน, ทำให้ระบบมั่นคง, เตรียมรองรับ scale

### 1. Firebase Security Rules (ทุก repo)
**Priority: CRITICAL | ผู้รับผิดชอบ: bkk-system**
```
ปัจจุบัน: ไม่มี Security Rules ที่ชัดเจน
ปัญหา: ใครก็ตามที่มี Firebase config สามารถอ่าน/เขียนข้อมูลได้
```
- [ ] เขียน Firebase Security Rules สำหรับ `jobs/`, `riders/`, `notifications/`
- [ ] Rider อ่านได้เฉพาะงานที่ assign ให้ตัวเอง
- [ ] Rider แก้ไขได้เฉพาะ field ที่จำเป็น (status, chats, location)
- [ ] ป้องกัน direct write ไปยัง `transactions/` (ต้องผ่าน Cloud Function เท่านั้น)

| Repo | งาน |
|------|-----|
| bkk-system | เขียน/deploy Security Rules |
| bkk-rider-app | ทดสอบว่า rules ไม่ block การทำงานปกติ |
| bkk-frontend-next | ทดสอบว่า admin ยังทำงานได้ |

### 2. ย้าย Business Logic ไป Cloud Functions
**Priority: HIGH | ผู้รับผิดชอบ: bkk-system + bkk-rider-app**
```
ปัจจุบัน: Rider app เขียน status, rider_fee, completed_at ลง DB โดยตรง
ปัญหา: ไม่มี validation ฝั่ง server, rider สามารถแก้ราคาเองได้
```
- [ ] สร้าง Cloud Function: `acceptJob(jobId)` - validate แล้ว assign rider
- [ ] สร้าง Cloud Function: `updateJobStatus(jobId, status)` - validate status flow
- [ ] สร้าง Cloud Function: `completeJob(jobId)` - คำนวณ rider_fee ฝั่ง server
- [ ] สร้าง Cloud Function: `requestWithdraw(amount)` - validate balance ฝั่ง server
- [ ] Rider app เรียก Cloud Function แทน direct DB write

| Repo | งาน |
|------|-----|
| bkk-system | สร้าง Cloud Functions + validation logic |
| bkk-rider-app | เปลี่ยนจาก `update(ref(db))` เป็น `httpsCallable()` |
| bkk-frontend-next | (ไม่กระทบ ถ้า admin ยังใช้ direct write) |

### 3. Broadcast Job Race Condition
**Priority: HIGH | ผู้รับผิดชอบ: bkk-system**
```
ปัจจุบัน: dispatch_mode = 'broadcast' แต่ไม่มี lock mechanism
ปัญหา: 2 ไรเดอร์กดรับงานเดียวกันพร้อมกัน → ข้อมูลเสีย
```
- [ ] ใช้ Firebase Transaction หรือ Cloud Function กับ atomicity
- [ ] เพิ่ม `accepted_by` lock field + timestamp
- [ ] แสดง "งานถูกรับแล้ว" ถ้าไรเดอร์คนอื่นรับไปก่อน

| Repo | งาน |
|------|-----|
| bkk-system | สร้าง `acceptBroadcastJob` Cloud Function with transaction |
| bkk-rider-app | Handle "already taken" error gracefully |

### 4. Real-time Chat Improvements
**Priority: MEDIUM | ผู้รับผิดชอบ: bkk-rider-app + bkk-frontend-next**
```
ปัจจุบัน: แชทใช้งานได้แต่ขาด read receipt ฝั่ง admin
```
- [ ] **bkk-rider-app**: (Done) Auto mark read + notification deep link
- [ ] **bkk-frontend-next**: แสดงสถานะอ่านแล้ว/ยังไม่อ่านของไรเดอร์
- [ ] **bkk-frontend-next**: แสดง typing indicator
- [ ] **bkk-system**: Cloud Function ส่ง push notification ไปหาลูกค้า (ถ้ามีแอพลูกค้า)

### 5. Error Monitoring & Logging
**Priority: MEDIUM | ผู้รับผิดชอบ: ทุก repo**
- [ ] เพิ่ม Sentry หรือ Firebase Crashlytics สำหรับ error tracking
- [ ] Cloud Functions: structured logging → Cloud Logging
- [ ] สร้าง dashboard สำหรับ monitor errors

---

## ระยะกลาง (3-6 เดือน) - Feature Enhancement

เป้าหมาย: เพิ่มฟีเจอร์ที่ช่วยเพิ่มประสิทธิภาพและความเชื่อมั่น

### 6. Proof of Delivery (ถ่ายรูปยืนยัน)
**Priority: HIGH | ผู้รับผิดชอบ: bkk-rider-app + bkk-system**
```
ปัจจุบัน: ไรเดอร์กด "ส่งมอบเครื่อง" ได้โดยไม่ต้องมีหลักฐาน
```
- [ ] **bkk-rider-app**: เพิ่มขั้นตอนถ่ายรูปก่อนจบงาน (รับเครื่อง + ส่งมอบ)
- [ ] **bkk-system**: เก็บรูป proof ใน `jobs/{jobId}/proof_of_delivery/`
- [ ] **bkk-frontend-next**: แสดงรูป proof ในหน้า job detail

### 7. Customer Live Tracking
**Priority: MEDIUM | ผู้รับผิดชอบ: bkk-frontend-next + bkk-rider-app**
```
ปัจจุบัน: ตำแหน่งไรเดอร์เก็บใน riders/{id}/lat,lng แต่ลูกค้าดูไม่ได้
```
- [ ] **bkk-frontend-next**: สร้างหน้า `/track/{jobId}` สำหรับลูกค้า
- [ ] **bkk-rider-app**: เพิ่ม GPS accuracy + เก็บ heading/speed
- [ ] **bkk-system**: Security rule ให้ลูกค้าดู location ได้เฉพาะ status = Heading to Customer
- [ ] แสดง ETA โดยประมาณ (Google Directions API)

### 8. Rider Performance Dashboard
**Priority: MEDIUM | ผู้รับผิดชอบ: bkk-rider-app + bkk-system**
- [ ] **bkk-system**: Aggregate ข้อมูล: จำนวนงาน, เวลาเฉลี่ย, rating, cancel rate
- [ ] **bkk-rider-app**: แสดง dashboard ใน Profile tab
- [ ] **bkk-frontend-next**: แสดง rider performance ในหน้า rider management

### 9. Job Acceptance Timeout
**Priority: MEDIUM | ผู้รับผิดชอบ: bkk-system + bkk-rider-app**
```
ปัจจุบัน: งาน broadcast อยู่ได้ไม่จำกัดเวลา
```
- [ ] **bkk-system**: Cloud Function auto-reassign ถ้าไม่มีคนรับภายใน X นาที
- [ ] **bkk-rider-app**: แสดง countdown timer บน IncomingJobCard
- [ ] **bkk-frontend-next**: ตั้งค่า timeout ได้จากหน้า settings

### 10. Estimated Earnings Before Accept
**Priority: LOW | ผู้รับผิดชอบ: bkk-system + bkk-rider-app**
- [ ] **bkk-system**: คำนวณ estimated rider_fee ตาม job type/distance
- [ ] **bkk-rider-app**: แสดง estimated fee บน IncomingJobCard ก่อนกดรับ
- [ ] **bkk-frontend-next**: ตั้งค่าสูตรคำนวณค่าจ้างได้

### 11. Migrate to Proper Backend API
**Priority: HIGH | ผู้รับผิดชอบ: bkk-system**
```
ปัจจุบัน: ทุก repo เขียน Firebase RTDB ตรงๆ
ปัญหา: ไม่มี centralized validation, ยากต่อการ debug
```
- [ ] สร้าง REST API layer ด้วย Cloud Functions หรือ backend แยก
- [ ] Endpoint สำหรับ: job CRUD, rider actions, withdrawals, notifications
- [ ] เพิ่ม API key / JWT auth สำหรับแต่ละ service
- [ ] ค่อยๆ migrate ทีละ endpoint (ไม่ต้อง big bang)

---

## ระยะยาว (6-12 เดือน) - Scale & Platform

เป้าหมาย: รองรับ scale, เพิ่ม platform ใหม่, เปิดให้ลูกค้าใช้งาน

### 12. Customer Mobile App
**Priority: HIGH | ผู้รับผิดชอบ: repo ใหม่**
```
ปัจจุบัน: ลูกค้าใช้ bkk-frontend-next (web) ในการสร้าง order
อนาคต: ลูกค้ามีแอพ mobile สำหรับ track + แชท + รับ notification
```
- [ ] สร้าง customer PWA/app (อาจใช้ React Native หรือ PWA เหมือน rider)
- [ ] Real-time tracking, chat, push notification
- [ ] ประวัติการ trade-in, สถานะการจ่ายเงิน

### 13. Rider Native App (React Native / Flutter)
**Priority: MEDIUM | ผู้รับผิดชอบ: repo ใหม่**
```
ปัจจุบัน: PWA ทำงานได้แต่มีข้อจำกัด (background GPS, camera access)
```
- [ ] ย้ายเป็น React Native เพื่อ native GPS + camera
- [ ] Background location tracking แม้ปิดแอพ
- [ ] Biometric auth แทน PIN
- [ ] Offline-first with sync queue

### 14. Payment Gateway Integration
**Priority: HIGH | ผู้รับผิดชอบ: bkk-system**
```
ปัจจุบัน: การจ่ายเงินทำ manual (แอดมินโอนเอง)
```
- [ ] เชื่อมต่อ payment gateway (PromptPay API / bank transfer API)
- [ ] Auto-payout เมื่อ job complete + QC approved
- [ ] Webhook รับ payment confirmation
- [ ] Rider app แสดง payment status real-time

### 15. Database Migration (RTDB → Firestore)
**Priority: MEDIUM | ผู้รับผิดชอบ: ทุก repo**
```
ปัจจุบัน: Firebase Realtime Database
ปัญหา: ไม่มี compound query, ไม่มี pagination ที่ดี, ไม่มี offline sync
```
- [ ] Plan migration strategy (dual-write period)
- [ ] Migrate ทีละ collection: jobs → riders → transactions
- [ ] ใช้ Firestore offline persistence (ดีกว่า RTDB)
- [ ] อัพเดทท Cloud Functions triggers

### 16. Multi-Branch Support
**Priority: LOW | ผู้รับผิดชอบ: ทุก repo**
- [ ] ระบบ branch/zone management
- [ ] Rider assignment ตาม zone
- [ ] Dashboard แยกตาม branch
- [ ] Inventory tracking per branch

### 17. Analytics & Business Intelligence
**Priority: LOW | ผู้รับผิดชอบ: bkk-system + bkk-frontend-next**
- [ ] Google Analytics / Mixpanel integration
- [ ] สร้าง admin dashboard: revenue, conversion, rider utilization
- [ ] BI reports: peak hours, popular models, area heat map

---

## Cross-Repo Dependency Map

```
Task                          │ rider-app │ frontend │ system │
──────────────────────────────┼───────────┼──────────┼────────┤
Firebase Security Rules       │   test    │   test   │  LEAD  │
Cloud Functions Migration     │   call    │          │  LEAD  │
Broadcast Race Condition      │   UI      │          │  LEAD  │
Chat Read Receipts            │   DONE    │   LEAD   │        │
Proof of Delivery             │   LEAD    │   show   │  store │
Customer Live Tracking        │   GPS     │   LEAD   │  rules │
Rider Performance Dashboard   │   LEAD    │   show   │  data  │
Job Timeout                   │   UI      │   config │  LEAD  │
API Layer                     │   call    │   call   │  LEAD  │
Payment Integration           │   show    │   show   │  LEAD  │
```

## Shared Conventions (ข้อตกลงร่วม)

### Job Status Flow (ใช้ร่วมทุก repo)
```
Active Leads → Assigned → Accepted → Heading to Customer → Arrived
→ Being Inspected → QC Review → Price Accepted/Revised Offer
→ Payout Processing → Paid → Waiting for Handover → In-Transit
→ Pending QC → Completed
                    ↘ Cancelled (ได้ทุกจุดก่อน Paid)
```

### Commit Convention
```
feat: ฟีเจอร์ใหม่
fix: แก้บัก
refactor: ปรับโครงสร้างโค้ด
chore: งาน maintenance
docs: เอกสาร
```

### Branch Strategy
```
main          ← production
develop       ← staging (merge PRs here)
feat/xxx      ← feature branches
fix/xxx       ← bug fix branches
```

---

## Priority Matrix

| Priority | Impact | Effort | Tasks |
|----------|--------|--------|-------|
| P0 - NOW | High | Low-Med | Security Rules, Race Condition Fix |
| P1 - Next Sprint | High | Med | Cloud Functions Migration, Proof of Delivery |
| P2 - This Quarter | Med | Med | Customer Tracking, Performance Dashboard, Job Timeout |
| P3 - Next Quarter | Med | High | API Layer, Payment Integration |
| P4 - Long Term | High | Very High | Native App, Firestore Migration, Customer App |
