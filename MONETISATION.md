# Ads, privacy, and going live

Everything described here is wired and running against **Google's test ad inventory**. Test
units always fill, cost nothing, and cannot get an account suspended, which is what you want
until there is a real AdMob account to point at.

## What is already working

| Placement | Format | When it appears |
|---|---|---|
| **Continue** | Rewarded | Only after the drone is destroyed, past 35% of the course, once per run |
| **Double it** | Rewarded | On the results sheet, after the score is already banked |
| Post-results | Interstitial | Only once the results are on screen, and only if pacing allows |

Both rewarded placements are strictly opt-in and offered **after the outcome is already
known**, so they add to a result rather than withholding one. The reward is granted on the
SDK's `Rewarded` event, never on dismissal — someone who backs out early has not watched it,
and paying them anyway teaches everyone to skip.

The continue clears hazards ahead of the player as well as behind. Dropping someone back onto
the exact wall that just killed them makes the reward worthless and earns one-star reviews.

### Interstitial pacing

Set in `src/ads/config.ts`, and deliberately conservative:

- Never before the player's **4th lifetime run**
- Never within **180 seconds** of app launch
- Minimum **120 seconds** between two
- Maximum **5 per session**
- Never mid-run — only after the results sheet is already visible

Google Play prohibits unexpected full-screen ads, ads before content, and full-screen video
before a loading screen. These caps sit well inside that, because at this budget the growth
strategy is organic and a one-star review costs more than an impression earns. Treat them as
starting hypotheses to test against retention, not as fixed truths.

Blocked impressions are logged with a named reason (`new_player`, `too_soon`, `session_cap`,
`not_loaded`), so lost inventory is analysable rather than invisible.

## Going live — the exact steps

1. **Create an AdMob account** and register two apps (Android and iOS).
2. **Create four ad units**: rewarded and interstitial, for each platform.
3. Paste the unit IDs into `REAL` in `src/ads/config.ts`, then set `LIVE = true`.
4. Replace the **app IDs** in the two native files. Both currently hold Google's test app ID:
   - `android/app/src/main/AndroidManifest.xml` → `com.google.android.gms.ads.APPLICATION_ID`
   - `ios/App/App/Info.plist` → `GADApplicationIdentifier`
   - The Android app crashes on launch if this value is missing or malformed.
5. **Publish `app-ads.txt`** on the domain listed in your store entries, and add that domain in
   both consoles. Without it a large share of programmatic demand will not bid.
6. Run `npm run sync`, then build and test **on a real device**. Ad rendering, the consent
   form, and the ATT prompt cannot be verified in a simulator or in this repository's
   screenshot harness.

Serving live ads against test IDs earns nothing; serving test ads against live IDs risks the
account. The `LIVE` flag exists so that swap is one deliberate edit.

## Privacy — these are store gates, not nice-to-haves

The initialisation order in `src/ads/ads.ts` is not stylistic. It is what the platforms
require, and getting it wrong is a rejection rather than a bug:

1. **Consent first.** Google's UMP form is requested and shown *before* the ad SDK
   initialises, because initialising is itself processing under GDPR.
2. **Then App Tracking Transparency** on iOS. Without permission the IDFA returns zeros. The
   prompt is requested after the consent form so the player has context, and the game stays
   fully playable if they decline.
3. **Only then** does AdMob start and preload.

A **Privacy choices** button appears in the Workshop whenever the region requires one, so the
decision stays revisitable. Reviewers look for this.

### Still required before either store will accept the app

- **A privacy policy at a public URL.** Required by Apple, by Google Play, and by AdMob
  independently. It must name the ad SDK and the data it collects.
- **Play Data Safety** declarations and **Apple privacy nutrition labels**, both listing what
  the AdMob SDK collects — not only what your own code collects.
- **Store listing**: description, screenshots, feature graphic, content rating questionnaire.
- The **`NSUserTrackingUsageDescription`** string in `Info.plist` is written but worth
  rewording in your own voice; Apple rejects vague ones.
- **SKAdNetwork identifiers**: only Google's primary ID is listed. Add the full set for
  whichever networks you end up serving, or iOS attribution will under-report.

## Not built yet, and deliberately so

- **Mediation.** One network is the right call until there is enough traffic for a second to
  compete for. Adding AppLovin MAX or AdMob Mediation before that adds operational weight for
  no revenue.
- **An attribution SDK** (AppsFlyer, Adjust, Singular). Only worth its integration cost once
  paid acquisition is running, which at this budget it is not.
- **In-app purchases**, including a "remove forced ads" option. Worth adding once retention
  justifies it; a player who buys it should keep access to the *rewarded* placements and lose
  only the interstitials.
- **Banners.** Not recommended here. The game is a full-bleed portrait canvas and a banner
  would either cover play or squash it.

## Analytics

`src/analytics/analytics.ts` defines the event taxonomy and a pluggable sink. Nothing talks to
a vendor yet — the point is that instrumentation exists with **stable names** from the start,
so wiring Firebase or a collector later means adding one sink rather than retrofitting call
sites. Runs, consent state, ATT result, every ad offer and outcome, and every currency source
and sink are already emitted.

Two rules worth keeping: never repurpose an event name, and always carry the placement on ad
events so revenue attaches to a spot in the game rather than to a format in aggregate.

## Promotion

- **App icon and splash** are generated from the game's own art by `node scripts/icon.mjs`,
  then expanded to every platform size with `npx capacitor-assets generate`. The mark is the
  game's rule in one image: a blue circle and a red diamond overprinting where they cross.
- **Share run** on the results sheet posts the score together with the course code. Because
  course generation is deterministic, the recipient can play the *exact same course* — that
  turns a boast into a challenge, which is the only kind of share that converts.

The uncomfortable arithmetic is worth restating: at a budget under $10,000, paid acquisition
cannot pay for itself here. Ad revenue per install of roughly a dollar against install costs
of a similar order means bought installs are a measurement tool, not a growth engine. The
share button and the daily course are the distribution strategy. Everything in the ad
configuration above is tuned on that assumption — protecting retention and share rate ahead of
squeezing another impression.
