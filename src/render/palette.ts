import { EDITIONS, type Edition } from "../game/progression";

/**
 * The print system.
 *
 * The game is drawn as a two-colour screenprint on paper stock, not as light on a black
 * screen. That single decision drives everything else: there is no glow, because ink does not
 * emit. Emphasis comes from solid ink versus bare paper, from a heavy black key line, and
 * from overprint where two inks cross. Those are the tools a screenprinter actually has.
 *
 * The values are mutable because an owned edition swaps the whole palette — stock and both
 * inks — at once. Everything that draws reads through this object rather than importing fixed
 * constants, so a swap needs no other code to know about it.
 */
export const ink = {
  paper: EDITIONS[0]!.paper,
  paperShade: EDITIONS[0]!.paperShade,
  blue: EDITIONS[0]!.blue,
  red: EDITIONS[0]!.red,
  key: EDITIONS[0]!.key,
};

export function applyEdition(edition: Edition): void {
  ink.paper = edition.paper;
  ink.paperShade = edition.paperShade;
  ink.blue = edition.blue;
  ink.red = edition.red;
  ink.key = edition.key;

  // The interface is printed on the same stock, so it follows the same plates.
  const root = document.documentElement;
  root.style.setProperty("--paper", edition.paper);
  root.style.setProperty("--paper-2", edition.paperShade);
  root.style.setProperty("--blue", edition.blue);
  root.style.setProperty("--red", edition.red);
  root.style.setProperty("--key", edition.key);
}

export function inkFor(polarity: number): string {
  if (polarity === 1) return ink.blue;
  if (polarity === -1) return ink.red;
  return ink.key;
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
