import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initNativeApp } from './lib/native';
import { ErrorBoundary } from './components/common/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

// Configures the status bar / splash screen and the hardware back button when
// the app runs inside the Android (or iOS) shell. No-op on the web.
void initNativeApp();

