# Magnet Metro

A one-thumb arcade game for iOS and Android.

## What the game is about

> **The same object is either food or death, depending on who you are right now.**

A wall of red mines is a meal if you are red and a catastrophe if you are blue, and you decide
which by tapping. You are not dodging the world — you are becoming the thing that can eat it.

That thesis was not in the original design document; it emerged from fixing the colour system,
and it is what makes the game distinctive. The document's "salvage drone rebuilds a ruined
city" premise is vestigial and has been dropped: it was a theme bolted onto a mechanic that
turned out to be about something else.

**The player's goal is to get enormous.** The tail is not decoration — it is the visible
embodiment of everything swallowed, and it is what a clip of this game shows. Since organic
distribution is the whole strategy at this budget, the thing that grows has to be the thing
you see.

Everything below serves that thesis. Anything that does not is a candidate for cutting.

## Running it

```bash
npm install
npm run dev          # dev server; open the printed network URL on a phone
npm run test         # simulation, magnet, hazard, level, endless and economy checks
npm run balance      # difficulty and skill-expression report across 12 seeds
npm run standalone   # one self-contained HTML file in dist/standalone.html (94 kB)
npm run verify       # build, prove progress persists, screenshot, report frame time
npm run capture      # gameplay video + store screenshots at every required size
npm run icons        # regenerate app icon and splash from the game's own art
npm run ios          # sync and open Xcode
npm run android      # sync and open Android Studio
```

### The other documents

| File | What is in it |
|---|---|
| `PRODUCTION.md` | Everything still standing between this and a live, earning app |
| `MONETISATION.md` | Ad placements, pacing, consent order, and how to go live |
| `ANALYTICS.md` | What is measured and the five questions worth asking of it |
| `MARKETING.md` | Store copy, ad concepts, where to post |
| `BUILDING.md` | Device builds, signing, release |

## The control scheme

Drag to steer, tap to change colour. That is the whole input.

**Tether and Overload are parked** in `src/mechanics/`, still working and still measured by
the balance harness, but out of the game. Both were cut for the same reason: neither touches
colour, so neither is the game this became. Overload also measured far too easy — 96% pickup
for a skilled player against a skill lift a quarter of Switch's — and a play test said so
independently. Two modes also means every balance change has to be made twice, for a mode
nobody preferred.

## Three ways to play

| Mode | What it is |
|---|---|
| **Levels** | Twelve fixed courses, one named objective each, unlocked in order, paying scrap and print editions |
| **Today's Run** | One course per calendar day, identical for everyone |
| **Free Run** | Endless. No finish line, difficulty climbs forever, and the only goal is to beat your own distance |

Sharing a run produces a **link**, not a code. Opening it drops the player straight into that
exact course — deterministic generation means the same seed builds an identical course on
every device, which is what turns a shared score into a challenge rather than a boast. Manual
code entry survives in Settings as a fallback for anyone who was sent a code rather than a
link. Set `SHARE_BASE_URL` in `src/analytics/config.ts` to wherever the web build is hosted.

**Free Run never ends.** Difficulty keeps climbing past where a bounded course would have
finished, Presses recur on a rhythm as milestones rather than as an ending, and the progress
bar measures the run against the player's own record instead of a finish line. Speed is capped
so a long run stays reactable rather than becoming a slideshow.

Levels answer the question the endless run cannot: *what am I supposed to do next.* Objectives
are single conditions on purpose — a compound goal is harder to show in a HUD than it is
worth, and a player who fails one cannot tell which half they missed.

`test/levels.test.ts` plays every level with the autopilot on both a stock and a fully
upgraded drone. The first five must be clearable with no upgrades; later ones may require
them, because that is what makes the shop matter. It has already caught three impossible
targets and two trivial ones.

## The colour rule

> **Your colour comes to you and is good. The other colour stays away and hurts you.**

One rule, and every object on screen obeys it:

| | Your colour | The other colour |
|---|---|---|
| **Scrap** | pulled in, collected | pushed away, *cannot* be collected at all |
| **Hazards** | pulled in, eaten for points | inert, and it costs you a life |

The second row is what makes the mechanic worth playing. A wall of red mines is not an
obstacle to thread — it is a meal, if you are red when you reach it. Walls therefore spawn in
a single colour, because a mixed wall can only ever be dodged and would collapse the decision
back into "find the gap".

An earlier version had colour affect only the *strength of the magnetic pull*, with nothing
gated on it: you could barge into any colour and collect it, and every hazard hurt regardless.
Colour was decorative, and the first player said so immediately.

## How the rules are taught

The first ~210 units of every course are a scripted, hazard-free lesson. Nothing can kill the
player until it is over, so the only thing available to learn is the rule.

For Switch it runs in four beats: your own colour comes to you; then a wall of the other
colour that steering cannot solve, which is the moment the tap is introduced; then a field of
red mines encountered while the player is *already* red, so their first meeting with a hazard
is one they eat; then both colours at once, which turns the tap into a choice. The mine field
still has a gap, so a player who has not understood yet survives anyway.

Three rules make this legible, and they were all corrections after the first play test:

1. **Colour means exactly one thing** — which colour a piece is. Value is carried by size.
   Earlier, gold meant "valuable" while red and blue meant "charge", so one visual channel
   was carrying two unrelated rules.
2. **Shape backs up colour** — blue is a circle, red is a diamond, and the drone wears the
   shape of whatever it currently collects. This survives colour blindness and video
   compression, which is where most people will first see the game.
3. **Your colour is printed solid; the other colour is an unprinted outline** — bare paper.
   "Will this come to me?" is answerable at a glance instead of by recalling a rule, and it
   is a far stronger read than bright-versus-dim.

The mechanic is deliberately not framed as magnetism. Real magnets attract their opposite, so
calling it polarity primed players with a rule that is the reverse of what the game does.

## Current balance readings

From `npm run balance` — two bots across 12 seeds. The naive bot sweeps blindly and ignores
hazards; the skilled bot targets scrap and dodges. The gap between them is skill expression.

| Mechanic | Naive clear | Skilled clear | Skilled hits | Skill lift |
|---|---|---|---|---|
| **Switch** *(shipping)* | 50% | 100% | 0.0 | +888% |

Read these as directional, not final. The naive bot never avoids anything, so real first-run
completion sits above the naive figure.

Naive clear sat at 75% before the courses were tightened. Deliberately crowding the patterns
first took it to **zero**, which is the same failure as making the Press lethal — a difficulty
change that reads as reasonable in the code can be brutal in play. Dialled back to 50%, with
skilled play still clearing every course without a scratch.

That gap between naive and skilled is the whole shape this genre needs: forgiving to somebody
tapping blindly, enormously generous to somebody reading the course. The remaining honest step
is human play, not another round of tuning against a robot.

## The Press

Every course ends against a solid wall of one colour, four rows deep with no gap, telegraphed
about three seconds ahead. Match it and you swallow the entire structure — by far the biggest
payoff in the game, and the five seconds anyone would actually clip. Get it wrong and it costs
you nearly half of everything you were carrying.

Crucially it **gambles the haul, never the run**. The first version cost lives and dropped
naive first-run completion from 50% to zero. Rebuilt to cost only the chain, it *raised* it to
75% while lifting skilled scores from 18,700 to 24,500 — beginners always reach the ending,
experts get an enormous swing. A course that simply stops at a distance marker has no shape;
this gives every run a climax.

## Coming back tomorrow

**Today's Run** is one course per calendar day, identical for everyone, seeded from the UTC
date. Determinism was built into the course generator from the first commit precisely so this
would cost nothing later: no server, no level data to distribute.

**Contracts** are three rotating objectives that ask for a specific behaviour — swallow thirty
mines, finish without losing a cell, hold a chain of sixty. They pay in the same scrap the
shop spends, so they feed the existing loop rather than introducing a second currency.

## Progression: workshop, upgrades, editions

Everything scored in a run is banked as scrap and spent in the workshop. The point is to give
a 30-second run consequences that outlive it — a run that only produces a number is finished
the moment it ends.

Five upgrade tracks, all chosen because they are **felt in play** rather than read on a
screen. A player should be able to notice the last thing they bought:

| Upgrade | Effect |
|---|---|
| **Coil** | Widens the magnet, 22 to 37 reach |
| **Hull** | Up to three extra cells before the drone breaks up |
| **Servos** | Sharper steering response |
| **Capacitor** | The multiplier steps on fewer pieces |
| **Claw** | Everything collected is worth more |

**Editions** are the cosmetic layer: a full palette swap of stock and both inks. They fit the
art direction far better than costumes would, and they are the cheapest possible cosmetic to
build while still visibly changing the entire game. Each pair separates on hue *and* on
lightness, so the colour rule stays readable at speed no matter which is equipped.

The results sheet always names the next concrete thing and the gap to it — "1,400 more scrap
unlocks Coil 3". "Come back tomorrow" is not a reason to return; a named, close, specific
purchase is.

## Reading the screen

Three silhouettes, and nothing shares one:

| Shape | Meaning |
|---|---|
| Solid disc or diamond | Ordinary scrap. Your colour is filled, the other colour is an unprinted outline |
| Open ring | A hazard **in your colour** — swallow it |
| Black spiked star | A hazard in the other colour — it will cost you a cell |
| Rosette | High-value scrap |

This was rebuilt after a play test reported taking damage from a matching-colour hazard. The
rules turned out to be correct — `test/hazard.test.ts` now enforces that a matching hazard is
always absorbed and never damages — so the fault was purely that a large scrap disc, an edible
hazard and the drone itself were all "a big circle with a hole in it". Being right in the
simulation is worthless if the screen says otherwise.

## Economy

Score and currency are deliberately on different scales. A score climbing in thousands is
exciting to watch; a currency climbing in thousands empties the shop in an afternoon. A tenth
of a run's score is banked as spendable scrap, against a full shop costing about 287,000 — so
the first few upgrades land quickly and owning everything is on the order of a hundred runs.

Endless runs bank on a **diminishing curve** past 25,000. Their length is unbounded while the
shop's price is fixed, so a flat rate made distance a printing press: a maxed drone banked
31,750 from one endless run, which is nine runs to own the entire shop. Score itself stays
uncapped — that is the record being chased. `test/economy.test.ts` asserts the shape rather
than the numbers, so tuning cannot quietly reintroduce the hole.

## The magnet was broken for four commits

Worth recording, because every other test passed the whole time.

Colour, collection and scoring all worked, so scores went up and the sim tests were green. But
the pull itself was far too weak and its radius far too small: measured against a stationary
drone, scrap closed at **3 units/second while the drone flew past at 34–65**. Relative to the
player nothing moved. There was no perceptible magnet in a game named after one — players were
simply colliding with things.

`npm run test` now includes `test/magnet.test.ts`, which asserts the property rather than the
numbers: a piece inside the field must close **faster than the drone travels forward**, and the
wrong colour must be visibly pushed away. Any future tuning that quietly breaks the feel fails
the build.

## Art direction: two-colour screenprint

The game is drawn as ink on paper, not light on black. That one decision drives everything:
there is no glow anywhere, because ink does not emit. Emphasis comes from solid ink against
bare paper, a heavy black key plate, and overprint where the two inks cross.

- **Stock** is warm uncoated paper, with a grain tile blended over the whole page.
- **Two inks only** — a deep printed blue and a hot vermilion — laid down with `multiply`
  blending, so overlapping pieces darken into a third colour the way real overprint does.
- **Everything misregisters** by a fraction of a line weight. Perfectly aligned plates read as
  vector clip art; a hair of offset reads as something physically printed.
- **Knockouts**, not highlights: holes are made by printing the paper colour back over ink.
- **Speed is hatching**, not blur — irregular marks crowding the edges of the frame, which is
  how a printed page has always conveyed motion.
- **Type** is Impact, the closest thing to a poster-weight condensed face that is present on
  effectively every device without shipping a webfont.

The interface follows the same rules: flat ink, hard keylines, square corners, and solid
offset shadows standing in for a second pass slightly out of register.

## Sound

Entirely synthesised in WebAudio at runtime, so it adds nothing to the download and there is
nothing to load before the first run.

The music is not a loop playing underneath the game — tempo, layers and filter brightness are
driven by the player's combo. Hats enter once they have something going, and the lead only
arrives on a strong combo, so the soundtrack builds as they build and thins out when they get
hit. Collection blips climb a pentatonic ladder as the combo rises. That coupling between
performance and score is most of why an arcade game feels exciting.

## Performance

The print look is composite-heavy, so it was profiled rather than assumed. Frame time in a
software renderer went from 131 ms to 34 ms through three changes:

1. Paper grain moved from a full-screen canvas `multiply` fill every frame to a static CSS
   overlay the compositor blends once.
2. The stock, shaded margins, lane rules and registration marks are baked into an offscreen
   sheet at resize and blitted, since none of them move.
3. Device pixel ratio capped at 2.

`node scripts/shoot.mjs` renders the built game in a headless phone-sized browser, plays it
with a scripted thumb, reports frame time, and fails on any runtime error. It catches the
class of bug unit tests never see: a canvas call that throws, a missing element, a composite
mode that silently blanks the page.

## Where progress is stored

All of it lives in one place: `src/game/storage.ts`, under five keys.

| Key | Holds |
|---|---|
| `mm_save_v2` | Scrap, lifetime scrap, upgrades, owned and equipped editions, **levels completed**, daily best, contracts |
| `mm_runs_v1` | The last 200 run records |
| `mm_muted_v1` | Sound preference |
| `mm_session_v1`, `mm_first_open_v1` | Session counters for analytics |

On device this writes through to **Capacitor Preferences** — NSUserDefaults on iOS,
SharedPreferences on Android. On the web it uses `localStorage`, which is all there is.

That distinction matters more than it looks. A WKWebView's `localStorage` is the *least*
durable store an iOS app has: the system may evict it when the device is short on space, and
"Offload App" clears it outright. A player losing twelve levels and a maxed workshop to an OS
housekeeping pass would be an unrecoverable bug they could never explain, and it would look
like the game had simply forgotten them.

The Preferences API is async while the game's save and load calls are synchronous, so every
key is hydrated into an in-memory cache once at boot, before any save object is constructed.
Reads come from the cache; writes update it immediately and the durable store in the
background. Anyone who played an older build is migrated on first launch, because hydrate
falls back to `localStorage` and writes anything it finds there through to Preferences.

`node scripts/persist-check.mjs` proves the round trip in a real browser: it writes a save,
reloads, and asserts the scrap, the level progress and the equipped edition all come back.
Getting the boot order wrong here fails silently and severely — the game would build a blank
save before the real one loaded — so it is not something to verify by reading the code.

**Still device-local.** There is no account and no cloud sync: reinstalling, or moving to a new
phone, starts from zero. See the note in the roadmap below before adding purchases.

## Architecture

Simulation is kept separate from presentation so a run can be replayed from a seed and scored
without a canvas. That is what the headless tests and the balance harness rely on, and it is
also the prerequisite for shareable challenge codes and ghost races later.

```
src/core/        loop, input, seeded RNG, math      (no DOM, no rendering)
src/game/        world simulation, course generation, progression, storage, autopilot
src/mechanics/   the control scheme, plus two parked candidates
src/render/      canvas renderer, print palette, paper texture
src/audio/       synthesised music and effects
src/ads/         AdMob, consent, ATT, pacing
src/analytics/   event taxonomy and sinks
test/            simulation, magnet, hazard, level-reachability, balance harness
scripts/         single-file build, screenshots, marketing capture, icons
```

Zero runtime dependencies for the game itself: no engine, no framework, no sprite atlas. The
only shipped packages are the Capacitor plugins, and they do nothing on the web build.

Course generation is fully deterministic from a seed, so the same code always builds the same
course on every device.

## Advertising

Three placements, none of them during play. Detail and the go-live steps are in
`MONETISATION.md`.

| Placement | Format | When |
|---|---|---|
| **Continue** | Rewarded, opt-in | After the drone is destroyed, past 35% of the course, once per run |
| **Double it** | Rewarded, opt-in | On the results sheet, after the scrap is already banked |
| Post-results | Interstitial | Only once the results sheet is on screen, and only if pacing allows |

Both rewarded placements are offered **after the outcome is already known**, so they add to a
result rather than withholding one, and the reward is granted on the SDK's completion event
rather than on dismissal. Interstitials are gated hard: never before a player's fourth
lifetime run, never within 180s of launch, 120s apart, five a session.

Everything currently runs against Google's test inventory, which always fills and earns
nothing. Consent, App Tracking Transparency and SDK start-up happen in the order the platforms
require — getting that wrong is a store rejection rather than a bug.

## Measurement

Every event fires already; only a destination is missing, and it is one line in
`src/analytics/config.ts`. `ANALYTICS.md` covers the five questions worth asking.

The two that matter most: `run_end` carries `progressBand`, so a histogram of where runs
actually stop *is* the difficulty curve — and `level_attempt` carries the attempt number, so
the level where attempts climb and clears do not follow is the level people quit on.

Players are joined by an anonymous device-generated install id that identifies nothing about
the person and dies on uninstall.

## What is left

`PRODUCTION.md` has the full ordered list. The short version: accounts and a privacy policy
URL, real AdMob unit IDs, an analytics destination, a signing key, and real-device testing.
Everything that can be built without your credentials is built.

Known gaps, stated plainly: there is no cloud save, so reinstalling starts from zero; there is
one interstitial placement, so ad revenue leans on the two rewarded spots; and frame time has
only ever been measured under software rendering with no GPU, so a real phone is still an open
question.

## A note on the business case

The original plan for this game assumed paid user acquisition at roughly $0.25–$2.25 per
install against ~$0.75 of revenue per install. That model needs a UA budget in the hundreds of
thousands to matter. At a budget under $10,000, paid acquisition is a measurement tool rather
than a growth engine, so distribution has to come from organic sources: store optimisation,
creator seeding, and clips people want to share. That changes what the game is optimised for —
share rate and day-one retention ahead of ad load — and it is the reason the shareable
challenge-code system is in the core rather than deferred to a later phase.
