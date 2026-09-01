// เทสของ capturePosition — สัญญาข้อเดียวที่ทั้งฟีเจอร์พึ่งอยู่คือ
// "resolve เสมอ ไม่ reject ไม่ค้าง"
//
// เคสที่สำคัญที่สุดคือเคสสุดท้าย: เบราว์เซอร์ที่ **ไม่เรียก callback ตัวไหนเลย**
// (ผู้ใช้เปิด prompt ค้างไว้ไม่ตอบ) ซึ่งเป็นรูปที่ทำให้ของเดิมเงียบสนิท —
// success callback ไม่ทำงาน error callback ก็ไม่ทำงาน แถว checkpoint จึงไม่เกิด
import { describe, it, expect, vi } from 'vitest';
import { capturePosition } from './geolocation';

const okGeo = (coords: { latitude: number; longitude: number; accuracy?: number }) =>
  ({ getCurrentPosition: (ok: any) => ok({ coords }) }) as unknown as Geolocation;

const failGeo = (code: number) =>
  ({ getCurrentPosition: (_ok: any, err: any) => err({ code }) }) as unknown as Geolocation;

const silentGeo = () => ({ getCurrentPosition: () => { /* ไม่เรียก callback เลย */ } }) as unknown as Geolocation;

describe('capturePosition', () => {
  it('ได้พิกัด = status ok', async () => {
    const r = await capturePosition(1000, okGeo({ latitude: 13.75, longitude: 100.5, accuracy: 8 }));
    expect(r.status).toBe('ok');
    expect(r.gps).toEqual({ lat: 13.75, lng: 100.5, accuracy: 8 });
  });

  it('ไม่มี accuracy ก็ไม่ใส่คีย์เปล่า', async () => {
    const r = await capturePosition(1000, okGeo({ latitude: 13.75, longitude: 100.5 }));
    expect(r.gps).toEqual({ lat: 13.75, lng: 100.5 });
  });

  it('ปฏิเสธสิทธิ์ = denied และไม่มีพิกัด', async () => {
    const r = await capturePosition(1000, failGeo(1));
    expect(r).toEqual({ gps: null, status: 'denied' });
  });

  it('หาตำแหน่งไม่ได้ / timeout ของเบราว์เซอร์', async () => {
    expect(await capturePosition(1000, failGeo(2))).toEqual({ gps: null, status: 'unavailable' });
    expect(await capturePosition(1000, failGeo(3))).toEqual({ gps: null, status: 'timeout' });
  });

  it('เครื่องไม่มี geolocation = unsupported (ไม่ throw)', async () => {
    expect(await capturePosition(1000, undefined)).toEqual({ gps: null, status: 'unsupported' });
    expect(await capturePosition(1000, {} as Geolocation)).toEqual({ gps: null, status: 'unsupported' });
  });

  it('getCurrentPosition throw = unavailable (ไม่ทำให้ผู้เรียกพัง)', async () => {
    const throwing = { getCurrentPosition: () => { throw new Error('insecure origin'); } } as unknown as Geolocation;
    expect(await capturePosition(1000, throwing)).toEqual({ gps: null, status: 'unavailable' });
  });

  it('เบราว์เซอร์ไม่เรียก callback เลย = resolve เป็น timeout ไม่ค้างตลอดกาล', async () => {
    vi.useFakeTimers();
    const p = capturePosition(8000, silentGeo());
    vi.advanceTimersByTime(8000);
    await expect(p).resolves.toEqual({ gps: null, status: 'timeout' });
    vi.useRealTimers();
  });

  it('resolve ครั้งเดียวแม้ callback มาช้ากว่า timeout', async () => {
    vi.useFakeTimers();
    let late: ((p: any) => void) | null = null;
    const lateGeo = { getCurrentPosition: (ok: any) => { late = ok; } } as unknown as Geolocation;
    const p = capturePosition(100, lateGeo);
    vi.advanceTimersByTime(100);
    const first = await p;
    expect(first.status).toBe('timeout');
    late!({ coords: { latitude: 1, longitude: 2 } });   // มาทีหลัง ต้องไม่เปลี่ยนผลลัพธ์
    await expect(p).resolves.toEqual({ gps: null, status: 'timeout' });
    vi.useRealTimers();
  });
});
