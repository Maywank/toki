import { Tabs } from 'expo-router';
import { TokiProvider } from '../toki/TokiProvider';
import { colors } from '../toki/ui';

export default function Layout() {
  return <TokiProvider><Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.line, height: 62, paddingTop: 6, paddingBottom: 8 }, tabBarLabelStyle: { fontSize: 12, fontWeight: '600' } }}>
    <Tabs.Screen name="index" options={{ title: 'Toki' }} />
    <Tabs.Screen name="tasks" options={{ title: 'Tasks' }} />
    <Tabs.Screen name="device" options={{ title: 'Device' }} />
  </Tabs></TokiProvider>;
}
