export interface NaturalVoiceProfile {
  id: string;
  name: string;
  shortName: string;
  gender: 'F' | 'M';
  neuralVoice: 'Kore' | 'Zephyr' | 'Charon' | 'Puck' | 'Fenrir';
  rate: number;
  pitch: number;
  fallbackPitch: number;
  fallbackRate: number;
  style: string;
  description: string;
  badge: string;
}

export const DEFAULT_VOICE_PROFILE_ID = 'camila_natural';

export const NATURAL_VOICE_PROFILES: NaturalVoiceProfile[] = [
  {
    id: 'camila_natural',
    name: 'Camila (Feminina Natural & Suave)',
    shortName: 'Camila • Feminina Suave',
    gender: 'F',
    neuralVoice: 'Kore',
    rate: 1.0,
    pitch: 1.0,
    fallbackPitch: 1.02,
    fallbackRate: 0.96,
    style:
      'Speak in natural Brazilian Portuguese as Camila, a warm, gentle, and welcoming female gym hostess. Use smooth human intonation, natural breathing pauses, and soft warmth—authentic and conversational, never robotic.',
    description: 'Voz feminina acolhedora, suave e cristalina em Português do Brasil.',
    badge: 'FEMININA',
  },
  {
    id: 'julia_energetic',
    name: 'Júlia (Feminina Enérgica & Fitness)',
    shortName: 'Júlia • Feminina Enérgica',
    gender: 'F',
    neuralVoice: 'Zephyr',
    rate: 1.04,
    pitch: 1.0,
    fallbackPitch: 1.24,
    fallbackRate: 1.1,
    style:
      'Speak in natural Brazilian Portuguese as Júlia, a bright, upbeat, and motivating female fitness presenter. Keep a lively, cheerful, and authentic human cadence with clear articulation—never robotic.',
    description: 'Voz feminina jovem, alegre e vibrante para aulas, spinning e treinos.',
    badge: 'FITNESS',
  },
  {
    id: 'lucas_natural',
    name: 'Lucas (Masculino Natural)',
    shortName: 'Lucas • Masculino Natural',
    gender: 'M',
    neuralVoice: 'Charon',
    rate: 1.0,
    pitch: 1.0,
    fallbackPitch: 0.78,
    fallbackRate: 0.98,
    style:
      'Speak in natural Brazilian Portuguese as Lucas, a warm, friendly, and clear male gym announcer. Use smooth human intonation and natural cadence—never robotic.',
    description: 'Voz masculina humana e clara, ideal para avisos objetivos.',
    badge: 'MASCULINA',
  },
  {
    id: 'rafael_deep',
    name: 'Rafael (Locutor Grave & Impactante)',
    shortName: 'Rafael • Locutor Grave',
    gender: 'M',
    neuralVoice: 'Fenrir',
    rate: 0.95,
    pitch: 1.0,
    fallbackPitch: 0.6,
    fallbackRate: 0.88,
    style:
      'Speak in natural Brazilian Portuguese as Rafael, a confident, deep-voiced professional radio and gym announcer with rich, smooth human cadence—never robotic.',
    description: 'Locução masculina grave e marcante, estilo rádio profissional.',
    badge: 'LOCUTOR',
  },
];

export function getVoiceProfileById(profileId?: string | null): NaturalVoiceProfile {
  if (profileId === 'helena_calm') {
    return NATURAL_VOICE_PROFILES[0];
  }
  return (
    NATURAL_VOICE_PROFILES.find((p) => p.id === profileId) ||
    NATURAL_VOICE_PROFILES[0]
  );
}

export interface ParsedTtsParams {
  text: string;
  rate: number;
  pitch: number;
  voice: string;
  profileId: string;
}

export function parseTtsUrl(url: string): ParsedTtsParams {
  if (!url.startsWith('tts://')) {
    return {
      text: url,
      rate: 1.0,
      pitch: 1.0,
      voice: '',
      profileId: DEFAULT_VOICE_PROFILE_ID,
    };
  }

  const withoutPrefix = url.substring(6);
  const queryIndex = withoutPrefix.indexOf('?');
  const textPart = queryIndex !== -1 ? withoutPrefix.substring(0, queryIndex) : withoutPrefix;
  const queryPart = queryIndex !== -1 ? withoutPrefix.substring(queryIndex + 1) : '';

  const text = decodeURIComponent(textPart);
  const params = new URLSearchParams(queryPart);
  const rawProfile = params.get('profile') || '';
  const rawVoice = params.get('voice') || '';
  const rawRate = parseFloat(params.get('rate') || '1.0');
  const rawPitch = parseFloat(params.get('pitch') || '1.0');

  // Map legacy robotic defaults without explicit profile to natural Camila female voice
  const profile = rawProfile
    ? getVoiceProfileById(rawProfile)
    : getVoiceProfileById(DEFAULT_VOICE_PROFILE_ID);

  const normalizedRate =
    Number.isFinite(rawRate) && rawRate >= 0.6 && rawRate <= 1.5
      ? !rawProfile && Math.abs(rawRate - 1.08) < 0.01
        ? 1.0
        : rawRate
      : profile.rate;

  const normalizedPitch =
    Number.isFinite(rawPitch) && rawPitch >= 0.5 && rawPitch <= 2.0
      ? !rawProfile && Math.abs(rawPitch - 1.15) < 0.01
        ? 1.0
        : rawPitch
      : profile.pitch;

  return {
    text,
    rate: normalizedRate,
    pitch: normalizedPitch,
    voice: rawVoice,
    profileId: profile.id,
  };
}

export function buildTtsUrl(options: {
  text: string;
  profileId?: string;
  rate?: number;
  pitch?: number;
  voice?: string;
}): string {
  const profile = getVoiceProfileById(options.profileId);
  const rate = options.rate ?? profile.rate;
  const pitch = options.pitch ?? profile.pitch;
  const voice = options.voice ?? '';
  const params = new URLSearchParams({
    profile: profile.id,
    rate: rate.toFixed(2),
    pitch: pitch.toFixed(2),
    voice,
  });
  return `tts://${encodeURIComponent(options.text)}?${params.toString()}`;
}

// --- IndexedDB + In-memory cache for synthesized WAV audio ---
const TTS_CACHE_DB = 'I9FitTtsCache_v1';
const TTS_CACHE_STORE = 'clips';
const memoryAudioUrlCache = new Map<string, string>();

let neuralQuotaExceeded = false;
const quotaListeners = new Set<(exceeded: boolean) => void>();

export function isNeuralTtsQuotaExceeded(): boolean {
  return neuralQuotaExceeded;
}

export function subscribeNeuralQuotaChange(cb: (exceeded: boolean) => void): () => void {
  quotaListeners.add(cb);
  return () => {
    quotaListeners.delete(cb);
  };
}

function setNeuralQuotaExceeded(exceeded: boolean) {
  if (neuralQuotaExceeded !== exceeded) {
    neuralQuotaExceeded = exceeded;
    quotaListeners.forEach((cb) => cb(exceeded));
  }
}

function openTtsCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(TTS_CACHE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(TTS_CACHE_STORE)) {
        db.createObjectStore(TTS_CACHE_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getCachedBlobFromDb(key: string): Promise<Blob | null> {
  try {
    const db = await openTtsCacheDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(TTS_CACHE_STORE, 'readonly');
      const store = tx.objectStore(TTS_CACHE_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const record = req.result as { key: string; blob?: Blob } | undefined;
        resolve(record?.blob ?? null);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveCachedBlobToDb(key: string, blob: Blob): Promise<void> {
  try {
    const db = await openTtsCacheDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(TTS_CACHE_STORE, 'readwrite');
      const store = tx.objectStore(TTS_CACHE_STORE);
      store.put({ key, blob, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore storage quota errors cleanly
  }
}

function base64ToWavBlob(base64: string, mimeType = 'audio/wav'): Blob {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export async function getOrSynthesizeSpeechUrl(options: {
  text: string;
  profileId?: string;
  signal?: AbortSignal;
}): Promise<{ objectUrl: string; fromCache: boolean } | null> {
  const cleanText = options.text.trim();
  if (!cleanText) return null;

  const profile = getVoiceProfileById(options.profileId);
  const cacheKey = `${profile.neuralVoice}|${profile.id}|${cleanText}`;

  const memHit = memoryAudioUrlCache.get(cacheKey);
  if (memHit) {
    return { objectUrl: memHit, fromCache: true };
  }

  const dbBlob = await getCachedBlobFromDb(cacheKey);
  if (dbBlob) {
    const url = URL.createObjectURL(dbBlob);
    memoryAudioUrlCache.set(cacheKey, url);
    return { objectUrl: url, fromCache: true };
  }

  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: cleanText,
        voiceName: profile.neuralVoice,
        style: profile.style,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      if (response.status === 429) {
        setNeuralQuotaExceeded(true);
      }
      return null;
    }

    const data = (await response.json()) as { audioBase64?: string; mimeType?: string };
    if (!data.audioBase64) {
      return null;
    }

    setNeuralQuotaExceeded(false);
    const blob = base64ToWavBlob(data.audioBase64, data.mimeType || 'audio/wav');
    await saveCachedBlobToDb(cacheKey, blob);
    const url = URL.createObjectURL(blob);
    memoryAudioUrlCache.set(cacheKey, url);
    return { objectUrl: url, fromCache: false };
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      throw err;
    }
    return null;
  }
}

const FEMALE_NAME_PATTERN =
  /francisca|thalita|raquel|brenda|leila|yara|maria|luciana|joana|amalia|amália|gabriela|helena|ana|zira|yasmin|sara|claudia|cláudia|vitoria|vitória|female|mulher|feminina|google português/i;
const MALE_NAME_PATTERN =
  /daniel|antonio|antônio|felipe|filipe|ricardo|thiago|tiago|marcos|gustavo|pedro|donato|fabio|fábio|humberto|julio|júlio|nicolau|valerio|valério|duarte|male|homem|masculin/i;

export function pickBrowserVoiceForProfile(
  profile: NaturalVoiceProfile,
  preferredVoiceName?: string
): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  if (preferredVoiceName) {
    const exact = voices.find((v) => v.name === preferredVoiceName);
    if (exact) return exact;
  }

  const ptVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('pt'));
  const pool = ptVoices.length > 0 ? ptVoices : voices;

  const femaleVoices = pool.filter((v) => FEMALE_NAME_PATTERN.test(v.name) && !MALE_NAME_PATTERN.test(v.name));
  const maleVoices = pool.filter((v) => MALE_NAME_PATTERN.test(v.name));

  if (profile.gender === 'M') {
    if (maleVoices.length > 0) {
      if (profile.id === 'rafael_deep' && maleVoices.length > 1) {
        return maleVoices[1];
      }
      return maleVoices[0];
    }
    return pool[0] || null;
  }

  if (femaleVoices.length > 0) {
    // Prefer distinct female voices when multiple exist (e.g. Microsoft Maria + Google Português do Brasil)
    if (profile.id === 'julia_energetic' && femaleVoices.length > 1) {
      return femaleVoices[1];
    }
    const brFemale = femaleVoices.find((v) => v.lang.toLowerCase().includes('br'));
    return brFemale || femaleVoices[0];
  }

  return pool[0] || null;
}

export function pickBestBrowserFemalePtVoice(preferredVoiceName?: string): SpeechSynthesisVoice | null {
  return pickBrowserVoiceForProfile(NATURAL_VOICE_PROFILES[0], preferredVoiceName);
}

export interface PlayTtsController {
  promise: Promise<void>;
  stop: () => void;
}

export function playNaturalTts(options: {
  text: string;
  profileId?: string;
  rate?: number;
  pitch?: number;
  browserVoiceName?: string;
  forceBrowserFallback?: boolean;
  onLoadingChange?: (loading: boolean) => void;
  onStart?: () => void;
}): PlayTtsController {
  const abortController = new AbortController();
  let stopped = false;
  let activeAudio: HTMLAudioElement | null = null;

  const stop = () => {
    stopped = true;
    abortController.abort();
    if (activeAudio) {
      try {
        activeAudio.pause();
        activeAudio.currentTime = 0;
      } catch {
        // ignore
      }
      activeAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    options.onLoadingChange?.(false);
  };

  const promise = (async () => {
    const cleanText = options.text.trim();
    if (!cleanText) return;

    const profile = getVoiceProfileById(options.profileId);
    const playbackRate = Math.max(0.75, Math.min(1.35, options.rate ?? profile.rate ?? 1.0));

    if (!options.forceBrowserFallback) {
      options.onLoadingChange?.(true);
      try {
        const result = await getOrSynthesizeSpeechUrl({
          text: cleanText,
          profileId: profile.id,
          signal: abortController.signal,
        });
        options.onLoadingChange?.(false);

        if (stopped) return;

        if (result?.objectUrl) {
          await new Promise<void>((resolve, reject) => {
            if (stopped) {
              resolve();
              return;
            }
            const audio = new Audio(result.objectUrl);
            activeAudio = audio;
            audio.volume = 1.0;
            audio.playbackRate = playbackRate;
            // Preserve natural human pitch when slightly adjusting speed
            if ('preservesPitch' in audio) {
              audio.preservesPitch = true;
            }

            audio.onplay = () => {
              options.onStart?.();
            };
            audio.onended = () => {
              activeAudio = null;
              resolve();
            };
            audio.onerror = () => {
              activeAudio = null;
              reject(new Error('Falha ao reproduzir o áudio da locução natural.'));
            };

            audio.play().catch((err) => {
              activeAudio = null;
              reject(new Error(`Autoplay bloqueado pelo navegador: ${err.message}`));
            });
          });
          return;
        }
      } catch (err) {
        options.onLoadingChange?.(false);
        if (stopped || (err as { name?: string })?.name === 'AbortError') {
          return;
        }
        // Fall through to browser speechSynthesis fallback
      }
    }

    if (stopped) return;

    // Ensure browser voices list has finished async initialization if empty
    if (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      window.speechSynthesis.getVoices().length === 0
    ) {
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        const timer = setTimeout(finish, 250);
        const handler = () => {
          clearTimeout(timer);
          finish();
        };
        window.speechSynthesis.addEventListener('voiceschanged', handler, { once: true });
      });
    }

    if (stopped) return;

    // Distinct browser SpeechSynthesis fallback tuned per voice profile
    await new Promise<void>((resolve, reject) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        reject(new Error('Sintetizador de voz indisponível neste navegador.'));
        return;
      }

      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'pt-BR';

      const voice = pickBrowserVoiceForProfile(profile, options.browserVoiceName);
      if (voice) {
        utterance.voice = voice;
      }

      // Differentiate pitch & rate clearly per profile when using local fallback
      const rateScale = playbackRate / (profile.rate || 1.0);
      utterance.rate = Math.max(0.75, Math.min(1.25, profile.fallbackRate * rateScale));
      utterance.pitch = Math.max(0.55, Math.min(1.35, profile.fallbackPitch));

      utterance.onstart = () => {
        options.onStart?.();
      };
      utterance.onend = () => resolve();
      utterance.onerror = (e) => {
        if (stopped || e.error === 'interrupted' || e.error === 'canceled') {
          resolve();
        } else {
          reject(new Error(`Erro no Sintetizador de Voz: ${e.error}`));
        }
      };

      options.onStart?.();
      window.speechSynthesis.speak(utterance);
    });
  })();

  return { promise, stop };
}
