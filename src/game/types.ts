/** +1 is blue, -1 is red. 0 means "no charge" — attracts everything, repels nothing. */
export type Polarity = 1 | -1 | 0;

export interface Scrap {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  polarity: Polarity;
  value: number;
  /** Set once the item has been pulled into the chain. */
  taken: boolean;
}

export type HazardKind = "mine" | "block";

export interface Hazard {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  polarity: Polarity;
  kind: HazardKind;
  /** Patrol amplitude in world units. Zero for stationary hazards. */
  driftAmp: number;
  driftPhase: number;
  /** Set when swallowed by a matching-colour drone, so it can be cleared next cull. */
  absorbed: boolean;
  /** Part of the closing set piece. Costs haul rather than lives when mismatched. */
  press: boolean;
  /**
   * Part of a colour gate: a full-width wall with no gap, mid-course.
   *
   * Gates exist because every other wall in the game can be steered around, which made
   * staying one colour a safe strategy that simply earned less. Like the Press they cost haul
   * rather than lives — the point is that camping stops being comfortable, not that anybody
   * starts dying.
   */
  gate: boolean;
}

export interface Anchor {
  x: number;
  y: number;
  r: number;
  /** True while the player is latched to it, for rendering. */
  active: boolean;
}

export interface ChainItem {
  x: number;
  y: number;
  r: number;
  polarity: Polarity;
  value: number;
}

export interface TrailPoint {
  x: number;
  y: number;
  /** Cumulative distance travelled at this point, used to space the chain evenly. */
  s: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: string;
}

export interface FloatText {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  text: string;
  hue: string;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  r: number;
  /** Forward speed in world units per second. */
  speed: number;
}

/**
 * What the magnet is doing this frame. Mechanics write this; the world applies it.
 * Keeping the physics in one place is what lets three different control schemes be
 * compared fairly — only the thumb input differs, not the underlying feel.
 */
export interface Field {
  polarity: Polarity;
  radius: number;
  strength: number;
  /** Push opposite-charge hazards away instead of ignoring them. */
  repelHazards: boolean;
  invulnerable: boolean;
}

export interface RunStats {
  collected: number;
  /** Hazards swallowed by matching their colour. The signature act of the game. */
  absorbed: number;
  /** Of those, how many belonged to a Press. Lets a level ask for the set piece specifically. */
  pressEaten: number;
  /** Colour gates matched and swallowed whole. */
  gatesEaten: number;
  /** Colour gates crashed into on the wrong colour. */
  gatesCrashed: number;
  missed: number;
  /**
   * Scrap value that could not be collected because it was the other colour when it went
   * past. This is the cost of staying one colour, and it was previously invisible.
   */
  missedWrongColour: number;
  hits: number;
  maxCombo: number;
  actions: number;
  duration: number;
}

export type RunPhase = "running" | "won" | "lost";
