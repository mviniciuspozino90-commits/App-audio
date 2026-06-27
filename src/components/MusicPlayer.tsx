import { useState, useEffect, useRef, useImperativeHandle, forwardRef, ChangeEvent } from 'react';
import { Play, Pause, Volume2, VolumeX, Youtube, Music, Radio, SkipForward, AlertCircle } from 'lucide-react';

export interface MusicPlayerControls {
  pause: () => void;
  play: () => void;
  setVolume: (vol: number) => void;
  getVolume: () => number;
  isPlaying: () => boolean;
}

interface MusicPlayerProps {
  onControlsReady: (controls: MusicPlayerControls | null) => void;
}

interface LocalTrack {
  name: string;
  url: string;
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

export const MusicPlayer = forwardRef<MusicPlayerControls, MusicPlayerProps>(({ onControlsReady }, ref) => {
  const [activeTab, setActiveTab] = useState<'youtube' | 'local'>('youtube');
  const [isPlayingState, setIsPlayingState] = useState(false);
  const [volume, setVolume] = useState(100); // 0 to 100
  const [prevVolume, setPrevVolume] = useState(100);

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume);
      setVolume(0);
    } else {
      setVolume(prevVolume > 0 ? prevVolume : 100);
    }
  };

  // YouTube State
  const [ytUrl, setYtUrl] = useState('https://www.youtube.com/watch?v=jfKfPfyJRdk'); // Default chill gym lofi
  const [ytVideoId, setYtVideoId] = useState('jfKfPfyJRdk');
  const [isYtReady, setIsYtReady] = useState(false);
  const ytPlayerRef = useRef<any>(null);
  const ytContainerId = 'yt-player-iframe';

  // Local Music State
  const [localTracks, setLocalTracks] = useState<LocalTrack[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(-1);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);

  // Target volume for fading
  const currentVolumeRef = useRef<number>(100);

  // Load YouTube Iframe API
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }

      window.onYouTubeIframeAPIReady = () => {
        initYoutubePlayer(ytVideoId);
      };
    } else if (window.YT && window.YT.Player) {
      initYoutubePlayer(ytVideoId);
    }

    return () => {
      if (localAudioRef.current) {
        localAudioRef.current.pause();
        localAudioRef.current = null;
      }
    };
  }, []);

  const initYoutubePlayer = (videoId: string) => {
    try {
      if (ytPlayerRef.current) {
        ytPlayerRef.current.destroy();
      }

      ytPlayerRef.current = new window.YT.Player(ytContainerId, {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: (event: any) => {
            setIsYtReady(true);
            event.target.setVolume(currentVolumeRef.current);
          },
          onStateChange: (event: any) => {
            // YT.PlayerState.PLAYING is 1
            if (event.data === 1) {
              setIsPlayingState(true);
            } else if (event.data === 2) {
              // Paused
              setIsPlayingState(false);
            }
          },
        },
      });
    } catch (e) {
      console.error('Error initializing YouTube Player:', e);
    }
  };

  // Extract video/playlist ID from URL
  const loadYoutubeVideo = () => {
    let videoId = '';
    try {
      const url = new URL(ytUrl);
      if (url.hostname.includes('youtube.com')) {
        videoId = url.searchParams.get('v') || '';
      } else if (url.hostname.includes('youtu.be')) {
        videoId = url.pathname.slice(1);
      }
    } catch (e) {
      // Direct string fallback
      videoId = ytUrl;
    }

    if (videoId) {
      setYtVideoId(videoId);
      if (window.YT && window.YT.Player) {
        initYoutubePlayer(videoId);
      }
    }
  };

  // Sync volume state to ref
  useEffect(() => {
    currentVolumeRef.current = volume;
    if (activeTab === 'youtube' && ytPlayerRef.current && isYtReady) {
      try {
        ytPlayerRef.current.setVolume(volume);
      } catch (e) {
        // ignore iframe errors
      }
    } else if (activeTab === 'local' && localAudioRef.current) {
      localAudioRef.current.volume = volume / 100;
    }
  }, [volume, activeTab, isYtReady]);

  // Handle local track completion (auto-advance)
  const playNextLocalTrack = () => {
    if (localTracks.length === 0) return;
    const nextIndex = (currentTrackIndex + 1) % localTracks.length;
    setCurrentTrackIndex(nextIndex);
  };

  useEffect(() => {
    if (activeTab === 'local' && currentTrackIndex !== -1 && localTracks[currentTrackIndex]) {
      if (localAudioRef.current) {
        localAudioRef.current.pause();
      }

      const audio = new Audio(localTracks[currentTrackIndex].url);
      audio.volume = volume / 100;
      localAudioRef.current = audio;

      audio.addEventListener('ended', () => {
        playNextLocalTrack();
      });

      if (isPlayingState) {
        audio.play().catch(err => console.log('Audio autoplay blocked', err));
      }
    }
  }, [currentTrackIndex, activeTab]);

  // Handle local file uploads
  const handleLocalFilesUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files) as File[];
      const newTracks: LocalTrack[] = filesArray.map(file => ({
        name: file.name.replace(/\.[^/.]+$/, ""), // remove extension
        url: URL.createObjectURL(file),
      }));

      setLocalTracks(prev => {
        const updated = [...prev, ...newTracks];
        if (prev.length === 0 && updated.length > 0) {
          setCurrentTrackIndex(0);
        }
        return updated;
      });
    }
  };

  // Control operations
  const controls: MusicPlayerControls = {
    pause: () => {
      setIsPlayingState(false);
      if (activeTab === 'youtube' && ytPlayerRef.current && isYtReady) {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch (e) {
          console.error(e);
        }
      } else if (activeTab === 'local' && localAudioRef.current) {
        localAudioRef.current.pause();
      }
    },
    play: () => {
      setIsPlayingState(true);
      if (activeTab === 'youtube' && ytPlayerRef.current && isYtReady) {
        try {
          ytPlayerRef.current.playVideo();
        } catch (e) {
          console.error(e);
        }
      } else if (activeTab === 'local' && localTracks.length > 0) {
        if (currentTrackIndex === -1) {
          setCurrentTrackIndex(0);
        } else if (localAudioRef.current) {
          localAudioRef.current.play().catch(e => console.log(e));
        }
      }
    },
    setVolume: (vol: number) => {
      currentVolumeRef.current = vol;
      setVolume(vol);
      if (activeTab === 'youtube' && ytPlayerRef.current && isYtReady) {
        try {
          ytPlayerRef.current.setVolume(vol);
        } catch (e) {
          // ignore iframe error
        }
      } else if (activeTab === 'local' && localAudioRef.current) {
        localAudioRef.current.volume = vol / 100;
      }
    },
    getVolume: () => {
      return currentVolumeRef.current;
    },
    isPlaying: () => {
      return isPlayingState;
    },
  };

  // Expose controls
  useImperativeHandle(ref, () => controls);

  useEffect(() => {
    onControlsReady(controls);
    return () => onControlsReady(null);
  }, [activeTab, isYtReady, localTracks, currentTrackIndex, isPlayingState]);

  const togglePlay = () => {
    if (isPlayingState) {
      controls.pause();
    } else {
      controls.play();
    }
  };

  const selectTab = (tab: 'youtube' | 'local') => {
    controls.pause();
    setActiveTab(tab);
  };

  return (
    <div id="music-player-container" className="bg-[#0c0c0c] border border-zinc-800 rounded-xl p-5 shadow-lg transition-all duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-zinc-800 pb-3">
        <h2 className="text-base font-black uppercase tracking-tight italic text-white flex items-center gap-2">
          <Music className="w-5 h-5 text-neon" />
          MÚSICA DE FUNDO
        </h2>
        <div className="flex bg-zinc-900 p-1 rounded-lg text-xs font-bold border border-zinc-800">
          <button
            id="tab-yt"
            onClick={() => selectTab('youtube')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
              activeTab === 'youtube' ? 'bg-neon text-black font-black uppercase italic shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Youtube className="w-3.5 h-3.5" />
            YOUTUBE
          </button>
          <button
            id="tab-local"
            onClick={() => selectTab('local')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
              activeTab === 'local' ? 'bg-neon text-black font-black uppercase italic shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            LOCAL TRACKS
          </button>
        </div>
      </div>

      {activeTab === 'youtube' ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              id="yt-url-input"
              type="text"
              placeholder="Cole o link do YouTube (Vídeo ou Playlist)"
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              className="flex-1 text-sm border border-zinc-800 rounded-xl px-3 py-2 bg-zinc-900 focus:outline-none focus:border-neon focus:ring-1 focus:ring-neon/30 transition-all text-white placeholder-zinc-500"
            />
            <button
              id="load-yt-btn"
              onClick={loadYoutubeVideo}
              className="bg-neon hover:bg-neon-hover text-black px-4 py-2 rounded-xl text-xs font-black uppercase italic transition-all shadow-md flex items-center gap-1"
            >
              CARREGAR
            </button>
          </div>

          <div className="aspect-video w-full rounded-xl bg-black overflow-hidden border border-zinc-800 shadow-inner relative flex items-center justify-center">
            <div id={ytContainerId} className="w-full h-full absolute inset-0"></div>
            {!isYtReady && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center text-center p-4">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-neon border-t-transparent mb-2"></div>
                <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider font-mono">Iniciando Player do YouTube...</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="border-2 border-dashed border-zinc-800 hover:border-neon rounded-xl p-4 text-center transition-all cursor-pointer relative bg-zinc-900/40 hover:bg-zinc-900/80">
            <input
              id="local-music-upload"
              type="file"
              multiple
              accept="audio/*"
              onChange={handleLocalFilesUpload}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <Music className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
            <p className="text-sm font-bold text-zinc-300">Arraste ou clique para adicionar músicas</p>
            <p className="text-xs text-zinc-500 mt-1 uppercase font-mono">Suporta arquivos .mp3 ou .wav de treino</p>
          </div>

          {localTracks.length > 0 ? (
            <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-3 max-h-[160px] overflow-y-auto space-y-1.5 custom-scrollbar">
              {localTracks.map((track, idx) => (
                <div
                  id={`local-track-${idx}`}
                  key={idx}
                  onClick={() => setCurrentTrackIndex(idx)}
                  className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-all ${
                    idx === currentTrackIndex
                      ? 'bg-neon/10 text-neon font-bold border border-neon/30'
                      : 'hover:bg-zinc-900 text-zinc-400 border border-transparent'
                  }`}
                >
                  <span className="truncate flex-1 pr-2">
                    {idx + 1}. {track.name}
                  </span>
                  {idx === currentTrackIndex && isPlayingState && (
                    <span className="flex gap-0.5 items-center">
                      <span className="w-1 h-3 bg-neon animate-pulse rounded-full"></span>
                      <span className="w-1 h-2 bg-neon animate-pulse delay-75 rounded-full"></span>
                      <span className="w-1 h-3.5 bg-neon animate-pulse delay-150 rounded-full"></span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-zinc-500 text-xs font-mono">
              <AlertCircle className="w-5 h-5 mx-auto mb-1 opacity-60" />
              Nenhuma música local carregada ainda.
            </div>
          )}
        </div>
      )}

      {/* Main Playback Bar */}
      <div className="mt-5 pt-4 border-t border-zinc-800 flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            id="music-play-toggle"
            onClick={togglePlay}
            disabled={activeTab === 'local' && localTracks.length === 0}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${
              isPlayingState
                ? 'bg-zinc-800 text-white hover:bg-zinc-700'
                : 'bg-neon text-black hover:bg-neon-hover shadow-lg shadow-neon/15'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isPlayingState ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>

          {activeTab === 'local' && localTracks.length > 0 && (
            <button
              id="music-skip-btn"
              onClick={playNextLocalTrack}
              className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-all shrink-0"
              title="Próxima faixa"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          )}

          <div className="text-xs min-w-0 flex-1">
            <p className="font-bold text-zinc-200 truncate">
              {activeTab === 'youtube'
                ? isYtReady ? 'Player do YouTube Ativo' : 'Carregando YouTube...'
                : currentTrackIndex !== -1 && localTracks[currentTrackIndex]
                ? localTracks[currentTrackIndex].name
                : 'Sem faixas na fila'}
            </p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono font-bold">
              {isPlayingState ? 'TOCANDO' : 'PAUSADO'}
            </p>
          </div>
        </div>

        {/* Volume controls with clickable mute button */}
        <div className="flex items-center gap-2 w-full sm:w-[170px] shrink-0 bg-zinc-900/60 px-3 py-1.5 rounded-xl border border-zinc-800">
          <button
            id="volume-mute-toggle"
            onClick={toggleMute}
            className="text-zinc-400 hover:text-neon transition-all cursor-pointer p-1 rounded hover:bg-zinc-800"
            title={volume === 0 ? "Ativar som" : "Mudar para mudo"}
          >
            {volume === 0 ? (
              <VolumeX className="w-4 h-4 text-red-500" />
            ) : (
              <Volume2 className="w-4 h-4 text-neon" />
            )}
          </button>
          <input
            id="music-volume-slider"
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-neon"
          />
          <span className="text-xs font-mono font-bold text-zinc-400 w-8 text-right shrink-0">{volume}%</span>
        </div>
      </div>
    </div>
  );
});

MusicPlayer.displayName = 'MusicPlayer';
