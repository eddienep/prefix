# Caffeine half-life tracker

Expo (React Native) app for **iOS** and **Android**: log caffeine doses, model exponential decay with a configurable half-life, chart active caffeine (last 24h → next 12h), and compare to a simple sleep-safe threshold (1.5 mg/kg body weight).

**Not medical advice**—for behavioral awareness only.

## Requirements

- [Node.js](https://nodejs.org/) (Expo SDK 54 expects **Node ≥ 20.19.4**; upgrade if you see engine warnings)
- [Expo Go](https://expo.dev/go) on a phone for quick testing, or Xcode / Android Studio for simulators and store builds

## Run locally

```bash
npm install
npx expo start
```

Then press **i** (iOS simulator), **a** (Android emulator), or scan the QR code with Expo Go.

## Scripts

| Command           | Action                          |
| ----------------- | ------------------------------- |
| `npx expo start`  | Dev server (Metro)              |
| `npm run ios`     | Start and open iOS              |
| `npm run android` | Start and open Android          |
| `npm run web`     | Optional Expo web export        |

## Data

State is stored with **AsyncStorage** on device (same logical schema as the earlier web MVP: entries + settings). Theme preference (Auto / Light / Dark) is included.

## Project layout

- `App.tsx` — UI and wiring
- `src/caffeineMath.ts` — decay model and series helpers
- `src/types.ts` — entry/settings types
- `src/storage.ts` — load/save via AsyncStorage

## Store builds

Use [EAS Build](https://docs.expo.dev/build/introduction/) when you are ready for TestFlight / Play Console. Update `ios.bundleIdentifier` and `android.package` in `app.json` to your own identifiers before publishing.
