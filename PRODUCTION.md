# What you need to do

Everything still standing between this repository and a live, earning app.

Ordered so nothing blocks on something further down. Every item here needs your money, your
legal identity, your store accounts, or a real phone — which is why it is on your list rather
than already done.

---

## The single highest-leverage hour: put up a web page

**The page is built.** `docs/` is ready to serve, and `npm run web` rebuilds and republishes it
in one command so the hosted build cannot go stale. What remains needs only your details:

- [x] The playable build — `docs/index.html`, one self-contained file
- [x] The **privacy policy** — `docs/privacy.html`, written from what the code actually
      collects rather than from a generator
- [x] **`app-ads.txt`** — `docs/app-ads.txt`
- [x] A 1200×630 social preview card — `docs/social.png`, regenerate with
      `node scripts/social.mjs`
- [ ] **Turn Pages on**: GitHub → Settings → Pages → Source: `main` branch, `/docs` folder
- [ ] **Fill in the four placeholders** in `docs/privacy.html` — publication date, developer
      name, contact email, governing jurisdiction. They are capitalised and flagged in a box at
      the top of the page.
- [ ] **Put your AdMob publisher ID** in `docs/app-ads.txt`, replacing
      `pub-0000000000000000`. Read the note in that file first: on a GitHub *project* site the
      file lands in a subdirectory, where crawlers will not find it. It must sit at the root of
      the domain you name in your store listings.
- [ ] Set `SHARE_BASE_URL` in `src/analytics/config.ts` to the published URL, then
      `npm run web` again — social preview tags are only emitted once it knows the host,
      because they need absolute URLs.

Without this page: submissions get rejected, a large share of ad demand will not bid, sharing
falls back to codes people have to type, and you have nowhere to send the communities in
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
- [ ] Refresh the **SKAdNetwork identifier list**: `node scripts/skadnetwork.mjs` to see what
      would change, then again with `--write`. The plist now carries nine identifiers rather
      than one, but the published list is several times longer and Google adds to it over time,
      so this wants running before every release. It must be run somewhere that can reach
      `developers.google.com`, and it refuses to write anything that does not contain Google's
      own identifier. A network missing from this list does not report installs at all, which
      makes paid tests look worse than they were.

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

- [x] Screenshots at every required size and a 22-second vertical gameplay video, both
      captured and committed. Re-run `npm run capture` after any visual change; `npm run icons`
      only if you change the artwork.
- [x] MP4 conversion — `npm run capture` now does it, producing
      `marketing/gameplay-1080x1920.mp4` (H.264, faststart, silent).
- [ ] **Add music** to the video in an editor. The game's audio is synthesised live and is not
      captured, so the export is deliberately silent.
- [ ] Check App Store Connect's current accepted **app preview dimensions** for each device
      class; 1080×1920 is correct for TikTok, Reels, Shorts and Play, but Apple may want a
      different export.
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
| AdMob publisher ID | `docs/app-ads.txt` | `pub-0000000000000000` placeholder |
| Policy placeholders | `docs/privacy.html` | four CAPITALISED placeholders |

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
