/**
 * How a bounded course ends.
 *
 * One defect lived here, and it produced two separate play reports.
 *
 * The closing branch had no latch, so it emitted a Press for *every* generator slot inside the
 * 150-unit closing zone. A Press consumes 50 units, so four identical walls stacked at roughly
 * 1370, 1420, 1470 and 1521. Matching them was about a hundred free swallows in four seconds,
 * which is what made "swallow 14 in your own colour" decidable before the course had begun —
 * reported as "it's so easy since the end is just a ton of my colour". And the fourth wall
 * began *past* the 1500-unit finish line, so it was drawn on screen and could never be played:
 * reported as "the ending shows before I complete all of the colours in the end".
 *
 * The second report reads like a problem with the finish rather than with the generator, and a
 * bounded settle window was built to hold the run open while the wall was drawn in. Measured
 * across all twenty-four levels it never held for a single frame, so it was removed rather
 * than kept. The properties below are the ones that actually carry the fix.
 */
import { seedFromCode } from "../src/core/rng";
import { COURSE_LENGTH, PRESS_ZONE, World } from "../src/game/world";
import type { Hazard } from "../src/game/types";
import { autopilot, newAutopilotState } from "../src/game/autopilot";
import { PolarityMechanic } from "../src/mechanics/polarity";

const DT = 1 / 60;
let failures = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("Course ending checks\n");

// --- One closing wall, inside the course ------------------------------------

for (const code of ["LVL-0005", "LVL-0009", "LVL-0016", "END-TEST-1"]) {
  const w = new World(seedFromCode(code), { anchors: false, charged: true });
  w.setViewHeight(142);
  const mech = new PolarityMechanic();
  mech.reset();
  const bot = newAutopilotState();

  /**
   * Every press block laid down in the closing zone, keyed by identity and recorded at the
   * position it was *spawned* at.
   *
   * Recording `h.y` on every frame instead does not work: a matching block is dragged toward
   * the drone by the magnet, so one block reports several different rows over its life and a
   * single wall looks like two.
   */
  const spawnRow = new Map<Hazard, number>();
  for (let i = 0; i < 8000 && w.phase === "running"; i++) {
    mech.update(w, autopilot(w, mech.id, bot), DT);
    w.step(DT);
    for (const h of w.hazards) {
      if (!h.press || spawnRow.has(h) || h.y < COURSE_LENGTH - PRESS_ZONE) continue;
      spawnRow.set(h, Math.round(h.y));
    }
  }

  const rows = [...new Set(spawnRow.values())].sort((a, b) => a - b);
  check(
    `${code}: the wall is a full nine blocks across, four deep`,
    spawnRow.size === 36,
    `${spawnRow.size} blocks`,
  );
  // One Press is four rows, nine units apart. More than four rows means walls have stacked.
  check(
    `${code}: the course ends on exactly one wall`,
    rows.length === 4,
    `${rows.length} rows at ${rows.join(", ")}`,
  );
  check(
    `${code}: the whole wall is inside the course`,
    rows.every((y) => y <= COURSE_LENGTH),
    `finish is ${COURSE_LENGTH}, last row at ${rows[rows.length - 1]}`,
  );
  // Far enough back that a matching drone has time to draw it in before the line.
  check(
    `${code}: the wall lands with room to swallow it`,
    rows.length > 0 && COURSE_LENGTH - rows[rows.length - 1]! >= 20,
    `${COURSE_LENGTH - (rows[rows.length - 1] ?? 0)} units of run-out`,
  );
}

// --- Nothing between the wall and the line ----------------------------------

/**
 * The run-out is what actually fixed "the ending shows before I complete all of the colours".
 *
 * The finish itself is unchanged — it still fires the instant the line is crossed. A bounded
 * settle window was built to hold it open while the wall was drawn in, and measured across all
 * twenty-four levels it never held for a single frame, because the wall now finishes long
 * before the line. What the player was seeing was the *fourth* stacked wall, drawn beyond
 * 1500 and unreachable. So the property to defend is the empty stretch behind the Press, not
 * a timer at the finish.
 */
for (const code of ["LVL-0005", "LVL-0014", "LVL-0022"]) {
  const w = new World(seedFromCode(code), { anchors: false, charged: true });
  w.setViewHeight(142);
  const mech = new PolarityMechanic();
  mech.reset();
  const bot = newAutopilotState();

  let lastSpawn = 0;
  const seen = new Set<Hazard>();
  for (let i = 0; i < 8000 && w.phase === "running"; i++) {
    mech.update(w, autopilot(w, mech.id, bot), DT);
    w.step(DT);
    for (const h of w.hazards) {
      if (seen.has(h)) continue;
      seen.add(h);
      if (h.y > lastSpawn) lastSpawn = h.y;
    }
  }
  // Nothing at all — hazard or scrap — is laid down past the finish line, so the player never
  // watches the results sheet arrive over something they were never allowed to play.
  check(
    `${code}: nothing is generated past the finish line`,
    lastSpawn <= COURSE_LENGTH,
    `last spawn at ${lastSpawn.toFixed(0)}, finish at ${COURSE_LENGTH}`,
  );
}

// An endless run has no finish line to settle at, and must never enter the state at all —
// flown by the autopilot so it genuinely travels past where a bounded course would have ended.
const endless = new World(seedFromCode("END-ENDLESS"), {
  anchors: false,
  charged: true,
  endless: true,
});
endless.setViewHeight(142);
const endlessMech = new PolarityMechanic();
endlessMech.reset();
const endlessBot = newAutopilotState();
for (let i = 0; i < 6000 && endless.phase === "running"; i++) {
  endlessMech.update(endless, autopilot(endless, endlessMech.id, endlessBot), DT);
  endless.step(DT);
}
check(
  "an endless run is never won",
  endless.phase !== "won" && endless.player.y > COURSE_LENGTH,
  `phase ${endless.phase} at ${endless.player.y.toFixed(0)}`,
);

console.log(
  failures === 0 ? "\nThe ending behaves." : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
