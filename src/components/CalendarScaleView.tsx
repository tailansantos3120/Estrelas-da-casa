import React, { useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, History } from 'lucide-react';
import { computeDaySummary } from '../shared/gameLogic.ts';
import {
  buildCalendarDatabase,
  formatPortugueseDateHeading,
  getEffectiveTaskDefinition,
  getParticipantName,
  ROTATION_ORDER,
  TASK_DEFINITIONS,
} from '../shared/schedule.ts';
import type { GameState, ParticipantId } from '../shared/types.ts';

interface CalendarScaleViewProps {
  gameState?: GameState;
  currentDateStr: string;
  currentUserId: ParticipantId;
  onBack: () => void;
}

export default function CalendarScaleView({
  gameState,
  currentDateStr,
  currentUserId,
  onBack,
}: CalendarScaleViewProps) {
  const allDays = useMemo(() => buildCalendarDatabase('2026-11-11', '2026-12-31'), []);
  const [selectedWeek, setSelectedWeek] = useState(0);

  const weeks = useMemo(() => {
    const chunks: Array<typeof allDays> = [];
    for (let i = 0; i < allDays.length; i += 7) {
      chunks.push(allDays.slice(i, i + 7));
    }
    return chunks;
  }, [allDays]);

  const activeDays = weeks[selectedWeek] || [];

  const recordedDaySummaries = useMemo(() => {
    if (!gameState) return [];
    return Object.keys(gameState.days)
      .sort((a, b) => b.localeCompare(a))
      .map((dKey) => ({
        dateStr: dKey,
        rows: computeDaySummary(gameState, dKey) || [],
      }))
      .filter((entry) => entry.rows.length > 0);
  }, [gameState]);

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

      <section className="rounded-3xl bg-white dark:bg-[#13161E] border border-slate-200 dark:border-white/10 p-4 sm:p-5 space-y-4">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-amber-400" />
            <span>Escala Contínua até 31 de Dezembro</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Rodízio contínuo {ROTATION_ORDER.map((id) => getParticipantName(gameState, id)).join(' → ')} calculado automaticamente até 31/12/2026.
          </p>
        </div>

        {/* Week Selector */}
        <div className="flex flex-wrap gap-2">
          {weeks.map((wk, idx) => {
            const first = wk[0]?.dateStr.slice(5).split('-').reverse().join('/');
            const last = wk[wk.length - 1]?.dateStr.slice(5).split('-').reverse().join('/');
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedWeek(idx)}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                  selectedWeek === idx
                    ? 'bg-amber-400 text-slate-950 border-amber-400'
                    : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300'
                }`}
              >
                Semana {idx + 1} ({first}–{last})
              </button>
            );
          })}
        </div>

        {/* Responsive Table */}
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pr-3 font-semibold">Tarefa</th>
                {activeDays.map((d) => {
                  const isToday = d.dateStr === currentDateStr;
                  return (
                    <th
                      key={d.dateStr}
                      className={`py-2.5 px-2 font-semibold whitespace-nowrap ${
                        isToday ? 'text-amber-500' : ''
                      }`}
                    >
                      {d.dayOfWeek} {d.dateStr.slice(8)}/{d.dateStr.slice(5, 7)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {TASK_DEFINITIONS.map((tDef) => (
                <tr key={tDef.id}>
                  <td className="py-2.5 pr-3 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {getEffectiveTaskDefinition(gameState, tDef.id).label}
                  </td>
                  {activeDays.map((d) => {
                    const pid = d.assignments[tDef.id];
                    const recordedTask = gameState?.days[d.dateStr]?.tasks[tDef.id];
                    const actualPid = recordedTask?.completedBy || pid;
                    const isMe = actualPid === currentUserId;
                    const isDone = Boolean(recordedTask?.completedBy);
                    const isFantasma = Boolean(recordedTask?.canceledByFantasma);
                    return (
                      <td
                        key={d.dateStr}
                        className={`py-2.5 px-2 whitespace-nowrap ${
                          isMe
                            ? 'font-bold text-amber-500'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {actualPid ? getParticipantName(gameState, actualPid) : '—'}
                        {isDone ? (isFantasma ? ' 👻✓' : ' ✓') : isFantasma ? ' 👻' : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {recordedDaySummaries.length > 0 && (
        <section className="rounded-3xl bg-white dark:bg-[#13161E] border border-slate-200 dark:border-white/10 p-4 sm:p-5 space-y-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <History className="w-5 h-5 text-amber-400" />
              <span>Histórico de Tarefas &amp; Estrelas por Dia</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Veja exatamente o que cada participante concluiu e quantas estrelas ganhou em cada dia.
            </p>
          </div>

          <div className="space-y-4">
            {recordedDaySummaries.map((entry) => (
              <div
                key={entry.dateStr}
                className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0D12] p-3.5 sm:p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                    {formatPortugueseDateHeading(entry.dateStr)}
                  </p>
                  {entry.dateStr === currentDateStr && (
                    <span className="text-[11px] font-bold text-amber-500">Hoje</span>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {entry.rows.map((r) => (
                    <div
                      key={r.pid}
                      className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#13161E] p-3 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {getParticipantName(gameState, r.pid)}
                        </span>
                        <span
                          className={`font-mono-num font-extrabold ${
                            r.netStars >= 0 ? 'text-emerald-500' : 'text-rose-400'
                          }`}
                        >
                          {r.netStars > 0 ? `+${r.netStars}` : r.netStars} ⭐ no dia
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Rotinas {r.completedRoutinesCount}/7
                        {r.routinePenaltyStars > 0 ? ` (-${r.routinePenaltyStars} ⭐ não feitas)` : ''} · Tarefas feitas:{' '}
                        {r.completedTasks.length}
                        {r.taskPenaltyStars > 0 ? ` (-${r.taskPenaltyStars} ⭐ não feitas)` : ''}
                      </p>
                      <p className="text-[11px] text-slate-700 dark:text-slate-200">
                        {r.completedTasks.length > 0
                          ? r.completedTasks.map((ct) => ct.def.label).join(' · ')
                          : 'Nenhuma tarefa concluída'}
                      </p>
                      {r.fantasmaCanceledTasks.length > 0 && (
                        <p className="text-[11px] text-amber-500">
                          👻 Fantasma: {r.fantasmaCanceledTasks.map((ft) => ft.def.label).join(', ')}
                        </p>
                      )}
                      {[r.round1Summary, r.round2Summary].map((rs) =>
                        rs ? (
                          <p key={`${r.pid}-cal-r${rs.round}`} className="text-[11px] text-slate-500 dark:text-slate-400">
                            <strong className="text-slate-700 dark:text-slate-200">R{rs.round}:</strong> {rs.powerTitle} ·{' '}
                            {rs.finalOutcome}
                          </p>
                        ) : null
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
