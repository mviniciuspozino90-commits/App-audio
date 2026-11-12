import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const VALID_VOICES = new Set(['Kore', 'Zephyr', 'Puck', 'Charon', 'Fenrir']);

const DEFAULT_STYLES: Record<string, string> = {
  Kore: 'Warm, natural, clear, friendly Brazilian Portuguese female speaker. Smooth human cadence, natural breathing and intonation, welcoming gym hostess tone, never robotic or monotonous.',
  Zephyr: 'Bright, upbeat, natural Brazilian Portuguese female fitness presenter. Enthusiastic yet smooth and authentic human voice with clear articulation, never robotic.',
  Charon: 'Warm, clear, natural Brazilian Portuguese male speaker with friendly human cadence and smooth intonation.',
  Puck: 'Lively, friendly, natural Brazilian Portuguese male speaker with clear articulation.',
  Fenrir: 'Confident, deep, natural Brazilian Portuguese male announcer with smooth human cadence.',
};

// Simple in-memory LRU cache for synthesized WAV audio (base64)
const ttsCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 60;

function getCachedAudio(key: string): string | undefined {
  const hit = ttsCache.get(key);
  if (hit) {
    // Refresh LRU order
    ttsCache.delete(key);
    ttsCache.set(key, hit);
  }
  return hit;
}

function setCachedAudio(key: string, value: string): void {
  if (ttsCache.has(key)) {
    ttsCache.delete(key);
  } else if (ttsCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = ttsCache.keys().next().value;
    if (oldestKey !== undefined) {
      ttsCache.delete(oldestKey);
    }
  }
  ttsCache.set(key, value);
}

let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        apiVersion: 'v1beta',
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

async function callTtsModel(
  ai: GoogleGenAI,
  model: string,
  text: string,
  voiceName: string,
  style: string
): Promise<string> {
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text,
            speechMetadata: {
              style,
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('A resposta do modelo de voz não retornou dados de áudio.');
  }
  return base64Audio;
}

async function generateSpeechWithRetry(
  ai: GoogleGenAI,
  text: string,
  voiceName: string,
  style: string,
  maxRetries = 1
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callTtsModel(ai, 'gemini-3.8-flash-lite-tts', text, voiceName, style);
    } catch (err: unknown) {
      lastError = err;
      const status = (err as { status?: number })?.status;
      if (status === 429) {
        // Free-tier per-model quota hit on flash-lite-tts: try flagship flash-tts once
        try {
          return await callTtsModel(ai, 'gemini-3.8-flash-tts', text, voiceName, style);
        } catch (fallbackErr: unknown) {
          throw fallbackErr;
        }
      }
      if (attempt < maxRetries && (status === 503 || status === 500)) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    const ai = getAiClient();
    res.json({ ok: true, neuralTtsAvailable: Boolean(ai) });
  });

  app.post('/api/tts', async (req: Request, res: Response) => {
    try {
      const { text, voiceName, style } = req.body as {
        text?: unknown;
        voiceName?: unknown;
        style?: unknown;
      };

      if (typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'O texto para síntese de voz é obrigatório.' });
        return;
      }

      const trimmedText = text.trim().slice(0, 2000);
      const resolvedVoice =
        typeof voiceName === 'string' && VALID_VOICES.has(voiceName) ? voiceName : 'Kore';
      const resolvedStyle =
        typeof style === 'string' && style.trim()
          ? style.trim()
          : DEFAULT_STYLES[resolvedVoice] || DEFAULT_STYLES.Kore;

      const cacheKey = `${resolvedVoice}|${resolvedStyle}|${trimmedText}`;
      const cached = getCachedAudio(cacheKey);
      if (cached) {
        res.json({
          audioBase64: cached,
          mimeType: 'audio/wav',
          voiceName: resolvedVoice,
          cached: true,
        });
        return;
      }

      const ai = getAiClient();
      if (!ai) {
        res.status(503).json({
          error: 'Chave de API Gemini não configurada no servidor.',
          code: 'MISSING_API_KEY',
        });
        return;
      }

      const audioBase64 = await generateSpeechWithRetry(ai, trimmedText, resolvedVoice, resolvedStyle);
      setCachedAudio(cacheKey, audioBase64);

      res.json({
        audioBase64,
        mimeType: 'audio/wav',
        voiceName: resolvedVoice,
        cached: false,
      });
    } catch (err: unknown) {
      console.error('Erro no endpoint /api/tts:', err);
      const message = err instanceof Error ? err.message : 'Erro interno ao gerar áudio de voz.';
      const status = (err as { status?: number })?.status;
      res.status(status && status >= 400 && status < 600 ? status : 500).json({
        error: message,
        code: status === 429 ? 'QUOTA_EXCEEDED' : 'TTS_ERROR',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`I9 Fit Gym Voice server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
