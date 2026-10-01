# Recover the prototype baseline

Known baseline: [8064012](https://github.com/Maywank/toki/commit/806401240f592b420e847b2451ef909a80164c76),
app 1.1.0 (Android versionCode 2), firmware 3.0.6, protocol 3.

The cloud workspace retains a local tag `toki-baseline-8064012` and an independent
source bundle at `/workspace/toki-recovery/8064012/source.bundle`. To inspect the
baseline without destroying current work, commit/stash changes first and create
a separate branch from that tag (`git switch -c inspect-baseline toki-baseline-8064012`).
For a shared branch, revert the later change commits rather than resetting main.
The baseline can also be retrieved from GitHub if this cloud workspace disappears.

The verified application binary is
`/workspace/toki-recovery/8064012/Toki-3.0.6.bin` (1,782,928 bytes).
SHA-256: `f3874ea537b23321c3a7ffb480fbcaae889aeb72f1573725a7c5045f9183e520`.
The accompanying `partitions.csv` records the unchanged two-slot OTA layout.
Retain/download these artifacts before deleting this environment.

To restore device firmware, use the existing Device → Firmware updates flow:
pause the task, enable Wi-Fi update, connect the nearby phone/laptop to Toki's
Wi-Fi, open the authenticated upload page and upload this application `.bin`.
Cloud builds can supply the file; they cannot reach the private access point
from this machine. Keep USB recovery available if the installed firmware cannot
open update mode. Do not upload a bootloader or partition binary for routine OTA.

A Git revert alone does not downgrade the phone APK or device. Install the prior
APK separately or rebuild app 1.1.0 from the baseline (Android may require an
uninstall for a versionCode downgrade; export valuable data before uninstalling).
The retained binary restores firmware, not previous NVS contents. Existing
protocol-3 queue/storage formats must remain compatible in subsequent work.
