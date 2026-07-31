import { defineConfig } from "vite";

export default defineConfig({
  // Relative paths so the same build works from a web server and from the native
  // Capacitor container, which serves over a custom scheme rather than from a domain root.
  base: "./",
  build: {
    outDir: "dist",
    target: "es2020",
    assetsInlineLimit: 8192,
  },
  server: {
    host: true,
  },
});
