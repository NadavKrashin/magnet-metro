/**
 * Ad configuration.
 *
 * Everything here is Google's published *test* inventory. Test units always fill, cost
 * nothing, and cannot get an account banned — which is exactly what you want until there is a
 * real AdMob account to point at.
 *
 * To go live, replace the four unit IDs below and the two app IDs in the native projects (see
 * MONETISATION.md). Nothing else in the codebase needs to change.
 *
 * Serving real ads against these test IDs earns nothing; serving test ads against real IDs
 * risks the account. The `LIVE` flag exists so the swap is one deliberate edit rather than
 * four scattered ones.
 */

/**
 * Public URL of your privacy policy.
 *
 * This is a hard requirement three times over: Apple, Google Play, and AdMob each demand a
 * reachable policy for any app that serves ads, and it must name the ad SDK and the data it
 * collects. The app will submit without it and be rejected.
 *
 * Leave empty and the in-app link stays hidden; set it and the link appears in the Workshop.
 */
export const PRIVACY_POLICY_URL = "";

/** Flip to true only when every ID below is a real one from your own AdMob account. */
export const LIVE = false;

/** Google's official test units. Documented and stable. */
const TEST = {
  rewardedAndroid: "ca-app-pub-3940256099942544/5224354917",
  rewardedIos: "ca-app-pub-3940256099942544/1712485313",
  interstitialAndroid: "ca-app-pub-3940256099942544/1033173712",
  interstitialIos: "ca-app-pub-3940256099942544/4411468910",
};

/** Replace with your own units before setting LIVE to true. */
const REAL = {
  rewardedAndroid: "",
  rewardedIos: "",
  interstitialAndroid: "",
  interstitialIos: "",
};

export type AdPlatform = "android" | "ios" | "web";

export function rewardedUnit(platform: AdPlatform): string {
  const set = LIVE ? REAL : TEST;
  return platform === "ios" ? set.rewardedIos : set.rewardedAndroid;
}

export function interstitialUnit(platform: AdPlatform): string {
  const set = LIVE ? REAL : TEST;
  return platform === "ios" ? set.interstitialIos : set.interstitialAndroid;
}

/**
 * Interstitial pacing.
 *
 * Google Play prohibits unexpected full-screen ads, ads before content, and full-screen video
 * before a loading screen. Beyond policy, an interstitial that lands on a new player is the
 * fastest way to lose them — and with organic distribution as the whole growth strategy, a
 * one-star review costs more than an impression earns.
 *
 * These are starting hypotheses to be tuned against retention, not fixed truths.
 */
export const AD_PACING = {
  /** No interstitial until the player has finished this many runs, ever. */
  minLifetimeRuns: 4,
  /** No interstitial within this many seconds of the app opening. */
  minSecondsSinceLaunch: 180,
  /** Minimum gap between two interstitials. */
  minSecondsBetween: 120,
  /** Hard ceiling per app session. */
  maxPerSession: 5,
  /** Never interrupt a run — only the gap after the results sheet is shown. */
  onlyAtNaturalBreaks: true,
} as const;

/** Rewarded placements. All strictly opt-in, all offered after the outcome is already known. */
export const REWARD = {
  /** Multiplier applied to banked scrap when the player watches for a bonus. */
  doubleScrapMultiplier: 2,
  /** One revive per run, and only after the player got far enough to care. */
  reviveMinProgress: 0.35,
} as const;
