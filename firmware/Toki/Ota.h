#pragma once
#include <WiFi.h>
#include <WebServer.h>
#include <Update.h>
#include <esp_ota_ops.h>
#include <Preferences.h>

void pauseBleForUpload();
constexpr char FIRMWARE_VERSION[] = "3.0.8";
bool otaBlePaused = false;
WebServer otaWeb(80);
bool otaActive = false, otaUploading = false, otaUploadAccepted = false;
unsigned long otaOpened = 0, otaRebootAt = 0;
size_t otaExpected = 0, otaWritten = 0;
String otaPassword, otaSsid, otaError;
String diagnosticLines[40];
unsigned int diagnosticIndex = 0;
void otaLog(const String &line) {
  if (line.startsWith("WP:")) return;
  diagnosticLines[diagnosticIndex++ % 40] = String(millis()) + " " + line;
}

size_t otaCapacity() {
  const esp_partition_t *next = esp_ota_get_next_update_partition(nullptr);
  return next ? next->size : 0;
}
bool otaAuthenticate() {
  if (otaWeb.authenticate("toki", otaPassword.c_str())) return true;
  otaWeb.requestAuthentication(); return false;
}
void otaInit() {
  Preferences settings; settings.begin("toki-update", false);
  otaPassword = settings.getString("access", "");
  if (otaPassword.length() != 12) {
    char password[13]; snprintf(password, sizeof(password), "%08lx%04lx", (unsigned long)esp_random(), (unsigned long)(esp_random() & 0xffff));
    otaPassword = password; settings.putString("access", otaPassword);
  }
  settings.end();
  otaSsid = "Toki-" + String((uint32_t)ESP.getEfuseMac() & 0xffff, HEX);
  otaWeb.on("/", HTTP_GET, []() {
    if (!otaAuthenticate()) return;
    String page = R"html(<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Toki updates</title><style>body{font:16px system-ui;color:#292824;background:#f5f3ee;max-width:540px;margin:40px auto;padding:24px}h1{font-size:28px}label{display:block;margin-top:18px}input,button{box-sizing:border-box;padding:12px;font:inherit;max-width:100%}button{margin-top:16px;border:0;background:#292824;color:white;border-radius:6px}small{color:#77746e}#result{white-space:pre-wrap}</style><h1>toki</h1><p>Firmware update</p><small>VERSION_TEXT</small><p>Choose the application file <b>Toki.ino.bin</b> exported by the Toki build. Keep Toki powered throughout the upload.</p><input id="firmware" type="file" accept=".bin"><br><button id="upload">Upload firmware</button><p id="result" role="status"></p><button id="close" style="background:#77746e">Close update mode</button><details><summary>Use your Wi-Fi network</summary><form method="post" action="/network"><label>Network name</label><input name="ssid" maxlength="32" required><label>Password</label><input type="password" name="password" maxlength="63"><br><button>Save network</button></form><small>Optional. Toki's own Wi-Fi remains available for updates.</small></details><details id="diagnostics"><summary>Live device log</summary><pre id="logs" style="white-space:pre-wrap"></pre></details><script>document.getElementById("close").onclick=async()=>{document.getElementById("result").textContent=await(await fetch("/close",{method:"POST"})).text()};setInterval(async()=>{if(document.getElementById("diagnostics").open){try{document.getElementById("logs").textContent=await(await fetch("/logs")).text()}catch{}}},2000);document.getElementById('upload').onclick=async()=>{const f=document.getElementById('firmware').files[0],r=document.getElementById('result'),b=document.getElementById('upload');if(!f){r.textContent='Choose the .bin file first.';return}if(f.size>CAPACITY_TEXT){r.textContent='This file is larger than the update partition.';return}b.disabled=true;r.textContent='Uploading…';try{let response=await fetch('/update/start?size='+f.size,{method:'POST'});if(!response.ok)throw Error(await response.text());for(let offset=0;offset<f.size;offset+=4096){response=await fetch('/update/chunk?offset='+offset,{method:'POST',headers:{'Content-Type':'text/plain'},body:Array.from(new Uint8Array(await f.slice(offset,offset+4096).arrayBuffer()),v=>v.toString(16).padStart(2,'0')).join('')});if(!response.ok)throw Error(await response.text());r.textContent='Uploading '+Math.round(Math.min(offset+4096,f.size)/f.size*100)+'%';}response=await fetch('/update/finish',{method:'POST'});r.textContent=await response.text()}catch(e){r.textContent=String(e)+'. Reconnect to Toki and check the version before trying again.'}finally{b.disabled=false}};</script></html>)html";
    page.replace("VERSION_TEXT", String(FIRMWARE_VERSION) + " · TOKI/3 · " + String(ESP.getFlashChipSize() / 1048576) + " MB flash");
    page.replace("CAPACITY_TEXT", String(otaCapacity()));
    otaWeb.sendHeader("Cache-Control", "no-store"); otaWeb.send(200, "text/html", page);
  });
  otaWeb.on("/close", HTTP_POST, []() {
    if (!otaAuthenticate()) return;
    if (otaUploading) { otaWeb.send(409, "text/plain", "Finish the upload first"); return; }
    otaWeb.send(200, "text/plain", "Closing update mode. Toki will restart with Bluetooth available.");
    otaRebootAt = millis() + 1500;
  });
  otaWeb.on("/logs", HTTP_GET, []() {
    if (!otaAuthenticate()) return;
    String text;
    unsigned int first = diagnosticIndex > 40 ? diagnosticIndex - 40 : 0;
    for (unsigned int i = first; i < diagnosticIndex; ++i) text += diagnosticLines[i % 40] + "\n";
    otaWeb.sendHeader("Cache-Control", "no-store"); otaWeb.send(200, "text/plain", text);
  });
  otaWeb.on("/health", HTTP_GET, []() {
    if (!otaAuthenticate()) return;
    const esp_partition_t *running = esp_ota_get_running_partition();
    otaWeb.sendHeader("Cache-Control", "no-store");
    otaWeb.send(200, "application/json", String("{\"version\":\"") + FIRMWARE_VERSION + "\",\"protocol\":3,\"flashBytes\":" + String(ESP.getFlashChipSize()) + ",\"otaCapacity\":" + String(otaCapacity()) + ",\"partition\":\"" + (running ? running->label : "unknown") + "\"}");
  });
  otaWeb.on("/network", HTTP_POST, []() {
    if (!otaAuthenticate()) return;
    String ssid = otaWeb.arg("ssid"), password = otaWeb.arg("password");
    if (!ssid.length() || ssid.length() > 32 || password.length() > 63) { otaWeb.send(400, "text/plain", "Invalid Wi-Fi details."); return; }
    Preferences settings; settings.begin("toki-update", false); settings.putString("ssid", ssid); settings.putString("wifi-pass", password); settings.end();
    WiFi.begin(ssid.c_str(), password.c_str());
    otaWeb.send(200, "text/plain", "Network saved. Toki's update Wi-Fi remains available. Its network address will appear in the Toki app once connected.");
  });
  otaWeb.on("/update/start", HTTP_POST, []() {
    if (!otaAuthenticate()) return;
    if (otaUploading) Update.abort();
    otaExpected = otaWeb.arg("size").toInt(); otaWritten = 0; otaError = ""; otaUploadAccepted = false;
    if (!otaExpected || otaExpected > otaCapacity()) { otaUploading = false; otaWeb.send(400, "text/plain", "Invalid firmware size"); return; }
    pauseBleForUpload();
    otaOpened = millis();
    otaUploading = Update.begin(otaExpected, U_FLASH);
    otaWeb.send(otaUploading ? 200 : 400, "text/plain", otaUploading ? "Ready" : Update.errorString());
    Serial.printf("OTA chunk session started; heap %lu; largest %lu\n", (unsigned long)ESP.getFreeHeap(), (unsigned long)ESP.getMaxAllocHeap());
  });
  otaWeb.on("/update/chunk", HTTP_POST, []() {
    if (!otaAuthenticate()) return;
    if (!otaUploading || otaWeb.arg("offset").toInt() != (int)otaWritten || otaError.length()) { otaWeb.send(400, "text/plain", "Upload offset mismatch; restart upload"); return; }
    String part = otaWeb.arg("plain");
    size_t bytes = part.length() / 2;
    if (!bytes || part.length() % 2 || bytes > 4096 || otaWritten + bytes > otaExpected) { otaWeb.send(400, "text/plain", "Invalid chunk size"); return; }
    for (unsigned int i = 0; i < part.length(); ++i) if (!isxdigit((unsigned char)part[i])) { otaWeb.send(400, "text/plain", "Invalid encoded chunk"); return; }
    uint8_t decoded[128];
    for (size_t offset = 0; offset < bytes; offset += sizeof(decoded)) {
      size_t batch = min(sizeof(decoded), bytes - offset);
      for (size_t i = 0; i < batch; ++i) { char hex[3] = {part[(offset + i) * 2], part[(offset + i) * 2 + 1], 0}; decoded[i] = strtoul(hex, nullptr, 16); }
      size_t count = Update.write(decoded, batch); otaWritten += count;
      if (count != batch) { otaError = Update.errorString(); Update.abort(); otaUploading = false; otaWeb.send(400, "text/plain", otaError); return; }
    }
    otaOpened = millis(); otaWeb.send(200, "text/plain", String(otaWritten));
    if (otaWritten % 65536 < 4096) Serial.printf("OTA %lu / %lu bytes\n", (unsigned long)otaWritten, (unsigned long)otaExpected);
  });
  otaWeb.on("/update/finish", HTTP_POST, []() {
    if (!otaAuthenticate()) return;
    if (!otaUploading || otaWritten != otaExpected || otaError.length()) {
      Update.abort(); otaUploading = false; otaWeb.send(400, "text/plain", "Incomplete upload; restart upload"); return;
    }
    bool verified = Update.end(); otaUploading = false;
    otaWeb.send(verified ? 200 : 400, "text/plain", verified ? "Installed. Toki will restart now." : Update.errorString());
    if (verified) { Serial.println("OTA image verified and installed"); otaRebootAt = millis() + 1500; }
  });
  otaWeb.on("/update", HTTP_POST, []() {
    if (!otaAuthenticate()) return;
    if (!otaUploadAccepted || otaError.length() || Update.hasError()) {
      otaWeb.send(400, "text/plain", "Update rejected: " + (otaError.length() ? otaError : String(Update.errorString()))); return;
    }
    otaWeb.send(200, "text/plain", "Installed. Toki will restart now. Reconnect and check the firmware version.");
    otaRebootAt = millis() + 1500;
  }, []() {
    HTTPUpload &upload = otaWeb.upload();
    if (upload.status == UPLOAD_FILE_START) {
      otaWeb.client().setTimeout(30000);
      otaWeb.client().setNoDelay(true);
      otaUploadAccepted = false; otaError = ""; otaWritten = 0;
      if (!otaWeb.authenticate("toki", otaPassword.c_str())) { otaError = "Authentication required"; return; }
      otaExpected = otaWeb.arg("size").toInt();
      if (!otaExpected || otaExpected > otaCapacity()) { otaError = "Invalid size or missing OTA partition"; return; }
      if (!upload.filename.endsWith(".bin")) { otaError = "Use the Toki application .bin"; return; }
      pauseBleForUpload();
      otaOpened = millis();
      otaUploading = Update.begin(otaExpected, U_FLASH);
      if (!otaUploading) otaError = Update.errorString();
      Serial.println("OTA upload started");
    } else if (upload.status == UPLOAD_FILE_WRITE && otaUploading && !otaError.length()) {
      size_t written = Update.write(upload.buf, upload.currentSize); otaWritten += written;
      otaOpened = millis();
      if (written != upload.currentSize) otaError = Update.errorString();
    } else if (upload.status == UPLOAD_FILE_END && otaUploading) {
      if (otaWritten != otaExpected) { otaError = "Incomplete upload"; Update.abort(); }
      else if (otaError.length()) Update.abort();
      else if (!Update.end()) otaError = Update.errorString();
      else otaUploadAccepted = true;
      otaUploading = false;
      Serial.println(otaUploadAccepted ? "OTA image verified and installed" : "OTA upload failed");
    } else if (upload.status == UPLOAD_FILE_ABORTED) {
      Serial.printf("OTA aborted after %lu of %lu bytes; heap %lu\n", (unsigned long)otaWritten, (unsigned long)otaExpected, (unsigned long)ESP.getFreeHeap());
      Update.abort(); otaUploading = false; otaUploadAccepted = false; otaError = "Upload interrupted";
    }
  });
}
bool otaStart() {
  if (!otaCapacity() || ESP.getFlashChipSize() < 0x400000) return false;
  if (otaActive) { otaOpened = millis(); return true; }
  WiFi.mode(WIFI_AP_STA); WiFi.setSleep(false);
  if (!WiFi.softAP(otaSsid.c_str(), otaPassword.c_str())) { WiFi.mode(WIFI_OFF); return false; }
  Preferences settings; settings.begin("toki-update", true);
  String ssid = settings.getString("ssid", ""), password = settings.getString("wifi-pass", ""); settings.end();
  if (ssid.length()) WiFi.begin(ssid.c_str(), password.c_str());
  otaActive = true; otaOpened = millis(); otaWeb.begin();
  Serial.println("OTA Wi-Fi: " + otaSsid + " · password: " + otaPassword + " · http://192.168.4.1 · user: toki");
  return true;
}
void otaStop() { if (otaUploading) { Update.abort(); otaUploading = false; } otaWeb.stop(); WiFi.mode(WIFI_OFF); otaActive = false; if (otaBlePaused) ESP.restart(); }
void otaLoop() {
  if (!otaActive) return;
  otaWeb.handleClient();
  if (otaUploading && millis() - otaOpened > 60000) { Update.abort(); otaUploading = false; otaError = "Upload timed out"; }
  if (otaRebootAt && (long)(millis() - otaRebootAt) >= 0) ESP.restart();
  if (!otaUploading && !otaRebootAt && millis() - otaOpened > 900000) otaStop();
}
