/**
 * Balance harness.
 *
 * Runs every mechanic across many seeds with two bots: a naive one that sweeps the track
 * without looking, and a greedy one that targets scrap and dodges hazards. The gap between
 * them is the skill expression — the design brief asks for a novice to finish while a skilled
 * player earns substantially more, and this is how that gets measured instead of asserted.
 *
 * Run with: npm run balance
 */
import { seedFromCode } from "../src/core/rng";
import { COURSE_LENGTH, World } from "../src/game/world";
import type { InputState } from "../src/core/input";
import type { Polarity } from "../src/game/types";
import type { Mechanic } from "../src/mechanics/types";
import { PolarityMechanic } from "../src/mechanics/polarity";
import { TetherMechanic } from "../src/mechanics/tether";
import { OverloadMechanic } from "../src/mechanics/overload";

const DT = 1 / 60;
const MAX_STEPS = 6000;
/** World units of lateral movement per step a thumb can realistically manage. */
const MAX_THUMB_STEP = 0.8;

interface BotState {
  polarity: Polarity;
  tapCooldown: number;
  charge: number;
  held: boolean;
}

function blankInput(): InputState {
  return { dragDx: 0, axis: 0, tapped: false, held: false, holdTime: 0 };
}

/** Sweeps side to side and taps blindly. Stands in for a first-time player. */
function naiveBot(step: number, mechanicId: string): InputState {
  const input = blankInput();
  input.dragDx = Math.sin(step / 40) * 0.55;
  if (mechanicId === "polarity") input.tapped = step % 45 === 0;
  else if (mechanicId === "tether") {
    input.dragDx = 0;
    input.held = step % 120 < 70;
  } else input.held = step % 90 < 55;
  return input;
}

/** Picks the best scrap ahead, weighted by value and how far off-course it is. */
function bestTargetX(world: World, wantPolarity: Polarity): number | null {
  const p = world.player;
  let bestScore = -Infinity;
  let bestX: number | null = null;
  for (const s of world.scrap) {
    if (s.taken) continue;
    const dy = s.y - p.y;
    if (dy < 1 || dy > 48) continue;
    const dx = Math.abs(s.x - p.x);
    const matches = wantPolarity === 0 || s.polarity === 0 || s.polarity === wantPolarity;
    const score = (s.value * (matches ? 1 : 0.25)) / (1 + dx * 0.22 + dy * 0.045);
    if (score > bestScore) {
      bestScore = score;
      bestX = s.x;
    }
  }
  return bestX;
}

/** Nudge a desired position away from anything lethal sitting in front of it. */
function avoidHazards(world: World, desiredX: number): number {
  const p = world.player;
  let x = desiredX;
  for (const h of world.hazards) {
    const dy = h.y - p.y;
    if (dy < -1 || dy > 20) continue;
    const clearance = h.r + p.r + 2.5;
    if (Math.abs(h.x - x) < clearance) {
      x = h.x + (x >= h.x ? clearance : -clearance);
    }
  }
  return Math.max(-29, Math.min(29, x));
}

/** Which charge would collect the most value in the window ahead. */
function preferredPolarity(world: World): Polarity {
  const p = world.player;
  let blue = 0;
  let red = 0;
  for (const s of world.scrap) {
    if (s.taken) continue;
    const dy = s.y - p.y;
    if (dy < 3 || dy > 42) continue;
    const weight = s.value / (1 + Math.abs(s.x - p.x) * 0.15);
    if (s.polarity === 1) blue += weight;
    else if (s.polarity === -1) red += weight;
  }
  // A same-charge hazard bearing down outweighs any pickup: flip away from it.
  for (const h of world.hazards) {
    const dy = h.y - p.y;
    if (dy < 0 || dy > 16) continue;
    if (Math.abs(h.x - p.x) > 12) continue;
    if (h.polarity === 1) blue -= 6;
    else if (h.polarity === -1) red -= 6;
  }
  if (blue === 0 && red === 0) return 0;
  return blue >= red ? 1 : -1;
}

function greedyBot(world: World, mechanic: Mechanic, bot: BotState): InputState {
  const input = blankInput();
  const p = world.player;

  if (mechanic.id === "polarity") {
    const want = preferredPolarity(world);
    if (bot.tapCooldown > 0) bot.tapCooldown--;
    if (want !== 0 && want !== bot.polarity && bot.tapCooldown === 0) {
      input.tapped = true;
      bot.polarity = want;
      bot.tapCooldown = 8;
    }
    const target = bestTargetX(world, bot.polarity) ?? p.x;
    const desired = avoidHazards(world, target);
    input.dragDx = Math.max(-MAX_THUMB_STEP, Math.min(MAX_THUMB_STEP, desired - p.x));
    return input;
  }

  if (mechanic.id === "tether") {
    // No steering available: the only lever is when to hold and when to let go.
    let anchorX: number | null = null;
    let bestD = Infinity;
    for (const a of world.anchors) {
      const dy = a.y - p.y;
      if (dy < -6 || dy > 34) continue;
      const d = Math.abs(a.x - p.x) + dy * 0.4;
      if (d < bestD) {
        bestD = d;
        anchorX = a.x;
      }
    }
    input.held = anchorX !== null && Math.abs(anchorX - p.x) > 6;
    return input;
  }

  // Overload: charge in the clear, dump the pulse into a cluster or at an incoming hazard.
  const target = bestTargetX(world, 0) ?? p.x;
  const desired = avoidHazards(world, target);
  input.dragDx = Math.max(-MAX_THUMB_STEP, Math.min(MAX_THUMB_STEP, desired - p.x));

  let dangerClose = false;
  for (const h of world.hazards) {
    const dy = h.y - p.y;
    if (dy > 0 && dy < 24 && Math.abs(h.x - p.x) < 10) dangerClose = true;
  }
  let scrapNear = 0;
  for (const s of world.scrap) {
    if (s.taken) continue;
    const dy = s.y - p.y;
    if (dy > -4 && dy < 26 && Math.abs(s.x - p.x) < 22) scrapNear++;
  }

  if (bot.held) {
    bot.charge = Math.min(1, bot.charge + DT / 0.85);
    const shouldFire = dangerClose || (scrapNear >= 5 && bot.charge > 0.6) || bot.charge >= 0.98;
    bot.held = !shouldFire;
    if (!bot.held) bot.charge = 0;
  } else {
    bot.held = !dangerClose;
    bot.charge = 0;
  }
  input.held = bot.held;
  input.holdTime = bot.charge * 0.85;
  return input;
}

interface Result {
  score: number;
  won: boolean;
  hits: number;
  collected: number;
  missed: number;
  reached: number;
  duration: number;
}

function run(mechanic: Mechanic, code: string, smart: boolean): Result {
  const world = new World(seedFromCode(code), mechanic.worldOptions);
  world.setViewHeight(142);
  mechanic.reset();
  const bot: BotState = { polarity: 1, tapCooldown: 0, charge: 0, held: false };

  for (let i = 0; i < MAX_STEPS && world.phase === "running"; i++) {
    const input = smart ? greedyBot(world, mechanic, bot) : naiveBot(i, mechanic.id);
    mechanic.update(world, input, DT);
    world.step(DT);
  }
  return {
    score: world.score,
    won: world.phase === "won",
    hits: world.stats.hits,
    collected: world.stats.collected,
    missed: world.stats.missed,
    reached: Math.min(world.player.y, COURSE_LENGTH) / COURSE_LENGTH,
    duration: world.stats.duration,
  };
}

function summarise(results: Result[]) {
  const n = results.length;
  const avg = (f: (r: Result) => number) => results.reduce((a, r) => a + f(r), 0) / n;
  return {
    score: Math.round(avg((r) => r.score)),
    clear: Math.round((results.filter((r) => r.won).length / n) * 100),
    hits: avg((r) => r.hits).toFixed(1),
    pickup: Math.round(
      avg((r) => (r.collected + r.missed > 0 ? r.collected / (r.collected + r.missed) : 0)) * 100,
    ),
    reached: Math.round(avg((r) => r.reached) * 100),
    duration: avg((r) => r.duration).toFixed(1),
  };
}

const SEEDS = ["ALFA-001", "BRVO-002", "CHRL-003", "DLTA-004", "ECHO-005", "FXTR-006", "GOLF-007", "HTEL-008", "INDA-009", "JLIT-010", "KILO-011", "LIMA-012"];

const mechanics: Mechanic[] = [
  new PolarityMechanic(),
  new TetherMechanic(),
  new OverloadMechanic(),
];

console.log(`Balance across ${SEEDS.length} seeds\n`);
const pad = (s: string, n: number) => s.padEnd(n);
console.log(
  pad("mechanic", 11) +
    pad("bot", 8) +
    pad("score", 8) +
    pad("clear%", 8) +
    pad("hits", 7) +
    pad("pickup%", 9) +
    pad("reached%", 10) +
    "secs",
);
console.log("-".repeat(69));

for (const m of mechanics) {
  const naive = summarise(SEEDS.map((s) => run(m, s, false)));
  const smart = summarise(SEEDS.map((s) => run(m, s, true)));
  for (const [label, r] of [
    ["naive", naive],
    ["skilled", smart],
  ] as const) {
    console.log(
      pad(label === "naive" ? m.name : "", 11) +
        pad(label, 8) +
        pad(String(r.score), 8) +
        pad(`${r.clear}%`, 8) +
        pad(r.hits, 7) +
        pad(`${r.pickup}%`, 9) +
        pad(`${r.reached}%`, 10) +
        r.duration,
    );
  }
  const lift = naive.score > 0 ? Math.round((smart.score / naive.score - 1) * 100) : Infinity;
  console.log(`${pad("", 11)}skill lift: ${lift === Infinity ? "n/a" : `+${lift}%`}\n`);
}
