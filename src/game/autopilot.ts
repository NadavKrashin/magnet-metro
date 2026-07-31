import type { InputState } from "../core/input";
import type { Polarity } from "./types";
import type { World } from "./world";

/**
 * A competent computer player.
 *
 * Two jobs. In the balance harness it stands in for a skilled human, so difficulty can be
 * measured rather than guessed. In demo mode it plays the game for the camera, which is how
 * ad creative and store footage get made without filming a person's thumb.
 *
 * It is deliberately not perfect. It commits to a target and takes the odd hit, because
 * flawless play looks synthetic on video — near-misses and recoveries are what hold a viewer.
 */
export interface AutopilotState {
  polarity: Polarity;
  tapCooldown: number;
  charge: number;
  held: boolean;
}

export function newAutopilotState(): AutopilotState {
  return { polarity: 1, tapCooldown: 0, charge: 0, held: false };
}

const DT = 1 / 60;
/** World units of lateral movement per step a real thumb can manage. */
const MAX_THUMB_STEP = 0.8;

function blank(): InputState {
  return { dragDx: 0, axis: 0, tapped: false, held: false, holdTime: 0 };
}

/** The best piece ahead, weighted by value and how far off the current line it sits. */
function bestTargetX(world: World, wantPolarity: Polarity): number | null {
  const p = world.player;
  let bestScore = -Infinity;
  let bestX: number | null = null;
  for (const s of world.scrap) {
    if (s.taken) continue;
    const dy = s.y - p.y;
    if (dy < 1 || dy > 48) continue;
    const dx = Math.abs(s.x - p.x);
    const matches = wantPolarity === 0 || s.polarity === 0 || s.polarity === wantPolarity;
    const score = (s.value * (matches ? 1 : 0.25)) / (1 + dx * 0.22 + dy * 0.045);
    if (score > bestScore) {
      bestScore = score;
      bestX = s.x;
    }
  }
  return bestX;
}

/** Steer clear of anything lethal, but never around something edible. */
function avoidHazards(world: World, desiredX: number, wantPolarity: Polarity): number {
  const p = world.player;
  let x = desiredX;
  for (const h of world.hazards) {
    const dy = h.y - p.y;
    if (dy < -1 || dy > 20) continue;
    if (world.options.charged && wantPolarity !== 0 && h.polarity === wantPolarity) continue;
    const clearance = h.r + p.r + 2.5;
    if (Math.abs(h.x - x) < clearance) {
      x = h.x + (x >= h.x ? clearance : -clearance);
    }
  }
  return Math.max(-29, Math.min(29, x));
}

/** Which colour pays best over the window ahead. */
function preferredPolarity(world: World): Polarity {
  const p = world.player;
  let blue = 0;
  let red = 0;

  for (const s of world.scrap) {
    if (s.taken) continue;
    const dy = s.y - p.y;
    if (dy < 3 || dy > 42) continue;
    const weight = s.value / (1 + Math.abs(s.x - p.x) * 0.15);
    if (s.polarity === 1) blue += weight;
    else if (s.polarity === -1) red += weight;
  }

  // Matching a hazard is worth more than matching scrap: it scores and it removes something
  // that would otherwise have cost a life.
  for (const h of world.hazards) {
    const dy = h.y - p.y;
    if (dy < 0 || dy > 26) continue;
    if (Math.abs(h.x - p.x) > 14) continue;
    if (h.polarity === 1) blue += 9;
    else if (h.polarity === -1) red += 9;
  }

  // The closing wall dwarfs everything else, so start matching it early.
  if (world.pressPolarity !== 0 && world.player.y > 1500 - 260) {
    if (world.pressPolarity === 1) blue += 60;
    else red += 60;
  }

  if (blue === 0 && red === 0) return 0;
  return blue >= red ? 1 : -1;
}

export function autopilot(world: World, mechanicId: string, bot: AutopilotState): InputState {
  const input = blank();
  const p = world.player;

  if (mechanicId === "polarity") {
    const want = preferredPolarity(world);
    if (bot.tapCooldown > 0) bot.tapCooldown--;
    if (want !== 0 && want !== bot.polarity && bot.tapCooldown === 0) {
      input.tapped = true;
      bot.polarity = want;
      bot.tapCooldown = 8;
    }
    const target = bestTargetX(world, bot.polarity) ?? p.x;
    const desired = avoidHazards(world, target, bot.polarity);
    input.dragDx = Math.max(-MAX_THUMB_STEP, Math.min(MAX_THUMB_STEP, desired - p.x));
    return input;
  }

  if (mechanicId === "tether") {
    let anchorX: number | null = null;
    let bestD = Infinity;
    for (const a of world.anchors) {
      const dy = a.y - p.y;
      if (dy < -6 || dy > 34) continue;
      const d = Math.abs(a.x - p.x) + dy * 0.4;
      if (d < bestD) {
        bestD = d;
        anchorX = a.x;
      }
    }
    input.held = anchorX !== null && Math.abs(anchorX - p.x) > 6;
    return input;
  }

  // Overload: charge in the clear, dump the pulse into a cluster or at an incoming hazard.
  const target = bestTargetX(world, 0) ?? p.x;
  const desired = avoidHazards(world, target, 0);
  input.dragDx = Math.max(-MAX_THUMB_STEP, Math.min(MAX_THUMB_STEP, desired - p.x));

  let dangerClose = false;
  for (const h of world.hazards) {
    const dy = h.y - p.y;
    if (dy > 0 && dy < 24 && Math.abs(h.x - p.x) < 10) dangerClose = true;
  }
  let scrapNear = 0;
  for (const s of world.scrap) {
    if (s.taken) continue;
    const dy = s.y - p.y;
    if (dy > -4 && dy < 26 && Math.abs(s.x - p.x) < 22) scrapNear++;
  }

  if (bot.held) {
    bot.charge = Math.min(1, bot.charge + DT / 0.85);
    const fire = dangerClose || (scrapNear >= 5 && bot.charge > 0.6) || bot.charge >= 0.98;
    bot.held = !fire;
    if (!bot.held) bot.charge = 0;
  } else {
    bot.held = !dangerClose;
    bot.charge = 0;
  }
  input.held = bot.held;
  input.holdTime = bot.charge * 0.85;
  return input;
}
