import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useToki } from '../../toki/TokiProvider';
import { Button, colors, Page, styles } from '../../toki/ui';

export default function Write() {
  const { saved, addTask, setPreferences } = useToki();
  const [text, setText] = useState(saved.draft || '');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const submitting = useRef(false);
  const draft = useRef(text);
  useFocusEffect(useCallback(() => () => { if (!submitting.current) void setPreferences({ draft: draft.current }).catch(() => {}); }, [setPreferences]));
  useEffect(() => {
    if (submitting.current || text === (saved.draft || '')) return;
    const timer = setTimeout(() => { void setPreferences({ draft: text }).catch(() => {}); }, 300);
    return () => clearTimeout(timer);
  }, [text, saved.draft, setPreferences]);
  async function add() {
    if (!text.trim() || submitting.current) return;
    submitting.current = true; setSaving(true);
    try { await addTask(text); draft.current = ''; setText(''); setNotice('Added to Tasks. There is room for the next thought.'); }
    catch (error) { Alert.alert('Could not save your task', String(error)); }
    finally { submitting.current = false; setSaving(false); }
  }
  return <Page>
    <Text style={styles.wordmark}>toki</Text>
    <Text style={styles.captureHeading}>What is on your mind?</Text>
    <Text style={styles.subtle}>Put it here. You can arrange it later.</Text>
    <TextInput accessibilityLabel="Writing space" multiline scrollEnabled={false} maxLength={2000} style={styles.writing} value={text} editable={!saving} onChangeText={(value) => { draft.current = value; setText(value); setNotice(''); }} placeholder="A thought. A small next step…" placeholderTextColor={colors.muted} />
    <Button label={saving ? 'Keeping it…' : 'Add to Tasks'} disabled={!text.trim() || saving} onPress={() => void add()} />
    <View accessibilityLiveRegion="polite"><Text style={styles.footerNote}>{notice || 'Your writing stays here until you add it.'}</Text></View>
  </Page>;
}
