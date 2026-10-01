# Toki prototype experience

## Direction and sources

Toki gives thoughts room on the phone and makes a small commitment visible on the
desk. The phone captures and arranges; the object helps start, pause and finish.
This follows the two shared conversations (ESP32 LED Blinking Test and Project
Reality Remix), the later Codex product clarification, and the current request.
Historical countdown-driven completion is superseded by explicit completion and
elapsed time. OTA is already implemented and remains the maintenance path.

References:
- https://chatgpt.com/share/6abecbb4-dc3c-83e8-bfcc-51d29791aadc
- https://chatgpt.com/share/6abecbd4-6210-83e8-a5f9-5dca611c4f48
- thread://01a0e764-30b1-70b2-8915-b3f4b231a57e?hostId=local

MUJI/Fukasawa inform restraint, useful physical feedback and the relationship to
a desk. Toki uses its own identity rather than copying another brand's logo.
Warm paper (#f5f3ee), dark ink (#292824) and brick red (#963f32) make a calm,
readable system. Red marks the primary capture action, selected controls and
important attention; it does not classify tasks. Section hierarchy comes from
space, size and font weight, without enclosing every section in a bordered card.
The wordmark is `toki`, without a full stop. Priority uses words and weight.

## App architecture

| Screen | Purpose | Content and actions | States |
| --- | --- | --- | --- |
| Launch | Restore local state | Native logo splash, then brief loading state if needed | Restoring; visible storage error with retry; ready |
| First use | Teach the relationship | Three short pages: write freely; arrange the next four; tap to start / hold to finish / hold left to pause | Next/back/skip; save completion; replay from Device |
| Write (default tab) | Invite thought without an existing list | Large multiline writing space, add task, brief saved acknowledgement | Empty; writing; saved; draft restored |
| Tasks (second tab) | Arrange commitments | Open tasks, drag handle, edit, send next, word-based priority, complete | Empty; next-four queue; sync pending; active task; editing |
| Activity (inside Tasks) | Reflect without pressure | Elapsed time and completed tasks; optional expanded view | No history; history; grouped time by exact normalized title |
| Device (third tab) | Connect and maintain the object | Connection state, signal quality, speaker test, sound output, reminder preference, device guide, existing Wi-Fi updates | Offline; scanning; connecting; connected; update mode |
| Device details (expanded) | Prototype overrides and troubleshooting | Select/start/pause/complete, sync, diagnostics; dial setup only once hardware strategy is settled | Busy disables actions; acknowledgement errors remain visible |

Writing is local-first and does not need Bluetooth. Returning to Write restores
the draft. Adding a task clears the draft only after the task enters local state.
Tasks are stored on the phone; the first four synchronize while Toki is idle.
Reordering retains priority. Priority is a gentle annotation (Later, Normal,
Important), not a hidden queue reorder. The user controls sequence explicitly.
An active task and its controls live in Tasks/Device, keeping Write clear.

Onboarding asks for neither notification nor Bluetooth permission. Permission is
requested only when the user chooses the related action. Returning users keep
their existing task storage and device identity. Onboarding can be skipped and
replayed. A failed storage read must not silently overwrite existing tasks.

## Device architecture (296 × 128 landscape e-paper)

| State | Main content | Indicators | Actions |
| --- | --- | --- | --- |
| Empty | Write your first task | Connection indicator; toki wordmark | Connect/capture in app |
| Ready | Selected task in two large centered lines | Four dots, selected filled; unused dots faint/open; small connection icon | Left/right browse; middle tap starts |
| Running | Same task remains central | Timer icon and elapsed minutes; selected dot; connection icon | Left hold pauses; middle hold completes |
| Paused | Task remains open | Ready/elapsed label | Start again or browse |
| Done | Finished task briefly remains visible | Done acknowledgement and completion chime | Browse next; app reconciles completion |
| Wi-Fi update | Update instruction and address | Wi-Fi maintenance label | Existing authenticated upload; idle only |

The carousel changes on button release and coalesces rapid browsing. The selected
dot represents the displayed slot; a running timer represents that task. No
four-row list, decoration or section rules. Longer device titles retain the
existing 32-byte ASCII transport limit; the full title stays on the phone. Refresh
on task/state/connection changes and elapsed-minute changes. The existing display
worker keeps slow full refreshes out of BLE command handling; the panel's refresh
time is a physical limit, not a phone-style animation.

## Audio and return reminders

Firmware 3.0.6 defines a chime but does not call it for start or completion.
Restore those event cues, expose a speaker test and report audio initialization
or write failure. Existing phone loops do not reach MAX98357: BLE carries commands,
not audio. Built-in device sound and phone A2DP streaming are separate engineering
options; choose the user's requested transport before implementing playback.

Return invitations are optional and silent, with a five- or ten-minute grace.
Record the link level when a task starts; use sustained weakening or disconnect
as a possible interruption, never as proof someone left a room. Use hysteresis,
cancel on recovery/pause/completion/update/manual disconnect, and limit one
invitation per task run. Local notification scheduling can survive backgrounding
after the app detects an interruption; it cannot guarantee observing BLE changes
while the OS suspends or kills the app. This limitation must remain explicit.

## Dial conflict and implementation gate

A software step counter can remember commanded movement; it cannot know physical
position after lost power, missed steps or manual movement. The current board has
no verified home/position sensor. A physical marker is a manual reference, not
electronic position feedback. Do not promise exact autonomous return to zero.

For the marker-only prototype: confirm zero after every restart; mark position
uncertain before movement in persistent storage; invalidate calibration after
interrupted movement; release coils when idle; bound travel; calibrate steps per
turn on the actual assembled dial. Store run state/checkpoints without writing
flash on every step. A later home sensor or encoder permits referenced recovery,
but still needs power-loss, stall and mechanical verification. Motor work awaits
the hardware answer; elapsed task tracking continues independently.

## Recovery and acceptance

Baseline source: `806401240f592b420e847b2451ef909a80164c76` on GitHub.
Local tag: `toki-baseline-8064012`.
The independently retained recovery bundle and firmware are in
`/workspace/toki-recovery/8064012/`. See RECOVERY.md. A source revert does not flash
the physical object or revert a phone installation.

Every stage requires lint, TypeScript, meaningful state tests and an Android
bundle. Device changes additionally require the pinned firmware build, OTA slot
size check and existing OTA timeout regression. Keep partition layout and protocol
3 compatibility. Physical acceptance requires the actual phone/device: audible
start/completion/test cues; two-line readable carousel; notifications at the
chosen grace with cancellation; queue retained across reboot and Wi-Fi update.
Do not call physical behavior verified from a cloud compilation.
