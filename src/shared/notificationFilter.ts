import {
  getActiveWeekendPunishmentForOwner,
  getDiceWindowStatus,
  getTaskResponsibleParticipant,
  isDeadlineBypassedByPrerequisite,
  isRoutineUnlocked,
  isTaskUnlocked,
} from './gameLogic.ts';
import {
  getDeadlineForItem,
  getEffectiveRoutineDefinition,
  getEffectiveTaskDefinition,
  getParticipantName,
  isTimePastDeadline,
  ROUTINE_DEFINITIONS,
  TASK_DEFINITIONS,
} from './schedule.ts';
import type {
  GameNotification,
  GameState,
  NotificationCategory,
  NotificationPreferences,
  ParticipantId,
  PowerType,
} from './types.ts';

export function mapNotificationTypeToCategory(type: GameNotification['type']): NotificationCategory {
  switch (type) {
    case 'star':
      return 'rankingUpdates';
    case 'penalty':
    case 'denuncia':
    case 'punishment':
      return 'punishmentAlerts';
    case 'fantasma':
    case 'chefe':
    case 'escudo':
    case 'dice':
    case 'rescue':
      return 'drawResults';
    case 'system':
    default:
      return 'taskReminders';
  }
}

export function isWithinQuietHours(hhmm: string, start: string, end: string): boolean {
  if (start === end) return false;
  if (start < end) {
    return hhmm >= start && hhmm < end;
  }
  // Spans midnight (e.g., 23:00 -> 07:00)
  return hhmm >= start || hhmm < end;
}

export function filterCurrentDayNotifications(
  notifications: GameNotification[],
  currentDateStr: string
): GameNotification[] {
  return notifications.filter((n) => n.dateStr === currentDateStr);
}

export function shouldDeliverNotification(
  notif: GameNotification,
  prefs: NotificationPreferences,
  currentHHMM: string,
  recentDeliveredKeys: Map<string, number>,
  nowMs = Date.now(),
  currentDateStr?: string
): { deliver: boolean; reason?: string } {
  if (currentDateStr && notif.dateStr !== currentDateStr) {
    return { deliver: false, reason: 'expired_day' };
  }

  const category = mapNotificationTypeToCategory(notif.type);
  if (!prefs[category]) {
    return { deliver: false, reason: `category_disabled:${category}` };
  }

  // Urgent direct Fantasma draw, Chefe delegation, or automatic Rescue cascade bypasses quiet hours
  const isDirectUrgent = notif.type === 'fantasma' || notif.type === 'chefe' || notif.type === 'rescue';

  if (prefs.quietHoursEnabled && !isDirectUrgent && isWithinQuietHours(currentHHMM, prefs.quietStart, prefs.quietEnd)) {
    return { deliver: false, reason: 'quiet_hours' };
  }

  if (prefs.antiOverloadEnabled) {
    const dedupKey = `${notif.type}:${notif.actorId || ''}:${notif.title}`;
    const lastSeen = recentDeliveredKeys.get(dedupKey);
    if (lastSeen && nowMs - lastSeen < 5 * 60 * 1000) {
      return { deliver: false, reason: 'anti_overload_cooldown' };
    }
  }

  return { deliver: true };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export interface TimelyReminder {
  id: string;
  kind: 'routine' | 'task';
  label: string;
  deadline: string;
  minutesRemaining: number;
}

export function computeTimelyReminders(
  state: GameState,
  participantId: ParticipantId,
  dateStr: string,
  nowHHMM: string
): TimelyReminder[] {
  const p = state.participants[participantId];
  if (!p?.notificationPreferences.taskReminders) return [];
  const day = state.days[dateStr];
  if (!day) return [];

  const nowMin = toMinutes(nowHHMM);
  const windowMin = p.notificationPreferences.reminderMinutesBefore || 15;
  const reminders: TimelyReminder[] = [];

  for (const baseRoutine of ROUTINE_DEFINITIONS) {
    const r = getEffectiveRoutineDefinition(state, baseRoutine.id);
    const entry = day.routines[participantId]?.[r.id];
    if (!entry || entry.completed || entry.expiredPenaltyApplied || entry.justified) continue;
    if (!isRoutineUnlocked(day, r.id, state).unlocked) continue;
    if (isDeadlineBypassedByPrerequisite(state, day, dateStr, r.requiresTaskDone)) continue;
    const deadline = getDeadlineForItem(dateStr, r.weekdayLimit, r.weekendLimit);
    if (!deadline) continue;
    const diff = toMinutes(deadline) - nowMin;
    if (diff > 0 && diff <= windowMin) {
      reminders.push({
        id: `rem-r-${r.id}`,
        kind: 'routine',
        label: r.label,
        deadline,
        minutesRemaining: diff,
      });
    }
  }

  for (const baseTask of TASK_DEFINITIONS) {
    const t = getEffectiveTaskDefinition(state, baseTask.id);
    const task = day.tasks[t.id];
    if (!task || task.completedBy || task.canceledByFantasma || task.expiredPenaltyApplied || task.justified) continue;
    if (getTaskResponsibleParticipant(state, day, dateStr, t.id) !== participantId) continue;
    if (!isTaskUnlocked(day, t.id, state).unlocked) continue;
    if (isDeadlineBypassedByPrerequisite(state, day, dateStr, t.requiresTaskDone)) continue;
    const deadline = getDeadlineForItem(dateStr, t.weekdayLimit, t.weekendLimit);
    if (!deadline) continue;
    const diff = toMinutes(deadline) - nowMin;
    if (diff > 0 && diff <= windowMin) {
      reminders.push({
        id: `rem-t-${t.id}`,
        kind: 'task',
        label: t.label,
        deadline,
        minutesRemaining: diff,
      });
    }
  }

  return reminders.sort((a, b) => a.minutesRemaining - b.minutesRemaining);
}

export interface ActionableAlert {
  id: string;
  kind: 'power' | 'fantasma' | 'dice' | 'task' | 'routine' | 'punishment';
  title: string;
  detail: string;
  category: NotificationCategory;
  urgent?: boolean;
  powerKey?: PowerType;
}

export function computeActionableAlerts(
  state: GameState,
  participantId: ParticipantId,
  dateStr: string,
  nowHHMM: string
): ActionableAlert[] {
  const alerts: ActionableAlert[] = [];
  const p = state.participants[participantId];
  const day = state.days[dateStr];
  if (!p || !day) return alerts;

  // 1. Pending Fantasma draws assigned to this participant
  for (const draw of state.fantasmaDraws) {
    if (draw.drawnParticipantId !== participantId) continue;
    if (draw.status === 'pending') {
      alerts.push({
        id: `act-fantasma-resp-${draw.id}`,
        kind: 'fantasma',
        title: `👻 Sorteio do Fantasma: ${draw.taskLabel}`,
        detail: `${getParticipantName(state, draw.ownerId)} sorteou você! Responda QUERO ou NÃO QUERO.`,
        category: 'drawResults',
        urgent: true,
      });
    } else if (draw.status === 'accepted') {
      alerts.push({
        id: `act-fantasma-done-${draw.id}`,
        kind: 'fantasma',
        title: `👻 Fazer tarefa do Fantasma: ${draw.taskLabel}`,
        detail: 'Você aceitou o sorteio — conclua para ganhar +3 ⭐.',
        category: 'drawResults',
        urgent: true,
      });
    }
  }

  // 2. Pending Fantasma queue (from dice)
  const pendingQueue = day.pendingFantasmaQueue[participantId] || [];
  if (pendingQueue.length > 0) {
    const totalPending = pendingQueue.reduce((sum, q) => sum + q.remaining, 0);
    alerts.push({
      id: `act-fantasma-queue-${dateStr}`,
      kind: 'fantasma',
      title: `👻 ${totalPending} sorteio(s) do Fantasma pendente(s)`,
      detail: 'Escolha a tarefa no card dourado do topo do Painel.',
      category: 'drawResults',
      urgent: true,
    });
  }

  // 3. Unresolved dice power or open dice round window
  for (const round of [1, 2] as const) {
    const diceState = day.dice[participantId]?.[round === 1 ? 'round1' : 'round2'];
    if (!diceState) {
      const winStatus = getDiceWindowStatus(state, dateStr, round, nowHHMM);
      if (winStatus.allowed) {
        alerts.push({
          id: `act-dice-roll-${round}`,
          kind: 'dice',
          title: `🎲 Dado da Rodada ${round} (${round === 1 ? 'Manhã' : 'Tarde'})`,
          detail: `Sua jogada do dado está aberta agora (${winStatus.label}).`,
          category: 'drawResults',
        });
      }
    } else if (!diceState.resolved && diceState.pendingAction) {
      alerts.push({
        id: `act-dice-pending-${round}`,
        kind: 'power',
        title: `⚡ Poder pendente no Dado (Rodada ${round})`,
        detail: 'Ative agora ou guarde em Seus Itens para acumular.',
        category: 'drawResults',
        urgent: true,
      });
    }
  }

  // 4. Accumulated inventory powers usable anytime
  const powerMeta: Array<{ key: PowerType; emoji: string; label: string }> = [
    { key: 'chefe', emoji: '👑', label: 'Chefe' },
    { key: 'coringa', emoji: '🃏', label: 'Coringa' },
    { key: 'fantasma', emoji: '👻', label: 'Fantasma' },
    { key: 'escudo', emoji: '🛡️', label: 'Escudo' },
  ];
  for (const pm of powerMeta) {
    const qty = p.inventory[pm.key] || 0;
    if (qty > 0) {
      alerts.push({
        id: `act-inv-${pm.key}`,
        kind: 'power',
        title: `${pm.emoji} Você tem ${pm.label} (x${qty}) para usar`,
        detail: 'Acumulado nos seus itens — disponível para usar quando quiser.',
        category: 'drawResults',
        powerKey: pm.key,
      });
    }
  }

  // 5. Weekend punishments
  for (const wp of state.weekendPunishments) {
    if (wp.completed) continue;
    if (wp.chosenDay === null && wp.punishedId !== participantId) {
      alerts.push({
        id: `act-pun-choose-${wp.id}`,
        kind: 'punishment',
        title: `⚠️ Escolher dia da punição de ${getParticipantName(state, wp.punishedId)}`,
        detail: `Defina SÁBADO ou DOMINGO para ${wp.taskLabel}.`,
        category: 'punishmentAlerts',
        urgent: true,
      });
    } else if (wp.punishedId === participantId) {
      alerts.push({
        id: `act-pun-mine-${wp.id}`,
        kind: 'punishment',
        title: `⚠️ Punição pendente cobrindo ${getParticipantName(state, wp.coveringForId)}`,
        detail: wp.chosenDay
          ? `Você faz as suas tarefas e as de ${getParticipantName(state, wp.coveringForId)} no ${wp.chosenDay.toUpperCase()} (+1 ⭐ de cada tarefa dela vai automático).`
          : 'Aguardando adversário definir SÁBADO ou DOMINGO.',
        category: 'punishmentAlerts',
      });
    } else if (
      wp.coveringForId === participantId &&
      getActiveWeekendPunishmentForOwner(state, dateStr, participantId)
    ) {
      alerts.push({
        id: `act-pun-beneficiary-${wp.id}`,
        kind: 'punishment',
        title: `⭐ Punição a seu favor hoje: ${getParticipantName(state, wp.punishedId)} faz suas tarefas`,
        detail: `Conforme ${getParticipantName(state, wp.punishedId)} concluir suas tarefas hoje, suas +1 ⭐ entram automaticamente (obs: só tarefas).`,
        category: 'punishmentAlerts',
      });
    }
  }

  // 6. Delegated tasks & Automatic Rescue Cascade + Unlocked tasks
  for (const baseTask of TASK_DEFINITIONS) {
    const t = getEffectiveTaskDefinition(state, baseTask.id);
    const st = day.tasks[t.id];
    if (!st || st.completedBy || st.canceledByFantasma) continue;

    // 6a. Rescue cascade active
    if (st.rescue && !st.rescue.failedStep3) {
      if (st.rescue.currentAssigneeId === participantId) {
        if (st.rescue.step === 3) {
          alerts.push({
            id: `act-rescue-step3-${t.id}`,
            kind: 'fantasma',
            title: `🚨 OBRIGATÓRIO (+6 ⭐): ${t.label}`,
            detail: 'Todos os outros recusaram! Faça para ganhar +6 ⭐ (se não fizer: punição de fim de semana).',
            category: 'drawResults',
            urgent: true,
          });
        } else if (!st.rescue.accepted) {
          alerts.push({
            id: `act-rescue-ask-${t.id}`,
            kind: 'fantasma',
            title: `🎲 Sorteio de repasse (+${st.rescue.rewardStars} ⭐): ${t.label}`,
            detail: `${getParticipantName(state, st.rescue.failedOwnerId)} não fez. Responda QUERO (+${st.rescue.rewardStars} ⭐) ou NÃO QUERO!`,
            category: 'drawResults',
            urgent: true,
          });
        } else {
          alerts.push({
            id: `act-task-rescue-${t.id}`,
            kind: 'task',
            title: `✅ Fazer repasse aceito (+${st.rescue.rewardStars} ⭐): ${t.label}`,
            detail: `Você aceitou o repasse — conclua e marque "Fiz" para ganhar +${st.rescue.rewardStars} ⭐.`,
            category: 'taskReminders',
            urgent: true,
          });
        }
      }
      continue;
    }

    if (st.expiredPenaltyApplied || st.justified) continue;

    // 6b. Delegation lifecycle prompts
    if (st.delegationStage === 'pending_target' && st.delegatedTo === participantId && st.delegatedBy) {
      alerts.push({
        id: `act-del-target-${t.id}`,
        kind: 'fantasma',
        title: `👑 Tarefa delegada: ${t.label}`,
        detail: `${getParticipantName(state, st.delegatedBy)} delegou para você! Responda QUERO (+1 ⭐ para cada) ou NÃO QUERO.`,
        category: 'drawResults',
        urgent: true,
      });
      continue;
    }
    if (st.delegationStage === 'awaiting_owner_draw' && st.delegatedBy === participantId) {
      alerts.push({
        id: `act-del-owner-draw-${t.id}`,
        kind: 'fantasma',
        title: `🎲 Sortear delegação: ${t.label}`,
        detail: `${st.delegationDeclinedBy ? getParticipantName(state, st.delegationDeclinedBy) : 'Participante'} não quis! Clique para sortear entre os outros 2.`,
        category: 'drawResults',
        urgent: true,
      });
      continue;
    }
    if (
      st.delegationStage === 'pending_draw' &&
      (st.delegationDrawnTo || st.delegatedTo) === participantId &&
      st.delegatedBy
    ) {
      alerts.push({
        id: `act-del-draw-resp-${t.id}`,
        kind: 'fantasma',
        title: `🎲 Sorteio de delegação (+2 ⭐): ${t.label}`,
        detail: `${getParticipantName(state, st.delegatedBy)} sorteou você! Responda QUERO (+2 ⭐) ou NÃO QUERO.`,
        category: 'drawResults',
        urgent: true,
      });
      continue;
    }

    if (getTaskResponsibleParticipant(state, day, dateStr, t.id) !== participantId) continue;
    const unlock = isTaskUnlocked(day, t.id, state);
    if (!unlock.unlocked) continue;
    const deadline = getDeadlineForItem(dateStr, t.weekdayLimit, t.weekendLimit);
    const bypassedByPrereq = isDeadlineBypassedByPrerequisite(state, day, dateStr, t.requiresTaskDone);
    const bypassDeadline = Boolean(
      st.delegationStage === 'accepted_draw' ||
        st.delegationStage === 'returned_to_owner' ||
        st.delegationReturnedToOwner ||
        bypassedByPrereq
    );
    if (!bypassDeadline && isTimePastDeadline(nowHHMM, deadline)) continue;

    const isPunishmentCoverage =
      !st.rescue &&
      !st.delegatedBy &&
      Boolean(st.assignedTo && st.assignedTo !== participantId);
    const coveredName = st.assignedTo ? getParticipantName(state, st.assignedTo) : '';
    const rewardStars =
      st.delegationStage === 'accepted_draw' ||
      st.delegationStage === 'returned_to_owner' ||
      st.delegationReturnedToOwner
        ? 2
        : 1;
    alerts.push({
      id: `act-task-${t.id}`,
      kind: 'task',
      title: isPunishmentCoverage
        ? `⚠️ Punição (de ${coveredName}): ${t.label}`
        : `✅ Tarefa liberada (+${rewardStars} ⭐): ${t.label}`,
      detail: isPunishmentCoverage
        ? `Você faz pela punição${deadline ? ` até ${deadline}` : ''} — +1 ⭐ vai automático para ${coveredName}.`
        : st.delegationStage === 'returned_to_owner' || st.delegationReturnedToOwner
        ? 'Voltou para você (dona do card)! Conclua agora para ganhar +2 ⭐.'
        : bypassedByPrereq
        ? `Sem limite hoje — faça a hora que quiser (+${rewardStars} ⭐).`
        : deadline && !bypassDeadline
        ? `Dá para fazer agora · limite até ${deadline} (+${rewardStars} ⭐).`
        : `Dá para fazer agora (+${rewardStars} ⭐).`,
      category: 'taskReminders',
    });
  }

  // 7. Unlocked routines that can be marked right now
  for (const baseRoutine of ROUTINE_DEFINITIONS) {
    const r = getEffectiveRoutineDefinition(state, baseRoutine.id);
    const entry = day.routines[participantId]?.[r.id];
    if (!entry || entry.completed || entry.expiredPenaltyApplied || entry.justified) continue;
    const unlock = isRoutineUnlocked(day, r.id, state);
    if (!unlock.unlocked) continue;
    const deadline = getDeadlineForItem(dateStr, r.weekdayLimit, r.weekendLimit);
    const bypassedByPrereq = isDeadlineBypassedByPrerequisite(state, day, dateStr, r.requiresTaskDone);
    if (!bypassedByPrereq && isTimePastDeadline(nowHHMM, deadline)) continue;
    alerts.push({
      id: `act-routine-${r.id}`,
      kind: 'routine',
      title: `⏰ Rotina liberada: ${r.label}`,
      detail: bypassedByPrereq
        ? 'Sem limite hoje — marque a hora que quiser (+1 ⭐).'
        : deadline
        ? `Marque "Fiz" até ${deadline} (+1 ⭐).`
        : 'Sem limite no fim de semana (+1 ⭐).',
      category: 'taskReminders',
    });
  }

  return alerts;
}
