/**
 * The first purchase is the moment the meta hooks: the player learns a run makes them
 * permanently stronger and starts another one for that reason. If it does not happen in the
 * first sitting it may never happen at all, so the opening prices and the starter contract
 * are asserted against a *measured* beginner rather than against an optimistic one.
 *
 * The reference numbers come from playing the built game with random input on a phone-sized
 * viewport: 31 seconds, 1,110 score, 6 mines swallowed, 36 pieces collected.
 */
import {
  CONTRACTS,
  UPGRADES,
  contractById,
  loadSave,
  nextGoal,
  refillContracts,
  scrapFromScore,
  settleContracts,
  upgradeCost,
  type RunSummary,
  type SaveData,
} from "../src/game/progression";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** A measured first-timer's run: flailing, but reaching the end of the scripted lesson. */
function naiveRun(): RunSummary {
  return {
    score: 1110,
    banked: scrapFromScore(1110, true),
    won: false,
    absorbed: 6,
    pressEaten: 0,
    collected: 36,
    maxCombo: 20,
    actions: 14,
    hits: 3,
  };
}

function freshSave(): SaveData {
  const s = loadSave();
  s.scrap = 0;
  s.lifetimeScrap = 0;
  s.runs = 0;
  s.levelsDone = 0;
  s.upgrades = {};
  s.contracts = refillContracts([{ id: "starter", progress: 0 }]);
  return s;
}

console.log("Onboarding checks\n");

const coil = UPGRADES.find((u) => u.id === "coil")!;
const opening = upgradeCost(coil, 0);

check(
  "the cheapest first upgrade is reachable, not aspirational",
  opening <= 500,
  `first Coil costs ${opening}`,
);

// Play a measured beginner's session run by run, and find where the first purchase lands.
const save = freshSave();
check("a new player starts with the starter contract", save.contracts.some((c) => c.id === "starter"));

let boughtOnRun = 0;
for (let run = 1; run <= 6 && boughtOnRun === 0; run++) {
  const summary = naiveRun();
  const banked = scrapFromScore(summary.score, true);
  save.scrap += banked;
  save.lifetimeScrap += banked;
  save.runs += 1;
  settleContracts(save, { ...summary, banked });
  if (save.scrap >= upgradeCost(coil, 0)) boughtOnRun = run;
}

check(
  "a flailing beginner can afford their first upgrade inside one sitting",
  boughtOnRun > 0 && boughtOnRun <= 3,
  boughtOnRun === 0 ? "never affordable in six runs" : `affordable after run ${boughtOnRun}`,
);

// The starter must be a one-off. A veteran being asked to swallow eight mines is not a
// contract, it is a formality, and it would quietly print scrap forever.
const veteran = freshSave();
veteran.contracts = [];
const refilled = refillContracts(veteran.contracts);
check(
  "the starter is never redrawn once it is gone",
  refilled.length === 3 && !refilled.some((c) => c.id === "starter"),
  refilled.map((c) => c.id).join(", "),
);

const completed = freshSave();
completed.contracts = [{ id: "starter", progress: 7 }];
const credits = settleContracts(completed, naiveRun());
check(
  "finishing the starter pays out and replaces it",
  credits.length === 1 && !completed.contracts.some((c) => c.id === "starter"),
  `${credits.length} credit(s), now holding ${completed.contracts.map((c) => c.id).join(", ")}`,
);

check("every contract id still resolves", CONTRACTS.every((c) => !!contractById(c.id)));

// The results sheet points somewhere useful at every stage, and never at the campaign while
// the menu is still deliberately hiding it.
const firstTimer = freshSave();
const firstGoal = nextGoal(firstTimer);
check(
  "a first-timer is pointed at a purchase, not at a hidden campaign",
  firstGoal?.kind === "upgrade",
  `pointed at ${firstGoal?.kind}: ${firstGoal?.label}`,
);

const warmed = freshSave();
warmed.runs = 3;
const warmedGoal = nextGoal(warmed);
check(
  "once warmed up, the campaign becomes the next thing",
  warmedGoal?.kind === "level",
  `pointed at ${warmedGoal?.kind}: ${warmedGoal?.label}`,
);

console.log(
  failures === 0
    ? `\nFirst purchase lands on run ${boughtOnRun}.`
    : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
