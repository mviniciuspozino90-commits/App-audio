import { useState, useEffect, useRef } from 'react';
import { AnnouncementAudio, Schedule, PlayLog, AlertSoundMode } from './types';
import { MusicPlayer, MusicPlayerControls } from './components/MusicPlayer';
import { AudioCreator } from './components/AudioCreator';
import { ScheduleManager } from './components/ScheduleManager';
import { LogView } from './components/LogView';
import { VoiceTester, VoiceTestSpeakOptions } from './components/VoiceTester';
import {
  getAudios,
  getSchedules,
  getLogs,
  saveLog,
  deleteAudioFromDB,
  deleteScheduleFromDB,
} from './utils/db';
import {
  DEFAULT_VOICE_PROFILE_ID,
  parseTtsUrl,
  playNaturalTts,
  getOrSynthesizeSpeechUrl,
} from './utils/tts';
import { 
  Clock, Info, VolumeX, Volume2, ShieldCheck, Play, HelpCircle, 
  Settings, CheckCircle2, ChevronRight, Speaker, Sparkles, Activity
} from 'lucide-react';
import { playAlertChime } from './utils/chime';
import logoImage from './assets/images/i9_fit_logo_1782574590242.jpg';

const DAYS_NAME = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function App() {
  const [audios, setAudios] = useState<AnnouncementAudio[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [logs, setLogs] = useState<PlayLog[]>([]);

  // Music controls provided by child MusicPlayer
  const musicPlayerRef = useRef<MusicPlayerControls | null>(null);

  // App running states
  const [currentDateTime, setCurrentDateTime] = useState<Date>(new Date());
  const [activeAnnouncement, setActiveAnnouncement] = useState<{ title: string; audioName: string } | null>(null);
  const [showInstructions, setShowInstructions] = useState(true);

  // Ref tracking
  const lastTriggeredRef = useRef<Record<string, string>>({}); // scheduleId -> "YYYY-MM-DD HH:MM"
  const fadeIntervalRef = useRef<any>(null);
  const currentAnnouncementAudioRef = useRef<HTMLAudioElement | null>(null);

  // Load data from DB on mount (without pre-available system presets)
  const loadData = async () => {
    try {
      let dbAudios = await getAudios();
      let dbSchedules = await getSchedules();
      const dbLogs = await getLogs();

      // One-time purge of previously pre-populated system presets & default schedules
      const purgeFlag = 'i9fit_purged_presets_v1';
      if (typeof window !== 'undefined' && !localStorage.getItem(purgeFlag)) {
        const defaultScheduleIds = new Set([
          'sched_halteres_10',
          'sched_spinning_18',
          'sched_fechamento_22',
        ]);

        const presetAudios = dbAudios.filter(
          (a) => a.type === 'preset' || a.id.startsWith('preset_')
        );
        for (const presetAudio of presetAudios) {
          await deleteAudioFromDB(presetAudio.id);
        }

        const presetSchedules = dbSchedules.filter((s) =>
          defaultScheduleIds.has(s.id)
        );
        for (const presetSched of presetSchedules) {
          await deleteScheduleFromDB(presetSched.id);
        }

        dbAudios = dbAudios.filter(
          (a) => a.type !== 'preset' && !a.id.startsWith('preset_')
        );
        dbSchedules = dbSchedules.filter((s) => !defaultScheduleIds.has(s.id));
        localStorage.setItem(purgeFlag, 'true');
      }

      setAudios(dbAudios);
      setSchedules(dbSchedules);
      setLogs(dbLogs);
    } catch (e) {
      console.error('Error loading initial data:', e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Sync Clock & Check Scheduler Ticks
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentDateTime(now);
      checkSchedules(now);
    }, 1000);

    return () => {
      clearInterval(interval);
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current);
    };
  }, [schedules, audios]);

  // Scheduler Engine
  const checkSchedules = (now: Date) => {
    const currentHour = now.getHours().toString().padStart(2, '0');
    const currentMinute = now.getMinutes().toString().padStart(2, '0');
    const currentTimeStr = `${currentHour}:${currentMinute}`;
    const currentDay = now.getDay(); // 0-6

    const dateKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;

    schedules.forEach((schedule) => {
      if (!schedule.enabled) return;

      // Check if day matches
      if (schedule.days.includes(currentDay)) {
        let isTimeMatch = false;

        if (schedule.interval && schedule.interval > 0) {
          const [startHourStr, startMinuteStr] = schedule.time.split(':');
          const startHour = parseInt(startHourStr, 10);
          const startMinute = parseInt(startMinuteStr, 10);
          const startTotalMinutes = startHour * 60 + startMinute;
          const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();

          if (currentTotalMinutes >= startTotalMinutes) {
            const diffMinutes = currentTotalMinutes - startTotalMinutes;
            if (diffMinutes % schedule.interval === 0) {
              isTimeMatch = true;
            }
          }
        } else {
          isTimeMatch = schedule.time === currentTimeStr;
        }

        if (isTimeMatch) {
          const triggerKey = `${dateKey} ${currentTimeStr}`;
          
          // Check if already triggered in this minute
          if (lastTriggeredRef.current[schedule.id] !== triggerKey) {
            lastTriggeredRef.current[schedule.id] = triggerKey;
            
            // Trigger!
            const alertMode: AlertSoundMode =
              schedule.alertMode ?? (schedule.playChime === false ? 'none' : 'chime_voice');
            triggerAnnouncement(
              schedule.audioId,
              schedule.title,
              schedule.fadeOutTime,
              alertMode,
              schedule.voiceProfileId
            );
          }
        }
      }
    });
  };

  // Central Playing Sequence
  const triggerAnnouncement = async (
    audioId: string,
    scheduleTitle: string,
    fadeOutSec: number = 2,
    alertMode: AlertSoundMode = 'chime_voice',
    voiceProfileId?: string
  ) => {
    const audio = audios.find((a) => a.id === audioId);
    if (!audio) {
      // Audio deleted or missing
      const errorLog: PlayLog = {
        id: 'log_' + Date.now(),
        timestamp: Date.now(),
        scheduleTitle,
        audioName: 'Áudio não encontrado',
        status: 'failed',
        message: 'O arquivo ou configuração de áudio não foi encontrado no sistema.',
      };
      await saveLog(errorLog);
      setLogs((prev) => [errorLog, ...prev]);
      return;
    }

    // Set currently active announcement
    setActiveAnnouncement({
      title: scheduleTitle,
      audioName: audio.name,
    });

    const isMusicPlayingBefore = musicPlayerRef.current ? musicPlayerRef.current.isPlaying() : false;
    const configuredVol = musicPlayerRef.current ? musicPlayerRef.current.getConfiguredVolume() : 35;

    const isTts = audio.url.startsWith('tts://');
    const parsedTts = isTts ? parseTtsUrl(audio.url) : null;
    const effectiveVoiceProfileId =
      voiceProfileId || parsedTts?.profileId || DEFAULT_VOICE_PROFILE_ID;

    // Pre-synthesize natural TTS and spoken alert in parallel with music fade-out
    const preWarmPromises: Promise<unknown>[] = [];
    if (parsedTts) {
      preWarmPromises.push(
        getOrSynthesizeSpeechUrl({
          text: parsedTts.text,
          profileId: effectiveVoiceProfileId,
        }).catch(() => null)
      );
    }
    if (alertMode === 'chime_voice') {
      preWarmPromises.push(
        getOrSynthesizeSpeechUrl({
          text: 'Atenção!',
          profileId: effectiveVoiceProfileId,
        }).catch(() => null)
      );
    } else if (alertMode === 'voice_attention') {
      preWarmPromises.push(
        getOrSynthesizeSpeechUrl({
          text: 'Atenção, alunos!',
          profileId: effectiveVoiceProfileId,
        }).catch(() => null)
      );
    }

    // Phase 1: Duck or Pause background music (Spotify, YouTube, Local)
    const duckPromise = musicPlayerRef.current
      ? musicPlayerRef.current.duckForAnnouncement(fadeOutSec * 1000)
      : Promise.resolve();

    await Promise.all([duckPromise, ...preWarmPromises]);

    // Phase 1.5: Play alert sound / voice intro if enabled
    if (alertMode !== 'none') {
      await playAlertChime({
        mode: alertMode,
        voiceProfileId: effectiveVoiceProfileId,
      });
    }

    // Phase 2: Play the selected audio
    try {
      if (isTts && parsedTts) {
        const ctrl = playNaturalTts({
          text: parsedTts.text,
          profileId: effectiveVoiceProfileId,
          rate: parsedTts.rate,
          pitch: parsedTts.pitch,
          browserVoiceName: parsedTts.voice,
        });
        await ctrl.promise;
      } else {
        await new Promise<void>((resolve, reject) => {
          // Play standard audio element (Recorded or uploaded Base64/Blob URL)
          const playAudio = new Audio(audio.url);
          currentAnnouncementAudioRef.current = playAudio;
          playAudio.volume = 1.0; // full blast (100%) for announcements and vinhetas

          playAudio.onended = () => {
            resolve();
          };

          playAudio.onerror = () => {
            reject(new Error('Erro ao carregar o arquivo de áudio.'));
          };

          playAudio.play().catch((err) => {
            reject(new Error(`Autoplay bloqueado pelo navegador: ${err.message}`));
          });
        });
      }

      // Log success
      const successLog: PlayLog = {
        id: 'log_' + Date.now(),
        timestamp: Date.now(),
        scheduleTitle,
        audioName: audio.name,
        status: 'success',
        message: `Anúncio reproduzido a 100% do volume. Trilha de fundo (Spotify) restaurada para ${configuredVol}%.`,
      };
      await saveLog(successLog);
      setLogs((prev) => [successLog, ...prev]);

    } catch (err: any) {
      // Log failure
      const failLog: PlayLog = {
        id: 'log_' + Date.now(),
        timestamp: Date.now(),
        scheduleTitle,
        audioName: audio.name,
        status: 'failed',
        message: err.message || 'Falha desconhecida na reprodução.',
      };
      await saveLog(failLog);
      setLogs((prev) => [failLog, ...prev]);
    } finally {
      // Clean up announcement state
      setActiveAnnouncement(null);
      currentAnnouncementAudioRef.current = null;

      // Phase 3: Resume background music and restore volume back to exact configured level (e.g., 35%)
      if (musicPlayerRef.current) {
        if (isMusicPlayingBefore) {
          await musicPlayerRef.current.restoreFromAnnouncement(fadeOutSec * 1000);
        } else {
          musicPlayerRef.current.setConfiguredVolume(configuredVol);
        }
      }
    }
  };

  // Helper function to handle smooth fading
  const fadeMusicVolume = (fromVol: number, toVol: number, durationMs: number): Promise<void> => {
    return new Promise((resolve) => {
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
      }

      if (durationMs <= 0) {
        if (musicPlayerRef.current) {
          musicPlayerRef.current.setVolume(toVol);
          if (toVol === 0) musicPlayerRef.current.pause();
        }
        resolve();
        return;
      }

      const steps = 15;
      const intervalTime = durationMs / steps;
      let currentStep = 0;

      fadeIntervalRef.current = setInterval(() => {
        currentStep++;
        const fraction = currentStep / steps;
        const targetVol = fromVol + (toVol - fromVol) * fraction;

        if (musicPlayerRef.current) {
          musicPlayerRef.current.setVolume(Math.round(targetVol));
        }

        if (currentStep >= steps) {
          clearInterval(fadeIntervalRef.current);
          if (musicPlayerRef.current && toVol === 0) {
            musicPlayerRef.current.pause();
          }
          resolve();
        }
      }, intervalTime);
    });
  };

  // For manual triggers
  const handleManualTrigger = (
    audioId: string,
    title: string,
    alertMode: AlertSoundMode = 'chime_voice',
    voiceProfileId?: string
  ) => {
    triggerAnnouncement(audioId, `Disparo Manual: ${title}`, 1.5, alertMode, voiceProfileId);
  };

  const handleTestSpeak = async (options: VoiceTestSpeakOptions) => {
    const isMusicPlayingBefore = musicPlayerRef.current ? musicPlayerRef.current.isPlaying() : false;
    const configuredVol = musicPlayerRef.current ? musicPlayerRef.current.getConfiguredVolume() : 35;

    options.onLoadingChange?.(true);

    const preWarmPromise = !options.forceBrowserFallback
      ? getOrSynthesizeSpeechUrl({
          text: options.text,
          profileId: options.profileId,
        }).catch(() => null)
      : Promise.resolve(null);

    const duckPromise = musicPlayerRef.current
      ? musicPlayerRef.current.duckForAnnouncement(1500)
      : Promise.resolve();

    await Promise.all([duckPromise, preWarmPromise]);
    options.onLoadingChange?.(false);

    try {
      const ctrl = playNaturalTts({
        text: options.text,
        profileId: options.profileId,
        rate: options.rate,
        browserVoiceName: options.browserVoiceName,
        forceBrowserFallback: options.forceBrowserFallback,
        onLoadingChange: options.onLoadingChange,
        onStart: options.onStart,
      });
      options.onControllerReady?.(ctrl);
      await ctrl.promise;
    } finally {
      if (musicPlayerRef.current) {
        if (isMusicPlayingBefore) {
          await musicPlayerRef.current.restoreFromAnnouncement(1500);
        } else {
          musicPlayerRef.current.setConfiguredVolume(configuredVol);
        }
      }
    }
  };

  const handleTestChime = async (mode: AlertSoundMode, voiceProfileId: string) => {
    const isMusicPlayingBefore = musicPlayerRef.current ? musicPlayerRef.current.isPlaying() : false;
    const configuredVol = musicPlayerRef.current ? musicPlayerRef.current.getConfiguredVolume() : 35;

    const preWarmAlert =
      mode === 'chime_voice'
        ? getOrSynthesizeSpeechUrl({ text: 'Atenção!', profileId: voiceProfileId }).catch(() => null)
        : mode === 'voice_attention'
        ? getOrSynthesizeSpeechUrl({ text: 'Atenção, alunos!', profileId: voiceProfileId }).catch(() => null)
        : Promise.resolve(null);

    const duckPromise = musicPlayerRef.current
      ? musicPlayerRef.current.duckForAnnouncement(1000)
      : Promise.resolve();

    await Promise.all([duckPromise, preWarmAlert]);

    try {
      await playAlertChime({ mode, voiceProfileId });
    } finally {
      if (musicPlayerRef.current) {
        if (isMusicPlayingBefore) {
          await musicPlayerRef.current.restoreFromAnnouncement(1000);
        } else {
          musicPlayerRef.current.setConfiguredVolume(configuredVol);
        }
      }
    }
  };

  const formattedTime = currentDateTime.toLocaleTimeString('pt-BR');
  const formattedDay = DAYS_NAME[currentDateTime.getDay()];
  const formattedDate = currentDateTime.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div className="min-h-screen bg-[#080808] text-zinc-100 flex flex-col font-sans antialiased selection:bg-neon selection:text-black relative">
      {/* Subtle Logo Watermark Background Overlay */}
      <div 
        className="fixed inset-0 bg-cover bg-center pointer-events-none opacity-[0.06] z-0" 
        style={{ backgroundImage: `url(${logoImage})` }}
      />

      {/* Header Bar */}
      <header className="bg-[#0c0c0c]/90 backdrop-blur-md border-b border-zinc-800 py-4 px-6 sticky top-0 z-10 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img 
              src={logoImage} 
              alt="I9 Fit Logo" 
              className="w-14 h-14 rounded-xl border border-neon/30 object-cover shadow-lg shadow-neon/10 shrink-0"
              referrerPolicy="no-referrer"
            />
            <div className="flex flex-col">
              <span className="text-neon font-mono text-[10px] tracking-[0.3em] uppercase mb-1 block">
                SISTEMA DE VOZ E AGENDAMENTO
              </span>
              <h1 className="text-3xl md:text-4xl font-black tracking-tighter leading-none italic uppercase text-white">
                I9 FIT <span className="text-neon">GYM VOICE</span>
              </h1>
            </div>
          </div>

          {/* Clock Dashboard & Active status */}
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <button
              onClick={() => {
                const element = document.getElementById('voice-tester-panel');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  element.classList.add('ring-2', 'ring-neon', 'ring-offset-2', 'ring-offset-black');
                  setTimeout(() => {
                    element.classList.remove('ring-2', 'ring-neon', 'ring-offset-2', 'ring-offset-black');
                  }, 2000);
                }
              }}
              className="px-4 py-2.5 bg-zinc-900/85 hover:bg-zinc-800 border border-zinc-800 text-xs font-black uppercase italic text-neon rounded-xl flex items-center gap-2 cursor-pointer transition-all hover:border-neon/40 shadow-md hover:shadow-neon/5 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Volume2 className="w-4 h-4 animate-pulse" />
              TESTAR VOZ DO SISTEMA
            </button>

            <div id="clock-dashboard-panel" className="text-center md:text-right flex flex-col items-center md:items-end bg-zinc-900/40 border border-zinc-800/80 px-5 py-2.5 rounded-xl">
              <div className="text-3xl md:text-5xl font-mono leading-none tracking-tighter text-white font-bold tabular-nums">
                {formattedTime}
              </div>
              <div className="flex items-center justify-center md:justify-end mt-2 gap-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide">
                  {formattedDay} • {formattedDate}
                </span>
                <div className="w-2 h-2 bg-neon rounded-full animate-pulse"></div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">
                  ACTIVE
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 space-y-6">
        
        {/* Onboarding Announcement Instructions */}
        {showInstructions && (
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 relative overflow-hidden flex flex-col md:flex-row gap-4 items-start">
            <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 opacity-5 pointer-events-none text-neon">
              <Speaker className="w-48 h-48" />
            </div>
            <div className="bg-neon/10 p-3 rounded-xl shrink-0 text-neon border border-neon/10">
              <Info className="w-5 h-5" />
            </div>
            <div className="space-y-2 flex-1 pr-6">
              <h3 className="text-sm font-bold text-neon uppercase tracking-wider italic">
                Como funciona o Pausa Automática da Música?
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-4xl">
                Navegadores impedem que um site controle outros aplicativos externos ou abas separadas (como o aplicativo oficial do YouTube). 
                Para que o sistema consiga **pausar a música, anunciar e retomar automaticamente**, toque sua playlist de treino através do **Player Integrado do YouTube** ou pelas **Músicas Locais** disponibilizados abaixo.
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1 text-[10px] uppercase font-mono font-bold tracking-wider text-neon">
                <span className="flex items-center gap-1">✓ Pausa Automática</span>
                <span className="flex items-center gap-1">✓ Transição Suave (Fade Out)</span>
                <span className="flex items-center gap-1">✓ Sintetizador de Voz Integrado</span>
                <span className="flex items-center gap-1">✓ Sem anúncios externos</span>
              </div>
            </div>
            <button
              onClick={() => setShowInstructions(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-all text-xs font-bold"
            >
              [ FECHAR ]
            </button>
          </div>
        )}

        {/* Real-time Voice & Sound Tester Panel */}
        <VoiceTester onTestSpeak={handleTestSpeak} onTestChime={handleTestChime} />

        {/* Live Active Announcement Bar */}
        {activeAnnouncement && (
          <div className="bg-neon text-black rounded-xl p-5 flex items-center justify-between border border-neon shadow-lg shadow-neon/10 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center text-neon shrink-0">
                <Volume2 className="w-5 h-5 fill-current animate-bounce" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold tracking-widest font-mono text-zinc-950">REPRODUZINDO AGORA</p>
                <h4 className="text-base font-black uppercase tracking-tight italic">{activeAnnouncement.title}</h4>
                <p className="text-xs font-semibold text-zinc-800">Áudio: {activeAnnouncement.audioName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-black rounded-full animate-ping"></span>
              <span className="text-xs font-mono font-black tracking-wider uppercase bg-black text-neon px-2.5 py-1 rounded">
                MÚSICA PAUSADA
              </span>
            </div>
          </div>
        )}

        {/* Dashboard Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Creator and Player */}
          <div className="lg:col-span-5 space-y-6">
            {/* Integrated Player */}
            <MusicPlayer ref={musicPlayerRef} onControlsReady={() => {}} />
            
            {/* Creator tool */}
            <AudioCreator 
              audios={audios}
              onAudioCreated={loadData}
              onAudioDeleted={loadData}
            />
          </div>

          {/* Right Column: Schedules Board and Logs */}
          <div className="lg:col-span-7 space-y-6">
            {/* Schedule Board */}
            <ScheduleManager
              schedules={schedules}
              audios={audios}
              onSchedulesUpdated={loadData}
              onManualTrigger={handleManualTrigger}
            />

            {/* Event logs */}
            <LogView 
              logs={logs}
              onLogsCleared={loadData}
            />
          </div>

        </div>

      </main>

      {/* Footer System Status bar */}
      <footer className="mt-auto bg-[#0a0a0a] border-t border-zinc-900 py-6 px-6 text-xs text-zinc-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-zinc-500 font-bold tracking-wider">
            © 2026 I9 FIT GYM VOICE CONTROL SYSTEMS
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <span className="flex items-center gap-1.5 text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-neon"></span>
              HARDWARE: INTERFACE #01
            </span>
            <span className="flex items-center gap-1.5 text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-neon"></span>
              OUTPUT: MAIN SPEAKERS (STEREO)
            </span>
            <span className="flex items-center gap-1.5 text-neon">
              <span className="w-1.5 h-1.5 rounded-full bg-neon animate-pulse"></span>
              AGENDADOR ATIVO
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
