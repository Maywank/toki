# Toki

Toki brings four tasks onto a physical desk object. The React Native app is its notebook and control surface: write tasks, drag them into order, and track completion and time on the ESP32 over BLE.

## Current build

- App 1.2 prototype: separate Write / Tasks / Device tabs, retained writing drafts, task ordering and light priority, first-use guide, original logo and splash, and optional return invitations.
- Firmware 3.0.8 / TOKI protocol 3: one large task with four carousel positions, timer/link indicators, restored start/finish speaker cues and explicit storage/audio errors. Center/right touch GPIOs match the enclosure wiring (21/35). Existing authenticated Wi-Fi uploads and partitions are retained.
- Verified hardware: ESP32-D0WD-V3 with 4 MB flash. The removed home switch means the motor is currently released and inactive.

**[Use, wiring, OTA, protocol and build instructions](docs/TOKI_V3.md)**

[Detailed app/device architecture and remaining hardware decisions](docs/EXPERIENCE.md)
· [Recover the verified 8064012 / firmware 3.0.6 baseline](docs/RECOVERY.md).
The new prototype has passed cloud builds and state tests; it still needs a signed
APK and physical acceptance. Music transport and the dial reference are undecided.

The firmware sketch is `firmware/Toki/` (keep all three source files together). The Expo app is `mobile/`. Compile firmware with `bash scripts/build-toki.sh`; build the Android preview APK with EAS using the existing project configuration. Use Node 24 in Codespaces. No Android Studio is needed.

Install the matching new APK and firmware together. Firmware updates use a compiled application `.bin`; uploading `.ino` source is not supported. After USB installation of the OTA partition table, future updates can use Toki's Wi-Fi access point from a nearby browser.

## Earlier experiments

[Protocol 2](docs/TOKI_V2.md) and [the original radio probe](docs/LINK_PROBE.md) are historical references, not the current installation procedure. The web probe dashboard targets protocol 1 and does not operate current task firmware.
