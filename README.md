# Toki Link Lab

This is the **connection-first** test for Toki. It keeps the owner's existing `test.ino` intact. The probe firmware exposes a small BLE GATT service. Both the browser dashboard and a minimal React Native app connect, read protocol information, send a random challenge, check the exact reply, ping, and display live device notifications. The ESP32 prints the same meaningful events to USB serial at 115200 baud.

No task list, motor, e-paper, audio streaming, or Wi-Fi configuration is involved yet. A successful test proves the phone/browser ↔ ESP32 BLE link and application-level handshake. It does **not** prove that the final combined firmware works.

## What runs where

| Piece | Location |
|---|---|
| Code editing and optional firmware compilation | GitHub Codespace |
| Web dashboard | Codespace port 3000; open its forwarded **HTTPS** link directly in Chrome |
| Native test app | `mobile/` React Native + Expo development build, using the same BLE handshake |
| Bluetooth radio | Chrome on a nearby Windows/Android device, not the Codespace VM |
| BLE peripheral | Physical ESP32 flashed with `TokiLinkProbe.ino` |
| Live logs | Dashboard over BLE notifications; optionally USB Serial Monitor |

Chrome supports Web Bluetooth on supported desktop and Android devices. Its Bluetooth picker needs a direct user click and an HTTPS or localhost page. An embedded VS Code preview or in-app browser may not expose Bluetooth. Open the forwarded page in a normal Chrome tab. Codespaces ports can remain private; the browser reaches the ESP32 directly through its own radio, so the ESP32 needs no route into the Codespace. [Chrome Web Bluetooth guide](https://developer.chrome.com/docs/capabilities/bluetooth), [GitHub Codespaces port forwarding](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace).

## First bench test

1. Confirm the board is an original BLE-capable ESP32 variant and note its exact model and USB port. The supplied `test.ino` also uses Classic A2DP/SPP, so the board is likely an original ESP32, but the marking is the reliable check.
2. Flash `firmware/TokiLinkProbe/TokiLinkProbe.ino` using the installed Arduino IDE or CLI. For Arduino IDE, choose the board's actual model and USB port. The probe uses only the ESP32 Arduino core's BLE library; no extra library is required. USB Serial Monitor at **115200 baud** should show `TOKI LINK PROBE v1` and `BLE advertising: Toki Link`.
3. Open this repository in a Codespace. The devcontainer starts a static server on port **3000**. From the Ports tab, open the forwarded URL in a **normal Chrome tab**, not the embedded preview. If needed, run `python3 -m http.server 3000 --bind 0.0.0.0 --directory web` in the repo root.
4. Press **Connect Toki** and choose `Toki Link`. The dashboard should read `TOKI-LINK/1`, show **Connected**, then run the challenge. **Verified** means the device returned the same random eight-character nonce and protocol version `1`.
5. Press **Ping device**. The dashboard should show a round-trip time and continue receiving `L:UP:<seconds>` every five seconds. Download the log for comparison with USB serial.
6. Switch the ESP32 off and on. The dashboard should report disconnection; reconnect and repeat the handshake. This verifies advertising and recovery, not merely one lucky first connection.

### Expected exchange

```text
APP     H:3fa916d2
DEVICE  A:3fa916d2:1
DEVICE  L:HELLO_OK
APP     P:072ef35c
DEVICE  Q:072ef35c
DEVICE  L:PING_OK
DEVICE  L:UP:25
```

The values are random; the important result is that the reply matches the sent challenge. GATT UUIDs are shared by the firmware and `web/app.js`. The probe's frames are capped at 20 ASCII bytes so this first test does not depend on negotiated MTU size.

## Compiling in Codespaces

Run `bash scripts/build-firmware.sh` from the repository root. The script installs Arduino CLI only if missing, installs Espressif's Arduino core **3.3.11**, and compiles for `esp32:esp32:esp32` (ESP32 Dev Module). It exports binaries to `build/`. Confirm the exact board model before flashing. Codespaces normally cannot access a USB-connected board on your desk directly; use the local Arduino IDE/CLI for the first flash. Android Studio is unnecessary.

## Minimal React Native app

The `mobile/` app is deliberately only a connection screen and live log. It performs the same version read, random challenge, and ping as the browser dashboard. It does not yet contain task screens. The app uses `react-native-ble-manager`, so Expo Go cannot run this Bluetooth build.

1. In the Codespace, use the repository's devcontainer with **Node 24**. If this Codespace existed before `.devcontainer/devcontainer.json` was added, rebuild the container once so it uses the new image.
2. Run `cd mobile && npm ci`.
3. Sign in to an Expo account with `npx eas-cli@latest login`, then run `npx eas-cli@latest build --platform android --profile development` from `mobile/`. The development profile produces an installable Android APK through EAS cloud build; Android Studio is not required.
4. Install the APK on a real Android phone. Run `npx expo start --tunnel` from `mobile/` in Codespaces, then open that development project from the installed app. Bluetooth scanning and handshake require the physical phone near the powered ESP32.

The browser dashboard is the faster first check because it does not require an APK. It also helps distinguish a firmware/radio issue from a React Native packaging issue. Once the browser handshake is verified, the native app should return the same challenge and live `L:UP` events.

## Why BLE logs instead of Wi-Fi for this step

The dashboard receives live connection logs over the **same BLE link we need to prove**. Adding Wi-Fi now would create a second radio path and another setup dependency, making it harder to identify a BLE failure. This is a focused connection test. After it works, we can add an optional Wi-Fi log endpoint or a USB/serial bridge for bench debugging, then integrate the same BLE service into the existing motor/e-paper `.ino`. The native app already uses these UUIDs and handshake semantics; its BLE module requires an [Expo development build](https://docs.expo.dev/develop/development-builds/faq/), which EAS can build in the cloud without Android Studio.

## Integration gate after this test

Copy the connection service into a new revision of the real firmware, keeping the current working sketch as a backup. Test BLE plus homing, e-paper, touch, local chime, and finally A2DP in that order. Then add device state, four task records, commands, events, persistence, and acknowledged sync. The first native app screen can be designed from a handshake and device-state flow that has actually been observed.
