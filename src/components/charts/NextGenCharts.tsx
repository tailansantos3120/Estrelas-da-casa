import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { computeDaySummary } from '../../shared/gameLogic.ts';
import {
  getParticipantAvatar,
  getParticipantName,
  PARTICIPANT_PROFILES,
  ROTATION_ORDER,
  ROUTINE_DEFINITIONS,
  TASK_DEFINITIONS,
} from '../../shared/schedule.ts';
import type { GameState, ParticipantId } from '../../shared/types.ts';

const MILESTONES = [
  { stars: 35, emoji: '👻', label: 'Fantasma' },
  { stars: 45, emoji: '🛡️', label: 'Escudo' },
  { stars: 55, emoji: '👑', label: 'Chefe' },
  { stars: 65, emoji: '🃏', label: 'Coringa' },
] as const;

const GRADIENT_PALETTE: Record<
  ParticipantId,
  { from: string; to: string; soft: string; glow: string }
> = {
  tailan: {
    from: '#F59E0B',
    to: '#FDE047',
    soft: 'rgba(245, 158, 11, 0.24)',
    glow: 'rgba(253, 224, 71, 0.48)',
  },
  carol: {
    from: '#059669',
    to: '#34D399',
    soft: 'rgba(16, 185, 129, 0.24)',
    glow: 'rgba(52, 211, 153, 0.45)',
  },
  karine: {
    from: '#0284C7',
    to: '#7DD3FC',
    soft: 'rgba(56, 189, 248, 0.24)',
    glow: 'rgba(125, 211, 252, 0.45)',
  },
  caio: {
    from: '#E11D48',
    to: '#FDA4AF',
    soft: 'rgba(251, 113, 133, 0.24)',
    glow: 'rgba(253, 164, 175, 0.45)',
  },
};

function formatShortDateLabel(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}`;
}

/**
 * Smooth Catmull-Rom spline converted to cubic Bezier path for fluid SVG line charts
 */
function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function buildParticipantSeries(gameState: GameState) {
  const dayKeys = Object.keys(gameState.days).sort((a, b) => a.localeCompare(b));
  const daySummariesByKey = dayKeys.map((dKey) => {
    const list = computeDaySummary(gameState, dKey) || [];
    return {
      dateStr: dKey,
      map: Object.fromEntries(list.map((s) => [s.pid, s])) as Record<
        ParticipantId,
        (typeof list)[number]
      >,
    };
  });

  const seriesByPid = {} as Record<
    ParticipantId,
    Array<{ label: string; dateStr: string; stars: number; delta: number }>
  >;

  for (const pid of ROTATION_ORDER) {
    const points: Array<{ label: string; dateStr: string; stars: number; delta: number }> = [];
    let running = gameState.participants[pid].stars;

    for (let i = daySummariesByKey.length - 1; i >= 0; i--) {
      const entry = daySummariesByKey[i];
      const delta = entry.map[pid]?.netStars ?? 0;
      points.unshift({
        label: formatShortDateLabel(entry.dateStr),
        dateStr: entry.dateStr,
        stars: running,
        delta,
      });
      running -= delta;
    }

    points.unshift({
      label: 'Início',
      dateStr: 'start',
      stars: running,
      delta: 0,
    });

    seriesByPid[pid] = points;
  }

  return {
    dayKeys,
    daySummariesByKey,
    labels: seriesByPid[ROTATION_ORDER[0]].map((p) => p.label),
    seriesByPid,
  };
}

/* -------------------------------------------------------------------------- */
/* 0. Inline Micro-Sparkline for Participant Cards (Painel & Ranking)         */
/* -------------------------------------------------------------------------- */
export function ParticipantSparkline({
  gameState,
  participantId,
  height = 28,
}: {
  gameState: GameState;
  participantId: ParticipantId;
  height?: number;
}) {
  const { points, delta } = useMemo(() => {
    const { seriesByPid } = buildParticipantSeries(gameState);
    const pts = seriesByPid[participantId] || [];
    const lastDelta = pts.length > 0 ? pts[pts.length - 1].delta : 0;
    return { points: pts, delta: lastDelta };
  }, [gameState, participantId]);

  const pal = GRADIENT_PALETTE[participantId];
  const w = 120;
  const h = height;
  const padX = 5;
  const padY = 5;

  const vals = points.map((p) => p.stars);
  const minV = Math.min(...vals, 0);
  const maxV = Math.max(...vals, minV + 5);
  const range = Math.max(1, maxV - minV);

  const coords = points.map((p, i) => ({
    x: points.length <= 1 ? w / 2 : padX + (i / (points.length - 1)) * (w - padX * 2),
    y: padY + (h - padY * 2) - ((p.stars - minV) / range) * (h - padY * 2),
  }));

  const lineD = buildSmoothPath(coords);
  const areaD =
    coords.length > 1
      ? `${lineD} L ${coords[coords.length - 1].x.toFixed(1)} ${h} L ${coords[0].x.toFixed(1)} ${h} Z`
      : '';
  const lastCoord = coords[coords.length - 1];
  const gradId = `spark-${participantId}`;

  return (
    <div className="flex items-center gap-2">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-7 overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={pal.to} stopOpacity="0.35" />
            <stop offset="100%" stopColor={pal.from} stopOpacity="0" />
          </linearGradient>
        </defs>
        {areaD && <path d={areaD} fill={`url(#${gradId})`} />}
        <path
          d={lineD}
          fill="none"
          stroke={pal.from}
          strokeWidth="1.9"
          strokeLinecap="round"
        />
        {lastCoord && (
          <>
            <circle cx={lastCoord.x} cy={lastCoord.y} r="4.5" fill={pal.soft} />
            <circle
              cx={lastCoord.x}
              cy={lastCoord.y}
              r="2.4"
              fill={pal.to}
              stroke="#0B0D12"
              strokeWidth="0.9"
            />
          </>
        )}
      </svg>
      <span
        className={`text-[10px] font-mono-num font-bold shrink-0 ${
          delta > 0
            ? 'text-emerald-500'
            : delta < 0
            ? 'text-rose-400'
            : 'text-slate-400'
        }`}
      >
        {delta > 0 ? `▲+${delta}` : delta < 0 ? `▼${delta}` : '0'}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 1. Luminous Routine Ring Gauge (for Painel Hero)                           */
/* -------------------------------------------------------------------------- */
export function LuminousRoutineRing({
  done,
  total = 7,
}: {
  done: number;
  total?: number;
}) {
  const r = 23;
  const c = 2 * Math.PI * r;
  const ratio = Math.max(0, Math.min(1, done / total));
  const offset = c * (1 - ratio);
  const pct = Math.round(ratio * 100);
  const complete = done >= total;

  return (
    <div
      className="relative w-15 h-15 flex items-center justify-center shrink-0"
      title={`Rotinas hoje: ${done}/${total} (${pct}%)`}
      aria-label={`Progresso de rotinas: ${done} de ${total} (${pct}%)`}
    >
      <svg viewBox="0 0 60 60" className="w-15 h-15 -rotate-90 overflow-visible">
        <defs>
          <linearGradient id="luminousRoutineGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={complete ? '#34D399' : '#FDE047'} />
            <stop offset="55%" stopColor={complete ? '#10B981' : '#F59E0B'} />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
          <filter id="routineGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Outer segmented 7-step track */}
        <circle
          cx="30"
          cy="30"
          r={r}
          fill="none"
          stroke="currentColor"
          className="text-slate-200/80 dark:text-white/10"
          strokeWidth="5"
          strokeDasharray={`${c / total - 2.2} 2.2`}
        />

        {/* Animated luminous progress arc */}
        <motion.circle
          cx="30"
          cy="30"
          r={r}
          fill="none"
          stroke="url(#luminousRoutineGrad)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
          filter={done > 0 ? 'url(#routineGlow)' : undefined}
        />

        {/* Inner micro dial ring */}
        <circle
          cx="30"
          cy="30"
          r={16.5}
          fill="none"
          stroke="currentColor"
          className="text-slate-200/50 dark:text-white/[0.07]"
          strokeWidth="1"
          strokeDasharray="1.8 3.2"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-[11px] font-mono-num font-extrabold text-slate-900 dark:text-white">
          {done}/{total}
        </span>
        <span className="text-[8px] font-mono-num font-bold text-amber-500 mt-0.5">
          {pct}%
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Next-Gen Telemetry Milestone Race Track (RankingTab)                    */
/* -------------------------------------------------------------------------- */
export function MilestoneRaceChart({
  gameState,
  currentUserId,
  ranked,
}: {
  gameState: GameState;
  currentUserId: ParticipantId;
  ranked: ParticipantId[];
}) {
  const [selectedPid, setSelectedPid] = useState<ParticipantId | null>(null);
  const maxStars = Math.max(65, ...ranked.map((pid) => gameState.participants[pid].stars));
  const leaderStars = gameState.participants[ranked[0]].stars;
  const activePid = selectedPid ?? ranked[0];
  const activeStars = gameState.participants[activePid].stars;
  const activeNextMilestone = MILESTONES.find((m) => activeStars < m.stars);
  const activePct = Math.min(100, Math.round((activeStars / 65) * 100));

  const { daySummariesByKey } = useMemo(() => buildParticipantSeries(gameState), [gameState]);
  const pacePerDay = useMemo(() => {
    const out = {} as Record<ParticipantId, number>;
    const count = Math.max(1, daySummariesByKey.length);
    for (const pid of ROTATION_ORDER) {
      const sum = daySummariesByKey.reduce((acc, d) => acc + (d.map[pid]?.netStars ?? 0), 0);
      out[pid] = Number((sum / count).toFixed(1));
    }
    return out;
  }, [daySummariesByKey]);

  const activePace = pacePerDay[activePid] || 0;
  const estDaysTo65 =
    activeStars >= 65
      ? 0
      : activePace > 0.2
      ? Math.ceil((65 - activeStars) / activePace)
      : null;

  return (
    <div className="glass-subcard rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
            Corrida pelas Metas de Evolução
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Progresso em tempo real até 65⭐ com ritmo médio diário e portais de poder
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
          {MILESTONES.map((m) => (
            <span key={m.stars} className="whitespace-nowrap">
              {m.stars}
              {m.emoji}
            </span>
          ))}
        </div>
      </div>

      {/* Top Precision Scale Ruler */}
      <div className="hidden sm:flex items-center gap-3 text-[10px] font-mono-num text-slate-400 dark:text-slate-500 pl-[148px] pr-[56px]">
        <div className="relative w-full h-3">
          {[0, 15, 35, 45, 55, 65].map((tick) => {
            if (tick > maxStars) return null;
            const left = (tick / maxStars) * 100;
            return (
              <span
                key={tick}
                className="absolute -translate-x-1/2"
                style={{ left: `${left}%` }}
              >
                {tick}
              </span>
            );
          })}
        </div>
      </div>

      {/* Telemetry Lanes */}
      <div className="relative space-y-3 pt-1 pb-7">
        {/* Vertical milestone gates */}
        <div className="pointer-events-none absolute inset-y-0 left-[116px] sm:left-[148px] right-[52px]">
          {MILESTONES.map((m) => {
            const leftPct = (m.stars / maxStars) * 100;
            const anyUnlocked = ranked.some((pid) => gameState.participants[pid].stars >= m.stars);
            return (
              <div
                key={m.stars}
                className="absolute top-0 bottom-0 flex flex-col items-center"
                style={{ left: `${leftPct}%`, transform: 'translateX(-50%)' }}
              >
                <div
                  className={`w-px flex-1 border-l border-dashed ${
                    anyUnlocked
                      ? 'border-amber-400/75'
                      : 'border-slate-300/75 dark:border-white/15'
                  }`}
                />
                <span
                  className={`mt-1 text-[10px] font-mono-num font-bold whitespace-nowrap ${
                    anyUnlocked ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {m.stars}
                  {m.emoji}
                </span>
              </div>
            );
          })}
        </div>

        {ranked.map((pid, idx) => {
          const pState = gameState.participants[pid];
          const pName = getParticipantName(gameState, pid);
          const pal = GRADIENT_PALETTE[pid];
          const fillPct = Math.max(4, Math.min(100, (pState.stars / maxStars) * 100));
          const isFocused = activePid === pid;
          const isMe = pid === currentUserId;

          return (
            <button
              key={pid}
              type="button"
              onMouseEnter={() => setSelectedPid(pid)}
              onFocus={() => setSelectedPid(pid)}
              onClick={() => setSelectedPid(pid)}
              className={`w-full text-left flex items-center gap-2.5 sm:gap-3 rounded-xl px-2 py-2 transition-all ${
                isFocused
                  ? 'bg-slate-900/[0.045] dark:bg-white/[0.06] ring-1 ring-amber-400/45'
                  : 'hover:bg-slate-900/[0.025] dark:hover:bg-white/[0.03]'
              }`}
            >
              {/* Left participant label */}
              <div className="w-[108px] sm:w-[138px] shrink-0 flex items-center gap-2 min-w-0">
                <span className="text-[11px] font-mono-num font-bold text-slate-400 w-4 shrink-0">
                  {idx + 1}º
                </span>
                <img
                  src={getParticipantAvatar(gameState, pid)}
                  alt={pName}
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 rounded-lg object-cover shrink-0 ring-1 ring-white/20"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                  {pName}
                  {isMe ? ' · Você' : ''}
                </span>
              </div>

              {/* Luminous Track with tip beacon */}
              <div className="relative flex-1 h-4 rounded-full bg-slate-200/80 dark:bg-white/[0.06] overflow-visible">
                <div className="absolute inset-0 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full relative"
                    initial={{ width: 0 }}
                    animate={{ width: `${fillPct}%` }}
                    transition={{ duration: 0.7, delay: idx * 0.06, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                      background: `linear-gradient(90deg, ${pal.from} 0%, ${pal.to} 100%)`,
                      boxShadow: isFocused ? `0 0 16px ${pal.glow}` : `0 0 8px ${pal.soft}`,
                    }}
                  >
                    <span className="absolute inset-x-0 top-0 h-[40%] bg-white/25 rounded-full" />
                  </motion.div>
                </div>

                {/* Tip Beacon Dot */}
                <motion.span
                  initial={{ left: '0%' }}
                  animate={{ left: `${fillPct}%` }}
                  transition={{ duration: 0.7, delay: idx * 0.06, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#0B0D12] shadow-md"
                  style={{
                    backgroundColor: pal.to,
                    boxShadow: `0 0 10px ${pal.glow}`,
                  }}
                />
              </div>

              {/* Right tabular star readout */}
              <div className="w-[46px] shrink-0 text-right font-mono-num text-xs font-extrabold text-slate-900 dark:text-white">
                {pState.stars}⭐
              </div>
            </button>
          );
        })}
      </div>

      {/* Focused Participant Telemetry Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200/70 dark:border-white/10 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: PARTICIPANT_PROFILES[activePid].accentColor }}
          />
          <span className="font-bold text-slate-900 dark:text-white">
            {getParticipantName(gameState, activePid)}
          </span>
          <span className="text-slate-400">·</span>
          <span className="font-mono-num font-semibold text-amber-500">
            {activeStars} ⭐ ({activePct}% de 65⭐)
          </span>
          <span className="text-slate-400">·</span>
          <span className="font-mono-num text-slate-600 dark:text-slate-300">
            Ritmo: {activePace >= 0 ? `+${activePace}` : activePace} ⭐/dia
          </span>
        </div>
        <div className="font-mono-num text-[11px] text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-2">
          <span>
            {activeStars === leaderStars
              ? 'Liderando o placar'
              : `-${leaderStars - activeStars} ⭐ do 1º`}
          </span>
          <span className="text-slate-400">·</span>
          <span>
            {activeNextMilestone
              ? `Faltam ${activeNextMilestone.stars - activeStars} ⭐ p/ ${activeNextMilestone.emoji} ${activeNextMilestone.label}`
              : 'Todas as metas liberadas!'}
          </span>
          {estDaysTo65 !== null && estDaysTo65 > 0 && (
            <>
              <span className="text-slate-400">·</span>
              <span className="text-emerald-500 font-semibold">~{estDaysTo65}d p/ 65⭐</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Cumulative & Daily Trajectory Chart (Floating HUD Crosshair Tooltip)    */
/* -------------------------------------------------------------------------- */
export function StarTrajectoryChart({
  gameState,
  ranked,
  currentUserId,
}: {
  gameState: GameState;
  ranked: ParticipantId[];
  currentUserId: ParticipantId;
}) {
  const [focusedPid, setFocusedPid] = useState<ParticipantId | 'all'>('all');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [showMilestones, setShowMilestones] = useState<boolean>(false);
  const [metricMode, setMetricMode] = useState<'cumulative' | 'delta'>('cumulative');

  const trajectory = useMemo(() => buildParticipantSeries(gameState), [gameState]);

  const pointCount = trajectory.labels.length;
  const activeIdx =
    hoverIdx !== null ? Math.min(pointCount - 1, Math.max(0, hoverIdx)) : pointCount - 1;

  const getValue = (pid: ParticipantId, idx: number) => {
    const pt = trajectory.seriesByPid[pid][idx];
    return metricMode === 'cumulative' ? pt.stars : pt.delta;
  };

  const allValues = ROTATION_ORDER.flatMap((pid) =>
    trajectory.seriesByPid[pid].map((_, idx) => getValue(pid, idx))
  );
  const rawMin = Math.min(metricMode === 'delta' ? -4 : 0, ...allValues);
  const rawMax = Math.max(
    metricMode === 'cumulative' && showMilestones ? 65 : metricMode === 'delta' ? 8 : 28,
    ...allValues.map((v) => v + 3)
  );
  const yMin = Math.floor(rawMin / 5) * 5;
  const yMax = Math.ceil(rawMax / 5) * 5;
  const yRange = Math.max(5, yMax - yMin);

  const svgW = 540;
  const svgH = 225;
  const padL = 38;
  const padR = 44;
  const padT = 18;
  const padB = 30;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const xFor = (i: number) =>
    pointCount <= 1 ? padL + plotW / 2 : padL + (i / (pointCount - 1)) * plotW;
  const yFor = (val: number) => padT + plotH - ((val - yMin) / yRange) * plotH;

  const yTicks = useMemo(() => {
    const steps = 4;
    const arr: number[] = [];
    for (let s = 0; s <= steps; s++) {
      arr.push(Math.round(yMin + (yRange * s) / steps));
    }
    return arr;
  }, [yMin, yRange]);

  const focusForArea: ParticipantId = focusedPid === 'all' ? ranked[0] : focusedPid;
  const activeX = xFor(activeIdx);
  const activeXPct = (activeX / svgW) * 100;
  const tooltipOnLeft = activeXPct > 58;

  return (
    <div className="glass-subcard rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
            {metricMode === 'cumulative'
              ? 'Trajetória Acumulada de Estrelas'
              : 'Variação Líquida Diária (Saldo/Dia)'}
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Deslize sobre os dias para inspecionar a curva e o saldo em tempo real
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex p-0.5 rounded-lg bg-slate-200/75 dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/10">
            <button
              type="button"
              onClick={() => setMetricMode('cumulative')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all whitespace-nowrap shrink-0 ${
                metricMode === 'cumulative'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Acumulado
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('delta')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all whitespace-nowrap shrink-0 ${
                metricMode === 'delta'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Saldo/Dia
            </button>
          </div>

          {metricMode === 'cumulative' && (
            <button
              type="button"
              onClick={() => setShowMilestones((s) => !s)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                showMilestones
                  ? 'bg-amber-400/20 border-amber-400/60 text-amber-600 dark:text-amber-300'
                  : 'border-slate-300/70 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:border-amber-400/50'
              }`}
            >
              {showMilestones ? 'Ocultar 65⭐' : 'Metas 65⭐'}
            </button>
          )}
        </div>
      </div>

      {/* Participant focus filter controls */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setFocusedPid('all')}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap shrink-0 ${
            focusedPid === 'all'
              ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950'
              : 'bg-slate-200/70 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Todos (4)
        </button>
        {ranked.map((pid) => {
          const isSel = focusedPid === pid;
          const pal = GRADIENT_PALETTE[pid];
          return (
            <button
              key={pid}
              type="button"
              onClick={() => setFocusedPid((prev) => (prev === pid ? 'all' : pid))}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                isSel
                  ? 'bg-amber-400/20 text-slate-900 dark:text-white ring-1 ring-amber-400'
                  : 'bg-slate-200/60 dark:bg-white/[0.05] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: pal.from }}
              />
              <span>
                {getParticipantName(gameState, pid)}
                {pid === currentUserId ? ' (Você)' : ''}
              </span>
            </button>
          );
        })}
      </div>

      {/* Interactive Chart Viewport with Floating Glass HUD Tooltip */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="w-full h-56 sm:h-60 overflow-visible select-none"
          role="img"
          aria-label="Gráfico de trajetória de estrelas por dia"
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            {ROTATION_ORDER.map((pid) => (
              <linearGradient key={pid} id={`areaGrad-${pid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GRADIENT_PALETTE[pid].to} stopOpacity="0.34" />
                <stop offset="100%" stopColor={GRADIENT_PALETTE[pid].from} stopOpacity="0.0" />
              </linearGradient>
            ))}
            <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Horizontal Y gridlines */}
          {yTicks.map((tick) => {
            const y = yFor(tick);
            return (
              <g key={tick}>
                <line
                  x1={padL}
                  y1={y}
                  x2={svgW - padR}
                  y2={y}
                  stroke="currentColor"
                  className={
                    tick === 0 && metricMode === 'delta'
                      ? 'text-slate-400/60 dark:text-white/25'
                      : 'text-slate-200 dark:text-white/[0.08]'
                  }
                  strokeDasharray={tick === 0 && metricMode === 'delta' ? undefined : '3 4'}
                />
                <text
                  x={padL - 7}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-slate-400 dark:fill-slate-500 text-[9.5px] font-mono-num"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Optional Milestone reference lines */}
          {metricMode === 'cumulative' &&
            showMilestones &&
            MILESTONES.map((m) => {
              if (m.stars < yMin || m.stars > yMax) return null;
              const y = yFor(m.stars);
              return (
                <g key={m.stars}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={svgW - padR}
                    y2={y}
                    stroke="#F59E0B"
                    strokeOpacity="0.4"
                    strokeDasharray="5 4"
                  />
                  <text
                    x={svgW - padR}
                    y={y - 3}
                    textAnchor="end"
                    className="fill-amber-500 text-[9px] font-mono-num font-bold"
                  >
                    {m.stars}
                    {m.emoji}
                  </text>
                </g>
              );
            })}

          {/* Vertical scrub crosshair */}
          <line
            x1={activeX}
            y1={padT}
            x2={activeX}
            y2={padT + plotH}
            stroke="#F59E0B"
            strokeOpacity="0.55"
            strokeWidth="1.4"
            strokeDasharray="3 3"
          />

          {/* Area fill under focused/top curve */}
          {(() => {
            const pts = trajectory.seriesByPid[focusForArea].map((_, i) => ({
              x: xFor(i),
              y: yFor(getValue(focusForArea, i)),
            }));
            const linePath = buildSmoothPath(pts);
            const baselineY = yFor(metricMode === 'delta' ? Math.max(yMin, 0) : yMin);
            const areaPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(2)} ${baselineY.toFixed(2)} L ${pts[0].x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
            return (
              <path
                d={areaPath}
                fill={`url(#areaGrad-${focusForArea})`}
                className="transition-opacity duration-300"
              />
            );
          })()}

          {/* Participant curves, active halo nodes, and live end-of-line value tags */}
          {ROTATION_ORDER.map((pid) => {
            const dimmed = focusedPid !== 'all' && focusedPid !== pid;
            const pts = trajectory.seriesByPid[pid].map((_, i) => ({
              x: xFor(i),
              y: yFor(getValue(pid, i)),
            }));
            const path = buildSmoothPath(pts);
            const pal = GRADIENT_PALETTE[pid];
            const lastPt = pts[pts.length - 1];
            const lastVal = getValue(pid, pts.length - 1);

            return (
              <g
                key={pid}
                style={{ opacity: dimmed ? 0.18 : 1 }}
                className="transition-opacity duration-200"
              >
                <motion.path
                  key={`${pid}-${metricMode}`}
                  d={path}
                  fill="none"
                  stroke={pal.from}
                  strokeWidth={dimmed ? 1.5 : 2.8}
                  strokeLinecap="round"
                  filter={!dimmed ? 'url(#lineGlow)' : undefined}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
                />
                {pts.map((pt, i) => {
                  const isActiveNode = i === activeIdx;
                  return (
                    <g key={i}>
                      {isActiveNode && !dimmed && (
                        <circle cx={pt.x} cy={pt.y} r="9" fill={pal.soft} />
                      )}
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isActiveNode ? 4.8 : 2.6}
                        fill={isActiveNode ? pal.to : pal.from}
                        stroke="#0B0D12"
                        strokeWidth={isActiveNode ? 1.8 : 1}
                      />
                    </g>
                  );
                })}
                {/* End-of-line numeric tag */}
                {!dimmed && lastPt && (
                  <text
                    x={lastPt.x + 8}
                    y={lastPt.y + 3.5}
                    className="text-[9.5px] font-mono-num font-extrabold"
                    fill={pal.from}
                  >
                    {metricMode === 'delta' && lastVal > 0 ? `+${lastVal}` : lastVal}⭐
                  </text>
                )}
              </g>
            );
          })}

          {/* X-Axis date labels */}
          {trajectory.labels.map((lbl, i) => (
            <text
              key={`${lbl}-${i}`}
              x={xFor(i)}
              y={svgH - 6}
              textAnchor="middle"
              className={`text-[10px] font-mono-num ${
                i === activeIdx
                  ? 'fill-amber-500 font-extrabold'
                  : 'fill-slate-400 dark:fill-slate-500 font-medium'
              }`}
            >
              {lbl}
            </text>
          ))}

          {/* Interactive vertical scrub columns */}
          {trajectory.labels.map((lbl, i) => {
            const colWidth = pointCount <= 1 ? plotW : plotW / (pointCount - 1);
            const xStart = Math.max(padL, xFor(i) - colWidth / 2);
            const xEnd = Math.min(svgW - padR, xFor(i) + colWidth / 2);
            return (
              <rect
                key={`hit-${lbl}-${i}`}
                x={xStart}
                y={padT}
                width={Math.max(14, xEnd - xStart)}
                height={plotH + padB}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoverIdx(i)}
                onClick={() => setHoverIdx(i)}
              />
            );
          })}
        </svg>

        {/* Floating Glass Crosshair HUD Tooltip (appears when hovering/scrubbing a column) */}
        {hoverIdx !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 w-44 rounded-xl bg-white/90 dark:bg-[#10141F]/92 backdrop-blur-xl border border-slate-200/90 dark:border-white/15 shadow-xl px-3 py-2 space-y-1 transition-all duration-150"
            style={{
              left: tooltipOnLeft ? undefined : `min(calc(${activeXPct}% + 12px), calc(100% - 184px))`,
              right: tooltipOnLeft ? `min(calc(${100 - activeXPct}% + 12px), calc(100% - 184px))` : undefined,
            }}
          >
            <p className="text-[10px] font-mono-num font-extrabold text-amber-500 uppercase tracking-wide border-b border-slate-200/70 dark:border-white/10 pb-1">
              {trajectory.labels[activeIdx]}
            </p>
            {ranked.map((pid) => {
              const pt = trajectory.seriesByPid[pid][activeIdx];
              const pal = GRADIENT_PALETTE[pid];
              return (
                <div
                  key={pid}
                  className="flex items-center justify-between text-[11px] font-mono-num gap-2"
                >
                  <span className="flex items-center gap-1.5 font-sans font-semibold text-slate-700 dark:text-slate-200 truncate">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: pal.from }}
                    />
                    {getParticipantName(gameState, pid)}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white shrink-0">
                    {pt.stars}⭐
                    {pt.dateStr !== 'start' && (
                      <span
                        className={`ml-1 text-[10px] ${
                          pt.delta > 0
                            ? 'text-emerald-500'
                            : pt.delta < 0
                            ? 'text-rose-400'
                            : 'text-slate-400'
                        }`}
                      >
                        ({pt.delta > 0 ? `+${pt.delta}` : pt.delta})
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Scrubbed Day Readout Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200/70 dark:border-white/10">
        {ranked.map((pid) => {
          const pt = trajectory.seriesByPid[pid][activeIdx];
          const pal = GRADIENT_PALETTE[pid];
          return (
            <div
              key={pid}
              className="rounded-xl bg-white/55 dark:bg-white/[0.04] px-2.5 py-2 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: pal.from }}
                />
                <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate">
                  {getParticipantName(gameState, pid)}
                </span>
              </div>
              <div className="text-right font-mono-num shrink-0">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                  {pt.stars}⭐
                </span>
                {pt.dateStr !== 'start' && (
                  <span
                    className={`block text-[10px] font-bold ${
                      pt.delta > 0
                        ? 'text-emerald-500'
                        : pt.delta < 0
                        ? 'text-rose-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {pt.delta > 0 ? `+${pt.delta}` : pt.delta} em {pt.label}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Daily Star Origin Breakdown Chart (Diverging Stacked Bars)              */
/* -------------------------------------------------------------------------- */
export function StarBreakdownChart({
  gameState,
  dateStr,
  ranked,
  currentUserId,
  compact = false,
}: {
  gameState: GameState;
  dateStr: string;
  ranked: ParticipantId[];
  currentUserId: ParticipantId;
  compact?: boolean;
}) {
  const [selectedPid, setSelectedPid] = useState<ParticipantId | null>(null);

  const rows = useMemo(() => {
    const list = computeDaySummary(gameState, dateStr) || [];
    const byPid = Object.fromEntries(list.map((item) => [item.pid, item]));
    return ranked.map((pid) => {
      const s = byPid[pid];
      return {
        pid,
        name: getParticipantName(gameState, pid),
        routineStars: s?.routineStars ?? 0,
        taskStars: s?.taskStars ?? 0,
        dicePowerStars: s?.dicePowerStars ?? 0,
        denunciationStars: s?.denunciationStars ?? 0,
        netStars: s?.netStars ?? 0,
      };
    });
  }, [gameState, dateStr, ranked]);

  const maxAbs = Math.max(
    4,
    ...rows.map((r) => {
      const pos =
        Math.max(0, r.routineStars) +
        Math.max(0, r.taskStars) +
        Math.max(0, r.dicePowerStars) +
        Math.max(0, r.denunciationStars);
      const neg =
        Math.abs(Math.min(0, r.routineStars)) +
        Math.abs(Math.min(0, r.taskStars)) +
        Math.abs(Math.min(0, r.dicePowerStars)) +
        Math.abs(Math.min(0, r.denunciationStars));
      return Math.max(pos, neg);
    })
  );

  const activeRow = rows.find((r) => r.pid === (selectedPid ?? currentUserId)) || rows[0];

  const categories = [
    { key: 'routineStars' as const, label: 'Rotinas', color: '#10B981' },
    { key: 'taskStars' as const, label: 'Tarefas', color: '#F59E0B' },
    { key: 'dicePowerStars' as const, label: 'Dado/Poderes', color: '#38BDF8' },
    { key: 'denunciationStars' as const, label: 'Denúncias', color: '#FB7185' },
  ];

  return (
    <div className="glass-subcard rounded-2xl p-4 sm:p-5 space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
            Origem do Saldo de Estrelas ({formatShortDateLabel(dateStr)})
          </h3>
          {!compact && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Barras divergentes mostram ganhos (+) à direita e perdas (-) à esquerda
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 dark:text-slate-300">
          {categories.map((cat) => (
            <span key={cat.key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: cat.color }}
              />
              {cat.label}
            </span>
          ))}
        </div>
      </div>

      {/* Diverging stacked bars around 0 center axis */}
      <div className="space-y-2.5">
        {rows.map((r) => {
          const posSegments = categories
            .map((c) => ({ ...c, val: r[c.key] }))
            .filter((c) => c.val > 0);
          const negSegments = categories
            .map((c) => ({ ...c, val: Math.abs(r[c.key]) }))
            .filter((c) => r[c.key] < 0);
          const isSelected = activeRow.pid === r.pid;

          return (
            <button
              key={r.pid}
              type="button"
              onMouseEnter={() => setSelectedPid(r.pid)}
              onClick={() => setSelectedPid(r.pid)}
              className={`w-full text-left flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-all ${
                isSelected
                  ? 'bg-slate-900/[0.045] dark:bg-white/[0.06] ring-1 ring-amber-400/40'
                  : 'hover:bg-slate-900/[0.02] dark:hover:bg-white/[0.03]'
              }`}
            >
              <div className="w-24 sm:w-28 shrink-0 flex items-center gap-2 min-w-0">
                <img
                  src={getParticipantAvatar(gameState, r.pid)}
                  alt={r.name}
                  referrerPolicy="no-referrer"
                  className="w-6 h-6 rounded-lg object-cover shrink-0"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                  {r.name}
                </span>
              </div>

              {/* Diverging center-zero bar */}
              <div className="flex-1 flex items-center h-4">
                <div className="w-1/2 h-full flex justify-end items-center pr-0.5 bg-slate-200/45 dark:bg-white/[0.03] rounded-l-full overflow-hidden gap-px">
                  {negSegments.map((seg) => (
                    <motion.div
                      key={seg.key}
                      initial={{ width: 0 }}
                      animate={{ width: `${(seg.val / maxAbs) * 100}%` }}
                      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                      className="h-3 first:rounded-l-full"
                      style={{ backgroundColor: seg.color, opacity: 0.88 }}
                      title={`${seg.label}: -${seg.val} ⭐`}
                    />
                  ))}
                </div>

                <div className="w-px h-5 bg-slate-400/75 dark:bg-white/30 shrink-0" />

                <div className="w-1/2 h-full flex justify-start items-center pl-0.5 bg-slate-200/45 dark:bg-white/[0.03] rounded-r-full overflow-hidden gap-px">
                  {posSegments.map((seg) => (
                    <motion.div
                      key={seg.key}
                      initial={{ width: 0 }}
                      animate={{ width: `${(seg.val / maxAbs) * 100}%` }}
                      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                      className="h-3 last:rounded-r-full"
                      style={{ backgroundColor: seg.color }}
                      title={`${seg.label}: +${seg.val} ⭐`}
                    />
                  ))}
                </div>
              </div>

              <span
                className={`w-14 shrink-0 text-right font-mono-num text-xs font-extrabold ${
                  r.netStars > 0
                    ? 'text-emerald-500'
                    : r.netStars < 0
                    ? 'text-rose-400'
                    : 'text-slate-400'
                }`}
              >
                {r.netStars > 0 ? `+${r.netStars}` : r.netStars}⭐
              </span>
            </button>
          );
        })}
      </div>

      {/* Breakdown readout for focused participant */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-white/10 text-[11px] font-mono-num">
        <span className="font-sans font-bold text-slate-800 dark:text-slate-100">
          Detalhe de {activeRow.name}:
        </span>
        <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300">
          {categories.map((c) => {
            const val = activeRow[c.key];
            return (
              <span key={c.key}>
                {c.label}:{' '}
                <strong
                  style={{ color: val === 0 ? undefined : c.color }}
                  className={val === 0 ? 'text-slate-400' : ''}
                >
                  {val > 0 ? `+${val}` : val}⭐
                </strong>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. Grouped Gradient Column Chart with Average Line & Floating Tooltip      */
/* -------------------------------------------------------------------------- */
export function ComparativeColumnsChart({
  gameState,
  dateStr,
  ranked,
  currentUserId,
}: {
  gameState: GameState;
  dateStr: string;
  ranked: ParticipantId[];
  currentUserId: ParticipantId;
}) {
  const [hoveredPid, setHoveredPid] = useState<ParticipantId | null>(null);
  const [mode, setMode] = useState<'values' | 'rates'>('values');
  const day = gameState.days[dateStr];
  const maxStars = Math.max(25, ...ranked.map((id) => gameState.participants[id].stars));
  const avgStars = Math.round(
    ranked.reduce((sum, id) => sum + gameState.participants[id].stars, 0) / ranked.length
  );

  const summaryList = useMemo(
    () => computeDaySummary(gameState, dateStr) || [],
    [gameState, dateStr]
  );
  const summaryMap = useMemo(
    () => Object.fromEntries(summaryList.map((s) => [s.pid, s])),
    [summaryList]
  );

  const focusPid = hoveredPid ?? ranked[0];
  const focusSummary = summaryMap[focusPid];
  const focusRoutines = day
    ? ROUTINE_DEFINITIONS.filter((r) => day.routines[focusPid]?.[r.id]?.completed).length
    : 0;
  const focusTasks = day
    ? TASK_DEFINITIONS.filter((t) => day.tasks[t.id]?.completedBy === focusPid).length
    : 0;

  const avgLineY =
    mode === 'values'
      ? 142 - (avgStars / maxStars) * 114
      : 142 - 0.5 * 114;

  const hoveredIdx = hoveredPid ? ranked.indexOf(hoveredPid) : -1;

  return (
    <div className="glass-subcard rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
            Comparativo de Estrelas, Rotinas &amp; Tarefas
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Passe ou toque nas colunas para abrir o inspetor em tempo real
          </p>
        </div>

        <div className="inline-flex p-0.5 rounded-lg bg-slate-200/75 dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/10">
          <button
            type="button"
            onClick={() => setMode('values')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all whitespace-nowrap shrink-0 ${
              mode === 'values'
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Absoluto
          </button>
          <button
            type="button"
            onClick={() => setMode('rates')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all whitespace-nowrap shrink-0 ${
              mode === 'rates'
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Taxa %
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" />{' '}
          {mode === 'values' ? 'Estrelas' : 'Meta 65⭐ (%)'}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400/80" /> Rotinas (/7)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-sky-400/80" /> Tarefas Hoje
        </span>
        {mode === 'values' && (
          <span className="inline-flex items-center gap-1 font-mono-num text-amber-500">
            — Média: {avgStars}⭐
          </span>
        )}
      </div>

      <div className="relative">
        <svg
          viewBox="0 0 380 185"
          className="w-full h-48 sm:h-52 overflow-visible select-none"
          role="img"
          aria-label="Gráfico comparativo de estrelas, rotinas e tarefas"
          onMouseLeave={() => setHoveredPid(null)}
        >
          <defs>
            {ROTATION_ORDER.map((pid) => (
              <linearGradient key={pid} id={`colGrad-${pid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GRADIENT_PALETTE[pid].to} />
                <stop offset="100%" stopColor={GRADIENT_PALETTE[pid].from} stopOpacity="0.82" />
              </linearGradient>
            ))}
            <linearGradient id="colRoutGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34D399" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.35" />
            </linearGradient>
            <linearGradient id="colTaskGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7DD3FC" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#0284C7" stopOpacity="0.35" />
            </linearGradient>
          </defs>

          {/* Horizontal dashed gridlines */}
          {[0.25, 0.5, 0.75, 1].map((step) => {
            const y = 142 - step * 114;
            const labelVal =
              mode === 'values' ? Math.round(maxStars * step) : `${Math.round(step * 100)}%`;
            return (
              <g key={step}>
                <line
                  x1="34"
                  y1={y}
                  x2="366"
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-white/[0.08]"
                  strokeDasharray="3 4"
                />
                <text
                  x="28"
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-slate-400 dark:fill-slate-500 text-[9px] font-mono-num"
                >
                  {labelVal}
                </text>
              </g>
            );
          })}

          {/* House average reference line */}
          <line
            x1="34"
            y1={avgLineY}
            x2="366"
            y2={avgLineY}
            stroke="#F59E0B"
            strokeOpacity="0.45"
            strokeDasharray="5 3"
          />

          {/* Baseline */}
          <line
            x1="34"
            y1="142"
            x2="366"
            y2="142"
            stroke="currentColor"
            className="text-slate-300 dark:text-white/15"
          />

          {ranked.map((pid, i) => {
            const p = gameState.participants[pid];
            const routDone = day
              ? ROUTINE_DEFINITIONS.filter((r) => day.routines[pid]?.[r.id]?.completed).length
              : 0;
            const taskDone = day
              ? TASK_DEFINITIONS.filter((t) => day.tasks[t.id]?.completedBy === pid).length
              : 0;
            const assignedCount = day
              ? TASK_DEFINITIONS.filter((t) => day.tasks[t.id]?.assignedTo === pid).length
              : 3;

            const groupX = 48 + i * 82;
            const starRatio =
              mode === 'values' ? p.stars / maxStars : Math.min(1, p.stars / 65);
            const routRatio = routDone / 7;
            const taskRatio =
              mode === 'values'
                ? Math.min(6, taskDone) / 6
                : Math.min(1, taskDone / Math.max(1, assignedCount));

            const starH = Math.max(6, starRatio * 114);
            const routH = Math.max(4, routRatio * 114);
            const taskH = Math.max(4, taskRatio * 114);

            const isHovered = focusPid === pid;
            const dimmed = hoveredPid !== null && !isHovered;

            return (
              <g
                key={pid}
                onMouseEnter={() => setHoveredPid(pid)}
                onClick={() => setHoveredPid(pid)}
                className="cursor-pointer transition-opacity duration-200"
                style={{ opacity: dimmed ? 0.4 : 1 }}
              >
                {isHovered && (
                  <rect
                    x={groupX - 6}
                    y="16"
                    width="64"
                    height="126"
                    rx="10"
                    fill="currentColor"
                    className="text-slate-900/[0.045] dark:text-white/[0.045]"
                  />
                )}

                {/* Star bar */}
                <motion.rect
                  x={groupX}
                  width="20"
                  rx="6"
                  fill={`url(#colGrad-${pid})`}
                  initial={{ y: 142, height: 0 }}
                  animate={{ y: 142 - starH, height: starH }}
                  transition={{ duration: 0.55, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                />
                <text
                  x={groupX + 10}
                  y={142 - starH - 5}
                  textAnchor="middle"
                  className="fill-slate-800 dark:fill-white text-[9.5px] font-extrabold font-mono-num"
                >
                  {mode === 'values' ? `${p.stars}⭐` : `${Math.round(starRatio * 100)}%`}
                </text>

                {/* Routine bar */}
                <motion.rect
                  x={groupX + 23}
                  width="13"
                  rx="4.5"
                  fill="url(#colRoutGrad)"
                  initial={{ y: 142, height: 0 }}
                  animate={{ y: 142 - routH, height: routH }}
                  transition={{ duration: 0.55, delay: i * 0.05 + 0.06, ease: [0.16, 1, 0.3, 1] }}
                />
                <text
                  x={groupX + 29.5}
                  y={142 - routH - 4}
                  textAnchor="middle"
                  className="fill-emerald-600 dark:fill-emerald-400 text-[8.5px] font-bold font-mono-num"
                >
                  {mode === 'values' ? routDone : `${Math.round(routRatio * 100)}%`}
                </text>

                {/* Task bar */}
                <motion.rect
                  x={groupX + 39}
                  width="13"
                  rx="4.5"
                  fill="url(#colTaskGrad)"
                  initial={{ y: 142, height: 0 }}
                  animate={{ y: 142 - taskH, height: taskH }}
                  transition={{ duration: 0.55, delay: i * 0.05 + 0.12, ease: [0.16, 1, 0.3, 1] }}
                />
                <text
                  x={groupX + 45.5}
                  y={142 - taskH - 4}
                  textAnchor="middle"
                  className="fill-sky-600 dark:fill-sky-400 text-[8.5px] font-bold font-mono-num"
                >
                  {mode === 'values' ? taskDone : `${Math.round(taskRatio * 100)}%`}
                </text>

                <text
                  x={groupX + 26}
                  y="162"
                  textAnchor="middle"
                  className={`text-[11px] font-bold ${
                    pid === currentUserId
                      ? 'fill-amber-500'
                      : 'fill-slate-700 dark:fill-slate-200'
                  }`}
                >
                  {getParticipantName(gameState, pid)}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating Glass Tooltip over hovered column group */}
        {hoveredPid && hoveredIdx >= 0 && (
          <div
            className="pointer-events-none absolute top-1 z-10 w-44 rounded-xl bg-white/92 dark:bg-[#10141F]/94 backdrop-blur-xl border border-slate-200/90 dark:border-white/15 shadow-xl px-3 py-2 text-[11px]"
            style={{
              left: hoveredIdx < 2 ? `${16 + hoveredIdx * 21}%` : undefined,
              right: hoveredIdx >= 2 ? `${(3 - hoveredIdx) * 18}%` : undefined,
            }}
          >
            <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: PARTICIPANT_PROFILES[hoveredPid].accentColor }}
              />
              {getParticipantName(gameState, hoveredPid)}
            </p>
            <div className="mt-1 space-y-0.5 font-mono-num text-slate-600 dark:text-slate-300">
              <div className="flex justify-between">
                <span>Estrelas</span>
                <strong className="text-amber-500">{gameState.participants[hoveredPid].stars}⭐</strong>
              </div>
              <div className="flex justify-between">
                <span>Rotinas</span>
                <strong className="text-emerald-500">{focusRoutines}/7</strong>
              </div>
              <div className="flex justify-between">
                <span>Tarefas</span>
                <strong className="text-sky-400">{focusTasks}</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Live Inspector Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-white/10 text-xs">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: PARTICIPANT_PROFILES[focusPid].accentColor }}
          />
          <span className="font-bold text-slate-900 dark:text-white">
            {getParticipantName(gameState, focusPid)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 font-mono-num text-[11px] text-slate-600 dark:text-slate-300">
          <span>
            Total: <strong className="text-amber-500">{gameState.participants[focusPid].stars}⭐</strong>
          </span>
          <span>
            Rotinas: <strong className="text-emerald-500">{focusRoutines}/7</strong>
          </span>
          <span>
            Tarefas hoje: <strong className="text-sky-400">{focusTasks}</strong>
          </span>
          {focusSummary && (
            <span>
              Saldo hoje:{' '}
              <strong className={focusSummary.netStars >= 0 ? 'text-emerald-500' : 'text-rose-400'}>
                {focusSummary.netStars > 0 ? `+${focusSummary.netStars}` : focusSummary.netStars}⭐
              </strong>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 6. Interactive Dual-Ring Concentric Donut Chart (AnalyticsAdminView)       */
/* -------------------------------------------------------------------------- */
export function InteractiveDonutChart({
  gameState,
  dateStr,
  ranked,
}: {
  gameState: GameState;
  dateStr: string;
  ranked: ParticipantId[];
}) {
  const [activePid, setActivePid] = useState<ParticipantId | null>(null);
  const [ringMode, setRingMode] = useState<'stars' | 'powers'>('stars');
  const day = gameState.days[dateStr];
  const totalStarsAll = ranked.reduce(
    (sum, pid) => sum + Math.max(0, gameState.participants[pid].stars),
    0
  );

  const outerR = 46;
  const outerCirc = 2 * Math.PI * outerR;
  const innerR = 31;
  const innerCirc = 2 * Math.PI * innerR;

  const secondaryByPid = useMemo(() => {
    const map = {} as Record<ParticipantId, number>;
    for (const pid of ranked) {
      if (ringMode === 'stars') {
        const rout = day
          ? ROUTINE_DEFINITIONS.filter((r) => day.routines[pid]?.[r.id]?.completed).length
          : 0;
        const task = day
          ? TASK_DEFINITIONS.filter((t) => day.tasks[t.id]?.completedBy === pid).length
          : 0;
        map[pid] = rout + task;
      } else {
        const inv = gameState.participants[pid].inventory;
        map[pid] = inv.fantasma + inv.escudo + inv.chefe + inv.coringa;
      }
    }
    return map;
  }, [day, gameState.participants, ranked, ringMode]);

  const totalSecondary = Object.values(secondaryByPid).reduce((a, b) => a + b, 0);

  let outerOffset = 0;
  let innerOffset = 0;

  const activeStars = activePid ? gameState.participants[activePid].stars : totalStarsAll;
  const activeShare =
    activePid && totalStarsAll > 0
      ? Math.round((Math.max(0, activeStars) / totalStarsAll) * 100)
      : 100;

  return (
    <div className="glass-subcard rounded-2xl p-4 sm:p-5 flex flex-col justify-between space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
            Distribuição &amp; Anéis Concêntricos
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Externo: estrelas · Interno:{' '}
            {ringMode === 'stars' ? 'ações hoje' : 'poderes acumulados'}
          </p>
        </div>

        <div className="inline-flex p-0.5 rounded-lg bg-slate-200/75 dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/10">
          <button
            type="button"
            onClick={() => setRingMode('stars')}
            className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all whitespace-nowrap shrink-0 ${
              ringMode === 'stars'
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Ações
          </button>
          <button
            type="button"
            onClick={() => setRingMode('powers')}
            className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all whitespace-nowrap shrink-0 ${
              ringMode === 'powers'
                ? 'bg-amber-400 text-slate-950 shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Poderes
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative w-32 h-32 shrink-0">
          <svg viewBox="0 0 120 120" className="w-32 h-32 -rotate-90 overflow-visible">
            <defs>
              <filter id="donutGlow" x="-25%" y="-25%" width="150%" height="150%">
                <feGaussianBlur stdDeviation="2.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Precision inner dial ticks */}
            <circle
              cx="60"
              cy="60"
              r={22}
              fill="none"
              stroke="currentColor"
              className="text-slate-300/60 dark:text-white/10"
              strokeWidth="1"
              strokeDasharray="1.5 4"
            />

            {/* Outer base track */}
            <circle
              cx="60"
              cy="60"
              r={outerR}
              fill="none"
              stroke="currentColor"
              className="text-slate-200/80 dark:text-white/[0.08]"
              strokeWidth="12"
            />
            {/* Inner base track */}
            <circle
              cx="60"
              cy="60"
              r={innerR}
              fill="none"
              stroke="currentColor"
              className="text-slate-200/60 dark:text-white/[0.05]"
              strokeWidth="6"
            />

            {/* Outer ring segments */}
            {ranked.map((pid) => {
              const stars = Math.max(0, gameState.participants[pid].stars);
              const segLen = totalStarsAll > 0 ? (stars / totalStarsAll) * outerCirc : 0;
              const dashArray = `${Math.max(0, segLen - 3)} ${outerCirc}`;
              const dashOffset = -outerOffset;
              outerOffset += segLen;
              const isFocus = activePid === pid;
              const dimmed = activePid !== null && !isFocus;

              return (
                <motion.circle
                  key={`outer-${pid}`}
                  cx="60"
                  cy="60"
                  r={outerR}
                  fill="none"
                  stroke={PARTICIPANT_PROFILES[pid].accentColor}
                  strokeWidth={isFocus ? 15.5 : 12}
                  strokeDasharray={dashArray}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  opacity={dimmed ? 0.3 : 1}
                  filter={isFocus ? 'url(#donutGlow)' : undefined}
                  className="cursor-pointer transition-all duration-200"
                  onMouseEnter={() => setActivePid(pid)}
                  onMouseLeave={() => setActivePid(null)}
                  onClick={() => setActivePid((prev) => (prev === pid ? null : pid))}
                />
              );
            })}

            {/* Inner ring segments */}
            {ranked.map((pid) => {
              const val = secondaryByPid[pid] || 0;
              const segLen = totalSecondary > 0 ? (val / totalSecondary) * innerCirc : 0;
              const dashArray = `${Math.max(0, segLen - 2)} ${innerCirc}`;
              const dashOffset = -innerOffset;
              innerOffset += segLen;
              const isFocus = activePid === pid;
              const dimmed = activePid !== null && !isFocus;

              return (
                <circle
                  key={`inner-${pid}`}
                  cx="60"
                  cy="60"
                  r={innerR}
                  fill="none"
                  stroke={GRADIENT_PALETTE[pid].to}
                  strokeWidth={isFocus ? 7.5 : 5.5}
                  strokeDasharray={dashArray}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  opacity={dimmed ? 0.25 : 0.9}
                  className="cursor-pointer transition-all duration-200"
                  onMouseEnter={() => setActivePid(pid)}
                  onMouseLeave={() => setActivePid(null)}
                  onClick={() => setActivePid((prev) => (prev === pid ? null : pid))}
                />
              );
            })}
          </svg>

          {/* Dynamic Center Readout */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-2">
            <span className="text-lg font-extrabold font-mono-num text-amber-500 leading-none">
              {activeStars}⭐
            </span>
            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 truncate max-w-[74px] mt-1">
              {activePid ? `${getParticipantName(gameState, activePid)} · ${activeShare}%` : 'total em jogo'}
            </span>
          </div>
        </div>

        {/* Interactive Legend */}
        <div className="flex-1 w-full space-y-1.5 min-w-0">
          {ranked.map((pid) => {
            const info = PARTICIPANT_PROFILES[pid];
            const stars = gameState.participants[pid].stars;
            const share =
              totalStarsAll > 0 ? Math.round((Math.max(0, stars) / totalStarsAll) * 100) : 0;
            const secVal = secondaryByPid[pid] || 0;
            const isFocus = activePid === pid;

            return (
              <button
                key={pid}
                type="button"
                onMouseEnter={() => setActivePid(pid)}
                onMouseLeave={() => setActivePid(null)}
                onClick={() => setActivePid((prev) => (prev === pid ? null : pid))}
                className={`w-full flex items-center justify-between text-xs gap-2 rounded-xl px-2.5 py-1.5 transition-all ${
                  isFocus
                    ? 'bg-slate-900/[0.05] dark:bg-white/[0.08] ring-1 ring-amber-400/50'
                    : 'hover:bg-slate-900/[0.03] dark:hover:bg-white/[0.04]'
                }`}
              >
                <span className="flex items-center gap-2 truncate font-semibold text-slate-800 dark:text-slate-100">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: info.accentColor }}
                  />
                  {getParticipantName(gameState, pid)}
                </span>
                <span className="font-mono-num text-slate-600 dark:text-slate-300 shrink-0">
                  {stars}⭐ · {share}% · {secVal}
                  {ringMode === 'stars' ? 'a' : 'p'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 7. 5-Axis Performance Radar with House Average Overlay                     */
/* -------------------------------------------------------------------------- */
export function PerformanceRadarChart({
  gameState,
  dateStr,
  ranked,
  currentUserId,
}: {
  gameState: GameState;
  dateStr: string;
  ranked: ParticipantId[];
  currentUserId: ParticipantId;
}) {
  const [focusPid, setFocusPid] = useState<ParticipantId>(currentUserId);
  const [hoveredAxis, setHoveredAxis] = useState<number | null>(null);
  const day = gameState.days[dateStr];
  const daySummaries = useMemo(
    () => computeDaySummary(gameState, dateStr) || [],
    [gameState, dateStr]
  );
  const summaryMap = useMemo(
    () => Object.fromEntries(daySummaries.map((s) => [s.pid, s])),
    [daySummaries]
  );

  const { metrics, avgScores } = useMemo(() => {
    const maxStars = Math.max(25, ...ranked.map((id) => gameState.participants[id].stars));
    const maxInv = Math.max(
      1,
      ...ranked.map((id) => {
        const inv = gameState.participants[id].inventory;
        return inv.fantasma + inv.escudo + inv.chefe + inv.coringa;
      })
    );
    const maxTasks = Math.max(
      2,
      ...ranked.map((id) =>
        day ? TASK_DEFINITIONS.filter((t) => day.tasks[t.id]?.completedBy === id).length : 0
      )
    );
    const maxNet = Math.max(
      4,
      ...ranked.map((id) => Math.max(0, summaryMap[id]?.netStars ?? 0))
    );

    const out = {} as Record<ParticipantId, { scores: number[]; raw: string[] }>;

    for (const pid of ranked) {
      const p = gameState.participants[pid];
      const rout = day
        ? ROUTINE_DEFINITIONS.filter((r) => day.routines[pid]?.[r.id]?.completed).length
        : 0;
      const tasks = day
        ? TASK_DEFINITIONS.filter((t) => day.tasks[t.id]?.completedBy === pid).length
        : 0;
      const invTotal =
        p.inventory.fantasma + p.inventory.escudo + p.inventory.chefe + p.inventory.coringa;
      const netToday = summaryMap[pid]?.netStars ?? 0;

      out[pid] = {
        scores: [
          Math.max(0.12, Math.min(1, p.stars / maxStars)),
          Math.max(0.1, Math.min(1, rout / 7)),
          Math.max(0.1, Math.min(1, tasks / maxTasks)),
          Math.max(0.1, Math.min(1, invTotal / maxInv)),
          Math.max(0.1, Math.min(1, Math.max(0, netToday) / maxNet)),
        ],
        raw: [
          `${p.stars} ⭐`,
          `${rout}/7`,
          `${tasks} tarefas`,
          `${invTotal} itens`,
          `${netToday >= 0 ? `+${netToday}` : netToday} ⭐`,
        ],
      };
    }

    const avg = [0, 1, 2, 3, 4].map(
      (idx) => ranked.reduce((s, pid) => s + out[pid].scores[idx], 0) / ranked.length
    );

    return { metrics: out, avgScores: avg };
  }, [day, gameState.participants, ranked, summaryMap]);

  const axes = ['Estrelas', 'Rotinas', 'Tarefas', 'Poderes', 'Saldo Hoje'];
  const cx = 130;
  const cy = 112;
  const maxR = 76;

  const pointAt = (axisIdx: number, ratio: number) => {
    const angle = -Math.PI / 2 + (axisIdx * 2 * Math.PI) / axes.length;
    return {
      x: cx + Math.cos(angle) * maxR * ratio,
      y: cy + Math.sin(angle) * maxR * ratio,
    };
  };

  const avgPolyPts = avgScores
    .map((sc, idx) => {
      const p = pointAt(idx, sc);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="glass-subcard rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
            Radar Multidimensional vs Média da Casa
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Linha tracejada = média dos 4 participantes
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ranked.map((pid) => {
            const isSel = focusPid === pid;
            return (
              <button
                key={pid}
                type="button"
                onClick={() => setFocusPid(pid)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                  isSel
                    ? 'bg-amber-400 text-slate-950 shadow-sm'
                    : 'bg-slate-200/70 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor: isSel ? '#0B0D12' : PARTICIPANT_PROFILES[pid].accentColor,
                  }}
                />
                {getParticipantName(gameState, pid)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
        <div className="md:col-span-3 flex justify-center">
          <svg
            viewBox="0 0 260 225"
            className="w-full max-w-[280px] h-52 overflow-visible select-none"
            role="img"
            aria-label="Gráfico radar de performance em 5 eixos"
          >
            {/* Concentric pentagons */}
            {[0.25, 0.5, 0.75, 1].map((ring) => {
              const ringPts = axes
                .map((_, idx) => {
                  const p = pointAt(idx, ring);
                  return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                })
                .join(' ');
              return (
                <polygon
                  key={ring}
                  points={ringPts}
                  fill="none"
                  stroke="currentColor"
                  className="text-slate-200 dark:text-white/10"
                  strokeWidth="1"
                  strokeDasharray={ring < 1 ? '2 3' : undefined}
                />
              );
            })}

            {/* Axis spokes + labels */}
            {axes.map((label, idx) => {
              const end = pointAt(idx, 1);
              const lbl = pointAt(idx, 1.2);
              const isAxHover = hoveredAxis === idx;
              return (
                <g key={label}>
                  <line
                    x1={cx}
                    y1={cy}
                    x2={end.x}
                    y2={end.y}
                    stroke="currentColor"
                    className={
                      isAxHover ? 'text-amber-400/70' : 'text-slate-200 dark:text-white/10'
                    }
                    strokeWidth={isAxHover ? 1.5 : 1}
                  />
                  <text
                    x={lbl.x}
                    y={lbl.y + 3}
                    textAnchor="middle"
                    className={`text-[9.5px] font-bold ${
                      isAxHover ? 'fill-amber-500' : 'fill-slate-600 dark:fill-slate-300'
                    }`}
                  >
                    {label}
                  </text>
                </g>
              );
            })}

            {/* House Average dashed benchmark polygon */}
            <polygon
              points={avgPolyPts}
              fill="currentColor"
              className="text-slate-400/10 dark:text-white/[0.04]"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeDasharray="4 3"
              style={{ color: '#94A3B8' }}
            />

            {/* Focused participant polygon */}
            {(() => {
              const pal = GRADIENT_PALETTE[focusPid];
              const polyPts = metrics[focusPid].scores
                .map((sc, idx) => {
                  const p = pointAt(idx, sc);
                  return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                })
                .join(' ');

              return (
                <g>
                  <motion.polygon
                    points={polyPts}
                    animate={{ points: polyPts }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    fill={pal.from}
                    fillOpacity={0.28}
                    stroke={pal.from}
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                  />
                  {metrics[focusPid].scores.map((sc, idx) => {
                    const p = pointAt(idx, sc);
                    const isAxHover = hoveredAxis === idx;
                    return (
                      <g
                        key={idx}
                        onMouseEnter={() => setHoveredAxis(idx)}
                        onMouseLeave={() => setHoveredAxis(null)}
                        onClick={() => setHoveredAxis((prev) => (prev === idx ? null : idx))}
                        className="cursor-pointer"
                      >
                        <circle cx={p.x} cy={p.y} r="9" fill="transparent" />
                        {isAxHover && <circle cx={p.x} cy={p.y} r="7.5" fill={pal.soft} />}
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={isAxHover ? 4.8 : 3.6}
                          fill={pal.to}
                          stroke="#0B0D12"
                          strokeWidth="1.4"
                        />
                      </g>
                    );
                  })}
                </g>
              );
            })()}
          </svg>
        </div>

        {/* Axis values table with vs-House comparison */}
        <div className="md:col-span-2 space-y-2">
          <div className="flex items-center gap-2 pb-1.5 border-b border-slate-200/70 dark:border-white/10">
            <img
              src={getParticipantAvatar(gameState, focusPid)}
              alt={getParticipantName(gameState, focusPid)}
              referrerPolicy="no-referrer"
              className="w-7 h-7 rounded-lg object-cover"
            />
            <span className="text-xs font-extrabold text-slate-900 dark:text-white">
              {getParticipantName(gameState, focusPid)}
            </span>
          </div>
          {axes.map((ax, idx) => {
            const scorePct = Math.round(metrics[focusPid].scores[idx] * 100);
            const avgPct = Math.round(avgScores[idx] * 100);
            const diff = scorePct - avgPct;
            const isActive = hoveredAxis === idx;
            return (
              <div
                key={ax}
                onMouseEnter={() => setHoveredAxis(idx)}
                onMouseLeave={() => setHoveredAxis(null)}
                className={`flex items-center justify-between text-xs rounded-lg px-1.5 py-0.5 transition-colors ${
                  isActive ? 'bg-amber-400/15' : ''
                }`}
              >
                <span className="text-slate-500 dark:text-slate-400">{ax}</span>
                <span className="font-mono-num font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>{metrics[focusPid].raw[idx]}</span>
                  <span
                    className={`text-[10px] ${
                      diff >= 0 ? 'text-emerald-500' : 'text-rose-400'
                    }`}
                  >
                    {diff >= 0 ? `+${diff}%` : `${diff}%`}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 8. House Activity & Consistency Heatmap Matrix (AnalyticsAdminView)        */
/* -------------------------------------------------------------------------- */
export function HouseActivityHeatmap({
  gameState,
  ranked,
}: {
  gameState: GameState;
  ranked: ParticipantId[];
}) {
  const { daySummariesByKey } = useMemo(() => buildParticipantSeries(gameState), [gameState]);
  const [selectedCell, setSelectedCell] = useState<{
    dateStr: string;
    pid: ParticipantId;
  } | null>(() => {
    const lastDay = daySummariesByKey[daySummariesByKey.length - 1];
    return lastDay ? { dateStr: lastDay.dateStr, pid: ranked[0] } : null;
  });

  if (daySummariesByKey.length === 0) return null;

  const activeEntry =
    daySummariesByKey.find((d) => d.dateStr === selectedCell?.dateStr) ||
    daySummariesByKey[daySummariesByKey.length - 1];
  const activePid = selectedCell?.pid || ranked[0];
  const activeSummary = activeEntry?.map[activePid];

  const getCellStyle = (net: number) => {
    if (net >= 8) {
      return 'bg-emerald-500/85 text-slate-950 border-emerald-400';
    }
    if (net > 0) {
      return 'bg-emerald-500/35 text-emerald-900 dark:text-emerald-200 border-emerald-400/40';
    }
    if (net === 0) {
      return 'bg-slate-200/70 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 border-slate-300/60 dark:border-white/10';
    }
    return 'bg-rose-500/35 text-rose-900 dark:text-rose-200 border-rose-400/45';
  };

  return (
    <div className="glass-subcard rounded-2xl p-4 sm:p-5 space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
            Mapa de Calor &amp; Consistência Diária
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Intensidade de saldo líquido por dia e participante — toque em qualquer célula
          </p>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono-num text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/45" /> Queda
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/35" /> Positivo
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/85" /> Alto (+8⭐)
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[340px] space-y-2">
          {/* Date header row */}
          <div className="flex items-center gap-2">
            <div className="w-24 sm:w-28 shrink-0 text-[10px] font-bold text-slate-400">
              Participante
            </div>
            <div className="flex-1 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${daySummariesByKey.length}, minmax(54px, 1fr))` }}>
              {daySummariesByKey.map((d) => (
                <div
                  key={d.dateStr}
                  className="text-center text-[10px] font-mono-num font-bold text-slate-500 dark:text-slate-400"
                >
                  {formatShortDateLabel(d.dateStr)}
                </div>
              ))}
            </div>
          </div>

          {/* Participant rows */}
          {ranked.map((pid) => (
            <div key={pid} className="flex items-center gap-2">
              <div className="w-24 sm:w-28 shrink-0 flex items-center gap-2 min-w-0">
                <img
                  src={getParticipantAvatar(gameState, pid)}
                  alt={getParticipantName(gameState, pid)}
                  referrerPolicy="no-referrer"
                  className="w-5 h-5 rounded-md object-cover shrink-0"
                />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                  {getParticipantName(gameState, pid)}
                </span>
              </div>

              <div
                className="flex-1 grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${daySummariesByKey.length}, minmax(54px, 1fr))` }}
              >
                {daySummariesByKey.map((d) => {
                  const s = d.map[pid];
                  const net = s?.netStars ?? 0;
                  const isSel =
                    activeEntry?.dateStr === d.dateStr && activePid === pid;
                  return (
                    <button
                      key={`${pid}-${d.dateStr}`}
                      type="button"
                      onMouseEnter={() => setSelectedCell({ dateStr: d.dateStr, pid })}
                      onClick={() => setSelectedCell({ dateStr: d.dateStr, pid })}
                      className={`h-9 rounded-lg border font-mono-num text-xs font-extrabold transition-all flex items-center justify-center ${getCellStyle(
                        net
                      )} ${isSel ? 'ring-2 ring-amber-400 scale-[1.03]' : ''}`}
                    >
                      {net > 0 ? `+${net}` : net}⭐
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Cell Detailed Readout */}
      {activeSummary && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-white/10 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 dark:text-white">
              {getParticipantName(gameState, activePid)} ·{' '}
              {formatShortDateLabel(activeEntry.dateStr)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono-num text-[11px] text-slate-600 dark:text-slate-300">
            <span>
              Rotinas: <strong>{activeSummary.completedRoutinesCount}/7</strong>
            </span>
            <span>
              Tarefas: <strong>{activeSummary.completedTasks.length}</strong>
            </span>
            <span>
              Saldo:{' '}
              <strong
                className={
                  activeSummary.netStars >= 0 ? 'text-emerald-500' : 'text-rose-400'
                }
              >
                {activeSummary.netStars > 0
                  ? `+${activeSummary.netStars}`
                  : activeSummary.netStars}
                ⭐
              </strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
