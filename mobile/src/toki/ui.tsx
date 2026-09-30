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
});
