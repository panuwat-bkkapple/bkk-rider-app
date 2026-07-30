# BKK Rider

แอปไรเดอร์ของ BKK APPLE — รับงาน, นำทางไปหาลูกค้า, ตรวจสภาพเครื่อง, KYC,
จ่ายเงิน และปิดงาน

Stack: Vite + React 18 + TypeScript + Tailwind + Firebase (RTDB, Auth, Storage, FCM)
ปล่อยเป็น 2 ช่องทางจาก codebase เดียว:

- **เว็บ / PWA** — Firebase Hosting (target `rider`), deploy อัตโนมัติเมื่อ push เข้า `main`
- **iOS app** — Capacitor ห่อ bundle ก้อนเดิม ปล่อยผ่าน TestFlight / App Store
  (ดู [`docs/ios-app.md`](docs/ios-app.md))

## เริ่มพัฒนา

```bash
npm ci
cp .env.example .env   # เติมค่า Firebase ของจริง
npm run dev
```

| คำสั่ง | ทำอะไร |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` | typecheck + build ลง `dist/` |
| `npm run test` | vitest |
| `npm run lint` | eslint |
| `npm run ios:sync` | build เว็บ แล้ว sync เข้า Xcode project |
| `npm run ios:open` | เปิด Xcode |

## Deploy

- **Hosting + Cloud Functions:** push เข้า `main` → GitHub Actions
  (`.github/workflows/firebase-hosting-deploy.yml`) — ต้องเช็คว่า workflow ผ่าน
  ก่อนบอกให้ทีมทดสอบ
- **Preview channel:** รัน workflow `Preview Deploy (manual)` เอง
- **iOS:** ต้อง archive + อัปโหลดจาก Xcode ทุกครั้งที่แก้โค้ดเว็บ
  (bundle ฝังอยู่ในแอป) — ขั้นตอนเต็มอยู่ใน [`docs/ios-app.md`](docs/ios-app.md)

## จุดที่ต้องระวัง

- **Cloud Functions ชื่อห้ามชนกับ repo อื่น** — Firebase identify ด้วย
  `{region}/{name}` ระดับ project ไม่ได้แยกตาม codebase ถ้าตั้งชื่อซ้ำกับ
  `bkk-system` การ deploy ฝั่งหนึ่งจะทับอีกฝั่งแล้ว notification หายสลับกัน
- **ห้าม subscribe `/jobs` ทั้งก้อน** — ใช้ `useRiderJobs` (query ตาม `rider_id`
  + pool statuses) ทุกครั้ง ค่า download RTDB คิดตามจริง
- **ข้อมูลงานใช้ร่วมกัน 3 repo** (`bkk-system`, `bkk-frontend-next`, repo นี้)
  ก่อนแก้ฟิลด์ใน Firebase ต้องไล่ดูคนอ่าน/คนเขียนให้ครบทุก repo
- **Push payload มี 2 แบบ** — web (data-only) กับ native (มี `notification`)
  แยกด้วยฟิลด์ `platform` ของ token ดู `functions/src/index.ts`
