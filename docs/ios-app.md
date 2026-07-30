# BKK Rider — iOS App (Capacitor)

แอป iOS ของไรเดอร์ คือ **แอปตัวเดียวกับเว็บ** ห่อด้วย [Capacitor](https://capacitorjs.com/)
โค้ด React/TypeScript ใน `src/` ถูก build เป็น bundle ก้อนเดิม แล้วฝังลงในแอป
(`ios/App/App/public`) ไม่มีการ fork โค้ด ไม่มี UI ชุดที่สอง

## ทำไมต้องมีแอป native (ไม่ใช้ PWA อย่างเดียว)

| เรื่อง | PWA บน iOS | แอป native |
| --- | --- | --- |
| Push notification | ต้อง Add to Home Screen ก่อน สิทธิ์หลุดง่าย token หมดอายุเงียบ ๆ | APNs ตรง ๆ ผ่าน Firebase เชื่อถือได้ |
| ตำแหน่ง (GPS) | ขอสิทธิ์ผ่าน Safari สะดุดบ่อย ทำงานเบื้องหลังไม่ได้ | CoreLocation ผ่าน `@capacitor/geolocation` |
| การติดตั้ง | ต้องสอนไรเดอร์กด "เพิ่มไปยังหน้าจอโฮม" | ติดตั้งจาก TestFlight / App Store |
| ไอคอน + splash | ตามที่ Safari ให้ | ของแอปจริง |

เว็บ/PWA เดิม **ยังใช้งานได้ตามปกติทุกอย่าง** โค้ดทุกจุดที่แตะ native เช็ค
`isNativeApp()` ก่อนเสมอ (ดู `src/native/index.ts`)

## โครงสร้างที่เพิ่มเข้ามา

```
capacitor.config.ts             # ตั้งค่า appId / status bar / splash / push
assets/icon.png                 # ต้นฉบับไอคอน 1024x1024 (ใช้ generate)
assets/splash*.png              # ต้นฉบับ splash 2732x2732
src/native/index.ts             # isNativeApp(), initNativeShell(), onAppResume()
src/native/push.ts             # ลงทะเบียน APNs/FCM ฝั่ง native
src/utils/geo.ts                # geolocation ที่ใช้ได้ทั้งเว็บและ native
ios/                            # Xcode project (Swift Package Manager ไม่ใช้ CocoaPods)
```

ฝั่ง backend: `functions/src/index.ts` แยกวิธีส่ง push ตามฟิลด์ `platform`
ของแต่ละ token (`riders/{id}/fcm_tokens/{deviceId}/platform`)

- `web` → ส่ง **data-only** ให้ service worker วาด notification เอง (ถ้าใส่
  `notification` ไปด้วย iOS PWA จะเด้ง 2 อันซ้อน)
- `ios` / `android` → ส่งพร้อม `notification` + `aps.alert` ไม่งั้นแอป native
  จะไม่แสดงอะไรเลยตอนอยู่เบื้องหลัง

token เก่าที่ไม่มีฟิลด์ `platform` ถือเป็น `web` เหมือนเดิม → ไรเดอร์ที่ยังใช้ PWA
ไม่ได้รับผลกระทบ

## สิ่งที่ต้องมีก่อนเริ่ม

1. เครื่อง Mac + Xcode 16 ขึ้นไป (iOS deployment target 15.0)
2. บัญชี **Apple Developer Program** (ปีละ 99 USD) — จำเป็นสำหรับ push และ TestFlight
3. สิทธิ์แอดมินใน Firebase project `bkk-apple-tradein`

## ตั้งค่าครั้งแรก

### 1. เพิ่ม iOS app ใน Firebase

Firebase Console → Project settings → Add app → iOS

- **Bundle ID: `com.bkkapple.rider`** (ต้องตรงกับ `appId` ใน `capacitor.config.ts`
  และ `PRODUCT_BUNDLE_IDENTIFIER` ใน Xcode)
- ดาวน์โหลด `GoogleService-Info.plist` มาวางที่ **`ios/App/App/GoogleService-Info.plist`**

> ไฟล์นี้ **ไม่ได้ commit** (อยู่ใน `.gitignore`) เพราะผูกกับ App ID ของแต่ละ
> environment แต่ Xcode project อ้างถึงไฟล์นี้ไว้แล้ว — ถ้าไม่มีไฟล์ build จะ
> fail ทันทีพร้อมข้อความ "Build input file cannot be found" (ตั้งใจให้พังตั้งแต่
> ตอน build ดีกว่าไปแครชตอนเปิดแอป)

### 2. อัปโหลด APNs Auth Key เข้า Firebase

1. [Apple Developer](https://developer.apple.com/account/resources/authkeys/list) →
   Keys → **+** → ติ๊ก **Apple Push Notifications service (APNs)** → ดาวน์โหลด `.p8`
   (ดาวน์โหลดได้ครั้งเดียว เก็บให้ดี)
2. จด **Key ID** และ **Team ID**
3. Firebase Console → Project settings → **Cloud Messaging** → iOS app →
   **APNs Authentication Key** → อัปโหลด `.p8` + Key ID + Team ID

ถ้าไม่ทำขั้นนี้ push จะไม่ถึงเครื่องเลย (แต่แอปเปิดได้ปกติ)

### 3. Build และเปิดใน Xcode

```bash
npm ci
npm run ios:sync      # = npm run build && cap sync ios
npm run ios:open      # เปิด Xcode
```

`cap sync` จะ copy `dist/` เข้า `ios/App/App/public` และ generate
`Package.swift` + symlinks ของ plugin ใหม่ทุกครั้ง — **ต้องรันทุกครั้งที่แก้โค้ด
เว็บ** ไม่งั้นแอปยังเป็นเวอร์ชันเก่า

### 4. ตั้งค่า Signing ใน Xcode

Xcode → target **App** → **Signing & Capabilities**

- ติ๊ก *Automatically manage signing* แล้วเลือก **Team** ของบริษัท
- Capability **Push Notifications** ควรขึ้นมาเองจาก `App/App.entitlements`
  (`aps-environment`) ถ้าไม่ขึ้นให้กด **+ Capability** เพิ่มเอง
- Capability **Background Modes → Remote notifications** มาจาก `UIBackgroundModes`
  ใน `Info.plist` แล้ว

### 5. รันบนเครื่องจริง

เสียบ iPhone → เลือกเครื่องใน Xcode → **Run**

Push notification **ทดสอบบน simulator ไม่ได้** ต้องใช้เครื่องจริงเท่านั้น

## ปล่อยเวอร์ชันใหม่ (TestFlight / App Store)

1. แก้เลขเวอร์ชันใน Xcode → target App → General
   - **Version** (`MARKETING_VERSION`) เช่น `1.0.1` — เลขที่ผู้ใช้เห็น
   - **Build** (`CURRENT_PROJECT_VERSION`) ต้อง **เพิ่มขึ้นเสมอ** ทุกครั้งที่อัปโหลด
2. `npm run ios:sync` (อย่าลืม — ไม่งั้น bundle ในแอปเป็นของเก่า)
3. Xcode → Product → **Archive** (เลือก destination เป็น *Any iOS Device*)
4. Organizer → **Distribute App** → App Store Connect → Upload
5. App Store Connect → TestFlight → เพิ่มไรเดอร์เป็น tester

### ข้อควรระวังตอนส่งรีวิว App Store

- **ต้องให้บัญชีทดสอบ** (อีเมล + รหัส + PIN ของไรเดอร์ตัวอย่าง) ในช่อง
  *App Review Information* ไม่งั้นโดน reject เพราะเข้าแอปไม่ได้
- แจ้งใน review notes ว่าเป็นแอปสำหรับพนักงาน/คู่ค้าของบริษัท (rider ที่ลงทะเบียนแล้ว
  เท่านั้น) — ถ้าเป็นแอปใช้ภายในองค์กรล้วน พิจารณา **Apple Business Manager /
  Custom App** แทนการวางขายสาธารณะ
- **Privacy nutrition label** ต้องประกาศให้ครบ: Location (precise, app functionality),
  Photos, Contact info, User content, Identifiers
- คำอธิบายสิทธิ์ทั้งหมดอยู่ใน `ios/App/App/Info.plist`
  (`NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription`,
  `NSPhotoLibraryUsageDescription`) — แก้ข้อความได้ที่นั่น

### อัปเดตโค้ดเว็บ = ต้องส่งบิลด์ใหม่

bundle ถูกฝังในแอป (ไม่ได้ชี้ไปที่ URL ของ Firebase Hosting) ดังนั้นการแก้ React
ต้อง archive + อัปโหลดใหม่ทุกครั้ง

ทำไมไม่ชี้ไป URL: `server.url` ใน `capacitor.config.ts` ทำให้แอปกลายเป็น
web wrapper ล้วน ซึ่งเสี่ยงโดน Apple reject ตาม guideline 4.2 (Minimum
Functionality) และแอปจะพังทันทีเมื่อเน็ตหลุด — ไรเดอร์ทำงานนอกสถานที่ ยอมรับไม่ได้

## CI

`.github/workflows/ios-build-check.yml` build แบบ unsigned บน simulator เพื่อกัน
เปลือก native พังเงียบ ๆ — รันเมื่อกดเอง (workflow_dispatch) หรือมี PR ที่แตะ
`ios/**`, `capacitor.config.ts`, `src/native/**`

ต้องมี secret เพิ่ม 1 ตัว:

```bash
base64 -i ios/App/App/GoogleService-Info.plist | pbcopy
# วางลง GitHub → Settings → Secrets → GOOGLE_SERVICE_INFO_PLIST_BASE64
```

workflow นี้ **ไม่ได้ deploy อะไร** การอัปโหลด TestFlight ยังทำจาก Xcode

## แก้ปัญหาที่เจอบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
| --- | --- |
| แอปเปิดแล้วแครชทันที | ไม่มี `GoogleService-Info.plist` ในบันเดิล — plugin เรียก `FirebaseApp.configure()` ไม่ได้ |
| Build fail "input file cannot be found" | เหมือนข้างบน วางไฟล์ที่ `ios/App/App/GoogleService-Info.plist` |
| ไม่ได้ push เลย | ยังไม่อัปโหลด APNs key เข้า Firebase / ทดสอบบน simulator / ไรเดอร์กด "ไม่อนุญาต" ตอนขอสิทธิ์ |
| push มาแต่ไม่มีเสียง-ไม่ขึ้น banner | token ถูกบันทึกเป็น `platform: "web"` — ตรวจ `riders/{id}/fcm_tokens/*/platform` ใน RTDB |
| แตะ notification แชทแล้วไม่เปิดห้องแชท | payload ต้องมี `type: "chat"` + `jobId` (ดู `onNewChatMessage` ใน functions) |
| หน้าจอถูก status bar ทับ | `StatusBar.overlaysWebView` ต้องเป็น `false` ใน `capacitor.config.ts` |
| ปุ่มล่างโดนแถบ home indicator บัง | ใช้ class `.pb-safe` / `.pb-safe-compact` (นิยามใน `src/index.css`) |
| แก้โค้ดแล้วแอปไม่เปลี่ยน | ลืม `npm run ios:sync` |
| อัปโหลดรูปขึ้น Firebase Storage ไม่ได้ | origin ของ WKWebView คือ `capacitor://localhost` — ถ้าเจอ CORS ต้องเพิ่ม origin นี้ใน CORS config ของ bucket |

## หมายเหตุเรื่อง dependency

`@capacitor-firebase/messaging` ประกาศ optional peer เป็น `firebase@^12` แต่แอปนี้
ใช้ `firebase@^10` (เวอร์ชันเดียวกับอีก 2 repo) จึงมี `overrides` ใน `package.json`
บังคับให้ resolve เป็นเวอร์ชันของ root — ฝั่ง iOS ไม่ได้ใช้ firebase JS SDK ของ
plugin เลย (มันคุยกับ Firebase iOS SDK ผ่าน Swift โดยตรง) การ override จึงปลอดภัย
