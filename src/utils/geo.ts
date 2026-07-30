// src/utils/geo.ts
//
// Geolocation ที่ใช้ได้ทั้งเว็บและ iOS app
//
// ทำไมต้อง wrap: `navigator.geolocation` ใน WKWebView ของ Capacitor ขอสิทธิ์
// ผ่าน CoreLocation ไม่ได้เอง (prompt ไม่ขึ้น / คืน POSITION_UNAVAILABLE) —
// บน native ต้องเรียกผ่าน @capacitor/geolocation ที่คุยกับ CLLocationManager ตรง ๆ
// ส่วนบนเว็บยังใช้ navigator.geolocation เหมือนเดิมทุกประการ
//
// ตำแหน่งไรเดอร์คือหัวใจของระบบ (แอดมินติดตาม, geofence เช็คอินใน checkpoints.ts,
// ลูกค้าเห็นไรเดอร์ตอน Heading to Customer) — ห้ามให้ path ใดเงียบหาย
import { Geolocation } from '@capacitor/geolocation';
import { isNativeApp } from '../native';

export interface GeoPosition {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
  timestamp: number;
}

/** code ใช้เลขชุดเดียวกับ GeolocationPositionError: 1=ถูกปฏิเสธสิทธิ์ 2=หาตำแหน่งไม่ได้ 3=timeout */
export interface GeoError {
  code: number;
  message: string;
}

export interface GeoOptions {
  enableHighAccuracy?: boolean;
  maximumAge?: number;
  timeout?: number;
}

const PERMISSION_DENIED = 1;
const POSITION_UNAVAILABLE = 2;

const toGeoError = (err: unknown): GeoError => {
  const message =
    (err as { message?: string } | null)?.message || (typeof err === 'string' ? err : 'Unknown geolocation error');
  // plugin ฝั่ง iOS โยน error เป็นข้อความ ("Location services are not enabled",
  // "User denied location permission") ไม่มี code ให้ — map เองด้วย keyword
  const denied = /denied|not authorized|permission|restricted/i.test(message);
  return { code: denied ? PERMISSION_DENIED : POSITION_UNAVAILABLE, message };
};

const fromNativePosition = (pos: {
  coords: { latitude: number; longitude: number; accuracy: number };
  timestamp: number;
}): GeoPosition => ({
  coords: {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
  },
  timestamp: pos.timestamp,
});

const ensureNativePermission = async (): Promise<void> => {
  const status = await Geolocation.checkPermissions();
  if (status.location === 'granted' || status.coarseLocation === 'granted') return;
  const requested = await Geolocation.requestPermissions({ permissions: ['location'] });
  if (requested.location !== 'granted' && requested.coarseLocation !== 'granted') {
    throw new Error('User denied location permission');
  }
};

/** อ่านตำแหน่งครั้งเดียว (signature เดียวกับ navigator.geolocation.getCurrentPosition) */
export const getCurrentPosition = (
  onSuccess: (pos: GeoPosition) => void,
  onError?: (err: GeoError) => void,
  options: GeoOptions = {},
): void => {
  if (!isNativeApp()) {
    navigator.geolocation.getCurrentPosition(
      (pos) => onSuccess(fromNativePosition(pos)),
      (err) => onError?.({ code: err.code, message: err.message }),
      options,
    );
    return;
  }

  (async () => {
    try {
      await ensureNativePermission();
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: options.enableHighAccuracy ?? true,
        maximumAge: options.maximumAge,
        timeout: options.timeout ?? 15000,
      });
      onSuccess(fromNativePosition(pos));
    } catch (err) {
      onError?.(toGeoError(err));
    }
  })();
};

/**
 * ติดตามตำแหน่งต่อเนื่อง — คืน "ฟังก์ชันหยุดติดตาม" แทน watch id ตัวเลข
 * เพราะฝั่ง native id เป็น string และได้มาแบบ async
 */
export const watchPosition = (
  onSuccess: (pos: GeoPosition) => void,
  onError?: (err: GeoError) => void,
  options: GeoOptions = {},
): (() => void) => {
  if (!isNativeApp()) {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => onSuccess(fromNativePosition(pos)),
      (err) => onError?.({ code: err.code, message: err.message }),
      options,
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }

  let watchId: string | null = null;
  let cancelled = false;

  (async () => {
    try {
      await ensureNativePermission();
      const id = await Geolocation.watchPosition(
        {
          enableHighAccuracy: options.enableHighAccuracy ?? true,
          maximumAge: options.maximumAge,
          timeout: options.timeout,
        },
        (pos, err) => {
          if (err) {
            onError?.(toGeoError(err));
            return;
          }
          if (pos) onSuccess(fromNativePosition(pos));
        },
      );
      // ถ้า cleanup ถูกเรียกไปแล้วระหว่างรอ await ให้เคลียร์ทิ้งทันที
      if (cancelled) {
        Geolocation.clearWatch({ id }).catch(() => undefined);
        return;
      }
      watchId = id;
    } catch (err) {
      onError?.(toGeoError(err));
    }
  })();

  return () => {
    cancelled = true;
    if (watchId) {
      Geolocation.clearWatch({ id: watchId }).catch(() => undefined);
      watchId = null;
    }
  };
};
