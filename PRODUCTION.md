# What you need to do

Everything still standing between this repository and a live, earning app.

Ordered so nothing blocks on something further down. Every item here needs your money, your
legal identity, your store accounts, or a real phone — which is why it is on your list rather
than already done.

---

## The single highest-leverage hour: put up a web page

Do this before anything else. One free static page — GitHub Pages is enough — unlocks **four**
separately blocked things at once:

- [ ] Host `dist/standalone.html` (94 kB, one file, no build step on the host)
- [ ] Publish your **privacy policy** there
- [ ] Publish **`app-ads.txt`** there
- [ ] Set `SHARE_BASE_URL` in `src/analytics/config.ts` so shared runs become tappable links

Without it: submissions get rejected, a large share of ad demand will not bid, sharing falls
back to codes people have to type, and you have nowhere to send the communities in
`MARKETING.md` — who convert far better on a link they can play in three seconds than on an
install request.

---

## Stage 1 — Accounts

**$124 up front, $99/year after.**

- [ ] **Apple Developer Program**, $99/year. Start this first: enrolment can take 24–48 hours
      and longer if they verify your identity. It is the only item with an unpredictable wait.
- [ ] **Google Play Console**, $25 once.
- [ ] **AdMob account** on the same Google account, with two apps registered inside it.
- [ ] **Firebase project**, if you want retention cohorts computed for you. Free.
- [ ] **Lock the bundle identifier.** Currently `com.magnetmetro.game` in
      `capacitor.config.ts`. It must be globally unique and **can never change after first
      release** on either store.

## Stage 2 — Legal

Hard gates. Submission is rejected without these, and AdMob will not serve.

- [ ] **Write and publish the privacy policy.** It must name the AdMob SDK, what it collects,
      and how to opt out. It must also mention the anonymous install id the analytics uses.
      Generators are acceptable at this size, but read what you publish.
- [ ] Paste the URL into `PRIVACY_POLICY_URL` in `src/ads/config.ts`. The in-app link stays
      hidden until you do, and the console warns on every launch.
- [ ] Enter the same URL in App Store Connect and the Play Console.
- [ ] **Play Data Safety** form and **Apple privacy nutrition labels**. Both must describe what
      the *AdMob SDK* collects — device identifiers, coarse location, usage data — not only
      your own code. Google publishes an AdMob disclosure guide; follow it.
- [ ] **Content rating** questionnaires in both consoles.
- [ ] Rewrite `NSUserTrackingUsageDescription` in `ios/App/App/Info.plist` in your own words.
      Apple rejects vague or boilerplate tracking strings.

## Stage 3 — Turn the ads on

Every placement currently runs on Google's test inventory: always fills, earns nothing. Detail
in `MONETISATION.md`.

- [ ] Create **four ad units**: rewarded and interstitial, for each platform.
- [ ] Paste them into `REAL` in `src/ads/config.ts`, then set `LIVE = true`.
- [ ] Replace the **two app IDs**, which hold Google's test values today:
      - `android/app/src/main/AndroidManifest.xml` → `com.google.android.gms.ads.APPLICATION_ID`
      - `ios/App/App/Info.plist` → `GADApplicationIdentifier`
      - **Android crashes on launch** if this is wrong or missing.
- [ ] Add the full **SKAdNetwork identifier list** to `Info.plist`. Only Google's primary ID is
      there, and iOS attribution under-reports without the rest.

## Stage 4 — Turn the measurement on

One line. Everything else exists. See `ANALYTICS.md`.

- [ ] Either `npm install @capacitor-firebase/analytics firebase`, drop
      `google-services.json` and `GoogleService-Info.plist` into the native projects, and set
      `USE_FIREBASE = true` — **or** set `ANALYTICS_ENDPOINT` to a URL you control. Both live
      in `src/analytics/config.ts`. You can run both.
- [ ] Confirm **D1 retention** is actually visible in whatever you pick. It is the gate for
      every decision in `MARKETING.md`.

## Stage 5 — Build, sign, and test on real phones

- [ ] `npm run sync`, then `npm run ios` / `npm run android`.
- [ ] **Generate the Android upload keystore** and put it in a password manager, outside this
      repository. Play accepts that key and no other; losing it means never updating the app
      again. Command is in `BUILDING.md`.
- [ ] Set the **iOS signing team** in Xcode.
- [ ] **Test on a real low-end Android phone.** Frame time is the one genuinely open technical
      question — everything measured so far has been software rendering with no GPU, which is
      not representative in either direction.
- [ ] **Verify on device**: the consent form appears in a GDPR region; the ATT prompt appears
      on iOS; a rewarded ad plays and actually pays out; an interstitial appears only after the
      results sheet; and the game is fully playable if you decline everything.
- [ ] Check progress survives **force-quit, reinstall-over, and an OS update**.
- [ ] Open a challenge link on a phone and confirm it lands in the right course.

## Stage 6 — Store listings

Copy, keywords and screenshot captions are written and ready to paste in `MARKETING.md`.

- [ ] `npm run capture` for screenshots at every required size. `npm run icons` only if you
      change the artwork.
- [ ] Convert the captured `.webm` to `.mp4` — one `ffmpeg` line, in `MARKETING.md` — and add
      music in an editor. The game's audio is synthesised live and is not captured.
- [ ] Upload copy, screenshots and a preview video to both stores.
- [ ] **TestFlight** and a **Play internal testing track**. Get it onto ten phones belonging to
      other people before going public.
- [ ] Submit. Expect Apple review in 24–48 hours and a rejection or two; Play is usually
      faster, but a new developer account's first review can take days.

## Stage 7 — Launch and measure

- [ ] Post the **web build** to the communities in `MARKETING.md` before store links exist.
- [ ] Start posting vertical clips. Three to five a week, varying only the first two seconds.
- [ ] Watch **D1 retention**. Below roughly 25%, stop promoting and fix the game — promotion
      multiplies whatever is already there, including nothing.
- [ ] Only once organic is running, spend **$200–300** on a paid test to learn your real CPI.

---

## Every switch you have to flip, in one place

| Setting | File | Currently |
|---|---|---|
| `PRIVACY_POLICY_URL` | `src/ads/config.ts` | empty — link hidden, console warns |
| `LIVE` | `src/ads/config.ts` | `false` — test ads, earning nothing |
| `REAL` ad unit IDs | `src/ads/config.ts` | empty |
| AdMob app ID (Android) | `android/.../AndroidManifest.xml` | Google's test ID |
| AdMob app ID (iOS) | `ios/App/App/Info.plist` | Google's test ID |
| `SHARE_BASE_URL` | `src/analytics/config.ts` | empty — sharing falls back to codes |
| `USE_FIREBASE` | `src/analytics/config.ts` | `false` |
| `ANALYTICS_ENDPOINT` | `src/analytics/config.ts` | empty |
| Bundle identifier | `capacitor.config.ts` | `com.magnetmetro.game` |

## Known gaps

Not blockers for a soft launch, but real, and better known than discovered:

- **No cloud save.** Progress is durable on-device via native Preferences, but reinstalling or
  changing phone starts from zero. Acceptable now; it stops being acceptable the moment you
  sell a "remove ads" purchase, because losing that is a refund request.
- **One interstitial placement.** Deliberate, but it means ad revenue leans almost entirely on
  the two rewarded spots until retention data justifies more.
- **Frame time unverified on real hardware.** 31–44 ms under software rendering with no GPU. A
  real phone should be far better, but "should" is not "is".
- **No leaderboard.** Scores are comparable through shared course links and Free Run tracks a
  personal record, but nothing ranks players against each other. Worth considering only once
  retention justifies a backend.

## What is already done

So nothing above gets duplicated: the game, art, audio, twelve levels, a daily course,
contracts, the workshop with upgrades and print editions, pause and settings, durable native
storage with migration from older builds, rewarded and interstitial placements with
policy-conservative pacing, GDPR consent and ATT in the required order, a privacy-choices entry
point, the full analytics taxonomy with two ready sinks, shareable challenge links, app icon
and splash at all 104 platform sizes, native iOS and Android projects, marketing capture
tooling, and a test suite covering determinism, the magnet, the colour rules, level
reachability and save persistence.
