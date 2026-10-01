# Toki

Toki brings four tasks onto a physical desk object. The React Native app is its notebook and control surface: write tasks, drag them into order, and track completion and time on the ESP32 over BLE.

## Current build

- App 1.1: simple capture, automatic top-four sync, task ordering, elapsed-time activity, bundled quiet music, RSSI and Wi-Fi update controls.
- Firmware 3.0.5 / TOKI protocol 3: direct BLE, independent touch controls, persistent task state, asynchronous e-paper, local chimes, authenticated Wi-Fi firmware uploads and live logs.
- Verified hardware: ESP32-D0WD-V3 with 4 MB flash. The removed home switch means the motor is currently released and inactive.

**[Use, wiring, OTA, protocol and build instructions](docs/TOKI_V3.md)**

The firmware sketch is `firmware/Toki/` (keep all three source files together). The Expo app is `mobile/`. Compile firmware with `bash scripts/build-toki.sh`; build the Android preview APK with EAS using the existing project configuration. Use Node 24 in Codespaces. No Android Studio is needed.

Install the matching new APK and firmware together. Firmware updates use a compiled application `.bin`; uploading `.ino` source is not supported. After USB installation of the OTA partition table, future updates can use Toki's Wi-Fi access point from a nearby browser.

## Earlier experiments

[Protocol 2](docs/TOKI_V2.md) and [the original radio probe](docs/LINK_PROBE.md) are historical references, not the current installation procedure. The web probe dashboard targets protocol 1 and does not operate current task firmware.
