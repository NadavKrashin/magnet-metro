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
 * Send to Firebase Analytics. Has no effect on the web build — the sink checks for a native
 * platform and gives up immediately in a browser.
 *
 * The plugin is installed and both native projects are synced. What is left is the pair of
 * config files only your Firebase project can produce:
 *
 *   android/app/google-services.json       (Firebase console -> Android app -> download)
 *   ios/App/App/GoogleService-Info.plist   (Firebase console -> iOS app -> download)
 *
 * Then `npm run sync`, and flip this to true.
 *
 * ORDER MATTERS, AND NOT IN THE USUAL WAY. On iOS the plugin calls FirebaseApp.configure()
 * from its load(), which runs at app launch for every registered Capacitor plugin — *not*
 * when this flag is read. So once the plugin is installed, a missing GoogleService-Info.plist
 * crashes the app on startup whether this is true or false. Add the files before the next
 * device build, not before flipping the flag.
 *
 * On iOS the plist must also be added to the Xcode target, not merely dropped in the folder:
 * open ios/App/App.xcworkspace, drag it into the App group, and tick "Copy items if needed"
 * with the App target checked. A file sitting beside the project that Xcode does not know
 * about is not in the bundle, and behaves exactly like a missing one.
 */
export const USE_FIREBASE = false;
