import { useState, useEffect, useRef, useImperativeHandle, forwardRef, ChangeEvent } from 'react';
import { Play, Pause, Volume2, VolumeX, Youtube, Music, Radio, SkipForward, AlertCircle, Globe, RefreshCw, Link, Compass, Info } from 'lucide-react';

// Check if running inside Electron wrapper
const isElectron = typeof window !== 'undefined' && 
  window.navigator && 
  window.navigator.userAgent.toLowerCase().includes('electron');

// Capitalized custom component reference to bypass TypeScript JSX.IntrinsicElements check safely
const Webview = 'webview' as any;

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

interface MusicPreset {
  id: string;
  name: string;
  type: 'stream' | 'iframe';
  url: string;
  genre: string;
  icon: string;
  description: string;
}

// Highly reliable presets for gym ambient music
const MUSIC_PRESETS: MusicPreset[] = [
  {
    id: 'stream_workout',
    name: 'I9 Fit Dance & Pop',
    type: 'stream',
    url: 'https://stream.zeno.fm/f37yv62220hvv',
    genre: 'Dance / Eletrônica',
    icon: '⚡',
    description: 'Batidas super aceleradas e enérgicas, perfeitas para treino pesado de musculação.'
  },
  {
    id: 'stream_sertanejo',
    name: 'Sertanejo Universitário',
    type: 'stream',
    url: 'https://stream.zeno.fm/7q2f9p3p5g0uv',
    genre: 'Sertanejo Hits',
    icon: '🤠',
    description: 'Os maiores sucessos do sertanejo atual para embalar a galera na academia.'
  },
  {
    id: 'stream_rock',
    name: 'Rock Workout',
    type: 'stream',
    url: 'https://stream.zeno.fm/08m7w47b40hvv',
    genre: 'Hard Rock / Metal',
    icon: '🎸',
    description: 'Muito rock clássico e metal pesado para dar aquele gás extra no levantamento.'
  },
  {
    id: 'stream_lofi',
    name: 'Lofi Gym Focus',
    type: 'stream',
    url: 'https://stream.zeno.fm/2v1scdfp9g0uv',
    genre: 'Lofi / Chillout',
    icon: '🧘',
    description: 'Músicas calmas, ideais para alongamentos, Pilates, Yoga ou relaxamento.'
  },
  {
    id: 'iframe_yt_lofi',
    name: 'YouTube: Gym Lofi 24/7',
    type: 'iframe',
    url: 'https://www.youtube.com/embed/jfKfPfyJRdk',
    genre: 'Lofi Video Embed',
    icon: '📺',
    description: 'Transmissão contínua do YouTube com músicas lofi relaxantes.'
  },
  {
    id: 'iframe_spotify_fitness',
    name: 'Spotify: Top Hits',
    type: 'iframe',
    url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX76t638V6eg8',
    genre: 'Hits de Academia',
    icon: '🎵',
    description: 'Playlist oficial do Spotify com as músicas mais tocadas nas academias.'
  }
];

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

export const MusicPlayer = forwardRef<MusicPlayerControls, MusicPlayerProps>(({ onControlsReady }, ref) => {
  const [activeTab, setActiveTab] = useState<'youtube' | 'local'>('youtube'); // youtube internally represents the web browser/radio player
  const [isPlayingState, setIsPlayingState] = useState(false);
  const [volume, setVolume] = useState(100); // 0 to 100
  const [prevVolume, setPrevVolume] = useState(100);

  // Web Browser / Radio Player States
  const [webUrl, setWebUrl] = useState('https://stream.zeno.fm/f37yv62220hvv'); // Defaults to our Fit Dance Stream
  const [resolvedUrl, setResolvedUrl] = useState('https://stream.zeno.fm/f37yv62220hvv');
  const [webMode, setWebMode] = useState<'stream' | 'youtube_api' | 'generic_iframe'>('stream');
  const [activePresetId, setActivePresetId] = useState<string>('stream_workout');
  const [iframeKey, setIframeKey] = useState(0); // For reloading the iframe

  // Helper states to check if input is a search term or a blocked site
  const [isInputSearch, setIsInputSearch] = useState(false);
  const [isBlockedUrl, setIsBlockedUrl] = useState(false);

  // Automatically recalculate search and block status in real-time
  useEffect(() => {
    const trimmed = webUrl.trim();
    if (!trimmed) {
      setIsInputSearch(false);
      setIsBlockedUrl(false);
      return;
    }

    // Is it a search query? (e.g. contains spaces but no dot, or contains no dot and doesn't start with http)
    const checkSearch = (input: string): boolean => {
      const val = input.trim();
      if (!val) return false;
      if (val.includes(' ') && !val.includes('.')) return true;
      if (!val.includes('.') && !val.startsWith('http') && val !== 'localhost') return true;
      return false;
    };

    const isSearch = checkSearch(trimmed);
    setIsInputSearch(isSearch);

    if (isSearch) {
      setIsBlockedUrl(false);
    } else {
      // Is it a blocked URL? (known sites that block iframe embeds)
      const checkBlocked = (urlStr: string): boolean => {
        try {
          let clean = urlStr.trim();
          if (!/^https?:\/\//i.test(clean)) {
            clean = 'https://' + clean;
          }
          const url = new URL(clean);
          const host = url.hostname.toLowerCase();
          
          if (host.includes('youtube.com')) {
            // Block if it's the main page or search page, and NOT a specific watch video or embed or playlist
            if (!url.pathname.startsWith('/embed/') && !url.searchParams.get('v') && !url.searchParams.get('list')) {
              return true;
            }
          }
          
          if (host.includes('spotify.com')) {
            if (!url.pathname.startsWith('/embed')) {
              return true;
            }
          }
          
          const blockedHosts = [
            'google.com', 'google.com.br', 'google.pt', 'google.es',
            'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
            'netflix.com', 'twitch.tv', 'vimeo.com', 'soundcloud.com',
            'deezer.com', 'apple.com', 'music.apple.com', 'amazon.com',
            'github.com'
          ];
          
          return blockedHosts.some(blocked => host === blocked || host.endsWith('.' + blocked));
        } catch (e) {
          return false;
        }
      };
      setIsBlockedUrl(checkBlocked(trimmed));
    }
  }, [webUrl]);

  // YouTube API Integration States
  const [ytVideoId, setYtVideoId] = useState('');
  const [isYtReady, setIsYtReady] = useState(false);
  const ytPlayerRef = useRef<any>(null);
  const ytContainerId = 'yt-player-iframe-api';

  // Local Music Player State
  const [localTracks, setLocalTracks] = useState<LocalTrack[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(-1);
  const localAudioRef = useRef<HTMLAudioElement | null>(null);

  // Reference to track real volume for background ducking
  const currentVolumeRef = useRef<number>(100);

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume);
      setVolume(0);
    } else {
      setVolume(prevVolume > 0 ? prevVolume : 100);
    }
  };

  // Convert watch URLs of YouTube / Spotify to embed equivalents
  const resolveInputUrl = (input: string): { url: string; mode: 'stream' | 'youtube_api' | 'generic_iframe'; ytid?: string } => {
    let clean = input.trim();
    if (!clean) return { url: '', mode: 'generic_iframe' };

    // Default to https if no protocol specified
    if (!/^https?:\/\//i.test(clean)) {
      clean = 'https://' + clean;
    }

    // Check if it is a known direct audio/radio stream URL
    const isDirectStream = clean.includes('.mp3') || 
                           clean.includes('.aac') || 
                           clean.includes('.ogg') || 
                           clean.includes('stream') || 
                           clean.includes('radio') || 
                           clean.includes('icecast') || 
                           clean.includes('shoutcast') || 
                           clean.includes('zeno.fm');

    try {
      const parsed = new URL(clean);

      // YouTube Video or Playlist URL translation
      if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be')) {
        // YouTube Playlists (e.g. list=PL...)
        const playlistId = parsed.searchParams.get('list');
        if (playlistId) {
          return {
            url: `https://www.youtube.com/embed/videoseries?list=${playlistId}&autoplay=1`,
            mode: 'generic_iframe'
          };
        }

        let videoId = '';
        if (parsed.hostname.includes('youtu.be')) {
          videoId = parsed.pathname.slice(1);
        } else {
          videoId = parsed.searchParams.get('v') || '';
        }

        if (videoId) {
          return {
            url: `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1`,
            mode: 'youtube_api',
            ytid: videoId
          };
        }
      }

      // YouTube Embed URL matching
      if (parsed.hostname.includes('youtube.com') && parsed.pathname.startsWith('/embed/')) {
        const videoId = parsed.pathname.split('/')[2];
        return {
          url: clean,
          mode: 'youtube_api',
          ytid: videoId
        };
      }

      // Spotify web player translation
      if (parsed.hostname.includes('spotify.com')) {
        const path = parsed.pathname;
        if (!path.startsWith('/embed')) {
          return {
            url: `https://open.spotify.com/embed${path}`,
            mode: 'generic_iframe'
          };
        }
      }

    } catch (e) {
      // Ignore URL parsing failure
    }

    return {
      url: clean,
      mode: isDirectStream ? 'stream' : 'generic_iframe'
    };
  };

  // Load YouTube Iframe API if needed
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
        if (webMode === 'youtube_api' && ytVideoId) {
          initYoutubePlayer(ytVideoId);
        }
      };
    }

    return () => {
      stopAllAudio();
    };
  }, []);

  const stopAllAudio = () => {
    if (localAudioRef.current) {
      localAudioRef.current.pause();
      localAudioRef.current = null;
    }
    if (ytPlayerRef.current) {
      try {
        ytPlayerRef.current.destroy();
      } catch (e) {
        // ignore
      }
      ytPlayerRef.current = null;
      setIsYtReady(false);
    }
  };

  const initYoutubePlayer = (videoId: string) => {
    try {
      if (ytPlayerRef.current) {
        ytPlayerRef.current.destroy();
      }
      setIsYtReady(false);

      ytPlayerRef.current = new window.YT.Player(ytContainerId, {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
          autoplay: isPlayingState ? 1 : 0,
          controls: 1,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: (event: any) => {
            setIsYtReady(true);
            event.target.setVolume(currentVolumeRef.current);
            if (isPlayingState) {
              event.target.playVideo();
            }
          },
          onStateChange: (event: any) => {
            if (event.data === 1) {
              setIsPlayingState(true);
            } else if (event.data === 2) {
              setIsPlayingState(false);
            }
          },
        },
      });
    } catch (e) {
      console.error('Error initializing YouTube Player:', e);
    }
  };

  // Sync volume state changes
  useEffect(() => {
    currentVolumeRef.current = volume;
    if (activeTab === 'youtube') {
      if (webMode === 'stream' && localAudioRef.current) {
        localAudioRef.current.volume = volume / 100;
      } else if (webMode === 'youtube_api' && ytPlayerRef.current && isYtReady) {
        try {
          ytPlayerRef.current.setVolume(volume);
        } catch (e) {
          // Ignore potential iframe cross-origin volume set errors
        }
      }
    } else if (activeTab === 'local' && localAudioRef.current) {
      localAudioRef.current.volume = volume / 100;
    }
  }, [volume, activeTab, webMode, isYtReady]);

  // Handle local track completion (auto-advance)
  const playNextLocalTrack = () => {
    if (localTracks.length === 0) return;
    const nextIndex = (currentTrackIndex + 1) % localTracks.length;
    setCurrentTrackIndex(nextIndex);
  };

  // Local tracks state loading
  useEffect(() => {
    if (activeTab === 'local' && currentTrackIndex !== -1 && localTracks[currentTrackIndex]) {
      stopAllAudio();

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

  // Play a web stream via native browser Audio API
  const playWebStream = (streamUrl: string) => {
    stopAllAudio();
    
    const audio = new Audio(streamUrl);
    audio.volume = volume / 100;
    localAudioRef.current = audio;
    
    if (isPlayingState) {
      audio.play().catch(err => console.log('Radio stream autoplay blocked', err));
    }
  };

  // Action on triggering load button or selecting preset
  const handleLoadWebUrl = (urlToLoad: string) => {
    const { url, mode, ytid } = resolveInputUrl(urlToLoad);
    setResolvedUrl(url);
    setWebMode(mode);

    if (mode === 'stream') {
      playWebStream(url);
    } else if (mode === 'youtube_api' && ytid) {
      setYtVideoId(ytid);
      stopAllAudio();
      if (window.YT && window.YT.Player) {
        initYoutubePlayer(ytid);
      } else {
        // Fallback to generic iframe if API isn't loaded
        setWebMode('generic_iframe');
      }
    } else {
      // Generic Iframe mode
      stopAllAudio();
    }

    setIframeKey(prev => prev + 1); // Force-refresh the iframe element
  };

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

  // Implement exposed controls for background voice announcements integration (ducking)
  const controls: MusicPlayerControls = {
    pause: () => {
      setIsPlayingState(false);
      if (activeTab === 'youtube') {
        if (webMode === 'stream' && localAudioRef.current) {
          localAudioRef.current.pause();
        } else if (webMode === 'youtube_api' && ytPlayerRef.current && isYtReady) {
          try {
            ytPlayerRef.current.pauseVideo();
          } catch (e) {
            console.error(e);
          }
        }
      } else if (activeTab === 'local' && localAudioRef.current) {
        localAudioRef.current.pause();
      }
    },
    play: () => {
      setIsPlayingState(true);
      if (activeTab === 'youtube') {
        if (webMode === 'stream' && localAudioRef.current) {
          localAudioRef.current.play().catch(e => console.log(e));
        } else if (webMode === 'youtube_api' && ytPlayerRef.current && isYtReady) {
          try {
            ytPlayerRef.current.playVideo();
          } catch (e) {
            console.error(e);
          }
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
      if (activeTab === 'youtube') {
        if (webMode === 'stream' && localAudioRef.current) {
          localAudioRef.current.volume = vol / 100;
        } else if (webMode === 'youtube_api' && ytPlayerRef.current && isYtReady) {
          try {
            ytPlayerRef.current.setVolume(vol);
          } catch (e) {
            // ignore
          }
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

  useImperativeHandle(ref, () => controls);

  useEffect(() => {
    onControlsReady(controls);
    return () => onControlsReady(null);
  }, [activeTab, webMode, isYtReady, localTracks, currentTrackIndex, isPlayingState]);

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
    
    // Auto-restart selected track if we switch to local
    if (tab === 'local' && currentTrackIndex !== -1 && localTracks[currentTrackIndex]) {
      // Delay slightly to allow state to clear
      setTimeout(() => {
        if (localAudioRef.current && isPlayingState) {
          localAudioRef.current.play().catch(e => console.log(e));
        }
      }, 50);
    } else if (tab === 'youtube') {
      setTimeout(() => {
        handleLoadWebUrl(webUrl);
      }, 50);
    }
  };

  const handleSelectPreset = (preset: MusicPreset) => {
    setActivePresetId(preset.id);
    setWebUrl(preset.url);
    handleLoadWebUrl(preset.url);
  };

  return (
    <div id="music-player-container" className="bg-[#0c0c0c] border border-zinc-800 rounded-xl p-5 shadow-lg transition-all duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-zinc-800 pb-3">
        <h2 className="text-base font-black uppercase tracking-tight italic text-white flex items-center gap-2">
          <Music className="w-5 h-5 text-neon" />
          MÚSICA E TRILHA DE FUNDO
        </h2>
        
        {/* Toggle between Web Browser/Radio and Local Files */}
        <div className="flex bg-zinc-900 p-1 rounded-lg text-xs font-bold border border-zinc-800">
          <button
            id="tab-yt"
            onClick={() => selectTab('youtube')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'youtube' ? 'bg-neon text-black font-black uppercase italic shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Navegador & Rádios
          </button>
          <button
            id="tab-local"
            onClick={() => selectTab('local')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'local' ? 'bg-neon text-black font-black uppercase italic shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            Músicas Locais
          </button>
        </div>
      </div>

      {activeTab === 'youtube' ? (
        <div className="space-y-4">
          
          {/* Quick Preset Grid */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                <Compass className="w-3 h-3 text-neon" /> Rádios e Playlists Recomendadas
              </label>
              <span className="text-[9px] font-mono font-bold text-neon bg-neon/10 px-1.5 py-0.5 rounded uppercase">
                Aprovadas p/ Academia
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {MUSIC_PRESETS.map((preset) => {
                const isActive = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`p-2.5 rounded-xl border text-left transition-all flex items-start gap-2.5 cursor-pointer ${
                      isActive
                        ? 'bg-neon/10 border-neon text-white shadow-md'
                        : 'bg-zinc-900/30 border-zinc-850 hover:border-zinc-700 text-zinc-400 hover:bg-zinc-900/70'
                    }`}
                  >
                    <span className="text-xl shrink-0 p-1 bg-zinc-900 border border-zinc-800 rounded-lg">{preset.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase text-white truncate leading-tight">{preset.name}</p>
                      </div>
                      <p className="text-[8px] text-neon uppercase font-black font-mono tracking-wider mt-0.5 leading-none">{preset.genre}</p>
                      <p className="text-[8px] text-zinc-500 line-clamp-1 mt-1 leading-normal">{preset.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Browser Address Bar Input */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Link className="h-4 w-4 text-zinc-500" />
              </div>
              <input
                id="yt-url-input"
                type="text"
                placeholder="Cole o link do YouTube, Spotify, página ou Stream de Rádio..."
                value={webUrl}
                onChange={(e) => {
                  setWebUrl(e.target.value);
                  setActivePresetId(''); // Clear preset highligt since user custom typed
                }}
                className="w-full text-xs border border-zinc-800 rounded-xl pl-9 pr-3 py-2.5 bg-zinc-900 focus:outline-none focus:border-neon focus:ring-1 focus:ring-neon/30 transition-all text-white placeholder-zinc-500 font-bold"
              />
            </div>
            <button
              id="load-yt-btn"
              onClick={() => handleLoadWebUrl(webUrl)}
              className="bg-neon hover:bg-neon-hover text-black px-4 py-2.5 rounded-xl text-xs font-black uppercase italic transition-all shadow-md flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Globe className="w-3.5 h-3.5" />
              CONECTAR
            </button>
          </div>

          {/* Active Player Display Area */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 overflow-hidden shadow-inner p-3">
            
            {/* Stream Mode Layout */}
            {webMode === 'stream' && (
              <div className="flex flex-col items-center justify-center text-center py-7 px-4 bg-zinc-950 rounded-lg border border-zinc-900 animate-fade-in relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(57,255,20,0.02)_0%,transparent_70%)] pointer-events-none" />
                
                {/* Simulated equalizer animation or spinning record */}
                <div className="relative mb-3 flex items-center justify-center">
                  <div className={`w-14 h-14 rounded-full border border-neon/30 flex items-center justify-center bg-zinc-900 shadow-md ${
                    isPlayingState ? 'animate-spin [animation-duration:10s]' : ''
                  }`}>
                    <Radio className="w-6 h-6 text-neon" />
                  </div>
                  {isPlayingState && (
                    <div className="absolute -inset-1.5 rounded-full border border-dashed border-neon/20 animate-pulse"></div>
                  )}
                </div>

                <h3 className="text-xs font-black uppercase text-white tracking-wider flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isPlayingState ? 'bg-neon animate-ping' : 'bg-zinc-600'}`} />
                  RÁDIO DIGITAL CONECTADA
                </h3>
                <p className="text-[9px] text-zinc-500 font-mono font-bold uppercase tracking-widest mt-1 max-w-[340px] truncate">
                  Stream de Áudio: {webUrl}
                </p>
                <div className="flex items-center gap-1 mt-3">
                  <span className="text-[8px] bg-neon/10 border border-neon/20 text-neon px-2 py-0.5 rounded font-black font-mono">
                    NATIVO E ULTRA LEVE
                  </span>
                  <span className="text-[8px] bg-zinc-900 border border-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-black font-mono">
                    CONTROLE DE DUCON ACIONADO
                  </span>
                </div>
              </div>
            )}

            {/* YouTube API Mode Layout */}
            {webMode === 'youtube_api' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Youtube className="w-3.5 h-3.5 text-red-500" /> Player do YouTube Integrado (Embed Mode)
                  </span>
                  <button
                    onClick={() => {
                      if (ytVideoId) initYoutubePlayer(ytVideoId);
                    }}
                    className="text-[8px] text-zinc-400 hover:text-white flex items-center gap-1 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded cursor-pointer transition-all"
                  >
                    <RefreshCw className="w-2.5 h-2.5" /> Recarregar Video
                  </button>
                </div>
                <div className="aspect-video w-full rounded-lg bg-black overflow-hidden border border-zinc-900 relative shadow-inner">
                  <div id={ytContainerId} className="w-full h-full absolute inset-0"></div>
                  {!isYtReady && (
                    <div className="absolute inset-0 bg-black/85 backdrop-blur-xs flex flex-col items-center justify-center text-center p-4 z-10">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-neon border-t-transparent mb-2"></div>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Iniciando reprodutor do YouTube...</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Generic Iframe Mode Layout */}
            {webMode === 'generic_iframe' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1 bg-zinc-900/40 p-1.5 rounded-lg border border-zinc-850">
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-neon" />
                    <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-wider truncate max-w-[200px] sm:max-w-xs">
                      Mini-Browser: {webUrl}
                    </span>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => setIframeKey(prev => prev + 1)}
                      className="text-[8px] text-zinc-400 hover:text-white bg-zinc-950 border border-zinc-800 px-2 py-1 rounded flex items-center gap-1 cursor-pointer transition-all"
                      title="Atualizar Página"
                    >
                      <RefreshCw className="w-2.5 h-2.5" /> Recarregar
                    </button>
                    <button
                      onClick={() => {
                        window.open(resolvedUrl, '_blank');
                      }}
                      className="text-[8px] text-black hover:bg-neon-hover bg-neon border border-neon/20 px-2 py-1 rounded flex items-center gap-1 font-bold uppercase tracking-wider cursor-pointer transition-all"
                    >
                      Abrir Separado
                    </button>
                  </div>
                </div>
                
                {isInputSearch ? (
                  <div className="aspect-video w-full rounded-lg bg-zinc-950 border border-zinc-900 flex flex-col items-center justify-center text-center p-6 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(57,255,20,0.03)_0%,transparent_70%)] pointer-events-none" />
                    <div className="p-3 bg-neon/10 rounded-full text-neon mb-3 animate-bounce">
                      <Compass className="w-6 h-6" />
                    </div>
                    <h4 className="text-xs font-black uppercase text-white tracking-wider">Você digitou um termo de busca</h4>
                    <p className="text-[10px] text-zinc-400 mt-2 max-w-[380px] leading-relaxed">
                      Para tocar músicas, rádios ou playlists, você pode abrir o YouTube ou o Google para buscar, encontrar o link direto e colá-lo acima.
                    </p>
                    <div className="flex flex-wrap gap-2.5 mt-4">
                      <a
                        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(webUrl)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all shadow-md"
                      >
                        <Youtube className="w-3.5 h-3.5" />
                        Pesquisar no YouTube
                      </a>
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(webUrl + " radio online stream mp3")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-2 bg-zinc-850 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all"
                      >
                        <Globe className="w-3.5 h-3.5 text-blue-400" />
                        Pesquisar Rádios Web
                      </a>
                    </div>
                  </div>
                ) : (isBlockedUrl && !isElectron) ? (
                  <div className="aspect-video w-full rounded-lg bg-zinc-950 border border-zinc-900 flex flex-col items-center justify-center text-center p-6 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.03)_0%,transparent_70%)] pointer-events-none" />
                    <div className="p-3 bg-red-500/10 rounded-full text-red-400 mb-3 animate-pulse">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <h4 className="text-xs font-black uppercase text-white tracking-wider">Visualização Interna Restrita</h4>
                    <p className="text-[10px] text-zinc-400 mt-2 max-w-[400px] leading-relaxed">
                      O site <strong className="text-red-400">{webUrl.replace(/^https?:\/\/(www\.)?/, '')}</strong> restringe a exibição dentro de outros apps por segurança (X-Frame-Options). Mas você pode abri-lo diretamente!
                    </p>
                    <div className="flex flex-wrap gap-2.5 mt-4">
                      <button
                        onClick={() => {
                          window.open(resolvedUrl, '_blank');
                        }}
                        className="px-3.5 py-2 bg-neon text-black hover:bg-neon-hover rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all shadow-md shadow-neon/10"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        Abrir Site Separado
                      </button>
                      <button
                        onClick={() => {
                          const defaultPreset = MUSIC_PRESETS[0];
                          handleSelectPreset(defaultPreset);
                        }}
                        className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Voltar para Rádio i9 Fit
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-video w-full rounded-lg bg-black overflow-hidden border border-zinc-900 shadow-inner relative flex items-center justify-center">
                    {isElectron ? (
                      <Webview
                        key={iframeKey}
                        src={resolvedUrl}
                        className="w-full h-full absolute inset-0 bg-zinc-950 border-none"
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        allowpopups="true"
                        title="i9 Web Browser View"
                      />
                    ) : (
                      <iframe
                        key={iframeKey}
                        src={resolvedUrl}
                        className="w-full h-full absolute inset-0 bg-zinc-950 border-none"
                        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                        title="i9 Web Browser View"
                      />
                    )}
                    <div className="absolute bottom-2 left-2 bg-black/80 backdrop-blur-xs px-2 py-1.5 rounded-md border border-zinc-800 text-[8px] text-zinc-400 max-w-[280px] pointer-events-none flex items-start gap-1 z-10">
                      <Info className="w-3 h-3 text-neon shrink-0 mt-0.5" />
                      <span>
                        {isElectron 
                          ? "Navegando de forma nativa e segura no desktop i9 Fit!"
                          : "Caso a música não toque ou a página bloqueie, clique em Abrir Separado ou selecione uma de nossas Rádios Digitais no topo!"
                        }
                      </span>
                    </div>
                  </div>
                )}
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

      {/* Shared Playback Controls Footer Bar */}
      <div className="mt-5 pt-4 border-t border-zinc-800 flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            id="music-play-toggle"
            onClick={togglePlay}
            disabled={activeTab === 'local' && localTracks.length === 0}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 cursor-pointer ${
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
              className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-all shrink-0 cursor-pointer"
              title="Próxima faixa"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          )}

          <div className="text-xs min-w-0 flex-1">
            <p className="font-bold text-zinc-200 truncate">
              {activeTab === 'youtube'
                ? webMode === 'stream' 
                  ? 'Transmissão de Rádio Ativa' 
                  : webMode === 'youtube_api' && isYtReady
                  ? 'Vídeo do YouTube Ativo'
                  : 'Navegador Web Ativo'
                : currentTrackIndex !== -1 && localTracks[currentTrackIndex]
                ? localTracks[currentTrackIndex].name
                : 'Sem faixas locais na fila'}
            </p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono font-bold">
              {isPlayingState ? 'REPRODUZINDO' : 'PAUSADO'}
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
