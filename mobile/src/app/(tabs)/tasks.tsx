import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { useToki } from '../../toki/TokiProvider';
import { sortTasks, Task } from '../../toki/store';
import { colors, styles } from '../../toki/ui';

const duration = (seconds: number) => seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
export default function Tasks() {
  const { saved, device, status, busy, syncNotice, reorderTasks, completeLocal, action } = useToki();
  const [history, setHistory] = useState(false);
  const tasks = useMemo(() => sortTasks(saved.tasks), [saved.tasks]);
  const completed = useMemo(() => saved.tasks.filter((task) => task.completedAt).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)), [saved.tasks]);
  const groups = Object.values(saved.tasks.reduce<Record<string, { title: string; seconds: number; count: number }>>((result, task) => {
    const key = task.title.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    const group = result[key] ||= { title: task.title, seconds: 0, count: 0 };
    group.seconds += task.timeSpentSeconds; group.count += task.completedAt ? 1 : 0;
    return result;
  }, {})).filter((group) => group.seconds > 0).sort((a, b) => b.seconds - a.seconds);
  const current = device.revision === saved.revision ? tasks.find((task) => task.id === saved.syncedIds[device.selected]) : undefined;
  const running = device.phase === 'R' && current;
  async function complete(task: Task) {
    const slot = device.revision === saved.revision ? saved.syncedIds.indexOf(task.id) : -1;
    try {
      if (status === 'Connected' && slot >= 0 && !(device.doneMask & (1 << slot))) await action(`M:${slot}`, `K:M:${slot}`);
      else if (running && task.id === current.id) throw new Error('Reconnect Toki to finish the running task.');
      else completeLocal(task.id);
    } catch (error) { Alert.alert('Could not mark done', String(error)); }
  }
  function renderTask({ item: task, drag, isActive, getIndex }: RenderItemParams<Task>) {
    const index = getIndex() ?? 0;
    const slot = saved.syncedIds.indexOf(task.id);
    const synced = device.revision === saved.revision && slot >= 0;
    return <View style={[styles.taskRow, isActive && { opacity: 0.6 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Hold to reorder ${task.title}`} delayLongPress={180} onLongPress={drag} disabled={isActive} style={styles.moreButton}><Ionicons name="reorder-two-outline" size={20} color={colors.muted} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${task.title}`} style={({ pressed }) => [styles.taskMain, pressed && styles.pressed]} onPress={() => router.push({ pathname: '/edit-task', params: { id: task.id } })}>
        <Text numberOfLines={3} style={[styles.taskTitle, task.priority === 1 && { fontWeight: '600' }]}>{task.title}</Text>
        <Text style={styles.taskMeta}>{synced ? 'On Toki' : index < 4 ? 'Next for Toki' : 'Waiting'}{task.timeSpentSeconds ? ` · ${duration(task.timeSpentSeconds)}` : ''}</Text>
        {task.priority !== 2 && <Text style={styles.priority}>{task.priority === 1 ? 'Important' : 'Later'}</Text>}
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Mark ${task.title} done`} accessibilityState={{ disabled: busy || (device.phase === 'R' && synced && slot !== device.selected) }} disabled={busy || (device.phase === 'R' && synced && slot !== device.selected)} onPress={() => void complete(task)} style={({ pressed }) => [styles.checkButton, busy && styles.disabled, pressed && styles.pressed]}><Ionicons name="ellipse-outline" size={24} color={colors.muted} /></Pressable>
    </View>;
  }
  return <SafeAreaView style={styles.safe} edges={['top']}><DraggableFlatList data={tasks} keyExtractor={(task) => task.id} renderItem={renderTask} activationDistance={8} onDragEnd={({ data }) => reorderTasks(data.map((task) => task.id))} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"
    ListHeaderComponent={<>
      <Text style={styles.wordmark}>toki</Text><Text style={styles.captureHeading}>A few things to return to.</Text>
      <Text style={styles.subtle}>Hold the handle to arrange. Your next four go to Toki.</Text>
      {running && <View style={styles.focusPanel}>
        <Text style={styles.kicker}>{status === 'Connected' ? 'IN PROGRESS' : 'LAST SEEN IN PROGRESS'}</Text>
        <Text style={styles.focusTitle}>{current.title}</Text><Text style={styles.taskMeta}>{duration(device.elapsedSeconds)} spent</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Open device controls" onPress={() => router.push('/device')} style={styles.doneLink}><Text style={styles.textLink}>Device controls</Text></Pressable>
      </View>}
      <View style={[styles.row, styles.listHeading]}><Text style={styles.sectionHeading}>Open</Text><Text style={styles.hint}>{tasks.length}</Text></View>
    </>}
    ListEmptyComponent={<Text style={styles.emptyText}>A clear space. Add the next thought in Write.</Text>}
    ListFooterComponent={<>
      <Text style={styles.footerNote}>{syncNotice}{device.phase === 'R' ? ' · Changes go to Toki when you pause or finish.' : ''}</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: history }} onPress={() => setHistory(!history)} style={[styles.row, styles.listHeading]}><Text style={styles.sectionHeading}>Activity</Text><Text style={styles.textLink}>{history ? 'Hide' : 'View'}</Text></Pressable>
      {history && <View style={{ gap: 16 }}>
        <Text style={styles.subtle}>{duration(saved.tasks.reduce((total, task) => total + task.timeSpentSeconds, 0))} with Toki · {completed.length} finished</Text>
        {!completed.length && <Text style={styles.hint}>Time spent and finished tasks will appear here.</Text>}
        {groups.length > 0 && <>
          <Text style={styles.label}>TIME BY TASK</Text>
          {groups.map((group) => <View key={group.title}><Text style={styles.taskTitle}>{group.title}</Text><Text style={styles.taskMeta}>{duration(group.seconds)} · {group.count} finished</Text></View>)}
        </>}
        {completed.length > 0 && <Text style={styles.label}>FINISHED</Text>}
        {completed.slice(0, 30).map((task) => <View key={task.id}><Text style={styles.taskTitle}>{task.title}</Text><Text style={styles.taskMeta}>{new Date(task.completedAt!).toLocaleDateString()} · {duration(task.timeSpentSeconds)}</Text></View>)}
      </View>}
    </>} />
  </SafeAreaView>;
}
