import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

export const colors = { paper: '#f5f3ee', card: '#fffcf6', ink: '#292824', muted: '#77746e', line: '#dedbd2', accent: '#963f32' };
export function Page({ children }: { children: ReactNode }) {
  return <SafeAreaView style={styles.safe} edges={['top']}><StatusBar style="dark" /><ScrollView automaticallyAdjustKeyboardInsets keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>{children}</ScrollView></SafeAreaView>;
}
export function Header({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return <View style={styles.header}><Text style={styles.wordmark}>toki</Text><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.title}>{title}</Text>{description && <Text style={styles.description}>{description}</Text>}</View>;
}
export function Card({ children }: { children: ReactNode }) { return <View style={styles.card}>{children}</View>; }
export function Button({ label, onPress, secondary, disabled }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondary, disabled && styles.disabled, pressed && styles.pressed]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text></Pressable>;
}
export function Label({ children }: { children: ReactNode }) { return <Text style={styles.label}>{children}</Text>; }
export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  page: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 48 },
  header: { marginBottom: 12 },
  wordmark: { fontSize: 28, fontWeight: '600', color: colors.ink, letterSpacing: -1.7, marginBottom: 28 },
  eyebrow: { fontSize: 11, color: colors.accent, letterSpacing: 2, fontWeight: '700', marginBottom: 8 },
  title: { fontSize: 32, fontWeight: '500', letterSpacing: -1, color: colors.ink, marginBottom: 8 },
  description: { fontSize: 14, lineHeight: 21, color: colors.muted, marginBottom: 8 },
  card: { paddingVertical: 24, marginTop: 16 },
  label: { fontSize: 11, letterSpacing: 1.6, fontWeight: '700', color: colors.muted, marginBottom: 9 },
  button: { backgroundColor: colors.accent, borderRadius: 8, borderCurve: 'continuous', minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { color: '#fffdf7', fontWeight: '600', fontSize: 14 },
  secondary: { backgroundColor: 'transparent' },
  secondaryText: { color: colors.ink },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.65 },
  section: { marginTop: 32, gap: 8 },
  writing: { minHeight: 160, color: colors.ink, fontSize: 24, lineHeight: 34, paddingVertical: 16, textAlignVertical: 'top' },
  priority: { fontSize: 11, color: colors.ink, fontWeight: '700', marginTop: 4 },
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 24, backgroundColor: colors.paper },
  onboardingTitle: { fontSize: 36, lineHeight: 42, fontWeight: '500', color: colors.ink, letterSpacing: -1 },
  onboardingBody: { fontSize: 18, lineHeight: 28, color: colors.muted },
  dots: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 24 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.line },
  dotSelected: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  text: { fontSize: 15, color: colors.ink },
  subtle: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  input: { minHeight: 48, paddingVertical: 12, color: colors.ink, fontSize: 20, lineHeight: 28 },
  chip: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 12, marginRight: 8 },
  chipActive: { borderBottomWidth: 2, borderColor: colors.accent },
  chipText: { color: colors.ink, fontSize: 13 },
  chipTextActive: { color: colors.ink, fontWeight: '700' },
  homeTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 34 },
  linkStatus: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingLeft: 10 },
  statusDot: { width: 7, height: 7, borderRadius: 5, backgroundColor: colors.muted, marginRight: 8 },
  statusDotOn: { backgroundColor: '#68785e' },
  statusText: { fontSize: 13, color: colors.muted },
  captureHeading: { fontSize: 26, lineHeight: 32, fontWeight: '500', letterSpacing: -0.6, color: colors.ink, marginBottom: 13 },
  captureRow: { flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1, borderColor: colors.line, paddingBottom: 9 },
  captureInput: { flex: 1, minHeight: 48, maxHeight: 110, paddingVertical: 12, paddingRight: 10, color: colors.ink, fontSize: 17, lineHeight: 23 },
  addButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: colors.card, fontSize: 25, lineHeight: 29, fontWeight: '300' },
  focusPanel: { marginTop: 24, paddingVertical: 16 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, color: colors.muted },
  elapsed: { fontSize: 14, fontVariant: ['tabular-nums'], color: colors.muted },
  focusTitle: { fontSize: 19, lineHeight: 25, color: colors.ink, marginTop: 8 },
  doneLink: { alignSelf: 'flex-start', paddingTop: 12, paddingBottom: 2 },
  doneLinkText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  listHeading: { marginTop: 34, marginBottom: 4 },
  sectionHeading: { fontSize: 21, color: colors.ink, fontWeight: '500' },
  textLink: { fontSize: 13, color: colors.accent, paddingVertical: 8 },
  emptyText: { fontSize: 16, lineHeight: 24, color: colors.muted, paddingVertical: 24 },
  taskRow: { flexDirection: 'row', alignItems: 'center', minHeight: 80, paddingVertical: 8 },
  taskNumber: { width: 32, fontSize: 11, fontVariant: ['tabular-nums'], color: colors.muted },
  taskMain: { flex: 1, paddingVertical: 12, paddingRight: 6 },
  taskTitle: { fontSize: 17, lineHeight: 25, color: colors.ink },
  completedTitle: { textDecorationLine: 'line-through', color: colors.muted },
  taskMeta: { marginTop: 3, fontSize: 11, color: colors.muted },
  moreButton: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  priorityMark: { fontSize: 20, color: colors.accent, fontWeight: '600' },
  checkButton: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  checkMark: { fontSize: 22, color: colors.muted },
  footerNote: { fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 13 },
  inlineAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 16 },
  iconButton: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  iconButtonText: { fontSize: 17, color: colors.ink },
  metric: { fontSize: 28, color: colors.ink, fontVariant: ['tabular-nums'], marginVertical: 4 },
  hint: { fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 5 },
});
