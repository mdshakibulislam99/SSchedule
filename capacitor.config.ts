import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Reverse-DNS application id. Must stay stable across releases: changing it
  // makes Android treat the new build as a different app (no in-place update).
  appId: 'com.chronopulse.ai',
  appName: 'ChronoPulse AI',
  // Vite outputs the production bundle here, and Capacitor copies it into
  // android/app/src/main/assets/public during `cap sync`.
  webDir: 'dist',
  android: {
    backgroundColor: '#4F46E5',
  },
  server: {
    // Serves the bundled assets over https://localhost inside the WebView so the
    // app gets a secure origin (required for service workers, crypto, etc.).
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#4F46E5',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;
