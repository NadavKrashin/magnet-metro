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
/**
 * Minimum gap between swallow taps. A haptic motor takes roughly this long to strike and
 * settle, so anything closer together arrives as one continuous buzz rather than as beats.
 */
const ABSORB_MIN_GAP_MS = 90;

class HapticsService {
  private native = false;
  /** When the last swallow tap was fired, so a wall does not become one long vibration. */
  private lastAbsorb = 0;
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

  /**
   * Swallowing a matching hazard — the payoff the whole mechanic is built around.
   *
   * Deliberately Light, and rate limited. A wall is nine blocks or thirty-six, and this used to
   * fire a Medium per block with a *Heavy* — the mismatch buzz — once the run passed four. The
   * best moment in the game therefore reached the thumb as thirty-six heavy pulses of the same
   * motor pattern that means damage, which is a sustained angry buzz and nothing like a reward.
   * A play test said so: "it still sounds and feels like a hit".
   *
   * The motor also cannot resolve pulses this close together, so firing per block does not even
   * buy detail — it just smears into one long vibration.
   */
  absorb(): void {
    const now = Date.now();
    if (now - this.lastAbsorb < ABSORB_MIN_GAP_MS) return;
    this.lastAbsorb = now;
    this.impact(ImpactStyle.Light);
  }

  /**
   * A whole wall gone. An ascending two-beat roll, which is the one thing in the vocabulary
   * that a single heavy thud can never be mistaken for.
   */
  absorbFinish(count: number): void {
    if (!this.native || !this.enabled) return;
    this.impact(ImpactStyle.Medium);
    if (count >= 6) window.setTimeout(() => this.impact(ImpactStyle.Heavy), 80);
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
