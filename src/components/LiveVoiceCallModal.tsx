import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Loader2, Mic, MicOff, PhoneOff, Volume2} from 'lucide-react';
import omarLogoImg from '../assets/images/omar_assistant_logo_1795532106453.jpg';
import {
  SPECIALIST_MODE_OPTIONS,
  type SpecialistMode,
} from '../storage/psychologyMarketingKb';

interface LiveVoiceCallModalProps {
  open: boolean;
  userName: string;
  voiceLang: 'ar-EG' | 'en-US';
  specialistMode: SpecialistMode;
  onChangeSpecialistMode: (mode: SpecialistMode) => void;
  onClose: () => void;
  onSendVoiceTurn: (transcript: string) => Promise<{reply: string; language: 'ar-EG' | 'en-US'} | null>;
}

type CallPhase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'muted';

export const LiveVoiceCallModal: React.FC<LiveVoiceCallModalProps> = ({
  open,
  userName,
  voiceLang,
  specialistMode,
  onChangeSpecialistMode,
  onClose,
  onSendVoiceTurn,
}) => {
  const [phase, setPhase] = useState<CallPhase>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [liveUserText, setLiveUserText] = useState('');
  const [lastAiReply, setLastAiReply] = useState('');
  const [callError, setCallError] = useState<string | null>(null);

  const openRef = useRef(open);
  const mutedRef = useRef(isMuted);
  const recognitionRef = useRef<{stop: () => void; abort?: () => void} | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const startListeningRef = useRef<() => void>(() => {});

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    mutedRef.current = isMuted;
  }, [isMuted]);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const stopPlayback = useCallback(() => {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.currentTime = 0;
      activeAudioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const stopListening = useCallback(() => {
    clearRestartTimer();
    try {
      recognitionRef.current?.abort?.();
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
  }, [clearRestartTimer]);

  const scheduleNextListen = useCallback(
    (delayMs = 380) => {
      clearRestartTimer();
      if (!openRef.current || mutedRef.current) return;
      restartTimerRef.current = window.setTimeout(() => {
        if (openRef.current && !mutedRef.current) {
          startListeningRef.current();
        }
      }, delayMs);
    },
    [clearRestartTimer],
  );

  const speakAndContinue = useCallback(
    async (text: string, lang: 'ar-EG' | 'en-US') => {
      const clean = text.trim();
      if (!clean || !openRef.current) {
        scheduleNextListen(250);
        return;
      }

      stopPlayback();
      setPhase('speaking');

      const speakLocal = () => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window) || !openRef.current) {
          scheduleNextListen(400);
          return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(clean);
        const hasArabic = /[\u0600-\u06FF]/.test(clean);
        utterance.lang = hasArabic || lang === 'ar-EG' ? 'ar-EG' : 'en-US';
        utterance.rate = 1.04;
        utterance.onend = () => {
          if (openRef.current && !mutedRef.current) {
            scheduleNextListen(350);
          } else if (openRef.current) {
            setPhase('muted');
          }
        };
        utterance.onerror = () => {
          if (openRef.current && !mutedRef.current) {
            scheduleNextListen(450);
          }
        };
        window.speechSynthesis.speak(utterance);
      };

      const controller = new AbortController();
      ttsAbortRef.current = controller;

      try {
        const res = await fetch('/api/omar-ai/tts', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({text: clean.slice(0, 700), language: lang, voiceName: 'Charon'}),
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as {
          audioBase64?: string;
          mimeType?: string;
        };
        if (controller.signal.aborted || !openRef.current) return;

        if (res.ok && data.audioBase64) {
          const audio = new Audio(
            `data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`,
          );
          activeAudioRef.current = audio;
          audio.onended = () => {
            activeAudioRef.current = null;
            if (openRef.current && !mutedRef.current) {
              scheduleNextListen(350);
            } else if (openRef.current) {
              setPhase('muted');
            }
          };
          audio.onerror = () => {
            activeAudioRef.current = null;
            speakLocal();
          };
          await audio.play();
          return;
        }
      } catch (err) {
        if ((err as {name?: string})?.name === 'AbortError') return;
      }

      speakLocal();
    },
    [scheduleNextListen, stopPlayback],
  );

  const processTranscript = useCallback(
    async (transcript: string) => {
      const clean = transcript.trim();
      if (!clean || !openRef.current) {
        scheduleNextListen(450);
        return;
      }

      setLiveUserText(clean);
      setCallError(null);
      setPhase('thinking');

      const result = await onSendVoiceTurn(clean);
      if (!openRef.current) return;

      if (!result || !result.reply) {
        setCallError('مقدرتش أسمع الرد من السيرفر، اتكلم تاني.');
        scheduleNextListen(900);
        return;
      }

      setLastAiReply(result.reply);
      await speakAndContinue(result.reply, result.language);
    },
    [onSendVoiceTurn, scheduleNextListen, speakAndContinue],
  );

  const startListening = useCallback(() => {
    if (!openRef.current || mutedRef.current) return;

    stopPlayback();
    stopListening();
    setCallError(null);

    const w = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        onresult: (ev: {
          results: ArrayLike<{isFinal?: boolean; 0: {transcript: string}}>;
        }) => void;
        onerror: (ev: {error?: string}) => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
        abort: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        onresult: (ev: {
          results: ArrayLike<{isFinal?: boolean; 0: {transcript: string}}>;
        }) => void;
        onerror: (ev: {error?: string}) => void;
        onend: () => void;
        start: () => void;
        stop: () => void;
        abort: () => void;
      };
    };

    const SpeechRec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (SpeechRec) {
      let receivedFinal = '';
      const rec = new SpeechRec();
      rec.lang = voiceLang;
      rec.interimResults = true;
      rec.continuous = false;
      rec.onresult = (ev) => {
        let combined = '';
        let hasFinal = false;
        for (let i = 0; i < ev.results.length; i += 1) {
          combined += ev.results[i][0]?.transcript ?? '';
          if (ev.results[i].isFinal) hasFinal = true;
        }
        const trimmed = combined.trim();
        if (trimmed) setLiveUserText(trimmed);
        if (hasFinal && trimmed) {
          receivedFinal = trimmed;
        }
      };
      rec.onerror = (ev) => {
        if (!openRef.current) return;
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          setCallError('اسمح بصلاحية الميكروفون في المتصفح عشان المكالمة الصوتية تشتغل.');
          setPhase('muted');
          setIsMuted(true);
          return;
        }
        // For no-speech / aborted during normal pause, gently resume listening
        if (ev.error === 'no-speech' && !mutedRef.current) {
          scheduleNextListen(500);
        }
      };
      rec.onend = () => {
        recognitionRef.current = null;
        if (!openRef.current) return;
        if (receivedFinal) {
          const textToSend = receivedFinal;
          receivedFinal = '';
          void processTranscript(textToSend);
        } else if (!mutedRef.current) {
          scheduleNextListen(450);
        }
      };
      recognitionRef.current = rec;
      setPhase('listening');
      try {
        rec.start();
      } catch {
        setCallError('الميكروفون مشغول، اضغط على الدائرة عشان تتكلم.');
        setPhase('idle');
      }
      return;
    }

    // Fallback: tap-to-record MediaRecorder -> /api/omar-ai/transcribe
    setPhase('idle');
    setCallError('اضغط على زر الميكروفون للتسجيل بالمصري، واضغط تاني للإرسال.');
  }, [processTranscript, scheduleNextListen, stopListening, stopPlayback, voiceLang]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  // Call lifecycle & timer
  useEffect(() => {
    if (!open) {
      stopListening();
      stopPlayback();
      setPhase('idle');
      setElapsedSec(0);
      setLiveUserText('');
      setLastAiReply('');
      setCallError(null);
      setIsMuted(false);
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);

    // Start listening automatically as soon as the live call opens
    const boot = window.setTimeout(() => {
      if (openRef.current && !mutedRef.current) {
        startListeningRef.current();
      }
    }, 220);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(boot);
      stopListening();
      stopPlayback();
    };
  }, [open, stopListening, stopPlayback]);

  // Tap big orb: barge-in interrupt when speaking, or toggle recording on fallback browsers
  const handleOrbTap = async () => {
    setCallError(null);
    if (phase === 'speaking') {
      stopPlayback();
      if (isMuted) setIsMuted(false);
      startListening();
      return;
    }

    // Fallback MediaRecorder flow when browser has no SpeechRecognition
    const w = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    if (!w.SpeechRecognition && !w.webkitSpeechRecognition) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setCallError('المتصفح الحالي مش بيدعم تسجيل الصوت.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({audio: true});
        const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
        const recorder = new MediaRecorder(stream, {mimeType});
        audioChunksRef.current = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
        };
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(audioChunksRef.current, {type: mimeType});
          audioChunksRef.current = [];
          if (blob.size < 400 || !openRef.current) {
            setPhase('idle');
            return;
          }
          setPhase('transcribing');
          try {
            const b64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
              reader.onerror = () => reject(new Error('read_failed'));
              reader.readAsDataURL(blob);
            });
            const res = await fetch('/api/omar-ai/transcribe', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({audioBase64: b64, mimeType}),
            });
            const data = (await res.json().catch(() => ({}))) as {transcript?: string};
            if (res.ok && data.transcript?.trim()) {
              await processTranscript(data.transcript.trim());
            } else {
              setPhase('idle');
              setCallError('مسمعتش كلام واضح، جرّب تاني.');
            }
          } catch {
            setPhase('idle');
            setCallError('تعذر تفريغ الصوت دلوقتي.');
          }
        };
        mediaRecorderRef.current = recorder;
        recorder.start();
        setPhase('listening');
      } catch {
        setCallError('اسمح بصلاحية الميكروفون الأول.');
      }
      return;
    }

    if (isMuted) {
      setIsMuted(false);
      mutedRef.current = false;
      startListening();
    } else if (phase === 'idle') {
      startListening();
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    mutedRef.current = nextMuted;
    if (nextMuted) {
      stopListening();
      setPhase('muted');
    } else {
      startListening();
    }
  };

  const handleHangUp = () => {
    stopListening();
    stopPlayback();
    onClose();
  };

  if (!open) return null;

  const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const secs = String(elapsedSec % 60).padStart(2, '0');

  const phaseLabel =
    phase === 'listening'
      ? 'سامعك دلوقتي... اتكلم بالمصري عادي'
      : phase === 'transcribing'
        ? 'بفهم كلامك...'
        : phase === 'thinking'
          ? "Omar's personal assistant بيفكّر في الرد..."
          : phase === 'speaking'
            ? "Omar's personal assistant بيتكلم — اضغط الدائرة لو عايز تقاطعه"
            : phase === 'muted'
              ? 'الميكروفون مكتوم'
              : 'جاهز أسمعك... اضغط على الدائرة';

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex flex-col justify-between bg-[#070B11] px-6 py-8 text-white"
    >
      {/* Top Call Header */}
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={omarLogoImg}
              alt="Omar's personal assistant"
              referrerPolicy="no-referrer"
              className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-teal-400/50"
            />
            <div>
              <p className="font-brand text-lg font-bold tracking-tight" dir="ltr">
                Omar&apos;s personal assistant · Live Call
              </p>
              <p className="text-xs text-slate-400">مكالمة صوتية حية بالمصري مع {userName}</p>
            </div>
          </div>
          <span
            className="rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 font-mono text-xs font-semibold text-teal-300 tabular-nums"
            dir="ltr"
          >
            {mins}:{secs}
          </span>
        </div>

        {/* Specialist Mode Switch inside Call */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
          {SPECIALIST_MODE_OPTIONS.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => onChangeSpecialistMode(mode.id)}
              className={`min-h-[34px] rounded-xl px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                specialistMode === mode.id
                  ? 'bg-teal-500 text-slate-950'
                  : 'border border-slate-800 bg-slate-900/80 text-slate-300 hover:border-teal-500/50'
              }`}
            >
              {mode.shortLabel}
            </button>
          ))}
        </div>
      </div>

      {/* Center Pulsing Voice Orb & Live Subtitles */}
      <div className="mx-auto flex w-full max-w-xl flex-col items-center text-center">
        <div className="relative flex h-56 w-56 items-center justify-center">
          <div
            className={`absolute inset-4 rounded-full transition-all duration-500 ${
              phase === 'listening'
                ? 'scale-110 bg-teal-500/20 animate-pulse'
                : phase === 'speaking'
                  ? 'scale-115 bg-emerald-400/25 animate-pulse'
                  : phase === 'thinking' || phase === 'transcribing'
                    ? 'scale-105 bg-amber-400/20 animate-pulse'
                    : 'scale-95 bg-slate-800/40'
            }`}
          />
          <div
            className={`absolute inset-10 rounded-full transition-all duration-300 ${
              phase === 'listening'
                ? 'bg-teal-500/25'
                : phase === 'speaking'
                  ? 'bg-emerald-500/30'
                  : 'bg-slate-800/50'
            }`}
          />
          <button
            type="button"
            onClick={() => void handleOrbTap()}
            aria-label={phase === 'speaking' ? 'مقاطعة والحديث الآن' : 'التحدث الآن'}
            className={`relative flex h-32 w-32 items-center justify-center rounded-full shadow-2xl transition-transform active:scale-95 ${
              phase === 'listening'
                ? 'bg-teal-500 text-slate-950'
                : phase === 'speaking'
                  ? 'bg-emerald-500 text-slate-950'
                  : phase === 'thinking' || phase === 'transcribing'
                    ? 'bg-amber-400 text-slate-950'
                    : 'bg-slate-800 text-slate-200'
            }`}
          >
            {phase === 'thinking' || phase === 'transcribing' ? (
              <Loader2 className="h-12 w-12 animate-spin" />
            ) : phase === 'speaking' ? (
              <Volume2 className="h-12 w-12" />
            ) : phase === 'muted' ? (
              <MicOff className="h-11 w-11" />
            ) : (
              <Mic className="h-12 w-12" />
            )}
          </button>
        </div>

        <p className="mt-2 text-sm font-semibold text-teal-300">{phaseLabel}</p>

        {callError && (
          <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs text-rose-300">
            {callError}
          </p>
        )}

        {/* Live Transcript Cards */}
        <div className="mt-6 w-full space-y-2.5">
          {liveUserText && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-start">
              <p className="text-[11px] font-semibold text-slate-400">أنت قلت:</p>
              <p className="mt-1 text-sm text-slate-100">{liveUserText}</p>
            </div>
          )}
          {lastAiReply && (
            <div className="max-h-40 overflow-y-auto rounded-2xl border border-teal-500/25 bg-teal-950/30 px-4 py-3 text-start">
              <p className="text-[11px] font-semibold text-teal-400">
                Omar&apos;s personal assistant:
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
                {lastAiReply}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Call Controls */}
      <div className="mx-auto flex w-full max-w-sm items-center justify-center gap-6 pb-2">
        <button
          type="button"
          onClick={handleToggleMute}
          className={`flex h-14 w-14 flex-col items-center justify-center rounded-full border transition-colors ${
            isMuted
              ? 'border-amber-400/50 bg-amber-500/20 text-amber-300'
              : 'border-slate-700 bg-slate-800/80 text-white hover:bg-slate-700'
          }`}
          aria-label={isMuted ? 'فتح الميكروفون' : 'كتم الميكروفون'}
        >
          {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </button>

        <button
          type="button"
          onClick={handleHangUp}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg transition-transform hover:bg-rose-500 active:scale-95"
          aria-label="إنهاء المكالمة"
        >
          <PhoneOff className="h-7 w-7" />
        </button>
      </div>
    </div>
  );
};
