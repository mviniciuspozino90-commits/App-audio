import { useState } from 'react';
import { PlayLog } from '../types';
import { History, Trash2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { clearLogs } from '../utils/db';

interface LogViewProps {
  logs: PlayLog[];
  onLogsCleared: () => void;
}

export function LogView({ logs, onLogsCleared }: LogViewProps) {
  const [confirmClear, setConfirmClear] = useState(false);

  const handleClearLogs = async () => {
    if (confirmClear) {
      try {
        await clearLogs();
        onLogsCleared();
        setConfirmClear(false);
      } catch (e) {
        console.error(e);
      }
    } else {
      setConfirmClear(true);
      setTimeout(() => {
        setConfirmClear(false);
      }, 4000);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const hrs = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    const secs = date.getSeconds().toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}`;
  };

  return (
    <div id="log-view-container" className="bg-[#0c0c0c] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-lg transition-all duration-300">
      <div className="flex items-center justify-between mb-1 border-b border-zinc-800 pb-3">
        <h2 className="text-base font-black uppercase tracking-tight italic text-white flex items-center gap-2">
          <History className="w-5 h-5 text-neon animate-pulse" />
          REGISTRO DE ATIVIDADES
        </h2>
        {logs.length > 0 && (
          <button
            id="clear-logs-btn"
            onClick={handleClearLogs}
            className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1.5 rounded border transition-all cursor-pointer ${
              confirmClear
                ? 'bg-red-900/30 border-red-500 text-red-400 animate-pulse'
                : 'text-zinc-500 hover:text-red-400 hover:bg-red-500/10 border-transparent'
            }`}
          >
            {confirmClear ? 'CONFIRMAR LIMPAR?' : 'LIMPAR REGISTRO'}
          </button>
        )}
      </div>

      <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
        {logs.length > 0 ? (
          logs.map((log) => (
            <div
              id={`log-item-${log.id}`}
              key={log.id}
              className="flex items-start justify-between gap-3 p-2.5 rounded-lg bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-850 text-xs transition-all"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                {log.status === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-neon shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <p className="font-bold text-zinc-200 leading-normal truncate">
                    {log.scheduleTitle}
                  </p>
                  <p className="text-[10px] text-zinc-500 font-medium">
                    Som: <span className="text-zinc-300 font-bold">{log.audioName}</span> • {log.message}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0 font-mono text-[9px] text-zinc-400 font-bold bg-zinc-950 border border-zinc-850 px-1.5 py-0.5 rounded">
                <span>{formatDate(log.timestamp)} </span>
                <span className="text-neon">{formatTime(log.timestamp)}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-zinc-500">
            <Clock className="w-5 h-5 opacity-45 mx-auto mb-1.5" />
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Registro vazio</p>
            <p className="text-[10px] text-zinc-500 mt-1 uppercase font-mono">Disparos automáticos ou manuais aparecerão aqui</p>
          </div>
        )}
      </div>
    </div>
  );
}
