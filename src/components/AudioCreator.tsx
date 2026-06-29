import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { AnnouncementAudio } from '../types';
import { Mic, Upload, Volume2, Plus, Trash2, Play, Pause, Save, Speech, AlertCircle, Sparkles, Database } from 'lucide-react';
import { saveAudio, deleteAudioFromDB } from '../utils/db';

const PRESET_ANNOUNCEMENTS_DATABASE = [
  {
    id: "db_halteres",
    name: "Aviso: Devolver Halteres",
    text: "Atenção alunos! Por gentileza, após terminar seus exercícios, guardem os halteres, anilhas e colchonetes nos suportes adequados. Vamos cooperar para manter nossa academia limpa, segura e organizada para todos!",
    category: "Organização",
    duration: 12
  },
  {
    id: "db_spinning",
    name: "Início de Aula: Spinning",
    text: "Atenção alunos do spinning! Nossa aula cheia de energia começará em 5 minutos na sala principal. Prepare sua garrafa de água e prepare-se para pedalar forte!",
    category: "Aulas",
    duration: 10
  },
  {
    id: "db_funcional",
    name: "Início de Aula: Treino Funcional",
    text: "Atenção! Em 5 minutos daremos início ao circuito de Treino Funcional na área livre. Venha trabalhar força, resistência e agilidade com nosso treinador!",
    category: "Aulas",
    duration: 10
  },
  {
    id: "db_zumba",
    name: "Aula de Zumba e Ritmos",
    text: "Atenção galera! Em 10 minutos começará nossa aula super animada de Zumba e Ritmos na sala de dança. Venha queimar muitas calorias com as melhores coreografias! Esperamos vocês!",
    category: "Aulas",
    duration: 11
  },
  {
    id: "db_pilates",
    name: "Aula de Pilates e Alongamento",
    text: "Atenção alunos: nossa aula de Mat Pilates e Alongamento Integrado começará em 5 minutos na sala zen. Venha melhorar sua flexibilidade, postura e respiração!",
    category: "Aulas",
    duration: 10
  },
  {
    id: "db_toalha",
    name: "Campanha: Uso de Toalha",
    text: "Lembrete de convivência: para maior higiene de todos, é obrigatório o uso de toalha de treino individual para cobrir e higienizar os aparelhos após o seu uso. Agradecemos a colaboração!",
    category: "Higiene",
    duration: 11
  },
  {
    id: "db_colchonete",
    name: "Higiene: Limpeza de Aparelhos",
    text: "Atenção atletas: lembramos que temos álcool em spray e papel toalha distribuídos pela sala de musculação. Por favor, faça a higienização dos aparelhos e colchonetes após utilizá-los!",
    category: "Higiene",
    duration: 11
  },
  {
    id: "db_garrafa",
    name: "Higiene: Garrafinha Individual",
    text: "Lembrete importante: traga sempre sua garrafinha de água individual para os treinos. Nossos bebedouros estão prontos para reabastecer sua hidratação de forma prática e higiênica!",
    category: "Higiene",
    duration: 11
  },
  {
    id: "db_hidratacao",
    name: "Dica de Saúde: Hidratação",
    text: "Não se esqueça de beber água! Manter-se hidratado durante a atividade física evita fadiga muscular, previne cãibras e mantém seu rendimento no nível máximo. Hidrate-se!",
    category: "Dica",
    duration: 10
  },
  {
    id: "db_cardio",
    name: "Dica de Saúde: Treino de Cardio",
    text: "Você já fez o seu cardio hoje? Incluir exercícios aeróbicos na sua rotina fortalece o coração, aumenta a queima de gordura e dá mais disposição para o seu dia a dia. Pratique!",
    category: "Dica",
    duration: 10
  },
  {
    id: "db_alongamento",
    name: "Aviso: Alongamento Pós-Treino",
    text: "Treino concluído? Lembre-se de fazer um alongamento leve para relaxar a musculatura e melhorar sua flexibilidade. Sua recuperação muscular agradece!",
    category: "Dica",
    duration: 9
  },
  {
    id: "db_celular",
    name: "Etiqueta: Celular nos Aparelhos",
    text: "Dica de convivência I9 Fit: evite ocupar os aparelhos e bancos enquanto mexe no celular. O treino flui melhor e todos conseguem treinar com agilidade. Vamos compartilhar o espaço de forma consciente!",
    category: "Etiqueta",
    duration: 12
  },
  {
    id: "db_silencio",
    name: "Etiqueta: Guardar Equipamentos",
    text: "Treinar pesado é ótimo, mas fazer barulho excessivo ao largar as barras e anilhas pode danificar os equipamentos e incomodar os outros alunos. Controle o movimento até o final e cuide do nosso espaço!",
    category: "Etiqueta",
    duration: 12
  },
  {
    id: "db_fechamento_15",
    name: "Aviso: Fechamento (15 min)",
    text: "Senhores alunos, restam apenas 15 minutos para o fechamento da nossa unidade de hoje. Solicitamos que comecem a finalizar suas séries e organizem seus pertences. Agradecemos a presença!",
    category: "Funcionamento",
    duration: 11
  },
  {
    id: "db_fechamento_5",
    name: "Aviso: Fechamento (5 min)",
    text: "Atenção alunos, encerraremos nossas atividades em 5 minutos. Desejamos a todos um ótimo descanso e uma excelente noite. Esperamos vocês amanhã para mais um treino incrível!",
    category: "Funcionamento",
    duration: 12
  },
  {
    id: "db_shake",
    name: "Promoção: Shakes na Recepção",
    text: "Procurando aquele pós-treino imediato? Passe em nossa recepção e confira as promoções especiais em shakes de Whey Protein e bebidas isotônicas. Garanta sua nutrição agora mesmo!",
    category: "Promoção",
    duration: 11
  },
  {
    id: "db_personal",
    name: "Promoção: Personal Trainer",
    text: "Quer acelerar seus resultados? Nossa academia conta com uma equipe especializada de Personal Trainers para montar treinos personalizados de acordo com seus objetivos. Consulte condições na recepção!",
    category: "Promoção",
    duration: 12
  },
  {
    id: "db_suplementos",
    name: "Promoção: Suplementação Exclusiva",
    text: "Atenção! Conheça nossa linha exclusiva de suplementos alimentares na recepção da academia. Temos Whey, Creatina, pré-treinos e barras de proteína de marcas líderes para maximizar seus ganhos!",
    category: "Promoção",
    duration: 12
  },
  {
    id: "db_avaliacao",
    name: "Aviso: Avaliação Física",
    text: "Dica I9 Fit: para conquistar seus objetivos de forma inteligente, agende sua avaliação física periódica na recepção. Acompanhe sua evolução e melhore seus resultados!",
    category: "Saúde",
    duration: 10
  }
];

export interface VoiceProfile {
  id: string;
  name: string;
  gender: 'F' | 'M' | 'E'; // Female, Male, Special/Effect
  pitch: number;
  rate: number;
  description: string;
  avatar: string;
}

export const VOICE_PROFILES: VoiceProfile[] = [
  {
    id: 'ana_standard',
    name: 'Ana (Feminina Padrão)',
    gender: 'F',
    pitch: 1.1,
    rate: 1.0,
    description: 'Voz feminina clara, ideal para avisos gerais e comunicados do dia a dia.',
    avatar: '👩'
  },
  {
    id: 'camila_promo',
    name: 'Camila (Feminina Rápida)',
    gender: 'F',
    pitch: 1.25,
    rate: 1.15,
    description: 'Voz feminina enérgica e animada, perfeita para anúncios promocionais e eventos.',
    avatar: '⚡'
  },
  {
    id: 'juliana_soft',
    name: 'Juliana (Feminina Suave)',
    gender: 'F',
    pitch: 0.95,
    rate: 0.85,
    description: 'Voz feminina pausada e gentil, excelente para dicas de saúde ou relaxamento.',
    avatar: '🌸'
  },
  {
    id: 'daniel_standard',
    name: 'Daniel (Masculino Padrão)',
    gender: 'M',
    pitch: 0.95,
    rate: 1.0,
    description: 'Voz masculina tradicional, clara e direta para qualquer tipo de anúncio.',
    avatar: '👨'
  },
  {
    id: 'ricardo_heavy',
    name: 'Ricardo (Masculino Forte)',
    gender: 'M',
    pitch: 0.8,
    rate: 1.05,
    description: 'Voz masculina grave e enérgica, ideal para chamadas de Spinning ou Crossfit.',
    avatar: '🔥'
  },
  {
    id: 'bruno_deep',
    name: 'Bruno (Grave e Formal)',
    gender: 'M',
    pitch: 0.7,
    rate: 0.9,
    description: 'Voz masculina profunda e solene, ótima para comunicados importantes de funcionamento.',
    avatar: '💪'
  },
  {
    id: 'cyborg_fx',
    name: 'Cyborg 9000 (Robótica)',
    gender: 'E',
    pitch: 0.5,
    rate: 1.2,
    description: 'Voz robótica sci-fi com forte distorção mecânica. Super marcante para treino!',
    avatar: '🤖'
  },
  {
    id: 'helium_fx',
    name: 'Voz Divertida (Aguda)',
    gender: 'E',
    pitch: 1.8,
    rate: 0.85,
    description: 'Voz super aguda para avisos descontraídos ou momentos divertidos na academia.',
    avatar: '🎈'
  }
];

export function getVoiceGender(voiceName: string): 'F' | 'M' | 'U' {
  const name = voiceName.toLowerCase();
  if (
    name.includes('maria') || 
    name.includes('ana') || 
    name.includes('luciana') || 
    name.includes('joana') || 
    name.includes('gabriela') || 
    name.includes('helena') || 
    name.includes('amalia') || 
    name.includes('amália') || 
    name.includes('zira') || 
    name.includes('yasmin') || 
    name.includes('sara') || 
    name.includes('cristina') || 
    name.includes('vitoria') || 
    name.includes('vitória') || 
    name.includes('claudia') || 
    name.includes('cláudia') || 
    name.includes('marta') || 
    name.includes('google português') || 
    name.includes('google português do brasil') ||
    name.includes('female') ||
    name.includes('woman') ||
    name.includes('girl') ||
    name.includes('lucia') ||
    name.includes('lúcia') ||
    name.includes('siri female') ||
    name.includes('siri 1') ||
    name.includes('samantha') ||
    name.includes('karen') ||
    name.includes('moira') ||
    name.includes('tessa') ||
    name.includes('veena') ||
    name.includes('fiona')
  ) {
    return 'F';
  }
  if (
    name.includes('daniel') || 
    name.includes('felipe') || 
    name.includes('carlos') || 
    name.includes('filipe') || 
    name.includes('ricardo') || 
    name.includes('joão') || 
    name.includes('joao') || 
    name.includes('antonio') || 
    name.includes('antônio') || 
    name.includes('gustavo') || 
    name.includes('pedro') || 
    name.includes('thiago') || 
    name.includes('tiago') || 
    name.includes('marcos') || 
    name.includes('siri male') ||
    name.includes('male') ||
    name.includes('man') ||
    name.includes('boy') ||
    name.includes('guy') ||
    name.includes('david') ||
    name.includes('george') ||
    name.includes('ravi')
  ) {
    return 'M';
  }
  if (name.includes('portuguese') || name.includes('português') || name.includes('pt-br') || name.includes('pt-pt')) {
    return 'F';
  }
  return 'U';
}

export function getFriendlyVoiceName(voice: SpeechSynthesisVoice): string {
  const name = voice.name;
  const nameLower = name.toLowerCase();
  
  if (nameLower.includes('maria')) return 'Maria (Feminina Padrão)';
  if (nameLower.includes('daniel')) return 'Daniel (Masculina Padrão)';
  if (nameLower.includes('gabriela') || nameLower.includes('google português do brasil') || nameLower.includes('google português')) {
    return 'Gabriela (Feminina Google)';
  }
  if (nameLower.includes('luciana')) return 'Luciana (Feminina macOS)';
  if (nameLower.includes('felipe')) return 'Felipe (Masculina macOS)';
  if (nameLower.includes('joana')) return 'Joana (Feminina macOS)';
  if (nameLower.includes('filipe')) return 'Filipe (Masculina macOS)';
  if (nameLower.includes('helena')) return 'Helena (Feminina)';
  if (nameLower.includes('sara')) return 'Sara (Feminina)';
  if (nameLower.includes('amalia') || nameLower.includes('amália')) return 'Amália (Feminina - Portugal)';
  
  let cleanName = name
    .replace('Microsoft', '')
    .replace('Desktop', '')
    .replace('TTS', '')
    .replace('Natural', '')
    .replace('Voice', '')
    .trim();
    
  const gender = getVoiceGender(name);
  if (gender === 'F') {
    return `${cleanName} (Voz Feminina)`;
  } else if (gender === 'M') {
    return `${cleanName} (Voz Masculina)`;
  }
  return cleanName;
}

interface AudioCreatorProps {
  audios: AnnouncementAudio[];
  onAudioCreated: () => void;
  onAudioDeleted: () => void;
}

export function AudioCreator({ audios, onAudioCreated, onAudioDeleted }: AudioCreatorProps) {
  const [activeTab, setActiveTab] = useState<'tts' | 'record' | 'upload' | 'library'>('tts');

  // Common State
  const [title, setTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Text-To-Speech State
  const [ttsText, setTtsText] = useState('');
  const [ttsRate, setTtsRate] = useState(1.0); // Speed
  const [ttsPitch, setTtsPitch] = useState(1.0);
  const [ttsVoice, setTtsVoice] = useState<string>('');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSpeakingTts, setIsSpeakingTts] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('ana_standard');
  const [voiceGenderFilter, setVoiceGenderFilter] = useState<'all' | 'F' | 'M'>('all');

  // Recorder State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedBlobUrl, setRecordedBlobUrl] = useState<string | null>(null);
  const [recordedBase64, setRecordedBase64] = useState<string | null>(null);
  const [audioPlaybackUrl, setAudioPlaybackUrl] = useState<string | null>(null);
  const [isPlayingTest, setIsPlayingTest] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const testAudioRef = useRef<HTMLAudioElement | null>(null);

  // File Upload State
  const [uploadedFileBase64, setUploadedFileBase64] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadDuration, setUploadDuration] = useState(5); // default estimate

  // Saved Audios Preview/Delete State
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const deleteConfirmRef = useRef<string | null>(null);
  const currentTestAudioRef = useRef<HTMLAudioElement | null>(null);

  // Load available speech synthesis voices
  useEffect(() => {
    const updateVoices = () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        const voices = window.speechSynthesis.getVoices();
        // Filter Portuguese voices first, then everything
        const ptVoices = voices.filter(v => v.lang.startsWith('pt'));
        setAvailableVoices(ptVoices.length > 0 ? ptVoices : voices);

        // Select default Portuguese voice if available
        if (ptVoices.length > 0 && !ttsVoice) {
          const femalePt = ptVoices.find(v => getVoiceGender(v.name) === 'F');
          setTtsVoice(femalePt ? femalePt.name : ptVoices[0].name);
        } else if (voices.length > 0 && !ttsVoice) {
          setTtsVoice(voices[0].name);
        }
      }
    };

    updateVoices();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, []);

  const applyVoiceProfile = (profileId: string) => {
    const profile = VOICE_PROFILES.find(p => p.id === profileId);
    if (!profile) return;

    setSelectedProfileId(profileId);
    setTtsPitch(profile.pitch);
    setTtsRate(profile.rate);

    if (profile.gender === 'F' || profile.gender === 'M') {
      const bestVoice = availableVoices.find(v => v.lang.startsWith('pt') && getVoiceGender(v.name) === profile.gender);
      if (bestVoice) {
        setTtsVoice(bestVoice.name);
        // Sync the gender filter with the selected profile's gender
        setVoiceGenderFilter(profile.gender);
      } else {
        // Fallback to any Portuguese voice
        const ptVoice = availableVoices.find(v => v.lang.startsWith('pt'));
        if (ptVoice) setTtsVoice(ptVoice.name);
      }
    }
  };

  // Recorder timer effect
  useEffect(() => {
    setError(null);
  }, [activeTab]);

  // Recorder timer effect
  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      setRecordingSeconds(0);
    }

    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [isRecording]);

  // Test Speak TTS
  const handleTestTts = () => {
    if (!ttsText) return;

    if (isSpeakingTts) {
      window.speechSynthesis.cancel();
      setIsSpeakingTts(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(ttsText);
    if (ttsVoice) {
      const selectedVoice = window.speechSynthesis.getVoices().find(v => v.name === ttsVoice);
      if (selectedVoice) utterance.voice = selectedVoice;
    }
    utterance.rate = ttsRate;
    utterance.pitch = ttsPitch;

    utterance.onend = () => {
      setIsSpeakingTts(false);
    };

    utterance.onerror = () => {
      setIsSpeakingTts(false);
    };

    setIsSpeakingTts(true);
    window.speechSynthesis.speak(utterance);
  };

  // Start Mic Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const objectUrl = URL.createObjectURL(audioBlob);
        setRecordedBlobUrl(objectUrl);

        // Convert to base64 for IndexedDB
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          setRecordedBase64(reader.result as string);
        };

        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordedBlobUrl(null);
      setRecordedBase64(null);
    } catch (err) {
      console.error('Falha ao acessar o microfone:', err);
      setError('Por favor, permita o acesso ao microfone nas configurações do seu navegador para gravar anúncios.');
    }
  };

  // Stop Mic Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Play Test Recorded Audio
  const togglePlayTestAudio = () => {
    if (isPlayingTest) {
      if (testAudioRef.current) {
        testAudioRef.current.pause();
      }
      setIsPlayingTest(false);
    } else if (recordedBlobUrl) {
      if (testAudioRef.current) {
        testAudioRef.current.pause();
      }
      const audio = new Audio(recordedBlobUrl);
      testAudioRef.current = audio;
      audio.onended = () => setIsPlayingTest(false);
      audio.play();
      setIsPlayingTest(true);
    }
  };

  // Handle File Upload to Base64
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFileName(file.name);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ""));
      }

      // Estimate duration from file size (or measure it if possible)
      // Usually standard MP3 is ~1MB per minute, so we can estimate
      const estDuration = Math.round((file.size / 128000) || 5);
      setUploadDuration(estDuration > 0 ? estDuration : 5);

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = () => {
        setUploadedFileBase64(reader.result as string);
      };
    }
  };

  // Save Announcement
  const handleSaveAnnouncement = async () => {
    setError(null);
    if (!title) {
      setError('Por favor, insira um nome para o anúncio.');
      return;
    }

    setIsSaving(true);
    try {
      const id = 'audio_' + Math.random().toString(36).substr(2, 9);
      let newAudio: AnnouncementAudio;

      if (activeTab === 'tts') {
        if (!ttsText) {
          setError('Por favor, digite o texto do anúncio.');
          setIsSaving(false);
          return;
        }

        // Estimates voice speech duration at average 3 words per second
        const wordCount = ttsText.split(/\s+/).length;
        const estDuration = Math.max(Math.round(wordCount / 2.5), 3);

        newAudio = {
          id,
          name: title,
          url: `tts://${encodeURIComponent(ttsText)}?rate=${ttsRate}&pitch=${ttsPitch}&voice=${encodeURIComponent(ttsVoice)}`,
          duration: estDuration,
          createdAt: Date.now(),
          type: 'tts',
        };
      } else if (activeTab === 'record') {
        if (!recordedBase64) {
          setError('Por favor, grave um áudio antes de salvar.');
          setIsSaving(false);
          return;
        }
        newAudio = {
          id,
          name: title,
          url: recordedBase64,
          duration: recordingSeconds || 5,
          createdAt: Date.now(),
          type: 'recorded',
        };
      } else {
        if (!uploadedFileBase64) {
          setError('Por favor, selecione um arquivo de áudio para carregar.');
          setIsSaving(false);
          return;
        }
        newAudio = {
          id,
          name: title,
          url: uploadedFileBase64,
          duration: uploadDuration,
          createdAt: Date.now(),
          type: 'uploaded',
        };
      }

      await saveAudio(newAudio);

      // Reset Form State
      setTitle('');
      setTtsText('');
      setRecordedBase64(null);
      setRecordedBlobUrl(null);
      setUploadedFileBase64(null);
      setUploadedFileName('');

      onAudioCreated();
    } catch (err) {
      console.error('Erro ao salvar anúncio:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Create standard system preset audios if there are none
  const handleLoadSystemPresets = async () => {
    setIsSaving(true);
    try {
      for (const preset of PRESET_ANNOUNCEMENTS_DATABASE) {
        const id = 'preset_' + Math.random().toString(36).substr(2, 9);
        const voiceName = availableVoices.length > 0 ? availableVoices[0].name : '';
        const audio: AnnouncementAudio = {
          id,
          name: preset.name,
          url: `tts://${encodeURIComponent(preset.text)}?rate=1&pitch=1&voice=${encodeURIComponent(voiceName)}`,
          duration: preset.duration,
          createdAt: Date.now(),
          type: 'preset',
        };
        await saveAudio(audio);
      }
      onAudioCreated();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayLibraryTts = (text: string, id: string) => {
    if (playingAudioId === id) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setPlayingAudioId(null);
      return;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (currentTestAudioRef.current) {
      currentTestAudioRef.current.pause();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const voiceName = ttsVoice || (availableVoices.length > 0 ? availableVoices[0].name : '');
    if (voiceName) {
      const selectedVoice = availableVoices.find(v => v.name === voiceName);
      if (selectedVoice) utterance.voice = selectedVoice;
    }
    utterance.onend = () => {
      setPlayingAudioId(null);
    };
    utterance.onerror = () => {
      setPlayingAudioId(null);
    };
    setPlayingAudioId(id);
    window.speechSynthesis.speak(utterance);
  };

  const handleImportLibraryItem = async (item: { name: string, text: string, duration: number }) => {
    setIsSaving(true);
    try {
      const id = 'preset_' + Math.random().toString(36).substr(2, 9);
      const voiceName = ttsVoice || (availableVoices.length > 0 ? availableVoices[0].name : '');
      const audio: AnnouncementAudio = {
        id,
        name: item.name,
        url: `tts://${encodeURIComponent(item.text)}?rate=1&pitch=1&voice=${encodeURIComponent(voiceName)}`,
        duration: item.duration,
        createdAt: Date.now(),
        type: 'preset',
      };
      await saveAudio(audio);
      onAudioCreated();
    } catch (err) {
      console.error('Erro ao importar item:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const playAudioPreview = (audio: AnnouncementAudio) => {
    if (playingAudioId === audio.id) {
      if (currentTestAudioRef.current) {
        currentTestAudioRef.current.pause();
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setPlayingAudioId(null);
      return;
    }

    if (currentTestAudioRef.current) {
      currentTestAudioRef.current.pause();
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    if (audio.type === 'tts' || audio.type === 'preset') {
      try {
        let textToSpeak = '';
        let rate = 1;
        let pitch = 1;
        let voiceName = '';

        if (audio.url.startsWith('tts://')) {
          const parsedUrl = new URL(audio.url);
          textToSpeak = decodeURIComponent(parsedUrl.pathname.replace(/^\/\//, ''));
          rate = parseFloat(parsedUrl.searchParams.get('rate') || '1');
          pitch = parseFloat(parsedUrl.searchParams.get('pitch') || '1');
          voiceName = parsedUrl.searchParams.get('voice') || '';
        } else {
          textToSpeak = audio.url;
        }

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        if (voiceName && typeof window !== 'undefined' && window.speechSynthesis) {
          const selectedVoice = window.speechSynthesis.getVoices().find(v => v.name === voiceName);
          if (selectedVoice) utterance.voice = selectedVoice;
        }
        utterance.rate = rate;
        utterance.pitch = pitch;

        utterance.onend = () => {
          setPlayingAudioId(null);
        };
        utterance.onerror = () => {
          setPlayingAudioId(null);
        };

        setPlayingAudioId(audio.id);
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.error('Erro ao tocar TTS:', e);
      }
    } else {
      const htmlAudio = new Audio(audio.url);
      currentTestAudioRef.current = htmlAudio;
      htmlAudio.onended = () => {
        setPlayingAudioId(null);
      };
      htmlAudio.onerror = () => {
        setPlayingAudioId(null);
      };
      setPlayingAudioId(audio.id);
      htmlAudio.play();
    }
  };

  const handleDeleteAudio = async (id: string) => {
    if (deleteConfirmRef.current === id) {
      try {
        await deleteAudioFromDB(id);
        onAudioDeleted();
        deleteConfirmRef.current = null;
        setDeleteConfirmId(null);
      } catch (err) {
        console.error(err);
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

  return (
    <>
      <div id="audio-creator-container" className="bg-[#0c0c0c] border border-zinc-800 rounded-xl p-5 space-y-5 shadow-lg transition-all duration-300">
        <div className="flex items-center justify-between mb-1 border-b border-zinc-800 pb-3">
          <h2 className="text-base font-black uppercase tracking-tight italic text-white flex items-center gap-2">
            <Mic className="w-5 h-5 text-neon" />
            CRIAR NOVO ANÚNCIO
          </h2>
          {audios.length === 0 && (
            <button
              id="load-presets-btn"
              onClick={handleLoadSystemPresets}
              disabled={isSaving}
              className="text-[10px] uppercase font-bold tracking-wider text-black bg-neon hover:bg-neon-hover px-2 py-1 rounded transition-all flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" />
              MODELOS
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap sm:flex-nowrap bg-zinc-900 p-1 rounded-xl text-xs font-bold border border-zinc-800 gap-1">
          <button
            id="tab-tts"
            onClick={() => setActiveTab('tts')}
            className={`flex-1 min-w-[80px] py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'tts' ? 'bg-neon text-black font-black uppercase italic shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Speech className="w-3.5 h-3.5 shrink-0" />
            SINTETIZADOR (TTS)
          </button>
          <button
            id="tab-record"
            onClick={() => setActiveTab('record')}
            className={`flex-1 min-w-[80px] py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'record' ? 'bg-neon text-black font-black uppercase italic shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Mic className="w-3.5 h-3.5 shrink-0" />
            GRAVAR VOZ
          </button>
          <button
            id="tab-upload"
            onClick={() => setActiveTab('upload')}
            className={`flex-1 min-w-[80px] py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'upload' ? 'bg-neon text-black font-black uppercase italic shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5 shrink-0" />
            ENVIAR
          </button>
          <button
            id="tab-library"
            onClick={() => setActiveTab('library')}
            className={`flex-1 min-w-[80px] py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
              activeTab === 'library' ? 'bg-neon text-black font-black uppercase italic shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Database className="w-3.5 h-3.5 shrink-0 text-amber-500" />
            BASE DE ANÚNCIOS
          </button>
        </div>

        {/* Inputs / Library Form */}
        {activeTab === 'library' ? (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-850 text-xs text-zinc-400 font-medium leading-relaxed">
              <span className="text-neon font-black block uppercase mb-1 tracking-wide flex items-center gap-1.5">
                <Database className="w-4 h-4 text-amber-500 animate-pulse" />
                BASE DE ANÚNCIOS DA ACADEMIA (MODELOS PROFISSIONAIS)
              </span>
              Selecione um anúncio pré-configurado do banco de dados oficial. Você pode escutar uma simulação de áudio antes de importar para a lista ativa do seu agendador.
            </div>

            <div className="space-y-3 max-h-[380px] overflow-y-auto custom-scrollbar pr-1 grid grid-cols-1 md:grid-cols-2 gap-3">
              {PRESET_ANNOUNCEMENTS_DATABASE.map((item) => {
                const isPlaying = playingAudioId === item.id;
                const isAlreadyImported = audios.some(a => a.name === item.name);
                return (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-850 hover:border-zinc-700 transition-all flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className="font-bold text-white text-xs block tracking-tight leading-tight">{item.name}</span>
                        <span className="text-[9px] font-mono font-black uppercase tracking-wider text-black bg-neon px-1.5 py-0.5 rounded shrink-0">
                          {item.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 italic bg-zinc-950/70 p-2.5 rounded-lg border border-zinc-900 leading-relaxed font-medium">
                        "{item.text}"
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 pt-1 border-t border-zinc-900">
                      <span className="text-[10px] text-zinc-500 font-mono">
                        Duração est.: {item.duration}s
                      </span>
                      <div className="flex items-center gap-1.5">
                        {/* Test Button */}
                        <button
                          onClick={() => handlePlayLibraryTts(item.text, item.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all border cursor-pointer ${
                            isPlaying
                              ? 'bg-red-600 border-red-700 text-white animate-pulse'
                              : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-white'
                          }`}
                        >
                          {isPlaying ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                          {isPlaying ? 'Parar' : 'Testar'}
                        </button>

                        {/* Import Button */}
                        <button
                          onClick={() => handleImportLibraryItem(item)}
                          disabled={isAlreadyImported || isSaving}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider italic flex items-center gap-1 transition-all cursor-pointer ${
                            isAlreadyImported
                              ? 'bg-zinc-850 text-zinc-500 cursor-not-allowed border border-zinc-800/40'
                              : 'bg-neon hover:bg-neon-hover text-black shadow-md'
                          }`}
                        >
                          <Plus className="w-3 h-3 stroke-[3px]" />
                          {isAlreadyImported ? 'Importado' : 'Importar'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Título do Anúncio</label>
                <input
                  id="announcement-title-input"
                  type="text"
                  placeholder="Ex: Alerta de Alongamento, Aviso de Fechamento"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-sm border border-zinc-800 rounded-xl px-3 py-2 bg-zinc-900 focus:outline-none focus:border-neon focus:ring-1 focus:ring-neon/30 transition-all text-white placeholder-zinc-600 font-bold"
                />
              </div>

              {/* Text To Speech Tab Content */}
              {activeTab === 'tts' && (
                <div className="space-y-4.5 animate-fade-in">
                  
                  {/* Voice Profile Cards */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                      Selecione um Perfil de Voz (Feminino, Masculino ou Efeitos)
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {VOICE_PROFILES.map((profile) => {
                        const isSelected = selectedProfileId === profile.id;
                        return (
                          <button
                            key={profile.id}
                            type="button"
                            onClick={() => applyVoiceProfile(profile.id)}
                            className={`p-2 rounded-xl border text-left transition-all flex flex-col justify-between h-[86px] cursor-pointer ${
                              isSelected
                                ? 'bg-neon/10 border-neon text-white shadow-md shadow-neon/5'
                                : 'bg-zinc-900/40 border-zinc-850 hover:border-zinc-700 text-zinc-300 hover:bg-zinc-900/85'
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="text-base leading-none">{profile.avatar}</span>
                              <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase font-mono leading-none ${
                                profile.gender === 'F' 
                                  ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/20' 
                                  : profile.gender === 'M' 
                                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/20' 
                                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/20'
                              }`}>
                                {profile.gender === 'F' ? 'FEM' : profile.gender === 'M' ? 'MASC' : 'FX'}
                              </span>
                            </div>
                            <div className="mt-1 min-w-0">
                              <p className="text-[10px] font-black uppercase truncate leading-tight text-white">{profile.name.split(' ')[0]}</p>
                              <p className="text-[8px] text-zinc-500 font-medium leading-normal line-clamp-2 mt-0.5">{profile.description}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Sliders for Pitch and Rate */}
                  <div className="grid grid-cols-2 gap-3 bg-zinc-950/80 p-3.5 rounded-xl border border-zinc-850">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                          Tom da Voz (Grave/Agudo)
                        </label>
                        <span className="text-[9px] font-mono font-black text-neon bg-neon/10 px-1.5 py-0.5 rounded border border-neon/10">
                          {ttsPitch.toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="2.0"
                        step="0.05"
                        value={ttsPitch}
                        onChange={(e) => {
                          setTtsPitch(parseFloat(e.target.value));
                          setSelectedProfileId(''); // Clear profile active state since user customized
                        }}
                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-neon focus:outline-none"
                      />
                      <div className="flex justify-between text-[8px] text-zinc-600 font-mono mt-1 font-bold">
                        <span>GRAVE (0.5)</span>
                        <span>NORMAL</span>
                        <span>AGUDO (2.0)</span>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                          Velocidade da Fala
                        </label>
                        <span className="text-[9px] font-mono font-black text-neon bg-neon/10 px-1.5 py-0.5 rounded border border-neon/10">
                          {ttsRate.toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="2.0"
                        step="0.05"
                        value={ttsRate}
                        onChange={(e) => {
                          setTtsRate(parseFloat(e.target.value));
                          setSelectedProfileId(''); // Clear profile active state since user customized
                        }}
                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-neon focus:outline-none"
                      />
                      <div className="flex justify-between text-[8px] text-zinc-600 font-mono mt-1 font-bold">
                        <span>LENTO (0.5)</span>
                        <span>NORMAL</span>
                        <span>RÁPIDO (2.0)</span>
                      </div>
                    </div>
                  </div>

                  {/* Engine Selection and Filters */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 bg-zinc-900/25 p-3 rounded-xl border border-zinc-850">
                    {/* Gender filter */}
                    <div className="md:col-span-5 space-y-1">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                        Filtrar Lista de Vozes
                      </label>
                      <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-850 text-[9px] font-black tracking-wider">
                        <button
                          type="button"
                          onClick={() => setVoiceGenderFilter('all')}
                          className={`flex-1 py-1 rounded text-center transition-all ${
                            voiceGenderFilter === 'all' ? 'bg-zinc-800 text-white font-extrabold' : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          TODAS
                        </button>
                        <button
                          type="button"
                          onClick={() => setVoiceGenderFilter('F')}
                          className={`flex-1 py-1 rounded text-center transition-all flex items-center justify-center gap-1 ${
                            voiceGenderFilter === 'F' ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/10 font-extrabold' : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          <span>👩</span> FEMININAS
                        </button>
                        <button
                          type="button"
                          onClick={() => setVoiceGenderFilter('M')}
                          className={`flex-1 py-1 rounded text-center transition-all flex items-center justify-center gap-1 ${
                            voiceGenderFilter === 'M' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/10 font-extrabold' : 'text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          <span>👨</span> MASCULINAS
                        </button>
                      </div>
                    </div>

                    {/* Available engines select dropdown */}
                    <div className="md:col-span-7 space-y-1">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                        Mecanismo de Voz do Navegador
                      </label>
                      <select
                        id="tts-voice-select"
                        value={ttsVoice}
                        onChange={(e) => {
                          setTtsVoice(e.target.value);
                          setSelectedProfileId(''); // Clear selected preset card since user custom selected voice
                        }}
                        className="w-full text-xs border border-zinc-800 rounded-lg px-2.5 py-1.5 bg-zinc-950 text-zinc-300 focus:outline-none focus:border-neon cursor-pointer font-bold h-[31px]"
                      >
                        {availableVoices
                          .filter(v => {
                            if (voiceGenderFilter === 'all') return true;
                            const voiceGender = getVoiceGender(v.name);
                            return voiceGender === voiceGenderFilter || voiceGender === 'U';
                          })
                          .map((voice, idx) => (
                            <option key={idx} value={voice.name} className="bg-zinc-950 text-white">
                              {getFriendlyVoiceName(voice)} ({voice.lang})
                            </option>
                          ))}
                        {availableVoices.filter(v => {
                          if (voiceGenderFilter === 'all') return true;
                          const voiceGender = getVoiceGender(v.name);
                          return voiceGender === voiceGenderFilter || voiceGender === 'U';
                        }).length === 0 && (
                          <option className="bg-zinc-950 text-white">Nenhuma voz compatível nesta categoria</option>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Text Input area */}
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Texto que será falado</label>
                    <textarea
                      id="tts-text-area"
                      rows={3}
                      placeholder="Digite a mensagem para ser falada automaticamente..."
                      value={ttsText}
                      onChange={(e) => {
                        setTtsText(e.target.value);
                        if (!title && e.target.value.length < 20) {
                          setTitle(e.target.value);
                        }
                      }}
                      className="w-full text-sm border border-zinc-800 rounded-xl p-3 bg-zinc-900 focus:outline-none focus:border-neon focus:ring-1 focus:ring-neon/30 transition-all text-white placeholder-zinc-600 leading-relaxed font-semibold"
                    />
                  </div>

                  {/* Play Test trigger */}
                  <div className="flex justify-end pt-0.5">
                    <button
                      id="test-tts-btn"
                      type="button"
                      onClick={handleTestTts}
                      disabled={!ttsText}
                      className={`py-2 px-4 rounded-lg text-xs font-black uppercase italic flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        isSpeakingTts
                          ? 'bg-red-600 text-white hover:bg-red-700 shadow-md animate-pulse'
                          : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 disabled:opacity-50 border border-zinc-750'
                      }`}
                    >
                      {isSpeakingTts ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Volume2 className="w-3.5 h-3.5" />}
                      {isSpeakingTts ? 'Parar Teste' : 'Testar Voz'}
                    </button>
                  </div>
                </div>
              )}

              {/* Record Audio Tab Content */}
              {activeTab === 'record' && (
                <div className="space-y-4 text-center py-2 animate-fade-in bg-zinc-900/30 border border-zinc-850 rounded-xl p-4">
                  <div className="flex flex-col items-center justify-center">
                    {isRecording ? (
                      <div className="relative flex items-center justify-center mb-2">
                        <span className="absolute animate-ping h-12 w-12 rounded-full bg-red-400 opacity-20"></span>
                        <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center text-white font-mono text-sm font-semibold relative">
                          {recordingSeconds}s
                        </div>
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 mb-2">
                        <Mic className="w-5 h-5" />
                      </div>
                    )}

                    <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider font-mono">
                      {isRecording ? 'Gravando áudio do microfone da recepção...' : 'Clique abaixo para começar a gravar'}
                    </p>

                    <div className="flex flex-col sm:flex-row gap-3 mt-4 w-full">
                      {!isRecording ? (
                        <button
                          id="start-record-btn"
                          onClick={startRecording}
                          className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black uppercase italic text-xs py-2 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
                        >
                          <Mic className="w-3.5 h-3.5" />
                          Iniciar Gravação
                        </button>
                      ) : (
                        <button
                          id="stop-record-btn"
                          onClick={stopRecording}
                          className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-black uppercase italic text-xs py-2 rounded-xl transition-all flex items-center justify-center gap-1.5"
                        >
                          <Pause className="w-3.5 h-3.5 fill-current" />
                          Parar Gravação
                        </button>
                      )}

                      {recordedBlobUrl && !isRecording && (
                        <button
                          id="test-recording-btn"
                          onClick={togglePlayTestAudio}
                          className={`flex-1 font-black uppercase italic text-xs py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                            isPlayingTest ? 'bg-neon text-black hover:bg-neon-hover shadow-md' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                          }`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          {isPlayingTest ? 'Parar Teste' : 'Ouvir Gravação'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* File Upload Tab Content */}
              {activeTab === 'upload' && (
                <div className="space-y-4 animate-fade-in">
                  <div className="border-2 border-dashed border-zinc-800 hover:border-neon rounded-xl p-4 text-center transition-all cursor-pointer relative bg-zinc-900/40 hover:bg-zinc-900/80">
                    <input
                      id="announcement-file-upload"
                      type="file"
                      accept="audio/*"
                      onChange={handleFileUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <Upload className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
                    <p className="text-sm font-bold text-zinc-300">
                      {uploadedFileName ? uploadedFileName : 'Arraste ou clique para carregar o anúncio'}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1 uppercase font-mono">Formatos suportados: .mp3, .wav, .m4a</p>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-xs text-red-400 font-bold mb-3">
                {error}
              </div>
            )}

            {/* Save Button Bar */}
            <div className="pt-3 border-t border-zinc-800 flex items-center justify-between">
              <div className="text-xs text-zinc-500 font-mono font-bold uppercase flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-neon" />
                GRAVAÇÃO LOCAL SEGURA
              </div>
              <button
                id="save-announcement-btn"
                onClick={handleSaveAnnouncement}
                disabled={isSaving || !title || (activeTab === 'tts' && !ttsText) || (activeTab === 'record' && !recordedBase64) || (activeTab === 'upload' && !uploadedFileBase64)}
                className="bg-neon hover:bg-neon-hover disabled:bg-zinc-850 disabled:text-zinc-600 text-black px-4 py-2 rounded-xl text-xs font-black uppercase italic transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving ? 'SALVANDO...' : 'SALVAR ANÚNCIO'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Lista de Anúncios Cadastrados */}
      <div id="saved-announcements-container" className="bg-[#0c0c0c] border border-zinc-800 rounded-xl p-5 space-y-4 shadow-lg transition-all duration-300 mt-6">
        <h3 className="text-base font-black uppercase tracking-tight italic text-white flex items-center gap-2 border-b border-zinc-800 pb-3">
          <Volume2 className="w-5 h-5 text-neon animate-pulse" />
          ANÚNCIOS DISPONÍVEIS ({audios.length})
        </h3>

        {audios.length > 0 ? (
          <div className="space-y-2.5 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
            {audios.map((audio) => {
              const isPlaying = playingAudioId === audio.id;
              return (
                <div
                  key={audio.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/40 hover:bg-zinc-900/80 border border-zinc-850 text-xs transition-all"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="font-bold text-zinc-200 truncate">{audio.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] uppercase font-mono font-bold tracking-wider text-neon bg-neon/10 border border-neon/20 px-1.5 py-0.5 rounded">
                        {audio.type === 'tts' || audio.type === 'preset' ? 'SINTETIZADO' : audio.type === 'recorded' ? 'GRAVAÇÃO' : 'ARQUIVO'}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        Duração: {audio.duration}s
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Botão de Tocar Preview */}
                    <button
                      onClick={() => playAudioPreview(audio)}
                      className={`p-2 rounded-lg border transition-all cursor-pointer ${
                        isPlaying
                          ? 'bg-red-500/10 border-red-500/20 text-red-400'
                          : 'bg-zinc-950 border-zinc-850 text-neon hover:bg-zinc-900 hover:border-neon/30'
                      }`}
                      title={isPlaying ? 'Parar Teste' : 'Testar Áudio'}
                    >
                      {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                    </button>

                    {/* Botão de Excluir */}
                    <button
                      onClick={() => handleDeleteAudio(audio.id)}
                      className={`p-2 border transition-all cursor-pointer rounded-lg text-xs font-bold ${
                        deleteConfirmId === audio.id
                          ? 'bg-red-900/30 border-red-500 text-red-400 animate-pulse px-2.5 py-1'
                          : 'bg-zinc-950 border-zinc-850 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20'
                      }`}
                      title={deleteConfirmId === audio.id ? 'Clique novamente para CONFIRMAR' : 'Excluir Anúncio'}
                    >
                      {deleteConfirmId === audio.id ? (
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
            })}
          </div>
        ) : (
          <div className="text-center py-6 text-zinc-500 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/10">
            <AlertCircle className="w-5 h-5 opacity-45 mx-auto mb-1.5 text-neon" />
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Nenhum anúncio criado ainda</p>
            <p className="text-[10px] text-zinc-500 mt-1 uppercase font-mono">Utilize o formulário acima para criar ou carregar modelos</p>
          </div>
        )}
      </div>
    </>
  );
}
