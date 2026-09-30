# Toki

Toki is a physical desk companion for the four tasks that need to stay visible. The object keeps its queue and runs its timer independently; the Android app is the simple place to capture, prioritize, send, and review tasks. The phone connects directly to the ESP32 over Bluetooth Low Energy.

## Current prototype

- `mobile/` — React Native / Expo app with quick capture, priority ordering, a four-task physical queue, verified BLE pairing, explicit sync, device controls, and live event logs.
- `firmware/Toki/Toki.ino` — integrated ESP32 sketch for BLE, e-paper, stepper pointer, home switch, three touch controls, local chimes, and saved task state.
- `docs/TOKI_V2.md` — pin map, physical interaction, BLE protocol, build commands, and bench test order. Start here before wiring or flashing.
- `firmware/TokiLinkProbe/` and `web/` — earlier BLE-only diagnostic tools. They use protocol 1; the full app and firmware use protocol 2.

The original Arduino sketch was retained outside this repository. The connected board still runs the BLE probe. The integrated sketch compiles, but must be flashed and tested after the actual hardware is wired. The app has passed static checks; the installable Android APK still requires an Expo EAS login and cloud build.

## Build

In this Codespace, run `bash scripts/build-toki.sh` from the repository root to compile the integrated sketch. From `mobile/`, run `npm ci`, `npx expo lint`, `npx tsc --noEmit`, and `npx expo-doctor`. For a standalone Android APK, sign in with `npx eas-cli@latest login` and run `npx eas-cli@latest build --platform android --profile preview`. Android Studio is not needed. Expo Go cannot run the native BLE code.

See [the full setup and test guide](docs/TOKI_V2.md).
