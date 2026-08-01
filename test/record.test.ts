/**
 * Crossing your own furthest distance is the endless mode's only climax, and it is the kind
 * of one-shot event that is easy to fire twice, fire on the wrong runs, or never fire at all
 * — none of which is obvious while playing.
 */
import { seedFromCode } from "../src/core/rng";
import { World, type WorldEvents } from "../src/game/world";
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

/** Run with a record line in place, counting how often the celebration fires. */
function runWithRecord(recordLine: number, steps: number, endless = true) {
  const w = new World(
    seedFromCode("RECORD-1"),
    { anchors: false, charged: true, endless, shortOpening: endless },
    maxed(),
  );
  w.setViewHeight(142);
  w.recordLine = recordLine;

  let fired = 0;
  const events: WorldEvents = {
    onCollect: () => {},
    onAbsorb: () => {},
    onHit: () => {},
    onFlip: () => {},
    onRecord: () => {
      fired++;
    },
  };
  w.events = events;

  const mech = new PolarityMechanic();
  mech.reset();
  const bot = newAutopilotState();
  let firedBeforeLine = 0;
  for (let i = 0; i < steps && w.phase === "running"; i++) {
    mech.update(w, autopilot(w, mech.id, bot), DT);
    w.integrity = 99; // testing the marker, not the pilot
    w.step(DT);
    if (w.player.y < recordLine) firedBeforeLine = fired;
  }
  return { world: w, fired, firedBeforeLine };
}

console.log("Record line checks\n");

const beaten = runWithRecord(700, 6000);
check(
  "the run actually reached past the line",
  beaten.world.player.y > 700,
  `${Math.round(beaten.world.player.y)}m`,
);
check("crossing the record fires the celebration", beaten.fired === 1, `fired ${beaten.fired} time(s)`);
check("it never fires early", beaten.firedBeforeLine === 0, `${beaten.firedBeforeLine} early`);
check("the world remembers it was beaten", beaten.world.recordBeaten);

// Running well past the line must not fire it again, however far the run goes.
const long = runWithRecord(400, 12000);
check("it fires exactly once no matter how far the run goes", long.fired === 1, `fired ${long.fired}`);

// A first-ever run has no record. Nothing should be drawn and nothing should fire.
const first = runWithRecord(0, 3000);
check("with no record there is nothing to break", first.fired === 0 && !first.world.recordBeaten);

// A record far beyond reach must stay unbroken rather than firing on some rounding edge.
const short = runWithRecord(50_000, 3000);
check(
  "a distant record is not broken by a short run",
  short.fired === 0 && !short.world.recordBeaten,
  `reached ${Math.round(short.world.player.y)}m`,
);

// The line belongs to Free Run. A bounded course has a finish line of its own.
const bounded = new World(seedFromCode("LVL-0001"), { anchors: false, charged: true });
check("a bounded course carries no record line by default", bounded.recordLine === 0);

console.log(
  failures === 0 ? "\nThe record breaks exactly once." : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
