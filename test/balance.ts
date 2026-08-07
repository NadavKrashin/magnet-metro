/**
 * Balance harness.
 *
 * Runs every mechanic across many seeds with two players: a naive one that sweeps the track
 * without looking, and the real autopilot from src/game/autopilot.ts, which also drives demo
 * mode. Sharing that code matters — a bot that has drifted from the one being filmed would be
 * measuring a different game from the one players see.
 *
 * The gap between the two is the skill expression: a novice should finish, an expert should
 * earn substantially more.
 *
 * Run with: npm run balance
 */
import { seedFromCode } from "../src/core/rng";
import { COURSE_LENGTH, World } from "../src/game/world";
import type { InputState } from "../src/core/input";
import type { Mechanic } from "../src/mechanics/types";
import {
  autopilot,
  newAutopilotState,
  type AutopilotState,
} from "../src/game/autopilot";
import { PolarityMechanic } from "../src/mechanics/polarity";
import { TetherMechanic } from "../src/mechanics/tether";
import { OverloadMechanic } from "../src/mechanics/overload";

const DT = 1 / 60;
const MAX_STEPS = 6000;

/**
 * The beginner stand-in: sweeps side to side and taps blindly, never avoiding anything. Worse
 * than a real first-time player, so its clear rate is a floor rather than an estimate.
 */
function naiveBot(step: number, mechanicId: string): InputState {
  const input: InputState = {
    dragDx: Math.sin(step / 40) * 0.55,
    axis: 0,
    tapped: false,
    held: false,
    holdTime: 0,
  };
  if (mechanicId === "polarity") input.tapped = step % 45 === 0;
  else if (mechanicId === "tether") {
    input.dragDx = 0;
    input.held = step % 120 < 70;
  } else input.held = step % 90 < 55;
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
  const bot: AutopilotState = newAutopilotState();

  for (let i = 0; i < MAX_STEPS && world.phase === "running"; i++) {
    const input = smart ? autopilot(world, mechanic.id, bot) : naiveBot(i, mechanic.id);
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

/**
 * Widened from twelve to forty-eight.
 *
 * Naive clear rate is a headline number in the README and it is quoted when making difficulty
 * decisions, but on twelve courses it moves in 8-point steps — a change of four courses reads
 * as a 33-point swing. A generator change was once read as halving first-run completion when a
 * controlled forty-seed comparison put the real effect at two points. Wide enough that the
 * number can be trusted is worth more than a harness that finishes a few seconds sooner.
 */
const SEEDS = [
  "ALFA-001", "BRVO-002", "CHRL-003", "DLTA-004", "ECHO-005", "FXTR-006",
  "GOLF-007", "HTEL-008", "INDA-009", "JLIT-010", "KILO-011", "LIMA-012",
  "MIKE-013", "NOVR-014", "OSCR-015", "PAPA-016", "QUBC-017", "ROMO-018",
  "SIRA-019", "TNGO-020", "UNFM-021", "VCTR-022", "WHSK-023", "XRAY-024",
  "YNKE-025", "ZULU-026", "ANVL-027", "BLTZ-028", "CDMM-029", "DRUM-030",
  "EMBR-031", "FLNT-032", "GRPH-033", "HLIX-034", "INGT-035", "JOLT-036",
  "KRBN-037", "LTHE-038", "MRQE-039", "NKEL-040", "OBLK-041", "PLTE-042",
  "QUIR-043", "RSTR-044", "STNC-045", "TRCE-046", "UMBR-047", "VLLM-048",
];

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
