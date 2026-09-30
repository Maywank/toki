import { Alert, Text, View } from 'react-native';
import { useToki } from '../toki/TokiProvider';
import { phaseLabel } from '../toki/store';
import { Button, Card, colors, Header, Label, Page, styles } from '../toki/ui';

export default function Device() {
  const { saved, device, status, found, busy, logs, scan, connect, disconnect, refresh, action } = useToki();
  const run = (fn: () => Promise<void>) => fn().catch((error) => Alert.alert('Toki', String(error)));
  return <Page><Header eyebrow="WIRELESS CONNECTION" title="The physical Toki." description="The app connects directly over Bluetooth. The ESP32 runs the display, pointer, touch controls and chime on its own." />
    <Card><Label>LINK</Label><Text style={{ fontSize: 21, color: colors.ink, marginBottom: 9 }}>{status}</Text>
      <Text style={styles.subtle}>Firmware protocol: TOKI/2 · queue revision: {device.revision} · {phaseLabel(device.phase)}</Text>
      <Button label="Scan for Toki" disabled={busy} onPress={() => run(scan)} />
      {saved.deviceId && status !== 'Connected' && <Button secondary label="Reconnect known Toki" disabled={busy} onPress={() => run(() => connect(saved.deviceId!))} />}
      {found.map((item) => <Button key={item.id} secondary label={`Connect ${item.name}`} disabled={busy} onPress={() => run(() => connect(item.id))} />)}
      {status === 'Connected' && <Button secondary label="Disconnect" onPress={() => run(disconnect)} />}
    </Card>
    <Card><Label>DEVICE CONTROLS</Label>
      <Text style={styles.subtle}>The middle sensor starts a task; hold it to complete. Left and right cycle tasks. Hold left while focusing to stop without completing.</Text>
      <Button secondary label="Read device state" disabled={busy || status !== 'Connected'} onPress={() => run(refresh)} />
      <Button secondary label="Test chime" disabled={busy || status !== 'Connected'} onPress={() => run(() => action('C', 'K:C'))} />
      <Button secondary label="Find pointer home" disabled={busy || status !== 'Connected'} onPress={() => run(() => action('O', 'K:O'))} />
    </Card>
    <Card><Label>LIVE LOG</Label><Text style={[styles.subtle, { marginBottom: 8 }]}>BLE messages and device acknowledgements appear here.</Text>
      <View style={{ backgroundColor: '#f7f5ef', borderWidth: 1, borderColor: colors.line, padding: 10, borderRadius: 7, minHeight: 100 }}>
        {logs.map((line, index) => <Text key={`${index}-${line}`} style={{ color: colors.ink, fontSize: 11, marginBottom: 5, fontFamily: 'monospace' }}>{line}</Text>)}
      </View>
    </Card>
  </Page>;
}
