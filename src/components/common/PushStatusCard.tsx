// src/components/common/PushStatusCard.tsx
//
// การ์ดสถานะการแจ้งเตือน + ปุ่มซ่อม — สิ่งที่แอปนี้ไม่เคยมี (รายงานสำรวจ ข้อ B)
// ข้อความทั้งหมดมาจาก describePushHealth (pure, มีเทส) ไม่ตัดสินเองที่นี่
//
// สองรูป: `compact` วางบน HomeTab โชว์เฉพาะตอนไม่ ok (ไรเดอร์ที่รองานอยู่ต้อง
// เห็นว่าเครื่องตัวเองจะไม่เด้ง) · `full` วางใน ProfileTab โชว์เสมอ ให้กดลองใหม่
// ได้แม้ตอนสถานะดี
import { Bell, BellOff, BellRing, Loader2, RefreshCw } from 'lucide-react';
import { usePushHealth } from '../../hooks/usePushHealth';
import { describePushHealth, pushActions, type PushHealthLevel } from '../../utils/pushHealth';

interface Props {
  variant: 'compact' | 'full';
}

const tone: Record<PushHealthLevel, { wrap: string; icon: string }> = {
  ok: { wrap: 'bg-white border-gray-100', icon: 'bg-emerald-50 text-emerald-600' },
  action: { wrap: 'bg-amber-50 border-amber-200', icon: 'bg-amber-100 text-amber-700' },
  blocked: { wrap: 'bg-red-50 border-red-200', icon: 'bg-red-100 text-red-600' },
  unsupported: { wrap: 'bg-gray-50 border-gray-200', icon: 'bg-gray-200 text-gray-600' },
  checking: { wrap: 'bg-white border-gray-100', icon: 'bg-gray-100 text-gray-500' },
};

export const PushStatusCard = ({ variant }: Props) => {
  const health = usePushHealth();
  const copy = describePushHealth(health);

  if (variant === 'compact' && copy.level === 'ok') return null;

  const Icon = copy.level === 'ok' ? BellRing : copy.level === 'checking' ? Loader2 : copy.level === 'action' ? Bell : BellOff;
  const t = tone[copy.level];

  const onCta = () => {
    const a = pushActions();
    if (!a) return;
    // ต้องเรียกใน click handler ตรงๆ — iOS ตัดสินว่าเป็น user gesture หรือไม่ที่นี่
    void (copy.cta === 'enable' ? a.enable() : a.refresh());
  };

  const ctaLabel = copy.cta === 'enable' ? 'เปิดการแจ้งเตือน' : 'ลองใหม่';

  return (
    <div className={`${t.wrap} border rounded-2xl p-4 shadow-sm flex items-start gap-3 ${variant === 'compact' ? 'backdrop-blur-md' : ''}`}>
      <div className={`p-2 rounded-xl shrink-0 ${t.icon}`}>
        <Icon size={18} className={copy.level === 'checking' ? 'animate-spin' : ''} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-gray-800">{copy.title}</div>
        {copy.detail && <div className="text-xs text-gray-600 mt-0.5 leading-relaxed">{copy.detail}</div>}
        {copy.cta && !health.busy && (
          <button
            type="button"
            onClick={onCta}
            className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold active:scale-95 transition-all ${
              copy.level === 'ok' ? 'bg-gray-100 text-gray-600' : 'bg-emerald-500 text-white shadow'
            }`}
          >
            {copy.cta === 'enable' ? <Bell size={14} /> : <RefreshCw size={14} />}
            {ctaLabel}
          </button>
        )}
      </div>
    </div>
  );
};
