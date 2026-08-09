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
import { launchChromium } from "./browser.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "shots");
mkdirSync(outDir, { recursive: true });

const browser = await launchChromium();
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

// Give the shop something to show, then capture both tabs.
await page.evaluate(() => {
  localStorage.setItem(
    "mm_save_v2",
    JSON.stringify({
      scrap: 42000,
      lifetimeScrap: 42000,
      upgrades: { coil: 2, claw: 1 },
      ownedEditions: ["federal", "riot"],
      edition: "federal",
      runs: 7,
      levelsDone: 8,
    }),
  );
});
await page.reload();
await page.waitForTimeout(300);
await page.locator("#btn-shop").click();
await page.waitForTimeout(250);
await page.screenshot({ path: join(outDir, "6-shop-upgrades.png") });
await page.locator("#tab-editions").click();
await page.waitForTimeout(250);
await page.screenshot({ path: join(outDir, "7-shop-editions.png") });
await page.locator("#btn-shop-close").click();
await page.waitForTimeout(250);
await page.locator("#btn-levels").click();
await page.waitForTimeout(300);
await page.screenshot({ path: join(outDir, "8-levels.png") });
await page.locator("#btn-levels-close").click();
await page.waitForTimeout(250);
await page.locator("#btn-settings").click();
await page.waitForTimeout(300);
await page.screenshot({ path: join(outDir, "9-settings.png") });
await page.locator("#btn-settings-close").click();
await page.waitForTimeout(250);

// Start the first mechanic.
await page.locator("#btn-free").click();
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

// Pause has to actually stop the world, not just cover it.
await page.locator("#btn-pause").click();
await page.waitForTimeout(400);
await page.screenshot({ path: join(outDir, "10-paused.png") });
const frozen = await page.evaluate(async () => {
  const read = () => document.getElementById("paused-score").textContent;
  const before = read();
  await new Promise((r) => setTimeout(r, 700));
  return { before, after: read() };
});
if (frozen.before !== frozen.after) {
  errors.push(`pause did not stop the run: ${frozen.before} -> ${frozen.after}`);
} else {
  console.log(`pause holds the run at ${frozen.before}`);
}
await page.locator("#btn-resume").click();
await page.waitForTimeout(300);

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

/**
 * The last two shots wait for the run to reach a state, rather than for a number of seconds.
 *
 * They used to sleep for 9 and 26 seconds. The run ends in about 21 — so the first sleep
 * photographed a results sheet instead of the deep-run shot it is named for, and the second
 * photographed the same sheet 26 seconds later. The two files came out byte-identical, which
 * is how it was found: two of the five gameplay screenshots were one image, and the deep-run
 * shot did not exist at all.
 *
 * How long the run lasts is a property of the course and of how long an unattended drone
 * survives it, so no constant can be right. It is also 35 seconds of a 55-second script, paid
 * once locally and twice more in CI on every deploy.
 */

// Deep in the same run: a longer tail, a faster course, more on screen. Resolves early if the
// drone dies first, so a short run cannot hang the script.
const deep = await page
  .waitForFunction(
    () => {
      const over = !document.getElementById("results").classList.contains("hidden");
      // Endless runs print "859 m"; the leading number is the distance either way.
      const metres = parseInt(document.getElementById("objective-progress").textContent, 10) || 0;
      return over || metres >= 500 ? { over, metres } : null;
    },
    null,
    { timeout: 60_000 },
  )
  .then((handle) => handle.jsonValue());

if (deep.over) {
  // Not fatal — but the file on disk is now from a previous run, and a stale store asset that
  // looks fresh is worse than a missing one. Say so rather than leaving it to be noticed later.
  rmSync(join(outDir, "4-later.png"), { force: true });
  console.warn(`deep-run shot skipped: the run ended at ${deep.metres} m, before the 500 m mark`);
} else {
  await page.screenshot({ path: join(outDir, "4-later.png") });
  console.log(`deep-run shot at ${deep.metres} m`);
}

// And the results sheet, the moment it is actually up.
await page.waitForSelector("#results:not(.hidden)", { timeout: 60_000 });
await page.screenshot({ path: join(outDir, "5-results.png") });

await browser.close();

if (errors.length) {
  console.error(`\n${errors.length} runtime error(s):`);
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
console.log("No runtime errors. Screenshots in shots/");
