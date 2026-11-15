import type {
  GameState,
  ParticipantId,
  ParticipantProfile,
  RoutineDefinition,
  RoutineId,
  TaskDefinition,
  TaskId,
} from './types.ts';

export const ROTATION_ORDER: ParticipantId[] = ['tailan', 'carol', 'karine', 'caio'];

export const PARTICIPANT_PROFILES: Record<ParticipantId, ParticipantProfile> = {
  tailan: {
    id: 'tailan',
    name: 'Tailan',
    age: 20,
    avatarUrl: '/src/assets/images/avatar_tailan_1794518177749.jpg',
    accentColor: '#F59E0B',
  },
  carol: {
    id: 'carol',
    name: 'Carol',
    age: 19,
    avatarUrl: '/src/assets/images/avatar_carol_1794518178385.jpg',
    accentColor: '#10B981',
  },
  karine: {
    id: 'karine',
    name: 'Karine',
    age: 16,
    avatarUrl: '/src/assets/images/avatar_karine_1794518179144.jpg',
    accentColor: '#38BDF8',
  },
  caio: {
    id: 'caio',
    name: 'Caio',
    age: 14,
    avatarUrl: '/src/assets/images/avatar_caio_1794518180202.jpg',
    accentColor: '#FB7185',
  },
};

export const ALLOWED_CREDENTIALS: Array<{ id: ParticipantId; name: string; age: number }> = [
  { id: 'tailan', name: 'Tailan', age: 20 },
  { id: 'carol', name: 'Carol', age: 19 },
  { id: 'karine', name: 'Karine', age: 16 },
  { id: 'caio', name: 'Caio', age: 14 },
];

export function getParticipantName(
  source:
    | { participants?: Partial<Record<ParticipantId, { displayName?: string }>> }
    | Partial<Record<ParticipantId, { displayName?: string }>>
    | null
    | undefined,
  id: ParticipantId
): string {
  const map =
    source && typeof source === 'object' && 'participants' in source
      ? source.participants
      : (source as Partial<Record<ParticipantId, { displayName?: string }>> | null | undefined);
  const custom = map?.[id]?.displayName?.trim();
  return custom || PARTICIPANT_PROFILES[id].name;
}

export function getParticipantAvatar(
  source:
    | { participants?: Partial<Record<ParticipantId, { avatarUrl?: string }>> }
    | Partial<Record<ParticipantId, { avatarUrl?: string }>>
    | null
    | undefined,
  id: ParticipantId
): string {
  const map =
    source && typeof source === 'object' && 'participants' in source
      ? source.participants
      : (source as Partial<Record<ParticipantId, { avatarUrl?: string }>> | null | undefined);
  const custom = map?.[id]?.avatarUrl?.trim();
  return custom || PARTICIPANT_PROFILES[id].avatarUrl;
}

export const TASK_DEFINITIONS: TaskDefinition[] = [
  {
    id: 'cafe_manha',
    label: 'Café da manhã',
    weekdayLimit: '06:00',
    weekendLimit: '08:00',
    note: 'Antes das 06:00 · fim de semana 08:00',
  },
  {
    id: 'varrer_manha',
    label: 'Varrer (manhã)',
    weekdayLimit: '09:00',
    weekendLimit: '10:00',
  },
  {
    id: 'almoco',
    label: 'Almoço',
    weekdayLimit: '12:00',
    weekendLimit: '12:30',
  },
  {
    id: 'fogao_almoco',
    label: 'Fogão do almoço',
    weekdayLimit: '13:30',
    weekendLimit: '14:00',
    requiresTaskDone: 'almoco',
    note: 'Só depois do almoço',
  },
  {
    id: 'cafe_tarde',
    label: 'Café da tarde',
    weekdayLimit: '15:00',
    weekendLimit: '15:20',
    note: 'Antes das 15:00 · fim de semana 15:20',
  },
  {
    id: 'varrer_tarde',
    label: 'Varrer (tarde)',
    weekdayLimit: '16:30',
    weekendLimit: '17:30',
  },
  {
    id: 'janta',
    label: 'Janta',
    weekdayLimit: '21:00',
    weekendLimit: '21:30',
  },
  {
    id: 'fogao_janta',
    label: 'Fogão da janta',
    weekdayLimit: '21:30',
    weekendLimit: '22:00',
    requiresTaskDone: 'janta',
    note: 'Só depois da janta',
  },
  {
    id: 'banheiro',
    label: 'Banheiro',
    weekdayLimit: null,
    weekendLimit: null,
  },
  {
    id: 'garrafas',
    label: 'Garrafas',
    weekdayLimit: null,
    weekendLimit: null,
    note: 'Encher as garrafas (sem limite)',
  },
  {
    id: 'roupa',
    label: 'Roupa',
    weekdayLimit: null,
    weekendLimit: null,
    ownerOnly: true,
    note: 'Só quem lava é o próprio dono',
  },
  {
    id: 'organizar',
    label: 'Organizar',
    weekdayLimit: null,
    weekendLimit: null,
  },
  {
    id: 'passar_pano',
    label: 'Passar pano',
    weekdayLimit: null,
    weekendLimit: null,
  },
];

export const ROUTINE_DEFINITIONS: RoutineDefinition[] = [
  {
    id: 'acordar',
    label: 'Acordar',
    weekdayLimit: '07:31',
    weekendLimit: '09:01',
    note: 'Acordar até 07:30 (marcar até 07:31) · fim de semana 09:01',
  },
  {
    id: 'dobrar_lencol',
    label: 'Dobrar o lençol',
    weekdayLimit: '07:40',
    weekendLimit: '09:10',
  },
  {
    id: 'escovar_cafe',
    label: 'Escovar os dentes e tomar café',
    weekdayLimit: '08:20',
    weekendLimit: '10:00',
  },
  {
    id: 'vasilhas_cafe_manha',
    label: 'Lavar as vasilhas do café da manhã',
    weekdayLimit: '08:30',
    weekendLimit: '10:10',
    requiresTaskDone: 'cafe_manha',
    note: 'Libera após Café da manhã concluir',
  },
  {
    id: 'vasilhas_almoco',
    label: 'Lavar as vasilhas do almoço',
    weekdayLimit: '12:10',
    weekendLimit: '12:20',
    requiresTaskDone: 'almoco',
    note: 'Libera após Almoço concluir',
  },
  {
    id: 'vasilhas_cafe_tarde',
    label: 'Lavar as vasilhas do café da tarde',
    weekdayLimit: '15:50',
    weekendLimit: '16:00',
    requiresTaskDone: 'cafe_tarde',
    note: 'Libera após Café da tarde concluir',
  },
  {
    id: 'vasilhas_janta',
    label: 'Lavar as vasilhas da janta',
    weekdayLimit: '22:40',
    weekendLimit: null, // Sábado e domingo pode lavar quando quiser
    requiresTaskDone: 'janta',
    note: 'Libera após Janta concluir · fim de semana sem limite',
  },
];

export const SCALE_START_DATE = '2026-11-11'; // Week 1 Wednesday
export const SCALE_END_DATE = '2026-12-31';

// Week 1 exact template (Qua 11/11 -> Ter 17/11)
const WEEK_1_TABLE: Record<TaskId, Array<ParticipantId | null>> = {
  cafe_manha:   ['karine', 'caio',   'tailan', 'carol',  'karine', 'caio',   'tailan'],
  cafe_tarde:   ['caio',   'carol',  'karine', 'caio',   'tailan', 'carol',  'karine'],
  varrer_manha: ['karine', 'carol',  'karine', 'caio',   'tailan', 'carol',  'karine'],
  varrer_tarde: ['carol',  'caio',   'tailan', 'carol',  'karine', 'caio',   'tailan'],
  almoco:       ['carol',  'karine', 'carol',  'karine', 'caio',   'carol',  'karine'],
  janta:        ['tailan', 'carol',  'karine', 'caio',   'tailan', 'carol',  'karine'],
  fogao_almoco: ['carol',  'karine', 'caio',   'tailan', 'carol',  'karine', 'caio'],
  fogao_janta:  ['karine', 'caio',   'tailan', 'carol',  'karine', 'caio',   'tailan'],
  banheiro:     ['karine', 'caio',   'tailan', 'carol',  'karine', 'caio',   'tailan'],
  garrafas:     ['caio',   'tailan', 'carol',  'karine', 'caio',   'tailan', 'carol'],
  roupa:        ['tailan', 'carol',  'karine', 'caio',   'tailan', 'carol',  'karine'],
  organizar:    ['carol',  'karine', 'caio',   'tailan', 'carol',  'karine', 'caio'],
  passar_pano:  ['carol',  null,     'karine', null,     'caio',   null,     'tailan'],
};

// Week 2 exact template (Qua 18/11 -> Ter 24/11)
const WEEK_2_TABLE: Record<TaskId, Array<ParticipantId | null>> = {
  cafe_manha:   ['carol',  'karine', 'caio',   'tailan', 'carol',  'karine', 'caio'],
  cafe_tarde:   ['caio',   'carol',  'karine', 'caio',   'tailan', 'carol',  'karine'],
  varrer_manha: ['carol',  'karine', 'carol',  'karine', 'caio',   'carol',  'karine'],
  varrer_tarde: ['carol',  'caio',   'tailan', 'carol',  'karine', 'caio',   'tailan'],
  almoco:       ['carol',  'karine', 'carol',  'karine', 'caio',   'carol',  'karine'],
  janta:        ['caio',   'tailan', 'carol',  'karine', 'caio',   'tailan', 'carol'],
  fogao_almoco: ['carol',  'karine', 'caio',   'tailan', 'carol',  'karine', 'caio'],
  fogao_janta:  ['carol',  'karine', 'caio',   'tailan', 'carol',  'karine', 'caio'],
  banheiro:     ['carol',  'karine', 'caio',   'tailan', 'carol',  'karine', 'caio'],
  garrafas:     ['karine', 'caio',   'tailan', 'carol',  'karine', 'caio',   'tailan'],
  roupa:        ['caio',   'tailan', 'carol',  'karine', 'caio',   'tailan', 'carol'],
  organizar:    ['tailan', 'carol',  'karine', 'caio',   'tailan', 'carol',  'karine'],
  passar_pano:  [null,     'carol',  null,     'karine', null,     'caio',   null],
};

function parseDateUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDateUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDayIndexFromStart(dateStr: string): number {
  const start = parseDateUtc(SCALE_START_DATE);
  const current = parseDateUtc(dateStr);
  return Math.floor((current.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

export function isWeekendDate(dateStr: string): boolean {
  const day = parseDateUtc(dateStr).getUTCDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

export function getNextInRotation(id: ParticipantId): ParticipantId {
  const idx = ROTATION_ORDER.indexOf(id);
  return ROTATION_ORDER[(idx + 1) % ROTATION_ORDER.length];
}

export function getOtherParticipants(id: ParticipantId): ParticipantId[] {
  return ROTATION_ORDER.filter((p) => p !== id);
}

/**
 * Computes the exact assignment table for any date from 2026-11-11 through 2026-12-31.
 * Week 1 and Week 2 match the prompt's exact tables.
 * Week 3+ continues rotating each task based on the previous day's participant in Tailan -> Carol -> Karine -> Caio.
 */
export function getScheduleForDate(dateStr: string): Record<TaskId, ParticipantId | null> {
  const dayIndex = getDayIndexFromStart(dateStr);
  const result = {} as Record<TaskId, ParticipantId | null>;

  if (dayIndex < 0) {
    for (const def of TASK_DEFINITIONS) {
      result[def.id] = WEEK_1_TABLE[def.id][0];
    }
    return result;
  }

  if (dayIndex < 7) {
    for (const def of TASK_DEFINITIONS) {
      result[def.id] = WEEK_1_TABLE[def.id][dayIndex];
    }
    return result;
  }

  if (dayIndex < 14) {
    for (const def of TASK_DEFINITIONS) {
      result[def.id] = WEEK_2_TABLE[def.id][dayIndex - 7];
    }
    return result;
  }

  // Week 3+ (dayIndex >= 14): continuous rotation from Day 13 (last day of Week 2)
  const extraDays = dayIndex - 13;
  for (const def of TASK_DEFINITIONS) {
    if (def.id === 'passar_pano') {
      if (dayIndex % 2 === 0) {
        // Active every 2 days: dayIndex 0=Carol, 2=Karine, 4=Caio, 6=Tailan, 8=Carol, ...
        const activeStep = dayIndex / 2;
        result[def.id] = ROTATION_ORDER[(activeStep + 1) % ROTATION_ORDER.length];
      } else {
        result[def.id] = null;
      }
    } else {
      const lastW2 = WEEK_2_TABLE[def.id][6]!;
      const lastIdx = ROTATION_ORDER.indexOf(lastW2);
      result[def.id] = ROTATION_ORDER[(lastIdx + extraDays) % ROTATION_ORDER.length];
    }
  }

  return result;
}

export function buildCalendarDatabase(
  startDate = SCALE_START_DATE,
  endDate = SCALE_END_DATE
): Array<{ dateStr: string; dayOfWeek: string; assignments: Record<TaskId, ParticipantId | null> }> {
  const daysPt = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const entries: Array<{
    dateStr: string;
    dayOfWeek: string;
    assignments: Record<TaskId, ParticipantId | null>;
  }> = [];

  const cur = parseDateUtc(startDate);
  const end = parseDateUtc(endDate);
  while (cur.getTime() <= end.getTime()) {
    const dateStr = formatDateUtc(cur);
    entries.push({
      dateStr,
      dayOfWeek: daysPt[cur.getUTCDay()],
      assignments: getScheduleForDate(dateStr),
    });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return entries;
}

export function formatPortugueseDateHeading(dateStr: string): string {
  const daysFull = [
    'Domingo',
    'Segunda',
    'Terça',
    'Quarta',
    'Quinta',
    'Sexta',
    'Sábado',
  ];
  const monthsFull = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ];
  const d = parseDateUtc(dateStr);
  return `${daysFull[d.getUTCDay()]}, ${d.getUTCDate()} de ${monthsFull[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

export function getDeadlineForItem(
  dateStr: string,
  weekdayLimit: string | null,
  weekendLimit: string | null
): string | null {
  return isWeekendDate(dateStr) ? weekendLimit : weekdayLimit;
}

export function isTimePastDeadline(currentHHMM: string, deadlineHHMM: string | null): boolean {
  if (!deadlineHHMM) return false;
  return currentHHMM > deadlineHHMM;
}

export function getPreviousDateStr(dateStr: string): string {
  const d = parseDateUtc(dateStr);
  d.setUTCDate(d.getUTCDate() - 1);
  return formatDateUtc(d);
}

export function getNextDateStr(dateStr: string): string {
  const d = parseDateUtc(dateStr);
  d.setUTCDate(d.getUTCDate() + 1);
  return formatDateUtc(d);
}

export function getBrazilDateStr(now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // fallback below
  }
  const shifted = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return formatDateUtc(shifted);
}

export function getBrazilClockHHMM(now: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const rawHour = parts.find((p) => p.type === 'hour')?.value || '00';
    const hour = rawHour === '24' ? '00' : rawHour.padStart(2, '0');
    const minute = (parts.find((p) => p.type === 'minute')?.value || '00').padStart(2, '0');
    return `${hour}:${minute}`;
  } catch {
    const shifted = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    return `${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`;
  }
}

export function getEffectiveTaskDefinition(
  state: Pick<GameState, 'taskOverrides'> | null | undefined,
  taskId: TaskId
): TaskDefinition {
  const base = TASK_DEFINITIONS.find((t) => t.id === taskId) || TASK_DEFINITIONS[0];
  const ov = state?.taskOverrides?.[taskId];
  if (!ov) return base;
  return {
    ...base,
    label: ov.label !== undefined ? ov.label : base.label,
    weekdayLimit: ov.weekdayLimit !== undefined ? ov.weekdayLimit : base.weekdayLimit,
    weekendLimit: ov.weekendLimit !== undefined ? ov.weekendLimit : base.weekendLimit,
    note: ov.note !== undefined ? ov.note : base.note,
  };
}

export function getEffectiveRoutineDefinition(
  state: Pick<GameState, 'routineOverrides'> | null | undefined,
  routineId: RoutineId
): RoutineDefinition {
  const base = ROUTINE_DEFINITIONS.find((r) => r.id === routineId) || ROUTINE_DEFINITIONS[0];
  const ov = state?.routineOverrides?.[routineId];
  if (!ov) return base;
  return {
    ...base,
    label: ov.label !== undefined ? ov.label : base.label,
    weekdayLimit: ov.weekdayLimit !== undefined ? ov.weekdayLimit : base.weekdayLimit,
    weekendLimit: ov.weekendLimit !== undefined ? ov.weekendLimit : base.weekendLimit,
    note: ov.note !== undefined ? ov.note : base.note,
  };
}
