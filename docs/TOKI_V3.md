# Toki: notes, the object, and wireless updates

The phone holds the full task list. Toki holds four tasks, tracks time and completion independently, and connects directly over BLE. Expo Go cannot load the BLE module; install the preview APK. Android Studio is unnecessary.

## Everyday use

- Write a task and press Enter or +. No duration or priority form.
- Hold the handle at the left to drag tasks into order. The first four unfinished tasks sync automatically when connected and idle. Edits made during a task wait until pause/completion.
- The task menu's **Send next** moves an item to the front. The list order determines priority.
- On the object: left/right selects an unfinished task; middle tap starts tracking time; middle hold for 1.2 seconds marks it done; left hold pauses it. Starting does not itself complete the task.
- Completion appears in Activity. Time by task combines titles after normalizing case and whitespace; this is exact-title grouping, not semantic inference.
- The object stores elapsed time on pause/completion and every 30 seconds. Sudden power loss can lose up to the most recent 30 seconds. After a restart the task is paused.
- Paper and Window are original generated audio loops bundled with the app. Music plays on the phone's selected audio output. The ESP32 plays local I²S chimes; it is not an A2DP speaker. Spotify remote control is not configured.
- RSSI indicates BLE link quality, not reliable distance or user presence.

## Hardware and pins

Verified board: ESP32-D0WD-V3 revision 3.1, 4 MB flash, Wi-Fi and Bluetooth.

| Function | GPIO |
| --- | --- |
| TTP223 left / middle / right, active high | 34 / 35 / 21 |
| GxEPD2_290_C90c CS / DC / RST / BUSY | 5 / 17 / 16 / 4 |
| SPI clock / MOSI | 18 / 23 |
| MAX98357 BCK / WS / DATA | 26 / 25 / 22 |
| Existing ULN2003 inputs, released low | 32 / 33 / 27 / 14 |

The home switch is removed. This firmware does not move the stepper because it has no verified position reference. The physical pointer therefore needs a separate agreed calibration strategy before it can be enabled. Display, touch, task timing, completion and BLE remain independent of the motor.

The existing three-colour e-paper driver takes about 20 seconds per full refresh on this prototype. A separate FreeRTOS worker owns the display so that this wait no longer blocks BLE acknowledgements. It renders a landscape four-row list, selected indicator, completion checkboxes, and elapsed time. The display does not refresh every second.

## Firmware installation and OTA

The first install must include the bootloader and OTA partition table over USB. Keep `Toki.ino`, `Ota.h` and `partitions.csv` together inside a folder called `Toki`. Arduino IDE: ESP32 Dev Module, core 3.3.11, **Minimal SPIFFS (1.9 MB APP with OTA)**. Install GxEPD2. The build command is:

```sh
bash scripts/build-toki.sh
```

This compiles with `esp32:esp32:esp32:PartitionScheme=min_spiffs`. Each firmware slot is 1,966,080 bytes. All future releases must retain this OTA code and compatible partitions.

After that install, power Toki independently; a phone USB cable is unnecessary:

1. Pause/finish the task. In the app's Toki tab choose **Enable Wi-Fi update**. Alternatively hold both outer touch buttons for three seconds while idle.
2. Join the `Toki-…` Wi-Fi network using the password shown in the app (also printed on local serial when enabled).
3. Open `http://192.168.4.1`. Username is `toki`; password is the same device password.
4. Upload **`Toki.ino.bin`** from `build/toki/`. Do not upload a merged image, bootloader or partitions file. Source `.ino` files must first be compiled to this application `.bin`.
5. Keep power connected. After success Toki restarts. Reconnect BLE and verify the firmware version in the app.

The protected maintenance page includes live device logs. Its optional Wi-Fi form supports ordinary SSID/password networks, not WPA2-Enterprise campus authentication. Toki's own access point works without internet. Download the firmware binary before joining it. A Codespace compiles the code; a browser on a nearby phone/laptop uploads it to the physical device.

Wi-Fi starts only when requested and closes after 15 idle minutes. Bluetooth advertising pauses during maintenance; the Bluetooth stack releases its memory when an upload starts. Bluetooth returns after reboot. Use **Close update mode** on the web page to exit maintenance without waiting. Before an upload starts, a still-connected app can also close update mode. Interrupted chunk sessions abort after 60 seconds without a new chunk. Updates write the inactive partition and reject missing/oversized/truncated/invalid images. Authentication protects uploads and diagnostics. This prototype does not implement firmware signatures or automatic recovery from a valid but faulty application. Keep the USB recovery option and retain OTA in future builds.

## Protocol 3

GATT service `5ce1f1a0-9e7b-4c35-9e1f-42c1ec923001`, command `…3002`, notifications `…3003`, info `…3004`. Frames are ASCII, at most 20 bytes. The phone retains full titles; the display uses 32 ASCII characters.

| Command/event | Meaning |
| --- | --- |
| INFO `TOKI/3`, `H:<nonce>` → `A:<nonce>:3` | Version and challenge handshake |
| `P:<nonce>` → `Q:<nonce>` | Ping |
| `R` → state, then `K:R` | Explicit complete-read marker |
| `B:<revision>:<count>` → `K:B:<revision>` | Begin atomic four-slot queue replacement |
| `T:<slot>:<id>:0` → `K:T:<slot>` | Eight-hex task ID, no duration |
| `S:<slot>:<seconds>` → `K:S:<slot>` | Seed tracked time from the app |
| `N:<slot>:<part>:<text>` → `K:N:<slot>:<part>` | Eight-character title chunks |
| `E:<revision>` → `K:E:<revision>` | Commit only after nonvolatile storage succeeds |
| `J:<slot>` / `Z:<slot>:0` / `Y` / `M:<slot>` | Select / start / pause / complete, acknowledged with corresponding `K:` |
| `V:<revision>:<count>:<selected>:<doneMask>` | Queue state |
| `F:I:<seconds>` / `F:R:<seconds>` | Idle/running, accumulated time for selected task |
| `X:<id>:<seconds>` / `D:<id>` | Per-task accumulated time / completion |
| `U` / `u` → `K:U` / `K:u` | Enable / close Wi-Fi maintenance |
| `WN:` / `WP:` / `WI:` / `WS:` / `WU:` | Maintenance SSID/password/AP address/network address/enabled |
| `CB:` / `CI:` / `CF:` | Firmware version / chip / flash bytes |

An acknowledged queue commit is considered saved even if a later readback fails. Refresh waits for `K:R`, not the first fragment. Protocol 2 APKs and protocol 3 firmware are incompatible: install the matching updated APK. App data uses the existing storage key and retains old tasks during migration.

## Build and checks

```sh
cd mobile
npm ci
npx tsc --noEmit
npx expo lint
npx expo export --platform android
npx eas-cli@latest build --platform android --profile preview
```

Use Node 24 (the devcontainer is configured for it). The preview APK is self-contained and does not need Metro or Expo Go. Bench helpers require `bleak`, `pyserial` and `requests`; `scripts/test-device.py` is read-only unless `--write-test` is requested, and refuses to replace a nonempty queue. `scripts/test-ota-windows.py` temporarily joins Toki's network, tests an OTA upload and restores the previous Wi-Fi profile. Disconnect the phone before a laptop BLE test.
