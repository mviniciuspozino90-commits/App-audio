declare module "*.jpg" {
  const content: string;
  export default content;
}

declare module "*.png" {
  const content: string;
  export default content;
}

declare module "*.svg" {
  const content: string;
  export default content;
}

interface Window {
  electron?: {
    send: (channel: string, data: any) => void;
    receive: (channel: string, func: (...args: any[]) => void) => () => void;
    getPlatform: () => string;
  };
  Spotify?: any;
  YT?: any;
  onSpotifyWebPlaybackSDKReady?: () => void;
}

interface ImportMetaEnv {
  readonly VITE_SPOTIFY_CLIENT_ID: string;
  readonly [key: string]: any;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

