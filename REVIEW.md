# Play review — pre-release, full pass

A top-to-bottom review of Magnet Metro as it stands one step before production. The game was
built, its test suite run, and then actually played in a headless phone-sized browser: a naive
first session, three warm-up runs, a level attempt, a daily run, the workshop, settings, the
share flow, and the autopilot demo. Frame rate measured 60 fps in a software renderer.

The core is genuinely good — distinctive art, a real mechanic with depth, and a meta that
mostly pulls in the right direction. The review found six bugs (two in the flagship endless
mode and the ad flow) and five retention frictions working against "users don't stop after one
go". **All of them have since been fixed**; this document keeps the findings and the reasoning,
with each item marked and pointed at the commit that closed it.

What has *not* happened is the one thing this environment cannot do: play it on a real phone.
See "Still open" at the bottom.

---

## Bugs found — all fixed

### 1. ✅ "Double it" corrupted the results sheet on every bounded run
After a rewarded double, the handler updated the *last* row of the stats table, assuming it
was "Total in the bank". For endless runs it is. For **every bounded run** (daily, levels,
shared courses) the last row is "Course reached", so the ad reward overwrote the completion
percentage with the bank total and the real bank row went stale — the exact "bank doesn't
match the sheet" confusion the itemised credits were built to kill, triggered by the one
player who watched an ad for you. *Fixed: the bank cell carries an id and is updated by id.*

### 2. ✅ Endless mode showed the Press prompt permanently after ~1,260 m
The prompt condition was `pressPolarity !== 0 && y > COURSE_LENGTH - PRESS_ZONE - 90`. In Free
Run `pressPolarity` becomes non-zero when the first Press spawns and stays non-zero forever,
and `y > 1260` is true for the rest of the run. So from ~1,260 m onward — in the headline
mode, for the rest of what may be a very long run — the HUD permanently showed "THE PRESS —
EAT IT ALL" or the *pulsing urgent* "TAP TO MATCH IT", with the nearest Press up to 1,000 m
away. Presses are 1,150 m apart, so the instruction was wrong ~90% of the time and the urgent
style became noise. *Fixed: `World.pressHeadY` tracks the real wall position and the prompt
keys off proximity to it. Mid-course Presses now get an approach prompt too, which they never
had.*

### 3. ✅ "NEW RECORD" fired from the first metre of the first run
With `endlessBest` at 0, `y > best` was true immediately, so a brand-new player's first run
said NEW RECORD from metre one and the results claimed "furthest you have ever been" about a
number with no history. *Fixed: the run is measured against the record as it stood at the
start; a first-ever run reads as plain distance in the HUD, the title and the copy.*

### 4. ✅ Quitting a bounded run said "Drone destroyed"
"Give up and bank it" produced a sheet titled "Drone destroyed" with zero hits taken. The
pause screen frames banking out as a respectable choice; the results sheet then called it a
destruction. *Fixed: a voluntary quit is titled "Banked early".*

### 5. ✅ The revive offer talked percentages in a mode with no course
"You are 100% through" is meaningless at 3,000 m of an endless run. *Fixed: the offer speaks
in metres when there is no finish line.*

### 6. ✅ The poster typography did not exist on Android
The display stack was Impact, Haettenschweiler, Arial Narrow — none of which ship on Android,
so on the platform most installs will come from, the title, score, HUD and every headline fell
back to Roboto. The entire poster identity degraded on exactly the devices the ads will reach,
and in the clips people record on them. *Fixed: an 18 kB OFL latin subset of Anton is bundled
(licence in `src/assets/`), inlined into the CSS so the single-file standalone build stays
self-contained.*

### 7. ✅ No favicon, and the manifest icons did not ship
The web build 404'd on `/favicon.ico`, and `public/manifest.webmanifest` pointed at
`../icons/…` — outside `public/`, so the icons were never copied into `dist` and every entry
was mistyped as `image/png` for a `.webp` file. The web page *is* the share-link landing
experience. *Fixed: a favicon in the game's own art, real shipped icons, correct types, and
the manifest and touch icon linked from `index.html`.*

---

## Retention — all five addressed

### A. ✅ The tutorial replayed on every single run — the biggest friction in the game
`OPENING_LENGTH = 290` at ~34 u/s is roughly **eight seconds of scripted, hazard-free lesson
at the start of every run, forever** — every retry, every daily, every Free Run, captions
included. The lesson itself is excellent (teaching the first hazard as a meal is the best
decision in the onboarding). But the "one more go" loop is measured in seconds: a player on
their fifteenth run was spending a quarter of a 30-second run in a classroom they graduated
from days ago.

*Fixed: once the save shows three runs played or a level cleared — the same threshold the menu
uses to offer the campaign — Free Run opens on a 90-unit warm-up with the captions off.
Levels, dailies and shared links always keep the full lesson, because a shared course must
build identically on every device and a first-timer arriving from a link still needs teaching.
`tutorial_completed` only fires for the real lesson, so the funnel metric stays honest.*

### B. ✅ A genuine beginner could not buy anything in session one
The naive playtest banked 111 scrap from a 31-second first run against a cheapest upgrade of
1,200 — five to ten runs to the first purchase, most likely in a session that never happens.
The first purchase is where the meta hooks.

*Fixed: the first Coil pip is an intro price of 400, and new saves open with a one-off starter
contract (swallow 8 mines, +600) sized to finish in two ordinary runs and never redrawn.
`test/onboarding.test.ts` plays the measured beginner run by run: the first purchase now lands
on run two.*

### C. ✅ The daily had no streak
Nothing accumulated across days — miss one, lose nothing, notice nothing.

*Fixed: consecutive days climb a streak the menu button leads with, and when it is one day
from lapsing the button says so and takes the dashed rule. The first daily of a day pays 250 ×
streak, capped at seven days. Replaying today cannot pay twice. No server needed.
`test/streak.test.ts` covers month, year and leap-day boundaries, gaps, replays and the
at-risk window.*

### D. ✅ Beating your own record deserved a set piece
It changed a small label and a bar style — the emotional peak of the endless mode, and its
most clippable five seconds, passing almost silently.

*Fixed: the previous best is printed across the track as a dashed finishing rule you watch
approach for ten seconds and break through, and crossing it gets the Press treatment — shove,
freeze, ink slam, "NEW RECORD" across the drone, ascending fanfare. The rule stays drawn
behind you as a marker of how far past your best you are.*

### E. ✅ The interstitial could collide with the best rewarded placement
`endRun` fired `maybeShowInterstitial` the instant the results appeared — on the same sheet
offering "Double it". A player reaching for the rewarded bonus could get an interstitial
first: two ads back to back, the cheaper one teaching them to resent the sheet.

*Fixed: when the double is live, the interstitial is skipped and logged with the named reason
`rewarded_offered`.*

### F. Smaller notes
- ✅ **Haptics** — absorb, hit, Press crash, record and flip, following the sound toggle, all
  fire-and-forget. `WorldEvents.onHit` now names which kind of hit it was.
- ✅ **Workshop from results was one-way** — Back went to the menu, losing the sheet and the
  Share and Double buttons a player had not used yet. It now returns to the sheet.
- ✅ **`RunSummary` field-name landmine** — `settleContracts` received banked scrap in a field
  called `score` while `levelPassed` received raw score. Correct for the contracts that
  existed, a trap for the next one. There is now an explicit `banked` field.
- ✅ **Endless progress bar pinned at 100%** on a first run past the 400 m default, reading as
  "done" in a mode that never is. Fixed with the first-run record handling.
- ⬜ **The results sheet is a lot of reading** — eleven small-caps rows after a 30-second run.
  The itemised credits are right and should stay; the sheet still competes with Run Again for
  attention. Worth testing lead-with-four-numbers against the full table.
- ⬜ **Music restarts from zero on every resume/revive** rather than resuming where it left
  off. Minor, but pause fires on every notification.

---

## What is genuinely working — keep it

- **The colour rule is a real mechanic**, not a skin. "The same object is food or death
  depending on who you are" produces real decisions at speed, and the one-solid-colour wall
  rule is what stops it collapsing into dodge-the-gap.
- **The art direction is distinctive and survives screenshots** — the whole ballgame for
  organic distribution. Clips of this will not look like every other hyper-casual game.
- **The Press is a proper climax.** Gambling the haul and never the run is the right call and
  the measured numbers back it.
- **The teaching sequence teaches by consequence**, not text.
- **The meta pulls one direction**: one currency, itemised credits, the next goal named with
  the gap, editions and seals money cannot buy, frontier-only level rewards so nothing farms.
- **The engineering discipline is unusual**: property-based feel tests, autopilot-verified
  level reachability, deterministic seeds making dailies and share links free, economy shape
  asserted in tests, persistence proven in a real browser.
- **The ad posture is right**: outcomes first, rewards on the SDK event, hard pacing gates,
  named block reasons.

## Balance readings from actual play

Random naive play survived 31 s and 1,398 m in Free Run, scoring 1,110 with a 14% pickup rate
— a first-timer will not bounce off the difficulty, and the one Press they meet is survivable.
Random play failed Level 1, which is correct: levels should ask for intent. The balance
harness after all changes is unmoved — naive 50% clear, skilled 100%, +888% skill lift.

## Still open

**The thing that matters most: nobody has played this on a phone.** Thumb latency, the audio
mix through a handset speaker, thermal frame rate over a ten-minute session, and whether the
14 px tap-versus-drag threshold misfires under a real thumb are all unanswered. That, plus
watching three humans play their first three runs, is worth more than any further tuning
against bots.

Production gaps are unchanged and tracked in `PRODUCTION.md`: no `PRIVACY_POLICY_URL` (the
console warns on every boot), `SHARE_BASE_URL` empty so sharing falls back to typed codes, and
ads running against test inventory. The ordering there is right — the static web page first,
since it unblocks the share links the growth strategy depends on.
