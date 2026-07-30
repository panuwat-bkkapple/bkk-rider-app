import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initNativeShell } from './native'

// เตรียมเปลือก native (status bar / safe area / splash) ก่อน mount —
// no-op เมื่อรันบนเว็บหรือ PWA
void initNativeShell()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
