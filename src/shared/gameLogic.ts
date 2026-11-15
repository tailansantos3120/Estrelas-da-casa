import {
  getBrazilDateStr,
  getDeadlineForItem,
  getEffectiveRoutineDefinition,
  getEffectiveTaskDefinition,
  getNextDateStr,
  getNextInRotation,
  getOtherParticipants,
  getParticipantAvatar,
  getParticipantName,
  isTimePastDeadline,
  PARTICIPANT_PROFILES,
  ROTATION_ORDER,
  ROUTINE_DEFINITIONS,
  TASK_DEFINITIONS,
} from './schedule.ts';
import { createEmptyDayRecord } from './seedState.ts';
import type {
  ChatMessage,
  ChatReactionMap,
  CustomGameRule,
  CustomGameTask,
  DayRecord,
  DiceJustificationEntry,
  DiceRollState,
  FantasmaDraw,
  GameNotification,
  GameState,
  ParticipantId,
  PowerType,
  RoutineDefinition,
  RoutineDefinitionOverride,
  RoutineId,
  SoundThemeId,
  TaskDefinition,
  TaskDefinitionOverride,
  TaskId,
  WeekendPunishment,
} from './types.ts';

export const DICE_WINDOWS = {
  1: { start: '05:00', end: '10:00', label: '05:00 às 10:00' },
  2: { start: '12:00', end: '19:00', label: '12:00 às 19:00' },
} as const;

export function isDiceDisabledForDate(
  state: Pick<GameState, 'diceDisabledDates'> | null | undefined,
  dateStr: string
): boolean {
  return Boolean(state?.diceDisabledDates?.includes(dateStr));
}

export function getDiceWindowStatus(
  state: Pick<GameState, 'diceDisabledDates'> | null | undefined,
  dateStr: string,
  round: 1 | 2,
  nowHHMM: string
): {
  allowed: boolean;
  reason: 'open' | 'disabled_today' | 'before_window' | 'after_window';
  message?: string;
  start: string;
  end: string;
  label: string;
} {
  const win = DICE_WINDOWS[round];
  if (isDiceDisabledForDate(state, dateStr)) {
    return {
      allowed: false,
      reason: 'disabled_today',
      message:
        'O dado não é permitido hoje. Só será liberado no próximo dia (Rodada 1: 05:00–10:00 · Rodada 2: 12:00–19:00).',
      start: win.start,
      end: win.end,
      label: win.label,
    };
  }
  if (nowHHMM < win.start) {
    return {
      allowed: false,
      reason: 'before_window',
      message:
        round === 1
          ? `O dado da manhã só é liberado às ${win.start} (horário: ${win.label}).`
          : `O dado da tarde só é liberado às ${win.start} (horário: ${win.label}).`,
      start: win.start,
      end: win.end,
      label: win.label,
    };
  }
  if (nowHHMM > win.end) {
    return {
      allowed: false,
      reason: 'after_window',
      message:
        round === 1
          ? `O horário do dado da manhã (${win.label}) já encerrou hoje. Só será permitido no próximo dia.`
          : `O horário do dado da tarde (${win.label}) já encerrou hoje. Só será permitido no próximo dia.`,
      start: win.start,
      end: win.end,
      label: win.label,
    };
  }
  return {
    allowed: true,
    reason: 'open',
    start: win.start,
    end: win.end,
    label: win.label,
  };
}

function formatShortTimestamp(dateStr: string, hhmm: string): string {
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}, ${hhmm}`;
}

export function addMinutesHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, (h || 0) * 60 + (m || 0) + minutes);
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

export function getEffectiveAssignee(day: DayRecord, taskId: TaskId): ParticipantId | null {
  const t = day.tasks[taskId];
  if (!t) return null;
  if (t.canceledByFantasma) return null;
  if (t.rescue && !t.rescue.failedStep3) {
    return t.rescue.currentAssigneeId;
  }
  if (t.delegationStage === 'awaiting_owner_draw' || t.delegationStage === 'returned_to_owner') {
    return t.delegatedBy || t.assignedTo;
  }
  if (t.delegationStage === 'pending_draw' || t.delegationStage === 'accepted_draw') {
    return t.delegationDrawnTo || t.delegatedTo || t.assignedTo;
  }
  return t.delegatedTo || t.assignedTo;
}

function getWeekendDayKey(dateStr: string): 'sabado' | 'domingo' | null {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (dow === 6) return 'sabado';
  if (dow === 0) return 'domingo';
  return null;
}

function getDiffDaysUtc(fromDateStr: string, toDateStr: string): number {
  const [fy, fm, fd] = fromDateStr.split('-').map(Number);
  const [ty, tm, td] = toDateStr.split('-').map(Number);
  const fromMs = Date.UTC(fy, fm - 1, fd);
  const toMs = Date.UTC(ty, tm - 1, td);
  return Math.floor((toMs - fromMs) / (1000 * 60 * 60 * 24));
}

export function getActiveWeekendPunishmentForOwner(
  state: Pick<GameState, 'weekendPunishments'> | null | undefined,
  dateStr: string,
  ownerId: ParticipantId | null | undefined,
  options?: { includeCompleted?: boolean; workerId?: ParticipantId | null }
): WeekendPunishment | null {
  if (!state || !ownerId) return null;
  const weekendKey = getWeekendDayKey(dateStr);
  if (!weekendKey) return null;

  for (const wp of state.weekendPunishments || []) {
    if (!options?.includeCompleted && wp.completed) continue;
    if (wp.chosenDay !== weekendKey) continue;
    if (wp.coveringForId !== ownerId) continue;
    if (wp.punishedId === ownerId) continue;
    if (options?.workerId && wp.punishedId !== options.workerId) continue;
    const diff = getDiffDaysUtc(wp.dateStr, dateStr);
    if (diff < 0 || diff > 6) continue;
    return wp;
  }
  return null;
}

export function getTaskResponsibleParticipant(
  state: Pick<GameState, 'weekendPunishments' | 'taskOverrides'> | null | undefined,
  day: DayRecord,
  dateStr: string,
  taskId: TaskId
): ParticipantId | null {
  const baseOwner = getEffectiveAssignee(day, taskId);
  if (!baseOwner || !state) return baseOwner;
  const t = day.tasks[taskId];
  if (!t || t.canceledByFantasma || t.rescue || t.delegatedBy) return baseOwner;
  const def = getEffectiveTaskDefinition(state, taskId);
  if (def.ownerOnly || def.id === 'roupa') return baseOwner;

  const wp = getActiveWeekendPunishmentForOwner(state, dateStr, baseOwner, {
    includeCompleted: Boolean(t.completedBy && t.completedBy !== baseOwner),
    workerId: t.completedBy && t.completedBy !== baseOwner ? t.completedBy : undefined,
  });
  return wp ? wp.punishedId : baseOwner;
}

export function isShieldActiveNow(
  state: GameState,
  participantId: ParticipantId,
  dateStr: string,
  nowHHMM: string
): boolean {
  const p = state.participants[participantId];
  if (!p.shieldActiveUntil) return false;
  const [shieldDate, shieldTime] = p.shieldActiveUntil.split('T');
  if (shieldDate !== dateStr) return false;
  const limit = shieldTime ? shieldTime.slice(0, 5) : '12:00';
  return nowHHMM <= limit;
}

export function isFrozenToday(state: GameState, participantId: ParticipantId, dateStr: string): boolean {
  return state.participants[participantId].frozenDateStr === dateStr;
}

export function ensureDayRecord(state: GameState, dateStr: string): DayRecord {
  if (!state.days[dateStr]) {
    state.days[dateStr] = createEmptyDayRecord(dateStr);
  }
  return state.days[dateStr];
}

function pushNotification(
  state: GameState,
  notif: Omit<GameNotification, 'id' | 'createdAtIso'>
): GameNotification {
  const full: GameNotification = {
    ...notif,
    id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAtIso: `${notif.dateStr}T${notif.timestamp.split(', ')[1] || '12:00'}:00`,
  };
  state.notifications.unshift(full);
  if (state.notifications.length > 400) {
    state.notifications = state.notifications.slice(0, 400);
  }
  return full;
}

export function applyStarDelta(
  state: GameState,
  participantId: ParticipantId,
  delta: number,
  dateStr: string,
  nowHHMM: string
): void {
  const p = state.participants[participantId];
  p.stars += delta;

  // Check evolution milestones (35, 45, 55, 65)
  const milestones: Array<{ threshold: number; power: PowerType; label: string }> = [
    { threshold: 35, power: 'fantasma', label: '👻 FANTASMA' },
    { threshold: 45, power: 'escudo', label: '🛡️ ESCUDO' },
    { threshold: 55, power: 'chefe', label: '👑 CHEFE' },
    { threshold: 65, power: 'coringa', label: '🃏 CORINGA' },
  ];

  for (const m of milestones) {
    if (p.stars >= m.threshold && !p.unlockedMilestones.includes(m.threshold)) {
      p.unlockedMilestones.push(m.threshold);
      p.inventory[m.power] += 1;
      pushNotification(state, {
        dateStr,
        timestamp: formatShortTimestamp(dateStr, nowHHMM),
        actorId: participantId,
        type: 'system',
        title: `${getParticipantName(state, participantId)} atingiu ${m.threshold} ⭐!`,
        message: `Desbloqueou a meta ${m.label} (guardado nos seus itens).`,
      });
    }
  }
}

export function isPrerequisiteUnderDecisionOrMissed(
  day: DayRecord,
  reqTaskId: TaskId
): boolean {
  const reqTask = day.tasks[reqTaskId];
  if (!reqTask) return false;
  return Boolean(
    reqTask.expiredPenaltyApplied ||
      reqTask.justified ||
      reqTask.rescue ||
      reqTask.canceledByFantasma ||
      reqTask.delegationStage === 'pending_target' ||
      reqTask.delegationStage === 'awaiting_owner_draw' ||
      reqTask.delegationStage === 'pending_draw' ||
      reqTask.delegationStage === 'returned_to_owner'
  );
}

export function isDeadlineBypassedByPrerequisite(
  state: Pick<GameState, 'taskOverrides' | 'routineOverrides'> | null | undefined,
  day: DayRecord,
  dateStr: string,
  reqTaskId?: TaskId,
  depDeadlineHHMM?: string | null
): boolean {
  if (!reqTaskId) return false;
  const reqTask = day.tasks[reqTaskId];
  if (!reqTask) return false;
  if (isPrerequisiteUnderDecisionOrMissed(day, reqTaskId)) return true;
  if (reqTask.completedBy) {
    if (
      reqTask.delegationStage === 'accepted_draw' ||
      reqTask.delegationReturnedToOwner ||
      reqTask.delegationStage === 'returned_to_owner'
    ) {
      return true;
    }
    const reqDef = getEffectiveTaskDefinition(state, reqTaskId);
    const reqLimit = getDeadlineForItem(dateStr, reqDef.weekdayLimit, reqDef.weekendLimit);
    const completedHHMM = reqTask.completedAt ? reqTask.completedAt.slice(11, 16) : '';
    if (reqLimit && completedHHMM && completedHHMM > reqLimit) {
      return true;
    }
    if (depDeadlineHHMM && completedHHMM && addMinutesHHMM(completedHHMM, 15) > depDeadlineHHMM) {
      return true;
    }
  }
  return false;
}

export function isRoutineUnlocked(
  day: DayRecord,
  routineId: RoutineId,
  state?: Pick<GameState, 'taskOverrides' | 'routineOverrides'> | null
): { unlocked: boolean; reason?: string; bypassedDeadline?: boolean } {
  const def = getEffectiveRoutineDefinition(state, routineId);
  if (!def || !def.requiresTaskDone) return { unlocked: true };
  const reqTask = day.tasks[def.requiresTaskDone];
  const reqDef = getEffectiveTaskDefinition(state, def.requiresTaskDone);
  const depDeadline = getDeadlineForItem(day.dateStr, def.weekdayLimit, def.weekendLimit);
  if (!reqTask || reqTask.completedBy) {
    return {
      unlocked: true,
      bypassedDeadline: reqTask
        ? isDeadlineBypassedByPrerequisite(state, day, day.dateStr, def.requiresTaskDone, depDeadline)
        : false,
    };
  }
  if (isPrerequisiteUnderDecisionOrMissed(day, def.requiresTaskDone)) {
    return { unlocked: true, bypassedDeadline: true };
  }
  return {
    unlocked: false,
    reason: `Aguardando "${reqDef.label}" ser concluída primeiro.`,
  };
}

export function isTaskUnlocked(
  day: DayRecord,
  taskId: TaskId,
  state?: Pick<GameState, 'taskOverrides' | 'routineOverrides'> | null
): { unlocked: boolean; reason?: string; bypassedDeadline?: boolean } {
  const def = getEffectiveTaskDefinition(state, taskId);
  if (!def || !def.requiresTaskDone) return { unlocked: true };
  const reqTask = day.tasks[def.requiresTaskDone];
  const reqDef = getEffectiveTaskDefinition(state, def.requiresTaskDone);
  const depDeadline = getDeadlineForItem(day.dateStr, def.weekdayLimit, def.weekendLimit);
  if (!reqTask || reqTask.completedBy) {
    return {
      unlocked: true,
      bypassedDeadline: reqTask
        ? isDeadlineBypassedByPrerequisite(state, day, day.dateStr, def.requiresTaskDone, depDeadline)
        : false,
    };
  }
  if (isPrerequisiteUnderDecisionOrMissed(day, def.requiresTaskDone)) {
    return { unlocked: true, bypassedDeadline: true };
  }
  return {
    unlocked: false,
    reason: `Só libera após "${reqDef.label}" concluir.`,
  };
}

function hasRoutineJustification(
  state: GameState,
  dateStr: string,
  participantId: ParticipantId,
  routineId: RoutineId
): boolean {
  return (state.justifications || []).some(
    (j) =>
      j.dateStr === dateStr &&
      j.participantId === participantId &&
      (!j.routineIds || j.routineIds.length === 0 || j.routineIds.includes(routineId))
  );
}

function hasTaskJustification(
  state: GameState,
  dateStr: string,
  participantId: ParticipantId
): boolean {
  return (state.justifications || []).some(
    (j) =>
      j.dateStr === dateStr &&
      j.participantId === participantId &&
      (j.reason === 'doente' || j.reason === 'saiu')
  );
}

export function completeRoutine(
  state: GameState,
  dateStr: string,
  participantId: ParticipantId,
  routineId: RoutineId,
  nowHHMM: string
): { ok: boolean; error?: string } {
  const day = ensureDayRecord(state, dateStr);
  const entry = day.routines[participantId]?.[routineId];
  if (!entry) return { ok: false, error: 'Rotina não encontrada.' };
  if (entry.completed) return { ok: false, error: 'Rotina já marcada.' };
  if (entry.justified) {
    return { ok: false, error: 'Rotina justificada hoje: não perde estrela e não ganha (0 ⭐).' };
  }
  if (entry.expiredPenaltyApplied) return { ok: false, error: 'Prazo expirado.' };

  if (hasRoutineJustification(state, dateStr, participantId, routineId)) {
    entry.justified = true;
    entry.expiredPenaltyApplied = false;
    return { ok: false, error: 'Rotina justificada hoje: não perde estrela e não ganha (0 ⭐).' };
  }

  const def = getEffectiveRoutineDefinition(state, routineId);
  const unlock = isRoutineUnlocked(day, routineId, state);
  if (!unlock.unlocked) {
    return { ok: false, error: unlock.reason };
  }

  const deadline = getDeadlineForItem(dateStr, def.weekdayLimit, def.weekendLimit);
  const bypassDeadline = isDeadlineBypassedByPrerequisite(
    state,
    day,
    dateStr,
    def.requiresTaskDone,
    deadline
  );
  if (!bypassDeadline && isTimePastDeadline(nowHHMM, deadline)) {
    entry.expiredPenaltyApplied = true;
    applyStarDelta(state, participantId, -1, dateStr, nowHHMM);
    pushNotification(state, {
      dateStr,
      timestamp: formatShortTimestamp(dateStr, nowHHMM),
      actorId: participantId,
      type: 'penalty',
      title: `${getParticipantName(state, participantId)} -1 ⭐`,
      message: `Rotina "${def.label}" fora do prazo.`,
      starDelta: -1,
    });
    return { ok: false, error: `Prazo encerrado às ${deadline}. -1 ⭐ descontada automaticamente.` };
  }

  entry.completed = true;
  entry.completedAt = `${dateStr}T${nowHHMM}:00`;

  const frozen = isFrozenToday(state, participantId, dateStr);
  if (frozen) {
    pushNotification(state, {
      dateStr,
      timestamp: formatShortTimestamp(dateStr, nowHHMM),
      actorId: participantId,
      type: 'star',
      title: `${getParticipantName(state, participantId)} concluiu rotina (congelado)`,
      message: `${def.label} concluída sem ⭐ devido ao congelamento.`,
      starDelta: 0,
    });
  } else {
    applyStarDelta(state, participantId, 1, dateStr, nowHHMM);
    pushNotification(state, {
      dateStr,
      timestamp: formatShortTimestamp(dateStr, nowHHMM),
      actorId: participantId,
      type: 'star',
      title: `${getParticipantName(state, participantId)} +1 ⭐`,
      message: `${def.label} conquistada por ${getParticipantName(state, participantId)}.`,
      starDelta: 1,
    });
  }

  return { ok: true };
}

export function completeTask(
  state: GameState,
  dateStr: string,
  participantId: ParticipantId,
  taskId: TaskId,
  nowHHMM: string
): { ok: boolean; error?: string } {
  const day = ensureDayRecord(state, dateStr);
  const task = day.tasks[taskId];
  if (!task) return { ok: false, error: 'Tarefa não encontrada.' };
  if (task.completedBy) return { ok: false, error: 'Tarefa já concluída.' };
  if (task.canceledByFantasma) return { ok: false, error: 'Tarefa cancelada por Fantasma.' };
  if (task.justified && !task.rescue) {
    return { ok: false, error: 'Tarefa justificada hoje: não perde estrela e não ganha (0 ⭐).' };
  }

  const effectiveOwner = getEffectiveAssignee(day, taskId);
  const def = getEffectiveTaskDefinition(state, taskId);

  if (def.ownerOnly && task.assignedTo !== participantId && effectiveOwner !== participantId) {
    return { ok: false, error: 'Roupa: só quem lava é o próprio dono.' };
  }
  const activePunishment =
    !task.rescue && !task.delegatedBy && !task.canceledByFantasma && !def.ownerOnly && def.id !== 'roupa' && effectiveOwner
      ? getActiveWeekendPunishmentForOwner(state, dateStr, effectiveOwner)
      : null;
  const expectedDoer = activePunishment ? activePunishment.punishedId : effectiveOwner;
  if (expectedDoer !== participantId) {
    return {
      ok: false,
      error: activePunishment
        ? `${getParticipantName(state, activePunishment.punishedId)} está cumprindo a punição de fazer as tarefas de ${getParticipantName(state, activePunishment.coveringForId)} hoje.`
        : 'Esta tarefa pertence a outro participante hoje.',
    };
  }

  if (task.rescue) {
    if (task.rescue.failedStep3) {
      return { ok: false, error: 'Prazo do repasse encerrado.' };
    }
    if (!task.rescue.accepted) {
      return { ok: false, error: 'Responda QUERO ou NÃO QUERO antes de concluir.' };
    }
  } else {
    if (task.delegationStage === 'pending_target' || task.delegationStage === 'pending_draw') {
      return { ok: false, error: 'Responda QUERO ou NÃO QUERO antes de concluir.' };
    }
    if (task.delegationStage === 'awaiting_owner_draw') {
      return { ok: false, error: 'Faça primeiro o sorteio entre os outros 2 participantes.' };
    }
  }

  const unlock = isTaskUnlocked(day, taskId, state);
  if (!unlock.unlocked) {
    return { ok: false, error: unlock.reason };
  }

  // Bypass original clock deadline when task is in rescue cascade, delegation draw, returned to owner, or prerequisite missed/under draw
  const deadline = getDeadlineForItem(dateStr, def.weekdayLimit, def.weekendLimit);
  const bypassOriginalDeadline = Boolean(
    task.rescue ||
      task.delegationStage === 'accepted_draw' ||
      task.delegationStage === 'returned_to_owner' ||
      task.delegationReturnedToOwner ||
      isDeadlineBypassedByPrerequisite(state, day, dateStr, def.requiresTaskDone, deadline)
  );
  if (!bypassOriginalDeadline) {
    if (isTimePastDeadline(nowHHMM, deadline)) {
      return { ok: false, error: `Prazo de "${def.label}" encerrou às ${deadline}.` };
    }
  }

  task.completedBy = participantId;
  task.completedAt = `${dateStr}T${nowHHMM}:00`;

  const frozen = isFrozenToday(state, participantId, dateStr);

  if (task.rescue) {
    const reward = task.rescue.rewardStars;
    if (!frozen) {
      applyStarDelta(state, participantId, reward, dateStr, nowHHMM);
    }
    pushNotification(state, {
      dateStr,
      timestamp: formatShortTimestamp(dateStr, nowHHMM),
      actorId: participantId,
      type: 'star',
      title: frozen
        ? `${getParticipantName(state, participantId)} concluiu ${def.label} (congelado)`
        : `${getParticipantName(state, participantId)} +${reward} ⭐`,
      message: frozen
        ? `Concluiu repasse de ${def.label}, mas está congelado hoje.`
        : `Concluiu ${def.label} no repasse automático (+${reward} ⭐).`,
      starDelta: frozen ? 0 : reward,
    });
    return { ok: true };
  }

  if (task.delegationStage === 'accepted_target' && task.delegatedBy) {
    const delegatorId = task.delegatedBy;
    const delegatorFrozen = isFrozenToday(state, delegatorId, dateStr);
    if (!frozen) applyStarDelta(state, participantId, 1, dateStr, nowHHMM);
    if (!delegatorFrozen) applyStarDelta(state, delegatorId, 1, dateStr, nowHHMM);
    pushNotification(state, {
      dateStr,
      timestamp: formatShortTimestamp(dateStr, nowHHMM),
      actorId: participantId,
      targetId: delegatorId,
      type: 'star',
      title: `${getParticipantName(state, participantId)} +1 ⭐ e ${getParticipantName(state, delegatorId)} +1 ⭐`,
      message: `${def.label} (delegada por ${getParticipantName(state, delegatorId)}) foi concluída!`,
      starDelta: frozen ? 0 : 1,
    });
    return { ok: true };
  }

  if (task.delegationStage === 'accepted_draw') {
    if (!frozen) applyStarDelta(state, participantId, 2, dateStr, nowHHMM);
    pushNotification(state, {
      dateStr,
      timestamp: formatShortTimestamp(dateStr, nowHHMM),
      actorId: participantId,
      type: 'star',
      title: frozen
        ? `${getParticipantName(state, participantId)} concluiu ${def.label} (congelado)`
        : `${getParticipantName(state, participantId)} +2 ⭐`,
      message: `Concluiu ${def.label} pelo sorteio da delegação!`,
      starDelta: frozen ? 0 : 2,
    });
    return { ok: true };
  }

  if (task.delegationStage === 'returned_to_owner' || task.delegationReturnedToOwner) {
    if (!frozen) applyStarDelta(state, participantId, 2, dateStr, nowHHMM);
    pushNotification(state, {
      dateStr,
      timestamp: formatShortTimestamp(dateStr, nowHHMM),
      actorId: participantId,
      type: 'star',
      title: frozen
        ? `${getParticipantName(state, participantId)} concluiu ${def.label} (congelado)`
        : `${getParticipantName(state, participantId)} +2 ⭐`,
      message: `${def.label} voltou para a dona do card e foi concluída (+2 ⭐)!`,
      starDelta: frozen ? 0 : 2,
    });
    return { ok: true };
  }

  if (activePunishment) {
    const coveredId = activePunishment.coveringForId;
    task.weekendPunishmentFor = coveredId;
    const coveredFrozen = isFrozenToday(state, coveredId, dateStr);
    if (coveredFrozen) {
      pushNotification(state, {
        dateStr,
        timestamp: formatShortTimestamp(dateStr, nowHHMM),
        actorId: coveredId,
        targetId: participantId,
        type: 'star',
        title: `${getParticipantName(state, coveredId)} — ${def.label} concluída (congelada)`,
        message: `${getParticipantName(state, participantId)} fez ${def.label} (punição), mas estrelas estão congeladas hoje.`,
        starDelta: 0,
      });
    } else {
      applyStarDelta(state, coveredId, 1, dateStr, nowHHMM);
      pushNotification(state, {
        dateStr,
        timestamp: formatShortTimestamp(dateStr, nowHHMM),
        actorId: coveredId,
        targetId: participantId,
        type: 'star',
        title: `${getParticipantName(state, coveredId)} +1 ⭐ (automático)`,
        message: `${getParticipantName(state, participantId)} concluiu ${def.label} pela punição — ${getParticipantName(state, coveredId)} ganhou +1 ⭐ automaticamente.`,
        starDelta: 1,
      });
    }
    return { ok: true };
  }

  if (frozen) {
    pushNotification(state, {
      dateStr,
      timestamp: formatShortTimestamp(dateStr, nowHHMM),
      actorId: participantId,
      type: 'star',
      title: `${getParticipantName(state, participantId)} concluiu ${def.label} (congelado)`,
      message: `Marcada como feita, mas estrelas congeladas hoje.`,
      starDelta: 0,
    });
  } else {
    applyStarDelta(state, participantId, 1, dateStr, nowHHMM);
    pushNotification(state, {
      dateStr,
      timestamp: formatShortTimestamp(dateStr, nowHHMM),
      actorId: participantId,
      type: 'star',
      title: `${getParticipantName(state, participantId)} +1 ⭐`,
      message: `${def.label} conquistada por ${getParticipantName(state, participantId)}.`,
      starDelta: 1,
    });
  }

  return { ok: true };
}

export function triggerFantasmaDraw(
  state: GameState,
  dateStr: string,
  ownerId: ParticipantId,
  taskId: TaskId,
  round: 1 | 2,
  nowHHMM: string,
  forcedDrawnParticipant?: ParticipantId
): { ok: boolean; error?: string; draw?: FantasmaDraw } {
  const day = ensureDayRecord(state, dateStr);
  const task = day.tasks[taskId];
  if (!task) return { ok: false, error: 'Tarefa inválida.' };
  const effective = getEffectiveAssignee(day, taskId);
  if (effective !== ownerId) return { ok: false, error: 'Escolha uma tarefa sua disponível.' };
  if (task.completedBy || task.canceledByFantasma) return { ok: false, error: 'Tarefa já concluída ou cancelada.' };

  const def = getEffectiveTaskDefinition(state, taskId);
  const candidates = getOtherParticipants(ownerId).filter(
    (p) => !isShieldActiveNow(state, p, dateStr, nowHHMM)
  );
  if (candidates.length === 0) {
    return {
      ok: false,
      error: 'Todos os outros participantes estão com 🛡️ ESCUDO ativo e protegidos dos sorteios!',
    };
  }
  if (forcedDrawnParticipant && !candidates.includes(forcedDrawnParticipant)) {
    return {
      ok: false,
      error: `${getParticipantName(state, forcedDrawnParticipant)} está com 🛡️ ESCUDO ativo e protegido dos sorteios!`,
    };
  }
  const drawn =
    forcedDrawnParticipant && candidates.includes(forcedDrawnParticipant)
      ? forcedDrawnParticipant
      : candidates[Math.floor(Math.random() * candidates.length)];

  task.canceledByFantasma = true;
  task.fantasmaOwner = ownerId;

  const draw: FantasmaDraw = {
    id: `draw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    dateStr,
    round,
    ownerId,
    taskId,
    taskLabel: def.label,
    drawnParticipantId: drawn,
    status: 'pending',
    createdAt: `${dateStr}T${nowHHMM}:00`,
    respondedAt: null,
    completedAt: null,
  };
  state.fantasmaDraws.unshift(draw);

  pushNotification(state, {
    dateStr,
    timestamp: formatShortTimestamp(dateStr, nowHHMM),
    actorId: ownerId,
    targetId: drawn,
    type: 'fantasma',
    title: `${getParticipantName(state, ownerId)} usou o FANTASMA em ${def.label}`,
    message: `Sorteio da Rodada ${round}: ${getParticipantName(state, drawn)} pode fazer a tarefa e ganhar 3 ⭐.`,
  });

  // Decrement pending queue if any
  const queue = day.pendingFantasmaQueue[ownerId];
  if (queue && queue.length > 0) {
    queue[0].remaining -= 1;
    if (queue[0].remaining <= 0) {
      queue.shift();
    }
  }

  return { ok: true, draw };
}

export function respondToFantasmaDraw(
  state: GameState,
  drawId: string,
  participantId: ParticipantId,
  accept: boolean,
  nowHHMM: string
): { ok: boolean; error?: string } {
  const draw = state.fantasmaDraws.find((d) => d.id === drawId);
  if (!draw) return { ok: false, error: 'Sorteio não encontrado.' };
  if (draw.drawnParticipantId !== participantId) {
    return { ok: false, error: 'Apenas quem foi sorteado pode responder.' };
  }
  if (draw.status !== 'pending') return { ok: false, error: 'Sorteio já respondido.' };

  draw.respondedAt = `${draw.dateStr}T${nowHHMM}:00`;
  if (accept) {
    draw.status = 'accepted';
    pushNotification(state, {
      dateStr: draw.dateStr,
      timestamp: formatShortTimestamp(draw.dateStr, nowHHMM),
      actorId: participantId,
      type: 'fantasma',
      title: `${getParticipantName(state, participantId)} aceitou o sorteio`,
      message: `Vai fazer ${draw.taskLabel} e ganhar 3 ⭐ se concluir.`,
    });
  } else {
    draw.status = 'declined';
    pushNotification(state, {
      dateStr: draw.dateStr,
      timestamp: formatShortTimestamp(draw.dateStr, nowHHMM),
      actorId: participantId,
      type: 'fantasma',
      title: `${getParticipantName(state, participantId)} recusou o sorteio`,
      message: `Não quis fazer ${draw.taskLabel}. O sorteio foi encerrado.`,
    });
  }
  return { ok: true };
}

export function completeFantasmaDrawTask(
  state: GameState,
  drawId: string,
  participantId: ParticipantId,
  nowHHMM: string
): { ok: boolean; error?: string } {
  const draw = state.fantasmaDraws.find((d) => d.id === drawId);
  if (!draw) return { ok: false, error: 'Sorteio não encontrado.' };
  if (draw.drawnParticipantId !== participantId) return { ok: false, error: 'Apenas o sorteado pode marcar como feita.' };
  if (draw.status !== 'accepted') return { ok: false, error: 'Aceite o sorteio antes de concluir.' };

  draw.status = 'completed';
  draw.completedAt = `${draw.dateStr}T${nowHHMM}:00`;

  const day = ensureDayRecord(state, draw.dateStr);
  if (day.tasks[draw.taskId]) {
    day.tasks[draw.taskId].completedBy = participantId;
    day.tasks[draw.taskId].completedAt = draw.completedAt;
  }

  applyStarDelta(state, participantId, 3, draw.dateStr, nowHHMM);
  pushNotification(state, {
    dateStr: draw.dateStr,
    timestamp: formatShortTimestamp(draw.dateStr, nowHHMM),
    actorId: participantId,
    type: 'star',
    title: `${getParticipantName(state, participantId)} +3 ⭐`,
    message: `Fez ${draw.taskLabel} do Fantasma. As 3 ⭐ são de ${getParticipantName(state, participantId)}.`,
    starDelta: 3,
  });

  return { ok: true };
}

export function delegateTaskWithChefe(
  state: GameState,
  dateStr: string,
  ownerId: ParticipantId,
  taskId: TaskId,
  targetId: ParticipantId,
  nowHHMM: string
): { ok: boolean; error?: string } {
  if (ownerId === targetId) return { ok: false, error: 'Escolha outro participante.' };
  const def = getEffectiveTaskDefinition(state, taskId);
  if (!def || def.ownerOnly || def.id === 'roupa') {
    return { ok: false, error: 'Roupa: só quem lava é o próprio dono.' };
  }
  if (isShieldActiveNow(state, targetId, dateStr, nowHHMM)) {
    return {
      ok: false,
      error: `${getParticipantName(state, targetId)} está com 🛡️ ESCUDO ativo e protegido de tudo hoje!`,
    };
  }
  const day = ensureDayRecord(state, dateStr);
  const task = day.tasks[taskId];
  if (!task || task.completedBy || task.canceledByFantasma || task.rescue) {
    return { ok: false, error: 'Tarefa indisponível para delegar.' };
  }
  if (getEffectiveAssignee(day, taskId) !== ownerId) {
    return { ok: false, error: 'Você só pode delegar tarefas suas.' };
  }

  task.delegatedBy = ownerId;
  task.delegatedTo = targetId;
  task.delegationStage = 'pending_target';
  task.delegationDeclinedBy = null;
  task.delegationDrawnTo = null;
  task.delegationReturnedToOwner = false;
  task.delegationReturnDeadlineHHMM = null;

  pushNotification(state, {
    dateStr,
    timestamp: formatShortTimestamp(dateStr, nowHHMM),
    actorId: ownerId,
    targetId,
    type: 'chefe',
    title: `${getParticipantName(state, ownerId)} delegou ${def.label} para ${getParticipantName(state, targetId)}`,
    message: `${getParticipantName(state, targetId)}: responda QUERO (+1 ⭐ para você e ${getParticipantName(state, ownerId)}) ou NÃO QUERO!`,
  });
  return { ok: true };
}

export function respondToDelegation(
  state: GameState,
  dateStr: string,
  taskId: TaskId,
  participantId: ParticipantId,
  accept: boolean,
  nowHHMM: string
): { ok: boolean; error?: string } {
  const day = ensureDayRecord(state, dateStr);
  const task = day.tasks[taskId];
  if (!task || task.completedBy || task.canceledByFantasma) {
    return { ok: false, error: 'Tarefa indisponível.' };
  }
  const def = getEffectiveTaskDefinition(state, taskId);
  const ownerId = task.delegatedBy;
  if (!ownerId) return { ok: false, error: 'Esta tarefa não foi delegada.' };

  if (task.delegationStage === 'pending_target') {
    if (task.delegatedTo !== participantId) {
      return { ok: false, error: 'Apenas o participante escolhido pode responder.' };
    }
    if (accept) {
      task.delegationStage = 'accepted_target';
      pushNotification(state, {
        dateStr,
        timestamp: formatShortTimestamp(dateStr, nowHHMM),
        actorId: participantId,
        targetId: ownerId,
        type: 'chefe',
        title: `${getParticipantName(state, participantId)} aceitou ${def.label}`,
        message: `Vai fazer! Se concluir: +1 ⭐ para ${getParticipantName(state, participantId)} e +1 ⭐ para ${getParticipantName(state, ownerId)}.`,
      });
    } else {
      task.delegationStage = 'awaiting_owner_draw';
      task.delegationDeclinedBy = participantId;
      task.delegatedTo = null;
      pushNotification(state, {
        dateStr,
        timestamp: formatShortTimestamp(dateStr, nowHHMM),
        actorId: participantId,
        targetId: ownerId,
        type: 'chefe',
        title: `${getParticipantName(state, participantId)} não quis fazer ${def.label}`,
        message: `${getParticipantName(state, ownerId)} deve sortear entre os outros 2 participantes!`,
      });
    }
    return { ok: true };
  }

  if (task.delegationStage === 'pending_draw') {
    if ((task.delegationDrawnTo || task.delegatedTo) !== participantId) {
      return { ok: false, error: 'Apenas o participante sorteado pode responder.' };
    }
    if (accept) {
      task.delegationStage = 'accepted_draw';
      pushNotification(state, {
        dateStr,
        timestamp: formatShortTimestamp(dateStr, nowHHMM),
        actorId: participantId,
        type: 'chefe',
        title: `${getParticipantName(state, participantId)} aceitou o sorteio de ${def.label}`,
        message: `Vai fazer e ganhar +2 ⭐ ao concluir!`,
      });
    } else {
      task.delegationStage = 'returned_to_owner';
      task.delegationReturnedToOwner = true;
      task.delegationReturnDeadlineHHMM = addMinutesHHMM(nowHHMM, 90);
      task.delegatedTo = null;
      task.delegationDrawnTo = null;
      pushNotification(state, {
        dateStr,
        timestamp: formatShortTimestamp(dateStr, nowHHMM),
        actorId: participantId,
        targetId: ownerId,
        type: 'chefe',
        title: `${getParticipantName(state, participantId)} não quis fazer ${def.label}`,
        message: `Tudo certo, nada acontece! Voltou para ${getParticipantName(state, ownerId)} (+2 ⭐ ao concluir).`,
      });
    }
    return { ok: true };
  }

  return { ok: false, error: 'Nenhuma resposta de delegação pendente para esta tarefa.' };
}

export function drawDelegationFallback(
  state: GameState,
  dateStr: string,
  taskId: TaskId,
  ownerId: ParticipantId,
  nowHHMM: string,
  forcedTarget?: ParticipantId
): { ok: boolean; error?: string; drawnParticipantId?: ParticipantId } {
  const day = ensureDayRecord(state, dateStr);
  const task = day.tasks[taskId];
  if (!task || task.completedBy || task.canceledByFantasma) {
    return { ok: false, error: 'Tarefa indisponível.' };
  }
  if (task.delegatedBy !== ownerId || task.delegationStage !== 'awaiting_owner_draw') {
    return { ok: false, error: 'Sorteio de delegação não disponível agora.' };
  }
  const candidates = ROTATION_ORDER.filter(
    (p) =>
      p !== ownerId &&
      p !== task.delegationDeclinedBy &&
      !isShieldActiveNow(state, p, dateStr, nowHHMM)
  );
  if (candidates.length === 0) {
    return {
      ok: false,
      error: 'Os participantes disponíveis estão com 🛡️ ESCUDO ativo e protegidos do sorteio!',
    };
  }
  if (forcedTarget && !candidates.includes(forcedTarget)) {
    return {
      ok: false,
      error: `${getParticipantName(state, forcedTarget)} está com 🛡️ ESCUDO ativo e protegido do sorteio!`,
    };
  }
  const drawn =
    forcedTarget && candidates.includes(forcedTarget)
      ? forcedTarget
      : candidates[Math.floor(Math.random() * candidates.length)];

  const def = getEffectiveTaskDefinition(state, taskId);
  task.delegationStage = 'pending_draw';
  task.delegationDrawnTo = drawn;
  task.delegatedTo = drawn;

  pushNotification(state, {
    dateStr,
    timestamp: formatShortTimestamp(dateStr, nowHHMM),
    actorId: ownerId,
    targetId: drawn,
    type: 'chefe',
    title: `🎲 ${getParticipantName(state, ownerId)} sorteou ${getParticipantName(state, drawn)} para ${def.label}`,
    message: `${getParticipantName(state, drawn)}: responda QUERO (+2 ⭐) ou NÃO QUERO!`,
  });

  return { ok: true, drawnParticipantId: drawn };
}

export function startTaskRescue(
  state: GameState,
  dateStr: string,
  taskId: TaskId,
  failedOwnerId: ParticipantId,
  nowHHMM: string,
  forcedDrawn?: ParticipantId
): { ok: boolean; error?: string; drawnParticipantId?: ParticipantId } {
  const def = getEffectiveTaskDefinition(state, taskId);
  if (!def || def.ownerOnly || def.id === 'roupa') {
    return { ok: false, error: 'Não vale para roupa.' };
  }
  const day = ensureDayRecord(state, dateStr);
  const task = day.tasks[taskId];
  if (!task || task.completedBy || task.canceledByFantasma || task.rescue) {
    return { ok: false, error: 'Tarefa indisponível para repasse automático.' };
  }

  const pool = ROTATION_ORDER.filter(
    (p) => p !== failedOwnerId && !isShieldActiveNow(state, p, dateStr, nowHHMM)
  );
  if (pool.length === 0) {
    pushNotification(state, {
      dateStr,
      timestamp: formatShortTimestamp(dateStr, nowHHMM),
      actorId: failedOwnerId,
      type: 'system',
      title: `🛡️ Repasse de ${def.label} bloqueado por Escudo`,
      message: 'Todos os outros participantes estão com 🛡️ ESCUDO ativo e protegidos dos sorteios.',
    });
    return { ok: false, error: 'Todos os outros participantes estão com 🛡️ ESCUDO ativo.' };
  }
  const drawn =
    forcedDrawn && pool.includes(forcedDrawn)
      ? forcedDrawn
      : pool[Math.floor(Math.random() * pool.length)];
  const remainingPool = pool.filter((p) => p !== drawn);

  task.rescue = {
    id: `rsc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    taskId,
    taskLabel: def.label,
    failedOwnerId,
    step: 1,
    candidatePool: remainingPool,
    currentAssigneeId: drawn,
    accepted: false,
    rewardStars: 2,
    declinedBy: [],
    assignedAtHHMM: nowHHMM,
    deadlineHHMM: addMinutesHHMM(nowHHMM, 90),
    failedStep3: false,
  };

  pushNotification(state, {
    dateStr,
    timestamp: formatShortTimestamp(dateStr, nowHHMM),
    actorId: failedOwnerId,
    targetId: drawn,
    type: 'rescue',
    title: `🎲 Sorteio automático: ${def.label} — ${getParticipantName(state, drawn)}`,
    message: `${getParticipantName(state, failedOwnerId)} não fez! ${getParticipantName(state, drawn)} foi sorteado(a): QUERO (+2 ⭐) ou NÃO QUERO?`,
  });

  return { ok: true, drawnParticipantId: drawn };
}

function advanceTaskRescue(
  state: GameState,
  dateStr: string,
  taskId: TaskId,
  nowHHMM: string,
  penalizePreviousIfAccepted: boolean,
  forcedNextDrawn?: ParticipantId
): { ok: boolean; error?: string } {
  const day = ensureDayRecord(state, dateStr);
  const task = day.tasks[taskId];
  const rescue = task?.rescue;
  if (!task || !rescue || task.completedBy) {
    return { ok: false, error: 'Repasse não ativo.' };
  }

  const previousId = rescue.currentAssigneeId;
  if (penalizePreviousIfAccepted && rescue.accepted && rescue.step < 3) {
    applyStarDelta(state, previousId, -1, dateStr, nowHHMM);
  }
  if (!rescue.declinedBy.includes(previousId)) {
    rescue.declinedBy.push(previousId);
  }

  const activePool = rescue.candidatePool.filter(
    (p) => !isShieldActiveNow(state, p, dateStr, nowHHMM)
  );

  if (rescue.step === 1 && activePool.length >= 2) {
    const next =
      forcedNextDrawn && activePool.includes(forcedNextDrawn)
        ? forcedNextDrawn
        : activePool[Math.floor(Math.random() * activePool.length)];
    rescue.candidatePool = activePool.filter((p) => p !== next);
    rescue.step = 2;
    rescue.currentAssigneeId = next;
    rescue.accepted = false;
    rescue.rewardStars = 3;
    rescue.assignedAtHHMM = nowHHMM;
    rescue.deadlineHHMM = addMinutesHHMM(nowHHMM, 90);

    pushNotification(state, {
      dateStr,
      timestamp: formatShortTimestamp(dateStr, nowHHMM),
      actorId: previousId,
      targetId: next,
      type: 'rescue',
      title: `🎲 2º Sorteio automático: ${rescue.taskLabel} — ${getParticipantName(state, next)}`,
      message: `${getParticipantName(state, previousId)} não quis (tudo normal). ${getParticipantName(state, next)} foi sorteado(a) entre os restantes: QUERO (+3 ⭐) ou NÃO QUERO?`,
    });
    return { ok: true };
  }

  if (activePool.length >= 1) {
    const lastOne = activePool[0];
    rescue.candidatePool = [];
    rescue.step = 3;
    rescue.currentAssigneeId = lastOne;
    rescue.accepted = true; // último participante disponível é obrigado a fazer!
    rescue.rewardStars = 6;
    rescue.assignedAtHHMM = nowHHMM;
    rescue.deadlineHHMM = addMinutesHHMM(nowHHMM, 90);

    pushNotification(state, {
      dateStr,
      timestamp: formatShortTimestamp(dateStr, nowHHMM),
      actorId: previousId,
      targetId: lastOne,
      type: 'rescue',
      title: `🚨 OBRIGATÓRIO: ${rescue.taskLabel} para ${getParticipantName(state, lastOne)} (+6 ⭐)`,
      message: `Os outros recusaram ou estão de Escudo! ${getParticipantName(state, lastOne)} é obrigado(a) a fazer (+6 ⭐ se fizer, punição de fim de semana se não fizer).`,
    });
    return { ok: true };
  }

  if (rescue.step < 3) {
    rescue.candidatePool = [];
    rescue.failedStep3 = true;
    pushNotification(state, {
      dateStr,
      timestamp: formatShortTimestamp(dateStr, nowHHMM),
      actorId: previousId,
      type: 'system',
      title: `🛡️ Repasse de ${rescue.taskLabel} encerrado por Escudo`,
      message: 'Os participantes restantes estão com 🛡️ ESCUDO ativo e protegidos dos sorteios.',
    });
    return { ok: true };
  }

  // Already at step 3 -> failed mandatory task
  rescue.failedStep3 = true;
  createWeekendPunishment(state, dateStr, previousId, taskId, nowHHMM);
  return { ok: true };
}

export function respondToTaskRescue(
  state: GameState,
  dateStr: string,
  taskId: TaskId,
  participantId: ParticipantId,
  accept: boolean,
  nowHHMM: string,
  forcedNextDrawn?: ParticipantId
): { ok: boolean; error?: string } {
  const day = ensureDayRecord(state, dateStr);
  const task = day.tasks[taskId];
  const rescue = task?.rescue;
  if (!task || !rescue || task.completedBy) {
    return { ok: false, error: 'Repasse não encontrado.' };
  }
  if (rescue.currentAssigneeId !== participantId) {
    return { ok: false, error: 'Apenas o participante sorteado pode responder.' };
  }
  if (rescue.step === 3) {
    return { ok: false, error: 'Você é o último participante restante e é obrigado(a) a fazer (+6 ⭐).' };
  }
  if (rescue.accepted) {
    return { ok: false, error: 'Você já aceitou este repasse.' };
  }

  if (accept) {
    rescue.accepted = true;
    rescue.deadlineHHMM = addMinutesHHMM(nowHHMM, 90);
    pushNotification(state, {
      dateStr,
      timestamp: formatShortTimestamp(dateStr, nowHHMM),
      actorId: participantId,
      type: 'rescue',
      title: `${getParticipantName(state, participantId)} aceitou ${rescue.taskLabel} (+${rescue.rewardStars} ⭐)`,
      message: `Conclua para ganhar +${rescue.rewardStars} ⭐!`,
    });
    return { ok: true };
  }

  return advanceTaskRescue(state, dateStr, taskId, nowHHMM, false, forcedNextDrawn);
}

export function failTaskRescueStep3(
  state: GameState,
  dateStr: string,
  taskId: TaskId,
  participantId: ParticipantId,
  nowHHMM: string
): { ok: boolean; error?: string } {
  const day = ensureDayRecord(state, dateStr);
  const task = day.tasks[taskId];
  const rescue = task?.rescue;
  if (!task || !rescue || task.completedBy || rescue.step !== 3 || rescue.failedStep3) {
    return { ok: false, error: 'Ação disponível apenas para obrigação final pendente.' };
  }
  if (rescue.currentAssigneeId !== participantId) {
    return { ok: false, error: 'Apenas o participante designado pode registrar.' };
  }
  rescue.failedStep3 = true;
  createWeekendPunishment(state, dateStr, participantId, taskId, nowHHMM);
  return { ok: true };
}

export function giveUpTask(
  state: GameState,
  dateStr: string,
  taskId: TaskId,
  participantId: ParticipantId,
  nowHHMM: string,
  forcedRescueDrawn?: ParticipantId
): { ok: boolean; error?: string } {
  const day = ensureDayRecord(state, dateStr);
  const task = day.tasks[taskId];
  if (!task || task.completedBy || task.canceledByFantasma) {
    return { ok: false, error: 'Tarefa indisponível.' };
  }
  const def = getEffectiveTaskDefinition(state, taskId);
  if (task.rescue) {
    if (task.rescue.currentAssigneeId !== participantId) {
      return { ok: false, error: 'Esta tarefa pertence a outro participante.' };
    }
    if (task.rescue.step === 3) {
      return failTaskRescueStep3(state, dateStr, taskId, participantId, nowHHMM);
    }
    if (task.rescue.accepted) {
      return advanceTaskRescue(state, dateStr, taskId, nowHHMM, true, forcedRescueDrawn);
    }
    return respondToTaskRescue(state, dateStr, taskId, participantId, false, nowHHMM, forcedRescueDrawn);
  }

  const effective = getTaskResponsibleParticipant(state, day, dateStr, taskId);
  if (effective !== participantId) {
    return { ok: false, error: 'Esta tarefa pertence a outro participante.' };
  }

  const isDelegatedPenalty =
    task.delegationStage === 'pending_target' ||
    task.delegationStage === 'accepted_target' ||
    task.delegationStage === 'accepted_draw';

  const hasValidJustification = hasTaskJustification(state, dateStr, participantId);

  if (hasValidJustification) {
    task.justified = true;
    task.expiredPenaltyApplied = false;
    pushNotification(state, {
      dateStr,
      timestamp: formatShortTimestamp(dateStr, nowHHMM),
      actorId: participantId,
      type: 'system',
      title: `${getParticipantName(state, participantId)} justificou ${def.label} (0 ⭐)`,
      message: `Não fez ${def.label} (justificado: não perde estrela e nem ganha 0 ⭐, sem punição semanal).`,
      starDelta: 0,
    });
  } else {
    task.expiredPenaltyApplied = true;
    const starPenalty = isDelegatedPenalty ? -1 : -3;
    applyStarDelta(state, participantId, starPenalty, dateStr, nowHHMM);
    pushNotification(state, {
      dateStr,
      timestamp: formatShortTimestamp(dateStr, nowHHMM),
      actorId: participantId,
      type: 'penalty',
      title: `${getParticipantName(state, participantId)} ${starPenalty} ⭐`,
      message: `Não vai fazer ${def.label} (${starPenalty} ⭐ e punição de fim de semana).`,
      starDelta: starPenalty,
    });
    createWeekendPunishment(state, dateStr, participantId, taskId, nowHHMM);
  }

  if (!def.ownerOnly && def.id !== 'roupa') {
    startTaskRescue(state, dateStr, taskId, participantId, nowHHMM, forcedRescueDrawn);
  }

  return { ok: true };
}

export function rollDice(
  state: GameState,
  dateStr: string,
  participantId: ParticipantId,
  round: 1 | 2,
  nowHHMM: string,
  forcedFace?: 1 | 2 | 3 | 4 | 5 | 6
): { ok: boolean; error?: string; face?: 1 | 2 | 3 | 4 | 5 | 6 } {
  const day = ensureDayRecord(state, dateStr);
  const key = round === 1 ? 'round1' : 'round2';
  if (isDiceDisabledForDate(state, dateStr)) {
    return {
      ok: false,
      error: 'O dado está desativado hoje. Volta a funcionar normalmente a partir de amanhã!',
    };
  }
  if (day.dice[participantId][key]) {
    return { ok: false, error: `Você já jogou o dado da Rodada ${round} hoje.` };
  }
  const winStatus = getDiceWindowStatus(state, dateStr, round, nowHHMM);
  if (!winStatus.allowed) {
    return { ok: false, error: winStatus.message };
  }

  const face = forcedFace || ((Math.floor(Math.random() * 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6);
  const pname = getParticipantName(state, participantId);
  const ts = formatShortTimestamp(dateStr, nowHHMM);
  const roundLabel = round === 1 ? 'manhã' : 'tarde';

  if (round === 1) {
    if (face === 1) {
      applyStarDelta(state, participantId, -1, dateStr, nowHHMM);
      day.dice[participantId].round1 = { round: 1, face, rolledAt: `${dateStr}T${nowHHMM}:00`, resolved: true, pendingAction: null };
      pushNotification(state, { dateStr, timestamp: ts, actorId: participantId, type: 'dice', title: `${pname} tirou 1 no dado (${roundLabel})`, message: 'Perdeu 1 estrela automaticamente.', starDelta: -1 });
    } else if (face === 2) {
      day.dice[participantId].round1 = { round: 1, face, rolledAt: `${dateStr}T${nowHHMM}:00`, resolved: true, pendingAction: null };
      pushNotification(state, { dateStr, timestamp: ts, actorId: participantId, type: 'dice', title: `${pname} tirou 2 no dado (${roundLabel})`, message: 'Nada acontece. Aguarde a próxima rodada.' });
    } else if (face === 3) {
      applyStarDelta(state, participantId, 1, dateStr, nowHHMM);
      day.dice[participantId].round1 = { round: 1, face, rolledAt: `${dateStr}T${nowHHMM}:00`, resolved: false, pendingAction: 'activate_shield' };
      pushNotification(state, { dateStr, timestamp: ts, actorId: participantId, type: 'dice', title: `${pname} tirou 3 no dado (${roundLabel})`, message: '+1 ⭐ e ganhou ESCUDO! Ative já (vale até 12:00).', starDelta: 1 });
    } else if (face === 4) {
      applyStarDelta(state, participantId, 1, dateStr, nowHHMM);
      day.dice[participantId].round1 = { round: 1, face, rolledAt: `${dateStr}T${nowHHMM}:00`, resolved: false, pendingAction: 'pick_fantasma_task', remainingUses: 1 };
      day.pendingFantasmaQueue[participantId].push({ round: 1, remaining: 1 });
      pushNotification(state, { dateStr, timestamp: ts, actorId: participantId, type: 'dice', title: `${pname} tirou 4 no dado (${roundLabel})`, message: '+1 ⭐ na hora e ganhou FANTASMA (1 sorteio).', starDelta: 1 });
    } else if (face === 5) {
      applyStarDelta(state, participantId, 1, dateStr, nowHHMM);
      day.dice[participantId].round1 = {
        round: 1,
        face,
        rolledAt: `${dateStr}T${nowHHMM}:00`,
        resolved: false,
        pendingAction: 'pick_chefe_target',
        remainingUses: 1,
      };
      pushNotification(state, {
        dateStr,
        timestamp: ts,
        actorId: participantId,
        type: 'dice',
        title: `${pname} tirou 5 no dado (${roundLabel})`,
        message: '+1 ⭐ automaticamente (mesmo sem usar) e ganhou um CHEFE: delegue uma tarefa sua.',
        starDelta: 1,
      });
    } else {
      day.dice[participantId].round1 = { round: 1, face, rolledAt: `${dateStr}T${nowHHMM}:00`, resolved: false, pendingAction: 'pick_coringa_power', remainingUses: 1 };
      pushNotification(state, { dateStr, timestamp: ts, actorId: participantId, type: 'dice', title: `${pname} tirou 6 no dado (${roundLabel})`, message: 'Ganhou um CORINGA: escolha Escudo, Fantasma ou Chefe.' });
    }
  } else {
    if (face === 1) {
      day.dice[participantId].round2 = { round: 2, face, rolledAt: `${dateStr}T${nowHHMM}:00`, resolved: false, pendingAction: 'pick_steal_target' };
      pushNotification(state, { dateStr, timestamp: ts, actorId: participantId, type: 'dice', title: `${pname} tirou 1 no dado (${roundLabel})`, message: 'Ganha 4 ⭐! Escolha o participante de quem quer tirar.' });
    } else if (face === 2) {
      applyStarDelta(state, participantId, -3, dateStr, nowHHMM);
      for (const other of getOtherParticipants(participantId)) {
        applyStarDelta(state, other, 1, dateStr, nowHHMM);
      }
      day.dice[participantId].round2 = { round: 2, face, rolledAt: `${dateStr}T${nowHHMM}:00`, resolved: true, pendingAction: null };
      pushNotification(state, { dateStr, timestamp: ts, actorId: participantId, type: 'dice', title: `${pname} tirou 2 no dado (${roundLabel})`, message: 'Perdeu 3 estrelas, 1 para cada participante.', starDelta: -3 });
    } else if (face === 3) {
      applyStarDelta(state, participantId, 1, dateStr, nowHHMM);
      day.dice[participantId].round2 = { round: 2, face, rolledAt: `${dateStr}T${nowHHMM}:00`, resolved: false, pendingAction: 'pick_fantasma_task', remainingUses: 2 };
      day.pendingFantasmaQueue[participantId].push({ round: 2, remaining: 2 });
      pushNotification(state, { dateStr, timestamp: ts, actorId: participantId, type: 'dice', title: `${pname} tirou 3 no dado (${roundLabel})`, message: '+1 ⭐ na hora e ganhou FANTASMA x2 (2 sorteios, um de cada vez).', starDelta: 1 });
    } else if (face === 4) {
      applyStarDelta(state, participantId, 2, dateStr, nowHHMM);
      state.participants[participantId].frozenDateStr = dateStr;
      day.dice[participantId].round2 = { round: 2, face, rolledAt: `${dateStr}T${nowHHMM}:00`, resolved: true, pendingAction: null };
      pushNotification(state, { dateStr, timestamp: ts, actorId: participantId, type: 'dice', title: `${pname} tirou 4 no dado (${roundLabel})`, message: '+2 ⭐ e estrelas congeladas pelo resto do dia.', starDelta: 2 });
    } else if (face === 5) {
      applyStarDelta(state, participantId, 2, dateStr, nowHHMM);
      day.dice[participantId].round2 = {
        round: 2,
        face,
        rolledAt: `${dateStr}T${nowHHMM}:00`,
        resolved: false,
        pendingAction: 'pick_chefe_target',
        remainingUses: 2,
        usedTargets: [],
      };
      pushNotification(state, {
        dateStr,
        timestamp: ts,
        actorId: participantId,
        type: 'dice',
        title: `${pname} tirou 5 no dado (${roundLabel})`,
        message: '+2 ⭐ automaticamente (mesmo sem usar) e ganhou CHEFE x2: delegue até duas tarefas suas.',
        starDelta: 2,
      });
    } else {
      day.dice[participantId].round2 = { round: 2, face, rolledAt: `${dateStr}T${nowHHMM}:00`, resolved: false, pendingAction: 'pick_coringa_power', remainingUses: 2 };
      pushNotification(state, { dateStr, timestamp: ts, actorId: participantId, type: 'dice', title: `${pname} tirou 6 no dado (${roundLabel})`, message: 'Ganhou um CORINGA (use em até dois participantes).' });
    }
  }

  return { ok: true, face };
}

export function resolveDiceAction(
  state: GameState,
  dateStr: string,
  participantId: ParticipantId,
  round: 1 | 2,
  nowHHMM: string,
  payload: {
    action: string;
    powerChoice?: 'escudo' | 'fantasma' | 'chefe';
    taskId?: TaskId;
    targetId?: ParticipantId;
  }
): { ok: boolean; error?: string } {
  const day = ensureDayRecord(state, dateStr);
  const diceState = day.dice[participantId][round === 1 ? 'round1' : 'round2'];
  if (!diceState || diceState.resolved) {
    return { ok: false, error: 'Ação do dado já resolvida.' };
  }

  const ts = formatShortTimestamp(dateStr, nowHHMM);
  const pname = getParticipantName(state, participantId);

  if (payload.action === 'activate_shield' || (diceState.pendingAction === 'pick_coringa_power' && payload.powerChoice === 'escudo')) {
    const until = round === 1 ? `${dateStr}T12:00:00` : `${dateStr}T23:59:00`;
    if (diceState.pendingAction === 'pick_coringa_power') {
      diceState.chosenPower = 'escudo';
    }
    state.participants[participantId].shieldActiveUntil = until;
    diceState.resolved = true;
    diceState.pendingAction = null;
    pushNotification(state, {
      dateStr,
      timestamp: ts,
      actorId: participantId,
      type: 'escudo',
      title: `${pname} ativou o ESCUDO`,
      message:
        round === 1
          ? 'Protegido de tudo (Chefe, roubo de estrelas, denúncias e sorteios) até as 12:00.'
          : 'Protegido de tudo (Chefe, roubo de estrelas, denúncias e sorteios) pelo resto do dia!',
    });
    return { ok: true };
  }

  if (diceState.pendingAction === 'pick_coringa_power' && (payload.powerChoice === 'fantasma' || payload.powerChoice === 'chefe')) {
    diceState.chosenPower = payload.powerChoice;
    if (payload.powerChoice === 'fantasma') {
      applyStarDelta(state, participantId, 1, dateStr, nowHHMM);
      const count = round === 1 ? 1 : 2;
      diceState.pendingAction = 'pick_fantasma_task';
      diceState.remainingUses = count;
      day.pendingFantasmaQueue[participantId].push({ round, remaining: count });
    } else {
      const autoStars = round === 1 ? 1 : 2;
      applyStarDelta(state, participantId, autoStars, dateStr, nowHHMM);
      diceState.pendingAction = 'pick_chefe_target';
      diceState.remainingUses = round === 1 ? 1 : 2;
      diceState.usedTargets = [];
      pushNotification(state, {
        dateStr,
        timestamp: ts,
        actorId: participantId,
        type: 'dice',
        title: `${pname} escolheu CHEFE no Coringa (Rodada ${round})`,
        message: `+${autoStars} ⭐ automaticamente (mesmo sem usar). Delegue sua tarefa ou acumule nos itens.`,
        starDelta: autoStars,
      });
    }
    return { ok: true };
  }

  if (diceState.pendingAction === 'pick_steal_target' && payload.targetId) {
    if (payload.targetId === participantId) return { ok: false, error: 'Escolha outro participante.' };
    if (isShieldActiveNow(state, payload.targetId, dateStr, nowHHMM)) {
      return {
        ok: false,
        error: `${getParticipantName(state, payload.targetId)} está com 🛡️ ESCUDO ativo e protegido contra roubo de estrelas!`,
      };
    }
    applyStarDelta(state, participantId, 4, dateStr, nowHHMM);
    applyStarDelta(state, payload.targetId, -4, dateStr, nowHHMM);
    diceState.usedTargets = [payload.targetId];
    diceState.resolved = true;
    diceState.pendingAction = null;
    pushNotification(state, {
      dateStr,
      timestamp: ts,
      actorId: participantId,
      targetId: payload.targetId,
      type: 'star',
      title: `${pname} +4 ⭐ (Dado tarde)`,
      message: `Tirou 4 ⭐ de ${getParticipantName(state, payload.targetId)}.`,
      starDelta: 4,
    });
    return { ok: true };
  }

  if (diceState.pendingAction === 'pick_fantasma_task' && payload.taskId) {
    const res = triggerFantasmaDraw(state, dateStr, participantId, payload.taskId, round, nowHHMM);
    if (!res.ok) return res;
    diceState.remainingUses = (diceState.remainingUses || 1) - 1;
    if (diceState.remainingUses <= 0) {
      diceState.resolved = true;
      diceState.pendingAction = null;
    }
    return { ok: true };
  }

  if (diceState.pendingAction === 'pick_chefe_target' && payload.taskId && payload.targetId) {
    const res = delegateTaskWithChefe(state, dateStr, participantId, payload.taskId, payload.targetId, nowHHMM);
    if (!res.ok) return res;
    diceState.usedTargets = [...(diceState.usedTargets || []), payload.targetId];
    diceState.remainingUses = (diceState.remainingUses || 1) - 1;
    if (diceState.remainingUses <= 0) {
      diceState.resolved = true;
      diceState.pendingAction = null;
    }
    return { ok: true };
  }

  if (payload.action === 'save_to_inventory') {
    const p = state.participants[participantId];
    let savedLabel = '';
    if (diceState.pendingAction === 'activate_shield') {
      p.inventory.escudo += 1;
      savedLabel = '🛡️ Escudo';
    } else if (diceState.pendingAction === 'pick_fantasma_task') {
      const qty = Math.max(1, diceState.remainingUses || 1);
      p.inventory.fantasma += qty;
      const idx = day.pendingFantasmaQueue[participantId].findIndex((q) => q.round === round);
      if (idx !== -1) day.pendingFantasmaQueue[participantId].splice(idx, 1);
      savedLabel = `👻 Fantasma${qty > 1 ? ` x${qty}` : ''}`;
    } else if (diceState.pendingAction === 'pick_chefe_target') {
      const qty = Math.max(1, diceState.remainingUses || 1);
      p.inventory.chefe += qty;
      savedLabel = `👑 Chefe${qty > 1 ? ` x${qty}` : ''}`;
    } else if (diceState.pendingAction === 'pick_coringa_power') {
      p.inventory.coringa += 1;
      savedLabel = '🃏 Coringa';
    } else {
      return { ok: false, error: 'Nenhum poder pendente para guardar.' };
    }

    diceState.resolved = true;
    diceState.pendingAction = null;
    diceState.remainingUses = 0;
    pushNotification(state, {
      dateStr,
      timestamp: ts,
      actorId: participantId,
      type: 'system',
      title: `${pname} acumulou ${savedLabel}`,
      message: 'Guardado em Seus Itens para usar quando quiser.',
    });
    return { ok: true };
  }

  if (payload.action === 'skip_remaining') {
    diceState.resolved = true;
    diceState.pendingAction = null;
    diceState.remainingUses = 0;
    return { ok: true };
  }

  return { ok: false, error: 'Ação inválida.' };
}

export function savePendingFantasmaToInventory(
  state: GameState,
  dateStr: string,
  participantId: ParticipantId,
  nowHHMM: string
): { ok: boolean; error?: string } {
  const day = ensureDayRecord(state, dateStr);
  const queue = day.pendingFantasmaQueue[participantId];
  if (!queue || queue.length === 0) {
    return { ok: false, error: 'Nenhum sorteio pendente para acumular.' };
  }

  const entry = queue.shift()!;
  const qty = Math.max(1, entry.remaining);
  state.participants[participantId].inventory.fantasma += qty;

  const roundKey = entry.round === 1 ? 'round1' : 'round2';
  const diceState = day.dice[participantId]?.[roundKey];
  if (diceState && diceState.pendingAction === 'pick_fantasma_task') {
    diceState.resolved = true;
    diceState.pendingAction = null;
    diceState.remainingUses = 0;
  }

  pushNotification(state, {
    dateStr,
    timestamp: formatShortTimestamp(dateStr, nowHHMM),
    actorId: participantId,
    type: 'system',
    title: `${getParticipantName(state, participantId)} acumulou 👻 Fantasma${qty > 1 ? ` x${qty}` : ''}`,
    message: 'Guardado em Seus Itens para usar quando quiser.',
  });

  return { ok: true };
}

export function updateParticipantDisplayName(
  state: GameState,
  participantId: ParticipantId,
  rawName: string,
  nowHHMM: string
): { ok: boolean; error?: string; displayName?: string } {
  const trimmed = rawName.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2 || trimmed.length > 24) {
    return { ok: false, error: 'O nome deve ter entre 2 e 24 caracteres.' };
  }

  const normalized = trimmed.toLowerCase();
  for (const otherId of ROTATION_ORDER) {
    if (otherId === participantId) continue;
    const otherBaseName = PARTICIPANT_PROFILES[otherId].name.toLowerCase();
    const otherCurrentName = getParticipantName(state, otherId).toLowerCase();
    if (normalized === otherBaseName || normalized === otherCurrentName) {
      return {
        ok: false,
        error: 'Este nome já pertence a outro participante da casa.',
      };
    }
  }

  const previousName = getParticipantName(state, participantId);
  const participant = state.participants[participantId];
  const baseName = PARTICIPANT_PROFILES[participantId].name;

  participant.displayName = trimmed === baseName ? undefined : trimmed;
  const effectiveName = getParticipantName(state, participantId);

  if (previousName !== effectiveName) {
    pushNotification(state, {
      dateStr: state.currentDateStr,
      timestamp: formatShortTimestamp(state.currentDateStr, nowHHMM),
      actorId: participantId,
      type: 'system',
      title: `${previousName} agora se chama ${effectiveName}`,
      message: 'Nome atualizado sem alterar senha, biometria, estrelas ou escala.',
    });
  }

  return { ok: true, displayName: effectiveName };
}

const ALLOWED_AVATAR_URL_RE =
  /^(data:image\/(jpeg|jpg|png|webp|gif|avif)(?:;charset=[^;]+)?;base64,[A-Za-z0-9+/=]+|\/assets\/[^\s]+|\/src\/assets\/[^\s]+|https:\/\/[^\s]+)$/i;

export function updateParticipantAvatar(
  state: GameState,
  participantId: ParticipantId,
  rawAvatarUrl: string | null | undefined,
  nowHHMM: string
): { ok: boolean; error?: string; avatarUrl?: string } {
  const participant = state.participants[participantId];
  if (!participant) {
    return { ok: false, error: 'Participante não encontrado.' };
  }

  const defaultAvatar = PARTICIPANT_PROFILES[participantId].avatarUrl;
  const trimmed = typeof rawAvatarUrl === 'string' ? rawAvatarUrl.trim() : '';
  const previousAvatar = getParticipantAvatar(state, participantId);
  const participantName = getParticipantName(state, participantId);

  if (!trimmed || trimmed === defaultAvatar) {
    participant.avatarUrl = undefined;
    if (previousAvatar !== defaultAvatar) {
      pushNotification(state, {
        dateStr: state.currentDateStr,
        timestamp: formatShortTimestamp(state.currentDateStr, nowHHMM),
        actorId: participantId,
        type: 'system',
        title: `${participantName} restaurou a foto padrão`,
        message: 'Foto de perfil restaurada sem alterar senha, biometria, estrelas ou escala.',
      });
    }
    return { ok: true, avatarUrl: defaultAvatar };
  }

  if (trimmed.length > 600_000) {
    return {
      ok: false,
      error: 'Imagem muito grande. Escolha uma foto menor.',
    };
  }

  if (!ALLOWED_AVATAR_URL_RE.test(trimmed)) {
    return {
      ok: false,
      error: 'Formato de imagem inválido. Use JPG, PNG ou WebP.',
    };
  }

  participant.avatarUrl = trimmed;
  const effectiveAvatar = getParticipantAvatar(state, participantId);

  if (previousAvatar !== effectiveAvatar) {
    pushNotification(state, {
      dateStr: state.currentDateStr,
      timestamp: formatShortTimestamp(state.currentDateStr, nowHHMM),
      actorId: participantId,
      type: 'system',
      title: `${participantName} atualizou a foto de perfil`,
      message: 'Foto de perfil atualizada sem alterar acesso, estrelas ou escala.',
    });
  }

  return { ok: true, avatarUrl: effectiveAvatar };
}

export function useInventoryPower(
  state: GameState,
  dateStr: string,
  participantId: ParticipantId,
  power: PowerType,
  nowHHMM: string,
  payload: {
    coringaChoice?: 'fantasma' | 'escudo' | 'chefe';
    taskId?: TaskId;
    targetId?: ParticipantId;
  }
): { ok: boolean; error?: string } {
  const p = state.participants[participantId];
  if (p.inventory[power] <= 0) {
    return { ok: false, error: 'Você não tem este item disponível.' };
  }

  const isBeforeNoon = nowHHMM < '12:00';
  if (p.milestonesUsedToday.dateStr !== dateStr) {
    p.milestonesUsedToday = { dateStr, beforeNoon: 0, afterNoon: 0 };
  }

  const effectivePower = power === 'coringa' ? payload.coringaChoice : power;
  if (!effectivePower) return { ok: false, error: 'Escolha qual poder do Coringa usar.' };

  if (effectivePower === 'escudo') {
    p.shieldActiveUntil = isBeforeNoon ? `${dateStr}T12:00:00` : `${dateStr}T23:59:00`;
    pushNotification(state, {
      dateStr,
      timestamp: formatShortTimestamp(dateStr, nowHHMM),
      actorId: participantId,
      type: 'escudo',
      title: `${getParticipantName(state, participantId)} ativou ESCUDO`,
      message: isBeforeNoon
        ? 'Protegido de tudo (Chefe, roubo de estrelas, denúncias e sorteios) até as 12:00.'
        : 'Protegido de tudo (Chefe, roubo de estrelas, denúncias e sorteios) pelo resto do dia.',
    });
  } else if (effectivePower === 'fantasma') {
    if (!payload.taskId) return { ok: false, error: 'Escolha a tarefa para cancelar.' };
    const round: 1 | 2 = isBeforeNoon ? 1 : 2;
    const res = triggerFantasmaDraw(state, dateStr, participantId, payload.taskId, round, nowHHMM);
    if (!res.ok) return res;
  } else if (effectivePower === 'chefe') {
    if (!payload.taskId || !payload.targetId) {
      return { ok: false, error: 'Escolha a tarefa sua e o participante para delegar.' };
    }
    const res = delegateTaskWithChefe(state, dateStr, participantId, payload.taskId, payload.targetId, nowHHMM);
    if (!res.ok) return res;
  }

  p.inventory[power] -= 1;
  if (isBeforeNoon) {
    p.milestonesUsedToday.beforeNoon += 1;
  } else {
    p.milestonesUsedToday.afterNoon += 1;
  }
  return { ok: true };
}

export function submitJustification(
  state: GameState,
  dateStr: string,
  participantId: ParticipantId,
  reason: 'doente' | 'saiu' | 'outro',
  details: string,
  nowHHMM: string,
  options?: { routineIds?: RoutineId[] }
): { ok: boolean } {
  const validRoutineIds = Array.isArray(options?.routineIds)
    ? options!.routineIds.filter((rid) => ROUTINE_DEFINITIONS.some((r) => r.id === rid))
    : [];

  state.justifications.unshift({
    id: `just-${Date.now()}`,
    dateStr,
    participantId,
    reason,
    details: details.trim(),
    routineIds: validRoutineIds.length > 0 ? validRoutineIds : undefined,
    createdAt: `${dateStr}T${nowHHMM}:00`,
  });

  const day = ensureDayRecord(state, dateStr);
  const targetRoutines =
    validRoutineIds.length > 0
      ? validRoutineIds
      : (ROUTINE_DEFINITIONS.map((r) => r.id) as RoutineId[]);

  let refundedStars = 0;
  for (const rid of targetRoutines) {
    const entry = day.routines[participantId]?.[rid];
    if (!entry || entry.completed) continue;
    if (entry.expiredPenaltyApplied) {
      entry.expiredPenaltyApplied = false;
      entry.justified = true;
      applyStarDelta(state, participantId, 1, dateStr, nowHHMM);
      refundedStars += 1;
    } else if (validRoutineIds.length > 0) {
      entry.justified = true;
    }
  }

  if (validRoutineIds.length === 0 && (reason === 'doente' || reason === 'saiu')) {
    for (const td of TASK_DEFINITIONS) {
      const st = day.tasks[td.id];
      if (!st || st.completedBy || st.canceledByFantasma || !st.expiredPenaltyApplied || st.justified) {
        continue;
      }
      const isDelegatedPenalty =
        st.delegationStage === 'pending_target' ||
        st.delegationStage === 'accepted_target' ||
        st.delegationStage === 'accepted_draw';
      const penalizedOwner: ParticipantId | null = st.rescue
        ? st.rescue.failedOwnerId
        : isDelegatedPenalty
        ? st.delegationDrawnTo || st.delegatedTo || st.assignedTo
        : st.delegatedBy || st.assignedTo;
      if (penalizedOwner === participantId) {
        const refund = isDelegatedPenalty ? 1 : 3;
        st.expiredPenaltyApplied = false;
        st.justified = true;
        applyStarDelta(state, participantId, refund, dateStr, nowHHMM);
        refundedStars += refund;
        state.weekendPunishments = (state.weekendPunishments || []).filter(
          (wp) =>
            !(
              wp.dateStr === dateStr &&
              wp.punishedId === participantId &&
              wp.taskId === td.id &&
              !wp.completed
            )
        );
      }
    }
  }

  const reasonLabel =
    reason === 'doente' ? '🤒 Tá doente' : reason === 'saiu' ? '🚪 Teve que sair' : '📝 Outro';
  const routineSuffix =
    validRoutineIds.length > 0
      ? ` · Rotina(s): ${validRoutineIds
          .map((rid) => getEffectiveRoutineDefinition(state, rid).label)
          .join(', ')} (0 ⭐: não perde e não ganha)`
      : reason === 'doente' || reason === 'saiu'
      ? ' · Rotinas e tarefas não feitas hoje ficam em 0 ⭐ (não perde e não ganha)'
      : ' · Rotinas não feitas hoje ficam em 0 ⭐ (não perde e não ganha)';
  pushNotification(state, {
    dateStr,
    timestamp: formatShortTimestamp(dateStr, nowHHMM),
    actorId: participantId,
    type: 'system',
    title: `${getParticipantName(state, participantId)} enviou justificativa`,
    message: `${reasonLabel}${details.trim() ? ` — ${details.trim()}` : ''}${routineSuffix}`,
    starDelta: refundedStars > 0 ? refundedStars : undefined,
  });
  return { ok: true };
}

export function saveDiceJustification(
  state: GameState,
  dateStr: string,
  participantId: ParticipantId,
  text: string,
  nowHHMM: string
): { ok: boolean; error?: string } {
  const day = ensureDayRecord(state, dateStr);
  if (!day.diceJustifications) {
    day.diceJustifications = {};
  }

  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (cleaned.length > 300) {
    return { ok: false, error: 'A justificativa deve ter no máximo 300 caracteres.' };
  }

  if (!cleaned) {
    if (day.diceJustifications[participantId]) {
      delete day.diceJustifications[participantId];
      return { ok: true };
    }
    return { ok: false, error: 'Digite o motivo para justificar o dado.' };
  }

  day.diceJustifications[participantId] = {
    text: cleaned,
    updatedAt: `${dateStr}T${nowHHMM}:00`,
  };

  pushNotification(state, {
    dateStr,
    timestamp: formatShortTimestamp(dateStr, nowHHMM),
    actorId: participantId,
    type: 'dice',
    title: `${getParticipantName(state, participantId)} justificou o dado de hoje`,
    message: `${cleaned} (0 ⭐ · não perde e não ganha estrela)`,
  });

  return { ok: true };
}

export function createWeekendPunishment(
  state: GameState,
  dateStr: string,
  punishedId: ParticipantId,
  taskId: TaskId,
  nowHHMM: string
): void {
  const coveringForId = getNextInRotation(punishedId);
  const def = getEffectiveTaskDefinition(state, taskId);
  const exists = state.weekendPunishments.some(
    (wp) => wp.dateStr === dateStr && wp.punishedId === punishedId && wp.taskId === taskId
  );
  if (exists) return;

  state.weekendPunishments.unshift({
    id: `pun-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    dateStr,
    punishedId,
    coveringForId,
    deciderId: coveringForId, // next participant / adversary decides SÁBADO or DOMINGO
    taskId,
    taskLabel: def.label,
    chosenDay: null,
    completed: false,
    createdAt: `${dateStr}T${nowHHMM}:00`,
  });

  pushNotification(state, {
    dateStr,
    timestamp: formatShortTimestamp(dateStr, nowHHMM),
    actorId: punishedId,
    targetId: coveringForId,
    type: 'punishment',
    title: `Punição semanal para ${getParticipantName(state, punishedId)}`,
    message: `Fará as tarefas de ${getParticipantName(state, coveringForId)} no fim de semana (aguardando escolha SÁBADO/DOMINGO).`,
  });
}

export function submitDenunciation(
  state: GameState,
  dateStr: string,
  reporterId: ParticipantId,
  targetId: ParticipantId,
  category: 'tarefa' | 'rotina',
  itemId: string,
  details: string,
  nowHHMM: string
): { ok: boolean; error?: string } {
  if (reporterId === targetId) return { ok: false, error: 'Não pode denunciar a si mesmo.' };
  if (isShieldActiveNow(state, targetId, dateStr, nowHHMM)) {
    return {
      ok: false,
      error: `${getParticipantName(state, targetId)} está com 🛡️ ESCUDO ativo e protegido contra denúncias!`,
    };
  }
  const day = ensureDayRecord(state, dateStr);
  if (day.denunciationsUsed[reporterId]) {
    return { ok: false, error: 'Limite de 1 denúncia por participante por dia atingido.' };
  }

  let itemLabel = itemId;
  if (category === 'rotina') {
    const r = ROUTINE_DEFINITIONS.find((x) => x.id === itemId);
    if (!r) return { ok: false, error: 'Rotina inválida.' };
    itemLabel = getEffectiveRoutineDefinition(state, r.id).label;
  } else {
    const t = TASK_DEFINITIONS.find((x) => x.id === itemId);
    if (!t) return { ok: false, error: 'Tarefa inválida.' };
    itemLabel = getEffectiveTaskDefinition(state, t.id).label;
  }

  day.denunciationsUsed[reporterId] = true;
  applyStarDelta(state, reporterId, 1, dateStr, nowHHMM);
  applyStarDelta(state, targetId, -1, dateStr, nowHHMM);

  state.denunciations.unshift({
    id: `den-${Date.now()}`,
    dateStr,
    reporterId,
    targetId,
    category,
    itemId,
    itemLabel,
    details: details.trim(),
    createdAt: `${dateStr}T${nowHHMM}:00`,
  });

  pushNotification(state, {
    dateStr,
    timestamp: formatShortTimestamp(dateStr, nowHHMM),
    actorId: reporterId,
    targetId,
    type: 'denuncia',
    title: `${getParticipantName(state, reporterId)} denunciou ${getParticipantName(state, targetId)}`,
    message: `${itemLabel} (+1 ⭐ para ${getParticipantName(state, reporterId)}, -1 ⭐ para ${getParticipantName(state, targetId)})${details.trim() ? ` · "${details.trim()}"` : ''}`,
    starDelta: 1,
  });

  if (category === 'tarefa') {
    createWeekendPunishment(state, dateStr, targetId, itemId as TaskId, nowHHMM);
  }

  return { ok: true };
}

export function choosePunishmentDay(
  state: GameState,
  punishmentId: string,
  deciderId: ParticipantId,
  chosenDay: 'sabado' | 'domingo',
  nowHHMM: string
): { ok: boolean; error?: string } {
  const pun = state.weekendPunishments.find((p) => p.id === punishmentId);
  if (!pun) return { ok: false, error: 'Punição não encontrada.' };
  if (pun.punishedId === deciderId) {
    return { ok: false, error: 'O participante punido não pode escolher o dia.' };
  }
  pun.chosenDay = chosenDay;
  pun.deciderId = deciderId;

  const dayLabel = chosenDay === 'sabado' ? 'SÁBADO' : 'DOMINGO';
  pushNotification(state, {
    dateStr: state.currentDateStr,
    timestamp: formatShortTimestamp(state.currentDateStr, nowHHMM),
    actorId: deciderId,
    targetId: pun.punishedId,
    type: 'punishment',
    title: `${getParticipantName(state, deciderId)} definiu punição no ${dayLabel}`,
    message: `${getParticipantName(state, pun.punishedId)} fará as tarefas de ${getParticipantName(state, pun.coveringForId)} no ${dayLabel}.`,
  });
  return { ok: true };
}

export function completeWeekendPunishment(
  state: GameState,
  punishmentId: string,
  participantId: ParticipantId,
  nowHHMM: string
): { ok: boolean; error?: string } {
  const pun = state.weekendPunishments.find((p) => p.id === punishmentId);
  if (!pun) return { ok: false, error: 'Punição não encontrada.' };
  if (pun.punishedId !== participantId) {
    return { ok: false, error: 'Apenas o participante punido pode concluir.' };
  }
  pun.completed = true;
  pushNotification(state, {
    dateStr: state.currentDateStr,
    timestamp: formatShortTimestamp(state.currentDateStr, nowHHMM),
    actorId: participantId,
    type: 'punishment',
    title: `${getParticipantName(state, participantId)} cumpriu punição`,
    message: `Concluiu a tarefa ${pun.taskLabel} do fim de semana.`,
  });
  return { ok: true };
}

export function processExpiredDeadlines(
  state: GameState,
  dateStr: string,
  nowHHMM: string
): boolean {
  const day = ensureDayRecord(state, dateStr);
  let changed = false;

  for (const pid of ROTATION_ORDER) {
    for (const baseRoutine of ROUTINE_DEFINITIONS) {
      const r = getEffectiveRoutineDefinition(state, baseRoutine.id);
      const entry = day.routines[pid][r.id];
      if (!entry || entry.completed || entry.expiredPenaltyApplied || entry.justified) continue;
      const unlock = isRoutineUnlocked(day, r.id, state);
      if (!unlock.unlocked) continue;
      const limit = getDeadlineForItem(dateStr, r.weekdayLimit, r.weekendLimit);
      if (isDeadlineBypassedByPrerequisite(state, day, dateStr, r.requiresTaskDone, limit)) continue;
      if (isTimePastDeadline(nowHHMM, limit)) {
        if (hasRoutineJustification(state, dateStr, pid, r.id)) {
          entry.justified = true;
          entry.expiredPenaltyApplied = false;
          pushNotification(state, {
            dateStr,
            timestamp: formatShortTimestamp(dateStr, nowHHMM),
            actorId: pid,
            type: 'system',
            title: `${getParticipantName(state, pid)} justificou rotina (${r.label})`,
            message: 'Justificada: não perde -1 ⭐ e não ganha ⭐ (0 ⭐).',
            starDelta: 0,
          });
          changed = true;
          continue;
        }
        entry.expiredPenaltyApplied = true;
        applyStarDelta(state, pid, -1, dateStr, nowHHMM);
        pushNotification(state, {
          dateStr,
          timestamp: formatShortTimestamp(dateStr, nowHHMM),
          actorId: pid,
          type: 'penalty',
          title: `${getParticipantName(state, pid)} -1 ⭐`,
          message: `Rotina "${r.label}" fora do prazo.`,
          starDelta: -1,
        });
        changed = true;
      }
    }
  }

  for (const baseTask of TASK_DEFINITIONS) {
    const t = getEffectiveTaskDefinition(state, baseTask.id);
    const task = day.tasks[t.id];
    if (!task || task.completedBy || task.canceledByFantasma) continue;

    // 1. Progress active Rescue Cascade steps if their grace window expired
    if (task.rescue) {
      if (
        !task.rescue.failedStep3 &&
        task.rescue.deadlineHHMM &&
        isTimePastDeadline(nowHHMM, task.rescue.deadlineHHMM)
      ) {
        if (task.rescue.step === 3) {
          task.rescue.failedStep3 = true;
          createWeekendPunishment(state, dateStr, task.rescue.currentAssigneeId, t.id, nowHHMM);
        } else {
          advanceTaskRescue(state, dateStr, t.id, nowHHMM, Boolean(task.rescue.accepted));
        }
        changed = true;
      }
      continue;
    }

    if (task.expiredPenaltyApplied || task.justified) continue;

    // Wait for prerequisite task before penalizing dependent tasks like Fogão
    const unlock = isTaskUnlocked(day, t.id, state);
    if (!unlock.unlocked) continue;

    // Untimed tasks OR tasks unlocked with bypassed prerequisite auto-expire only at 23:30 if still undone
    const itemLimit = getDeadlineForItem(dateStr, t.weekdayLimit, t.weekendLimit);
    const bypassPrereq = isDeadlineBypassedByPrerequisite(
      state,
      day,
      dateStr,
      t.requiresTaskDone,
      itemLimit
    );
    const baseLimit = (bypassPrereq ? null : itemLimit) || '23:30';

    // Handle awaiting owner draw automatically if past deadline
    if (task.delegationStage === 'awaiting_owner_draw' && task.delegatedBy) {
      if (isTimePastDeadline(nowHHMM, baseLimit)) {
        const drawRes = drawDelegationFallback(state, dateStr, t.id, task.delegatedBy, nowHHMM);
        if (!drawRes.ok) {
          task.delegationStage = 'returned_to_owner';
          task.delegationReturnedToOwner = true;
          task.delegationReturnDeadlineHHMM = addMinutesHHMM(nowHHMM, 90);
          task.delegatedTo = null;
          task.delegationDrawnTo = null;
        }
        changed = true;
      }
      continue;
    }

    // Handle returned_to_owner with its own grace deadline
    if (task.delegationStage === 'returned_to_owner' || task.delegationReturnedToOwner) {
      const retLimit = task.delegationReturnDeadlineHHMM || baseLimit;
      if (isTimePastDeadline(nowHHMM, retLimit)) {
        const owner = task.delegatedBy || task.assignedTo;
        if (!owner) continue;
        const hasValidJustification = hasTaskJustification(state, dateStr, owner);
        if (hasValidJustification) {
          task.justified = true;
          task.expiredPenaltyApplied = false;
          pushNotification(state, {
            dateStr,
            timestamp: formatShortTimestamp(dateStr, nowHHMM),
            actorId: owner,
            type: 'system',
            title: `${getParticipantName(state, owner)} justificou ${t.label} (0 ⭐)`,
            message: `Não fez ${t.label} (justificado: não perde estrela e nem ganha 0 ⭐, sem punição semanal).`,
            starDelta: 0,
          });
        } else {
          task.expiredPenaltyApplied = true;
          applyStarDelta(state, owner, -3, dateStr, nowHHMM);
          pushNotification(state, {
            dateStr,
            timestamp: formatShortTimestamp(dateStr, nowHHMM),
            actorId: owner,
            type: 'penalty',
            title: `${getParticipantName(state, owner)} -3 ⭐`,
            message: `Deixou de fazer ${t.label} no prazo (-3 ⭐ e punição de fim de semana).`,
            starDelta: -3,
          });
          createWeekendPunishment(state, dateStr, owner, t.id, nowHHMM);
        }
        if (!t.ownerOnly && t.id !== 'roupa') {
          startTaskRescue(state, dateStr, t.id, owner, nowHHMM);
        }
        changed = true;
      }
      continue;
    }

    if (!isTimePastDeadline(nowHHMM, baseLimit)) continue;

    // Delegated task expired: B didn't respond or didn't do -> -1 ⭐ & weekend punishment + start rescue
    if (
      task.delegationStage === 'pending_target' ||
      task.delegationStage === 'accepted_target' ||
      task.delegationStage === 'accepted_draw'
    ) {
      const targetId = getEffectiveAssignee(day, t.id);
      if (!targetId) continue;
      const hasValidJustification = hasTaskJustification(state, dateStr, targetId);
      if (hasValidJustification) {
        task.justified = true;
        task.expiredPenaltyApplied = false;
        pushNotification(state, {
          dateStr,
          timestamp: formatShortTimestamp(dateStr, nowHHMM),
          actorId: targetId,
          type: 'system',
          title: `${getParticipantName(state, targetId)} justificou ${t.label} (0 ⭐)`,
          message: `Não fez tarefa delegada ${t.label} (justificado: não perde estrela e nem ganha 0 ⭐, sem punição semanal).`,
          starDelta: 0,
        });
      } else {
        task.expiredPenaltyApplied = true;
        applyStarDelta(state, targetId, -1, dateStr, nowHHMM);
        pushNotification(state, {
          dateStr,
          timestamp: formatShortTimestamp(dateStr, nowHHMM),
          actorId: targetId,
          type: 'penalty',
          title: `${getParticipantName(state, targetId)} -1 ⭐`,
          message: `Não fez tarefa delegada ${t.label} (-1 ⭐ e punição de fim de semana).`,
          starDelta: -1,
        });
        createWeekendPunishment(state, dateStr, targetId, t.id, nowHHMM);
      }
      if (!t.ownerOnly && t.id !== 'roupa') {
        startTaskRescue(state, dateStr, t.id, targetId, nowHHMM);
      }
      changed = true;
      continue;
    }

    if (task.delegationStage === 'pending_draw' && task.delegatedBy) {
      // Drawn participant didn't answer before deadline -> returns to owner (no penalty for C)
      task.delegationStage = 'returned_to_owner';
      task.delegationReturnedToOwner = true;
      task.delegationReturnDeadlineHHMM = addMinutesHHMM(nowHHMM, 90);
      task.delegatedTo = null;
      task.delegationDrawnTo = null;
      pushNotification(state, {
        dateStr,
        timestamp: formatShortTimestamp(dateStr, nowHHMM),
        actorId: task.delegatedBy,
        type: 'chefe',
        title: `${t.label} voltou para ${getParticipantName(state, task.delegatedBy)}`,
        message: `Sorteado não respondeu no prazo. Voltou para a dona do card (+2 ⭐ ao concluir)!`,
      });
      changed = true;
      continue;
    }

    const owner = getTaskResponsibleParticipant(state, day, dateStr, t.id);
    if (!owner) continue;

    const hasValidJustification = hasTaskJustification(state, dateStr, owner);
    if (hasValidJustification) {
      task.justified = true;
      task.expiredPenaltyApplied = false;
      pushNotification(state, {
        dateStr,
        timestamp: formatShortTimestamp(dateStr, nowHHMM),
        actorId: owner,
        type: 'system',
        title: `${getParticipantName(state, owner)} justificou ${t.label} (0 ⭐)`,
        message: `Não fez ${t.label} (justificado: não perde estrela e nem ganha 0 ⭐, sem punição semanal).`,
        starDelta: 0,
      });
    } else {
      task.expiredPenaltyApplied = true;
      applyStarDelta(state, owner, -3, dateStr, nowHHMM);
      pushNotification(state, {
        dateStr,
        timestamp: formatShortTimestamp(dateStr, nowHHMM),
        actorId: owner,
        type: 'penalty',
        title: `${getParticipantName(state, owner)} -3 ⭐`,
        message: `Deixou de fazer ${t.label} no prazo (-3 ⭐ e punição de fim de semana).`,
        starDelta: -3,
      });
      createWeekendPunishment(state, dateStr, owner, t.id, nowHHMM);
    }
    if (!t.ownerOnly && t.id !== 'roupa') {
      startTaskRescue(state, dateStr, t.id, owner, nowHHMM);
    }
    changed = true;
  }

  return changed;
}

export interface RoundOutcomeSummary {
  round: 1 | 2;
  face: 1 | 2 | 3 | 4 | 5 | 6;
  powerTitle: string;
  usageText: string;
  finalOutcome: string;
  starsDelta: number;
}

export interface DayParticipantSummary {
  pid: ParticipantId;
  dateStr: string;
  completedRoutinesCount: number;
  missedRoutines: RoutineDefinition[];
  missedRoutineDetails: Array<{
    def: RoutineDefinition;
    penaltyStars: number;
    justified?: boolean;
  }>;
  completedTasks: Array<{
    def: TaskDefinition;
    starsEarned: number;
    viaFantasma: boolean;
    viaDelegation: boolean;
    viaRescue: boolean;
  }>;
  missedAssignedTasks: TaskDefinition[];
  missedTaskDetails: Array<{
    def: TaskDefinition;
    penaltyStars: number;
    justified?: boolean;
  }>;
  fantasmaCanceledTasks: Array<{
    def: TaskDefinition;
    completedBy: ParticipantId | null;
  }>;
  delegatedOutTasks: Array<{
    def: TaskDefinition;
    to: ParticipantId | null;
    completed: boolean;
  }>;
  r1?: DiceRollState;
  r2?: DiceRollState;
  diceJustification?: DiceJustificationEntry | null;
  round1Summary: RoundOutcomeSummary | null;
  round2Summary: RoundOutcomeSummary | null;
  routineEarnedStars: number;
  routinePenaltyStars: number;
  routineStars: number;
  taskEarnedStars: number;
  taskPenaltyStars: number;
  taskStars: number;
  dicePowerStars: number;
  denunciationStars: number;
  netStars: number;
}

function buildRoundOutcomeSummary(
  state: GameState,
  day: DayRecord,
  targetDateStr: string,
  pid: ParticipantId,
  round: 1 | 2,
  roll?: DiceRollState
): RoundOutcomeSummary | null {
  if (!roll) return null;

  const pname = getParticipantName(state, pid);
  const face = roll.face;
  const r1 = day.dice[pid]?.round1;
  const r2 = day.dice[pid]?.round2;
  const dayNotifs = (state.notifications || []).filter(
    (n) => n.dateStr === targetDateStr && n.actorId === pid
  );
  const drawsInRound = state.fantasmaDraws.filter(
    (d) => d.dateStr === targetDateStr && d.ownerId === pid && d.round === round
  );
  const allDelegated = TASK_DEFINITIONS.filter((td) => day.tasks[td.id]?.delegatedBy === pid);

  const isFantasmaRound =
    (round === 1 && face === 4) ||
    (round === 2 && face === 3) ||
    (face === 6 && roll.chosenPower === 'fantasma');
  const isChefeRound =
    face === 5 || (face === 6 && roll.chosenPower === 'chefe');

  if (round === 1 && face === 1) {
    return {
      round,
      face,
      powerTitle: 'Face 1 (-1 ⭐)',
      usageText: 'Penalidade automática da rodada da manhã.',
      finalOutcome: '-1 ⭐ para ' + pname,
      starsDelta: -1,
    };
  }

  if (round === 1 && face === 2) {
    return {
      round,
      face,
      powerTitle: 'Face 2 (Nada acontece)',
      usageText: 'Nenhum poder sorteado nesta rodada.',
      finalOutcome: '0 ⭐ (sem efeito)',
      starsDelta: 0,
    };
  }

  if (
    (round === 1 && face === 3) ||
    (face === 6 && roll.chosenPower === 'escudo')
  ) {
    const powerTitle =
      face === 6 ? 'Face 6 (🃏 Coringa → 🛡️ Escudo)' : 'Face 3 (🛡️ Escudo)';
    const autoStars = round === 1 && face === 3 ? 1 : 0;
    const savedShield =
      roll.resolved &&
      (dayNotifs.some((n) => n.type === 'system' && n.title.includes('Escudo')) ||
        (!dayNotifs.some((n) => n.type === 'escudo') &&
          state.participants[pid].inventory.escudo > 0));
    if (!roll.resolved) {
      return {
        round,
        face,
        powerTitle,
        usageText: 'Aguardando ativar o Escudo ou guardar nos itens.',
        finalOutcome: `${autoStars > 0 ? `+${autoStars} ⭐ automático · ` : ''}decisão pendente`,
        starsDelta: autoStars,
      };
    }
    if (savedShield) {
      return {
        round,
        face,
        powerTitle,
        usageText: 'Guardou 1 🛡️ Escudo nos itens.',
        finalOutcome: `${autoStars > 0 ? `+${autoStars} ⭐ automático · ` : ''}1 🛡️ Escudo acumulado para usar quando quiser`,
        starsDelta: autoStars,
      };
    }
    return {
      round,
      face,
      powerTitle,
      usageText:
        round === 1
          ? 'Ativou 🛡️ Escudo de proteção até as 12:00.'
          : 'Ativou 🛡️ Escudo de proteção até o fim do dia.',
      finalOutcome: `${autoStars > 0 ? `+${autoStars} ⭐ automático · ` : ''}protegido contra Chefe ${round === 1 ? 'até 12:00' : 'pelo resto do dia'}`,
      starsDelta: autoStars,
    };
  }

  if (round === 2 && face === 1) {
    const stolenFrom = roll.usedTargets?.[0];
    if (stolenFrom) {
      const targetName = getParticipantName(state, stolenFrom);
      return {
        round,
        face,
        powerTitle: 'Face 1 (Rouba 4 ⭐)',
        usageText: `Escolheu tirar 4 ⭐ de ${targetName}.`,
        finalOutcome: `+4 ⭐ para ${pname} e -4 ⭐ para ${targetName}`,
        starsDelta: 4,
      };
    }
    return {
      round,
      face,
      powerTitle: 'Face 1 (Rouba 4 ⭐)',
      usageText: 'Aguardando escolher de qual participante tirar 4 ⭐.',
      finalOutcome: 'Escolha pendente',
      starsDelta: 0,
    };
  }

  if (round === 2 && face === 2) {
    const otherNames = getOtherParticipants(pid)
      .map((id) => getParticipantName(state, id))
      .join(', ');
    return {
      round,
      face,
      powerTitle: 'Face 2 (Perde 3 ⭐)',
      usageText: `Distribuiu 1 ⭐ para cada participante (${otherNames}).`,
      finalOutcome: `-3 ⭐ para ${pname} (+1 ⭐ para cada adversário)`,
      starsDelta: -3,
    };
  }

  if (round === 2 && face === 4) {
    return {
      round,
      face,
      powerTitle: 'Face 4 (❄️ Congela estrelas)',
      usageText: 'Estrelas congeladas automaticamente pelo resto do dia.',
      finalOutcome: `+2 ⭐ na hora e sem novas estrelas de rotinas/tarefas hoje`,
      starsDelta: 2,
    };
  }

  if (isFantasmaRound) {
    const maxUses = round === 1 ? 1 : 2;
    const powerTitle =
      face === 6
        ? round === 2
          ? 'Face 6 (🃏 Coringa → 👻 Fantasma)'
          : 'Face 6 (🃏 Coringa → 👻 Fantasma)'
        : round === 2
        ? 'Face 3 (👻 Fantasma x2)'
        : 'Face 4 (👻 Fantasma)';

    const drawLines = drawsInRound.map((d) => {
      const targetName = getParticipantName(state, d.drawnParticipantId);
      if (d.status === 'completed') {
        return `${d.taskLabel} → sorteou ${targetName} (${targetName} fez e ganhou +3 ⭐)`;
      }
      if (d.status === 'accepted') {
        return `${d.taskLabel} → sorteou ${targetName} (${targetName} aceitou fazer por +3 ⭐)`;
      }
      if (d.status === 'declined') {
        return `${d.taskLabel} → sorteou ${targetName} (recusou; tarefa voltou)`;
      }
      return `${d.taskLabel} → sorteou ${targetName} (aguardando resposta)`;
    });

    const pendingInQueue =
      day.pendingFantasmaQueue[pid]?.find((q) => q.round === round)?.remaining || 0;
    const unusedCount = Math.max(0, maxUses - drawsInRound.length);
    const savedNotif = dayNotifs.some(
      (n) =>
        (n.type === 'system' || n.type === 'fantasma') &&
        (n.title.includes('Fantasma') || n.message.includes('Seus Itens')) &&
        (n.title.includes('acumulou') || n.message.includes('acumulado'))
    );
    const hasSavedFantasma =
      unusedCount > 0 &&
      pendingInQueue === 0 &&
      (savedNotif || state.participants[pid].inventory.fantasma > 0);

    const usageParts: string[] = [];
    if (drawLines.length > 0) {
      usageParts.push(`Usou em ${drawLines.join(' · ')}`);
    }
    if (pendingInQueue > 0) {
      usageParts.push(`Falta${pendingInQueue > 1 ? 'm' : ''} ${pendingInQueue} sorteio${pendingInQueue > 1 ? 's' : ''} pendente${pendingInQueue > 1 ? 's' : ''}`);
    } else if (hasSavedFantasma) {
      usageParts.push(
        drawLines.length > 0
          ? `e acumulou ${unusedCount} 👻 Fantasma nos itens`
          : `Não usou hoje — acumulou ${unusedCount} 👻 Fantasma nos itens`
      );
    } else if (unusedCount > 0 && !roll.resolved) {
      usageParts.push('Aguardando escolher tarefa ou guardar nos itens');
    }

    const outcomeParts: string[] = [`+1 ⭐ para ${pname}`];
    if (drawsInRound.some((d) => d.status === 'completed')) {
      const winners = drawsInRound
        .filter((d) => d.status === 'completed')
        .map((d) => `${getParticipantName(state, d.drawnParticipantId)} +3 ⭐`)
        .join(', ');
      outcomeParts.push(winners);
    }
    if (hasSavedFantasma) {
      outcomeParts.push(`${unusedCount} 👻 guardado nos itens para usar quando quiser`);
    } else if (pendingInQueue > 0) {
      outcomeParts.push(`${pendingInQueue} sorteio pendente`);
    }

    return {
      round,
      face,
      powerTitle,
      usageText: usageParts.join(' · ') || 'Nenhum sorteio realizado ainda.',
      finalOutcome: outcomeParts.join(' · '),
      starsDelta: 1,
    };
  }

  if (isChefeRound) {
    const autoStars = round === 1 ? 1 : 2;
    const powerTitle =
      face === 6
        ? round === 2
          ? 'Face 6 (🃏 Coringa → 👑 Chefe)'
          : 'Face 6 (🃏 Coringa → 👑 Chefe)'
        : round === 2
        ? 'Face 5 (👑 Chefe x2)'
        : 'Face 5 (👑 Chefe)';

    const r1IsChefe = r1?.face === 5 || (r1?.face === 6 && r1?.chosenPower === 'chefe');
    const r2IsChefe = r2?.face === 5 || (r2?.face === 6 && r2?.chosenPower === 'chefe');

    let roundDelegations = allDelegated;
    if (roll.usedTargets && roll.usedTargets.length > 0) {
      roundDelegations = allDelegated.filter((td) => {
        const st = day.tasks[td.id];
        const t = st.delegatedTo || st.delegationDrawnTo || st.delegationDeclinedBy;
        return Boolean(t && roll.usedTargets!.includes(t));
      });
    } else if (round === 2 && r1IsChefe) {
      // If Round 1 also gave Chefe and Round 2 has no usedTargets recorded, delegations belong to Round 1
      roundDelegations = [];
    } else if (round === 1 && r2IsChefe && r2?.usedTargets && r2.usedTargets.length > 0) {
      roundDelegations = allDelegated.filter((td) => {
        const st = day.tasks[td.id];
        const t = st.delegatedTo || st.delegationDrawnTo || st.delegationDeclinedBy;
        return Boolean(t && !r2.usedTargets!.includes(t));
      });
    }

    if (roundDelegations.length > 0) {
      const usageList: string[] = [];
      const outcomeList: string[] = [`+${autoStars} ⭐ automático do dado`];

      for (const tdBase of roundDelegations) {
        const td = getEffectiveTaskDefinition(state, tdBase.id);
        const st = day.tasks[td.id];
        const targetId = st.delegatedTo || st.delegationDrawnTo || st.delegationDeclinedBy;
        const targetName = targetId ? getParticipantName(state, targetId) : 'participante';
        usageList.push(`Delegou ${td.label} para ${targetName}`);

        if (st.completedBy) {
          if (st.delegationStage === 'accepted_target') {
            outcomeList.push(
              `${targetName} aceitou e concluiu ${td.label} (+1 ⭐ ${targetName}, +1 ⭐ ${pname})`
            );
          } else if (st.delegationStage === 'accepted_draw') {
            outcomeList.push(`${targetName} aceitou sorteio e concluiu ${td.label} (+2 ⭐ ${targetName})`);
          } else if (st.delegationReturnedToOwner || st.delegationStage === 'returned_to_owner') {
            outcomeList.push(`${td.label} voltou para ${pname} e foi concluída (+2 ⭐ ${pname})`);
          } else {
            outcomeList.push(`${td.label} concluída por ${getParticipantName(state, st.completedBy)}`);
          }
        } else if (st.expiredPenaltyApplied) {
          outcomeList.push(`${targetName} não concluiu ${td.label} (-1 ⭐ e punição)`);
        } else {
          outcomeList.push(`Aguardando ${targetName} concluir ${td.label}`);
        }
      }

      return {
        round,
        face,
        powerTitle,
        usageText: usageList.join(' · '),
        finalOutcome: outcomeList.join(' · '),
        starsDelta: autoStars,
      };
    }

    const accumulatedChefe =
      state.participants[pid].inventory.chefe > 0 ||
      dayNotifs.some(
        (n) =>
          (n.title.includes('acumulou') && n.title.includes('Chefe')) ||
          n.message.includes('acumulado nos itens')
      );

    return {
      round,
      face,
      powerTitle,
      usageText: !roll.resolved
        ? 'Aguardando delegar tarefa sua ou acumular nos itens.'
        : accumulatedChefe
        ? 'Não usou hoje — acumulou 1 👑 Chefe nos itens.'
        : 'Encerrado sem delegação.',
      finalOutcome: !roll.resolved
        ? `+${autoStars} ⭐ automático · aguardando decisão`
        : accumulatedChefe
        ? `+${autoStars} ⭐ automático · 1 👑 Chefe guardado para usar quando quiser`
        : `+${autoStars} ⭐ automático`,
      starsDelta: autoStars,
    };
  }

  // Coringa rolled without chosen power yet (or saved directly as Coringa)
  if (face === 6) {
    return {
      round,
      face,
      powerTitle: 'Face 6 (🃏 Coringa)',
      usageText: !roll.resolved
        ? 'Aguardando escolher Escudo, Fantasma ou Chefe.'
        : 'Guardou 1 🃏 Coringa nos itens.',
      finalOutcome: !roll.resolved
        ? 'Escolha pendente'
        : '1 🃏 Coringa guardado para usar quando quiser',
      starsDelta: 0,
    };
  }

  return {
    round,
    face,
    powerTitle: `Face ${face}`,
    usageText: 'Rodada concluída.',
    finalOutcome: 'Registrado no dia',
    starsDelta: 0,
  };
}

export function computeDaySummary(
  state: GameState,
  targetDateStr: string
): DayParticipantSummary[] | null {
  const day = state.days[targetDateStr];
  if (!day) return null;

  const effectiveRoutines = ROUTINE_DEFINITIONS.map((r) =>
    getEffectiveRoutineDefinition(state, r.id)
  );
  const effectiveTasks = TASK_DEFINITIONS.map((t) =>
    getEffectiveTaskDefinition(state, t.id)
  );

  return ROTATION_ORDER.map((pid) => {
    const completedRoutines = effectiveRoutines.filter(
      (r) => day.routines[pid]?.[r.id]?.completed
    );
    const missedRoutines = effectiveRoutines.filter(
      (r) => !day.routines[pid]?.[r.id]?.completed
    );
    const missedRoutineDetails = missedRoutines.map((r) => ({
      def: r,
      penaltyStars: day.routines[pid]?.[r.id]?.expiredPenaltyApplied ? 1 : 0,
      justified: Boolean(day.routines[pid]?.[r.id]?.justified),
    }));
    const routinePenaltyStars = missedRoutineDetails.reduce(
      (acc, item) => acc + item.penaltyStars,
      0
    );

    const r1 = day.dice[pid]?.round1;
    const r2 = day.dice[pid]?.round2;
    const frozenThatDay = r2?.face === 4;

    const routineEarnedStars = frozenThatDay ? 0 : completedRoutines.length;
    const routineStars = routineEarnedStars - routinePenaltyStars;

    const completedTasks: DayParticipantSummary['completedTasks'] = [];
    let taskEarnedStars = 0;

    for (const td of effectiveTasks) {
      const st = day.tasks[td.id];
      if (!st || !st.completedBy) continue;

      const isPunishmentCovered =
        !st.rescue &&
        !st.canceledByFantasma &&
        !st.delegatedBy &&
        st.assignedTo &&
        st.completedBy !== st.assignedTo &&
        (st.weekendPunishmentFor === st.assignedTo ||
          Boolean(
            getActiveWeekendPunishmentForOwner(state, targetDateStr, st.assignedTo, {
              includeCompleted: true,
              workerId: st.completedBy,
            })
          ));

      // Under weekend punishment coverage, the covered owner receives the automatic +1 ⭐
      // while the punished worker does NOT earn stars for the covered owner's task.
      if (isPunishmentCovered) {
        if (st.assignedTo !== pid) continue;
        const starsEarned = frozenThatDay ? 0 : 1;
        taskEarnedStars += starsEarned;
        completedTasks.push({
          def: td,
          starsEarned,
          viaFantasma: false,
          viaDelegation: false,
          viaRescue: false,
        });
        continue;
      }

      if (st.completedBy !== pid) continue;

      let starsEarned = 0;
      const viaFantasma = Boolean(st.canceledByFantasma);
      const viaDelegation = Boolean(
        st.delegatedBy && st.delegatedBy !== pid
      );
      const viaRescue = Boolean(st.rescue);

      if (st.rescue) {
        starsEarned = frozenThatDay ? 0 : st.rescue.rewardStars;
      } else if (st.canceledByFantasma) {
        // completeFantasmaDrawTask always awards +3⭐ to drawn participant
        starsEarned = 3;
      } else if (
        st.delegationStage === 'accepted_draw' ||
        st.delegationStage === 'returned_to_owner' ||
        st.delegationReturnedToOwner
      ) {
        starsEarned = frozenThatDay ? 0 : 2;
      } else {
        starsEarned = frozenThatDay ? 0 : 1;
      }

      taskEarnedStars += starsEarned;
      completedTasks.push({
        def: td,
        starsEarned,
        viaFantasma,
        viaDelegation,
        viaRescue,
      });
    }

    // Extra Fantasma draws completed by pid (already covered by st.canceledByFantasma when linked,
    // keep fallback in case a draw exists without canceledByFantasma flag)
    for (const draw of state.fantasmaDraws) {
      if (
        draw.dateStr === targetDateStr &&
        draw.drawnParticipantId === pid &&
        draw.status === 'completed' &&
        !day.tasks[draw.taskId]?.canceledByFantasma
      ) {
        taskEarnedStars += 3;
      }
    }

    // +1 for delegator when delegated task was accepted and completed by target
    if (!frozenThatDay) {
      for (const td of effectiveTasks) {
        const st = day.tasks[td.id];
        if (
          st &&
          st.completedBy &&
          st.delegatedBy === pid &&
          st.delegationStage === 'accepted_target'
        ) {
          taskEarnedStars += 1;
        }
      }
    }

    const missedAssignedTasks: TaskDefinition[] = [];
    const missedTaskDetails: DayParticipantSummary['missedTaskDetails'] = [];
    let taskPenaltyStars = 0;

    for (const td of effectiveTasks) {
      const st = day.tasks[td.id];
      if (!st || st.canceledByFantasma) continue;

      if (st.justified) {
        const isDelegatedPenalty =
          st.delegationStage === 'pending_target' ||
          st.delegationStage === 'accepted_target' ||
          st.delegationStage === 'accepted_draw';

        const justifiedOwner: ParticipantId | null = st.rescue
          ? st.rescue.failedOwnerId
          : isDelegatedPenalty
          ? st.delegationDrawnTo || st.delegatedTo || st.assignedTo
          : st.delegatedBy || st.assignedTo;

        if (justifiedOwner === pid) {
          missedAssignedTasks.push(td);
          missedTaskDetails.push({ def: td, penaltyStars: 0, justified: true });
        }
        continue;
      }

      if (st.expiredPenaltyApplied) {
        const isDelegatedPenalty =
          st.delegationStage === 'pending_target' ||
          st.delegationStage === 'accepted_target' ||
          st.delegationStage === 'accepted_draw';

        const penalizedOwner: ParticipantId | null = st.rescue
          ? st.rescue.failedOwnerId
          : isDelegatedPenalty
          ? st.delegationDrawnTo || st.delegatedTo || st.assignedTo
          : st.delegatedBy || st.assignedTo;

        if (penalizedOwner === pid) {
          const penaltyStars = isDelegatedPenalty ? 1 : 3;
          taskPenaltyStars += penaltyStars;
          missedAssignedTasks.push(td);
          missedTaskDetails.push({ def: td, penaltyStars });
        }
        continue;
      }

      if (st.completedBy) continue;
      if (getTaskResponsibleParticipant(state, day, targetDateStr, td.id) !== pid) continue;

      missedAssignedTasks.push(td);
      missedTaskDetails.push({ def: td, penaltyStars: 0 });
    }

    const taskStars = taskEarnedStars - taskPenaltyStars;

    const fantasmaCanceledTasks = effectiveTasks.filter((td) => {
      const st = day.tasks[td.id];
      return Boolean(st?.canceledByFantasma && st.fantasmaOwner === pid);
    }).map((td) => ({
      def: td,
      completedBy: day.tasks[td.id]?.completedBy || null,
    }));

    const delegatedOutTasks = effectiveTasks.filter((td) => {
      const st = day.tasks[td.id];
      return Boolean(st?.delegatedBy === pid);
    }).map((td) => ({
      def: td,
      to: day.tasks[td.id]?.delegatedTo || null,
      completed: Boolean(day.tasks[td.id]?.completedBy),
    }));

    let dicePowerStars = 0;
    if (r1?.face === 1) dicePowerStars -= 1;
    if (r1?.face === 3 || r1?.face === 4 || r1?.face === 5) dicePowerStars += 1;
    if (r1?.face === 6 && (r1.chosenPower === 'fantasma' || r1.chosenPower === 'chefe')) {
      dicePowerStars += 1;
    }
    if (r2?.face === 1 && (r2.resolved || (r2.usedTargets && r2.usedTargets.length > 0))) {
      dicePowerStars += 4;
    }
    if (r2?.face === 2) dicePowerStars -= 3;
    if (r2?.face === 3) dicePowerStars += 1;
    if (r2?.face === 4 || r2?.face === 5) dicePowerStars += 2;
    if (r2?.face === 6) {
      if (r2.chosenPower === 'fantasma') dicePowerStars += 1;
      if (r2.chosenPower === 'chefe') dicePowerStars += 2;
    }
    for (const otherPid of ROTATION_ORDER) {
      if (otherPid === pid) continue;
      const otherR2 = day.dice[otherPid]?.round2;
      if (otherR2?.face === 1 && otherR2.usedTargets?.includes(pid)) dicePowerStars -= 4;
      if (otherR2?.face === 2) dicePowerStars += 1;
    }

    let denunciationStars = 0;
    for (const den of state.denunciations) {
      if (den.dateStr !== targetDateStr) continue;
      if (den.reporterId === pid) denunciationStars += 1;
      if (den.targetId === pid) denunciationStars -= 1;
    }

    const netStars = routineStars + taskStars + dicePowerStars + denunciationStars;
    const round1Summary = buildRoundOutcomeSummary(state, day, targetDateStr, pid, 1, r1);
    const round2Summary = buildRoundOutcomeSummary(state, day, targetDateStr, pid, 2, r2);

    return {
      pid,
      dateStr: targetDateStr,
      completedRoutinesCount: completedRoutines.length,
      missedRoutines,
      missedRoutineDetails,
      completedTasks,
      missedAssignedTasks,
      missedTaskDetails,
      fantasmaCanceledTasks,
      delegatedOutTasks,
      r1,
      r2,
      diceJustification: day.diceJustifications?.[pid] || null,
      round1Summary,
      round2Summary,
      routineEarnedStars,
      routinePenaltyStars,
      routineStars,
      taskEarnedStars,
      taskPenaltyStars,
      taskStars,
      dicePowerStars,
      denunciationStars,
      netStars,
    };
  });
}

function toggleEmojiInMap(
  reactions: ChatReactionMap | undefined,
  emoji: string,
  participantId: ParticipantId
): ChatReactionMap {
  const next: ChatReactionMap = {};
  let hadSameEmoji = false;

  for (const [existingEmoji, users] of Object.entries(reactions || {})) {
    if (!Array.isArray(users)) continue;
    const filtered = users.filter((id) => id !== participantId);
    if (existingEmoji === emoji && users.includes(participantId)) {
      hadSameEmoji = true;
    }
    if (filtered.length > 0) {
      next[existingEmoji] = filtered;
    }
  }

  if (!hadSameEmoji) {
    const list = next[emoji] ? [...next[emoji]] : [];
    list.push(participantId);
    next[emoji] = list;
  }

  return next;
}

export function sendChatMessage(
  state: GameState,
  senderId: ParticipantId,
  rawText: string,
  nowHHMM: string,
  options?: {
    replyToId?: string | null;
    kind?: 'text' | 'reaction_burst' | 'audio';
    audioUrl?: string;
    audioDurationSec?: number;
  }
): { ok: boolean; error?: string; message?: ChatMessage } {
  if (!state.participants[senderId]) {
    return { ok: false, error: 'Participante inválido.' };
  }
  const isAudio = options?.kind === 'audio';
  const cleanAudioUrl = isAudio && typeof options?.audioUrl === 'string' ? options.audioUrl.trim() : '';
  const durationSec =
    isAudio && typeof options?.audioDurationSec === 'number' && Number.isFinite(options.audioDurationSec)
      ? Math.max(1, Math.min(120, Math.round(options.audioDurationSec)))
      : undefined;

  if (isAudio) {
    if (!cleanAudioUrl.startsWith('data:audio/') || cleanAudioUrl.length > 1_600_000) {
      return { ok: false, error: 'Áudio inválido ou muito grande (máx. 60 segundos).' };
    }
  }

  const mins = durationSec ? Math.floor(durationSec / 60) : 0;
  const secs = durationSec ? durationSec % 60 : 0;
  const durationLabel = durationSec ? `${mins}:${secs.toString().padStart(2, '0')}` : '';
  const cleanText = rawText.trim() || (isAudio ? `🎤 Áudio${durationLabel ? ` (${durationLabel})` : ''}` : '');

  if (!cleanText) {
    return { ok: false, error: 'Digite uma mensagem, grave um áudio ou escolha um emoji para enviar.' };
  }
  if (cleanText.length > 600) {
    return { ok: false, error: 'Mensagem muito longa (máximo 600 caracteres).' };
  }

  if (!Array.isArray(state.chatMessages)) {
    state.chatMessages = [];
  }

  const replyId =
    options?.replyToId && state.chatMessages.some((m) => m.id === options.replyToId)
      ? options.replyToId
      : null;

  const message: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    senderId,
    text: cleanText,
    kind: isAudio ? 'audio' : options?.kind === 'reaction_burst' ? 'reaction_burst' : 'text',
    ...(isAudio ? { audioUrl: cleanAudioUrl, audioDurationSec: durationSec } : {}),
    replyToId: replyId,
    reactions: {},
    createdAtIso: new Date().toISOString(),
    timestamp: formatShortTimestamp(state.currentDateStr, nowHHMM),
  };

  state.chatMessages.push(message);
  if (state.chatMessages.length > 250) {
    state.chatMessages = state.chatMessages.slice(-250);
  }

  return { ok: true, message };
}

export function toggleChatReaction(
  state: GameState,
  messageId: string,
  participantId: ParticipantId,
  rawEmoji: string
): { ok: boolean; error?: string } {
  if (!state.participants[participantId]) {
    return { ok: false, error: 'Participante inválido.' };
  }
  const emoji = rawEmoji.trim();
  if (!emoji || emoji.length > 16) {
    return { ok: false, error: 'Emoji inválido.' };
  }
  if (!Array.isArray(state.chatMessages)) {
    return { ok: false, error: 'Mensagem não encontrada.' };
  }
  const msg = state.chatMessages.find((m) => m.id === messageId);
  if (!msg) {
    return { ok: false, error: 'Mensagem não encontrada.' };
  }
  msg.reactions = toggleEmojiInMap(msg.reactions, emoji, participantId);
  return { ok: true };
}

export function deleteChatMessage(
  state: GameState,
  messageId: string,
  participantId: ParticipantId
): { ok: boolean; error?: string } {
  if (!Array.isArray(state.chatMessages)) {
    return { ok: false, error: 'Mensagem não encontrada.' };
  }
  const idx = state.chatMessages.findIndex((m) => m.id === messageId);
  if (idx < 0) {
    return { ok: false, error: 'Mensagem não encontrada.' };
  }
  if (state.chatMessages[idx].senderId !== participantId) {
    return { ok: false, error: 'Você só pode apagar suas próprias mensagens.' };
  }
  state.chatMessages.splice(idx, 1);
  return { ok: true };
}

export function editChatMessage(
  state: GameState,
  messageId: string,
  participantId: ParticipantId,
  rawText: string,
  nowHHMM: string
): { ok: boolean; error?: string; message?: ChatMessage } {
  if (!state.participants[participantId]) {
    return { ok: false, error: 'Participante inválido.' };
  }
  if (!Array.isArray(state.chatMessages)) {
    return { ok: false, error: 'Mensagem não encontrada.' };
  }
  const msg = state.chatMessages.find((m) => m.id === messageId);
  if (!msg) {
    return { ok: false, error: 'Mensagem não encontrada.' };
  }
  if (msg.senderId !== participantId) {
    return { ok: false, error: 'Você só pode editar suas próprias mensagens.' };
  }
  const cleanText = rawText.trim();
  if (!cleanText) {
    return { ok: false, error: 'A mensagem não pode ficar vazia.' };
  }
  if (cleanText.length > 600) {
    return { ok: false, error: 'Mensagem muito longa (máximo 600 caracteres).' };
  }
  msg.text = cleanText;
  msg.kind = 'text';
  msg.editedAtIso = new Date().toISOString();
  msg.editedAt = formatShortTimestamp(state.currentDateStr, nowHHMM);
  return { ok: true, message: msg };
}

export function toggleNotificationReaction(
  state: GameState,
  notificationId: string,
  participantId: ParticipantId,
  rawEmoji: string
): { ok: boolean; error?: string } {
  if (!state.participants[participantId]) {
    return { ok: false, error: 'Participante inválido.' };
  }
  const emoji = rawEmoji.trim();
  if (!emoji || emoji.length > 16) {
    return { ok: false, error: 'Emoji inválido.' };
  }
  const notif = (state.notifications || []).find((n) => n.id === notificationId);
  if (!notif) {
    return { ok: false, error: 'Evento não encontrado.' };
  }
  notif.reactions = toggleEmojiInMap(notif.reactions, emoji, participantId);
  return { ok: true };
}

export function toggleParticipantReaction(
  state: GameState,
  targetParticipantId: ParticipantId,
  actorParticipantId: ParticipantId,
  rawEmoji: string
): { ok: boolean; error?: string } {
  const target = state.participants[targetParticipantId];
  if (!target || !state.participants[actorParticipantId]) {
    return { ok: false, error: 'Participante inválido.' };
  }
  const emoji = rawEmoji.trim();
  if (!emoji || emoji.length > 16) {
    return { ok: false, error: 'Emoji inválido.' };
  }
  target.reactions = toggleEmojiInMap(target.reactions, emoji, actorParticipantId);
  return { ok: true };
}

function assertTailan(actorId: ParticipantId): { ok: boolean; error?: string } {
  if (actorId !== 'tailan') {
    return {
      ok: false,
      error: 'Apenas Tailan tem permissão para alterar e acrescentar tudo no jogo.',
    };
  }
  return { ok: true };
}

export function tailanSetParticipantStars(
  state: GameState,
  actorId: ParticipantId,
  targetId: ParticipantId,
  stars: number,
  nowHHMM: string
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  const target = state.participants[targetId];
  if (!target || !Number.isFinite(stars)) {
    return { ok: false, error: 'Participante ou valor inválido.' };
  }
  const nextStars = Math.round(stars);
  const diff = nextStars - target.stars;
  target.stars = nextStars;
  if (diff !== 0) {
    pushNotification(state, {
      dateStr: state.currentDateStr,
      timestamp: formatShortTimestamp(state.currentDateStr, nowHHMM),
      actorId: 'tailan',
      targetId,
      type: 'system',
      title: `👑 Tailan ajustou ${getParticipantName(state, targetId)} (${diff > 0 ? `+${diff}` : diff} ⭐)`,
      message: `Saldo atualizado pelo Mestre para ${nextStars} ⭐.`,
      starDelta: diff,
    });
  }
  return { ok: true };
}

export function tailanSetParticipantInventory(
  state: GameState,
  actorId: ParticipantId,
  targetId: ParticipantId,
  power: PowerType,
  quantity: number
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  const target = state.participants[targetId];
  if (!target || !(power in target.inventory)) {
    return { ok: false, error: 'Participante ou poder inválido.' };
  }
  target.inventory[power] = Math.max(0, Math.min(99, Math.round(quantity)));
  return { ok: true };
}

export function tailanSetParticipantFlags(
  state: GameState,
  actorId: ParticipantId,
  targetId: ParticipantId,
  options: {
    frozenToday?: boolean;
    shieldActiveToday?: boolean;
    resetDiceRound?: 1 | 2;
  }
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  const target = state.participants[targetId];
  if (!target) return { ok: false, error: 'Participante inválido.' };

  if (typeof options.frozenToday === 'boolean') {
    target.frozenDateStr = options.frozenToday ? state.currentDateStr : null;
  }
  if (typeof options.shieldActiveToday === 'boolean') {
    target.shieldActiveUntil = options.shieldActiveToday
      ? `${state.currentDateStr}T23:59`
      : null;
  }
  if (options.resetDiceRound === 1 || options.resetDiceRound === 2) {
    const day = ensureDayRecord(state, state.currentDateStr);
    if (options.resetDiceRound === 1) {
      delete day.dice[targetId].round1;
    } else {
      delete day.dice[targetId].round2;
    }
  }
  return { ok: true };
}

export function tailanUpsertCustomTask(
  state: GameState,
  actorId: ParticipantId,
  input: {
    id?: string;
    dateStr?: string;
    title: string;
    description?: string;
    assignedTo: ParticipantId | 'all';
    starReward: number;
    deadlineHHMM?: string | null;
  },
  nowHHMM: string
): { ok: boolean; error?: string; task?: CustomGameTask } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Informe o nome da tarefa.' };
  const starReward = Math.max(1, Math.min(50, Math.round(Number(input.starReward || 1))));
  const dateStr = input.dateStr === 'all' ? 'all' : input.dateStr || state.currentDateStr;

  if (!Array.isArray(state.customTasks)) {
    state.customTasks = [];
  }

  if (input.id) {
    const existing = state.customTasks.find((ct) => ct.id === input.id);
    if (!existing) return { ok: false, error: 'Tarefa personalizada não encontrada.' };
    existing.title = title;
    existing.description = input.description?.trim() || undefined;
    existing.assignedTo = input.assignedTo;
    existing.starReward = starReward;
    existing.dateStr = dateStr;
    existing.deadlineHHMM = input.deadlineHHMM || null;
    return { ok: true, task: existing };
  }

  const created: CustomGameTask = {
    id: `ctask-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    dateStr,
    title,
    description: input.description?.trim() || undefined,
    assignedTo: input.assignedTo,
    starReward,
    deadlineHHMM: input.deadlineHHMM || null,
    completedBy: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
  };
  state.customTasks.unshift(created);

  const targetLabel =
    created.assignedTo === 'all'
      ? 'qualquer participante'
      : getParticipantName(state, created.assignedTo);
  pushNotification(state, {
    dateStr: state.currentDateStr,
    timestamp: formatShortTimestamp(state.currentDateStr, nowHHMM),
    actorId: 'tailan',
    type: 'system',
    title: `👑 Nova tarefa adicionada: ${created.title} (+${created.starReward} ⭐)`,
    message: `Para ${targetLabel}${created.deadlineHHMM ? ` · até ${created.deadlineHHMM}` : ''}.`,
  });

  return { ok: true, task: created };
}

export function tailanDeleteCustomTask(
  state: GameState,
  actorId: ParticipantId,
  customTaskId: string
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  state.customTasks = (state.customTasks || []).filter((t) => t.id !== customTaskId);
  return { ok: true };
}

export function completeCustomTask(
  state: GameState,
  dateStr: string,
  participantId: ParticipantId,
  customTaskId: string,
  nowHHMM: string
): { ok: boolean; error?: string } {
  const task = (state.customTasks || []).find((t) => t.id === customTaskId);
  if (!task) return { ok: false, error: 'Tarefa extra não encontrada.' };
  if (task.dateStr !== 'all' && task.dateStr !== dateStr) {
    return { ok: false, error: 'Esta tarefa não pertence ao dia de hoje.' };
  }
  if (task.completedBy) {
    return { ok: false, error: 'Esta tarefa extra já foi concluída.' };
  }
  if (task.assignedTo !== 'all' && task.assignedTo !== participantId) {
    return {
      ok: false,
      error: `Esta tarefa pertence a ${getParticipantName(state, task.assignedTo)}.`,
    };
  }

  task.completedBy = participantId;
  task.completedAt = `${dateStr}T${nowHHMM}:00`;
  applyStarDelta(state, participantId, task.starReward, dateStr, nowHHMM);

  pushNotification(state, {
    dateStr,
    timestamp: formatShortTimestamp(dateStr, nowHHMM),
    actorId: participantId,
    type: 'star',
    title: `${getParticipantName(state, participantId)} +${task.starReward} ⭐`,
    message: `Concluiu a tarefa extra "${task.title}".`,
    starDelta: task.starReward,
  });
  return { ok: true };
}

export function tailanUpdateDayTask(
  state: GameState,
  actorId: ParticipantId,
  dateStr: string,
  taskId: TaskId,
  updates: {
    assignedTo?: ParticipantId | null;
    status?: 'pending' | 'completed' | 'canceled';
    completedBy?: ParticipantId | null;
  },
  nowHHMM: string
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  const day = ensureDayRecord(state, dateStr);
  const task = day.tasks[taskId];
  if (!task) return { ok: false, error: 'Tarefa não encontrada.' };

  if (updates.assignedTo !== undefined) {
    task.assignedTo = updates.assignedTo;
    task.delegatedTo = null;
    task.delegatedBy = null;
    task.delegationStage = null;
    task.delegationDrawnTo = null;
    task.delegationDeclinedBy = null;
    task.delegationReturnedToOwner = false;
    task.rescue = null;
  }

  if (updates.status === 'pending') {
    task.completedBy = null;
    task.completedAt = null;
    task.canceledByFantasma = false;
    task.fantasmaOwner = null;
    task.expiredPenaltyApplied = false;
    task.justified = false;
  } else if (updates.status === 'completed') {
    const owner = updates.completedBy || getEffectiveAssignee(day, taskId) || task.assignedTo || 'tailan';
    task.completedBy = owner;
    task.completedAt = `${dateStr}T${nowHHMM}:00`;
    task.canceledByFantasma = false;
    task.expiredPenaltyApplied = false;
    task.justified = false;
  } else if (updates.status === 'canceled') {
    task.canceledByFantasma = true;
    task.fantasmaOwner = 'tailan';
    task.completedBy = null;
    task.completedAt = null;
    task.justified = false;
  }

  return { ok: true };
}

export function tailanUpdateDayRoutine(
  state: GameState,
  actorId: ParticipantId,
  dateStr: string,
  targetId: ParticipantId,
  routineId: RoutineId,
  status: 'pending' | 'completed' | 'missed',
  nowHHMM: string
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  const day = ensureDayRecord(state, dateStr);
  const entry = day.routines[targetId]?.[routineId];
  if (!entry) return { ok: false, error: 'Rotina não encontrada.' };

  if (status === 'completed') {
    entry.completed = true;
    entry.completedAt = `${dateStr}T${nowHHMM}:00`;
    entry.expiredPenaltyApplied = false;
    entry.justified = false;
  } else if (status === 'missed') {
    entry.completed = false;
    entry.completedAt = null;
    entry.expiredPenaltyApplied = true;
    entry.justified = false;
  } else {
    entry.completed = false;
    entry.completedAt = null;
    entry.expiredPenaltyApplied = false;
    entry.justified = false;
  }
  return { ok: true };
}

export function tailanUpdateTaskOverride(
  state: GameState,
  actorId: ParticipantId,
  taskId: TaskId,
  override: TaskDefinitionOverride | null
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  if (!state.taskOverrides) state.taskOverrides = {};
  if (!override || (!override.label && override.weekdayLimit === undefined && override.weekendLimit === undefined && !override.note)) {
    delete state.taskOverrides[taskId];
  } else {
    state.taskOverrides[taskId] = {
      ...(state.taskOverrides[taskId] || {}),
      ...override,
    };
  }
  return { ok: true };
}

export function tailanUpsertCustomRule(
  state: GameState,
  actorId: ParticipantId,
  input: {
    id?: string;
    title: string;
    description: string;
    category: CustomGameRule['category'];
  },
  nowHHMM: string
): { ok: boolean; error?: string; rule?: CustomGameRule } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  const title = input.title.trim();
  const description = input.description.trim();
  if (!title || !description) {
    return { ok: false, error: 'Preencha título e descrição da regra.' };
  }
  if (!Array.isArray(state.customRules)) {
    state.customRules = [];
  }

  if (input.id) {
    const existing = state.customRules.find((r) => r.id === input.id);
    if (!existing) return { ok: false, error: 'Regra não encontrada.' };
    existing.title = title;
    existing.description = description;
    existing.category = input.category;
    return { ok: true, rule: existing };
  }

  const rule: CustomGameRule = {
    id: `crule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    description,
    category: input.category,
    createdAt: new Date().toISOString(),
  };
  state.customRules.unshift(rule);

  pushNotification(state, {
    dateStr: state.currentDateStr,
    timestamp: formatShortTimestamp(state.currentDateStr, nowHHMM),
    actorId: 'tailan',
    type: 'system',
    title: `📜 Nova regra adicionada por Tailan: ${rule.title}`,
    message: rule.description,
  });

  return { ok: true, rule };
}

export function tailanDeleteCustomRule(
  state: GameState,
  actorId: ParticipantId,
  ruleId: string
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  state.customRules = (state.customRules || []).filter((r) => r.id !== ruleId);
  return { ok: true };
}

export function tailanUpdateGoalBanner(
  state: GameState,
  actorId: ParticipantId,
  goalText: string,
  nowHHMM: string
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  const clean = goalText.trim();
  state.goalBannerText = clean || undefined;
  pushNotification(state, {
    dateStr: state.currentDateStr,
    timestamp: formatShortTimestamp(state.currentDateStr, nowHHMM),
    actorId: 'tailan',
    type: 'system',
    title: '🏆 Meta/Prêmio atualizado por Tailan',
    message: clean || 'Meta padrão restaurada.',
  });
  return { ok: true };
}

export function tailanPostAnnouncement(
  state: GameState,
  actorId: ParticipantId,
  title: string,
  message: string,
  nowHHMM: string,
  bonusTarget?: { targetId: ParticipantId; delta: number }
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  const cleanTitle = title.trim();
  const cleanMessage = message.trim();
  if (!cleanTitle || !cleanMessage) {
    return { ok: false, error: 'Informe título e mensagem do aviso.' };
  }
  let starDelta: number | undefined;
  if (bonusTarget && bonusTarget.delta !== 0 && state.participants[bonusTarget.targetId]) {
    applyStarDelta(state, bonusTarget.targetId, bonusTarget.delta, state.currentDateStr, nowHHMM);
    starDelta = bonusTarget.delta;
  }
  pushNotification(state, {
    dateStr: state.currentDateStr,
    timestamp: formatShortTimestamp(state.currentDateStr, nowHHMM),
    actorId: 'tailan',
    targetId: bonusTarget?.targetId,
    type: starDelta ? (starDelta > 0 ? 'star' : 'penalty') : 'system',
    title: cleanTitle,
    message: cleanMessage,
    starDelta,
  });
  return { ok: true };
}

export function tailanDeleteWeekendPunishment(
  state: GameState,
  actorId: ParticipantId,
  punishmentId: string
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  state.weekendPunishments = state.weekendPunishments.filter((wp) => wp.id !== punishmentId);
  return { ok: true };
}

export function tailanClearChatOrMessage(
  state: GameState,
  actorId: ParticipantId,
  messageId?: string
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  if (messageId) {
    state.chatMessages = (state.chatMessages || []).filter((m) => m.id !== messageId);
  } else {
    state.chatMessages = [];
  }
  return { ok: true };
}

export const ALLOWED_SOUND_THEMES: SoundThemeId[] = [
  'classico',
  'cristal',
  'arcade',
  'marimba',
  'festa',
  'suave',
];

export function tailanUpdateSoundTheme(
  state: GameState,
  participantId: ParticipantId,
  rawTheme: string
): { ok: boolean; error?: string; soundTheme?: SoundThemeId } {
  return updateParticipantSoundTheme(state, participantId, rawTheme);
}

export function updateParticipantSoundTheme(
  state: GameState,
  participantId: ParticipantId,
  rawTheme: string
): { ok: boolean; error?: string; soundTheme?: SoundThemeId } {
  const target = state.participants[participantId];
  if (!target) {
    return { ok: false, error: 'Participante inválido.' };
  }
  const theme = String(rawTheme || '').trim() as SoundThemeId;
  if (!ALLOWED_SOUND_THEMES.includes(theme)) {
    return { ok: false, error: 'Toque sonoro inválido.' };
  }
  target.soundTheme = theme;
  return { ok: true, soundTheme: theme };
}

export function syncAutomaticDayRollover(
  state: GameState,
  targetDateStr: string = getBrazilDateStr()
): boolean {
  if (state.manualDateLocked) return false;
  if (!targetDateStr || targetDateStr <= state.currentDateStr) return false;

  let safety = 0;
  let changed = false;
  while (state.currentDateStr < targetDateStr && safety < 60) {
    safety += 1;
    const closingDate = state.currentDateStr;
    processExpiredDeadlines(state, closingDate, '23:59');
    const nextDate = getNextDateStr(closingDate);
    state.currentDateStr = nextDate;
    ensureDayRecord(state, nextDate);

    for (const pid of ROTATION_ORDER) {
      const p = state.participants[pid];
      if (!p) continue;
      if (p.frozenDateStr && p.frozenDateStr < nextDate) {
        p.frozenDateStr = null;
      }
      if (p.shieldActiveUntil && p.shieldActiveUntil.slice(0, 10) < nextDate) {
        p.shieldActiveUntil = null;
      }
      p.milestonesUsedToday = { dateStr: nextDate, beforeNoon: 0, afterNoon: 0 };
    }

    state.notifications = (state.notifications || []).filter((n) => n.dateStr === nextDate);
    pushNotification(state, {
      dateStr: nextDate,
      timestamp: formatShortTimestamp(nextDate, '00:00'),
      type: 'system',
      title: `🌙 Novo dia iniciado (${nextDate.split('-').reverse().join('/')})`,
      message:
        'Rotinas e tarefas da escala do dia já estão liberadas! Dado da manhã abre às 05:00.',
    });
    changed = true;
  }

  return changed;
}

export function tailanSetManualDateLock(
  state: GameState,
  actorId: ParticipantId,
  locked: boolean
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  state.manualDateLocked = Boolean(locked);
  return { ok: true };
}

export function tailanSetDiceDisabledForDate(
  state: GameState,
  actorId: ParticipantId,
  dateStr: string,
  disabled: boolean
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  const list = new Set(state.diceDisabledDates || []);
  if (disabled) {
    list.add(dateStr);
  } else {
    list.delete(dateStr);
  }
  state.diceDisabledDates = Array.from(list).sort();
  return { ok: true };
}

export function tailanSetDayDice(
  state: GameState,
  actorId: ParticipantId,
  dateStr: string,
  targetId: ParticipantId,
  round: 1 | 2,
  face: 1 | 2 | 3 | 4 | 5 | 6 | null,
  nowHHMM: string
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  if (!state.participants[targetId]) {
    return { ok: false, error: 'Participante inválido.' };
  }
  const day = ensureDayRecord(state, dateStr);
  const key = round === 1 ? 'round1' : 'round2';
  if (face === null) {
    delete day.dice[targetId][key];
    return { ok: true };
  }
  day.dice[targetId][key] = {
    round,
    face,
    rolledAt: `${dateStr}T${nowHHMM}:00`,
    resolved: true,
    pendingAction: null,
  };
  return { ok: true };
}

export function tailanUpdateRoutineOverride(
  state: GameState,
  actorId: ParticipantId,
  routineId: RoutineId,
  override: RoutineDefinitionOverride | null
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  if (!state.routineOverrides) state.routineOverrides = {};
  if (
    !override ||
    (!override.label &&
      override.weekdayLimit === undefined &&
      override.weekendLimit === undefined &&
      !override.note)
  ) {
    delete state.routineOverrides[routineId];
  } else {
    state.routineOverrides[routineId] = {
      ...(state.routineOverrides[routineId] || {}),
      ...override,
    };
  }
  return { ok: true };
}

export function tailanUpdateParticipantProfile(
  state: GameState,
  actorId: ParticipantId,
  targetId: ParticipantId,
  updates: {
    displayName?: string | null;
    avatarUrl?: string | null;
    soundTheme?: SoundThemeId;
  },
  nowHHMM: string
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  const target = state.participants[targetId];
  if (!target) return { ok: false, error: 'Participante inválido.' };

  if (updates.displayName !== undefined) {
    const baseName = PARTICIPANT_PROFILES[targetId].name;
    const raw = (updates.displayName || '').trim() || baseName;
    const res = updateParticipantDisplayName(state, targetId, raw, nowHHMM);
    if (!res.ok) return res;
  }
  if (updates.avatarUrl !== undefined) {
    const res = updateParticipantAvatar(state, targetId, updates.avatarUrl, nowHHMM);
    if (!res.ok) return res;
  }
  if (updates.soundTheme !== undefined) {
    const res = updateParticipantSoundTheme(state, targetId, updates.soundTheme);
    if (!res.ok) return res;
  }
  return { ok: true };
}

export function tailanDeleteNotification(
  state: GameState,
  actorId: ParticipantId,
  notificationId?: string
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  if (notificationId) {
    state.notifications = (state.notifications || []).filter((n) => n.id !== notificationId);
  } else {
    state.notifications = [];
  }
  return { ok: true };
}

export function tailanDeleteJustification(
  state: GameState,
  actorId: ParticipantId,
  justificationId: string
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  state.justifications = (state.justifications || []).filter((j) => j.id !== justificationId);
  return { ok: true };
}

export function tailanDeleteDenunciation(
  state: GameState,
  actorId: ParticipantId,
  denunciationId: string
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  state.denunciations = (state.denunciations || []).filter((d) => d.id !== denunciationId);
  return { ok: true };
}

export function tailanDeleteFantasmaDraw(
  state: GameState,
  actorId: ParticipantId,
  drawId: string
): { ok: boolean; error?: string } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;
  state.fantasmaDraws = (state.fantasmaDraws || []).filter((d) => d.id !== drawId);
  return { ok: true };
}

export function tailanUpdateWeekendPunishment(
  state: GameState,
  actorId: ParticipantId,
  input: {
    id?: string;
    dateStr?: string;
    punishedId?: ParticipantId;
    coveringForId?: ParticipantId;
    deciderId?: ParticipantId;
    taskId?: TaskId;
    chosenDay?: 'sabado' | 'domingo' | null;
    completed?: boolean;
  },
  nowHHMM: string
): { ok: boolean; error?: string; punishment?: WeekendPunishment } {
  const auth = assertTailan(actorId);
  if (!auth.ok) return auth;

  if (input.id) {
    const existing = state.weekendPunishments.find((wp) => wp.id === input.id);
    if (!existing) return { ok: false, error: 'Punição não encontrada.' };
    if (input.punishedId) existing.punishedId = input.punishedId;
    if (input.coveringForId) existing.coveringForId = input.coveringForId;
    if (input.deciderId) existing.deciderId = input.deciderId;
    if (input.taskId) {
      existing.taskId = input.taskId;
      existing.taskLabel = getEffectiveTaskDefinition(state, input.taskId).label;
    }
    if (input.chosenDay !== undefined) existing.chosenDay = input.chosenDay;
    if (typeof input.completed === 'boolean') existing.completed = input.completed;
    return { ok: true, punishment: existing };
  }

  const punishedId = input.punishedId || 'caio';
  const taskId = input.taskId || 'cafe_manha';
  const coveringForId = input.coveringForId || getNextInRotation(punishedId);
  const dateStr = input.dateStr || state.currentDateStr;
  const created: WeekendPunishment = {
    id: `pun-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    dateStr,
    punishedId,
    coveringForId,
    deciderId: input.deciderId || coveringForId,
    taskId,
    taskLabel: getEffectiveTaskDefinition(state, taskId).label,
    chosenDay: input.chosenDay ?? null,
    completed: Boolean(input.completed),
    createdAt: `${dateStr}T${nowHHMM}:00`,
  };
  state.weekendPunishments.unshift(created);
  return { ok: true, punishment: created };
}

