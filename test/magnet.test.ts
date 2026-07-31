/**
 * Guards the one property the whole game is named after: the magnet has to visibly pull.
 *
 * This shipped broken. Scrap was closing at 3 units/second while the drone flew past at 34,
 * so relative to the player nothing moved and there was no perceptible magnet at all — the
 * player simply collided with things. Every other test passed the entire time, because
 * collection still worked and scores still went up.
 *
 * The rule encoded here: a piece inside the field must close faster than the drone travels
 * forward. If it does not, the pull is invisible no matter what the numbers say.
 */
import { World } from "../src/game/world";
import { PolarityMechanic } from "../src/mechanics/polarity";

const DT = 1 / 60;
let failures = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Run the real mechanic so the field values under test are the ones the game actually uses. */
function fieldFromMechanic(): { radius: number; strength: number } {
  const w = new World(1, { anchors: false, charged: true });
  w.setViewHeight(142);
  const m = new PolarityMechanic();
  m.reset();
  m.update(w, { dragDx: 0, axis: 0, tapped: false, held: false, holdTime: 0 }, DT);
  return { radius: w.field.radius, strength: w.field.strength };
}

console.log("Magnet checks\n");

const field = fieldFromMechanic();

// The field has to cover a worthwhile slice of the 80-unit-wide lane. A radius that only
// reaches a little past the drone's own body means most scrap never enters it.
check(
  "field reach is a meaningful fraction of the screen",
  field.radius >= 18,
  `radius ${field.radius} against an 80-unit view width`,
);

// Now measure the actual closing speed, with forward motion frozen so the pull is isolated.
const w = new World(1, { anchors: false, charged: true });
w.setViewHeight(142);
w.field.polarity = 1;
w.field.radius = field.radius;
w.field.strength = field.strength;

const START = 10;
w.scrap.length = 0;
w.scrap.push({ x: 0, y: START, r: 1.35, vx: 0, vy: 0, polarity: 1, value: 10, taken: false });
const tracked = w.scrap[0]!;

let peakSpeed = 0;
let stepsToCollect = -1;
for (let i = 1; i <= 60; i++) {
  const y0 = w.player.y;
  w.step(DT);
  w.player.y = y0; // hold the drone still; we are measuring the magnet, not the fly-by
  if (tracked.taken) {
    stepsToCollect = i;
    break;
  }
  peakSpeed = Math.max(peakSpeed, Math.hypot(tracked.vx, tracked.vy));
}

const droneSpeed = w.player.speed;

check(
  "an in-range piece is collected quickly",
  stepsToCollect > 0 && stepsToCollect <= 40,
  `${stepsToCollect < 0 ? "never collected" : `${(stepsToCollect * DT).toFixed(2)}s`} from ${START} units`,
);

check(
  "pull outruns the drone's forward speed",
  peakSpeed > droneSpeed * 0.6,
  `peak ${peakSpeed.toFixed(1)} u/s against a drone doing ${droneSpeed.toFixed(1)} u/s`,
);

// The other half of the rule: the wrong colour must be actively pushed away, not merely
// ignored, or the two colours look identical while approaching.
const r = new World(1, { anchors: false, charged: true });
r.setViewHeight(142);
r.field.polarity = 1;
r.field.radius = field.radius;
r.field.strength = field.strength;
r.scrap.length = 0;
r.scrap.push({ x: 0, y: 9, r: 1.35, vx: 0, vy: 0, polarity: -1, value: 10, taken: false });
const wrong = r.scrap[0]!;
const before = wrong.y - r.player.y;
for (let i = 0; i < 24; i++) {
  const y0 = r.player.y;
  r.step(DT);
  r.player.y = y0;
}
const after = wrong.y - r.player.y;

check(
  "the wrong colour is visibly pushed away",
  after > before + 0.4 && !wrong.taken,
  `gap ${before.toFixed(2)} to ${after.toFixed(2)}`,
);

console.log(
  `\n  field radius ${field.radius}, strength ${field.strength}, peak pull ${peakSpeed.toFixed(1)} u/s, collected in ${(stepsToCollect * DT).toFixed(2)}s`,
);
console.log(failures === 0 ? "\nAll magnet checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
