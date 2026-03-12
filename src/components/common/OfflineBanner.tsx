// src/components/common/OfflineBanner.tsx
import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

export const OfflineBanner = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] bg-red-500 text-white px-4 py-3 flex items-center justify-center gap-2 text-sm font-bold shadow-lg animate-in slide-in-from-top">
      <WifiOff size={18} />
      <span>ไม่มีการเชื่อมต่ออินเทอร์เน็ต</span>
    </div>
  );
};
