/**
 * Endless mode has no finish line, so the two things that can go wrong are silent: the run
 * quietly ending anyway, or the difficulty flattening out so a long run is just a longer
 * version of the same course. Both are checked here.
 */
import { seedFromCode } from "../src/core/rng";
import { COURSE_LENGTH, World } from "../src/game/world";
import { autopilot, newAutopilotState } from "../src/game/autopilot";
import { PolarityMechanic } from "../src/mechanics/polarity";
import { baseModifiers, UPGRADES, type Modifiers } from "../src/game/progression";

const DT = 1 / 60;
let failures = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function maxed(): Modifiers {
  const m = baseModifiers();
  for (const d of UPGRADES) d.apply(m, d.maxLevel);
  return m;
}

/** Play until the drone dies or we hit the step ceiling. */
function run(mods: Modifiers, maxSteps: number) {
  const w = new World(seedFromCode("ENDLESS-1"), { anchors: false, charged: true, endless: true }, mods);
  w.setViewHeight(142);
  const mech = new PolarityMechanic();
  mech.reset();
  const bot = newAutopilotState();
  const samples: { y: number; difficulty: number; speed: number }[] = [];

  let i = 0;
  for (; i < maxSteps && w.phase === "running"; i++) {
    mech.update(w, autopilot(w, mech.id, bot), DT);
    w.step(DT);
    if (i % 600 === 0) samples.push({ y: w.player.y, difficulty: w.difficulty, speed: w.player.speed });
  }
  return { world: w, steps: i, samples };
}

console.log("Endless mode checks\n");

// An immortal drone proves there is no hidden finish line.
const immortal = maxed();
const far = new World(seedFromCode("ENDLESS-1"), { anchors: false, charged: true, endless: true }, immortal);
far.setViewHeight(142);
const mech = new PolarityMechanic();
mech.reset();
const bot = newAutopilotState();
for (let i = 0; i < 12000; i++) {
  mech.update(far, autopilot(far, mech.id, bot), DT);
  far.integrity = 99; // ignore damage; we are testing the course, not the pilot
  far.step(DT);
}
check(
  "never ends on its own",
  far.phase === "running",
  `phase=${far.phase} at ${Math.round(far.player.y)}m`,
);
check(
  "runs well past a bounded course",
  far.player.y > COURSE_LENGTH * 3,
  `${Math.round(far.player.y)}m vs bounded ${COURSE_LENGTH}m`,
);

const r = run(maxed(), 9000);
const early = r.samples.find((s) => s.y > 400);
const late = r.samples.at(-1);
check(
  "difficulty keeps climbing",
  !!early && !!late && late.difficulty > early.difficulty + 0.2,
  early && late ? `${early.difficulty.toFixed(2)} at ${Math.round(early.y)}m -> ${late.difficulty.toFixed(2)} at ${Math.round(late.y)}m` : "no samples",
);
check(
  "speed keeps climbing but stays bounded",
  !!late && late.speed > 40 && late.speed < 90,
  late ? `${late.speed.toFixed(1)} u/s` : "no samples",
);

// A stock drone should still get a respectable first run rather than dying immediately.
const stock = run(baseModifiers(), 9000);
check(
  "a stock drone gets a real run",
  stock.world.player.y > 600,
  `${Math.round(stock.world.player.y)}m`,
);

console.log(
  `\n  maxed reached ${Math.round(r.world.player.y)}m, stock reached ${Math.round(stock.world.player.y)}m`,
);
console.log(failures === 0 ? "\nAll endless checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
