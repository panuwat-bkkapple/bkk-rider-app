import { useState } from 'react';
import { RiderApp } from './pages/RiderApp';
import { Login } from './pages/Login';
import { Register } from './pages/Register';

function App() {
  const [riderId, setRiderId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'login' | 'register'>('login');

  if (riderId) {
    return <RiderApp currentRiderId={riderId} onLogout={() => setRiderId(null)} />;
  }

  if (currentView === 'register') {
    return <Register onBack={() => setCurrentView('login')} />;
  }

  return (
    <Login 
      onLoginSuccess={(id) => setRiderId(id)} 
      onGoToRegister={() => setCurrentView('register')} 
    />
  );
}

export default App;