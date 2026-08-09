import "./style.css";
import { Input, type InputState } from "./core/input";
import { Loop } from "./core/loop";
import { Rng, randomCode, seedFromCode } from "./core/rng";
import { Renderer } from "./render/renderer";
import { GameAudio } from "./audio/audio";
import { haptics } from "./audio/haptics";
import { autopilot, newAutopilotState, type AutopilotState } from "./game/autopilot";
import { makeGrainTile } from "./render/texture";
import { COURSE_LENGTH, OPENING_LENGTH, SCRAP_VALUE, VIEW_WIDTH, World } from "./game/world";
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
  masteryInWorld,
  worldById,
  worldComplete,
  describeObjective,
  MASTERY_TIERS,
  describeMastery,
  levelMastery,
  levelPassed,
  objectiveProgress,
  editionById,
  levelOf,
  loadSave,
  modifiersFor,
  modifiersForRun,
  masteryOf,
  nextMasteryAsk,
  masteryTotal,
  nextGoal,
  saveSave,
  haulFor,
  settleContracts,
  type RunSummary,
  type ScrapCredit,
  upgradeCost,
  type SaveData,
} from "./game/progression";
import { COACH_STEPS, dueCoachStep } from "./game/coach";
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

type State =
  | "menu"
  | "playing"
  | "results"
  | "shop"
  | "revive"
  | "levels"
  | "paused"
  | "settings"
  | "howto"
  /** A tour card is up. The simulation is frozen; the HUD keeps refreshing so it reads true. */
  | "coaching";

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
  /**
   * What the run on the results sheet actually banked. The rewarded bonus doubles *this*, not
   * the raw score: a replayed level banks nothing, and recomputing from the score would have
   * paid a full haul through the ad for a course that is deliberately worthless.
   */
  private lastRunBanked = 0;
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
  /** True while the current run is carrying the guided tour. */
  private coaching = false;
  /** How many tour beats this run has shown. The tour is strictly ordered, so a count is enough. */
  private coachDone = 0;
  /** The beat currently on screen, for the analytics funnel and for re-anchoring on resize. */
  private coachStep = -1;
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
  private howtoEl = el("howto");
  private coachEl = el("coach");
  private coachSpotEl = el("coach-spot");
  private coachCardEl = el("coach-card");

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

    // Clearing a level and then being offered only "Run again" is a dead end: the thing the
    // player wants next is the thing they just unlocked, and sending them back through the
    // menu and the level list to find it is three taps of friction at the exact moment they
    // are most willing to keep going.
    el("btn-next-level").addEventListener("click", () => {
      const next = this.levelIndex + 1;
      const lv = LEVELS[next];
      if (!lv) return;
      this.levelIndex = next;
      this.isDaily = false;
      this.isEndless = false;
      this.seedCode = lv.seed;
      this.startRun();
    });
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

    el("btn-howto").addEventListener("click", () => this.showHowTo());
    el("btn-howto-close").addEventListener("click", () => this.showMenu());

    // Anywhere on the overlay advances, so a thumb that lands beside the button still moves the
    // tour forward. Skip is the one exception and says so.
    this.coachEl.addEventListener("click", () => this.advanceCoach());
    el("btn-coach-skip").addEventListener("click", (e) => {
      e.stopPropagation();
      this.endCoach("skipped");
    });

    // Replaying it has to start a fresh run: the beats are pinned to positions inside the
    // scripted opening, so there is nothing to point at from a menu.
    el("btn-replay-tour").addEventListener("click", () => {
      this.save.coached = false;
      saveSave(this.save);
      this.settingsEl.classList.add("hidden");
      this.seedCode = randomCode(new Rng(Date.now() >>> 0));
      this.isDaily = false;
      this.levelIndex = -1;
      this.isEndless = true;
      this.startRun();
    });
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
    // A rotation or a keyboard appearing moves every anchor. A tour card left pointing at where
    // the score counter used to be is worse than no card at all.
    if (this.state === "coaching") this.placeCoach();
  };

  // -------------------------------------------------------------------------
  // The first-run tour
  // -------------------------------------------------------------------------

  /** Freeze the run and put a beat on screen, anchored to the thing it names. */
  private showCoachStep(index: number): void {
    const step = COACH_STEPS[index];
    if (!step) return;
    this.coachStep = index;
    this.state = "coaching";
    this.audio.stopMusic();

    el("coach-count").textContent = `Step ${index + 1} of ${COACH_STEPS.length}`;
    el("coach-title").textContent = step.title;
    el("coach-body").innerHTML = step.body;
    el("btn-coach-next").textContent =
      index === COACH_STEPS.length - 1 ? "Let me play" : "Got it";
    this.coachEl.classList.remove("hidden");
    // Only measurable once it is laid out, which un-hiding it above has just made true.
    this.placeCoach();

    this.analytics.track("coach_step", { id: step.id, step: index + 1 });
  }

  /** Position the ring and the card against the live geometry of whatever this beat names. */
  private placeCoach(): void {
    const step = COACH_STEPS[this.coachStep];
    if (!step) return;
    const base = this.coachEl.getBoundingClientRect();
    const pad = 6;

    let x: number;
    let y: number;
    let w: number;
    let h: number;
    if (step.anchor === "") {
      // The drone lives on the canvas, not in the document, so its box has to be derived from
      // the world. The magnet's reach is what the first card is about, so that is what is ringed.
      const canvas = this.renderer.canvas.getBoundingClientRect();
      const p = this.renderer.pageRect(
        this.world.player.x,
        this.world.player.y,
        this.world.field.radius,
      );
      const r = Math.max(30, p.r);
      x = canvas.left - base.left + p.x - r;
      y = canvas.top - base.top + p.y - r;
      w = r * 2;
      h = r * 2;
    } else {
      const a = el(step.anchor).getBoundingClientRect();
      x = a.left - base.left - pad;
      y = a.top - base.top - pad;
      w = a.width + pad * 2;
      h = a.height + pad * 2;
    }

    // Kept inside the frame. The magnet is wide enough to run off an edge whenever the drone
    // is near one, and a ring with a missing side stops reading as a ring at all.
    const edge = 3;
    const right = Math.min(x + w, base.width - edge);
    const bottom = Math.min(y + h, base.height - edge);
    x = Math.max(x, edge);
    y = Math.max(y, edge);
    w = Math.max(12, right - x);
    h = Math.max(12, bottom - y);

    const spot = this.coachSpotEl.style;
    spot.left = `${Math.round(x)}px`;
    spot.top = `${Math.round(y)}px`;
    spot.width = `${Math.round(w)}px`;
    spot.height = `${Math.round(h)}px`;

    // Below the anchor when there is room under it, above when there is not — the card must
    // never sit on top of the thing it is pointing at.
    const card = this.coachCardEl.getBoundingClientRect();
    const margin = 14;
    const below = y + h + margin;
    const above = y - card.height - margin;
    const top = below + card.height + margin <= base.height || above < margin ? below : above;
    this.coachCardEl.style.top = `${Math.round(
      Math.min(Math.max(top, margin), Math.max(margin, base.height - card.height - margin)),
    )}px`;
    this.coachCardEl.style.left = `${Math.round(
      Math.min(
        Math.max(x + w / 2 - card.width / 2, margin),
        Math.max(margin, base.width - card.width - margin),
      ),
    )}px`;
  }

  private advanceCoach(): void {
    if (this.state !== "coaching") return;
    this.coachDone += 1;
    if (this.coachDone >= COACH_STEPS.length) {
      this.endCoach("finished");
      return;
    }
    // Beats are due by distance, and several can come due while one card is up only if the
    // player is somehow ahead of them — which cannot happen, since the run is frozen. So the
    // next card is always shown by the update loop, and this just resumes.
    this.resumeFromCoach();
  }

  private endCoach(how: "finished" | "skipped"): void {
    this.coaching = false;
    this.coachStep = -1;
    this.save.coached = true;
    saveSave(this.save);
    this.analytics.track(how === "skipped" ? "coach_skipped" : "coach_finished", {
      step: this.coachDone + 1,
      of: COACH_STEPS.length,
    });
    this.resumeFromCoach();
  }

  private resumeFromCoach(): void {
    this.coachEl.classList.add("hidden");
    if (this.state !== "coaching") return;
    this.state = "playing";
    // The tap that dismissed the card must not also be read as a colour change, and a drag
    // begun on the overlay must not be applied the instant the run resumes.
    this.input.reset();
    this.audio.startMusic();
  }

  private showHowTo(): void {
    this.state = "howto";
    this.menuEl.classList.add("hidden");
    this.settingsEl.classList.add("hidden");
    this.howtoEl.classList.remove("hidden");
    this.howtoEl.scrollTop = 0;
    this.analytics.track("howto_opened", {});
  }

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
    // The tour's beats are pinned to positions inside the full scripted opening, so a run
    // carrying it always gets the full opening — including a replay asked for from Settings by
    // a player the compressed one would otherwise apply to.
    const coachThisRun = !this.save.coached && !this.demo;
    this.world = new World(
      seedFromCode(this.seedCode),
      {
        ...this.active.worldOptions,
        endless: this.isEndless,
        // Free Run only. A level, a daily or a shared course has to generate identically for
        // everyone who plays it, so their opening never depends on the player's save.
        shortOpening: this.isEndless && this.knowsTheRule() && !coachThisRun,
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
      // The campaign is flown on a stock drone whatever the workshop says, so clearing a level
      // means the same thing for every player.
      modifiersForRun(this.save, this.levelIndex >= 0),
    );
    this.buildIntegrity();
    this.world.setViewHeight(this.renderer.viewHeightWorld);
    this.active.reset();
    this.input.reset();
    this.state = "playing";

    this.revivedThisRun = false;
    this.quitRun = false;
    this.coaching = coachThisRun;
    this.coachDone = 0;
    this.coachStep = -1;
    this.coachEl.classList.add("hidden");
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
      // A wall is one event with many beats. The note climbs through the run so nine blocks
      // through a gate is an arpeggio rather than the same thump nine times, and the hand gets
      // a light rate-limited tap rather than the heavy pulse that means damage.
      onAbsorb: (streakIndex) => {
        this.audio.absorb(streakIndex);
        haptics.absorb();
      },
      // And it resolves on one chord when the run ends, so a Press has an ending.
      onAbsorbEnd: (count) => {
        this.audio.absorbFinish(count);
        haptics.absorbFinish(count);
      },
      onHit: (kind) => {
        this.audio.hit();
        if (kind === "cell") {
          haptics.hit();
          // The clearest possible statement that a life just went: the hull readout itself
          // reacts. A full-screen flash is ambiguous — three different outcomes print one —
          // but the pips are the thing that actually changed, so they are what should move.
          this.integrityEl.classList.remove("lost");
          void this.integrityEl.offsetWidth; // restart the animation on consecutive hits
          this.integrityEl.classList.add("lost");
        } else {
          // A wall got wrong. Costs the haul, never a cell, and must not feel like one.
          haptics.pressCrash();
        }
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
    this.howtoEl.classList.add("hidden");
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
    const bonus = this.lastRunBanked * (REWARD.doubleScrapMultiplier - 1);
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
    this.audio.absorb(0);
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

    const total = masteryTotal(this.save);
    el("mastery-total").innerHTML =
      `<b>${total.earned}</b> of ${total.possible} marks · ` +
      `three per level: cleared, clean, and never on the wrong colour at a wall.`;

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
      const wm = masteryInWorld(this.save, wd.id);
      head.innerHTML =
        `<div class="world-name">${wd.name}</div>` +
        `<div class="world-blurb">${unlocked ? wd.blurb : "Locked"}</div>` +
        `<div class="world-count">${cleared}/${levels.length}${done ? ` · ${wd.seal} earned` : ""}` +
        `${unlocked ? ` · marks ${wm.earned}/${wm.possible}` : ""}</div>`;
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
        // A cleared level stops advertising a prize it will never pay again and starts naming
        // the mark still missing — which is the whole reason to open it a second time.
        const tier = masteryOf(this.save, lv.n);
        const marks = locked
          ? ""
          : `<span class="marks">${Array.from(
              { length: MASTERY_TIERS },
              (_, i) => `<span class="mark${i < tier ? " on" : ""}"></span>`,
            ).join("")}</span>`;
        const caption = locked
          ? "LOCKED"
          : !levelDone
            ? prize
            : tier >= MASTERY_TIERS
              ? "Fully mastered"
              : tier === 0
                // Cleared before marks existed. The old save records that it was beaten and
                // nothing about how, so the first mark has to be earned again rather than
                // assumed — and the row has to say so, or it reads as a bug.
                ? "Clear it again to start its marks"
                : nextMasteryAsk(tier);
        btn.innerHTML =
          `<span class="level-n">${lv.n}</span>` +
          `<span class="level-body"><span class="level-goal">${describeObjective(lv)}</span>` +
          `<div class="level-prize">${caption}</div></span>${marks}`;
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
    this.howtoEl.classList.add("hidden");
    this.coachEl.classList.add("hidden");
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
    // A run that ended part-way through the tour takes the rest of it with it. The remaining
    // beats are pinned to positions this run will never reach again, and the flag is left
    // alone so the next run picks the tour up from the top.
    this.coaching = false;
    this.coachEl.classList.add("hidden");
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
    // Everything that pays out this run, collected in one place. A play test reported the
    // bank jumping by thousands after a results sheet that said +250: the run's own haul was
    // the only credit ever shown, while contracts and level bonuses paid silently.
    const credits: ScrapCredit[] = [];
    // Zero when replaying a level that is already cleared; see haulFor.
    const banked = haulFor(this.save, this.levelIndex, record.score, this.isEndless);
    this.lastRunBanked = banked;
    this.save.scrap += banked;
    this.save.lifetimeScrap += banked;
    if (banked > 0) {
      credits.push({ label: this.isEndless ? "Distance haul" : "Run haul", amount: banked });
    }
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
    // One summary, built once. It was assembled separately for the level check and for the
    // contracts, which is how `banked` and `score` came to be passed to different consumers
    // under the same name — the trap the RunSummary doc already warns about.
    const summary: RunSummary = {
      score: record.score,
      banked,
      won: record.won,
      absorbed: w.stats.absorbed,
      pressEaten: w.stats.pressEaten,
      collected: record.collected,
      maxCombo: record.maxCombo,
      actions: record.actions,
      hits: record.hits,
      wallsCrashed: w.stats.wallsCrashed,
    };

    const level = this.levelIndex >= 0 ? LEVELS[this.levelIndex] : undefined;
    let levelCleared = false;
    let sealEarned = "";
    let masteryTier = 0;
    let masteryGained = false;
    if (level) {
      const passed = levelPassed(level, summary);
      /**
       * Mastery is settled on *every* attempt, cleared or not, and on replays too.
       *
       * It is the reason to open a level you have already beaten — the one that survives a
       * replay banking no scrap — so gating it behind the frontier would defeat the point.
       * It only ever goes up.
       */
      masteryTier = levelMastery(level, summary);
      const held = masteryOf(this.save, level.n);
      if (masteryTier > held) {
        this.save.levelMastery[String(level.n)] = masteryTier;
        masteryGained = true;
        this.analytics.track("level_mastered", { level: level.n, tier: masteryTier });
      } else {
        masteryTier = held;
      }
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

    const contractCredits = settleContracts(this.save, summary);
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

    /**
     * Mastery marks, on level runs only. Three filled pips is the goal; the caption names what
     * the next one asks for, so a replay always has a stated reason rather than being a vague
     * invitation to "try harder".
     */
    const masteryEl = el("result-mastery");
    masteryEl.classList.toggle("hidden", !level);
    if (level) {
      const pips = Array.from(
        { length: MASTERY_TIERS },
        (_, i) => `<span class="mark${i < masteryTier ? " on" : ""}"></span>`,
      ).join("");
      const ask = nextMasteryAsk(masteryTier);
      const label = masteryTier > 0 ? describeMastery(masteryTier) : "Not cleared";
      masteryEl.innerHTML =
        `<div class="mastery-row"><span class="marks">${pips}</span>` +
        `<span class="mastery-label">${masteryGained ? `${label} — new` : label}</span></div>` +
        (ask ? `<div class="mastery-next">Next: ${ask}</div>` : "") +
        (masteryTier >= MASTERY_TIERS ? `<div class="mastery-next">Fully mastered.</div>` : "");
      masteryEl.classList.toggle("gained", masteryGained);
    }
    el("result-best").textContent =
      record.score > priorBest && prior.length > 0
        ? "New personal best"
        : priorBest > 0
          ? `Best so far: ${priorBest}`
          : "";

    const total = record.collected + record.missed;
    const pickup = total > 0 ? Math.round((record.collected / total) * 100) : 0;

    // How much of the course went past uncollectable because of the colour the player was.
    // Expressed against everything they actually banked plus everything they could not touch,
    // so it reads as "the share of this run you locked yourself out of".
    const reachableValue = record.score > 0 ? w.stats.collected * SCRAP_VALUE : 0;
    const lockedOut = w.stats.missedWrongColour;
    const missedShare =
      reachableValue + lockedOut > 0
        ? Math.round((lockedOut / (reachableValue + lockedOut)) * 100)
        : 0;
    const gatesMet = w.stats.gatesEaten + w.stats.gatesCrashed;
    const rows: [string, string][] = [
      ["Scrap collected", String(record.collected)],
      ["Pickup rate", `${pickup}%`],
      ["Best combo", String(record.maxCombo)],
      ["Hits taken", String(record.hits)],
      // Named for what it actually is. "Thumb actions" measured colour changes and read as a
      // generic input count, which told the player nothing about the decision it represents.
      ["Colour changes", String(record.actions)],
      ["Time", `${record.duration.toFixed(1)}s`],
      ...(this.isEndless
        ? ([["Distance", `${endlessDistance.toLocaleString()} m`],
            ["Furthest ever", `${Math.floor(this.save.endlessBest).toLocaleString()} m`]] as [string, string][])
        : []),
      ["Mines swallowed", String(w.stats.absorbed)],
      // The cost of the colour you were. Left off the sheet entirely until now, which meant
      // the single biggest argument for using the game's only verb was invisible.
      ...(missedShare > 0
        ? ([["Left behind — wrong colour", `${missedShare}%`]] as [string, string][])
        : []),
      ...(w.stats.gatesCrashed > 0 || w.stats.gatesEaten > 0
        ? ([["Gates matched", `${w.stats.gatesEaten} of ${gatesMet}`]] as [string, string][])
        : []),
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
    const affordableLine =
      buyable && !(goal && goal.kind === "upgrade" && goal.remaining === 0)
        ? `<br><span class="goal-second">${buyable.label} is affordable — spend it in the workshop.</span>`
        : "";

    // Somebody who left a third of the course behind is playing one colour, and the number on
    // its own does not tell them what to do about it. This is the only place the game ever
    // says the quiet part: the other half of the course was always available.
    const colourTime = w.stats.timeBlue + w.stats.timeRed;
    const onOneColour =
      colourTime > 0 ? Math.max(w.stats.timeBlue, w.stats.timeRed) / colourTime : 0;
    const campingLine =
      onOneColour >= 0.85 && missedShare >= 33 && w.player.y > OPENING_LENGTH
        ? `<br><span class="goal-second">You spent ${Math.round(onOneColour * 100)}% of that run on one colour. The other half was there for the taking.</span>`
        : "";

    // At most one nudge. Two red lines under a headline is a lecture, not a prompt.
    const affordable = campingLine || affordableLine;

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
    // Nothing banked, nothing to double. A replayed level is the case that matters: the sheet
    // must not offer an ad in exchange for a share of zero.
    doubleBtn.disabled = !this.ads.rewardedReady || banked <= 0;
    if (!doubleBtn.disabled) {
      this.analytics.track("rewarded_offered", { placement: "double_scrap" });
    }
    el<HTMLButtonElement>("btn-share").textContent = "Share run";

    // Offered only on a level that was actually just cleared, and only when there is one after
    // it. On a failed attempt the next level is not unlocked, and after level 24 there is
    // nothing to go on to — in both cases the button would be a lie.
    const upcoming = levelCleared ? LEVELS[this.levelIndex + 1] : undefined;
    const nextBtn = el<HTMLButtonElement>("btn-next-level");
    nextBtn.classList.toggle("hidden", !upcoming);
    if (upcoming) {
      nextBtn.textContent = `Next: level ${upcoming.n} — ${describeObjective(upcoming).toLowerCase()}`;
      // Demoted to a secondary action, so the eye lands on going forward rather than on
      // repeating something already finished.
      el("btn-retry").classList.remove("primary");
    } else {
      el("btn-retry").classList.add("primary");
    }

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
        this.audio.absorb(0);
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
        this.audio.absorb(0);
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

    // Checked before the end-of-run branch, so a beat that comes due on the same step the run
    // ends is dropped rather than opening a card over the results sheet.
    if (this.coaching && this.world.phase === "running") {
      const next = dueCoachStep(this.coachDone, this.world.player.y);
      if (next >= 0) {
        this.showCoachStep(next);
        return;
      }
    }

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

    // Coaching keeps refreshing the HUD even though the run is frozen. The tour points at
    // these elements, so they have to hold real values before the first card is drawn — on a
    // stale HUD the opening beat would ring an empty box.
    if (this.state !== "playing" && this.state !== "coaching") return;
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
    // Held back while a tour card is up: the course's own prompt and the card are both large
    // uppercase instructions, and two of them at once is noise rather than teaching.
    const showHint = w.prompt.length > 0 && this.state === "playing";
    this.hintEl.textContent = w.prompt;
    this.hintEl.classList.toggle("on", showHint);
    this.hintEl.classList.toggle("urgent", showHint && w.promptUrgent);

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
