import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import BleManager from 'react-native-ble-manager';
import { DeviceState, emptyDevice, emptySaved, newTask, parseFocus, parseVersion, Saved, sortTasks, Task, deviceTitle } from './store';

const SERVICE = '5ce1f1a0-9e7b-4c35-9e1f-42c1ec923001';
const COMMAND = '5ce1f1a0-9e7b-4c35-9e1f-42c1ec923002';
const EVENT = '5ce1f1a0-9e7b-4c35-9e1f-42c1ec923003';
const INFO = '5ce1f1a0-9e7b-4c35-9e1f-42c1ec923004';
const KEY = 'toki:v2';
type Found = { id: string; name: string };
type Waiter = { expected: string[]; seen: Set<string>; resolve: () => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> };
type Context = {
  saved: Saved; device: DeviceState; status: string; found: Found[]; busy: boolean; logs: string[];
  addTask: (title: string, minutes: 5 | 10 | 15, priority: 1 | 2 | 3) => void;
  updateTask: (id: string, changes: Partial<Pick<Task, 'priority' | 'minutes' | 'title' | 'order'>>) => void;
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
  const [device, setDevice] = useState<DeviceState>(emptyDevice);
  const [status, setStatus] = useState('Starting Bluetooth');
  const [found, setFound] = useState<Found[]>([]);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const hydrated = useRef(false);
  const savedRef = useRef(saved);
  const deviceRef = useRef(device);
  const connectedId = useRef<string | null>(null);
  const shouldReconnect = useRef(true);
  const connecting = useRef(false);
  const waiter = useRef<Waiter | null>(null);
  const ready = useRef(false);
  const connectRef = useRef<(id: string) => Promise<void>>(async () => {});

  const log = useCallback((text: string) => setLogs((current) => [`${new Date().toLocaleTimeString()}  ${text}`, ...current].slice(0, 100)), []);
  const patchSaved = useCallback((mutate: (current: Saved) => Saved) => {
    setSaved((current) => { const next = mutate(current); savedRef.current = next; return next; });
  }, []);
  const patchDevice = useCallback((changes: Partial<DeviceState>) => {
    setDevice((current) => { const next = { ...current, ...changes }; deviceRef.current = next; return next; });
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
    log(`DEVICE ${frame}`);
    const version = parseVersion(frame);
    if (version) { patchDevice(version); reconcile(version); }
    const focus = parseFocus(frame);
    if (focus) patchDevice(focus);
    if (frame.startsWith('D:')) {
      const id = frame.slice(2);
      patchSaved((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id && !task.completedAt ? { ...task, completedAt: Date.now() } : task) }));
    }
    const pending = waiter.current;
    if (!pending) return;
    if (frame.startsWith('E:')) { cancelWaiter(frame.slice(2)); return; }
    const match = pending.expected.find((prefix) => frame.startsWith(prefix));
    if (match) pending.seen.add(match);
    if (pending.expected.every((prefix) => pending.seen.has(prefix))) {
      waiter.current = null; clearTimeout(pending.timer); pending.resolve();
    }
  }, [cancelWaiter, log, patchDevice, patchSaved, reconcile]);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      if (raw) {
        const data = JSON.parse(raw) as Saved;
        if (Array.isArray(data.tasks)) { savedRef.current = data; setSaved(data); }
      }
      hydrated.current = true;
      if (ready.current && savedRef.current.deviceId && shouldReconnect.current) connectRef.current(savedRef.current.deviceId);
    }).catch((error) => log(`Storage: ${String(error)}`));
    const discovered = BleManager.onDiscoverPeripheral((item) => {
      if (!item.name?.startsWith('Toki Link')) return;
      setFound((current) => current.some((known) => known.id === item.id) ? current : [...current, { id: item.id, name: item.name || 'Toki Link' }]);
    });
    const updated = BleManager.onDidUpdateValueForCharacteristic((event) => {
      if (event.peripheral === connectedId.current) onFrame(decode(event.value));
    });
    const disconnected = BleManager.onDisconnectPeripheral((event) => {
      if (event.peripheral !== connectedId.current) return;
      connectedId.current = null; cancelWaiter('Disconnected'); setStatus('Offline'); log('BLE disconnected');
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
  }, [cancelWaiter, log, onFrame]);

  useEffect(() => {
    if (!hydrated.current) return;
    const timer = setTimeout(() => AsyncStorage.setItem(KEY, JSON.stringify(saved)).catch((error) => log(`Storage: ${String(error)}`)), 250);
    return () => clearTimeout(timer);
  }, [saved, log]);

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
  async function refresh() { await exchange('R', ['V:', 'F:']); }
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
      if (info !== 'TOKI/2') throw new Error(`Toki firmware ${info} needs protocol 2`);
      const challenge = nonce();
      await exchange(`H:${challenge}`, [`A:${challenge}:2`]);
      await refresh();
      patchSaved((current) => ({ ...current, deviceId: id }));
      shouldReconnect.current = true; setStatus('Connected'); log('Handshake verified');
    } catch (error) {
      setStatus(`Connection failed: ${String(error)}`); log(String(error));
      cancelWaiter('Connection failed');
      try { await BleManager.disconnect(id); } catch { /* Link may already be closed. */ }
      connectedId.current = null;
    } finally { connecting.current = false; setBusy(false); }
  }
  useEffect(() => { connectRef.current = connect; });
  async function disconnect() {
    shouldReconnect.current = false;
    const id = connectedId.current;
    if (id) await BleManager.disconnect(id);
    connectedId.current = null; setStatus('Offline');
  }
  async function action(command: string, ack: string) {
    setBusy(true);
    try { await exchange(command, [ack]); await refresh(); }
    catch (error) { log(`Action failed: ${String(error)}`); throw error; }
    finally { setBusy(false); }
  }
  async function sync() {
    if (status !== 'Connected') throw new Error('Connect Toki first');
    if (['H', 'W', 'R', 'B'].includes(deviceRef.current.phase)) throw new Error('Finish the current session first');
    setBusy(true);
    try {
      await refresh();
      const selected = sortTasks(savedRef.current.tasks).slice(0, 4);
      let revision = Math.max(savedRef.current.revision, deviceRef.current.revision) + 1;
      if (revision > 65535) revision = 1;
      await exchange(`B:${revision}:${selected.length}`, [`K:B:${revision}`]);
      for (let slot = 0; slot < selected.length; ++slot) {
        const task = selected[slot];
        await exchange(`T:${slot}:${task.id}:${task.minutes}`, [`K:T:${slot}`]);
        const title = deviceTitle(task.title);
        for (let part = 0; part * 8 < title.length; ++part)
          await exchange(`N:${slot}:${part}:${title.slice(part * 8, part * 8 + 8)}`, [`K:N:${slot}:${part}`]);
      }
      await exchange(`E:${revision}`, [`K:E:${revision}`]);
      patchSaved((current) => ({ ...current, revision, syncedIds: selected.map((task) => task.id) }));
      await refresh(); log(`${selected.length} tasks stored on Toki`);
    } finally { setBusy(false); }
  }
  function addTask(title: string, minutes: 5 | 10 | 15, priority: 1 | 2 | 3) {
    if (!title.trim()) return;
    patchSaved((current) => ({ ...current, tasks: [...current.tasks, newTask(title, minutes, priority, Math.max(0, ...current.tasks.map((task) => task.order)) + 1)] }));
  }
  function updateTask(id: string, changes: Partial<Pick<Task, 'priority' | 'minutes' | 'title' | 'order'>>) {
    patchSaved((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, ...changes } : task) }));
  }
  function completeLocal(id: string) {
    patchSaved((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === id ? { ...task, completedAt: Date.now() } : task) }));
  }
  return <TokiContext.Provider value={{ saved, device, status, found, busy, logs, addTask, updateTask, completeLocal, scan, connect, disconnect, sync, action, refresh }}>{children}</TokiContext.Provider>;
}

export function useToki() {
  const context = useContext(TokiContext);
  if (!context) throw new Error('TokiProvider missing');
  return context;
}
