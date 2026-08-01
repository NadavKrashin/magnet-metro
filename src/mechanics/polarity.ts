import type { InputState } from "../core/input";
import type { View } from "../render/view";
import { COURSE_LENGTH, PRESS_ZONE, type World } from "../game/world";
import type { Polarity } from "../game/types";
import { TAU } from "../core/math";
import { inkFor } from "../render/palette";
import { steer, type Mechanic } from "./types";

/**
 * Reach and pull were both far too small to be perceptible. Measured against a stationary
 * drone, scrap was closing at 3 u/s while the drone flew past at 34-65 u/s — so relative to
 * the player nothing moved, and the magnet may as well not have existed. Radius now covers a
 * meaningful slice of the screen, and the pull outruns the fly-by.
 */
const FIELD_RADIUS = 22;
const FIELD_STRENGTH = 420;
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
  readonly pitch = "Your colour feeds you. The other colour hurts. Tap to change.";
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
      world.burst(world.player.x, world.player.y, 12, inkFor(this.polarity));
      world.events?.onFlip(this.polarity === -1);
    }
    this.flipRing = Math.max(0, this.flipRing - dt);

    world.field.polarity = this.polarity;
    world.field.radius = FIELD_RADIUS + world.mods.fieldRadiusBonus;
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

    // A compressed opening is a warm-up, not a lesson. Teaching captions belong to the run
    // that is actually teaching; replayed for the hundredth time they are just clutter over
    // the first eight seconds of every single run.
    if (world.options.shortOpening) {
      world.prompt = this.pressNearby(world)
        ? this.polarity === world.pressPolarity
          ? "THE PRESS — EAT IT ALL"
          : "THE PRESS — TAP TO MATCH IT"
        : "";
      world.promptUrgent =
        world.prompt.length > 0 && this.polarity !== world.pressPolarity;
      return;
    }

    // Keyed off the current colour rather than off what the player has done before, so every
    // prompt stays correct for someone who taps early, taps back, or taps at random.
    if (y < 70) {
      world.prompt = "YOUR COLOUR COMES TO YOU";
    } else if (y < 150) {
      if (this.polarity === -1) {
        world.prompt = "NOW THEY COME TO YOU";
      } else {
        // The player is staring at a wall of the other colour that will not budge. This is
        // the moment the tap has to be explained, and not a second earlier.
        world.prompt = "RED WON'T COME — TAP TO BECOME RED";
        world.promptUrgent = true;
      }
    } else if (y < 235) {
      if (this.polarity === -1) {
        world.prompt = "RED MINES — EAT THEM";
      } else {
        world.prompt = "TAP! MATCH THE MINES TO EAT THEM";
        world.promptUrgent = true;
      }
    } else if (y < world.openingLength) {
      world.prompt = "YOUR COLOUR FEEDS YOU · THE OTHER HURTS";
    } else if (this.pressNearby(world)) {
      // Called well before the wall is reachable. The whole point of the set piece is that
      // the player sees it coming and chooses; a wall you cannot prepare for is just a tax.
      if (this.polarity === world.pressPolarity) {
        world.prompt = "THE PRESS — EAT IT ALL";
      } else {
        world.prompt = "THE PRESS — TAP TO MATCH IT";
        world.promptUrgent = true;
      }
    } else {
      world.prompt = "";
    }
  }

  /**
   * True while a Press wall is genuinely close: the approach window ahead of the spawned
   * wall, or the whole closing zone of a bounded course. Keyed to the wall's actual position
   * rather than to course distance — a course-distance test is true forever in an endless
   * run, which pinned the Press instruction to the screen with nothing on it to match.
   */
  private pressNearby(world: World): boolean {
    if (world.pressPolarity === 0) return false;
    const y = world.player.y;
    if (!world.options.endless && y > COURSE_LENGTH - PRESS_ZONE - 90) return true;
    const head = world.pressHeadY;
    return head >= 0 && y > head - 120 && y < head + 45;
  }

  draw(ctx: CanvasRenderingContext2D, world: World, view: View): void {
    const cx = view.toScreenX(world.player.x);
    const cy = view.toScreenY(world.player.y);
    const plate = inkFor(this.polarity);

    ctx.save();
    ctx.globalCompositeOperation = "multiply";

    // Field reach, drawn as a printed dashed rule rather than a glow. A press cannot make
    // light, so range is shown with a mark.
    ctx.strokeStyle = plate;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = Math.max(1, view.scale * 0.11);
    ctx.setLineDash([view.scale * 0.9, view.scale * 0.9]);
    ctx.beginPath();
    ctx.arc(cx, cy, FIELD_RADIUS * view.scale, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    // A ring stamped outward on each flip: the tap has to feel like it did something.
    if (this.flipRing > 0) {
      const t = 1 - this.flipRing / FLIP_RING_DURATION;
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.lineWidth = Math.max(1.5, view.scale * 0.5 * (1 - t));
      ctx.beginPath();
      ctx.arc(cx, cy, (4 + t * FIELD_RADIUS * 1.6) * view.scale, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}
