/**
 * Where analytics events go.
 *
 * Both are off until you fill one in. The game emits every event either way; without a sink
 * they simply have nowhere to land.
 *
 * Recommended: Firebase. It is free, it needs no server, and it computes retention cohorts and
 * funnels for you — which is the actual question being asked. The beacon is there if you would
 * rather own the raw data, or want both.
 */

/**
 * Where the web build is hosted, e.g. "https://magnetmetro.example.com".
 *
 * When set, sharing a run produces a tappable link that opens straight into that exact
 * course. When empty it falls back to sharing the raw code, which works but asks the
 * recipient to type it — and nobody types a code.
 */
export const SHARE_BASE_URL: string = "";

/** HTTPS endpoint that accepts a JSON POST. Empty disables the beacon. */
export const ANALYTICS_ENDPOINT: string = "";

/**
 * Send to Firebase Analytics. Requires:
 *   npm install @capacitor-firebase/analytics firebase
 * plus google-services.json and GoogleService-Info.plist from your Firebase project, then
 * `npm run sync`. Has no effect on the web build.
 */
export const USE_FIREBASE = false;
