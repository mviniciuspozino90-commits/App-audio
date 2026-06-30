import { useState, useRef } from 'react';
import { Schedule, AnnouncementAudio } from '../types';
import { Calendar, Plus, Trash2, Play, Check, Clock, AlertTriangle, ToggleLeft, ToggleRight, Sparkles, Bell } from 'lucide-react';
import { saveSchedule, deleteScheduleFromDB } from '../utils/db';
import { playAlertChime } from '../utils/chime';

interface ScheduleManagerProps {
  schedules: Schedule[];
  audios: AnnouncementAudio[];
  onSchedulesUpdated: () => void;
  onManualTrigger: (audioId: string, title: string, playChime?: boolean) => void;
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

export function ScheduleManager({ schedules, audios, onSchedulesUpdated, onManualTrigger }: ScheduleManagerProps) {
  const [isAdding, setIsAdding] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const deleteConfirmRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedAudioId, setSelectedAudioId] = useState('');
  const [time, setTime] = useState('09:00');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Default Mon-Fri
  const [fadeOutTime, setFadeOutTime] = useState(2); // default 2 seconds fade
  const [intervalMinutes, setIntervalMinutes] = useState<number>(0); // 0 = play once
  const [playChime, setPlayChime] = useState(true); // default true for warning chime

  const toggleDay = (dayValue: number) => {
    setSelectedDays(prev =>
      prev.includes(dayValue) ? prev.filter(d => d !== dayValue) : [...prev, dayValue]
    );
  };

  const selectAllDays = () => {
    setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
  };

  const selectWeekdays = () => {
    setSelectedDays([1, 2, 3, 4, 5]);
  };

  const clearAllDays = () => {
    setSelectedDays([]);
  };

  const handleCreateSchedule = async () => {
    setError(null);
    if (!title) {
      setError('Por favor, defina um nome para este agendamento.');
      return;
    }
    if (!selectedAudioId) {
      setError('Por favor, selecione um anúncio de áudio.');
      return;
    }
    if (selectedDays.length === 0) {
      setError('Por favor, selecione pelo menos um dia da semana.');
      return;
    }

    const newSchedule: Schedule = {
      id: 'schedule_' + Math.random().toString(36).substr(2, 9),
      title,
      audioId: selectedAudioId,
      time,
      days: selectedDays.sort(),
      enabled: true,
      fadeOutTime,
      interval: intervalMinutes > 0 ? intervalMinutes : undefined,
      playChime,
    };

    try {
      await saveSchedule(newSchedule);
      setIsAdding(false);
      // Reset form
      setTitle('');
      setSelectedAudioId('');
      setTime('09:00');
      setSelectedDays([1, 2, 3, 4, 5]);
      setFadeOutTime(2);
      setIntervalMinutes(0);
      setPlayChime(true);

      onSchedulesUpdated();
    } catch (e) {
      console.error(e);
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

  const getAudioName = (audioId: string) => {
    const audio = audios.find(a => a.id === audioId);
    return audio ? audio.name : 'Áudio excluído';
  };

  return (
    <div id="schedule-manager-container" className="bg-[#0c0c0c] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-lg transition-all duration-300">
      <div className="flex items-center justify-between mb-1 border-b border-zinc-800 pb-3">
        <h2 className="text-base font-black uppercase tracking-tight italic text-white flex items-center gap-2">
          <Calendar className="w-5 h-5 text-neon" />
          HORÁRIOS AGENDADOS
        </h2>
        <button
          id="add-schedule-btn"
          onClick={() => setIsAdding(!isAdding)}
          className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase italic flex items-center gap-1.5 transition-all cursor-pointer ${
            isAdding
              ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
              : 'bg-neon hover:bg-neon-hover text-black shadow-md'
          }`}
        >
          {isAdding ? 'CANCELAR' : (
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
            CONFIGURAR ALERTA AGENDADO
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Título do Agendamento</label>
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
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Selecionar Áudio do Anúncio</label>
              <select
                id="schedule-audio-select"
                value={selectedAudioId}
                onChange={(e) => {
                  setSelectedAudioId(e.target.value);
                  const selected = audios.find(a => a.id === e.target.value);
                  if (selected && !title) {
                    setTitle(selected.name);
                  }
                }}
                className="w-full text-sm border border-zinc-850 rounded-lg p-1.5 bg-zinc-950 text-zinc-300 focus:outline-none focus:border-neon"
              >
                <option value="" className="bg-zinc-950 text-white">-- Selecione um Áudio --</option>
                {audios.map((audio) => (
                  <option key={audio.id} value={audio.id} className="bg-zinc-950 text-white">
                    {audio.name} ({audio.type === 'tts' || audio.type === 'preset' ? 'Sintetizador' : 'Arquivo'} • {audio.duration}s)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Horário de Disparo</label>
              <input
                id="schedule-time-input"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full text-sm border border-zinc-850 rounded-lg px-3 py-1.5 bg-zinc-950 focus:outline-none focus:border-neon focus:ring-1 focus:ring-neon/30 text-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Frequência (Repetir Alerta)</label>
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
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Fade de Música (Mixagem)</label>
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
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Dias de Repetição</label>
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
                    className={`flex-1 py-1.5 rounded-lg text-xs font-black italic text-center transition-all ${
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

          {/* Warning Chime Option */}
          <div className="bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-850 flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Bell className="w-4 h-4 text-neon shrink-0 mt-0.5 animate-pulse" />
              <div>
                <p className="text-xs font-bold text-white uppercase tracking-wide">Emitir Sinal de Atenção (Chime)</p>
                <p className="text-[10px] text-zinc-500 leading-normal">
                  Reproduz um elegante e discreto "ding-dong" sonoro antes de iniciar a reprodução do anúncio.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => playAlertChime()}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-black uppercase text-neon rounded-lg cursor-pointer transition-all shrink-0"
              >
                Testar Sinal
              </button>
              <button
                id="toggle-chime-form"
                type="button"
                onClick={() => setPlayChime(!playChime)}
                className="p-1 rounded-lg hover:bg-zinc-900 transition-all cursor-pointer"
              >
                {playChime ? (
                  <ToggleRight className="w-7 h-7 text-neon" />
                ) : (
                  <ToggleLeft className="w-7 h-7 text-zinc-700" />
                )}
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
              className="bg-neon hover:bg-neon-hover text-black px-4 py-2 rounded-xl text-xs font-black uppercase italic transition-all shadow-md flex items-center gap-1.5"
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
            const hasAudio = audios.some(a => a.id === schedule.audioId);
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
                      {schedule.playChime !== false && (
                        <span className="bg-neon/15 border border-neon/35 text-neon text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-lg flex items-center gap-1 animate-pulse" title="Sinal Sonoro de Alerta Ativo">
                          <Bell className="w-2.5 h-2.5" />
                          Bip Ativo
                        </span>
                      )}
                      {!hasAudio && (
                        <span className="bg-red-500/20 text-red-400 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-0.5" title="Áudio não encontrado">
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
                          {" • "}
                          Frequência: <span className="text-neon font-bold text-emerald-400">A cada {schedule.interval === 60 ? '1 hora' : schedule.interval === 120 ? '2 horas' : `${schedule.interval} min`}</span>
                        </span>
                      )}
                    </p>

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
                    onClick={() => onManualTrigger(schedule.audioId, schedule.title, schedule.playChime !== false)}
                    disabled={!hasAudio}
                    title="Disparar este anúncio manualmente agora"
                    className="p-2 hover:bg-neon/10 border border-transparent hover:border-neon/20 text-neon rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
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
            <p className="text-[10px] text-zinc-500 mt-1 uppercase font-mono">Crie anúncios e configure os horários de reprodução acima</p>
          </div>
        )}
      </div>
    </div>
  );
}
