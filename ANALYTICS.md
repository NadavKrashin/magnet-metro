# Learning from real players

## Turning it on

Nothing is sent anywhere until you choose a destination in `src/analytics/config.ts`. The game
emits every event either way; without a sink they simply have nowhere to land.

**Recommended: Firebase Analytics.** Free, unlimited events, no server, and it computes
retention cohorts and funnels for you in a console — which is the actual question you are
asking. A raw event log does not answer it without a lot more work.

```bash
npm install @capacitor-firebase/analytics firebase
```

Then create a Firebase project, add `google-services.json` (Android) and
`GoogleService-Info.plist` (iOS) to the native projects, set `USE_FIREBASE = true`, and
`npm run sync`.

**Or own the raw data.** Set `ANALYTICS_ENDPOINT` to any HTTPS URL that accepts a JSON POST —
a Cloudflare Worker, a Google Apps Script writing to a spreadsheet, a small server. Events are
batched and sent with `sendBeacon`, so a batch still leaves the device when the player swipes
the app away, which is exactly when the most interesting event — the one where they gave up —
would otherwise be lost.

Both can run at once.

### What identifies a player

A random, device-generated `installId`, stored with the save. It is tied to nothing about the
person and disappears on uninstall. It exists so events from one install can be joined into a
session and a retention curve, which is impossible otherwise, without collecting anything
identifying. Declare it in your privacy policy and your Data Safety form.

---

## The five questions worth answering

Everything below is already instrumented. These are the questions to actually ask of it, in
the order they matter.

### 1. Do people survive the first thirty seconds?

`first_open` → `run_start` → `tutorial_completed` → `run_end`

If `tutorial_completed` is much lower than `run_start`, people are quitting **during the
teaching sequence**, which means the rule is not landing and nothing else you change matters.
This is the single most important funnel in the game.

### 2. Where do runs actually end?

`run_end` carries `progressBand` — where the run stopped, in ten-percent bands. Plot it as a
histogram and you have the drop-off curve.

- A spike at one band is a difficulty spike at a specific point in the course.
- A spike at 90% means **the Press is too punishing**, and it is worth reconsidering that it
  costs haul rather than lives.
- A flat distribution means difficulty is well spread.

Averages hide all of this. The histogram is the point.

### 3. Which level do people give up on?

`level_attempt` carries `level` and `attempt`. The level where the attempt number climbs and
`level_cleared` never follows is your wall.

This is the highest-value single number in the whole game for retention, because a wall is
both the most likely reason someone stops playing and the easiest thing to fix — the targets
live in one array in `src/game/progression.ts`, and `npm run test` re-verifies that every
level stays clearable after you change one.

### 4. Do they come back?

`session_start` carries `sessionNumber`. Day-one retention is the gate for everything in
`MARKETING.md`: below roughly 25%, stop promoting and fix the game, because promotion
multiplies whatever is already there.

Also watch whether players who reach the Workshop retain better than those who never open it.
If they do, the shop is doing its job and getting people there sooner is worth building. If
they do not, the shop is decoration.

### 5. Is the advertising costing more than it earns?

Every ad event carries its placement, so revenue attaches to a spot in the game rather than to
a format in aggregate:

- `rewarded_offered` → `rewarded_offer_accepted` → `rewarded_completed` gives opt-in and
  completion rates per placement.
- `interstitial_eligible` carries `shown` and a named `reason` when it was suppressed
  (`new_player`, `too_soon`, `session_cap`, `not_loaded`), so blocked inventory is analysable
  rather than invisible.
- Compare `session_start` counts for players who saw an interstitial against those who did
  not. If the ones who saw ads come back less, the ad load is costing more than it earns, and
  the caps in `src/ads/config.ts` should come down.

---

## Every event

| Event | Key properties |
|---|---|
| `first_open`, `session_start` | `sessionNumber` |
| `run_start` | `seed`, `daily`, `level`, `lifetimeRuns` |
| `run_end` | `won`, `score`, `absorbed`, `hits`, `duration`, `progressPct`, `progressBand`, `level`, `revived` |
| `run_paused` | `reason` (`button` or `background`) |
| `run_quit` | `progressPct`, `score` |
| `tutorial_completed`, `first_run_completed` | — |
| `level_attempt`, `level_cleared` | `level`, `attempt` / `attempts` |
| `currency_earned`, `currency_spent` | `amount`, `source` / `sink` |
| `upgrade_bought`, `edition_bought` | `id`, `level` |
| `contract_completed` | `detail` |
| `share_opened`, `challenge_opened` | `score`, `seed` |
| `consent_state_updated`, `att_prompt` | `status` / `result` |
| `rewarded_offered`, `rewarded_offer_accepted`, `rewarded_completed`, `rewarded_abandoned` | `placement` |
| `interstitial_eligible` | `shown`, `reason` |
| `ad_impression` | `format` |
| `progress_reset` | `levelsDone` |

Two rules that matter more than they look:

- **Never repurpose an event name.** A renamed meaning silently corrupts every historical
  comparison, and the corruption is invisible until a decision gets made on it.
- **Never add anything identifying.** No emails, no device IDs beyond the anonymous install
  id, no precise location. Everything above is behavioural, which is what makes the privacy
  disclosures simple and honest.

## Before you read any of it

A hundred installs will not tell you anything. Retention numbers need a few hundred players
per cohort before the difference between 22% and 28% means something rather than being noise,
and it is very easy to redesign a game around fifty people who happened to arrive on a
Tuesday. Until then, watching five people play in the same room will teach you more than the
dashboard will — every real improvement this project has had came from exactly that.
