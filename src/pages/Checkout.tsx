// src/pages/Checkout.tsx - Checkout page with multi-step form
import { useState } from 'react';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  MapPin,
  ChevronRight,
  Package,
  Truck,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import { ProductTour } from '../components/checkout/ProductTour';

interface CheckoutProps {
  onBack: () => void;
}

const SERVICE_OPTIONS = [
  {
    id: 'standard',
    icon: Package,
    label: 'จัดส่งมาตรฐาน',
    desc: '3-5 วันทำการ',
    price: 50,
  },
  {
    id: 'express',
    icon: Truck,
    label: 'จัดส่งด่วน',
    desc: '1-2 วันทำการ',
    price: 100,
  },
  {
    id: 'flash',
    icon: Zap,
    label: 'จัดส่งแฟลช',
    desc: 'ภายในวันนี้',
    price: 200,
  },
];

export const Checkout = ({ onBack }: CheckoutProps) => {
  // Form state
  const [fullname, setFullname] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('');
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [showSuccess, setShowSuccess] = useState(false);

  const isStep1Valid = fullname.trim() && phone.trim() && email.trim();
  const isStep2Valid = location.trim() && selectedService;

  const handleConfirm = () => {
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      onBack();
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] max-w-md mx-auto relative font-sans text-gray-800">
      {/* Product Tour */}
      <ProductTour />

      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 z-20">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold">สั่งซื้อสินค้า</h1>
        <div className="ml-auto flex items-center gap-1 text-xs text-gray-400">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              step >= 1 ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'
            }`}
          >
            1
          </span>
          <div className="w-4 h-px bg-gray-300" />
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              step >= 2 ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'
            }`}
          >
            2
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 space-y-4 pb-32">
        {step === 1 && (
          <>
            {/* Section: ข้อมูลผู้สั่ง */}
            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <h2 className="font-bold text-sm text-gray-600 uppercase tracking-wide">
                ข้อมูลผู้สั่งซื้อ
              </h2>

              {/* ชื่อ-นามสกุล */}
              <div data-tour="fullname">
                <label className="text-xs text-gray-500 mb-1 block">ชื่อ-นามสกุล</label>
                <div className="relative">
                  <User
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    value={fullname}
                    onChange={(e) => setFullname(e.target.value)}
                    placeholder="กรอกชื่อ-นามสกุล"
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* เบอร์โทร */}
              <div data-tour="phone">
                <label className="text-xs text-gray-500 mb-1 block">เบอร์โทรศัพท์</label>
                <div className="relative">
                  <Phone
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0xx-xxx-xxxx"
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* อีเมล */}
              <div data-tour="email">
                <label className="text-xs text-gray-500 mb-1 block">อีเมล</label>
                <div className="relative">
                  <Mail
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@email.com"
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all"
                  />
                </div>
              </div>
            </div>

            {/* ปุ่มถัดไป */}
            <button
              data-tour="next-button"
              disabled={!isStep1Valid}
              onClick={() => setStep(2)}
              className={`w-full py-4 rounded-2xl font-bold text-base shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 ${
                isStep1Valid
                  ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              ถัดไป
              <ChevronRight size={20} />
            </button>
          </>
        )}

        {step === 2 && (
          <>
            {/* Location bar */}
            <div
              data-tour="location-bar"
              className="bg-white rounded-2xl p-4 shadow-sm"
            >
              <h2 className="font-bold text-sm text-gray-600 uppercase tracking-wide mb-3">
                สถานที่จัดส่ง
              </h2>
              <button
                onClick={() => {
                  const addr = prompt('กรุณากรอกที่อยู่จัดส่ง');
                  if (addr) setLocation(addr);
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  location
                    ? 'border-emerald-400 bg-emerald-50'
                    : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <MapPin
                  size={20}
                  className={location ? 'text-emerald-500' : 'text-gray-400'}
                />
                <span
                  className={`text-sm text-left flex-1 ${
                    location ? 'text-gray-800' : 'text-gray-400'
                  }`}
                >
                  {location || 'กดเพื่อเลือกสถานที่จัดส่ง'}
                </span>
                <ChevronRight size={16} className="text-gray-400" />
              </button>
            </div>

            {/* Service cards */}
            <div data-tour="service-cards" className="space-y-3">
              <h2 className="font-bold text-sm text-gray-600 uppercase tracking-wide px-1">
                เลือกบริการจัดส่ง
              </h2>
              {SERVICE_OPTIONS.map((svc) => {
                const Icon = svc.icon;
                const isSelected = selectedService === svc.id;
                return (
                  <button
                    key={svc.id}
                    onClick={() => setSelectedService(svc.id)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border shadow-sm transition-all active:scale-[0.98] ${
                      isSelected
                        ? 'border-emerald-400 bg-emerald-50 shadow-emerald-100'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isSelected ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <Icon size={20} />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-semibold text-sm">{svc.label}</p>
                      <p className="text-xs text-gray-400">{svc.desc}</p>
                    </div>
                    <span className="font-bold text-sm text-emerald-600">
                      ฿{svc.price}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Back + Confirm */}
            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 py-4 rounded-2xl font-bold text-base border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-all active:scale-95"
              >
                ย้อนกลับ
              </button>
              <button
                data-tour="confirm-button"
                disabled={!isStep2Valid}
                onClick={handleConfirm}
                className={`flex-1 py-4 rounded-2xl font-bold text-base shadow-lg transition-all active:scale-95 ${
                  isStep2Valid
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                ยืนยันคำสั่งซื้อ
              </button>
            </div>
          </>
        )}
      </div>

      {/* Success overlay */}
      {showSuccess && (
        <div className="fixed inset-0 bg-emerald-500/90 z-[300] flex flex-col items-center justify-center text-white animate-in fade-in">
          <CheckCircle2 size={64} className="mb-4" />
          <p className="text-2xl font-bold">สั่งซื้อสำเร็จ!</p>
          <p className="text-sm opacity-80 mt-2">กำลังกลับไปหน้าหลัก...</p>
        </div>
      )}
    </div>
  );
};
