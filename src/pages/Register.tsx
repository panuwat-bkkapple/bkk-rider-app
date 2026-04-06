import React, { useState } from 'react';
import { ChevronLeft, Upload, ShieldCheck, User, Bike, FileText } from 'lucide-react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { ref, set } from 'firebase/database';
import { auth, db } from '../api/firebase';
import { uploadImageToFirebase, validateImageFile } from '../utils/uploadImage';

const validateEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validatePhone = (phone: string): boolean => /^0[0-9]{8,9}$/.test(phone.replace(/\s|-/g, ''));

export const Register = ({ onBack }: { onBack: () => void }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    email: '', password: '', name: '', phone: '', emergencyContact: '',
    plateNo: '', vehicleModel: '', bankName: '', bankAccount: ''
  });

  const [files, setFiles] = useState({ idCard: null as File | null, selfie: null as File | null, license: null as File | null });
  const [previews, setPreviews] = useState({ idCard: '', selfie: '', license: '' });

  const handleFileChange = (type: keyof typeof files, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validationError = validateImageFile(file);
      if (validationError) {
        setError(validationError);
        e.target.value = '';
        return;
      }
      setError('');
      setFiles(prev => ({ ...prev, [type]: file }));
      const reader = new FileReader();
      reader.onloadend = () => setPreviews(prev => ({ ...prev, [type]: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  const validateStep1 = (): boolean => {
    if (!formData.name.trim()) { setError('กรุณากรอกชื่อ-นามสกุล'); return false; }
    if (!validatePhone(formData.phone)) { setError('เบอร์โทรศัพท์ไม่ถูกต้อง (ต้องขึ้นต้นด้วย 0 และมี 9-10 หลัก)'); return false; }
    if (!validateEmail(formData.email)) { setError('รูปแบบอีเมลไม่ถูกต้อง'); return false; }
    if (formData.password.length < 6) { setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return false; }
    setError('');
    return true;
  };

  const validateStep2 = (): boolean => {
    if (!formData.plateNo.trim()) { setError('กรุณากรอกป้ายทะเบียนรถ'); return false; }
    if (!formData.vehicleModel.trim()) { setError('กรุณากรอกยี่ห้อ/รุ่นรถ'); return false; }
    if (!formData.bankName.trim()) { setError('กรุณากรอกชื่อธนาคาร'); return false; }
    if (!formData.bankAccount.trim()) { setError('กรุณากรอกเลขที่บัญชี'); return false; }
    if (!formData.emergencyContact.trim()) { setError('กรุณากรอกเบอร์โทรผู้ติดต่อฉุกเฉิน'); return false; }
    setError('');
    return true;
  };

  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const missingDocs = [];
    if (!files.idCard) missingDocs.push('บัตรประชาชน');
    if (!files.selfie) missingDocs.push('รูปเซลฟี่');
    if (!files.license) missingDocs.push('ใบอนุญาตขับขี่');
    if (missingDocs.length > 0) {
      setError(`กรุณาอัปโหลดเอกสารให้ครบ: ${missingDocs.join(', ')}`); return;
    }

    setLoading(true); setError('');
    try {
      const userCred = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      const uid = userCred.user.uid;

      const idCardUrl = await uploadImageToFirebase(files.idCard!, `riders_docs/${uid}/idCard`);
      const selfieUrl = await uploadImageToFirebase(files.selfie!, `riders_docs/${uid}/selfie`);
      const licenseUrl = await uploadImageToFirebase(files.license!, `riders_docs/${uid}/license`);

      await set(ref(db, `riders/${uid}`), {
        id: uid,
        email: formData.email,
        name: formData.name,
        phone: formData.phone,
        emergency_contact: formData.emergencyContact,
        vehicle: { plate: formData.plateNo, model: formData.vehicleModel },
        bank: { name: formData.bankName, account: formData.bankAccount },
        documents: { idCard: idCardUrl, selfie: selfieUrl, license: licenseUrl },
        status: 'Pending',
        created_at: Date.now()
      });

      alert('ส่งใบสมัครสำเร็จ! กรุณารอแอดมินตรวจสอบและอนุมัติผ่านอีเมล/เบอร์โทร');
      onBack();
    } catch (err: any) {
      console.error(err);
      setError(err.message.includes('email-already-in-use') ? 'อีเมลนี้ถูกใช้งานแล้ว' : 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] flex flex-col items-center p-6 relative pb-24">
      <div className="w-full max-w-md bg-white rounded-[2rem] p-6 shadow-xl relative mt-8">
        <button onClick={onBack} className="absolute top-6 left-6 text-gray-400 hover:text-gray-700 bg-gray-50 p-2 rounded-full"><ChevronLeft size={24} /></button>
        <h2 className="text-xl font-bold text-center text-gray-900 mb-6 mt-2">สมัครเป็นไรเดอร์</h2>

        {/* Progress Bar */}
        <div className="flex justify-between mb-8 px-4">
          {[1, 2, 3].map(i => (
            <div key={i} className={`flex flex-col items-center gap-2 ${step >= i ? 'text-emerald-500' : 'text-gray-300'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold border-2 ${step >= i ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`}>
                {i === 1 ? <User size={18}/> : i === 2 ? <Bike size={18}/> : <FileText size={18}/>}
              </div>
            </div>
          ))}
        </div>

        {error && <div className="bg-red-50 text-red-500 p-3 rounded-xl text-sm mb-4 font-medium text-center">{error}</div>}

        <form onSubmit={step === 3 ? handleSubmit : handleNextStep} className="space-y-4">

          {/* STEP 1: Personal info */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in">
              <input type="text" placeholder="ชื่อ - นามสกุล (ตามบัตร ปชช.)" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl border border-gray-200 outline-none focus:border-emerald-500" />
              <input type="tel" placeholder="เบอร์โทรศัพท์มือถือ (เช่น 0812345678)" required value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl border border-gray-200 outline-none focus:border-emerald-500" />
              <input type="email" placeholder="อีเมล (สำหรับเข้าสู่ระบบ)" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl border border-gray-200 outline-none focus:border-emerald-500" />
              <input type="password" placeholder="ตั้งรหัสผ่าน (6 ตัวขึ้นไป)" required minLength={6} value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl border border-gray-200 outline-none focus:border-emerald-500" />
            </div>
          )}

          {/* STEP 2: Vehicle & bank */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in">
              <h3 className="font-bold text-gray-700 text-sm">ข้อมูลยานพาหนะ</h3>
              <input type="text" placeholder="ป้ายทะเบียนรถ (เช่น กทม 1234)" required value={formData.plateNo} onChange={e => setFormData({...formData, plateNo: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl border border-gray-200 outline-none focus:border-emerald-500" />
              <input type="text" placeholder="ยี่ห้อ / รุ่น / สี (เช่น Honda Wave สีแดง)" required value={formData.vehicleModel} onChange={e => setFormData({...formData, vehicleModel: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl border border-gray-200 outline-none focus:border-emerald-500" />

              <h3 className="font-bold text-gray-700 text-sm mt-4">บัญชีรับเงิน & ติดต่อฉุกเฉิน</h3>
              <input type="text" placeholder="ชื่อธนาคาร" required value={formData.bankName} onChange={e => setFormData({...formData, bankName: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl border border-gray-200 outline-none focus:border-emerald-500" />
              <input type="text" placeholder="เลขที่บัญชี" required value={formData.bankAccount} onChange={e => setFormData({...formData, bankAccount: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl border border-gray-200 outline-none focus:border-emerald-500" />
              <input type="text" placeholder="เบอร์โทรผู้ติดต่อฉุกเฉิน" required value={formData.emergencyContact} onChange={e => setFormData({...formData, emergencyContact: e.target.value})} className="w-full bg-gray-50 p-4 rounded-xl border border-gray-200 outline-none focus:border-emerald-500" />
            </div>
          )}

          {/* STEP 3: Documents */}
          {step === 3 && (
            <div className="space-y-5 animate-in fade-in">
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-start gap-2 text-amber-700 text-xs font-medium">
                <ShieldCheck size={16} className="shrink-0 mt-0.5" />
                <p>กรุณาถ่ายภาพเอกสารตัวจริงให้ชัดเจน เพื่อใช้ประกอบการพิจารณาตรวจสอบประวัติอาชญากรรม</p>
              </div>

              {[
                { id: 'idCard', label: '1. บัตรประชาชน (ด้านหน้า)' },
                { id: 'selfie', label: '2. ถ่ายรูปเซลฟี่คู่กับบัตรประชาชน' },
                { id: 'license', label: '3. ใบอนุญาตขับขี่' }
              ].map((doc) => (
                <div key={doc.id}>
                  <label className="text-sm font-semibold text-gray-700 mb-2 block">{doc.label}</label>
                  <label className="block w-full h-32 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors relative overflow-hidden">
                    {previews[doc.id as keyof typeof previews] ? (
                      <img src={previews[doc.id as keyof typeof previews]} className="w-full h-full object-cover" />
                    ) : (
                      <><Upload size={24} className="text-gray-400 mb-2" /><span className="text-xs text-gray-500 font-bold">แตะเพื่ออัปโหลดรูปภาพ</span></>
                    )}
                    <input type="file" accept="image/*" className="hidden" required={!files[doc.id as keyof typeof files]} onChange={e => handleFileChange(doc.id as keyof typeof files, e)} />
                  </label>
                </div>
              ))}
            </div>
          )}

          <div className="pt-6 flex gap-3">
            {step > 1 && (
              <button type="button" onClick={() => { setStep(step - 1); setError(''); }} disabled={loading} className="flex-1 bg-gray-100 text-gray-700 py-4 rounded-2xl font-bold active:scale-95 transition-all">
                ย้อนกลับ
              </button>
            )}
            <button type="submit" disabled={loading} className="flex-[2] bg-emerald-500 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-emerald-600 active:scale-95 transition-all flex justify-center items-center gap-2">
              {loading ? <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div> : step === 3 ? 'ส่งใบสมัคร' : 'ถัดไป'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
