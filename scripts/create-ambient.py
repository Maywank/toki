"""Create Toki's original, sample-free ambient loops using synthesis."""
import math
import random
import wave
from array import array
from pathlib import Path

DEST = Path(__file__).resolve().parents[1] / 'mobile' / 'assets' / 'audio'
DEST.mkdir(parents=True, exist_ok=True)
RATE, BEAT = 16000, 0.8
CHORDS = [[48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 55, 59]]
for name, shift, percussion in [('paper', 0, True), ('window', 5, False)]:
    rng = random.Random(name)
    duration = 32 * BEAT
    samples = array('h')
    for n in range(round(RATE * duration)):
        t = n / RATE
        chord = CHORDS[int(t / (8 * BEAT)) % 4]
        local = t % (8 * BEAT)
        envelope = min(1, local / 0.14) * math.exp(-local / 4.5)
        value = 0
        for note in chord:
            frequency = 440 * 2 ** ((note + shift - 69) / 12)
            value += (math.sin(2 * math.pi * frequency * t) + 0.18 * math.sin(4 * math.pi * frequency * t)) * envelope * 0.055
        if percussion:
            beat = t % BEAT
            value += 0.12 * math.exp(-beat * 24) * math.sin(2 * math.pi * (48 * beat + 35 * (1 - math.exp(-beat * 20)) / 20))
            hat = t % (BEAT / 2)
            value += rng.uniform(-1, 1) * 0.024 * math.exp(-hat * 65)
        value += rng.uniform(-0.001, 0.001)
        fade = min(1, t / 0.08, (duration - t) / 0.08)
        samples.append(round(max(-0.95, min(0.95, value * fade)) * 32767))
    with wave.open(str(DEST / f'{name}.wav'), 'wb') as output:
        output.setnchannels(1); output.setsampwidth(2); output.setframerate(RATE)
        output.writeframes(samples.tobytes())
    print(f'{name}: {duration:.1f}s original loop')
