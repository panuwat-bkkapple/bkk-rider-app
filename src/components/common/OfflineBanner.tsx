// src/components/common/OfflineBanner.tsx
import { useState, useEffect, useRef } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export const OfflineBanner = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      wasOffline.current = true;
    };
    const handleOnline = () => {
      setIsOffline(false);
      if (wasOffline.current) {
        setShowReconnected(true);
        wasOffline.current = false;
        setTimeout(() => setShowReconnected(false), 3000);
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (showReconnected) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[200] bg-emerald-500 text-white px-4 py-3 flex items-center justify-center gap-2 text-sm font-bold shadow-lg animate-in slide-in-from-top">
        <Wifi size={18} />
        <span>กลับมาออนไลน์แล้ว</span>
      </div>
    );
  }

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] bg-red-500 text-white px-4 py-3 flex items-center justify-center gap-2 text-sm font-bold shadow-lg animate-in slide-in-from-top">
      <WifiOff size={18} />
      <span>ไม่มีการเชื่อมต่ออินเทอร์เน็ต กำลังใช้ข้อมูลแคช</span>
    </div>
  );
};
