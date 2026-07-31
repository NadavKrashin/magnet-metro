import type { InputState } from "../core/input";
import type { View } from "../render/view";
import type { World } from "../game/world";
import type { Polarity } from "../game/types";
import { TAU } from "../core/math";
import { steer, type Mechanic } from "./types";

const FIELD_RADIUS = 15;
const FIELD_STRENGTH = 46;
const FLIP_RING_DURATION = 0.35;

/**
 * Candidate A — the mechanic from the design document.
 *
 * Drag to steer, tap to flip charge. Matching charge pulls scrap in; opposing charge pushes
 * it away. Holding the wrong charge near a hazard drags the hazard onto you, so the tap is
 * both an offensive and a defensive tool. The skill is reading the next cluster's colour
 * early enough to be on the right charge when you arrive.
 */
export class PolarityMechanic implements Mechanic {
  readonly id = "polarity";
  readonly name = "Polarity";
  readonly pitch = "Tap to flip red/blue. Pull what matches, shove what doesn't.";
  readonly hint = "DRAG to steer  ·  TAP to flip charge";
  readonly worldOptions = { anchors: false, charged: true };

  private polarity: Polarity = 1;
  private flipRing = 0;

  reset(): void {
    this.polarity = 1;
    this.flipRing = 0;
  }

  update(world: World, input: InputState, dt: number): void {
    steer(world, input);

    if (input.tapped) {
      this.polarity = this.polarity === 1 ? -1 : 1;
      this.flipRing = FLIP_RING_DURATION;
      world.stats.actions += 1;
      world.burst(
        world.player.x,
        world.player.y,
        10,
        this.polarity === 1 ? "#5cc8ff" : "#ff5d6c",
      );
    }
    this.flipRing = Math.max(0, this.flipRing - dt);

    world.field.polarity = this.polarity;
    world.field.radius = FIELD_RADIUS;
    world.field.strength = FIELD_STRENGTH;
    world.field.repelHazards = false;
    world.field.invulnerable = false;
  }

  draw(ctx: CanvasRenderingContext2D, world: World, view: View): void {
    const cx = view.toScreenX(world.player.x);
    const cy = view.toScreenY(world.player.y);
    const color = this.polarity === 1 ? "#5cc8ff" : "#ff5d6c";

    // The field boundary, so the player can judge reach without guessing.
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = Math.max(1, view.scale * 0.16);
    ctx.beginPath();
    ctx.arc(cx, cy, FIELD_RADIUS * view.scale, 0, TAU);
    ctx.stroke();

    // A ring that snaps outward on each flip: the tap needs to feel like it did something.
    if (this.flipRing > 0) {
      const t = 1 - this.flipRing / FLIP_RING_DURATION;
      ctx.globalAlpha = (1 - t) * 0.85;
      ctx.lineWidth = Math.max(1, view.scale * 0.4 * (1 - t));
      ctx.beginPath();
      ctx.arc(cx, cy, (4 + t * FIELD_RADIUS * 1.5) * view.scale, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}
