// Client-side Gemini Live API session for the real-time voice dialog.
// Runs fully in the app (no server needed): mic PCM 16kHz goes up,
// model PCM 24kHz audio comes back down over a websocket.
import {GoogleGenAI, Modality} from '@google/genai';

export interface LiveSessionCallbacks {
  onOpen?: () => void;
  onUserText?: (text: string, isFinal: boolean) => void;
  onAiText?: (text: string) => void;
  onAudioPcm?: (pcmBase64: string) => void;
  onInterrupted?: () => void;
  onTurnComplete?: () => void;
  onError?: (message: string) => void;
  onClose?: () => void;
}

export interface LiveSessionHandle {
  sendPcm16: (pcmBase64: string) => void;
  close: () => void;
}

const LIVE_MODELS = [
  'gemini-2.5-flash-native-audio-preview-09-2025',
  'gemini-live-2.5-flash-preview',
];

interface LiveServerMsg {
  serverContent?: {
    modelTurn?: {parts?: Array<{inlineData?: {data?: string; mimeType?: string}}>};
    turnComplete?: boolean;
    interrupted?: boolean;
    inputTranscription?: {text?: string};
    interimInputTranscription?: {text?: string};
    outputTranscription?: {text?: string};
  };
}

export async function startLiveSession(opts: {
  apiKey: string;
  systemInstruction: string;
  callbacks: LiveSessionCallbacks;
}): Promise<LiveSessionHandle> {
  const ai = new GoogleGenAI({apiKey: opts.apiKey});
  let lastError: unknown = null;

  for (const model of LIVE_MODELS) {
    let settled = false;
    try {
      const session = await ai.live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: opts.systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Charon'}},
          },
        },
        callbacks: {
          onopen: () => {
            settled = true;
            opts.callbacks.onOpen?.();
          },
          onmessage: (e: unknown) => {
            const msg = e as LiveServerMsg;
            const sc = msg?.serverContent;
            if (!sc) return;
            for (const part of sc.modelTurn?.parts ?? []) {
              const data = part.inlineData?.data;
              if (data) opts.callbacks.onAudioPcm?.(data);
            }
            const inT = sc.inputTranscription?.text ?? sc.interimInputTranscription?.text;
            if (inT) opts.callbacks.onUserText?.(inT, Boolean(sc.inputTranscription?.text));
            if (sc.outputTranscription?.text) {
              opts.callbacks.onAiText?.(sc.outputTranscription.text);
            }
            if (sc.interrupted) opts.callbacks.onInterrupted?.();
            if (sc.turnComplete) opts.callbacks.onTurnComplete?.();
          },
          onerror: (e: unknown) => {
            if (!settled) {
              settled = true;
              lastError = e;
              return;
            }
            opts.callbacks.onError?.('حصلت مشكلة في مكالمة الصوت. جرّب تفتحها تاني.');
          },
          onclose: () => {
            if (!settled) {
              settled = true;
              lastError = new Error('live session closed before open');
              return;
            }
            opts.callbacks.onClose?.();
          },
        },
      });
      return {
        sendPcm16: (pcmBase64: string) => {
          try {
            session.sendRealtimeInput({
              audio: {data: pcmBase64, mimeType: 'audio/pcm;rate=16000'},
            });
          } catch {
            // session may be closing; ignore
          }
        },
        close: () => {
          try {
            session.close();
          } catch {
            // ignore
          }
        },
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('live connect failed');
}

/** Downsample Float32 mono samples from `srcRate` to 16kHz and encode PCM16 base64. */
export function floatToPcm16Base64(samples: Float32Array, srcRate: number): string {
  const ratio = srcRate / 16000;
  const outLen = Math.max(1, Math.floor(samples.length / ratio));
  const bytes = new Uint8Array(outLen * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < outLen; i += 1) {
    const idx = Math.min(samples.length - 1, Math.floor(i * ratio));
    const s = Math.max(-1, Math.min(1, samples[idx]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

/** Decode PCM16 base64 (24kHz from the model) into Float32 samples. */
export function pcm16Base64ToFloat(pcmBase64: string): Float32Array<ArrayBuffer> {
  const binary = atob(pcmBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const out = new Float32Array(bytes.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return out;
}
