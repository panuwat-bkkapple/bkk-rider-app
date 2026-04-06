// src/components/common/Toast.tsx
import { useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  text: string;
  type: ToastType;
}

let toastId = 0;
let addToastFn: ((text: string, type: ToastType) => void) | null = null;

export const toast = {
  success: (text: string) => addToastFn?.(text, 'success'),
  error: (text: string) => addToastFn?.(text, 'error'),
  info: (text: string) => addToastFn?.(text, 'info'),
};

const icons = { success: CheckCircle, error: AlertTriangle, info: Info };
const colors = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
};

export const ToastContainer = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    addToastFn = (text: string, type: ToastType) => {
      const id = ++toastId;
      setToasts(prev => [...prev, { id, text, type }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
    };
    return () => { addToastFn = null; };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 w-[90vw] max-w-sm">
      {toasts.map(t => {
        const Icon = icons[t.type];
        return (
          <div key={t.id} className={`${colors[t.type]} text-white px-4 py-3 rounded-2xl shadow-lg flex items-center gap-3 animate-in slide-in-from-top duration-300`}>
            <Icon size={20} className="shrink-0" />
            <p className="text-sm font-medium flex-1">{t.text}</p>
            <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))} className="shrink-0 opacity-70 hover:opacity-100">
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
