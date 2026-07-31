/**
 * The print system.
 *
 * The game is drawn as a two-colour screenprint on paper stock, not as light on a black
 * screen. That single decision drives everything else: there is no glow, because ink does not
 * emit. Emphasis comes from solid ink versus bare paper, from a heavy black key line, and
 * from overprint where two inks cross. Those are the tools a screenprinter actually has.
 */

/** Paper stock. Warm and slightly grey, like uncoated newsprint rather than bright white. */
export const PAPER = "#EDE7D6";
/** A second, darker paper tone used for the areas outside the playable lane. */
export const PAPER_SHADE = "#DED6C1";

/** Ink 1. Deep printed blue with enough weight to hold a solid fill. */
export const INK_BLUE = "#0F5FBF";
/** Ink 2. Hot vermilion, the classic Riso fluorescent-adjacent red. */
export const INK_RED = "#EA4327";
/** Key plate. Never pure black — printed black on uncoated stock always warms up. */
export const INK_KEY = "#17150F";

/** Where the two inks overprint. Multiply blending produces this naturally. */
export const INK_OVERPRINT = "#12213F";

export function inkFor(polarity: number): string {
  if (polarity === 1) return INK_BLUE;
  if (polarity === -1) return INK_RED;
  return INK_KEY;
}

/**
 * How far the colour plate sits off the key plate, in world units.
 *
 * Real screenprints misregister slightly because the paper shifts between passes. Faking it
 * is what stops flat vector shapes reading as clip art — but it has to stay under about a
 * third of a line weight or it looks like a rendering bug rather than a print artefact.
 */
export const MISREGISTER_X = 0.22;
export const MISREGISTER_Y = -0.16;
