/**
 * Renders the 1200x630 social preview card into docs/social.png.
 *
 * Every shared run opens a link, and the card is what people see before they decide whether to
 * tap it — so at this budget it is doing as much acquisition work as the store listing. Drawn
 * in the game's own language (uncoated stock, two inks, one circle and one diamond
 * overprinting where they cross) rather than a gameplay screenshot, because a screenshot of a
 * busy course is unreadable at feed size.
 *
 * Usage: node scripts/social.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchChromium } from "./browser.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const docs = join(root, "docs");
mkdirSync(docs, { recursive: true });

const fontData = readFileSync(join(root, "src", "assets", "anton-latin.woff2")).toString("base64");

const card = `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: "Anton";
    src: url(data:font/woff2;base64,${fontData}) format("woff2");
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; overflow: hidden;
    background: #ede7d6;
    font-family: "Anton", Impact, sans-serif;
    position: relative;
  }
  /* The shaded margins and rules the game prints down both sides of the track. */
  .margin { position: absolute; top: 0; bottom: 0; width: 118px; background: #ded6c1; }
  .margin.l { left: 0; border-right: 6px solid #17150f; }
  .margin.r { right: 0; border-left: 6px solid #17150f; }

  .inner { position: absolute; inset: 0 118px; padding: 54px 58px; display: flex;
           align-items: center; gap: 40px; }
  .copy { flex: 1 1 auto; min-width: 0; }

  h1 { font-size: 116px; line-height: 0.86; letter-spacing: 0.005em; color: #17150f;
       text-transform: uppercase;
       /* Misregistration: the two ink plates a hair out of true, printed under the key
          plate. The same trick the in-game masthead uses. */
       text-shadow: -6px 5px 0 #0f5fbf, 5px -4px 0 #ea4327; }

  p { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-weight: 700;
      font-size: 27px; line-height: 1.34; color: #17150f; margin-top: 34px; }
  em { font-style: normal; background: #ea4327; color: #ede7d6; padding: 1px 8px; }

  .marks { flex: 0 0 250px; height: 290px; position: relative; }
  .disc { position: absolute; width: 168px; height: 168px; border-radius: 50%;
          background: #0f5fbf; border: 8px solid #17150f; left: 0; top: 8px;
          mix-blend-mode: multiply; }
  .dia { position: absolute; width: 152px; height: 152px; background: #ea4327;
         border: 8px solid #17150f; right: 4px; bottom: 20px; transform: rotate(45deg);
         mix-blend-mode: multiply; }
</style>
<div class="margin l"></div>
<div class="margin r"></div>
<div class="inner">
  <div class="copy">
    <h1>Magnet<br>Metro</h1>
    <p>One tap changes your colour.<br>Your colour feeds you &mdash; the other one <em>kills you</em>.</p>
  </div>
  <div class="marks">
    <div class="disc"></div>
    <div class="dia"></div>
  </div>
</div>
`;

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(card, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(200);
const out = join(docs, "social.png");
await page.screenshot({ path: out });
await browser.close();

const kb = (readFileSync(out).length / 1024).toFixed(1);
console.log(`Wrote docs/social.png (1200x630, ${kb} kB)`);
