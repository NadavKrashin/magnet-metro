import "./style.css";
import { Input } from "./core/input";
import { Loop } from "./core/loop";
import { Rng, randomCode, seedFromCode } from "./core/rng";
import { Renderer } from "./render/renderer";
import { COURSE_LENGTH, MAX_INTEGRITY, VIEW_WIDTH, World } from "./game/world";
import type { Mechanic } from "./mechanics/types";
import { PolarityMechanic } from "./mechanics/polarity";
import { TetherMechanic } from "./mechanics/tether";
import { OverloadMechanic } from "./mechanics/overload";

const HINT_DURATION = 4.5;
const RUNS_KEY = "mm_runs_v1";

interface RunRecord {
  mechanic: string;
  score: number;
  won: boolean;
  collected: number;
  missed: number;
  hits: number;
  maxCombo: number;
  actions: number;
  duration: number;
  seed: string;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

function loadRuns(): RunRecord[] {
  try {
    const raw = localStorage.getItem(RUNS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RunRecord[]) : [];
  } catch {
    return [];
  }
}

function saveRuns(runs: RunRecord[]): void {
  try {
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs.slice(-200)));
  } catch {
    // Private browsing or a full quota. Losing the log is not worth breaking the game over.
  }
}

type State = "menu" | "playing" | "results";

class Game {
  private renderer: Renderer;
  private input = new Input();
  private loop: Loop;
  private mechanics: Mechanic[] = [
    new PolarityMechanic(),
    new TetherMechanic(),
    new OverloadMechanic(),
  ];
  private active: Mechanic = this.mechanics[0]!;
  private world: World;
  private state: State = "menu";
  private runs: RunRecord[] = loadRuns();
  private seedCode = randomCode(new Rng(Date.now() >>> 0));

  private hud = el("hud");
  private scoreEl = el("score");
  private multEl = el("mult");
  private integrityEl = el("integrity");
  private progressEl = el("progress-fill");
  private hintEl = el("hint");
  private menuEl = el("menu");
  private resultsEl = el("results");
  private seedInput = el<HTMLInputElement>("seed-input");

  constructor() {
    const canvas = el<HTMLCanvasElement>("game");
    this.renderer = new Renderer(canvas);
    this.world = new World(seedFromCode(this.seedCode), this.active.worldOptions);
    this.loop = new Loop(this.update, this.render);

    this.input.attach(canvas);
    this.buildIntegrity();
    this.buildMenu();
    this.seedInput.value = this.seedCode;

    el("btn-retry").addEventListener("click", () => this.startRun());
    el("btn-menu").addEventListener("click", () => this.showMenu());
    this.seedInput.addEventListener("change", () => {
      const v = this.seedInput.value.trim().toUpperCase();
      this.seedCode = v.length > 0 ? v : randomCode(new Rng(Date.now() >>> 0));
      this.seedInput.value = this.seedCode;
    });

    window.addEventListener("resize", this.onResize);
    this.onResize();
    this.loop.start();
  }

  private onResize = (): void => {
    this.renderer.resize();
    this.world.setViewHeight(this.renderer.viewHeightWorld);
  };

  private buildIntegrity(): void {
    this.integrityEl.innerHTML = "";
    for (let i = 0; i < MAX_INTEGRITY; i++) {
      const d = document.createElement("div");
      d.className = "cell";
      this.integrityEl.appendChild(d);
    }
  }

  private buildMenu(): void {
    const list = el("mechanic-list");
    list.innerHTML = "";
    for (const m of this.mechanics) {
      const stats = this.summaryFor(m.id);
      const btn = document.createElement("button");
      btn.className = "mech";
      btn.innerHTML =
        `<div class="mech-name">${m.name}</div>` +
        `<div class="mech-pitch">${m.pitch}</div>` +
        (stats ? `<div class="mech-best">${stats}</div>` : "");
      btn.addEventListener("click", () => {
        this.active = m;
        this.startRun();
      });
      list.appendChild(btn);
    }
  }

  private summaryFor(id: string): string {
    const rs = this.runs.filter((r) => r.mechanic === id);
    if (rs.length === 0) return "";
    const best = Math.max(...rs.map((r) => r.score));
    const avg = Math.round(rs.reduce((a, r) => a + r.score, 0) / rs.length);
    return `${rs.length} run${rs.length === 1 ? "" : "s"} · best ${best} · avg ${avg}`;
  }

  private startRun(): void {
    this.world = new World(seedFromCode(this.seedCode), this.active.worldOptions);
    this.world.setViewHeight(this.renderer.viewHeightWorld);
    this.active.reset();
    this.input.reset();
    this.state = "playing";

    this.menuEl.classList.add("hidden");
    this.resultsEl.classList.add("hidden");
    this.hud.classList.remove("hidden");
    this.hintEl.textContent = this.active.hint;
    this.hintEl.classList.add("on");
  }

  private showMenu(): void {
    this.state = "menu";
    this.buildMenu();
    this.hud.classList.add("hidden");
    this.resultsEl.classList.add("hidden");
    this.menuEl.classList.remove("hidden");
  }

  private endRun(): void {
    this.state = "results";
    const w = this.world;
    const record: RunRecord = {
      mechanic: this.active.id,
      score: w.score,
      won: w.phase === "won",
      collected: w.stats.collected,
      missed: w.stats.missed,
      hits: w.stats.hits,
      maxCombo: w.stats.maxCombo,
      actions: w.stats.actions,
      duration: w.stats.duration,
      seed: this.seedCode,
    };
    this.runs.push(record);
    saveRuns(this.runs);

    const prior = this.runs.filter((r) => r.mechanic === this.active.id && r !== record);
    const priorBest = prior.length ? Math.max(...prior.map((r) => r.score)) : 0;

    el("result-title").textContent = record.won
      ? `${this.active.name} — course cleared`
      : `${this.active.name} — drone destroyed`;
    el("result-score").textContent = String(record.score);
    el("result-best").textContent =
      record.score > priorBest && prior.length > 0
        ? `New best for ${this.active.name}`
        : priorBest > 0
          ? `Best so far: ${priorBest}`
          : "";

    const total = record.collected + record.missed;
    const pickup = total > 0 ? Math.round((record.collected / total) * 100) : 0;
    const rows: [string, string][] = [
      ["Scrap collected", String(record.collected)],
      ["Pickup rate", `${pickup}%`],
      ["Best combo", String(record.maxCombo)],
      ["Hits taken", String(record.hits)],
      ["Thumb actions", String(record.actions)],
      ["Time", `${record.duration.toFixed(1)}s`],
      ["Course reached", `${Math.round((Math.min(this.world.player.y, COURSE_LENGTH) / COURSE_LENGTH) * 100)}%`],
    ];
    el("result-stats").innerHTML = rows
      .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
      .join("");

    el("compare").innerHTML = this.comparisonTable();

    this.hud.classList.add("hidden");
    this.resultsEl.classList.remove("hidden");
  }

  /**
   * The point of the harness. Averages per mechanic on comparable runs, so the choice is made
   * on evidence rather than on which one sounded best in the design document.
   */
  private comparisonTable(): string {
    const lines: string[] = ["<b>All runs so far</b>"];
    for (const m of this.mechanics) {
      const rs = this.runs.filter((r) => r.mechanic === m.id);
      if (rs.length === 0) {
        lines.push(`${m.name}: not played yet`);
        continue;
      }
      const avg = Math.round(rs.reduce((a, r) => a + r.score, 0) / rs.length);
      const clear = Math.round((rs.filter((r) => r.won).length / rs.length) * 100);
      const hits = (rs.reduce((a, r) => a + r.hits, 0) / rs.length).toFixed(1);
      const apm = (
        rs.reduce((a, r) => a + (r.duration > 0 ? r.actions / r.duration : 0), 0) / rs.length
      ).toFixed(1);
      lines.push(
        `<b>${m.name}</b> — ${rs.length} runs · avg ${avg} · cleared ${clear}% · ${hits} hits · ${apm} actions/s`,
      );
    }
    return lines.join("<br>");
  }

  private update = (dt: number): void => {
    if (this.state !== "playing") return;

    const raw = this.input.snapshot(performance.now() / 1000);
    // Drag arrives in CSS pixels; mechanics work in world units.
    const worldPerPixel = VIEW_WIDTH / this.renderer.cssWidth;
    this.active.update(this.world, { ...raw, dragDx: raw.dragDx * worldPerPixel }, dt);
    this.world.step(dt);

    if (this.world.elapsed > HINT_DURATION) this.hintEl.classList.remove("on");
    if (this.world.phase !== "running") this.endRun();
  };

  private render = (): void => {
    this.renderer.draw(this.world);
    this.active.draw?.(this.renderer.context, this.world, this.renderer);
    this.renderer.drawPostFx(this.world);

    if (this.state !== "playing") return;
    const w = this.world;
    this.scoreEl.textContent = String(w.score);
    const mult = w.multiplier;
    this.multEl.textContent = `x${mult}`;
    this.multEl.classList.toggle("on", mult > 1);
    this.progressEl.style.width = `${w.progress * 100}%`;

    const cells = this.integrityEl.children;
    for (let i = 0; i < cells.length; i++) {
      cells[i]!.classList.toggle("off", i >= w.integrity);
    }
  };
}

new Game();
