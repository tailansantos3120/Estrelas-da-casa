import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import {
  ArrowUp,
  Award,
  Crown,
  History,
  Shield,
  Snowflake,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import {
  MilestoneRaceChart,
  ParticipantSparkline,
  StarBreakdownChart,
  StarTrajectoryChart,
} from './charts/NextGenCharts.tsx';
import { computeDaySummary, isFrozenToday, isShieldActiveNow } from '../shared/gameLogic.ts';
import { t } from '../shared/i18n.ts';
import {
  computeRankedOrder,
  detectRankOvertakes,
  extractRankStars,
  type RankOvertakeEvent,
} from '../shared/rankTracker.ts';
import {
  formatPortugueseDateHeading,
  getBrazilClockHHMM,
  getParticipantAvatar,
  getParticipantName,
  getPreviousDateStr,
  PARTICIPANT_PROFILES,
  ROTATION_ORDER,
  ROUTINE_DEFINITIONS,
} from '../shared/schedule.ts';
import type { GameState, LanguageCode, ParticipantId } from '../shared/types.ts';
import EmojiReactionBar from './EmojiReactionBar.tsx';

interface RankingTabProps {
  lang: LanguageCode;
  gameState: GameState;
  currentUserId: ParticipantId;
  rankClimbs?: Partial<Record<ParticipantId, RankOvertakeEvent>>;
  onConsumeRankClimb?: (pid: ParticipantId) => void;
  onToggleReaction?: (targetId: ParticipantId, emoji: string) => void;
}

const MILESTONES = [
  { stars: 35, label: '👻 Fantasma' },
  { stars: 45, label: '🛡️ Escudo' },
  { stars: 55, label: '👑 Chefe' },
  { stars: 65, label: '🃏 Coringa' },
];

export default function RankingTab({
  lang,
  gameState,
  currentUserId,
  rankClimbs,
  onConsumeRankClimb,
  onToggleReaction,
}: RankingTabProps) {
  const dateStr = gameState.currentDateStr;
  const day = gameState.days[dateStr];
  const nowHHMM = gameState.simulatedClockTime || getBrazilClockHHMM();

  const [chartView, setChartView] = useState<'race' | 'trajectory' | 'breakdown'>('race');
  const [activeClimbs, setActiveClimbs] = useState<Partial<Record<ParticipantId, RankOvertakeEvent>>>({});

  const ranked = useMemo(() => computeRankedOrder(gameState), [gameState]);
  const prevRankSnapshotRef = useRef<{
    order: ParticipantId[];
    stars: Record<ParticipantId, number>;
  } | null>(null);
  const climbTimersRef = useRef<Partial<Record<ParticipantId, ReturnType<typeof setTimeout>>>>({});
  const consumedTimestampsRef = useRef<Partial<Record<ParticipantId, number>>>({});

  const triggerClimbAnimation = (ev: RankOvertakeEvent) => {
    consumedTimestampsRef.current[ev.participantId] = ev.timestamp;
    setActiveClimbs((prev) => ({ ...prev, [ev.participantId]: ev }));
    const oldTimer = climbTimersRef.current[ev.participantId];
    if (oldTimer) clearTimeout(oldTimer);
    climbTimersRef.current[ev.participantId] = setTimeout(() => {
      setActiveClimbs((curr) => {
        if (!curr[ev.participantId] || curr[ev.participantId]?.timestamp !== ev.timestamp) {
          return curr;
        }
        const next = { ...curr };
        delete next[ev.participantId];
        return next;
      });
    }, 6000);
  };

  // Detect live overtakes while RankingTab is mounted
  useEffect(() => {
    const currentStars = extractRankStars(gameState);
    const prevSnap = prevRankSnapshotRef.current;
    if (prevSnap) {
      const overtakes = detectRankOvertakes(prevSnap.order, ranked, prevSnap.stars, currentStars);
      for (const ev of overtakes) {
        triggerClimbAnimation(ev);
      }
    }
    prevRankSnapshotRef.current = { order: ranked, stars: currentStars };
  }, [gameState, ranked]);

  // Also animate any recent overtake queued from another tab (e.g. PainelTab -> RankingTab)
  useEffect(() => {
    if (!rankClimbs) return;
    for (const pid of ROTATION_ORDER) {
      const ev = rankClimbs[pid];
      if (!ev) continue;
      if (consumedTimestampsRef.current[pid] === ev.timestamp) continue;
      triggerClimbAnimation(ev);
      onConsumeRankClimb?.(pid);
    }
  }, [rankClimbs, onConsumeRankClimb]);

  useEffect(() => {
    return () => {
      for (const pid of ROTATION_ORDER) {
        const tm = climbTimersRef.current[pid];
        if (tm) clearTimeout(tm);
      }
    };
  }, []);

  const activeClimbList = useMemo(
    () =>
      Object.values(activeClimbs).filter((ev): ev is RankOvertakeEvent => Boolean(ev)),
    [activeClimbs]
  );

  const leaderStars = Math.max(1, gameState.participants[ranked[0]].stars);
  const podiumOrder = [ranked[1], ranked[0], ranked[2]].filter(Boolean);

  const todaySummaryMap = useMemo(() => {
    const list = computeDaySummary(gameState, dateStr) || [];
    return Object.fromEntries(list.map((s) => [s.pid, s])) as Record<
      ParticipantId,
      (typeof list)[number]
    >;
  }, [gameState, dateStr]);

  const prevDateStr = useMemo(() => getPreviousDateStr(dateStr), [dateStr]);
  const prevSummary = useMemo(
    () => computeDaySummary(gameState, prevDateStr),
    [gameState, prevDateStr]
  );

  return (
    <div className="space-y-6">
      {/* Highlighted Year-End Goal Banner */}
      <section className="glass-gold relative overflow-hidden rounded-3xl p-5 sm:p-7">
        <div className="pointer-events-none absolute -top-20 -right-20 w-56 h-56 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/30">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-500">
              Placar Geral · Cada um por si
            </p>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white mt-1 text-balance">
              {gameState.goalBannerText || t(lang, 'goalBanner')}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1.5">
              Classificação atualizada em tempo real do 1º ao 4º colocado.
            </p>
          </div>
        </div>
      </section>

      {/* Modern Top 3 Podium + SVG Milestone Race Chart */}
      <section className="glass-card rounded-3xl p-5 sm:p-6 space-y-6">
        <LayoutGroup id="ranking-podium">
          <div className="grid grid-cols-3 gap-3 sm:gap-4 items-end pt-2">
            {podiumOrder.map((pid) => {
              const rankIdx = ranked.indexOf(pid);
              const pState = gameState.participants[pid];
              const pName = getParticipantName(gameState, pid);
              const isFirst = rankIdx === 0;
              const climb = activeClimbs[pid];
              return (
                <motion.div
                  key={pid}
                  layout
                  transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                  animate={
                    climb
                      ? {
                          scale: [1, 1.05, 1.01, 1],
                          y: [14, -6, 0],
                        }
                      : { scale: 1, y: 0 }
                  }
                  className={`relative overflow-hidden rounded-2xl p-3.5 sm:p-5 text-center transition-shadow ${
                    climb
                      ? 'glass-gold ring-2 ring-amber-400 shadow-[0_0_28px_rgba(251,191,36,0.38)]'
                      : isFirst
                      ? 'glass-gold pb-5 sm:pb-6'
                      : 'glass-subcard'
                  } ${isFirst ? 'pb-5 sm:pb-6' : ''}`}
                >
                  {climb && (
                    <motion.div
                      aria-hidden="true"
                      initial={{ x: '-110%' }}
                      animate={{ x: '220%' }}
                      transition={{ duration: 1.15, repeat: 2, ease: 'easeInOut' }}
                      className="pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-amber-200/35 to-transparent skew-x-[-18deg]"
                    />
                  )}
                  <div className="flex justify-center mb-2.5">
                    <div className="relative">
                      <img
                        src={getParticipantAvatar(gameState, pid)}
                        alt={pName}
                        referrerPolicy="no-referrer"
                        className={`rounded-2xl object-cover ${
                          isFirst
                            ? 'w-16 h-16 sm:w-20 sm:h-20 ring-2 ring-amber-400 shadow-lg shadow-amber-500/25'
                            : 'w-12 h-12 sm:w-14 sm:h-14 ring-1 ring-white/20 shadow-md'
                        }`}
                      />
                      {isFirst && (
                        <span className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-lg bg-gradient-to-br from-amber-300 to-amber-500 text-slate-950 flex items-center justify-center shadow-md">
                          <Crown className="w-3.5 h-3.5" />
                        </span>
                      )}
                      {climb && (
                        <motion.span
                          initial={{ scale: 0, y: 6 }}
                          animate={{ scale: 1, y: [0, -4, 0] }}
                          transition={{
                            scale: { type: 'spring', stiffness: 450, damping: 18 },
                            y: { duration: 1.1, repeat: Infinity, ease: 'easeInOut' },
                          }}
                          className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-lg bg-gradient-to-r from-emerald-400 to-amber-400 text-slate-950 font-mono-num text-[10px] font-extrabold shadow-md flex items-center gap-0.5 whitespace-nowrap"
                        >
                          <ArrowUp className="w-3 h-3 stroke-[3]" />
                          <span>{climb.fromRank}º→{climb.toRank}º</span>
                        </motion.span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] font-mono-num font-bold text-slate-500 dark:text-slate-400">
                    {rankIdx + 1}º lugar
                  </p>
                  <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate mt-0.5">
                    {pName}
                  </p>
                  <p className="mt-1.5 text-lg sm:text-xl font-extrabold font-mono-num text-amber-500">
                    {pState.stars} ⭐
                  </p>
                </motion.div>
              );
            })}
          </div>
        </LayoutGroup>

        {/* Next-Gen Interactive Visualization Suite */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Visualização interativa
            </p>
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/10">
              {(
                [
                  { id: 'race', label: 'Corrida 65⭐' },
                  { id: 'trajectory', label: 'Evolução Diária' },
                  { id: 'breakdown', label: 'Saldo Hoje' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setChartView(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
                    chartView === tab.id
                      ? 'bg-amber-400 text-slate-950 shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {chartView === 'race' && (
            <MilestoneRaceChart
              gameState={gameState}
              currentUserId={currentUserId}
              ranked={ranked}
            />
          )}
          {chartView === 'trajectory' && (
            <StarTrajectoryChart
              gameState={gameState}
              ranked={ranked}
              currentUserId={currentUserId}
            />
          )}
          {chartView === 'breakdown' && (
            <StarBreakdownChart
              gameState={gameState}
              dateStr={dateStr}
              ranked={ranked}
              currentUserId={currentUserId}
            />
          )}
        </div>
      </section>

      {/* Level-Up Celebration Banner when a participant overtakes another in stars */}
      <AnimatePresence>
        {activeClimbList.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: -14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 360, damping: 24 }}
            className="glass-gold rounded-3xl p-4 sm:p-5 border border-amber-400/60 shadow-[0_0_28px_rgba(251,191,36,0.25)] space-y-2"
          >
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-300 font-extrabold text-sm">
              <TrendingUp className="w-4 h-4 shrink-0" />
              <span>Subida de Nível no Ranking!</span>
              <Sparkles className="w-4 h-4 shrink-0 animate-pulse" />
            </div>
            <div className="space-y-1">
              {activeClimbList.map((ev) => {
                const climberName = getParticipantName(gameState, ev.participantId);
                const overtakenNames = ev.overtakenIds
                  .map((oid) => getParticipantName(gameState, oid))
                  .join(' e ');
                return (
                  <p
                    key={`banner-${ev.participantId}-${ev.timestamp}`}
                    className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100"
                  >
                    🚀 <strong>{climberName}</strong> subiu do{' '}
                    <span className="font-mono-num">{ev.fromRank}º</span> para o{' '}
                    <span className="font-mono-num text-amber-500 font-extrabold">
                      {ev.toRank}º lugar
                    </span>{' '}
                    ultrapassando <strong>{overtakenNames}</strong> em ⭐!
                  </p>
                );
              })}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Leaderboard List with FLIP Layout & Level-Up Highlight */}
      <LayoutGroup id="ranking-leaderboard">
        <section className="space-y-3.5">
          {ranked.map((pid, idx) => {
            const pState = gameState.participants[pid];
            const pInfo = PARTICIPANT_PROFILES[pid];
            const pName = getParticipantName(gameState, pid);
            const isMe = pid === currentUserId;
            const isFirst = idx === 0;
            const climb = activeClimbs[pid];
            const wasOvertaken = activeClimbList.some((ev) => ev.overtakenIds.includes(pid));
            const overtakenNames = climb
              ? climb.overtakenIds.map((oid) => getParticipantName(gameState, oid)).join(' e ')
              : '';
            const shield = isShieldActiveNow(gameState, pid, dateStr, nowHHMM);
            const frozen = isFrozenToday(gameState, pid, dateStr);
            const routinesDone = day
              ? ROUTINE_DEFINITIONS.filter((r) => day.routines[pid]?.[r.id]?.completed).length
              : 0;
            const nextMilestone = MILESTONES.find((m) => pState.stars < m.stars);
            const barPercent = Math.max(
              6,
              Math.min(100, Math.round((pState.stars / Math.max(leaderStars, 65)) * 100))
            );

            return (
              <motion.div
                key={pid}
                layout
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                animate={
                  climb
                    ? {
                        scale: [0.97, 1.024, 1],
                        y: [18, -4, 0],
                      }
                    : wasOvertaken
                    ? { y: [-8, 0], opacity: [0.88, 1] }
                    : { scale: 1, y: 0, opacity: 1 }
                }
                className={`relative overflow-hidden rounded-3xl p-5 sm:p-6 transition-shadow ${
                  climb
                    ? 'glass-gold ring-2 ring-amber-400 shadow-[0_0_36px_rgba(251,191,36,0.36)]'
                    : isFirst
                    ? 'glass-gold'
                    : isMe
                    ? 'glass-card ring-1 ring-amber-400/45'
                    : 'glass-card'
                }`}
              >
                {/* Sweeping celebratory shimmer overlay */}
                {climb && (
                  <motion.div
                    aria-hidden="true"
                    initial={{ x: '-100%' }}
                    animate={{ x: '220%' }}
                    transition={{ duration: 1.25, repeat: 2, ease: 'easeInOut' }}
                    className="pointer-events-none absolute inset-y-0 w-2/5 bg-gradient-to-r from-transparent via-amber-200/35 to-transparent skew-x-[-20deg]"
                  />
                )}

                {/* Animated Level-Up Ribbon */}
                <AnimatePresence>
                  {climb && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.94 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.28 }}
                      className="relative mb-3.5 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-300 to-emerald-400 text-slate-950 px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 shadow-md shadow-amber-500/20"
                    >
                      <div className="flex items-center gap-2 text-xs sm:text-sm font-extrabold">
                        <motion.span
                          animate={{ y: [0, -3, 0] }}
                          transition={{ duration: 0.85, repeat: Infinity, ease: 'easeInOut' }}
                          className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-slate-950/15"
                        >
                          <TrendingUp className="w-4 h-4" />
                        </motion.span>
                        <span>
                          SUBIU DE NÍVEL! Ultrapassou {overtakenNames}
                        </span>
                      </div>
                      <span className="font-mono-num text-xs font-extrabold px-2.5 py-0.5 rounded-lg bg-slate-950 text-amber-300 whitespace-nowrap">
                        {climb.fromRank}º → {climb.toRank}º lugar
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="relative flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="relative shrink-0">
                      <motion.div
                        animate={climb ? { scale: [1, 1.2, 1], rotate: [0, -6, 6, 0] } : {}}
                        transition={{ duration: 0.65, repeat: climb ? 1 : 0 }}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-mono-num font-extrabold text-sm shadow-sm ${
                          idx === 0
                            ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-slate-950'
                            : idx === 1
                            ? 'bg-slate-300/90 dark:bg-slate-600/80 text-slate-900 dark:text-white'
                            : idx === 2
                            ? 'bg-amber-700/85 text-white'
                            : 'bg-slate-200/70 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {idx + 1}º
                      </motion.div>
                      {climb && (
                        <motion.span
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: [0, -4, 0] }}
                          transition={{ y: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } }}
                          className="absolute -top-2.5 -right-2 px-1 py-0.5 rounded-md bg-emerald-500 text-slate-950 font-mono-num text-[9px] font-extrabold leading-none shadow-sm flex items-center"
                        >
                          ↑{climb.fromRank - climb.toRank}
                        </motion.span>
                      )}
                    </div>

                    <img
                      src={getParticipantAvatar(gameState, pid)}
                      alt={pName}
                      referrerPolicy="no-referrer"
                      className={`w-14 h-14 rounded-2xl object-cover shrink-0 shadow-md ${
                        climb || isFirst ? 'ring-2 ring-amber-400' : 'ring-1 ring-white/20'
                      }`}
                    />

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
                        {pName}
                      </h2>
                      {isFirst && <Crown className="w-4 h-4 text-amber-400 shrink-0" />}
                      {isMe && (
                        <span className="text-xs font-semibold text-amber-500">(Você)</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {pInfo.age} anos · Rotinas:{' '}
                      <span className="font-mono-num font-semibold">{routinesDone}/7</span> ·{' '}
                      Tarefas hoje:{' '}
                      <span className="font-mono-num font-semibold">
                        {todaySummaryMap[pid]?.completedTasks.length ?? 0}
                        {(todaySummaryMap[pid]?.fantasmaCanceledTasks.length ?? 0) > 0
                          ? ` (+${todaySummaryMap[pid].fantasmaCanceledTasks.length}👻)`
                          : ''}
                      </span>
                      {shield ? ' · 🛡️ Escudo ativo' : ''}
                      {frozen ? ' · ❄️ Congelado' : ''}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="flex items-center justify-end gap-1 text-2xl sm:text-3xl font-extrabold font-mono-num text-amber-500">
                    <span>{pState.stars}</span>
                    <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                  </div>
                  <p className="text-[11px] font-mono-num font-semibold text-emerald-500 mt-0.5">
                    {(todaySummaryMap[pid]?.netStars ?? 0) > 0
                      ? `+${todaySummaryMap[pid]?.netStars}`
                      : todaySummaryMap[pid]?.netStars ?? 0}{' '}
                    ⭐ hoje
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {nextMilestone
                      ? `Faltam ${nextMilestone.stars - pState.stars} ⭐ p/ ${nextMilestone.label}`
                      : 'Todas as metas liberadas!'}
                  </p>
                </div>
              </div>

              {/* Sparkline + Progress toward 65⭐ */}
              <div className="mt-3.5 space-y-2">
                <ParticipantSparkline gameState={gameState} participantId={pid} />
                <div className="h-2 rounded-full bg-slate-200/70 dark:bg-white/[0.07] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${barPercent}%`, backgroundColor: pInfo.accentColor }}
                  />
                </div>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <Award className="w-3.5 h-3.5 text-amber-400" />
                    Itens: 👻 {pState.inventory.fantasma} · 🛡️ {pState.inventory.escudo} · 👑{' '}
                    {pState.inventory.chefe} · 🃏 {pState.inventory.coringa}
                  </span>
                  {shield && (
                    <span className="text-emerald-500 flex items-center gap-1 font-medium">
                      <Shield className="w-3 h-3" /> Protegido
                    </span>
                  )}
                  {frozen && (
                    <span className="text-sky-400 flex items-center gap-1 font-medium">
                      <Snowflake className="w-3 h-3" /> Congelado
                    </span>
                  )}
                </div>

                {onToggleReaction && (
                  <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-white/[0.07]">
                    <EmojiReactionBar
                      reactions={pState.reactions}
                      gameState={gameState}
                      currentUserId={currentUserId}
                      onToggleEmoji={(emoji) => onToggleReaction(pid, emoji)}
                      quickSuggestions={
                        (todaySummaryMap[pid]?.netStars ?? 0) < 0
                          ? ['🤬', '🤣', '😭']
                          : ['🔥', '🤣', '👑']
                      }
                      compact
                    />
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
        </section>
      </LayoutGroup>

      {prevSummary && (
        <section className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <History className="w-5 h-5 text-amber-400" />
              <span>Tarefas &amp; Estrelas do Dia Anterior</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {formatPortugueseDateHeading(prevDateStr)}
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {prevSummary.map((item) => {
              const pName = getParticipantName(gameState, item.pid);
              return (
                <div key={item.pid} className="glass-subcard rounded-2xl p-4 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <img
                        src={getParticipantAvatar(gameState, item.pid)}
                        alt={pName}
                        referrerPolicy="no-referrer"
                        className="w-8 h-8 rounded-xl object-cover shrink-0"
                      />
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {pName}
                      </p>
                    </div>
                    <span
                      className={`font-mono-num text-xs font-extrabold ${
                        item.netStars >= 0 ? 'text-emerald-500' : 'text-rose-400'
                      }`}
                    >
                      {item.netStars > 0 ? `+${item.netStars}` : item.netStars} ⭐
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Rotinas <strong className="font-mono-num">{item.completedRoutinesCount}/7</strong> ·{' '}
                    Tarefas <strong className="font-mono-num">{item.completedTasks.length}</strong>
                  </p>
                  <p className="text-xs text-slate-700 dark:text-slate-200">
                    {item.completedTasks.length > 0
                      ? item.completedTasks.map((ct) => ct.def.label).join(' · ')
                      : 'Nenhuma tarefa registrada'}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
