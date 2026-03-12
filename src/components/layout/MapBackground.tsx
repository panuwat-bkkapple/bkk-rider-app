// src/components/layout/MapBackground.tsx
export const MapBackground = () => (
  <div className="absolute inset-0 z-0 bg-[#F3F4F6] overflow-hidden">
    <div className="absolute top-1/3 left-1/3 p-3 bg-emerald-500/20 rounded-full animate-pulse">
      <div className="w-5 h-5 bg-emerald-500 rounded-full border-2 border-white shadow-md"></div>
    </div>
    <div className="w-full h-full opacity-30" style={{
      backgroundImage: 'linear-gradient(#E5E7EB 1px, transparent 1px), linear-gradient(90deg, #E5E7EB 1px, transparent 1px)',
      backgroundSize: '24px 24px'
    }} />
  </div>
);
