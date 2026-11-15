import {
  getScheduleForDate,
  ROTATION_ORDER,
  ROUTINE_DEFINITIONS,
  TASK_DEFINITIONS,
} from './schedule.ts';
import type {
  DayRecord,
  DayTaskState,
  GameNotification,
  GameState,
  ParticipantDayRoutines,
  ParticipantId,
  TaskId,
} from './types.ts';

export function createEmptyDayRecord(dateStr: string): DayRecord {
  const schedule = getScheduleForDate(dateStr);
  const tasks = {} as Record<TaskId, DayTaskState>;
  for (const def of TASK_DEFINITIONS) {
    tasks[def.id] = {
      taskId: def.id,
      assignedTo: schedule[def.id],
      delegatedTo: null,
      delegatedBy: null,
      completedBy: null,
      completedAt: null,
      canceledByFantasma: false,
      fantasmaOwner: null,
      expiredPenaltyApplied: false,
    };
  }

  const routines = {} as Record<ParticipantId, ParticipantDayRoutines>;
  for (const pid of ROTATION_ORDER) {
    routines[pid] = {};
    for (const r of ROUTINE_DEFINITIONS) {
      routines[pid][r.id] = {
        completed: false,
        completedAt: null,
        expiredPenaltyApplied: false,
      };
    }
  }

  return {
    dateStr,
    tasks,
    routines,
    dice: {
      tailan: {},
      carol: {},
      karine: {},
      caio: {},
    },
    diceJustifications: {},
    pendingFantasmaQueue: {
      tailan: [],
      carol: [],
      karine: [],
      caio: [],
    },
    denunciationsUsed: {
      tailan: false,
      carol: false,
      karine: false,
      caio: false,
    },
  };
}

export const DEFAULT_NOTIFICATION_PREFS = {
  taskReminders: true,
  rankingUpdates: true,
  punishmentAlerts: true,
  drawResults: true,
  pushEnabled: true,
  antiOverloadEnabled: true,
  quietHoursEnabled: false,
  quietStart: '23:00',
  quietEnd: '07:00',
  reminderMinutesBefore: 15 as const,
};

export function createInitialSeedState(): GameState {
  const wedStr = '2026-11-11';
  const thuStr = '2026-11-12';
  const friStr = '2026-11-13';

  const wedDay = createEmptyDayRecord(wedStr);
  // Wednesday: all routines and all tasks completed for everyone, no dice rolled
  for (const pid of ROTATION_ORDER) {
    for (const r of ROUTINE_DEFINITIONS) {
      wedDay.routines[pid][r.id] = {
        completed: true,
        completedAt: `2026-11-11T${r.weekdayLimit || '20:00'}:00`,
        expiredPenaltyApplied: false,
      };
    }
  }
  for (const t of TASK_DEFINITIONS) {
    const assignee = wedDay.tasks[t.id].assignedTo;
    if (assignee) {
      wedDay.tasks[t.id].completedBy = assignee;
      wedDay.tasks[t.id].completedAt = `2026-11-11T${t.weekdayLimit || '18:00'}:00`;
    }
  }

  const thuDay = createEmptyDayRecord(thuStr);

  // Thursday routines: Tailan & Carol completed all 7 routines;
  // Karine & Caio missed the 4 morning routines (-1 ⭐ penalty) and completed from almoço onwards.
  const allSeven = [
    'acordar',
    'dobrar_lencol',
    'escovar_cafe',
    'vasilhas_cafe_manha',
    'vasilhas_almoco',
    'vasilhas_cafe_tarde',
    'vasilhas_janta',
  ];
  const firstFour = ['acordar', 'dobrar_lencol', 'escovar_cafe', 'vasilhas_cafe_manha'];
  const afternoonThree = ['vasilhas_almoco', 'vasilhas_cafe_tarde', 'vasilhas_janta'];

  for (const rid of allSeven) {
    thuDay.routines.tailan[rid] = {
      completed: true,
      completedAt: rid === 'vasilhas_almoco' ? '2026-11-12T15:05:00' : '2026-11-12T17:00:00',
    };
    thuDay.routines.carol[rid] = {
      completed: true,
      completedAt: rid === 'vasilhas_almoco' ? '2026-11-12T14:50:00' : '2026-11-12T17:00:00',
    };
  }

  for (const rid of firstFour) {
    thuDay.routines.karine[rid] = {
      completed: false,
      expiredPenaltyApplied: true,
    };
    thuDay.routines.caio[rid] = {
      completed: false,
      expiredPenaltyApplied: true,
    };
  }
  for (const rid of afternoonThree) {
    thuDay.routines.karine[rid] = {
      completed: true,
      completedAt: rid === 'vasilhas_almoco' ? '2026-11-12T14:57:00' : '2026-11-12T17:00:00',
    };
    thuDay.routines.caio[rid] = {
      completed: true,
      completedAt: rid === 'vasilhas_almoco' ? '2026-11-12T15:04:00' : '2026-11-12T17:00:00',
    };
  }

  // Thursday tasks state (all house tasks marked concluded)
  thuDay.tasks.cafe_manha.completedBy = 'caio';
  thuDay.tasks.cafe_manha.completedAt = '2026-11-12T05:50:00';

  thuDay.tasks.varrer_manha.completedBy = 'carol';
  thuDay.tasks.varrer_manha.completedAt = '2026-11-12T12:05:00';

  thuDay.tasks.varrer_tarde.completedBy = 'caio';
  thuDay.tasks.varrer_tarde.completedAt = '2026-11-12T16:15:00';

  thuDay.tasks.almoco.completedBy = 'karine';
  thuDay.tasks.almoco.completedAt = '2026-11-12T12:41:00';

  thuDay.tasks.fogao_almoco.completedBy = 'karine';
  thuDay.tasks.fogao_almoco.completedAt = '2026-11-12T13:15:00';

  thuDay.tasks.janta.completedBy = 'carol';
  thuDay.tasks.janta.completedAt = '2026-11-12T16:50:00';

  thuDay.tasks.fogao_janta.completedBy = 'caio';
  thuDay.tasks.fogao_janta.completedAt = '2026-11-12T17:00:00';

  thuDay.tasks.banheiro.completedBy = 'caio';
  thuDay.tasks.banheiro.completedAt = '2026-11-12T16:30:00';

  thuDay.tasks.roupa.completedBy = 'carol';
  thuDay.tasks.roupa.completedAt = '2026-11-12T16:40:00';

  // Carol used Fantasma (R1) on Café da tarde, and Karine accepted & completed it for +3 ⭐
  thuDay.tasks.cafe_tarde.canceledByFantasma = true;
  thuDay.tasks.cafe_tarde.fantasmaOwner = 'carol';
  thuDay.tasks.cafe_tarde.completedBy = 'karine';
  thuDay.tasks.cafe_tarde.completedAt = '2026-11-12T15:15:00';

  // Karine used Chefe (R1) to delegate Organizar to Caio (accepted & completed by Caio)
  thuDay.tasks.organizar.delegatedBy = 'karine';
  thuDay.tasks.organizar.delegatedTo = 'caio';
  thuDay.tasks.organizar.delegationStage = 'accepted_target';
  thuDay.tasks.organizar.completedBy = 'caio';
  thuDay.tasks.organizar.completedAt = '2026-11-12T16:55:00';

  // Tailan completed Garrafas
  thuDay.tasks.garrafas.completedBy = 'tailan';
  thuDay.tasks.garrafas.completedAt = '2026-11-12T15:34:00';

  // Thursday dice already rolled for Round 1 & Round 2
  thuDay.dice = {
    tailan: {
      round1: { round: 1, face: 3, rolledAt: '2026-11-12T11:46:00', resolved: true, pendingAction: null },
      round2: { round: 2, face: 2, rolledAt: '2026-11-12T15:07:00', resolved: true, pendingAction: null },
    },
    carol: {
      round1: { round: 1, face: 2, rolledAt: '2026-11-12T10:36:00', resolved: true, pendingAction: null },
      round2: { round: 2, face: 6, rolledAt: '2026-11-12T15:11:00', resolved: true, pendingAction: null, chosenPower: 'fantasma' },
    },
    karine: {
      round1: { round: 1, face: 5, rolledAt: '2026-11-12T11:54:00', resolved: true, pendingAction: null },
      round2: { round: 2, face: 6, rolledAt: '2026-11-12T15:11:00', resolved: true, pendingAction: null, chosenPower: 'chefe' },
    },
    caio: {
      round1: { round: 1, face: 5, rolledAt: '2026-11-12T10:14:00', resolved: true, pendingAction: null },
      round2: { round: 2, face: 2, rolledAt: '2026-11-12T15:05:00', resolved: true, pendingAction: null },
    },
  };

  thuDay.pendingFantasmaQueue.carol = [];

  // Friday 2026-11-13:
  // - Tailan missed Café da manhã (-3 ⭐); Carol rescued & completed it (+2 ⭐).
  // - All 4 participants completed all 7 routines (vasilhas do café da manhã liberada sem limite de horário).
  // - Friday dice results recorded & powers accumulated to use anytime (Caio & Karine R2 Face 1 pending target pick).
  const friDay = createEmptyDayRecord(friStr);

  for (const pid of ROTATION_ORDER) {
    for (const r of ROUTINE_DEFINITIONS) {
      friDay.routines[pid][r.id] = {
        completed: true,
        completedAt:
          r.id === 'vasilhas_cafe_manha'
            ? `${friStr}T10:15:00`
            : `${friStr}T${r.weekdayLimit || '20:00'}:00`,
        expiredPenaltyApplied: false,
      };
    }
  }

  friDay.tasks.cafe_manha.expiredPenaltyApplied = true;
  friDay.tasks.cafe_manha.rescue = {
    id: 'rsc-fri-cafe-manha',
    taskId: 'cafe_manha',
    taskLabel: 'Café da manhã',
    failedOwnerId: 'tailan',
    step: 1,
    candidatePool: ['karine', 'caio'],
    currentAssigneeId: 'carol',
    accepted: true,
    rewardStars: 2,
    declinedBy: [],
    assignedAtHHMM: '06:01',
    deadlineHHMM: '07:31',
    failedStep3: false,
  };
  friDay.tasks.cafe_manha.completedBy = 'carol';
  friDay.tasks.cafe_manha.completedAt = `${friStr}T07:20:00`;

  friDay.tasks.varrer_manha.completedBy = 'karine';
  friDay.tasks.varrer_manha.completedAt = `${friStr}T08:45:00`;

  friDay.tasks.almoco.completedBy = 'carol';
  friDay.tasks.almoco.completedAt = `${friStr}T11:50:00`;

  friDay.tasks.fogao_almoco.completedBy = 'caio';
  friDay.tasks.fogao_almoco.completedAt = `${friStr}T13:10:00`;

  friDay.tasks.cafe_tarde.completedBy = 'karine';
  friDay.tasks.cafe_tarde.completedAt = `${friStr}T14:40:00`;

  friDay.tasks.varrer_tarde.completedBy = 'tailan';
  friDay.tasks.varrer_tarde.completedAt = `${friStr}T16:15:00`;

  friDay.tasks.janta.completedBy = 'karine';
  friDay.tasks.janta.completedAt = `${friStr}T20:20:00`;

  friDay.tasks.fogao_janta.completedBy = 'tailan';
  friDay.tasks.fogao_janta.completedAt = `${friStr}T21:10:00`;

  friDay.tasks.banheiro.completedBy = 'tailan';
  friDay.tasks.banheiro.completedAt = `${friStr}T15:00:00`;

  friDay.tasks.garrafas.completedBy = 'carol';
  friDay.tasks.garrafas.completedAt = `${friStr}T14:00:00`;

  friDay.tasks.roupa.completedBy = 'karine';
  friDay.tasks.roupa.completedAt = `${friStr}T16:00:00`;

  friDay.tasks.organizar.completedBy = 'caio';
  friDay.tasks.organizar.completedAt = `${friStr}T17:00:00`;

  friDay.tasks.passar_pano.completedBy = 'karine';
  friDay.tasks.passar_pano.completedAt = `${friStr}T16:30:00`;

  friDay.dice = {
    caio: {
      round1: {
        round: 1,
        face: 6,
        rolledAt: `${friStr}T09:00:00`,
        resolved: true,
        pendingAction: null,
        chosenPower: 'chefe',
      },
      round2: {
        round: 2,
        face: 1,
        rolledAt: `${friStr}T15:00:00`,
        resolved: false,
        pendingAction: 'pick_steal_target',
      },
    },
    tailan: {
      round1: {
        round: 1,
        face: 3,
        rolledAt: `${friStr}T09:05:00`,
        resolved: true,
        pendingAction: null,
      },
      round2: {
        round: 2,
        face: 3,
        rolledAt: `${friStr}T15:05:00`,
        resolved: true,
        pendingAction: null,
      },
    },
    carol: {
      round1: {
        round: 1,
        face: 2,
        rolledAt: `${friStr}T09:10:00`,
        resolved: true,
        pendingAction: null,
      },
      round2: {
        round: 2,
        face: 3,
        rolledAt: `${friStr}T15:10:00`,
        resolved: true,
        pendingAction: null,
      },
    },
    karine: {
      round1: {
        round: 1,
        face: 4,
        rolledAt: `${friStr}T09:15:00`,
        resolved: true,
        pendingAction: null,
      },
      round2: {
        round: 2,
        face: 1,
        rolledAt: `${friStr}T15:15:00`,
        resolved: false,
        pendingAction: 'pick_steal_target',
      },
    },
  };

  // Notifications: strictly current day (Friday 2026-11-13)
  const friNotifications: GameNotification[] = [
    {
      id: 'n-fri-14',
      dateStr: friStr,
      timestamp: '13/11, 15:15',
      createdAtIso: '2026-11-13T15:15:00',
      actorId: 'karine',
      type: 'dice',
      title: 'Karine tirou 1 no dado (tarde)',
      message: 'Ganha 4 ⭐! Escolha o participante de quem quer tirar.',
    },
    {
      id: 'n-fri-13',
      dateStr: friStr,
      timestamp: '13/11, 15:10',
      createdAtIso: '2026-11-13T15:10:00',
      actorId: 'carol',
      type: 'system',
      title: 'Carol acumulou 👻 Fantasma x2 (+1 ⭐)',
      message: 'Face 3 na Rodada 2: +1 ⭐ e 2 Fantasmas guardados nos itens para usar quando quiser.',
      starDelta: 1,
    },
    {
      id: 'n-fri-12',
      dateStr: friStr,
      timestamp: '13/11, 15:05',
      createdAtIso: '2026-11-13T15:05:00',
      actorId: 'tailan',
      type: 'system',
      title: 'Tailan acumulou 👻 Fantasma x2 (+1 ⭐)',
      message: 'Face 3 na Rodada 2: +1 ⭐ e 2 Fantasmas guardados nos itens para usar quando quiser.',
      starDelta: 1,
    },
    {
      id: 'n-fri-11',
      dateStr: friStr,
      timestamp: '13/11, 15:00',
      createdAtIso: '2026-11-13T15:00:00',
      actorId: 'caio',
      type: 'dice',
      title: 'Caio tirou 1 no dado (tarde)',
      message: 'Ganha 4 ⭐! Escolha o participante de quem quer tirar.',
    },
    {
      id: 'n-fri-10d',
      dateStr: friStr,
      timestamp: '13/11, 09:15',
      createdAtIso: '2026-11-13T09:15:00',
      actorId: 'karine',
      type: 'system',
      title: 'Karine acumulou 👻 Fantasma (+1 ⭐)',
      message: 'Face 4 na Rodada 1: +1 ⭐ e 1 Fantasma guardado nos itens para usar quando quiser.',
      starDelta: 1,
    },
    {
      id: 'n-fri-10c',
      dateStr: friStr,
      timestamp: '13/11, 09:10',
      createdAtIso: '2026-11-13T09:10:00',
      actorId: 'carol',
      type: 'dice',
      title: 'Carol tirou 2 no dado (manhã)',
      message: 'Nada acontece na Rodada 1.',
    },
    {
      id: 'n-fri-10b',
      dateStr: friStr,
      timestamp: '13/11, 09:05',
      createdAtIso: '2026-11-13T09:05:00',
      actorId: 'tailan',
      type: 'system',
      title: 'Tailan acumulou 🛡️ Escudo (+1 ⭐)',
      message: 'Face 3 na Rodada 1: +1 ⭐ e 1 Escudo guardado nos itens para usar quando quiser.',
      starDelta: 1,
    },
    {
      id: 'n-fri-10',
      dateStr: friStr,
      timestamp: '13/11, 09:00',
      createdAtIso: '2026-11-13T09:00:00',
      actorId: 'caio',
      type: 'system',
      title: 'Caio escolheu 👑 Chefe no Coringa e acumulou (+1 ⭐)',
      message: 'Face 6 na Rodada 1: +1 ⭐ e 1 Chefe guardado nos itens para usar quando quiser.',
      starDelta: 1,
    },
    {
      id: 'n-fri-9',
      dateStr: friStr,
      timestamp: '13/11, 21:10',
      createdAtIso: '2026-11-13T21:10:00',
      actorId: 'tailan',
      type: 'star',
      title: 'Tailan +1 ⭐',
      message: 'Fogão da janta conquistada por Tailan.',
      starDelta: 1,
    },
    {
      id: 'n-fri-8',
      dateStr: friStr,
      timestamp: '13/11, 20:20',
      createdAtIso: '2026-11-13T20:20:00',
      actorId: 'karine',
      type: 'star',
      title: 'Karine +1 ⭐',
      message: 'Janta conquistada por Karine.',
      starDelta: 1,
    },
    {
      id: 'n-fri-7',
      dateStr: friStr,
      timestamp: '13/11, 17:00',
      createdAtIso: '2026-11-13T17:00:00',
      actorId: 'caio',
      type: 'star',
      title: 'Caio +1 ⭐',
      message: 'Organizar conquistada por Caio.',
      starDelta: 1,
    },
    {
      id: 'n-fri-6',
      dateStr: friStr,
      timestamp: '13/11, 16:30',
      createdAtIso: '2026-11-13T16:30:00',
      actorId: 'karine',
      type: 'star',
      title: 'Todas as rotinas de sexta concluídas (+7 ⭐ cada)',
      message: 'Tailan, Carol, Karine e Caio concluíram todas as 7 rotinas de hoje.',
      starDelta: 7,
    },
    {
      id: 'n-fri-5',
      dateStr: friStr,
      timestamp: '13/11, 14:00',
      createdAtIso: '2026-11-13T14:00:00',
      actorId: 'carol',
      type: 'system',
      title: 'Carol atingiu 35 ⭐!',
      message: 'Desbloqueou a meta 👻 FANTASMA (guardado nos seus itens).',
    },
    {
      id: 'n-fri-4',
      dateStr: friStr,
      timestamp: '13/11, 13:10',
      createdAtIso: '2026-11-13T13:10:00',
      actorId: 'caio',
      type: 'star',
      title: 'Caio +1 ⭐',
      message: 'Fogão do almoço conquistada por Caio.',
      starDelta: 1,
    },
    {
      id: 'n-fri-3',
      dateStr: friStr,
      timestamp: '13/11, 11:50',
      createdAtIso: '2026-11-13T11:50:00',
      actorId: 'carol',
      type: 'star',
      title: 'Carol +1 ⭐',
      message: 'Almoço conquistada por Carol.',
      starDelta: 1,
    },
    {
      id: 'n-fri-2',
      dateStr: friStr,
      timestamp: '13/11, 07:20',
      createdAtIso: '2026-11-13T07:20:00',
      actorId: 'carol',
      type: 'star',
      title: 'Carol +2 ⭐',
      message: 'Concluiu Café da manhã no repasse após falta de Tailan (+2 ⭐).',
      starDelta: 2,
    },
    {
      id: 'n-fri-1',
      dateStr: friStr,
      timestamp: '13/11, 06:01',
      createdAtIso: '2026-11-13T06:01:00',
      actorId: 'tailan',
      type: 'penalty',
      title: 'Tailan -3 ⭐',
      message: 'Não fez Café da manhã no prazo (-3 ⭐). Vasilhas do café da manhã liberadas sem limite de horário.',
      starDelta: -3,
    },
  ];

  return {
    version: 1,
    currentDateStr: friStr,
    simulatedClockTime: null,
    manualDateLocked: false,
    diceDisabledDates: [],
    participants: {
      carol: {
        id: 'carol',
        stars: 37,
        frozenDateStr: null,
        shieldActiveUntil: null,
        inventory: { fantasma: 4, escudo: 0, chefe: 0, coringa: 0 },
        unlockedMilestones: [35],
        milestonesUsedToday: { dateStr: friStr, beforeNoon: 0, afterNoon: 0 },
        notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFS },
        hasPassword: false,
        hasBiometric: false,
      },
      karine: {
        id: 'karine',
        stars: 34,
        frozenDateStr: null,
        shieldActiveUntil: null,
        inventory: { fantasma: 1, escudo: 0, chefe: 1, coringa: 0 },
        unlockedMilestones: [],
        milestonesUsedToday: { dateStr: friStr, beforeNoon: 0, afterNoon: 0 },
        notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFS },
        hasPassword: false,
        hasBiometric: false,
      },
      tailan: {
        id: 'tailan',
        stars: 25,
        frozenDateStr: null,
        shieldActiveUntil: null,
        inventory: { fantasma: 2, escudo: 1, chefe: 0, coringa: 0 },
        unlockedMilestones: [],
        milestonesUsedToday: { dateStr: friStr, beforeNoon: 0, afterNoon: 0 },
        notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFS },
        hasPassword: false,
        hasBiometric: false,
      },
      caio: {
        id: 'caio',
        stars: 22,
        frozenDateStr: null,
        shieldActiveUntil: null,
        inventory: { fantasma: 0, escudo: 0, chefe: 2, coringa: 0 },
        unlockedMilestones: [],
        milestonesUsedToday: { dateStr: friStr, beforeNoon: 0, afterNoon: 0 },
        notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFS },
        hasPassword: false,
        hasBiometric: false,
      },
    },
    days: {
      [wedStr]: wedDay,
      [thuStr]: thuDay,
      [friStr]: friDay,
    },
    fantasmaDraws: [
      {
        id: 'draw-thu-carol-r1',
        dateStr: thuStr,
        round: 2,
        ownerId: 'carol',
        taskId: 'cafe_tarde',
        taskLabel: 'Café da tarde',
        drawnParticipantId: 'karine',
        status: 'completed',
        createdAt: '2026-11-12T15:14:00',
        respondedAt: '2026-11-12T15:15:00',
        completedAt: '2026-11-12T15:15:30',
      },
    ],
    justifications: [],
    denunciations: [],
    weekendPunishments: [],
    notifications: friNotifications,
    chatMessages: [],
    customTasks: [],
    customRules: [],
    taskOverrides: {},
    routineOverrides: {},
  };
}

