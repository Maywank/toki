import Ionicons from '@expo/vector-icons/Ionicons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { createContext, useContext, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors, styles } from './ui';

const tracks = [
  { name: 'Paper', source: require('../../assets/audio/paper.wav') },
  { name: 'Window', source: require('../../assets/audio/window.wav') },
];
type Music = { track: number; playing: boolean; error: string; toggle: () => Promise<void>; next: () => Promise<void> };
const MusicContext = createContext<Music | null>(null);

export function MusicProvider({ children }: { children: React.ReactNode }) {
  const [track, setTrack] = useState(0);
  const [error, setError] = useState('');
  const player = useAudioPlayer(tracks[0].source);
  const state = useAudioPlayerStatus(player);
  async function play(index: number) {
    try {
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' });
      // Expo Audio exposes native player settings as writable properties.
      // eslint-disable-next-line react-hooks/immutability
      player.loop = true;
      player.volume = 0.45;
      player.setActiveForLockScreen(true, { title: tracks[index].name, artist: 'Toki', albumTitle: 'Quiet loops' });
      player.play(); setError('');
    } catch { setError('Audio could not start. Try again.'); }
  }
  async function toggle() {
    if (state.playing) { player.pause(); return; }
    await play(track);
  }
  async function next() {
    const index = (track + 1) % tracks.length;
    player.pause(); player.replace(tracks[index].source); setTrack(index);
    await play(index);
  }
  return <MusicContext.Provider value={{ track, playing: state.playing, error, toggle, next }}>{children}</MusicContext.Provider>;
}

export function MusicStrip() {
  const music = useContext(MusicContext);
  if (!music) return null;
  return <View style={{ borderTopWidth: 1, borderColor: colors.line, marginTop: 25, paddingTop: 18 }}>
    <View style={styles.row}>
      <Ionicons name="musical-notes-outline" size={18} color={colors.muted} />
      <View style={{ flex: 1 }}><Text style={styles.taskTitle}>{tracks[music.track].name}</Text><Text style={styles.taskMeta}>Quiet loop</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={music.playing ? 'Pause music' : 'Play music'} style={styles.iconButton} onPress={() => void music.toggle()}><Ionicons name={music.playing ? 'pause' : 'play'} size={17} color={colors.ink} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Next quiet loop" style={styles.iconButton} onPress={() => void music.next()}><Ionicons name="play-skip-forward-outline" size={17} color={colors.ink} /></Pressable>
    </View>
    {!!music.error && <Text style={styles.hint}>{music.error}</Text>}
  </View>;
}
