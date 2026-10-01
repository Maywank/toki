import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../../toki/ui';

export default function TabsLayout() {
  return <Tabs screenOptions={{ headerShown: false, animation: 'none', tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.paper, borderTopWidth: 0 }, tabBarLabelStyle: { fontSize: 12, fontWeight: '500' } }}>
    <Tabs.Screen name="index" options={{ title: 'Write', tabBarIcon: ({ color, size }) => <Ionicons name="create-outline" color={color} size={size} /> }} />
    <Tabs.Screen name="tasks" options={{ title: 'Tasks', tabBarIcon: ({ color, size }) => <Ionicons name="list-outline" color={color} size={size} /> }} />
    <Tabs.Screen name="device" options={{ title: 'Device', tabBarIcon: ({ color, size }) => <Ionicons name="hardware-chip-outline" color={color} size={size} /> }} />
  </Tabs>;
}
