import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BellRing,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Crown,
  Dices,
  Flag,
  Ghost,
  History,
  Lock,
  MessageCircle,
  Music,
  Pencil,
  Plus,
  RotateCcw,
  Shield,
  SlidersHorizontal,
  Snowflake,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { processAvatarFile } from '../services/avatarUpload.ts';
import { getSoundThemeMeta } from '../services/starCelebrationAudio.ts';
import {
  computeDaySummary,
  getActiveWeekendPunishmentForOwner,
  getDiceWindowStatus,
  getEffectiveAssignee,
  getTaskResponsibleParticipant,
  isDeadlineBypassedByPrerequisite,
  isFrozenToday,
  isRoutineUnlocked,
  isShieldActiveNow,
  isTaskUnlocked,
} from '../shared/gameLogic.ts';
import { t } from '../shared/i18n.ts';
import { computeActionableAlerts } from '../shared/notificationFilter.ts';
import {
  formatPortugueseDateHeading,
  getBrazilClockHHMM,
  getDeadlineForItem,
  getEffectiveRoutineDefinition,
  getEffectiveTaskDefinition,
  getOtherParticipants,
  getParticipantAvatar,
  getParticipantName,
  getPreviousDateStr,
  isTimePastDeadline,
  PARTICIPANT_PROFILES,
  ROTATION_ORDER,
  ROUTINE_DEFINITIONS,
  TASK_DEFINITIONS,
} from '../shared/schedule.ts';
import type {
  GameState,
  LanguageCode,
  ParticipantId,
  PowerType,
  RoutineId,
  SoundThemeId,
  TaskId,
} from '../shared/types.ts';
import EmojiReactionBar from './EmojiReactionBar.tsx';
import FantasmaBanner from './FantasmaBanner.tsx';
import SoundThemePicker from './SoundThemePicker.tsx';
import {
  LuminousRoutineRing,
  ParticipantSparkline,
  StarBreakdownChart,
} from './charts/NextGenCharts.tsx';
import type { SubRoute } from '../hooks/useTabNavigation.ts';

interface PainelTabProps {
  lang: LanguageCode;
  gameState: GameState;
  currentUserId: ParticipantId;
  onAction: (
    type: string,
    payload?: Record<string, unknown>,
    optimistic?: (draft: GameState) => void
  ) => Promise<{ ok: boolean; error?: string; face?: number }>;
  onPushRoute: (route: SubRoute) => void;
  onOpenChat?: () => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onSelectSoundTheme?: (themeId: SoundThemeId) => Promise<unknown>;
}

const DICE_R1_LABELS: Record<number, string> = {
  1: 'Perde 1 estrela automaticamente.',
  2: 'Nada acontece. Aguarde a próxima rodada.',
  3: '+1 ⭐ e ganha ESCUDO (ative já; protege de tudo, até dos sorteios, até 12:00).',
  4: '+1 ⭐ na hora e ganha FANTASMA (1 sorteio).',
  5: '+1 ⭐ automaticamente e ganhou CHEFE: delegue 1 tarefa sua (ou guarde nos itens).',
  6: 'Ganhou um CORINGA: escolha Escudo, Fantasma ou Chefe.',
};

const DICE_R2_LABELS: Record<number, string> = {
  1: 'Ganha +4 ⭐ tirando de um participante à escolha.',
  2: 'Perde 3 estrelas, 1 para cada participante.',
  3: '+1 ⭐ na hora e ganha FANTASMA x2 (2 sorteios).',
  4: '+2 ⭐ e congela suas estrelas pelo resto do dia.',
  5: '+2 ⭐ automaticamente e ganhou CHEFE x2: delegue até 2 tarefas suas (ou guarde nos itens).',
  6: 'Ganhou um CORINGA (use em até 2 participantes).',
};

const DICE_PIPS: Record<number, Array<[number, number]>> = {
  1: [[24, 24]],
  2: [[15, 15], [33, 33]],
  3: [[15, 15], [24, 24], [33, 33]],
  4: [[15, 15], [33, 15], [15, 33], [33, 33]],
  5: [[15, 15], [33, 15], [24, 24], [15, 33], [33, 33]],
  6: [[15, 14], [33, 14], [15, 24], [33, 24], [15, 34], [33, 34]],
};

function DiceFaceSvg({ face }: { face: number }) {
  const pips = DICE_PIPS[face] || DICE_PIPS[1];
  return (
    <svg
      viewBox="0 0 48 48"
      className="w-12 h-12 shrink-0 drop-shadow-[0_6px_12px_rgba(245,158,11,0.28)]"
      aria-label={`Dado face ${face}`}
    >
      <defs>
        <linearGradient id={`diceGrad-${face}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="55%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
      </defs>
      <rect
        x="2"
        y="2"
        width="44"
        height="44"
        rx="12"
        fill={`url(#diceGrad-${face})`}
        stroke="#FEF08A"
        strokeOpacity="0.65"
        strokeWidth="1.5"
      />
      <rect
        x="4.5"
        y="4.5"
        width="39"
        height="39"
        rx="10"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.25"
        strokeWidth="1"
      />
      {pips.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="3.6" fill="#0B0D12" />
      ))}
    </svg>
  );
}

function RoutineRingSvg({ done, total = 7 }: { done: number; total?: number }) {
  return <LuminousRoutineRing done={done} total={total} />;
}

export default function PainelTab({
  lang,
  gameState,
  currentUserId,
  onAction,
  onPushRoute,
  onOpenChat,
  soundEnabled = true,
  onToggleSound,
  onSelectSoundTheme,
}: PainelTabProps) {
  const dateStr = gameState.currentDateStr;
  const day = gameState.days[dateStr];
  const currentUser = gameState.participants[currentUserId];
  const myDisplayName = getParticipantName(gameState, currentUserId);
  const mySoundTheme = getSoundThemeMeta(currentUser.soundTheme);
  const [showSoundPicker, setShowSoundPicker] = useState(false);

  const [liveBrazilHHMM, setLiveBrazilHHMM] = useState(() => getBrazilClockHHMM());
  useEffect(() => {
    const syncClock = () => setLiveBrazilHHMM(getBrazilClockHHMM());
    const timer = setInterval(syncClock, 10000);
    window.addEventListener('focus', syncClock);
    document.addEventListener('visibilitychange', syncClock);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', syncClock);
      document.removeEventListener('visibilitychange', syncClock);
    };
  }, []);

  const nowHHMM = gameState.simulatedClockTime || liveBrazilHHMM;
  const getTapClockHHMM = () => gameState.simulatedClockTime || getBrazilClockHHMM();

  // Inline display name & avatar edit state
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(myDisplayName);
  const [savingName, setSavingName] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [pendingItemKeys, setPendingItemKeys] = useState<Record<string, boolean>>({});
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  // Justification state
  const [justReason, setJustReason] = useState<'doente' | 'saiu' | 'outro'>('doente');
  const [justDetails, setJustDetails] = useState('');
  const [justRoutineIds, setJustRoutineIds] = useState<RoutineId[]>([]);

  // Dice non-roll justification state (per participant, per day in gameState)
  const savedDiceJustification = day?.diceJustifications?.[currentUserId];
  const [diceJustText, setDiceJustText] = useState(savedDiceJustification?.text || '');
  const [savingDiceJust, setSavingDiceJust] = useState(false);
  const [diceJustFeedback, setDiceJustFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  useEffect(() => {
    setDiceJustText(savedDiceJustification?.text || '');
    setDiceJustFeedback(null);
  }, [dateStr, currentUserId, savedDiceJustification?.text]);

  // Denunciation state
  const others = useMemo(() => getOtherParticipants(currentUserId), [currentUserId]);
  const [denTarget, setDenTarget] = useState<ParticipantId>(others[0]);
  const [denCategory, setDenCategory] = useState<'tarefa' | 'rotina'>('rotina');
  const [denItemId, setDenItemId] = useState<string>(ROUTINE_DEFINITIONS[0].id);
  const [denDetails, setDenDetails] = useState('');

  // Interactive power / dice selection states
  const [diceSelectedTask, setDiceSelectedTask] = useState<TaskId | ''>('');
  const [diceSelectedTarget, setDiceSelectedTarget] = useState<ParticipantId | ''>('');
  const [rollingDiceRound, setRollingDiceRound] = useState<1 | 2 | null>(null);
  const [resolvingDiceRound, setResolvingDiceRound] = useState<1 | 2 | null>(null);
  const [activeInventoryModal, setActiveInventoryModal] = useState<PowerType | null>(null);
  const [inventoryModalOrigin, setInventoryModalOrigin] = useState<'top' | 'items'>('top');
  const [invCoringaChoice, setInvCoringaChoice] = useState<'fantasma' | 'escudo' | 'chefe'>('escudo');
  const [invTaskId, setInvTaskId] = useState<TaskId | ''>('');
  const [invTargetId, setInvTargetId] = useState<ParticipantId | ''>('');
  const [confirmGiveUpTaskId, setConfirmGiveUpTaskId] = useState<TaskId | null>(null);
  const [tasksViewMode, setTasksViewMode] = useState<'by_person' | 'by_time'>('by_person');
  const topItemsSectionRef = useRef<HTMLElement | null>(null);
  const itemsSectionRef = useRef<HTMLElement | null>(null);
  const historySectionRef = useRef<HTMLElement | null>(null);

  const sortedStandings = useMemo(() => {
    return [...ROTATION_ORDER].sort(
      (a, b) => gameState.participants[b].stars - gameState.participants[a].stars
    );
  }, [gameState.participants]);

  const myRank = sortedStandings.indexOf(currentUserId) + 1;
  const shieldActive = isShieldActiveNow(gameState, currentUserId, dateStr, nowHHMM);
  const frozenToday = isFrozenToday(gameState, currentUserId, dateStr);

  const myRoutinesDone = day
    ? ROUTINE_DEFINITIONS.filter((r) => day.routines[currentUserId]?.[r.id]?.completed).length
    : 0;

  const prevDateStr = useMemo(() => getPreviousDateStr(dateStr), [dateStr]);
  const recordedDates = useMemo(() => {
    return Object.keys(gameState.days).sort((a, b) => b.localeCompare(a));
  }, [gameState.days]);

  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string>(() =>
    gameState.days[prevDateStr] ? prevDateStr : dateStr
  );

  const effectiveHistoryDate = gameState.days[selectedHistoryDate]
    ? selectedHistoryDate
    : gameState.days[prevDateStr]
    ? prevDateStr
    : dateStr;

  const todaySummaries = useMemo(() => {
    const list = computeDaySummary(gameState, dateStr) || [];
    return Object.fromEntries(list.map((s) => [s.pid, s])) as Record<
      ParticipantId,
      (typeof list)[number]
    >;
  }, [gameState, dateStr]);

  const selectedDaySummaries = useMemo(
    () => computeDaySummary(gameState, effectiveHistoryDate),
    [gameState, effectiveHistoryDate]
  );

  const getTaskMeta = (def: (typeof TASK_DEFINITIONS)[number]) =>
    getEffectiveTaskDefinition(gameState, def.id);

  const activeCustomTasks = useMemo(() => {
    return (gameState.customTasks || []).filter(
      (ct) => ct.dateStr === 'all' || ct.dateStr === dateStr
    );
  }, [gameState.customTasks, dateStr]);

  const myTasks = useMemo(() => {
    if (!day) return [];
    return TASK_DEFINITIONS.filter((def) => {
      const tState = day.tasks[def.id];
      if (!tState) return false;
      const eff = getTaskResponsibleParticipant(gameState, day, dateStr, def.id);
      return (
        eff === currentUserId ||
        (tState.fantasmaOwner === currentUserId && tState.canceledByFantasma) ||
        (tState.delegatedBy === currentUserId && tState.delegationStage === 'awaiting_owner_draw')
      );
    });
  }, [day, gameState, dateStr, currentUserId]);

  const activePunishmentCoveringMe = useMemo(
    () => getActiveWeekendPunishmentForOwner(gameState, dateStr, currentUserId),
    [gameState, dateStr, currentUserId]
  );

  const coveredByPunishmentTasksToday = useMemo(() => {
    if (!day || !activePunishmentCoveringMe) return [];
    return TASK_DEFINITIONS.filter((def) => {
      const st = day.tasks[def.id];
      return (
        st &&
        st.assignedTo === currentUserId &&
        !st.rescue &&
        !st.delegatedBy &&
        !st.canceledByFantasma &&
        !def.ownerOnly &&
        def.id !== 'roupa'
      );
    });
  }, [day, activePunishmentCoveringMe, currentUserId]);

  const otherTasks = useMemo(() => {
    if (!day) return [];
    return TASK_DEFINITIONS.filter((def) => {
      const tState = day.tasks[def.id];
      if (!tState) return false;
      const eff = getTaskResponsibleParticipant(gameState, day, dateStr, def.id);
      const isMyDelegationDraw =
        tState.delegatedBy === currentUserId && tState.delegationStage === 'awaiting_owner_draw';
      return (
        eff !== currentUserId &&
        !(tState.fantasmaOwner === currentUserId && tState.canceledByFantasma) &&
        !isMyDelegationDraw
      );
    });
  }, [day, gameState, dateStr, currentUserId]);

  const otherTasksByParticipant = useMemo(() => {
    if (!day) return [];
    return others.map((pid) => {
      const tasks = TASK_DEFINITIONS.filter((def) => {
        const st = day.tasks[def.id];
        if (!st) return false;
        const eff = getTaskResponsibleParticipant(gameState, day, dateStr, def.id);
        return (
          eff === pid ||
          (st.canceledByFantasma && st.fantasmaOwner === pid) ||
          (st.delegatedBy === pid && st.delegatedTo !== pid)
        );
      });
      const resolvedCount = tasks.filter((def) => {
        const st = day.tasks[def.id];
        return Boolean(st?.completedBy || st?.canceledByFantasma);
      }).length;
      return { pid, tasks, resolvedCount };
    });
  }, [day, gameState, dateStr, others]);

  const unscheduledTasksToday = useMemo(() => {
    if (!day) return [];
    return TASK_DEFINITIONS.filter((def) => {
      const st = day.tasks[def.id];
      return st && !st.assignedTo && !st.completedBy && !st.canceledByFantasma;
    });
  }, [day]);

  const availableTasksToUsePower = useMemo(() => {
    if (!day) return [];
    return TASK_DEFINITIONS.filter((def) => {
      const st = day.tasks[def.id];
      return (
        st &&
        !st.completedBy &&
        !st.canceledByFantasma &&
        !st.rescue &&
        !st.delegatedBy &&
        getEffectiveAssignee(day, def.id) === currentUserId
      );
    });
  }, [day, currentUserId]);

  const availableTasksForChefe = useMemo(
    () => availableTasksToUsePower.filter((def) => !def.ownerOnly && def.id !== 'roupa'),
    [availableTasksToUsePower]
  );

  const ownedInventoryItems = useMemo(() => {
    const defs = [
      { key: 'fantasma' as const, label: 'Fantasma', emoji: '👻', icon: Ghost },
      { key: 'escudo' as const, label: 'Escudo', emoji: '🛡️', icon: Shield },
      { key: 'chefe' as const, label: 'Chefe', emoji: '👑', icon: Crown },
      { key: 'coringa' as const, label: 'Coringa', emoji: '🃏', icon: Sparkles },
    ];
    return defs
      .map((d) => ({ ...d, count: currentUser.inventory[d.key] || 0 }))
      .filter((d) => d.count > 0);
  }, [currentUser.inventory]);

  const interactiveTaskFlows = useMemo(() => {
    if (!day) return [];
    return TASK_DEFINITIONS.map((def) => ({ def, st: day.tasks[def.id] })).filter(({ st }) => {
      if (!st || st.completedBy || st.canceledByFantasma) return false;
      if (st.rescue && !st.rescue.failedStep3) return true;
      return Boolean(
        st.delegationStage === 'pending_target' ||
          st.delegationStage === 'awaiting_owner_draw' ||
          st.delegationStage === 'pending_draw' ||
          st.delegationStage === 'returned_to_owner'
      );
    });
  }, [day]);

  const actionableAlerts = useMemo(
    () => computeActionableAlerts(gameState, currentUserId, dateStr, nowHHMM),
    [gameState, currentUserId, dateStr, nowHHMM]
  );

  const pendingPunishmentsToDecide = gameState.weekendPunishments.filter(
    (wp) => wp.chosenDay === null && wp.punishedId !== currentUserId
  );

  const myAssignedPunishments = gameState.weekendPunishments.filter(
    (wp) => wp.punishedId === currentUserId && !wp.completed
  );

  const hasValidTaskJustificationToday = (gameState.justifications || []).some(
    (j) =>
      j.dateStr === dateStr &&
      j.participantId === currentUserId &&
      (j.reason === 'doente' || j.reason === 'saiu')
  );

  const handleCompleteRoutine = async (routineId: RoutineId) => {
    const key = `routine:${routineId}`;
    if (pendingItemKeys[key]) return;
    const tapHHMM = getTapClockHHMM();
    setPendingItemKeys((prev) => ({ ...prev, [key]: true }));
    try {
      await onAction(
        'complete_routine',
        { routineId, dateStr, nowHHMM: tapHHMM },
        (draft) => {
          const d = draft.days[dateStr];
          const entry = d?.routines[currentUserId]?.[routineId];
          if (entry && !entry.completed && !entry.justified && !entry.expiredPenaltyApplied) {
            entry.completed = true;
            entry.completedAt = `${dateStr}T${tapHHMM}:00`;
            if (!isFrozenToday(draft, currentUserId, dateStr)) {
              draft.participants[currentUserId].stars += 1;
            }
          }
        }
      );
    } finally {
      setPendingItemKeys((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleCompleteTask = async (taskId: TaskId) => {
    const key = `task:${taskId}`;
    if (pendingItemKeys[key]) return;
    const tapHHMM = getTapClockHHMM();
    setPendingItemKeys((prev) => ({ ...prev, [key]: true }));
    try {
      await onAction(
        'complete_task',
        { taskId, dateStr, nowHHMM: tapHHMM },
        (draft) => {
          const d = draft.days[dateStr];
          const st = d?.tasks[taskId];
          if (st && !st.completedBy && !st.canceledByFantasma) {
            st.completedBy = currentUserId;
            st.completedAt = `${dateStr}T${tapHHMM}:00`;
            const isPunishmentCoverage =
              !st.rescue &&
              !st.delegatedBy &&
              !st.canceledByFantasma &&
              Boolean(st.assignedTo && st.assignedTo !== currentUserId);
            if (isPunishmentCoverage && st.assignedTo) {
              st.weekendPunishmentFor = st.assignedTo;
              if (!isFrozenToday(draft, st.assignedTo, dateStr)) {
                draft.participants[st.assignedTo].stars += 1;
              }
            } else if (!isFrozenToday(draft, currentUserId, dateStr)) {
              const reward = st.rescue
                ? st.rescue.rewardStars
                : st.delegationStage === 'accepted_draw' ||
                  st.delegationStage === 'returned_to_owner' ||
                  st.delegationReturnedToOwner
                ? 2
                : 1;
              draft.participants[currentUserId].stars += reward;
              if (
                !st.rescue &&
                st.delegationStage === 'accepted_target' &&
                st.delegatedBy &&
                !isFrozenToday(draft, st.delegatedBy, dateStr)
              ) {
                draft.participants[st.delegatedBy].stars += 1;
              }
            }
          }
        }
      );
    } finally {
      setPendingItemKeys((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleSubmitJustification = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await onAction('submit_justification', {
      reason: justReason,
      details: justDetails,
      routineIds: justRoutineIds.length > 0 ? justRoutineIds : undefined,
      dateStr,
      nowHHMM,
    });
    if (res.ok) {
      setJustDetails('');
      setJustRoutineIds([]);
    }
  };

  const handleSaveDiceJustification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingDiceJust) return;
    const trimmed = diceJustText.trim();
    if (!trimmed && !savedDiceJustification) {
      setDiceJustFeedback({
        type: 'err',
        text: 'Digite o motivo de não jogar o dado antes de salvar.',
      });
      return;
    }
    const tapHHMM = getTapClockHHMM();
    setSavingDiceJust(true);
    setDiceJustFeedback(null);
    try {
      const res = await onAction(
        'save_dice_justification',
        { text: trimmed, dateStr, nowHHMM: tapHHMM },
        (draft) => {
          const targetDay = draft.days[dateStr];
          if (!targetDay) return;
          if (!targetDay.diceJustifications) targetDay.diceJustifications = {};
          if (!trimmed) {
            delete targetDay.diceJustifications[currentUserId];
          } else {
            targetDay.diceJustifications[currentUserId] = {
              text: trimmed.replace(/\s+/g, ' ').slice(0, 300),
              updatedAt: `${dateStr}T${tapHHMM}:00`,
            };
          }
        }
      );
      if (res.ok) {
        setDiceJustFeedback({
          type: 'ok',
          text: trimmed
            ? 'Justificativa do dado salva para hoje (0 ⭐).'
            : 'Justificativa do dado removida.',
        });
      } else {
        setDiceJustFeedback({
          type: 'err',
          text: res.error || 'Não foi possível salvar a justificativa.',
        });
      }
    } finally {
      setSavingDiceJust(false);
    }
  };

  const handleClearDiceJustification = async () => {
    if (savingDiceJust || !savedDiceJustification) return;
    const tapHHMM = getTapClockHHMM();
    setSavingDiceJust(true);
    setDiceJustFeedback(null);
    try {
      const res = await onAction(
        'save_dice_justification',
        { text: '', dateStr, nowHHMM: tapHHMM },
        (draft) => {
          const targetDay = draft.days[dateStr];
          if (targetDay?.diceJustifications) {
            delete targetDay.diceJustifications[currentUserId];
          }
        }
      );
      if (res.ok) {
        setDiceJustText('');
        setDiceJustFeedback({
          type: 'ok',
          text: 'Justificativa do dado removida.',
        });
      }
    } finally {
      setSavingDiceJust(false);
    }
  };

  const handleSubmitDenunciation = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await onAction('submit_denunciation', {
      targetId: denTarget,
      category: denCategory,
      itemId: denItemId,
      details: denDetails,
      dateStr,
      nowHHMM,
    });
    if (res.ok) {
      setDenDetails('');
    }
  };

  const runDiceRoll = async (round: 1 | 2) => {
    if (rollingDiceRound !== null) return;
    setRollingDiceRound(round);
    try {
      await onAction('roll_dice', { round, dateStr, nowHHMM });
    } finally {
      setRollingDiceRound(null);
    }
  };

  const runResolveDice = async (
    round: 1 | 2,
    payload: Record<string, unknown>
  ): Promise<{ ok: boolean; error?: string }> => {
    if (resolvingDiceRound !== null) return { ok: false };
    setResolvingDiceRound(round);
    try {
      return await onAction('resolve_dice', { round, ...payload, dateStr, nowHHMM });
    } finally {
      setResolvingDiceRound(null);
    }
  };

  const renderDiceCard = (round: 1 | 2) => {
    const diceState = day?.dice[currentUserId]?.[round === 1 ? 'round1' : 'round2'];
    const labels = round === 1 ? DICE_R1_LABELS : DICE_R2_LABELS;
    const winStatus = getDiceWindowStatus(gameState, dateStr, round, nowHHMM);
    const isRollingThis = rollingDiceRound === round;
    const isResolvingThis = resolvingDiceRound === round;

    return (
      <div className="glass-subcard rounded-2xl p-4 sm:p-5 transition-all">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              Rodada {round} · {round === 1 ? 'Manhã · 05:00 às 10:00' : 'Tarde · 12:00 às 19:00'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {winStatus.reason === 'disabled_today'
                ? 'Não permitido hoje (volta no próximo dia)'
                : round === 1
                ? '1 jogada matinal (05:00–10:00)'
                : '1 jogada à tarde (12:00–19:00)'}
            </p>
          </div>
          {diceState && <DiceFaceSvg face={diceState.face} />}
        </div>

        {!diceState ? (
          winStatus.allowed ? (
            <button
              type="button"
              disabled={rollingDiceRound !== null}
              onClick={() => runDiceRoll(round)}
              className="mt-2 w-full min-h-[46px] rounded-[14px] bg-gradient-to-r from-amber-400 to-yellow-300 hover:from-amber-300 hover:to-yellow-200 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-amber-500/20 active:scale-[0.98] transition-all disabled:opacity-60"
            >
              <Dices className="w-4 h-4" />
              <span>{isRollingThis ? 'Jogando...' : `Jogar Dado — Rodada ${round}`}</span>
            </button>
          ) : (
            <div className="mt-2 rounded-[14px] border border-slate-200/80 dark:border-white/10 bg-slate-100/80 dark:bg-white/[0.04] px-3.5 py-3 flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
              {winStatus.reason === 'disabled_today' || winStatus.reason === 'after_window' ? (
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span>{winStatus.message}</span>
            </div>
          )
        ) : (
          <div className="mt-2 space-y-3">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {labels[diceState.face]}
            </p>

            {diceState.resolved && (
              <div className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-100/70 dark:bg-white/[0.03] px-3 py-2 flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Jogada da Rodada {round} já usada hoje — liberada novamente só no próximo dia.</span>
              </div>
            )}

            {!diceState.resolved && diceState.pendingAction === 'activate_shield' && (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={isResolvingThis}
                  onClick={() => runResolveDice(round, { action: 'activate_shield' })}
                  className="w-full min-h-[44px] rounded-[14px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Shield className="w-4 h-4" />
                  <span>Ativar Escudo agora</span>
                </button>
                <button
                  type="button"
                  disabled={isResolvingThis}
                  onClick={() => runResolveDice(round, { action: 'save_to_inventory' })}
                  className="w-full min-h-[38px] rounded-[12px] border border-slate-300 dark:border-white/15 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-amber-400/50 disabled:opacity-50"
                >
                  Guardar nos itens (acumular)
                </button>
              </div>
            )}

            {!diceState.resolved && diceState.pendingAction === 'pick_coringa_power' && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  {(['escudo', 'fantasma', 'chefe'] as const).map((pw) => (
                    <button
                      key={pw}
                      type="button"
                      disabled={isResolvingThis}
                      onClick={() =>
                        runResolveDice(round, {
                          action: 'pick_coringa',
                          powerChoice: pw,
                        })
                      }
                      className="min-h-[44px] rounded-[14px] bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/50 text-amber-700 dark:text-amber-300 font-bold text-xs capitalize disabled:opacity-50"
                    >
                      {pw}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={isResolvingThis}
                  onClick={() => runResolveDice(round, { action: 'save_to_inventory' })}
                  className="w-full min-h-[38px] rounded-[12px] border border-slate-300 dark:border-white/15 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-amber-400/50 disabled:opacity-50"
                >
                  Guardar Coringa nos itens (acumular)
                </button>
              </div>
            )}

            {!diceState.resolved && diceState.pendingAction === 'pick_steal_target' && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-amber-500">
                  Escolha de quem tirar 4 ⭐:
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {others.map((pid) => {
                    const name = getParticipantName(gameState, pid);
                    const hasShield = isShieldActiveNow(gameState, pid, dateStr, nowHHMM);
                    return (
                      <button
                        key={pid}
                        type="button"
                        disabled={isResolvingThis || hasShield}
                        onClick={() =>
                          runResolveDice(round, {
                            action: 'steal',
                            targetId: pid,
                          })
                        }
                        className={`min-h-[44px] p-2 rounded-[14px] border flex flex-col items-center gap-1 ${
                          hasShield
                            ? 'opacity-45 cursor-not-allowed border-emerald-500/40 bg-emerald-500/5'
                            : 'border-slate-200 dark:border-white/15 hover:border-amber-400 disabled:opacity-50'
                        }`}
                      >
                        <img
                          src={getParticipantAvatar(gameState, pid)}
                          alt={name}
                          referrerPolicy="no-referrer"
                          className="w-8 h-8 rounded-lg object-cover"
                        />
                        <span className="text-xs font-semibold">
                          {name} {hasShield ? '🛡️' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {!diceState.resolved && diceState.pendingAction === 'pick_fantasma_task' && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-amber-500">
                  Escolha a tarefa para cancelar e sortear ({diceState.remainingUses} restante):
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableTasksToUsePower.map((td) => (
                    <button
                      key={td.id}
                      type="button"
                      disabled={isResolvingThis}
                      onClick={() =>
                        runResolveDice(round, {
                          action: 'fantasma',
                          taskId: td.id,
                        })
                      }
                      className="min-h-[40px] px-3 py-1.5 rounded-[12px] bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-50"
                    >
                      👻 {getTaskMeta(td).label}
                    </button>
                  ))}
                  {availableTasksToUsePower.length === 0 && (
                    <p className="text-xs text-slate-400">
                      Sem tarefas pendentes hoje para sortear agora.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={isResolvingThis}
                  onClick={() => runResolveDice(round, { action: 'save_to_inventory' })}
                  className="w-full min-h-[38px] rounded-[12px] border border-slate-300 dark:border-white/15 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-amber-400/50 disabled:opacity-50"
                >
                  Guardar nos itens (acumular)
                </button>
              </div>
            )}

            {!diceState.resolved && diceState.pendingAction === 'pick_chefe_target' && (
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-amber-500">
                  CHEFE ({diceState.remainingUses} delegação restante) — Delegue uma tarefa sua para outro participante (+{round === 1 ? 1 : 2} ⭐ já creditada{round === 2 ? 's' : ''}):
                </p>
                {availableTasksForChefe.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {availableTasksForChefe.map((td) => (
                      <button
                        key={td.id}
                        type="button"
                        onClick={() => setDiceSelectedTask(td.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                          diceSelectedTask === td.id
                            ? 'bg-amber-400 text-slate-950 border-amber-400'
                            : 'border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {getTaskMeta(td).label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    Nenhuma tarefa pendente elegível para delegar agora. Você pode guardar o item para os próximos dias.
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {others.map((pid) => {
                    const hasShield = isShieldActiveNow(gameState, pid, dateStr, nowHHMM);
                    const pName = getParticipantName(gameState, pid);
                    return (
                      <button
                        key={pid}
                        type="button"
                        disabled={hasShield}
                        onClick={() => setDiceSelectedTarget(pid)}
                        className={`p-2 rounded-xl border flex flex-col items-center gap-1 ${
                          hasShield
                            ? 'opacity-40 cursor-not-allowed border-slate-700'
                            : diceSelectedTarget === pid
                            ? 'border-amber-400 bg-amber-500/15'
                            : 'border-slate-300 dark:border-white/15'
                        }`}
                      >
                        <img
                          src={getParticipantAvatar(gameState, pid)}
                          alt={pName}
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 rounded-lg object-cover"
                        />
                        <span className="text-xs font-semibold">
                          {pName} {hasShield ? '🛡️' : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!diceSelectedTask || !diceSelectedTarget || isResolvingThis}
                    onClick={async () => {
                      if (!diceSelectedTask || !diceSelectedTarget) return;
                      const res = await runResolveDice(round, {
                        action: 'chefe',
                        taskId: diceSelectedTask,
                        targetId: diceSelectedTarget,
                      });
                      if (res.ok) {
                        setDiceSelectedTask('');
                        setDiceSelectedTarget('');
                      }
                    }}
                    className="flex-1 min-h-[42px] rounded-[12px] bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-40"
                  >
                    Delegar tarefa
                  </button>
                  <button
                    type="button"
                    disabled={isResolvingThis}
                    onClick={() => runResolveDice(round, { action: 'save_to_inventory' })}
                    className="px-3 min-h-[42px] rounded-[12px] border border-slate-300 dark:border-white/15 text-xs font-semibold hover:border-amber-400/50 disabled:opacity-50"
                  >
                    Guardar (acumular)
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderInventoryActivationPanel = () => {
    if (!activeInventoryModal) return null;
    return (
      <div className="glass-subcard mt-3 rounded-2xl border-amber-400/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-amber-500 capitalize">
            Usar {activeInventoryModal}
          </p>
          <button
            type="button"
            onClick={() => setActiveInventoryModal(null)}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            Fechar
          </button>
        </div>

        {activeInventoryModal === 'coringa' && (
          <div className="grid grid-cols-3 gap-2">
            {(['escudo', 'fantasma', 'chefe'] as const).map((ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setInvCoringaChoice(ch)}
                className={`min-h-[40px] rounded-xl text-xs font-bold border capitalize ${
                  invCoringaChoice === ch
                    ? 'bg-amber-400 text-slate-950 border-amber-400'
                    : 'border-slate-300 dark:border-white/15'
                }`}
              >
                {ch}
              </button>
            ))}
          </div>
        )}

        {(activeInventoryModal === 'fantasma' ||
          activeInventoryModal === 'chefe' ||
          (activeInventoryModal === 'coringa' && invCoringaChoice !== 'escudo')) && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">Escolha a tarefa:</p>
            {availableTasksToUsePower.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {availableTasksToUsePower.map((td) => (
                  <button
                    key={td.id}
                    type="button"
                    onClick={() => setInvTaskId(td.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                      invTaskId === td.id
                        ? 'bg-amber-400 text-slate-950 border-amber-400'
                        : 'border-slate-300 dark:border-white/15'
                    }`}
                  >
                    {getTaskMeta(td).label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Nenhuma tarefa pendente sua hoje — este item continua acumulado para você usar quando quiser.
              </p>
            )}
          </div>
        )}

        {(activeInventoryModal === 'chefe' ||
          (activeInventoryModal === 'coringa' && invCoringaChoice === 'chefe')) && (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-amber-500">
              👑 Escolha uma tarefa sua e quem vai recebê-la (o Chefe delega a sua tarefa):
            </p>
            <div className="grid grid-cols-3 gap-2">
              {others.map((pid) => {
                const hasShield = isShieldActiveNow(gameState, pid, dateStr, nowHHMM);
                const pName = getParticipantName(gameState, pid);
                return (
                  <button
                    key={pid}
                    type="button"
                    disabled={hasShield}
                    onClick={() => setInvTargetId(pid)}
                    className={`min-h-[42px] rounded-xl border text-xs font-semibold ${
                      hasShield
                        ? 'opacity-40 cursor-not-allowed border-slate-700'
                        : invTargetId === pid
                        ? 'border-amber-400 bg-amber-500/15'
                        : 'border-slate-300 dark:border-white/15'
                    }`}
                  >
                    {pName} {hasShield ? '🛡️' : ''}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <button
          type="button"
          disabled={
            (activeInventoryModal === 'fantasma' ||
              (activeInventoryModal === 'coringa' && invCoringaChoice === 'fantasma'))
              ? !invTaskId
              : (activeInventoryModal === 'chefe' ||
                  (activeInventoryModal === 'coringa' && invCoringaChoice === 'chefe'))
              ? !invTaskId || !invTargetId
              : false
          }
          onClick={async () => {
            const res = await onAction('use_power', {
              power: activeInventoryModal,
              coringaChoice: invCoringaChoice,
              taskId: invTaskId || undefined,
              targetId: invTargetId || undefined,
              dateStr,
              nowHHMM,
            });
            if (res.ok) {
              setActiveInventoryModal(null);
              setInvTaskId('');
              setInvTargetId('');
            }
          }}
          className="w-full min-h-[44px] rounded-[14px] bg-amber-400 text-slate-950 font-bold text-sm disabled:opacity-40"
        >
          Confirmar ativação
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Greeting & Goal Banner */}
      <section className="glass-card relative overflow-hidden rounded-3xl p-5 sm:p-7">
        <div className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full bg-amber-400/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file || savingAvatar) return;
                  setAvatarError(null);
                  setSavingAvatar(true);
                  try {
                    const dataUrl = await processAvatarFile(file);
                    const tapHHMM = getTapClockHHMM();
                    const res = await onAction(
                      'update_avatar',
                      {
                        avatarUrl: dataUrl,
                        dateStr,
                        nowHHMM: tapHHMM,
                      },
                      (draft) => {
                        if (draft.participants[currentUserId]) {
                          draft.participants[currentUserId].avatarUrl = dataUrl;
                        }
                      }
                    );
                    if (!res.ok && res.error) {
                      setAvatarError(res.error);
                    }
                  } catch (err) {
                    setAvatarError(
                      err instanceof Error ? err.message : 'Não foi possível carregar a imagem.'
                    );
                  } finally {
                    setSavingAvatar(false);
                  }
                }}
              />
              <button
                type="button"
                disabled={savingAvatar}
                onClick={() => avatarInputRef.current?.click()}
                aria-label="Trocar foto do perfil"
                title="Trocar foto do perfil"
                className="group relative block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-60"
              >
                <img
                  src={getParticipantAvatar(gameState, currentUserId)}
                  alt={myDisplayName}
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover ring-2 ring-amber-400/80 shadow-lg shadow-amber-500/20 group-hover:brightness-90 transition-all"
                />
                <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center shadow-md ring-2 ring-white dark:ring-[#121620] group-hover:scale-105 transition-transform">
                  <Camera className="w-3.5 h-3.5" />
                </span>
              </button>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {formatPortugueseDateHeading(dateStr)}
              </p>
              {!editingName ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                    Olá, {myDisplayName}
                  </h1>
                  <button
                    type="button"
                    aria-label="Alterar meu nome"
                    title="Alterar meu nome sem perder o acesso"
                    onClick={() => {
                      setNameDraft(myDisplayName);
                      setEditingName(true);
                    }}
                    className="w-8 h-8 rounded-xl border border-slate-200 dark:border-white/15 bg-white/60 dark:bg-white/5 hover:border-amber-400/70 flex items-center justify-center text-slate-500 dark:text-slate-300 hover:text-amber-500 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {Boolean(currentUser.avatarUrl) && (
                    <button
                      type="button"
                      disabled={savingAvatar}
                      aria-label="Restaurar foto padrão"
                      title="Restaurar foto padrão"
                      onClick={async () => {
                        if (savingAvatar) return;
                        setAvatarError(null);
                        setSavingAvatar(true);
                        await onAction(
                          'update_avatar',
                          {
                            avatarUrl: null,
                            dateStr,
                            nowHHMM: getTapClockHHMM(),
                          },
                          (draft) => {
                            if (draft.participants[currentUserId]) {
                              draft.participants[currentUserId].avatarUrl = undefined;
                            }
                          }
                        );
                        setSavingAvatar(false);
                      }}
                      className="h-8 px-2.5 rounded-xl border border-slate-200 dark:border-white/15 bg-white/60 dark:bg-white/5 hover:border-amber-400/70 flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-300 hover:text-amber-500 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span className="hidden sm:inline">Foto padrão</span>
                    </button>
                  )}
                </div>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (savingName) return;
                    const trimmedName = nameDraft.trim().replace(/\s+/g, ' ');
                    setSavingName(true);
                    const res = await onAction(
                      'update_display_name',
                      {
                        name: nameDraft,
                        dateStr,
                        nowHHMM: getTapClockHHMM(),
                      },
                      (draft) => {
                        if (draft.participants[currentUserId] && trimmedName.length >= 2 && trimmedName.length <= 24) {
                          draft.participants[currentUserId].displayName =
                            trimmedName === PARTICIPANT_PROFILES[currentUserId].name ? undefined : trimmedName;
                        }
                      }
                    );
                    setSavingName(false);
                    if (res.ok) {
                      setEditingName(false);
                    }
                  }}
                  className="mt-1 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      type="text"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      maxLength={24}
                      minLength={2}
                      required
                      autoFocus
                      placeholder="Seu nome no app"
                      className="modern-input px-3 py-1.5 text-sm font-semibold bg-white/80 dark:bg-[#0B0D12] border border-amber-400/60 text-slate-900 dark:text-white w-44"
                    />
                    <button
                      type="submit"
                      disabled={savingName}
                      className="min-h-[34px] px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingName(false)}
                      aria-label="Cancelar edição de nome"
                      className="min-h-[34px] w-[34px] rounded-xl border border-slate-300 dark:border-white/15 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Seu login, senha, biometria e estrelas continuam exatamente iguais.
                  </p>
                </form>
              )}
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                {gameState.simulatedClockTime ? (
                  <>
                    Horário simulado{' '}
                    <span className="font-mono-num font-semibold">{gameState.simulatedClockTime}</span> ·{' '}
                  </>
                ) : null}
                Suas tarefas valem estrelas ⭐ ·{' '}
                <strong className="text-amber-500">{myRank}º lugar hoje</strong>
              </p>
              {avatarError && (
                <p className="text-xs font-medium text-rose-500 mt-1">{avatarError}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <RoutineRingSvg done={myRoutinesDone} total={7} />
            {/* Quick Utility Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onPushRoute('notifications')}
                aria-label="Notificações do jogo"
                className="glass-subcard relative min-w-[44px] min-h-[44px] px-3 rounded-2xl hover:border-amber-400/60 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all"
              >
                <Bell className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline">Alertas</span>
                <span className="font-mono-num text-[11px] font-bold text-amber-500">
                  {gameState.notifications.filter((n) => n.dateStr === dateStr).length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onPushRoute('notif-prefs')}
                aria-label="Preferências de notificação"
                className="glass-subcard min-w-[44px] min-h-[44px] px-3 rounded-2xl hover:border-amber-400/60 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all"
              >
                <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline">Filtros</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSoundPicker((v) => !v)}
                aria-label="Escolher som do toque"
                title="Escolher som do seu toque"
                className={`min-w-[44px] min-h-[44px] px-3 rounded-2xl border flex items-center gap-1.5 text-xs font-semibold transition-all ${
                  showSoundPicker
                    ? 'border-amber-400 bg-amber-400/15 text-amber-500'
                    : 'glass-subcard text-slate-700 dark:text-slate-200 hover:border-amber-400/60'
                }`}
              >
                <Music className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline">{mySoundTheme.emoji} Toque</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (gameState.days[prevDateStr]) {
                    setSelectedHistoryDate(prevDateStr);
                  }
                  historySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                aria-label="Ver tarefas e estrelas do dia anterior"
                className="glass-subcard min-w-[44px] min-h-[44px] px-3 rounded-2xl hover:border-amber-400/60 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all"
              >
                <History className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline">Ontem</span>
              </button>
              <button
                type="button"
                onClick={() => onPushRoute('calendar')}
                aria-label="Escala até 31 de dezembro"
                className="glass-subcard min-w-[44px] min-h-[44px] px-3 rounded-2xl hover:border-amber-400/60 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all"
              >
                <CalendarDays className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline">Escala</span>
              </button>
              <button
                type="button"
                onClick={() => onPushRoute('analytics-admin')}
                aria-label="Relatórios PDF, Cloud Backup e Admin"
                className="glass-subcard min-w-[44px] min-h-[44px] px-3 rounded-2xl hover:border-amber-400/60 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-all"
              >
                <BarChart3 className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline">Admin / PDF</span>
              </button>
              {currentUserId === 'tailan' && (
                <button
                  type="button"
                  onClick={() => onPushRoute('tailan-editor')}
                  aria-label="Tailan: Alterar e acrescentar tudo no jogo"
                  className="min-w-[44px] min-h-[44px] px-3.5 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 hover:from-amber-300 hover:to-yellow-200 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 whitespace-nowrap shrink-0 transition-all"
                >
                  <Crown className="w-4 h-4" />
                  <span>Editar Tudo</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {showSoundPicker && (
          <div className="relative mt-4">
            <SoundThemePicker
              currentTheme={currentUser.soundTheme}
              participantName={myDisplayName}
              soundEnabled={soundEnabled}
              onToggleSound={onToggleSound}
              onSelectTheme={(themeId) =>
                onSelectSoundTheme
                  ? onSelectSoundTheme(themeId)
                  : onAction('update_sound_theme', { soundTheme: themeId })
              }
              compact
            />
          </div>
        )}

        <div className="glass-gold relative mt-5 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs sm:text-sm font-semibold text-amber-700 dark:text-amber-300">
            🏆 {gameState.goalBannerText || t(lang, 'goalBanner')}
          </p>
          <div className="flex items-center gap-3 text-xs font-semibold">
            {shieldActive && (
              <span className="text-emerald-500 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5" /> Escudo ativo (protegido de tudo)
              </span>
            )}
            {frozenToday && (
              <span className="text-sky-400 flex items-center gap-1">
                <Snowflake className="w-3.5 h-3.5" /> Estrelas congeladas hoje
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Fixed Golden Fantasma Banner */}
      <FantasmaBanner
        lang={lang}
        gameState={gameState}
        currentUserId={currentUserId}
        onTriggerPendingFantasma={(taskId) =>
          onAction('trigger_pending_fantasma', { taskId, dateStr, nowHHMM })
        }
        onSavePendingFantasma={() =>
          onAction('save_pending_fantasma', { dateStr, nowHHMM })
        }
        onRespondDraw={(drawId, accept) =>
          onAction('respond_fantasma', { drawId, accept, dateStr, nowHHMM })
        }
        onCompleteDrawTask={(drawId) =>
          onAction('complete_fantasma_task', { drawId, dateStr, nowHHMM })
        }
      />

      {/* Live Game Feed with 1-tap Emoji Reactions (e.g. 🤬 on lost stars, 🤣 from rivals) */}
      {(() => {
        const recentTodayEvents = gameState.notifications
          .filter((n) => n.dateStr === dateStr)
          .slice(0, 3);
        const lastChat = (gameState.chatMessages || []).slice(-1)[0];
        if (recentTodayEvents.length === 0 && !lastChat) return null;
        return (
          <section className="glass-card rounded-3xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BellRing className="w-4 h-4 text-amber-400 shrink-0" />
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Acontecendo agora · Reaja com emoji
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {onOpenChat && (
                  <button
                    type="button"
                    onClick={onOpenChat}
                    className="glass-gold min-h-[34px] px-3 rounded-xl text-xs font-bold text-amber-600 dark:text-amber-300 inline-flex items-center gap-1.5 hover:brightness-105 transition-all"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Abrir Chat</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onPushRoute('notifications')}
                  className="glass-subcard min-h-[34px] px-3 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-amber-400/50 transition-all"
                >
                  Ver tudo
                </button>
              </div>
            </div>

            {lastChat && (
              <div
                onClick={onOpenChat}
                role={onOpenChat ? 'button' : undefined}
                tabIndex={onOpenChat ? 0 : undefined}
                onKeyDown={(e) => {
                  if (onOpenChat && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onOpenChat();
                  }
                }}
                className="glass-subcard rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:border-amber-400/50 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <img
                    src={getParticipantAvatar(gameState, lastChat.senderId)}
                    alt={getParticipantName(gameState, lastChat.senderId)}
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-lg object-cover shrink-0"
                  />
                  <p className="text-xs text-slate-700 dark:text-slate-200 truncate">
                    <span className="font-bold text-amber-500">
                      💬 {getParticipantName(gameState, lastChat.senderId)}:
                    </span>{' '}
                    {lastChat.text}
                  </p>
                </div>
                <span className="font-mono-num text-[11px] text-slate-400 shrink-0">
                  {lastChat.timestamp}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {recentTodayEvents.map((ev) => {
                const isLoss =
                  (ev.starDelta !== undefined && ev.starDelta < 0) ||
                  ev.type === 'penalty' ||
                  ev.type === 'denuncia' ||
                  ev.type === 'punishment';
                return (
                  <div
                    key={ev.id}
                    className="glass-subcard rounded-2xl p-3 flex flex-col justify-between gap-2.5"
                  >
                    <div className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">
                          {ev.title}
                        </p>
                        <span className="font-mono-num text-[10px] text-slate-400 shrink-0">
                          {ev.timestamp.split(', ')[1] || ev.timestamp}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2">
                        {ev.message}
                      </p>
                    </div>

                    <EmojiReactionBar
                      reactions={ev.reactions}
                      gameState={gameState}
                      currentUserId={currentUserId}
                      onToggleEmoji={(emoji) =>
                        onAction('toggle_notif_reaction', {
                          notificationId: ev.id,
                          emoji,
                          dateStr,
                          nowHHMM,
                        })
                      }
                      quickSuggestions={isLoss ? ['🤬', '🤣', '😭'] : ['🔥', '🤣', '👏']}
                      compact
                    />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* Visible Top Accumulated Items Banner */}
      {ownedInventoryItems.length > 0 && (
        <section ref={topItemsSectionRef} className="glass-gold rounded-3xl p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-amber-700 dark:text-amber-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>Seus Itens Acumulados — Use quando quiser</span>
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Estes poderes ficam guardados aqui até você escolher usar em uma tarefa sua.
              </p>
            </div>
            <span className="font-mono-num text-xs font-bold text-amber-600 dark:text-amber-300">
              {ownedInventoryItems.reduce((acc, it) => acc + it.count, 0)} disponível
            </span>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {ownedInventoryItems.map((item) => {
              const Icon = item.icon;
              const isSelected = activeInventoryModal === item.key && inventoryModalOrigin === 'top';
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      setActiveInventoryModal(null);
                    } else {
                      setInventoryModalOrigin('top');
                      setActiveInventoryModal(item.key);
                      setInvTaskId('');
                      setInvTargetId('');
                    }
                  }}
                  className={`min-h-[46px] px-4 py-2 rounded-2xl border flex items-center gap-2.5 text-left transition-all ${
                    isSelected
                      ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                      : 'bg-white/75 dark:bg-white/[0.06] border-amber-400/40 hover:border-amber-400 text-slate-900 dark:text-white'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-slate-950' : 'text-amber-400'}`} />
                  <div>
                    <span className="text-xs sm:text-sm font-extrabold">
                      {item.emoji} {item.label} x{item.count}
                    </span>
                    <span
                      className={`block text-[11px] ${
                        isSelected ? 'text-slate-900/80' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {isSelected ? 'Selecionado — escolha abaixo' : 'Toque para usar'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {activeInventoryModal && inventoryModalOrigin === 'top' && renderInventoryActivationPanel()}
        </section>
      )}

      {/* Active Delegation Prompts & Automatic Task Rescue Cascade */}
      {interactiveTaskFlows.length > 0 && (
        <section className="glass-gold rounded-3xl p-5 sm:p-6 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm sm:text-base font-extrabold text-amber-600 dark:text-amber-300 flex items-center gap-2">
              <Crown className="w-4 h-4 shrink-0" />
              <span>Delegações &amp; Sorteios Automáticos Ativos</span>
            </h2>
            <span className="font-mono-num text-xs font-semibold text-amber-700 dark:text-amber-200/80">
              {interactiveTaskFlows.length} ativo{interactiveTaskFlows.length > 1 ? 's' : ''}
            </span>
          </div>

          <div className="space-y-3">
            {interactiveTaskFlows.map(({ def: rawDef, st }) => {
              const def = getEffectiveTaskDefinition(gameState, rawDef.id);
              const unlock = day ? isTaskUnlocked(day, def.id, gameState) : { unlocked: true };

              if (st.rescue && !st.rescue.failedStep3) {
                const r = st.rescue;
                const isMine = r.currentAssigneeId === currentUserId;
                const assigneeName = getParticipantName(gameState, r.currentAssigneeId);
                const failedName = getParticipantName(gameState, r.failedOwnerId);
                return (
                  <div
                    key={`flow-rescue-${def.id}`}
                    className={`rounded-2xl p-4 ${r.step === 3 && isMine ? 'glass-rose' : 'glass-subcard'}`}
                  >
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {r.step === 3
                        ? `🚨 OBRIGATÓRIO: ${def.label} sobrou para ${assigneeName} (+6 ⭐)`
                        : `🎲 ${r.step}º Sorteio automático: ${def.label} — ${assigneeName} (+${r.rewardStars} ⭐)`}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      {failedName} não fez.
                      {r.declinedBy.length > 0
                        ? ` Recusaram: ${r.declinedBy.map((id) => getParticipantName(gameState, id)).join(', ')}.`
                        : ''}
                      {r.step === 3
                        ? ' Se fizer ganha +6 ⭐; se não fizer recebe punição de fim de semana.'
                        : !r.accepted
                        ? ` Se fizer ganha +${r.rewardStars} ⭐; se não quiser, nada acontece e passa adiante.`
                        : ` Aceito! Conclua para ganhar +${r.rewardStars} ⭐.`}
                    </p>

                    {isMine && r.step < 3 && !r.accepted && (
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <button
                          type="button"
                          onClick={() =>
                            onAction('respond_task_rescue', {
                              taskId: def.id,
                              accept: true,
                              dateStr,
                              nowHHMM,
                            })
                          }
                          className="min-h-[46px] rounded-[14px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm transition-all"
                        >
                          {t(lang, 'wantBtn')} (+{r.rewardStars} ⭐)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onAction('respond_task_rescue', {
                              taskId: def.id,
                              accept: false,
                              dateStr,
                              nowHHMM,
                            })
                          }
                          className="min-h-[46px] rounded-[14px] bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/15 text-slate-900 dark:text-white font-extrabold text-sm transition-all"
                        >
                          {t(lang, 'dontWantBtn')}
                        </button>
                      </div>
                    )}

                    {isMine && r.accepted && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button
                          type="button"
                          disabled={!unlock.unlocked}
                          onClick={() => handleCompleteTask(def.id)}
                          className="flex-1 min-h-[46px] px-4 rounded-[14px] bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-extrabold text-sm"
                        >
                          ✓ Fiz {def.label} (+{r.rewardStars} ⭐)
                        </button>
                        {r.step === 3 &&
                          (confirmGiveUpTaskId === def.id ? (
                            <button
                              type="button"
                              onClick={async () => {
                                await onAction('fail_rescue_step3', {
                                  taskId: def.id,
                                  dateStr,
                                  nowHHMM,
                                });
                                setConfirmGiveUpTaskId(null);
                              }}
                              className="min-h-[46px] px-3.5 rounded-[14px] bg-rose-500 text-white font-bold text-xs"
                            >
                              Confirmar punição fds
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmGiveUpTaskId(def.id)}
                              className="min-h-[46px] px-3.5 rounded-[14px] border border-rose-500/40 text-rose-400 font-bold text-xs"
                            >
                              Não consegui fazer
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                );
              }

              // Delegation flows
              const delegatorName = st.delegatedBy ? getParticipantName(gameState, st.delegatedBy) : '';
              if (st.delegationStage === 'pending_target' && st.delegatedTo) {
                const isTarget = st.delegatedTo === currentUserId;
                const targetName = getParticipantName(gameState, st.delegatedTo);
                return (
                  <div key={`flow-del-${def.id}`} className="glass-subcard rounded-2xl p-4">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      👑 {delegatorName} delegou {def.label} para {targetName}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      Se {targetName} fizer: +1 ⭐ para {targetName} e +1 ⭐ para {delegatorName}. Se aceitar e não fizer: -1 ⭐ e punição no fim de semana.
                    </p>
                    {isTarget ? (
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <button
                          type="button"
                          onClick={() =>
                            onAction('respond_delegation', {
                              taskId: def.id,
                              accept: true,
                              dateStr,
                              nowHHMM,
                            })
                          }
                          className="min-h-[46px] rounded-[14px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm"
                        >
                          {t(lang, 'wantBtn')} (+1 ⭐ cada)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onAction('respond_delegation', {
                              taskId: def.id,
                              accept: false,
                              dateStr,
                              nowHHMM,
                            })
                          }
                          className="min-h-[46px] rounded-[14px] bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/15 text-slate-900 dark:text-white font-extrabold text-sm"
                        >
                          {t(lang, 'dontWantBtn')}
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-amber-500 font-semibold">
                        Aguardando resposta de {targetName}...
                      </p>
                    )}
                  </div>
                );
              }

              if (st.delegationStage === 'awaiting_owner_draw' && st.delegatedBy) {
                const isOwner = st.delegatedBy === currentUserId;
                const declinedName = st.delegationDeclinedBy
                  ? getParticipantName(gameState, st.delegationDeclinedBy)
                  : 'Participante';
                const twoNames = ROTATION_ORDER.filter(
                  (id) => id !== st.delegatedBy && id !== st.delegationDeclinedBy
                )
                  .map((id) => getParticipantName(gameState, id))
                  .join(' e ');
                return (
                  <div key={`flow-draw-wait-${def.id}`} className="glass-subcard rounded-2xl p-4">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      🎲 {declinedName} não quis {def.label} — sorteio entre {twoNames}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      Quem delegou ({delegatorName}) faz o sorteio com os outros 2 participantes (+2 ⭐ para quem aceitar e fizer).
                    </p>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() =>
                          onAction('draw_delegation_fallback', {
                            taskId: def.id,
                            dateStr,
                            nowHHMM,
                          })
                        }
                        className="mt-3 w-full min-h-[46px] rounded-[14px] bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-sm"
                      >
                        🎲 Sortear entre {twoNames}
                      </button>
                    )}
                  </div>
                );
              }

              if (st.delegationStage === 'pending_draw') {
                const drawnId = st.delegationDrawnTo || st.delegatedTo;
                if (!drawnId) return null;
                const isDrawn = drawnId === currentUserId;
                const drawnName = getParticipantName(gameState, drawnId);
                return (
                  <div key={`flow-draw-resp-${def.id}`} className="glass-subcard rounded-2xl p-4">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      🎲 Sorteio de delegação: {def.label} — {drawnName} (+2 ⭐)
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      Se quiser e fizer, ganha +2 ⭐. Se não quiser, tudo certo e volta para {delegatorName} (+2 ⭐).
                    </p>
                    {isDrawn ? (
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <button
                          type="button"
                          onClick={() =>
                            onAction('respond_delegation', {
                              taskId: def.id,
                              accept: true,
                              dateStr,
                              nowHHMM,
                            })
                          }
                          className="min-h-[46px] rounded-[14px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm"
                        >
                          {t(lang, 'wantBtn')} (+2 ⭐)
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onAction('respond_delegation', {
                              taskId: def.id,
                              accept: false,
                              dateStr,
                              nowHHMM,
                            })
                          }
                          className="min-h-[46px] rounded-[14px] bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/15 text-slate-900 dark:text-white font-extrabold text-sm"
                        >
                          {t(lang, 'dontWantBtn')}
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-amber-500 font-semibold">
                        Aguardando resposta de {drawnName}...
                      </p>
                    )}
                  </div>
                );
              }

              if (st.delegationStage === 'returned_to_owner' && st.delegatedBy) {
                const isOwner = st.delegatedBy === currentUserId;
                return (
                  <div key={`flow-ret-${def.id}`} className="glass-subcard rounded-2xl p-4">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      👑 {def.label} voltou para {delegatorName} (+2 ⭐)
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      O sorteado não quis (tudo certo). {delegatorName} conclui o card e ganha +2 ⭐!
                    </p>
                    {isOwner && (
                      <button
                        type="button"
                        disabled={!unlock.unlocked}
                        onClick={() => handleCompleteTask(def.id)}
                        className="mt-3 w-full min-h-[46px] rounded-[14px] bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-extrabold text-sm"
                      >
                        ✓ Fiz {def.label} (+2 ⭐)
                      </button>
                    )}
                  </div>
                );
              }

              return null;
            })}
          </div>
        </section>
      )}

      {/* Live Actionable Notifications Banner (Always visible while powers or unlocked tasks remain) */}
      {actionableAlerts.length > 0 && (
        <section className="glass-card rounded-3xl p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BellRing className="w-4 h-4 text-amber-400 shrink-0" />
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Avisos ativos para você agora
              </h2>
            </div>
            <span className="font-mono-num text-xs font-bold text-amber-500">
              {actionableAlerts.length} pendente{actionableAlerts.length > 1 ? 's' : ''}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {actionableAlerts.map((al) => {
              const isPowerJump = Boolean(al.powerKey);
              return (
                <div
                  key={al.id}
                  onClick={() => {
                    if (al.powerKey) {
                      setInventoryModalOrigin('top');
                      setActiveInventoryModal(al.powerKey);
                      setInvTaskId('');
                      setInvTargetId('');
                      topItemsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                  role={isPowerJump ? 'button' : undefined}
                  tabIndex={isPowerJump ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (isPowerJump && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      setInventoryModalOrigin('top');
                      setActiveInventoryModal(al.powerKey!);
                      setInvTaskId('');
                      setInvTargetId('');
                      topItemsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                  className={`rounded-2xl p-3 text-left transition-all ${
                    al.urgent || al.kind === 'power'
                      ? 'glass-gold'
                      : 'glass-subcard'
                  } ${isPowerJump ? 'cursor-pointer hover:brightness-105' : ''}`}
                >
                  <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                    {al.title}
                  </p>
                  <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    {al.detail}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Weekend Punishments (SÁBADO / DOMINGO large buttons) */}
      {(pendingPunishmentsToDecide.length > 0 || myAssignedPunishments.length > 0) && (
        <section className="glass-rose rounded-3xl p-5 sm:p-6 space-y-3.5">
          <h2 className="text-base font-bold text-rose-500 dark:text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            <span>Punição de Fim de Semana</span>
          </h2>
          {pendingPunishmentsToDecide.map((pun) => (
            <div
              key={pun.id}
              className="glass-subcard rounded-2xl p-4"
            >
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {getParticipantName(gameState, pun.punishedId)} não cumpriu{' '}
                <strong>{pun.taskLabel}</strong>: fará as <strong>próprias tarefas</strong> e também as tarefas de{' '}
                <strong>{getParticipantName(gameState, pun.coveringForId)}</strong> no fim de semana.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-3">
                Como adversário, escolha em qual dia {getParticipantName(gameState, pun.punishedId)} cumprirá as suas e as de {getParticipantName(gameState, pun.coveringForId)}:
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    onAction('choose_punishment_day', {
                      punishmentId: pun.id,
                      chosenDay: 'sabado',
                      nowHHMM,
                    })
                  }
                  className="min-h-[48px] rounded-[14px] bg-rose-500 hover:bg-rose-400 text-white font-extrabold text-sm shadow-md shadow-rose-500/20"
                >
                  {t(lang, 'saturdayBtn')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onAction('choose_punishment_day', {
                      punishmentId: pun.id,
                      chosenDay: 'domingo',
                      nowHHMM,
                    })
                  }
                  className="min-h-[48px] rounded-[14px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm shadow-md shadow-amber-500/20"
                >
                  {t(lang, 'sundayBtn')}
                </button>
              </div>
            </div>
          ))}
          {myAssignedPunishments.map((pun) => (
            <div
              key={pun.id}
              className="glass-subcard rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  Você fará as SUAS tarefas e todas as de {getParticipantName(gameState, pun.coveringForId)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Motivo: {pun.taskLabel} · Dia escolhido:{' '}
                  <strong className="text-rose-400">
                    {pun.chosenDay ? pun.chosenDay.toUpperCase() : 'Aguardando escolha do adversário'}
                  </strong>
                </p>
              </div>
              {pun.chosenDay && (
                <button
                  type="button"
                  onClick={() =>
                    onAction('complete_punishment', { punishmentId: pun.id, nowHHMM })
                  }
                  className="min-h-[44px] px-4 rounded-[14px] bg-emerald-500 text-slate-950 font-bold text-xs"
                >
                  Marcar punição cumprida
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Compact Live Standings inside Painel */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {sortedStandings.map((pid, idx) => {
          const pState = gameState.participants[pid];
          const pInfo = PARTICIPANT_PROFILES[pid];
          const pName = getParticipantName(gameState, pid);
          const todaySum = todaySummaries[pid];
          const routCount = todaySum ? todaySum.completedRoutinesCount : 0;
          const tasksDoneCount = todaySum ? todaySum.completedTasks.length : 0;
          const fantasmaCount = todaySum ? todaySum.fantasmaCanceledTasks.length : 0;
          const todayNetStars = todaySum ? todaySum.netStars : 0;
          const isMe = pid === currentUserId;
          const leaderStars = Math.max(1, gameState.participants[sortedStandings[0]].stars);
          const starPct = Math.max(8, Math.min(100, Math.round((pState.stars / leaderStars) * 100)));

          return (
            <div
              key={pid}
              className={`rounded-2xl p-4 transition-all ${
                isMe ? 'glass-gold' : 'glass-card'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <img
                  src={getParticipantAvatar(gameState, pid)}
                  alt={pName}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-xl object-cover shrink-0 ring-1 ring-white/20 shadow-sm"
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {pName} {isMe ? '(Você)' : ''}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {idx + 1}º · <span className="font-mono-num">{routCount}/7</span> rot ·{' '}
                    <span className="font-mono-num">
                      {tasksDoneCount}t{fantasmaCount > 0 ? `+${fantasmaCount}👻` : ''}
                    </span>
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-2">
                <span className="text-xl font-extrabold font-mono-num text-amber-500">
                  {pState.stars} ⭐
                </span>
                <span
                  className={`text-[11px] font-mono-num font-semibold ${
                    todayNetStars > 0
                      ? 'text-emerald-500'
                      : todayNetStars < 0
                      ? 'text-rose-400'
                      : 'text-slate-400'
                  }`}
                >
                  {todayNetStars > 0 ? `+${todayNetStars}` : todayNetStars} ⭐ hoje
                </span>
              </div>
              <div className="mt-2">
                <ParticipantSparkline gameState={gameState} participantId={pid} />
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-slate-200/70 dark:bg-white/[0.07] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${starPct}%`, backgroundColor: pInfo.accentColor }}
                />
              </div>
              {(pState.inventory.fantasma > 0 ||
                pState.inventory.escudo > 0 ||
                pState.inventory.chefe > 0 ||
                pState.inventory.coringa > 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-amber-600 dark:text-amber-300 font-mono-num">
                  {pState.inventory.fantasma > 0 && <span>👻 x{pState.inventory.fantasma}</span>}
                  {pState.inventory.escudo > 0 && <span>🛡️ x{pState.inventory.escudo}</span>}
                  {pState.inventory.chefe > 0 && <span>👑 x{pState.inventory.chefe}</span>}
                  {pState.inventory.coringa > 0 && <span>🃏 x{pState.inventory.coringa}</span>}
                </div>
              )}

              <div className="mt-2.5 pt-2.5 border-t border-slate-200/60 dark:border-white/[0.07]">
                <EmojiReactionBar
                  reactions={pState.reactions}
                  gameState={gameState}
                  currentUserId={currentUserId}
                  onToggleEmoji={(emoji) =>
                    onAction('toggle_participant_reaction', {
                      targetId: pid,
                      emoji,
                      dateStr,
                      nowHHMM,
                    })
                  }
                  quickSuggestions={todayNetStars < 0 ? ['🤬', '🤣', '😭'] : ['🔥', '🤣', '👑']}
                  compact
                />
              </div>
            </div>
          );
        })}
      </section>

      {/* Main 2-column desktop / stacked mobile layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6">
        {/* Column 1: Routines + Dice + Items */}
        <div className="space-y-6">
          {/* 7 Daily Routines */}
          <section className="glass-card rounded-3xl p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2 mb-3.5">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t(lang, 'routinesTitle')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono-num font-semibold text-amber-500">
                    {myRoutinesDone} de 7
                  </span>{' '}
                  concluídas · cada uma vale 1 ⭐
                </p>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {ROUTINE_DEFINITIONS.map((baseRoutine) => {
                const rDef = getEffectiveRoutineDefinition(gameState, baseRoutine.id);
                const entry = day?.routines[currentUserId]?.[rDef.id];
                const deadline = getDeadlineForItem(dateStr, rDef.weekdayLimit, rDef.weekendLimit);
                const unlock = day ? isRoutineUnlocked(day, rDef.id, gameState) : { unlocked: true };
                const bypassDeadline = day
                  ? isDeadlineBypassedByPrerequisite(
                      gameState,
                      day,
                      dateStr,
                      rDef.requiresTaskDone,
                      deadline
                    )
                  : false;
                const past = !bypassDeadline && isTimePastDeadline(nowHHMM, deadline);
                const justified = Boolean(entry?.justified);
                const expired = Boolean(!justified && (entry?.expiredPenaltyApplied || (!entry?.completed && past && unlock.unlocked)));
                const isSavingRoutine = Boolean(pendingItemKeys[`routine:${rDef.id}`]);

                return (
                  <div
                    key={rDef.id}
                    className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {rDef.label}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {bypassDeadline
                            ? 'sem limite hoje (horas que quiser)'
                            : deadline
                            ? `marcar até ${deadline}`
                            : 'sem limite no fim de semana'}
                        </span>
                        {unlock.bypassedDeadline && (
                          <span className="text-emerald-500 font-semibold">· Liberada sem limite</span>
                        )}
                        {!unlock.unlocked && (
                          <span className="text-amber-500 font-medium">· {unlock.reason}</span>
                        )}
                      </p>
                    </div>

                    {entry?.completed ? (
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-emerald-500 px-3 py-2">
                        <CheckCircle2 className="w-4 h-4" />
                        Feito
                      </span>
                    ) : justified ? (
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-sky-500 px-3 py-2">
                        Justificada (0 ⭐)
                      </span>
                    ) : expired ? (
                      <span className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-rose-400 px-3 py-2">
                        <Lock className="w-3.5 h-3.5" />
                        Expirado (-1 ⭐)
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={!unlock.unlocked || isSavingRoutine}
                        onClick={() => handleCompleteRoutine(rDef.id)}
                        className="shrink-0 min-h-[44px] min-w-[74px] px-4 rounded-[14px] bg-amber-400 hover:bg-amber-300 disabled:bg-slate-200 dark:disabled:bg-white/10 disabled:text-slate-400 text-slate-950 font-bold text-sm transition-all active:scale-[0.97]"
                      >
                        {isSavingRoutine ? 'Salvando...' : 'Fiz'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Dado do Dia */}
          <section className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Dices className="w-5 h-5 text-amber-400" />
                <span>{t(lang, 'diceTitle')}</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Uma jogada por rodada. Tudo vale na hora.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3.5">
              {renderDiceCard(1)}
              {renderDiceCard(2)}
            </div>

            {/* Justificativa para não jogar o dado neste dia */}
            <form
              onSubmit={handleSaveDiceJustification}
              className="glass-subcard rounded-2xl p-4 space-y-2.5 border border-slate-200/80 dark:border-white/10"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="dice-justification-input"
                  className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5 text-amber-400" />
                  <span>Justificativa</span>
                </label>
                {savedDiceJustification && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      Salva em {dateStr.slice(8)}/{dateStr.slice(5, 7)}
                      {savedDiceJustification.updatedAt
                        ? ` · ${savedDiceJustification.updatedAt.slice(11, 16)}`
                        : ''}
                    </span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Não jogou alguma rodada do dado hoje? Registre o motivo aqui para salvar neste dia (0 ⭐ — não perde e não ganha).
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="dice-justification-input"
                  type="text"
                  maxLength={300}
                  value={diceJustText}
                  onChange={(e) => {
                    setDiceJustText(e.target.value);
                    if (diceJustFeedback) setDiceJustFeedback(null);
                  }}
                  placeholder="Ex: Sem tempo no horário, esqueci ou preferi não arriscar..."
                  className="modern-input flex-1 px-3.5 py-2.5 text-xs sm:text-sm bg-white/75 dark:bg-[#0B0E16]/75 border border-slate-300/80 dark:border-white/15 text-slate-900 dark:text-white placeholder:text-slate-400"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="submit"
                    disabled={savingDiceJust}
                    className="min-h-[40px] px-4 rounded-[12px] bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-bold text-xs transition-all flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{savingDiceJust ? 'Salvando...' : 'Salvar'}</span>
                  </button>
                  {savedDiceJustification && (
                    <button
                      type="button"
                      disabled={savingDiceJust}
                      onClick={handleClearDiceJustification}
                      title="Remover justificativa do dado"
                      className="min-h-[40px] px-3 rounded-[12px] border border-slate-300 dark:border-white/15 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-rose-400/60 hover:text-rose-400 transition-colors"
                    >
                      Limpar
                    </button>
                  )}
                </div>
              </div>

              {diceJustFeedback && (
                <p
                  className={`text-[11px] font-semibold ${
                    diceJustFeedback.type === 'ok' ? 'text-emerald-500' : 'text-rose-400'
                  }`}
                >
                  {diceJustFeedback.text}
                </p>
              )}

              {day?.diceJustifications &&
                ROTATION_ORDER.some(
                  (pid) => pid !== currentUserId && Boolean(day.diceJustifications?.[pid]?.text)
                ) && (
                  <div className="pt-2 border-t border-slate-200/70 dark:border-white/10 space-y-1">
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Justificativas do dado registradas hoje:
                    </p>
                    {ROTATION_ORDER.map((pid) => {
                      if (pid === currentUserId) return null;
                      const entry = day.diceJustifications?.[pid];
                      if (!entry?.text) return null;
                      return (
                        <p key={pid} className="text-[11px] text-slate-600 dark:text-slate-300">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {getParticipantName(gameState, pid)}:
                          </span>{' '}
                          {entry.text}
                        </p>
                      );
                    })}
                  </div>
                )}
            </form>
          </section>

          {/* Seus Itens / Metas de Evolução */}
          <section ref={itemsSectionRef} className="glass-card rounded-3xl p-5 sm:p-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              {t(lang, 'yourItems')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              35 ⭐ Fantasma · 45 ⭐ Escudo · 55 ⭐ Chefe · 65 ⭐ Coringa (acumulam para usar quando quiser)
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(
                [
                  { key: 'fantasma', label: 'Fantasma', threshold: 35, icon: Ghost },
                  { key: 'escudo', label: 'Escudo', threshold: 45, icon: Shield },
                  { key: 'chefe', label: 'Chefe', threshold: 55, icon: Crown },
                  { key: 'coringa', label: 'Coringa', threshold: 65, icon: Sparkles },
                ] as const
              ).map((item) => {
                const count = currentUser.inventory[item.key];
                const Icon = item.icon;
                const unlocked = currentUser.stars >= item.threshold || count > 0;
                const progressPct = Math.min(100, Math.round((currentUser.stars / item.threshold) * 100));
                return (
                  <button
                    key={item.key}
                    type="button"
                    disabled={count <= 0}
                    onClick={() => {
                      setInventoryModalOrigin('items');
                      setActiveInventoryModal(item.key);
                      setInvTaskId('');
                      setInvTargetId('');
                    }}
                    className={`min-h-[86px] p-3.5 rounded-2xl text-left transition-all ${
                      count > 0
                        ? 'glass-gold hover:brightness-105'
                        : unlocked
                        ? 'glass-subcard opacity-90'
                        : 'glass-subcard opacity-75'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Icon className="w-4 h-4 text-amber-400" />
                      <span className="font-mono-num text-sm font-extrabold text-slate-900 dark:text-white">
                        x{count}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-bold text-slate-800 dark:text-slate-100">
                      {item.label}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-num">
                      {currentUser.stars}/{item.threshold} ⭐
                    </p>
                    <div className="mt-2 h-1 rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Inline modal for activating inventory power */}
            {activeInventoryModal && inventoryModalOrigin === 'items' && renderInventoryActivationPanel()}
          </section>
        </div>

        {/* Column 2: Escala de Hoje + Justificativa + Denúncia */}
        <div className="space-y-6">
          {/* Escala de Hoje */}
          <section className="glass-card rounded-3xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t(lang, 'scheduleTitle')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  As tarefas da casa seguem o rodízio até 31 de dezembro
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {day &&
                  TASK_DEFINITIONS.every(
                    (td) =>
                      !day.tasks[td.id]?.assignedTo ||
                      Boolean(day.tasks[td.id]?.completedBy) ||
                      Boolean(day.tasks[td.id]?.canceledByFantasma)
                  ) && (
                    <span className="text-xs font-bold text-emerald-500 flex items-center gap-1 shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                      Todas feitas hoje
                    </span>
                  )}
                <div className="inline-flex rounded-xl border border-slate-200 dark:border-white/10 p-0.5 bg-slate-100/70 dark:bg-white/[0.04]">
                  <button
                    type="button"
                    onClick={() => setTasksViewMode('by_person')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      tasksViewMode === 'by_person'
                        ? 'bg-amber-400 text-slate-950 shadow-sm'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Por pessoa
                  </button>
                  <button
                    type="button"
                    onClick={() => setTasksViewMode('by_time')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      tasksViewMode === 'by_time'
                        ? 'bg-amber-400 text-slate-950 shadow-sm'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Por horário
                  </button>
                </div>
              </div>
            </div>

            {/* Tarefas Extras Criadas por Tailan */}
            {(activeCustomTasks.length > 0 || currentUserId === 'tailan') && (
              <div className="space-y-2.5 pb-1 border-b border-slate-200/70 dark:border-white/10">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold tracking-wide text-amber-500 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Tarefas Extras do Jogo</span>
                  </p>
                  {currentUserId === 'tailan' && (
                    <button
                      type="button"
                      onClick={() => onPushRoute('tailan-editor')}
                      className="min-h-[32px] px-2.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 text-amber-600 dark:text-amber-300 text-[11px] font-bold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Nova tarefa</span>
                    </button>
                  )}
                </div>

                {activeCustomTasks.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 pb-2">
                    Nenhuma tarefa extra criada para hoje. Toque em &ldquo;Nova tarefa&rdquo; para acrescentar.
                  </p>
                ) : (
                  <div className="space-y-2 pb-2">
                    {activeCustomTasks.map((ct) => {
                      const canComplete =
                        !ct.completedBy &&
                        (ct.assignedTo === 'all' || ct.assignedTo === currentUserId);
                      const assigneeLabel =
                        ct.assignedTo === 'all'
                          ? 'Qualquer participante'
                          : getParticipantName(gameState, ct.assignedTo);
                      return (
                        <div
                          key={ct.id}
                          className="glass-subcard rounded-2xl p-3.5 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 dark:text-white">
                              {ct.title}{' '}
                              <span className="font-mono-num text-amber-500">
                                (+{ct.starReward} ⭐)
                              </span>
                            </p>
                            {ct.description && (
                              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                                {ct.description}
                              </p>
                            )}
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {assigneeLabel}
                              {ct.deadlineHHMM ? ` · até ${ct.deadlineHHMM}` : ''}
                              {ct.dateStr === 'all' ? ' · Permanente' : ' · Hoje'}
                            </p>
                          </div>

                          {ct.completedBy ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-500 shrink-0">
                              <Check className="w-4 h-4" />{' '}
                              {getParticipantName(gameState, ct.completedBy)}
                            </span>
                          ) : canComplete ? (
                            <button
                              type="button"
                              disabled={Boolean(pendingItemKeys[`custom:${ct.id}`])}
                              onClick={async () => {
                                const key = `custom:${ct.id}`;
                                if (pendingItemKeys[key]) return;
                                const tapHHMM = getTapClockHHMM();
                                setPendingItemKeys((prev) => ({ ...prev, [key]: true }));
                                try {
                                  await onAction(
                                    'complete_custom_task',
                                    {
                                      customTaskId: ct.id,
                                      dateStr,
                                      nowHHMM: tapHHMM,
                                    },
                                    (draft) => {
                                      const targetCt = (draft.customTasks || []).find(
                                        (item) => item.id === ct.id
                                      );
                                      if (targetCt && !targetCt.completedBy) {
                                        targetCt.completedBy = currentUserId;
                                        targetCt.completedAt = `${dateStr}T${tapHHMM}:00`;
                                        if (!isFrozenToday(draft, currentUserId, dateStr)) {
                                          draft.participants[currentUserId].stars +=
                                            targetCt.starReward || 1;
                                        }
                                      }
                                    }
                                  );
                                } finally {
                                  setPendingItemKeys((prev) => {
                                    const next = { ...prev };
                                    delete next[key];
                                    return next;
                                  });
                                }
                              }}
                              className="min-h-[44px] px-4 rounded-[14px] bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-bold text-sm shrink-0 whitespace-nowrap"
                            >
                              {pendingItemKeys[`custom:${ct.id}`]
                                ? 'Salvando...'
                                : `Fiz (+${ct.starReward} ⭐)`}
                            </button>
                          ) : (
                            <span className="text-xs font-semibold text-slate-400 shrink-0">
                              Pendente
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Suas tarefas */}
            <div>
              <p className="text-xs font-bold tracking-wide text-amber-500 mb-2.5">
                {t(lang, 'yourTasks')}
              </p>
              {activePunishmentCoveringMe && (
                <div className="mb-3 rounded-2xl border border-emerald-400/35 bg-emerald-500/10 p-3.5 space-y-2">
                  <p className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-300">
                    ⭐ Punição a seu favor hoje: {getParticipantName(gameState, activePunishmentCoveringMe.punishedId)} faz suas tarefas
                  </p>
                  <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300">
                    Você ganha +1 ⭐ automaticamente conforme cada tarefa sua for concluída hoje (obs: apenas tarefas; suas rotinas continuam com você).
                  </p>
                  {coveredByPunishmentTasksToday.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {coveredByPunishmentTasksToday.map((td) => {
                        const st = day!.tasks[td.id];
                        const done = Boolean(st?.completedBy);
                        return (
                          <span
                            key={`cov-me-${td.id}`}
                            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border ${
                              done
                                ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-500'
                                : 'border-amber-400/30 bg-white/40 dark:bg-white/[0.04] text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {getTaskMeta(td).label}: {done ? '✓ +1 ⭐' : `com ${getParticipantName(gameState, activePunishmentCoveringMe.punishedId)}`}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {myTasks.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-2">
                  {activePunishmentCoveringMe
                    ? `Suas tarefas de hoje estão sendo cumpridas por ${getParticipantName(gameState, activePunishmentCoveringMe.punishedId)}.`
                    : 'Nenhuma tarefa atribuída a você no momento hoje.'}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {myTasks.map((def) => {
                    const st = day.tasks[def.id];
                    const meta = getTaskMeta(def);
                    const deadline = getDeadlineForItem(dateStr, meta.weekdayLimit, meta.weekendLimit);
                    const unlock = isTaskUnlocked(day, def.id, gameState);
                    const bypassDeadline = isDeadlineBypassedByPrerequisite(
                      gameState,
                      day,
                      dateStr,
                      meta.requiresTaskDone,
                      deadline
                    );
                    const isSavingTask = Boolean(pendingItemKeys[`task:${def.id}`]);
                    const isPunishmentCoverage =
                      !st.rescue &&
                      !st.delegatedBy &&
                      !st.canceledByFantasma &&
                      Boolean(st.assignedTo && st.assignedTo !== currentUserId);
                    const coveredOwnerName =
                      isPunishmentCoverage && st.assignedTo
                        ? getParticipantName(gameState, st.assignedTo)
                        : '';
                    const rewardStars = st.rescue
                      ? st.rescue.rewardStars
                      : st.delegationStage === 'accepted_draw' ||
                        st.delegationStage === 'returned_to_owner' ||
                        st.delegationReturnedToOwner
                      ? 2
                      : 1;
                    const needsChoice = Boolean(
                      (st.rescue && !st.rescue.accepted && st.rescue.step < 3) ||
                        st.delegationStage === 'pending_target' ||
                        st.delegationStage === 'pending_draw'
                    );
                    const needsOwnerDraw = st.delegationStage === 'awaiting_owner_draw';
                    const canGiveUp =
                      !st.completedBy &&
                      !st.canceledByFantasma &&
                      !st.justified &&
                      !needsChoice &&
                      !needsOwnerDraw &&
                      !def.ownerOnly;

                    return (
                      <div
                        key={def.id}
                        className="glass-gold rounded-2xl p-4 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 dark:text-white">
                              {meta.label} — {myDisplayName}{' '}
                              <span className="font-mono-num text-amber-500">
                                {isPunishmentCoverage
                                  ? `(+1 ⭐ p/ ${coveredOwnerName})`
                                  : st.delegationStage === 'accepted_target'
                                  ? '(+1 ⭐ cada)'
                                  : `(+${rewardStars} ⭐)`}
                              </span>
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                              {st.rescue
                                ? st.rescue.step === 3
                                  ? `Obrigatório · ${getParticipantName(gameState, st.rescue.failedOwnerId)} não fez`
                                  : `Repasse (${st.rescue.step}º sorteio) · ${getParticipantName(gameState, st.rescue.failedOwnerId)} não fez`
                                : bypassDeadline
                                ? 'Sem limite hoje (horas que quiser)'
                                : deadline
                                ? `Até ${deadline}`
                                : 'Sem limite de horário'}
                              {meta.note && !st.rescue ? ` · ${meta.note}` : ''}
                              {isPunishmentCoverage
                                ? ` · Punição: cobrindo ${coveredOwnerName} (⭐ automática para ${coveredOwnerName})`
                                : ''}
                              {!unlock.unlocked && unlock.reason ? ` · ${unlock.reason}` : ''}
                              {st.delegatedBy && !st.rescue
                                ? st.delegationReturnedToOwner
                                  ? ' · Voltou para você (+2 ⭐)'
                                  : ` · Delegada por ${getParticipantName(gameState, st.delegatedBy)}`
                                : ''}
                            </p>
                          </div>
                          {st.canceledByFantasma ? (
                            <span className="text-xs font-bold text-amber-400 shrink-0">👻 Fantasma</span>
                          ) : st.completedBy ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-500 shrink-0">
                              <Check className="w-4 h-4" /> Feita
                            </span>
                          ) : st.justified && !st.rescue ? (
                            <span className="text-xs font-bold text-sky-400 shrink-0">
                              Justificada (0 ⭐)
                            </span>
                          ) : needsChoice || needsOwnerDraw ? null : (
                            <button
                              type="button"
                              disabled={!unlock.unlocked || isSavingTask}
                              onClick={() => handleCompleteTask(def.id)}
                              className="min-h-[44px] px-4 rounded-[14px] bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-slate-950 font-bold text-sm shrink-0"
                            >
                              {isSavingTask
                                ? 'Salvando...'
                                : isPunishmentCoverage
                                ? `Fiz (+1 ⭐ ${coveredOwnerName})`
                                : `Fiz (+${rewardStars} ⭐)`}
                            </button>
                          )}
                        </div>

                        {!st.completedBy && !st.canceledByFantasma && needsChoice && (
                          <div className="grid grid-cols-2 gap-2.5">
                            <button
                              type="button"
                              onClick={() =>
                                st.rescue
                                  ? onAction('respond_task_rescue', {
                                      taskId: def.id,
                                      accept: true,
                                      dateStr,
                                      nowHHMM,
                                    })
                                  : onAction('respond_delegation', {
                                      taskId: def.id,
                                      accept: true,
                                      dateStr,
                                      nowHHMM,
                                    })
                              }
                              className="min-h-[44px] rounded-[12px] bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs"
                            >
                              QUERO
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                st.rescue
                                  ? onAction('respond_task_rescue', {
                                      taskId: def.id,
                                      accept: false,
                                      dateStr,
                                      nowHHMM,
                                    })
                                  : onAction('respond_delegation', {
                                      taskId: def.id,
                                      accept: false,
                                      dateStr,
                                      nowHHMM,
                                    })
                              }
                              className="min-h-[44px] rounded-[12px] bg-slate-200 dark:bg-white/10 text-slate-900 dark:text-white font-extrabold text-xs"
                            >
                              NÃO QUERO
                            </button>
                          </div>
                        )}

                        {!st.completedBy && !st.canceledByFantasma && needsOwnerDraw && (
                          <button
                            type="button"
                            onClick={() =>
                              onAction('draw_delegation_fallback', {
                                taskId: def.id,
                                dateStr,
                                nowHHMM,
                              })
                            }
                            className="w-full min-h-[44px] rounded-[12px] bg-amber-400 text-slate-950 font-bold text-xs"
                          >
                            🎲 Sortear entre os outros 2 participantes
                          </button>
                        )}

                        {canGiveUp && (
                          <div className="flex justify-end">
                            {confirmGiveUpTaskId === def.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-rose-400 font-semibold">
                                  {st.rescue?.step === 3
                                    ? 'Vai gerar punição fds:'
                                    : hasValidTaskJustificationToday
                                    ? 'Justificado hoje (0 ⭐) e sorteia:'
                                    : st.delegationStage === 'accepted_target' || st.delegationStage === 'accepted_draw'
                                    ? 'Perde -1 ⭐ + punição fds e sorteia:'
                                    : 'Perde -3 ⭐ + punição fds e sorteia:'}
                                </span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await onAction('give_up_task', {
                                      taskId: def.id,
                                      dateStr,
                                      nowHHMM,
                                    });
                                    setConfirmGiveUpTaskId(null);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-rose-500 text-white text-[11px] font-bold"
                                >
                                  Confirmar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmGiveUpTaskId(null)}
                                  className="px-2 py-1 rounded-lg text-slate-400 text-[11px] font-semibold"
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmGiveUpTaskId(def.id)}
                                className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-rose-400 transition-colors"
                              >
                                Não vou conseguir fazer →
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Outros participantes — organizados por pessoa ou por horário */}
            <div className="space-y-3">
              <p className="text-xs font-bold tracking-wide text-slate-500 dark:text-slate-400">
                {tasksViewMode === 'by_person'
                  ? 'Tarefas dos outros (por participante)'
                  : 'Tarefas dos outros (ordem do dia)'}
              </p>

              {tasksViewMode === 'by_person' ? (
                <div className="space-y-2.5">
                  {otherTasksByParticipant.map(({ pid, tasks, resolvedCount }) => {
                    const pName = getParticipantName(gameState, pid);
                    const allDone = tasks.length > 0 && resolvedCount === tasks.length;
                    return (
                      <div key={pid} className="glass-subcard rounded-2xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={getParticipantAvatar(gameState, pid)}
                              alt={pName}
                              referrerPolicy="no-referrer"
                              className="w-7 h-7 rounded-lg object-cover shrink-0 ring-1 ring-white/15"
                            />
                            <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                              {pName}
                            </span>
                          </div>
                          <span
                            className={`font-mono-num text-[11px] font-bold ${
                              allDone ? 'text-emerald-500' : 'text-amber-500'
                            }`}
                          >
                            {resolvedCount}/{tasks.length} concluídas
                          </span>
                        </div>

                        {tasks.length === 0 ? (
                          <p className="text-xs text-slate-400">Nenhuma tarefa hoje.</p>
                        ) : (
                          <div className="divide-y divide-slate-200/60 dark:divide-white/5">
                            {tasks.map((def) => {
                              const st = day!.tasks[def.id];
                              const meta = getTaskMeta(def);
                              const deadline = getDeadlineForItem(
                                dateStr,
                                meta.weekdayLimit,
                                meta.weekendLimit
                              );
                              const bypassDeadline = isDeadlineBypassedByPrerequisite(
                                gameState,
                                day!,
                                dateStr,
                                meta.requiresTaskDone
                              );
                              const isDelegatedAway =
                                st.delegatedBy === pid && st.delegatedTo && st.delegatedTo !== pid;

                              return (
                                <div
                                  key={`${pid}-${def.id}`}
                                  className="py-1.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2 text-xs"
                                >
                                  <div className="min-w-0">
                                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                                      {meta.label}
                                    </span>
                                    <span className="text-slate-400 dark:text-slate-500 ml-1.5 text-[11px]">
                                      {bypassDeadline ? 'sem limite hoje' : deadline ? `até ${deadline}` : 'livre'}
                                    </span>
                                    {st.delegatedBy && st.delegatedBy !== pid && (
                                      <span className="block text-[11px] text-sky-400">
                                        delegada por {getParticipantName(gameState, st.delegatedBy)}
                                      </span>
                                    )}
                                    {!st.rescue && !st.delegatedBy && !st.canceledByFantasma && st.assignedTo && st.assignedTo !== pid && (
                                      <span className="block text-[11px] text-rose-400">
                                        punição cobrindo {getParticipantName(gameState, st.assignedTo)} (+1 ⭐ p/ {getParticipantName(gameState, st.assignedTo)})
                                      </span>
                                    )}
                                  </div>
                                  {st.canceledByFantasma ? (
                                    <span className="text-[11px] font-semibold text-amber-500 shrink-0">
                                      👻 {st.completedBy ? `${getParticipantName(gameState, st.completedBy)} fez` : 'Fantasma'}
                                    </span>
                                  ) : isDelegatedAway ? (
                                    <span className="text-[11px] font-semibold text-sky-400 shrink-0">
                                      👑 → {getParticipantName(gameState, st.delegatedTo!)}
                                      {st.completedBy ? ' ✓' : ''}
                                    </span>
                                  ) : st.completedBy ? (
                                    <span className="text-[11px] font-bold text-emerald-500 shrink-0">
                                      ✓ Feita
                                    </span>
                                  ) : st.justified && !st.rescue ? (
                                    <span className="text-[11px] font-semibold text-sky-400 shrink-0">
                                      Justificada (0 ⭐)
                                    </span>
                                  ) : (
                                    <span className="text-[11px] font-medium text-slate-400 shrink-0">
                                      Pendente
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-white/5">
                  {otherTasks
                    .filter((def) => {
                      const st = day?.tasks[def.id];
                      return Boolean(st?.assignedTo || st?.completedBy || st?.canceledByFantasma);
                    })
                    .map((def) => {
                      const st = day!.tasks[def.id];
                      const meta = getTaskMeta(def);
                      const eff = getTaskResponsibleParticipant(gameState, day!, dateStr, def.id);
                      const isPunCovered =
                        !st.rescue &&
                        !st.delegatedBy &&
                        !st.canceledByFantasma &&
                        Boolean(st.assignedTo && eff && eff !== st.assignedTo);
                      const whoLabel = st.canceledByFantasma
                        ? 'cancelada por fantasma'
                        : st.delegatedTo
                        ? `delegada para ${getParticipantName(gameState, st.delegatedTo)}`
                        : isPunCovered && eff && st.assignedTo
                        ? `${getParticipantName(gameState, eff)} (punição de ${getParticipantName(gameState, st.assignedTo)})`
                        : eff
                        ? getParticipantName(gameState, eff)
                        : '-';
                      return (
                        <div
                          key={def.id}
                          className="py-2.5 flex items-center justify-between gap-2 text-sm"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {meta.label}
                            </span>{' '}
                            <span className="text-slate-400">—</span>{' '}
                            <span
                              className={
                                st.canceledByFantasma
                                  ? 'text-amber-400 font-medium'
                                  : st.delegatedTo
                                  ? 'text-sky-400 font-medium'
                                  : 'text-slate-700 dark:text-slate-300'
                              }
                            >
                              {whoLabel}
                            </span>
                            {meta.note && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {meta.note}
                              </p>
                            )}
                          </div>
                          {st.completedBy ? (
                            <span className="text-xs font-bold text-emerald-500 shrink-0">
                              ✓ {getParticipantName(gameState, st.completedBy)}
                            </span>
                          ) : st.justified && !st.rescue ? (
                            <span className="text-xs font-semibold text-sky-400 shrink-0">
                              Justificada (0 ⭐)
                            </span>
                          ) : eff ? (
                            <span className="text-xs text-slate-400 shrink-0">
                              {isDeadlineBypassedByPrerequisite(gameState, day!, dateStr, meta.requiresTaskDone)
                                ? 'Sem limite hoje'
                                : getDeadlineForItem(dateStr, meta.weekdayLimit, meta.weekendLimit) || 'Livre'}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500 shrink-0">—</span>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

              {unscheduledTasksToday.length > 0 && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                  Sem escala hoje: {unscheduledTasksToday.map((td) => getTaskMeta(td).label).join(', ')} (dia sim, dia não).
                </p>
              )}
            </div>

          </section>

          {/* Justificativa do Dia — 3 big clickable cards (NO grey select!) */}
          <section className="glass-card rounded-3xl p-5 sm:p-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              {t(lang, 'justificationTitle')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              <strong>Regra: quem justificou não perde estrela e nem ganha (0 ⭐).</strong> Na rotina justificada fica em 0 ⭐ (não perde -1 ⭐ e não ganha +1 ⭐). Em tarefa com &ldquo;Tá doente&rdquo; ou &ldquo;Teve que sair&rdquo;, também não perde (-3 ⭐) e nem ganha (0 ⭐), sem punição no fim de semana.
            </p>
            <form onSubmit={handleSubmitJustification} className="space-y-3.5">
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    { id: 'doente', emoji: '🤒', label: 'Tá doente' },
                    { id: 'saiu', emoji: '🚪', label: 'Teve que sair' },
                    { id: 'outro', emoji: '📝', label: 'Outro' },
                  ] as const
                ).map((opt) => {
                  const selected = justReason === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setJustReason(opt.id)}
                      className={`min-h-[78px] p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all ${
                        selected
                          ? 'glass-gold text-slate-900 dark:text-white'
                          : 'glass-subcard text-slate-600 dark:text-slate-300 hover:border-amber-400/50'
                      }`}
                    >
                      <span className="text-2xl leading-none">{opt.emoji}</span>
                      <span className="text-xs font-bold text-center">{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Qual rotina justificar? (opcional — se não marcar nenhuma, vale para todas pendentes hoje)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ROUTINE_DEFINITIONS.filter((r) => !day?.routines[currentUserId]?.[r.id]?.completed).map(
                    (baseR) => {
                      const eff = getEffectiveRoutineDefinition(gameState, baseR.id);
                      const checked = justRoutineIds.includes(eff.id);
                      return (
                        <button
                          key={eff.id}
                          type="button"
                          onClick={() =>
                            setJustRoutineIds((prev) =>
                              prev.includes(eff.id)
                                ? prev.filter((id) => id !== eff.id)
                                : [...prev, eff.id]
                            )
                          }
                          className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-all ${
                            checked
                              ? 'bg-sky-500 text-white border-sky-500'
                              : 'border-slate-300 dark:border-white/15 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {eff.label}
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              <textarea
                rows={2}
                value={justDetails}
                onChange={(e) => setJustDetails(e.target.value)}
                placeholder="Conta o que aconteceu..."
                className="modern-input w-full px-4 py-3 bg-white/60 dark:bg-[#0B0E16]/70 backdrop-blur-md border border-slate-300/80 dark:border-white/15 text-slate-900 dark:text-white placeholder:text-slate-400"
              />

              <button
                type="submit"
                className="w-full min-h-[46px] rounded-[14px] bg-slate-900/90 dark:bg-white/12 hover:bg-slate-800 dark:hover:bg-white/18 text-white font-bold text-sm transition-all shadow-md"
              >
                Enviar justificativa
              </button>
            </form>
          </section>

          {/* Denunciar — Avatars + Tarefa/Rotina tabs + clickable chips */}
          <section className="glass-card rounded-3xl p-5 sm:p-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Flag className="w-5 h-5 text-rose-400" />
              <span>{t(lang, 'denounceTitle')}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-3.5">
              Marcou que fez sem ter feito? +1 ⭐ para você, -1 ⭐ para quem marcou errado. Uma denúncia por participante, por dia.
            </p>

            <form onSubmit={handleSubmitDenunciation} className="space-y-3.5">
              {/* Avatar selector */}
              <div className="grid grid-cols-3 gap-3">
                {others.map((pid) => {
                  const pName = getParticipantName(gameState, pid);
                  const active = denTarget === pid;
                  const hasShield = isShieldActiveNow(gameState, pid, dateStr, nowHHMM);
                  return (
                    <button
                      key={pid}
                      type="button"
                      disabled={hasShield}
                      onClick={() => setDenTarget(pid)}
                      className={`min-h-[72px] p-2.5 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all ${
                        hasShield
                          ? 'opacity-45 cursor-not-allowed glass-subcard border-emerald-500/40'
                          : active
                          ? 'glass-gold'
                          : 'glass-subcard hover:border-amber-400/45'
                      }`}
                    >
                      <img
                        src={getParticipantAvatar(gameState, pid)}
                        alt={pName}
                        referrerPolicy="no-referrer"
                        className="w-9 h-9 rounded-xl object-cover"
                      />
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {pName} {hasShield ? '🛡️' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Tabs: Tarefa / Rotina */}
              <div className="glass-subcard grid grid-cols-2 gap-1 p-1 rounded-[14px]">
                <button
                  type="button"
                  onClick={() => {
                    setDenCategory('rotina');
                    setDenItemId(ROUTINE_DEFINITIONS[0].id);
                  }}
                  className={`min-h-[40px] rounded-[10px] text-xs font-bold transition-colors ${
                    denCategory === 'rotina'
                      ? 'bg-white dark:bg-[#1A1F2B] text-amber-500 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Rotina (7)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDenCategory('tarefa');
                    setDenItemId(TASK_DEFINITIONS[0].id);
                  }}
                  className={`min-h-[40px] rounded-[10px] text-xs font-bold transition-colors ${
                    denCategory === 'tarefa'
                      ? 'bg-white dark:bg-[#1A1F2B] text-amber-500 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Tarefa (13)
                </button>
              </div>

              {/* Clickable chips */}
              <div className="flex flex-wrap gap-2">
                {(denCategory === 'rotina' ? ROUTINE_DEFINITIONS : TASK_DEFINITIONS).map((item) => {
                  const active = denItemId === item.id;
                  const itemLabel =
                    denCategory === 'rotina'
                      ? getEffectiveRoutineDefinition(gameState, item.id as RoutineId).label
                      : getEffectiveTaskDefinition(gameState, item.id as TaskId).label;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setDenItemId(item.id)}
                      className={`min-h-[38px] px-3 py-1.5 rounded-[12px] text-xs font-semibold border transition-all ${
                        active
                          ? 'bg-rose-500 text-white border-rose-500'
                          : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0D12] text-slate-700 dark:text-slate-300 hover:border-amber-400/50'
                      }`}
                    >
                      {itemLabel}
                    </button>
                  );
                })}
              </div>

              <input
                type="text"
                value={denDetails}
                onChange={(e) => setDenDetails(e.target.value)}
                placeholder="O que aconteceu? (opcional)"
                className="modern-input w-full px-4 py-3 bg-slate-50 dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white placeholder:text-slate-400"
              />

              <button
                type="submit"
                disabled={Boolean(day?.denunciationsUsed[currentUserId])}
                className="w-full min-h-[46px] rounded-[14px] bg-rose-500 hover:bg-rose-400 disabled:opacity-40 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
              >
                <Star className="w-4 h-4" />
                <span>
                  {day?.denunciationsUsed[currentUserId]
                    ? 'Você já denunciou hoje'
                    : 'Registrar Denúncia (+1 ⭐ / -1 ⭐)'}
                </span>
              </button>
            </form>
          </section>
        </div>
      </div>

      {/* Previous Day & Recorded Days Summary for All Participants */}
      {selectedDaySummaries && (
        <section ref={historySectionRef} className="glass-card rounded-3xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <History className="w-5 h-5 text-amber-400" />
                <span>
                  {effectiveHistoryDate === prevDateStr
                    ? 'O que cada participante fez ontem'
                    : effectiveHistoryDate === dateStr
                    ? 'Resumo de tarefas e estrelas de hoje'
                    : 'Resumo de tarefas e estrelas do dia'}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {formatPortugueseDateHeading(effectiveHistoryDate)} · tarefas feitas e estrelas do dia
              </p>
            </div>

            {recordedDates.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {recordedDates.map((dKey) => {
                  const shortLabel = `${dKey.slice(8)}/${dKey.slice(5, 7)}`;
                  const tag =
                    dKey === dateStr
                      ? `Hoje (${shortLabel})`
                      : dKey === prevDateStr
                      ? `Ontem (${shortLabel})`
                      : shortLabel;
                  const active = dKey === effectiveHistoryDate;
                  return (
                    <button
                      key={dKey}
                      type="button"
                      onClick={() => setSelectedHistoryDate(dKey)}
                      className={`min-h-[36px] px-3 rounded-xl text-xs font-bold transition-all ${
                        active
                          ? 'bg-amber-400 text-slate-950 shadow-sm'
                          : 'glass-subcard text-slate-600 dark:text-slate-300 hover:border-amber-400/50'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <StarBreakdownChart
            gameState={gameState}
            dateStr={effectiveHistoryDate}
            ranked={sortedStandings}
            currentUserId={currentUserId}
            compact
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {selectedDaySummaries.map((item) => {
              const pName = getParticipantName(gameState, item.pid);
              const isMe = item.pid === currentUserId;
              const allRoutinesDone = item.completedRoutinesCount === ROUTINE_DEFINITIONS.length;
              const totalTasksHandled =
                item.completedTasks.length + item.fantasmaCanceledTasks.length;

              return (
                <div
                  key={item.pid}
                  className={`rounded-2xl p-4 sm:p-5 space-y-3 transition-all ${
                    isMe ? 'glass-gold' : 'glass-subcard'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={getParticipantAvatar(gameState, item.pid)}
                        alt={pName}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-xl object-cover shrink-0 ring-1 ring-white/15"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {pName} {isMe ? '(Você)' : ''}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Rotinas:{' '}
                          <span
                            className={`font-mono-num font-bold ${
                              allRoutinesDone ? 'text-emerald-500' : 'text-amber-500'
                            }`}
                          >
                            {item.completedRoutinesCount}/7
                          </span>
                          {' · '}
                          <span className="font-mono-num font-semibold text-slate-700 dark:text-slate-200">
                            {item.completedTasks.length}{' '}
                            {item.completedTasks.length === 1 ? 'feita' : 'feitas'}
                            {item.fantasmaCanceledTasks.length > 0
                              ? ` (+${item.fantasmaCanceledTasks.length} 👻 = ${totalTasksHandled} do dia)`
                              : ''}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`font-mono-num text-sm font-extrabold block ${
                          item.netStars > 0
                            ? 'text-emerald-500'
                            : item.netStars < 0
                            ? 'text-rose-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {item.netStars > 0 ? `+${item.netStars}` : item.netStars} ⭐ no dia
                      </span>
                      <span className="text-[11px] font-mono-num text-slate-500 dark:text-slate-400">
                        Total atual: {gameState.participants[item.pid].stars} ⭐
                      </span>
                    </div>
                  </div>

                  {/* Breakdown of how stars were earned and lost on that day */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono-num text-slate-600 dark:text-slate-300 border-y border-slate-200/60 dark:border-white/10 py-2">
                    <span>
                      Rotinas:{' '}
                      {item.routinePenaltyStars > 0 ? (
                        <>
                          <strong className="text-emerald-500">+{item.routineEarnedStars} ⭐</strong>
                          {' · '}
                          <strong className="text-rose-400">
                            -{item.routinePenaltyStars} ⭐ ({item.routinePenaltyStars} não{' '}
                            {item.routinePenaltyStars === 1 ? 'feita' : 'feitas'})
                          </strong>
                          {' = '}
                          <strong className={item.routineStars >= 0 ? 'text-emerald-500' : 'text-rose-400'}>
                            {item.routineStars >= 0 ? `+${item.routineStars}` : item.routineStars} ⭐
                          </strong>
                        </>
                      ) : (
                        <strong className={item.routineStars >= 0 ? 'text-emerald-500' : 'text-rose-400'}>
                          {item.routineStars >= 0 ? `+${item.routineStars}` : item.routineStars} ⭐
                        </strong>
                      )}
                    </span>
                    <span>
                      Tarefas:{' '}
                      {item.taskPenaltyStars > 0 ? (
                        <>
                          <strong className="text-emerald-500">+{item.taskEarnedStars} ⭐</strong>
                          {' · '}
                          <strong className="text-rose-400">
                            -{item.taskPenaltyStars} ⭐ (não feitas)
                          </strong>
                          {' = '}
                          <strong className={item.taskStars >= 0 ? 'text-emerald-500' : 'text-rose-400'}>
                            {item.taskStars >= 0 ? `+${item.taskStars}` : item.taskStars} ⭐
                          </strong>
                        </>
                      ) : (
                        <strong className={item.taskStars >= 0 ? 'text-emerald-500' : 'text-rose-400'}>
                          {item.taskStars >= 0 ? `+${item.taskStars}` : item.taskStars} ⭐
                        </strong>
                      )}
                    </span>
                    {item.dicePowerStars !== 0 && (
                      <span>
                        Dado/Poderes:{' '}
                        <strong className={item.dicePowerStars > 0 ? 'text-amber-500' : 'text-rose-400'}>
                          {item.dicePowerStars > 0 ? `+${item.dicePowerStars}` : item.dicePowerStars} ⭐
                        </strong>
                      </span>
                    )}
                    {item.denunciationStars !== 0 && (
                      <span>
                        Denúncias:{' '}
                        <strong className={item.denunciationStars > 0 ? 'text-emerald-500' : 'text-rose-400'}>
                          {item.denunciationStars > 0 ? `+${item.denunciationStars}` : item.denunciationStars} ⭐
                        </strong>
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 text-xs">
                    <p className="text-slate-700 dark:text-slate-200">
                      <span className="font-semibold text-slate-500 dark:text-slate-400">
                        Tarefas feitas ({item.completedTasks.length}):{' '}
                      </span>
                      {item.completedTasks.length > 0 ? (
                        <span className="font-medium">
                          {item.completedTasks
                            .map((ct) =>
                              ct.viaFantasma
                                ? `${ct.def.label} (👻 +${ct.starsEarned}⭐)`
                                : ct.viaRescue
                                ? `${ct.def.label} (🎲 +${ct.starsEarned}⭐)`
                                : ct.starsEarned > 1
                                ? `${ct.def.label} (+${ct.starsEarned}⭐)`
                                : ct.def.label
                            )
                            .join(' · ')}
                        </span>
                      ) : (
                        <span className="text-slate-400">Nenhuma tarefa registrada</span>
                      )}
                    </p>

                    {item.fantasmaCanceledTasks.length > 0 && (
                      <p className="text-amber-500">
                        👻 Fantasma em:{' '}
                        {item.fantasmaCanceledTasks
                          .map((ft) =>
                            ft.completedBy
                              ? `${ft.def.label} (${getParticipantName(gameState, ft.completedBy)} fez)`
                              : ft.def.label
                          )
                          .join(', ')}
                      </p>
                    )}

                    {item.delegatedOutTasks.length > 0 && (
                      <p className="text-amber-500">
                        👑 Chefe delegou:{' '}
                        {item.delegatedOutTasks
                          .map((dt) =>
                            dt.to
                              ? `${dt.def.label} → ${getParticipantName(gameState, dt.to)}${
                                  dt.completed ? ' (concluída +1⭐)' : ''
                                }`
                              : dt.def.label
                          )
                          .join(', ')}
                      </p>
                    )}

                    {item.missedRoutineDetails.length > 0 && (
                      <p className="text-rose-400">
                        <span className="font-semibold">
                          Rotinas não feitas
                          {item.routinePenaltyStars > 0
                            ? ` (-${item.routinePenaltyStars} ⭐ · -1 ⭐ por cada)`
                            : ''}
                          :{' '}
                        </span>
                        {item.missedRoutineDetails
                          .map((mr) =>
                            mr.penaltyStars > 0
                              ? `${mr.def.label} (-${mr.penaltyStars} ⭐)`
                              : mr.justified
                              ? `${mr.def.label} (justificada · 0 ⭐)`
                              : `${mr.def.label} (pendente)`
                          )
                          .join(', ')}
                      </p>
                    )}

                    {item.missedTaskDetails.length > 0 && (
                      <p className="text-rose-400">
                        <span className="font-semibold">
                          Tarefas não feitas
                          {item.taskPenaltyStars > 0 ? ` (-${item.taskPenaltyStars} ⭐)` : ''}:{' '}
                        </span>
                        {item.missedTaskDetails
                          .map((mt) =>
                            mt.penaltyStars > 0
                              ? `${mt.def.label} (-${mt.penaltyStars} ⭐)`
                              : mt.justified
                              ? `${mt.def.label} (justificada · 0 ⭐)`
                              : `${mt.def.label} (pendente)`
                          )
                          .join(', ')}
                      </p>
                    )}

                    <div className="pt-1 space-y-1.5">
                      <p className="font-semibold text-slate-500 dark:text-slate-400">
                        Dado e desfecho por rodada:
                      </p>
                      {item.round1Summary || item.round2Summary ? (
                        <div className="space-y-1.5">
                          {[item.round1Summary, item.round2Summary].map((rs) => {
                            if (!rs) return null;
                            return (
                              <div
                                key={`${item.pid}-r${rs.round}`}
                                className="rounded-xl bg-white/50 dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/10 px-3 py-2 space-y-0.5"
                              >
                                <p className="font-bold text-slate-800 dark:text-slate-100">
                                  Rodada {rs.round} — {rs.powerTitle}
                                </p>
                                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                                  <span className="font-semibold">O que usou:</span> {rs.usageText}
                                </p>
                                <p className="text-[11px] text-amber-600 dark:text-amber-300 font-medium">
                                  <span className="font-semibold">Desfecho final:</span> {rs.finalOutcome}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-slate-400">Não jogado neste dia</p>
                      )}
                      {item.diceJustification?.text && (
                        <p className="text-[11px] text-sky-500 dark:text-sky-300 font-medium">
                          📝 Justificativa do dado (0 ⭐): {item.diceJustification.text}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
