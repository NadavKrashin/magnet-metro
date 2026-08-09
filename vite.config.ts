import { execSync } from "node:child_process";
import { defineConfig } from "vite";

/**
 * The commit this build came from, stamped into the page.
 *
 * The version string was a hardcoded "1.0.0" that had never changed, so when a play report
 * described behaviour that had already been fixed there was no way for either side to tell
 * whether the device was running the new build or a cached copy of the old one. On a
 * home-screen install there is not even a reload button to reach for. A build id turns
 * "which version are you on" from a guess into a thing you can read off the Settings screen.
 */
function buildId(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    // Building from a tarball or a shallow checkout with no git. Not worth failing over.
    return "local";
  }
}

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },
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
