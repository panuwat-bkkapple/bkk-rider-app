// src/components/common/LoadingSpinner.tsx
export const LoadingSpinner = () => (
  <div className="h-screen flex flex-col items-center justify-center bg-white text-emerald-500">
    <div className="animate-spin w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full mb-4"></div>
    <div className="animate-pulse font-bold text-sm tracking-widest">กำลังเชื่อมต่อระบบ...</div>
  </div>
);
