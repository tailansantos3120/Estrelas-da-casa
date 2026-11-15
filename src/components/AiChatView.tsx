import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  CheckCheck,
  Copy,
  ExternalLink,
  Loader2,
  Lock,
  Mic,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder.ts';
import { copyTextSafely } from '../hooks/usePWAInstall.ts';
import { formatAudioDuration, type RecordedAudioResult } from '../services/audioRecorder.ts';
import {
  playConfirmEffect,
  playErrorEffect,
  unlockCelebrationAudio,
} from '../services/starCelebrationAudio.ts';
import { getBrazilClockHHMM, getParticipantName } from '../shared/schedule.ts';
import type { GameState, LanguageCode, ParticipantId } from '../shared/types.ts';
import { MetaAiRingIcon } from './MetaAiRingIcon.tsx';

export interface AiChatSource {
  title: string;
  uri: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  sources?: AiChatSource[];
  isStreaming?: boolean;
  audioUrl?: string;
  audioDurationSec?: number;
  transcript?: string;
}

interface AiChatViewProps {
  lang: LanguageCode;
  gameState: GameState;
  currentUserId: ParticipantId;
  sessionToken: string;
  messages: AiChatMessage[];
  onMessagesChange: React.Dispatch<React.SetStateAction<AiChatMessage[]>>;
  onAuthExpired?: () => void;
  onShowToast?: (title: string, msg: string, tone?: 'gold' | 'error' | 'success') => void;
  isFloatingOverlay?: boolean;
  onClose?: () => void;
}

const QUICK_STARTERS = [
  'Quem está ganhando hoje e o que falta eu fazer?',
  'Qual a melhor jogada com meus poderes hoje?',
  'Me explique rápido o Dado, Fantasma, Chefe e Coringa.',
  'Sugira um jantar rápido e fácil para hoje.',
  'Dica rápida para tirar gordura do fogão.',
];

export default function AiChatView({
  lang,
  gameState,
  currentUserId,
  sessionToken,
  messages,
  onMessagesChange,
  onAuthExpired,
  onShowToast,
  isFloatingOverlay = false,
  onClose,
}: AiChatViewProps) {
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const {
    isRecording,
    elapsedSec,
    micPermission,
    recorderError,
    clearRecorderError,
    requestMicrophonePermission,
    startRecording,
    stopRecording,
    cancelRecording,
  } = useVoiceRecorder();

  const userName = getParticipantName(gameState, currentUserId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'auto',
      block: 'end',
    });
  }, [messages, loading]);

  useEffect(() => {
    if (recorderError) {
      onShowToast?.('Microfone', recorderError, 'error');
      clearRecorderError();
    }
  }, [recorderError, onShowToast, clearRecorderError]);

  useEffect(() => {
    if (isFloatingOverlay) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 90);
      return () => clearTimeout(timer);
    }
  }, [isFloatingOverlay]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      onMessagesChange((prev) => {
        if (!prev.some((m) => m.isStreaming)) return prev;
        return prev
          .map((m) =>
            m.isStreaming
              ? m.text.trim()
                ? { ...m, isStreaming: false }
                : null
              : m
          )
          .filter((m): m is AiChatMessage => m !== null);
      });
    };
  }, [onMessagesChange]);

  const getNowHHMM = () => gameState.simulatedClockTime || getBrazilClockHHMM();

  const sendMessage = async (rawText: string, recordedAudio?: RecordedAudioResult | null) => {
    const trimmed = rawText.trim();
    if ((!trimmed && !recordedAudio) || loading) return;

    unlockCelebrationAudio();

    const nowHHMM = getNowHHMM();
    const userMsgId = `ai-u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const userMsg: AiChatMessage = {
      id: userMsgId,
      role: 'user',
      text: trimmed,
      timestamp: nowHHMM,
      ...(recordedAudio
        ? {
            audioUrl: recordedAudio.dataUrl,
            audioDurationSec: recordedAudio.durationSec,
          }
        : {}),
    };

    const aiMsgId = `ai-m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const placeholderAiMsg: AiChatMessage = {
      id: aiMsgId,
      role: 'model',
      text: '',
      timestamp: nowHHMM,
      isStreaming: true,
    };

    const historySnapshot = messages
      .filter((m) => !m.isStreaming && (m.text.trim().length > 0 || (m.transcript && m.transcript.trim().length > 0)))
      .slice(-16)
      .map((m) => ({
        role: m.role,
        text: [m.text, m.transcript].filter(Boolean).join('\n').trim(),
      }));

    onMessagesChange((prev) => [...prev, userMsg, placeholderAiMsg]);
    setDraft('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    setError(null);
    setLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = window.setTimeout(() => {
      controller.abort('timeout');
    }, 30_000);

    const removePlaceholder = () => {
      onMessagesChange((prev) => prev.filter((m) => m.id !== aiMsgId));
    };

    const attachTranscriptToUserMsg = (transcriptText?: string) => {
      const cleanT = transcriptText?.trim();
      if (!cleanT) return;
      onMessagesChange((prev) =>
        prev.map((m) => (m.id === userMsgId ? { ...m, transcript: cleanT } : m))
      );
    };

    const finalizeAiMessage = (finalText: string, sources: AiChatSource[], transcriptText?: string) => {
      const cleanT = transcriptText?.trim();
      onMessagesChange((prev) =>
        prev.map((m) => {
          if (m.id === userMsgId && cleanT && !m.transcript) {
            return { ...m, transcript: cleanT };
          }
          if (m.id === aiMsgId) {
            return {
              ...m,
              text: finalText || m.text || 'Não foi possível gerar uma resposta agora.',
              sources,
              timestamp: getNowHHMM(),
              isStreaming: false,
            };
          }
          return m;
        })
      );
    };

    const requestBody = JSON.stringify({
      participantId: currentUserId,
      token: sessionToken,
      message: trimmed,
      history: historySnapshot,
      lang,
      ...(recordedAudio
        ? {
            audio: {
              mimeType: recordedAudio.mimeType,
              data: recordedAudio.base64,
            },
            audioDurationSec: recordedAudio.durationSec,
          }
        : {}),
    });

    const runFallbackJsonChat = async (): Promise<boolean> => {
      const fallbackRes = await fetch('/api/ai/chat', {
        method: 'POST',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      });
      const fallbackData = await fallbackRes.json();
      if (!fallbackRes.ok || !fallbackData.ok) {
        removePlaceholder();
        playErrorEffect();
        if (fallbackRes.status === 401 && onAuthExpired) {
          onAuthExpired();
          return true;
        }
        setError(fallbackData.error || 'Não foi possível obter resposta da Meta AI.');
        return true;
      }
      finalizeAiMessage(
        fallbackData.answer || '',
        Array.isArray(fallbackData.sources) ? fallbackData.sources : [],
        typeof fallbackData.transcript === 'string' ? fallbackData.transcript : undefined
      );
      playConfirmEffect();
      return true;
    };

    try {
      const res = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
      });

      const contentType = res.headers.get('content-type') || '';

      if (!res.ok || contentType.includes('application/json')) {
        const data = await res.json().catch(() => ({ ok: false }));
        if (res.status === 401) {
          removePlaceholder();
          playErrorEffect();
          if (onAuthExpired) {
            onAuthExpired();
            return;
          }
          setError(data.error || 'Sessão expirada. Entre novamente.');
          return;
        }
        if (res.status === 400 || res.status === 503 || res.status === 403) {
          removePlaceholder();
          playErrorEffect();
          setError(data.error || 'Não foi possível obter resposta da Meta AI.');
          return;
        }
        await runFallbackJsonChat();
        return;
      }

      if (!res.body) {
        await runFallbackJsonChat();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedText = '';
      let finalSources: AiChatSource[] = [];
      let receivedDone = false;
      let receivedErrorEvent = false;

      const processSseEventBlock = (block: string) => {
        const lines = block.split(/\r?\n/);
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;
          try {
            const evt = JSON.parse(jsonStr) as {
              type?: string;
              text?: string;
              answer?: string;
              sources?: AiChatSource[];
              transcript?: string;
              error?: string;
            };
            if (evt.type === 'transcript' && evt.transcript) {
              attachTranscriptToUserMsg(evt.transcript);
            } else if (evt.type === 'delta' && evt.text) {
              accumulatedText += evt.text;
              const snapshot = accumulatedText;
              onMessagesChange((prev) =>
                prev.map((m) => (m.id === aiMsgId ? { ...m, text: snapshot } : m))
              );
            } else if (evt.type === 'done') {
              receivedDone = true;
              finalSources = Array.isArray(evt.sources) ? evt.sources : [];
              finalizeAiMessage(evt.answer || accumulatedText, finalSources, evt.transcript);
            } else if (evt.type === 'error') {
              receivedErrorEvent = true;
              removePlaceholder();
              playErrorEffect();
              setError(evt.error || 'Erro ao gerar resposta da Meta AI.');
            }
          } catch {
            // ignore incomplete JSON fragments
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() || '';
        for (const part of parts) {
          if (part.trim()) processSseEventBlock(part);
        }
      }

      if (buffer.trim()) {
        processSseEventBlock(buffer);
      }

      if (receivedErrorEvent) {
        return;
      }

      if (!receivedDone) {
        if (accumulatedText.trim()) {
          finalizeAiMessage(accumulatedText, finalSources);
          playConfirmEffect();
        } else {
          await runFallbackJsonChat();
        }
      } else if (accumulatedText.trim()) {
        playConfirmEffect();
      }
    } catch (err) {
      const isAbort =
        (err instanceof DOMException && err.name === 'AbortError') ||
        controller.signal.aborted;
      if (isAbort && controller.signal.reason !== 'timeout') {
        removePlaceholder();
        return;
      }
      if (controller.signal.reason === 'timeout') {
        removePlaceholder();
        playErrorEffect();
        setError('A Meta AI demorou mais que o esperado. Toque em "Tentar novamente".');
        return;
      }
      try {
        await runFallbackJsonChat();
      } catch {
        removePlaceholder();
        playErrorEffect();
        setError(
          typeof navigator !== 'undefined' && !navigator.onLine
            ? 'Sem conexão com a internet. Verifique sua rede e tente novamente.'
            : 'Falha momentânea de conexão com a Meta AI. Toque em "Tentar novamente".'
        );
      }
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const handleStartAudioRecording = async () => {
    if (loading || isRecording) return;
    await startRecording((autoAudio) => {
      if (autoAudio) {
        void sendMessage(draft, autoAudio);
      }
    });
  };

  const handleStopAndSendAudio = async () => {
    if (!isRecording || loading) return;
    const audio = await stopRecording();
    if (audio) {
      await sendMessage(draft, audio);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(draft);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(draft);
    }
  };

  const handleCopy = async (msg: AiChatMessage) => {
    const ok = await copyTextSafely(msg.text || msg.transcript || '');
    if (ok) {
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId((cur) => (cur === msg.id ? null : cur)), 2000);
      onShowToast?.('Texto copiado', 'Resposta copiada para a área de transferência.', 'success');
    }
  };

  const handleClearChat = () => {
    abortRef.current?.abort();
    if (isRecording) cancelRecording();
    onMessagesChange([]);
    setError(null);
    setDraft('');
    setLoading(false);
    inputRef.current?.focus();
    onShowToast?.('Nova conversa', 'Histórico privado da Meta AI limpo.', 'success');
  };

  const retryLastUserMessage = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser || loading) return;
    onMessagesChange((prev) => {
      const idx = prev.findIndex((m) => m.id === lastUser.id);
      return idx >= 0 ? prev.slice(0, idx) : prev;
    });
    const textRetry = lastUser.text || lastUser.transcript || '';
    if (textRetry) {
      void sendMessage(textRetry);
    }
  };

  const containerClasses = isFloatingOverlay
    ? 'h-full w-full flex flex-col bg-[#EFEAE2] dark:bg-[#0B141A] text-slate-900 dark:text-slate-100'
    : 'h-[calc(100dvh-11.5rem)] min-h-[480px] rounded-3xl overflow-hidden border border-slate-200/80 dark:border-white/10 shadow-xl flex flex-col bg-[#EFEAE2] dark:bg-[#0B141A] text-slate-900 dark:text-slate-100';

  return (
    <div className={containerClasses}>
      {/* WhatsApp-style Top Header */}
      <header
        className={`shrink-0 flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5 bg-[#F0F2F5] dark:bg-[#1F2C34] border-b border-slate-200/80 dark:border-white/[0.08] ${
          isFloatingOverlay ? 'pt-safe' : ''
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {isFloatingOverlay && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Voltar para o jogo"
              className="min-w-[40px] min-h-[40px] rounded-full hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center text-slate-700 dark:text-slate-200 transition-colors shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          <div className="w-10 h-10 rounded-full bg-white dark:bg-[#111B21] border border-sky-400/30 shadow-xs flex items-center justify-center shrink-0">
            <MetaAiRingIcon className="w-7 h-7" spinning={loading} />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="font-display text-base font-bold text-slate-900 dark:text-white tracking-tight truncate">
                Meta AI
              </h1>
              <BadgeCheck className="w-4 h-4 text-[#0084FF] shrink-0" />
            </div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate">
              {loading ? (
                <span className="text-sky-600 dark:text-sky-400 font-semibold">
                  Respondendo rapidamente...
                </span>
              ) : (
                <>
                  <Lock className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                  <span>Online · Texto ou áudio · {userName}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearChat}
              title="Limpar conversa e iniciar outra"
              className="min-h-[38px] px-3 rounded-full bg-black/5 dark:bg-white/[0.08] hover:bg-black/10 dark:hover:bg-white/15 text-xs font-bold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Nova conversa</span>
            </button>
          )}
        </div>
      </header>

      {/* WhatsApp Chat Wallpaper & Scrollable Stream */}
      <div
        aria-label="Mensagens da Meta AI"
        className="relative flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-3"
        style={{
          backgroundImage:
            'radial-gradient(rgba(148, 163, 184, 0.13) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
        {/* Privacy Notice Badge */}
        <div className="flex justify-center mb-2">
          <div className="px-3 py-1 rounded-xl bg-white/80 dark:bg-[#182229]/90 border border-slate-200/70 dark:border-white/[0.06] text-[11px] text-slate-600 dark:text-slate-300 shadow-2xs flex items-center gap-1.5 text-center max-w-md">
            <Lock className="w-3 h-3 text-emerald-500 shrink-0" />
            <span>
              Chat privado estilo WhatsApp · mande texto ou grave áudio para a Meta AI
            </span>
          </div>
        </div>

        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-6 px-2 space-y-5">
            <div className="space-y-2.5 max-w-md">
              <div className="w-16 h-16 mx-auto rounded-full bg-white dark:bg-[#182229] shadow-md border border-sky-400/25 flex items-center justify-center">
                <MetaAiRingIcon className="w-11 h-11" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Oi, {userName}! Como posso ajudar?
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Pergunte digitando ou gravando áudio no microfone. Resposta rápida na hora.
              </p>
            </div>

            <div className="w-full max-w-lg grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
              {QUICK_STARTERS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={loading}
                  onClick={() => void sendMessage(prompt)}
                  className="rounded-2xl p-3 bg-white/90 dark:bg-[#202C33] border border-slate-200/80 dark:border-white/[0.08] shadow-xs text-xs font-semibold text-slate-800 dark:text-slate-100 hover:border-sky-400/70 hover:bg-white dark:hover:bg-[#25333B] transition-colors text-left min-h-[44px] flex items-center gap-2 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                  <span className="leading-snug">{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-2.5">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              const isCopied = copiedId === msg.id;
              const waitingFirstToken = !isUser && msg.isStreaming && !msg.text;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`relative max-w-[88%] sm:max-w-[78%] rounded-2xl px-3.5 py-2.5 shadow-xs text-sm leading-relaxed whitespace-pre-wrap break-words ${
                      isUser
                        ? 'bg-[#D9FDD3] dark:bg-[#005C4B] text-slate-900 dark:text-white rounded-tr-xs'
                        : 'bg-white dark:bg-[#202C33] text-slate-900 dark:text-slate-100 rounded-tl-xs border border-slate-200/60 dark:border-white/[0.06]'
                    }`}
                  >
                    {!isUser && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <MetaAiRingIcon className="w-3.5 h-3.5" spinning={Boolean(msg.isStreaming)} />
                        <span className="text-[11px] font-bold bg-gradient-to-r from-sky-500 via-blue-500 to-purple-500 bg-clip-text text-transparent">
                          Meta AI
                        </span>
                      </div>
                    )}

                    {msg.audioUrl && (
                      <div className="space-y-1 mb-1.5 min-w-[210px] sm:min-w-[250px]">
                        <div className="flex items-center justify-between gap-2 text-[11px] font-bold opacity-85">
                          <span className="inline-flex items-center gap-1">
                            <Volume2 className="w-3.5 h-3.5" />
                            <span>Áudio enviado</span>
                          </span>
                          {msg.audioDurationSec ? (
                            <span className="font-mono-num">
                              {formatAudioDuration(msg.audioDurationSec)}
                            </span>
                          ) : null}
                        </div>
                        <audio
                          controls
                          preload="metadata"
                          src={msg.audioUrl}
                          className="w-full h-9"
                        />
                        {msg.transcript && (
                          <p className="text-[11px] italic opacity-90 pt-0.5">
                            “{msg.transcript}”
                          </p>
                        )}
                      </div>
                    )}

                    {waitingFirstToken ? (
                      <div className="flex items-center gap-1.5 py-1 text-slate-500 dark:text-slate-300">
                        <span className="w-2 h-2 rounded-full bg-sky-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '120ms' }} />
                        <span className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '240ms' }} />
                      </div>
                    ) : msg.text ? (
                      <div>
                        <span>{msg.text}</span>
                        {msg.isStreaming && (
                          <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-sky-500 animate-pulse rounded-xs" />
                        )}
                      </div>
                    ) : null}

                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-slate-200/70 dark:border-white/10 space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Fontes
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sources.map((src) => (
                            <a
                              key={src.uri}
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/10 text-[11px] font-semibold text-sky-600 dark:text-sky-300 hover:underline inline-flex items-center gap-1 max-w-full"
                            >
                              <ExternalLink className="w-3 h-3 shrink-0" />
                              <span className="truncate max-w-[190px]">{src.title}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div
                      className={`mt-1 flex items-center gap-1.5 text-[10px] ${
                        isUser
                          ? 'justify-end text-slate-600 dark:text-emerald-200/80'
                          : 'justify-between text-slate-400 dark:text-slate-400'
                      }`}
                    >
                      {!isUser && !msg.isStreaming && msg.text && (
                        <button
                          type="button"
                          onClick={() => void handleCopy(msg)}
                          className="inline-flex items-center gap-1 font-semibold hover:text-sky-500 transition-colors"
                        >
                          {isCopied ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span className="text-emerald-500">Copiado</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copiar</span>
                            </>
                          )}
                        </button>
                      )}
                      <span className="font-mono-num ml-auto inline-flex items-center gap-1">
                        {msg.timestamp}
                        {isUser && <CheckCheck className="w-3.5 h-3.5 text-[#53BDEB]" />}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div className="max-w-3xl mx-auto rounded-2xl p-3 border border-rose-500/40 bg-rose-500/15 text-rose-800 dark:text-rose-200 text-xs sm:text-sm flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1">{error}</p>
            <button
              type="button"
              onClick={retryLastUserMessage}
              disabled={loading}
              className="min-h-[36px] px-3 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Tentar novamente</span>
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* WhatsApp-style Bottom Composer (Text + Voice Recording) */}
      <footer
        className={`shrink-0 px-2.5 sm:px-4 py-2.5 bg-[#F0F2F5] dark:bg-[#0B141A] border-t border-slate-200/70 dark:border-white/[0.06] ${
          isFloatingOverlay ? 'pb-safe' : ''
        }`}
      >
        {(micPermission === 'prompt' || micPermission === 'denied') && !isRecording && (
          <div
            className={`max-w-3xl mx-auto mb-2 flex items-center justify-between gap-2 rounded-2xl px-3 py-1.5 text-xs ${
              micPermission === 'denied'
                ? 'border border-rose-500/40 bg-rose-500/12 text-rose-700 dark:text-rose-200'
                : 'border border-sky-400/35 bg-sky-500/10 text-sky-800 dark:text-sky-200'
            }`}
          >
            <span className="truncate font-medium">
              {micPermission === 'denied'
                ? 'Microfone bloqueado no navegador. Toque ao lado para liberar.'
                : 'Libere o microfone para mandar áudios para a Meta AI.'}
            </span>
            <button
              type="button"
              onClick={() => void requestMicrophonePermission()}
              className="min-h-[30px] px-3 rounded-full bg-[#00A884] hover:bg-[#009675] text-white font-bold text-xs inline-flex items-center gap-1.5 shrink-0 transition-colors"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Permitir microfone</span>
            </button>
          </div>
        )}

        {isRecording ? (
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-2 rounded-3xl border border-rose-500/45 bg-rose-500/12 px-4 py-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-rose-700 dark:text-rose-300">
                Gravando áudio...
              </span>
              <span className="font-mono-num text-xs font-extrabold text-slate-800 dark:text-slate-100">
                {formatAudioDuration(elapsedSec)}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={cancelRecording}
                aria-label="Cancelar gravação de áudio"
                className="min-h-[40px] px-3 rounded-full border border-rose-500/35 bg-white/80 dark:bg-white/10 text-rose-600 dark:text-rose-300 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Cancelar</span>
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleStopAndSendAudio()}
                aria-label="Enviar áudio para a Meta AI"
                className="min-h-[40px] px-4 rounded-full bg-[#00A884] hover:bg-[#009675] text-white font-bold text-xs sm:text-sm inline-flex items-center gap-1.5 shadow-md disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>Enviar Áudio</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex items-end gap-2">
            <div className="flex-1 min-w-0 flex items-center gap-2 rounded-3xl bg-white dark:bg-[#2A3942] border border-slate-200/80 dark:border-white/[0.06] px-3.5 py-1.5 shadow-2xs">
              <MetaAiRingIcon className="w-5 h-5 shrink-0" spinning={loading} />
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={handleKeyDown}
                maxLength={1500}
                placeholder="Pergunte à Meta AI ou grave áudio..."
                aria-label="Mensagem para a Meta AI"
                className="flex-1 min-w-0 bg-transparent py-1.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none resize-none max-h-[120px]"
              />
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={() => void handleStartAudioRecording()}
              aria-label="Gravar áudio para a Meta AI"
              title="Gravar áudio"
              className="w-11 h-11 rounded-full bg-white dark:bg-[#2A3942] border border-slate-200/80 dark:border-white/10 hover:border-sky-400/70 text-sky-500 flex items-center justify-center transition-transform active:scale-95 disabled:opacity-45 shrink-0 shadow-sm"
            >
              <Mic className="w-5 h-5" />
            </button>

            <button
              type="submit"
              disabled={!draft.trim() || loading}
              aria-label="Enviar mensagem para Meta AI"
              className="w-11 h-11 rounded-full bg-[#00A884] hover:bg-[#009675] text-white flex items-center justify-center transition-transform active:scale-95 disabled:opacity-45 shrink-0 shadow-md"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4 translate-x-[1px]" />}
            </button>
          </form>
        )}
      </footer>
    </div>
  );
}
