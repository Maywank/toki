# Toki OTA assessment — 1 October 2026

## Assessment

Routine application-firmware updates can use Wi-Fi without a USB data connection.
There is no automatic internet release service or direct Codespace-to-device push.
Compile in Codespaces or locally, download the application binary, then upload from
a nearby phone/laptop to Toki's authenticated maintenance page. Keep power available.

This is a working prototype updater, not a guarantee that USB recovery will never
be needed. A release that crashes after early boot or removes/breaks the updater
can prevent the next wireless upload. Partition/bootloader changes are outside
this updater's application-only contract.

## Implementation reviewed

- Verified ESP32-D0WD-V3, revision 3.1, 4 MB flash.
- Two 1,966,080-byte OTA application slots and a separate OTA selection partition.
- Upload goes to the inactive application slot; the boot selection changes after
  `Update.end()` verifies the image. Persistent task and Wi-Fi settings are separate.
- Manual maintenance activation via BLE or both outer touch inputs while idle.
- WPA2 device hotspot, authenticated update/health/log endpoints, 15-minute window.
- Browser uploads 4 KB chunks with exact offsets and total-size checks.
- Failed/incomplete images are rejected. Stalled chunk sessions abort after 60 s.
- BLE memory is released during upload and BLE returns after restart.
- Maintenance can be closed explicitly without waiting for the window to expire.
- The optional router-network setup exists but has not been exercised in the
  recorded bench tests. The own-hotspot path has been exercised.

## Evidence and limitations

- Saved real-device results show 3.0.4 installed into the other OTA slot, then
  3.0.5 installed from 3.0.4 into the alternate slot, with successful reboot,
  version/protocol readback and BLE recovery. Stored bench tasks survived.
- The audit update 3.0.5 → 3.0.6 also passed, app0 → app1, with no serial port
  opened by the helper. Upload was accepted in 62.44 seconds; reboot and readback
  took 74.83 seconds in total. Existing queue revision 507, its three task IDs,
  elapsed time and completion mask matched before/after. The device was powered
  throughout; this validates the data path, not battery operation.
- Authentication rejection and an invalid 8-byte image were tested.
- Power loss mid-upload and deliberate crashes in a new application have not been
  physically tested. Inactive-slot behavior provides a design-level safeguard,
  not evidence that these scenarios have been exercised on this unit.
- The Arduino 3.3.11 libraries enable bootloader rollback, but the core's default
  `verifyOta()` returns true during initialization. Toki has no delayed health
  confirmation or application recovery mode. This is not health-based rollback
  protection for faults in Toki setup/loop.
- No release signature, model/protocol compatibility manifest, automatic internet
  delivery, upload resume, or retry of an already accepted chunk is implemented.
  Restart a failed upload from the beginning.
- The 3.0.6 binary is 1,782,944 bytes, leaving 183,136 bytes (about 9.3%) in a slot.
  Future builds need a size gate and must keep the partition layout compatible.
- The build helper requests core 3.3.11 on a new environment; it does not enforce
  that version when a different core is already installed, and GxEPD2 is not pinned.
  Release builds should use the recorded, reviewed toolchain.
- Firmware 3.0.6, this assessment and the app changes are included in the source
  release. Future builds must use the current committed source.

## Audit fix

The updater originally measured the start timeout from when maintenance was opened.
Opening the page and waiting over a minute could abort a newly started upload.
Firmware 3.0.6 refreshes the activity clock at both upload entry points, and during
multipart writes. `scripts/test-ota-timeout.py` runs the actual start-handler and
loop code against a fake clock/HTTP/flash boundary: it failed before the fix and
passed afterward, including the genuine stalled-upload timeout.

The real-device delayed-start check also passed on installed 3.0.6: maintenance
was left open for 65 seconds, then a valid first chunk was accepted. Finishing
this deliberately incomplete image returned a rejection, and `/health` confirmed
the same firmware version and active partition. No serial port was opened.

The Windows bench helper previously opened COM5 for logging unconditionally. It now
uses no serial port by default. `--serial-port COM5` opts into additional diagnostics.
`--wait-before-upload 65 --probe-only` checks the delayed first chunk and deliberately
rejects an incomplete upload without installing an image.

## Future release rules

1. Retain the updater and use the same board/partition layout.
2. Keep application binaries under the slot capacity. Upload only `Toki.ino.bin`.
3. Preserve/migrate stored task and credential data deliberately.
4. Match firmware BLE protocol to the installed app; verify version after reboot.
5. Retest BLE, maintenance entry, upload and restart when changing these components.
6. Keep a known-good binary and USB recovery available. For stronger independence,
   add and test delayed health confirmation/rollback and a recovery mode before
   making major firmware changes.

Technical reference: [Espressif OTA and rollback documentation](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/system/ota.html).
