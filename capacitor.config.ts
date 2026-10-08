import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Reverse-DNS application id. Must stay stable across releases: changing it
  // makes Android treat the new build as a different app (no in-place update).
  // This id is also what the Firebase Android app + SHA-1 fingerprints are
  // registered against, so keep the three in sync.
  appId: 'com.sschedule.app',
  appName: 'SSchedule',
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
    // Only Google is needed; disabling the rest keeps the native APK smaller.
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: false,
        twitter: false,
      },
    },
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#4F46E5',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    LocalNotifications: {
      smallIcon: 'ic_launcher_round',
      iconColor: '#4F46E5',
    },
  },
};

export default config;
