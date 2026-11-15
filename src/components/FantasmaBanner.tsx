import React from 'react';
import { CheckCircle2, Ghost, Sparkles } from 'lucide-react';
import { getEffectiveAssignee } from '../shared/gameLogic.ts';
import { t } from '../shared/i18n.ts';
import { getEffectiveTaskDefinition, getParticipantAvatar, getParticipantName, TASK_DEFINITIONS } from '../shared/schedule.ts';
import type { GameState, LanguageCode, ParticipantId, TaskId } from '../shared/types.ts';

interface FantasmaBannerProps {
  lang: LanguageCode;
  gameState: GameState;
  currentUserId: ParticipantId;
  onTriggerPendingFantasma: (taskId: TaskId) => Promise<unknown>;
  onSavePendingFantasma: () => Promise<unknown>;
  onRespondDraw: (drawId: string, accept: boolean) => Promise<unknown>;
  onCompleteDrawTask: (drawId: string) => Promise<unknown>;
}

export default function FantasmaBanner({
  lang,
  gameState,
  currentUserId,
  onTriggerPendingFantasma,
  onSavePendingFantasma,
  onRespondDraw,
  onCompleteDrawTask,
}: FantasmaBannerProps) {
  const dateStr = gameState.currentDateStr;
  const day = gameState.days[dateStr];
  if (!day) return null;

  const pendingQueue = day.pendingFantasmaQueue?.[currentUserId] || [];
  const activeDraws = gameState.fantasmaDraws.filter(
    (d) =>
      d.dateStr === dateStr &&
      (d.status === 'pending' || d.status === 'accepted') &&
      (d.ownerId === currentUserId || d.drawnParticipantId === currentUserId)
  );

  if (pendingQueue.length === 0 && activeDraws.length === 0) {
    return null;
  }

  // Available tasks owned by current user to cancel via pending Fantasma
  const myAvailableTasks = TASK_DEFINITIONS.filter((def) => {
    const tState = day.tasks[def.id];
    if (!tState || tState.completedBy || tState.canceledByFantasma) return false;
    return getEffectiveAssignee(day, def.id) === currentUserId;
  });

  return (
    <section
      aria-label="Sorteios do Fantasma ativos"
      className="glass-gold rounded-3xl p-5 sm:p-6 transition-all"
    >
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <h2 className="text-sm sm:text-base font-extrabold tracking-tight text-amber-600 dark:text-amber-300 flex items-center gap-2">
          <span>{t(lang, 'fantasmaCardTitle')}</span>
        </h2>
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-200/80 whitespace-nowrap">
          Salvo até responder
        </span>
      </div>

      {/* Pending Fantasma task selection (e.g. Carol's Rodada 2 pending draws) */}
      {pendingQueue.length > 0 && (
        <div className="glass-subcard mb-3.5 rounded-2xl p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Ghost className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Sorteios da Rodada {pendingQueue[0].round} pendentes ({pendingQueue[0].remaining} restante
                {pendingQueue[0].remaining > 1 ? 's' : ''})
              </span>
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              Escolha 1 tarefa sua para cancelar e sortear agora, ou acumule em Seus Itens para usar quando quiser:
            </p>
          </div>
          {myAvailableTasks.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {myAvailableTasks.map((taskDef) => (
                <button
                  key={taskDef.id}
                  type="button"
                  onClick={() => onTriggerPendingFantasma(taskDef.id)}
                  className="min-h-[44px] px-3.5 py-2 rounded-[14px] bg-gradient-to-r from-amber-400 to-yellow-300 hover:from-amber-300 hover:to-yellow-200 text-slate-950 text-xs sm:text-sm font-bold shadow-md shadow-amber-500/20 transition-all active:scale-[0.98] flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Usar Fantasma em {getEffectiveTaskDefinition(gameState, taskDef.id).label}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-amber-600 dark:text-amber-300 font-medium">
              Você não tem mais tarefas pendentes hoje — acumule nos seus itens para usar outro dia!
            </p>
          )}
          <button
            type="button"
            onClick={onSavePendingFantasma}
            className="w-full min-h-[40px] rounded-[12px] border border-amber-400/50 bg-amber-400/10 hover:bg-amber-400/20 text-xs font-bold text-amber-700 dark:text-amber-300 transition-colors"
          >
            Guardar nos itens (acumular)
          </button>
        </div>
      )}

      {/* Active draws waiting for response or completion */}
      <div className="space-y-3.5">
        {activeDraws.map((draw) => {
          const ownerName = getParticipantName(gameState, draw.ownerId);
          const drawnName = getParticipantName(gameState, draw.drawnParticipantId);
          const isDrawnUser = draw.drawnParticipantId === currentUserId;

          return (
            <div
              key={draw.id}
              className="glass-subcard rounded-2xl p-4"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2.5">
                  <img
                    src={getParticipantAvatar(gameState, draw.drawnParticipantId)}
                    alt={drawnName}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-xl object-cover ring-2 ring-amber-400/60"
                  />
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {ownerName} usou Fantasma em {draw.taskLabel}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Sorteado (Rodada {draw.round}): <strong>{drawnName}</strong> · vale +3 ⭐ para {drawnName}
                    </p>
                  </div>
                </div>
              </div>

              {draw.status === 'pending' && isDrawnUser && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <button
                    type="button"
                    onClick={() => onRespondDraw(draw.id, true)}
                    className="min-h-[48px] rounded-[14px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm sm:text-base shadow-md shadow-emerald-500/20 active:scale-[0.98] transition-all"
                  >
                    {t(lang, 'wantBtn')} (+3 ⭐)
                  </button>
                  <button
                    type="button"
                    onClick={() => onRespondDraw(draw.id, false)}
                    className="min-h-[48px] rounded-[14px] bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/15 text-slate-900 dark:text-white font-extrabold text-sm sm:text-base active:scale-[0.98] transition-all"
                  >
                    {t(lang, 'dontWantBtn')}
                  </button>
                </div>
              )}

              {draw.status === 'pending' && !isDrawnUser && (
                <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-300">
                  Aguardando resposta de {drawnName}...
                </p>
              )}

              {draw.status === 'accepted' && isDrawnUser && (
                <button
                  type="button"
                  onClick={() => onCompleteDrawTask(draw.id)}
                  className="mt-3 w-full min-h-[48px] rounded-[14px] bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Fiz {draw.taskLabel} — Receber +3 ⭐</span>
                </button>
              )}

              {draw.status === 'accepted' && !isDrawnUser && (
                <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {drawnName} aceitou fazer {draw.taskLabel} (+3 ⭐ ao concluir).
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
