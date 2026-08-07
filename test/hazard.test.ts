/**
 * Guards the colour rule at the collision level.
 *
 * A play test reported taking damage from a matching-colour hazard. The rules turned out to
 * be correct and the fault was readability — but "the rules are fine" is exactly the kind of
 * claim that should be enforced by a test rather than re-argued each time it is questioned.
 */
import { World } from "../src/game/world";
import type { Hazard, Polarity } from "../src/game/types";

const DT = 1 / 60;
let failures = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function hazard(polarity: Polarity, r: number, press = false, gate = false): Hazard {
  return {
    x: 0,
    y: 8,
    r,
    vx: 0,
    vy: 0,
    polarity,
    kind: "mine",
    driftAmp: 0,
    driftPhase: 0,
    absorbed: false,
    press,
    gate,
  };
}

/** Hold the drone still so the hazard is drawn onto it, isolating the collision outcome. */
function meet(playerColour: Polarity, h: Hazard) {
  const w = new World(7, { anchors: false, charged: true });
  w.setViewHeight(142);
  w.field.radius = 22;
  w.field.strength = 420;
  w.scrap.length = 0;
  w.hazards.length = 0;
  w.hazards.push(h);
  const y0 = w.player.y;
  for (let i = 0; i < 90; i++) {
    w.field.polarity = playerColour;
    w.step(DT);
    w.player.y = y0;
  }
  return w;
}

console.log("Hazard rule checks\n");

for (const [label, colour] of [["blue", 1], ["red", -1]] as const) {
  const same = meet(colour, hazard(colour, 2.2));
  check(
    `${label} drone eats a ${label} mine without damage`,
    same.integrity === 3 && same.stats.absorbed === 1,
    `integrity ${same.integrity}, absorbed ${same.stats.absorbed}`,
  );

  const bigSame = meet(colour, hazard(colour, 3.1));
  check(
    `${label} drone eats a large ${label} hazard without damage`,
    bigSame.integrity === 3 && bigSame.stats.absorbed === 1,
    `integrity ${bigSame.integrity}`,
  );

  const pressSame = meet(colour, hazard(colour, 3.1, true));
  check(
    `${label} drone eats a matching press block without damage`,
    pressSame.integrity === 3 && pressSame.stats.absorbed === 1,
    `integrity ${pressSame.integrity}`,
  );

  const gateSame = meet(colour, hazard(colour, 3.1, false, true));
  check(
    `${label} drone eats a matching gate block without damage`,
    gateSame.integrity === 3 && gateSame.stats.absorbed === 1 && gateSame.stats.gatesEaten === 1,
    `integrity ${gateSame.integrity}, gatesEaten ${gateSame.stats.gatesEaten}`,
  );
}

// And the other half: the press must cost haul, never a life.
const w = new World(7, { anchors: false, charged: true });
w.setViewHeight(142);
w.field.radius = 22;
w.field.strength = 420;
w.scrap.length = 0;
w.hazards.length = 0;
for (let i = 0; i < 12; i++) w.chain.push({ x: 0, y: 0, r: 1.35, polarity: 1, value: 10 });
// A mismatched hazard is not attracted, so it has to be placed already in contact.
const block = hazard(-1, 3.1, true);
block.y = 3;
w.hazards.push(block);
const y0 = w.player.y;
for (let i = 0; i < 90; i++) {
  w.field.polarity = 1;
  w.step(DT);
  w.player.y = y0;
}
check("mismatched press costs haul, not a cell", w.integrity === 3 && w.chain.length < 12, `integrity ${w.integrity}, chain ${w.chain.length}`);

/**
 * The property the entire gate design rests on. Gates exist to make camping uncomfortable,
 * and the moment one can cost a cell they raise the floor a beginner has to clear rather than
 * the ceiling a skilled player plays against — which is exactly the failure that a lethal
 * Press produced, taking naive completion from 50% to zero.
 */
const g = new World(7, { anchors: false, charged: true });
g.setViewHeight(142);
g.field.radius = 22;
g.field.strength = 420;
g.scrap.length = 0;
g.hazards.length = 0;
for (let i = 0; i < 20; i++) g.chain.push({ x: 0, y: 0, r: 1.35, polarity: 1, value: 10 });
g.combo = 40;
const gateBlock = hazard(-1, 3.1, false, true);
gateBlock.y = 3;
g.hazards.push(gateBlock);
// Held for less than the invulnerability window, so this measures one crossing. A real drone
// always moves forward through a one-row gate; only a test can loiter inside one.
const gy0 = g.player.y;
for (let i = 0; i < 40; i++) {
  g.field.polarity = 1;
  g.step(DT);
  g.player.y = gy0;
}
check(
  "a mismatched gate never costs a cell",
  g.integrity === 3 && g.stats.hits === 0,
  `integrity ${g.integrity}, hits ${g.stats.hits}`,
);
check(
  "a mismatched gate resets the multiplier",
  g.combo === 0 && g.multiplier === 1,
  `combo ${g.combo}, multiplier ${g.multiplier}`,
);
check(
  "a mismatched gate scatters part of the tail, not all of it",
  g.chain.length < 20 && g.chain.length > 8,
  `chain ${g.chain.length} of 20`,
);
check("a mismatched gate is counted", g.stats.gatesCrashed === 1, `${g.stats.gatesCrashed}`);

console.log(failures === 0 ? "\nAll hazard checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
