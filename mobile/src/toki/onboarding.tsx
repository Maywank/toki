import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useToki } from './TokiProvider';
import { Button, styles } from './ui';

const pages = [
  { title: 'Room for a thought.', body: 'Write what is on your mind. One small task, or a thought you want to return to. Arrange it later.' },
  { title: 'A few things, in view.', body: 'Your next four tasks appear on Toki. Arrange them in Tasks. The rest can wait on your phone.' },
  { title: 'Begin. Pause. Finish.', body: 'On Toki, left and right choose a task. Tap the middle to begin. Hold left to pause. Hold the middle to mark it done. Time spent is kept; finishing is your choice.' },
];

export function Onboarding() {
  const { setPreferences } = useToki();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  async function finish() {
    setSaving(true);
    try { await setPreferences({ onboardingCompleted: true }); }
    catch (error) { Alert.alert('Could not save', String(error)); }
    finally { setSaving(false); }
  }
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={[styles.page, { flexGrow: 1, justifyContent: 'center' }]}>
    <Text style={styles.wordmark}>toki</Text>
    <Text style={styles.onboardingTitle}>{pages[step].title}</Text>
    <Text style={[styles.onboardingBody, { marginTop: 24 }]}>{pages[step].body}</Text>
    <View style={styles.dots} accessibilityLabel={`Introduction ${step + 1} of ${pages.length}`}>
      {pages.map((_, index) => <View key={index} style={[styles.dot, index === step && styles.dotSelected]} />)}
    </View>
    <Button label={step === pages.length - 1 ? 'Start writing' : 'Next'} disabled={saving} onPress={() => step === pages.length - 1 ? void finish() : setStep(step + 1)} />
    {step > 0 && <Button label="Back" secondary disabled={saving} onPress={() => setStep(step - 1)} />}
    <Button label="Skip introduction" secondary disabled={saving} onPress={() => void finish()} />
  </ScrollView></SafeAreaView>;
}
