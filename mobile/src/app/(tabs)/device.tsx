import { useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { useToki } from '../../toki/TokiProvider';
import { allowReturnInvitations } from '../../toki/return-reminders';
import { Button, colors, Page, styles } from '../../toki/ui';

function signal(rssi?: number) {
  if (rssi === undefined) return 'Measuring…';
  if (rssi >= -60) return `Strong · ${rssi} dBm`;
  if (rssi >= -75) return `Good · ${rssi} dBm`;
  if (rssi >= -88) return `Weak · ${rssi} dBm`;
  return `Very weak · ${rssi} dBm`;
}

export default function Device() {
  const { saved, device, status, found, busy, logs, scan, connect, disconnect, sync, action, refresh, setPreferences } = useToki();
  const [showLog, setShowLog] = useState(false);
  const [reminderPending, setReminderPending] = useState(false);
  async function reminders(minutes: 0 | 5 | 10) {
    setReminderPending(true);
    try { if (minutes) await allowReturnInvitations(); await setPreferences({ reminderMinutes: minutes }); }
    catch (error) { Alert.alert('Return invitations', String(error)); }
    finally { setReminderPending(false); }
  }
  const selected = saved.tasks.find((task) => device.revision === saved.revision && task.id === saved.syncedIds[device.selected]);
  const run = (fn: () => Promise<void>) => fn().catch((error) => Alert.alert('Toki', String(error)));
  return <Page>
    <Text style={styles.wordmark}>toki</Text>
    <Text style={styles.captureHeading}>Your device</Text>
    <View style={styles.inlineAction}>
      <View><Text style={styles.kicker}>CONNECTION</Text><Text style={styles.taskTitle}>{status}</Text></View>
      <View style={[styles.statusDot, status === 'Connected' && styles.statusDotOn]} />
    </View>
    {status === 'Connected' && <>
      <View style={styles.inlineAction}><Text style={styles.hint}>Bluetooth signal</Text><Text style={styles.taskMeta}>{signal(device.rssi)}</Text></View>
      <View style={styles.inlineAction}><Text style={styles.hint}>On Toki</Text><Text style={styles.taskMeta}>{device.count} tasks</Text></View>
      <Text style={styles.hint}>Tasks sync in order as you capture and finish them.</Text>
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
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>Speaker</Text>
      <Text style={styles.hint}>{device.audioReady === false ? 'Toki reports an audio error. Check the amplifier and I2S wiring.' : device.audioReady === true ? 'Task cues play on Toki. Test the speaker before starting.' : 'Test the speaker. Firmware 3.0.7 adds start and finish cues.'}</Text>
      <Button secondary label="Test Toki speaker" disabled={status !== 'Connected' || busy} onPress={() => run(() => action('C', 'K:C'))} />
      <Text style={styles.hint}>Phone music needs an audio receiver on Toki; this build sends task cues to the speaker.</Text>
    </View>
    <View style={styles.section}>
      <Text style={styles.sectionHeading}>A gentle return</Text>
      <Text style={styles.subtle}>An optional invitation if the connection stays interrupted during a task.</Text>
      <View style={styles.row}>{([0, 5, 10] as const).map((minutes) => <Button key={minutes} secondary disabled={reminderPending} label={`${(saved.reminderMinutes || 0) === minutes ? '✓ ' : ''}${minutes ? `${minutes} min` : 'Off'}`} onPress={() => void reminders(minutes)} />)}</View>
      <Text style={styles.hint}>Signal strength cannot tell whether you left the room. Reminders need notification permission and an interruption detected by the app.</Text>
    </View>
    <View style={[styles.focusPanel, { marginTop: 28 }]}>
      <Text style={styles.kicker}>ON THE DEVICE</Text>
      <Text style={[styles.hint, { marginTop: 6 }]}>Left and right choose one of the four tasks. Tap the middle button to begin. Hold it to mark a task done. Hold left to pause and keep it open.</Text>
    </View>
    <Pressable accessibilityRole="button" onPress={() => setShowLog((value) => !value)} style={[styles.row, { marginTop: 28, paddingVertical: 10 }]}>
      <Text style={styles.kicker}>DEVICE DETAILS</Text><Text style={styles.taskMeta}>{showLog ? 'Hide −' : 'Show +'}</Text>
    </Pressable>
    {showLog && <View style={{ paddingTop: 8 }}>
      <Text style={styles.sectionHeading}>Manual controls</Text>
      {!!selected && <Text style={styles.taskTitle}>{selected.title}</Text>}
      <Button secondary label="Refresh device state" disabled={busy || status !== 'Connected'} onPress={() => run(refresh)} />
      <Button secondary label="Sync now" disabled={busy || status !== 'Connected' || device.phase === 'R'} onPress={() => run(sync)} />
      {selected && status === 'Connected' && <>
        {device.phase === 'R' ? <Button secondary label="Pause task" disabled={busy} onPress={() => run(() => action('Y', 'K:Y'))} /> : <Button secondary label="Start selected task" disabled={busy || !!device.otaName || !!selected.completedAt} onPress={() => run(() => action(`Z:${device.selected}:0`, `K:Z:${device.selected}`))} />}
        <Button secondary label="Mark selected task done" disabled={busy || !!selected.completedAt || !!device.otaName} onPress={() => run(() => action(`M:${device.selected}`, `K:M:${device.selected}`))} />
        {device.phase !== 'R' && saved.syncedIds.map((id, slot) => {
          const task = saved.tasks.find((item) => item.id === id && !item.completedAt);
          return task && <Button key={id} secondary label={`Choose ${task.title}`} disabled={busy || !!device.otaName} onPress={() => run(() => action(`J:${slot}`, `K:J:${slot}`))} />;
        })}
      </>}
      <Text style={[styles.sectionHeading, { marginTop: 24 }]}>Dial</Text>
      <Text style={styles.hint}>Awaiting the position-reference choice. A marker alone needs manual zero after power loss.</Text>
      <Button secondary label="Disconnect" disabled={busy || status !== 'Connected'} onPress={() => run(disconnect)} />
      <Text style={[styles.label, { marginTop: 24 }]}>CONNECTION LOG</Text>
      {logs.map((line, index) => <Text key={`${index}-${line}`} style={{ color: colors.muted, fontSize: 11, marginBottom: 5, fontFamily: 'monospace' }}>{line}</Text>)}</View>}
    <Button secondary label="Replay introduction" onPress={() => run(() => setPreferences({ onboardingCompleted: false }))} />
  </Page>;
}
