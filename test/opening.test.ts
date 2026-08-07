/**
 * The scripted opening is the game's only teaching surface, and it is also eight seconds at
 * the head of every single run. Both facts have to stay true of the right players: a first
 * timer must get the full lesson, and somebody on their fifteenth run must not.
 *
 * The failure this guards against is silent in both directions — a compressed opening handed
 * to a beginner teaches nothing, and a full lesson replayed forever is the single biggest
 * drag on the "one more go" loop this genre lives on.
 */
import { seedFromCode } from "../src/core/rng";
import {
  COURSE_LENGTH,
  OPENING_LENGTH,
  SHORT_OPENING_LENGTH,
  World,
  type WorldOptions,
} from "../src/game/world";
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

/** Play a run and record what the opening stretch actually contained. */
function play(options: Partial<WorldOptions>, steps: number) {
  const w = new World(
    seedFromCode("OPENING-1"),
    { anchors: false, charged: true, ...options },
    undefined,
  );
  w.setViewHeight(142);
  const mech = new PolarityMechanic();
  mech.reset();
  const bot = newAutopilotState();

  let hazardsInOpening = 0;
  const prompts = new Set<string>();
  for (let i = 0; i < steps && w.phase === "running"; i++) {
    mech.update(w, autopilot(w, mech.id, bot), DT);
    w.step(DT);
    if (w.player.y < w.openingLength) {
      // Hazards standing *inside* the opening stretch. Generation always runs ahead of the
      // player, so counting every hazard in the world would count the real course beyond it.
      hazardsInOpening = Math.max(
        hazardsInOpening,
        w.hazards.filter((h) => !h.absorbed && h.y < w.openingLength).length,
      );
      if (w.prompt) prompts.add(w.prompt);
    }
  }
  return { world: w, hazardsInOpening, prompts };
}

console.log("Opening checks\n");

const full = play({ endless: true }, 3000);
const short = play({ endless: true, shortOpening: true }, 3000);

check(
  "the full lesson is the long one",
  full.world.openingLength === OPENING_LENGTH,
  `${full.world.openingLength}`,
);
check(
  "the warm-up is markedly shorter",
  short.world.openingLength === SHORT_OPENING_LENGTH &&
    SHORT_OPENING_LENGTH < OPENING_LENGTH / 2,
  `${SHORT_OPENING_LENGTH} vs ${OPENING_LENGTH}`,
);

// The lesson teaches by consequence, so it has to put a hazard in front of the player. The
// warm-up must not: it is thumb-on-the-glass time, not a test.
check(
  "the lesson still teaches with a real hazard",
  full.hazardsInOpening > 0,
  `${full.hazardsInOpening} hazards`,
);
check(
  "the warm-up puts nothing lethal in the way",
  short.hazardsInOpening === 0,
  `${short.hazardsInOpening} hazards`,
);

check(
  "the lesson speaks",
  full.prompts.size >= 2,
  `${full.prompts.size} distinct prompt(s)`,
);
check(
  "the warm-up does not lecture a player who already knows",
  short.prompts.size === 0,
  `saw: ${[...short.prompts].join(" / ")}`,
);

// Both openings must remain survivable by a bot that is not really trying, because the
// opening is the one stretch of the game nobody should ever lose in.
check(
  "nobody dies during the lesson",
  full.world.player.y > OPENING_LENGTH,
  `stopped at ${Math.round(full.world.player.y)}m`,
);
check(
  "nobody dies during the warm-up",
  short.world.player.y > SHORT_OPENING_LENGTH,
  `stopped at ${Math.round(short.world.player.y)}m`,
);

// A shared course has to build identically on every device, so its opening can never depend
// on the local save. Bounded courses are levels, dailies and shared links.
const bounded = new World(seedFromCode("LVL-0001"), { anchors: false, charged: true });
check(
  "a bounded course always gets the full lesson",
  bounded.openingLength === OPENING_LENGTH,
  `${bounded.openingLength}`,
);

// Determinism is what makes a shared link a challenge rather than a boast, and the warm-up
// must not have broken it for Free Run either.
function distanceAfter(steps: number, shortOpening: boolean): number {
  const w = new World(seedFromCode("OPENING-2"), {
    anchors: false,
    charged: true,
    endless: true,
    shortOpening,
  });
  w.setViewHeight(142);
  const mech = new PolarityMechanic();
  mech.reset();
  const bot = newAutopilotState();
  for (let i = 0; i < steps && w.phase === "running"; i++) {
    mech.update(w, autopilot(w, mech.id, bot), DT);
    w.step(DT);
  }
  return w.player.y;
}
check(
  "the same seed and the same opening still build the same run",
  distanceAfter(1200, true) === distanceAfter(1200, true),
);
check(
  "a course is still built past the warm-up",
  play({ endless: true, shortOpening: true }, 3000).world.player.y > COURSE_LENGTH * 0.2,
);

console.log(
  failures === 0 ? "\nOpening behaves for both audiences." : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
