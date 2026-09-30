const SERVICE_UUID = "5ce1f1a0-9e7b-4c35-9e1f-42c1ec923001";
const COMMAND_UUID = "5ce1f1a0-9e7b-4c35-9e1f-42c1ec923002";
const EVENT_UUID = "5ce1f1a0-9e7b-4c35-9e1f-42c1ec923003";
const INFO_UUID = "5ce1f1a0-9e7b-4c35-9e1f-42c1ec923004";
const decoder = new TextDecoder();
const encoder = new TextEncoder();
const $ = (id) => document.getElementById(id);

let device = null;
let commandCharacteristic = null;
let eventCharacteristic = null;
let handshakeOk = false;
let pending = new Map();
let lines = [];

function record(direction, message) {
  const line = `${new Date().toLocaleTimeString()}  ${direction.padEnd(7)} ${message}`;
  lines.push(line);
  if (lines.length > 500) lines.shift();
  $("log").textContent = lines.join("\n");
  $("log").scrollTop = $("log").scrollHeight;
}

function setStatus(message, kind = "") {
  $("status").textContent = message;
  $("status").className = `status ${kind}`;
}

function setHandshake(message, kind = "") {
  $("handshake-status").textContent = message;
  $("handshake-status").className = `status ${kind}`;
}

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function clearPending(reason) {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(new Error(reason));
  }
  pending.clear();
}

function onDisconnected() {
  clearPending("Toki disconnected");
  commandCharacteristic = null;
  eventCharacteristic = null;
  handshakeOk = false;
  setStatus("Disconnected", "bad");
  setHandshake("Waiting");
  $("detail").textContent = "The device is out of range or was switched off. You can reconnect.";
  $("connect").disabled = false;
  $("disconnect").disabled = true;
  $("handshake").disabled = true;
  $("ping").disabled = true;
  record("LINK", "Disconnected");
}

function onEvent(event) {
  const frame = decoder.decode(event.target.value);
  record("DEVICE", frame);
  const [type, nonce, version] = frame.split(":");
  if (type === "A" && pending.has(`A:${nonce}`)) {
    const entry = pending.get(`A:${nonce}`);
    pending.delete(`A:${nonce}`);
    clearTimeout(entry.timer);
    version === "1" ? entry.resolve(frame) : entry.reject(new Error(`Unsupported protocol ${version}`));
  } else if (type === "Q" && pending.has(`Q:${nonce}`)) {
    const entry = pending.get(`Q:${nonce}`);
    pending.delete(`Q:${nonce}`);
    clearTimeout(entry.timer);
    entry.resolve(frame);
  }
}

async function exchange(command, replyKey) {
  if (!commandCharacteristic) throw new Error("Connect Toki first");
  if (pending.has(replyKey)) throw new Error("A request is already waiting");
  let resolveReply;
  let rejectReply;
  const reply = new Promise((resolve, reject) => {
    resolveReply = resolve;
    rejectReply = reject;
  });
  const timer = setTimeout(() => {
    pending.delete(replyKey);
    rejectReply(new Error("No matching reply in 5 seconds"));
  }, 5000);
  pending.set(replyKey, { resolve: resolveReply, reject: rejectReply, timer });
  record("APP", command);
  try {
    const data = encoder.encode(command);
    if (commandCharacteristic.writeValueWithResponse) {
      await commandCharacteristic.writeValueWithResponse(data);
    } else {
      await commandCharacteristic.writeValue(data);
    }
    return await reply;
  } catch (error) {
    const entry = pending.get(replyKey);
    if (entry) {
      pending.delete(replyKey);
      clearTimeout(entry.timer);
      // A failed write must not leave an unhandled rejection behind.
      reply.catch(() => {});
      entry.reject(error);
    }
    throw error;
  }
}

async function handshake() {
  const nonce = randomNonce();
  setHandshake("Checking…");
  try {
    const started = performance.now();
    await exchange(`H:${nonce}`, `A:${nonce}`);
    handshakeOk = true;
    setHandshake("Verified", "good");
    $("ping").disabled = false;
    $("latency").textContent = `Handshake round trip: ${Math.round(performance.now() - started)} ms`;
  } catch (error) {
    handshakeOk = false;
    setHandshake("Failed", "bad");
    $("ping").disabled = true;
    record("ERROR", error.message);
  }
}

async function connect() {
  if (!navigator.bluetooth) {
    setStatus("Unsupported", "bad");
    $("detail").textContent = "Open this page directly in Chrome over HTTPS or localhost. Embedded previews and some browsers cannot use Web Bluetooth.";
    return;
  }
  $("connect").disabled = true;
  setStatus("Choosing…");
  try {
    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
      optionalServices: [SERVICE_UUID]
    });
    device.addEventListener("gattserverdisconnected", onDisconnected);
    $("device-name").textContent = device.name || "Toki Link";
    setStatus("Connecting…");
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    commandCharacteristic = await service.getCharacteristic(COMMAND_UUID);
    eventCharacteristic = await service.getCharacteristic(EVENT_UUID);
    const infoCharacteristic = await service.getCharacteristic(INFO_UUID);
    eventCharacteristic.addEventListener("characteristicvaluechanged", onEvent);
    await eventCharacteristic.startNotifications();
    const info = decoder.decode(await infoCharacteristic.readValue());
    record("LINK", `Connected; device reports ${info}`);
    if (info !== "TOKI-LINK/1") throw new Error(`Unexpected device protocol: ${info}`);
    setStatus("Connected", "good");
    $("detail").textContent = "Bluetooth link is open. Verifying the device handshake…";
    $("disconnect").disabled = false;
    $("handshake").disabled = false;
    await handshake();
    $("detail").textContent = handshakeOk
      ? "The ESP32 returned the correct challenge. Live events are flowing below."
      : "Bluetooth connected, but the handshake failed. Check the log and retry.";
  } catch (error) {
    record("ERROR", error.message);
    setStatus("Connection failed", "bad");
    $("detail").textContent = error.message;
    $("connect").disabled = false;
    if (device?.gatt?.connected) device.gatt.disconnect();
  }
}

$("connect").addEventListener("click", connect);
$("disconnect").addEventListener("click", () => device?.gatt?.disconnect());
$("handshake").addEventListener("click", handshake);
$("ping").addEventListener("click", async () => {
  if (!handshakeOk) return;
  const nonce = randomNonce();
  try {
    const started = performance.now();
    await exchange(`P:${nonce}`, `Q:${nonce}`);
    $("latency").textContent = `Ping round trip: ${Math.round(performance.now() - started)} ms`;
  } catch (error) {
    record("ERROR", error.message);
  }
});
$("clear-log").addEventListener("click", () => { lines = []; $("log").textContent = ""; });
$("save-log").addEventListener("click", () => {
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `toki-link-${new Date().toISOString().replaceAll(":", "-")}.log`;
  link.click();
  URL.revokeObjectURL(url);
});
record("APP", "Ready for BLE connection test");
