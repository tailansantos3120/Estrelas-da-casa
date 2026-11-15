import React from 'react';
import { Check, Music, Play, Volume2, VolumeX } from 'lucide-react';
import {
  getSoundThemeMeta,
  previewSoundTheme,
  SOUND_THEMES,
} from '../services/starCelebrationAudio.ts';
import type { SoundThemeId } from '../shared/types.ts';

interface SoundThemePickerProps {
  currentTheme?: SoundThemeId;
  participantName: string;
  soundEnabled: boolean;
  onToggleSound?: () => void;
  onSelectTheme: (themeId: SoundThemeId) => Promise<unknown> | void;
  compact?: boolean;
}

export default function SoundThemePicker({
  currentTheme = 'classico',
  participantName,
  soundEnabled,
  onToggleSound,
  onSelectTheme,
  compact = false,
}: SoundThemePickerProps) {
  const activeMeta = getSoundThemeMeta(currentTheme);

  const handleChoose = async (themeId: SoundThemeId) => {
    previewSoundTheme(themeId);
    await onSelectTheme(themeId);
  };

  return (
    <div
      className={`rounded-2xl bg-slate-50/90 dark:bg-[#0B0D12] border border-slate-200 dark:border-white/10 ${
        compact ? 'p-3.5 space-y-3' : 'p-4 space-y-3.5'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-400/15 border border-amber-400/35 flex items-center justify-center text-amber-500 shrink-0">
            <Music className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
              Som do toque de {participantName}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Ativo: <strong className="text-amber-500">{activeMeta.emoji} {activeMeta.name}</strong> · Cada participante escolhe o seu
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => previewSoundTheme(activeMeta.id)}
            className="min-h-[36px] px-3 rounded-xl border border-amber-400/40 bg-amber-400/15 text-amber-600 dark:text-amber-300 text-xs font-bold hover:bg-amber-400/25 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Ouvir</span>
          </button>

          {onToggleSound && (
            <button
              type="button"
              onClick={onToggleSound}
              aria-label={soundEnabled ? 'Silenciar sons do jogo' : 'Ativar sons do jogo'}
              className={`min-h-[36px] px-3 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                soundEnabled
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{soundEnabled ? 'Som ativo' : 'Silenciado'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {SOUND_THEMES.map((theme) => {
          const isSelected = activeMeta.id === theme.id;
          return (
            <div
              key={theme.id}
              className={`rounded-2xl border p-2.5 flex items-center justify-between gap-2 transition-all ${
                isSelected
                  ? 'bg-amber-400/15 border-amber-400 ring-1 ring-amber-400/40 shadow-sm'
                  : 'bg-white dark:bg-[#13161E] border-slate-200/80 dark:border-white/10 hover:border-amber-400/50'
              }`}
            >
              <button
                type="button"
                onClick={() => handleChoose(theme.id)}
                className="flex-1 min-w-0 text-left flex items-center gap-2.5 focus:outline-none"
              >
                <span className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200/70 dark:border-white/10 flex items-center justify-center text-lg shrink-0">
                  {theme.emoji}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {theme.name}
                    </p>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    {theme.subtitle}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  previewSoundTheme(theme.id);
                }}
                aria-label={`Ouvir prévia do toque ${theme.name}`}
                title={`Ouvir ${theme.name}`}
                className="w-8 h-8 rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-white/5 hover:border-amber-400/70 text-slate-500 dark:text-slate-300 hover:text-amber-500 flex items-center justify-center shrink-0 transition-colors"
              >
                <Volume2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
