# Magnet Metro

A one-thumb arcade salvage game for iOS and Android. This repository currently holds the
**mechanic test**: three candidate control schemes running on one shared game, so the core
interaction can be chosen on evidence before any of the metagame gets built.

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

## How the rules are taught

The first ~210 units of every course are a scripted, hazard-free lesson. Nothing can kill the
player until it is over, so the only thing available to learn is the rule.

For Switch, it runs in three beats: your own colour flies to you; then a wall of the other
colour that steering cannot solve, which is the moment the tap is introduced; then both
colours at once, which turns the tap into a choice.

Three rules make this legible, and they were all corrections after the first play test:

1. **Colour means exactly one thing** — which colour a piece is. Value is carried by size.
   Earlier, gold meant "valuable" while red and blue meant "charge", so one visual channel
   was carrying two unrelated rules.
2. **Shape backs up colour** — blue is a circle, red is a diamond, and the drone wears the
   shape of whatever it currently collects. This survives colour blindness and video
   compression, which is where most people will first see the game.
3. **Matching pieces are bright, mismatched pieces are dim and hollow.** "Will this come to
   me?" is answerable at a glance instead of by recalling a rule.

The mechanic is deliberately not framed as magnetism. Real magnets attract their opposite, so
calling it polarity primed players with a rule that is the reverse of what the game does.

## Current balance readings

From `npm run balance` — two bots across 12 seeds. The naive bot sweeps blindly and ignores
hazards; the skilled bot targets scrap and dodges. The gap between them is skill expression.

| Mechanic | Naive clear | Skilled clear | Skilled pickup | Skill lift |
|---|---|---|---|---|
| Switch | 8% | 100% | 51% | +1468% |
| Overload | 8% | 100% | 67% | +1408% |
| Tether *(parked)* | 17% | 33% | 23% | +60% |

Read these as directional, not final. The naive bot is worse than a real first-time player
because it never avoids anything, so true first-run completion sits somewhere above these
numbers. The comparison *between* mechanics is the useful part.

The naive clear rate is the number to watch. The genre wants roughly 80% of players finishing
their first run, and the bots are nowhere near that. Some of that gap is the bot being far
worse than a person, but not all of it, and the honest next step is human play rather than
another round of tuning against a robot.

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
