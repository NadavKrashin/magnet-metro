export const TAU = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential smoothing. `rate` is roughly "how fast", in 1/seconds. */
export function damp(a: number, b: number, rate: number, dt: number): number {
  return lerp(a, b, 1 - Math.exp(-rate * dt));
}

/** Move `a` toward `b` by at most `maxDelta`. */
export function approach(a: number, b: number, maxDelta: number): number {
  const d = b - a;
  if (Math.abs(d) <= maxDelta) return b;
  return a + Math.sign(d) * maxDelta;
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

/** True when two circles overlap. */
export function circlesHit(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  const r = ar + br;
  return dist2(ax, ay, bx, by) <= r * r;
}

/**
 * Does the path travelled between two points pass within `r` of a circle centre?
 *
 * Steering moves the drone one-to-one with the thumb, so a fast flick can carry it tens of
 * world units in a single 1/60s step — most of the way across a 60-unit track. Testing only
 * where it *ended up* meant it passed straight through anything in between: the player saw a
 * mine struck and nothing happened. Testing the whole segment is what makes a hit a hit.
 */
export function segmentCircleHit(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  // Degenerate segment: the drone did not move, so this is an ordinary overlap test.
  if (lenSq < 1e-9) return dist2(ax, ay, cx, cy) <= r * r;
  // Closest approach of the centre to the segment, clamped to the segment's ends.
  const t = clamp(((cx - ax) * dx + (cy - ay) * dy) / lenSq, 0, 1);
  return dist2(ax + dx * t, ay + dy * t, cx, cy) <= r * r;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
