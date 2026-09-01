// src/utils/geolocation.ts — ขอพิกัดแบบที่ "ตอบเสมอ" ไม่ว่าจะได้หรือไม่ได้
//
// ทำไมต้องมีไฟล์นี้: `navigator.geolocation.getCurrentPosition` เป็น API แบบ
// callback ที่ล้มเงียบได้หลายทาง — ลูกค้าปฏิเสธสิทธิ์, GPS หาสัญญาณไม่เจอ,
// หรือ (ที่แย่ที่สุด) เบราว์เซอร์ไม่เรียก callback ตัวไหนเลยเมื่อผู้ใช้ปล่อย
// prompt ค้างไว้ ผลคือโค้ดที่วางงานสำคัญไว้ "ข้างใน" success callback จะไม่ทำงาน
// เลยโดยไม่มี error — ซึ่งคือสาเหตุที่ checkpoint ของงานหายเป็นช่วงๆ
//
// ตัวนี้จึง **ไม่ reject และไม่ค้าง**: คืน { gps: null, status: <เหตุผล> } เสมอ
// เมื่อขอพิกัดไม่ได้ ให้ผู้เรียกเดินหน้าต่อพร้อมข้อมูลว่าทำไมถึงไม่มีพิกัด

export type GpsStatus = 'ok' | 'denied' | 'timeout' | 'unavailable' | 'unsupported';

export interface GpsFix {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface GpsCapture {
  gps: GpsFix | null;
  status: GpsStatus;
}

/** แปลง GeolocationPositionError.code เป็นเหตุผลที่เก็บลง DB ได้ */
export function gpsStatusFromError(code: number | undefined): GpsStatus {
  if (code === 1) return 'denied';       // PERMISSION_DENIED
  if (code === 2) return 'unavailable';  // POSITION_UNAVAILABLE
  if (code === 3) return 'timeout';      // TIMEOUT
  return 'unavailable';
}

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * ขอพิกัดครั้งเดียว — resolve เสมอภายใน timeoutMs
 *
 * นาฬิกาของเราเองซ้อนกับ `timeout` ของ API โดยตั้งใจ: ตัวเลือก `timeout` ของ
 * เบราว์เซอร์เชื่อถือได้เกือบทุกที่ แต่ไม่ใช่ทุกที่ (prompt ที่ผู้ใช้ไม่ตอบ
 * ไม่นับเป็น timeout ในบางเบราว์เซอร์) — งานที่รอผลลัพธ์นี้อยู่ต้องเดินต่อได้เสมอ
 */
export function capturePosition(
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  geo: Geolocation | undefined = typeof navigator !== 'undefined' ? navigator.geolocation : undefined,
): Promise<GpsCapture> {
  if (!geo || typeof geo.getCurrentPosition !== 'function') {
    return Promise.resolve({ gps: null, status: 'unsupported' });
  }
  return new Promise<GpsCapture>((resolve) => {
    let settled = false;
    const settle = (result: GpsCapture) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => settle({ gps: null, status: 'timeout' }), timeoutMs);

    try {
      geo.getCurrentPosition(
        (pos) => settle({
          gps: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            ...(typeof pos.coords.accuracy === 'number' ? { accuracy: pos.coords.accuracy } : {}),
          },
          status: 'ok',
        }),
        (err) => settle({ gps: null, status: gpsStatusFromError(err?.code) }),
        { enableHighAccuracy: true, timeout: timeoutMs },
      );
    } catch {
      // เบราว์เซอร์บางตัว throw ทันทีเมื่อเรียกจาก context ที่ไม่ใช่ https
      settle({ gps: null, status: 'unavailable' });
    }
  });
}
