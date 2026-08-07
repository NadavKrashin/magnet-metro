import "./style.css";
import { Input, type InputState } from "./core/input";
import { Loop } from "./core/loop";
import { Rng, randomCode, seedFromCode } from "./core/rng";
import { Renderer } from "./render/renderer";
import { GameAudio } from "./audio/audio";
import { haptics } from "./audio/haptics";
import { autopilot, newAutopilotState, type AutopilotState } from "./game/autopilot";
import { makeGrainTile } from "./render/texture";
import { COURSE_LENGTH, OPENING_LENGTH, VIEW_WIDTH, World } from "./game/world";
import {
  EDITIONS,
  UPGRADES,
  LEVELS,
  affordableUpgrade,
  WORLDS,
  contractById,
  dailyCode,
  earnedSeals,
  settleDailyStreak,
  streakAtRisk,
  streakReward,
  levelsInWorld,
  worldById,
  worldComplete,
  describeObjective,
  levelPassed,
  objectiveProgress,
  editionById,
  levelOf,
  loadSave,
  modifiersFor,
  nextGoal,
  saveSave,
  scrapFromScore,
  settleContracts,
  type ScrapCredit,
  upgradeCost,
  type SaveData,
} from "./game/progression";
import { applyEdition } from "./render/palette";
import { STORAGE_KEYS, storage } from "./game/storage";
import { Analytics, DebugSink } from "./analytics/analytics";
import { BeaconSink, FirebaseSink, installId } from "./analytics/sinks";
import { ANALYTICS_ENDPOINT, SHARE_BASE_URL, USE_FIREBASE } from "./analytics/config";
import { AdsService } from "./ads/ads";
import { PRIVACY_POLICY_URL, REWARD } from "./ads/config";
import type { Mechanic } from "./mechanics/types";
import { PolarityMechanic } from "./mechanics/polarity";

const RUNS_KEY = "mm_runs_v1";
const MUTE_KEY = "mm_muted_v1";
const APP_VERSION = "1.0.0";

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
    const raw = storage.getItem(RUNS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RunRecord[]) : [];
  } catch {
    return [];
  }
}

function saveRuns(runs: RunRecord[]): void {
  try {
    storage.setItem(RUNS_KEY, JSON.stringify(runs.slice(-200)));
  } catch {
    // Private browsing or a full quota. Losing the log is not worth breaking the game over.
  }
}

type State = "menu" | "playing" | "results" | "shop" | "revive" | "levels" | "paused" | "settings";

class Game {
  private renderer: Renderer;
  private input = new Input();
  private audio = new GameAudio();
  private analytics = new Analytics();
  private ads = new AdsService(this.analytics);
  /** One rewarded continue per run, and one bonus per result. */
  private revivedThisRun = false;
  /** True when the run on the results sheet ended by choice, not by destruction. */
  private quitRun = false;
  /** Score of the run whose results are on screen, for the bonus and the share text. */
  private lastRunScore = 0;
  /** Whether the run on the results sheet was endless, for the rewarded bonus maths. */
  private lastRunEndless = false;
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
  /** Where Back should go from the workshop, so the results sheet is not lost on a price check. */
  private shopReturn: "menu" | "results" = "menu";
  /** True when the current run is on today's shared course. */
  private isDaily = false;
  /** Index into LEVELS when playing the campaign, or -1 for a free run. */
  private levelIndex = -1;
  /** True when the current run has no finish line. */
  private isEndless = false;
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
  private soundEl = el<HTMLButtonElement>("btn-sound");
  private shopEl = el("shop");
  private reviveEl = el("revive");
  private levelsEl = el("levels");
  private pausedEl = el("paused");
  private settingsEl = el("settings");
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

    // Browsers will not start audio without a gesture, so every entry point unlocks it.
    canvas.addEventListener("pointerdown", () => this.audio.unlock(), { passive: true });
    this.applyMute(storage.getItem(MUTE_KEY) === "1");
    const toggleSound = () => {
      this.audio.unlock();
      this.applyMute(!this.audio.muted);
    };
    this.soundEl.addEventListener("click", toggleSound);

    el("btn-retry").addEventListener("click", () => this.startRun());
    el("btn-menu").addEventListener("click", () => {
      // Leaving the results sheet drops any level or daily context, so the next free run is
      // genuinely free rather than silently still being scored against level 7.
      this.levelIndex = -1;
      this.isDaily = false;
      this.isEndless = false;
      this.showMenu();
    });
    el("btn-daily").addEventListener("click", () => {
      this.seedCode = dailyCode();
        this.isDaily = true;
      this.levelIndex = -1;
      this.isEndless = false;
      this.startRun();
    });
    el("btn-pause").addEventListener("click", () => this.pause("button"));
    el("btn-resume").addEventListener("click", () => this.resume());
    el("btn-restart").addEventListener("click", () => {
      this.pausedEl.classList.add("hidden");
      this.startRun();
    });
    el("btn-quit").addEventListener("click", () => {
      this.pausedEl.classList.add("hidden");
      this.analytics.track("run_quit", {
        progressPct: Math.round(this.world.progress * 100),
        score: this.world.score,
      });
      // Banked rather than binned: the player earned what is on the counter, and taking it
      // away for quitting is the kind of thing that makes people quit for good.
      this.quitRun = true;
      this.endRun();
    });

    el("btn-settings").addEventListener("click", () => this.showSettings());
    el("btn-settings-close").addEventListener("click", () => this.showMenu());
    el("btn-reset").addEventListener("click", () =>
      el("reset-confirm").classList.remove("hidden"),
    );
    el("btn-reset-no").addEventListener("click", () =>
      el("reset-confirm").classList.add("hidden"),
    );
    el("btn-reset-yes").addEventListener("click", () => this.resetProgress());

    // A phone that rings, a notification, a swipe to another app: none of those should cost
    // the player a run. Pausing on hide is the single most valuable pause trigger there is.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === "playing") this.pause("background");
    });

    el("btn-levels").addEventListener("click", () => this.showLevels());
    el("btn-levels-close").addEventListener("click", () => this.showMenu());
    el("btn-shop").addEventListener("click", () => this.showShop());
    // Opening the workshop from the results sheet has to be able to go back to it: the sheet
    // still holds Share and the rewarded bonus, and a player who only wanted to check a price
    // was losing both without ever choosing to.
    el("btn-shop-2").addEventListener("click", () => this.showShop("results"));
    el("btn-shop-close").addEventListener("click", () => {
      if (this.shopReturn === "results") this.showResults();
      else this.showMenu();
    });
    el("tab-upgrades").addEventListener("click", () => this.setShopTab("upgrades"));
    el("tab-editions").addEventListener("click", () => this.setShopTab("editions"));
    el("btn-free").addEventListener("click", () => {
      this.seedCode = randomCode(new Rng(Date.now() >>> 0));
      this.isDaily = false;
      this.levelIndex = -1;
      this.isEndless = true;
      this.startRun();
    });

    // The course code is a power feature — it exists so a shared run can be replayed exactly.
    // On the main menu it read as a required field, so it now stays folded away until asked for.
    el("btn-code-toggle").addEventListener("click", () => {
      const row = el("code-row");
      const opening = row.classList.contains("hidden");
      row.classList.toggle("hidden", !opening);
      el("code-help").classList.toggle("hidden", !opening);
      if (opening) this.seedInput.focus();
    });
    el("btn-code-go").addEventListener("click", () => {
      const v = this.seedInput.value.trim().toUpperCase();
      if (v.length === 0) return;
      this.seedCode = v;
      this.isDaily = false;
      this.levelIndex = -1;
      this.isEndless = false;
      this.startRun();
    });

    // Paper grain is a static overlay, so the browser's compositor can blend it once rather
    // than the canvas re-filling a full-screen multiply pattern sixty times a second.
    el("grain").style.backgroundImage = `url(${makeGrainTile().toDataURL()})`;

    el("btn-revive").addEventListener("click", () => void this.watchToRevive());
    el("btn-give-up").addEventListener("click", () => this.endRun());
    el("btn-double").addEventListener("click", () => void this.watchToDouble());
    el("btn-share").addEventListener("click", () => void this.shareRun());
    el("btn-privacy").addEventListener("click", () => void this.ads.showPrivacyOptions());
    el("btn-policy").addEventListener("click", () => {
      if (PRIVACY_POLICY_URL) window.open(PRIVACY_POLICY_URL, "_blank", "noopener");
    });

    if (!PRIVACY_POLICY_URL) {
      console.warn(
        "No PRIVACY_POLICY_URL set in src/ads/config.ts. Apple, Google Play and AdMob all " +
          "require a reachable privacy policy for an ad-supported app; submission will be rejected.",
      );
    }

    this.analytics.addSink(new DebugSink());

    // An anonymous, device-generated id, so events from one install can be joined into a
    // session and a retention curve. It identifies nothing about the person and dies with the
    // app.
    const id = installId(
      (k) => storage.getItem(k),
      (k, v) => storage.setItem(k, v),
    );
    if (ANALYTICS_ENDPOINT) this.analytics.addSink(new BeaconSink(ANALYTICS_ENDPOINT, id));
    if (USE_FIREBASE) {
      const fb = new FirebaseSink();
      void fb.init().then((ok) => {
        if (ok) this.analytics.addSink(fb);
      });
    }

    this.analytics.start();
    // Consent, tracking permission and SDK start-up all happen in here, in that order.
    void this.ads.init();

    window.addEventListener("resize", this.onResize);
    this.onResize();

    const shared = new URLSearchParams(location.search).get("course");
    if (this.demo) {
      document.body.classList.add("demo");
      this.startRun();
    } else if (shared && shared.trim().length > 0) {
      // Someone followed a challenge link. Straight into their course — asking them to press
      // another button first is the surest way to lose them on the doorstep.
      this.seedCode = shared.trim().toUpperCase();
      this.analytics.track("challenge_opened", { seed: this.seedCode });
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
    // Somebody who silenced the game almost certainly wants it silent in the hand too —
    // muting is usually about not being noticed, and a buzzing phone gives that away.
    haptics.setEnabled(!muted);
    this.soundEl.textContent = muted ? "Sound off" : "Sound on";
    this.soundEl.classList.toggle("off", muted);
    try {
      storage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch {
      // Nothing to recover from; the toggle still works for this session.
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

  private startRun(): void {
    const lvl = this.levelIndex >= 0 ? LEVELS[this.levelIndex] : undefined;
    const wd = lvl ? worldById(lvl.world) : undefined;
    this.world = new World(
      seedFromCode(this.seedCode),
      {
        ...this.active.worldOptions,
        endless: this.isEndless,
        // Free Run only. A level, a daily or a shared course has to generate identically for
        // everyone who plays it, so their opening never depends on the player's save.
        shortOpening: this.isEndless && this.knowsTheRule(),
        // A world is the same generator run differently, so its character travels with the run.
        ...(wd
          ? {
              speedScale: wd.speedScale,
              spacingScale: wd.spacingScale,
              hazardBias: wd.hazardBias,
              midPresses: wd.midPresses,
              colourGates: wd.colourGates ?? true,
            }
          : {}),
      },
      modifiersFor(this.save),
    );
    this.buildIntegrity();
    this.world.setViewHeight(this.renderer.viewHeightWorld);
    this.active.reset();
    this.input.reset();
    this.state = "playing";

    this.revivedThisRun = false;
    this.quitRun = false;
    this.autopilotState = newAutopilotState();
    this.analytics.noteRunStarted();
    const startingLevel = this.levelIndex >= 0 ? LEVELS[this.levelIndex] : undefined;
    if (startingLevel) {
      const key = String(startingLevel.n);
      const attempt = (this.save.levelAttempts[key] ?? 0) + 1;
      this.save.levelAttempts[key] = attempt;
      saveSave(this.save);
      // Attempts per level is the clearest wall-detector there is: the level where the number
      // climbs is the level people give up on.
      this.analytics.track("level_attempt", { level: startingLevel.n, attempt });
    }

    this.analytics.track("run_start", {
      mechanic: this.active.id,
      seed: this.seedCode,
      daily: this.isDaily,
      level: startingLevel ? startingLevel.n : 0,
      lifetimeRuns: this.save.runs,
    });

    this.audio.unlock();
    this.audio.setIntensity(0);
    this.audio.startMusic();
    this.world.events = {
      onCollect: (comboIndex) => this.audio.collect(comboIndex),
      onAbsorb: () => {
        this.audio.absorb();
        haptics.absorb();
      },
      onHit: (kind) => {
        this.audio.hit();
        if (kind === "press") haptics.pressCrash();
        else haptics.hit();
      },
      onFlip: (toRed) => {
        this.audio.flip(toRed);
        haptics.flip();
      },
      onRecord: () => {
        this.audio.record();
        haptics.record();
      },
    };

    // Only Free Run has a record to break, and only once there is one. The line is drawn
    // across the track and celebrated on the way through.
    this.world.recordLine = this.isEndless ? Math.floor(this.save.endlessBest) : 0;

    this.menuEl.classList.add("hidden");
    this.resultsEl.classList.add("hidden");
    this.hud.classList.remove("hidden");
  }

  /**
   * Whether this player has demonstrably learned the colour rule.
   *
   * The scripted lesson is eight seconds at the head of every run, and this genre's whole
   * loop is measured in seconds — on run fifteen a quarter of the run is a classroom the
   * player graduated from days ago. The same threshold the menu already uses to decide the
   * campaign is worth offering, on the same reasoning.
   */
  private knowsTheRule(): boolean {
    return this.save.runs >= 3 || this.save.levelsDone > 0;
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
    // An endless run has no course to be a percentage of, so the offer talks in distance.
    const depth = this.isEndless
      ? `You are ${Math.floor(this.world.player.y).toLocaleString()} m in`
      : `You are ${Math.round(this.world.progress * 100)}% through`;
    el("revive-note").textContent = `${depth}. Watch a short ad to carry on with the ${this.world.chain.length} pieces you are holding.`;
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
    const bonus =
      scrapFromScore(this.lastRunScore, this.lastRunEndless) * (REWARD.doubleScrapMultiplier - 1);
    this.save.scrap += bonus;
    saveSave(this.save);
    this.analytics.track("currency_earned", { amount: bonus, source: "rewarded_double" });
    // The stats table already shows a total; it has to move when the bonus lands, or the
    // sheet is stale in exactly the way that caused the confusion in the first place. Looked
    // up by id: on bounded runs the bank is not the last row, and updating "whatever is
    // last" was overwriting "Course reached" with the bank balance.
    const bankCell = document.getElementById("result-bank");
    if (bankCell) bankCell.textContent = this.save.scrap.toLocaleString();
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
    // A link beats a code every time: the recipient taps once and is in the same course,
    // instead of being asked to open the game and type eight characters correctly.
    const link = SHARE_BASE_URL
      ? `${SHARE_BASE_URL.replace(/\/$/, "")}/?course=${encodeURIComponent(this.seedCode)}`
      : "";
    const text = link
      ? `I hauled ${this.lastRunScore.toLocaleString()} out of Magnet Metro. Same course, your turn: ${link}`
      : `I hauled ${this.lastRunScore.toLocaleString()} out of Magnet Metro on course ${this.seedCode}. Open the game, Settings, "Play a friend's course", and paste ${this.seedCode}.`;
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

  private pause(reason: string): void {
    if (this.state !== "playing" || this.demo) return;
    this.state = "paused";
    this.audio.stopMusic();
    el("paused-score").textContent = this.world.score.toLocaleString();
    el("paused-note").textContent = `${Math.round(this.world.progress * 100)}% through · ${this.world.chain.length} pieces held`;
    this.hud.classList.add("hidden");
    this.pausedEl.classList.remove("hidden");
    this.analytics.track("run_paused", { reason });
  }

  private resume(): void {
    if (this.state !== "paused") return;
    this.state = "playing";
    this.pausedEl.classList.add("hidden");
    this.hud.classList.remove("hidden");
    this.input.reset();
    this.audio.startMusic();
  }

  private showSettings(): void {
    this.state = "settings";
    this.menuEl.classList.add("hidden");
    this.settingsEl.classList.remove("hidden");
    el("reset-confirm").classList.add("hidden");
    el("code-row").classList.add("hidden");
    el("code-help").classList.add("hidden");
    el("btn-privacy").classList.toggle("hidden", !this.ads.canShowPrivacyOptions);
    el("btn-policy").classList.toggle("hidden", PRIVACY_POLICY_URL.length === 0);
    el("version").textContent = `v${APP_VERSION}`;
  }

  private resetProgress(): void {
    this.analytics.track("progress_reset", { levelsDone: this.save.levelsDone });
    for (const key of STORAGE_KEYS) storage.setItem(key, "");
    this.save = loadSave();
    this.runs = [];
    saveSave(this.save);
    applyEdition(editionById(this.save.edition));
    this.renderer.resize();
    this.showMenu();
  }

  private showLevels(): void {
    this.state = "levels";
    this.menuEl.classList.add("hidden");
    this.resultsEl.classList.add("hidden");
    this.hud.classList.add("hidden");
    this.levelsEl.classList.remove("hidden");

    const list = el("level-list");
    list.innerHTML = "";

    for (const wd of WORLDS) {
      const levels = levelsInWorld(wd.id);
      const first = levels[0];
      if (!first) continue;
      // A world opens once its first level is reachable, so the list always shows what is next
      // without dumping twenty-four rows on someone who has cleared three.
      const unlocked = this.save.levelsDone >= first.n - 1;
      const done = worldComplete(this.save, wd.id);
      const cleared = levels.filter((l) => this.save.levelsDone >= l.n).length;

      const head = document.createElement("div");
      head.className = done ? "world-head done" : "world-head";
      head.innerHTML =
        `<div class="world-name">${wd.name}</div>` +
        `<div class="world-blurb">${unlocked ? wd.blurb : "Locked"}</div>` +
        `<div class="world-count">${cleared}/${levels.length}${done ? ` · ${wd.seal} earned` : ""}</div>`;
      list.appendChild(head);

      if (!unlocked) continue;

      for (const lv of levels) {
        const i = LEVELS.indexOf(lv);
        const levelDone = i < this.save.levelsDone;
        // Strictly sequential: exactly one level is ever the next thing to do.
        const locked = i > this.save.levelsDone;

        const btn = document.createElement("button");
        btn.className = levelDone ? "level done" : "level";
        btn.disabled = locked;
        const prize = lv.unlockEdition
          ? `+${lv.reward.toLocaleString()} · ${lv.unlockEdition} edition`
          : `+${lv.reward.toLocaleString()} scrap`;
        btn.innerHTML =
          `<span class="level-n">${lv.n}</span>` +
          `<span class="level-body"><span class="level-goal">${describeObjective(lv)}</span>` +
          `<div class="level-prize">${levelDone ? "COMPLETE" : locked ? "LOCKED" : prize}</div></span>`;
        btn.addEventListener("click", () => {
          this.levelIndex = i;
          this.isDaily = false;
          this.isEndless = false;
          this.seedCode = lv.seed;
          this.levelsEl.classList.add("hidden");
          this.startRun();
        });
        list.appendChild(btn);
      }
    }
  }

  private showMenu(): void {
    this.state = "menu";
    this.levelsEl.classList.add("hidden");
    this.settingsEl.classList.add("hidden");
    this.pausedEl.classList.add("hidden");
    this.buildContracts();
    el("bank-value").textContent = this.save.scrap.toLocaleString();

    const total = LEVELS.length;
    el("free-note").textContent =
      this.save.endlessBest > 0
        ? `Furthest: ${Math.floor(this.save.endlessBest).toLocaleString()} m`
        : "No finish line. Beat your own distance.";

    // The campaign is deliberately the quiet button until someone has played a few free runs.
    // A first-timer offered a numbered objective has to understand the rule before they have
    // seen it work; the same offer after three runs reads as "there is more here".
    const next = LEVELS[this.save.levelsDone];
    const warmedUp = this.save.runs >= 3 || this.save.levelsDone > 0;
    el("btn-levels").classList.toggle("nudge", warmedUp);
    el("levels-note").textContent = !next
      ? `All ${total} cleared · every seal earned`
      : warmedUp
        ? `Want it harder? Level ${next.n} of ${total}`
        : `${total} courses, four worlds`;

    const today = dailyCode();
    const done = this.save.dailyDate === today;
    const streak = this.save.dailyStreak;
    const atRisk = streakAtRisk(this.save, today);
    // The streak is the reason to come back, so it is what the button says — and when it is
    // one day from lapsing, saying so is the entire point of having one.
    el("daily-note").textContent = done
      ? streak > 1
        ? `Day ${streak} · best today ${this.save.dailyBest.toLocaleString()}`
        : `Your best today: ${this.save.dailyBest.toLocaleString()}`
      : atRisk
        ? `Day ${streak} streak — play today to keep it`
        : streak > 1
          ? `Longest streak: ${this.save.dailyStreakBest} days`
          : "Same course for everyone, once a day";
    el("btn-daily").classList.toggle("nudge", atRisk);

    this.shopEl.classList.add("hidden");
    this.hud.classList.add("hidden");
    this.resultsEl.classList.add("hidden");
    this.menuEl.classList.remove("hidden");
  }

  private endRun(): void {
    this.state = "results";
    const w = this.world;
    this.lastRunScore = w.score;
    this.lastRunEndless = this.isEndless;
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
    // Everything that pays out this run, collected in one place. A play test reported the
    // bank jumping by thousands after a results sheet that said +250: the run's own haul was
    // the only credit ever shown, while contracts and level bonuses paid silently.
    const credits: ScrapCredit[] = [];
    const banked = scrapFromScore(record.score, this.isEndless);
    this.save.scrap += banked;
    this.save.lifetimeScrap += banked;
    credits.push({ label: this.isEndless ? "Distance haul" : "Run haul", amount: banked });
    this.save.runs += 1;

    // The record the run was played against, before this run moves it. A record only means
    // something measured against a past, so the first run ever is a distance, not a "record".
    const prevEndlessBest = this.save.endlessBest;
    if (this.isEndless) {
      const reached = Math.floor(w.player.y);
      if (reached > this.save.endlessBest) {
        this.save.endlessBest = reached;
        this.save.endlessBestScore = record.score;
      }
    }

    const today = dailyCode();
    let streak = 0;
    let streakBroken = false;
    if (this.isDaily) {
      if (this.save.dailyDate !== today) {
        this.save.dailyDate = today;
        this.save.dailyBest = 0;
      }
      this.save.dailyBest = Math.max(this.save.dailyBest, record.score);

      // Once per calendar day, whatever the score. Turning up is the whole ask.
      const settled = settleDailyStreak(this.save, today);
      streak = settled.streak;
      streakBroken = settled.broken;
      if (settled.advanced) {
        const bonus = streakReward(settled.streak);
        this.save.scrap += bonus;
        credits.push({ label: `Day ${settled.streak} streak`, amount: bonus });
        this.analytics.track("currency_earned", { amount: bonus, source: "daily_streak" });
        this.analytics.track("daily_streak", {
          streak: settled.streak,
          broken: settled.broken,
          best: this.save.dailyStreakBest,
        });
      }
    }

    // Campaign outcome, settled before the results sheet is written so the copy can lead with
    // it. A level is the clearest goal the player has; it should be the headline, not a note.
    const level = this.levelIndex >= 0 ? LEVELS[this.levelIndex] : undefined;
    let levelCleared = false;
    let sealEarned = "";
    if (level) {
      const passed = levelPassed(level, {
        score: record.score,
        banked,
        won: record.won,
        absorbed: w.stats.absorbed,
        pressEaten: w.stats.pressEaten,
        collected: record.collected,
        maxCombo: record.maxCombo,
        actions: record.actions,
        hits: record.hits,
      });
      // Only the frontier level advances progress; replaying an earlier one pays nothing, so
      // the easiest level cannot be farmed for scrap.
      if (passed && this.levelIndex === this.save.levelsDone) {
        levelCleared = true;
        this.save.levelsDone += 1;
        this.save.scrap += level.reward;
        credits.push({ label: `Level ${level.n} cleared`, amount: level.reward });
        if (worldComplete(this.save, level.world)) {
          sealEarned = worldById(level.world).seal;
        }
        if (level.unlockEdition && !this.save.ownedEditions.includes(level.unlockEdition)) {
          this.save.ownedEditions.push(level.unlockEdition);
        }
        this.analytics.track("currency_earned", { amount: level.reward, source: `level_${level.n}` });
      }
      this.analytics.track("run_end", { level: level.n, passed });
    }

    const contractCredits = settleContracts(this.save, {
      score: record.score,
      banked,
      won: record.won,
      absorbed: w.stats.absorbed,
      pressEaten: w.stats.pressEaten,
      collected: record.collected,
      maxCombo: record.maxCombo,
      actions: record.actions,
      hits: record.hits,
    });
    credits.push(...contractCredits);
    const completed = contractCredits.map((c) => `${c.label} — +${c.amount.toLocaleString()}`);
    saveSave(this.save);

    const prior = this.runs.filter((r) => r !== record);
    const priorBest = prior.length ? Math.max(...prior.map((r) => r.score)) : 0;

    const endlessDistance = Math.floor(w.player.y);
    const endlessRecord = this.isEndless && prevEndlessBest > 0 && endlessDistance > prevEndlessBest;
    const endlessFirst = this.isEndless && prevEndlessBest === 0;
    el("result-title").textContent = level
      ? levelCleared
        ? `Level ${level.n} complete`
        : `Level ${level.n} — ${describeObjective(level).toLowerCase()}`
      : this.isEndless
        ? endlessRecord
          ? `New record — ${endlessDistance.toLocaleString()} m`
          : `${endlessDistance.toLocaleString()} m`
        : record.won
          ? this.isDaily
            ? "Today's run — cleared"
            : "Course cleared"
          : this.quitRun
            ? "Banked early"
            : "Drone destroyed";
    el("result-score").textContent = String(record.score);
    el("result-best").textContent =
      record.score > priorBest && prior.length > 0
        ? "New personal best"
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
      ...(this.isEndless
        ? ([["Distance", `${endlessDistance.toLocaleString()} m`],
            ["Furthest ever", `${Math.floor(this.save.endlessBest).toLocaleString()} m`]] as [string, string][])
        : []),
      ["Mines swallowed", String(w.stats.absorbed)],
      ...(this.isDaily && streak > 0
        ? ([["Daily streak", `${streak} day${streak === 1 ? "" : "s"}`]] as [string, string][])
        : []),
      ...credits.map((c) => [c.label, `+${c.amount.toLocaleString()}`] as [string, string]),
      ["Total in the bank", this.save.scrap.toLocaleString()],
      ...(this.isEndless
        ? []
        : ([["Course reached", `${Math.round((Math.min(this.world.player.y, COURSE_LENGTH) / COURSE_LENGTH) * 100)}%`]] as [string, string][])),
    ];
    el("result-stats").innerHTML = rows
      .map(([k, v]) =>
        k === "Total in the bank"
          ? `<tr><td>${k}</td><td id="result-bank">${v}</td></tr>`
          : `<tr><td>${k}</td><td>${v}</td></tr>`,
      )
      .join("");

    // The concrete next thing, named, with the gap. "Come back tomorrow" is not a reason to
    // return; "1,400 more and the coil gets wider" is.
    const goal = nextGoal(this.save);
    // A streak is the strongest reason this game has to be opened tomorrow, so on the sheet
    // that just extended one it outranks everything except finishing a world.
    const streakLine =
      streak > 0
        ? streakBroken && streak === 1
          ? "<b>Streak restarted — day 1.</b> Come back tomorrow to make it two."
          : streak === 1
            ? "<b>Day 1.</b> Play tomorrow's course to start a streak."
            : `<b>${streak} days in a row.</b> Miss tomorrow and it goes back to one.`
        : "";

    // Something affordable in the workshop right now is news, and it is the whole reason the
    // opening price was cut — a sheet that only ever says "16 m short of your record" never
    // tells the player the meta exists, and the first purchase is where it hooks. It appends
    // rather than replaces: the record chase is still the reason to press Run Again.
    const buyable = affordableUpgrade(this.save);
    const affordable =
      buyable && !(goal && goal.kind === "upgrade" && goal.remaining === 0)
        ? `<br><span class="goal-second">${buyable.label} is affordable — spend it in the workshop.</span>`
        : "";

    el("result-goal").innerHTML = sealEarned
      ? `<b>${worldById(level!.world).name} complete.</b> ${sealEarned} earned — it cannot be bought.`
      : streakLine
      ? streakLine + affordable
      : this.isEndless
      ? (endlessFirst
          ? `<b>${endlessDistance.toLocaleString()} m banked.</b> That is now the record to beat.`
          : endlessRecord
            ? "<b>Furthest you have ever been.</b> It only gets faster from here."
            : `<b>${(this.save.endlessBest - endlessDistance).toLocaleString()} m short</b> of your record.`) +
        affordable
      : levelCleared
      ? `<b>+${level!.reward.toLocaleString()} scrap.</b>${level!.unlockEdition ? ` The ${level!.unlockEdition} edition is yours — equip it in the workshop.` : " Next level unlocked."}`
      : level
        ? `<b>Not this time.</b> ${describeObjective(level)}. Run it again.`
        : completed.length
      ? `<b>Contract complete.</b><br>${completed.join("<br>")}`
      : goal
      ? goal.kind === "level"
        ? `<b>Next up: ${goal.label}.</b>${affordable}`
        : goal.kind === "contract"
          ? `<b>Nearly there:</b> ${goal.label}.${affordable}`
          : goal.remaining === 0
            ? `<b>${goal.label} is affordable now.</b> Spend it in the workshop.`
            : `<b>${goal.remaining.toLocaleString()} more scrap</b> unlocks ${goal.label}.${affordable}`
      : "<b>Everything is bought.</b> Nothing left but a better score.";

    el("compare").innerHTML = this.personalSummary();

    const doubleBtn = el<HTMLButtonElement>("btn-double");
    doubleBtn.disabled = !this.ads.rewardedReady || record.score <= 0;
    if (!doubleBtn.disabled) {
      this.analytics.track("rewarded_offered", { placement: "double_scrap" });
    }
    el<HTMLButtonElement>("btn-share").textContent = "Share run";

    const progressPct = Math.round((Math.min(w.player.y, COURSE_LENGTH) / COURSE_LENGTH) * 100);
    this.analytics.track("run_end", {
      mechanic: this.active.id,
      won: record.won,
      score: record.score,
      absorbed: w.stats.absorbed,
      hits: record.hits,
      duration: Math.round(record.duration),
      daily: this.isDaily,
      level: level ? level.n : 0,
      // Where the run stopped, in ten-percent bands. A histogram of this is the drop-off
      // curve, and it says far more about difficulty than an average score ever will.
      progressPct,
      progressBand: Math.min(9, Math.floor(progressPct / 10)) * 10,
      lifetimeRuns: this.save.runs,
      revived: this.revivedThisRun,
    });

    // The two milestones that decide whether a new player ever comes back at all.
    // Only the full lesson counts: a warm-up nobody was being taught by is not a tutorial
    // completion, and counting it would flatter the one funnel metric that has to stay honest.
    if (!w.options.shortOpening && w.player.y >= OPENING_LENGTH) {
      this.analytics.track("tutorial_completed", {});
    }
    if (record.won && this.save.runs === 1) this.analytics.track("first_run_completed", {});
    if (levelCleared && level) {
      this.analytics.track("level_cleared", {
        level: level.n,
        attempts: this.save.levelAttempts[String(level.n)] ?? 1,
      });
    }
    this.analytics.track("currency_earned", { amount: banked, source: "run" });
    for (const done of completed) this.analytics.track("contract_completed", { detail: done });

    this.hud.classList.add("hidden");
    this.resultsEl.classList.remove("hidden");

    // Only once the results are already on screen, and only if pacing allows. Never between a
    // tap and the thing the tap was for.
    //
    // And never on a sheet that is offering the rewarded bonus. A player reaching for "Double
    // it" would otherwise be served an interstitial first and watch two ads back to back —
    // the cheaper one teaching them to resent the sheet that the better one lives on. The
    // rewarded placement pays more and buys goodwill instead of spending it, so it wins.
    if (doubleBtn.disabled) void this.ads.maybeShowInterstitial(this.save.runs);
    else this.analytics.track("interstitial_eligible", { shown: false, reason: "rewarded_offered" });
  }

  // -------------------------------------------------------------------------
  // Workshop
  // -------------------------------------------------------------------------

  /** Put the results sheet back exactly as it was, bonus and share state included. */
  private showResults(): void {
    this.state = "results";
    this.shopEl.classList.add("hidden");
    this.menuEl.classList.add("hidden");
    this.hud.classList.add("hidden");
    this.resultsEl.classList.remove("hidden");
  }

  private showShop(from: "menu" | "results" = "menu"): void {
    this.state = "shop";
    this.shopReturn = from;
    this.menuEl.classList.add("hidden");
    this.resultsEl.classList.add("hidden");
    this.hud.classList.add("hidden");
    this.shopEl.classList.remove("hidden");
    el("btn-privacy").classList.toggle("hidden", !this.ads.canShowPrivacyOptions);
    el("btn-policy").classList.toggle("hidden", PRIVACY_POLICY_URL.length === 0);
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

  /**
   * A short personal record, plus any seals earned. Seals exist only for clearing a whole
   * world, so they are the one thing on the sheet that scrap can never produce.
   */
  private personalSummary(): string {
    const rs = this.runs;
    const seals = earnedSeals(this.save);
    const lines: string[] = [];
    if (rs.length > 0) {
      const best = Math.max(...rs.map((r) => r.score));
      lines.push(
        `<b>${rs.length}</b> run${rs.length === 1 ? "" : "s"} · best <b>${best.toLocaleString()}</b>`,
      );
    }
    lines.push(
      `Levels <b>${this.save.levelsDone}/${LEVELS.length}</b> · lifetime scrap <b>${this.save.lifetimeScrap.toLocaleString()}</b>`,
    );
    if (this.save.endlessBest > 0) {
      lines.push(`Furthest <b>${Math.floor(this.save.endlessBest).toLocaleString()} m</b>`);
    }
    if (seals.length > 0) lines.push(`Seals: <b>${seals.join(" · ")}</b>`);
    return lines.join("<br>");
  }

  /**
   * Editions are earned in the campaign, never bought, so this tab is a display case rather
   * than a shop: owned ones can be equipped, locked ones name the level that awards them.
   */
  private renderEditions(list: HTMLElement): void {
    for (const ed of EDITIONS) {
      const owned = this.save.ownedEditions.includes(ed.id);
      const equipped = this.save.edition === ed.id;

      const row = document.createElement("div");
      row.className = owned ? "item owned" : "item";

      const swatch = document.createElement("div");
      swatch.className = "swatch";
      swatch.style.background = ed.paper;
      swatch.innerHTML =
        `<i style="background:${ed.blue}"></i><i style="background:${ed.red}"></i>`;
      if (!owned) swatch.style.filter = "grayscale(1)";

      const body = document.createElement("div");
      body.className = "item-body";
      body.innerHTML =
        `<div class="item-name">${ed.name}</div>` +
        `<div class="item-blurb">${owned ? ed.blurb : `Awarded for clearing level ${ed.fromLevel}.`}</div>`;

      const buy = document.createElement("button");
      buy.className = equipped ? "buy equipped" : "buy";
      buy.textContent = equipped ? "ON" : owned ? "USE" : "LOCKED";
      buy.disabled = !owned;
      buy.addEventListener("click", () => {
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
    if (this.isEndless) {
      // The bar measures the run against the player's own record rather than a finish line.
      const best = Math.max(this.save.endlessBest, 400);
      const frac = Math.min(1, w.player.y / best);
      this.progressEl.style.width = `${frac * 100}%`;
      this.progressEl.classList.toggle(
        "record",
        this.save.endlessBest > 0 && w.player.y > this.save.endlessBest,
      );
    } else {
      this.progressEl.style.width = `${w.progress * 100}%`;
      this.progressEl.classList.remove("record");
    }

    // The prompt is authored by the mechanic against course position, so it always describes
    // whatever is on screen right now rather than running off a fixed timer.
    this.hintEl.textContent = w.prompt;
    this.hintEl.classList.toggle("on", w.prompt.length > 0);
    this.hintEl.classList.toggle("urgent", w.promptUrgent);

    // The soundtrack is driven by how the run is going, not by a clock.
    this.audio.setIntensity(0.35 * w.progress + 0.65 * Math.min(1, w.combo / 40));

    const level = this.levelIndex >= 0 ? LEVELS[this.levelIndex] : undefined;
    this.objectiveEl.classList.toggle("hidden", !level && !this.isEndless);
    if (this.isEndless) {
      const m = Math.floor(w.player.y);
      // A record needs a past. On the very first run there is nothing to beat yet, so the
      // readout is plain distance — NEW RECORD from metre one would make the words worthless.
      const hasBest = this.save.endlessBest > 0;
      const beat = hasBest && w.player.y > this.save.endlessBest;
      el("objective-text").textContent = beat ? "NEW RECORD" : hasBest ? "BEST" : "DISTANCE";
      el("objective-progress").textContent =
        beat || !hasBest
          ? `${m.toLocaleString()} m`
          : `${m.toLocaleString()} / ${Math.floor(this.save.endlessBest).toLocaleString()} m`;
      this.objectiveEl.classList.toggle("done", beat);
    } else if (level) {
      const prog = objectiveProgress(level, {
        score: w.score,
        absorbed: w.stats.absorbed,
        pressEaten: w.stats.pressEaten,
        collected: w.stats.collected,
        maxCombo: w.stats.maxCombo,
        actions: w.stats.actions,
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

/**
 * Progress has to be read out of durable storage before anything constructs a save, otherwise
 * a returning player would be handed a blank one and their levels would appear to be gone.
 */
async function boot(): Promise<void> {
  await storage.hydrate([...STORAGE_KEYS]);
  new Game();
}

void boot();
