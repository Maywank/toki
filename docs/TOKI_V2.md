# Toki working prototype · protocol 2

The object runs on an ESP32 powered separately from the phone. The phone app talks directly to it over BLE. No phone cable or extra BLE module is used. The ESP32 keeps the last four tasks in nonvolatile memory, and its touch controls and timer continue without the app. The app keeps the longer task list on the phone. Wi-Fi is not needed for this build; the Device tab shows live BLE acknowledgements and state, while USB serial at 115200 remains available for bench debugging.

## Hardware pins retained from `test.ino`

| Part | ESP32 pins |
| --- | --- |
| ULN2003 stepper driver | IN1 32, IN2 33, IN3 27, IN4 14 |
| Home switch | GPIO 13, active low, internal pull-up |
| Three TTP223 touch sensors | Left 34, select 35, right 21; active high |
| GxEPD2_290_C90c panel | CS 5, DC 17, RST 16, BUSY 4; default ESP32 SPI SCK 18 and MOSI 23 |
| MAX98357 I²S amplifier | BCK 26, WS 25, DATA 22 |

Use a stable 5 V supply for the motor/ULN2003 and amplifier as appropriate for the actual modules, with a common ground to the ESP32. The ESP32 GPIOs drive the ULN2003 inputs, never the motor coils directly. Confirm the display's voltage and panel marking before power-up. The mechanical home switch must operate before a timer is started; firmware stops and reports `HOME_NOT_FOUND` after 1,024 reverse steps rather than driving indefinitely. There is no automatic motor movement at boot. The Device tab can request a home check after wiring.

## Device interaction

1. Add tasks in the Toki tab. Choose a 5, 10, or 15 minute preset and Now/Next/Later priority. The first four open tasks are the physical queue.
2. Connect on the Device tab. The app reads `TOKI/2`, sends a random challenge, and reads the current queue revision and state before allowing sync.
3. Send the top four. The app waits for an acknowledgement for every record and title chunk. `Stored on Toki` appears only after the final revision is acknowledged.
4. On the object, left/right tap cycles unfinished tasks. Middle tap starts the selected preset. Middle hold (at least 1.2 seconds) marks the task done. Left hold during focus stops the session and leaves the task open.
5. On time-up, the chime sounds and the pointer returns. The task stays open and the display says `TIME UP - OPEN`. Completion always requires a separate explicit action.
6. After reconnect, the app reads the four-slot completion mask and marks any tasks completed on the object while the phone was away.

The e-paper refreshes only after meaningful changes; it does not repaint every second. Motor movement uses one small step at a time in the main loop. The current prototype produces local I²S chimes; Bluetooth music streaming/A2DP is a separate optional experiment and is not enabled in this firmware, so it cannot interfere with the BLE task link.

## BLE wire contract

Service `5ce1f1a0-9e7b-4c35-9e1f-42c1ec923001`; command write `...3002`; event notify `...3003`; info read `...3004`. Every frame is at most 20 ASCII bytes, so the basic BLE MTU is sufficient. Titles are shown on the object as at most 32 ASCII characters; unsupported characters are displayed as `?` there while the phone keeps the full title.

| App write | Device reply / event | Meaning |
| --- | --- | --- |
| `H:1234abcd` | `A:1234abcd:2` | Protocol challenge |
| `R` | `V:revision:count:selected:doneMask`, `F:phase:remainingSeconds` | Readback |
| `B:revision:count` | `K:B:revision` | Begin replacement of at most four tasks |
| `T:slot:id:minutes` | `K:T:slot` | Define one task; ID is eight hex characters |
| `N:slot:part:text` | `K:N:slot:part` | Add one eight-character title chunk |
| `E:revision` | `K:E:revision` then state | Commit and save queue |
| `J:slot` | `K:J:slot` | Select slot |
| `Z:slot:minutes` | `K:Z:slot`; later `F:*` | Start focus |
| `Y` | `K:Y` | Stop without completion |
| `M:slot` | `D:id`, `K:M:slot`, state | Explicit task completion |
| `C` / `O` | `K:C` / `K:O` | Test chime / find home |

Phase letters: `I` ready, `H` homing, `W` winding pointer, `R` running, `U` time up with task open, `B` returning pointer, `E` home fault. The done mask is a bit per slot; this is how the phone reconciles completions made while disconnected. A queue replacement is refused while the pointer is moving or a focus session is running. Sync is a deliberate action so reconnecting cannot overwrite physical completions.

## Build and install

From the Codespace root, run `bash scripts/build-toki.sh`. It compiles `firmware/Toki/Toki.ino` for the confirmed ESP32 Dev Module and exports a `.bin` into `build/toki/`. Keep the existing `firmware/TokiLinkProbe/` for radio troubleshooting. The connected board currently runs that probe; the integrated sketch has not been flashed yet. Flash the integrated sketch only after the home switch and peripherals are wired and checked. USB flashing is only for firmware installation; the phone app uses BLE afterwards.

From `mobile/`, run `npm ci`, `npx expo lint`, `npx tsc --noEmit`, and `npx expo-doctor`. For a standalone Android test APK, sign in to Expo if needed and run `npx eas-cli@latest build --platform android --profile preview`. This runs in Expo's cloud and needs no Android Studio. Install the APK on a real Android phone. Expo Go cannot load the native BLE library. The `development` EAS profile is available if live Metro updates are preferred; from Codespaces run `npx expo start --tunnel` after installing that development client.

The current prototype stores tasks on one phone only. Its BLE transport is designed to be replaceable later by a different task source; multi-phone synchronization and third-party task integrations are future work.
