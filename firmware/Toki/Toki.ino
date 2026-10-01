#include <Arduino.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <GxEPD2_3C.h>
#include <Fonts/FreeMonoBold9pt7b.h>
#include <ESP_I2S.h>
#include "Ota.h"

// Toki protocol 3. The phone talks directly to this ESP32 over BLE.
// The current enclosure has no home switch, so the stepper is deliberately unused.
constexpr int LEFT_BUTTON = 34, SELECT_BUTTON = 35, RIGHT_BUTTON = 21;
constexpr int EPD_CS = 5, EPD_DC = 17, EPD_RST = 16, EPD_BUSY = 4;
constexpr int I2S_BCK = 26, I2S_WS = 25, I2S_DATA = 22;
constexpr char SERVICE_UUID[] = "5ce1f1a0-9e7b-4c35-9e1f-42c1ec923001";
constexpr char COMMAND_UUID[] = "5ce1f1a0-9e7b-4c35-9e1f-42c1ec923002";
constexpr char EVENT_UUID[] = "5ce1f1a0-9e7b-4c35-9e1f-42c1ec923003";
constexpr char INFO_UUID[] = "5ce1f1a0-9e7b-4c35-9e1f-42c1ec923004";

struct Task { char id[9]; char title[33]; uint8_t minutes; uint32_t elapsedSeconds; };
struct SavedQueue { uint32_t magic; uint16_t revision; uint8_t count; uint8_t selected; uint8_t doneMask; Task tasks[4]; };
constexpr uint32_t QUEUE_MAGIC = 0x544F4B33;
SavedQueue queue = {};
SavedQueue incoming = {};
SavedQueue completionQueue = {};
bool receiving = false;
unsigned long receivingAt = 0;
Preferences prefs;

enum Phase : char { IDLE = 'I', RUNNING = 'R' };
Phase phase = IDLE;
unsigned long timerStarted = 0, lastElapsedSave = 0, lastMinutePaint = 0;
int lastDoneSlot = -1;
unsigned long donePaintUntil = 0;
bool screenDirty = true;
unsigned long screenDue = 0, lastStatus = 0;
bool previousConnected = false;
bool previousOtaActive = false;
volatile bool connected = false;
BLEServer *server = nullptr;
BLECharacteristic *events = nullptr;
QueueHandle_t commands = nullptr;
struct DisplaySnapshot { SavedQueue data; char phase; uint32_t seconds; bool done; bool updating; };
QueueHandle_t displayRequests = nullptr;
GxEPD2_3C<GxEPD2_290_C90c, GxEPD2_290_C90c::HEIGHT> display(GxEPD2_290_C90c(EPD_CS, EPD_DC, EPD_RST, EPD_BUSY));
I2SClass audio;

void pauseBleForUpload() {
  if (otaBlePaused) return;
  connected = false; previousConnected = false; otaBlePaused = true;
  BLEDevice::deinit(true); events = nullptr; server = nullptr;
  Serial.printf("BLE paused for Wi-Fi update; heap %lu; largest %lu\n", (unsigned long)ESP.getFreeHeap(), (unsigned long)ESP.getMaxAllocHeap());
}
struct Command { char text[21]; };
class ConnectionCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *) override { connected = true; }
  void onDisconnect(BLEServer *) override { connected = false; }
};
class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    String value = characteristic->getValue();
    if (!commands || value.length() == 0 || value.length() > 20) return;
    Command command = {};
    value.toCharArray(command.text, sizeof(command.text));
    xQueueSend(commands, &command, 0);
  }
};

void send(const String &frame) {
  Serial.println(frame); otaLog(frame);
  if (!connected || !events || frame.length() > 20) return;
  events->setValue(frame.c_str());
  events->notify();
}
void err(const char *reason) { send(String("E:") + reason); }
bool saveQueue() { return prefs.putBytes("queue", &queue, sizeof(queue)) == sizeof(queue); }
bool validSlot(int slot) { return slot >= 0 && slot < queue.count && !(queue.doneMask & (1 << slot)); }
int nextSlot(int from) {
  for (int offset = 0; offset < queue.count; ++offset) {
    int slot = (from + offset) % queue.count;
    if (validSlot(slot)) return slot;
  }
  return -1;
}
void dirtyScreen(unsigned long delayMs = 250) { screenDirty = true; screenDue = millis() + delayMs; }
unsigned long elapsedSeconds() {
  if (queue.selected >= queue.count) return 0;
  return queue.tasks[queue.selected].elapsedSeconds + (phase == RUNNING ? (millis() - timerStarted) / 1000 : 0);
}
void sendState() {
  send("V:" + String(queue.revision) + ":" + String(queue.count) + ":" + String(queue.selected) + ":" + String(queue.doneMask));
  delay(20); // Leave room for both notifications on a default BLE connection.
  send("F:" + String((char)phase) + ":" + String(elapsedSeconds()));
  for (int slot = 0; slot < queue.count; ++slot) {
    delay(20);
    send("X:" + String(queue.tasks[slot].id) + ":" + String(queue.tasks[slot].elapsedSeconds + ((phase == RUNNING && slot == queue.selected) ? (millis() - timerStarted) / 1000 : 0)));
  }
  if (otaActive) {
    delay(20); send("WN:" + otaSsid); delay(20); send("WP:" + otaPassword);
    delay(20); send("WI:" + WiFi.softAPIP().toString());
    if (WiFi.status() == WL_CONNECTED) { delay(20); send("WS:" + WiFi.localIP().toString()); }
  }
  delay(20); send("WU:" + String(otaActive ? 1 : 0));
  delay(20); send("CB:" + String(FIRMWARE_VERSION));
  delay(20); send("CI:" + String(ESP.getChipModel()));
  delay(20); send("CF:" + String(ESP.getFlashChipSize()));
  delay(20); send("K:R");
}
void beep(int hz, int ms) {
  const int sampleRate = 16000;
  const int count = sampleRate * ms / 1000;
  int16_t stereo[128 * 2];
  for (int base = 0; base < count; base += 128) {
    int batch = min(128, count - base);
    for (int i = 0; i < batch; ++i) {
      int16_t value = (int16_t)(6500.0f * sinf(2.0f * PI * hz * (base + i) / sampleRate));
      stereo[2 * i] = value; stereo[2 * i + 1] = value;
    }
    audio.write((const uint8_t *)stereo, batch * 2 * sizeof(int16_t));
  }
}
void chime(bool finished) {
  beep(finished ? 880 : 523, 110);
  delay(35);
  beep(finished ? 1175 : 784, 170);
}
void setPhase(Phase next) {
  phase = next;
  send("F:" + String((char)phase) + ":" + String(elapsedSeconds()));
  dirtyScreen();
}
void startTask(int slot, int minutes) {
  if (!validSlot(slot) || (minutes != 0 && minutes != 5 && minutes != 10 && minutes != 15)) { err("BAD_TASK"); return; }
  if (phase == RUNNING || receiving || otaActive) { err("BUSY"); return; }
  queue.selected = slot; saveQueue();
  timerStarted = millis(); lastElapsedSave = timerStarted; lastMinutePaint = elapsedSeconds() / 60;
  lastDoneSlot = -1;
  setPhase(RUNNING);
  send("K:Z:" + String(slot));
}
void completeTask(int slot) {
  if (!validSlot(slot)) { err("BAD_TASK"); return; }
  if (phase == RUNNING && slot != queue.selected) { err("ACTIVE_TASK"); return; }
  if (phase == RUNNING && slot == queue.selected) {
    queue.tasks[slot].elapsedSeconds += (millis() - timerStarted) / 1000;
    timerStarted = millis();
  }
  queue.doneMask |= (1 << slot);
  String id = queue.tasks[slot].id;
  queue.selected = slot;
  saveQueue();
  phase = IDLE;
  completionQueue = queue;
  lastDoneSlot = slot; donePaintUntil = millis() + 25000;
  send("X:" + id + ":" + String(queue.tasks[slot].elapsedSeconds)); delay(20);
  send("D:" + id);
  delay(20);
  send("K:M:" + String(slot));
  sendState();
  dirtyScreen();
}
void stopTask() {
  if (phase != RUNNING || queue.selected >= queue.count) { err("NOT_RUNNING"); return; }
  queue.tasks[queue.selected].elapsedSeconds += (millis() - timerStarted) / 1000;
  timerStarted = millis(); saveQueue();
  setPhase(IDLE); send("K:Y"); sendState();
}
void drawScreen() {
  screenDirty = false;
  if (!displayRequests) return;
  bool showDone = lastDoneSlot >= 0 && phase == IDLE && !otaActive;
  DisplaySnapshot snapshot = {showDone ? completionQueue : queue, (char)phase, (uint32_t)elapsedSeconds(), showDone, otaActive};
  xQueueOverwrite(displayRequests, &snapshot);
}
void displayWorker(void *) {
  display.init(115200); display.setRotation(3);
  DisplaySnapshot snapshot;
  for (;;) {
    if (xQueueReceive(displayRequests, &snapshot, portMAX_DELAY) != pdTRUE) continue;
    display.setFullWindow(); display.firstPage();
    do {
    display.fillScreen(GxEPD_WHITE);
    display.setTextColor(GxEPD_BLACK);
    display.setFont(&FreeMonoBold9pt7b);
    display.setCursor(8, 20); display.print("toki.");
    display.setFont(nullptr); display.setTextSize(1);
    display.setCursor(194, 13);
    display.print(snapshot.updating ? "WI-FI UPDATE" : snapshot.done ? "DONE" : snapshot.phase == 'R' ? "IN PROGRESS" : "READY");
    display.drawLine(8, 27, 287, 27, GxEPD_BLACK);
    for (int slot = 0; slot < snapshot.data.count; ++slot) {
      int y = 36 + slot * 18;
      display.drawRect(8, y, 9, 9, GxEPD_BLACK);
      if (snapshot.data.doneMask & (1 << slot)) { display.drawLine(9, y + 4, 12, y + 7, GxEPD_BLACK); display.drawLine(12, y + 7, 16, y + 1, GxEPD_BLACK); }
      if (slot == snapshot.data.selected) display.fillTriangle(22, y + 1, 22, y + 8, 27, y + 4, GxEPD_BLACK);
      display.setCursor(33, y + 1); display.print(snapshot.data.tasks[slot].title);
    }
    if (!snapshot.data.count) { display.setCursor(8, 48); display.print("Write your first task in the Toki app."); }
    display.drawLine(8, 109, 287, 109, GxEPD_BLACK); display.setCursor(8, 116);
    if (snapshot.updating) display.print("Open http://192.168.4.1 on Toki Wi-Fi");
    else if (snapshot.phase == 'R') { char time[24]; snprintf(time, sizeof(time), "Time spent %lu:%02lu", (unsigned long)snapshot.seconds / 60, (unsigned long)snapshot.seconds % 60); display.print(time); }
    else display.print(snapshot.done ? "Completed. Choose the next task." : "< Previous    OK Start    Next >");
    } while (display.nextPage());
    display.hibernate(); Serial.println("DISPLAY updated");
  }
}
bool hexId(const String &id) {
  if (id.length() != 8) return false;
  for (unsigned i = 0; i < id.length(); ++i) if (!isxdigit((unsigned char)id[i])) return false;
  return true;
}
void handleCommand(const String &raw) {
  Serial.println("RX " + raw); otaLog("RX " + raw);
  if (receiving) receivingAt = millis();
  if (raw.startsWith("H:") && hexId(raw.substring(2))) { send("A:" + raw.substring(2) + ":3"); return; }
  if (raw.startsWith("P:") && hexId(raw.substring(2))) { send("Q:" + raw.substring(2)); return; }
  if (raw == "R") { sendState(); return; }
  if (raw == "C") { chime(false); send("K:C"); return; }
  if (raw == "U") {
    if (phase == RUNNING || receiving) { err("BUSY"); return; }
    if (!otaStart()) { err("OTA_UNAVAILABLE"); return; }
    saveQueue(); send("K:U"); sendState(); dirtyScreen(); return;
  }
  if (raw == "u") { otaStop(); send("K:u"); dirtyScreen(); return; }
  if (raw == "O") { err("NO_HOME_SENSOR"); return; }
  if (raw == "Y") { stopTask(); return; }
  if (raw.startsWith("J:")) {
    int slot = raw.substring(2).toInt();
    if (!validSlot(slot) || phase == RUNNING) { err("BAD_SLOT"); return; }
    queue.selected = slot; saveQueue(); dirtyScreen(); send("K:J:" + String(slot)); sendState(); return;
  }
  if (raw.startsWith("Z:")) {
    int colon = raw.indexOf(':', 2);
    if (colon < 0) { err("FORMAT"); return; }
    startTask(raw.substring(2, colon).toInt(), raw.substring(colon + 1).toInt()); return;
  }
  if (raw.startsWith("M:")) { completeTask(raw.substring(2).toInt()); return; }
  if (raw.startsWith("B:")) {
    int colon = raw.indexOf(':', 2);
    if (colon < 0 || phase == RUNNING || otaActive) { err("BUSY"); return; }
    int revision = raw.substring(2, colon).toInt(), count = raw.substring(colon + 1).toInt();
    if (revision < 1 || revision > 65535 || count < 0 || count > 4) { err("FORMAT"); return; }
    incoming = {}; incoming.magic = QUEUE_MAGIC; incoming.revision = revision; incoming.count = count;
    receiving = true; receivingAt = millis(); send("K:B:" + String(revision)); return;
  }
  if (raw.startsWith("S:") && receiving) {
    int colon = raw.indexOf(':', 2); int slot = raw.substring(2, colon).toInt();
    if (colon < 0 || slot < 0 || slot >= incoming.count) { err("FORMAT"); return; }
    incoming.tasks[slot].elapsedSeconds = strtoul(raw.substring(colon + 1).c_str(), nullptr, 10);
    send("K:S:" + String(slot)); return;
  }
  if (raw.startsWith("T:") && receiving) {
    int c1 = raw.indexOf(':', 2), c2 = raw.indexOf(':', c1 + 1);
    if (c1 < 0 || c2 < 0) { err("FORMAT"); return; }
    int slot = raw.substring(2, c1).toInt();
    String id = raw.substring(c1 + 1, c2);
    int minutes = raw.substring(c2 + 1).toInt();
    if (slot < 0 || slot >= incoming.count || !hexId(id) || (minutes != 0 && minutes != 5 && minutes != 10 && minutes != 15)) { err("FORMAT"); return; }
    id.toCharArray(incoming.tasks[slot].id, 9);
    incoming.tasks[slot].minutes = minutes;
    send("K:T:" + String(slot)); return;
  }
  if (raw.startsWith("N:") && receiving) {
    int c1 = raw.indexOf(':', 2), c2 = raw.indexOf(':', c1 + 1);
    if (c1 < 0 || c2 < 0) { err("FORMAT"); return; }
    int slot = raw.substring(2, c1).toInt(), part = raw.substring(c1 + 1, c2).toInt();
    String chunk = raw.substring(c2 + 1);
    if (slot < 0 || slot >= incoming.count || part < 0 || part > 3 || chunk.length() > 8) { err("FORMAT"); return; }
    for (unsigned i = 0; i < chunk.length(); ++i) incoming.tasks[slot].title[part * 8 + i] = chunk[i];
    send("K:N:" + String(slot) + ":" + String(part)); return;
  }
  if (raw.startsWith("E:") && receiving) {
    int revision = raw.substring(2).toInt();
    if (revision != incoming.revision) { err("REVISION"); return; }
    for (int i = 0; i < incoming.count; ++i) if (!hexId(incoming.tasks[i].id) || !incoming.tasks[i].title[0]) { err("INCOMPLETE"); return; }
    for (int i = 0; i < incoming.count; ++i) for (int j = 0; j < queue.count; ++j)
      if (strcmp(incoming.tasks[i].id, queue.tasks[j].id) == 0) incoming.tasks[i].elapsedSeconds = max(incoming.tasks[i].elapsedSeconds, queue.tasks[j].elapsedSeconds);
    SavedQueue previous = queue; queue = incoming;
    if (!saveQueue()) { queue = previous; receiving = false; err("SAVE_FAILED"); return; }
    receiving = false; dirtyScreen();
    send("K:E:" + String(queue.revision)); sendState(); return;
  }
  err("BAD_COMMAND");
}
void pollButtons() {
  static unsigned long updateHoldAt = 0;
  if (digitalRead(LEFT_BUTTON) && digitalRead(RIGHT_BUTTON) && phase == IDLE) {
    if (!updateHoldAt) updateHoldAt = millis();
    if (millis() - updateHoldAt >= 3000 && !otaActive) { if (otaStart()) dirtyScreen(); }
    return;
  }
  updateHoldAt = 0;
  if (receiving || otaActive) return;
  static bool previous[3] = {false, false, false};
  static unsigned long downAt[3] = {0, 0, 0};
  static unsigned long debounceAt[3] = {0, 0, 0};
  const int pins[3] = {LEFT_BUTTON, SELECT_BUTTON, RIGHT_BUTTON};
  for (int i = 0; i < 3; ++i) {
    bool pressed = digitalRead(pins[i]) == HIGH;
    if (pressed == previous[i] || millis() - debounceAt[i] < 60) continue;
    debounceAt[i] = millis(); previous[i] = pressed;
    if (pressed) { downAt[i] = millis(); continue; }
    unsigned long held = millis() - downAt[i];
    if (i == 1 && held >= 1200 && validSlot(queue.selected)) completeTask(queue.selected);
    else if (i == 0 && held >= 1200 && phase == RUNNING) stopTask();
    else if (held < 1200 && i == 1 && validSlot(queue.selected) && phase == IDLE) startTask(queue.selected, 0);
    else if (held < 1200 && i != 1 && phase == IDLE && queue.count) {
      int next = nextSlot((queue.selected + (i == 0 ? queue.count - 1 : 1)) % queue.count);
      if (next >= 0) { queue.selected = next; lastDoneSlot = -1; saveQueue(); dirtyScreen(450); sendState(); }
    }
  }
}
void setup() {
  Serial.begin(115200);
  pinMode(LEFT_BUTTON, INPUT); pinMode(SELECT_BUTTON, INPUT); pinMode(RIGHT_BUTTON, INPUT);
  prefs.begin("toki", false);
  if (prefs.getBytesLength("queue") == sizeof(queue)) prefs.getBytes("queue", &queue, sizeof(queue));
  if (queue.magic != QUEUE_MAGIC || queue.count > 4 || queue.selected > 3) { queue = {}; queue.magic = QUEUE_MAGIC; saveQueue(); }
  // Release the unused motor driver inputs; no home sensor is assumed.
  for (int pin : {32, 33, 27, 14}) { pinMode(pin, OUTPUT); digitalWrite(pin, LOW); }
  otaInit();
  audio.setPins(I2S_BCK, I2S_WS, I2S_DATA);
  if (!audio.begin(I2S_MODE_STD, 16000, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO))
    Serial.println("ERROR: I2S audio did not start");
  commands = xQueueCreate(24, sizeof(Command));
  displayRequests = xQueueCreate(1, sizeof(DisplaySnapshot));
  xTaskCreatePinnedToCore(displayWorker, "toki-display", 8192, nullptr, 1, nullptr, 1);
  BLEDevice::init("Toki Link");
  server = BLEDevice::createServer(); server->setCallbacks(new ConnectionCallbacks());
  BLEService *service = server->createService(SERVICE_UUID);
  BLECharacteristic *command = service->createCharacteristic(COMMAND_UUID, BLECharacteristic::PROPERTY_WRITE);
  command->setCallbacks(new CommandCallbacks());
  events = service->createCharacteristic(EVENT_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  events->addDescriptor(new BLE2902());
  BLECharacteristic *info = service->createCharacteristic(INFO_UUID, BLECharacteristic::PROPERTY_READ);
  info->setValue("TOKI/3");
  service->start();
  BLEAdvertising *advertising = server->getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID); advertising->setScanResponse(true); advertising->start();
  Serial.println("TOKI/3 READY; BLE advertising Toki Link; firmware " + String(FIRMWARE_VERSION));
  Serial.printf("CHIP %s; flash %lu; OTA slot %lu\n", ESP.getChipModel(), (unsigned long)ESP.getFlashChipSize(), (unsigned long)otaCapacity());
  chime(false);
}
void loop() {
  if (connected != previousConnected) {
    previousConnected = connected;
    if (!connected && !otaActive && server) { delay(100); server->startAdvertising(); Serial.println("BLE advertising restarted"); }
    else Serial.println("BLE connected");
  }
  Command command;
  if (xQueueReceive(commands, &command, 0) == pdTRUE) handleCommand(command.text);
  pollButtons();
  otaLoop();
  if (previousOtaActive != otaActive) {
    previousOtaActive = otaActive;
    if (otaActive && server) BLEDevice::getAdvertising()->stop();
    else if (!connected && server) server->startAdvertising();
    send("WU:" + String(otaActive ? 1 : 0)); dirtyScreen();
  }
  if (receiving && millis() - receivingAt > 30000) { receiving = false; Serial.println("Incomplete sync discarded"); }
  if (screenDirty && (long)(millis() - screenDue) >= 0) drawScreen();
  if (phase == RUNNING && millis() - lastElapsedSave >= 30000) {
    queue.tasks[queue.selected].elapsedSeconds += (millis() - timerStarted) / 1000;
    timerStarted = millis(); lastElapsedSave = millis(); saveQueue();
  }
  if (phase == RUNNING && elapsedSeconds() / 60 != lastMinutePaint) { lastMinutePaint = elapsedSeconds() / 60; dirtyScreen(); }
  if (connected && millis() - lastStatus >= 5000) { lastStatus = millis(); send("F:" + String((char)phase) + ":" + String(elapsedSeconds())); }
  if (lastDoneSlot >= 0 && (long)(millis() - donePaintUntil) >= 0) { lastDoneSlot = -1; dirtyScreen(); }
  delay(4);
}
