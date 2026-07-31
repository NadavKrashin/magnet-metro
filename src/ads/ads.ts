import { Capacitor } from "@capacitor/core";
import {
  AdMob,
  AdmobConsentStatus,
  MaxAdContentRating,
  RewardAdPluginEvents,
  type AdMobRewardItem,
} from "@capacitor-community/admob";
import {
  AD_PACING,
  interstitialUnit,
  rewardedUnit,
  type AdPlatform,
} from "./config";
import type { Analytics } from "../analytics/analytics";

/**
 * All advertising, behind one interface.
 *
 * The ordering in `init` is not stylistic — it is what the platforms actually require, and
 * getting it wrong is a store rejection rather than a bug:
 *
 *   1. Ask for consent (Google's UMP). Under GDPR this must happen *before* the ad SDK
 *      initialises, because initialising is itself processing.
 *   2. On iOS, request App Tracking Transparency. Without it the IDFA is zeros.
 *   3. Only then initialise AdMob and preload inventory.
 *
 * On the web build every method is a no-op that resolves honestly, so the game stays fully
 * playable in a browser and in the screenshot harness.
 */
export class AdsService {
  private platform: AdPlatform = "web";
  private ready = false;
  private rewardedLoaded = false;
  private interstitialLoaded = false;

  private launchedAt = Date.now();
  private lastInterstitial = 0;
  private shownThisSession = 0;
  private consent: AdmobConsentStatus | "unavailable" = "unavailable";

  constructor(private readonly analytics: Analytics) {}

  get available(): boolean {
    return this.ready;
  }

  /** True once the player has a real privacy choice to revisit, which stores require exposing. */
  private privacyOptionsAvailable = false;

  get canShowPrivacyOptions(): boolean {
    return this.privacyOptionsAvailable;
  }

  async init(): Promise<void> {
    const native = Capacitor.isNativePlatform();
    this.platform = native ? (Capacitor.getPlatform() as AdPlatform) : "web";
    if (!native) {
      this.analytics.track("ads_skipped", { reason: "web" });
      return;
    }

    try {
      // 1. Consent, before anything initialises.
      const info = await AdMob.requestConsentInfo();
      this.consent = info.status;
      this.privacyOptionsAvailable = info.privacyOptionsRequirementStatus === "REQUIRED";

      if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) {
        const after = await AdMob.showConsentForm();
        this.consent = after.status;
      }
      this.analytics.track("consent_state_updated", { status: this.consent });

      // 2. iOS tracking permission. Requested after the consent form so the player has already
      //    seen what the app is asking for, rather than being prompted cold on first launch.
      if (this.platform === "ios") {
        const status = await AdMob.trackingAuthorizationStatus();
        if (status.status === "notDetermined") {
          await AdMob.requestTrackingAuthorization();
        }
        const settled = await AdMob.trackingAuthorizationStatus();
        this.analytics.track("att_prompt", { result: settled.status });
      }

      // 3. Now the SDK may start.
      await AdMob.initialize({
        initializeForTesting: false,
        // The game targets adults. Declaring a rating keeps obviously unsuitable creatives out
        // without claiming to be a children's app, which would bring far stricter obligations.
        maxAdContentRating: MaxAdContentRating.Teen,
        tagForChildDirectedTreatment: false,
      });

      this.ready = true;
      this.analytics.track("ads_ready", { platform: this.platform });

      await Promise.all([this.preloadRewarded(), this.preloadInterstitial()]);
    } catch (err) {
      // Never let an ad failure take the game down with it.
      this.ready = false;
      this.analytics.track("ads_init_failed", { message: String(err) });
    }
  }

  /** Reopen the consent choices. Stores require this to stay reachable after the first run. */
  async showPrivacyOptions(): Promise<void> {
    if (!this.ready) return;
    try {
      await AdMob.showPrivacyOptionsForm();
      this.analytics.track("privacy_options_opened", {});
    } catch {
      // Form unavailable in this region; nothing to show.
    }
  }

  private async preloadRewarded(): Promise<void> {
    if (!this.ready) return;
    try {
      await AdMob.prepareRewardVideoAd({ adId: rewardedUnit(this.platform) });
      this.rewardedLoaded = true;
    } catch {
      this.rewardedLoaded = false;
    }
  }

  private async preloadInterstitial(): Promise<void> {
    if (!this.ready) return;
    try {
      await AdMob.prepareInterstitial({ adId: interstitialUnit(this.platform) });
      this.interstitialLoaded = true;
    } catch {
      this.interstitialLoaded = false;
    }
  }

  /** Whether a rewarded offer can honestly be made right now. */
  get rewardedReady(): boolean {
    return this.ready && this.rewardedLoaded;
  }

  /**
   * Show a rewarded ad. Resolves true only if the user genuinely earned the reward.
   *
   * The reward is granted on the SDK's Rewarded event, never on dismissal — someone who backs
   * out early has not watched it, and paying them anyway trains people to skip.
   */
  async showRewarded(placement: string): Promise<boolean> {
    if (!this.rewardedReady) {
      this.analytics.track("rewarded_unavailable", { placement });
      return false;
    }

    this.analytics.track("rewarded_offer_accepted", { placement });
    let earned = false;
    const handle = await AdMob.addListener(
      RewardAdPluginEvents.Rewarded,
      (_item: AdMobRewardItem) => {
        earned = true;
      },
    );

    try {
      await AdMob.showRewardVideoAd();
    } catch (err) {
      this.analytics.track("rewarded_failed", { placement, message: String(err) });
    } finally {
      await handle.remove();
      this.rewardedLoaded = false;
      void this.preloadRewarded();
    }

    this.analytics.track(earned ? "rewarded_completed" : "rewarded_abandoned", { placement });
    return earned;
  }

  /**
   * Show an interstitial only if every pacing rule allows it. Returns whether one was shown.
   *
   * Call this at a natural break — after the results sheet is already on screen — never
   * between a tap and the thing the tap was meant to do.
   */
  async maybeShowInterstitial(lifetimeRuns: number): Promise<boolean> {
    const now = Date.now();
    const reason = this.interstitialBlockedBecause(lifetimeRuns, now);
    if (reason) {
      this.analytics.track("interstitial_eligible", { shown: false, reason });
      return false;
    }

    try {
      await AdMob.showInterstitial();
      this.lastInterstitial = now;
      this.shownThisSession += 1;
      this.analytics.track("interstitial_eligible", { shown: true, reason: "" });
      this.analytics.track("ad_impression", { format: "interstitial" });
      return true;
    } catch (err) {
      this.analytics.track("interstitial_failed", { message: String(err) });
      return false;
    } finally {
      this.interstitialLoaded = false;
      void this.preloadInterstitial();
    }
  }

  /** Named reasons rather than a bare boolean, so lost impressions are analysable. */
  private interstitialBlockedBecause(lifetimeRuns: number, now: number): string {
    if (!this.ready) return "ads_not_ready";
    if (!this.interstitialLoaded) return "not_loaded";
    if (lifetimeRuns < AD_PACING.minLifetimeRuns) return "new_player";
    if ((now - this.launchedAt) / 1000 < AD_PACING.minSecondsSinceLaunch) return "session_too_young";
    if (this.shownThisSession >= AD_PACING.maxPerSession) return "session_cap";
    if (this.lastInterstitial > 0 && (now - this.lastInterstitial) / 1000 < AD_PACING.minSecondsBetween) {
      return "too_soon";
    }
    return "";
  }
}
