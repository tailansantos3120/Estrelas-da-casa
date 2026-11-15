import React from 'react';
import {
  ArrowLeft,
  Check,
  Moon,
  SlidersHorizontal,
} from 'lucide-react';
import { getParticipantName } from '../shared/schedule.ts';
import type { GameState, NotificationPreferences, ParticipantId, SoundThemeId } from '../shared/types.ts';
import SoundThemePicker from './SoundThemePicker.tsx';

interface NotifPreferencesViewProps {
  gameState: GameState;
  currentUserId: ParticipantId;
  onBack: () => void;
  onSavePreferences: (prefs: Partial<NotificationPreferences>) => Promise<unknown>;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onSelectSoundTheme: (themeId: SoundThemeId) => Promise<unknown>;
}

export default function NotifPreferencesView({
  gameState,
  currentUserId,
  onBack,
  onSavePreferences,
  soundEnabled = true,
  onToggleSound,
  onSelectSoundTheme,
}: NotifPreferencesViewProps) {
  const prefs = gameState.participants[currentUserId].notificationPreferences;

  const toggle = (key: keyof NotificationPreferences) => {
    onSavePreferences({ [key]: !prefs[key] });
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="min-h-[44px] px-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13161E] flex items-center gap-2 text-sm font-semibold"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Voltar</span>
      </button>

      <section className="rounded-3xl bg-white dark:bg-[#13161E] border border-slate-200 dark:border-white/10 p-5 space-y-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-amber-400" />
            <span>Filtros de Alertas no Jogo</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Escolha quais avisos internos e sons você deseja ver enquanto usa o jogo.
          </p>
        </div>

        {/* Personal Ringtone / Sound Theme */}
        <SoundThemePicker
          currentTheme={gameState.participants[currentUserId]?.soundTheme}
          participantName={getParticipantName(gameState, currentUserId)}
          soundEnabled={soundEnabled}
          onToggleSound={onToggleSound}
          onSelectTheme={onSelectSoundTheme}
        />

        {/* Category toggles (in-game only) */}
        <div className="divide-y divide-slate-100 dark:divide-white/5">
          {(
            [
              {
                key: 'taskReminders',
                title: 'Lembretes de tarefas e rotinas',
                desc: 'Aviso interno no jogo antes do limite de horário vencer.',
              },
              {
                key: 'rankingUpdates',
                title: 'Atualizações de ranking e estrelas ⭐',
                desc: 'Quando alguém ganha estrela ou muda de posição.',
              },
              {
                key: 'punishmentAlerts',
                title: 'Punições e denúncias',
                desc: 'Rotina fora do prazo, punição de fim de semana e denúncias.',
              },
              {
                key: 'drawResults',
                title: 'Resultados de sorteios e dado',
                desc: 'Fantasma, Chefe, Escudo, Coringa e jogadas do dado.',
              },
              {
                key: 'antiOverloadEnabled',
                title: 'Filtro anti-sobrecarga (5 min cooldown)',
                desc: 'Agrupa alertas repetidos dentro do jogo para evitar excesso de avisos.',
              },
            ] as const
          ).map((item) => {
            const active = Boolean(prefs[item.key]);
            return (
              <div
                key={item.key}
                className="py-3.5 flex items-center justify-between gap-4"
              >
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {item.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {item.desc}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={active}
                  onClick={() => toggle(item.key)}
                  className={`min-w-[54px] min-h-[32px] p-1 rounded-full transition-colors flex items-center ${
                    active ? 'bg-amber-400 justify-end' : 'bg-slate-300 dark:bg-white/15 justify-start'
                  }`}
                >
                  <span className="w-6 h-6 rounded-full bg-white shadow-sm flex items-center justify-center">
                    {active && <Check className="w-3.5 h-3.5 text-slate-950" />}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Reminder lead time */}
        <div className="pt-2 space-y-2">
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            Antecedência dos lembretes de prazo
          </p>
          <div className="grid grid-cols-3 gap-2">
            {([10, 15, 30] as const).map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => onSavePreferences({ reminderMinutesBefore: mins })}
                className={`min-h-[44px] rounded-[14px] text-xs font-bold border transition-all ${
                  prefs.reminderMinutesBefore === mins
                    ? 'bg-amber-400 text-slate-950 border-amber-400'
                    : 'border-slate-200 dark:border-white/15 text-slate-600 dark:text-slate-300'
                }`}
              >
                {mins} min antes
              </button>
            ))}
          </div>
        </div>

        {/* Quiet Hours */}
        <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-white/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-amber-400" />
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                Horário Silencioso
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.quietHoursEnabled}
              onClick={() => toggle('quietHoursEnabled')}
              className={`min-w-[50px] min-h-[30px] p-1 rounded-full transition-colors flex items-center ${
                prefs.quietHoursEnabled
                  ? 'bg-amber-400 justify-end'
                  : 'bg-slate-300 dark:bg-white/15 justify-start'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
            </button>
          </div>
          {prefs.quietHoursEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Início</label>
                <input
                  type="time"
                  value={prefs.quietStart}
                  onChange={(e) => onSavePreferences({ quietStart: e.target.value })}
                  className="modern-input w-full px-3 py-2 bg-white dark:bg-[#13161E] border border-slate-300 dark:border-white/15"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Fim</label>
                <input
                  type="time"
                  value={prefs.quietEnd}
                  onChange={(e) => onSavePreferences({ quietEnd: e.target.value })}
                  className="modern-input w-full px-3 py-2 bg-white dark:bg-[#13161E] border border-slate-300 dark:border-white/15"
                />
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
