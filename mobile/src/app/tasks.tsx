import { Alert, Pressable, Text, View } from 'react-native';
import { useToki } from '../toki/TokiProvider';
import { sortTasks, Task } from '../toki/store';
import { Button, Card, colors, Header, Label, Page, styles } from '../toki/ui';

export default function Tasks() {
  const { saved, status, busy, updateTask, completeLocal, sync } = useToki();
  const active = sortTasks(saved.tasks);
  const completed = saved.tasks.filter((task) => task.completedAt);
  const setPriority = (task: Task) => updateTask(task.id, { priority: task.priority === 3 ? 1 : ((task.priority + 1) as 1 | 2 | 3) });
  const setMinutes = (task: Task) => updateTask(task.id, { minutes: task.minutes === 15 ? 5 : ((task.minutes + 5) as 5 | 10 | 15) });
  return <Page><Header eyebrow="TASK LIBRARY" title="A clear order." description="Now comes first. The top four become the device queue when you sync." />
    <Card><Label>OPEN · {active.length}</Label>
      {active.length ? active.map((task, index) => <View key={task.id} style={{ paddingVertical: 12, borderTopWidth: index ? 1 : 0, borderColor: colors.line }}>
        <Text style={[styles.text, { marginBottom: 7 }]}>{index < 4 ? `${index + 1}. ` : ''}{task.title}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Pressable onPress={() => setPriority(task)} style={styles.chip}><Text style={styles.chipText}>{['Now', 'Next', 'Later'][task.priority - 1]} ↻</Text></Pressable>
          <Pressable onPress={() => setMinutes(task)} style={styles.chip}><Text style={styles.chipText}>{task.minutes} min ↻</Text></Pressable>
          <Pressable onPress={() => updateTask(task.id, { order: task.order - 1.5 })} style={styles.chip}><Text style={styles.chipText}>Move up</Text></Pressable>
          <Pressable onPress={() => completeLocal(task.id)} style={styles.chip}><Text style={styles.chipText}>Done</Text></Pressable>
        </View>
      </View>) : <Text style={styles.subtle}>No open tasks yet. Capture one on the Toki tab.</Text>}
      <Button label="Sync top four" disabled={busy || status !== 'Connected'} onPress={() => sync().catch((error) => Alert.alert('Sync failed', String(error)))} />
    </Card>
    {completed.length > 0 && <Card><Label>COMPLETED · {completed.length}</Label>{completed.slice(-10).reverse().map((task) => <Text key={task.id} style={[styles.subtle, { paddingVertical: 7 }]}>{task.title}</Text>)}</Card>}
  </Page>;
}
