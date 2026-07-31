import { Rng } from "../core/rng";
import { clamp, circlesHit, damp, dist, smoothstep } from "../core/math";
import type {
  Anchor,
  ChainItem,
  Field,
  FloatText,
  Hazard,
  Particle,
  Player,
  Polarity,
  RunPhase,
  RunStats,
  Scrap,
  TrailPoint,
} from "./types";

/** World units visible across the width of the screen. Everything is authored against this. */
export const VIEW_WIDTH = 80;
/** Playable area is x in [-TRACK_HALF, TRACK_HALF]; the rest is scenery margin. */
export const TRACK_HALF = 30;
export const COURSE_LENGTH = 1500;
export const BASE_SPEED = 34;
export const MAX_INTEGRITY = 3;

const CHAIN_SPACING = 2.1;
const CHAIN_VISUAL_CAP = 70;
const INVULN_AFTER_HIT = 1.1;
const COMBO_PER_STEP = 8;
const COMBO_MAX_MULT = 8;
/** Radians per second for patrolling hazards. */
const DRIFT_SPEED = 1.4;
/** Wrong-polarity hazards are only dragged in from this fraction of the field radius. */
const HAZARD_PULL_RADIUS_FACTOR = 0.6;
/** Course distance given over to the scripted, hazard-free teaching sequence. */
export const OPENING_LENGTH = 210;

export interface WorldOptions {
  /** Spawn tether anchors. Only the tether mechanic uses them. */
  anchors: boolean;
  /** Give scrap and hazards a red/blue charge. Mechanics that ignore polarity spawn neutral. */
  charged: boolean;
}

export class World {
  readonly rng: Rng;
  readonly seed: number;
  readonly options: WorldOptions;

  player: Player = { x: 0, y: 0, vx: 0, r: 2.3, speed: BASE_SPEED };
  field: Field = {
    polarity: 1,
    radius: 13,
    strength: 46,
    repelHazards: false,
    invulnerable: false,
  };

  scrap: Scrap[] = [];
  hazards: Hazard[] = [];
  anchors: Anchor[] = [];
  chain: ChainItem[] = [];
  particles: Particle[] = [];
  floats: FloatText[] = [];
  private trail: TrailPoint[] = [];
  private travelled = 0;

  cameraY = 0;
  shake = 0;
  phase: RunPhase = "running";
  score = 0;
  combo = 0;
  integrity = MAX_INTEGRITY;
  invulnTimer = 0;
  elapsed = 0;
  /** Pulses to 1 on collect and decays; the renderer uses it for the "juice" scale-up. */
  collectPulse = 0;
  hitFlash = 0;
  /** Contextual instruction shown by the HUD. Written by the active mechanic each frame. */
  prompt = "";
  /** Set when the prompt is asking for an action right now, so the HUD can pulse it. */
  promptUrgent = false;

  stats: RunStats = {
    collected: 0,
    missed: 0,
    hits: 0,
    maxCombo: 0,
    actions: 0,
    duration: 0,
  };

  private spawnCursor = 60;
  private viewHeight = 142;

  constructor(seed: number, options: WorldOptions) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.options = options;
    this.trail.push({ x: 0, y: 0, s: 0 });
  }

  setViewHeight(h: number): void {
    this.viewHeight = h;
  }

  get progress(): number {
    return clamp(this.player.y / COURSE_LENGTH, 0, 1);
  }

  get multiplier(): number {
    return Math.min(1 + Math.floor(this.combo / COMBO_PER_STEP), COMBO_MAX_MULT);
  }

  /** Advance the simulation. Mechanics must have written `field` and `player.vx` first. */
  step(dt: number): void {
    if (this.phase !== "running") {
      this.updateEffects(dt);
      return;
    }

    this.elapsed += dt;
    this.stats.duration = this.elapsed;

    this.movePlayer(dt);
    this.generate();
    this.updateMagnet(dt);
    this.updateHazards(dt);
    this.updateChain();
    this.cull();
    this.updateEffects(dt);

    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    this.cameraY = damp(this.cameraY, this.player.y - this.viewHeight * 0.32, 12, dt);

    if (this.player.y >= COURSE_LENGTH) this.phase = "won";
    else if (this.integrity <= 0) this.phase = "lost";
  }

  private movePlayer(dt: number): void {
    const p = this.player;
    // Speed ramps modestly across the course so the climax feels faster than the opening.
    p.speed = BASE_SPEED * (1 + 0.35 * smoothstep(0.1, 1, this.progress));

    const prevX = p.x;
    const prevY = p.y;
    p.x = clamp(p.x + p.vx * dt, -TRACK_HALF, TRACK_HALF);
    p.y += p.speed * dt;

    const moved = dist(prevX, prevY, p.x, p.y);
    this.travelled += moved;
    this.trail.push({ x: p.x, y: p.y, s: this.travelled });

    // Keep only the trail the chain can actually sample.
    const needed = Math.min(this.chain.length + 2, CHAIN_VISUAL_CAP) * CHAIN_SPACING + 20;
    while (this.trail.length > 2 && this.travelled - this.trail[0]!.s > needed) {
      this.trail.shift();
    }
  }

  /** Attract matching scrap, repel opposing scrap, optionally shove hazards aside. */
  private updateMagnet(dt: number): void {
    const p = this.player;
    const f = this.field;
    const r2 = f.radius * f.radius;

    for (const s of this.scrap) {
      if (s.taken) continue;
      const dx = p.x - s.x;
      const dy = p.y - s.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2 && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        // Falls off with distance so items near the edge drift in rather than snapping.
        const falloff = 1 - d / f.radius;
        const matches = f.polarity === 0 || s.polarity === 0 || s.polarity === f.polarity;
        const sign = matches ? 1 : -0.55;
        const accel = f.strength * falloff * sign;
        s.vx += (dx / d) * accel * dt;
        s.vy += (dy / d) * accel * dt;
      }

      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.93;
      s.vy *= 0.93;

      if (circlesHit(p.x, p.y, p.r + 0.6, s.x, s.y, s.r)) this.collect(s);
    }
  }

  private updateHazards(dt: number): void {
    const p = this.player;
    const f = this.field;

    for (const h of this.hazards) {
      // Patrol is a velocity term rather than a position clamp, so a repel pulse can
      // genuinely shove a hazard off its path instead of being cancelled out.
      if (h.driftAmp > 0) {
        h.x += Math.cos(this.elapsed * DRIFT_SPEED + h.driftPhase) * h.driftAmp * DRIFT_SPEED * dt;
      }

      if (f.repelHazards) {
        const dx = h.x - p.x;
        const dy = h.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < f.radius && d > 0.0001) {
          const push = f.strength * 1.5 * (1 - d / f.radius);
          h.vx += (dx / d) * push * dt;
          h.vy += (dy / d) * push * dt;
        }
      } else if (this.options.charged && f.polarity !== 0 && h.polarity === f.polarity) {
        // Same charge as the magnet: the hazard is dragged toward the player. This is the
        // punishment for holding the wrong polarity, and it reads clearly on screen.
        //
        // The punish radius is deliberately smaller than the collection radius. Widening the
        // field to make collecting feel good must not silently widen the danger zone by the
        // same amount, or every buff to game feel becomes a difficulty spike.
        const danger = f.radius * HAZARD_PULL_RADIUS_FACTOR;
        const dx = p.x - h.x;
        const dy = p.y - h.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < danger && d > 0.0001) {
          const pull = f.strength * 0.5 * (1 - d / danger);
          h.vx += (dx / d) * pull * dt;
          h.vy += (dy / d) * pull * dt;
        }
      }

      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.vx *= 0.9;
      h.vy *= 0.9;
      // Only stop them leaving the world entirely; a shoved hazard should stay shoved.
      h.x = clamp(h.x, -TRACK_HALF - 10, TRACK_HALF + 10);

      if (
        this.invulnTimer <= 0 &&
        !f.invulnerable &&
        circlesHit(p.x, p.y, p.r, h.x, h.y, h.r)
      ) {
        this.takeHit(h);
      }
    }
  }

  private collect(s: Scrap): void {
    s.taken = true;
    this.combo += 1;
    this.stats.collected += 1;
    if (this.combo > this.stats.maxCombo) this.stats.maxCombo = this.combo;

    const gained = s.value * this.multiplier;
    this.score += gained;
    this.collectPulse = 1;

    this.chain.push({ x: s.x, y: s.y, r: s.r, polarity: s.polarity, value: s.value });

    // Colour carries one meaning only: which charge the item is. Value is carried by size,
    // so the player never has to decode two different rules from the same visual channel.
    const color = s.polarity === -1 ? "#ff5d6c" : s.polarity === 1 ? "#5cc8ff" : "#9fb4cc";
    this.burst(s.x, s.y, s.value >= 5 ? 14 : 6, color);
    if (s.value >= 5) this.float(s.x, s.y, `+${gained}`, color);
  }

  private takeHit(h: Hazard): void {
    this.integrity -= 1;
    this.stats.hits += 1;
    this.combo = 0;
    this.invulnTimer = INVULN_AFTER_HIT;
    this.shake = Math.min(this.shake + 1.6, 2.6);
    this.hitFlash = 1;

    // Losing part of the chain is the visible cost — the player watches their haul scatter.
    const lost = Math.ceil(this.chain.length * 0.35);
    for (let i = 0; i < lost; i++) {
      const item = this.chain.pop();
      if (!item) break;
      this.burst(item.x, item.y, 4, "#8b97a8");
    }
    this.burst(h.x, h.y, 20, "#ff5d6c");
    this.float(this.player.x, this.player.y + 4, "-" + lost, "#ff5d6c");
  }

  private updateChain(): void {
    const visible = Math.min(this.chain.length, CHAIN_VISUAL_CAP);
    for (let i = 0; i < visible; i++) {
      const behind = (i + 1) * CHAIN_SPACING;
      const pt = this.sampleTrail(this.travelled - behind);
      const item = this.chain[i]!;
      item.x = pt.x;
      item.y = pt.y;
    }
  }

  /** Find the trail position at cumulative distance `targetS`, interpolating between samples. */
  private sampleTrail(targetS: number): { x: number; y: number } {
    const t = this.trail;
    if (t.length === 0) return { x: this.player.x, y: this.player.y };
    if (targetS <= t[0]!.s) return { x: t[0]!.x, y: t[0]!.y };

    let lo = 0;
    let hi = t.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (t[mid]!.s < targetS) lo = mid + 1;
      else hi = mid;
    }
    const b = t[lo]!;
    const a = t[lo - 1] ?? b;
    const span = b.s - a.s;
    const f = span > 0.0001 ? (targetS - a.s) / span : 0;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }

  private cull(): void {
    const behind = this.cameraY - 12;
    this.scrap = this.scrap.filter((s) => {
      if (s.taken) return false;
      if (s.y < behind) {
        this.stats.missed += 1;
        return false;
      }
      return true;
    });
    this.hazards = this.hazards.filter((h) => h.y > behind);
    this.anchors = this.anchors.filter((a) => a.y > behind);
  }

  private updateEffects(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 4.5);
    this.collectPulse = Math.max(0, this.collectPulse - dt * 4);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.5);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }

    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]!;
      f.life -= dt;
      if (f.life <= 0) this.floats.splice(i, 1);
      else f.y += dt * 9;
    }
  }

  burst(x: number, y: number, count: number, hue: string): void {
    // Cap total particles so a big chain reaction cannot tank the frame rate on a cheap phone.
    if (this.particles.length > 420) return;
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(6, 26);
      const life = this.rng.range(0.25, 0.6);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life,
        maxLife: life,
        size: this.rng.range(0.3, 0.9),
        hue,
      });
    }
  }

  float(x: number, y: number, text: string, hue: string): void {
    this.floats.push({ x, y, text, hue, life: 0.9, maxLife: 0.9 });
  }

  // ---------------------------------------------------------------------------
  // Course generation. Everything below is driven purely by the seed.
  // ---------------------------------------------------------------------------

  private generate(): void {
    const limit = this.cameraY + this.viewHeight + 80;
    while (this.spawnCursor < limit && this.spawnCursor < COURSE_LENGTH + 40) {
      this.spawnCursor += this.spawnPattern(this.spawnCursor);
    }
  }

  /** Emit one pattern at `y` and return how much course length it consumed. */
  private spawnPattern(y: number): number {
    const t = clamp(y / COURSE_LENGTH, 0, 1);
    const rng = this.rng;

    if (y < OPENING_LENGTH) return this.openingLesson(y);

    const roll = rng.next();
    const hard = smoothstep(0.2, 1, t);

    if (this.options.anchors) {
      // Pylons are this mechanic's only means of steering. If they are occasional set pieces
      // the player is a passenger, so here they are the backbone of the course instead.
      if (roll < 0.62) {
        this.anchorGate(y);
        return rng.range(56, 70);
      }
      if (roll < 0.8) {
        this.gauntlet(y, hard);
        return rng.range(62, 78);
      }
      if (roll < 0.93) {
        this.cluster(y, hard);
        return rng.range(56, 70);
      }
      this.breather(y);
      return rng.range(50, 64);
    }

    if (roll < 0.2 + hard * 0.12) {
      this.gauntlet(y, hard);
      return rng.range(62, 78);
    }
    if (roll < 0.42 && this.options.charged) {
      this.twinChoice(y);
      return rng.range(70, 84);
    }
    if (roll < 0.74) {
      this.cluster(y, hard);
      return rng.range(56, 70);
    }
    if (roll < 0.9) {
      this.minefield(y, hard);
      return rng.range(58, 72);
    }
    this.breather(y);
    return rng.range(50, 64);
  }

  /**
   * The opening is a scripted lesson, not a gentle random stretch. It is hazard-free and it
   * teaches by consequence in a fixed order: first that your own colour flies to you, then
   * that the other colour will not come no matter how you steer, then that you must choose.
   * Nothing here can kill the player, so the only thing they can learn is the rule.
   */
  private openingLesson(y: number): number {
    if (!this.options.charged) {
      this.scrapArc(y, this.rng.range(-14, 14), 7, 0, 12);
      return 55;
    }

    // Lesson 1 — your colour comes to you. Player starts on blue.
    if (y < 70) {
      this.scrapLine(y, -9, 1, 5);
      this.scrapLine(y + 8, 9, 1, 5);
      return 70;
    }

    // Lesson 2 — a wall of the other colour. Steering cannot solve this; only the tap can.
    if (y < 150) {
      for (let i = -2; i <= 2; i++) this.scrapLine(y, i * 8, -1, 5);
      return 80;
    }

    // Lesson 3 — both colours present, so the tap becomes a choice rather than a reflex.
    this.scrapLine(y, -13, 1, 6);
    this.scrapLine(y, 13, -1, 6);
    return 60;
  }

  /** A vertical run of same-colour scrap. The clearest possible read of "these belong together". */
  private scrapLine(y: number, x: number, pol: Polarity, count: number): void {
    for (let i = 0; i < count; i++) {
      this.addScrap(clamp(x, -TRACK_HALF + 2, TRACK_HALF - 2), y + i * 5.5, pol, 1);
    }
  }

  private randomCharge(): Polarity {
    if (!this.options.charged) return 0;
    return this.rng.chance(0.5) ? 1 : -1;
  }

  /** A sweeping arc of same-charge scrap — the bread-and-butter "satisfying pull". */
  private scrapArc(y: number, cx: number, count: number, pol: Polarity, spread: number): void {
    const dir = this.rng.chance(0.5) ? 1 : -1;
    for (let i = 0; i < count; i++) {
      const f = count === 1 ? 0.5 : i / (count - 1);
      this.addScrap(
        clamp(cx + Math.sin(f * Math.PI) * spread * dir, -TRACK_HALF + 2, TRACK_HALF - 2),
        y + f * 26,
        pol,
        1,
      );
    }
  }

  /** Two opposing-charge lines side by side. Forces a deliberate polarity decision. */
  private twinChoice(y: number): void {
    const leftPol: Polarity = this.rng.chance(0.5) ? 1 : -1;
    const rightPol: Polarity = leftPol === 1 ? -1 : 1;
    const gold = this.rng.chance(0.35);
    const goldSide = this.rng.chance(0.5) ? -1 : 1;

    for (let i = 0; i < 6; i++) {
      const yy = y + i * 5;
      this.addScrap(-15, yy, leftPol, gold && goldSide === -1 && i === 3 ? 5 : 1);
      this.addScrap(15, yy, rightPol, gold && goldSide === 1 && i === 3 ? 5 : 1);
    }
    // A mine on the centre line so drifting between the two lanes is not free.
    this.addHazard(0, y + 14, "mine", this.randomCharge(), 0);
  }

  /** A wall of hazards with one gap, with reward laid out just past it. */
  private gauntlet(y: number, hard: number): void {
    const gapCenter = this.rng.range(-18, 18);
    const gapWidth = 15 - hard * 3;
    const count = 7;
    for (let i = 0; i < count; i++) {
      const x = -TRACK_HALF + 2 + (i / (count - 1)) * (TRACK_HALF * 2 - 4);
      if (Math.abs(x - gapCenter) < gapWidth) continue;
      this.addHazard(x, y, "block", this.randomCharge(), 0);
    }
    this.scrapArc(y + 16, gapCenter, 6, this.randomCharge(), 10);
  }

  /** Anchors to swing around, ringed with reward that is only reachable on the arc. */
  private anchorGate(y: number): void {
    const side = this.rng.chance(0.5) ? -1 : 1;
    const ax = side * this.rng.range(10, 20);
    this.anchors.push({ x: ax, y: y + 10, r: 2.6, active: false });

    const ringR = this.rng.range(9, 13);
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.addScrap(
        clamp(ax + Math.cos(a) * ringR, -TRACK_HALF + 2, TRACK_HALF - 2),
        y + 10 + Math.sin(a) * ringR,
        0,
        1,
      );
    }
    this.addHazard(-side * this.rng.range(8, 18), y + 26, "mine", 0, 6);
  }

  /** A dense blob of mixed charges — tests whether the player can pick a side under pressure. */
  private cluster(y: number, hard: number): void {
    const cx = this.rng.range(-16, 16);
    const n = 10 + Math.floor(hard * 6);
    const pol = this.randomCharge();
    for (let i = 0; i < n; i++) {
      this.addScrap(
        clamp(cx + this.rng.range(-11, 11), -TRACK_HALF + 2, TRACK_HALF - 2),
        y + this.rng.range(0, 24),
        this.rng.chance(0.78) ? pol : this.randomCharge(),
        this.rng.chance(0.08) ? 5 : 1,
      );
    }
    if (hard > 0.45) {
      this.addHazard(cx + this.rng.range(-14, 14), y + this.rng.range(4, 20), "mine", pol, 8);
    }
  }

  private minefield(y: number, hard: number): void {
    const n = 2 + Math.floor(hard * 3);
    for (let i = 0; i < n; i++) {
      this.addHazard(
        this.rng.range(-TRACK_HALF + 3, TRACK_HALF - 3),
        y + this.rng.range(0, 34),
        "mine",
        this.randomCharge(),
        this.rng.chance(0.4) ? 9 : 0,
      );
    }
    this.scrapArc(y + 12, this.rng.range(-16, 16), 5, this.randomCharge(), 9);
  }

  /** A deliberate quiet beat with one high-value pickup. Pacing needs air. */
  private breather(y: number): void {
    this.addScrap(this.rng.range(-12, 12), y + 12, this.randomCharge(), 5);
  }

  private addScrap(x: number, y: number, polarity: Polarity, value: number): void {
    this.scrap.push({
      x,
      y,
      // Size is the value channel: a big piece is obviously worth more than a small one.
      r: value >= 5 ? 2.3 : 1.2,
      vx: 0,
      vy: 0,
      polarity,
      value,
      taken: false,
    });
  }

  private addHazard(
    x: number,
    y: number,
    kind: "mine" | "block",
    polarity: Polarity,
    drift: number,
  ): void {
    this.hazards.push({
      x,
      y,
      r: kind === "block" ? 3.1 : 2.2,
      vx: 0,
      vy: 0,
      polarity,
      kind,
      driftAmp: drift,
      driftPhase: this.rng.range(0, Math.PI * 2),
    });
  }
}
