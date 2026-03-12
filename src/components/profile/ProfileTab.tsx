// src/components/profile/ProfileTab.tsx
import { X, CreditCard, FileText, ChevronRight, LogOut } from 'lucide-react';
import type { RiderInfo } from '../../types';

interface ProfileTabProps {
  riderInfo: RiderInfo;
  onGoHome: () => void;
  onOpenBank: () => void;
  onOpenDoc: () => void;
  onLogout: () => void;
}

export const ProfileTab = ({ riderInfo, onGoHome, onOpenBank, onOpenDoc, onLogout }: ProfileTabProps) => (
  <div className="h-full bg-[#F3F4F6] animate-in slide-in-from-right duration-300 overflow-y-auto pb-32">
    {/* Header */}
    <div className="bg-white p-6 pt-12 pb-6 flex items-center gap-4 sticky top-0 z-20 border-b border-gray-100">
      <button onClick={onGoHome} className="p-2 -ml-2 bg-gray-50 text-gray-500 hover:bg-gray-100 rounded-full transition-colors">
        <X size={20} />
      </button>
      <h2 className="text-lg font-bold text-gray-900">โปรไฟล์ของฉัน</h2>
    </div>

    <div className="p-6 space-y-6">
      {/* Avatar & name */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-5">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 font-bold text-2xl shadow-inner">
          {riderInfo.name.charAt(0)}
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-gray-900">{riderInfo.name}</h3>
          <p className="text-xs font-medium text-gray-500 mt-1">รหัสพนักงาน: {riderInfo.id}</p>
        </div>
      </div>

      {/* Menu items */}
      <div className="space-y-3">
        <button onClick={onOpenBank} className="w-full bg-white p-5 rounded-2xl border border-gray-100 flex items-center gap-4 shadow-sm active:scale-95 transition-all">
          <div className="p-2 bg-blue-50 text-blue-500 rounded-lg"><CreditCard size={20} /></div>
          <div className="flex-1 text-left font-semibold text-gray-800">บัญชีรับเงิน</div>
          <ChevronRight size={20} className="text-gray-300" />
        </button>
        <button onClick={onOpenDoc} className="w-full bg-white p-5 rounded-2xl border border-gray-100 flex items-center gap-4 shadow-sm active:scale-95 transition-all">
          <div className="p-2 bg-purple-50 text-purple-500 rounded-lg"><FileText size={20} /></div>
          <div className="flex-1 text-left font-semibold text-gray-800">เอกสารประจำตัว</div>
          <ChevronRight size={20} className="text-gray-300" />
        </button>
      </div>

      {/* Logout */}
      <button
        onClick={onLogout}
        className="w-full p-4 mt-8 flex items-center justify-center gap-2 text-red-500 font-bold text-sm bg-white rounded-2xl shadow-sm border border-red-100 hover:bg-red-50"
      >
        <LogOut size={18} /> ออกจากระบบ (สลับบัญชี)
      </button>
    </div>
  </div>
);
