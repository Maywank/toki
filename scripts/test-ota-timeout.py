"""Run the real OTA start handler and loop with a fake clock/HTTP/flash boundary.

Requires g++ (available in Codespaces). No device, serial connection or flash writes.
"""
import pathlib
import subprocess

root = pathlib.Path(__file__).resolve().parents[1]
source = (root / 'firmware/Toki/Ota.h').read_text()

def body_after(marker):
    start = source.index('{', source.index(marker))
    depth = 1
    end = start + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start + 1:end - 1]

start_body = body_after('otaWeb.on("/update/start"')
loop_body = body_after('void otaLoop()')
fixture = r'''
#include <cstdio>
#include <cstdlib>
#include <string>
#include <cassert>
unsigned long now = 0;
unsigned long millis() { return now; }
bool otaActive = true, otaUploading = false, otaUploadAccepted = false;
unsigned long otaOpened = 0, otaRebootAt = 0;
size_t otaExpected = 0, otaWritten = 0;
std::string otaError;
constexpr int U_FLASH = 0;
size_t otaCapacity() { return 1966080; }
bool otaAuthenticate() { return true; }
void pauseBleForUpload() {}
void otaStop() { otaActive = false; }
struct {
    bool begin(size_t, int) { return true; }
    void abort() {}
    const char* errorString() { return "flash error"; }
} Update;
struct {
    struct Arg { long toInt() { return 4096; } };
    Arg arg(const char*) { return {}; }
    template <typename... T> void send(T...) {}
    void handleClient() {}
} otaWeb;
struct { template <typename... T> void printf(T...) {} } Serial;
struct {
    unsigned long getFreeHeap() { return 100000; }
    unsigned long getMaxAllocHeap() { return 20000; }
    void restart() {}
} ESP;
void startUpload() { START_BODY }
void loopOnce() { LOOP_BODY }
int main() {
    // User opens maintenance, then spends over a minute choosing the file.
    now = 65000;
    startUpload();
    loopOnce();
    assert(otaUploading && "A new upload must not inherit the page's old timer");
    now += 59999;
    loopOnce();
    assert(otaUploading && "A fresh upload gets its own 60-second timeout");
    now += 2;
    loopOnce();
    assert(!otaUploading && "A stalled upload must still expire");
    puts("PASS: delayed start is accepted; stalled upload still expires.");
}
'''.replace('START_BODY', start_body).replace('LOOP_BODY', loop_body)
directory = root / 'build/ota-timeout-test'
directory.mkdir(parents=True, exist_ok=True)
cpp = directory / 'test.cpp'
cpp.write_text(fixture)
binary = directory / 'test'
subprocess.run(['g++', '-std=c++11', str(cpp), '-o', str(binary)], check=True)
subprocess.run([str(binary)], check=True)
