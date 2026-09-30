import { useEffect, useRef, useState } from 'react';
import { Alert, PermissionsAndroid, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import BleManager from 'react-native-ble-manager';

const SERVICE = '5ce1f1a0-9e7b-4c35-9e1f-42c1ec923001';
const COMMAND = '5ce1f1a0-9e7b-4c35-9e1f-42c1ec923002';
const EVENT = '5ce1f1a0-9e7b-4c35-9e1f-42c1ec923003';
const INFO = '5ce1f1a0-9e7b-4c35-9e1f-42c1ec923004';
type FoundDevice = { id: string; name: string };
type Pending = { expected: string; resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
const decode = (value: number[]) => String.fromCharCode(...value);
const encode = (value: string) => Array.from(value, (character) => character.charCodeAt(0));
const challenge = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');

export default function App() {
  const [status, setStatus] = useState('Preparing Bluetooth…');
  const [handshake, setHandshake] = useState('Waiting');
  const [devices, setDevices] = useState<FoundDevice[]>([]);
  const [active, setActive] = useState<FoundDevice | null>(null);
  const [busy, setBusy] = useState(false);
  const [roundTrip, setRoundTrip] = useState('No round trip measured yet.');
  const [lines, setLines] = useState<string[]>([]);
  const activeId = useRef<string | null>(null);
  const pending = useRef<Pending | null>(null);
  const started = useRef(false);

  const log = (kind: string, value: string) => {
    setLines((current) => [...current.slice(-149), `${new Date().toLocaleTimeString()}  ${kind}  ${value}`]);
  };
  const cancelPending = (reason: string) => {
    if (!pending.current) return;
    clearTimeout(pending.current.timer);
    pending.current.reject(new Error(reason));
    pending.current = null;
  };

  useEffect(() => {
    let mounted = true;
    const found = BleManager.onDiscoverPeripheral((item) => {
      if (!item.name?.startsWith('Toki Link')) return;
      setDevices((current) => current.some((known) => known.id === item.id)
        ? current : [...current, { id: item.id, name: item.name || 'Toki Link' }]);
      log('FOUND', item.name || item.id);
    });
    const notified = BleManager.onDidUpdateValueForCharacteristic((event) => {
      if (event.peripheral !== activeId.current) return;
      const frame = decode(event.value);
      log('DEVICE', frame);
      if (pending.current?.expected === frame) {
        clearTimeout(pending.current.timer);
        pending.current.resolve();
        pending.current = null;
      }
    });
    const disconnected = BleManager.onDisconnectPeripheral((event) => {
      if (event.peripheral !== activeId.current) return;
      cancelPending('Toki disconnected');
      activeId.current = null;
      setActive(null);
      setHandshake('Waiting');
      setStatus('Disconnected');
      log('LINK', 'Disconnected');
    });
    BleManager.start({ showAlert: false })
      .then(() => { started.current = true; if (mounted) setStatus('Ready to scan'); })
      .catch((error) => { if (mounted) setStatus(`Bluetooth unavailable: ${String(error)}`); });
    return () => {
      mounted = false;
      found.remove(); notified.remove(); disconnected.remove();
      cancelPending('Screen closed');
    };
  }, []);

  async function permissions() {
    if (Platform.OS !== 'android') return true;
    const version = Number(Platform.Version);
    const required = version >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : version >= 23 ? [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] : [];
    if (!required.length) return true;
    const result = await PermissionsAndroid.requestMultiple(required);
    return Object.values(result).every((value) => value === PermissionsAndroid.RESULTS.GRANTED);
  }

  async function scan() {
    if (!started.current) return;
    setBusy(true); setDevices([]);
    try {
      if (!(await permissions())) throw new Error('Bluetooth permission denied');
      if (await BleManager.checkState() !== 'on') throw new Error('Turn Bluetooth on');
      setStatus('Scanning for Toki…'); log('APP', 'Scan started');
      await BleManager.scan({ serviceUUIDs: [SERVICE], seconds: 8 });
      setTimeout(() => setStatus((value) => value === 'Scanning for Toki…' ? 'Choose Toki below' : value), 8500);
    } catch (error) { setStatus(String(error)); log('ERROR', String(error)); }
    finally { setBusy(false); }
  }

  async function exchange(id: string, command: string, expected: string) {
    if (pending.current) throw new Error('A reply is still pending');
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const response = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    const timer = setTimeout(() => cancelPending('No matching reply in 5 seconds'), 5000);
    pending.current = { expected, resolve, reject, timer };
    log('APP', command);
    try {
      await BleManager.write(id, SERVICE, COMMAND, encode(command), 20);
      await response;
    } catch (error) {
      if (pending.current?.expected === expected) {
        response.catch(() => {});
        cancelPending(String(error));
      }
      throw error;
    }
  }

  async function verify(id = activeId.current) {
    if (!id) return;
    setHandshake('Checking…');
    try {
      const token = challenge();
      await exchange(id, `H:${token}`, `A:${token}:1`);
      setHandshake('Verified'); setRoundTrip('Device returned the matching challenge.');
      log('LINK', 'Handshake verified');
    } catch (error) { setHandshake('Failed'); log('ERROR', String(error)); }
  }

  async function connect(item: FoundDevice) {
    setBusy(true); setStatus('Connecting…');
    try {
      await BleManager.stopScan();
      await BleManager.connect(item.id);
      activeId.current = item.id; setActive(item);
      await BleManager.retrieveServices(item.id);
      await BleManager.startNotification(item.id, SERVICE, EVENT);
      const info = decode(await BleManager.read(item.id, SERVICE, INFO));
      log('LINK', `Device reports ${info}`);
      if (info !== 'TOKI-LINK/1') throw new Error(`Unexpected protocol: ${info}`);
      setStatus('Connected');
      await verify(item.id);
    } catch (error) {
      log('ERROR', String(error)); setStatus('Connection failed');
      Alert.alert('Could not connect', String(error));
      try { await BleManager.disconnect(item.id); } catch { /* Already disconnected. */ }
      activeId.current = null; setActive(null);
    } finally { setBusy(false); }
  }

  async function ping() {
    if (!activeId.current || handshake !== 'Verified') return;
    try {
      const token = challenge();
      await exchange(activeId.current, `P:${token}`, `Q:${token}`);
      setRoundTrip('Ping response received.');
    } catch (error) { log('ERROR', String(error)); }
  }

  return <SafeAreaView style={styles.screen}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.wordmark}>toki<Text style={styles.dot}>.</Text></Text>
      <Text style={styles.eyebrow}>CONNECTION TEST</Text>
      <Text style={styles.title}>Prove the link first.</Text>
      <Text style={styles.description}>The app finds Toki, reads its protocol, and checks a random challenge. Live device events appear below.</Text>
      <View style={styles.card}>
        <Text style={styles.label}>DEVICE</Text><Text style={styles.value}>{active?.name || status}</Text>
        <Pressable style={styles.button} onPress={scan} disabled={busy}><Text style={styles.buttonText}>Scan for Toki</Text></Pressable>
        {!active && devices.map((item) => <Pressable key={item.id} style={styles.row} onPress={() => connect(item)}>
          <Text>{item.name}</Text><Text>Connect →</Text>
        </Pressable>)}
        {active && <Pressable style={styles.quietButton} onPress={() => BleManager.disconnect(active.id)}><Text>Disconnect</Text></Pressable>}
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>HANDSHAKE</Text><Text style={styles.value}>{handshake}</Text>
        <Text style={styles.description}>{roundTrip}</Text>
        <Pressable style={styles.quietButton} onPress={() => verify()} disabled={!active}><Text>Retry handshake</Text></Pressable>
        <Pressable style={styles.quietButton} onPress={ping} disabled={handshake !== 'Verified'}><Text>Ping device</Text></Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>LIVE DEVICE LOG</Text>
        <View style={styles.logBox}>{lines.map((line, index) => <Text key={`${index}-${line}`} style={styles.logLine}>{line}</Text>)}</View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f2ed' },
  content: { padding: 24, paddingBottom: 48 },
  wordmark: { fontSize: 30, fontWeight: '600', letterSpacing: -1.5, color: '#282722', marginBottom: 34 },
  dot: { color: '#9c665a' },
  eyebrow: { fontSize: 11, letterSpacing: 2, color: '#88867d', marginBottom: 8 },
  title: { fontSize: 32, color: '#282722', letterSpacing: -1, marginBottom: 10 },
  description: { fontSize: 14, color: '#77746d', lineHeight: 21, marginBottom: 12 },
  card: { backgroundColor: '#fffefa', borderColor: '#dedbd3', borderWidth: 1, borderRadius: 14, padding: 18, marginTop: 15 },
  label: { fontSize: 11, letterSpacing: 1.6, color: '#88867d', marginBottom: 9 },
  value: { fontSize: 20, color: '#282722', marginBottom: 14 },
  button: { backgroundColor: '#33322e', padding: 13, borderRadius: 8, alignItems: 'center' },
  buttonText: { color: '#fff' },
  quietButton: { borderColor: '#d2cfc7', borderWidth: 1, borderRadius: 8, padding: 11, alignItems: 'center', marginTop: 9 },
  row: { borderTopWidth: 1, borderColor: '#ebe8e1', marginTop: 15, paddingTop: 15, flexDirection: 'row', justifyContent: 'space-between' },
  logBox: { backgroundColor: '#f9f8f4', borderColor: '#e6e3dc', borderWidth: 1, borderRadius: 7, padding: 12, minHeight: 140 },
  logLine: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11, color: '#4e4c46', marginBottom: 4 },
});
