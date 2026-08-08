/**
 * The first-run tour is pinned to the scripted opening.
 *
 * Every beat names a piece of the interface at the moment the course first makes it matter:
 * the charge indicator just *before* the wall that forces a tap, the cells just *before* the
 * first hazard. That timing is the whole design, and it is expressed as bare numbers in two
 * unrelated files — `COACH_STEPS[].at` here and the `y <` thresholds inside
 * `World.openingLesson`. Move either and the tour silently starts explaining things after they
 * have already happened, which is exactly as useless as not explaining them at all and far
 * harder to notice.
 *
 * So the relationship is asserted rather than commented, along with the two properties a first
 * run cannot survive losing: every beat fits inside the hazard-free opening, and every beat
 * points at something that actually exists in the document.
 */
import { readFileSync } from "node:fs";
import { COACH_STEPS, dueCoachStep } from "../src/game/coach";
import { OPENING_LENGTH, World } from "../src/game/world";
import { seedFromCode } from "../src/core/rng";

let failures = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("Guided tour checks\n");

check("there is a tour at all", COACH_STEPS.length > 0, `${COACH_STEPS.length} steps`);

// Six is already a lot to ask of somebody who came to play. If this needs raising, the honest
// fix is to cut a beat, not to raise the ceiling.
check(
  "the tour stays short enough to sit through",
  COACH_STEPS.length <= 6,
  `${COACH_STEPS.length} steps`,
);

check(
  "every beat has copy and a stable id",
  COACH_STEPS.every((s) => s.id.length > 0 && s.title.length > 0 && s.body.length > 0),
);

check(
  "ids are unique, so the funnel can tell the beats apart",
  new Set(COACH_STEPS.map((s) => s.id)).size === COACH_STEPS.length,
);

// The order is the argument: the score before the thing that multiplies it, the colour you are
// before the wall that punishes the wrong one.
check(
  "beats are in ascending order of distance",
  COACH_STEPS.every((s, i) => i === 0 || s.at > COACH_STEPS[i - 1]!.at),
  COACH_STEPS.map((s) => s.at).join(", "),
);

/**
 * The one that actually breaks. Beyond the opening the course is live and lethal, and a card
 * that freezes the run out there stops being a tour and starts being an ambush.
 */
check(
  "every beat lands inside the hazard-free opening",
  COACH_STEPS.every((s) => s.at >= 0 && s.at < OPENING_LENGTH),
  `opening is ${OPENING_LENGTH}, last beat at ${COACH_STEPS[COACH_STEPS.length - 1]!.at}`,
);

/**
 * Where the lesson's beats actually stand, measured rather than assumed.
 *
 * `World.openingLesson` branches on the *generator cursor*, which starts sixty units ahead of
 * the drone — so the branch that reads `y < 150` emits its wall at world position 130, and a
 * tour written against the branch numbers fires every card early. That is exactly what went
 * wrong first time: the "this is scrap" card pointed at a score of zero. So the positions are
 * re-derived here by flying the course, and stay correct through any change to the opening.
 */
function surveyOpening() {
  const w = new World(seedFromCode("COACH-SURVEY"), {
    anchors: false,
    charged: true,
    endless: true,
  });
  w.setViewHeight(142);

  let firstOtherColour = Infinity;
  let firstHazard = Infinity;
  let scoredAt = Infinity;
  let multipliedAt = Infinity;

  // Straight up the middle on the starting colour, with no steering: the least capable thing a
  // real player can do, so anything true here is true for everyone.
  for (let i = 0; i < 4000 && w.player.y < OPENING_LENGTH; i++) {
    w.field.polarity = 1;
    w.step(1 / 60);
    if (w.score > 0) scoredAt = Math.min(scoredAt, w.player.y);
    if (w.multiplier > 1) multipliedAt = Math.min(multipliedAt, w.player.y);
    for (const s of w.scrap) {
      if (s.polarity === -1 && s.y < OPENING_LENGTH) firstOtherColour = Math.min(firstOtherColour, s.y);
    }
    for (const h of w.hazards) {
      if (h.y < OPENING_LENGTH) firstHazard = Math.min(firstHazard, h.y);
    }
  }
  return { firstOtherColour, firstHazard, scoredAt, multipliedAt };
}

const opening = surveyOpening();
const at = (id: string): number => COACH_STEPS.find((s) => s.id === id)?.at ?? NaN;

// A card explaining a readout has to arrive once that readout has something to say. Pointing
// at a score of 0 while calling it "the metal your magnet pulls in" teaches nothing.
check(
  "scrap is named once there is scrap on the counter",
  at("scrap") > opening.scoredAt,
  `card at ${at("scrap")}, first point scored at ${opening.scoredAt.toFixed(0)}`,
);
check(
  "the multiplier is named once it has actually moved",
  at("multiplier") > opening.multipliedAt,
  `card at ${at("multiplier")}, multiplier first climbs at ${opening.multipliedAt.toFixed(0)}`,
);

// And a card explaining a rule has to arrive before the course tests it, or the player has
// already been surprised by the thing it was going to warn them about.
check(
  "the colour indicator is named before the wall that forces a tap",
  at("charge") < opening.firstOtherColour,
  `card at ${at("charge")}, wall at ${opening.firstOtherColour.toFixed(0)}`,
);
check(
  "cells are named before the first hazard the player meets",
  at("cells") < opening.firstHazard,
  `card at ${at("cells")}, hazards at ${opening.firstHazard.toFixed(0)}`,
);

/**
 * A beat pointing at an element id that no longer exists would throw out of the render loop and
 * take the whole run with it. Checked against the real document rather than a copy, because a
 * copy is the thing that goes stale.
 */
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
for (const step of COACH_STEPS) {
  if (step.anchor === "") continue;
  check(
    `the "${step.id}" beat has something to point at`,
    html.includes(`id="${step.anchor}"`),
    `#${step.anchor} is not in index.html`,
  );
}

// Exactly one beat is allowed to point at the drone, which lives on the canvas and has to be
// located from the world instead of from the document.
check(
  "at most one beat points at the canvas",
  COACH_STEPS.filter((s) => s.anchor === "").length <= 1,
);

// --- Scheduling -------------------------------------------------------------

// Not at zero — the camera is still easing back off the drone then, and the magnet ring the
// first card points at is half off the bottom of the screen. But close enough to zero that it
// still reads as "the game explained itself before I had to ask": BASE_SPEED is 34, so a
// second of play is 34 units.
check(
  "the first beat waits for the camera but not for long",
  dueCoachStep(0, 0) === -1 && dueCoachStep(0, 34) === 0,
  `first beat at ${COACH_STEPS[0]!.at}`,
);
check(
  "a beat is not due before its distance",
  dueCoachStep(1, COACH_STEPS[1]!.at - 1) === -1,
);
check("a beat is due at its distance", dueCoachStep(1, COACH_STEPS[1]!.at) === 1);

// Strictly ordered: arriving deep into the course does not skip anyone ahead to the last card.
check(
  "a late start still shows the beats in order",
  dueCoachStep(0, 10_000) === 0 && dueCoachStep(2, 10_000) === 2,
);

check(
  "a finished tour never comes due again",
  dueCoachStep(COACH_STEPS.length, 10_000) === -1,
);

console.log(
  failures === 0 ? "\nThe tour lines up with the lesson." : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
