export interface AnnouncementAudio {
  id: string;
  name: string;
  url: string; // Base64 data URL or object URL (for IndexedDB durability)
  duration: number; // in seconds
  createdAt: number;
  type: 'uploaded' | 'recorded' | 'preset' | 'tts';
}

export interface Schedule {
  id: string;
  title: string;
  audioId: string;
  time: string; // "HH:MM"
  days: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  enabled: boolean;
  fadeOutTime: number; // in seconds (for smooth music fading)
  interval?: number; // repetition interval in minutes (e.g. 20, 30, 40, 60)
}

export interface PlayLog {
  id: string;
  timestamp: number;
  scheduleTitle: string;
  audioName: string;
  status: 'success' | 'failed';
  message: string;
}
