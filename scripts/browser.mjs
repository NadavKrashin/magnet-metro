/**
 * Launching Chromium from a script, in a way that works both on a developer's machine and on
 * a CI runner.
 *
 * The scripts here used to hardcode an absolute path to a particular Chromium build. That
 * works on exactly one machine: it hardcodes both the install location *and* the browser
 * revision, so it breaks when Playwright is upgraded and it cannot run in CI at all — which
 * is why the browser-driven checks were never part of an automated build.
 *
 * Three strategies, in order:
 *   1. PLAYWRIGHT_CHROMIUM, if you want to point at a specific binary.
 *   2. Playwright's own resolution. This is the CI path: after `playwright install chromium`
 *      the revision matches the library and no path needs to be known.
 *   3. Whatever Chromium is actually present in the browsers directory. This is the fallback
 *      for preinstalled sandboxes, where the available build often does not match the
 *      revision this version of Playwright expects.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

/** Any Chromium in the browsers directory, newest revision first. */
function findInstalledChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!existsSync(base)) return null;

  const candidates = readdirSync(base)
    .filter((d) => d.startsWith("chromium-"))
    .map((d) => ({ dir: d, rev: Number(d.split("-")[1]) || 0 }))
    .sort((a, b) => b.rev - a.rev);

  // Layouts differ between Playwright versions and platforms, so try the known ones.
  const layouts = [
    ["chrome-linux", "chrome"],
    ["chrome-linux64", "chrome"],
    ["chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"],
    ["chrome-win", "chrome.exe"],
  ];

  for (const { dir } of candidates) {
    for (const parts of layouts) {
      const exe = join(base, dir, ...parts);
      if (existsSync(exe)) return exe;
    }
  }
  return null;
}

/**
 * Launch Chromium, or throw with an error that says what to do about it.
 *
 * `options` is passed straight through to Playwright, so callers keep control of headless
 * mode, recording, and anything else.
 */
export async function launchChromium(options = {}) {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM;
  if (explicit) return chromium.launch({ ...options, executablePath: explicit });

  try {
    return await chromium.launch(options);
  } catch (err) {
    const found = findInstalledChromium();
    if (!found) {
      throw new Error(
        `Could not launch Chromium.\n\n${err.message}\n\n` +
          "Install the browser Playwright expects:\n" +
          "  npx playwright install chromium\n\n" +
          "Or point at an existing binary:\n" +
          "  PLAYWRIGHT_CHROMIUM=/path/to/chrome node scripts/…",
      );
    }
    return chromium.launch({ ...options, executablePath: found });
  }
}
