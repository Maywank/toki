import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import { InvitationPolicy } from './invitation';
import { styles } from './ui';
import { useToki } from './TokiProvider';

const ID = 'toki-return';
const CHANNEL = 'quiet-return';
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) });

export async function allowReturnInvitations() {
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Return to a task', importance: Notifications.AndroidImportance.DEFAULT, sound: null, enableVibrate: false });
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('Allow notifications in system settings to receive return invitations.');
}

export function ReturnReminders() {
  const { saved, device, status } = useToki();
  const policy = useRef(new InvitationPolicy());
  const operations = useRef<Promise<unknown>>(Promise.resolve());
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');
  const id = device.revision === saved.revision ? saved.syncedIds[device.selected] : undefined;
  const task = saved.tasks.find((item) => item.id === id && !item.completedAt);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    const app = AppState.addEventListener('change', (state) => { if (state === 'active') setNow(Date.now()); });
    const tap = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.notification.request.identifier === ID) router.push('/tasks');
    });
    // Clear only our own previous request, never other app notifications.
    operations.current = Notifications.cancelScheduledNotificationAsync(ID).catch((error) => setError(`Could not clear the previous invitation: ${String(error)}`));
    return () => { clearInterval(timer); app.remove(); tap.remove(); operations.current = operations.current.catch(() => {}).then(() => Notifications.cancelScheduledNotificationAsync(ID)).catch(() => {}); };
  }, []);
  useEffect(() => {
    const command = policy.current.observe({ taskKey: device.phase === 'R' && task ? `${saved.revision}:${task.id}` : null, connected: status === 'Connected', rssi: device.rssi, minutes: saved.reminderMinutes || 0, maintenance: !!device.otaName, manualDisconnect: status === 'Disconnected', now });
    if (!command) return;
    operations.current = operations.current.catch(() => {}).then(async () => {
      await Notifications.cancelScheduledNotificationAsync(ID);
      if (command.type === 'schedule' && task) {
        if (!(await Notifications.getPermissionsAsync()).granted) throw new Error('Notifications are disabled in system settings.');
        await Notifications.scheduleNotificationAsync({ identifier: ID, content: { title: 'A little room to return.', body: `“${task.title}” is still on Toki. Continue when you are ready.`, sound: false, data: { taskId: task.id } }, trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: command.seconds, channelId: CHANNEL } });
      }
      setError('');
    }).catch((error) => setError(`Return invitation could not be scheduled: ${String(error)}`));
  }, [saved.revision, saved.reminderMinutes, device.phase, device.rssi, device.otaName, status, task, now]);
  return error ? <View style={{ padding: 16 }}><Text selectable style={styles.hint}>{error}</Text></View> : null;
}
