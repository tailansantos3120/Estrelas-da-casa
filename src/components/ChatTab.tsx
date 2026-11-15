import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  MessageCircle,
  Mic,
  Pencil,
  Reply,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder.ts';
import { copyTextSafely } from '../hooks/usePWAInstall.ts';
import { formatAudioDuration } from '../services/audioRecorder.ts';
import {
  deleteChatMessage,
  editChatMessage,
  sendChatMessage,
  toggleChatReaction,
} from '../shared/gameLogic.ts';
import { t } from '../shared/i18n.ts';
import {
  getBrazilClockHHMM,
  getParticipantAvatar,
  getParticipantName,
  ROTATION_ORDER,
} from '../shared/schedule.ts';
import type { ChatMessage, GameState, LanguageCode, ParticipantId } from '../shared/types.ts';
import EmojiReactionBar, { QUICK_REACTION_EMOJIS } from './EmojiReactionBar.tsx';

interface ChatTabProps {
  lang: LanguageCode;
  gameState: GameState;
  currentUserId: ParticipantId;
  onAction: (
    type: string,
    payload?: Record<string, unknown>,
    optimistic?: (draft: GameState) => void
  ) => Promise<{ ok: boolean; error?: string }>;
  onShowToast?: (title: string, msg: string, tone?: 'gold' | 'error' | 'success') => void;
}

export default function ChatTab({
  lang,
  gameState,
  currentUserId,
  onAction,
  onShowToast,
}: ChatTabProps) {
  const [draftText, setDraftText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

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

  const messages = useMemo(
    () => gameState.chatMessages || [],
    [gameState.chatMessages]
  );

  const nowHHMM = useMemo(() => {
    return gameState.simulatedClockTime || getBrazilClockHHMM();
  }, [gameState.simulatedClockTime]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [messages.length]);

  useEffect(() => {
    if (recorderError) {
      onShowToast?.('Microfone', recorderError, 'error');
      clearRecorderError();
    }
  }, [recorderError, onShowToast, clearRecorderError]);

  const sendRecordedAudioResult = async (audio: {
    dataUrl: string;
    durationSec: number;
  } | null) => {
    if (!audio) return;
    setSending(true);
    const caption = `🎤 Áudio (${formatAudioDuration(audio.durationSec)})`;
    const replyId = replyTo?.id || null;
    setReplyTo(null);
    await onAction(
      'send_chat_message',
      {
        text: caption,
        replyToId: replyId,
        kind: 'audio',
        audioUrl: audio.dataUrl,
        audioDurationSec: audio.durationSec,
        dateStr: gameState.currentDateStr,
        nowHHMM,
      },
      (draft) => {
        sendChatMessage(draft, currentUserId, caption, nowHHMM, {
          replyToId: replyId,
          kind: 'audio',
          audioUrl: audio.dataUrl,
          audioDurationSec: audio.durationSec,
        });
      }
    );
    setSending(false);
  };

  const handleStartAudioRecording = async () => {
    if (sending || isRecording) return;
    await startRecording((autoAudio) => {
      void sendRecordedAudioResult(autoAudio);
    });
  };

  const handleStopAndSendAudio = async () => {
    if (!isRecording || sending) return;
    const audio = await stopRecording();
    await sendRecordedAudioResult(audio);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = draftText.trim();
    if (!trimmed || sending) return;
    setSending(true);
    const replyId = replyTo?.id || null;
    setDraftText('');
    setReplyTo(null);
    const res = await onAction(
      'send_chat_message',
      {
        text: trimmed,
        replyToId: replyId,
        kind: 'text',
        dateStr: gameState.currentDateStr,
        nowHHMM,
      },
      (draft) => {
        sendChatMessage(draft, currentUserId, trimmed, nowHHMM, {
          replyToId: replyId,
          kind: 'text',
        });
      }
    );
    setSending(false);
    if (!res.ok) {
      setDraftText(trimmed);
    }
  };

  const handleSendReactionBurst = async (emoji: string) => {
    if (sending) return;
    setSending(true);
    await onAction(
      'send_chat_message',
      {
        text: emoji,
        kind: 'reaction_burst',
        dateStr: gameState.currentDateStr,
        nowHHMM,
      },
      (draft) => {
        sendChatMessage(draft, currentUserId, emoji, nowHHMM, {
          kind: 'reaction_burst',
        });
      }
    );
    setSending(false);
  };

  const handleToggleReaction = (messageId: string, emoji: string) => {
    onAction(
      'toggle_chat_reaction',
      {
        messageId,
        emoji,
        dateStr: gameState.currentDateStr,
        nowHHMM,
      },
      (draft) => {
        toggleChatReaction(draft, messageId, currentUserId, emoji);
      }
    );
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (selectedMessageId === messageId) setSelectedMessageId(null);
    if (editingMessageId === messageId) {
      setEditingMessageId(null);
      setEditDraft('');
    }
    const res = await onAction(
      'delete_chat_message',
      {
        messageId,
        dateStr: gameState.currentDateStr,
        nowHHMM,
      },
      (draft) => {
        deleteChatMessage(draft, messageId, currentUserId);
      }
    );
    if (res.ok) {
      onShowToast?.('Mensagem excluída', 'A mensagem foi removida do chat.', 'success');
    }
  };

  const handleCopyMessage = async (msg: ChatMessage) => {
    const ok = await copyTextSafely(msg.text);
    if (ok) {
      setCopiedMessageId(msg.id);
      setTimeout(() => setCopiedMessageId((prev) => (prev === msg.id ? null : prev)), 2000);
      onShowToast?.('Mensagem copiada', 'Texto copiado para a área de transferência.', 'success');
    } else {
      onShowToast?.('Não foi possível copiar', 'Copie manualmente selecionando o texto.', 'error');
    }
  };

  const startEditingMessage = (msg: ChatMessage) => {
    setEditingMessageId(msg.id);
    setEditDraft(msg.text);
    setSelectedMessageId(msg.id);
  };

  const cancelEditingMessage = () => {
    setEditingMessageId(null);
    setEditDraft('');
  };

  const handleSaveEdit = async (e: React.FormEvent, messageId: string) => {
    e.preventDefault();
    const trimmed = editDraft.trim();
    if (!trimmed || savingEdit) return;
    setSavingEdit(true);
    setEditingMessageId(null);
    setEditDraft('');
    setSelectedMessageId(null);
    const res = await onAction(
      'edit_chat_message',
      {
        messageId,
        text: trimmed,
        dateStr: gameState.currentDateStr,
        nowHHMM,
      },
      (draft) => {
        editChatMessage(draft, messageId, currentUserId, trimmed, nowHHMM);
      }
    );
    setSavingEdit(false);
    if (res.ok) {
      onShowToast?.('Mensagem editada', 'Alteração salva no chat.', 'success');
    }
  };

  const handleBubbleTap = (msgId: string) => {
    if (editingMessageId === msgId) return;
    const selectedText = typeof window !== 'undefined' ? window.getSelection()?.toString() : '';
    if (selectedText && selectedText.trim().length > 0) return;
    setSelectedMessageId((prev) => (prev === msgId ? null : msgId));
  };

  const messageMap = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  return (
    <div className="space-y-4">
      {/* Header & House Strip */}
      <section className="glass-card rounded-3xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-400/15 border border-amber-400/35 flex items-center justify-center text-amber-500 shrink-0">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {t(lang, 'chatTitle')}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Texto, áudio e emojis em tempo real · toque em qualquer mensagem para excluir, copiar, responder ou reagir
              </p>
            </div>
          </div>

          <span className="font-mono-num text-xs font-bold text-amber-500">
            {messages.length} {messages.length === 1 ? 'mensagem' : 'mensagens'}
          </span>
        </div>

        {/* Participant presence & live stars strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ROTATION_ORDER.map((pid) => {
            const pName = getParticipantName(gameState, pid);
            const pStars = gameState.participants[pid].stars;
            const isMe = pid === currentUserId;
            return (
              <div
                key={pid}
                className={`rounded-2xl px-3 py-2 flex items-center gap-2.5 ${
                  isMe ? 'glass-gold' : 'glass-subcard'
                }`}
              >
                <img
                  src={getParticipantAvatar(gameState, pid)}
                  alt={pName}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-xl object-cover shrink-0 ring-1 ring-white/15"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {pName}
                  </p>
                  <p className="font-mono-num text-[11px] font-bold text-amber-500">
                    {pStars} ⭐
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* 1-tap instant emoji reaction burst */}
        <div className="glass-subcard rounded-2xl p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Reação rápida no chat (1 toque envia na hora)
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REACTION_EMOJIS.slice(0, 10).map((emoji) => (
              <button
                key={`burst-${emoji}`}
                type="button"
                disabled={sending}
                onClick={() => handleSendReactionBurst(emoji)}
                aria-label={`Enviar reação ${emoji} no chat`}
                className="min-w-[42px] min-h-[40px] rounded-xl bg-white/75 dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/10 hover:border-amber-400/70 hover:scale-105 active:scale-95 text-lg flex items-center justify-center transition-all disabled:opacity-50"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Message Stream */}
      <section className="glass-card rounded-3xl p-4 sm:p-5 flex flex-col gap-4 min-h-[340px] max-h-[58vh] overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-10 px-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-2xl mb-3">
              💬
            </div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              O chat da casa está aberto — vale tudo!
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
              Mande texto, grave um áudio no microfone ou solte uma reação rápida com emoji.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => {
              const isMe = msg.senderId === currentUserId;
              const senderName = getParticipantName(gameState, msg.senderId);
              const repliedMsg = msg.replyToId ? messageMap.get(msg.replyToId) : null;
              const isBurst = msg.kind === 'reaction_burst';
              const isAudio = msg.kind === 'audio' && Boolean(msg.audioUrl);
              const isSelected = selectedMessageId === msg.id;
              const isEditing = editingMessageId === msg.id;
              const isCopied = copiedMessageId === msg.id;

              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  <img
                    src={getParticipantAvatar(gameState, msg.senderId)}
                    alt={senderName}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-xl object-cover shrink-0 ring-1 ring-white/15 mt-0.5"
                  />

                  <div
                    className={`flex flex-col max-w-[82%] sm:max-w-[74%] ${
                      isMe ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={`flex items-center gap-2 mb-1 text-[11px] ${
                        isMe ? 'flex-row-reverse' : 'flex-row'
                      }`}
                    >
                      <span className="font-bold text-slate-800 dark:text-slate-100">
                        {senderName} {isMe ? '(Você)' : ''}
                      </span>
                      <span className="font-mono-num text-slate-400">{msg.timestamp}</span>
                      {msg.editedAt && (
                        <span className="text-[10px] italic text-slate-400 dark:text-slate-500">
                          (editada)
                        </span>
                      )}
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleBubbleTap(msg.id)}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && !isEditing) {
                          e.preventDefault();
                          handleBubbleTap(msg.id);
                        }
                      }}
                      aria-label={`Opções da mensagem de ${senderName}`}
                      aria-expanded={isSelected}
                      className={`cursor-pointer rounded-2xl px-3.5 py-2.5 border transition-all text-left ${
                        isSelected
                          ? 'ring-2 ring-amber-400 border-amber-400 shadow-md shadow-amber-500/10'
                          : ''
                      } ${
                        isMe
                          ? 'bg-amber-400/15 dark:bg-amber-400/[0.14] border-amber-400/45 text-slate-900 dark:text-white rounded-tr-sm'
                          : 'bg-white/80 dark:bg-white/[0.06] border-slate-200/80 dark:border-white/10 text-slate-900 dark:text-slate-100 rounded-tl-sm'
                      }`}
                    >
                      {repliedMsg && (
                        <div className="mb-2 rounded-xl bg-black/5 dark:bg-black/25 px-2.5 py-1.5 text-[11px] border-b border-slate-300/40 dark:border-white/10">
                          <span className="font-bold text-amber-600 dark:text-amber-300">
                            Respondendo a {getParticipantName(gameState, repliedMsg.senderId)}:
                          </span>{' '}
                          <span className="opacity-80 line-clamp-1">{repliedMsg.text}</span>
                        </div>
                      )}

                      {isEditing ? (
                        <form
                          onSubmit={(e) => handleSaveEdit(e, msg.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="space-y-2 min-w-[210px] sm:min-w-[260px]"
                        >
                          <input
                            type="text"
                            autoFocus
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.stopPropagation();
                                cancelEditingMessage();
                              }
                            }}
                            maxLength={600}
                            aria-label="Editar texto da mensagem"
                            className="modern-input w-full px-3 py-2 text-sm bg-white dark:bg-[#0B0D12] border border-amber-400/60 text-slate-900 dark:text-white"
                          />
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={cancelEditingMessage}
                              className="min-h-[34px] px-3 rounded-xl border border-slate-300 dark:border-white/15 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 inline-flex items-center gap-1"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Cancelar</span>
                            </button>
                            <button
                              type="submit"
                              disabled={!editDraft.trim() || savingEdit}
                              className="min-h-[34px] px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{savingEdit ? 'Salvando...' : 'Salvar'}</span>
                            </button>
                          </div>
                        </form>
                      ) : isAudio ? (
                        <div className="space-y-1.5 min-w-[220px] sm:min-w-[260px]">
                          <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-amber-600 dark:text-amber-300">
                            <span className="inline-flex items-center gap-1.5">
                              <Volume2 className="w-3.5 h-3.5" />
                              <span>Mensagem de voz</span>
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
                            onClick={(e) => e.stopPropagation()}
                            className="w-full h-9"
                          />
                        </div>
                      ) : isBurst ? (
                        <p className="text-3xl sm:text-4xl leading-none py-1 select-none">
                          {msg.text}
                        </p>
                      ) : (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words select-text">
                          {msg.text}
                        </p>
                      )}
                    </div>

                    {/* Tap Action Menu (Excluir / Copiar / Responder / Reagir / Editar) */}
                    {isSelected && !isEditing && (
                      <div
                        className={`mt-1.5 space-y-1.5 rounded-2xl p-2 bg-white/95 dark:bg-[#171B26]/95 border border-amber-400/40 shadow-lg max-w-full ${
                          isMe ? 'self-end' : 'self-start'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-1">
                          {QUICK_REACTION_EMOJIS.slice(0, 6).map((emoji) => (
                            <button
                              key={`tap-react-${msg.id}-${emoji}`}
                              type="button"
                              onClick={() => {
                                handleToggleReaction(msg.id, emoji);
                                setSelectedMessageId(null);
                              }}
                              aria-label={`Reagir com ${emoji}`}
                              className="min-w-[32px] min-h-[32px] rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-amber-400/25 text-base flex items-center justify-center transition-transform active:scale-90"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>

                        <div
                          className={`flex flex-wrap items-center gap-1.5 ${
                            isMe ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(msg)}
                            className="min-h-[34px] px-2.5 rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-amber-400/20 text-slate-800 dark:text-slate-100 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                                <span>Copiado!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-amber-500" />
                                <span>Copiar</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setReplyTo(msg);
                              setSelectedMessageId(null);
                            }}
                            className="min-h-[34px] px-2.5 rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-amber-400/20 text-slate-800 dark:text-slate-100 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Reply className="w-3.5 h-3.5 text-sky-500" />
                            <span>Responder</span>
                          </button>

                          {isMe && !isAudio && !isBurst && (
                            <button
                              type="button"
                              onClick={() => startEditingMessage(msg)}
                              className="min-h-[34px] px-2.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 text-amber-700 dark:text-amber-300 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Editar</span>
                            </button>
                          )}

                          {isMe && (
                            <button
                              type="button"
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="min-h-[34px] px-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Excluir</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Reactions */}
                    <div
                      className={`mt-1.5 flex flex-wrap items-center gap-1.5 ${
                        isMe ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <EmojiReactionBar
                        reactions={msg.reactions}
                        gameState={gameState}
                        currentUserId={currentUserId}
                        onToggleEmoji={(emoji) => handleToggleReaction(msg.id, emoji)}
                        compact
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </section>

      {/* Message Composer */}
      <section className="glass-card rounded-3xl p-3.5 sm:p-4 space-y-2.5">
        {replyTo && (
          <div className="glass-subcard rounded-2xl px-3 py-2 flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <span className="font-bold text-amber-500">
                Respondendo a {getParticipantName(gameState, replyTo.senderId)}:
              </span>{' '}
              <span className="text-slate-600 dark:text-slate-300 truncate">
                {replyTo.text}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              aria-label="Cancelar resposta"
              className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Quick insert emojis into draft */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {QUICK_REACTION_EMOJIS.map((em) => (
            <button
              key={`insert-${em}`}
              type="button"
              onClick={() => setDraftText((prev) => `${prev}${em}`)}
              title={`Inserir ${em}`}
              className="min-w-[34px] min-h-[34px] rounded-xl bg-white/60 dark:bg-white/[0.05] border border-slate-200/70 dark:border-white/10 hover:border-amber-400/60 text-base flex items-center justify-center shrink-0 transition-colors"
            >
              {em}
            </button>
          ))}
        </div>

        {(micPermission === 'prompt' || micPermission === 'denied') && !isRecording && (
          <div
            className={`flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-xs ${
              micPermission === 'denied'
                ? 'border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200'
                : 'border border-amber-400/35 bg-amber-400/10 text-amber-700 dark:text-amber-200'
            }`}
          >
            <span className="truncate font-medium">
              {micPermission === 'denied'
                ? 'Microfone bloqueado no navegador. Toque ao lado para liberar.'
                : 'Libere o microfone para gravar áudios rapidamente no chat.'}
            </span>
            <button
              type="button"
              onClick={() => void requestMicrophonePermission()}
              className="min-h-[32px] px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 shrink-0 transition-colors"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Permitir microfone</span>
            </button>
          </div>
        )}

        {isRecording ? (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-rose-500/45 bg-rose-500/10 px-3.5 py-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-rose-600 dark:text-rose-300">
                Gravando áudio...
              </span>
              <span className="font-mono-num text-xs font-extrabold text-slate-700 dark:text-slate-200">
                {formatAudioDuration(elapsedSec)}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={cancelRecording}
                aria-label="Cancelar gravação de áudio"
                className="min-h-[40px] px-3 rounded-xl border border-rose-500/35 bg-white/70 dark:bg-white/5 text-rose-600 dark:text-rose-300 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Cancelar</span>
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => void handleStopAndSendAudio()}
                aria-label="Enviar áudio gravado"
                className="min-h-[40px] px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs sm:text-sm inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>Enviar Áudio</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <input
              type="text"
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              maxLength={600}
              placeholder="Mande qualquer mensagem ou grave um áudio..."
              className="modern-input flex-1 min-w-0 min-h-[46px] px-4 text-sm bg-white/85 dark:bg-[#0B0D12]/90 border border-slate-200 dark:border-white/15 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-400"
            />
            <button
              type="button"
              disabled={sending}
              onClick={() => void handleStartAudioRecording()}
              aria-label="Gravar áudio no chat"
              title="Gravar áudio"
              className="min-w-[46px] min-h-[46px] px-3 rounded-2xl border border-slate-200 dark:border-white/15 bg-white/80 dark:bg-white/[0.06] hover:border-amber-400/70 text-amber-500 flex items-center justify-center transition-colors disabled:opacity-40 shrink-0"
            >
              <Mic className="w-5 h-5" />
            </button>
            <button
              type="submit"
              disabled={!draftText.trim() || sending}
              className="min-h-[46px] px-4 sm:px-5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-sm inline-flex items-center gap-2 transition-colors disabled:opacity-40 whitespace-nowrap shrink-0 shadow-sm"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Enviar</span>
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
