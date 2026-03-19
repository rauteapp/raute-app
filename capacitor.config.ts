import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.raute.app',
  appName: 'Raute',
  webDir: 'out',
  plugins: {
    CapacitorHttp: {
      enabled: false, // We use CapacitorHttp.request() directly in the Supabase client
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '825364238291-kl4rcgm7oqh58l28lilbtujvkr245bjp.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'LIGHT', // Dark text on light background (default)
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#f8fafc', // slate-50
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  // Deep linking for OAuth redirects
  server: {
    androidScheme: 'https',
  }
};

export default config;
