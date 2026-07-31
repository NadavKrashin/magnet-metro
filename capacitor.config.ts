import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // Reverse-DNS bundle identifier. This must match the App ID registered in App Store Connect
  // and the package name in the Play Console, and it cannot be changed after first release.
  appId: "com.magnetmetro.game",
  appName: "Magnet Metro",
  webDir: "dist",
  android: {
    // The game draws its own background; letting the webview go transparent would show
    // the native window behind it during orientation and resume transitions.
    backgroundColor: "#080d18",
  },
  ios: {
    backgroundColor: "#080d18",
    // The canvas handles its own safe-area padding via CSS, so the webview should extend
    // under the notch rather than being letterboxed by the system.
    contentInset: "never",
  },
  server: {
    // Capacitor serves the built files over a local scheme, never over the network.
    androidScheme: "https",
  },
};

export default config;
