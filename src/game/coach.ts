/**
 * The first-run guided tour.
 *
 * The course already teaches the *rule* — the scripted opening in `World.openingLesson` shows
 * that your colour flies to you, that the other one will not come no matter how you steer, and
 * that a matching hazard is food. Teaching by consequence beats any caption, and none of that
 * is repeated here.
 *
 * What the opening cannot teach is the **vocabulary**. A new player sees a number, an x1, three
 * pips, a ring and a bar, and nothing on screen says that the number is also the currency, that
 * the pips are lives, or that the ring is the thing doing the collecting. "Scrap", "cells" and
 * "magnet" are not self-explanatory words, and a player who never learns them cannot read the
 * results sheet, the workshop or a contract — which is most of the reason to play again.
 *
 * So each beat points at one real piece of the interface, while it is live, at the moment it
 * first matters, and the simulation freezes until it is dismissed. The positions are chosen
 * against the scripted lesson's own structure: explain the charge indicator just *before* the
 * wall that forces the tap, and cells just *before* the first hazard, so every explanation is
 * immediately paid off by something happening.
 *
 * It runs once, in the hazard-free opening, and is skippable at any point.
 */

export interface CoachStep {
  /** Stable id, used for the analytics funnel — the beat people skip on is the one to cut. */
  id: string;
  /**
   * Element id the callout points at, or `""` for the drone itself, which lives on the canvas
   * and has to be located from the world each frame.
   */
  anchor: string;
  title: string;
  body: string;
  /** Course position, in world units, at which this beat becomes due. */
  at: number;
}

/**
 * Ordered by `at`, and deliberately spread across the whole 290-unit lesson rather than stacked
 * at the start. Six modal cards in the first two seconds is a manual; six cards spread over the
 * eight seconds of a lesson, each landing on the thing it names, is a tour.
 *
 * These distances are **measured against the generator, not read off `openingLesson`**. Course
 * generation starts sixty units ahead of the drone, so every beat of the scripted lesson lands
 * roughly sixty units further down the track than the branch that emitted it: the first
 * collectable is at 56, the wall of the other colour at 130, the first hazard at 224. Taking
 * the numbers from the branches instead — which is the obvious thing to do, and what this
 * originally did — put the "this is scrap" card in front of a score that still read zero.
 * `test/coach.test.ts` re-derives all three by running the world, so the tour cannot drift out
 * of step with a course change again.
 */
export const COACH_STEPS: CoachStep[] = [
  {
    id: "drone",
    anchor: "",
    // Not zero. The camera opens flush with the drone and eases back to its riding position
    // over about a third of a second; ringing the magnet before it settles draws a circle
    // hanging half off the bottom of the screen. Fourteen units is that third of a second.
    at: 14,
    title: "This is your drone",
    body:
      "Drag anywhere on the screen to fly it — you never have to touch the drone itself. " +
      "The ring around it is its <b>magnet</b>: that is the reach it collects from.",
  },
  {
    id: "scrap",
    anchor: "score",
    at: 78,
    title: "This is scrap",
    body:
      "The metal your magnet pulls in. It is your score for the run <b>and</b> your money — " +
      "everything you haul is banked, and the bank is what buys upgrades in the Workshop.",
  },
  {
    id: "multiplier",
    anchor: "mult",
    at: 100,
    title: "The multiplier",
    body:
      "Keep collecting without a break and this climbs. Take a hit and it drops straight back " +
      "to x1. Most of a big score is the multiplier, not the pieces.",
  },
  {
    id: "charge",
    anchor: "charge",
    at: 112,
    title: "You are this colour",
    body:
      "Blue circle, or red diamond. <b>Tap anywhere to change.</b> Only your own colour flies " +
      "to you — the other colour ignores the magnet completely.",
  },
  {
    id: "cells",
    anchor: "integrity",
    at: 198,
    title: "These are your cells",
    body:
      "Your lives — three of them. Fly into something that is <b>not</b> your colour and one " +
      "goes. At zero the run is over. Anything that <b>is</b> your colour you swallow whole, " +
      "hazards included.",
  },
  {
    id: "progress",
    anchor: "progress",
    at: 288,
    title: "How far you have come",
    body:
      // True in every mode. The tour runs on whatever a new player taps first, and a level or
      // a daily does have a finish line — copy that only described Free Run would be wrong for
      // anyone who started from the Levels list.
      "The bar fills as you go. On a course it fills to the finish; on a Free Run there is no " +
      "finish, so it measures you against your own furthest distance instead. That is the " +
      "lesson over — everything from here is real.",
  },
];

/**
 * The index of the next beat that is due, or -1 if nothing is.
 *
 * `done` is the count already shown rather than a set, because the tour is strictly ordered:
 * skipping ahead would explain the multiplier before the score it multiplies.
 */
export function dueCoachStep(done: number, distance: number): number {
  if (done < 0 || done >= COACH_STEPS.length) return -1;
  return distance >= COACH_STEPS[done]!.at ? done : -1;
}
