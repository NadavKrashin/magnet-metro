/**
 * The daily streak is the cheapest comeback mechanic this game has, and it is entirely
 * arithmetic on a stored date — which is exactly the kind of thing that is wrong at a month
 * boundary, wrong across a year, or silently payable twice, and never noticed in play.
 */
import {
  dailyCode,
  loadSave,
  settleDailyStreak,
  streakAtRisk,
  streakReward,
  type SaveData,
} from "../src/game/progression";

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function fresh(): SaveData {
  const s = loadSave();
  s.dailyStreak = 0;
  s.dailyStreakDate = "";
  s.dailyStreakBest = 0;
  return s;
}

const day = (iso: string) => dailyCode(new Date(`${iso}T12:00:00Z`));

console.log("Daily streak checks\n");

// Consecutive days climb.
const s = fresh();
settleDailyStreak(s, day("2026-03-01"));
check("the first daily starts a streak of one", s.dailyStreak === 1, `${s.dailyStreak}`);
settleDailyStreak(s, day("2026-03-02"));
settleDailyStreak(s, day("2026-03-03"));
check("consecutive days climb", s.dailyStreak === 3, `${s.dailyStreak}`);

// Replaying the same day must not pay twice — the daily course can be run repeatedly.
const again = settleDailyStreak(s, day("2026-03-03"));
check(
  "replaying today does not advance the streak",
  s.dailyStreak === 3 && !again.advanced,
  `${s.dailyStreak}, advanced=${again.advanced}`,
);

// A missed day resets, and reports that it did.
const skipped = settleDailyStreak(s, day("2026-03-05"));
check(
  "a missed day resets to one and says so",
  s.dailyStreak === 1 && skipped.broken,
  `${s.dailyStreak}, broken=${skipped.broken}`,
);
check("the best streak is remembered", s.dailyStreakBest === 3, `${s.dailyStreakBest}`);

// Month and year boundaries are where naive date arithmetic breaks.
const m = fresh();
settleDailyStreak(m, day("2026-01-31"));
settleDailyStreak(m, day("2026-02-01"));
check("a streak survives a month boundary", m.dailyStreak === 2, `${m.dailyStreak}`);

const y = fresh();
settleDailyStreak(y, day("2025-12-31"));
settleDailyStreak(y, day("2026-01-01"));
check("a streak survives a year boundary", y.dailyStreak === 2, `${y.dailyStreak}`);

const leap = fresh();
settleDailyStreak(leap, day("2028-02-28"));
settleDailyStreak(leap, day("2028-02-29"));
settleDailyStreak(leap, day("2028-03-01"));
check("a streak survives a leap day", leap.dailyStreak === 3, `${leap.dailyStreak}`);

// The at-risk warning is what makes the streak worth having on the menu.
const risk = fresh();
settleDailyStreak(risk, day("2026-03-01"));
check("yesterday's streak is flagged at risk today", streakAtRisk(risk, day("2026-03-02")));
check("today's streak is not at risk", !streakAtRisk(risk, day("2026-03-01")));
check("a streak already lost is not at risk", !streakAtRisk(risk, day("2026-03-09")));
check("no streak is never at risk", !streakAtRisk(fresh(), day("2026-03-02")));

// The bonus has to be worth turning up for without out-earning actually playing.
check("the streak bonus grows", streakReward(3) > streakReward(1));
check("the streak bonus is capped", streakReward(400) === streakReward(7), `${streakReward(400)}`);
check(
  "a long streak never out-earns a good run",
  streakReward(400) < 3000,
  `${streakReward(400)}`,
);

// A save written before streaks existed must load as an unstarted streak, not as NaN.
const legacy = loadSave();
check(
  "a pre-streak save loads cleanly",
  Number.isFinite(legacy.dailyStreak) && Number.isFinite(legacy.dailyStreakBest),
  `${legacy.dailyStreak}/${legacy.dailyStreakBest}`,
);

console.log(failures === 0 ? "\nStreaks count correctly." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
