import "./style.css";
import { Input, type InputState } from "./core/input";
import { Loop } from "./core/loop";
import { Rng, randomCode, seedFromCode } from "./core/rng";
import { Renderer } from "./render/renderer";
import { GameAudio } from "./audio/audio";
import { autopilot, newAutopilotState, type AutopilotState } from "./game/autopilot";
import { makeGrainTile } from "./render/texture";
import { COURSE_LENGTH, VIEW_WIDTH, World } from "./game/world";
import {
  EDITIONS,
  UPGRADES,
  LEVELS,
  contractById,
  dailyCode,
  describeObjective,
  levelPassed,
  objectiveProgress,
  editionById,
  levelOf,
  loadSave,
  modifiersFor,
  nextGoal,
  saveSave,
  refillContracts,
  scrapFromScore,
  upgradeCost,
  type SaveData,
} from "./game/progression";
import { applyEdition } from "./render/palette";
import { Analytics, DebugSink } from "./analytics/analytics";
import { AdsService } from "./ads/ads";
import { REWARD } from "./ads/config";
import type { Mechanic } from "./mechanics/types";
import { PolarityMechanic } from "./mechanics/polarity";

const RUNS_KEY = "mm_runs_v1";
const MUTE_KEY = "mm_muted_v1";

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

type State = "menu" | "playing" | "results" | "shop" | "revive" | "levels";

class Game {
  private renderer: Renderer;
  private input = new Input();
  private audio = new GameAudio();
  private analytics = new Analytics();
  private ads = new AdsService(this.analytics);
  /** One rewarded continue per run, and one bonus per result. */
  private revivedThisRun = false;
  /** Score of the run whose results are on screen, for the bonus and the share text. */
  private lastRunScore = 0;
  /**
   * Demo mode: the game plays itself and the interface gets out of the way. Enabled with
   * ?demo=1, and used to film gameplay for store listings and ad creative without needing a
   * person, a phone and a camera in the room.
   */
  private demo = new URLSearchParams(location.search).has("demo");
  private autopilotState: AutopilotState = newAutopilotState();
  private loop: Loop;
  // One mechanic. Tether and Overload are parked in src/mechanics/, still working, still
  // measured by the balance harness, but out of the game.
  //
  // Overload was cut for the same reason Tether was: it never touches colour, so it is not
  // the game this became. It also measured far too easy — 96% pickup for a skilled player and
  // a skill lift a quarter of Switch's — and a play test said so independently. Two modes
  // also means every balance change has to be made twice, for a mode nobody preferred.
  private mechanics: Mechanic[] = [new PolarityMechanic()];
  private active: Mechanic = this.mechanics[0]!;
  private world: World;
  private state: State = "menu";
  private runs: RunRecord[] = loadRuns();
  private save: SaveData = loadSave();
  private shopTab: "upgrades" | "editions" = "upgrades";
  /** True when the current run is on today's shared course. */
  private isDaily = false;
  /** Index into LEVELS when playing the campaign, or -1 for a free run. */
  private levelIndex = -1;
  private seedCode = randomCode(new Rng(Date.now() >>> 0));

  private hud = el("hud");
  private scoreEl = el("score");
  private multEl = el("mult");
  private integrityEl = el("integrity");
  private progressEl = el("progress-fill");
  private hintEl = el("hint");
  private chargeEl = el("charge");
  private chargeShapeEl = el("charge-shape");
  private menuEl = el("menu");
  private resultsEl = el("results");
  private seedInput = el<HTMLInputElement>("seed-input");
  private muteEl = el<HTMLButtonElement>("mute");
  private shopEl = el("shop");
  private reviveEl = el("revive");
  private levelsEl = el("levels");
  private objectiveEl = el("objective");

  constructor() {
    const canvas = el<HTMLCanvasElement>("game");
    // Before the renderer bakes anything, so the baked sheet uses the right stock.
    applyEdition(editionById(this.save.edition));
    this.renderer = new Renderer(canvas);
    this.world = new World(seedFromCode(this.seedCode), this.active.worldOptions, modifiersFor(this.save));
    this.loop = new Loop(this.update, this.render);

    this.input.attach(canvas);
    this.buildIntegrity();
    this.seedInput.value = this.seedCode;

    // Browsers will not start audio without a gesture, so every entry point unlocks it.
    canvas.addEventListener("pointerdown", () => this.audio.unlock(), { passive: true });
    this.applyMute(localStorage.getItem(MUTE_KEY) === "1");
    this.muteEl.addEventListener("click", () => {
      this.audio.unlock();
      this.applyMute(!this.audio.muted);
    });

    el("btn-retry").addEventListener("click", () => this.startRun());
    el("btn-menu").addEventListener("click", () => {
      // Leaving the results sheet drops any level or daily context, so the next free run is
      // genuinely free rather than silently still being scored against level 7.
      this.levelIndex = -1;
      this.isDaily = false;
      this.showMenu();
    });
    el("btn-daily").addEventListener("click", () => {
      this.seedCode = dailyCode();
      this.seedInput.value = this.seedCode;
      this.isDaily = true;
      this.levelIndex = -1;
      this.startRun();
    });
    el("btn-levels").addEventListener("click", () => this.showLevels());
    el("btn-levels-close").addEventListener("click", () => this.showMenu());
    el("btn-shop").addEventListener("click", () => this.showShop());
    el("btn-shop-2").addEventListener("click", () => this.showShop());
    el("btn-shop-close").addEventListener("click", () => this.showMenu());
    el("tab-upgrades").addEventListener("click", () => this.setShopTab("upgrades"));
    el("tab-editions").addEventListener("click", () => this.setShopTab("editions"));
    this.seedInput.addEventListener("change", () => {
      const v = this.seedInput.value.trim().toUpperCase();
      this.seedCode = v.length > 0 ? v : randomCode(new Rng(Date.now() >>> 0));
      this.seedInput.value = this.seedCode;
    });

    // Paper grain is a static overlay, so the browser's compositor can blend it once rather
    // than the canvas re-filling a full-screen multiply pattern sixty times a second.
    el("grain").style.backgroundImage = `url(${makeGrainTile().toDataURL()})`;

    el("btn-revive").addEventListener("click", () => void this.watchToRevive());
    el("btn-give-up").addEventListener("click", () => this.endRun());
    el("btn-double").addEventListener("click", () => void this.watchToDouble());
    el("btn-share").addEventListener("click", () => void this.shareRun());
    el("btn-privacy").addEventListener("click", () => void this.ads.showPrivacyOptions());

    this.analytics.addSink(new DebugSink());
    this.analytics.start();
    // Consent, tracking permission and SDK start-up all happen in here, in that order.
    void this.ads.init();

    window.addEventListener("resize", this.onResize);
    this.onResize();
    if (this.demo) {
      document.body.classList.add("demo");
      this.startRun();
    } else {
      this.showMenu();
    }
    this.loop.start();
  }

  private onResize = (): void => {
    this.renderer.resize();
    this.world.setViewHeight(this.renderer.viewHeightWorld);
  };

  private applyMute(muted: boolean): void {
    this.audio.setMuted(muted);
    this.muteEl.textContent = muted ? "SOUND OFF" : "SOUND ON";
    this.muteEl.classList.toggle("off", muted);
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      // Storage unavailable. The toggle still works for this session.
    }
  }

  private buildIntegrity(): void {
    this.integrityEl.innerHTML = "";
    for (let i = 0; i < this.world.maxIntegrity; i++) {
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
        this.isDaily = false;
        this.levelIndex = -1;
        this.startRun();
      });
      list.appendChild(btn);
    }
  }

  private buildContracts(): void {
    const list = el("contract-list");
    list.innerHTML = "";
    for (const active of this.save.contracts) {
      const def = contractById(active.id);
      if (!def) continue;
      const pct = Math.min(100, (active.progress / def.target) * 100);
      const row = document.createElement("div");
      row.className = pct >= 100 ? "contract done" : "contract";
      row.innerHTML =
        `<div class="contract-top"><span>${def.text}</span>` +
        `<span class="contract-reward">${active.progress.toLocaleString()}/${def.target.toLocaleString()} · +${def.reward.toLocaleString()}</span></div>` +
        `<div class="contract-bar"><div class="contract-fill" style="width:${pct}%"></div></div>`;
      list.appendChild(row);
    }
  }

  /** Advance contracts, pay out anything finished, and draw replacements. */
  private settleContracts(summary: {
    score: number;
    won: boolean;
    absorbed: number;
    collected: number;
    maxCombo: number;
    hits: number;
  }): string[] {
    const completed: string[] = [];
    for (const active of this.save.contracts) {
      const def = contractById(active.id);
      if (!def || active.progress >= def.target) continue;
      active.progress += def.measure(summary);
      if (active.progress >= def.target) {
        this.save.scrap += def.reward;
        completed.push(`${def.text} — +${def.reward.toLocaleString()}`);
      }
    }
    if (completed.length > 0) {
      this.save.contracts = refillContracts(
        this.save.contracts.filter((a) => {
          const def = contractById(a.id);
          return def ? a.progress < def.target : false;
        }),
      );
    }
    return completed;
  }

  private summaryFor(id: string): string {
    const rs = this.runs.filter((r) => r.mechanic === id);
    if (rs.length === 0) return "";
    const best = Math.max(...rs.map((r) => r.score));
    const avg = Math.round(rs.reduce((a, r) => a + r.score, 0) / rs.length);
    return `${rs.length} run${rs.length === 1 ? "" : "s"} · best ${best} · avg ${avg}`;
  }

  private startRun(): void {
    this.world = new World(
      seedFromCode(this.seedCode),
      this.active.worldOptions,
      modifiersFor(this.save),
    );
    this.buildIntegrity();
    this.world.setViewHeight(this.renderer.viewHeightWorld);
    this.active.reset();
    this.input.reset();
    this.state = "playing";

    this.revivedThisRun = false;
    this.autopilotState = newAutopilotState();
    this.analytics.noteRunStarted();
    this.analytics.track("run_start", {
      mechanic: this.active.id,
      seed: this.seedCode,
      daily: this.isDaily,
    });

    this.audio.unlock();
    this.audio.setIntensity(0);
    this.audio.startMusic();
    this.world.events = {
      onCollect: (comboIndex) => this.audio.collect(comboIndex),
      onAbsorb: () => this.audio.absorb(),
      onHit: () => this.audio.hit(),
      onFlip: (toRed) => this.audio.flip(toRed),
    };

    this.menuEl.classList.add("hidden");
    this.resultsEl.classList.add("hidden");
    this.hud.classList.remove("hidden");
  }

  /** A continue is only worth offering on a real loss, deep enough in, once per run. */
  private shouldOfferRevive(): boolean {
    return (
      this.world.phase === "lost" &&
      !this.revivedThisRun &&
      this.world.progress >= REWARD.reviveMinProgress &&
      this.ads.rewardedReady
    );
  }

  private offerRevive(): void {
    this.state = "revive";
    this.audio.stopMusic();
    el("revive-score").textContent = this.world.score.toLocaleString();
    el("revive-note").textContent = `You are ${Math.round(this.world.progress * 100)}% through. Watch a short ad to carry on with the ${this.world.chain.length} pieces you are holding.`;
    this.hud.classList.add("hidden");
    this.reviveEl.classList.remove("hidden");
    this.analytics.track("rewarded_offered", { placement: "revive" });
  }

  private async watchToRevive(): Promise<void> {
    const earned = await this.ads.showRewarded("revive");
    if (!earned) {
      this.endRun();
      return;
    }
    this.revivedThisRun = true;
    this.world.revive(2);
    this.state = "playing";
    this.reviveEl.classList.add("hidden");
    this.hud.classList.remove("hidden");
    this.buildIntegrity();
    this.input.reset();
    this.audio.startMusic();
  }

  /** Offered after the score is already banked, so it adds rather than withholds. */
  private async watchToDouble(): Promise<void> {
    const earned = await this.ads.showRewarded("double_scrap");
    if (!earned) return;
    const bonus = scrapFromScore(this.lastRunScore) * (REWARD.doubleScrapMultiplier - 1);
    this.save.scrap += bonus;
    saveSave(this.save);
    this.analytics.track("currency_earned", { amount: bonus, source: "rewarded_double" });
    el<HTMLButtonElement>("btn-double").disabled = true;
    el("result-goal").innerHTML = `<b>+${bonus.toLocaleString()} scrap</b> added. Banked: ${this.save.scrap.toLocaleString()}.`;
    this.audio.unlock();
    this.audio.absorb();
  }

  /**
   * Sharing is the growth strategy, not a nicety: paid acquisition does not add up at this
   * budget, so the run has to be able to leave the phone. The course code makes it a
   * challenge rather than a boast — the recipient can play the exact same course.
   */
  private async shareRun(): Promise<void> {
    const text = `I hauled ${this.lastRunScore.toLocaleString()} out of Magnet Metro on course ${this.seedCode}. Beat it.`;
    this.analytics.track("share_opened", { score: this.lastRunScore, seed: this.seedCode });
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      el<HTMLButtonElement>("btn-share").textContent = "Copied";
    } catch {
      // Dismissed the sheet, or no clipboard permission. Nothing to recover from.
    }
  }

  private showLevels(): void {
    this.state = "levels";
    this.menuEl.classList.add("hidden");
    this.resultsEl.classList.add("hidden");
    this.hud.classList.add("hidden");
    this.levelsEl.classList.remove("hidden");

    const list = el("level-list");
    list.innerHTML = "";
    for (let i = 0; i < LEVELS.length; i++) {
      const lv = LEVELS[i]!;
      const done = i < this.save.levelsDone;
      // Strictly sequential: exactly one level is ever the next thing to do.
      const locked = i > this.save.levelsDone;

      const btn = document.createElement("button");
      btn.className = done ? "level done" : "level";
      btn.disabled = locked;
      const prize = lv.unlockEdition
        ? `+${lv.reward.toLocaleString()} scrap · ${lv.unlockEdition} edition`
        : `+${lv.reward.toLocaleString()} scrap`;
      btn.innerHTML =
        `<span class="level-n">${lv.n}</span>` +
        `<span class="level-body"><span class="level-goal">${describeObjective(lv)}</span>` +
        `<div class="level-prize">${done ? "COMPLETE" : locked ? "LOCKED" : prize}</div></span>`;
      btn.addEventListener("click", () => {
        this.levelIndex = i;
        this.isDaily = false;
        this.seedCode = lv.seed;
        this.seedInput.value = lv.seed;
        this.levelsEl.classList.add("hidden");
        this.startRun();
      });
      list.appendChild(btn);
    }
  }

  private showMenu(): void {
    this.state = "menu";
    this.levelsEl.classList.add("hidden");
    this.buildMenu();
    this.buildContracts();
    el("bank-value").textContent = this.save.scrap.toLocaleString();

    const total = LEVELS.length;
    el("levels-note").textContent =
      this.save.levelsDone >= total
        ? "All twelve cleared"
        : `Level ${this.save.levelsDone + 1} of ${total}`;

    const today = dailyCode();
    const done = this.save.dailyDate === today;
    el("daily-note").textContent = done
      ? `Your best today: ${this.save.dailyBest.toLocaleString()}`
      : "Same course for everyone, once a day";

    this.shopEl.classList.add("hidden");
    this.hud.classList.add("hidden");
    this.resultsEl.classList.add("hidden");
    this.menuEl.classList.remove("hidden");
  }

  private endRun(): void {
    this.state = "results";
    const w = this.world;
    this.lastRunScore = w.score;
    this.reviveEl.classList.add("hidden");
    this.audio.stopMusic();
    this.audio.finish(w.phase === "won");
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

    // Everything scored in a run is banked. A run that only produces a number is over the
    // moment it ends; a run that moves you closer to a wider coil is a reason to start another.
    const banked = scrapFromScore(record.score);
    this.save.scrap += banked;
    this.save.lifetimeScrap += banked;
    this.save.runs += 1;

    const today = dailyCode();
    if (this.isDaily) {
      if (this.save.dailyDate !== today) {
        this.save.dailyDate = today;
        this.save.dailyBest = 0;
      }
      this.save.dailyBest = Math.max(this.save.dailyBest, record.score);
    }

    // Campaign outcome, settled before the results sheet is written so the copy can lead with
    // it. A level is the clearest goal the player has; it should be the headline, not a note.
    const level = this.levelIndex >= 0 ? LEVELS[this.levelIndex] : undefined;
    let levelCleared = false;
    if (level) {
      const passed = levelPassed(level, {
        score: record.score,
        won: record.won,
        absorbed: w.stats.absorbed,
        collected: record.collected,
        maxCombo: record.maxCombo,
        hits: record.hits,
      });
      // Only the frontier level advances progress; replaying an earlier one pays nothing, so
      // the easiest level cannot be farmed for scrap.
      if (passed && this.levelIndex === this.save.levelsDone) {
        levelCleared = true;
        this.save.levelsDone += 1;
        this.save.scrap += level.reward;
        if (level.unlockEdition && !this.save.ownedEditions.includes(level.unlockEdition)) {
          this.save.ownedEditions.push(level.unlockEdition);
        }
        this.analytics.track("currency_earned", { amount: level.reward, source: `level_${level.n}` });
      }
      this.analytics.track("run_end", { level: level.n, passed });
    }

    const completed = this.settleContracts({
      score: banked,
      won: record.won,
      absorbed: w.stats.absorbed,
      collected: record.collected,
      maxCombo: record.maxCombo,
      hits: record.hits,
    });
    saveSave(this.save);

    const prior = this.runs.filter((r) => r.mechanic === this.active.id && r !== record);
    const priorBest = prior.length ? Math.max(...prior.map((r) => r.score)) : 0;

    el("result-title").textContent = level
      ? levelCleared
        ? `Level ${level.n} complete`
        : `Level ${level.n} — ${describeObjective(level).toLowerCase()}`
      : record.won
        ? this.isDaily
          ? "Today's run — cleared"
          : "Course cleared"
        : "Drone destroyed";
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
      ["Mines swallowed", String(w.stats.absorbed)],
      ["Scrap banked", `+${banked.toLocaleString()}`],
      ["Course reached", `${Math.round((Math.min(this.world.player.y, COURSE_LENGTH) / COURSE_LENGTH) * 100)}%`],
    ];
    el("result-stats").innerHTML = rows
      .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
      .join("");

    // The concrete next thing, named, with the gap. "Come back tomorrow" is not a reason to
    // return; "1,400 more and the coil gets wider" is.
    const goal = nextGoal(this.save);
    el("result-goal").innerHTML = levelCleared
      ? `<b>+${level!.reward.toLocaleString()} scrap.</b>${level!.unlockEdition ? ` The ${level!.unlockEdition} edition is yours — equip it in the workshop.` : " Next level unlocked."}`
      : level
        ? `<b>Not this time.</b> ${describeObjective(level)}. Run it again.`
        : completed.length
      ? `<b>Contract complete.</b><br>${completed.join("<br>")}`
      : goal
      ? goal.remaining === 0
        ? `<b>${goal.label}.</b> Spend it in the workshop.`
        : `<b>${goal.remaining.toLocaleString()} more scrap</b> unlocks ${goal.label}.`
      : "<b>Everything is bought.</b> Nothing left but a better score.";

    el("compare").innerHTML = this.comparisonTable();

    const doubleBtn = el<HTMLButtonElement>("btn-double");
    doubleBtn.disabled = !this.ads.rewardedReady || record.score <= 0;
    if (!doubleBtn.disabled) {
      this.analytics.track("rewarded_offered", { placement: "double_scrap" });
    }
    el<HTMLButtonElement>("btn-share").textContent = "Share run";

    this.analytics.track("run_end", {
      mechanic: this.active.id,
      won: record.won,
      score: record.score,
      absorbed: w.stats.absorbed,
      hits: record.hits,
      duration: Math.round(record.duration),
      daily: this.isDaily,
    });
    this.analytics.track("currency_earned", { amount: banked, source: "run" });
    for (const done of completed) this.analytics.track("contract_completed", { detail: done });

    this.hud.classList.add("hidden");
    this.resultsEl.classList.remove("hidden");

    // Only once the results are already on screen, and only if pacing allows. Never between a
    // tap and the thing the tap was for.
    void this.ads.maybeShowInterstitial(this.save.runs);
  }

  // -------------------------------------------------------------------------
  // Workshop
  // -------------------------------------------------------------------------

  private showShop(): void {
    this.state = "shop";
    this.menuEl.classList.add("hidden");
    this.resultsEl.classList.add("hidden");
    this.hud.classList.add("hidden");
    this.shopEl.classList.remove("hidden");
    el("btn-privacy").classList.toggle("hidden", !this.ads.canShowPrivacyOptions);
    this.renderShop();
  }

  private setShopTab(tab: "upgrades" | "editions"): void {
    this.shopTab = tab;
    el("tab-upgrades").classList.toggle("on", tab === "upgrades");
    el("tab-editions").classList.toggle("on", tab === "editions");
    this.renderShop();
  }

  private renderShop(): void {
    el("shop-bank").textContent = this.save.scrap.toLocaleString();
    const list = el("shop-list");
    list.innerHTML = "";
    if (this.shopTab === "upgrades") this.renderUpgrades(list);
    else this.renderEditions(list);
  }

  private renderUpgrades(list: HTMLElement): void {
    for (const def of UPGRADES) {
      const level = levelOf(this.save, def.id);
      const maxed = level >= def.maxLevel;
      const cost = maxed ? 0 : upgradeCost(def, level);
      const affordable = !maxed && this.save.scrap >= cost;

      const row = document.createElement("div");
      row.className = maxed ? "item owned" : "item";

      const body = document.createElement("div");
      body.className = "item-body";
      body.innerHTML =
        `<div class="item-name">${def.name}</div>` +
        `<div class="item-blurb">${def.blurb}</div>` +
        `<div class="item-state">${def.describe(level)}</div>` +
        `<div class="pips">${Array.from(
          { length: def.maxLevel },
          (_, i) => `<span class="pip${i < level ? " on" : ""}"></span>`,
        ).join("")}</div>`;

      const buy = document.createElement("button");
      buy.className = "buy";
      buy.textContent = maxed ? "MAX" : cost.toLocaleString();
      buy.disabled = maxed || !affordable;
      buy.addEventListener("click", () => {
        if (this.save.scrap < cost) return;
        this.save.scrap -= cost;
        this.save.upgrades[def.id] = level + 1;
        saveSave(this.save);
        this.analytics.track("currency_spent", { amount: cost, sink: def.id });
        this.analytics.track("upgrade_bought", { id: def.id, level: level + 1 });
        this.audio.unlock();
        this.audio.absorb();
        this.renderShop();
      });

      row.append(body, buy);
      list.appendChild(row);
    }
  }

  private renderEditions(list: HTMLElement): void {
    for (const ed of EDITIONS) {
      const owned = this.save.ownedEditions.includes(ed.id);
      const equipped = this.save.edition === ed.id;
      const affordable = this.save.scrap >= ed.cost;

      const row = document.createElement("div");
      row.className = owned ? "item owned" : "item";

      const swatch = document.createElement("div");
      swatch.className = "swatch";
      swatch.style.background = ed.paper;
      swatch.innerHTML =
        `<i style="background:${ed.blue}"></i><i style="background:${ed.red}"></i>`;

      const body = document.createElement("div");
      body.className = "item-body";
      body.innerHTML =
        `<div class="item-name">${ed.name}</div>` +
        `<div class="item-blurb">${ed.blurb}</div>`;

      const buy = document.createElement("button");
      buy.className = equipped ? "buy equipped" : "buy";
      buy.textContent = equipped ? "ON" : owned ? "USE" : ed.cost.toLocaleString();
      buy.disabled = !owned && !affordable;
      buy.addEventListener("click", () => {
        if (!owned) {
          if (this.save.scrap < ed.cost) return;
          this.save.scrap -= ed.cost;
          this.save.ownedEditions.push(ed.id);
          this.analytics.track("currency_spent", { amount: ed.cost, sink: `edition_${ed.id}` });
          this.analytics.track("edition_bought", { id: ed.id });
        }
        this.save.edition = ed.id;
        saveSave(this.save);
        // Re-print everything: the canvas plates and the interface both follow the stock.
        applyEdition(ed);
        this.renderer.resize();
        this.audio.unlock();
        this.audio.absorb();
        this.renderShop();
      });

      row.append(swatch, body, buy);
      list.appendChild(row);
    }
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

    let input: InputState;
    if (this.demo) {
      input = autopilot(this.world, this.active.id, this.autopilotState);
    } else {
      const raw = this.input.snapshot(performance.now() / 1000);
      // Drag arrives in CSS pixels; mechanics work in world units.
      const worldPerPixel = VIEW_WIDTH / this.renderer.cssWidth;
      input = { ...raw, dragDx: raw.dragDx * worldPerPixel };
    }
    this.active.update(this.world, input, dt);
    this.world.step(dt);

    if (this.world.phase !== "running") {
      if (this.demo) {
        this.seedCode = randomCode(new Rng(Date.now() >>> 0));
        this.startRun();
      } else if (this.shouldOfferRevive()) this.offerRevive();
      else this.endRun();
    }
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

    // The prompt is authored by the mechanic against course position, so it always describes
    // whatever is on screen right now rather than running off a fixed timer.
    this.hintEl.textContent = w.prompt;
    this.hintEl.classList.toggle("on", w.prompt.length > 0);
    this.hintEl.classList.toggle("urgent", w.promptUrgent);

    // The soundtrack is driven by how the run is going, not by a clock.
    this.audio.setIntensity(0.35 * w.progress + 0.65 * Math.min(1, w.combo / 40));

    const level = this.levelIndex >= 0 ? LEVELS[this.levelIndex] : undefined;
    this.objectiveEl.classList.toggle("hidden", !level);
    if (level) {
      const prog = objectiveProgress(level, {
        score: w.score,
        absorbed: w.stats.absorbed,
        maxCombo: w.stats.maxCombo,
        hits: w.stats.hits,
        progress: w.progress,
      });
      el("objective-text").textContent = `Lv ${level.n} · ${describeObjective(level)}`;
      el("objective-progress").textContent = prog.text;
      this.objectiveEl.classList.toggle("done", prog.done);
    }

    const pol = w.field.polarity;
    this.chargeEl.classList.toggle("hidden", pol === 0);
    this.chargeShapeEl.classList.toggle("red", pol === -1);

    const cells = this.integrityEl.children;
    for (let i = 0; i < cells.length; i++) {
      cells[i]!.classList.toggle("off", i >= w.integrity);
    }
  };
}

new Game();
