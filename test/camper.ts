/**
 * Does staying one colour actually work?
 *
 * The obvious exploit in a game whose only verb is "change colour" is to never use it: pick
 * red, treat every blue thing as a wall, and steer. If that strategy is competitive the whole
 * mechanic is decorative, so this measures it rather than assuming.
 *
 * The camper here is the *strongest* version of the exploit, not a strawman. It never taps,
 * but it still eats hazards that happen to match its colour, still targets only scrap it can
 * actually collect, and still dodges everything lethal. Anything a switcher does that this bot
 * cannot do is a genuine reason to tap.
 *
 * It reports the numbers and then asserts the two properties that must not silently regress:
 * switching has to stay clearly worth doing, and camping must not be able to walk the whole
 * campaign. Both were false before colour gates existed.
 */
import { seedFromCode } from "../src/core/rng";
import { World, type WorldOptions } from "../src/game/world";
import { autopilot, newAutopilotState } from "../src/game/autopilot";
import { PolarityMechanic } from "../src/mechanics/polarity";
import {
  LEVELS,
  UPGRADES,
  baseModifiers,
  levelPassed,
  scrapFromScore,
  worldById,
  type Modifiers,
} from "../src/game/progression";
import type { InputState } from "../src/core/input";
import type { Polarity } from "../src/game/types";

const DT = 1 / 60;
const MAX_THUMB_STEP = 0.8;

function blank(): InputState {
  return { dragDx: 0, axis: 0, tapped: false, held: false, holdTime: 0 };
}

/**
 * Never taps. Otherwise plays as well as it possibly can: chases only the scrap its colour can
 * collect, eats any hazard that happens to match, and gives everything else a wide berth.
 */
function camper(world: World, mine: Polarity): InputState {
  const input = blank();
  const p = world.player;

  let bestX: number | null = null;
  let bestScore = -Infinity;
  for (const s of world.scrap) {
    if (s.taken) continue;
    const dy = s.y - p.y;
    if (dy < 1 || dy > 48) continue;
    // Wrong-colour scrap is not merely lower value to a camper — it is uncollectable.
    if (!(s.polarity === 0 || s.polarity === mine)) continue;
    const dx = Math.abs(s.x - p.x);
    const score = s.value / (1 + dx * 0.22 + dy * 0.045);
    if (score > bestScore) {
      bestScore = score;
      bestX = s.x;
    }
  }

  // A matching hazard is worth six ordinary pieces, so a good camper hunts the ones it can eat.
  for (const h of world.hazards) {
    const dy = h.y - p.y;
    if (dy < 1 || dy > 30) continue;
    if (h.polarity !== mine) continue;
    const dx = Math.abs(h.x - p.x);
    const score = 60 / (1 + dx * 0.22 + dy * 0.045);
    if (score > bestScore) {
      bestScore = score;
      bestX = h.x;
    }
  }

  let x = bestX ?? p.x;
  for (const h of world.hazards) {
    const dy = h.y - p.y;
    if (dy < -1 || dy > 20) continue;
    if (h.polarity === mine) continue; // edible, steer through it
    const clearance = h.r + p.r + 2.5;
    if (Math.abs(h.x - x) < clearance) x = h.x + (x >= h.x ? clearance : -clearance);
  }
  x = Math.max(-29, Math.min(29, x));

  input.dragDx = Math.max(-MAX_THUMB_STEP, Math.min(MAX_THUMB_STEP, x - p.x));
  return input;
}

interface Result {
  score: number;
  scrap: number;
  won: boolean;
  died: boolean;
  reached: number;
  collected: number;
  missed: number;
  absorbed: number;
  maxCombo: number;
  pressEaten: number;
  hits: number;
  actions: number;
}

function play(
  seed: string,
  mode: "camp" | "switch",
  endless: boolean,
  mods: Modifiers,
  world0: Partial<WorldOptions> = {},
): Result {
  const world = new World(
    seedFromCode(seed),
    { anchors: false, charged: true, endless, ...world0 },
    mods,
  );
  world.setViewHeight(142);
  const mech = new PolarityMechanic();
  mech.reset();
  const bot = newAutopilotState();

  // The camper commits to the colour the run starts on and never taps again.
  const mine: Polarity = 1;
  const steps = endless ? 9000 : 6000;
  for (let i = 0; i < steps && world.phase === "running"; i++) {
    const input = mode === "camp" ? camper(world, mine) : autopilot(world, mech.id, bot);
    mech.update(world, input, DT);
    world.step(DT);
  }

  return {
    score: world.score,
    scrap: scrapFromScore(world.score, endless),
    won: world.phase === "won",
    died: world.phase === "lost",
    reached: world.player.y,
    collected: world.stats.collected,
    missed: world.stats.missed,
    absorbed: world.stats.absorbed,
    maxCombo: world.stats.maxCombo,
    pressEaten: world.stats.pressEaten,
    hits: world.stats.hits,
    actions: world.stats.actions,
  };
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Forty-eight, for the same reason the balance harness runs forty-eight: the endless figure is
 * the least stable number here — runs are unbounded and dominated by when the bot happens to
 * die — and a threshold calibrated against a small sample measures the sample, not the design.
 */
const SEEDS = Array.from({ length: 48 }, (_, i) => `CAMP-${String(i).padStart(4, "0")}`);

function report(
  label: string,
  endless: boolean,
  mods: Modifiers,
  world0: Partial<WorldOptions> = {},
): { ratio: number; campDeaths: number; swapDeaths: number } {
  const camp = SEEDS.map((s) => play(s, "camp", endless, mods, world0));
  const swap = SEEDS.map((s) => play(s, "switch", endless, mods, world0));

  const row = (name: string, rs: Result[]) => {
    const pickup = mean(rs.map((r) => (r.collected + r.missed > 0 ? r.collected / (r.collected + r.missed) : 0)));
    console.log(
      `  ${name.padEnd(9)}` +
        `${Math.round(mean(rs.map((r) => r.score))).toLocaleString().padStart(9)}` +
        `${Math.round(mean(rs.map((r) => r.scrap))).toLocaleString().padStart(8)}` +
        `${(Math.round(mean(rs.map((r) => (r.died ? 1 : 0))) * 100) + "%").padStart(8)}` +
        `${(Math.round(pickup * 100) + "%").padStart(9)}` +
        `${mean(rs.map((r) => r.absorbed)).toFixed(1).padStart(8)}` +
        `${mean(rs.map((r) => r.maxCombo)).toFixed(0).padStart(8)}` +
        `${Math.round(mean(rs.map((r) => r.reached))).toLocaleString().padStart(9)}`,
    );
  };

  console.log(`\n${label}`);
  console.log("  strategy     score   scrap   died%  pickup%  eaten   combo   reached");
  console.log("  " + "-".repeat(70));
  row("camp", camp);
  row("switch", swap);

  const cs = mean(camp.map((r) => r.score));
  const ss = mean(swap.map((r) => r.score));
  const ratio = ss / Math.max(1, cs);
  console.log(`  switching is worth ${ratio.toFixed(1)}x the score`);
  if (!endless) {
    const cw = mean(camp.map((r) => (r.won ? 1 : 0)));
    const sw = mean(swap.map((r) => (r.won ? 1 : 0)));
    console.log(`  finished the course: camp ${Math.round(cw * 100)}%, switch ${Math.round(sw * 100)}%`);
    const cp = mean(camp.map((r) => r.pressEaten));
    const sp = mean(swap.map((r) => r.pressEaten));
    console.log(`  press blocks swallowed: camp ${cp.toFixed(1)}, switch ${sp.toFixed(1)}`);
  }

  // Camping must never become lethal. Gates cost haul, never cells, precisely so this can be
  // asserted — the moment they raise the death rate they are raising the floor a beginner has
  // to clear rather than the ceiling a good player plays against.
  const campDeaths = mean(camp.map((r) => (r.died ? 1 : 0)));
  const swapDeaths = mean(swap.map((r) => (r.died ? 1 : 0)));
  return { ratio, campDeaths, swapDeaths };
}

/**
 * The decisive question behind all of this: can somebody who never taps actually finish the
 * campaign and empty the shop? A score penalty is only a deterrent if the content itself
 * eventually asks for something camping cannot deliver.
 */
function campaignReach(): { campCleared: number; firstWall: number } {
  console.log("\nCan a camper clear the campaign?");
  let campCleared = 0;
  let switchCleared = 0;
  const campFails: number[] = [];

  for (const lv of LEVELS) {
    const wd = worldById(lv.world);
    const opts: Partial<WorldOptions> = {
      speedScale: wd.speedScale,
      spacingScale: wd.spacingScale,
      hazardBias: wd.hazardBias,
      midPresses: wd.midPresses,
      colourGates: wd.colourGates ?? true,
    };
    // A fully upgraded drone, so this measures the objective rather than the shop.
    const maxed = baseModifiers();
    for (const d of UPGRADES) d.apply(maxed, d.maxLevel);

    for (const mode of ["camp", "switch"] as const) {
      const r = play(lv.seed, mode, false, maxed, opts);
      const passed = levelPassed(lv, {
        score: r.score,
        banked: scrapFromScore(r.score, false),
        won: r.won,
        absorbed: r.absorbed,
        pressEaten: r.pressEaten,
        collected: r.collected,
        maxCombo: r.maxCombo,
        actions: r.actions,
        hits: r.hits,
        wallsCrashed: 0,
      });
      if (mode === "camp") {
        if (passed) campCleared++;
        else campFails.push(lv.n);
      } else if (passed) switchCleared++;
    }
  }

  console.log(`  camping clears   ${campCleared}/${LEVELS.length} levels`);
  console.log(`  switching clears ${switchCleared}/${LEVELS.length} levels`);
  if (campFails.length) console.log(`  camping is stopped at: ${campFails.join(", ")}`);
  // Levels unlock strictly in order, so the first failure is where a camper actually stops.
  const firstWall = campFails.length ? campFails[0]! : LEVELS.length + 1;
  console.log(`  levels are sequential, so a camper stops for good at level ${firstWall}`);
  return { campCleared, firstWall };
}

console.log("Camping vs switching — is one colour a viable strategy?");
const bounded = report("Bounded course, stock drone", false, baseModifiers());
const endlessR = report("Endless, stock drone", true, baseModifiers());
// The hardest world in the campaign. If camping breaks down anywhere it should be here:
// faster, patterns crowded together, hazards earlier and thicker, Presses mid-course.
const hardest = report("Final Edition (hardest world), stock drone", false, baseModifiers(), {
  speedScale: 1.2,
  spacingScale: 0.86,
  hazardBias: 0.18,
  midPresses: 2,
});

// How much of a course is even reachable without tapping? Colour is assigned by the generator,
// so this is the ceiling on a camper's pickup rate no matter how well they steer.
let mineScrap = 0;
let otherScrap = 0;
let mineHazard = 0;
let otherHazard = 0;
for (const seed of SEEDS) {
  const w = new World(seedFromCode(seed), { anchors: false, charged: true });
  w.setViewHeight(142);
  const mech = new PolarityMechanic();
  mech.reset();
  const bot = newAutopilotState();
  const seenScrap = new Set<object>();
  const seenHaz = new Set<object>();
  for (let i = 0; i < 6000 && w.phase === "running"; i++) {
    mech.update(w, autopilot(w, mech.id, bot), DT);
    w.integrity = 99;
    w.step(DT);
    for (const s of w.scrap) {
      if (seenScrap.has(s)) continue;
      seenScrap.add(s);
      if (s.polarity === 1 || s.polarity === 0) mineScrap += s.value;
      else otherScrap += s.value;
    }
    for (const h of w.hazards) {
      if (seenHaz.has(h)) continue;
      seenHaz.add(h);
      if (h.polarity === 1) mineHazard++;
      else otherHazard++;
    }
  }
}
const totalScrap = mineScrap + otherScrap;
console.log(`\nWhat one colour can even touch, across ${SEEDS.length} courses:`);
console.log(
  `  scrap value reachable: ${Math.round((mineScrap / totalScrap) * 100)}% ` +
    `(${Math.round((otherScrap / totalScrap) * 100)}% is uncollectable to a camper)`,
);
console.log(
  `  hazards edible: ${Math.round((mineHazard / (mineHazard + otherHazard)) * 100)}% ` +
    `— the rest must be dodged, and each one is 60 points a switcher banks`,
);

const campaign = campaignReach();

// ---------------------------------------------------------------------------
// The properties that must hold. Every one of these was false before gates.
// ---------------------------------------------------------------------------
let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/*
 * Thresholds sit below the measured figures, not at them, so ordinary generator drift does not
 * fail the build — the point is to catch camping becoming *viable* again, not to freeze a
 * number.
 *
 * They were once higher, set against 4.6x endless measured over 24 seeds. Decoupling the
 * particle RNG from the course RNG re-rolled every course in the game, and across 48 seeds the
 * three modes now read 2.5x, 2.7x and 3.0x — tightly clustered, which says the old 4.6x was a
 * lucky sample rather than the design's real value. Lowered deliberately and with the
 * measurement recorded, rather than left to fail or quietly fitted to whatever ran last.
 *
 * The score ratio was never the main deterrent anyway. The campaign wall below is.
 */
console.log("\nProperties");
check(
  "switching pays clearly better on an ordinary course",
  bounded.ratio >= 2.0,
  `${bounded.ratio.toFixed(1)}x`,
);
check(
  "switching keeps paying better the longer a run goes",
  endlessR.ratio >= 2.2,
  `${endlessR.ratio.toFixed(1)}x`,
);
check(
  "the hardest world punishes camping hardest",
  hardest.ratio >= 2.5,
  `${hardest.ratio.toFixed(1)}x`,
);
check(
  "camping cannot walk the whole campaign",
  campaign.campCleared < LEVELS.length,
  `cleared ${campaign.campCleared}/${LEVELS.length}`,
);
check(
  "camping is stopped early enough to matter",
  campaign.firstWall <= 12,
  `first wall at level ${campaign.firstWall}`,
);
// The safety property the whole gate design rests on: gates cost haul, never cells, so making
// camping unrewarding must never make the game deadlier for the beginner who does it.
check(
  "camping is still survivable — gates punish the score, not the run",
  bounded.campDeaths <= 0.1,
  `${Math.round(bounded.campDeaths * 100)}% died`,
);
check(
  "and switching is not made deadly either",
  hardest.swapDeaths <= 0.15,
  `${Math.round(hardest.swapDeaths * 100)}% died on the hardest world`,
);

console.log(
  failures === 0
    ? "\nOne colour is no longer a strategy."
    : `\n${failures} property(ies) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
