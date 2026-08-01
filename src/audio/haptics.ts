import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

/**
 * Touch feedback for the three moments the game already treats as physical.
 *
 * This is the cheapest juice available on a phone and the one channel a screenshot cannot
 * carry: the ink slam, the hitstop and the screen shake all exist to make an impact land, and
 * on a handset the thumb is the sense that sells it.
 *
 * Every call is fire-and-forget. A device with no motor, a user who has switched system
 * haptics off, and the web build all take the same path — nothing happens and nothing throws.
 * Vibration must never be the thing that ends a run.
 */
class HapticsService {
  private native = false;
  /** Follows the sound toggle: someone who silenced the game wants it silent in the hand too. */
  private enabled = true;

  constructor() {
    try {
      this.native = Capacitor.isNativePlatform();
    } catch {
      this.native = false;
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  private impact(style: ImpactStyle): void {
    if (!this.native || !this.enabled) return;
    void Haptics.impact({ style }).catch(() => {
      // No motor, no permission, or the platform declined. Nothing to recover from.
    });
  }

  /** Swallowing a matching hazard — the payoff the whole mechanic is built around. */
  absorb(): void {
    this.impact(ImpactStyle.Medium);
  }

  /** Losing a cell. The heaviest thing in the game, and it should feel like it. */
  hit(): void {
    if (!this.native || !this.enabled) return;
    void Haptics.notification({ type: NotificationType.Error }).catch(() => {});
  }

  /** Mismatching the Press: a big, dull thud rather than the sharp sting of a hit. */
  pressCrash(): void {
    this.impact(ImpactStyle.Heavy);
  }

  /** Breaking your own record. */
  record(): void {
    if (!this.native || !this.enabled) return;
    void Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  }

  /**
   * Changing colour. Deliberately the lightest tap available: this fires several times a
   * second in skilled play, and a heavy buzz on every flip would be unbearable rather than
   * satisfying — the one place where more feedback is worse.
   */
  flip(): void {
    this.impact(ImpactStyle.Light);
  }
}

export const haptics = new HapticsService();
