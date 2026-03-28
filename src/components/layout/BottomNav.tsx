// src/components/layout/BottomNav.tsx
import { Navigation, History, Wallet as WalletIcon, HelpCircle } from 'lucide-react';
import type { TabId } from '../../types';

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const tabs = [
  { id: 'home' as TabId, icon: Navigation, label: 'หน้าหลัก' },
  { id: 'history' as TabId, icon: History, label: 'ประวัติ' },
  { id: 'wallet' as TabId, icon: WalletIcon, label: 'กระเป๋าเงิน' },
  { id: 'faq' as TabId, icon: HelpCircle, label: 'FAQ' },
];

export const BottomNav = ({ activeTab, onTabChange }: BottomNavProps) => (
  <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-3 flex justify-around items-center z-50 pb-8 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
    {tabs.map(tab => (
      <button
        key={tab.id}
        onClick={() => onTabChange(tab.id)}
        className={`flex flex-col items-center gap-1 transition-all ${activeTab === tab.id ? 'text-emerald-500' : 'text-gray-400 hover:text-gray-500'}`}
      >
        <div className={`p-1.5 rounded-xl ${activeTab === tab.id ? 'bg-emerald-50' : ''}`}>
          <tab.icon size={24} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
        </div>
        <span className="text-[10px] font-bold">{tab.label}</span>
      </button>
    ))}
  </div>
);
