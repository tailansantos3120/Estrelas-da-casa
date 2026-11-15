import React, { useMemo, useState } from 'react';
import { ArrowLeft, Bell, BellRing, SlidersHorizontal } from 'lucide-react';
import {
  computeActionableAlerts,
  filterCurrentDayNotifications,
  mapNotificationTypeToCategory,
} from '../shared/notificationFilter.ts';
import { formatPortugueseDateHeading, getBrazilClockHHMM, getParticipantAvatar, getParticipantName, PARTICIPANT_PROFILES } from '../shared/schedule.ts';
import type { GameState, NotificationCategory, ParticipantId } from '../shared/types.ts';
import EmojiReactionBar from './EmojiReactionBar.tsx';

interface NotificationsViewProps {
  gameState: GameState;
  currentUserId: ParticipantId;
  onBack: () => void;
  onOpenPreferences: () => void;
  onToggleReaction: (notificationId: string, emoji: string) => void;
}

export default function NotificationsView({
  gameState,
  currentUserId,
  onBack,
  onOpenPreferences,
  onToggleReaction,
}: NotificationsViewProps) {
  const [catFilter, setCatFilter] = useState<'all' | NotificationCategory>('all');

  const userPrefs = gameState.participants[currentUserId].notificationPreferences;

  const nowHHMM = useMemo(() => {
    return gameState.simulatedClockTime || getBrazilClockHHMM();
  }, [gameState.simulatedClockTime]);

  const actionableAlerts = useMemo(
    () => computeActionableAlerts(gameState, currentUserId, gameState.currentDateStr, nowHHMM),
    [gameState, currentUserId, nowHHMM]
  );

  const todayNotifications = useMemo(
    () => filterCurrentDayNotifications(gameState.notifications, gameState.currentDateStr),
    [gameState.notifications, gameState.currentDateStr]
  );

  const filtered = useMemo(() => {
    return todayNotifications.filter((n) => {
      if (catFilter !== 'all' && mapNotificationTypeToCategory(n.type) !== catFilter) return false;
      return true;
    });
  }, [todayNotifications, catFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="glass-subcard min-h-[44px] px-3.5 rounded-2xl flex items-center gap-2 text-sm font-semibold hover:border-amber-400/50 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar</span>
        </button>

        <button
          type="button"
          onClick={onOpenPreferences}
          className="glass-gold min-h-[44px] px-3.5 rounded-2xl text-amber-500 flex items-center gap-2 text-xs font-bold hover:brightness-105 transition-all"
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Personalizar alertas</span>
        </button>
      </div>

      {actionableAlerts.length > 0 && (
        <section className="glass-gold rounded-3xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BellRing className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Lembretes ativos agora ({getParticipantName(gameState, currentUserId)})
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300">
                  Poderes para usar, tarefas liberadas e ações pendentes neste momento
                </p>
              </div>
            </div>
            <span className="font-mono-num text-xs font-bold text-amber-500">
              {actionableAlerts.length} ativo{actionableAlerts.length > 1 ? 's' : ''}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {actionableAlerts.map((al) => (
              <div key={al.id} className="glass-subcard rounded-2xl p-3">
                <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                  {al.title}
                </p>
                <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  {al.detail}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {gameState.weekendPunishments.some((wp) => !wp.completed) && (
        <section className="glass-subcard rounded-3xl p-4 sm:p-5 border border-rose-500/35 bg-rose-500/[0.06] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              ⚖️ Registro da Punição Ativa
            </h2>
            <span className="text-[11px] font-mono-num font-bold text-rose-500">
              -3 ⭐ na origem
            </span>
          </div>
          <div className="space-y-2">
            {gameState.weekendPunishments
              .filter((wp) => !wp.completed)
              .map((wp) => {
                const originTask = gameState.days[wp.dateStr]?.tasks?.[wp.taskId];
                const rescueWinner =
                  originTask?.rescue?.currentAssigneeId || originTask?.completedBy || wp.coveringForId;
                const rescueReward = originTask?.rescue?.rewardStars ?? 2;
                const punishedName = getParticipantName(gameState, wp.punishedId);
                const coverName = getParticipantName(gameState, wp.coveringForId);
                const winnerName = getParticipantName(gameState, rescueWinner);
                const dayLabel =
                  wp.chosenDay === 'sabado'
                    ? 'SÁBADO'
                    : wp.chosenDay === 'domingo'
                    ? 'DOMINGO'
                    : 'A definir';
                return (
                  <div
                    key={wp.id}
                    className="rounded-2xl border border-rose-500/25 bg-white/80 dark:bg-[#0B0D12]/80 p-3 text-xs text-slate-700 dark:text-slate-200 leading-relaxed"
                  >
                    <p className="font-bold text-slate-900 dark:text-white">
                      {wp.taskLabel} ({wp.dateStr.split('-').reverse().join('/')}) — Dono original:{' '}
                      {punishedName} (-3 ⭐)
                    </p>
                    <p className="mt-1">
                      {punishedName} não fez no prazo e perdeu <strong>-3 ⭐</strong>. No sorteio do
                      repasse deu <strong>{winnerName}</strong>, que concluiu a tarefa (+
                      {rescueReward} ⭐) e puniu <strong>{punishedName}</strong> para{' '}
                      <strong>{dayLabel}</strong> cobrir as tarefas de <strong>{coverName}</strong>{' '}
                      (apenas tarefas dão +1 ⭐ automático para {coverName}).
                    </p>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      <section className="glass-card rounded-3xl p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2.5">
            <Bell className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                Notificações de hoje
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {formatPortugueseDateHeading(gameState.currentDateStr)} · reaja com emoji em qualquer evento
              </p>
            </div>
          </div>
          <span className="font-mono-num text-xs font-bold text-amber-500">
            {todayNotifications.length} hoje
          </span>
        </div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {(
            [
              { id: 'all', label: 'Tudo' },
              { id: 'rankingUpdates', label: 'Ranking & ⭐' },
              { id: 'drawResults', label: 'Sorteios & Dado' },
              { id: 'punishmentAlerts', label: 'Punições & Denúncias' },
              { id: 'taskReminders', label: 'Sistema & Metas' },
            ] as const
          ).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCatFilter(c.id)}
              className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold transition-all ${
                catFilter === c.id
                  ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                  : 'glass-subcard text-slate-600 dark:text-slate-300 hover:border-amber-400/50'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="divide-y divide-slate-200/60 dark:divide-white/[0.06]">
          {filtered.map((n) => {
            const cat = mapNotificationTypeToCategory(n.type);
            const mutedByPref = !userPrefs[cat];
            const actor = n.actorId ? PARTICIPANT_PROFILES[n.actorId] : null;
            const isLoss = (n.starDelta !== undefined && n.starDelta < 0) || n.type === 'penalty' || n.type === 'denuncia' || n.type === 'punishment';
            return (
              <div
                key={n.id}
                className={`py-3.5 flex items-start gap-3 ${mutedByPref ? 'opacity-50' : ''}`}
              >
                {actor && n.actorId ? (
                  <img
                    src={getParticipantAvatar(gameState, n.actorId)}
                    alt={getParticipantName(gameState, n.actorId)}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-xl object-cover shrink-0 mt-0.5 ring-1 ring-white/15"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                    <Bell className="w-4 h-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {n.title}
                      </p>
                      <span className="text-[11px] font-mono-num text-slate-400 shrink-0">
                        {n.timestamp}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                      {n.message}
                    </p>
                  </div>

                  <EmojiReactionBar
                    reactions={n.reactions}
                    gameState={gameState}
                    currentUserId={currentUserId}
                    onToggleEmoji={(emoji) => onToggleReaction(n.id, emoji)}
                    quickSuggestions={isLoss ? ['🤬', '🤣', '😭'] : ['🔥', '🤣', '👏']}
                    compact
                  />
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Nenhuma notificação registrada hoje neste filtro.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
