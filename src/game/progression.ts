/**
 * Persistent progression: banked scrap, permanent upgrades, and unlockable print editions.
 *
 * The point of this layer is to give a 30-second run consequences that outlive it. A run that
 * only produces a number is finished the moment it ends; a run that moves you measurably
 * closer to a bigger magnet is a reason to start another one.
 *
 * Upgrades are deliberately all *legible in play* — reach, lives, steering, combo pace, value.
 * A player should be able to feel the last thing they bought, otherwise the shop is a tax on
 * their time rather than a reward for it.
 */

import { storage } from "./storage";

const SAVE_KEY = "mm_save_v2";

/**
 * Fraction of a run's score that is banked as spendable scrap.
 *
 * Score and currency want different scales. A score climbing in thousands is exciting to
 * watch; a currency climbing in thousands empties the shop in an afternoon. Decoupling them
 * keeps the number on screen big while making an upgrade something you work toward.
 *
 * A good run banks roughly 2,400 against a full shop costing about 280,000, so owning
 * everything is on the order of a hundred runs rather than a single evening. The first two or
 * three upgrades still land quickly, which is what matters for a new player — it is the tail
 * that is meant to be long.
 */
export const SCRAP_RATE = 1 / 10;

/**
 * Score above which an endless run's *bankable* haul starts to flatten out.
 *
 * Score itself stays uncapped — it is the record being chased, and capping it would gut the
 * whole point of the mode. But an endless run's length is unbounded while the shop's cost is
 * fixed, so paying a flat rate on it makes the endless mode strictly the best way to farm and
 * quietly undoes every other economy decision. Measured: a maxed drone banked 31,750 from one
 * endless run against a 287,000 shop — nine runs to own everything.
 */
const ENDLESS_SOFT_CAP = 25000;
const ENDLESS_TAPER = 50;

export function scrapFromScore(score: number, endless = false): number {
  if (!endless || score <= ENDLESS_SOFT_CAP) return Math.round(score * SCRAP_RATE);
  // Square-root growth past the cap: a run four times as long pays roughly twice as much,
  // which still rewards going further without making distance a printing press.
  const effective = ENDLESS_SOFT_CAP + Math.sqrt(score - ENDLESS_SOFT_CAP) * ENDLESS_TAPER;
  return Math.round(effective * SCRAP_RATE);
}

export interface Modifiers {
  /** Added to the mechanic's base field radius, in world units. */
  fieldRadiusBonus: number;
  /** Extra hull cells beyond the default three. */
  extraLives: number;
  /** Multiplier on drag-to-steer response. */
  steerScale: number;
  /** Pieces per multiplier step. Lower is faster. */
  comboStep: number;
  /** Multiplier on the value of everything collected. */
  valueScale: number;
}

export function baseModifiers(): Modifiers {
  return {
    fieldRadiusBonus: 0,
    extraLives: 0,
    steerScale: 1,
    comboStep: 8,
    valueScale: 1,
  };
}

export interface UpgradeDef {
  id: string;
  name: string;
  blurb: string;
  maxLevel: number;
  baseCost: number;
  /**
   * Price of the very first pip, when it should not be `baseCost`.
   *
   * The first purchase is the moment the meta actually hooks: the player learns that a run
   * makes them permanently stronger, and wants another one for that reason rather than for
   * the score. A measured naive first run banks a little over a hundred scrap, so a 1,200
   * opening price puts that moment five to ten runs away — most likely in a session that
   * never happens. One cheap pip brings it inside the first sitting; the curve past it is
   * untouched, so the long tail the shop is built around is unchanged.
   */
  introCost?: number;
  /** Human-readable effect of owning `level`. */
  describe(level: number): string;
  apply(mods: Modifiers, level: number): void;
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: "coil",
    name: "Coil",
    blurb: "Widens the magnet.",
    maxLevel: 5,
    baseCost: 1200,
    // The first thing anyone should own, and the most legible: a wider magnet is visible in
    // the first second of the next run.
    introCost: 400,
    describe: (l) => `Reach ${22 + l * 3}`,
    apply: (m, l) => {
      m.fieldRadiusBonus += l * 3;
    },
  },
  {
    id: "hull",
    name: "Hull",
    blurb: "More cells before the drone breaks up.",
    maxLevel: 3,
    baseCost: 2600,
    describe: (l) => `${3 + l} cells`,
    apply: (m, l) => {
      m.extraLives += l;
    },
  },
  {
    id: "servos",
    name: "Servos",
    blurb: "Sharper steering under the thumb.",
    maxLevel: 4,
    baseCost: 1500,
    describe: (l) => (l === 0 ? "Standard" : `+${l * 10}% response`),
    apply: (m, l) => {
      m.steerScale *= 1 + l * 0.1;
    },
  },
  {
    id: "capacitor",
    name: "Capacitor",
    blurb: "The multiplier climbs on fewer pieces.",
    maxLevel: 4,
    baseCost: 2000,
    describe: (l) => `Step every ${8 - l}`,
    apply: (m, l) => {
      m.comboStep = Math.max(4, 8 - l);
    },
  },
  {
    id: "claw",
    name: "Claw",
    blurb: "Everything you pull in is worth more.",
    maxLevel: 5,
    baseCost: 1800,
    describe: (l) => (l === 0 ? "Standard" : `+${l * 12}% value`),
    apply: (m, l) => {
      m.valueScale *= 1 + l * 0.12;
    },
  },
];

/** Costs climb steeply so a maxed track is a genuine goal rather than an afternoon. */
export function upgradeCost(def: UpgradeDef, currentLevel: number): number {
  if (currentLevel === 0 && def.introCost !== undefined) return def.introCost;
  return Math.round(def.baseCost * Math.pow(2.3, currentLevel));
}

/**
 * A print edition is a full palette swap — different stock, different inks. It fits the art
 * direction better than a costume would, and it is the cheapest possible cosmetic to build
 * while still visibly changing the whole game.
 *
 * Every pair has to stay unmistakable at speed, so each one separates on hue *and* on
 * lightness, not on hue alone.
 */
/**
 * Editions are **earned, never bought**.
 *
 * Scrap already buys every upgrade in the game; if it also bought the cosmetics there would be
 * nothing the campaign alone can give you, and no reason to finish a world once the levels
 * stopped paying well. Each one is tied to the level that awards it.
 */
export interface Edition {
  id: string;
  name: string;
  blurb: string;
  /** The level number that awards it, for the locked caption in the Workshop. */
  fromLevel: number;
  paper: string;
  paperShade: string;
  blue: string;
  red: string;
  key: string;
}

export const EDITIONS: Edition[] = [
  {
    id: "federal",
    name: "Federal",
    blurb: "Printed blue and vermilion on manila stock.",
    fromLevel: 0,
    paper: "#EDE7D6",
    paperShade: "#DED6C1",
    blue: "#0F5FBF",
    red: "#EA4327",
    key: "#17150F",
  },
  {
    id: "riot",
    name: "Riot",
    blurb: "Fluorescent pink against deep teal.",
    fromLevel: 6,
    paper: "#F2EDE4",
    paperShade: "#E0D9CC",
    blue: "#0B7A72",
    red: "#F2318A",
    key: "#141210",
  },
  {
    id: "nightshift",
    name: "Nightshift",
    blurb: "Warning orange and aubergine on grey board.",
    fromLevel: 12,
    paper: "#DDD8CE",
    paperShade: "#C8C2B6",
    blue: "#4B2A6B",
    red: "#F06A16",
    key: "#100E0C",
  },
  {
    id: "letterpress",
    name: "Letterpress",
    blurb: "Oxblood and moss, bitten deep into cotton rag.",
    fromLevel: 18,
    paper: "#E7E2D3",
    paperShade: "#D3CDBB",
    blue: "#3A5C3C",
    red: "#8E2B2B",
    key: "#14120E",
  },
  {
    id: "blueprint",
    name: "Blueprint",
    blurb: "Reversed out: white and cyan on process blue.",
    fromLevel: 24,
    paper: "#12325C",
    paperShade: "#0D2647",
    blue: "#EFF4F7",
    red: "#42D2E8",
    key: "#04101F",
  },
];

/**
 * One course per calendar day, identical for everyone. Determinism was built into the course
 * generator from the first commit precisely so this would be free later: no server, no level
 * data to distribute, just a date turned into a seed.
 */
export function dailyCode(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `DAILY-${y}${m}${d}`;
}

export interface RunSummary {
  score: number;
  won: boolean;
  absorbed: number;
  pressEaten: number;
  collected: number;
  maxCombo: number;
  actions: number;
  hits: number;
}

/**
 * Contracts exist to make a player try something other than their default line. Each one asks
 * for a specific behaviour, and the reward is paid in the same scrap the shop spends, so they
 * feed the loop that already exists rather than adding a second currency to reason about.
 */
export interface ContractDef {
  id: string;
  text: string;
  target: number;
  reward: number;
  /**
   * A one-off given to brand new players and never drawn again. The standing contracts are
   * sized for somebody who already plays well; a beginner is thousands of scrap away from
   * any of them, which leaves their first session with nothing to actually finish.
   */
  starter?: boolean;
  /** How much this run advanced the contract. */
  measure(r: RunSummary): number;
}

export const CONTRACTS: ContractDef[] = [
  {
    // Deliberately something a first-timer does by accident: the scripted lesson alone feeds
    // them several mines in their own colour. Two ordinary runs finish it, and the payout
    // plus those runs' own haul clears the opening Coil with change to spare — so the first
    // upgrade lands inside the first sitting rather than in a session that may never happen.
    id: "starter",
    text: "Swallow 8 mines in your own colour",
    target: 8,
    reward: 600,
    starter: true,
    measure: (r) => r.absorbed,
  },
  {
    id: "swallow",
    text: "Swallow mines in your own colour",
    target: 30,
    reward: 3500,
    measure: (r) => r.absorbed,
  },
  {
    id: "haul",
    text: "Bank scrap",
    target: 8000,
    reward: 4000,
    measure: (r) => r.score,
  },
  {
    id: "finish",
    text: "Reach the end of a course",
    target: 3,
    reward: 3000,
    measure: (r) => (r.won ? 1 : 0),
  },
  {
    id: "flawless",
    text: "Finish a course without losing a cell",
    target: 1,
    reward: 5000,
    measure: (r) => (r.won && r.hits === 0 ? 1 : 0),
  },
  {
    id: "chain",
    text: "Hold a chain of 60 in one run",
    target: 1,
    reward: 3500,
    measure: (r) => (r.maxCombo >= 60 ? 1 : 0),
  },
  {
    id: "pickup",
    text: "Pull in 140 pieces in one run",
    target: 1,
    reward: 3000,
    measure: (r) => (r.collected >= 140 ? 1 : 0),
  },
];

export interface ActiveContract {
  id: string;
  progress: number;
}

/** One credit to the bank, with the reason attached so it can be shown to the player. */
export interface ScrapCredit {
  label: string;
  amount: number;
}

/**
 * Advance contracts against a finished run, pay out anything completed, and draw replacements.
 *
 * Pure and outside the UI so the arithmetic can be tested. It used to live in the view layer,
 * where a play test found the real problem: contracts can pay several thousand at once, the
 * results sheet only ever showed the run's own haul, and the two used the same label — so the
 * bank jumped by far more than the number on screen and looked like a bug.
 */
export function settleContracts(save: SaveData, run: RunSummary): ScrapCredit[] {
  const credits: ScrapCredit[] = [];

  for (const active of save.contracts) {
    const def = contractById(active.id);
    if (!def || active.progress >= def.target) continue;
    active.progress += def.measure(run);
    if (active.progress >= def.target) {
      save.scrap += def.reward;
      credits.push({ label: `Contract: ${def.text.toLowerCase()}`, amount: def.reward });
    }
  }

  if (credits.length > 0) {
    save.contracts = refillContracts(
      save.contracts.filter((a) => {
        const def = contractById(a.id);
        return def ? a.progress < def.target : false;
      }),
    );
  }
  return credits;
}

export function contractById(id: string): ContractDef | undefined {
  return CONTRACTS.find((c) => c.id === id);
}

/** Fill empty slots with contracts that are not already active. */
export function refillContracts(active: ActiveContract[]): ActiveContract[] {
  const out = active.filter((a) => contractById(a.id));
  const taken = new Set(out.map((a) => a.id));
  // The starter is handed out once, by emptySave, and never drawn again — a veteran being
  // asked to swallow eight mines is not a contract, it is a formality.
  const pool = CONTRACTS.filter((c) => !taken.has(c.id) && !c.starter);
  while (out.length < 3 && pool.length > 0) {
    const pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!;
    out.push({ id: pick.id, progress: 0 });
  }
  return out;
}

/**
 * Campaign levels.
 *
 * The endless run answers "how big can you get". It cannot answer "what am I supposed to do
 * next", and without that a player who is not chasing a leaderboard runs out of reasons. Each
 * level is a fixed course with one named objective and a prize, unlocked in order, so there is
 * always exactly one obvious next thing.
 *
 * Objectives are single conditions on purpose. A compound goal is harder to show in a HUD than
 * it is worth, and a player who fails one cannot tell which half they missed.
 */
export type ObjectiveKind =
  | "finish"
  | "score"
  | "absorb"
  | "flawless"
  | "combo"
  | "collect"
  | "frugal"
  | "press";

/**
 * A world is a print run off the same plates: the generator is unchanged, but each one bends
 * it — faster, denser, more hazardous, more Presses. Building worlds as modifiers rather than
 * as separate generators means every world keeps benefiting from any tuning done to the core,
 * and a new one costs a handful of numbers rather than a new content pipeline.
 */
export interface WorldDef {
  id: string;
  name: string;
  blurb: string;
  /** Passed straight through to the simulation. */
  speedScale?: number;
  spacingScale?: number;
  hazardBias?: number;
  midPresses?: number;
  /** Awarded for clearing every level in the world. Cannot be bought. */
  seal: string;
}

export const WORLDS: WorldDef[] = [
  {
    id: "proof",
    name: "Proof Sheet",
    blurb: "The first run off the press. Clean stock, room to think.",
    seal: "Proof Mark",
  },
  {
    id: "nightshift",
    name: "Night Shift",
    blurb: "The presses run faster after dark.",
    speedScale: 1.16,
    seal: "Night Stamp",
  },
  {
    id: "overprint",
    name: "Overprint",
    blurb: "Too much ink, too little paper. Everything crowds in.",
    spacingScale: 0.82,
    hazardBias: 0.12,
    seal: "Overprint Seal",
  },
  {
    id: "final",
    name: "Final Edition",
    blurb: "Fast, dense, and the presses never stop coming.",
    speedScale: 1.2,
    spacingScale: 0.86,
    hazardBias: 0.18,
    midPresses: 2,
    seal: "Final Plate",
  },
];

export interface LevelDef {
  n: number;
  world: string;
  seed: string;
  kind: ObjectiveKind;
  target: number;
  reward: number;
  /** Some levels pay out a print edition. Editions cannot be bought — only earned. */
  unlockEdition?: string;
}

/**
 * Twenty-four levels across four worlds.
 *
 * Objectives rotate deliberately so no world is six of the same request: each world opens on
 * something reachable, closes on its hardest ask, and covers at least four different kinds in
 * between. A world of nothing but score targets is just the same level six times.
 *
 * Targets are bracketed by test/levels.test.ts, which plays every one with the autopilot on
 * both a stock and a fully upgraded drone. The first world must be clearable with no upgrades
 * at all; later ones may require them, because that is what makes the shop matter. A target
 * nobody can reach is the one outcome the test refuses.
 */
export const LEVELS: LevelDef[] = [
  // Proof Sheet — learn the rule, no upgrades assumed.
  { n: 1, world: "proof", seed: "LVL-0001", kind: "finish", target: 1, reward: 400 },
  { n: 2, world: "proof", seed: "LVL-0002", kind: "score", target: 6000, reward: 600 },
  { n: 3, world: "proof", seed: "LVL-0003", kind: "absorb", target: 8, reward: 800 },
  { n: 4, world: "proof", seed: "LVL-0004", kind: "collect", target: 70, reward: 900 },
  { n: 5, world: "proof", seed: "LVL-0005", kind: "absorb", target: 14, reward: 1100 },
  { n: 6, world: "proof", seed: "LVL-0006", kind: "score", target: 14000, reward: 1400, unlockEdition: "riot" },

  // Night Shift — everything arrives sooner.
  { n: 7, world: "nightshift", seed: "LVL-0007", kind: "finish", target: 1, reward: 1200 },
  { n: 8, world: "nightshift", seed: "LVL-0008", kind: "combo", target: 120, reward: 1500 },
  { n: 9, world: "nightshift", seed: "LVL-0009", kind: "press", target: 18, reward: 1700 },
  { n: 10, world: "nightshift", seed: "LVL-0010", kind: "collect", target: 110, reward: 1900 },
  { n: 11, world: "nightshift", seed: "LVL-0011", kind: "score", target: 22000, reward: 2100 },
  { n: 12, world: "nightshift", seed: "LVL-0012", kind: "flawless", target: 1, reward: 2600, unlockEdition: "nightshift" },

  // Overprint — the screen is busy and the gaps are thin.
  { n: 13, world: "overprint", seed: "LVL-0013", kind: "finish", target: 1, reward: 1800 },
  { n: 14, world: "overprint", seed: "LVL-0014", kind: "absorb", target: 20, reward: 2200 },
  { n: 15, world: "overprint", seed: "LVL-0015", kind: "frugal", target: 26, reward: 2500 },
  { n: 16, world: "overprint", seed: "LVL-0016", kind: "score", target: 30000, reward: 2800 },
  { n: 17, world: "overprint", seed: "LVL-0017", kind: "combo", target: 190, reward: 3100 },
  { n: 18, world: "overprint", seed: "LVL-0018", kind: "press", target: 16, reward: 3600, unlockEdition: "letterpress" },

  // Final Edition — everything at once.
  { n: 19, world: "final", seed: "LVL-0019", kind: "finish", target: 1, reward: 2600 },
  { n: 20, world: "final", seed: "LVL-0020", kind: "collect", target: 150, reward: 3200 },
  { n: 21, world: "final", seed: "LVL-0021", kind: "absorb", target: 28, reward: 3600 },
  { n: 22, world: "final", seed: "LVL-0022", kind: "frugal", target: 30, reward: 4000 },
  { n: 23, world: "final", seed: "LVL-0023", kind: "score", target: 42000, reward: 4600 },
  { n: 24, world: "final", seed: "LVL-0024", kind: "press", target: 30, reward: 8000, unlockEdition: "blueprint" },
];

export function worldById(id: string): WorldDef {
  return WORLDS.find((w) => w.id === id) ?? WORLDS[0]!;
}

export function levelsInWorld(id: string): LevelDef[] {
  return LEVELS.filter((l) => l.world === id);
}

/** True once every level in a world has been cleared, which is what awards its seal. */
export function worldComplete(save: SaveData, id: string): boolean {
  const levels = levelsInWorld(id);
  return levels.length > 0 && levels.every((l) => save.levelsDone >= l.n);
}

export function earnedSeals(save: SaveData): string[] {
  return WORLDS.filter((w) => worldComplete(save, w.id)).map((w) => w.seal);
}

export function describeObjective(level: LevelDef): string {
  switch (level.kind) {
    case "finish":
      return "Reach the end of the course";
    case "score":
      return `Score ${level.target.toLocaleString()}`;
    case "absorb":
      return `Swallow ${level.target} in your own colour`;
    case "flawless":
      return "Finish without losing a cell";
    case "combo":
      return `Hold a chain of ${level.target}`;
    case "collect":
      return `Pull in ${level.target} pieces`;
    case "frugal":
      return `Finish on ${level.target} colour changes or fewer`;
    case "press":
      return `Swallow ${level.target} of the Press`;
  }
}

/** Live progress toward the objective, for the heads-up display during a level run. */
export function objectiveProgress(
  level: LevelDef,
  now: {
    score: number;
    absorbed: number;
    pressEaten: number;
    collected: number;
    maxCombo: number;
    actions: number;
    hits: number;
    progress: number;
  },
): { text: string; done: boolean } {
  switch (level.kind) {
    case "finish":
      return { text: `${Math.round(now.progress * 100)}%`, done: now.progress >= 1 };
    case "score":
      return {
        text: `${now.score.toLocaleString()}/${level.target.toLocaleString()}`,
        done: now.score >= level.target,
      };
    case "absorb":
      return { text: `${now.absorbed}/${level.target}`, done: now.absorbed >= level.target };
    case "flawless":
      return { text: now.hits === 0 ? "CLEAN" : "FAILED", done: now.hits === 0 };
    case "combo":
      return { text: `${now.maxCombo}/${level.target}`, done: now.maxCombo >= level.target };
    case "collect":
      return { text: `${now.collected}/${level.target}`, done: now.collected >= level.target };
    case "frugal":
      // Counts down, because what matters is how many you have left to spend.
      return {
        text: `${Math.max(0, level.target - now.actions)} left`,
        done: now.actions <= level.target,
      };
    case "press":
      return { text: `${now.pressEaten}/${level.target}`, done: now.pressEaten >= level.target };
  }
}

export function levelPassed(level: LevelDef, r: RunSummary): boolean {
  switch (level.kind) {
    case "finish":
      return r.won;
    case "score":
      return r.score >= level.target;
    case "absorb":
      return r.absorbed >= level.target;
    case "flawless":
      return r.won && r.hits === 0;
    case "combo":
      return r.maxCombo >= level.target;
    case "collect":
      return r.collected >= level.target;
    // Frugal only counts on a finished course: quitting early would otherwise pass it trivially.
    case "frugal":
      return r.won && r.actions <= level.target;
    case "press":
      return r.pressEaten >= level.target;
  }
}

export interface SaveData {
  scrap: number;
  lifetimeScrap: number;
  upgrades: Record<string, number>;
  ownedEditions: string[];
  edition: string;
  runs: number;
  dailyDate: string;
  dailyBest: number;
  contracts: ActiveContract[];
  /** Furthest distance reached in an endless run, in world units. The record to beat. */
  endlessBest: number;
  /** Best endless score, shown alongside the distance. */
  endlessBestScore: number;
  /** How many campaign levels have been completed. Levels unlock in order. */
  levelsDone: number;
  /**
   * Attempts per level, keyed by level number. This is the single most useful retention
   * number the game can collect: the level where attempts pile up is the level people quit on.
   */
  levelAttempts: Record<string, number>;
}

function emptySave(): SaveData {
  return {
    scrap: 0,
    lifetimeScrap: 0,
    upgrades: {},
    ownedEditions: ["federal"],
    edition: "federal",
    runs: 0,
    dailyDate: "",
    dailyBest: 0,
    // A new player opens with the starter in slot one, so there is something on the menu they
    // can actually finish today.
    contracts: refillContracts([{ id: "starter", progress: 0 }]),
    endlessBest: 0,
    endlessBestScore: 0,
    levelsDone: 0,
    levelAttempts: {},
  };
}

export function loadSave(): SaveData {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return emptySave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const base = emptySave();
    return {
      scrap: Number(parsed.scrap) || 0,
      lifetimeScrap: Number(parsed.lifetimeScrap) || 0,
      upgrades: parsed.upgrades ?? base.upgrades,
      // Always keep the default edition owned, even if a save is edited or truncated.
      ownedEditions: Array.from(new Set([...(parsed.ownedEditions ?? []), "federal"])),
      edition: parsed.edition ?? "federal",
      runs: Number(parsed.runs) || 0,
      dailyDate: parsed.dailyDate ?? "",
      dailyBest: Number(parsed.dailyBest) || 0,
      contracts: refillContracts(parsed.contracts ?? []),
      endlessBest: Number(parsed.endlessBest) || 0,
      endlessBestScore: Number(parsed.endlessBestScore) || 0,
      levelsDone: Number(parsed.levelsDone) || 0,
      levelAttempts: parsed.levelAttempts ?? {},
    };
  } catch {
    return emptySave();
  }
}

export function saveSave(data: SaveData): void {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Serialisation failed, which should not happen. The in-memory save still stands for
    // this session, so the run the player just finished is not thrown away in front of them.
  }
}

export function levelOf(save: SaveData, id: string): number {
  return save.upgrades[id] ?? 0;
}

export function modifiersFor(save: SaveData): Modifiers {
  const mods = baseModifiers();
  for (const def of UPGRADES) def.apply(mods, levelOf(save, def.id));
  return mods;
}

export function editionById(id: string): Edition {
  return EDITIONS.find((e) => e.id === id) ?? EDITIONS[0]!;
}

/**
 * The single most useful thing to show a player as they leave: the next concrete thing they
 * are close to, named, with the gap in scrap. "Come back tomorrow" is not a reason; "1,400
 * more and the coil gets wider" is.
 */
export type GoalKind = "level" | "upgrade" | "contract";

export interface NextGoal {
  kind: GoalKind;
  label: string;
  /** Scrap still needed. Zero means it is available right now. */
  remaining: number;
}

export function nextGoal(save: SaveData): NextGoal | null {
  let best: NextGoal | null = null;

  // An unlocked, unbeaten level is the clearest possible next thing to do — but only for
  // somebody who has seen the rule work. The menu holds the campaign back for exactly this
  // reason, and pointing a first-timer at a numbered objective the menu is still hiding sends
  // them somewhere they have no way to evaluate yet.
  const warmedUp = save.runs >= 3 || save.levelsDone > 0;
  if (warmedUp && save.levelsDone < LEVELS.length) {
    const next = LEVELS[save.levelsDone]!;
    return {
      kind: "level",
      label: `Level ${next.n} — ${describeObjective(next).toLowerCase()}`,
      remaining: 0,
    };
  }

  for (const def of UPGRADES) {
    const level = levelOf(save, def.id);
    if (level >= def.maxLevel) continue;
    const remaining = upgradeCost(def, level) - save.scrap;
    if (remaining <= 0) return { kind: "upgrade", label: `${def.name} ${level + 1}`, remaining: 0 };
    if (!best || remaining < best.remaining) {
      best = { kind: "upgrade", label: `${def.name} ${level + 1}`, remaining };
    }
  }

  for (const c of save.contracts) {
    const def = contractById(c.id);
    if (!def) continue;
    const left = def.target - c.progress;
    if (left > 0 && left <= def.target * 0.34) {
      return { kind: "contract", label: def.text.toLowerCase(), remaining: 0 };
    }
  }

  return best;
}
