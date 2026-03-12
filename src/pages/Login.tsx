import React, { useState, useEffect } from 'react';
import { Delete, Mail, Lock, LogOut } from 'lucide-react';
import { ref, get } from 'firebase/database';
import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { db, auth } from '../api/firebase';

const validateEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const Login = ({ onLoginSuccess, onGoToRegister }: { onLoginSuccess: (riderId: string) => void, onGoToRegister: () => void }) => {
    const savedRiderId = localStorage.getItem('rider_id');
    const savedPin = localStorage.getItem('device_pin');

    const [mode, setMode] = useState<'email' | 'create_pin' | 'enter_pin' | 'forgot_password'>(
        savedRiderId && savedPin ? 'enter_pin' : 'email'
    );

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [step, setStep] = useState(1);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // PIN verification
    useEffect(() => {
        if (mode === 'enter_pin' && pin.length === 4) {
            if (pin === savedPin && savedRiderId) {
                onLoginSuccess(savedRiderId);
            } else {
                setError('รหัส PIN ไม่ถูกต้อง');
                setPin('');
            }
        } else if (mode === 'create_pin') {
            if (step === 1 && pin.length === 4) {
                setStep(2);
                setConfirmPin(pin);
                setPin('');
                setError('');
            } else if (step === 2 && pin.length === 4) {
                if (pin === confirmPin) {
                    localStorage.setItem('device_pin', pin);
                    const currentId = localStorage.getItem('rider_id');
                    if (currentId) {
                        onLoginSuccess(currentId);
                    } else {
                        setError('เกิดข้อผิดพลาด กรุณาออกจากระบบแล้วเข้าใหม่');
                    }
                } else {
                    setError('รหัสไม่ตรงกัน กรุณาตั้งใหม่');
                    setStep(1);
                    setPin('');
                    setConfirmPin('');
                }
            }
        }
    }, [pin, mode, step, savedPin, savedRiderId, confirmPin, onLoginSuccess]);

    // Email login with validation
    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanEmail = email.trim();
        const cleanPassword = password.trim();

        if (!validateEmail(cleanEmail)) {
            setError('รูปแบบอีเมลไม่ถูกต้อง');
            return;
        }
        if (cleanPassword.length < 6) {
            setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
            return;
        }

        setLoading(true);
        setError('');
        localStorage.removeItem('rider_id');
        localStorage.removeItem('device_pin');

        try {
            const userCred = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
            const uid = userCred.user.uid;
            const snapshot = await get(ref(db, `riders/${uid}`));

            if (snapshot.exists()) {
                const riderData = snapshot.val();
                if (riderData.status === 'Pending') {
                    await signOut(auth);
                    setError('บัญชีของคุณอยู่ระหว่างรอการตรวจสอบจากแอดมิน');
                    setLoading(false);
                    return;
                }
                localStorage.setItem('rider_id', uid);
                setMode('create_pin');
                setPin('');
            } else {
                await signOut(auth);
                setError('ไม่พบข้อมูลโปรไฟล์ของคุณในฐานข้อมูล (โปรดติดต่อแอดมิน)');
            }
        } catch (err: any) {
            console.error("Login Error:", err.message);
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
                setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
            } else {
                setError(`ข้อผิดพลาดระบบ: ${err.message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    // Forgot password with validation
    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanEmail = email.trim();
        if (!cleanEmail) {
            setError('กรุณากรอกอีเมลของคุณก่อนครับ');
            return;
        }
        if (!validateEmail(cleanEmail)) {
            setError('รูปแบบอีเมลไม่ถูกต้อง');
            return;
        }

        setLoading(true);
        setError('');

        try {
            await sendPasswordResetEmail(auth, cleanEmail);
            setLoading(false);
            setMode('email');
            setTimeout(() => {
                alert('ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลแล้ว! \nกรุณาเช็คกล่องข้อความ (หรือโฟลเดอร์ขยะ/Spam) ด้วยนะครับ');
            }, 100);
        } catch (err: any) {
            setLoading(false);
            console.error("Reset Password Error:", err.message);
            if (err.code === 'auth/invalid-email') {
                setError('รูปแบบอีเมลไม่ถูกต้องครับ');
            } else {
                setError('ไม่พบอีเมลนี้ในระบบ หรือเกิดข้อผิดพลาดครับ');
            }
        }
    };

    const handleResetDevice = async () => {
        if (window.confirm('ต้องการออกจากระบบและตั้งค่าเครื่องใหม่หรือไม่?')) {
            await signOut(auth);
            localStorage.removeItem('rider_id');
            localStorage.removeItem('device_pin');
            setMode('email');
            setPin('');
            setError('');
        }
    };

    const handleKeyPress = (num: string) => { if (pin.length < 4) setPin(prev => prev + num); };
    const handleDelete = () => { setPin(prev => prev.slice(0, -1)); };

    return (
        <div className="min-h-screen bg-[#F3F4F6] flex flex-col justify-center items-center p-6 relative">
            {mode === 'enter_pin' && (
                <button onClick={handleResetDevice} className="absolute top-6 right-6 text-gray-400 hover:text-red-500 flex items-center gap-1 text-xs font-medium bg-white px-3 py-2 rounded-full shadow-sm">
                    <LogOut size={14} /> สลับบัญชี
                </button>
            )}

            <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-8 shadow-xl text-center">
                <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                    {mode === 'email' || mode === 'forgot_password' ? <Mail size={40} /> : <Lock size={40} />}
                </div>

                <h1 className="text-2xl font-bold text-gray-900 mb-2">BKK Rider</h1>

                <p className="text-sm text-gray-500 mb-8">
                    {mode === 'forgot_password' ? 'กรอกอีเมลของคุณเพื่อรับลิงก์ตั้งรหัสผ่านใหม่' :
                    mode === 'email' ? 'เข้าสู่ระบบด้วยอีเมลพนักงาน' :
                        mode === 'create_pin' && step === 1 ? 'ตั้งรหัส PIN 4 หลักสำหรับเครื่องนี้' :
                            mode === 'create_pin' && step === 2 ? 'ยืนยันรหัส PIN อีกครั้ง' :
                                'กรอกรหัส PIN เพื่อเข้าใช้งาน'}
                </p>

                {error && <div className="text-red-500 text-sm mb-4 font-medium animate-pulse bg-red-50 p-2 rounded-xl">{error}</div>}

                {mode === 'forgot_password' ? (
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                        <div className="relative">
                            <Mail className="absolute left-4 top-3.5 text-gray-400" size={20} />
                            <input
                                type="email" placeholder="อีเมลพนักงาน" required
                                value={email} onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-gray-50 py-3 pl-12 pr-4 rounded-2xl border border-gray-200 outline-none focus:border-emerald-500 transition-all font-medium"
                            />
                        </div>
                        <button type="submit" disabled={loading} className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:bg-emerald-600 active:scale-95 transition-all mt-4">
                            {loading ? 'กำลังส่งลิงก์...' : 'ส่งลิงก์รีเซ็ตรหัสผ่าน'}
                        </button>
                        <button type="button" onClick={() => { setMode('email'); setError(''); }} className="w-full text-gray-500 py-3 font-bold hover:text-emerald-600 transition-all mt-2">
                            ย้อนกลับ
                        </button>
                    </form>
                ) : mode === 'email' ? (
                    <form onSubmit={handleEmailLogin} className="space-y-4">
                        <div className="relative">
                            <Mail className="absolute left-4 top-3.5 text-gray-400" size={20} />
                            <input
                                type="email" placeholder="อีเมลพนักงาน" required
                                value={email} onChange={(e) => setEmail(e.target.value)} autoCapitalize="none" autoComplete="off"
                                className="w-full bg-gray-50 py-3 pl-12 pr-4 rounded-2xl border border-gray-200 outline-none focus:border-emerald-500 transition-all font-medium"
                            />
                        </div>
                        <div className="relative">
                            <Lock className="absolute left-4 top-3.5 text-gray-400" size={20} />
                            <input
                                type="password" placeholder="รหัสผ่าน (6 ตัวอักษรขึ้นไป)" required
                                value={password} onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-gray-50 py-3 pl-12 pr-4 rounded-2xl border border-gray-200 outline-none focus:border-emerald-500 transition-all font-medium"
                            />
                        </div>

                        <div className="flex justify-end">
                            <button type="button" onClick={() => { setMode('forgot_password'); setError(''); }} className="text-sm font-bold text-emerald-600 hover:text-emerald-700">
                                ลืมรหัสผ่าน?
                            </button>
                        </div>

                        <button type="submit" disabled={loading} className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg shadow-lg hover:bg-emerald-600 active:scale-95 transition-all mt-4">
                            {loading ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
                        </button>
                        <div className="mt-6 pt-6 border-t border-gray-100">
                            <p className="text-xs text-gray-500 mb-3">ยังไม่มีบัญชีใช่หรือไม่?</p>
                            <button type="button" onClick={onGoToRegister} className="w-full bg-white text-emerald-600 border-2 border-emerald-100 py-3.5 rounded-2xl font-bold hover:bg-emerald-50 active:scale-95 transition-all">
                                สมัครเป็นไรเดอร์ (Rider)
                            </button>
                        </div>
                    </form>
                ) : (
                    <>
                        <div className="flex justify-center gap-4 mb-8">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className={`w-4 h-4 rounded-full transition-all duration-300 ${i < pin.length ? 'bg-emerald-500 scale-110' : 'bg-gray-200'}`} />
                            ))}
                        </div>
                        <div className="grid grid-cols-3 gap-4 mb-4">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                <button key={num} onClick={() => handleKeyPress(num.toString())} disabled={loading}
                                    className="h-16 rounded-full bg-gray-50 text-2xl font-semibold text-gray-800 hover:bg-emerald-50 hover:text-emerald-600 active:scale-95 transition-all">
                                    {num}
                                </button>
                            ))}
                            <div />
                            <button onClick={() => handleKeyPress('0')} disabled={loading}
                                className="h-16 rounded-full bg-gray-50 text-2xl font-semibold text-gray-800 hover:bg-emerald-50 hover:text-emerald-600 active:scale-95 transition-all">
                                0
                            </button>
                            <button onClick={handleDelete} disabled={loading}
                                className="h-16 rounded-full bg-gray-50 text-gray-600 hover:bg-red-50 hover:text-red-500 active:scale-95 transition-all flex items-center justify-center">
                                <Delete size={28} />
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
