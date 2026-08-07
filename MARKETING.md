# Getting people to play it

## Start here, in this order

At a budget under $10,000, paid acquisition cannot pay for itself: you would spend roughly as
much per install as an install returns, so buying users is a **measurement tool**, not a
growth engine. Everything below is ordered by return per pound spent, and the first three
cost nothing but time.

1. **Store listing** — the only asset every other channel funnels into. Do this first.
2. **Short vertical video, posted organically** — TikTok, Reels, Shorts. Free, and the only
   realistic path to volume at this budget.
3. **Communities** — post the web build, not a store link, in places that welcome it.
4. **Creator seeding** — send the course-code challenge to small creators.
5. **A small paid test, last** — $200–500, purely to learn your real CPI before deciding
   whether scaling is even possible.

## Producing the assets

```bash
npm run capture   # gameplay video + store screenshots at every required size
npm run icons     # app icon and splash, regenerated from the game's own art
```

`npm run capture` runs the game in demo mode — the autopilot plays, the interface furniture
hides itself — and records:

- `marketing/gameplay-1080x1920.webm` — vertical gameplay, the aspect every feed wants
- `marketing/shot-*-play.png` — mid-run screenshots at iOS 6.7", iOS 6.5" and Android sizes
- `marketing/shot-*-menu.png` — the menu, where the print identity reads most clearly

Capturing the canvas directly beats filming a phone: no glare, no moiré, consistent framing,
and you can iterate creative in minutes instead of re-shooting. Pass `--seconds 30` for longer
footage.

**The MP4 is produced for you.** Playwright records WebM; every feed and store wants H.264, so
`npm run capture` now converts automatically when it can find `ffmpeg` (on `PATH`, or the copy
Python's `imageio-ffmpeg` ships). You get both:

- `marketing/gameplay-1080x1920.mp4` — H.264, `yuv420p`, faststart, **silent**
- `marketing/gameplay-1080x1920.webm` — the original recording

If no `ffmpeg` is found, the script prints the one-line command instead of failing.

**1080×1920 is the right size for TikTok, Reels, Shorts and Play's promo video.** App Store
app previews have their own accepted dimensions per device class — check the current
requirement in App Store Connect and resize that one export if it differs; everything else can
use this file as-is.

**Add music in an editor.** The game's audio is synthesised live in WebAudio and is not
captured, so the export is deliberately silent rather than accidentally so.

## Store listing copy

Ready to paste. Character limits respected.

**App name** (30): `Magnet Metro`

**Subtitle / short description** (30 / 80):
- iOS subtitle: `Eat your colour. Dodge theirs.`
- Play short description: `One tap changes your colour. Your colour feeds you — the other one kills you.`

**Description:**

```
You are a magnet. You are either blue or red. One tap changes which.

Everything the same colour as you flies into your tail and makes you bigger.
Everything the other colour bounces off — and hurts.

So a wall of red mines isn't an obstacle. It's a meal. If you're red when you
reach it.

Every course ends at the Press: a solid wall, one colour, no gap. Match it and
you swallow the whole thing. Get it wrong and you lose most of what you were
carrying.

- One thumb. Drag to steer, tap to change colour.
- Runs last about thirty seconds.
- Spend what you haul on a wider magnet, a tougher hull, a faster multiplier.
- Unlock print editions that re-ink the entire game.
- One course a day, the same for everyone. Share the code and race a friend.

No timers. No lives to wait for. Play offline.
```

**Keywords** (iOS, 100 chars, comma-separated, no spaces):
`magnet,colour,color,switch,arcade,one tap,endless,runner,reflex,dodge,combo,offline,quick,daily`

**Screenshot captions** — burn these into the images in any editor, one per shot:
1. "Your colour comes to you"
2. "The other colour hurts"
3. "Match the wall. Eat the wall."
4. "Spend the haul"
5. "Same course for everyone, every day"

## Ad concepts, grounded in what the game actually does

Every one of these is filmable from the real build. Do not advertise anything the game does
not do — misleading creative is a store violation, it produces refunds and one-star reviews,
and it wrecks the retention numbers you need to make any decision from.

**1. Wrong Colour** *(the strongest hook — lead with this)*

| Time | What is on screen | Caption |
|---|---|---|
| 0–2s | Blue drone flying straight at a wall of red mines | "DON'T" |
| 2–4s | Crash. Tail scatters. | — |
| 4–7s | Replay. One tap. Drone turns red. | "wait—" |
| 7–11s | It eats the entire wall, tail explodes in size | "OH" |
| 11–14s | Score climbing, install prompt | "Magnet Metro" |

The whole idea in eleven seconds, and the reversal is the thing people share.

**2. The Press.** Hold on the closing wall for a full two seconds so the viewer has time to
think "there's no gap" — then match it and swallow the lot. Works because the tension is
legible without any explanation.

**3. Tail timelapse.** Speed-ramp a whole run: start tiny, end dragging an enormous serpent.
Caption: "30 seconds". Pure "number goes up" satisfaction, no rules to teach.

**4. The look.** Slow pan across the print artwork with the halftone and misregistration
visible. Caption: "a game that looks like a screenprint". Aimed at design-interested people
rather than gamers, and it reaches an audience no gameplay ad will.

**5. Beat my course.** A creator plays today's course and posts their score with the link. The
deterministic seed means viewers open it and land in the *exact same course* — that turns a
view into a challenge, which is the only kind of share that converts.

For this to work, set `SHARE_BASE_URL` in `src/analytics/config.ts` to wherever the web build
is hosted. Sharing then produces a tappable link that opens straight into the course. Left
empty, sharing falls back to a raw code the recipient has to type in by hand, and nobody types
a code.

## Where to post, specifically

**Organic video.** Post the same clip to TikTok, Reels and Shorts. Three to five posts a week
beats one polished one. Vary only the first two seconds — that is where nearly all of the
drop-off happens. Reply to every comment for the first hour; it materially affects reach.

**Communities that welcome a playable link.** r/WebGames, r/IndieGaming, r/playmygame,
r/incremental_games, plus indie game Discords and Hacker News's Show HN. Lead with the **web
build**, not a store link — a link people can click and play in three seconds converts far
better than an install request, and the whole game is a 60 kB page.

**Creator seeding.** Small creators (10k–100k followers) in the mobile-game and satisfying-
video niches. Offer the course-code challenge rather than a flat sponsorship: it gives them
something to make a video *about*.

**Paid, only once the above is running.** Start with $200–300 on TikTok or Google App
Campaigns in a cheap market to learn your actual CPI. If it comes back far above what an
install returns, that is your answer and it cost you $300 to get it.

## What to watch

| Metric | Where | What it tells you |
|---|---|---|
| 2-second hold rate | TikTok/Reels analytics | Whether the hook works. Fix the first two seconds before anything else. |
| Store page conversion | Store console | Whether the screenshots and subtitle carry it |
| D1 retention | Your analytics | Whether the game is worth promoting at all |
| Share taps per run | `share_opened` event | Whether organic growth is actually possible |

**D1 retention is the gate.** If it is below about 25%, stop making ads and fix the game —
promotion multiplies whatever is already there, including nothing. Every event named above is
already being emitted; wiring a collector is one sink in
`src/analytics/analytics.ts`.
