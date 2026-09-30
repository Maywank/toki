#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// Connection-only probe. Flash this instead of test.ino for the first BLE test.
// No motor, e-paper, Classic SPP, A2DP, or Wi-Fi code runs in this sketch.
static const char *SERVICE_UUID = "5ce1f1a0-9e7b-4c35-9e1f-42c1ec923001";
static const char *COMMAND_UUID = "5ce1f1a0-9e7b-4c35-9e1f-42c1ec923002";
static const char *EVENT_UUID = "5ce1f1a0-9e7b-4c35-9e1f-42c1ec923003";
static const char *INFO_UUID = "5ce1f1a0-9e7b-4c35-9e1f-42c1ec923004";

struct Command {
  char text[21]; // The probe protocol is deliberately limited to 20 ASCII bytes.
};

BLEServer *server = nullptr;
BLECharacteristic *eventCharacteristic = nullptr;
QueueHandle_t commandQueue = nullptr;
volatile bool deviceConnected = false;
bool previousConnected = false;
unsigned long lastHeartbeat = 0;

class ConnectionCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *) override { deviceConnected = true; }
  void onDisconnect(BLEServer *) override { deviceConnected = false; }
};

class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    String value = characteristic->getValue();
    Command command = {};
    if (value.length() == 0 || value.length() > 20 || commandQueue == nullptr) return;
    value.toCharArray(command.text, sizeof(command.text));
    xQueueSend(commandQueue, &command, 0);
  }
};

void sendFrame(const String &frame) {
  Serial.println(frame);
  if (!deviceConnected || eventCharacteristic == nullptr) return;
  eventCharacteristic->setValue(frame.c_str());
  eventCharacteristic->notify();
}

bool validNonce(const String &nonce) {
  if (nonce.length() != 8) return false;
  for (unsigned int i = 0; i < nonce.length(); ++i) {
    char ch = nonce[i];
    if (!((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f'))) return false;
  }
  return true;
}

void handleCommand(const char *raw) {
  String input(raw);
  Serial.print("RX ");
  Serial.println(input);

  if (input.startsWith("H:") && validNonce(input.substring(2))) {
    String nonce = input.substring(2);
    sendFrame("A:" + nonce + ":1"); // ACK includes challenge and protocol version.
    sendFrame("L:HELLO_OK");
    return;
  }
  if (input.startsWith("P:") && validNonce(input.substring(2))) {
    sendFrame("Q:" + input.substring(2));
    sendFrame("L:PING_OK");
    return;
  }
  sendFrame("E:BAD_COMMAND");
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("TOKI LINK PROBE v1");
  Serial.print("Chip: ");
  Serial.println(ESP.getChipModel());

  commandQueue = xQueueCreate(8, sizeof(Command));
  if (commandQueue == nullptr) {
    Serial.println("ERROR: command queue allocation failed");
    return;
  }

  BLEDevice::init("Toki Link");
  server = BLEDevice::createServer();
  server->setCallbacks(new ConnectionCallbacks());
  BLEService *service = server->createService(SERVICE_UUID);

  BLECharacteristic *commandCharacteristic = service->createCharacteristic(
    COMMAND_UUID, BLECharacteristic::PROPERTY_WRITE);
  commandCharacteristic->setCallbacks(new CommandCallbacks());

  eventCharacteristic = service->createCharacteristic(
    EVENT_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  eventCharacteristic->addDescriptor(new BLE2902());

  BLECharacteristic *infoCharacteristic = service->createCharacteristic(
    INFO_UUID, BLECharacteristic::PROPERTY_READ);
  infoCharacteristic->setValue("TOKI-LINK/1");

  service->start();
  BLEAdvertising *advertising = server->getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->start();
  Serial.println("BLE advertising: Toki Link");
}

void loop() {
  if (commandQueue == nullptr) {
    delay(1000);
    return;
  }

  if (deviceConnected != previousConnected) {
    previousConnected = deviceConnected;
    if (deviceConnected) {
      Serial.println("BLE connected");
    } else {
      Serial.println("BLE disconnected");
      delay(250);
      server->startAdvertising();
      Serial.println("BLE advertising restarted");
    }
  }

  Command command;
  while (xQueueReceive(commandQueue, &command, 0) == pdTRUE) {
    handleCommand(command.text);
  }

  if (deviceConnected && millis() - lastHeartbeat >= 5000) {
    lastHeartbeat = millis();
    sendFrame("L:UP:" + String(millis() / 1000));
  }
  delay(10);
}
