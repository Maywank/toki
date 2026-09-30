import { useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useToki } from '../toki/TokiProvider';
import { sortTasks, phaseLabel } from '../toki/store';
import { Button, Card, colors, Header, Label, Page, styles } from '../toki/ui';

export default function Home() {
  const { saved, device, status, busy, addTask, sync, action } = useToki();
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState<5 | 10 | 15>(10);
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const top = sortTasks(saved.tasks).slice(0, 4);
  const synced = status === 'Connected' && device.revision === saved.revision && top.every((task, index) => saved.syncedIds[index] === task.id) && top.length === saved.syncedIds.length;
  const selectedId = device.revision === saved.revision ? saved.syncedIds[device.selected] : undefined;
  const selected = saved.tasks.find((task) => task.id === selectedId);
  const canStart = status === 'Connected' && !!selected && device.count > 0 && !(device.doneMask & (1 << device.selected)) && ['I', 'U'].includes(device.phase);
  const perform = async (fn: () => Promise<void>) => { try { await fn(); } catch (error) { Alert.alert('Toki', String(error)); } };
  function capture() { if (!title.trim()) return; addTask(title, minutes, priority); setTitle(''); }
  return <Page>
    <Header eyebrow="THE OBJECT COMES FIRST" title="Keep it in sight." description="Capture here. Let Toki hold the next four commitments in view." />
    <Card>
      <View style={styles.row}><Label>THE OBJECT</Label><Pressable onPress={() => router.push('/device')}><Text style={{ color: colors.accent }}>{status} →</Text></Pressable></View>
      <Text style={{ fontSize: 22, color: colors.ink, marginBottom: 6 }}>{phaseLabel(device.phase)}</Text>
      <Text style={styles.subtle}>{selected && !selected.completedAt ? selected.title : 'Choose a task to put on Toki.'}</Text>
      {device.phase === 'R' && <Text style={{ fontSize: 26, color: colors.ink, marginTop: 12 }}>{Math.floor(device.remaining / 60).toString().padStart(2, '0')}:{(device.remaining % 60).toString().padStart(2, '0')}</Text>}
      <Text style={[styles.subtle, { marginTop: 12 }]}>{synced ? `Stored on Toki · revision ${device.revision}` : 'Changes waiting to sync'}</Text>
      {canStart && <Button label={`Start ${selected?.minutes || 10} min`} disabled={busy} onPress={() => perform(() => action(`Z:${device.selected}:${selected?.minutes || 10}`, `K:Z:${device.selected}`))} />}
      {device.phase === 'R' && <Button secondary label="Stop session · keep task open" disabled={busy} onPress={() => perform(() => action('Y', 'K:Y'))} />}
      {selected && !selected.completedAt && <Button secondary label="Mark task complete" disabled={busy || !['I', 'R', 'U'].includes(device.phase)} onPress={() => perform(() => action(`M:${device.selected}`, `K:M:${device.selected}`))} />}
    </Card>
    <Card>
      <Label>QUICK CAPTURE</Label>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="What needs doing?" placeholderTextColor={colors.muted} returnKeyType="done" onSubmitEditing={capture} maxLength={100} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
        {([5, 10, 15] as const).map((value) => <Pressable key={value} onPress={() => setMinutes(value)} style={[styles.chip, minutes === value && styles.chipActive]}><Text style={[styles.chipText, minutes === value && styles.chipTextActive]}>{value} min</Text></Pressable>)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {([1, 2, 3] as const).map((value) => <Pressable key={value} onPress={() => setPriority(value)} style={[styles.chip, priority === value && styles.chipActive]}><Text style={[styles.chipText, priority === value && styles.chipTextActive]}>{['Now', 'Next', 'Later'][value - 1]}</Text></Pressable>)}
      </View>
      <Button label="Add task" onPress={capture} disabled={!title.trim()} />
    </Card>
    <Card>
      <View style={styles.row}><Label>NEXT FOUR</Label><Pressable onPress={() => router.push('/tasks')}><Text style={{ color: colors.accent }}>Arrange →</Text></Pressable></View>
      {top.length ? top.map((task, slot) => {
        const physicalSlot = device.revision === saved.revision ? saved.syncedIds.indexOf(task.id) : -1;
        return <View key={task.id} style={[styles.row, { borderTopWidth: slot ? 1 : 0, borderColor: colors.line, paddingVertical: 11 }]}>
          <Text style={[styles.text, { flex: 1 }]}>{slot + 1}. {task.title}</Text>
          {physicalSlot >= 0 && !(device.doneMask & (1 << physicalSlot)) && status === 'Connected' && device.phase === 'I'
            ? <Pressable onPress={() => perform(() => action(`J:${physicalSlot}`, `K:J:${physicalSlot}`))}><Text style={{ color: colors.accent }}>Show</Text></Pressable>
            : <Text style={styles.subtle}>{task.minutes}m</Text>}
        </View>;
      }) : <Text style={styles.subtle}>Your first task starts here.</Text>}
      <Button label={synced ? 'Sync again' : `Send ${top.length} to Toki`} disabled={busy || status !== 'Connected'} onPress={() => perform(sync)} />
    </Card>
  </Page>;
}
