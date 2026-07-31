import type { InputState } from "../core/input";
import type { View } from "../render/view";
import { OPENING_LENGTH, type World } from "../game/world";
import { TAU, clamp, lerp } from "../core/math";
import { steer, type Mechanic } from "./types";

const CHARGE_TIME = 0.85;
const MIN_CHARGE = 0.12;
const PULSE_DURATION = 0.45;
const IDLE_RADIUS = 9;
const PULSE_MIN_RADIUS = 15;
const PULSE_MAX_RADIUS = 42;

/**
 * Candidate C — risk/reward on a single button.
 *
 * Drag to steer. Hold to charge, and while charging your magnet collapses to almost nothing,
 * so you collect nothing and cannot push hazards away. Release to fire a pulse that yanks in
 * every piece of scrap in range and physically shoves hazards aside.
 *
 * The tension is that the biggest pulse requires the longest window of being defenceless, so
 * the interesting decision is always "do I have time for a full charge before that wall?"
 */
export class OverloadMechanic implements Mechanic {
  readonly id = "overload";
  readonly name = "Overload";
  readonly pitch = "Hold to charge while defenceless. Release to blast scrap in.";
  readonly worldOptions = { anchors: false, charged: false };

  private charge = 0;
  private pulseTimer = 0;
  private pulsePower = 0;
  private wasHeld = false;

  reset(): void {
    this.charge = 0;
    this.pulseTimer = 0;
    this.pulsePower = 0;
    this.wasHeld = false;
  }

  update(world: World, input: InputState, dt: number): void {
    steer(world, input);

    if (input.held) {
      this.charge = clamp(this.charge + dt / CHARGE_TIME, 0, 1);
    } else if (this.wasHeld) {
      // Released. A flick of the thumb still fires a small pulse, so the control is never dead.
      if (this.charge >= MIN_CHARGE) {
        this.pulsePower = this.charge;
        this.pulseTimer = PULSE_DURATION;
        world.stats.actions += 1;
        world.shake = Math.min(world.shake + this.charge * 1.2, 2.2);
        world.burst(world.player.x, world.player.y, 8 + Math.floor(this.charge * 18), "#ffd257");
      }
      this.charge = 0;
    }
    this.wasHeld = input.held;

    if (this.pulseTimer > 0) this.pulseTimer -= dt;

    const f = world.field;
    f.polarity = 0;
    if (this.pulseTimer > 0) {
      // Radius expands over the life of the pulse so it reads as a travelling shockwave.
      const t = 1 - this.pulseTimer / PULSE_DURATION;
      const peak = lerp(PULSE_MIN_RADIUS, PULSE_MAX_RADIUS, this.pulsePower);
      f.radius = lerp(IDLE_RADIUS, peak, Math.min(1, t * 2));
      f.strength = lerp(70, 150, this.pulsePower);
      f.repelHazards = true;
    } else {
      // Charging collapses the field. This is the cost that makes the decision real.
      f.radius = lerp(IDLE_RADIUS, 2.5, this.charge);
      f.strength = 34;
      f.repelHazards = false;
    }
    f.invulnerable = false;

    this.updatePrompt(world);
  }

  /** Tied to course distance so each instruction lands on the thing it describes. */
  private updatePrompt(world: World): void {
    const y = world.player.y;
    world.promptUrgent = false;

    if (y < 70) {
      world.prompt = "HOLD TO CHARGE";
      world.promptUrgent = this.charge < 0.05 && this.pulseTimer <= 0;
    } else if (y < OPENING_LENGTH * 0.72) {
      world.prompt = this.charge > 0.5 ? "LET GO NOW" : "RELEASE TO PULL IT ALL IN";
      world.promptUrgent = this.charge > 0.5;
    } else if (y < OPENING_LENGTH) {
      world.prompt = "LONGER HOLD, BIGGER PULL";
    } else {
      world.prompt = "";
    }
  }

  draw(ctx: CanvasRenderingContext2D, world: World, view: View): void {
    const cx = view.toScreenX(world.player.x);
    const cy = view.toScreenY(world.player.y);

    ctx.save();
    // Current field reach.
    ctx.strokeStyle = this.pulseTimer > 0 ? "#ffd257" : "#8ad7ff";
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = Math.max(1, view.scale * 0.16);
    ctx.beginPath();
    ctx.arc(cx, cy, world.field.radius * view.scale, 0, TAU);
    ctx.stroke();

    // Charge meter drawn as an arc around the drone: readable without looking away.
    if (this.charge > 0.02) {
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = this.charge >= 1 ? "#ffd257" : "#ff9d4d";
      ctx.lineWidth = Math.max(2, view.scale * 0.5);
      ctx.beginPath();
      ctx.arc(cx, cy, world.player.r * 2.1 * view.scale, -Math.PI / 2, -Math.PI / 2 + TAU * this.charge);
      ctx.stroke();
    }

    // The shockwave itself.
    if (this.pulseTimer > 0) {
      const t = 1 - this.pulseTimer / PULSE_DURATION;
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = "#ffd257";
      ctx.lineWidth = Math.max(1, view.scale * 0.5 * (1 - t));
      ctx.beginPath();
      ctx.arc(cx, cy, lerp(PULSE_MIN_RADIUS, PULSE_MAX_RADIUS, this.pulsePower) * t * view.scale, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}
