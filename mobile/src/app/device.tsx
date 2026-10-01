import { useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { useToki } from '../toki/TokiProvider';
import { Button, colors, Page, styles } from '../toki/ui';

function signal(rssi?: number) {
  if (rssi === undefined) return 'Measuring…';
  if (rssi >= -60) return `Strong · ${rssi} dBm`;
  if (rssi >= -75) return `Good · ${rssi} dBm`;
  if (rssi >= -88) return `Weak · ${rssi} dBm`;
  return `Very weak · ${rssi} dBm`;
}

export default function Device() {
  const { saved, device, status, found, busy, logs, scan, connect, disconnect, sync, action } = useToki();
  const [showLog, setShowLog] = useState(false);
  const run = (fn: () => Promise<void>) => fn().catch((error) => Alert.alert('Toki', String(error)));
  return <Page>
    <Text style={styles.wordmark}>toki<Text style={{ color: colors.accent }}>.</Text></Text>
    <Text style={styles.captureHeading}>Your device</Text>
    <View style={styles.inlineAction}>
      <View><Text style={styles.kicker}>CONNECTION</Text><Text style={styles.taskTitle}>{status}</Text></View>
      <View style={[styles.statusDot, status === 'Connected' && styles.statusDotOn]} />
    </View>
    {status === 'Connected' && <>
      <View style={styles.inlineAction}><Text style={styles.hint}>Bluetooth signal</Text><Text style={styles.taskMeta}>{signal(device.rssi)}</Text></View>
      <View style={styles.inlineAction}><Text style={styles.hint}>On Toki</Text><Text style={styles.taskMeta}>{device.count} tasks</Text></View>
      <Text style={styles.hint}>Tasks sync in order as you capture and finish them.</Text>
      <Button label="Sync now" secondary disabled={busy} onPress={() => run(sync)} />
      <Button label="Disconnect" secondary disabled={busy} onPress={() => run(disconnect)} />
    </>}
    {status === 'Connected' && <View style={{ marginTop: 30 }}>
      <Text style={styles.sectionHeading}>Firmware updates</Text>
      <Text style={styles.hint}>{device.firmware || '3'} · {device.chip || 'ESP32'}{device.flashBytes ? ` · ${device.flashBytes / 1048576} MB` : ''}</Text>
      {!device.otaName ? <Button secondary label="Enable Wi-Fi update" disabled={busy || device.phase === 'R'} onPress={() => run(() => action('U', 'K:U'))} /> : <>
        <Text style={[styles.hint, { marginTop: 14 }]}>Connect your phone or laptop to this Wi-Fi, then open the upload page. The update window closes after 15 minutes.</Text>
        <Text selectable style={[styles.taskTitle, { marginTop: 13 }]}>{device.otaName}</Text>
        <Text selectable style={styles.hint}>Wi-Fi password: {device.otaPassword}</Text>
        <Text style={styles.hint}>Upload login: toki · same password</Text>
        <Button secondary label="Open firmware upload" onPress={() => void Linking.openURL(`http://${device.otaIp || '192.168.4.1'}`).catch((error) => Alert.alert('Toki', String(error)))} />
        {!!device.networkIp && <Text selectable style={styles.hint}>Home Wi-Fi address: http://{device.networkIp}</Text>}
        <Button secondary label="Close update mode" disabled={busy} onPress={() => run(() => action('u', 'K:u'))} />
      </>}
    </View>}
    {status !== 'Connected' && <>
      <Button label="Find Toki" disabled={busy} onPress={() => run(scan)} />
      {saved.deviceId && <Button label="Reconnect" secondary disabled={busy} onPress={() => run(() => connect(saved.deviceId!))} />}
      {found.map((item) => <Button key={item.id} label={`Connect · ${item.name}`} secondary disabled={busy} onPress={() => run(() => connect(item.id))} />)}
    </>}
    <View style={[styles.focusPanel, { marginTop: 28 }]}>
      <Text style={styles.kicker}>ON THE DEVICE</Text>
      <Text style={[styles.hint, { marginTop: 6 }]}>Left and right move through the list. Tap the middle button to begin. Hold it to mark a task done. Hold left to pause and keep it open.</Text>
    </View>
    <Pressable accessibilityRole="button" onPress={() => setShowLog((value) => !value)} style={[styles.row, { marginTop: 28, paddingVertical: 10 }]}>
      <Text style={styles.kicker}>CONNECTION DETAILS</Text><Text style={styles.taskMeta}>{showLog ? 'Hide −' : 'Show +'}</Text>
    </Pressable>
    {showLog && <View style={{ paddingTop: 8 }}>{logs.map((line, index) => <Text key={`${index}-${line}`} style={{ color: colors.muted, fontSize: 11, marginBottom: 5, fontFamily: 'monospace' }}>{line}</Text>)}</View>}
  </Page>;
}
