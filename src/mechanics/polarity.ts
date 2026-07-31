import type { InputState } from "../core/input";
import type { View } from "../render/view";
import { OPENING_LENGTH, type World } from "../game/world";
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
  readonly name = "Switch";
  // Deliberately not phrased as magnetism. Real magnets attract their opposite, so calling
  // this "polarity" primed players with a rule that is the reverse of what the game does.
  readonly pitch = "You collect your own colour. Tap to change colour.";
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

    this.updatePrompt(world);
  }

  /**
   * Prompts are tied to course distance rather than a timer, so the instruction always
   * matches what is actually on screen. Each one names the consequence the player is looking
   * at rather than describing the control in the abstract.
   */
  private updatePrompt(world: World): void {
    const y = world.player.y;
    world.promptUrgent = false;

    if (y < 70) {
      world.prompt = "YOUR COLOUR FLIES TO YOU";
    } else if (y < OPENING_LENGTH * 0.72) {
      // Keyed off the current charge, not off whether a tap ever happened, so the prompt is
      // still correct for a player who flips early or flips back.
      if (this.polarity === -1) {
        world.prompt = "NOW THEY COME TO YOU";
      } else {
        // The player is staring at a wall of the other colour that will not budge. This is
        // the moment the tap has to be explained, and not a second earlier.
        world.prompt = "TAP TO BECOME RED";
        world.promptUrgent = true;
      }
    } else if (y < OPENING_LENGTH) {
      world.prompt = "BOTH COLOURS — PICK ONE";
    } else {
      world.prompt = "";
    }
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
