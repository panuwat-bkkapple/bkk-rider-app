import { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { auth } from './api/firebase';
import { RiderApp } from './pages/RiderApp';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Checkout } from './pages/Checkout';
import { ClaimAssessment } from './pages/ClaimAssessment';
import { Probe } from './pages/Probe';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { OfflineBanner } from './components/common/OfflineBanner';
import { LoadingSpinner } from './components/common/LoadingSpinner';
import { useAutoLogout } from './hooks/useAutoLogout';
import { usePushNotifications } from './hooks/usePushNotifications';
import { ToastContainer } from './components/common/Toast';
import { logAuthEvent } from './utils/authEvents';

// เพดานรอ auth ก่อนยอมแพ้แล้วโชว์จอล็อกอิน — ยกค่าจาก bkk-frontend-next
// (lib/anonAuth.ts AUTH_TIMEOUT_MS) ซึ่งตั้งไว้หลังเจอ IndexedDB แขวนเงียบบน
// iOS Safari ทำให้ onAuthStateChanged ไม่ emit เลยสักครั้ง
//
// ที่นี่ไม่ได้ reject promise เหมือนต้นทาง แต่ปลด authChecked เพื่อให้ผู้ใช้
// ได้ "จอที่กดอะไรได้" แทน spinner ที่หมุนไม่จบ — spinner ที่ไม่มีวันจบคือ
// ทางตันที่ไรเดอร์ทำอะไรต่อไม่ได้เลย ส่วนจอล็อกอินอย่างน้อยยังพาเขากลับเข้ามาได้
const AUTH_CHECK_TIMEOUT_MS = 10_000;

// Wrapper to use navigate hooks inside components
const LoginPage = ({
  onLoginSuccess,
  sessionExpired,
  prefillEmail,
}: {
  onLoginSuccess: (id: string) => void;
  sessionExpired: boolean;
  prefillEmail: string | null;
}) => {
  const navigate = useNavigate();
  return (
    <Login
      onLoginSuccess={onLoginSuccess}
      onGoToRegister={() => navigate('/register')}
      sessionExpired={sessionExpired}
      prefillEmail={prefillEmail}
    />
  );
};

const RegisterPage = () => {
  const navigate = useNavigate();
  return <Register onBack={() => navigate('/login')} />;
};

const CheckoutPage = () => {
  const navigate = useNavigate();
  return <Checkout onBack={() => navigate('/')} />;
};

// เครื่องมือวัด P0 ของคิวออฟไลน์ — ไม่ได้ลิงก์จาก UI ไหน เข้าโดยพิมพ์ /probe เท่านั้น
// (ดูหัวไฟล์ Probe.tsx) ล็อกอินก่อนเพราะทุกการวัดเขียนใต้ riders/{uid}/_probe
const ProbePage = () => {
  const navigate = useNavigate();
  return <Probe onBack={() => navigate('/')} />;
};

// Login, but able to hand the rider back to where they were going. Scanning a
// customer's diagnostics QR is the first deep link this app has: without the
// `next` round-trip, a logged-out rider scans, logs in, and lands on the job
// list with no idea what happened to the scan.
const LoginRoute = ({
  authed,
  onLoginSuccess,
  sessionExpired,
  prefillEmail,
}: {
  authed: boolean;
  onLoginSuccess: (id: string) => void;
  sessionExpired: boolean;
  prefillEmail: string | null;
}) => {
  const { search } = useLocation();
  if (authed) {
    const next = new URLSearchParams(search).get('next');
    return <Navigate to={next || '/'} replace />;
  }
  return (
    <LoginPage
      onLoginSuccess={onLoginSuccess}
      sessionExpired={sessionExpired}
      prefillEmail={prefillEmail}
    />
  );
};

const ClaimRoute = ({ riderId, authed }: { riderId: string | null; authed: boolean }) => {
  const location = useLocation();
  if (!riderId || !authed) {
    const next = encodeURIComponent(location.pathname + location.search + location.hash);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <ClaimAssessment riderId={riderId} />;
};

function App() {
  const [riderId, setRiderId] = useState<string | null>(
    localStorage.getItem('rider_id') && localStorage.getItem('device_pin') ? localStorage.getItem('rider_id') : null
  );
  const [authChecked, setAuthChecked] = useState(false);
  // Firebase session หายไปขณะที่เครื่องยังลงทะเบียนอยู่ — ไม่ใช่การออกจากระบบ
  // จึงไม่ล้าง rider_id/device_pin (หลักการข้อ 2) แค่บังคับให้ยืนยันตัวตนใหม่
  const [sessionExpired, setSessionExpired] = useState(false);

  // Verify Firebase Auth session is still valid
  useEffect(() => {
    // เพดานเวลา: ถ้า onAuthStateChanged ไม่ยิงเลย (IDB แขวนบน iOS Safari)
    // setAuthChecked จะไม่มีวันถูกเรียกจากคอลแบ็ก แล้วไรเดอร์จะเห็น spinner
    // ค้างถาวร — นาฬิกาตัวนี้คือคนที่ปลดล็อกสถานะนั้น
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      logAuthEvent(riderId, 'auth_check_timeout', { timeoutMs: AUTH_CHECK_TIMEOUT_MS });
      // ไม่มี user มาถึงในเวลาที่กำหนด = ปฏิบัติเหมือน session หาย: จอล็อกอิน
      // ไม่ใช่ spinner. เครื่องยังลงทะเบียนอยู่เหมือนเดิม
      if (riderId) setSessionExpired(true);
      setAuthChecked(true);
    }, AUTH_CHECK_TIMEOUT_MS);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      settled = true;
      clearTimeout(timer);
      if (!user && riderId) {
        // Firebase Auth หายไปแต่ localStorage ยังบอกว่าล็อกอินอยู่
        //
        // เดิมบรรทัดนี้ลบ rider_id + device_pin ทิ้ง ซึ่งแปลว่า null ตัวเดียว
        // จาก SDK ทำลายการลงทะเบียนเครื่องถาวร และไรเดอร์ต้องกรอกอีเมล +
        // รหัสผ่าน + ตั้ง PIN ใหม่ทั้งชุด. ตอนนี้เก็บการลงทะเบียนไว้แล้วขอแค่
        // รหัสผ่านรอบเดียว — การล้างเป็นสิทธิ์ของการกดออกจากระบบเองกับสัญญาณ
        // จากฝั่ง server เท่านั้น (หลักการข้อ 2)
        logAuthEvent(riderId, 'firebase_session_lost');
        setSessionExpired(true);
      } else if (user) {
        setSessionExpired(false);
      }
      setAuthChecked(true);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [riderId]);

  // Auto-logout after 30 min of inactivity
  useAutoLogout(!!riderId);

  // Pending chat jobId from notification tap
  const [pendingChatJobId, setPendingChatJobId] = useState<string | null>(null);

  // Check URL params for openChat (from background notification tap when app was closed)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const openChat = params.get('openChat');
    if (openChat) {
      setPendingChatJobId(openChat);
      // Clean up URL
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const handleNotificationOpenChat = useCallback((jobId: string) => {
    setPendingChatJobId(jobId);
  }, []);

  // Setup push notifications with chat deep linking
  usePushNotifications(riderId, handleNotificationOpenChat);

  // Wait for auth check before rendering
  if (!authChecked) return <LoadingSpinner />;

  const handleLoginSuccess = (id: string) => {
    if (sessionExpired) logAuthEvent(id, 'session_recovered');
    setSessionExpired(false);
    setRiderId(id);
  };

  const handleLogout = () => {
    setSessionExpired(false);
    setRiderId(null);
  };

  // "เข้าใช้งานได้" = เครื่องลงทะเบียนอยู่ **และ** Firebase session ยังใช้ได้
  // แยกจาก riderId เพราะ riderId คือการลงทะเบียนเครื่องซึ่งอยู่ต่อได้ข้าม
  // session ที่หมดอายุ (หลักการข้อ 1: Firebase คือแหล่งความจริงของการล็อกอิน
  // ส่วน PIN เป็นแค่กลอนในเครื่อง)
  const authed = !!riderId && !sessionExpired;

  return (
    <ErrorBoundary>
      <ToastContainer />
      <OfflineBanner />
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <LoginRoute
                authed={authed}
                onLoginSuccess={handleLoginSuccess}
                sessionExpired={sessionExpired}
                prefillEmail={localStorage.getItem('rider_email')}
              />
            }
          />
          <Route
            path="/claim/:assessmentId"
            element={<ClaimRoute riderId={riderId} authed={authed} />}
          />
          <Route
            path="/register"
            element={
              authed ? <Navigate to="/" replace /> : <RegisterPage />
            }
          />
          <Route
            path="/checkout"
            element={
              authed ? <CheckoutPage /> : <Navigate to="/login" replace />
            }
          />
          <Route
            path="/"
            element={
              authed && riderId
                ? <RiderApp
                    currentRiderId={riderId}
                    onLogout={handleLogout}
                    pendingChatJobId={pendingChatJobId}
                    onClearPendingChat={() => setPendingChatJobId(null)}
                  />
                : <Navigate to="/login" replace />
            }
          />
          <Route
            path="/probe"
            element={riderId ? <ProbePage /> : <Navigate to="/login" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
