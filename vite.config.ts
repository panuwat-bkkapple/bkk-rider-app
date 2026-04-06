import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// Plugin to inject Firebase env vars into the service worker at build time
function firebaseSWPlugin(): Plugin {
  return {
    name: 'firebase-sw-env',
    writeBundle() {
      const swPath = resolve(__dirname, 'dist/firebase-messaging-sw.js');
      try {
        let sw = readFileSync(swPath, 'utf-8');
        const replacements: Record<string, string | undefined> = {
          '__FIREBASE_API_KEY__': process.env.VITE_FIREBASE_API_KEY,
          '__FIREBASE_AUTH_DOMAIN__': process.env.VITE_FIREBASE_AUTH_DOMAIN,
          '__FIREBASE_PROJECT_ID__': process.env.VITE_FIREBASE_PROJECT_ID,
          '__FIREBASE_STORAGE_BUCKET__': process.env.VITE_FIREBASE_STORAGE_BUCKET,
          '__FIREBASE_MESSAGING_SENDER_ID__': process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
          '__FIREBASE_APP_ID__': process.env.VITE_FIREBASE_APP_ID,
        };
        for (const [placeholder, value] of Object.entries(replacements)) {
          if (value) sw = sw.replace(placeholder, value);
        }
        writeFileSync(swPath, sw);
      } catch {
        // SW file may not exist in dev mode
      }
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), firebaseSWPlugin()],
})
