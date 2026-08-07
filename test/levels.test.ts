/**
 * Checks every campaign level is actually completable.
 *
 * A level whose objective cannot be met is a dead end that no amount of player skill fixes,
 * and it would not show up in any other test. The autopilot stands in for a competent player
 * on an unupgraded drone, so anything it clears is comfortably clearable by a person who has
 * been spending scrap — and anything it misses badly is a target that needs looking at.
 */
import { seedFromCode } from "../src/core/rng";
import { World } from "../src/game/world";
import {
  LEVELS,
  UPGRADES,
  baseModifiers,
  describeObjective,
  levelPassed,
  scrapFromScore,
  worldById,
  type LevelDef,
  type Modifiers,
} from "../src/game/progression";
import { autopilot, newAutopilotState } from "../src/game/autopilot";
import { PolarityMechanic } from "../src/mechanics/polarity";

const DT = 1 / 60;
let failures = 0;

/** A drone with every upgrade bought, which is what a late-campaign player actually flies. */
function maxedModifiers(): Modifiers {
  const mods = baseModifiers();
  for (const def of UPGRADES) def.apply(mods, def.maxLevel);
  return mods;
}

function play(level: LevelDef, mods: Modifiers) {
  const wd = worldById(level.world);
  const world = new World(
    seedFromCode(level.seed),
    {
      anchors: false,
      charged: true,
      speedScale: wd.speedScale,
      spacingScale: wd.spacingScale,
      hazardBias: wd.hazardBias,
      midPresses: wd.midPresses,
    },
    mods,
  );
  world.setViewHeight(142);
  const mech = new PolarityMechanic();
  mech.reset();
  const bot = newAutopilotState();
  for (let i = 0; i < 6000 && world.phase === "running"; i++) {
    mech.update(world, autopilot(world, mech.id, bot), DT);
    world.step(DT);
  }
  return {
    score: world.score,
    banked: scrapFromScore(world.score, false),
    won: world.phase === "won",
    absorbed: world.stats.absorbed,
    pressEaten: world.stats.pressEaten,
    collected: world.stats.collected,
    maxCombo: world.stats.maxCombo,
    actions: world.stats.actions,
    hits: world.stats.hits,
  };
}

function achievedFor(kind: string, s: ReturnType<typeof play>): number {
  if (kind === "score") return s.score;
  if (kind === "absorb") return s.absorbed;
  if (kind === "combo") return s.maxCombo;
  if (kind === "collect") return s.collected;
  if (kind === "frugal") return s.actions;
  if (kind === "press") return s.pressEaten;
  if (kind === "flawless") return s.hits === 0 ? 1 : 0;
  return s.won ? 1 : 0;
}

console.log("Level reachability (autopilot)\n");
console.log("lv  world       objective                              stock    maxed    target");
console.log("-".repeat(88));

const maxed = maxedModifiers();

for (const lv of LEVELS) {
  const stock = play(lv, baseModifiers());
  const upgraded = play(lv, maxed);

  const stockPass = levelPassed(lv, stock);
  const maxedPass = levelPassed(lv, upgraded);

  // Early levels must be clearable on a stock drone; later ones may require upgrades, which is
  // the point of the shop. What is never acceptable is a level nobody can clear at all.
  // The opening world must be clearable with nothing bought.
  const earlyGame = lv.world === "proof";
  const ok = maxedPass && (!earlyGame || stockPass);
  if (!ok) failures++;

  console.log(
    `${String(lv.n).padStart(2)}  ${worldById(lv.world).name.padEnd(11)} ${describeObjective(lv).padEnd(38)} ` +
      `${String(achievedFor(lv.kind, stock)).padEnd(8)} ` +
      `${String(achievedFor(lv.kind, upgraded)).padEnd(8)} ` +
      `${lv.target}${ok ? "" : "   <-- UNREACHABLE"}`,
  );
}

console.log(
  failures === 0
    ? "\nEvery level is clearable: the opening world on a stock drone, all of them fully upgraded."
    : `\n${failures} level(s) cannot be cleared even fully upgraded.`,
);
process.exit(failures === 0 ? 0 : 1);
