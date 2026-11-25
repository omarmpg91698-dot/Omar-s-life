// Voice capture for quick task dictation.
// Primary path: the Android wrapper's on-device SpeechRecognizer bridge
// (window.AndroidSpeech). Fallback for browsers: the Web Speech API.

export type VoiceCaptureError =
  | 'unavailable'
  | 'no-permission'
  | 'no-speech'
  | 'network'
  | 'cancelled'
  | 'error';

declare global {
  interface Window {
    AndroidSpeech?: {
      isAvailable(): boolean;
      hasPermission(): boolean;
      startListening(): void;
      stopListening(): void;
    };
    __omarSpeechResult?: (text: string) => void;
    __omarSpeechError?: (code: string) => void;
    __omarSpeechState?: (state: string) => void;
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: {results: ArrayLike<ArrayLike<{transcript: string}>>}) => void) | null;
  onerror: ((event: {error?: string}) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export function isVoiceCaptureAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.AndroidSpeech) {
    try {
      return window.AndroidSpeech.isAvailable();
    } catch {
      return true; // bridge exists; let the start call surface any real error
    }
  }
  return Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
}

export function captureVoiceText(timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const fail = (code: VoiceCaptureError) => reject(new Error(code));

    if (window.AndroidSpeech) {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        try {
          window.AndroidSpeech?.stopListening();
        } catch {
          // ignore
        }
        fail('no-speech');
      }, timeoutMs);
      const cleanup = () => {
        window.clearTimeout(timer);
        delete window.__omarSpeechResult;
        delete window.__omarSpeechError;
        delete window.__omarSpeechState;
      };
      window.__omarSpeechResult = (text: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        const trimmed = (text ?? '').trim();
        if (trimmed) resolve(trimmed);
        else fail('no-speech');
      };
      window.__omarSpeechError = (code: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        const known: VoiceCaptureError[] = [
          'unavailable',
          'no-permission',
          'no-speech',
          'network',
        ];
        fail(known.includes(code as VoiceCaptureError) ? (code as VoiceCaptureError) : 'error');
      };
      try {
        window.AndroidSpeech.startListening();
      } catch {
        settled = true;
        cleanup();
        fail('unavailable');
      }
      return;
    }

    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      fail('unavailable');
      return;
    }
    try {
      const rec = new Ctor();
      rec.lang = 'ar-EG';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      const timer = window.setTimeout(() => {
        try {
          rec.abort();
        } catch {
          // ignore
        }
        fail('no-speech');
      }, timeoutMs);
      rec.onresult = (event) => {
        window.clearTimeout(timer);
        const text = event.results?.[0]?.[0]?.transcript ?? '';
        if (text.trim()) resolve(text.trim());
        else fail('no-speech');
      };
      rec.onerror = (event) => {
        window.clearTimeout(timer);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          fail('no-permission');
        } else if (event.error === 'no-speech') {
          fail('no-speech');
        } else if (event.error === 'aborted') {
          fail('cancelled');
        } else if (event.error === 'network') {
          fail('network');
        } else {
          fail('error');
        }
      };
      rec.onend = () => window.clearTimeout(timer);
      rec.start();
    } catch {
      fail('unavailable');
    }
  });
}

export function stopVoiceCapture(): void {
  try {
    window.AndroidSpeech?.stopListening();
  } catch {
    // ignore
  }
}

export function voiceErrorMessage(code: string): string {
  switch (code) {
    case 'no-permission':
      return 'متحتاج إذن المايك — وافق على الإذن وجرب تاني.';
    case 'no-speech':
      return 'مسمعتش حاجة واضحة — جرب تتكلم تاني.';
    case 'network':
      return 'التعرف الصوتي محتاج نت دلوقتي — جرب تاني لما الشبكة تبقى أحسن.';
    case 'unavailable':
      return 'الإدخال الصوتي مش متاح على الجهاز ده.';
    default:
      return 'حصلت مشكلة في التسجيل — جرب تاني.';
  }
}
