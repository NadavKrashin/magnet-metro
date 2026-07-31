# Building for devices and stores

The web build in `dist/` is the game. The `android/` and `ios/` projects are thin native
shells around it, so the workflow is always: build the web app, sync it into the shells, then
build natively.

```bash
npm run sync      # build the web app and copy it into both native projects
npm run android   # sync, then open Android Studio
npm run ios       # sync, then open Xcode
```

Run `npm run sync` after **every** code change. The native projects hold a copy of `dist/`,
not a live link, so a change that is not synced will not appear on the device.

## Prerequisites

| Target | Needs |
|---|---|
| Android | Android Studio (bundles the SDK and a JDK) |
| iOS | Xcode, and an Apple Developer Program membership at $99/year to reach TestFlight or the App Store |
| Play Store | Google Play Console, one-time $25 |

Capacitor 8 uses Swift Package Manager for iOS dependencies, so CocoaPods is not required.

## Getting it onto your own phone

**Android.** `npm run android`, then Run in Android Studio with the device connected and USB
debugging on. For sharing a test build, Build → Build Bundle(s) / APK(s) → Build APK(s)
produces a file that installs directly.

**iOS.** `npm run ios`, then in Xcode select the App target → Signing & Capabilities, set Team
to your Apple ID, and give the bundle identifier a unique suffix if `com.magnetmetro.game` is
taken. Run with your iPhone connected. A free Apple ID can sideload to your own device for
seven days; TestFlight distribution needs the paid membership.

## Release builds

**Android.** Release builds need an upload key, which is generated once and must never be
lost — Play accepts uploads signed with that key only.

```bash
keytool -genkey -v -keystore magnet-metro-upload.keystore \
  -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Keep the keystore and its passwords in a password manager, outside this repository. Then
Build → Generate Signed Bundle / APK → Android App Bundle, which produces the `.aab` the Play
Console expects.

**iOS.** In Xcode, set the destination to Any iOS Device, then Product → Archive, then
Distribute App → App Store Connect.

## Before either store will accept the app

Not yet done, and each is a hard gate rather than a nice-to-have:

- App icons and splash screens at every required size
- A privacy policy at a public URL — required by both stores, and by AdMob
- Play Data Safety declarations and Apple privacy nutrition labels, which must list every
  SDK's data collection, including the ad SDK
- An App Tracking Transparency prompt and purpose string on iOS, shown before any tracking
- A consent flow for GDPR regions, initialised before the ad SDK starts
- Store listing copy, screenshots, and a preview video
- Content rating questionnaires

## Version numbering

Set both in one place per platform and keep them in step with `package.json`:

- Android: `versionCode` and `versionName` in `android/app/build.gradle`
- iOS: Version and Build in the Xcode target's General tab

Play and App Store Connect both reject an upload whose build number is not higher than the
last one accepted, so bump the build number on every upload attempt, including failed ones.
