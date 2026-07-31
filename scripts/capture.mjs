/**
 * Produces marketing assets from the real game: vertical gameplay video and store
 * screenshots, captured from demo mode so no phone, camera or human thumb is involved.
 *
 * Why this exists: every channel that matters — TikTok, Reels, Shorts, App Store, Play —
 * wants vertical video and portrait screenshots, and hand-filming a phone produces glare,
 * moiré and inconsistent framing. Capturing the canvas directly is cleaner and repeatable, so
 * creative can be iterated in minutes rather than re-shot.
 *
 * Usage:
 *   node scripts/capture.mjs            # video + screenshots at every store size
 *   node scripts/capture.mjs --seconds 30
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, renameSync, readdirSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "marketing");
mkdirSync(out, { recursive: true });

const args = process.argv.slice(2);
const seconds = Number(args[args.indexOf("--seconds") + 1]) || 22;
const gameUrl = `file://${join(root, "dist", "standalone.html")}?demo=1`;

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/**
 * Store screenshot sizes. Both stores reject uploads at the wrong dimensions, and these are
 * the two that satisfy the widest set of device classes.
 */
const SHOT_SIZES = [
  { name: "ios-6.7in", width: 1290, height: 2796 },
  { name: "ios-6.5in", width: 1242, height: 2688 },
  { name: "android-phone", width: 1080, height: 1920 },
];

// ---------------------------------------------------------------------------
// Video: a single unbroken run at 1080x1920, the aspect every vertical feed wants.
// ---------------------------------------------------------------------------

const videoBrowser = await chromium.launch({ executablePath: CHROME });
const videoContext = await videoBrowser.newContext({
  viewport: { width: 540, height: 960 },
  deviceScaleFactor: 2,
  recordVideo: { dir: out, size: { width: 1080, height: 1920 } },
});
const videoPage = await videoContext.newPage();
await videoPage.goto(gameUrl);

// Let the opening lesson pass before filming the part worth watching: the first seconds are
// instructional, and an ad has about two seconds to earn attention.
await videoPage.waitForTimeout(seconds * 1000);

await videoPage.close();
await videoContext.close();
await videoBrowser.close();

const produced = readdirSync(out).filter((f) => f.endsWith(".webm"));
if (produced.length > 0) {
  const latest = produced.sort().at(-1);
  renameSync(join(out, latest), join(out, "gameplay-1080x1920.webm"));
  console.log(`wrote marketing/gameplay-1080x1920.webm (${seconds}s)`);
}

// ---------------------------------------------------------------------------
// Screenshots: caught mid-run at each store size, when the screen is actually busy.
// ---------------------------------------------------------------------------

const shotBrowser = await chromium.launch({ executablePath: CHROME });

for (const size of SHOT_SIZES) {
  // Render at half the pixel dimensions with a 2x scale factor, so text and linework are
  // crisp at the final size rather than upscaled.
  const page = await shotBrowser.newPage({
    viewport: { width: Math.round(size.width / 2), height: Math.round(size.height / 2) },
    deviceScaleFactor: 2,
  });
  await page.goto(gameUrl);

  // Far enough in that the chain is long and the screen is full.
  await page.waitForTimeout(17000);
  await page.screenshot({ path: join(out, `shot-${size.name}-play.png`) });

  // And the menu, which is where the print identity reads most clearly.
  await page.goto(`file://${join(root, "dist", "standalone.html")}`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(out, `shot-${size.name}-menu.png`) });

  await page.close();
  console.log(`wrote marketing/shot-${size.name}-*.png (${size.width}x${size.height})`);
}

await shotBrowser.close();
console.log("\nDone. Assets in marketing/");
