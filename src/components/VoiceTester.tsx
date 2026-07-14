import { useState, useEffect, useRef } from 'react';
import { 
  Volume2, Play, Pause, ExternalLink, Sparkles, Bell, 
  Settings2, Activity, CheckCircle2, AlertTriangle, RefreshCw 
} from 'lucide-react';
import { playAlertChime } from '../utils/chime';

const PRESET_TEST_PHRASES = [
  {
    label: "Organização (Halteres)",
    text: "Atenção alunos! Por gentileza, após terminar seus exercícios, guardem os halteres e anilhas nos suportes adequados. Vamos manter a nossa academia organizada."
  },
  {
    label: "Aula de Spinning",
    text: "Atenção galera do spinning! Nossa aula cheia de energia começará em cinco minutos na sala principal. Preparem suas garrafas de água e boa pedalada!"
  },
  {
    label: "Hidratação de Treino",
    text: "Lembrete de treino: beba água regularmente! Manter-se hidratado previne cãibras e melhora sua recuperação muscular. Hidrate-se!"
  },
  {
    label: "Aviso de Fechamento",
    text: "Atenção senhores alunos! Nossa unidade encerrará as atividades em quinze minutos. Solicitamos a gentileza de começar a finalizar seus treinos."
  },
  {
    label: "Frase Personalizada",
    text: "I9 Fit Gym Voice. Teste de som e voz realizado com sucesso. O sistema está pronto para uso!"
  }
];

export function VoiceTester() {
  const [isIframe, setIsIframe] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  
  // Audio test states
  const [testText, setTestText] = useState<string>(PRESET_TEST_PHRASES[4].text);
  const [rate, setRate] = useState<number>(1.08);
  const [pitch, setPitch] = useState<number>(1.15);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isChimePlaying, setIsChimePlaying] = useState<boolean>(false);
  
  // Waveform visualization bars
  const [waveHeights, setWaveHeights] = useState<number[]>([15, 15, 15, 15, 15, 15, 15, 15, 15, 15]);
  const animationRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsIframe(window.self !== window.top);
      setIsSupported('speechSynthesis' in window);
      
      const updateVoicesList = () => {
        if ('speechSynthesis' in window) {
          const allVoices = window.speechSynthesis.getVoices();
          // Prioritize Portuguese voices for Gym Voice app
          const ptVoices = allVoices.filter(v => v.lang.startsWith('pt'));
          const displayVoices = ptVoices.length > 0 ? ptVoices : allVoices;
          setVoices(displayVoices);

          if (displayVoices.length > 0 && !selectedVoice) {
            // Find a nice female or default PT voice
            const femalePt = displayVoices.find(v => v.name.toLowerCase().includes('maria') || v.name.toLowerCase().includes('gabriela') || v.name.toLowerCase().includes('ana') || v.name.toLowerCase().includes('luciana'));
            setSelectedVoice(femalePt ? femalePt.name : displayVoices[0].name);
          }
        }
      };

      updateVoicesList();
      if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = updateVoicesList;
      }
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Equalizer animation logic
  useEffect(() => {
    if (isSpeaking) {
      const animateWave = () => {
        setWaveHeights(prev => prev.map(() => Math.floor(Math.random() * 45) + 8));
        animationRef.current = requestAnimationFrame(animateWave);
      };
      animateWave();
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      setWaveHeights([15, 15, 15, 15, 15, 15, 15, 15, 15, 15]);
    }
  }, [isSpeaking]);

  const handleSpeak = () => {
    if (!isSupported) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(testText);
    
    if (selectedVoice) {
      const voiceObj = window.speechSynthesis.getVoices().find(v => v.name === selectedVoice);
      if (voiceObj) utterance.voice = voiceObj;
    }
    
    utterance.rate = rate;
    utterance.pitch = pitch;

    utterance.onstart = () => {
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  const handlePlayChime = async () => {
    if (isChimePlaying) return;
    setIsChimePlaying(true);
    await playAlertChime();
    setIsChimePlaying(false);
  };

  const handleOpenNewTab = () => {
    if (typeof window !== 'undefined') {
      window.open(window.location.href, '_blank');
    }
  };

  return (
    <div id="voice-tester-panel" className="bg-[#0c0c0c] border border-zinc-800 rounded-2xl p-6 space-y-6 shadow-xl transition-all duration-300 relative overflow-hidden">
      
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
              DIAGNÓSTICO E AJUSTES DE ÁUDIO
            </span>
            <h2 className="text-xl font-black uppercase italic tracking-tight text-white leading-tight">
              TESTAR VOZ EM TEMPO REAL
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isSupported ? (
            <span className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full font-mono">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              TTS Ativo
            </span>
          ) : (
            <span className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full font-mono animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5" />
              Não Suportado
            </span>
          )}
        </div>
      </div>

      {/* Iframe detection notice */}
      {isIframe && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-zinc-300 text-xs leading-relaxed flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex gap-3 items-start">
            <span className="text-amber-400 text-xl shrink-0">⚠️</span>
            <div>
              <p className="font-extrabold text-amber-400 uppercase tracking-wider text-[11px] mb-0.5">
                Executando no painel embutido (Iframe)
              </p>
              <p className="text-zinc-400 leading-relaxed font-medium">
                Os navegadores (Chrome, Safari) bloqueiam o sintetizador de voz (TTS) do sistema operacional dentro de iframes para evitar anúncios automáticos invasivos. Para ouvir o teste de voz e som perfeitamente, clique ao lado para abrir em tela cheia!
              </p>
            </div>
          </div>
          <button
            onClick={handleOpenNewTab}
            className="w-full md:w-auto bg-neon text-black hover:bg-neon-hover px-4 py-2 rounded-xl text-xs font-black uppercase italic tracking-wider flex items-center justify-center gap-1.5 shrink-0 transition-all shadow-md cursor-pointer"
          >
            <ExternalLink className="w-4 h-4 stroke-[3px]" />
            ABRIR EM NOVA ABA
          </button>
        </div>
      )}

      {/* Tester Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Sliders and Voice Selection Column */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Dropdown voice list */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
              Selecionar Sintetizador / Idioma do Sistema ({voices.length} vozes detectadas)
            </label>
            <div className="relative">
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full text-sm border border-zinc-800 rounded-xl px-3 py-2.5 bg-zinc-900 text-zinc-200 focus:outline-none focus:border-neon focus:ring-1 focus:ring-neon/30 transition-all font-bold cursor-pointer"
              >
                {voices.length === 0 ? (
                  <option value="" className="bg-zinc-950 text-zinc-500">Nenhuma voz carregada ainda</option>
                ) : (
                  voices.map((voice) => (
                    <option key={voice.name} value={voice.name} className="bg-zinc-950 text-white font-bold">
                      {voice.name} ({voice.lang}) {voice.default ? ' [Padrão]' : ''}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Real-time speech parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-zinc-950/80 p-4 rounded-xl border border-zinc-850">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                  Tom da Voz (Grave ↔ Agudo)
                </label>
                <span className="text-[9px] font-mono font-black text-neon bg-neon/10 px-2 py-0.5 rounded border border-neon/10">
                  {pitch.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.05"
                value={pitch}
                onChange={(e) => setPitch(parseFloat(e.target.value))}
                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-neon focus:outline-none"
              />
              <div className="flex justify-between text-[8px] text-zinc-650 font-mono mt-1 font-bold">
                <span>GRAVE (0.5)</span>
                <span>PADRÃO</span>
                <span>AGUDO (2.0)</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                  Velocidade da Fala
                </label>
                <span className="text-[9px] font-mono font-black text-neon bg-neon/10 px-2 py-0.5 rounded border border-neon/10">
                  {rate.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.05"
                value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value))}
                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-neon focus:outline-none"
              />
              <div className="flex justify-between text-[8px] text-zinc-650 font-mono mt-1 font-bold">
                <span>LENTO (0.5)</span>
                <span>PADRÃO</span>
                <span>RÁPIDO (2.0)</span>
              </div>
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
                      if (isSpeaking) {
                        window.speechSynthesis.cancel();
                        setIsSpeaking(false);
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
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
              Editar Texto de Teste
            </label>
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
                disabled={!isSupported || !testText.trim()}
                className={`w-full py-2.5 rounded-xl text-xs font-black uppercase italic tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  isSpeaking
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-md animate-pulse'
                    : 'bg-neon hover:bg-neon-hover text-black shadow-lg shadow-neon/10'
                }`}
              >
                {isSpeaking ? (
                  <>
                    <Pause className="w-4 h-4 fill-current animate-spin" />
                    Parar Áudio
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    Testar Voz (TTS)
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
