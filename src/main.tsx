import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initNativeApp } from './lib/native';

createRoot(document.getElementById('root')!).render(<App />);

// Configures the status bar / splash screen and the hardware back button when
// the app runs inside the Android (or iOS) shell. No-op on the web.
void initNativeApp();

