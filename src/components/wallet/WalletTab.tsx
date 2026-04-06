// src/components/wallet/WalletTab.tsx
import { Bike, Landmark, Wallet as WalletIcon } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface WalletTabProps {
  balance: number;
  transactions: any[];
  hasMoreTx?: boolean;
  onLoadMoreTx?: () => void;
  onOpenWithdraw: () => void;
}

export const WalletTab = ({ balance, transactions, hasMoreTx, onLoadMoreTx, onOpenWithdraw }: WalletTabProps) => (
  <div className="h-full bg-[#F9FAFB] overflow-y-auto pb-32 animate-in fade-in">
    {/* Header */}
    <div className="bg-emerald-600 p-8 pt-16 pb-12 text-white rounded-b-[2.5rem] shadow-lg relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-10"><WalletIcon size={120} /></div>
      <p className="text-xs font-medium text-emerald-100 mb-2">ยอดเงินที่ถอนได้ (Available Balance)</p>
      <h3 className="text-5xl font-bold mb-8 tracking-tight">{formatCurrency(balance)}</h3>
      <button
        onClick={onOpenWithdraw}
        className="w-full bg-white text-emerald-700 py-4 rounded-2xl font-bold text-sm shadow-md active:scale-95 transition-transform"
      >
        ขอถอนเงินเข้าบัญชี
      </button>
    </div>

    {/* Transactions */}
    <div className="p-6 space-y-4">
      <h4 className="font-bold text-gray-800 text-sm mb-2">ประวัติธุรกรรมล่าสุด</h4>
      {transactions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
          <div className="text-4xl mb-3">💰</div>
          <p className="font-bold text-gray-600 mb-1">ยังไม่มีธุรกรรม</p>
          <p className="text-sm text-gray-400">เริ่มวิ่งงานเพื่อรับรายได้เข้ากระเป๋า</p>
        </div>
      ) : (
        transactions.map((t: any) => (
          <div key={t.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${t.type === 'CREDIT' ? 'bg-emerald-50 text-emerald-500' : 'bg-orange-50 text-orange-500'}`}>
                {t.type === 'CREDIT' ? <Bike size={20} /> : <Landmark size={20} />}
              </div>
              <div>
                <div className="text-sm font-bold text-gray-800">{t.category}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{formatDate(t.timestamp)}</div>
              </div>
            </div>
            <div className={`text-base font-bold ${t.type === 'CREDIT' ? 'text-emerald-500' : 'text-gray-900'}`}>
              {t.type === 'CREDIT' ? '+' : '-'}{formatCurrency(t.amount)}
            </div>
          </div>
        ))
      )}
      {hasMoreTx && onLoadMoreTx && (
        <button
          onClick={onLoadMoreTx}
          className="w-full py-3 text-sm font-bold text-emerald-600 bg-emerald-50 rounded-2xl hover:bg-emerald-100 transition-colors"
        >
          โหลดเพิ่มเติม
        </button>
      )}
    </div>
  </div>
);
