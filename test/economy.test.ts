/**
 * Guards the shop's pacing.
 *
 * Endless runs have no length limit while the shop has a fixed price, so a flat scrap rate
 * makes distance a printing press. A maxed drone once banked 31,750 from a single endless run
 * against a 287,000 shop — nine runs to own everything, which would have silently undone every
 * other economy decision. This asserts the shape rather than the exact numbers.
 */
import { UPGRADES, scrapFromScore, upgradeCost } from "../src/game/progression";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

let shop = 0;
// Editions are earned in the campaign, not bought, so the shop is upgrades only.
for (const d of UPGRADES) for (let l = 0; l < d.maxLevel; l++) shop += upgradeCost(d, l);

console.log("Economy checks\n");
console.log(`  full shop: ${shop.toLocaleString()} scrap\n`);

// A strong bounded run — roughly what a skilled player with upgrades produces.
const boundedGood = scrapFromScore(50000, false);
// A very long endless run, the kind that would break a flat rate.
const endlessHuge = scrapFromScore(320000, true);

check(
  "a full shop takes many runs, not an evening",
  shop / boundedGood > 40,
  `${Math.round(shop / boundedGood)} strong runs`,
);
check(
  "an enormous endless run cannot buy the shop quickly",
  shop / endlessHuge > 40,
  `${Math.round(shop / endlessHuge)} runs at ${endlessHuge.toLocaleString()} scrap each`,
);
check(
  "endless still pays more for going further",
  scrapFromScore(120000, true) > scrapFromScore(45000, true),
  "longer runs must be worth more",
);
check(
  "but with clearly diminishing returns",
  scrapFromScore(320000, true) < scrapFromScore(80000, true) * 2,
  "four times the score must not pay four times the scrap",
);
check(
  "short runs are unaffected by the taper",
  scrapFromScore(18000, true) === scrapFromScore(18000, false),
  "below the cap both modes pay the same",
);

console.log(failures === 0 ? "\nEconomy pacing holds." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
