/**
 * Mastery: three marks per level rather than a pass/fail tick.
 *
 * Twenty-four levels is not much content, and once cleared each one had nothing left to ask
 * for — a problem sharpened by making a replayed level bank no scrap, which removed the only
 * remaining reason to open one again. Three marks turn twenty-four courses into seventy-two
 * goals without authoring a single new course.
 *
 * The grades are universal rather than per-level, and that is the property most worth
 * defending. Twenty-four tightened targets would be twenty-four more hand-tuned numbers to keep
 * reachable, and the level table has already had to be re-tuned twice in this project — once
 * when gates landed and once when the closing Press stopped stacking. A rule that needs no
 * numbers cannot go stale.
 */
import {
  LEVELS,
  MASTERY_TIERS,
  describeMastery,
  levelMastery,
  levelPassed,
  masteryInWorld,
  masteryOf,
  masteryTotal,
  nextMasteryAsk,
  loadSave,
  type LevelDef,
  type RunSummary,
} from "../src/game/progression";

let failures = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** A run that comfortably satisfies any objective in the table, tweakable per case. */
function run(over: Partial<RunSummary> = {}): RunSummary {
  return {
    score: 999_999,
    banked: 9_999,
    won: true,
    absorbed: 999,
    pressEaten: 999,
    collected: 999,
    maxCombo: 999,
    // Frugal counts *down*, so a big number would fail it. One colour change is under every
    // budget in the table.
    actions: 1,
    hits: 0,
    wallsCrashed: 0,
    ...over,
  };
}

console.log("Mastery checks\n");

const lv: LevelDef = LEVELS[0]!;

check("a failed run earns nothing", levelMastery(lv, run({ won: false })) === 0);
check("clearing it earns one", levelMastery(lv, run({ hits: 2, wallsCrashed: 3 })) === 1);
check("clearing it clean earns two", levelMastery(lv, run({ wallsCrashed: 2 })) === 2);
check("clean and never wrong at a wall earns all three", levelMastery(lv, run()) === MASTERY_TIERS);

/**
 * The distinction the third mark exists for. Gates and the Press cost no cells, so `hits` can
 * be zero on a run that got every un-dodgeable wall on the course wrong — which is precisely
 * the run the game's thesis says was played badly.
 */
check(
  "a run with no hits but a botched wall is not perfect",
  levelMastery(lv, run({ hits: 0, wallsCrashed: 1 })) === 2,
  `${levelMastery(lv, run({ hits: 0, wallsCrashed: 1 }))}`,
);

// Universality is the point: every objective kind has to grade identically, or the rule needs
// per-level exceptions and the whole argument for it collapses.
for (const level of LEVELS) {
  const cleared = levelMastery(level, run());
  if (cleared !== MASTERY_TIERS) {
    check(`level ${level.n} (${level.kind}) can reach every mark`, false, `got ${cleared}`);
  }
}
check(
  "every level in the table can reach every mark on one perfect run",
  LEVELS.every((l) => levelMastery(l, run()) === MASTERY_TIERS),
);

// And nothing can be graded above zero without actually passing the objective.
check(
  "a mark is never awarded for a run that missed the objective",
  LEVELS.every((l) => {
    const r = run({ score: 0, absorbed: 0, pressEaten: 0, collected: 0, maxCombo: 0, won: false });
    return levelPassed(l, r) || levelMastery(l, r) === 0;
  }),
);

// --- Copy -------------------------------------------------------------------

check(
  "every tier has a name",
  [1, 2, 3].every((t) => describeMastery(t).length > 0) && describeMastery(0) === "",
);
check(
  "an unearned mark always says what it wants",
  nextMasteryAsk(1).length > 0 && nextMasteryAsk(2).length > 0,
);
check(
  "and a fully mastered level stops asking",
  nextMasteryAsk(MASTERY_TIERS) === "" && nextMasteryAsk(0) === "",
);

// --- Totals -----------------------------------------------------------------

const save = loadSave();
save.levelMastery = {};
const empty = masteryTotal(save);
check(
  "a blank save has earned nothing and everything is available",
  empty.earned === 0 && empty.possible === LEVELS.length * MASTERY_TIERS,
  `${empty.earned}/${empty.possible}`,
);

save.levelMastery["1"] = 3;
save.levelMastery["2"] = 1;
check("marks total up", masteryTotal(save).earned === 4, `${masteryTotal(save).earned}`);
check("and are readable per level", masteryOf(save, 1) === 3 && masteryOf(save, 99) === 0);

const world = masteryInWorld(save, LEVELS[0]!.world);
check(
  "a world counts only its own levels",
  world.possible === LEVELS.filter((l) => l.world === LEVELS[0]!.world).length * MASTERY_TIERS &&
    world.earned === 4,
  `${world.earned}/${world.possible}`,
);

// A save written before mastery existed must not be handed marks nobody earned — nothing in it
// records whether those clears were clean.
const legacy = loadSave();
check(
  "an older save starts every mark unearned",
  masteryTotal(legacy).earned === 0,
  `${masteryTotal(legacy).earned}`,
);

console.log(
  failures === 0 ? "\nMastery grades the thesis." : `\n${failures} check(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
