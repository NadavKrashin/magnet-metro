import type { InputState } from "../core/input";
import type { View } from "../render/view";
import type { World } from "../game/world";
import { TAU, clamp } from "../core/math";
import type { Mechanic } from "./types";

const LATCH_RANGE = 34;
const PULL_FORCE = 150;
const MAX_LATERAL = 52;
const RELEASE_FRICTION = 0.985;

/**
 * Candidate B — no steering at all.
 *
 * There is no drag. Hold to be pulled toward the nearest pylon, release to fly straight on
 * whatever momentum you built. Because the drone is also moving forward the whole time, a
 * hold-and-release becomes a slingshot arc, and the scrap is ringed around each pylon so it
 * is only reachable on a good arc.
 *
 * This exists to test whether removing direct steering feels masterful or frustrating. It is
 * the highest-ceiling of the three and the most likely to lose new players, which is exactly
 * the thing worth measuring rather than arguing about.
 */
export class TetherMechanic implements Mechanic {
  readonly id = "tether";
  readonly name = "Tether";
  readonly pitch = "No steering. Hold to swing off pylons, release to slingshot.";
  readonly worldOptions = { anchors: true, charged: false };

  private latchedIndex = -1;

  reset(): void {
    this.latchedIndex = -1;
  }

  update(world: World, input: InputState, dt: number): void {
    const p = world.player;
    for (const a of world.anchors) a.active = false;

    if (input.held) {
      const target = this.findAnchor(world);
      if (target >= 0) {
        if (this.latchedIndex !== target) {
          this.latchedIndex = target;
          world.stats.actions += 1;
        }
        const a = world.anchors[target]!;
        a.active = true;
        // Pull is stronger up close, which tightens the arc as you come around the pylon.
        const dx = a.x - p.x;
        const d = Math.max(Math.abs(dx), 1);
        p.vx += Math.sign(dx) * PULL_FORCE * (1 - clamp(d / LATCH_RANGE, 0, 0.85)) * dt;
      }
    } else {
      this.latchedIndex = -1;
      p.vx *= RELEASE_FRICTION;
    }

    p.vx = clamp(p.vx, -MAX_LATERAL, MAX_LATERAL);
    // Keyboard nudge so the mechanic is testable on a desktop without a touchscreen.
    if (input.axis !== 0) p.vx = input.axis * 40;

    world.field.polarity = 0;
    world.field.radius = 13;
    world.field.strength = 44;
    world.field.repelHazards = false;
    world.field.invulnerable = false;
  }

  /** Nearest pylon that is still ahead of the player, or -1. */
  private findAnchor(world: World): number {
    const p = world.player;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < world.anchors.length; i++) {
      const a = world.anchors[i]!;
      if (a.y < p.y - 6) continue;
      const dx = a.x - p.x;
      const dy = a.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < LATCH_RANGE && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  draw(ctx: CanvasRenderingContext2D, world: World, view: View): void {
    if (this.latchedIndex < 0) return;
    const a = world.anchors[this.latchedIndex];
    if (!a) return;

    const px = view.toScreenX(world.player.x);
    const py = view.toScreenY(world.player.y);
    const ax = view.toScreenX(a.x);
    const ay = view.toScreenY(a.y);

    ctx.save();
    ctx.strokeStyle = "#7cf5c8";
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(1, view.scale * 0.22);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(ax, ay);
    ctx.stroke();

    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(ax, ay, a.r * 1.7 * view.scale, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}
