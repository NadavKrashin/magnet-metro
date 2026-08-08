/**
 * Guards the shop's pacing.
 *
 * Endless runs have no length limit while the shop has a fixed price, so a flat scrap rate
 * makes distance a printing press. A maxed drone once banked 31,750 from a single endless run
 * against a 287,000 shop — nine runs to own everything, which would have silently undone every
 * other economy decision. This asserts the shape rather than the exact numbers.
 */
import {
  CONTRACTS,
  UPGRADES,
  haulFor,
  loadSave,
  scrapFromScore,
  upgradeCost,
} from "../src/game/progression";

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


/**
 * What the campaign pays.
 *
 * A play report: "the scrap collected from the levels is way too much, I just did 5 levels and
 * got 50000 scrap which is enough to buy most of the store." Measured with the autopilot, six
 * levels paid 57,435 against a 240,406 shop — a quarter of everything for sale in six runs.
 *
 * The dominant term was not the level bonuses at all. It was contracts: three of the six had a
 * target of 1 and paid 3,000-5,000, three are active at once, and an ordinary course satisfies
 * all three — so a "contract" was really a per-run bonus of eight to twelve thousand that
 * refilled and paid again immediately. 39,600 of that 57,435 was contracts, against 12,635 of
 * actual run haul.
 */
const CAMPAIGN_RUN_HAUL = 2100; // measured, autopilot, stock drone, any first-world level

check(
  "no single contract is worth more than a good run",
  CONTRACTS.every((c) => c.starter || c.reward <= CAMPAIGN_RUN_HAUL * 1.3),
  CONTRACTS.filter((c) => !c.starter && c.reward > CAMPAIGN_RUN_HAUL * 1.3)
    .map((c) => `${c.id} pays ${c.reward}`)
    .join(", "),
);

// The property that actually broke: a contract has to outlast the run that starts it, or it is
// a bonus wearing a contract's clothes.
check(
  "no standing contract can be finished in a single run",
  CONTRACTS.every((c) => c.starter || c.target > 1),
  CONTRACTS.filter((c) => !c.starter && c.target <= 1)
    .map((c) => c.id)
    .join(", "),
);

// Worst case: all three slots complete on the same run. Even then the payout must not be a
// meaningful slice of the shop.
const richest = [...CONTRACTS]
  .filter((c) => !c.starter)
  .sort((a, b) => b.reward - a.reward)
  .slice(0, 3)
  .reduce((sum, c) => sum + c.reward, 0);
check(
  "even three contracts landing at once is not a shopping spree",
  richest < shop * 0.05,
  `${richest.toLocaleString()} is ${((richest / shop) * 100).toFixed(1)}% of the shop`,
);

/**
 * And the easiest level cannot be farmed. This rule was already stated in the code — only the
 * frontier level pays its bonus — but the run's own haul was banked unconditionally, so
 * replaying a thirty-second course still paid two thousand a go.
 */
const farmSave = loadSave();
farmSave.levelsDone = 6;
check(
  "replaying a cleared level banks nothing",
  haulFor(farmSave, 0, 21000, false) === 0,
  `${haulFor(farmSave, 0, 21000, false)}`,
);
check(
  "the level you have not cleared yet still pays",
  haulFor(farmSave, 6, 21000, false) === scrapFromScore(21000, false),
);
check(
  "and a free run always pays, since it is never the same course twice",
  haulFor(farmSave, -1, 21000, true) > 0,
);

console.log(failures === 0 ? "\nEconomy pacing holds." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
