import type { InputState } from "../core/input";
import type { View } from "../render/view";
import type { World, WorldOptions } from "../game/world";

/**
 * A candidate control scheme. Every mechanic drives the same World, so a run of one can be
 * compared against a run of another on identical terms: same art, same scoring, same course
 * generator, same length. The only variable is what the thumb does.
 *
 * Note: `input.dragDx` arrives already converted from CSS pixels into world units.
 */
export interface Mechanic {
  readonly id: string;
  readonly name: string;
  /** One line for the mechanic picker. */
  readonly pitch: string;
  /** Control instruction shown over the opening seconds of a run. */
  readonly hint: string;
  /** What the course generator needs to spawn for this mechanic to work. */
  readonly worldOptions: WorldOptions;

  /** Clear per-run state. Called before every run. */
  reset(): void;
  /** Write `world.field` and steer `world.player`. Runs before `world.step()`. */
  update(world: World, input: InputState, dt: number): void;
  /** Optional world-space decoration drawn above the scene: charge rings, tether lines. */
  draw?(ctx: CanvasRenderingContext2D, world: World, view: View): void;
}

/** Shared drag steering. Most mechanics want the same responsive feel here. */
export function steer(world: World, input: InputState): void {
  const p = world.player;
  // Direct positional drag: the drone tracks the thumb one-to-one, which is what makes
  // runners feel responsive. Keyboard is a velocity fallback for desktop testing only.
  p.x += input.dragDx;
  p.vx = input.axis * 46;
}
