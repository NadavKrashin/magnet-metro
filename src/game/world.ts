import { Rng } from "../core/rng";
import { ink } from "../render/palette";
import { baseModifiers, type Modifiers } from "./progression";
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

const CHAIN_SPACING = 1.55;
const CHAIN_VISUAL_CAP = 90;
/** Links added to the tail for each hazard swallowed. Bulk should look like bulk. */
const CHAIN_PER_ABSORB = 5;
const INVULN_AFTER_HIT = 1.1;
const COMBO_MAX_MULT = 8;
/** Radians per second for patrolling hazards. */
const DRIFT_SPEED = 1.4;
/** Ceiling on how fast an attracted piece may close, in world units per second. */
const MAX_SCRAP_SPEED = 115;
/** Matching hazards are drawn in at this fraction of the field strength. */
const HAZARD_PULL_FACTOR = 0.22;
/** How much of the course tail-end is given over to the closing set piece. */
export const PRESS_ZONE = 150;
/** Distance between Presses in an endless run. */
const PRESS_INTERVAL = 1150;
/** Course distance given over to the scripted teaching sequence. */
export const OPENING_LENGTH = 290;
/** The compressed warm-up that replaces the lesson once the save shows the rule is learned. */
export const SHORT_OPENING_LENGTH = 90;
/** Absorbing a matching hazard is worth this much before the combo multiplier. */
const HAZARD_ABSORB_VALUE = 60;
/** Base worth of an ordinary piece. Deliberately not 1: a score that climbs in tens reads as
 *  progress, and a score that climbs in ones reads as nothing happening. */
export const SCRAP_VALUE = 10;
/** The oversized pieces. */
export const BIG_VALUE = 50;

/**
 * Hooks the presentation layer subscribes to. The simulation stays free of any dependency on
 * audio or DOM, which is what keeps it runnable headlessly in the tests and the balance
 * harness — those simply leave this null.
 */
export interface WorldEvents {
  onCollect(comboIndex: number): void;
  onAbsorb(): void;
  /**
   * Something went wrong. A "cell" is a lost life; a "press" is mismatching the closing wall,
   * which costs the haul rather than the run — a different event that deserves to land
   * differently in the hand and in the ear.
   */
  onHit(kind: "cell" | "press"): void;
  onFlip(toRed: boolean): void;
  /** The player just passed their own furthest distance. */
  onRecord(): void;
}

export interface WorldOptions {
  /**
   * No finish line. Difficulty keeps climbing and the only goal is to beat your own distance,
   * so the run ends when the player does. Presses recur as milestones instead of being the
   * ending, which keeps the best moment in the game without needing a course to stop.
   */
  endless?: boolean;
  /** Spawn tether anchors. Only the tether mechanic uses them. */
  anchors: boolean;
  /** Give scrap and hazards a red/blue charge. Mechanics that ignore polarity spawn neutral. */
  charged: boolean;

  /**
   * World modifiers. Each campaign world bends the same generator rather than shipping a
   * separate one — a different press run off the same plates. Cheap to build, and it keeps
   * every world benefiting from any tuning done to the core.
   */
  /** Multiplies forward speed. Above 1 makes a world feel urgent without changing its layout. */
  speedScale?: number | undefined;
  /** Multiplies the gap between patterns. Below 1 crowds the course. */
  spacingScale?: number | undefined;
  /** Added to the difficulty term the generator uses, so hazards appear earlier and thicker. */
  hazardBias?: number | undefined;
  /** Presses spaced through the course rather than only at the end. */
  midPresses?: number | undefined;

  /**
   * Replace the full scripted lesson with a short hazard-free warm-up. The lesson is the
   * right opening for someone who has never seen the colour rule work, and eight seconds of
   * classroom at the top of every single run for someone who graduated days ago — set by the
   * caller once the save shows the rule has landed. Only ever applied to Free Run: levels,
   * dailies and shared courses must build identically for every player, learned or not.
   */
  shortOpening?: boolean | undefined;
}

export class World {
  readonly rng: Rng;
  readonly seed: number;
  readonly options: WorldOptions;

  player: Player = { x: 0, y: 0, vx: 0, r: 2.3, speed: BASE_SPEED };
  field: Field = {
    polarity: 1,
    radius: 22,
    strength: 420,
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
  /** Full-page ink slam on a big moment, and which ink to slam. */
  absorbFlash = 0;
  absorbFlashInk = "#0F5FBF";
  /**
   * Seconds of near-frozen time after a big impact. A brief hitch is the cheapest way to make
   * a hit land — the eye reads the pause as weight.
   */
  hitStop = 0;

  events: WorldEvents | null = null;

  /**
   * The player's previous furthest distance, drawn across the track as a printed rule and
   * celebrated when crossed. Zero means there is nothing to beat yet.
   *
   * Passing your own record is the emotional peak of the endless mode, and it was previously
   * a small label change. Making it a physical line the player watches approach for ten
   * seconds — and then breaks through — is what turns it into the moment worth clipping.
   */
  recordLine = 0;
  /** True once this run has crossed the line, so the set piece fires exactly once. */
  recordBeaten = false;

  stats: RunStats = {
    collected: 0,
    absorbed: 0,
    pressEaten: 0,
    missed: 0,
    hits: 0,
    maxCombo: 0,
    actions: 0,
    duration: 0,
  };

  private spawnCursor = 60;
  /** Colour of the closing set piece, decided once so the whole wall matches. */
  pressPolarity: Polarity = 0;
  /**
   * Course position where the next (or current) Press wall begins, or -1 before any has
   * spawned. Prompts key off this rather than off raw course position — in an endless run the
   * course position test is true forever, which left the Press instruction stuck on screen
   * for the rest of the run while the nearest Press was a thousand metres away.
   */
  pressHeadY = -1;
  private inPress = false;
  /** Course distance at which the next endless Press is due. */
  private nextPressAt = COURSE_LENGTH * 0.72;
  /** Reset so a bounded world with mid-course Presses starts counting from the lesson's end. */
  private pressCursorInit = false;
  private viewHeight = 142;

  /** Permanent upgrades bought in the shop. Defaults to an unmodified drone. */
  readonly mods: Modifiers;

  constructor(seed: number, options: WorldOptions, mods: Modifiers = baseModifiers()) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.options = options;
    this.mods = mods;
    this.integrity = MAX_INTEGRITY + mods.extraLives;
    this.trail.push({ x: 0, y: 0, s: 0 });
  }

  get maxIntegrity(): number {
    return MAX_INTEGRITY + this.mods.extraLives;
  }

  /**
   * Bring a destroyed drone back mid-course, for the rewarded continue.
   *
   * The window ahead is cleared as well as the window behind: dropping the player back onto
   * the exact wall that just killed them would make the reward worthless, and that is the
   * kind of thing that earns one-star reviews rather than impressions.
   */
  revive(cells: number): void {
    this.phase = "running";
    this.integrity = cells;
    this.invulnTimer = 2.2;
    this.hitFlash = 0;
    this.shake = 0;
    this.combo = 0;
    const y = this.player.y;
    this.hazards = this.hazards.filter((h) => h.y < y - 6 || h.y > y + 34);
  }

  setViewHeight(h: number): void {
    this.viewHeight = h;
  }

  get progress(): number {
    return clamp(this.player.y / COURSE_LENGTH, 0, 1);
  }

  /** Where the scripted opening ends for this run. Prompts and tests both key off this. */
  get openingLength(): number {
    return this.options.shortOpening ? SHORT_OPENING_LENGTH : OPENING_LENGTH;
  }

  /**
   * How hard the course should be right now, 0 to 1.
   *
   * A bounded course spreads its difficulty over its own length. An endless one keeps climbing
   * well past where a bounded course would have ended — it reaches bounded-maximum at roughly
   * one course length and then goes on tightening, so a long run is genuinely a harder run
   * rather than the same course repeating.
   */
  get difficulty(): number {
    if (!this.options.endless) return smoothstep(0.2, 1, this.progress);
    const laps = this.player.y / COURSE_LENGTH;
    return clamp(smoothstep(0.15, 1, laps) * 0.75 + Math.min(0.45, laps * 0.09), 0, 1.2);
  }

  get multiplier(): number {
    return Math.min(1 + Math.floor(this.combo / this.mods.comboStep), COMBO_MAX_MULT);
  }

  /** Advance the simulation. Mechanics must have written `field` and `player.vx` first. */
  step(dt: number): void {
    if (this.phase !== "running") {
      this.updateEffects(dt);
      return;
    }

    // Time hitch. Deterministic, so a seeded replay still matches exactly.
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      dt *= 0.22;
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

    if (this.integrity <= 0) this.phase = "lost";
    else if (!this.options.endless && this.player.y >= COURSE_LENGTH) this.phase = "won";
  }

  private movePlayer(dt: number): void {
    const p = this.player;
    // Speed climbs hard across the course. A 35% ramp was imperceptible; at 90% the last ten
    // seconds genuinely feel like a different game from the first ten, which is the build the
    // run was missing.
    const worldSpeed = this.options.speedScale ?? 1;
    p.speed =
      worldSpeed *
      (this.options.endless
        ? BASE_SPEED * (1 + Math.min(1.35, (this.player.y / COURSE_LENGTH) * 0.75))
        : BASE_SPEED * (1 + 0.9 * smoothstep(0.05, 1, this.progress)));

    const prevX = p.x;
    const prevY = p.y;
    p.x = clamp(p.x + p.vx * dt, -TRACK_HALF, TRACK_HALF);
    p.y += p.speed * dt;

    if (!this.recordBeaten && this.recordLine > 0 && prevY < this.recordLine && p.y >= this.recordLine) {
      this.breakRecord();
    }

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

      // Cap the closing speed so a piece cannot cross the collection radius inside one step
      // and tunnel straight through the drone.
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > MAX_SCRAP_SPEED) {
        s.vx = (s.vx / sp) * MAX_SCRAP_SPEED;
        s.vy = (s.vy / sp) * MAX_SCRAP_SPEED;
      }

      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.9;
      s.vy *= 0.9;

      if (!circlesHit(p.x, p.y, p.r + 1.2, s.x, s.y, s.r)) continue;

      // Colour is a rule, not a hint. Touching the wrong colour must not collect it, or the
      // colour carries no meaning and the player can simply barge through everything.
      if (this.matchesField(s.polarity)) {
        this.collect(s);
      } else {
        this.deflect(s);
      }
    }
  }

  /** True when an object of this colour is attracted to, and usable by, the player. */
  private matchesField(polarity: Polarity): boolean {
    return this.field.polarity === 0 || polarity === 0 || polarity === this.field.polarity;
  }

  /** Shove a wrong-colour item clear so it cannot sit inside the drone looking collectable. */
  private deflect(s: Scrap): void {
    const p = this.player;
    const dx = s.x - p.x;
    const dy = s.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    s.vx = (dx / d) * 34;
    s.vy = (dy / d) * 34;
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

      // A hazard wearing the player's colour is not a threat, it is fuel. It gets pulled in
      // exactly like scrap does, which is what makes one rule cover everything on screen.
      const absorbable = this.options.charged && f.polarity !== 0 && h.polarity === f.polarity;

      if (f.repelHazards) {
        const dx = h.x - p.x;
        const dy = h.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < f.radius && d > 0.0001) {
          const push = f.strength * 1.5 * (1 - d / f.radius);
          h.vx += (dx / d) * push * dt;
          h.vy += (dy / d) * push * dt;
        }
      } else if (absorbable) {
        const dx = p.x - h.x;
        const dy = p.y - h.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < f.radius && d > 0.0001) {
          // Deliberately far gentler than the pull on scrap: a wall of hazards rocketing at
          // the player at full field strength is chaos rather than a reward.
          const pull = f.strength * HAZARD_PULL_FACTOR * (1 - d / f.radius);
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

      if (h.absorbed || !circlesHit(p.x, p.y, p.r, h.x, h.y, h.r)) continue;

      if (absorbable) {
        this.absorbHazard(h);
      } else if (this.invulnTimer <= 0 && !f.invulnerable) {
        // The closing set piece gambles the haul, never the run. Getting it wrong should mean
        // finishing small, not failing to finish — every run needs to reach its ending, both
        // because that is the shape of a satisfying arc and because the ending is the clip.
        if (h.press) this.crashPress(h);
        else this.takeHit(h);
      }
    }
  }

  private collect(s: Scrap): void {
    s.taken = true;
    this.combo += 1;
    this.stats.collected += 1;
    if (this.combo > this.stats.maxCombo) this.stats.maxCombo = this.combo;

    const gained = Math.round(s.value * this.multiplier * this.mods.valueScale);
    this.score += gained;
    this.collectPulse = 1;

    this.chain.push({ x: s.x, y: s.y, r: s.r, polarity: s.polarity, value: s.value });

    // Colour carries one meaning only: which charge the item is. Value is carried by size,
    // so the player never has to decode two different rules from the same visual channel.
    const color = s.polarity === -1 ? ink.red : s.polarity === 1 ? ink.blue : ink.key;
    this.burst(s.x, s.y, s.value >= BIG_VALUE ? 16 : 7, color);
    if (s.value >= BIG_VALUE) this.float(s.x, s.y, `+${gained}`, color);
    this.events?.onCollect(this.combo - 1);
  }

  /**
   * Swallowing a matching hazard is the payoff that makes changing colour worth doing. It is
   * worth more than a piece of scrap because it also removes something that would otherwise
   * have cost the player a life.
   */
  private absorbHazard(h: Hazard): void {
    h.absorbed = true;
    this.combo += 1;
    if (this.combo > this.stats.maxCombo) this.stats.maxCombo = this.combo;

    const gained = Math.round(HAZARD_ABSORB_VALUE * this.multiplier * this.mods.valueScale);
    this.score += gained;
    this.stats.collected += 1;
    this.stats.absorbed += 1;
    if (h.press) this.stats.pressEaten += 1;
    this.collectPulse = 1;

    // The whole reason to change colour, so it gets the full treatment: a shove, a freeze,
    // and an ink slam across the page.
    this.shake = Math.min(this.shake + 1.1, 2.6);
    this.hitStop = Math.max(this.hitStop, 0.075);
    this.absorbFlash = 1;
    this.absorbFlashInk = h.polarity === -1 ? ink.red : ink.blue;

    // A hazard is bulk, not a pellet. Dumping several links into the tail at once is what
    // turns eating a wall into visible, sudden growth rather than a slightly bigger number.
    for (let i = 0; i < CHAIN_PER_ABSORB; i++) {
      this.chain.push({ x: h.x, y: h.y, r: 1.5, polarity: h.polarity, value: 1 });
    }

    const color = h.polarity === -1 ? ink.red : ink.blue;
    this.burst(h.x, h.y, 26, color);
    this.float(h.x, h.y, `+${gained}`, color);
    this.events?.onAbsorb();
  }

  /**
   * Breaking through your own furthest distance. Deliberately given the same weight as
   * swallowing a Press — the shove, the freeze and the ink slam — because it is the same kind
   * of moment: the one the whole mode is played for.
   */
  private breakRecord(): void {
    this.recordBeaten = true;
    this.shake = Math.min(this.shake + 1.4, 2.6);
    this.hitStop = Math.max(this.hitStop, 0.09);
    this.absorbFlash = 1;
    this.absorbFlashInk = ink.blue;
    this.burst(this.player.x, this.player.y, 30, ink.blue);
    this.float(this.player.x, this.player.y + 5, "NEW RECORD", ink.blue);
    this.events?.onRecord();
  }

  /** Mismatching the press: it costs most of what you were carrying, but not a cell. */
  private crashPress(h: Hazard): void {
    this.combo = 0;
    this.invulnTimer = INVULN_AFTER_HIT;
    this.shake = Math.min(this.shake + 2.2, 3);
    this.hitFlash = 1;
    this.hitStop = Math.max(this.hitStop, 0.13);

    const lost = Math.ceil(this.chain.length * 0.45);
    for (let i = 0; i < lost; i++) {
      const item = this.chain.pop();
      if (!item) break;
      this.burst(item.x, item.y, 4, ink.key);
    }
    this.burst(h.x, h.y, 26, ink.key);
    this.float(this.player.x, this.player.y + 4, "WRONG COLOUR", ink.key);
    this.events?.onHit("press");
  }

  private takeHit(h: Hazard): void {
    this.integrity -= 1;
    this.stats.hits += 1;
    this.combo = 0;
    this.invulnTimer = INVULN_AFTER_HIT;
    this.shake = Math.min(this.shake + 1.8, 2.8);
    this.hitFlash = 1;
    this.hitStop = Math.max(this.hitStop, 0.11);

    // Losing part of the chain is the visible cost — the player watches their haul scatter.
    const lost = Math.ceil(this.chain.length * 0.35);
    for (let i = 0; i < lost; i++) {
      const item = this.chain.pop();
      if (!item) break;
      this.burst(item.x, item.y, 4, ink.key);
    }
    this.burst(h.x, h.y, 22, ink.red);
    this.float(this.player.x, this.player.y + 4, "-" + lost, ink.red);
    this.events?.onHit("cell");
  }

  private updateChain(): void {
    const visible = Math.min(this.chain.length, CHAIN_VISUAL_CAP);
    for (let i = 0; i < visible; i++) {
      const behind = (i + 1) * CHAIN_SPACING;
      const pt = this.sampleTrail(this.travelled - behind);
      const item = this.chain[i]!;
      // Braid the links off the centre line. A single-file trail reads as a wire; an
      // undulating band reads as a mass, which is what makes a long chain a spectacle.
      const spread = Math.min(2.8, 0.6 + visible * 0.045);
      item.x = pt.x + Math.sin(i * 0.3) * spread;
      item.y = pt.y + Math.cos(i * 0.3) * spread * 0.3;
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
    this.hazards = this.hazards.filter((h) => !h.absorbed && h.y > behind);
    this.anchors = this.anchors.filter((a) => a.y > behind);
  }

  private updateEffects(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 4.5);
    this.collectPulse = Math.max(0, this.collectPulse - dt * 4);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.5);
    this.absorbFlash = Math.max(0, this.absorbFlash - dt * 4.5);

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
    const end = this.options.endless ? Infinity : COURSE_LENGTH + 40;
    while (this.spawnCursor < limit && this.spawnCursor < end) {
      this.spawnCursor += this.spawnPattern(this.spawnCursor);
    }
  }

  /** Emit one pattern at `y` and return how much course length it consumed. */
  private spawnPattern(y: number): number {
    const rng = this.rng;

    if (y < this.openingLength) return this.openingLesson(y);

    if (!this.pressCursorInit) {
      this.pressCursorInit = true;
      const mid = this.options.midPresses ?? 0;
      if (mid > 0 && !this.options.endless) {
        this.nextPressAt = this.openingLength + (COURSE_LENGTH - this.openingLength - PRESS_ZONE) / (mid + 1);
      }
    }

    if (this.options.charged) {
      const mid = this.options.midPresses ?? 0;
      if (mid > 0 && !this.options.endless && y >= this.nextPressAt && y < COURSE_LENGTH - PRESS_ZONE - 120) {
        this.pressPolarity = 0;
        this.nextPressAt = y + (COURSE_LENGTH - this.openingLength - PRESS_ZONE) / (mid + 1);
        return this.press(y);
      }
      if (this.options.endless) {
        // A Press every so often, so the endless run keeps its best moment on a rhythm rather
        // than losing it along with the finish line. Each one picks a fresh colour.
        if (y >= this.nextPressAt) {
          this.pressPolarity = 0;
          this.nextPressAt = y + PRESS_INTERVAL;
          return this.press(y);
        }
      } else if (y >= COURSE_LENGTH - PRESS_ZONE) {
        return this.press(y);
      }
    }

    const roll = rng.next();
    const hard = clamp(this.difficultyAt(y), 0, 1);

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

    // Patterns crowd together as difficulty rises: the same shapes with less room to recover
    // between them is a far better difficulty curve than simply adding more mines to each one.
    const squeeze = (1 - hard * 0.14) * (this.options.spacingScale ?? 1);

    if (roll < 0.22 + hard * 0.12) {
      this.gauntlet(y, hard);
      return rng.range(58, 72) * squeeze;
    }
    if (roll < 0.44 && this.options.charged) {
      this.twinChoice(y);
      return rng.range(64, 78) * squeeze;
    }
    if (roll < 0.5 && hard > 0.45) {
      this.sieve(y, hard);
      return rng.range(60, 74) * squeeze;
    }
    if (roll < 0.8) {
      this.cluster(y, hard);
      return rng.range(52, 66) * squeeze;
    }
    if (roll < 0.94) {
      this.minefield(y, hard);
      return rng.range(54, 68) * squeeze;
    }
    this.breather(y);
    return rng.range(46, 60) * squeeze;
  }

  /** Difficulty at an arbitrary point, for generation running ahead of the player. */
  private difficultyAt(y: number): number {
    const laps = y / COURSE_LENGTH;
    const bias = this.options.hazardBias ?? 0;
    if (!this.options.endless) return clamp(smoothstep(0.2, 1, clamp(laps, 0, 1)) + bias, 0, 1);
    return clamp(smoothstep(0.15, 1, laps) * 0.75 + Math.min(0.45, laps * 0.09) + bias, 0, 1);
  }

  /**
   * Two offset rows of hazards in opposing colours. Whichever colour you are, half of it is
   * solid and half is food, so it can only be crossed by committing to one line — the first
   * pattern in the game that cannot be solved by steering alone.
   */
  private sieve(y: number, hard: number): void {
    const count = 5;
    const span = TRACK_HALF * 2 - 6;
    const first = this.rng.chance(0.5) ? 1 : -1;
    for (let row = 0; row < 2; row++) {
      const pol: Polarity = row === 0 ? (first as Polarity) : ((-first) as Polarity);
      for (let i = 0; i < count; i++) {
        const x = -TRACK_HALF + 3 + ((i + row * 0.5) / (count - 1)) * span;
        if (x > TRACK_HALF - 2) continue;
        this.addHazard(x, y + row * 13, "mine", pol, 0);
      }
    }
    this.scrapArc(y + 26, this.rng.range(-14, 14), 6 + Math.floor(hard * 4), this.randomCharge(), 10);
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

    // A player who already knows the rule gets a thumb-on-the-glass beat instead of a lesson:
    // both colours present from the first second, nothing that can kill, and no captions.
    if (this.options.shortOpening) {
      this.scrapLine(y, -11, 1, 5);
      this.scrapLine(y + 6, 11, -1, 5);
      return SHORT_OPENING_LENGTH;
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

    // Lesson 3 — a wall of red hazards. The player is already red from lesson 2, so their
    // first encounter with a hazard is one they eat. Learning "my colour is safe" by doing it
    // is worth more than any amount of on-screen text, and the gap means a player who has not
    // understood yet still survives.
    if (y < 235) {
      for (let i = 0; i < 7; i++) {
        const x = -TRACK_HALF + 3 + (i / 6) * (TRACK_HALF * 2 - 6);
        if (Math.abs(x - 14) < 7) continue;
        this.addHazard(x, y + 14, "mine", -1, 0);
      }
      return 85;
    }

    // Lesson 4 — both colours at once, so the tap becomes a choice rather than a reflex.
    this.scrapLine(y, -13, 1, 6);
    this.scrapLine(y, 13, -1, 6);
    return 60;
  }

  /** A vertical run of same-colour scrap. The clearest possible read of "these belong together". */
  private scrapLine(y: number, x: number, pol: Polarity, count: number): void {
    for (let i = 0; i < count; i++) {
      this.addScrap(clamp(x, -TRACK_HALF + 2, TRACK_HALF - 2), y + i * 5.5, pol, SCRAP_VALUE);
    }
  }

  /**
   * The climax. Every course ends against a solid wall of one colour, four rows deep with no
   * gap, telegraphed far enough ahead to be a decision rather than an ambush.
   *
   * Match it and you swallow the entire thing — the single biggest payoff in the game, and
   * the five seconds anyone would actually clip and share. Get it wrong and it costs a cell
   * and a third of everything you were carrying. The run needed an ending; a course that just
   * stops at a distance marker has no shape to it.
   */
  private press(y: number): number {
    // One colour for the whole structure, fixed from the seed so a shared course always ends
    // the same way for everyone who plays it.
    if (this.pressPolarity === 0) this.pressPolarity = this.rng.chance(0.5) ? 1 : -1;

    // The head marks where the wall the player is approaching begins. Stacked walls in the
    // closing zone keep the first head until the player has actually passed through it.
    if (this.pressHeadY < 0 || this.player.y > this.pressHeadY + 45) this.pressHeadY = y;

    const rows = 4;
    const across = 9;
    this.inPress = true;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < across; i++) {
        const x = -TRACK_HALF + 2.5 + (i / (across - 1)) * (TRACK_HALF * 2 - 5);
        this.addHazard(x, y + r * 9, "block", this.pressPolarity, 0);
      }
    }
    this.inPress = false;
    return rows * 9 + 14;
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
        SCRAP_VALUE,
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
      this.addScrap(-15, yy, leftPol, gold && goldSide === -1 && i === 3 ? BIG_VALUE : SCRAP_VALUE);
      this.addScrap(15, yy, rightPol, gold && goldSide === 1 && i === 3 ? BIG_VALUE : SCRAP_VALUE);
    }
    // A mine on the centre line so drifting between the two lanes is not free.
    this.addHazard(0, y + 14, "mine", this.randomCharge(), 0);
  }

  /** A wall of hazards with one gap, with reward laid out just past it. */
  private gauntlet(y: number, hard: number): void {
    const gapCenter = this.rng.range(-18, 18);
    const gapWidth = 15 - hard * 3.5;
    const count = 7;
    // One colour for the whole wall. A mixed wall can never be ploughed through, so the
    // "match it and eat the entire thing" moment — the best thing this mechanic does — would
    // never happen and every wall would collapse back into "find the gap".
    const wallPol = this.randomCharge();
    for (let i = 0; i < count; i++) {
      const x = -TRACK_HALF + 2 + (i / (count - 1)) * (TRACK_HALF * 2 - 4);
      if (Math.abs(x - gapCenter) < gapWidth) continue;
      this.addHazard(x, y, "block", wallPol, 0);
    }
    this.scrapArc(y + 16, gapCenter, 9, this.randomCharge(), 10);
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
        SCRAP_VALUE,
      );
    }
    this.addHazard(-side * this.rng.range(8, 18), y + 26, "mine", 0, 6);
  }

  /** A dense blob of mixed charges — tests whether the player can pick a side under pressure. */
  private cluster(y: number, hard: number): void {
    const cx = this.rng.range(-16, 16);
    const n = 16 + Math.floor(hard * 10);
    const pol = this.randomCharge();
    for (let i = 0; i < n; i++) {
      this.addScrap(
        clamp(cx + this.rng.range(-11, 11), -TRACK_HALF + 2, TRACK_HALF - 2),
        y + this.rng.range(0, 24),
        this.rng.chance(0.78) ? pol : this.randomCharge(),
        this.rng.chance(0.1) ? BIG_VALUE : SCRAP_VALUE,
      );
    }
    if (hard > 0.4) {
      this.addHazard(cx + this.rng.range(-14, 14), y + this.rng.range(4, 20), "mine", pol, 8);
    }
  }

  private minefield(y: number, hard: number): void {
    const n = 2 + Math.floor(hard * 4);
    const fieldPol = this.randomCharge();
    for (let i = 0; i < n; i++) {
      this.addHazard(
        this.rng.range(-TRACK_HALF + 3, TRACK_HALF - 3),
        y + this.rng.range(0, 34),
        "mine",
        fieldPol,
        this.rng.chance(0.4) ? 9 : 0,
      );
    }
    this.scrapArc(y + 12, this.rng.range(-16, 16), 5, this.randomCharge(), 9);
  }

  /** A deliberate quiet beat with one high-value pickup. Pacing needs air. */
  private breather(y: number): void {
    this.addScrap(this.rng.range(-12, 12), y + 12, this.randomCharge(), BIG_VALUE);
  }

  private addScrap(x: number, y: number, polarity: Polarity, value: number): void {
    this.scrap.push({
      x,
      y,
      // Size is the value channel: a big piece is obviously worth more than a small one.
      r: value >= BIG_VALUE ? 2.5 : 1.35,
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
      absorbed: false,
      press: this.inPress,
    });
  }
}
