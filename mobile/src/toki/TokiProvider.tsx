import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import BleManager from 'react-native-ble-manager';
import { DeviceState, emptyDevice, emptySaved, newTask, parseElapsed, parseFocus, parseVersion, queueSignature, reorderOpenTasks, restoreSaved, Saved, sortTasks, Task, deviceTitle } from './store';

const SERVICE = '5ce1f1a0-9e7b-4c35-9e1f-42c1ec923001';
const COMMAND = '5ce1f1a0-9e7b-4c35-9e1f-42c1ec923002';
const EVENT = '5ce1f1a0-9e7b-4c35-9e1f-42c1ec923003';
const INFO = '5ce1f1a0-9e7b-4c35-9e1f-42c1ec923004';
const KEY = 'toki:v2';
type Found = { id: string; name: string };
type Waiter = { expected: string[]; seen: Set<string>; resolve: () => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> };
type Context = {
  saved: Saved; device: DeviceState; status: string; found: Found[]; busy: boolean; logs: string[]; syncNotice: string;
  loaded: boolean; storageError: string; retryStorage: () => Promise<void>;
  setPreferences: (changes: Partial<Pick<Saved, 'onboardingCompleted' | 'draft' | 'reminderMinutes'>>) => Promise<void>;
  addTask: (title: string) => Promise<void>;
  updateTask: (id: string, changes: Partial<Pick<Task, 'priority' | 'title' | 'order'>>) => Promise<void>;
  moveTask: (id: string, direction: -1 | 1) => void;
  reorderTasks: (ids: string[]) => void;
  sendNext: (id: string) => void;
  completeLocal: (id: string) => void;
  scan: () => Promise<void>; connect: (id: string) => Promise<void>; disconnect: () => Promise<void>;
  sync: () => Promise<void>; action: (command: string, ack: string) => Promise<void>; refresh: () => Promise<void>;
};
const TokiContext = createContext<Context | null>(null);
const decode = (bytes: number[]) => String.fromCharCode(...bytes);
const encode = (value: string) => Array.from(value, (c) => c.charCodeAt(0));
const nonce = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');

export function TokiProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = useState<Saved>(emptySaved);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState('');
  const writes = useRef<Promise<void>>(Promise.resolve());
  const [device, setDevice] = useState<DeviceState>(emptyDevice);
  const [status, setStatus] = useState('Starting Bluetooth');
  const [found, setFound] = useState<Found[]>([]);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [syncNotice, setSyncNotice] = useState('');
  const hydrated = useRef(false);
  const savedRef = useRef(saved);
  const deviceRef = useRef(device);
  const connectedId = useRef<string | null>(null);
  const shouldReconnect = useRef(true);
  const connecting = useRef(false);
  const waiter = useRef<Waiter | null>(null);
  const ready = useRef(false);
  const autoSyncKey = useRef('');
  const operation = useRef(false);
  const syncRef = useRef<() => Promise<void>>(async () => {});
  const connectRef = useRef<(id: string) => Promise<void>>(async () => {});

  const log = useCallback((text: string) => setLogs((current) => [`${new Date().toLocaleTimeString()}  ${text}`, ...current].slice(0, 100)), []);
  const persist = useCallback((next: Saved) => {
    const write = writes.current.catch(() => {}).then(() => AsyncStorage.setItem(KEY, JSON.stringify(next)));
    writes.current = write;
    void write.catch((error) => { setStorageError(String(error)); log(`Storage: ${String(error)}`); });
    return write;
  }, [log]);
  const patchSaved = useCallback((mutate: (current: Saved) => Saved) => {
    const next = mutate(savedRef.current); savedRef.current = next; setSaved(next);
    return hydrated.current ? persist(next) : Promise.resolve();
  }, [persist]);
  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const next = restoreSaved(raw);
      savedRef.current = next; setSaved(next); hydrated.current = true; setLoaded(true); setStorageError('');
      if (ready.current && next.deviceId && shouldReconnect.current) void connectRef.current(next.deviceId);
    } catch (error) { setStorageError(String(error)); }
  }, []);
  async function retryStorage() {
    if (!hydrated.current) { await load(); return; }
    try { await persist(savedRef.current); setStorageError(''); } catch { /* Retain the visible error and all in-memory data. */ }
  }
  const setPreferences = useCallback((changes: Partial<Pick<Saved, 'onboardingCompleted' | 'draft' | 'reminderMinutes'>>) => patchSaved((current) => ({ ...current, ...changes })), [patchSaved]);
  const patchDevice = useCallback((changes: Partial<DeviceState>) => {
    const next = { ...deviceRef.current, ...changes }; deviceRef.current = next; setDevice(next);
  }, []);
  const cancelWaiter = useCallback((reason: string) => {
    if (!waiter.current) return;
    const waiting = waiter.current; waiter.current = null;
    clearTimeout(waiting.timer); waiting.reject(new Error(reason));
  }, []);
  const reconcile = useCallback((state: Partial<DeviceState>) => {
    const local = savedRef.current;
    if (state.revision !== local.revision || local.syncedIds.length !== state.count) return;
    const completed = local.syncedIds.filter((_, slot) => ((state.doneMask || 0) & (1 << slot)) !== 0);
    if (completed.length) patchSaved((current) => ({ ...current, tasks: current.tasks.map((task) => completed.includes(task.id) && !task.completedAt ? { ...task, completedAt: Date.now() } : task) }));
  }, [patchSaved]);
  const onFrame = useCallback((frame: string) => {
    log(`DEVICE ${frame.startsWith('WP:') ? 'WP:[hidden]' : frame}`);
    const version = parseVersion(frame);
    if (version) { patchDevice(version); reconcile(version); }
    const focus = parseFocus(frame);
    if (focus) {
      patchDevice(focus);
      if (deviceRef.current.revision === savedRef.current.revision) {
        const id = savedRef.current.syncedIds[deviceRef.current.selected];
        if (id) patchSaved((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, timeSpentSeconds: Math.max(task.timeSpentSeconds, focus.elapsedSeconds || 0) } : task) }));
      }
    }
    const elapsed = parseElapsed(frame);
    if (elapsed) {
      patchSaved((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === elapsed.id ? { ...task, timeSpentSeconds: Math.max(task.timeSpentSeconds, elapsed.seconds) } : task) }));
    }
    if (frame.startsWith('WN:')) patchDevice({ otaName: frame.slice(3) });
    if (frame.startsWith('WP:')) patchDevice({ otaPassword: frame.slice(3) });
    if (frame.startsWith('WI:')) patchDevice({ otaIp: frame.slice(3) });
    if (frame.startsWith('WS:')) patchDevice({ networkIp: frame.slice(3) });
    if (frame === 'WU:0') patchDevice({ otaName: undefined, otaPassword: undefined, otaIp: undefined, networkIp: undefined });
    if (/^CA:[01]$/.test(frame)) patchDevice({ audioReady: frame === 'CA:1' });
    if (frame.startsWith('CB:')) patchDevice({ firmware: frame.slice(3) });
    if (frame.startsWith('CI:')) patchDevice({ chip: frame.slice(3) });
    if (frame.startsWith('CF:')) patchDevice({ flashBytes: Number(frame.slice(3)) });
    if (frame.startsWith('D:')) {
      const id = frame.slice(2);
      patchSaved((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id && !task.completedAt ? { ...task, completedAt: Date.now() } : task) }));
    }
    const pending = waiter.current;
    if (!pending) return;
    if (frame.startsWith('E:')) { cancelWaiter(frame.slice(2)); return; }
    const match = pending.expected.find((expected) => frame === expected);
    if (match) pending.seen.add(match);
    if (pending.expected.every((prefix) => pending.seen.has(prefix))) {
      waiter.current = null; clearTimeout(pending.timer); pending.resolve();
    }
  }, [cancelWaiter, log, patchDevice, patchSaved, reconcile]);

  useEffect(() => {
    void Promise.resolve().then(load);
    const discovered = BleManager.onDiscoverPeripheral((item) => {
      if (!item.name?.startsWith('Toki Link')) return;
      setFound((current) => current.some((known) => known.id === item.id) ? current : [...current, { id: item.id, name: item.name || 'Toki Link' }]);
    });
    const updated = BleManager.onDidUpdateValueForCharacteristic((event) => {
      if (event.peripheral === connectedId.current) onFrame(decode(event.value));
    });
    const disconnected = BleManager.onDisconnectPeripheral((event) => {
      if (event.peripheral !== connectedId.current) return;
      connectedId.current = null; cancelWaiter('Disconnected'); setStatus(shouldReconnect.current ? 'Offline' : 'Disconnected'); log('BLE disconnected');
      if (shouldReconnect.current) setTimeout(() => { if (savedRef.current.deviceId) connectRef.current(savedRef.current.deviceId); }, 3000);
    });
    BleManager.start({ showAlert: false }).then(() => {
      ready.current = true; setStatus('Offline');
      if (hydrated.current && savedRef.current.deviceId && shouldReconnect.current) connectRef.current(savedRef.current.deviceId);
    }).catch((error) => setStatus(`Bluetooth error: ${String(error)}`));
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active' && ready.current && !connectedId.current && savedRef.current.deviceId && shouldReconnect.current)
        connectRef.current(savedRef.current.deviceId);
    });
    return () => { discovered.remove(); updated.remove(); disconnected.remove(); app.remove(); cancelWaiter('Closing'); };
  }, [cancelWaiter, log, onFrame, load]);

  async function permissions() {
    if (Platform.OS !== 'android') return;
    const required = Number(Platform.Version) >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    const granted = await PermissionsAndroid.requestMultiple(required);
    if (!Object.values(granted).every((value) => value === PermissionsAndroid.RESULTS.GRANTED)) throw new Error('Bluetooth permission needed');
  }
  async function scan() {
    setBusy(true); setFound([]);
    try {
      await permissions();
      if (await BleManager.checkState() !== 'on') throw new Error('Turn Bluetooth on');
      setStatus('Looking for Toki');
      await BleManager.scan({ serviceUUIDs: [SERVICE], seconds: 8 });
      setTimeout(() => setStatus((current) => current === 'Looking for Toki' ? 'Choose Toki' : current), 8500);
    } catch (error) { setStatus(String(error)); log(String(error)); }
    finally { setBusy(false); }
  }
  async function exchange(command: string, expected: string[]) {
    const id = connectedId.current;
    if (!id) throw new Error('Toki is offline');
    if (waiter.current) throw new Error('Device is responding to another action');
    const response = new Promise<void>((resolve, reject) => {
      waiter.current = { expected, seen: new Set(), resolve, reject, timer: setTimeout(() => cancelWaiter('Device did not reply'), 7000) };
    });
    log(`APP ${command}`);
    try {
      await BleManager.write(id, SERVICE, COMMAND, encode(command), 20);
      await response;
    } catch (error) { response.catch(() => {}); cancelWaiter(String(error)); throw error; }
  }
  async function refresh() { await exchange('R', ['K:R']); }
  async function connect(id: string) {
    if (connecting.current || connectedId.current === id) return;
    connecting.current = true; setBusy(true); setStatus('Connecting');
    try {
      await permissions();
      if (await BleManager.checkState() !== 'on') throw new Error('Turn Bluetooth on');
      await BleManager.stopScan().catch(() => {});
      await BleManager.connect(id);
      connectedId.current = id;
      await BleManager.retrieveServices(id);
      await BleManager.startNotification(id, SERVICE, EVENT);
      const info = decode(await BleManager.read(id, SERVICE, INFO));
      if (info !== 'TOKI/3') { shouldReconnect.current = false; throw new Error(`Install Toki firmware 3 to use this app (device: ${info}).`); }
      const challenge = nonce();
      await exchange(`H:${challenge}`, [`A:${challenge}:3`]);
      await refresh();
      patchSaved((current) => ({ ...current, deviceId: id }));
      shouldReconnect.current = true; setStatus('Connected'); log('Handshake verified');
    } catch (error) {
      setStatus(`Connection failed: ${String(error)}`); log(String(error));
      cancelWaiter('Connection failed');
      connectedId.current = null;
      try { await BleManager.disconnect(id); } catch { /* Link may already be closed. */ }
    } finally { connecting.current = false; setBusy(false); }
  }
  useEffect(() => { connectRef.current = connect; });
  async function disconnect() {
    shouldReconnect.current = false;
    const id = connectedId.current;
    if (id) await BleManager.disconnect(id);
    connectedId.current = null; setStatus('Disconnected');
  }
  async function action(command: string, ack: string) {
    if (operation.current) throw new Error('Toki is syncing. Try again in a moment.');
    operation.current = true;
    setBusy(true);
    try { await exchange(command, [ack]); await refresh(); }
    catch (error) { log(`Action failed: ${String(error)}`); throw error; }
    finally { operation.current = false; setBusy(false); }
  }
  async function sync() {
    if (status !== 'Connected') throw new Error('Connect Toki first');
    if (operation.current) throw new Error('Toki is busy. Try again in a moment.');
    if (deviceRef.current.phase === 'R') throw new Error('Finish the current task first');
    operation.current = true;
    setSyncNotice('Syncing…');
    setBusy(true);
    try {
      await refresh();
      const selected = sortTasks(savedRef.current.tasks).slice(0, 4);
      let revision = Math.max(savedRef.current.revision, deviceRef.current.revision) + 1;
      if (revision > 65535) revision = 1;
      await exchange(`B:${revision}:${selected.length}`, [`K:B:${revision}`]);
      for (let slot = 0; slot < selected.length; ++slot) {
        const task = selected[slot];
        await exchange(`T:${slot}:${task.id}:0`, [`K:T:${slot}`]);
        await exchange(`S:${slot}:${Math.floor(task.timeSpentSeconds)}`, [`K:S:${slot}`]);
        const title = deviceTitle(task.title);
        for (let part = 0; part * 8 < title.length; ++part)
          await exchange(`N:${slot}:${part}:${title.slice(part * 8, part * 8 + 8)}`, [`K:N:${slot}:${part}`]);
      }
      await exchange(`E:${revision}`, [`K:E:${revision}`]);
      patchSaved((current) => ({ ...current, revision, syncedIds: selected.map((task) => task.id), syncedSignature: queueSignature(selected) }));
      patchDevice({ revision, count: selected.length, selected: 0, doneMask: 0, phase: 'I' });
      setSyncNotice('Up to date');
      log(`${selected.length} tasks stored on Toki`);
      // K:E is sent only after the device commits the queue to nonvolatile storage.
      // A dropped follow-up state notification must not turn a successful sync into an error.
      try { await refresh(); } catch (error) { log(`Saved on Toki; readback interrupted: ${String(error)}`); }
    } catch (error) { setSyncNotice(`Sync paused: ${String(error).replace(/^Error: /, '')}`); throw error; }
    finally { operation.current = false; setBusy(false); }
  }
  async function addTask(title: string) {
    if (!title.trim()) return;
    await patchSaved((current) => ({ ...current, draft: '', tasks: [...current.tasks, newTask(title, Math.max(0, ...current.tasks.map((task) => task.order)) + 1)] }));
  }
  function updateTask(id: string, changes: Partial<Pick<Task, 'priority' | 'title' | 'order'>>) {
    return patchSaved((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, ...changes } : task) }));
  }
  function moveTask(id: string, direction: -1 | 1) {
    patchSaved((current) => {
      const ordered = sortTasks(current.tasks);
      const index = ordered.findIndex((task) => task.id === id);
      const other = index + direction;
      if (index < 0 || other < 0 || other >= ordered.length) return current;
      const first = ordered[index], second = ordered[other];
      return { ...current, tasks: current.tasks.map((task) => task.id === first.id ? { ...task, order: second.order } : task.id === second.id ? { ...task, order: first.order } : task) };
    });
  }
  function completeLocal(id: string) {
    patchSaved((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, completedAt: Date.now() } : task) }));
  }
  function reorderTasks(ids: string[]) {
    patchSaved((current) => ({ ...current, tasks: reorderOpenTasks(current.tasks, ids) }));
  }
  function sendNext(id: string) {
    void updateTask(id, { order: Math.min(0, ...savedRef.current.tasks.map((task) => task.order)) - 1 }).catch(() => {});
  }
  useEffect(() => { syncRef.current = sync; });
  useEffect(() => {
    if (status !== 'Connected' || device.phase === 'R' || device.otaName || busy) return;
    const top = sortTasks(saved.tasks).slice(0, 4);
    const key = queueSignature(top);
    const localMatches = key === saved.syncedSignature;
    const deviceMatches = device.revision === saved.revision && device.count === top.length;
    if (localMatches && deviceMatches) { autoSyncKey.current = ''; return; }
    if (autoSyncKey.current === key) return;
    const timer = setTimeout(() => { autoSyncKey.current = key; syncRef.current().catch((error) => log(`Automatic sync paused: ${String(error)}`)); }, 800);
    return () => clearTimeout(timer);
  }, [saved.tasks, saved.syncedSignature, saved.revision, device.phase, device.revision, device.count, device.otaName, status, busy, log]);
  useEffect(() => {
    if (status !== 'Connected' || !connectedId.current) { patchDevice({ rssi: undefined }); return; }
    const id = connectedId.current;
    const sample = () => BleManager.readRSSI(id).then((rssi) => patchDevice({ rssi: Number.isFinite(rssi) && rssi < 0 && rssi >= -127 ? rssi : undefined })).catch(() => patchDevice({ rssi: undefined }));
    void sample();
    const timer = setInterval(sample, 5000);
    return () => clearInterval(timer);
  }, [status, patchDevice]);
  return <TokiContext.Provider value={{ loaded, storageError, retryStorage, setPreferences, saved, device, status, found, busy, logs, syncNotice, addTask, updateTask, moveTask, reorderTasks, sendNext, completeLocal, scan, connect, disconnect, sync, action, refresh }}>{children}</TokiContext.Provider>;
}

export function useToki() {
  const context = useContext(TokiContext);
  if (!context) throw new Error('TokiProvider missing');
  return context;
}
