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
npm run dev          # local dev server, open the printed network URL on a phone
npm run test         # headless simulation checks (determinism, termination)
npm run balance      # difficulty and skill-expression report across 12 seeds
npm run standalone   # single self-contained HTML file in dist/standalone.html
```

## The candidates

Both share the same course generator, scoring, art, and run length. The only variable is what
the thumb does, which is what makes their scores comparable.

| Mechanic | Control | The decision it creates |
|---|---|---|
| **Switch** | Drag to steer, tap to change colour | Read the next cluster's colour early enough to arrive as the right colour. Being the wrong colour near a hazard drags that hazard onto you. |
| **Overload** | Drag to steer, hold to charge, release to pulse | Charging collapses your magnet, so you are defenceless while winding up. "Do I have time before that wall?" |

**Tether is parked** in `src/mechanics/tether.ts`, still working but out of the lineup. The
balance harness showed it barely responds to skill (+87% from a good bot, against +1000% for
the others) and the first player could not tell what it wanted from them. Two independent
signals agreeing was enough to stop spending time on it.

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
| Switch | 50% | 100% | 0.3 | +1560% |
| Overload | 17% | 100% | 0.4 | +1819% |
| Tether *(parked)* | 33% | 25% | 2.8 | +54% |

Naive clear rate jumped from 8% to 50% for Switch when colour became a real rule, because a
blindly tapping player now eats walls by accident about half the time. That is the mechanic
being forgiving to a beginner and generous to an expert at the same time, which is the shape
this genre needs.

Overload's naive rate is the current outlier and is worth watching. Its blind bot holds and
releases on a fixed cycle, which with a collapsed field collects almost nothing — a
worst-case that flatters the mechanic far less than a real beginner would manage. It still
wants a look once there is human data.

Read these as directional, not final. The naive bot is worse than a real first-time player
because it never avoids anything, so true first-run completion sits somewhere above these
numbers. The comparison *between* mechanics is the useful part.

The naive clear rate is the number to watch. The genre wants roughly 80% of players finishing
their first run, and the bots are nowhere near that. Some of that gap is the bot being far
worse than a person, but not all of it, and the honest next step is human play rather than
another round of tuning against a robot.

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

## Architecture

Simulation is kept separate from presentation so a run can be replayed from a seed and scored
without a canvas. That is what the headless tests and the balance harness rely on, and it is
also the prerequisite for shareable challenge codes and ghost races later.

```
src/core/       loop, input, seeded RNG, math    (no DOM, no rendering)
src/game/       world simulation and course generation
src/mechanics/  the three candidate control schemes
src/render/     canvas renderer
test/           headless simulation checks and the balance harness
```

Course generation is fully deterministic from a seed, so the same code always builds the same
course on every device.

## Status and what is not here yet

Built: core loop, three mechanics, course generation, scoring, chain physics, effects, the
comparison harness, single-file build.

Not built: the city restoration metagame, ad SDK integration, in-app purchases, the Capacitor
native wrap, cloud save, analytics, consent handling, and store assets. Those follow once a
mechanic is chosen — building them against three candidate cores would be three times the work
for the same result.

## A note on the business case

The original plan for this game assumed paid user acquisition at roughly $0.25–$2.25 per
install against ~$0.75 of revenue per install. That model needs a UA budget in the hundreds of
thousands to matter. At a budget under $10,000, paid acquisition is a measurement tool rather
than a growth engine, so distribution has to come from organic sources: store optimisation,
creator seeding, and clips people want to share. That changes what the game is optimised for —
share rate and day-one retention ahead of ad load — and it is the reason the shareable
challenge-code system is in the core rather than deferred to a later phase.
