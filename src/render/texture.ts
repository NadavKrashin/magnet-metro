/**
 * Paper and ink texture, baked once into a tile and reused as a fill pattern.
 *
 * Generating this per frame would be far too slow, but a tile is cheap: one pattern fill over
 * the whole canvas per frame. The grain is what stops flat vector fills looking like clip art,
 * and it is the single highest-value texture in the whole print look.
 */

const TILE = 192;

/** Fine paper fibre noise. Applied over everything with multiply at low opacity. */
export function makeGrainTile(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TILE;
  c.height = TILE;
  const ctx = c.getContext("2d");
  if (!ctx) return c;

  const img = ctx.createImageData(TILE, TILE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // Bias toward white so the tile darkens the page only slightly and unevenly.
    const n = 226 + Math.floor(Math.random() * 30);
    d[i] = n;
    d[i + 1] = n;
    d[i + 2] = n;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * A halftone dot screen. Used to shade large areas the way a printer would — with dots of
 * varying size rather than a flat tint, since a screenprint has no half-tones of its own.
 */
export function makeHalftoneTile(dotSpacing = 6, dotRadius = 1.35, color = "#000"): HTMLCanvasElement {
  const size = dotSpacing * 8;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return c;

  ctx.fillStyle = color;
  // Offset every other row by half a step, which is how a real dot screen is laid out.
  for (let row = 0; row * dotSpacing < size; row++) {
    const y = row * dotSpacing;
    const offset = row % 2 === 0 ? 0 : dotSpacing / 2;
    for (let x = offset; x < size; x += dotSpacing) {
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return c;
}
