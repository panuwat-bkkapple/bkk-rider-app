import { useState, useEffect, useCallback } from 'react';
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

// Wrapper to use navigate hooks inside components
const LoginPage = ({ onLoginSuccess }: { onLoginSuccess: (id: string) => void }) => {
  const navigate = useNavigate();
  return (
    <Login
      onLoginSuccess={onLoginSuccess}
      onGoToRegister={() => navigate('/register')}
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
  riderId,
  onLoginSuccess,
}: {
  riderId: string | null;
  onLoginSuccess: (id: string) => void;
}) => {
  const { search } = useLocation();
  if (riderId) {
    const next = new URLSearchParams(search).get('next');
    return <Navigate to={next || '/'} replace />;
  }
  return <LoginPage onLoginSuccess={onLoginSuccess} />;
};

const ClaimRoute = ({ riderId }: { riderId: string | null }) => {
  const location = useLocation();
  if (!riderId) {
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

  // Verify Firebase Auth session is still valid
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user && riderId) {
        // Firebase Auth expired but localStorage thinks we're logged in → force re-login
        console.warn('Firebase Auth session expired, clearing local session');
        localStorage.removeItem('rider_id');
        localStorage.removeItem('device_pin');
        setRiderId(null);
      }
      setAuthChecked(true);
    });
    return () => unsubscribe();
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
    setRiderId(id);
  };

  const handleLogout = () => {
    setRiderId(null);
  };

  return (
    <ErrorBoundary>
      <ToastContainer />
      <OfflineBanner />
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={<LoginRoute riderId={riderId} onLoginSuccess={handleLoginSuccess} />}
          />
          <Route path="/claim/:assessmentId" element={<ClaimRoute riderId={riderId} />} />
          <Route
            path="/register"
            element={
              riderId ? <Navigate to="/" replace /> : <RegisterPage />
            }
          />
          <Route
            path="/checkout"
            element={
              riderId ? <CheckoutPage /> : <Navigate to="/login" replace />
            }
          />
          <Route
            path="/"
            element={
              riderId
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
