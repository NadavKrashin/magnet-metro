# Getting to production

Everything still standing between the current build and a live, earning app. Ordered so that
nothing blocks on something further down.

Items marked **you** cannot be done from this repository — they need your money, your legal
identity, or your Apple/Google accounts.

---

## Stage 1 — Accounts and money (you)

Nothing else can start until these exist. Total: **$124 up front, $99/year after.**

- [ ] **Apple Developer Program** — $99/year. Enrolment can take 24–48 hours, sometimes longer
      for individuals who need identity verification. Start this first because it is the only
      item with an unpredictable wait.
- [ ] **Google Play Console** — $25, one time.
- [ ] **AdMob account**, linked to the same Google account. Register two apps inside it,
      Android and iOS.
- [ ] **Decide the bundle identifier.** Currently `com.magnetmetro.game` in
      `capacitor.config.ts`. It must be globally unique and **can never be changed after first
      release** on either store. If you own a domain, use a reversed form of it.
- [ ] **A domain or a hosted page** for the privacy policy and `app-ads.txt`. A free GitHub
      Pages site is sufficient.

## Stage 2 — Legal and privacy (you, with help)

These are hard gates. Submission is rejected without them, and AdMob will not serve.

- [ ] **Write and publish a privacy policy** at a public URL. It must name the AdMob SDK, the
      data it collects, and how to opt out. Generators exist and are acceptable for an app of
      this size, but read what you publish.
- [ ] Paste that URL into `PRIVACY_POLICY_URL` in `src/ads/config.ts`. The in-app link stays
      hidden while it is empty, and the console warns on every launch.
- [ ] Enter the same URL in App Store Connect and in the Play Console.
- [ ] **Publish `app-ads.txt`** on that domain, and declare the domain in both consoles.
      Without it a large share of programmatic demand simply will not bid on your inventory.
- [ ] **Play Data Safety form** and **Apple privacy nutrition labels**. Both must describe what
      the *AdMob SDK* collects — device identifiers, coarse location, usage data — not only
      what your own code collects. Google publishes a disclosure guide for AdMob; use it.
- [ ] **Content rating questionnaires** in both consoles.
- [ ] Reword `NSUserTrackingUsageDescription` in `ios/App/App/Info.plist` in your own voice.
      Apple rejects vague or boilerplate tracking strings.

## Stage 3 — Switch the ads on

Currently every placement runs against Google's test inventory, which always fills and earns
nothing. Details in `MONETISATION.md`.

- [ ] Create **four ad units** in AdMob: rewarded and interstitial, for each platform.
- [ ] Paste them into `REAL` in `src/ads/config.ts` and set `LIVE = true`.
- [ ] Replace the **two app IDs**, which currently hold Google's test values:
      - `android/app/src/main/AndroidManifest.xml` → `com.google.android.gms.ads.APPLICATION_ID`
      - `ios/App/App/Info.plist` → `GADApplicationIdentifier`
      - Android **crashes on launch** if this is missing or malformed.
- [ ] Add the full **SKAdNetwork identifier list** to `Info.plist`. Only Google's primary ID is
      there now, and iOS attribution under-reports without the rest.

## Stage 4 — Analytics you can actually read

Events, sinks and the install id all exist. Only the destination is missing. Full detail and
the five questions worth asking are in `ANALYTICS.md`.

- [ ] Either `npm install @capacitor-firebase/analytics firebase`, add the two Firebase config
      files to the native projects and set `USE_FIREBASE = true` — **or** set
      `ANALYTICS_ENDPOINT` to a URL you control. Both live in `src/analytics/config.ts`.
- [ ] Declare the anonymous install id in your privacy policy and Data Safety form.
- [ ] Confirm **D1 retention** is visible in whatever you choose. It is the gate for everything
      in `MARKETING.md`.

## Stage 5 — Build, sign, test on real devices

- [ ] `npm run sync`, then `npm run ios` / `npm run android`.
- [ ] **Generate an Android upload keystore** and store it in a password manager, outside this
      repository. Play accepts uploads signed with that key and no other; losing it means
      losing the ability to update the app. Command is in `BUILDING.md`.
- [ ] Set the **iOS signing team** in Xcode and give the bundle ID a unique suffix if
      `com.magnetmetro.game` is taken.
- [ ] **Test on at least one real low-end Android phone.** Frame time is the open question:
      the print look is composite-heavy and everything measured so far has been software
      rendering in a container, which is not representative in either direction.
- [ ] **Verify on device**: the consent form appears in a GDPR region, the ATT prompt appears
      on iOS, a rewarded ad plays and pays out, an interstitial appears only after the results
      sheet, and the game is fully playable if you decline everything.
- [ ] Check progress survives **force-quit, reinstall-over, and an OS update**.

## Stage 6 — Store listings

Copy, keywords and screenshot captions are written and ready to paste in `MARKETING.md`.

- [ ] Run `npm run capture` for screenshots at every required size, and `npm run icons` if you
      change the artwork.
- [ ] Upload listing copy, screenshots, and a preview video to both stores.
- [ ] Set up **TestFlight** and a **Play internal testing track**. Get the build onto ten real
      phones belonging to other people before you go public.
- [ ] Submit. Expect Apple review in 24–48 hours and a rejection or two; Play is usually
      faster but the first review of a new developer account can take days.

## Stage 7 — Launch and measure

- [ ] Post the **web build** to communities before the store links exist. It is a 88 kB page
      that plays in three seconds, and it converts far better than an install request.
- [ ] Start posting vertical clips. Three to five a week, varying only the first two seconds.
- [ ] Watch **D1 retention**. Below roughly 25%, stop promoting and fix the game — promotion
      multiplies whatever is already there.
- [ ] Only once organic is running, spend **$200–300** on a paid test to learn your real CPI.

---

## Known gaps I would fix before a wide launch

Not blockers for a soft launch, but each is a real rough edge:

- **No cloud save.** Progress is durable on-device (native Preferences) but reinstalling or
  changing phone starts from zero. Fine for now; it stops being fine the moment you sell a
  "remove ads" purchase, because losing that is a refund request.
- **Only one interstitial placement.** Deliberate — but it means ad revenue rests almost
  entirely on the two rewarded spots until there is retention data to justify more.
- **Frame time is unverified on real hardware.** 34–44 ms measured under software rendering
  with no GPU. A real phone should be far better, but "should" is not "is".

## What is already done

For completeness, so nothing on the list above gets duplicated:

Game, art, audio, twelve levels, daily course, contracts, workshop with upgrades and print
editions, durable native storage with migration, rewarded and interstitial placements with
policy-conservative pacing, GDPR consent and ATT in the required order, a privacy-choices entry
point, the analytics taxonomy and call sites, share with course code, app icon and splash at
all 104 platform sizes, native iOS and Android projects, and a test suite covering
determinism, the magnet, the colour rules, level reachability and save persistence.
