import { TAU } from "../core/math";
import { BIG_VALUE, TRACK_HALF, VIEW_WIDTH, World } from "../game/world";
import type { View } from "./view";
import { MISREGISTER_X, MISREGISTER_Y, ink, inkFor } from "./palette";
import { makeHalftoneTile } from "./texture";

type Trace = (cx: number, cy: number, rr: number) => void;

export class Renderer implements View {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  scale = 1;
  private cw = 0;
  private ch = 0;
  private cameraY = 0;
  private shakeX = 0;
  private shakeY = 0;

  private background: HTMLCanvasElement | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D is not available in this browser.");
    this.ctx = ctx;
    this.resize();
  }

  get context(): CanvasRenderingContext2D {
    return this.ctx;
  }

  /** CSS pixels across the canvas. Used to convert thumb movement into world units. */
  get cssWidth(): number {
    return this.canvas.clientWidth || 1;
  }

  get viewHeightWorld(): number {
    return this.ch / this.scale;
  }

  resize(): void {
    // Capped at 2: beyond that the extra pixels are invisible on flat printed shapes and
    // cost real frame time on the cheap Android hardware this genre lives on.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.cw = this.canvas.width;
    this.ch = this.canvas.height;
    this.scale = this.cw / VIEW_WIDTH;
    this.bakeBackground();
  }

  toScreenX(worldX: number): number {
    return this.cw / 2 + worldX * this.scale + this.shakeX;
  }

  toScreenY(worldY: number): number {
    return this.ch - (worldY - this.cameraY) * this.scale + this.shakeY;
  }

  // ---------------------------------------------------------------------------
  // Print primitives
  // ---------------------------------------------------------------------------

  private traceCircle: Trace = (cx, cy, rr) => {
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, rr, 0, TAU);
  };

  private traceDiamond: Trace = (cx, cy, rr) => {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(cx, cy - rr * 1.28);
    ctx.lineTo(cx + rr * 1.28, cy);
    ctx.lineTo(cx, cy + rr * 1.28);
    ctx.lineTo(cx - rr * 1.28, cy);
    ctx.closePath();
  };

  /** An eight-lobed flower. Nothing else in the game has a bumpy outline. */
  private traceRosette: Trace = (cx, cy, rr) => {
    const ctx = this.ctx;
    ctx.beginPath();
    const lobes = 8;
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * TAU;
      const rad = rr * (0.82 + 0.28 * Math.cos(a * lobes));
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };

  private traceFor(polarity: number): Trace {
    return polarity === -1 ? this.traceDiamond : this.traceCircle;
  }

  /**
   * One printed element: the colour plate laid down slightly off-register, then the black key
   * plate on top. The offset is the whole trick — perfectly aligned plates read as vector clip
   * art, and a hair of misregistration reads as something physically printed.
   */
  private printShape(
    trace: Trace,
    x: number,
    y: number,
    r: number,
    plate: string | null,
    keyWeight: number,
    keyInk = ink.key,
  ): void {
    const ctx = this.ctx;
    const mx = MISREGISTER_X * this.scale;
    const my = MISREGISTER_Y * this.scale;

    if (plate) {
      ctx.fillStyle = plate;
      trace(x + mx, y + my, r);
      ctx.fill();
    }
    if (keyWeight > 0) {
      ctx.strokeStyle = keyInk;
      ctx.lineWidth = keyWeight;
      ctx.lineJoin = "round";
      trace(x, y, r);
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------

  draw(world: World): void {
    const ctx = this.ctx;
    this.cameraY = world.cameraY;

    if (world.shake > 0.001) {
      const s = world.shake * this.scale * 0.9;
      this.shakeX = (Math.random() * 2 - 1) * s;
      this.shakeY = (Math.random() * 2 - 1) * s;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }

    this.drawFurniture(world);

    // Everything from here is ink. Multiply is what makes two inks crossing produce a third,
    // darker colour instead of one simply hiding the other.
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    this.drawRecordLine(world);
    this.drawAnchors(world);
    this.drawScrap(world);
    this.drawHazards(world);
    this.drawChain(world);
    this.drawPlayer(world);
    this.drawParticles(world);
    ctx.restore();

    // Every knocked-out detail in one pass. Switching composite mode per object was costing
    // more than all the drawing put together — each switch forces the renderer to flush.
    this.drawKnockouts(world);
    this.drawFloats(world);
  }

  /**
   * Printing the paper colour back over ink, which is how a screenprint makes a hole in a
   * solid. Batched so the composite mode changes twice a frame rather than fifty times.
   */
  private drawKnockouts(world: World): void {
    const ctx = this.ctx;
    const fieldPol = world.field.polarity;
    ctx.save();
    ctx.fillStyle = ink.paper;
    ctx.strokeStyle = ink.paper;

    for (const s of world.scrap) {
      if (s.value < BIG_VALUE) continue;
      const matches = fieldPol === 0 || s.polarity === 0 || s.polarity === fieldPol;
      if (!matches) continue;
      const y = this.toScreenY(s.y);
      if (y < -40 || y > this.ch + 40) continue;
      this.traceRosette(this.toScreenX(s.x), y, s.r * this.scale * 0.36);
      ctx.fill();
    }

    ctx.lineWidth = Math.max(1.5, this.scale * 0.17);
    for (const h of world.hazards) {
      const y = this.toScreenY(h.y);
      if (y < -60 || y > this.ch + 60) continue;
      const x = this.toScreenX(h.x);
      const r = h.r * this.scale;
      const edible = world.options.charged && fieldPol !== 0 && h.polarity === fieldPol;
      if (edible) {
        // The ring is already open; nothing to knock out.
      } else {
        // A slash through the black mass, so a threat has some internal structure.
        ctx.beginPath();
        ctx.moveTo(x - r * 0.42, y - r * 0.42);
        ctx.lineTo(x + r * 0.42, y + r * 0.42);
        ctx.stroke();
      }
    }

    if (!(world.invulnTimer > 0 && Math.floor(world.invulnTimer * 12) % 2 === 0)) {
      const p = world.player;
      const x = this.toScreenX(p.x);
      const y = this.toScreenY(p.y);
      const r = p.r * this.scale * (1 + world.collectPulse * 0.2) * 0.42;
      const trace = this.traceFor(world.field.polarity);
      trace(x, y, r);
      ctx.fill();
      ctx.strokeStyle = ink.key;
      ctx.lineWidth = Math.max(2, this.scale * 0.2);
      trace(x, y, r);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * The stock, the shaded margins, the lane rules and the registration marks never move — the
   * camera only scrolls vertically and the lane is fixed on screen. Printing them once into an
   * offscreen sheet and blitting it turns several pattern fills per frame into one drawImage.
   */
  private bakeBackground(): void {
    const plate = document.createElement("canvas");
    plate.width = this.cw;
    plate.height = this.ch;
    const ctx = plate.getContext("2d");
    if (!ctx) return;

    const leftEdge = this.cw / 2 - TRACK_HALF * this.scale;
    const rightEdge = this.cw / 2 + TRACK_HALF * this.scale;

    ctx.fillStyle = ink.paper;
    ctx.fillRect(0, 0, this.cw, this.ch);

    ctx.fillStyle = ink.paperShade;
    ctx.fillRect(0, 0, leftEdge, this.ch);
    ctx.fillRect(rightEdge, 0, this.cw - rightEdge, this.ch);

    const halftone = ctx.createPattern(makeHalftoneTile(6, 1.3, "#6b6355"), "repeat");
    if (halftone) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = halftone;
      ctx.fillRect(0, 0, leftEdge, this.ch);
      ctx.fillRect(rightEdge, 0, this.cw - rightEdge, this.ch);
      ctx.restore();
    }

    ctx.strokeStyle = ink.key;
    ctx.lineWidth = Math.max(2, this.scale * 0.22);
    ctx.beginPath();
    ctx.moveTo(leftEdge, 0);
    ctx.lineTo(leftEdge, this.ch);
    ctx.moveTo(rightEdge, 0);
    ctx.lineTo(rightEdge, this.ch);
    ctx.stroke();

    this.drawRegistrationMarkOn(ctx, leftEdge * 0.5, this.ch * 0.12);
    this.drawRegistrationMarkOn(ctx, rightEdge + (this.cw - rightEdge) * 0.5, this.ch * 0.88);

    this.background = plate;
  }

  /** Blit the baked sheet, then print the only marks that actually move. */
  private drawFurniture(world: World): void {
    const ctx = this.ctx;
    if (this.background) ctx.drawImage(this.background, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = "multiply";

    // Speed marks, in the manga sense: dense hatching that crowds the edges of the frame and
    // leaves the centre clear. An evenly spaced grid of ticks reads as wallpaper, not motion,
    // so these are irregular in both length and position and biased away from the middle.
    const speedT = Math.min(1, (world.player.speed / 34 - 1) / 0.9);
    const spacing = 13 - speedT * 6;
    const first = Math.floor(this.cameraY / spacing) * spacing;
    ctx.strokeStyle = ink.key;
    ctx.globalAlpha = 0.22 + speedT * 0.4;
    ctx.lineWidth = Math.max(1, this.scale * 0.11);
    ctx.beginPath();
    for (let y = first; y < this.cameraY + this.viewHeightWorld + spacing; y += spacing) {
      const sy = this.toScreenY(y);
      // A cheap deterministic hash off the row, so marks do not crawl between frames.
      const h = Math.sin(y * 12.9898) * 43758.5453;
      for (let k = 0; k < 6; k++) {
        const rnd = (h * (k + 1)) % 1;
        const bias = rnd < 0 ? -1 : 1;
        const t = Math.abs(rnd);
        const sx = this.toScreenX(bias * (10 + t * 19));
        const len = (5 + t * 16 + speedT * 14) * this.scale;
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, sy + len);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawRegistrationMarkOn(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const r = this.scale * 1.5;
    if (r < 4) return;
    ctx.strokeStyle = ink.key;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = Math.max(1, this.scale * 0.08);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.moveTo(x - r * 1.7, y);
    ctx.lineTo(x + r * 1.7, y);
    ctx.moveTo(x, y - r * 1.7);
    ctx.lineTo(x, y + r * 1.7);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawScrap(world: World): void {
    const fieldPol = world.field.polarity;
    for (const s of world.scrap) {
      const x = this.toScreenX(s.x);
      const y = this.toScreenY(s.y);
      if (y < -40 || y > this.ch + 40) continue;
      const r = s.r * this.scale;
      const matches = fieldPol === 0 || s.polarity === 0 || s.polarity === fieldPol;
      // Big pieces get their own silhouette rather than just a bigger disc, so "valuable" and
      // "edible hazard" can never be confused at speed.
      const trace = s.value >= BIG_VALUE ? this.traceRosette : this.traceFor(s.polarity);


      // Yours is printed solid. Not yours is an unprinted outline — bare paper. That is a
      // far stronger read than bright-versus-dim, and it costs nothing.
      this.printShape(
        trace,
        x,
        y,
        r,
        matches ? inkFor(s.polarity) : null,
        Math.max(1.5, this.scale * (matches ? 0.17 : 0.13)),
        matches ? ink.key : inkFor(s.polarity),
      );

    }
  }

  private drawHazards(world: World): void {
    const ctx = this.ctx;
    const fieldPol = world.field.polarity;
    for (const h of world.hazards) {
      const x = this.toScreenX(h.x);
      const y = this.toScreenY(h.y);
      if (y < -60 || y > this.ch + 60) continue;
      const r = h.r * this.scale;
      const edible = world.options.charged && fieldPol !== 0 && h.polarity === fieldPol;
      const plate = inkFor(h.polarity);

      if (edible) {
        // Food, and it must not be confusable with either a pickup or a threat. Drawn as a
        // heavy open ring: no fill, no spikes. A play test could not tell these apart from
        // large scrap when both were solid discs, and misreading one as the other is the
        // difference between eating a wall and flinching away from it.
        ctx.strokeStyle = plate;
        ctx.lineWidth = Math.max(3, this.scale * 0.55);
        this.traceFor(h.polarity)(x, y, r * 0.78);
        ctx.stroke();
        ctx.strokeStyle = ink.key;
        ctx.lineWidth = Math.max(1.5, this.scale * 0.13);
        this.traceFor(h.polarity)(x, y, r * 1.06);
        ctx.stroke();
        this.traceFor(h.polarity)(x, y, r * 0.5);
        ctx.stroke();
        continue;
      }

      // Threat. Solid black key plate with the colour plate showing at the edges, and a ring
      // of hard spikes. Heavy black is the loudest thing a two-colour print can do.
      const spike: Trace = (cx, cy, rr) => {
        const ctx = this.ctx;
        ctx.beginPath();
        const points = 10;
        for (let i = 0; i < points * 2; i++) {
          const a = (i / (points * 2)) * TAU - Math.PI / 2;
          const rad = i % 2 === 0 ? rr * 1.34 : rr * 0.82;
          const px = cx + Math.cos(a) * rad;
          const py = cy + Math.sin(a) * rad;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      };

      this.printShape(spike, x, y, r, plate, 0);
      this.ctx.fillStyle = ink.key;
      spike(x, y, r);
      this.ctx.fill();

    }
  }

  /**
   * The player's own furthest distance, printed across the track as a finishing rule.
   *
   * This is the endless mode's only finish line, and the point is that it is *visible on the
   * approach*: ten seconds of watching your own record come towards you is what makes
   * crossing it feel like anything. Once it is behind you it stays drawn, so the run has a
   * marker showing how far past your best you are.
   */
  private drawRecordLine(world: World): void {
    if (world.recordLine <= 0) return;
    const y = this.toScreenY(world.recordLine);
    if (y < -60 || y > this.ch + 60) return;

    const ctx = this.ctx;
    const left = this.cw / 2 - TRACK_HALF * this.scale;
    const right = this.cw / 2 + TRACK_HALF * this.scale;
    const beaten = world.recordBeaten;

    ctx.save();
    ctx.strokeStyle = beaten ? ink.blue : ink.key;
    ctx.globalAlpha = beaten ? 0.5 : 0.8;
    ctx.lineWidth = Math.max(2, this.scale * 0.3);
    ctx.setLineDash([this.scale * 1.6, this.scale * 1.1]);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.setLineDash([]);

    const label = beaten ? "YOUR RECORD" : "YOUR BEST";
    const size = Math.round(this.scale * 2.1);
    // Held back until the rule is clear of the score and the hull pips. The line itself is
    // the signal; a caption fighting the HUD for the top of the screen is just noise.
    if (size >= 7 && y > this.ch * 0.17) {
      // Below the rule, always: the line scrolls in from the top of the screen, and a caption
      // above it would be clipped off during the entire approach — which is the only stretch
      // where the caption has a job to do.
      ctx.font = `900 ${size}px "Anton", Impact, "Haettenschweiler", "Arial Narrow", system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.globalAlpha = beaten ? 0.55 : 0.9;
      ctx.fillStyle = beaten ? ink.blue : ink.key;
      ctx.fillText(label, left + this.scale * 1.2, y + this.scale * 0.6);
    }
    ctx.restore();
  }

  private drawAnchors(world: World): void {
    for (const a of world.anchors) {
      const x = this.toScreenX(a.x);
      const y = this.toScreenY(a.y);
      if (y < -60 || y > this.ch + 60) continue;
      const r = a.r * this.scale;
      this.printShape(this.traceCircle, x, y, r, a.active ? ink.blue : null, Math.max(2, this.scale * 0.2));
    }
  }

  private drawChain(world: World): void {
    const n = Math.min(world.chain.length, 90);
    // Drawn tail-first so the pieces nearest the drone print over the ones behind them.
    for (let i = n - 1; i >= 0; i--) {
      const item = world.chain[i]!;
      const x = this.toScreenX(item.x);
      const y = this.toScreenY(item.y);
      if (y < -40 || y > this.ch + 40) continue;
      const taper = 1 - (i / n) * 0.32;
      const r = item.r * this.scale * taper * 1.35;
      this.printShape(
        this.traceFor(item.polarity),
        x,
        y,
        r,
        inkFor(item.polarity),
        Math.max(1, this.scale * 0.12),
      );
    }
  }

  private drawPlayer(world: World): void {
    const p = world.player;
    const x = this.toScreenX(p.x);
    const y = this.toScreenY(p.y);
    const pulse = 1 + world.collectPulse * 0.2;
    const r = p.r * this.scale * pulse;
    const pol = world.field.polarity;
    const plate = pol === 0 ? ink.key : inkFor(pol);
    const trace = this.traceFor(pol);

    if (world.invulnTimer > 0 && Math.floor(world.invulnTimer * 12) % 2 === 0) return;

    this.printShape(trace, x, y, r, plate, Math.max(2.5, this.scale * 0.26));

  }

  /** Ink splatter rather than sparks: irregular blobs that shrink and fade. */
  private drawParticles(world: World): void {
    const ctx = this.ctx;
    for (const p of world.particles) {
      const t = p.life / p.maxLife;
      const x = this.toScreenX(p.x);
      const y = this.toScreenY(p.y);
      const r = p.size * this.scale * t * 1.4;
      if (r < 0.4) continue;
      ctx.globalAlpha = Math.min(1, t * 1.4);
      ctx.fillStyle = p.hue;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.78, p.x * 0.7, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawFloats(world: World): void {
    if (world.floats.length === 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `900 ${Math.round(this.scale * 3.4)}px "Anton", Impact, "Haettenschweiler", "Arial Narrow", system-ui, sans-serif`;
    ctx.lineJoin = "round";
    for (const f of world.floats) {
      const t = f.life / f.maxLife;
      const x = this.toScreenX(f.x);
      const y = this.toScreenY(f.y);
      ctx.globalAlpha = Math.min(1, t * 1.6);
      // Key-plate outline under the ink, the way display type is trapped in a two-colour print.
      ctx.strokeStyle = ink.key;
      ctx.lineWidth = Math.max(3, this.scale * 0.42);
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.hue;
      ctx.fillText(f.text, x, y);
    }
    ctx.restore();
  }

  /**
   * Full-page passes that sit over the artwork: the grain that makes it paper, and the
   * flashes that make an impact land. Called after the mechanic overlay.
   */
  drawPostFx(world: World): void {
    const ctx = this.ctx;

    if (world.absorbFlash > 0.001) {
      // A slammed ink pass across the whole page. Reads as the press coming down hard.
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = world.absorbFlash * 0.3;
      ctx.fillStyle = world.absorbFlashInk;
      ctx.fillRect(0, 0, this.cw, this.ch);
      ctx.restore();
    }

    if (world.hitFlash > 0.001) {
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = world.hitFlash * 0.42;
      ctx.fillStyle = ink.red;
      ctx.fillRect(0, 0, this.cw, this.ch);
      ctx.restore();
    }

  }
}
