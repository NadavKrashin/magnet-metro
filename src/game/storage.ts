import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

/**
 * Durable storage for everything the player has earned.
 *
 * The game originally kept progress in `localStorage`. That works in a browser, but inside a
 * native app it is the *least* durable option available: on iOS a WKWebView's local storage
 * lives in the app's web data and the system is free to evict it when the device is short on
 * space, and "Offload App" clears it outright. A player losing twelve levels and a maxed
 * workshop to an OS housekeeping pass would be an unrecoverable, unexplainable bug.
 *
 * So on device this writes through to Preferences, which is NSUserDefaults on iOS and
 * SharedPreferences on Android — the same place native apps keep settings, backed up with the
 * device and never evicted. On the web it stays on `localStorage`, which is all there is.
 *
 * The plugin API is async and the game's save/load call sites are synchronous, so everything
 * is hydrated into an in-memory cache once at boot. Reads then come from the cache and writes
 * update the cache immediately and the durable store in the background.
 */
class Storage {
  private cache = new Map<string, string>();
  private native = false;
  private ready = false;
  /** Keys whose durable write is still in flight, so a flush can wait on them. */
  private pending = new Set<string>();

  /** Must be awaited before the game reads anything. */
  async hydrate(keys: string[]): Promise<void> {
    this.native = Capacitor.isNativePlatform();

    for (const key of keys) {
      let value: string | null = null;

      if (this.native) {
        try {
          value = (await Preferences.get({ key })).value;
        } catch {
          value = null;
        }
      }

      // Fall back to localStorage, which also covers the one-time migration for anyone who
      // played a build that predates this file.
      if (value === null) {
        try {
          value = localStorage.getItem(key);
        } catch {
          value = null;
        }
        if (value !== null && this.native) void this.writeThrough(key, value);
      }

      if (value !== null) this.cache.set(key, value);
    }

    this.ready = true;
  }

  getItem(key: string): string | null {
    return this.cache.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.cache.set(key, value);
    // localStorage stays written on every platform: on the web it is the store, and on device
    // it is a free second copy that costs nothing and has already saved one migration.
    try {
      localStorage.setItem(key, value);
    } catch {
      // Quota or private browsing. The durable write below still stands on device.
    }
    if (this.native) void this.writeThrough(key, value);
  }

  private async writeThrough(key: string, value: string): Promise<void> {
    this.pending.add(key);
    try {
      await Preferences.set({ key, value });
    } catch {
      // Nothing useful to do; the cache and localStorage copy still hold the value.
    } finally {
      this.pending.delete(key);
    }
  }

  /** True once hydrate has run. Reading before that would silently look like a new player. */
  get hydrated(): boolean {
    return this.ready;
  }
}

export const storage = new Storage();

/** Every key the game owns. Hydrated at boot, in this order. */
export const STORAGE_KEYS = [
  "mm_save_v2",
  "mm_runs_v1",
  "mm_muted_v1",
  "mm_session_v1",
  "mm_first_open_v1",
] as const;
