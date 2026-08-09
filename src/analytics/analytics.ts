/**
 * Event taxonomy and a pluggable sink.
 *
 * Nothing here talks to a vendor. The point is that instrumentation exists from the start with
 * stable names, so wiring Firebase, an MMP, or a self-hosted collector later is a matter of
 * adding one sink rather than retrofitting call sites across the codebase.
 *
 * Two rules that matter more than they look:
 *   - Never repurpose an existing event name. A renamed meaning silently corrupts every
 *     historical comparison, and the corruption is invisible until a decision is made on it.
 *   - Every ad event carries its placement, so revenue can be attributed to a spot in the game
 *     rather than to a format in aggregate.
 */
import { storage } from "../game/storage";

export type EventName =
  // Lifecycle
  | "first_open"
  | "session_start"
  // Consent and privacy
  | "consent_state_updated"
  | "att_prompt"
  | "privacy_options_opened"
  // Run
  | "run_start"
  | "run_end"
  | "run_paused"
  | "run_quit"
  | "press_result"
  // The first-session funnel. These are the events that answer why people leave.
  | "tutorial_reached_tap"
  | "tutorial_completed"
  // The guided tour, per beat. Which step people skip on is the only honest measure of how
  // long the tour is allowed to be — and "skipped on step 2" is a very different problem from
  // "skipped on step 6".
  | "coach_step"
  | "coach_skipped"
  | "coach_finished"
  | "howto_opened"
  | "first_run_completed"
  | "level_attempt"
  | "level_cleared"
  // Which tier, on which level. The distribution of "perfect" marks is the clearest read
  // there is on whether mastery is a goal people actually chase or a badge they ignore.
  | "level_mastered"
  // Progression
  | "progress_reset"
  | "currency_earned"
  | "currency_spent"
  | "upgrade_bought"
  | "edition_bought"
  | "contract_completed"
  // Retention. The distribution of streak lengths is the clearest read there is on whether
  // the daily is actually bringing anyone back.
  | "daily_streak"
  // Virality
  | "share_opened"
  | "challenge_opened"
  // Ads
  | "ads_ready"
  | "ads_skipped"
  | "ads_init_failed"
  | "rewarded_offered"
  | "rewarded_offer_accepted"
  | "rewarded_completed"
  | "rewarded_abandoned"
  | "rewarded_unavailable"
  | "rewarded_failed"
  | "interstitial_eligible"
  | "interstitial_failed"
  | "ad_impression";

export type EventProps = Record<string, string | number | boolean>;

export interface AnalyticsSink {
  send(name: EventName, props: EventProps): void;
}

/** Keeps the last N events in memory so a build can be inspected without a backend. */
export class DebugSink implements AnalyticsSink {
  readonly events: { at: number; name: EventName; props: EventProps }[] = [];

  send(name: EventName, props: EventProps): void {
    this.events.push({ at: Date.now(), name, props });
    if (this.events.length > 500) this.events.shift();
  }
}

const SESSION_KEY = "mm_session_v1";
const FIRST_OPEN_KEY = "mm_first_open_v1";

export class Analytics {
  private sinks: AnalyticsSink[] = [];
  /** Attached to every event, so a funnel can be reconstructed per session. */
  private sessionId = Math.random().toString(36).slice(2, 10);
  private sessionRuns = 0;

  addSink(sink: AnalyticsSink): void {
    this.sinks.push(sink);
  }

  /** Emit the lifecycle events every funnel is built on. */
  start(): void {
    let isFirst = false;
    try {
      isFirst = !storage.getItem(FIRST_OPEN_KEY);
      if (isFirst) storage.setItem(FIRST_OPEN_KEY, String(Date.now()));
      const count = Number(storage.getItem(SESSION_KEY) ?? 0) + 1;
      storage.setItem(SESSION_KEY, String(count));
      if (isFirst) this.track("first_open", {});
      this.track("session_start", { sessionNumber: count });
    } catch {
      this.track("session_start", { sessionNumber: 0 });
    }
  }

  noteRunStarted(): void {
    this.sessionRuns += 1;
  }

  track(name: EventName, props: EventProps): void {
    const enriched: EventProps = {
      ...props,
      sessionId: this.sessionId,
      sessionRuns: this.sessionRuns,
    };
    for (const sink of this.sinks) {
      try {
        sink.send(name, enriched);
      } catch {
        // A broken sink must never break the game.
      }
    }
  }
}
