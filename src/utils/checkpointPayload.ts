// src/utils/checkpointPayload.ts — ประกอบแถว checkpoint (pure)
//
// แยกออกจาก checkpoints.ts ด้วยเหตุผลเดียวกับ jobTimeline.ts: ตัวที่เขียน DB
// import firebase ส่วนกติกาการประกอบข้อมูลต้องเทสได้โดยไม่ init app จริง
//
// กติกาที่ไฟล์นี้ถือไว้:
//   - แถวถูกสร้าง **เสมอ** เมื่อ status เป็นจุดเช็คอิน ไม่ว่าจะมีพิกัดหรือไม่
//   - ไม่มีพิกัด = ไม่มีคีย์ lat/lng (อ่านกลับได้เป็น null) **ห้ามเติม 0,0
//     และห้ามเติมพิกัดสาขาแทน** — ศูนย์คือพิกัดกลางมหาสมุทร ส่วนพิกัดสาขาคือ
//     คำโกหกที่ทำให้ระยะห่างเป็น 0 เมตรและ is_within_zone เป็น true เสมอ
//   - `gps_status` บอกว่าทำไมถึงไม่มีพิกัด — แถวเก่าก่อนฟีเจอร์นี้ไม่มีคีย์นี้
//     ซึ่งต่างจาก 'denied'/'timeout' และต้องอ่านออกว่าต่างกัน
import type { GpsFix, GpsStatus } from './geolocation';
import type { CheckpointStage } from './jobTimeline';

export interface CheckpointTarget {
  lat: number;
  lng: number;
  label: string;
}

export interface BuildCheckpointArgs {
  riderId: string;
  at: number;
  gps: GpsFix | null;
  gpsStatus: GpsStatus;
  target: CheckpointTarget | null;
  thresholdM: number;
}

export interface CheckpointRow {
  at: number;
  rider_id: string;
  gps_status: GpsStatus;
  lat?: number;
  lng?: number;
  accuracy?: number;
  target?: CheckpointTarget;
  distance_m?: number;
  is_within_zone?: boolean;
  zone_m?: number;
}

/** ระยะห่างจากเป้า (เมตร) — Haversine, แม่นพอในระดับละแวกบ้าน */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function buildCheckpointRow(args: BuildCheckpointArgs): {
  row: CheckpointRow;
  distanceM: number | null;
  withinZone: boolean | null;
} {
  const { gps, target } = args;

  // เทียบระยะได้ก็ต่อเมื่อมีทั้งพิกัดของเราและพิกัดเป้า — ขาดฝั่งไหนก็ไม่มี
  // ตัวเลข ไม่ใช่ตัวเลขที่แปลว่า "ผ่าน"
  const distanceM = gps && target
    ? distanceMeters(gps.lat, gps.lng, target.lat, target.lng)
    : null;
  const withinZone = distanceM === null ? null : distanceM <= args.thresholdM;

  const row: CheckpointRow = {
    at: args.at,
    rider_id: args.riderId,
    gps_status: args.gpsStatus,
  };
  if (gps) {
    row.lat = gps.lat;
    row.lng = gps.lng;
    if (typeof gps.accuracy === 'number') row.accuracy = gps.accuracy;
  }
  // เก็บ target ไว้เฉพาะตอนที่มันถูกใช้เทียบจริง — target ที่ลอยอยู่โดยไม่มี
  // distance_m อ่านย้อนหลังแล้วชวนเข้าใจผิดว่าเคยเทียบแล้วผ่าน
  if (target && distanceM !== null) {
    row.target = target;
    row.distance_m = distanceM;
    row.is_within_zone = withinZone as boolean;
    row.zone_m = args.thresholdM;
  }
  return { row, distanceM, withinZone };
}

/** ป้ายไทยของเหตุผลที่ไม่มีพิกัด — ใช้ทั้ง toast และหน้าแอดมิน */
export const GPS_STATUS_LABEL_TH: Record<GpsStatus, string> = {
  ok: 'มีพิกัด',
  denied: 'ไม่ได้อนุญาตตำแหน่ง',
  timeout: 'หาสัญญาณไม่ทัน',
  unavailable: 'หาตำแหน่งไม่ได้',
  unsupported: 'เครื่องไม่รองรับตำแหน่ง',
};

export type { CheckpointStage };
