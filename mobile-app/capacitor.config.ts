import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.vinylscan.app",
  appName: "VinylScan",
  webDir: "dist",
  server: {
    // For local dev: point to running backend via LAN
    // Remove this block for App Store release (uses bundled dist/)
    // androidScheme: "https",
  },
  ios: {
    // "never": webview goes fully edge-to-edge, safe areas handled by our own CSS
    // (viewport-fit=cover + env(safe-area-inset-*)). "always" double-reserves native
    // insets on top of that, which is what left the black gap at the bottom.
    contentInset: "never",
    allowsInlineMediaPlayback: true,
    allowsAirPlayForMediaPlayback: false,
    scrollEnabled: false,
  },
  plugins: {
    CapacitorHttp: {
      enabled: false,
    },
    Camera: {
      // permissions handled in Info.plist
    },
    SplashScreen: {
      launchShowDuration: 0,
    },
    StatusBar: {
      style: "dark",
      backgroundColor: "#0f1117",
    },
  },
};

export default config;
