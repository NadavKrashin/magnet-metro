import { defineConfig } from "vite";

export default defineConfig({
  // Relative paths so the same build works from a web server and from the native
  // Capacitor container, which serves over a custom scheme rather than from a domain root.
  base: "./",
  build: {
    outDir: "dist",
    target: "es2020",
    // High enough that the bundled display font becomes a data: URI inside the CSS, which is
    // what keeps scripts/inline.mjs able to produce one genuinely self-contained HTML file.
    assetsInlineLimit: 32768,
  },
  server: {
    host: true,
  },
});
