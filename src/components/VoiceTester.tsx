import { useState, useEffect, useRef } from 'react';
import {
  Volume2, Play, Pause, Sparkles, Bell,
  CheckCircle2, Loader2, UserRound
} from 'lucide-react';
import { playAlertChime } from '../utils/chime';
import {
  NATURAL_VOICE_PROFILES,
  DEFAULT_VOICE_PROFILE_ID,
  playNaturalTts,
  PlayTtsController,
  pickBestBrowserFemalePtVoice,
} from '../utils/tts';

const PRESET_TEST_PHRASES = [
  {
    label: 'Organização (Halteres)',
    text: 'Atenção alunos! Por gentileza, após terminar seus exercícios, guardem os halteres e anilhas nos suportes adequados. Vamos manter a nossa academia organizada.',
  },
  {
    label: 'Aula de Spinning',
    text: 'Atenção galera do spinning! Nossa aula cheia de energia começará em cinco minutos na sala principal. Preparem suas garrafas de água e boa pedalada!',
  },
  {
    label: 'Hidratação de Treino',
    text: 'Lembrete de treino: beba água regularmente! Manter-se hidratado previne cãibras e melhora a sua recuperação muscular. Hidrate-se!',
  },
  {
    label: 'Aviso de Fechamento',
    text: 'Atenção senhores alunos! Nossa unidade encerrará as atividades em quinze minutos. Solicitamos a gentileza de começar a finalizar seus treinos.',
  },
  {
    label: 'Frase Personalizada',
    text: 'I9 Fit Gym Voice. Teste de som e voz realizado com sucesso. O sistema está pronto para uso!',
  },
];

export interface VoiceTestSpeakOptions {
  text: string;
  profileId: string;
  rate: number;
  browserVoiceName?: string;
  forceBrowserFallback?: boolean;
  onLoadingChange?: (loading: boolean) => void;
  onStart?: () => void;
  onControllerReady?: (controller: PlayTtsController) => void;
}

interface VoiceTesterProps {
  onTestSpeak?: (options: VoiceTestSpeakOptions) => Promise<void>;
  onTestChime?: () => Promise<void>;
}

export function VoiceTester({ onTestSpeak, onTestChime }: VoiceTesterProps) {
  const [selectedProfileId, setSelectedProfileId] = useState<string>(DEFAULT_VOICE_PROFILE_ID);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedBrowserVoice, setSelectedBrowserVoice] = useState<string>('');
  const [useBrowserFallback, setUseBrowserFallback] = useState<boolean>(false);

  // Audio test states
  const [testText, setTestText] = useState<string>(PRESET_TEST_PHRASES[4].text);
  const [rate, setRate] = useState<number>(1.0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isChimePlaying, setIsChimePlaying] = useState<boolean>(false);

  // Waveform visualization bars
  const [waveHeights, setWaveHeights] = useState<number[]>([15, 15, 15, 15, 15, 15, 15, 15, 15, 15]);
  const animationRef = useRef<number | null>(null);
  const activeControllerRef = useRef<PlayTtsController | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateVoicesList = () => {
      if ('speechSynthesis' in window) {
        const allVoices = window.speechSynthesis.getVoices();
        const ptVoices = allVoices.filter((v) => v.lang.toLowerCase().startsWith('pt'));
        const displayVoices = ptVoices.length > 0 ? ptVoices : allVoices;
        setBrowserVoices(displayVoices);

        if (displayVoices.length > 0 && !selectedBrowserVoice) {
          const bestFemale = pickBestBrowserFemalePtVoice();
          setSelectedBrowserVoice(bestFemale ? bestFemale.name : displayVoices[0].name);
        }
      }
    };

    updateVoicesList();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = updateVoicesList;
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (activeControllerRef.current) {
        activeControllerRef.current.stop();
      }
    };
  }, []);

  // Equalizer animation logic
  useEffect(() => {
    if (isSpeaking) {
      const animateWave = () => {
        setWaveHeights((prev) => prev.map(() => Math.floor(Math.random() * 65) + 15));
        animationRef.current = requestAnimationFrame(animateWave);
      };
      animateWave();
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      setWaveHeights([15, 15, 15, 15, 15, 15, 15, 15, 15, 15]);
    }
  }, [isSpeaking]);

  const stopPlayback = () => {
    if (activeControllerRef.current) {
      activeControllerRef.current.stop();
      activeControllerRef.current = null;
    }
    setIsLoading(false);
    setIsSpeaking(false);
  };

  const handleSpeak = async () => {
    if (!testText.trim()) return;

    if (isSpeaking || isLoading) {
      stopPlayback();
      return;
    }

    const speakOptions: VoiceTestSpeakOptions = {
      text: testText,
      profileId: selectedProfileId,
      rate,
      browserVoiceName: selectedBrowserVoice,
      forceBrowserFallback: useBrowserFallback,
      onLoadingChange: (loading) => setIsLoading(loading),
      onStart: () => setIsSpeaking(true),
      onControllerReady: (ctrl) => {
        activeControllerRef.current = ctrl;
      },
    };

    try {
      if (onTestSpeak) {
        await onTestSpeak(speakOptions);
      } else {
        const ctrl = playNaturalTts({
          text: speakOptions.text,
          profileId: speakOptions.profileId,
          rate: speakOptions.rate,
          browserVoiceName: speakOptions.browserVoiceName,
          forceBrowserFallback: speakOptions.forceBrowserFallback,
          onLoadingChange: speakOptions.onLoadingChange,
          onStart: speakOptions.onStart,
        });
        activeControllerRef.current = ctrl;
        await ctrl.promise;
      }
    } catch (err) {
      console.error('Erro ao testar voz:', err);
    } finally {
      activeControllerRef.current = null;
      setIsLoading(false);
      setIsSpeaking(false);
    }
  };

  const handlePlayChime = async () => {
    if (isChimePlaying) return;
    setIsChimePlaying(true);
    try {
      if (onTestChime) {
        await onTestChime();
      } else {
        await playAlertChime();
      }
    } finally {
      setIsChimePlaying(false);
    }
  };

  const currentProfile =
    NATURAL_VOICE_PROFILES.find((p) => p.id === selectedProfileId) || NATURAL_VOICE_PROFILES[0];

  return (
    <div
      id="voice-tester-panel"
      className="bg-[#0c0c0c] border border-zinc-800 rounded-2xl p-6 space-y-6 shadow-xl transition-all duration-300 relative overflow-hidden"
    >
      {/* Decorative ambient background light */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-neon/5 rounded-full blur-3xl pointer-events-none" />

      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-neon/15 p-2 rounded-xl border border-neon/20">
            <Volume2 className="w-5 h-5 text-neon" />
          </div>
          <div>
            <span className="text-[10px] font-mono tracking-widest text-neon uppercase block font-bold">
              LOCUÇÃO FEMININA NATURAL & DIAGNÓSTICO
            </span>
            <h2 className="text-xl font-black uppercase italic tracking-tight text-white leading-tight">
              TESTAR VOZ EM TEMPO REAL
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full font-mono">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            Voz Neural Natural (PT-BR)
          </span>
        </div>
      </div>

      {/* Tester Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Voice Selection & Parameters Column */}
        <div className="lg:col-span-7 space-y-4">
          {/* Natural Voice Cards */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                Escolha a Locutora (Voz Humana Natural)
              </label>
              <button
                type="button"
                onClick={() => setUseBrowserFallback((v) => !v)}
                className="text-[10px] font-mono font-bold text-zinc-500 hover:text-neon transition-colors cursor-pointer"
              >
                {useBrowserFallback ? 'Usar Voz Neural (Recomendado)' : 'Opções Offline / Sistema'}
              </button>
            </div>

            {!useBrowserFallback ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {NATURAL_VOICE_PROFILES.map((profile) => {
                  const isSelected = selectedProfileId === profile.id;
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => {
                        setSelectedProfileId(profile.id);
                        setRate(profile.rate);
                      }}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                        isSelected
                          ? 'bg-neon/10 border-neon text-white shadow-md shadow-neon/5'
                          : 'bg-zinc-900/50 border-zinc-850 hover:border-zinc-700 text-zinc-300 hover:bg-zinc-900'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <UserRound
                            className={`w-3.5 h-3.5 shrink-0 ${
                              profile.gender === 'F' ? 'text-fuchsia-400' : 'text-sky-400'
                            }`}
                          />
                          <span className="text-xs font-black uppercase truncate text-white">
                            {profile.shortName}
                          </span>
                        </div>
                        <span
                          className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase font-mono shrink-0 ${
                            profile.gender === 'F'
                              ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/20'
                              : 'bg-sky-500/20 text-sky-300 border border-sky-500/20'
                          }`}
                        >
                          {profile.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 leading-snug line-clamp-2">
                        {profile.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2 bg-zinc-950/80 p-3.5 rounded-xl border border-zinc-850">
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  Voz Local do Sistema Operacional ({browserVoices.length} detectadas)
                </label>
                <select
                  value={selectedBrowserVoice}
                  onChange={(e) => setSelectedBrowserVoice(e.target.value)}
                  className="w-full text-sm border border-zinc-800 rounded-xl px-3 py-2.5 bg-zinc-900 text-zinc-200 focus:outline-none focus:border-neon focus:ring-1 focus:ring-neon/30 transition-all font-bold cursor-pointer"
                >
                  {browserVoices.length === 0 ? (
                    <option value="" className="bg-zinc-950 text-zinc-500">
                      Nenhuma voz local detectada
                    </option>
                  ) : (
                    browserVoices.map((voice) => (
                      <option key={voice.name} value={voice.name} className="bg-zinc-950 text-white font-bold">
                        {voice.name} ({voice.lang}) {voice.default ? ' [Padrão]' : ''}
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}
          </div>

          {/* Speech Speed Control (keeps natural timbre with preservesPitch) */}
          <div className="bg-zinc-950/80 p-4 rounded-xl border border-zinc-850">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                Ritmo da Fala (Preserva o Timbre Natural)
              </label>
              <span className="text-[10px] font-mono font-black text-neon bg-neon/10 px-2 py-0.5 rounded border border-neon/10">
                {rate.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min="0.80"
              max="1.25"
              step="0.02"
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value))}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-neon focus:outline-none"
            />
            <div className="flex justify-between text-[8px] text-zinc-500 font-mono mt-1 font-bold">
              <span>CALMA (0.80x)</span>
              <span>NATURAL (1.00x)</span>
              <span>DINÂMICA (1.25x)</span>
            </div>
          </div>

          {/* Test Phrase Preset Selector buttons */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
              Escolher Frase de Teste Rápida
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_TEST_PHRASES.map((phrase, idx) => {
                const isActive = testText === phrase.text;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setTestText(phrase.text);
                      if (isSpeaking || isLoading) {
                        stopPlayback();
                      }
                    }}
                    className={`text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-neon text-black border-neon shadow-md shadow-neon/10'
                        : 'bg-zinc-900/50 hover:bg-zinc-900 border-zinc-850 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {phrase.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Text Area Input and Direct Control Buttons Column */}
        <div className="lg:col-span-5 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                Editar Texto de Teste
              </label>
              {!useBrowserFallback && (
                <span className="text-[9px] font-mono text-zinc-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  Locutora: <strong className="text-zinc-300">{currentProfile.shortName.split('•')[0].trim()}</strong>
                </span>
              )}
            </div>
            <textarea
              rows={3}
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="Digite o texto personalizado que deseja testar..."
              className="w-full text-xs border border-zinc-800 rounded-xl p-3 bg-zinc-900 focus:outline-none focus:border-neon focus:ring-1 focus:ring-neon/30 transition-all text-white placeholder-zinc-600 leading-relaxed font-semibold resize-none"
            />
          </div>

          {/* Equalizer animation and Actions */}
          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-850 flex items-center justify-between gap-4">
            {/* Visualizer bars */}
            <div className="flex items-end gap-[3px] h-[50px] w-[110px] px-1 shrink-0 bg-black/40 rounded-lg border border-zinc-900">
              {waveHeights.map((h, i) => (
                <div
                  key={i}
                  style={{ height: `${h}%` }}
                  className={`w-[7px] rounded-t-sm transition-all duration-75 ${
                    isSpeaking ? 'bg-neon shadow-sm shadow-neon' : 'bg-zinc-800'
                  }`}
                />
              ))}
            </div>

            <div className="flex flex-col gap-2 flex-1">
              {/* Voice Trigger Button */}
              <button
                type="button"
                onClick={handleSpeak}
                disabled={!testText.trim()}
                className={`w-full py-2.5 rounded-xl text-xs font-black uppercase italic tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 ${
                  isSpeaking || isLoading
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-md'
                    : 'bg-neon hover:bg-neon-hover text-black shadow-lg shadow-neon/10'
                }`}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Gerando Voz...
                  </>
                ) : isSpeaking ? (
                  <>
                    <Pause className="w-4 h-4 fill-current" />
                    Parar Áudio
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    Testar Voz Natural
                  </>
                )}
              </button>

              {/* Warning Chime Button */}
              <button
                type="button"
                onClick={handlePlayChime}
                disabled={isChimePlaying}
                className="w-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Bell className={`w-3.5 h-3.5 ${isChimePlaying ? 'animate-bounce text-neon' : ''}`} />
                Testar Sinal (BIP)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
