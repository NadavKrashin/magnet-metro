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
npm run test         # sim, magnet, hazard, level, endless, opening, tour, ending,
                     # mastery, economy, onboarding, streak, record, anti-camping
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
| **Levels** | The main mode. Four worlds, twenty-four courses, one named objective each |
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

**Your record is a physical line.** The previous best is printed across the track as a dashed
finishing rule, so you watch it approach for ten seconds and break through it — and crossing
it gets the same treatment as swallowing a Press: shove, freeze, ink slam, and an ascending
fanfare. It was previously a small label change, which is a poor way to mark the one moment
the whole mode is played for, and the poorest possible clip. On a first-ever run there is no
record, so the HUD reads plain distance rather than claiming a record from the first metre.

## The campaign

Levels answer the question the endless run cannot: *what am I supposed to do next.*

It is deliberately **not** the first thing on the menu. A first-time player who has never seen
the colour rule work cannot evaluate a numbered objective, so the menu leads with Free Run —
the one mode with nothing to fail — and keeps Levels at the bottom in body type. Once the save
shows three runs played or a level already cleared, the button picks up a dashed rule and reads
*"Want it harder? Level N of 24"*. The offer moves, not the button; the campaign is never
hidden, just held back until it means something.

**Four worlds, six levels each.** A world is the same generator run differently rather than a
separate content pipeline — which costs a handful of numbers instead of a new authoring tool,
and keeps every world benefiting from any tuning done to the core.

| World | Character |
|---|---|
| **Proof Sheet** | The baseline. Clearable with nothing bought. |
| **Night Shift** | 16% faster. Same layouts, far less time to read them. |
| **Overprint** | Patterns crowd together, hazards start earlier and thicker. |
| **Final Edition** | Fast, dense, and Presses arrive mid-course as well as at the end. |

**Eight objective kinds**, rotated so no world is six of the same request: reach the end,
score, swallow, pull in, hold a chain, finish clean, swallow the Press, and finish on a budget
of colour changes. Each is a single condition on purpose — a compound goal is hard to show in
a HUD, and a player who fails one cannot tell which half they missed.

### Rewards you cannot buy

Scrap already buys every upgrade. If it also bought the cosmetics there would be nothing the
campaign alone could give, and no reason to finish a world once the levels stopped paying well.
So two things are campaign-only:

- **Editions** — five palette swaps, each awarded by a specific level. The Workshop's editions
  tab is a display case, not a shop: locked ones name the level that grants them.
- **Seals** — one per world, for clearing all six of its levels. They appear on the results
  sheet and cannot be earned any other way.

### Three marks per level

Twenty-four levels is not much content, and once cleared each one had nothing left to ask for.
Making a replayed level bank no scrap sharpened that — it removed the only remaining reason to
open one again. So every level carries **three marks** instead of a pass/fail tick, which turns
twenty-four courses into seventy-two goals without authoring a single new course:

1. **Cleared** — the level's own objective.
2. **Clean** — cleared without losing a cell.
3. **Perfect** — cleared, clean, and never on the wrong colour at a gate or the Press.

The grades are deliberately **universal rather than per-level**. Twenty-four tightened targets
would be twenty-four more hand-tuned numbers to keep reachable, and this table has already had
to be re-tuned twice — once when colour gates landed and once when the closing Press stopped
stacking. A rule with no numbers in it cannot go stale, and `test/mastery.test.ts` asserts that
every one of the eight objective kinds can reach every mark on a single perfect run.

The third mark is the one worth chasing, and it grades the thesis directly. Gates and the Press
cost no cells, so a run can be spotless by the `hits` measure while having got every
un-dodgeable wall on the course wrong — which is exactly the run this game says was played
badly. "You were the right colour every single time" is what playing it well actually means.

Marks pay **no scrap**. The economy is already tuned, and seals and editions have always been
the axis money cannot touch; this belongs with them. Mastery is settled on every attempt,
including replays and failures, and only ever goes up. A save written before marks existed
starts them all at zero — nothing in it records whether those old clears were clean, and
awarding marks nobody earned would devalue the whole thing.

### The campaign ignores the workshop

**Every level is flown on a stock drone**, whatever has been bought. A level is a fixed course
with a named target, so letting upgrades carry it turns a skill test into a spending test: two
players clearing level 17 would not have done the same thing, and a player stuck on one would
be told, in effect, to go and grind rather than to get better. Clearing a level means the same
thing for everyone.

Upgrades still matter — they are what push a Free Run further, which is the mode with no
ceiling and the only score worth compounding. **The campaign is the skill ladder; the shop
powers the endless chase.** The Levels screen says so, because a level that got no easier after
buying a wider coil otherwise reads as a bug.

Four targets came down when this landed — 16, 17, 18 and 23 had been tuned against an upgraded
drone and were unreachable without one.

`test/levels.test.ts` plays every level **under its own world's modifiers** with the autopilot
and requires all twenty-four to clear on a stock drone. It also asserts the rule itself: a
fully upgraded save still flies stock in the campaign, and still gets its upgrades everywhere
else. It has caught seven impossible targets and two trivial ones so far.

## The colour rule

> **Your colour comes to you and is good. The other colour stays away and hurts you.**

One rule, and every object on screen obeys it:

| | Your colour | The other colour |
|---|---|---|
| **Scrap** | pulled in, collected | pushed away, *cannot* be collected at all |
| **Hazards** | pulled in, eaten for points | inert, and it costs you a life |
| **Gates and the Press** | swallowed whole | no gap to steer through; costs the multiplier and part of the haul |

The second row is what makes the mechanic worth playing. A wall of red mines is not an
obstacle to thread — it is a meal, if you are red when you reach it. Walls therefore spawn in
a single colour, because a mixed wall can only ever be dodged and would collapse the decision
back into "find the gap".

An earlier version had colour affect only the *strength of the magnetic pull*, with nothing
gated on it: you could barge into any colour and collect it, and every hazard hurt regardless.
Colour was decorative, and the first player said so immediately.

## How the rules are taught

The first 290 units of a course are a scripted, hazard-free lesson. Nothing can kill the
player until it is over, so the only thing available to learn is the rule.

**It stops once it has worked.** Eight seconds of classroom at the head of every run is right
for someone who has never seen the colour rule and is the single biggest drag on the "one more
go" loop for someone who graduated days ago. Once the save shows three runs played or a level
cleared — the same threshold the menu uses to offer the campaign — Free Run opens on a 90-unit
warm-up with the captions off instead. Levels, dailies and shared links always keep the full
lesson: a shared course has to build identically on every device regardless of who opens it,
and a first-timer arriving from a link still needs teaching. `test/opening.test.ts` pins both
halves.

For Switch it runs in four beats: your own colour comes to you; then a wall of the other
colour that steering cannot solve, which is the moment the tap is introduced; then a field of
red mines encountered while the player is *already* red, so their first meeting with a hazard
is one they eat; then both colours at once, which turns the tap into a choice. The mine field
still has a gap, so a player who has not understood yet survives anyway.

### The vocabulary is taught separately from the rule

Teaching by consequence covers the rule and nothing else. It cannot teach a player what the
big number is called, that the number is *also* the currency, that the pips are lives, or that
the ring around the drone is the thing doing the collecting. **Scrap, cells and magnet are not
self-explanatory words**, and a player who never learns them cannot read the results sheet,
the workshop or a contract — which is most of the reason to open the game again tomorrow.

So a first run also carries a six-beat guided tour (`src/game/coach.ts`). Each beat freezes the
run, draws a hard keyline around one real piece of the interface, and names it: the drone and
its magnet, scrap, the multiplier, the charge indicator, the cells, the progress bar. It is
skippable on every beat, it runs once, and it can be replayed from Settings.

Two things make it a tour rather than a manual. It is spread across the whole 290-unit lesson
rather than stacked at the start, and **every beat is positioned against what the course is
about to do**: the charge indicator is named just before the wall that forces a tap, and the
cells just before the first hazard, so each explanation is paid off within a second or two.

The distances are measured against the generator, not read off `openingLesson`. Course
generation starts sixty units ahead of the drone, so each branch of the lesson lands about
sixty units further down the track than the number in its condition — which is how the first
version ended up pointing at a score that still read `0` while calling it "the metal your
magnet pulls in". `test/coach.test.ts` re-derives the first collectable, the first
opposite-colour wall and the first hazard by flying the course, so the tour cannot drift out of
step with a change to the opening.

The permanent version of the same thing is **How to play**, on the menu: the whole rule in five
lines, then every term the interface uses — scrap, multiplier, cells, magnet, charge, the bar,
mines, gates, the Press, the workshop, contracts, editions, seals, the three modes and course
codes. The tour is what a new player gets whether they want it or not, so it stays at six
cards; the glossary is where the rest lives, for anyone who goes looking.

Nothing here dims the screen. A press cannot print translucent ink and the rest of this
interface is built on that, so the tour points with a keyline and an offset shadow instead of a
grey wash — and it does not need one, because the simulation is frozen while a card is up.

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

From `npm run balance` — two bots across 48 seeds. The naive bot sweeps blindly and ignores
hazards; the skilled bot targets scrap and dodges. The gap between them is skill expression.

| Mechanic | Naive clear | Skilled clear | Skilled hits | Skill lift |
|---|---|---|---|---|
| **Switch** *(shipping)* | 40% | 100% | 0.3 | +1318% |

Read these as directional, not final. The naive bot never avoids anything, so real first-run
completion sits above the naive figure.

**The harness runs 48 seeds because twelve was not enough to make a decision on.** Colour
gates read as taking naive clear from 50% to 25% on twelve courses — an alarming number that
would have justified pulling the feature. A controlled comparison across forty seeds, gates on
versus off with the bot's own randomness held fixed, put the real effect at two points
(45% → 43%) with hits identical to two decimal places. A headline number that moves in
eight-point steps cannot answer a question like that.

Naive clear sat at 75% before the courses were tightened. Deliberately crowding the patterns
first took it to **zero**, which is the same failure as making the Press lethal — a difficulty
change that reads as reasonable in the code can be brutal in play. Dialled back, with skilled
play still clearing every course without a scratch.

That gap between naive and skilled is the whole shape this genre needs: forgiving to somebody
tapping blindly, enormously generous to somebody reading the course. The remaining honest step
is human play, not another round of tuning against a robot.

## Colour gates, and why one colour is not a strategy

The obvious exploit in a game whose only verb is "change colour" is to never use it. It was
never tested, so it was measured: a bot that picks one colour, eats the hazards that happen to
match, and steers around everything else **finished 100% of courses, never died, and banked
46% of what switching banked**. Every wall in the game had a gap, wrong-colour hazards are
inert, and the Press — the one thing with no gap — deliberately costs no lives. Nothing on the
course ever required the tap.

A **gate** is one full-width row of a single colour with no gap, from mid-difficulty onward,
alternating colour each time so a camper cannot ride one colour through two of them. Match it
and you swallow the row. Miss it and you lose the multiplier and a quarter of the tail.

**Never a cell.** That is the whole design, and it is asserted in `test/hazard.test.ts`.
Making the Press lethal once took naive completion from 50% to zero; the fix for camping had
to be frequency, not lethality. A camper now meets a gate every few seconds and pays in the
currency the score actually runs on, while a beginner who does the same thing dies no more
often than before.

| | before gates | after |
|---|---|---|
| Switching is worth, ordinary course | 2.2× | **2.5×** |
| Switching is worth, endless | 1.7× | **2.7×** |
| Switching is worth, hardest world | 2.3× | **3.0×** |
| Campaign levels a camper can clear | all 24 | **7** — walled at level 8 |

Measured across 48 seeds. An earlier 24-seed run read 4.6× on the endless figure; widening the
sample brought all three modes into a tight 2.5–3.0× band, which says that number was a lucky
draw rather than the design's real value. **The score ratio was never the main deterrent
anyway** — the campaign wall is. A camper stops at level 8 for good, since levels unlock in
order: seven of twenty-four, one world of four, one edition of five.

Gates are off in **Proof Sheet**: an un-dodgeable wall is the right pressure on somebody who
understands the tap and the wrong one on somebody still working out what it does.

`test/camper.ts` plays the strongest version of the exploit rather than a strawman, prints the
table above, and asserts the properties — including that camping stays survivable, since a
change that makes camping *deadly* rather than *unrewarding* is the failure mode to avoid.

### Reward and damage must not look alike

They did. Both slammed the page with a full-screen `multiply` pass — and since you can only
eat your own colour, eating a red wall flashed the screen *red*, exactly as being hit by one
did. The best moment in the game and the worst were the same image, and both **darkened** the
page. A play test said so in one line: "hitting my colour looks kinda the same as hitting the
spikes."

They now move in opposite directions:

- **A swallow is a bloom struck at the drone** — a blown-out white core ringed in the ink just
  swallowed, fading outward, plus a light lift across the rest of the page. Nothing else in the
  game is round, bright and centred on the player.
- **Damage is the key plate** — red and then heavy black, flat across the whole frame. Measured
  at 18% of pixels driven below a quarter brightness.

**A lethal mark is reserved for the one lethal thing.** Every non-edible hazard used to be
drawn as solid black spikes — mines, colour gates and the Press alike. But a gate and the Press
cost the multiplier and a share of the haul and *never* a cell, so the picture said "this takes
a life" over something that cannot. A player flying through a spiked wall and losing nothing had
every reason to call it a bug, and did, three times; each time the rule was explained when the
drawing was the thing at fault. Mismatched walls are now a barred slab — flat, hard-edged, no
points, and wide enough that a gate's nine blocks close into one continuous barrier, which is a
truer picture of an un-dodgeable row than nine separate objects. Spikes now mean exactly one
thing.

**A matching hazard is drawn as an open ring**, not a disc — a play test could not tell solid
edible hazards apart from large scrap, and misreading one as the other is the difference
between eating a wall and flinching away from it. The colour plate has to be the loudest thing
in that mark, because it is what says "food, *and* it is the colour you currently are". It was
a thin stroke between two key rings, and a later report asked whether the rings "are supposed
to be with no colours". They are not: Riot's teal sits 0.32 from its own black in plain RGB
distance and Nightshift's aubergine 0.26, so on those two editions three concentric rings
resolved into one grey object. The colour stroke is now roughly twice as heavy and the inner
key ring is gone — it added black *inside* the colour and carried nothing the outer trap does
not. That is 55% more colour ink against 32% less key, and the colour-to-key ratio goes from
2.1 to 4.8.

A full-page *paper* flash was tried for the reward first and measured almost nothing: the stock
is already near-white, so printing paper over it moved mean luminance six points while a hit
moved it eighty-seven. On a light page you cannot brighten your way to emphasis — you have to
go local and saturated instead.

Swallows in quick succession build rather than repeat: a gate is nine blocks and a Press
thirty-six, and each one used to be an identical capped thump. A streak counter escalates the
shake, the particle count, the size of the number that floats up, the note, and the haptic. It
deliberately does **not** escalate the hit-stop — nine freezes through one wall is judder, not
punch, and each frozen frame is course the player does not cover, which measurably cost score
when it was tried.

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

### One wall, not four

The closing branch of the generator had no latch, so it emitted a Press for **every** slot in
the 150-unit closing zone. A Press consumes 50 units, so four identical walls stacked at
roughly 1370, 1420, 1470 and 1521 — all the same colour, because the polarity is fixed on the
first one.

That broke the ending in two directions at once, and both were reported from play. Matching
them was around a hundred free swallows in the last four seconds, which quietly decided every
swallow objective before the course had started: level 5 asked for fourteen while the ending
alone handed over twenty-four. And the fourth wall began past the 1500-unit finish line, so it
was drawn on screen and could never be reached — the results sheet arrived over a wall the
player was still looking at.

The fix is a latch: one wall, and an empty run-out behind it. It costs no RNG draw, so every
seeded course still builds identically — but the ending now pays about eight swallows instead
of a hundred, and five level targets came down to match what the autopilot actually reaches.
`test/ending.test.ts` pins the wall to four rows of nine, entirely inside the course, with
nothing generated past the line.

A bounded settle window at the finish was built alongside this, to hold the run open while the
last blocks were drawn in. Measured across all twenty-four levels it never held for a single
frame — with one wall the swallow has already resolved by the line — so it was removed rather
than kept as insurance. It also reordered the win and loss checks, which changes what counts
as a cleared course, and that is not a change worth making for a mechanism with nothing to
show for itself.

## Coming back tomorrow

**Today's Run** is one course per calendar day, identical for everyone, seeded from the UTC
date. Determinism was built into the course generator from the first commit precisely so this
would cost nothing later: no server, no level data to distribute.

**Streaks** are what make the daily worth protecting. Playing on consecutive days climbs a
counter that the menu button leads with, and when it is one day from lapsing the button says
so and picks up the dashed rule. The first daily of a day pays 250 × the streak, capped at
seven days, so an unbroken habit is worth having and a two-month streak never out-earns
playing well. Replaying today's course cannot pay twice. It needs no server: the save already
knows what day it last played. `test/streak.test.ts` covers the arithmetic that is wrong in
silence — month, year and leap-day boundaries, gaps, replays, and the at-risk window.

**Contracts** are three rotating objectives that ask for a specific behaviour — swallow
forty-five mines, finish three courses clean, hold a chain of sixty in three runs. They pay in
the same scrap the shop spends, so they feed the existing loop rather than introducing a second
currency. A new save opens with a one-off **starter** contract sized to finish in two ordinary
runs, which is never drawn again.

**Every standing contract takes several runs**, and that was not always true. Three of them had
a target of 1 — one clean course, one run with a chain of sixty, one run pulling in 140 — and
paid 3,000 to 5,000 each. Three are active at a time and an ordinary course satisfies all
three, so a "contract" was really a per-run bonus of eight to twelve thousand that refilled and
paid again immediately. Measured, six levels paid **57,435 against a 240,406 shop** — a quarter
of everything for sale, in six runs — and 39,600 of that was contracts against 12,635 of actual
run haul. A play report put it in one line: five levels, fifty thousand scrap, enough to buy
most of the store.

Targets are now multi-run and rewards are around one good run's haul rather than five. The same
six levels pay 25,235, and `test/economy.test.ts` asserts the properties rather than the
numbers: no standing contract can be finished in a single run, none pays more than a good run,
and three landing at once is under 5% of the shop.

## Progression: workshop, upgrades, editions

**Replaying a cleared level pays nothing.** The level *bonus* was frontier-only from the start,
on the stated grounds that the easiest level cannot be farmed for scrap — but the run's own
haul was banked unconditionally, so the rule was not true. Level 1 takes about thirty seconds
and banks a little over two thousand: the whole shop in a couple of hours of replaying the
first course in the game. The rewarded "double it" offer follows the same rule, since doubling
a share of zero is not an offer worth making.

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

**The first pip of Coil is an intro price of 400.** A measured naive first run banks 111
scrap, so the standing 1,200 put the first purchase five to ten runs away — most likely in a
second session that never happens. The first purchase is where the meta actually hooks: the
run stops being a score and starts making you permanently stronger. It has to land while they
are still holding the phone, and with the starter contract it now lands on run two. The curve
past that first pip is untouched, so the long tail is unchanged.

The results sheet always names the next concrete thing and the gap to it — "1,400 more scrap
unlocks Coil 3". "Come back tomorrow" is not a reason to return; a named, close, specific
purchase is. It will not point a first-timer at the campaign while the menu is still
deliberately holding it back.

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
- **Type** is Anton, an 18 kB OFL latin subset bundled with the game, falling back to Impact.
  Impact covers iOS and desktop but Android ships no condensed classic, so the masthead and
  every headline were quietly becoming Roboto on the platform most installs will come from —
  the entire poster identity degrading on exactly the devices the ads will reach.

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

### Swallowing had to stop sounding like damage

A play test reported that eating your own colour "still sounds and feels like a hit", and both
halves of that were true for the same two reasons.

**The contour was wrong.** The swallow was a tone sweeping *down* to 42 Hz under a noise burst
sweeping down from 1800 to 180 — which is, note for note, the shape of the damage sound sitting
next to it in the same file. Descending pitch under descending noise is the universal
vocabulary for being hurt, so the best moment in the game was announcing itself in the language
of the worst one.

**And a wall is not one block.** It fired once per block, so a Press was up to thirty-six
overlapping 0.42-second low sweeps: not an impact but a sustained roar. The haptics were worse
— a Medium impact per block, and past a run of four the *press-crash* buzz, so the payoff
reached the thumb as thirty-six pulses of the pattern that means damage.

Each block is now a short bright note climbing through the run, the same ladder the collection
blips use, resolving on one chord when the wall is finished. The hand gets a light tap rate
limited to 90 ms — closer than that and a haptic motor cannot strike and settle, so the beats
smear into one long buzz — and an ascending two-beat roll at the end, which is the one thing in
the vocabulary a single heavy thud can never be mistaken for.

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
test/            simulation, magnet, hazard, level-reachability, opening, guided tour,
                 onboarding, streak, record, camping, economy, balance harness
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
| Post-results | Interstitial | Only once the results sheet is on screen, pacing allows, **and the rewarded bonus is not being offered** |

Both rewarded placements are offered **after the outcome is already known**, so they add to a
result rather than withholding one, and the reward is granted on the SDK's completion event
rather than on dismissal. Interstitials are gated hard: never before a player's fourth
lifetime run, never within 180s of launch, 120s apart, five a session.

The last gate is the one worth explaining. A results sheet offering "Double it" used to fire
an interstitial the instant it appeared, so a player reaching for the rewarded bonus could be
served an interstitial first and watch two ads back to back — the cheaper one teaching them to
resent the sheet the better one lives on. The rewarded placement pays more and buys goodwill
instead of spending it, so it wins; the skipped impression is logged with a named reason like
every other one.

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
