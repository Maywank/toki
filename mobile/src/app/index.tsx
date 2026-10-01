import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { router } from 'expo-router';
import { useToki } from '../toki/TokiProvider';
import { sortTasks, Task } from '../toki/store';
import { MusicStrip } from '../toki/Music';
import { Button, colors, styles } from '../toki/ui';

const elapsedLabel = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

export default function Home() {
  const { saved, device, status, busy, syncNotice, addTask, updateTask, reorderTasks, sendNext, moveTask, completeLocal, action } = useToki();
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const tasks = useMemo(() => sortTasks(saved.tasks), [saved.tasks]);
  const selectedId = device.revision === saved.revision ? saved.syncedIds[device.selected] : undefined;
  const active = tasks.find((task) => task.id === selectedId);
  const add = () => { if (title.trim()) { addTask(title); setTitle(''); } };
  async function complete(taskId: string) {
    const slot = saved.syncedIds.indexOf(taskId);
    try {
      if (status === 'Connected' && slot >= 0 && !(device.doneMask & (1 << slot))) await action(`M:${slot}`, `K:M:${slot}`);
      else completeLocal(taskId);
    } catch (error) { Alert.alert('Could not mark done', String(error)); }
  }
  function menu(task: Task) {
    Alert.alert(task.title, undefined, [
      { text: 'Send next to Toki', onPress: () => sendNext(task.id) },
      { text: 'Edit', onPress: () => { setEditing(task); setEditTitle(task.title); } },
      { text: 'Move up', onPress: () => moveTask(task.id, -1) },
      { text: 'Move down', onPress: () => moveTask(task.id, 1) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }
  function renderTask({ item: task, drag, isActive, getIndex }: RenderItemParams<Task>) {
    const index = getIndex() || 0;
    const slot = saved.syncedIds.indexOf(task.id);
    const onDevice = slot >= 0 && device.revision === saved.revision;
    const selected = onDevice && slot === device.selected;
    return <View style={[styles.taskRow, { backgroundColor: isActive ? colors.card : colors.paper }]}>
      <Pressable onLongPress={drag} disabled={isActive} delayLongPress={180} style={{ width: 32, height: 56, justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={`Hold to reorder ${task.title}`}>
        <Ionicons name="reorder-two-outline" size={20} color={colors.muted} />
      </Pressable>
      <Pressable style={styles.taskMain} onPress={() => {
        if (onDevice && status === 'Connected' && device.phase !== 'R' && !busy) void action(`J:${slot}`, `K:J:${slot}`).catch((error) => Alert.alert('Toki', String(error)));
      }} accessibilityRole="button" accessibilityLabel={`${index + 1}. ${task.title}`}>
        <Text numberOfLines={3} style={styles.taskTitle}>{task.title}</Text>
        {onDevice && <Text style={styles.taskMeta}>{selected ? 'On Toki · selected' : 'On Toki'}</Text>}
      </Pressable>
      <Pressable onPress={() => menu(task)} accessibilityRole="button" accessibilityLabel={`Options for ${task.title}`} style={styles.moreButton}><Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} /></Pressable>
      <Pressable onPress={() => void complete(task.id)} disabled={busy} accessibilityRole="button" accessibilityLabel={`Mark ${task.title} done`} style={styles.checkButton}><Ionicons name="ellipse-outline" size={22} color={colors.muted} /></Pressable>
    </View>;
  }
  return <SafeAreaView style={styles.safe} edges={['top']}><StatusBar style="dark" />
    <DraggableFlatList
      data={tasks}
      keyExtractor={(task) => task.id}
      renderItem={renderTask}
      onDragEnd={({ data }) => reorderTasks(data.map((task) => task.id))}
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
      activationDistance={8}
      ListHeaderComponent={<>
        <View style={styles.homeTop}>
          <Text style={[styles.wordmark, { marginBottom: 0 }]}>toki.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Device connection" onPress={() => router.push('/device')} style={styles.linkStatus}>
            <View style={[styles.statusDot, status === 'Connected' && styles.statusDotOn]} />
            <Text style={styles.statusText}>{status === 'Connected' ? 'Connected' : 'Connect'}</Text>
          </Pressable>
        </View>
        <Text style={styles.captureHeading}>What needs doing?</Text>
        <View style={styles.captureRow}>
          <TextInput accessibilityLabel="Write a task" style={styles.captureInput} value={title} onChangeText={setTitle} placeholder="Write it down…" placeholderTextColor={colors.muted} returnKeyType="done" onSubmitEditing={add} maxLength={160} />
          <Pressable accessibilityRole="button" accessibilityLabel="Add task" onPress={add} disabled={!title.trim()} style={[styles.addButton, !title.trim() && styles.disabled]}><Ionicons name="add" size={23} color={colors.paper} /></Pressable>
        </View>
        {device.phase === 'R' && active && <View style={styles.focusPanel}>
          <View style={styles.row}><Text style={styles.kicker}>IN PROGRESS</Text><Text style={styles.elapsed}>{elapsedLabel(device.elapsedSeconds)}</Text></View>
          <Text numberOfLines={2} style={styles.focusTitle}>{active.title}</Text>
          <View style={[styles.row, { marginTop: 6 }]}>
            <Pressable accessibilityRole="button" onPress={() => void action('Y', 'K:Y').catch((error) => Alert.alert('Toki', String(error)))} disabled={busy} style={styles.doneLink}><Text style={styles.textLink}>Pause</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => void complete(active.id)} disabled={busy} style={styles.doneLink}><Text style={styles.doneLinkText}>Mark done  ✓</Text></Pressable>
          </View>
        </View>}
        <View style={[styles.row, styles.listHeading]}><Text style={styles.sectionHeading}>Tasks</Text><Text style={styles.hint}>{tasks.length}</Text></View>
      </>}
      ListEmptyComponent={<Text style={styles.emptyText}>A clear space for the first thing.</Text>}
      ListFooterComponent={<>
        {!!syncNotice && <Text style={styles.footerNote}>{syncNotice}</Text>}
        {device.phase === 'R' && <Text style={styles.footerNote}>Your next four update when this task is paused or finished.</Text>}
        <MusicStrip />
      </>}
    />
    <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: '#00000044', padding: 24 }}><View style={[styles.card, { marginTop: 0 }]}>
        <Text style={styles.sectionHeading}>Edit task</Text>
        <TextInput autoFocus value={editTitle} onChangeText={setEditTitle} maxLength={160} multiline style={[styles.input, { marginTop: 16 }]} />
        <Button label="Save" disabled={!editTitle.trim()} onPress={() => { if (editing) updateTask(editing.id, { title: editTitle.trim() }); setEditing(null); }} />
        <Button secondary label="Cancel" onPress={() => setEditing(null)} />
      </View></View>
    </Modal>
  </SafeAreaView>;
}
