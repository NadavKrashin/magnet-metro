import { TAU } from "../core/math";
import { TRACK_HALF, VIEW_WIDTH, World } from "../game/world";
import type { View } from "./view";

const COLOR_BLUE = "#5cc8ff";
const COLOR_RED = "#ff5d6c";
const COLOR_NEUTRAL = "#9fb4cc";
const COLOR_GOLD = "#ffd257";
const COLOR_ANCHOR = "#7cf5c8";

function scrapColor(polarity: number, value: number): string {
  if (value >= 5) return COLOR_GOLD;
  if (polarity === 1) return COLOR_BLUE;
  if (polarity === -1) return COLOR_RED;
  return COLOR_NEUTRAL;
}

export class Renderer implements View {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  scale = 1;
  private cw = 0;
  private ch = 0;
  private cameraY = 0;
  private shakeX = 0;
  private shakeY = 0;

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
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.cw = this.canvas.width;
    this.ch = this.canvas.height;
    this.scale = this.cw / VIEW_WIDTH;
  }

  toScreenX(worldX: number): number {
    return this.cw / 2 + worldX * this.scale + this.shakeX;
  }

  toScreenY(worldY: number): number {
    return this.ch - (worldY - this.cameraY) * this.scale + this.shakeY;
  }

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

    this.drawBackground(ctx);
    this.drawAnchors(ctx, world);
    this.drawScrap(ctx, world);
    this.drawHazards(ctx, world);
    this.drawChain(ctx, world);
    this.drawPlayer(ctx, world);
    this.drawParticles(ctx, world);
    this.drawFloats(ctx, world);
  }

  /** Called after the mechanic overlay so the flash sits on top of everything. */
  drawPostFx(world: World): void {
    if (world.hitFlash <= 0.001) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = world.hitFlash * 0.28;
    ctx.fillStyle = COLOR_RED;
    ctx.fillRect(0, 0, this.cw, this.ch);
    ctx.restore();
  }

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createLinearGradient(0, 0, 0, this.ch);
    g.addColorStop(0, "#080d18");
    g.addColorStop(1, "#111a2e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.cw, this.ch);

    // Scrolling floor lines give a sense of speed without any extra assets.
    const spacing = 20;
    const first = Math.floor(this.cameraY / spacing) * spacing;
    ctx.strokeStyle = "rgba(110,150,215,0.10)";
    ctx.lineWidth = Math.max(1, this.scale * 0.08);
    ctx.beginPath();
    for (let y = first; y < this.cameraY + this.viewHeightWorld + spacing; y += spacing) {
      const sy = this.toScreenY(y);
      ctx.moveTo(this.toScreenX(-TRACK_HALF), sy);
      ctx.lineTo(this.toScreenX(TRACK_HALF), sy);
    }
    ctx.stroke();

    // Track edges.
    const edge = this.scale * 0.35;
    ctx.fillStyle = "rgba(92,200,255,0.30)";
    ctx.fillRect(this.toScreenX(-TRACK_HALF) - edge, 0, edge, this.ch);
    ctx.fillRect(this.toScreenX(TRACK_HALF), 0, edge, this.ch);

    // Dim everything outside the playable area so the lane reads instantly.
    ctx.fillStyle = "rgba(4,7,14,0.55)";
    ctx.fillRect(0, 0, this.toScreenX(-TRACK_HALF) - edge, this.ch);
    ctx.fillRect(this.toScreenX(TRACK_HALF) + edge, 0, this.cw, this.ch);
  }

  /** A soft halo. Cheaper than shadowBlur, which is expensive on mobile GPUs. */
  private glow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    color: string,
    alpha: number,
  ): void {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawScrap(ctx: CanvasRenderingContext2D, world: World): void {
    for (const s of world.scrap) {
      const x = this.toScreenX(s.x);
      const y = this.toScreenY(s.y);
      if (y < -40 || y > this.ch + 40) continue;
      const r = s.r * this.scale;
      const color = scrapColor(s.polarity, s.value);

      this.glow(ctx, x, y, r * 2.4, color, 0.14);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();

      // Bright core so items stay visible against the glow when densely packed.
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.beginPath();
      ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.35, 0, TAU);
      ctx.fill();
    }
  }

  private drawHazards(ctx: CanvasRenderingContext2D, world: World): void {
    for (const h of world.hazards) {
      const x = this.toScreenX(h.x);
      const y = this.toScreenY(h.y);
      if (y < -60 || y > this.ch + 60) continue;
      const r = h.r * this.scale;
      // Charged hazards are tinted by their charge so the player can plan the flip early.
      const tint = h.polarity === 1 ? COLOR_BLUE : h.polarity === -1 ? COLOR_RED : "#ff8a4d";

      this.glow(ctx, x, y, r * 2.0, tint, 0.16);

      if (h.kind === "block") {
        ctx.fillStyle = "#1d2942";
        ctx.beginPath();
        ctx.roundRect(x - r, y - r * 0.72, r * 2, r * 1.44, r * 0.3);
        ctx.fill();
        ctx.strokeStyle = tint;
        ctx.lineWidth = Math.max(1.5, this.scale * 0.2);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#1d2942";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = tint;
        ctx.lineWidth = Math.max(1.5, this.scale * 0.2);
        ctx.stroke();
        // Spikes read as "do not touch" at a glance, even at thumbnail size in an ad clip.
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          ctx.moveTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
          ctx.lineTo(x + Math.cos(a) * r * 1.45, y + Math.sin(a) * r * 1.45);
        }
        ctx.stroke();
      }
    }
  }

  private drawAnchors(ctx: CanvasRenderingContext2D, world: World): void {
    for (const a of world.anchors) {
      const x = this.toScreenX(a.x);
      const y = this.toScreenY(a.y);
      if (y < -60 || y > this.ch + 60) continue;
      const r = a.r * this.scale;

      this.glow(ctx, x, y, r * (a.active ? 3.4 : 2.2), COLOR_ANCHOR, a.active ? 0.3 : 0.14);
      ctx.strokeStyle = COLOR_ANCHOR;
      ctx.lineWidth = Math.max(1.5, this.scale * 0.22);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = COLOR_ANCHOR;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.38, 0, TAU);
      ctx.fill();
    }
  }

  private drawChain(ctx: CanvasRenderingContext2D, world: World): void {
    const n = Math.min(world.chain.length, 70);
    for (let i = n - 1; i >= 0; i--) {
      const item = world.chain[i]!;
      const x = this.toScreenX(item.x);
      const y = this.toScreenY(item.y);
      if (y < -40 || y > this.ch + 40) continue;
      // Taper the tail so a long chain still reads as a single object.
      const taper = 1 - (i / n) * 0.45;
      const r = item.r * this.scale * taper;
      const color = scrapColor(item.polarity, item.value);
      this.glow(ctx, x, y, r * 2.0, color, 0.10);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.55 + 0.45 * taper;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, world: World): void {
    const p = world.player;
    const x = this.toScreenX(p.x);
    const y = this.toScreenY(p.y);
    const pulse = 1 + world.collectPulse * 0.18;
    const r = p.r * this.scale * pulse;
    const pol = world.field.polarity;
    const color = pol === 1 ? COLOR_BLUE : pol === -1 ? COLOR_RED : "#e8f2ff";

    // Blink while invulnerable so the player knows the hit registered and they are safe.
    if (world.invulnTimer > 0 && Math.floor(world.invulnTimer * 12) % 2 === 0) return;

    this.glow(ctx, x, y, r * 3.0, color, 0.22);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, r * 0.52, 0, TAU);
    ctx.fill();

    // A forward fin, so the drone has a clear facing and the shape is recognisable in a clip.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 2.0);
    ctx.lineTo(x - r * 0.62, y - r * 0.5);
    ctx.lineTo(x + r * 0.62, y - r * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  private drawParticles(ctx: CanvasRenderingContext2D, world: World): void {
    for (const p of world.particles) {
      const t = p.life / p.maxLife;
      const x = this.toScreenX(p.x);
      const y = this.toScreenY(p.y);
      ctx.globalAlpha = t * 0.9;
      ctx.fillStyle = p.hue;
      ctx.beginPath();
      ctx.arc(x, y, p.size * this.scale * t, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawFloats(ctx: CanvasRenderingContext2D, world: World): void {
    if (world.floats.length === 0) return;
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `700 ${Math.round(this.scale * 2.6)}px system-ui, -apple-system, sans-serif`;
    for (const f of world.floats) {
      const t = f.life / f.maxLife;
      ctx.globalAlpha = Math.min(1, t * 1.6);
      ctx.fillStyle = f.hue;
      ctx.fillText(f.text, this.toScreenX(f.x), this.toScreenY(f.y));
    }
    ctx.restore();
  }
}
