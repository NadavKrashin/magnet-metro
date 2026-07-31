/**
 * Deterministic RNG. Every course is generated from a seed, so the same seed always
 * produces the same course on every device. That is what makes shareable challenge
 * links and ghost races possible without sending level data over the network.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Avoid a zero state, which would make mulberry32 degenerate.
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max]. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }
}

/** Turn a human-shareable code like "K7RM-2QX" into a numeric seed. */
export function seedFromCode(code: string): number {
  let h = 0x811c9dc5;
  const s = code.toUpperCase();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1, easier to read aloud

/** Generate a readable challenge code: 7 letters split by a dash, e.g. "K7RM-2QX". */
export function randomCode(rng: Rng): string {
  let out = "";
  for (let i = 0; i < 7; i++) {
    if (i === 4) out += "-";
    out += CODE_ALPHABET[rng.int(0, CODE_ALPHABET.length - 1)];
  }
  return out;
}
