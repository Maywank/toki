#include <Arduino.h>
#include <Stepper.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <GxEPD2_3C.h>
#include <Fonts/FreeMonoBold9pt7b.h>
#include <ESP_I2S.h>

// Toki protocol 2. The phone talks only to this ESP32 over BLE.
// Keep these pins aligned with the original test.ino and the assembled harness.
constexpr int IN1 = 32, IN2 = 33, IN3 = 27, IN4 = 14;
constexpr int HOME_SWITCH = 13;
constexpr int LEFT_BUTTON = 34, SELECT_BUTTON = 35, RIGHT_BUTTON = 21;
constexpr int EPD_CS = 5, EPD_DC = 17, EPD_RST = 16, EPD_BUSY = 4;
constexpr int I2S_BCK = 26, I2S_WS = 25, I2S_DATA = 22;
constexpr long STEPS_5 = 256, STEPS_10 = 512, STEPS_15 = 768;
constexpr int HOME_SPEED = 3, WIND_SPEED = 5, UNWIND_SPEED = 3;
constexpr char SERVICE_UUID[] = "5ce1f1a0-9e7b-4c35-9e1f-42c1ec923001";
constexpr char COMMAND_UUID[] = "5ce1f1a0-9e7b-4c35-9e1f-42c1ec923002";
constexpr char EVENT_UUID[] = "5ce1f1a0-9e7b-4c35-9e1f-42c1ec923003";
constexpr char INFO_UUID[] = "5ce1f1a0-9e7b-4c35-9e1f-42c1ec923004";

struct Task { char id[9]; char title[33]; uint8_t minutes; };
struct SavedQueue { uint32_t magic; uint16_t revision; uint8_t count; uint8_t selected; uint8_t doneMask; Task tasks[4]; };
constexpr uint32_t QUEUE_MAGIC = 0x544F4B32;
SavedQueue queue = {};
SavedQueue incoming = {};
bool receiving = false;
Preferences prefs;

enum Phase : char { IDLE = 'I', HOMING = 'H', WINDING = 'W', RUNNING = 'R', TIME_UP = 'U', RETURNING = 'B', FAULT = 'E' };
Phase phase = IDLE;
Stepper motor(2048, IN1, IN3, IN2, IN4);
long currentSteps = 0, targetSteps = 0;
unsigned long homingSteps = 0, timerStarted = 0, timerDuration = 0;
bool motorKnown = false;
bool calibrationOnly = false, returnToTimeUp = false;
bool screenDirty = true;
unsigned long screenDue = 0, lastStatus = 0;
bool previousConnected = false;
volatile bool connected = false;
BLEServer *server = nullptr;
BLECharacteristic *events = nullptr;
QueueHandle_t commands = nullptr;
GxEPD2_3C<GxEPD2_290_C90c, GxEPD2_290_C90c::HEIGHT> display(GxEPD2_290_C90c(EPD_CS, EPD_DC, EPD_RST, EPD_BUSY));
I2SClass audio;

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
  Serial.println(frame);
  if (!connected || !events || frame.length() > 20) return;
  events->setValue(frame.c_str());
  events->notify();
}
void err(const char *reason) { send(String("E:") + reason); }
void saveQueue() { prefs.putBytes("queue", &queue, sizeof(queue)); }
bool validSlot(int slot) { return slot >= 0 && slot < queue.count && !(queue.doneMask & (1 << slot)); }
int nextSlot(int from) {
  for (int offset = 0; offset < queue.count; ++offset) {
    int slot = (from + offset) % queue.count;
    if (validSlot(slot)) return slot;
  }
  return -1;
}
void dirtyScreen(unsigned long delayMs = 250) { screenDirty = true; screenDue = millis() + delayMs; }
unsigned long remainingSeconds() {
  if (phase != RUNNING) return phase == WINDING ? timerDuration / 1000 : 0;
  unsigned long elapsed = millis() - timerStarted;
  return elapsed >= timerDuration ? 0 : (timerDuration - elapsed + 999) / 1000;
}
void sendState() {
  send("V:" + String(queue.revision) + ":" + String(queue.count) + ":" + String(queue.selected) + ":" + String(queue.doneMask));
  delay(20); // Leave room for both notifications on a default BLE connection.
  send("F:" + String((char)phase) + ":" + String(remainingSeconds()));
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
void releaseMotor() {
  digitalWrite(IN1, LOW); digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW); digitalWrite(IN4, LOW);
}
void setPhase(Phase next) {
  phase = next;
  send("F:" + String((char)phase) + ":" + String(remainingSeconds()));
  dirtyScreen();
}
void startReturn() {
  if (!motorKnown) { setPhase(IDLE); return; }
  returnToTimeUp = phase == TIME_UP;
  setPhase(RETURNING);
}
void startHoming(bool calibrate = false) {
  calibrationOnly = calibrate;
  if (digitalRead(HOME_SWITCH) == LOW) {
    currentSteps = 0; motorKnown = true; homingSteps = 0;
    setPhase(calibrationOnly ? IDLE : WINDING);
  } else {
    motor.setSpeed(HOME_SPEED); homingSteps = 0; setPhase(HOMING);
  }
}
void startTask(int slot, int minutes) {
  if (!validSlot(slot) || (minutes != 5 && minutes != 10 && minutes != 15)) { err("BAD_TASK"); return; }
  if (phase == HOMING || phase == WINDING || phase == RUNNING || phase == RETURNING) { err("BUSY"); return; }
  queue.selected = slot; saveQueue();
  returnToTimeUp = false;
  timerDuration = (unsigned long)minutes * 60000UL;
  targetSteps = minutes == 5 ? STEPS_5 : minutes == 10 ? STEPS_10 : STEPS_15;
  startHoming(false);
  send("K:Z:" + String(slot));
}
void completeTask(int slot) {
  if (!validSlot(slot)) { err("BAD_TASK"); return; }
  if (phase == HOMING || phase == WINDING || phase == RETURNING) { err("BUSY"); return; }
  queue.doneMask |= (1 << slot);
  String id = queue.tasks[slot].id;
  int next = nextSlot(slot + 1);
  queue.selected = next < 0 ? 0 : next;
  saveQueue();
  send("D:" + id);
  send("K:M:" + String(slot));
  sendState();
  if (phase == RUNNING || phase == TIME_UP) { startReturn(); returnToTimeUp = false; }
  else dirtyScreen();
}
void drawScreen() {
  screenDirty = false;
  display.setFullWindow();
  display.firstPage();
  do {
    display.fillScreen(GxEPD_WHITE);
    display.setTextColor(GxEPD_BLACK);
    display.setFont(&FreeMonoBold9pt7b);
    display.setCursor(8, 25);
    display.print("TOKI  ");
    display.print(queue.count ? String(queue.selected + 1) + "/" + String(queue.count) : String("READY"));
    display.drawLine(8, 34, 285, 34, GxEPD_BLACK);
    display.setCursor(8, 60);
    String title = queue.count && validSlot(queue.selected) ? String(queue.tasks[queue.selected].title) : String("Add a task");
    display.print(title.substring(0, 24));
    if (title.length() > 24) { display.setCursor(8, 80); display.print(title.substring(24)); }
    display.setCursor(8, 113);
    if (phase == RUNNING) display.print("FOCUSING");
    else if (phase == TIME_UP) display.print("TIME UP - OPEN");
    else if (phase == FAULT) display.print("CHECK HOME");
    else if (phase == HOMING || phase == WINDING || phase == RETURNING) display.print("MOVING");
    else display.print("READY");
  } while (display.nextPage());
  display.hibernate();
  Serial.println("DISPLAY updated");
}
bool hexId(const String &id) {
  if (id.length() != 8) return false;
  for (unsigned i = 0; i < id.length(); ++i) if (!isxdigit((unsigned char)id[i])) return false;
  return true;
}
void handleCommand(const String &raw) {
  Serial.println("RX " + raw);
  if (raw.startsWith("H:") && hexId(raw.substring(2))) { send("A:" + raw.substring(2) + ":2"); return; }
  if (raw.startsWith("P:") && hexId(raw.substring(2))) { send("Q:" + raw.substring(2)); return; }
  if (raw == "R") { sendState(); return; }
  if (raw == "C") { chime(false); send("K:C"); return; }
  if (raw == "O") { if (phase != IDLE && phase != TIME_UP) { err("BUSY"); return; } startHoming(true); send("K:O"); return; }
  if (raw == "Y") {
    if (phase != RUNNING && phase != TIME_UP) { err("NOT_RUNNING"); return; }
    startReturn(); send("K:Y"); return;
  }
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
    if (colon < 0 || phase == RUNNING || phase == HOMING || phase == WINDING || phase == RETURNING) { err("BUSY"); return; }
    int revision = raw.substring(2, colon).toInt(), count = raw.substring(colon + 1).toInt();
    if (revision < 1 || revision > 65535 || count < 0 || count > 4) { err("FORMAT"); return; }
    incoming = {}; incoming.magic = QUEUE_MAGIC; incoming.revision = revision; incoming.count = count;
    receiving = true; send("K:B:" + String(revision)); return;
  }
  if (raw.startsWith("T:") && receiving) {
    int c1 = raw.indexOf(':', 2), c2 = raw.indexOf(':', c1 + 1);
    if (c1 < 0 || c2 < 0) { err("FORMAT"); return; }
    int slot = raw.substring(2, c1).toInt();
    String id = raw.substring(c1 + 1, c2);
    int minutes = raw.substring(c2 + 1).toInt();
    if (slot < 0 || slot >= incoming.count || !hexId(id) || (minutes != 5 && minutes != 10 && minutes != 15)) { err("FORMAT"); return; }
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
    queue = incoming; receiving = false; saveQueue(); dirtyScreen();
    send("K:E:" + String(queue.revision)); sendState(); return;
  }
  err("BAD_COMMAND");
}
void stepMotor() {
  if (phase == HOMING) {
    if (digitalRead(HOME_SWITCH) == LOW) {
      motorKnown = true; currentSteps = 0; setPhase(calibrationOnly ? IDLE : WINDING); return;
    }
    if (homingSteps++ >= 1024) { motorKnown = false; releaseMotor(); setPhase(FAULT); err("HOME_NOT_FOUND"); return; }
    motor.setSpeed(HOME_SPEED); motor.step(-1); return;
  }
  if (phase == WINDING) {
    if (currentSteps < targetSteps) { motor.setSpeed(WIND_SPEED); motor.step(1); ++currentSteps; return; }
    releaseMotor(); timerStarted = millis(); setPhase(RUNNING); return;
  }
  if (phase == RUNNING) {
    unsigned long elapsed = millis() - timerStarted;
    if (elapsed >= timerDuration) { chime(true); setPhase(TIME_UP); startReturn(); return; }
    long desired = targetSteps - (long)((uint64_t)targetSteps * elapsed / timerDuration);
    if (currentSteps > desired) { motor.setSpeed(UNWIND_SPEED); motor.step(-1); --currentSteps; }
    return;
  }
  if (phase == RETURNING) {
    if (digitalRead(HOME_SWITCH) == LOW || currentSteps <= 0) { currentSteps = 0; releaseMotor(); setPhase(returnToTimeUp ? TIME_UP : IDLE); return; }
    motor.setSpeed(HOME_SPEED); motor.step(-1); --currentSteps;
  }
}
void pollButtons() {
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
    else if (i == 0 && held >= 1200 && phase == RUNNING) { startReturn(); send("K:Y"); }
    else if (held < 1200 && i == 1 && validSlot(queue.selected) && phase == IDLE) startTask(queue.selected, queue.tasks[queue.selected].minutes);
    else if (held < 1200 && phase == IDLE && queue.count) {
      int next = nextSlot((queue.selected + (i == 0 ? queue.count - 1 : 1)) % queue.count);
      if (next >= 0) { queue.selected = next; saveQueue(); dirtyScreen(450); sendState(); }
    }
  }
}
void setup() {
  Serial.begin(115200);
  pinMode(HOME_SWITCH, INPUT_PULLUP);
  pinMode(LEFT_BUTTON, INPUT); pinMode(SELECT_BUTTON, INPUT); pinMode(RIGHT_BUTTON, INPUT);
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  releaseMotor();
  prefs.begin("toki", false);
  if (prefs.getBytesLength("queue") == sizeof(queue)) prefs.getBytes("queue", &queue, sizeof(queue));
  if (queue.magic != QUEUE_MAGIC || queue.count > 4 || queue.selected > 3) { queue = {}; queue.magic = QUEUE_MAGIC; saveQueue(); }
  display.init(115200); display.setRotation(3);
  audio.setPins(I2S_BCK, I2S_WS, I2S_DATA);
  if (!audio.begin(I2S_MODE_STD, 16000, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO))
    Serial.println("ERROR: I2S audio did not start");
  commands = xQueueCreate(24, sizeof(Command));
  BLEDevice::init("Toki Link");
  server = BLEDevice::createServer(); server->setCallbacks(new ConnectionCallbacks());
  BLEService *service = server->createService(SERVICE_UUID);
  BLECharacteristic *command = service->createCharacteristic(COMMAND_UUID, BLECharacteristic::PROPERTY_WRITE);
  command->setCallbacks(new CommandCallbacks());
  events = service->createCharacteristic(EVENT_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  events->addDescriptor(new BLE2902());
  BLECharacteristic *info = service->createCharacteristic(INFO_UUID, BLECharacteristic::PROPERTY_READ);
  info->setValue("TOKI/2");
  service->start();
  BLEAdvertising *advertising = server->getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID); advertising->setScanResponse(true); advertising->start();
  Serial.println("TOKI/2 READY; BLE advertising Toki Link");
  chime(false);
}
void loop() {
  if (connected != previousConnected) {
    previousConnected = connected;
    if (!connected) { delay(100); server->startAdvertising(); Serial.println("BLE advertising restarted"); }
    else Serial.println("BLE connected");
  }
  Command command;
  if (xQueueReceive(commands, &command, 0) == pdTRUE) handleCommand(command.text);
  pollButtons();
  stepMotor();
  if (screenDirty && (long)(millis() - screenDue) >= 0) drawScreen();
  if (connected && millis() - lastStatus >= 5000) { lastStatus = millis(); send("F:" + String((char)phase) + ":" + String(remainingSeconds())); }
  delay(4);
}
