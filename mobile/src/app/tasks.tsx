import { useMemo } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useToki } from '../toki/TokiProvider';
import { sortTasks } from '../toki/store';
import { colors, Page, styles } from '../toki/ui';

const duration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
};

export default function Tasks() {
  const { saved, status, moveTask, completeLocal, action } = useToki();
  const open = useMemo(() => sortTasks(saved.tasks), [saved.tasks]);
  const completed = useMemo(() => saved.tasks.filter((task) => task.completedAt).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)), [saved.tasks]);
  const total = saved.tasks.reduce((sum, task) => sum + task.timeSpentSeconds, 0);
  const markDone = async (id: string) => {
    const slot = saved.syncedIds.indexOf(id);
    try {
      if (status === 'Connected' && slot >= 0) await action(`M:${slot}`, `K:M:${slot}`);
      else completeLocal(id);
    } catch (error) { Alert.alert('Could not mark done', String(error)); }
  };
  const groups = Object.values(saved.tasks.reduce<Record<string, { title: string; seconds: number; count: number }>>((result, task) => {
    const key = task.title.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
    const group = result[key] ||= { title: task.title, seconds: 0, count: 0 };
    group.seconds += task.timeSpentSeconds; group.count += task.completedAt ? 1 : 0;
    return result;
  }, {})).filter((group) => group.seconds > 0).sort((a, b) => b.seconds - a.seconds);
  return <Page>
    <Text style={styles.wordmark}>toki.</Text>
    <Text style={styles.captureHeading}>Activity</Text>

    <View style={[styles.row, { marginTop: 28, marginBottom: 23 }]}>
      <View><Text style={styles.kicker}>TIME WITH TOKI</Text><Text style={styles.metric}>{duration(total)}</Text></View>
      <View style={{ alignItems: 'flex-end' }}><Text style={styles.kicker}>DONE</Text><Text style={styles.metric}>{completed.length}</Text></View>
    </View>
    <View style={[styles.row, styles.listHeading]}><Text style={styles.sectionHeading}>Open</Text><Text style={styles.hint}>{open.length}</Text></View>
    {open.length === 0 ? <Text style={styles.emptyText}>Nothing waiting. Add the next thing when it comes to mind.</Text> : open.map((task, index) => <View key={task.id} style={styles.taskRow}>
      <Text style={styles.taskNumber}>{String(index + 1).padStart(2, '0')}</Text>
      <View style={styles.taskMain}><Text numberOfLines={2} style={styles.taskTitle}>{task.title}</Text><Text style={styles.taskMeta}>{saved.syncedIds.includes(task.id) ? 'On Toki' : 'Waiting'}{task.timeSpentSeconds ? ` · ${duration(task.timeSpentSeconds)}` : ''}{index < 4 ? ' · on Toki' : ''}</Text></View>
      <View style={{ flexDirection: 'row' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Move task up" disabled={index === 0} onPress={() => moveTask(task.id, -1)} style={[styles.iconButton, index === 0 && styles.disabled]}><Text style={styles.iconButtonText}>↑</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Move task down" disabled={index === open.length - 1} onPress={() => moveTask(task.id, 1)} style={[styles.iconButton, index === open.length - 1 && styles.disabled]}><Text style={styles.iconButtonText}>↓</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Mark task done" onPress={() => markDone(task.id)} style={styles.iconButton}><Text style={styles.iconButtonText}>✓</Text></Pressable>
      </View>
    </View>)}
    {groups.length > 0 && <>
      <Text style={[styles.sectionHeading, { marginTop: 28 }]}>Time by task</Text>
      {groups.map((group) => <View key={group.title} style={styles.inlineAction}><Text style={[styles.taskTitle, { flex: 1 }]}>{group.title}</Text><Text style={styles.taskMeta}>{duration(group.seconds)} � {group.count} done</Text></View>)}
    </>}
    {completed.length > 0 && <>
      <View style={[styles.row, styles.listHeading]}><Text style={styles.sectionHeading}>Done</Text><Text style={styles.hint}>{completed.length}</Text></View>
      {completed.slice(0, 30).map((task) => <View key={task.id} style={styles.inlineAction}>
        <View style={{ flex: 1, paddingRight: 8 }}><Text style={styles.taskTitle}>{task.title}</Text><Text style={styles.taskMeta}>{new Date(task.completedAt || 0).toLocaleDateString()} · {duration(task.timeSpentSeconds)}</Text></View>
        <Text style={{ color: colors.accent }}>✓</Text>
      </View>)}
    </>}
  </Page>;
}
