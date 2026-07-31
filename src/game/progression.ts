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

const SAVE_KEY = "mm_save_v2";

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
  return Math.round(def.baseCost * Math.pow(2.15, currentLevel));
}

/**
 * A print edition is a full palette swap — different stock, different inks. It fits the art
 * direction better than a costume would, and it is the cheapest possible cosmetic to build
 * while still visibly changing the whole game.
 *
 * Every pair has to stay unmistakable at speed, so each one separates on hue *and* on
 * lightness, not on hue alone.
 */
export interface Edition {
  id: string;
  name: string;
  blurb: string;
  cost: number;
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
    cost: 0,
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
    cost: 6000,
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
    cost: 14000,
    paper: "#DDD8CE",
    paperShade: "#C8C2B6",
    blue: "#4B2A6B",
    red: "#F06A16",
    key: "#100E0C",
  },
  {
    id: "blueprint",
    name: "Blueprint",
    blurb: "Reversed out: white and cyan on process blue.",
    cost: 26000,
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
  collected: number;
  maxCombo: number;
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
  /** How much this run advanced the contract. */
  measure(r: RunSummary): number;
}

export const CONTRACTS: ContractDef[] = [
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
    target: 40000,
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

export function contractById(id: string): ContractDef | undefined {
  return CONTRACTS.find((c) => c.id === id);
}

/** Fill empty slots with contracts that are not already active. */
export function refillContracts(active: ActiveContract[]): ActiveContract[] {
  const out = active.filter((a) => contractById(a.id));
  const taken = new Set(out.map((a) => a.id));
  const pool = CONTRACTS.filter((c) => !taken.has(c.id));
  while (out.length < 3 && pool.length > 0) {
    const pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!;
    out.push({ id: pick.id, progress: 0 });
  }
  return out;
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
    contracts: refillContracts([]),
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
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
    };
  } catch {
    return emptySave();
  }
}

export function saveSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable. Progression is lost on reload, but the game still plays.
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
export function nextGoal(save: SaveData): { label: string; remaining: number } | null {
  let best: { label: string; remaining: number } | null = null;

  for (const def of UPGRADES) {
    const level = levelOf(save, def.id);
    if (level >= def.maxLevel) continue;
    const remaining = upgradeCost(def, level) - save.scrap;
    if (remaining <= 0) return { label: `${def.name} ${level + 1} is affordable now`, remaining: 0 };
    if (!best || remaining < best.remaining) {
      best = { label: `${def.name} ${level + 1}`, remaining };
    }
  }

  for (const c of save.contracts) {
    const def = contractById(c.id);
    if (!def) continue;
    const left = def.target - c.progress;
    if (left > 0 && left <= def.target * 0.34) {
      return { label: `a contract: ${def.text.toLowerCase()}`, remaining: 0 };
    }
  }

  for (const ed of EDITIONS) {
    if (save.ownedEditions.includes(ed.id)) continue;
    const remaining = ed.cost - save.scrap;
    if (remaining > 0 && (!best || remaining < best.remaining)) {
      best = { label: `the ${ed.name} edition`, remaining };
    }
  }
  return best;
}
