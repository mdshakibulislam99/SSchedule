import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initNativeApp } from './lib/native';

createRoot(document.getElementById('root')!).render(<App />);

// Register the notification service worker. Mobile browsers cannot construct
// system notifications directly (the Notification() constructor throws there),
// so notifications are shown through this worker's showNotification() instead.
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // Non-fatal: system notifications fall back to the constructor path.
  });
}

// Configures the status bar / splash screen and the hardware back button when
// the app runs inside the Android (or iOS) shell. No-op on the web.
void initNativeApp();

