/**
 * End-to-end check that a returning player gets their progress back.
 *
 * Storage moved behind an async hydrate step so it could write through to native Preferences,
 * and the failure mode of getting that wrong is silent and severe: the game would construct a
 * blank save before the real one had loaded, and a player would open the app to find their
 * levels and scrap gone. That is not something to verify by reading the code.
 *
 * Usage: node scripts/persist-check.mjs
 */
import { launchChromium } from "./browser.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = `file://${join(root, "dist", "standalone.html")}`;

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(url);
await page.waitForTimeout(400);

// Write a save the way a real session would leave one, then reload as a returning player.
await page.evaluate(() => {
  localStorage.setItem(
    "mm_save_v2",
    JSON.stringify({
      scrap: 51234,
      lifetimeScrap: 90000,
      upgrades: { coil: 3, hull: 1 },
      ownedEditions: ["federal", "riot"],
      edition: "riot",
      runs: 22,
      dailyDate: "",
      dailyBest: 0,
      contracts: [],
      levelsDone: 7,
    }),
  );
});
await page.reload();
await page.waitForTimeout(500);

const seen = await page.evaluate(() => ({
  bank: document.getElementById("bank-value")?.textContent ?? "",
  levels: document.getElementById("levels-note")?.textContent ?? "",
  // The equipped edition must be applied before the first paint, or the game flashes the
  // default stock and then re-inks itself.
  paper: getComputedStyle(document.documentElement).getPropertyValue("--paper").trim(),
}));

let failures = 0;
function check(name, ok, detail) {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name} — ${detail}`);
  }
}

console.log("Persistence checks\n");
check("banked scrap survives a reload", seen.bank.replace(/[^0-9]/g, "") === "51234", `saw "${seen.bank}"`);
check("level progress survives a reload", seen.levels.includes("8"), `saw "${seen.levels}"`);
check("equipped edition is applied at boot", seen.paper.toLowerCase() === "#f2ede4", `saw "${seen.paper}"`);
check("no runtime errors", errors.length === 0, errors.join("; "));

await browser.close();
console.log(failures === 0 ? "\nProgress persists correctly." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
