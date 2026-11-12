import { useState, useRef } from 'react';
import { Schedule, AnnouncementAudio, AlertSoundMode } from '../types';
import {
  Calendar, Plus, Trash2, Play, Check, Clock, AlertTriangle,
  ToggleLeft, ToggleRight, Bell, UserRound, Volume2, Loader2, Pause, Speech
} from 'lucide-react';
import { saveSchedule, deleteScheduleFromDB, saveAudio } from '../utils/db';
import { playAlertChime } from '../utils/chime';
import {
  NATURAL_VOICE_PROFILES,
  DEFAULT_VOICE_PROFILE_ID,
  getVoiceProfileById,
  buildTtsUrl,
  playNaturalTts,
  getOrSynthesizeSpeechUrl,
  PlayTtsController,
} from '../utils/tts';

interface ScheduleManagerProps {
  schedules: Schedule[];
  audios: AnnouncementAudio[];
  onSchedulesUpdated: () => void;
  onManualTrigger: (
    audioId: string,
    title: string,
    alertMode: AlertSoundMode,
    voiceProfileId?: string
  ) => void;
}

const DAYS_OF_WEEK = [
  { label: 'Dom', value: 0 },
  { label: 'Seg', value: 1 },
  { label: 'Ter', value: 2 },
  { label: 'Qua', value: 3 },
  { label: 'Qui', value: 4 },
  { label: 'Sex', value: 5 },
  { label: 'Sáb', value: 6 },
];

const ALERT_MODE_LABELS: Record<AlertSoundMode, string> = {
  chime_voice: 'Sinal + Voz ("Atenção!")',
  voice_attention: 'Voz ("Atenção, alunos!")',
  chime_soft: 'Sinal Musical Suave',
  none: 'Sem Alerta Prévio',
};

function resolveAlertMode(schedule: Schedule): AlertSoundMode {
  if (schedule.alertMode) return schedule.alertMode;
  return schedule.playChime === false ? 'none' : 'chime_voice';
}

export function ScheduleManager({ schedules, audios, onSchedulesUpdated, onManualTrigger }: ScheduleManagerProps) {
  const [isAdding, setIsAdding] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const deleteConfirmRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<'existing' | 'inline_tts'>('inline_tts');
  const [selectedAudioId, setSelectedAudioId] = useState('');
  const [inlineTtsText, setInlineTtsText] = useState('');
  const [selectedVoiceProfileId, setSelectedVoiceProfileId] = useState<string>(DEFAULT_VOICE_PROFILE_ID);
  const [time, setTime] = useState('09:00');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Default Mon-Fri
  const [fadeOutTime, setFadeOutTime] = useState(2); // default 2 seconds fade
  const [intervalMinutes, setIntervalMinutes] = useState<number>(0); // 0 = play once
  const [alertMode, setAlertMode] = useState<AlertSoundMode>('chime_voice');
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [isLoadingTestVoice, setIsLoadingTestVoice] = useState(false);
  const [isTestingAlert, setIsTestingAlert] = useState(false);
  const previewCtrlRef = useRef<PlayTtsController | null>(null);

  const openAddForm = () => {
    const nextOpen = !isAdding;
    setIsAdding(nextOpen);
    if (nextOpen) {
      setSourceMode(audios.length > 0 ? 'existing' : 'inline_tts');
    } else if (previewCtrlRef.current) {
      previewCtrlRef.current.stop();
      previewCtrlRef.current = null;
      setIsTestingVoice(false);
      setIsLoadingTestVoice(false);
    }
  };

  const toggleDay = (dayValue: number) => {
    setSelectedDays((prev) =>
      prev.includes(dayValue) ? prev.filter((d) => d !== dayValue) : [...prev, dayValue]
    );
  };

  const selectAllDays = () => setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
  const selectWeekdays = () => setSelectedDays([1, 2, 3, 4, 5]);
  const clearAllDays = () => setSelectedDays([]);

  const handleTestSelectedVoice = async () => {
    if (isTestingVoice || isLoadingTestVoice) {
      previewCtrlRef.current?.stop();
      previewCtrlRef.current = null;
      setIsTestingVoice(false);
      setIsLoadingTestVoice(false);
      return;
    }

    const sampleText =
      sourceMode === 'inline_tts' && inlineTtsText.trim()
        ? inlineTtsText.trim()
        : 'Atenção alunos! Este é um teste da voz programada para os avisos da I9 Fit.';

    const ctrl = playNaturalTts({
      text: sampleText,
      profileId: selectedVoiceProfileId,
      rate: getVoiceProfileById(selectedVoiceProfileId).rate,
      onLoadingChange: (loading) => setIsLoadingTestVoice(loading),
      onStart: () => setIsTestingVoice(true),
    });
    previewCtrlRef.current = ctrl;

    try {
      await ctrl.promise;
    } catch (err) {
      console.error('Erro ao testar voz no agendamento:', err);
    } finally {
      previewCtrlRef.current = null;
      setIsLoadingTestVoice(false);
      setIsTestingVoice(false);
    }
  };

  const handleTestAlertSound = async () => {
    if (isTestingAlert || alertMode === 'none') return;
    setIsTestingAlert(true);
    try {
      await playAlertChime({ mode: alertMode, voiceProfileId: selectedVoiceProfileId });
    } finally {
      setIsTestingAlert(false);
    }
  };

  const handleCreateSchedule = async () => {
    setError(null);
    if (!title.trim()) {
      setError('Por favor, defina um nome para este agendamento.');
      return;
    }
    if (sourceMode === 'existing' && !selectedAudioId) {
      setError('Por favor, selecione um anúncio de áudio ou escolha digitar o texto agora.');
      return;
    }
    if (sourceMode === 'inline_tts' && !inlineTtsText.trim()) {
      setError('Por favor, digite o texto que será falado no anúncio programado.');
      return;
    }
    if (selectedDays.length === 0) {
      setError('Por favor, selecione pelo menos um dia da semana.');
      return;
    }

    try {
      let targetAudioId = selectedAudioId;

      if (sourceMode === 'inline_tts') {
        const cleanText = inlineTtsText.trim();
        const profile = getVoiceProfileById(selectedVoiceProfileId);
        const wordCount = cleanText.split(/\s+/).length;
        const estDuration = Math.max(Math.round(wordCount / 2.5), 3);

        targetAudioId = 'audio_' + Math.random().toString(36).substr(2, 9);
        const createdAudio: AnnouncementAudio = {
          id: targetAudioId,
          name: title.trim(),
          url: buildTtsUrl({
            text: cleanText,
            profileId: profile.id,
            rate: profile.rate,
            pitch: 1.0,
          }),
          duration: estDuration,
          createdAt: Date.now(),
          type: 'tts',
        };
        await saveAudio(createdAudio);
        getOrSynthesizeSpeechUrl({ text: cleanText, profileId: profile.id }).catch(() => {});
      }

      const newSchedule: Schedule = {
        id: 'schedule_' + Math.random().toString(36).substr(2, 9),
        title: title.trim(),
        audioId: targetAudioId,
        time,
        days: [...selectedDays].sort(),
        enabled: true,
        fadeOutTime,
        interval: intervalMinutes > 0 ? intervalMinutes : undefined,
        playChime: alertMode !== 'none',
        alertMode,
        voiceProfileId: selectedVoiceProfileId,
      };

      await saveSchedule(newSchedule);
      setIsAdding(false);
      setTitle('');
      setSelectedAudioId('');
      setInlineTtsText('');
      setSelectedVoiceProfileId(DEFAULT_VOICE_PROFILE_ID);
      setTime('09:00');
      setSelectedDays([1, 2, 3, 4, 5]);
      setFadeOutTime(2);
      setIntervalMinutes(0);
      setAlertMode('chime_voice');

      onSchedulesUpdated();
    } catch (e) {
      console.error(e);
      setError('Erro ao salvar o agendamento.');
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (deleteConfirmRef.current === id) {
      try {
        await deleteScheduleFromDB(id);
        onSchedulesUpdated();
        deleteConfirmRef.current = null;
        setDeleteConfirmId(null);
      } catch (e) {
        console.error(e);
      }
    } else {
      deleteConfirmRef.current = id;
      setDeleteConfirmId(id);
      setTimeout(() => {
        if (deleteConfirmRef.current === id) {
          deleteConfirmRef.current = null;
          setDeleteConfirmId(null);
        }
      }, 4000);
    }
  };

  const handleToggleEnable = async (schedule: Schedule) => {
    const updated = { ...schedule, enabled: !schedule.enabled };
    try {
      await saveSchedule(updated);
      onSchedulesUpdated();
    } catch (e) {
      console.error(e);
    }
  };

  const handleScheduleVoiceChange = async (schedule: Schedule, voiceProfileId: string) => {
    const updated: Schedule = { ...schedule, voiceProfileId };
    try {
      await saveSchedule(updated);
      onSchedulesUpdated();
    } catch (e) {
      console.error(e);
    }
  };

  const getAudioName = (audioId: string) => {
    const audio = audios.find((a) => a.id === audioId);
    return audio ? audio.name : 'Áudio excluído';
  };

  return (
    <div
      id="schedule-manager-container"
      className="bg-[#0c0c0c] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-lg transition-all duration-300"
    >
      <div className="flex items-center justify-between mb-1 border-b border-zinc-800 pb-3">
        <h2 className="text-base font-black uppercase tracking-tight italic text-white flex items-center gap-2">
          <Calendar className="w-5 h-5 text-neon" />
          HORÁRIOS AGENDADOS
        </h2>
        <button
          id="add-schedule-btn"
          onClick={openAddForm}
          className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase italic flex items-center gap-1.5 transition-all cursor-pointer ${
            isAdding
              ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
              : 'bg-neon hover:bg-neon-hover text-black shadow-md'
          }`}
        >
          {isAdding ? (
            'CANCELAR'
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              AGENDAR HORÁRIO
            </>
          )}
        </button>
      </div>

      {/* Inline Adding Panel */}
      {isAdding && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4 animate-fade-in">
          <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5 italic">
            <Clock className="w-4 h-4 text-neon" />
            CONFIGURAR ANÚNCIO PROGRAMÁVEL
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                Título do Agendamento
              </label>
              <input
                id="schedule-title-input"
                type="text"
                placeholder="Ex: Alerta de Alongamento da Manhã"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-sm border border-zinc-850 rounded-lg px-3 py-1.5 bg-zinc-950 focus:outline-none focus:border-neon focus:ring-1 focus:ring-neon/30 transition-all text-white font-bold placeholder-zinc-600"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                  Conteúdo do Anúncio
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSourceMode('inline_tts')}
                    className={`text-[9px] font-black uppercase px-2 py-0.5 rounded cursor-pointer transition-all ${
                      sourceMode === 'inline_tts'
                        ? 'bg-neon text-black'
                        : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
                    }`}
                  >
                    Digitar Texto
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceMode('existing')}
                    className={`text-[9px] font-black uppercase px-2 py-0.5 rounded cursor-pointer transition-all ${
                      sourceMode === 'existing'
                        ? 'bg-neon text-black'
                        : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
                    }`}
                  >
                    Áudio Salvo ({audios.length})
                  </button>
                </div>
              </div>

              {sourceMode === 'existing' ? (
                <select
                  id="schedule-audio-select"
                  value={selectedAudioId}
                  onChange={(e) => {
                    setSelectedAudioId(e.target.value);
                    const selected = audios.find((a) => a.id === e.target.value);
                    if (selected && !title) {
                      setTitle(selected.name);
                    }
                  }}
                  className="w-full text-sm border border-zinc-850 rounded-lg p-1.5 bg-zinc-950 text-zinc-300 focus:outline-none focus:border-neon"
                >
                  <option value="" className="bg-zinc-950 text-white">
                    {audios.length === 0 ? '-- Nenhum áudio salvo (use Digitar Texto) --' : '-- Selecione um Áudio --'}
                  </option>
                  {audios.map((audio) => (
                    <option key={audio.id} value={audio.id} className="bg-zinc-950 text-white">
                      {audio.name} ({audio.type === 'tts' || audio.type === 'preset' ? 'Voz IA' : 'Arquivo'} • {audio.duration}s)
                    </option>
                  ))}
                </select>
              ) : (
                <textarea
                  id="schedule-inline-tts-text"
                  rows={2}
                  placeholder="Digite o que a voz irá falar neste horário..."
                  value={inlineTtsText}
                  onChange={(e) => setInlineTtsText(e.target.value)}
                  className="w-full text-xs border border-zinc-850 rounded-lg p-2 bg-zinc-950 focus:outline-none focus:border-neon focus:ring-1 focus:ring-neon/30 text-white font-semibold placeholder-zinc-600 resize-none"
                />
              )}
            </div>
          </div>

          {/* Voice Selection for Programmable Announcement */}
          <div className="bg-zinc-950/70 p-3.5 rounded-xl border border-zinc-850 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Speech className="w-3.5 h-3.5 text-neon" />
                Selecionar Voz da Locução (Anúncio e Alerta)
              </label>
              <button
                type="button"
                onClick={handleTestSelectedVoice}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer border ${
                  isTestingVoice || isLoadingTestVoice
                    ? 'bg-red-600 border-red-700 text-white'
                    : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-neon'
                }`}
              >
                {isLoadingTestVoice ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : isTestingVoice ? (
                  <Pause className="w-3 h-3 fill-current" />
                ) : (
                  <Volume2 className="w-3 h-3" />
                )}
                {isLoadingTestVoice ? 'Gerando...' : isTestingVoice ? 'Parar' : 'Testar Voz'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {NATURAL_VOICE_PROFILES.map((profile) => {
                const isSelected = selectedVoiceProfileId === profile.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setSelectedVoiceProfileId(profile.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-neon/10 border-neon text-white shadow-sm shadow-neon/10'
                        : 'bg-zinc-900/60 border-zinc-850 hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <UserRound
                        className={`w-3.5 h-3.5 shrink-0 ${
                          profile.gender === 'F' ? 'text-fuchsia-400' : 'text-sky-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase truncate text-white">
                          {profile.shortName}
                        </p>
                        <p className="text-[9px] text-zinc-500 truncate">{profile.description}</p>
                      </div>
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
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                Horário de Disparo
              </label>
              <input
                id="schedule-time-input"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full text-sm border border-zinc-850 rounded-lg px-3 py-1.5 bg-zinc-950 focus:outline-none focus:border-neon focus:ring-1 focus:ring-neon/30 text-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                Frequência (Repetir Alerta)
              </label>
              <select
                id="schedule-interval-select"
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                className="w-full text-sm border border-zinc-850 rounded-lg p-1.5 bg-zinc-950 text-zinc-300 focus:outline-none focus:border-neon"
              >
                <option value="0" className="bg-zinc-950 text-white">Disparar apenas uma vez</option>
                <option value="10" className="bg-zinc-950 text-white">A cada 10 minutos</option>
                <option value="15" className="bg-zinc-950 text-white">A cada 15 minutos</option>
                <option value="20" className="bg-zinc-950 text-white">A cada 20 minutos</option>
                <option value="30" className="bg-zinc-950 text-white">A cada 30 minutos</option>
                <option value="40" className="bg-zinc-950 text-white">A cada 40 minutos</option>
                <option value="45" className="bg-zinc-950 text-white">A cada 45 minutos</option>
                <option value="60" className="bg-zinc-950 text-white">A cada 1 hora</option>
                <option value="120" className="bg-zinc-950 text-white">A cada 2 horas</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                Fade de Música (Mixagem)
              </label>
              <select
                id="schedule-fade-select"
                value={fadeOutTime}
                onChange={(e) => setFadeOutTime(Number(e.target.value))}
                className="w-full text-sm border border-zinc-850 rounded-lg p-1.5 bg-zinc-950 text-zinc-300 focus:outline-none focus:border-neon"
              >
                <option value="0" className="bg-zinc-950 text-white">Instantâneo (Sem fade)</option>
                <option value="1" className="bg-zinc-950 text-white">Suave (1 segundo)</option>
                <option value="2" className="bg-zinc-950 text-white">Gradual (2 segundos)</option>
                <option value="3" className="bg-zinc-950 text-white">Lento (3 segundos)</option>
                <option value="5" className="bg-zinc-950 text-white">Super Lento (5 segundos)</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                Dias de Repetição
              </label>
              <div className="flex gap-2">
                <button id="day-opt-weekdays" type="button" onClick={selectWeekdays} className="text-[10px] font-bold text-neon uppercase tracking-wide hover:underline">Semana</button>
                <button id="day-opt-all" type="button" onClick={selectAllDays} className="text-[10px] font-bold text-neon uppercase tracking-wide hover:underline">Todos</button>
                <button id="day-opt-clear" type="button" onClick={clearAllDays} className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide hover:underline">Limpar</button>
              </div>
            </div>
            <div className="flex gap-1.5 justify-between">
              {DAYS_OF_WEEK.map((day) => {
                const active = selectedDays.includes(day.value);
                return (
                  <button
                    id={`day-badge-${day.value}`}
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-black italic text-center transition-all cursor-pointer ${
                      active
                        ? 'bg-neon text-black shadow-md'
                        : 'bg-zinc-950 border border-zinc-850 text-zinc-400 hover:bg-zinc-900'
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Alert Sound & Voice Mode Option */}
          <div className="bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-850 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Bell className="w-4 h-4 text-neon shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-white uppercase tracking-wide">
                  Alerta Sonoro de Abertura
                </p>
                <p className="text-[10px] text-zinc-500 leading-normal">
                  Escolha o sinal sonoro e/ou chamada de voz feminina que precede o anúncio.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <select
                id="schedule-alert-mode-select"
                value={alertMode}
                onChange={(e) => setAlertMode(e.target.value as AlertSoundMode)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-bold text-zinc-200 focus:outline-none focus:border-neon cursor-pointer"
              >
                <option value="chime_voice">Sinal + Voz ("Atenção!")</option>
                <option value="voice_attention">Voz ("Atenção, alunos!")</option>
                <option value="chime_soft">Sinal Musical Suave</option>
                <option value="none">Sem alerta prévio</option>
              </select>
              <button
                type="button"
                onClick={handleTestAlertSound}
                disabled={isTestingAlert || alertMode === 'none'}
                className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 border border-zinc-800 text-[10px] font-black uppercase text-neon rounded-lg cursor-pointer transition-all shrink-0"
              >
                {isTestingAlert ? 'Tocando...' : 'Testar'}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-xs text-red-400 font-bold">
              {error}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button
              id="confirm-schedule-btn"
              onClick={handleCreateSchedule}
              className="bg-neon hover:bg-neon-hover text-black px-4 py-2 rounded-xl text-xs font-black uppercase italic transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              SALVAR AGENDAMENTO
            </button>
          </div>
        </div>
      )}

      {/* Schedules List */}
      <div className="space-y-3">
        {schedules.length > 0 ? (
          schedules.map((schedule) => {
            const hasAudio = audios.some((a) => a.id === schedule.audioId);
            const scheduleAlertMode = resolveAlertMode(schedule);
            const scheduleVoice = getVoiceProfileById(schedule.voiceProfileId);
            return (
              <div
                id={`schedule-card-${schedule.id}`}
                key={schedule.id}
                className={`border rounded-xl p-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                  schedule.enabled
                    ? 'border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/70'
                    : 'border-zinc-900/50 bg-zinc-955 opacity-50'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="bg-neon/10 text-neon font-mono text-xl font-extrabold px-3.5 py-1.5 rounded-xl border border-neon/20 flex flex-col items-center justify-center shrink-0">
                    <span>{schedule.time}</span>
                    <span className="text-[8px] uppercase tracking-wider text-neon/80 font-bold -mt-1 font-sans">
                      {schedule.interval && schedule.interval > 0 ? 'INÍCIO' : 'DISPARO'}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-bold text-zinc-100 leading-tight">
                        {schedule.title}
                      </h4>
                      {scheduleAlertMode !== 'none' && (
                        <span
                          className="bg-neon/15 border border-neon/35 text-neon text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-lg flex items-center gap-1"
                          title="Alerta Sonoro Ativo"
                        >
                          <Bell className="w-2.5 h-2.5" />
                          {ALERT_MODE_LABELS[scheduleAlertMode]}
                        </span>
                      )}
                      {!hasAudio && (
                        <span
                          className="bg-red-500/20 text-red-400 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-0.5"
                          title="Áudio não encontrado"
                        >
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Sem Áudio
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-zinc-400 font-medium">
                      Som: <span className="text-neon font-bold">{getAudioName(schedule.audioId)}</span>
                      {schedule.fadeOutTime > 0 && ` (Fade: ${schedule.fadeOutTime}s)`}
                      {schedule.interval && schedule.interval > 0 && (
                        <span>
                          {' • '}
                          Frequência:{' '}
                          <span className="font-bold text-emerald-400">
                            A cada{' '}
                            {schedule.interval === 60
                              ? '1 hora'
                              : schedule.interval === 120
                              ? '2 horas'
                              : `${schedule.interval} min`}
                          </span>
                        </span>
                      )}
                    </p>

                    {/* Quick voice selector on each scheduled announcement */}
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                        <UserRound className="w-3 h-3 text-fuchsia-400" />
                        Voz:
                      </span>
                      <select
                        value={scheduleVoice.id}
                        onChange={(e) => handleScheduleVoiceChange(schedule, e.target.value)}
                        className="bg-zinc-950 border border-zinc-800 rounded-md px-2 py-0.5 text-[10px] font-bold text-zinc-200 focus:outline-none focus:border-neon cursor-pointer"
                        title="Alterar voz deste agendamento"
                      >
                        {NATURAL_VOICE_PROFILES.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.shortName}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Days visualization */}
                    <div className="flex gap-1 pt-1">
                      {DAYS_OF_WEEK.map((day) => {
                        const active = schedule.days.includes(day.value);
                        return (
                          <span
                            key={day.value}
                            className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                              active
                                ? 'bg-neon/15 text-neon border border-neon/25'
                                : 'bg-zinc-950 text-zinc-600 border border-zinc-900'
                            }`}
                          >
                            {day.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 justify-end self-end md:self-center border-t md:border-t-0 pt-2.5 md:pt-0 border-zinc-850 w-full md:w-auto">
                  {/* Play Now Button */}
                  <button
                    id={`trigger-manual-${schedule.id}`}
                    onClick={() =>
                      onManualTrigger(
                        schedule.audioId,
                        schedule.title,
                        scheduleAlertMode,
                        scheduleVoice.id
                      )
                    }
                    disabled={!hasAudio}
                    title="Disparar este anúncio manualmente agora"
                    className="p-2 hover:bg-neon/10 border border-transparent hover:border-neon/20 text-neon rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                  </button>

                  {/* Enable / Disable toggle */}
                  <button
                    id={`toggle-schedule-${schedule.id}`}
                    onClick={() => handleToggleEnable(schedule)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-white transition-all cursor-pointer"
                    title={schedule.enabled ? 'Desativar Agendamento' : 'Ativar Agendamento'}
                  >
                    {schedule.enabled ? (
                      <ToggleRight className="w-6 h-6 text-neon" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-zinc-700" />
                    )}
                  </button>

                  {/* Delete Button */}
                  <button
                    id={`delete-schedule-${schedule.id}`}
                    onClick={() => handleDeleteSchedule(schedule.id)}
                    className={`p-2 border transition-all cursor-pointer rounded-lg text-xs font-bold ${
                      deleteConfirmId === schedule.id
                        ? 'bg-red-900/30 border-red-500 text-red-400 animate-pulse px-2.5 py-1'
                        : 'hover:bg-red-500/10 hover:text-red-400 border-transparent text-zinc-500'
                    }`}
                    title={deleteConfirmId === schedule.id ? 'Clique novamente para CONFIRMAR' : 'Excluir Agendamento'}
                  >
                    {deleteConfirmId === schedule.id ? (
                      <span className="flex items-center gap-1">
                        <Trash2 className="w-3.5 h-3.5" />
                        Confirmar?
                      </span>
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 text-zinc-500 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/10">
            <Clock className="w-6 h-6 text-zinc-600 mx-auto mb-2" />
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Nenhum agendamento programado ainda</p>
            <p className="text-[10px] text-zinc-500 mt-1 uppercase font-mono">Clique em "AGENDAR HORÁRIO" acima para criar seu anúncio programável</p>
          </div>
        )}
      </div>
    </div>
  );
}
