import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { TokiProvider, useToki } from '../toki/TokiProvider';
import { Onboarding } from '../toki/onboarding';
import { Button, colors, styles } from '../toki/ui';
import { ReturnReminders } from '../toki/return-reminders';

void SplashScreen.preventAutoHideAsync().catch(() => {});

function AppContent() {
  const { loaded, storageError, retryStorage, saved } = useToki();
  useEffect(() => {
    if (loaded || storageError) void SplashScreen.hideAsync().catch(() => {});
  }, [loaded, storageError]);
  if (storageError) return <View style={styles.center}>
    <Text style={styles.wordmark}>toki</Text>
    <Text style={styles.sectionHeading}>Your notes are being kept.</Text>
    <Text selectable style={styles.subtle}>Storage could not be read or saved. Retry before continuing.</Text>
    <Text selectable style={styles.hint}>{storageError}</Text>
    <Button label="Retry" onPress={() => void retryStorage()} />
  </View>;
  if (!loaded) return <View style={styles.center}><Text style={styles.wordmark}>toki</Text><ActivityIndicator color={colors.accent} accessibilityLabel="Restoring your notes" /></View>;
  if (!saved.onboardingCompleted) return <Onboarding />;
  return <><ReturnReminders /><Stack screenOptions={{ headerStyle: { backgroundColor: colors.paper }, headerTintColor: colors.ink, headerShadowVisible: false, contentStyle: { backgroundColor: colors.paper } }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="edit-task" options={{ title: 'Task', presentation: 'formSheet', sheetAllowedDetents: [1], sheetGrabberVisible: true }} />
  </Stack></>;
}

export default function Layout() {
  return <GestureHandlerRootView style={{ flex: 1 }}><TokiProvider><AppContent /></TokiProvider></GestureHandlerRootView>;
}
