import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { RiderApp } from './pages/RiderApp';
import { Login } from './pages/Login';
import { Register } from './pages/Register';

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

function App() {
  const [riderId, setRiderId] = useState<string | null>(
    localStorage.getItem('rider_id') && localStorage.getItem('device_pin') ? localStorage.getItem('rider_id') : null
  );

  const handleLoginSuccess = (id: string) => {
    setRiderId(id);
  };

  const handleLogout = () => {
    setRiderId(null);
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            riderId ? <Navigate to="/" replace /> : <LoginPage onLoginSuccess={handleLoginSuccess} />
          }
        />
        <Route
          path="/register"
          element={
            riderId ? <Navigate to="/" replace /> : <RegisterPage />
          }
        />
        <Route
          path="/"
          element={
            riderId
              ? <RiderApp currentRiderId={riderId} onLogout={handleLogout} />
              : <Navigate to="/login" replace />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
