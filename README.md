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

## The three candidates

All three share the same course generator, scoring, art, and run length. The only variable
is what the thumb does, which is what makes their scores comparable.

| Mechanic | Control | The decision it creates |
|---|---|---|
| **Polarity** | Drag to steer, tap to flip red/blue | Read the next cluster's colour early enough to arrive on the right charge. Holding the wrong charge drags same-charge hazards onto you. |
| **Tether** | No steering at all; hold to be pulled toward a pylon, release to slingshot | Pure timing. Routing is the whole game. |
| **Overload** | Drag to steer, hold to charge, release to pulse | Charging collapses your magnet, so you are defenceless while winding up. "Do I have time before that wall?" |

## Current balance readings

From `npm run balance` — two bots across 12 seeds. The naive bot sweeps blindly and ignores
hazards; the skilled bot targets scrap and dodges. The gap between them is skill expression.

| Mechanic | Naive clear | Skilled clear | Skilled pickup | Skill lift |
|---|---|---|---|---|
| Polarity | 17% | 100% | 53% | +1063% |
| Tether | 17% | 50% | 25% | +87% |
| Overload | 8% | 100% | 68% | +1963% |

Read these as directional, not final. The naive bot is worse than a real first-time player
because it never avoids anything, so true first-run completion sits somewhere above these
numbers. The comparison *between* mechanics is the useful part, and there Tether is clearly
the weakest: two very different play policies produce nearly the same result, which means the
mechanic is not responding much to the player.

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
