import React, { useState } from 'react';
import { SmilePlus, X } from 'lucide-react';
import { getParticipantName } from '../shared/schedule.ts';
import type { ChatReactionMap, GameState, ParticipantId } from '../shared/types.ts';

export const QUICK_REACTION_EMOJIS = [
  '🤬',
  '🤣',
  '😂',
  '😃',
  '🔥',
  '👑',
  '👻',
  '😭',
  '👀',
  '👏',
  '❤️',
  '💀',
  '🥳',
];

interface EmojiReactionBarProps {
  reactions?: ChatReactionMap;
  gameState: GameState;
  currentUserId: ParticipantId;
  onToggleEmoji: (emoji: string) => void;
  quickSuggestions?: string[];
  compact?: boolean;
}

export default function EmojiReactionBar({
  reactions,
  gameState,
  currentUserId,
  onToggleEmoji,
  quickSuggestions,
  compact = false,
}: EmojiReactionBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customEmoji, setCustomEmoji] = useState('');

  const entries = Object.entries(reactions || {}).filter(
    ([, users]) => Array.isArray(users) && users.length > 0
  );
  const myReaction = entries.find(([, users]) => users.includes(currentUserId))?.[0] || null;

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customEmoji.trim();
    if (!trimmed) return;
    onToggleEmoji(trimmed);
    setCustomEmoji('');
    setPickerOpen(false);
  };

  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {entries.map(([emoji, users]) => {
        const iReacted = users.includes(currentUserId);
        const namesList = users
          .map((uid) => getParticipantName(gameState, uid))
          .join(', ');
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onToggleEmoji(emoji)}
            title={`${namesList} reagiu com ${emoji}`}
            aria-label={`${emoji} (${users.length}): ${namesList}`}
            className={`inline-flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-semibold transition-all border ${
              compact ? 'min-h-[30px]' : 'min-h-[34px]'
            } ${
              iReacted
                ? 'bg-amber-400/20 border-amber-400/70 text-amber-700 dark:text-amber-300 shadow-xs'
                : 'bg-white/60 dark:bg-white/[0.06] border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:border-amber-400/50'
            }`}
          >
            <span className="text-sm leading-none">{emoji}</span>
            <span className="font-mono-num text-[11px] font-bold">{users.length}</span>
            {!compact && users.length <= 2 && (
              <span className="hidden sm:inline text-[10px] opacity-80 truncate max-w-[90px]">
                {namesList}
              </span>
            )}
          </button>
        );
      })}

      {/* Optional 1-tap inline quick reaction buttons when no reactions yet or always accessible */}
      {quickSuggestions &&
        quickSuggestions.map((emoji) => {
          if (reactions?.[emoji]?.length) return null;
          return (
            <button
              key={`suggest-${emoji}`}
              type="button"
              onClick={() => onToggleEmoji(emoji)}
              title={`Reagir com ${emoji}`}
              aria-label={`Reagir com ${emoji}`}
              className={`inline-flex items-center justify-center rounded-xl px-2 border border-dashed border-slate-300/80 dark:border-white/15 bg-white/35 dark:bg-white/[0.03] hover:border-amber-400/70 hover:bg-amber-400/10 text-sm transition-all ${
                compact ? 'min-h-[30px]' : 'min-h-[34px]'
              }`}
            >
              {emoji}
            </button>
          );
        })}

      <button
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        aria-label={myReaction ? `Trocar reação ${myReaction}` : 'Escolher emoji de reação'}
        title={myReaction ? `Trocar sua reação (${myReaction}) por outra` : 'Reagir com emoji'}
        className={`inline-flex items-center justify-center gap-1 rounded-xl px-2 border transition-colors ${
          compact ? 'min-h-[30px]' : 'min-h-[34px]'
        } ${
          myReaction
            ? 'border-amber-400/50 bg-amber-400/10 text-amber-600 dark:text-amber-300 hover:bg-amber-400/20'
            : 'border-slate-200/80 dark:border-white/10 bg-white/50 dark:bg-white/[0.04] hover:border-amber-400/60 text-slate-500 dark:text-slate-300 hover:text-amber-500'
        }`}
      >
        <SmilePlus className="w-3.5 h-3.5" />
        {myReaction && <span className="text-[11px] font-bold">Trocar</span>}
      </button>

      {pickerOpen && (
        <div className="w-full mt-1.5 glass-subcard rounded-2xl p-2.5 border border-amber-400/40 shadow-xl space-y-2 z-20">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
              {myReaction
                ? `Sua reação: ${myReaction} · Escolha outro emoji para trocar ou toque no mesmo para remover`
                : 'Escolha um emoji para reagir'}
            </span>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              aria-label="Fechar seletor de emoji"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REACTION_EMOJIS.map((em) => {
              const active = reactions?.[em]?.includes(currentUserId);
              return (
                <button
                  key={em}
                  type="button"
                  onClick={() => {
                    onToggleEmoji(em);
                    setPickerOpen(false);
                  }}
                  className={`min-w-[36px] min-h-[36px] rounded-xl text-base flex items-center justify-center transition-all border ${
                    active
                      ? 'bg-amber-400/25 border-amber-400 scale-105'
                      : 'bg-white/70 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-amber-400/60 hover:scale-105'
                  }`}
                >
                  {em}
                </button>
              );
            })}
          </div>
          <form onSubmit={handleCustomSubmit} className="flex items-center gap-1.5">
            <input
              type="text"
              value={customEmoji}
              onChange={(e) => setCustomEmoji(e.target.value)}
              maxLength={12}
              placeholder="Ou digite qualquer emoji..."
              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl text-xs bg-white/80 dark:bg-[#0B0D12] border border-slate-200 dark:border-white/15 text-slate-900 dark:text-white focus:outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              disabled={!customEmoji.trim()}
              className="min-h-[32px] px-3 rounded-xl bg-amber-400 text-slate-950 text-xs font-bold disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              Reagir
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
