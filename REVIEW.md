# Play review — pre-release, full pass

A top-to-bottom review of Magnet Metro as it stands one step before production. The game was
built, its test suite run (all green), and then actually played in a headless phone-sized
browser: a naive first session, three warm-up runs, a level attempt, a daily run, the
workshop, settings, the share flow, and the autopilot demo. Frame rate measured 60 fps in a
software renderer.

The short version: the core is genuinely good — distinctive art, a real mechanic with depth,
and a meta that mostly pulls in the right direction. But there are two bugs in the flagship
endless mode and the ad flow, and three retention frictions that directly work against the
stated goal of "users don't stop after one go". All of them are cheap to fix relative to what
they cost.

---

## Bugs found (fix before release)

### 1. "Double it" corrupts the results sheet on every bounded run
`src/main.ts:465-471` — after a rewarded double, the handler updates the *last* row of the
stats table, assuming it is "Total in the bank". For endless runs it is. For **every bounded
run** (daily, levels, shared courses) the last row is "Course reached", so the ad reward
overwrites the completion percentage with the bank total, and the real bank row goes stale —
the exact "bank doesn't match the sheet" confusion the itemised credits were built to kill,
now triggered by the one player who watched an ad for you. Give the total cell an id and
update it by id.

### 2. Endless mode permanently shows the Press prompt after ~1,260 m
`src/mechanics/polarity.ts:95` — the prompt condition is
`pressPolarity !== 0 && y > COURSE_LENGTH - PRESS_ZONE - 90`. In Free Run, `pressPolarity`
becomes non-zero when the first Press spawns and stays non-zero forever, and `y > 1260` is
true for the rest of the run. So from ~1,260 m onward — in the headline mode, for the rest of
what may be a very long run — the HUD permanently shows "THE PRESS — EAT IT ALL" or the
*pulsing urgent* "THE PRESS — TAP TO MATCH IT", even when the nearest Press is 1,000 m away.
Presses are 1,150 m apart, so the instruction is wrong ~90% of the time, it pressures players
into pointless taps, and it turns the urgent style into noise. Gate it on actual distance to
`nextPressAt` (e.g. within ~120 units), not on course position.

### 3. "NEW RECORD" fires from the first metre of the first run
`src/main.ts:1062-1067` — with `endlessBest` at 0, `y > best` is true immediately, so a
brand-new player's very first run says NEW RECORD from metre one, and the results say
"Furthest you have ever been" about a number with no history. Records only mean something
against a past; on the first run show plain distance, and save the celebration for run two
onward. This matters because the endless record is the *only* score loop Free Run has.

### 4. Quitting a bounded run says "Drone destroyed"
`src/main.ts:758-762` — "Give up and bank it" on a daily or level run produces a results
sheet titled "Drone destroyed" with zero hits taken. The pause screen's whole framing is that
banking out is a respectable choice; the results sheet then calls it a destruction. Title a
voluntary quit "Banked early" or similar.

### 5. The revive offer talks percentages in a mode without a course
`src/main.ts:433` — in endless, "You are 100% through" (progress is clamped against the
1,500-unit course) is meaningless and slightly absurd at 3,000 m. Use distance for endless.

### 6. The poster typography does not exist on Android
`src/style.css:20`, `src/render/renderer.ts:478` — the display stack is Impact,
Haettenschweiler, Arial Narrow. None of those ship on Android, so on the platform most
installs will come from, the title, score, HUD and every headline silently fall back to
Roboto — the entire poster identity of the interface degrades on exactly the devices your ads
will reach. A subsetted condensed woff2 (Anton or Oswald bold, ~15–25 kB) protects the art
direction everywhere, including the clips people record on Android phones.

### 7. No favicon
The web build 404s on `/favicon.ico`. Trivial, but the web page *is* the share-link landing
experience, which PRODUCTION.md correctly calls the highest-leverage hour. Add the existing
icon art to `index.html`.

---

## Retention: the things that decide "one more go"

### A. The tutorial replays on every single run — the biggest friction in the game
`OPENING_LENGTH = 290` at ~34 u/s is roughly **eight seconds of scripted, hazard-free lesson
at the start of every run, forever** — every retry, every level, every daily, every Free Run,
complete with the same "YOUR COLOUR COMES TO YOU" captions. The lesson itself is excellent
(teaching the first hazard as a meal is genuinely clever). But the "one more go" loop this
genre lives on is measured in seconds: a player on their fifteenth run is spending a quarter
of a 30-second run in a classroom they graduated from days ago. Once the save shows the rule
is learned (say three runs, or `tutorial_completed`), compress the opening to a short neutral
warm-up with the prompts off. Keep the full lesson for Level 1 and for `?course=` arrivals
with a fresh save.

### B. A genuine beginner cannot buy anything in session one
The naive playtest banked 111 scrap from a 31-second first run; the cheapest upgrade is
Coil 1 at 1,200. That is five to ten runs before the first purchase — most likely session two
or three, if there is a session two. The first purchase is the moment the meta hooks in ("I
am now permanently stronger — again"), and right now nothing guarantees it happens on day
one. Two cheap options: price the first Coil pip at ~400 so it lands inside the first
session, or add one starter contract sized to complete in three naive runs ("Swallow 10 mines
— +1,500"). The results sheet already names the gap; make the first gap small enough to
close before the first goodbye.

### C. The daily has no streak
"Same course for everyone, once a day" is the right bones, but nothing accumulates across
days — miss a day, lose nothing, notice nothing. A local streak counter shown on the button
("Day 4") plus a streak line on the daily results sheet costs an afternoon and is the single
strongest comeback mechanic this genre has. No server needed; the save already tracks
`dailyDate`.

### D. Beating your own record deserves a set piece
Passing your previous best in Free Run currently changes a small label and a bar style. This
is the emotional peak of the endless mode and it's nearly silent. Two cheap amplifications:
draw the old record as a printed dashed line across the track so the player *sees it coming*
for ten seconds and crosses it physically; and fire the ink-slam + hitstop treatment (the
Press already proves it feels great) the moment they cross. The approach to your own record
is also the most shareable moment a clip can have.

### E. The interstitial can collide with your best rewarded placement
`endRun` fires `maybeShowInterstitial` the instant the results appear — on the same sheet
that is offering "Double it". A player intending to opt into a rewarded ad can get an
interstitial first: two ads back to back, and the cheaper one taught them to resent the
sheet. When the double button is live (`rewardedReady && score > 0`), suppress the
interstitial for that sheet; the rewarded pays more and buys goodwill instead of spending it.

### F. Smaller notes
- **No haptics.** `@capacitor/haptics` on absorb, hit and the Press is the cheapest juice
  on a phone, and this game's feel budget is exactly where it would show. One day of work.
- **The results sheet is a lot of reading.** Eleven small-caps rows after a 30-second run.
  The itemised credits are right (keep them), but consider leading with three or four numbers
  and folding the rest — the sheet is competing with the Run Again button for attention.
- **Workshop from results is one-way.** Back goes to the menu, so a player who checked
  prices loses the sheet — and with it the Share and Double buttons they hadn't used yet.
- **Endless progress bar pins at 100%** for the remainder of a first run past the 400 m
  default, which reads as "done" in a mode that never is.
- **`settleContracts` receives banked scrap as `score` while `levelPassed` receives raw
  score** (`src/main.ts:731`). Correct for today's contracts, but the same field name meaning
  two scales apart is a landmine for the next contract anyone writes. Rename or normalise.
- **Music restarts from zero on every resume/revive** rather than where it left off. Minor,
  but pause → resume is common (it fires on every notification).

---

## What is genuinely working — keep it

- **The colour rule is a real mechanic**, not a skin. "The same object is food or death
  depending on who you are" produces actual decisions at speed, and the one-solid-colour
  wall rule is what keeps it from collapsing into dodge-the-gap.
- **The art direction is distinctive and it survives screenshots** — which is the whole
  ballgame for organic distribution. The screenprint look, the misregistration, the tail as
  a braid of eaten things: clips of this will not look like every other hyper-casual game.
- **The Press is a proper climax.** Watching the autopilot chew through a four-row wall with
  the ink slam and +180s popping is the clip. Gambling the haul, never the run, is the right
  call and the measured numbers back it.
- **The teaching sequence teaches by consequence**, not text — the first hazard being eaten
  rather than dodged is the best single design decision in the onboarding.
- **The meta pulls one direction**: one currency, itemised credits, the next goal named with
  the gap, editions and seals that money can't buy, frontier-only level rewards so nothing
  farms. This is more coherent than most shipped games in the genre.
- **The engineering discipline is unusual**: property-based feel tests (the magnet test),
  autopilot-verified level reachability, deterministic seeds making dailies and share links
  free, economy shape asserted in tests, persistence proven in a real browser. All tests
  pass; 60 fps in a software renderer.
- **The ad posture is right**: outcomes first, rewards on the SDK event, hard pacing gates,
  named block reasons. Fix note E and this is a model implementation.

## Balance readings from actual play

Random naive play survived 31 s and 1,398 m in Free Run, scoring 1,110 with a 14% pickup rate
— a first-timer will not bounce off the difficulty, and the one Press they meet is survivable.
Random play failed Level 1, which is correct — levels should ask for intent. The README's
naive/skilled gap claim holds up in play.

## Production gaps (already known, confirmed live)

The console warning about the missing `PRIVACY_POLICY_URL` fires on boot; `SHARE_BASE_URL` is
empty so sharing falls back to type-a-code; ads run against test inventory. PRODUCTION.md's
ordering is right — the static web page first, since it unblocks the share links this game's
whole growth strategy depends on. The open question that cannot be answered in this
environment: **feel on a real phone** — thumb latency, audio mix, thermal frame rate. That,
plus watching three real humans play their first three runs, is worth more than any further
tuning against bots.
