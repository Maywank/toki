import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { useToki } from '../toki/TokiProvider';
import { Button, colors, styles } from '../toki/ui';
import { Task } from '../toki/store';

export default function EditTask() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { saved, updateTask, sendNext, moveTask } = useToki();
  const task = saved.tasks.find((item) => item.id === id);
  const [title, setTitle] = useState(task?.title || '');
  const [priority, setPriority] = useState<Task['priority']>(task?.priority || 2);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try { await updateTask(id, { title: title.trim(), priority }); router.back(); }
    catch (error) { Alert.alert('Could not save', String(error)); }
    finally { setSaving(false); }
  }
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
    {!task ? <Text style={styles.emptyText}>This task is no longer available.</Text> : <>
      <TextInput accessibilityLabel="Task title" multiline value={title} editable={!saving} onChangeText={setTitle} maxLength={2000} style={styles.input} placeholderTextColor={colors.muted} />
      <View style={styles.section}><Text style={styles.label}>PRIORITY</Text><View style={styles.row}>
        {([{ value: 3, label: 'Later' }, { value: 2, label: 'Normal' }, { value: 1, label: 'Important' }] as const).map((item) => <Button key={item.value} secondary label={`${priority === item.value ? '✓ ' : ''}${item.label}`} disabled={saving} onPress={() => setPriority(item.value)} />)}
      </View><Text style={styles.hint}>A small cue. You still choose the order.</Text></View>
      <Button label={saving ? 'Saving…' : 'Save'} disabled={!title.trim() || saving} onPress={() => void save()} />
      {!task.completedAt && <View style={styles.section}>
        <Button secondary label="Send next to Toki" disabled={saving} onPress={() => { sendNext(id); router.back(); }} />
        <Button secondary label="Move up" disabled={saving} onPress={() => moveTask(id, -1)} />
        <Button secondary label="Move down" disabled={saving} onPress={() => moveTask(id, 1)} />
      </View>}
    </>}
    <Button secondary label="Close" disabled={saving} onPress={() => router.back()} />
  </ScrollView>;
}
