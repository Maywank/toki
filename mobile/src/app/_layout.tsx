import { Tabs } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { TokiProvider } from '../toki/TokiProvider';
import { MusicProvider } from '../toki/Music';
import { colors } from '../toki/ui';

export default function Layout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><TokiProvider><MusicProvider><Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.ink, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.paper, borderTopColor: colors.line, height: 68, paddingTop: 6, paddingBottom: 8 }, tabBarLabelStyle: { fontSize: 11, fontWeight: '500' } }}>
    <Tabs.Screen name="index" options={{ title: 'Notes', tabBarIcon: ({ color, size }) => <Ionicons name="document-text-outline" color={color} size={size} /> }} />
    <Tabs.Screen name="tasks" options={{ title: 'Activity', tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" color={color} size={size} /> }} />
    <Tabs.Screen name="device" options={{ title: 'Toki', tabBarIcon: ({ color, size }) => <Ionicons name="hardware-chip-outline" color={color} size={size} /> }} />
  </Tabs></MusicProvider></TokiProvider></GestureHandlerRootView>;
}
