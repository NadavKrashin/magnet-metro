/**
 * Renders the app icon and splash art in the game's own print language.
 *
 * The mark is the game's rule in one image: a blue circle and a red diamond overlapping, with
 * the overprint where they cross. Anyone who has played for ten seconds recognises it, and it
 * still reads at 48px on a home screen because it is two flat shapes and a keyline.
 *
 * Usage: node scripts/icon.mjs   →   resources/icon.png, resources/splash.png
 */
import { launchChromium } from "./browser.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "resources");
mkdirSync(out, { recursive: true });

const PAPER = "#EDE7D6";
const BLUE = "#0F5FBF";
const RED = "#EA4327";
const KEY = "#17150F";

/** Draws the mark into a canvas of the given size, centred, at `scale` of the short edge. */
const draw = `(w, h, markScale, bleed) => {
  const c = document.getElementById("c");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d");

  x.fillStyle = "${PAPER}";
  x.fillRect(0, 0, w, h);

  // Paper grain, so the icon matches the game rather than looking like a flat logo.
  const g = x.createImageData(w, h);
  for (let i = 0; i < g.data.length; i += 4) {
    const n = 226 + Math.random() * 30;
    g.data[i] = g.data[i + 1] = g.data[i + 2] = n;
    g.data[i + 3] = 26;
  }
  x.putImageData3 = null;
  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;
  tmp.getContext("2d").putImageData(g, 0, 0);
  x.globalCompositeOperation = "multiply";
  x.drawImage(tmp, 0, 0);
  x.globalCompositeOperation = "source-over";

  const s = Math.min(w, h) * markScale;
  const cx = w / 2;
  const cy = h / 2;
  const off = s * 0.26;
  const mis = s * 0.035;

  x.globalCompositeOperation = "multiply";
  x.lineJoin = "round";

  // Blue circle, colour plate then key plate a hair off register.
  x.fillStyle = "${BLUE}";
  x.beginPath();
  x.arc(cx - off + mis, cy - mis, s * 0.5, 0, Math.PI * 2);
  x.fill();

  // Red diamond, overlapping so the crossing area overprints.
  x.fillStyle = "${RED}";
  x.beginPath();
  x.moveTo(cx + off + mis, cy - s * 0.62 - mis);
  x.lineTo(cx + off + s * 0.62 + mis, cy - mis);
  x.lineTo(cx + off + mis, cy + s * 0.62 - mis);
  x.lineTo(cx + off - s * 0.62 + mis, cy - mis);
  x.closePath();
  x.fill();

  x.strokeStyle = "${KEY}";
  x.lineWidth = s * 0.075;
  x.beginPath();
  x.arc(cx - off, cy, s * 0.5, 0, Math.PI * 2);
  x.stroke();
  x.beginPath();
  x.moveTo(cx + off, cy - s * 0.62);
  x.lineTo(cx + off + s * 0.62, cy);
  x.lineTo(cx + off, cy + s * 0.62);
  x.lineTo(cx + off - s * 0.62, cy);
  x.closePath();
  x.stroke();

  x.globalCompositeOperation = "source-over";
  if (bleed) return;

  // Knockout in the circle, matching how the drone is drawn in play.
  x.fillStyle = "${PAPER}";
  x.beginPath();
  x.arc(cx - off, cy, s * 0.19, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = "${KEY}";
  x.lineWidth = s * 0.06;
  x.beginPath();
  x.arc(cx - off, cy, s * 0.19, 0, Math.PI * 2);
  x.stroke();
}`;

const browser = await launchChromium();
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

async function render(w, h, markScale, bleed, file) {
  await page.evaluate(
    ([fn, ww, hh, ms, bl]) => new Function("return " + fn)()(ww, hh, ms, bl),
    [draw, w, h, markScale, bleed],
  );
  const buf = await page.locator("#c").screenshot({ omitBackground: false });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(out, file), buf);
  console.log(`wrote resources/${file} (${w}x${h})`);
}

// Store icon: the mark filling most of the tile.
await render(1024, 1024, 0.5, false, "icon.png");
// Splash: same mark, small, on a lot of stock, so it survives every aspect ratio crop.
await render(2732, 2732, 0.13, false, "splash.png");

await browser.close();
