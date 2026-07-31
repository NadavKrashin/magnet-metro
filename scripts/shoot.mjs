/**
 * Loads the built game in a headless phone-sized browser, plays it with a scripted thumb, and
 * saves screenshots.
 *
 * This exists because the art direction cannot be verified by reading the code. It also
 * catches the class of bug that never reaches the unit tests: a canvas API that throws, an
 * element that is missing, a composite mode that silently blanks the page.
 *
 * Usage: node scripts/shoot.mjs
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "shots");
mkdirSync(outDir, { recursive: true });

// The preinstalled browser in this environment does not match the npm package's expected
// build number, so point at it explicitly rather than downloading a second copy.
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

await page.goto(`file://${join(root, "dist", "standalone.html")}`);
await page.waitForTimeout(400);
await page.screenshot({ path: join(outDir, "1-menu.png") });

// Start the first mechanic.
await page.locator(".mech").first().click();
await page.waitForTimeout(500);
await page.screenshot({ path: join(outDir, "2-opening.png") });

// Scripted thumb: drag across the lane and tap periodically, so the shots show real play
// with a chain built up rather than an empty opening screen.
const cx = 195;
const cy = 620;
for (let i = 0; i < 26; i++) {
  await page.mouse.move(cx + Math.sin(i / 2.2) * 120, cy);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await page.waitForTimeout(260);
}
await page.screenshot({ path: join(outDir, "3-play.png") });

// Frame budget check. The print look composites a lot of multiply passes, and a phone is a
// far weaker machine than this one, so a regression here matters.
const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const times = [];
      let last = performance.now();
      let n = 0;
      const tick = () => {
        const now = performance.now();
        times.push(now - last);
        last = now;
        if (++n < 90) requestAnimationFrame(tick);
        else {
          times.sort((a, b) => a - b);
          resolve({
            median: times[Math.floor(times.length / 2)],
            worst: times[times.length - 1],
          });
        }
      };
      requestAnimationFrame(tick);
    }),
);
console.log(
  `frame time: median ${fps.median.toFixed(1)}ms, worst ${fps.worst.toFixed(1)}ms`,
);

await page.waitForTimeout(9000);
await page.screenshot({ path: join(outDir, "4-later.png") });

// Let the run finish so the results sheet gets captured too.
await page.waitForTimeout(26000);
await page.screenshot({ path: join(outDir, "5-results.png") });

await browser.close();

if (errors.length) {
  console.error(`\n${errors.length} runtime error(s):`);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
console.log("No runtime errors. Screenshots in shots/");
