import { useState, useEffect, useRef, useImperativeHandle, forwardRef, ChangeEvent } from 'react';
import { Play, Pause, Volume2, VolumeX, Youtube, Music, Radio, SkipForward, AlertCircle, Globe, RefreshCw, Link, Compass, Info, ArrowLeft, ArrowRight, Home, Search } from 'lucide-react';

// Check if running inside Electron wrapper - disabled to run strictly as a website
const isElectron = false;

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

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
    YT?: any;
  }
}

const generateRandomString = (length: number): string => {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], '');
};

const generateCodeChallenge = async (codeVerifier: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  const array = Array.from(new Uint8Array(digest));
  const binary = array.map(byte => String.fromCharCode(byte)).join('');
  const base64 = btoa(binary);
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

export const MusicPlayer = forwardRef<MusicPlayerControls, MusicPlayerProps>(({ onControlsReady }, ref) => {
  const [activeTab, setActiveTab] = useState<'youtube' | 'local' | 'spotify'>('spotify'); // spotify is default active tab now
  const [isPlayingState, setIsPlayingState] = useState(false);
  const [volume, setVolume] = useState(100); // 0 to 100
  const [prevVolume, setPrevVolume] = useState(100);

  // Spotify Web SDK Integration States
  const [spotifyToken, setSpotifyToken] = useState<string | null>(localStorage.getItem('spotify_access_token'));
  const [spotifyDeviceId, setSpotifyDeviceId] = useState<string | null>(null);
  const [spotifyPlayer, setSpotifyPlayer] = useState<any>(null);
  const [spotifyIsPlaying, setSpotifyIsPlaying] = useState(false);
  const [spotifyCurrentTrack, setSpotifyCurrentTrack] = useState<any>(null);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);
  const [spotifyAuthLoading, setSpotifyAuthLoading] = useState(false);
  const [spotifyClientId, setSpotifyClientId] = useState<string>(import.meta.env.VITE_SPOTIFY_CLIENT_ID || localStorage.getItem('spotify_client_id') || '');
  const spotifyPlayerInstanceRef = useRef<any>(null);
  const [spotifyEmbedUrl, setSpotifyEmbedUrl] = useState<string>('https://open.spotify.com/embed/playlist/37i9dQZF1DX8U9A6Z0v7vS');

  // Web Browser States
  const [webUrl, setWebUrl] = useState('i9://home'); // Defaults to our customized Web Browser Start Page
  const [resolvedUrl, setResolvedUrl] = useState('i9://home');
  const [webMode, setWebMode] = useState<'stream' | 'youtube_api' | 'generic_iframe'>('generic_iframe');
  const [activePresetId, setActivePresetId] = useState<string>('');
  const [iframeKey, setIframeKey] = useState(0); // For reloading the iframe
  const [isIframeSuspended, setIsIframeSuspended] = useState(false);

  const webviewRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Ref callback to bind navigation state events in Electron's <webview>
  const webviewCallbackRef = (node: any) => {
    if (node) {
      webviewRef.current = node;
      
      const handleNavigate = (e: any) => {
        if (e.url) {
          setWebUrl(e.url);
          setResolvedUrl(e.url);
        }
      };
      
      // did-navigate covers normal link navigation
      node.addEventListener('did-navigate', handleNavigate);
      // did-navigate-in-page covers single page app (SPA) client-side routing like YouTube searches
      node.addEventListener('did-navigate-in-page', handleNavigate);

      // dom-ready triggers when webview content loads, ensuring sync of volume and play states (Error 153 bypass)
      node.addEventListener('dom-ready', () => {
        try {
          node.executeJavaScript(`
            document.querySelectorAll("video, audio").forEach(el => {
              el.volume = ${volume / 100};
              ${isPlayingState ? 'el.play().catch(() => {});' : 'el.pause();'}
            });
          `);
        } catch (e) {
          console.error('Webview DOM Ready init error:', e);
        }
      });
    }
  };

  // Back/Forward/Home/Reload Navigation Helpers
  const handleGoBack = () => {
    if (isElectron && webviewRef.current) {
      try {
        if (webviewRef.current.canGoBack()) {
          webviewRef.current.goBack();
        }
      } catch (e) {
        console.error('Webview back error:', e);
      }
    }
  };

  const handleGoForward = () => {
    if (isElectron && webviewRef.current) {
      try {
        if (webviewRef.current.canGoForward()) {
          webviewRef.current.goForward();
        }
      } catch (e) {
        console.error('Webview forward error:', e);
      }
    }
  };

  const handleHome = () => {
    const homeUrl = 'i9://home';
    setWebUrl(homeUrl);
    handleLoadWebUrl(homeUrl);
  };

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
      if (val.startsWith('i9://')) return false;
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
          if (clean.startsWith('i9://')) {
            return false;
          }
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
            const path = url.pathname;
            if (path.startsWith('/embed') || 
                path.startsWith('/track/') || 
                path.startsWith('/playlist/') || 
                path.startsWith('/album/') || 
                path.startsWith('/artist/') || 
                path.startsWith('/episode/') || 
                path.startsWith('/show/')) {
              return false;
            }
            return true;
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
    if (!clean) return { url: 'i9://home', mode: 'generic_iframe' };

    if (clean === 'i9://home' || clean === 'i9://' || clean === 'home') {
      return { url: 'i9://home', mode: 'generic_iframe' };
    }

    // Default to https if no protocol specified
    if (!/^https?:\/\//i.test(clean) && !clean.startsWith('i9://')) {
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
            url: `https://www.youtube.com/embed/videoseries?list=${playlistId}&autoplay=1&enablejsapi=1`,
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
            mode: isElectron ? 'generic_iframe' : 'youtube_api',
            ytid: videoId
          };
        }
      }

      // YouTube Embed URL matching
      if (parsed.hostname.includes('youtube.com') && parsed.pathname.startsWith('/embed/')) {
        const videoId = parsed.pathname.split('/')[2];
        return {
          url: clean,
          mode: isElectron ? 'generic_iframe' : 'youtube_api',
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
    if (spotifyPlayerInstanceRef.current) {
      try {
        spotifyPlayerInstanceRef.current.pause();
      } catch (e) {
        console.error('Failed to pause Spotify on stopAllAudio:', e);
      }
    }
  };

  // Spotify Auth Redirect & Message Handlers
  const handleSpotifyConnect = async () => {
    if (!spotifyClientId) {
      setSpotifyError('Client ID do Spotify não configurado. Por favor, adicione-o no campo abaixo.');
      return;
    }

    setSpotifyAuthLoading(true);
    setSpotifyError(null);

    const redirectUri = `${window.location.origin}/spotify-callback.html`;
    const scopes = [
      'streaming',
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-email',
      'user-read-private'
    ].join(' ');

    try {
      // PKCE Code Flow logic
      const codeVerifier = generateRandomString(64);
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      // Save both in localStorage for use by the callback page
      localStorage.setItem('spotify_code_verifier', codeVerifier);
      localStorage.setItem('spotify_client_id', spotifyClientId);

      const authUrl = `https://accounts.spotify.com/authorize?client_id=${spotifyClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&code_challenge_method=S256&code_challenge=${codeChallenge}&show_dialog=true`;

      const width = 500;
      const height = 650;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const popup = window.open(
        authUrl,
        'SpotifyLogin',
        `menubar=no,location=no,resizable=no,scrollbars=yes,status=no,width=${width},height=${height},top=${top},left=${left}`
      );

      if (!popup) {
        setSpotifyAuthLoading(false);
        alert('Por favor, permita popups para este site para conectar o Spotify.');
      }
    } catch (err: any) {
      setSpotifyError(`Erro ao iniciar autenticação: ${err.message || err}`);
      setSpotifyAuthLoading(false);
    }
  };

  const handleSpotifyDisconnect = () => {
    if (spotifyPlayerInstanceRef.current) {
      try {
        spotifyPlayerInstanceRef.current.disconnect();
      } catch (e) {
        // ignore
      }
      spotifyPlayerInstanceRef.current = null;
    }
    setSpotifyToken(null);
    setSpotifyDeviceId(null);
    setSpotifyPlayer(null);
    setSpotifyIsPlaying(false);
    setSpotifyCurrentTrack(null);
    setSpotifyError(null);
    localStorage.removeItem('spotify_access_token');
  };

  const handleResetClientId = () => {
    handleSpotifyDisconnect();
    setSpotifyClientId('');
    localStorage.removeItem('spotify_client_id');
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data?.type === 'SPOTIFY_AUTH_SUCCESS') {
        const token = event.data.token;
        setSpotifyToken(token);
        localStorage.setItem('spotify_access_token', token);
        setSpotifyAuthLoading(false);
        setSpotifyError(null);
      } else if (event.data?.type === 'SPOTIFY_AUTH_ERROR') {
        setSpotifyError(`Erro de autenticação: ${event.data.error}`);
        setSpotifyAuthLoading(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Initialize Spotify Web Playback SDK
  useEffect(() => {
    if (!spotifyToken) {
      if (spotifyPlayerInstanceRef.current) {
        try {
          spotifyPlayerInstanceRef.current.disconnect();
        } catch (e) {}
        spotifyPlayerInstanceRef.current = null;
        setSpotifyPlayer(null);
        setSpotifyDeviceId(null);
      }
      return;
    }

    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify.Player({
        name: 'i9 Fit Gym Web Player',
        getOAuthToken: (cb: any) => cb(spotifyToken),
        volume: volume / 100
      });

      player.addListener('ready', ({ device_id }: any) => {
        console.log('Spotify SDK Ready with Device ID', device_id);
        setSpotifyDeviceId(device_id);
        setSpotifyError(null);
      });

      player.addListener('not_ready', ({ device_id }: any) => {
        console.log('Spotify Device has gone offline', device_id);
        setSpotifyDeviceId(null);
      });

      player.addListener('initialization_error', ({ message }: any) => {
        console.error('Spotify Init Error:', message);
        setSpotifyError(`Erro de Inicialização: ${message}`);
      });

      player.addListener('authentication_error', ({ message }: any) => {
        console.error('Spotify Auth Error:', message);
        setSpotifyError('Sua sessão expirou. Conecte sua conta novamente.');
        handleSpotifyDisconnect();
      });

      player.addListener('account_error', ({ message }: any) => {
        console.error('Spotify Account Error:', message);
        setSpotifyError('O Spotify Web SDK exige Spotify Premium. Fallback para tocador padrão ativo.');
      });

      player.addListener('player_state_changed', (state: any) => {
        if (!state) return;
        setSpotifyIsPlaying(!state.paused);
        setSpotifyCurrentTrack(state.track_window.current_track);
        if (activeTab === 'spotify') {
          setIsPlayingState(!state.paused);
        }
      });

      player.connect().then((success: boolean) => {
        if (success) {
          console.log('Connected to Spotify Web Playback SDK!');
        }
      });

      spotifyPlayerInstanceRef.current = player;
      setSpotifyPlayer(player);
    };

    if (!window.Spotify) {
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      document.body.appendChild(script);
    } else {
      if (window.onSpotifyWebPlaybackSDKReady) {
        window.onSpotifyWebPlaybackSDKReady();
      }
    }
  }, [spotifyToken]);

  const playSpotifyUri = async (uri: string) => {
    const isPremiumError = spotifyError && (spotifyError.includes('Premium') || spotifyError.includes('Web SDK'));

    if (!spotifyToken || !spotifyDeviceId || isPremiumError) {
      console.log('Spotify SDK or device not ready, playing fallback URL in iframe.');
      // Extract track or playlist ID to show in general iframe
      const parts = uri.split(':');
      if (parts.length >= 3) {
        const type = parts[1];
        const id = parts[2];
        const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
        setResolvedUrl(embedUrl);
        setWebMode('generic_iframe');
        setWebUrl(embedUrl);
        setSpotifyEmbedUrl(embedUrl);
        setIframeKey(prev => prev + 1);
        setIsPlayingState(true);
      }
      return;
    }

    const body: any = {};
    if (uri.startsWith('spotify:track:')) {
      body.uris = [uri];
    } else {
      body.context_uri = uri;
    }

    try {
      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${spotifyDeviceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${spotifyToken}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error('Spotify Playback Request failed:', errData);
        if (response.status === 403) {
          setSpotifyError('O Spotify Web SDK exige Spotify Premium para iniciar reprodução direta.');
        } else {
          setSpotifyError(`Erro Spotify: ${errData.error?.message || 'Falha ao tocar no player.'}`);
        }
      } else {
        setSpotifyError(null);
        setIsPlayingState(true);
      }
    } catch (err) {
      console.error('Failed playing Spotify:', err);
      setSpotifyError('Erro de conexão ao iniciar faixa do Spotify.');
    }
  };

  const getSpotifyUriFromUrl = (urlStr: string): string | null => {
    try {
      const url = new URL(urlStr);
      if (!url.hostname.includes('spotify.com')) return null;
      
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const type = parts[0];
        const id = parts[1];
        return `spotify:${type}:${id}`;
      }
    } catch (e) {}
    return null;
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
    } else if (activeTab === 'spotify' && spotifyPlayerInstanceRef.current) {
      try {
        spotifyPlayerInstanceRef.current.setVolume(volume / 100);
      } catch (e) {
        console.error('Failed to set Spotify volume:', e);
      }
    }
  }, [volume, activeTab, webMode, isYtReady, spotifyPlayer]);

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
        } else if (webMode === 'generic_iframe') {
          if (isElectron && webviewRef.current) {
            try {
              webviewRef.current.setAudioMuted(true);
              webviewRef.current.executeJavaScript('document.querySelectorAll("video, audio").forEach(el => el.pause())');
            } catch (e) {
              console.error('Webview pause error:', e);
            }
          } else {
            // Check if it's YouTube, then we can use postMessage
            if (resolvedUrl.includes('youtube.com') || resolvedUrl.includes('youtu.be')) {
              if (iframeRef.current && iframeRef.current.contentWindow) {
                try {
                  iframeRef.current.contentWindow.postMessage(JSON.stringify({
                    event: 'command',
                    func: 'pauseVideo',
                    args: []
                  }), '*');
                } catch (e) {
                  console.error('Iframe postMessage pause error:', e);
                }
              }
            } else if (resolvedUrl !== 'i9://home' && resolvedUrl !== 'about:blank') {
              // Non-YouTube cross-origin iframe: suspend immediately to about:blank to force-silence any sound
              setIsIframeSuspended(true);
            }
          }
        }
      } else if (activeTab === 'local' && localAudioRef.current) {
        localAudioRef.current.pause();
      } else if (activeTab === 'spotify') {
        if (spotifyPlayerInstanceRef.current) {
          try {
            spotifyPlayerInstanceRef.current.pause();
          } catch (e) {
            console.error('Failed to pause Spotify in controls:', e);
          }
        }
      }
    },
    play: () => {
      setIsPlayingState(true);
      setIsIframeSuspended(false);

      if (activeTab === 'youtube') {
        if (webMode === 'stream' && localAudioRef.current) {
          localAudioRef.current.play().catch(e => console.log(e));
        } else if (webMode === 'youtube_api' && ytPlayerRef.current && isYtReady) {
          try {
            ytPlayerRef.current.playVideo();
          } catch (e) {
            console.error(e);
          }
        } else if (webMode === 'generic_iframe') {
          if (isElectron && webviewRef.current) {
            try {
              webviewRef.current.setAudioMuted(false);
              webviewRef.current.executeJavaScript('document.querySelectorAll("video, audio").forEach(el => el.play())');
            } catch (e) {
              console.error('Webview play error:', e);
            }
          } else {
            if (resolvedUrl.includes('youtube.com') || resolvedUrl.includes('youtu.be')) {
              if (iframeRef.current && iframeRef.current.contentWindow) {
                try {
                  iframeRef.current.contentWindow.postMessage(JSON.stringify({
                    event: 'command',
                    func: 'playVideo',
                    args: []
                  }), '*');
                } catch (e) {
                  console.error('Iframe postMessage play error:', e);
                }
              }
            }
          }
        }
      } else if (activeTab === 'local' && localTracks.length > 0) {
        if (currentTrackIndex === -1) {
          setCurrentTrackIndex(0);
        } else if (localAudioRef.current) {
          localAudioRef.current.play().catch(e => console.log(e));
        }
      } else if (activeTab === 'spotify') {
        if (spotifyPlayerInstanceRef.current) {
          try {
            spotifyPlayerInstanceRef.current.resume();
          } catch (e) {
            console.error('Failed to resume Spotify in controls:', e);
          }
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
        } else if (webMode === 'generic_iframe') {
          if (isElectron && webviewRef.current) {
            try {
              webviewRef.current.executeJavaScript(`document.querySelectorAll("video, audio").forEach(el => el.volume = ${vol / 100})`);
            } catch (e) {
              console.error('Webview volume error:', e);
            }
          } else {
            if (resolvedUrl.includes('youtube.com') || resolvedUrl.includes('youtu.be')) {
              if (iframeRef.current && iframeRef.current.contentWindow) {
                try {
                  iframeRef.current.contentWindow.postMessage(JSON.stringify({
                    event: 'command',
                    func: 'setVolume',
                    args: [vol]
                  }), '*');
                } catch (e) {
                  console.error('Iframe postMessage volume error:', e);
                }
              }
            }
          }
        }
      } else if (activeTab === 'local' && localAudioRef.current) {
        localAudioRef.current.volume = vol / 100;
      } else if (activeTab === 'spotify') {
        if (spotifyPlayerInstanceRef.current) {
          try {
            spotifyPlayerInstanceRef.current.setVolume(vol / 100);
          } catch (e) {
            console.error('Failed to set Spotify volume in controls:', e);
          }
        }
      }
    },
    getVolume: () => {
      return currentVolumeRef.current;
    },
    isPlaying: () => {
      if (activeTab === 'youtube' && webMode === 'generic_iframe' && resolvedUrl !== 'i9://home' && resolvedUrl !== 'about:blank' && !isIframeSuspended) {
        return true;
      }
      if (activeTab === 'spotify') {
        return spotifyIsPlaying;
      }
      return isPlayingState;
    },
  };

  useImperativeHandle(ref, () => controls);

  useEffect(() => {
    onControlsReady(controls);
    return () => onControlsReady(null);
  }, [activeTab, webMode, isYtReady, localTracks, currentTrackIndex, isPlayingState, spotifyIsPlaying, spotifyDeviceId, spotifyToken]);

  const togglePlay = () => {
    if (isPlayingState) {
      controls.pause();
    } else {
      controls.play();
    }
  };

  const selectTab = (tab: 'youtube' | 'local' | 'spotify') => {
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
    } else if (tab === 'spotify') {
      // Auto-resume if we have active Spotify device and were playing
      setTimeout(() => {
        if (spotifyPlayerInstanceRef.current && isPlayingState) {
          spotifyPlayerInstanceRef.current.resume().catch((e: any) => console.log(e));
        }
      }, 50);
    }
  };

  return (
    <div id="music-player-container" className="bg-[#0c0c0c] border border-zinc-800 rounded-xl p-5 shadow-lg transition-all duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-zinc-800 pb-3">
        <h2 className="text-base font-black uppercase tracking-tight italic text-white flex items-center gap-2">
          <Music className="w-5 h-5 text-neon" />
          MÚSICA E TRILHA DE FUNDO
        </h2>
        
        {/* Toggle between Web Browser, Local Files, and Spotify */}
        <div className="flex bg-zinc-900 p-1 rounded-lg text-xs font-bold border border-zinc-800 gap-1 flex-wrap">
          <button
            id="tab-spotify"
            onClick={() => selectTab('spotify')}
            className={`px-2.5 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'spotify' ? 'bg-[#1DB954] text-black font-black uppercase italic shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Music className="w-3.5 h-3.5 text-current" />
            Spotify
          </button>
          <button
            id="tab-yt"
            onClick={() => selectTab('youtube')}
            className={`px-2.5 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'youtube' ? 'bg-neon text-black font-black uppercase italic shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Navegador Web
          </button>
          <button
            id="tab-local"
            onClick={() => selectTab('local')}
            className={`px-2.5 py-1.5 rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${
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
          
          {/* Custom Web Browser Toolbar (Opera/Firefox-style) */}
          <div className="flex flex-col gap-2 bg-zinc-900/40 p-3 rounded-xl border border-zinc-800 animate-fade-in">
            <div className="flex items-center gap-2 flex-wrap md:flex-nowrap">
              
              {/* Navigation Controls */}
              <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-850 shrink-0">
                <button
                  onClick={handleGoBack}
                  disabled={!isElectron}
                  className={`p-1.5 rounded-md transition-all ${
                    isElectron 
                      ? 'text-zinc-300 hover:text-white hover:bg-zinc-800 cursor-pointer' 
                      : 'text-zinc-600 cursor-not-allowed'
                  }`}
                  title={isElectron ? "Voltar Página" : "Voltar (Disponível apenas no App de Desktop)"}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleGoForward}
                  disabled={!isElectron}
                  className={`p-1.5 rounded-md transition-all ${
                    isElectron 
                      ? 'text-zinc-300 hover:text-white hover:bg-zinc-800 cursor-pointer' 
                      : 'text-zinc-600 cursor-not-allowed'
                  }`}
                  title={isElectron ? "Avançar Página" : "Avançar (Disponível apenas no App de Desktop)"}
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (isElectron && webviewRef.current) {
                      try {
                        webviewRef.current.reload();
                      } catch (e) {
                        setIframeKey(prev => prev + 1);
                      }
                    } else {
                      setIframeKey(prev => prev + 1);
                    }
                  }}
                  className="p-1.5 rounded-md text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
                  title="Recarregar"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleHome}
                  className="p-1.5 rounded-md text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
                  title="Página Inicial (YouTube)"
                >
                  <Home className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Address Input & SSL Indicator */}
              <div className="relative flex-1 min-w-[200px]">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Globe className="h-3.5 w-3.5 text-zinc-500" />
                </div>
                <input
                  id="yt-url-input"
                  type="text"
                  placeholder="Pesquise no Google, cole link do YouTube (youtube.com) ou Spotify (open.spotify.com)..."
                  value={webUrl}
                  onChange={(e) => setWebUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleLoadWebUrl(webUrl);
                    }
                  }}
                  className="w-full text-xs border border-zinc-800 rounded-xl pl-9 pr-20 py-2 bg-zinc-950 focus:outline-none focus:border-neon focus:ring-1 focus:ring-neon/30 transition-all text-white placeholder-zinc-500 font-medium"
                />
                
                {/* SSL Secure Connection Badge */}
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                  <span className="text-[8px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold tracking-wider">
                    SECURE
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  id="load-yt-btn"
                  onClick={() => handleLoadWebUrl(webUrl)}
                  className="bg-neon hover:bg-neon-hover text-black px-3.5 py-2 rounded-xl text-xs font-black uppercase italic transition-all shadow-md flex items-center gap-1 cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5" />
                  IR
                </button>
                <button
                  onClick={() => {
                    window.open(resolvedUrl, '_blank');
                  }}
                  className="bg-zinc-850 hover:bg-zinc-800 text-zinc-300 border border-zinc-750 px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Abrir em Nova Aba"
                >
                  <Globe className="w-3.5 h-3.5" />
                  ABRIR ABA
                </button>
              </div>

            </div>

            <p className="text-[9px] text-zinc-500 px-1 flex items-center gap-1.5">
              <Info className="w-3 h-3 text-neon" />
              Você pode pesquisar diretamente digitando termos de busca ou colar qualquer link do YouTube, Spotify ou rádio!
            </p>
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
                ) : (resolvedUrl === 'i9://home' && !isElectron) ? (
                  <div className="w-full rounded-lg bg-zinc-950 border border-zinc-900 p-6 flex flex-col justify-between relative overflow-hidden min-h-[360px] md:min-h-[420px] max-h-[500px] overflow-y-auto scrollbar-thin">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(0,255,102,0.03)_0%,transparent_70%)] pointer-events-none" />
                    
                    {/* Header Banner */}
                    <div className="text-center md:text-left mb-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-900 pb-4">
                        <div>
                          <h4 className="text-sm font-black uppercase text-white tracking-wider flex items-center gap-2 justify-center md:justify-start">
                            <span className="text-neon animate-pulse">●</span> Portal i9 Web Connect
                          </h4>
                          <p className="text-[10px] text-zinc-500 mt-1 uppercase font-mono tracking-wider">
                            Otimizado para som ambiente e playlists de alta performance na sua academia
                          </p>
                        </div>
                        <span className="text-[9px] bg-neon/15 border border-neon/30 text-neon px-2.5 py-1 rounded font-bold uppercase tracking-wider self-center">
                          Navegador Integrado
                        </span>
                      </div>
                    </div>

                    {/* Main Actions Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
                      
                      {/* Left: How to Play Instructions */}
                      <div className="bg-zinc-900/40 border border-zinc-850 p-4 rounded-xl flex flex-col justify-between">
                        <div>
                          <h5 className="text-[10px] font-black uppercase text-white tracking-wider flex items-center gap-1.5 mb-2.5">
                            <Info className="w-3.5 h-3.5 text-neon" /> Como reproduzir músicas aqui:
                          </h5>
                          <ul className="space-y-2 text-[10px] text-zinc-400 font-medium">
                            <li className="flex gap-2">
                              <span className="text-neon font-black shrink-0">1.</span>
                              <span>Abra o YouTube em uma nova aba para pesquisar a trilha sonora ou playlist ideal.</span>
                            </li>
                            <li className="flex gap-2">
                              <span className="text-neon font-black shrink-0">2.</span>
                              <span>Copie o link da barra de endereços (ex: <code className="text-zinc-300 font-mono">youtube.com/watch?v=...</code>).</span>
                            </li>
                            <li className="flex gap-2">
                              <span className="text-neon font-black shrink-0">3.</span>
                              <span>Cole o link na nossa barra acima e clique em <strong className="text-neon font-black uppercase italic">IR</strong>.</span>
                            </li>
                            <li className="flex gap-2">
                              <span className="text-neon font-black shrink-0">4.</span>
                              <span>Pronto! O reprodutor inteligente tocará a música continuamente sem interrupções!</span>
                            </li>
                          </ul>
                        </div>
                        <div className="mt-4 pt-3 border-t border-zinc-850 text-[9px] text-zinc-500 flex items-center gap-1.5">
                          <span>💡 Suporta links de vídeos individuais, transmissões ao vivo e playlists completas!</span>
                        </div>
                      </div>

                      {/* Right: Quick Access External Hub */}
                      <div className="bg-zinc-900/40 border border-zinc-850 p-4 rounded-xl flex flex-col justify-between">
                        <div>
                          <h5 className="text-[10px] font-black uppercase text-white tracking-wider flex items-center gap-1.5 mb-3">
                            <Compass className="w-3.5 h-3.5 text-neon" /> Atalhos Rápidos (Nova Aba):
                          </h5>
                          <div className="grid grid-cols-2 gap-2">
                            <a
                              href="https://www.youtube.com"
                              target="_blank"
                              rel="noreferrer"
                              className="p-2.5 rounded-lg bg-red-600/10 border border-red-600/20 hover:border-red-500/50 hover:bg-red-600/20 text-white transition-all text-center flex flex-col items-center gap-1 group"
                            >
                              <Youtube className="w-5 h-5 text-red-500 group-hover:scale-110 transition-transform" />
                              <span className="text-[9px] font-black uppercase tracking-wider">Abrir YouTube</span>
                            </a>
                            <a
                              href="https://open.spotify.com"
                              target="_blank"
                              rel="noreferrer"
                              className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:border-emerald-500/50 hover:bg-emerald-500/20 text-white transition-all text-center flex flex-col items-center gap-1 group"
                            >
                              <Music className="w-5 h-5 text-emerald-500 group-hover:scale-110 transition-transform" />
                              <span className="text-[9px] font-black uppercase tracking-wider">Abrir Spotify</span>
                            </a>
                          </div>
                        </div>
                        <p className="text-[8px] text-zinc-500 mt-3 leading-normal">
                          * Sites como YouTube e Spotify bloqueiam a exibição da página inicial dentro de outros aplicativos web por questões de segurança (X-Frame-Options). Porém, ao colar links diretos de músicas ou vídeos acima, o i9 Fit contorna o bloqueio e carrega o tocador perfeitamente!
                        </p>
                      </div>

                    </div>

                    {/* Bottom: Speed Dial of Gym Playlists */}
                    <div className="border-t border-zinc-900 pt-4 space-y-4">
                      <div>
                        <h5 className="text-[10px] font-black uppercase text-zinc-400 tracking-wider mb-2 flex items-center gap-1.5">
                          <Youtube className="w-3.5 h-3.5 text-red-500" /> Playlists de Treino (YouTube)
                        </h5>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setWebUrl('https://www.youtube.com/watch?v=jfKfPfyJRdk');
                              handleLoadWebUrl('https://www.youtube.com/watch?v=jfKfPfyJRdk');
                            }}
                            className="p-2 bg-zinc-900 border border-zinc-850 hover:border-neon rounded-lg text-left transition-all cursor-pointer flex items-center gap-2 group"
                          >
                            <span className="text-base">🧘</span>
                            <div className="min-w-0">
                              <p className="text-[9px] font-bold text-white uppercase group-hover:text-neon transition-colors">Gym Lofi Relax</p>
                              <p className="text-[8px] text-zinc-500">Foco & Alongamentos</p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setWebUrl('https://www.youtube.com/watch?v=n93D-I0SAb4');
                              handleLoadWebUrl('https://www.youtube.com/watch?v=n93D-I0SAb4');
                            }}
                            className="p-2 bg-zinc-900 border border-zinc-850 hover:border-neon rounded-lg text-left transition-all cursor-pointer flex items-center gap-2 group"
                          >
                            <span className="text-base">☠️</span>
                            <div className="min-w-0">
                              <p className="text-[9px] font-bold text-white uppercase group-hover:text-neon transition-colors">Gym Phonk Workout</p>
                              <p className="text-[8px] text-zinc-500">Foco Extremo & Pesos</p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setWebUrl('https://www.youtube.com/watch?v=4xDzrJKXOOY');
                              handleLoadWebUrl('https://www.youtube.com/watch?v=4xDzrJKXOOY');
                            }}
                            className="p-2 bg-zinc-900 border border-zinc-850 hover:border-neon rounded-lg text-left transition-all cursor-pointer flex items-center gap-2 group"
                          >
                            <span className="text-base">👾</span>
                            <div className="min-w-0">
                              <p className="text-[9px] font-bold text-white uppercase group-hover:text-neon transition-colors">Synthwave Gym</p>
                              <p className="text-[8px] text-zinc-500">Energia Eletrônica Retro</p>
                            </div>
                          </button>
                        </div>
                      </div>

                      <div>
                        <h5 className="text-[10px] font-black uppercase text-zinc-400 tracking-wider mb-2 flex items-center gap-1.5">
                          <Music className="w-3.5 h-3.5 text-emerald-500" /> Playlists de Treino (Spotify)
                        </h5>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setWebUrl('https://open.spotify.com/playlist/37i9dQZF1DX76t638V698y');
                              handleLoadWebUrl('https://open.spotify.com/playlist/37i9dQZF1DX76t638V698y');
                            }}
                            className="p-2 bg-zinc-900 border border-zinc-850 hover:border-neon rounded-lg text-left transition-all cursor-pointer flex items-center gap-2 group"
                          >
                            <span className="text-base">🦁</span>
                            <div className="min-w-0">
                              <p className="text-[9px] font-bold text-white uppercase group-hover:text-neon transition-colors">Beast Mode</p>
                              <p className="text-[8px] text-zinc-500">Motivação & Força Máxima</p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setWebUrl('https://open.spotify.com/playlist/37i9dQZF1DX72D76dfYg93');
                              handleLoadWebUrl('https://open.spotify.com/playlist/37i9dQZF1DX72D76dfYg93');
                            }}
                            className="p-2 bg-zinc-900 border border-zinc-850 hover:border-neon rounded-lg text-left transition-all cursor-pointer flex items-center gap-2 group"
                          >
                            <span className="text-base">⚡</span>
                            <div className="min-w-0">
                              <p className="text-[9px] font-bold text-white uppercase group-hover:text-neon transition-colors">Workout Beats</p>
                              <p className="text-[8px] text-zinc-500">Batidas Eletrônicas Intensas</p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setWebUrl('https://open.spotify.com/playlist/37i9dQZF1DX0hZ8NgeYmC4');
                              handleLoadWebUrl('https://open.spotify.com/playlist/37i9dQZF1DX0hZ8NgeYmC4');
                            }}
                            className="p-2 bg-zinc-900 border border-zinc-850 hover:border-neon rounded-lg text-left transition-all cursor-pointer flex items-center gap-2 group"
                          >
                            <span className="text-base">💥</span>
                            <div className="min-w-0">
                              <p className="text-[9px] font-bold text-white uppercase group-hover:text-neon transition-colors">Power Hour</p>
                              <p className="text-[8px] text-zinc-500">Energia Máxima para Cardio</p>
                            </div>
                          </button>
                        </div>
                      </div>
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
                          setWebUrl('i9://home');
                          handleLoadWebUrl('i9://home');
                        }}
                        className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all"
                      >
                        <Home className="w-3.5 h-3.5 text-zinc-400" />
                        Ir para Página Inicial
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-video w-full rounded-lg bg-black overflow-hidden border border-zinc-900 shadow-inner relative flex items-center justify-center">
                    {isElectron ? (
                      <Webview
                        ref={webviewCallbackRef}
                        key={iframeKey}
                        src={resolvedUrl}
                        className="w-full h-full absolute inset-0 bg-zinc-950 border-none"
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        allowpopups="true"
                        title="i9 Web Browser View"
                        useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                        httpreferrer="https://www.youtube.com/"
                      />
                    ) : (
                      <iframe
                        ref={iframeRef}
                        key={iframeKey}
                        src={isIframeSuspended ? 'about:blank' : resolvedUrl}
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
      ) : activeTab === 'local' ? (
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
      ) : (
        /* Spotify Tab Panel */
        <div className="space-y-4 animate-fade-in">
          {!spotifyToken ? (
            <div className="bg-zinc-950/40 p-6 rounded-xl border border-zinc-800 text-center space-y-4">
              <div className="p-3 bg-[#1DB954]/10 rounded-full text-[#1DB954] w-fit mx-auto">
                <Music className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Conecte sua conta Spotify</h3>
                <p className="text-[11px] text-zinc-400 max-w-sm mx-auto leading-relaxed">
                  Toque suas playlists favoritas de treino diretamente no player do i9 Fit com suporte a transições suaves e diminuição de volume automática (ducking).
                </p>
              </div>

              {spotifyError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] text-red-400 max-w-xs mx-auto font-mono">
                  {spotifyError}
                </div>
              )}

              {!spotifyClientId ? (
                <div className="space-y-3 max-w-xs mx-auto bg-zinc-950 p-4 rounded-xl border border-zinc-900 text-left">
                  <h4 className="text-[10px] font-black uppercase text-[#1DB954] tracking-wider">Configurar Client ID</h4>
                  <p className="text-[9px] text-zinc-400 leading-normal">
                    Como você está usando o app no Render ou não configurou as variáveis de ambiente, cole o seu <strong>Spotify Client ID</strong> abaixo para ativar a conexão:
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const input = form.elements.namedItem('clientIdInput') as HTMLInputElement;
                      if (input && input.value.trim()) {
                        const val = input.value.trim();
                        setSpotifyClientId(val);
                        localStorage.setItem('spotify_client_id', val);
                        setSpotifyError(null);
                      }
                    }}
                    className="space-y-2"
                  >
                    <input
                      name="clientIdInput"
                      type="text"
                      placeholder="Cole seu Client ID aqui..."
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-[11px] text-zinc-200 focus:outline-hidden focus:border-[#1DB954] transition-all font-mono"
                      required
                    />
                    <button
                      type="submit"
                      className="w-full py-1.5 bg-[#1DB954] hover:bg-[#1ed760] text-black font-black uppercase text-[9px] rounded-lg cursor-pointer transition-all tracking-wider"
                    >
                      Salvar e Prosseguir
                    </button>
                  </form>
                  <div className="text-[8px] text-zinc-500 leading-normal mt-1">
                    Crie um aplicativo no <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" className="text-[#1DB954] underline hover:text-[#1ed760] transition-colors">Spotify Developer Dashboard</a> com o URI de redirecionamento:
                    <div className="bg-zinc-900 p-1.5 rounded mt-1 font-mono text-[8px] break-all select-all text-zinc-300">
                      {window.location.origin}/spotify-callback.html
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={handleSpotifyConnect}
                    disabled={spotifyAuthLoading}
                    className="mx-auto px-5 py-2.5 bg-[#1DB954] text-black hover:bg-[#1ed760] disabled:bg-zinc-700 disabled:text-zinc-500 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 cursor-pointer transition-all shadow-md shadow-[#1DB954]/10"
                  >
                    {spotifyAuthLoading ? (
                      <span>Conectando...</span>
                    ) : (
                      <>
                        <Globe className="w-4 h-4 fill-current" />
                        CONECTAR SPOTIFY
                      </>
                    )}
                  </button>

                  <div className="max-w-xs mx-auto bg-zinc-950 p-3 rounded-lg border border-zinc-900 text-[10px] text-zinc-400 text-left space-y-1.5 mt-2">
                    <p className="font-bold text-[#1DB954] text-[9px] uppercase tracking-wider">Atenção ao Redirect URI!</p>
                    <p className="text-[9px] leading-normal">
                      Se você ver o erro de <strong>redirect_uri: Not matching configuration</strong>, acesse o <strong>Settings</strong> do seu aplicativo no Dashboard do Spotify e adicione EXATAMENTE o seguinte link na lista de Redirect URIs:
                    </p>
                    <div className="bg-zinc-900 p-1.5 rounded font-mono text-[8px] break-all select-all text-zinc-200 border border-zinc-800">
                      {window.location.origin}/spotify-callback.html
                    </div>
                    <p className="text-[8px] text-zinc-500">
                      Não se esqueça de clicar em <strong>Add</strong> e depois em <strong>Save</strong> no final da página do Spotify!
                    </p>
                  </div>

                  <div className="flex justify-center">
                    <button
                      onClick={handleResetClientId}
                      className="text-[9px] text-zinc-500 hover:text-zinc-350 hover:underline cursor-pointer transition-colors"
                    >
                      Alterar Client ID do Spotify
                    </button>
                  </div>
                </div>
              )}
              
              <div className="text-[9px] text-zinc-500 max-w-xs mx-auto">
                Nota: O Spotify exige uma conta <strong>Premium</strong> para reprodução direta pelo SDK na Web.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Spotify Player Status Bar */}
              <div className="flex items-center justify-between bg-zinc-950 p-3 rounded-xl border border-zinc-900 text-xs gap-2 flex-wrap sm:flex-nowrap">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${spotifyDeviceId ? 'bg-[#1DB954] animate-pulse' : (spotifyError && (spotifyError.includes('Premium') || spotifyError.includes('Web SDK'))) ? 'bg-cyan-500 animate-pulse' : 'bg-amber-500'}`} />
                  <span className="font-bold text-zinc-300">
                    {spotifyDeviceId 
                      ? 'i9 Fit Gym Web Player (Pronto)' 
                      : (spotifyError && (spotifyError.includes('Premium') || spotifyError.includes('Web SDK')))
                        ? 'Spotify Player (Modo Embed - Conta Free)'
                        : 'Conectando dispositivo...'}
                  </span>
                </div>
                <div className="flex gap-3 shrink-0">
                  <button
                    onClick={handleResetClientId}
                    className="text-[10px] uppercase font-bold text-zinc-500 hover:text-zinc-300 transition-all cursor-pointer"
                  >
                    Alterar ID
                  </button>
                  <button
                    onClick={handleSpotifyDisconnect}
                    className="text-[10px] uppercase font-bold text-zinc-500 hover:text-red-400 transition-all cursor-pointer"
                  >
                    Desconectar
                  </button>
                </div>
              </div>

              {spotifyError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] text-red-400 font-mono">
                  {spotifyError}
                </div>
              )}

              {/* Fallback Spotify Embed Player for Free Accounts / Device offline */}
              {(!spotifyDeviceId || (spotifyError && (spotifyError.includes('Premium') || spotifyError.includes('Web SDK')))) && (
                <div className="space-y-2 bg-zinc-950/40 p-3 rounded-xl border border-zinc-900">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Tocador Spotify (Modo Embed)</span>
                    <span className="text-[8px] font-bold text-[#1DB954] bg-[#1DB954]/10 px-1.5 py-0.5 rounded-full uppercase">Conta Free / Fallback Ativo</span>
                  </div>
                  <iframe
                    src={spotifyEmbedUrl}
                    width="100%"
                    height="352"
                    allowFullScreen={true}
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                    className="rounded-lg border border-zinc-800 bg-zinc-950"
                  />
                  <p className="text-[9px] text-zinc-500 leading-normal text-center">
                    Dica: No modo gratuito do Spotify, você pode ouvir prévias das músicas diretamente ou controlar o aplicativo do Spotify oficial no seu celular/computador.
                  </p>
                </div>
              )}

              {/* Currently Playing Track Details (only shown if SDK is active with premium account) */}
              {spotifyDeviceId && (
                spotifyCurrentTrack ? (
                  <div className="flex items-center gap-3 bg-[#1DB954]/5 border border-[#1DB954]/10 rounded-xl p-3">
                    {spotifyCurrentTrack.album?.images?.[0]?.url ? (
                      <img
                        src={spotifyCurrentTrack.album.images[0].url}
                        alt="Capa do álbum"
                        className="w-12 h-12 rounded-lg object-cover shadow-md shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                        <Music className="w-5 h-5 text-zinc-600" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-white truncate uppercase tracking-tight">{spotifyCurrentTrack.name}</p>
                      <p className="text-[10px] text-zinc-400 truncate mt-0.5">{spotifyCurrentTrack.artists?.map((a: any) => a.name).join(', ')}</p>
                    </div>
                    {spotifyIsPlaying && (
                      <div className="flex gap-0.5 items-end h-4 shrink-0 pr-1">
                        <span className="w-1 h-3 bg-[#1DB954] animate-pulse rounded-full"></span>
                        <span className="w-1 h-2 bg-[#1DB954] animate-pulse delay-75 rounded-full"></span>
                        <span className="w-1 h-4 bg-[#1DB954] animate-pulse delay-150 rounded-full"></span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-zinc-950/20 border border-zinc-900 rounded-xl text-center text-xs text-zinc-500 font-mono">
                    Abra o Spotify em seu celular/computador ou clique em uma das playlists recomendadas abaixo para iniciar!
                  </div>
                )
              )}

              {/* Curated Workout Playlists */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Playlists Recomendadas de Treino</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    onClick={() => playSpotifyUri('spotify:playlist:37i9dQZF1DX8U9A6Z0v7vS')}
                    className="p-2.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-left rounded-lg text-xs cursor-pointer transition-all flex items-center gap-2 group w-full"
                  >
                    <div className="w-8 h-8 rounded bg-[#1DB954]/10 flex items-center justify-center text-[#1DB954] shrink-0 font-bold group-hover:scale-105 transition-all">🔥</div>
                    <div className="truncate text-left">
                      <p className="font-bold text-zinc-200 group-hover:text-white truncate">Treino Estilo Livre</p>
                      <p className="text-[9px] text-zinc-500 truncate">Best Fitness Hits</p>
                    </div>
                  </button>
                  <button
                    onClick={() => playSpotifyUri('spotify:playlist:37i9dQZF1DX76t638V6eg8')}
                    className="p-2.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-left rounded-lg text-xs cursor-pointer transition-all flex items-center gap-2 group w-full"
                  >
                    <div className="w-8 h-8 rounded bg-[#1DB954]/10 flex items-center justify-center text-[#1DB954] shrink-0 font-bold group-hover:scale-105 transition-all">⚡</div>
                    <div className="truncate text-left">
                      <p className="font-bold text-zinc-200 group-hover:text-white truncate">Treino Eletrônico</p>
                      <p className="text-[9px] text-zinc-500 truncate">Cardio Workout</p>
                    </div>
                  </button>
                  <button
                    onClick={() => playSpotifyUri('spotify:playlist:37i9dQZF1DX2pSTOxoPbx9')}
                    className="p-2.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-left rounded-lg text-xs cursor-pointer transition-all flex items-center gap-2 group w-full"
                  >
                    <div className="w-8 h-8 rounded bg-[#1DB954]/10 flex items-center justify-center text-[#1DB954] shrink-0 font-bold group-hover:scale-105 transition-all">🎸</div>
                    <div className="truncate text-left">
                      <p className="font-bold text-zinc-200 group-hover:text-white truncate">Treino Heavy Rock</p>
                      <p className="text-[9px] text-zinc-500 truncate">Rock Workout</p>
                    </div>
                  </button>
                  <button
                    onClick={() => playSpotifyUri('spotify:playlist:37i9dQZF1DX4sWSp43b7C4')}
                    className="p-2.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-left rounded-lg text-xs cursor-pointer transition-all flex items-center gap-2 group w-full"
                  >
                    <div className="w-8 h-8 rounded bg-[#1DB954]/10 flex items-center justify-center text-[#1DB954] shrink-0 font-bold group-hover:scale-105 transition-all">🎤</div>
                    <div className="truncate text-left">
                      <p className="font-bold text-zinc-200 group-hover:text-white truncate">Treino Hip Hop</p>
                      <p className="text-[9px] text-zinc-500 truncate">Workout Beats</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Paste Spotify URL or URI */}
              <div className="space-y-2 bg-zinc-950 p-3 rounded-xl border border-zinc-900">
                <h4 className="text-[9px] font-black uppercase text-zinc-400 tracking-wider">Tocar outra playlist ou faixa</h4>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const input = form.elements.namedItem('spotifyUrl') as HTMLInputElement;
                    if (input && input.value) {
                      const inputVal = input.value.trim();
                      if (inputVal.startsWith('spotify:')) {
                        playSpotifyUri(inputVal);
                      } else {
                        const uri = getSpotifyUriFromUrl(inputVal);
                        if (uri) {
                          playSpotifyUri(uri);
                        } else {
                          setSpotifyError('URL inválida. Cole um link do Spotify (Ex: https://open.spotify.com/playlist/...)');
                        }
                      }
                    }
                  }}
                  className="flex gap-2"
                >
                  <input
                    name="spotifyUrl"
                    type="text"
                    placeholder="Cole o link ou URI do Spotify aqui..."
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-hidden focus:border-[#1DB954] transition-all font-mono"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-[#1DB954] hover:bg-[#1ed760] text-black font-black uppercase text-[9px] rounded-lg cursor-pointer transition-all tracking-wider shrink-0"
                  >
                    Carregar
                  </button>
                </form>
              </div>
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
            disabled={
              (activeTab === 'local' && localTracks.length === 0) ||
              (activeTab === 'spotify' && !spotifyToken)
            }
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 cursor-pointer ${
              isPlayingState
                ? 'bg-zinc-800 text-white hover:bg-zinc-700'
                : 'bg-neon text-black hover:bg-neon-hover shadow-lg shadow-neon/15'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isPlayingState ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>

          {((activeTab === 'local' && localTracks.length > 0) ||
            (activeTab === 'spotify' && spotifyToken && spotifyDeviceId)) && (
            <button
              id="music-skip-btn"
              onClick={() => {
                if (activeTab === 'local') {
                  playNextLocalTrack();
                } else if (activeTab === 'spotify' && spotifyPlayerInstanceRef.current) {
                  spotifyPlayerInstanceRef.current.nextTrack().catch((e: any) => console.log(e));
                }
              }}
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
                : activeTab === 'spotify'
                ? spotifyCurrentTrack
                  ? spotifyCurrentTrack.name
                  : 'Spotify Web Player'
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
