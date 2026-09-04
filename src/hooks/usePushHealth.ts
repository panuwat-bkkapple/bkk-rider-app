// src/hooks/usePushHealth.ts
import { useSyncExternalStore } from 'react';
import { getPushHealth, subscribePushHealth, type PushHealth } from '../utils/pushHealth';

/** อ่านสถานะ push จาก store กลาง — component ไหนก็เรียกได้ ไม่ต้องร้อย prop */
export function usePushHealth(): PushHealth {
  return useSyncExternalStore(subscribePushHealth, getPushHealth, getPushHealth);
}
