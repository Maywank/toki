"""Execute the sketch's real cue generation and task event handlers on a host.

Only I2S, RTOS, time and BLE/NVS boundaries are faked. No physical hardware writes.
"""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
source = (root / 'firmware/Toki/Toki.ino').read_text()

def function(marker):
    start = source.index(marker)
    cursor = source.index('{', start) + 1
    depth = 1
    while depth:
        depth += (source[cursor] == '{') - (source[cursor] == '}')
        cursor += 1
    return source[start:cursor]

fixture = r'''
#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include <deque>
using std::min;
constexpr float PI = 3.14159265358979323846f;
struct String {
    std::string value;
    String(const char* text) : value(text) {}
    String(int number) : value(std::to_string(number)) {}
    String(const std::string& text) : value(text) {}
    operator std::string() const { return value; }
};
String operator+(const char* a, const String& b) { return std::string(a) + b.value; }
String operator+(const String& a, const char* b) { return a.value + b; }
String operator+(const String& a, const String& b) { return a.value + b.value; }
unsigned long now = 1000;
unsigned long millis() { return now; }
void delay(int) {}
constexpr int pdTRUE = 1, portMAX_DELAY = -1;
int pdMS_TO_TICKS(int n) { return n; }
void vTaskDelay(int) {}
struct StopWorker {};
std::deque<uint8_t> cues;
using QueueHandle_t = void*;
QueueHandle_t audioRequests = reinterpret_cast<void*>(1);
bool audioReady = true;
int xQueueSend(QueueHandle_t, uint8_t* value, int timeout) {
    assert(timeout == 0 && "Cue submission must not block BLE");
    if (cues.size() >= 4) return 0;
    cues.push_back(*value); return pdTRUE;
}
int xQueueReceive(QueueHandle_t, uint8_t* value, int) {
    if (cues.empty()) throw StopWorker{};
    *value = cues.front(); cues.pop_front(); return pdTRUE;
}
struct {
    std::vector<int16_t> samples;
    int calls = 0;
    bool fail = false;
    size_t write(const uint8_t* bytes, size_t size) {
        ++calls;
        if (fail) return 0;
        const auto* data = reinterpret_cast<const int16_t*>(bytes);
        samples.insert(samples.end(), data, data + size / 2); return size;
    }
} audio;
struct { void println(const char*) {} } Serial;
struct Task { char id[9]; uint32_t elapsedSeconds; };
struct SavedQueue { uint8_t count, selected, doneMask; Task tasks[4]; };
SavedQueue queue = {}, completionQueue = {};
enum Phase : char { IDLE = 'I', RUNNING = 'R' };
Phase phase = IDLE;
bool receiving = false, otaActive = false;
unsigned long timerStarted = 0, lastElapsedSave = 0, lastMinutePaint = 0, donePaintUntil = 0;
int lastDoneSlot = -1;
std::vector<std::string> frames;
void send(const String& text) { frames.push_back(text); }
void err(const char* text) { frames.push_back(std::string("E:") + text); }
bool canSave = true;
bool saveQueue() { return canSave; }
void sendState() {}
void dirtyScreen() {}
bool validSlot(int slot) { return slot >= 0 && slot < queue.count && !(queue.doneMask & (1 << slot)); }
unsigned long elapsedSeconds() { return queue.tasks[queue.selected].elapsedSeconds + (phase == RUNNING ? (now - timerStarted)/1000 : 0); }
void setPhase(Phase value) { phase = value; }
REAL_FUNCTIONS
void drain() { try { audioWorker(nullptr); } catch(const StopWorker&) {} }
int main() {
    assert(beep(523, 110));
    assert(audio.samples.size() == 16000 * 110 / 1000 * 2);
    assert(audio.samples.front() == 0 && "The cue must fade in");
    for (size_t i = 0; i < audio.samples.size(); i += 2)
        assert(audio.samples[i] == audio.samples[i+1] && "Either MAX98357 channel selection must receive audio");
    audio.calls = 0; audio.samples.clear();
    queue.count = 1; std::strcpy(queue.tasks[0].id, "0123abcd");
    startTask(0, 0);
    assert(phase == RUNNING && cues.size() == 1 && cues.front() == 0);
    assert(audio.calls == 0 && frames.back() == "K:Z:0" && "Start must acknowledge before playback");
    now += 5000; completeTask(0);
    assert(phase == IDLE && queue.doneMask == 1 && queue.tasks[0].elapsedSeconds == 5);
    assert(cues.size() == 2 && cues.back() == 1 && "Explicit completion queues its own cue");
    assert(audio.calls == 0 && "Completion must acknowledge without synchronous playback");
    drain();
    assert(audioReady && audio.samples.size() == 2 * ((1760+2720)*2+256));
    for (size_t i = audio.samples.size()-256; i < audio.samples.size(); ++i) assert(audio.samples[i] == 0);
    audio.fail = true; audio.calls = 0;
    assert(requestChime(false)); drain();
    assert(!audioReady && audio.calls == 1 && "An I2S failure must be reported and stop further writes");
    assert(!requestChime(true) && "An unavailable speaker must not report an accepted cue");
    audioReady = true; audio.fail = false; cues.assign(4, 0);
    assert(!requestChime(false) && "A full cue queue must fail without waiting");
    cues.clear(); queue.doneMask = 0; phase = IDLE; frames.clear();
    startTask(0, 7);
    assert(phase == IDLE && cues.empty() && frames.back() == "E:BAD_TASK");
    queue.doneMask = 0; phase = IDLE; canSave = false; frames.clear();
    startTask(0, 0);
    assert(phase == IDLE && cues.empty() && frames.back() == "E:SAVE_FAILED");
    canSave = true; startTask(0, 0); cues.clear();
    auto elapsedBefore = queue.tasks[0].elapsedSeconds;
    auto startedBefore = timerStarted;
    now += 4000; canSave = false; completeTask(0);
    assert(phase == RUNNING && !queue.doneMask && cues.empty());
    assert(queue.tasks[0].elapsedSeconds == elapsedBefore && timerStarted == startedBefore);
    assert(frames.back() == "E:SAVE_FAILED");
    stopTask();
    assert(phase == RUNNING && timerStarted == startedBefore && frames.back() == "E:SAVE_FAILED");
    canSave = true; completeTask(0);
    assert(phase == IDLE && queue.doneMask && queue.tasks[0].elapsedSeconds == elapsedBefore+4);
    std::puts("PASS: start/finish cues acknowledge before playback; stereo/fades, silence, queue limits and I2S failures checked.");
}
'''
functions = '\n'.join(function(marker) for marker in ['bool beep(', 'bool requestChime(', 'void audioWorker(', 'void startTask(', 'void completeTask(', 'void stopTask('])
folder = root / 'build/speaker-test'
folder.mkdir(parents=True, exist_ok=True)
cpp = folder / 'test.cpp'
cpp.write_text(fixture.replace('REAL_FUNCTIONS', functions))
binary = folder / 'test'
subprocess.run(['g++', '-std=c++17', str(cpp), '-o', str(binary)], check=True)
subprocess.run([str(binary)], check=True)
