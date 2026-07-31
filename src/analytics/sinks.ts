import { Capacitor } from "@capacitor/core";
import type { AnalyticsSink, EventName, EventProps } from "./analytics";

/**
 * Two ways to get the events off the device. Pick one, or run both.
 *
 * Neither is switched on by default, because both need something that only you can create: a
 * Firebase project, or a URL. Until one is configured the game still emits every event, it
 * just has nowhere to send them.
 */

/**
 * Posts events to any HTTPS endpoint you control.
 *
 * Deliberately vendor-neutral and dependency-free: a Cloudflare Worker, a Google Apps Script
 * bound to a spreadsheet, a Firebase Function, or a twenty-line server all work. Events are
 * batched and sent with `sendBeacon` where available, so a batch still leaves the device when
 * the player swipes the app away — which is exactly when the most interesting event, the one
 * where they gave up, would otherwise be lost.
 */
export class BeaconSink implements AnalyticsSink {
  private queue: { at: number; name: string; props: EventProps }[] = [];
  private timer = 0;

  constructor(
    private readonly url: string,
    private readonly installId: string,
    private readonly batchSize = 20,
    private readonly flushMs = 15000,
  ) {
    // A batch in flight when the app is hidden is a batch that never arrives otherwise.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.flush();
    });
  }

  send(name: EventName, props: EventProps): void {
    this.queue.push({ at: Date.now(), name, props });
    if (this.queue.length >= this.batchSize) {
      this.flush();
      return;
    }
    if (this.timer === 0) {
      this.timer = window.setTimeout(() => this.flush(), this.flushMs);
    }
  }

  flush(): void {
    window.clearTimeout(this.timer);
    this.timer = 0;
    if (this.queue.length === 0) return;

    const payload = JSON.stringify({
      installId: this.installId,
      platform: Capacitor.getPlatform(),
      appVersion: "1.0.0",
      sentAt: Date.now(),
      events: this.queue,
    });
    this.queue = [];

    try {
      // sendBeacon survives the page being torn down; fetch is the fallback for browsers or
      // payloads it refuses.
      if (navigator.sendBeacon) {
        const ok = navigator.sendBeacon(this.url, new Blob([payload], { type: "application/json" }));
        if (ok) return;
      }
      void fetch(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {
        // Offline, or the endpoint is down. Analytics must never surface an error to a player.
      });
    } catch {
      // Same.
    }
  }
}

/**
 * Firebase Analytics, via the Capacitor plugin.
 *
 * This is the recommended option for a mobile game with no budget: free, unlimited events, and
 * it computes retention cohorts and funnels for you in a console — which is the actual thing
 * being asked for, and which a raw event log does not give you without building a lot more.
 *
 * It is loaded dynamically so the plugin is only a dependency if you choose to use it. Install
 * it with:
 *
 *   npm install @capacitor-firebase/analytics firebase
 *
 * then add `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) from your
 * Firebase project to the native projects, and `npm run sync`.
 */
export class FirebaseSink implements AnalyticsSink {
  private plugin: { logEvent(o: { name: string; params: EventProps }): Promise<void> } | null = null;
  private failed = false;

  async init(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      // The specifier is held in a variable on purpose: the plugin is optional, and a literal
      // would make the compiler demand it be installed before this file even compiles.
      const spec = "@capacitor-firebase/analytics";
      const mod = (await import(/* @vite-ignore */ spec)) as {
        FirebaseAnalytics: { logEvent(o: { name: string; params: EventProps }): Promise<void> };
      };
      this.plugin = mod.FirebaseAnalytics;
      return true;
    } catch {
      // Plugin not installed. Expected until you choose this path.
      this.failed = true;
      return false;
    }
  }

  send(name: EventName, props: EventProps): void {
    if (this.failed || !this.plugin) return;
    // Firebase event names allow letters, digits and underscores only, up to 40 characters.
    // Every name in the taxonomy already complies; this guards against future additions.
    const safe = name.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40);
    void this.plugin.logEvent({ name: safe, params: props }).catch(() => {});
  }
}

/**
 * A stable, anonymous identifier for this installation.
 *
 * Random, generated on device, tied to nothing about the person. It exists so events from one
 * install can be joined into a session and a retention curve — which is impossible otherwise —
 * without collecting anything identifying. It disappears when the app is uninstalled.
 */
export function installId(get: (k: string) => string | null, set: (k: string, v: string) => void): string {
  const KEY = "mm_install_id_v1";
  const existing = get(KEY);
  if (existing) return existing;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  set(KEY, id);
  return id;
}
