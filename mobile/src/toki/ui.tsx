import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

export const colors = { paper: '#f5f3ee', card: '#fffcf6', ink: '#292824', muted: '#77746e', line: '#dedbd2', accent: '#a36356' };
export function Page({ children }: { children: ReactNode }) {
  return <SafeAreaView style={styles.safe} edges={['top']}><StatusBar style="dark" /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>{children}</ScrollView></SafeAreaView>;
}
export function Header({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return <View style={styles.header}><Text style={styles.wordmark}>toki<Text style={{ color: colors.accent }}>.</Text></Text><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.title}>{title}</Text>{description && <Text style={styles.description}>{description}</Text>}</View>;
}
export function Card({ children }: { children: ReactNode }) { return <View style={styles.card}>{children}</View>; }
export function Button({ label, onPress, secondary, disabled }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondary, disabled && styles.disabled]}><Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text></Pressable>;
}
export function Label({ children }: { children: ReactNode }) { return <Text style={styles.label}>{children}</Text>; }
export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  page: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 38 },
  header: { marginBottom: 12 },
  wordmark: { fontSize: 28, fontWeight: '600', color: colors.ink, letterSpacing: -1.7, marginBottom: 28 },
  eyebrow: { fontSize: 11, color: colors.accent, letterSpacing: 2, fontWeight: '700', marginBottom: 8 },
  title: { fontSize: 32, fontWeight: '500', letterSpacing: -1, color: colors.ink, marginBottom: 8 },
  description: { fontSize: 14, lineHeight: 21, color: colors.muted, marginBottom: 8 },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 13, padding: 17, marginTop: 13 },
  label: { fontSize: 11, letterSpacing: 1.6, fontWeight: '700', color: colors.muted, marginBottom: 9 },
  button: { backgroundColor: colors.ink, borderRadius: 8, paddingHorizontal: 15, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', marginTop: 9 },
  buttonText: { color: '#fffdf7', fontWeight: '600', fontSize: 14 },
  secondary: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line },
  secondaryText: { color: colors.ink },
  disabled: { opacity: 0.45 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  text: { fontSize: 15, color: colors.ink },
  subtle: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  input: { borderColor: colors.line, borderWidth: 1, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 11, color: colors.ink, fontSize: 16 },
  chip: { borderWidth: 1, borderColor: colors.line, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 7, marginRight: 7, marginTop: 7 },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.ink, fontSize: 13 },
  chipTextActive: { color: '#fff' },
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
  focusPanel: { marginTop: 26, paddingVertical: 16, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.card },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, color: colors.muted },
  elapsed: { fontSize: 14, fontVariant: ['tabular-nums'], color: colors.muted },
  focusTitle: { fontSize: 19, lineHeight: 25, color: colors.ink, marginTop: 8 },
  doneLink: { alignSelf: 'flex-start', paddingTop: 12, paddingBottom: 2 },
  doneLinkText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  listHeading: { marginTop: 34, marginBottom: 4 },
  sectionHeading: { fontSize: 21, color: colors.ink, fontWeight: '500' },
  textLink: { fontSize: 13, color: colors.accent, paddingVertical: 8 },
  emptyText: { fontSize: 15, color: colors.muted, paddingVertical: 22, borderBottomWidth: 1, borderColor: colors.line },
  taskRow: { flexDirection: 'row', alignItems: 'center', minHeight: 67, borderBottomWidth: 1, borderColor: colors.line },
  taskNumber: { width: 32, fontSize: 11, fontVariant: ['tabular-nums'], color: colors.muted },
  taskMain: { flex: 1, paddingVertical: 12, paddingRight: 6 },
  taskTitle: { fontSize: 15, lineHeight: 21, color: colors.ink },
  completedTitle: { textDecorationLine: 'line-through', color: colors.muted },
  taskMeta: { marginTop: 3, fontSize: 11, color: colors.muted },
  moreButton: { width: 34, height: 42, alignItems: 'center', justifyContent: 'center' },
  priorityMark: { fontSize: 20, color: colors.accent, fontWeight: '600' },
  checkButton: { width: 38, height: 42, alignItems: 'flex-end', justifyContent: 'center' },
  checkMark: { fontSize: 22, color: colors.muted },
  footerNote: { fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 13 },
  inlineAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, borderBottomWidth: 1, borderColor: colors.line },
  iconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 18, marginLeft: 7 },
  iconButtonText: { fontSize: 17, color: colors.ink },
  metric: { fontSize: 28, color: colors.ink, fontVariant: ['tabular-nums'], marginVertical: 4 },
  hint: { fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 5 },
});
