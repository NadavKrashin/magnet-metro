/**
 * Headless simulation checks. The point is not coverage — it is that the seeded run is
 * reproducible and that each mechanic can actually finish a course. Determinism is what
 * makes shareable challenge codes and ghost races possible later, so it is worth a test now.
 */
import { seedFromCode } from "../src/core/rng";
import { COURSE_LENGTH, World } from "../src/game/world";
import type { InputState } from "../src/core/input";
import type { Mechanic } from "../src/mechanics/types";
import { PolarityMechanic } from "../src/mechanics/polarity";
import { TetherMechanic } from "../src/mechanics/tether";
import { OverloadMechanic } from "../src/mechanics/overload";

const DT = 1 / 60;
const MAX_STEPS = 5000;

let failures = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** A scripted thumb, so every mechanic gets an identical, repeatable input stream. */
function scriptedInput(step: number, mechanicId: string): InputState {
  const base: InputState = {
    dragDx: Math.sin(step / 40) * 0.55,
    axis: 0,
    tapped: false,
    held: false,
    holdTime: 0,
  };
  if (mechanicId === "polarity") {
    return { ...base, tapped: step % 45 === 0 };
  }
  if (mechanicId === "tether") {
    // Hold in bursts, which is how the mechanic is meant to be played.
    const held = step % 120 < 70;
    return { ...base, dragDx: 0, held, holdTime: held ? (step % 120) * DT : 0 };
  }
  const held = step % 90 < 55;
  return { ...base, held, holdTime: held ? (step % 90) * DT : 0 };
}

function runHeadless(mechanic: Mechanic, code: string): World {
  const world = new World(seedFromCode(code), mechanic.worldOptions);
  world.setViewHeight(142);
  mechanic.reset();
  for (let i = 0; i < MAX_STEPS && world.phase === "running"; i++) {
    mechanic.update(world, scriptedInput(i, mechanic.id), DT);
    world.step(DT);
  }
  return world;
}

const mechanics: Mechanic[] = [
  new PolarityMechanic(),
  new TetherMechanic(),
  new OverloadMechanic(),
];

console.log("Simulation checks\n");

for (const m of mechanics) {
  console.log(`${m.name}:`);
  const a = runHeadless(m, "TEST-SEED");
  const b = runHeadless(m, "TEST-SEED");

  check(`${m.id}: run terminates`, a.phase !== "running", `phase=${a.phase}`);
  check(`${m.id}: collects scrap`, a.stats.collected > 0, `collected=${a.stats.collected}`);
  check(`${m.id}: scores points`, a.score > 0, `score=${a.score}`);
  check(
    `${m.id}: same seed is reproducible`,
    a.score === b.score && a.stats.collected === b.stats.collected,
    `${a.score} vs ${b.score}`,
  );
  check(
    `${m.id}: stays inside the track`,
    Math.abs(a.player.x) <= 30.001,
    `x=${a.player.x.toFixed(2)}`,
  );
  check(
    `${m.id}: course length is respected`,
    a.player.y <= COURSE_LENGTH + 5,
    `y=${a.player.y.toFixed(1)}`,
  );
  console.log(
    `  → ${a.phase}, score ${a.score}, collected ${a.stats.collected}, missed ${a.stats.missed}, hits ${a.stats.hits}, ${a.stats.duration.toFixed(1)}s\n`,
  );
}

// A different seed must produce a different course, otherwise generation is ignoring it.
const p1 = runHeadless(new PolarityMechanic(), "SEED-AAA");
const p2 = runHeadless(new PolarityMechanic(), "SEED-BBB");
check(
  "different seeds build different courses",
  p1.score !== p2.score || p1.stats.collected !== p2.stats.collected,
  `${p1.score} vs ${p2.score}`,
);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
