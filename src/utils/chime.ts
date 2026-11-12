import { AlertSoundMode } from '../types';
import { DEFAULT_VOICE_PROFILE_ID, playNaturalTts } from './tts';

function playSoftHarmonicBell(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) {
        resolve();
        return;
      }
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2200, now);
      filter.connect(ctx.destination);

      const triggerBellNote = (freq: number, startTime: number, peakGain: number, duration: number) => {
        const fundamental = ctx.createOscillator();
        const overtone = ctx.createOscillator();
        const gain = ctx.createGain();

        fundamental.type = 'sine';
        overtone.type = 'triangle';

        fundamental.frequency.setValueAtTime(freq, startTime);
        overtone.frequency.setValueAtTime(freq * 2, startTime);

        const overtoneGain = ctx.createGain();
        overtoneGain.gain.setValueAtTime(0.12, startTime);

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        fundamental.connect(gain);
        overtone.connect(overtoneGain);
        overtoneGain.connect(gain);
        gain.connect(filter);

        fundamental.start(startTime);
        overtone.start(startTime);
        fundamental.stop(startTime + duration + 0.05);
        overtone.stop(startTime + duration + 0.05);
      };

      // Warm Fmaj9-style dual bell chime (F5 -> A5)
      triggerBellNote(698.46, now, 0.2, 0.65);
      triggerBellNote(880.0, now + 0.18, 0.18, 0.75);

      setTimeout(() => {
        ctx.close().catch(() => {});
        resolve();
      }, 980);
    } catch (e) {
      console.error('Failed to play synthesized alert chime:', e);
      resolve();
    }
  });
}

export async function playAlertChime(options?: {
  mode?: AlertSoundMode;
  voiceProfileId?: string;
}): Promise<void> {
  const mode = options?.mode ?? 'chime_soft';
  const voiceProfileId = options?.voiceProfileId || DEFAULT_VOICE_PROFILE_ID;

  if (mode === 'none') {
    return;
  }

  if (mode === 'chime_soft') {
    await playSoftHarmonicBell();
    return;
  }

  if (mode === 'chime_voice') {
    await playSoftHarmonicBell();
    const ctrl = playNaturalTts({
      text: 'Atenção!',
      profileId: voiceProfileId,
    });
    await ctrl.promise.catch(() => {});
    return;
  }

  if (mode === 'voice_attention') {
    const ctrl = playNaturalTts({
      text: 'Atenção, alunos!',
      profileId: voiceProfileId,
    });
    await ctrl.promise.catch(() => {});
  }
}
