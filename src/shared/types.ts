export type ParticipantId = 'tailan' | 'carol' | 'karine' | 'caio';

export type LanguageCode = 'pt-BR' | 'en' | 'es';

export interface ParticipantProfile {
  id: ParticipantId;
  name: string;
  age: number;
  avatarUrl: string;
  accentColor: string;
}

export type TaskId =
  | 'cafe_manha'
  | 'cafe_tarde'
  | 'varrer_manha'
  | 'varrer_tarde'
  | 'almoco'
  | 'janta'
  | 'fogao_almoco'
  | 'fogao_janta'
  | 'banheiro'
  | 'garrafas'
  | 'roupa'
  | 'organizar'
  | 'passar_pano';

export type RoutineId =
  | 'acordar'
  | 'dobrar_lencol'
  | 'escovar_cafe'
  | 'vasilhas_cafe_manha'
  | 'vasilhas_almoco'
  | 'vasilhas_cafe_tarde'
  | 'vasilhas_janta';

export type PowerType = 'fantasma' | 'escudo' | 'chefe' | 'coringa';

export interface TaskDefinition {
  id: TaskId;
  label: string;
  weekdayLimit: string | null; // "HH:MM" or null if no limit
  weekendLimit: string | null;
  requiresTaskDone?: TaskId;
  ownerOnly?: boolean;
  note?: string;
}

export interface RoutineDefinition {
  id: RoutineId;
  label: string;
  weekdayLimit: string | null;
  weekendLimit: string | null;
  requiresTaskDone?: TaskId;
  note?: string;
}

export type DelegationStage =
  | 'pending_target'
  | 'accepted_target'
  | 'awaiting_owner_draw'
  | 'pending_draw'
  | 'accepted_draw'
  | 'returned_to_owner';

export interface TaskRescueState {
  id: string;
  taskId: TaskId;
  taskLabel: string;
  failedOwnerId: ParticipantId;
  step: 1 | 2 | 3; // 1 = +2⭐ (3 candidates), 2 = +3⭐ (2 candidates), 3 = +6⭐ mandatory (1 remaining)
  candidatePool: ParticipantId[];
  currentAssigneeId: ParticipantId;
  accepted: boolean;
  rewardStars: 2 | 3 | 6;
  declinedBy: ParticipantId[];
  assignedAtHHMM: string;
  deadlineHHMM: string | null;
  failedStep3?: boolean;
}

export interface DayTaskState {
  taskId: TaskId;
  assignedTo: ParticipantId | null; // original assignee from scale
  delegatedTo?: ParticipantId | null;
  delegatedBy?: ParticipantId | null;
  delegationStage?: DelegationStage | null;
  delegationDeclinedBy?: ParticipantId | null;
  delegationDrawnTo?: ParticipantId | null;
  delegationReturnedToOwner?: boolean;
  delegationReturnDeadlineHHMM?: string | null;
  rescue?: TaskRescueState | null;
  completedBy?: ParticipantId | null;
  completedAt?: string | null;
  canceledByFantasma?: boolean;
  fantasmaOwner?: ParticipantId | null;
  expiredPenaltyApplied?: boolean;
  justified?: boolean;
  weekendPunishmentFor?: ParticipantId | null;
}

export interface ParticipantDayRoutines {
  [routineId: string]: {
    completed: boolean;
    completedAt?: string | null;
    expiredPenaltyApplied?: boolean;
    justified?: boolean;
  };
}

export interface DiceRollState {
  round: 1 | 2;
  face: 1 | 2 | 3 | 4 | 5 | 6;
  rolledAt: string;
  resolved: boolean;
  pendingAction?:
    | 'activate_shield'
    | 'pick_fantasma_task'
    | 'pick_chefe_target'
    | 'pick_coringa_power'
    | 'pick_steal_target'
    | null;
  remainingUses?: number; // e.g., 2 for R2 Fantasma or R2 Chefe
  usedTargets?: ParticipantId[];
  starAwarded?: boolean;
  chosenPower?: PowerType;
}

export interface FantasmaDraw {
  id: string;
  dateStr: string;
  round: 1 | 2;
  ownerId: ParticipantId;
  taskId: TaskId;
  taskLabel: string;
  drawnParticipantId: ParticipantId;
  status: 'pending' | 'accepted' | 'declined' | 'completed' | 'denounced';
  createdAt: string;
  respondedAt?: string | null;
  completedAt?: string | null;
}

export interface JustificationEntry {
  id: string;
  dateStr: string;
  participantId: ParticipantId;
  reason: 'doente' | 'saiu' | 'outro';
  details: string;
  routineIds?: RoutineId[];
  createdAt: string;
}

export interface DenunciationEntry {
  id: string;
  dateStr: string;
  reporterId: ParticipantId;
  targetId: ParticipantId;
  category: 'tarefa' | 'rotina';
  itemId: string;
  itemLabel: string;
  details: string;
  createdAt: string;
}

export interface WeekendPunishment {
  id: string;
  dateStr: string; // day missed
  punishedId: ParticipantId;
  coveringForId: ParticipantId; // next participant in cycle
  deciderId: ParticipantId; // adversary who chooses SÁBADO or DOMINGO
  taskId: TaskId;
  taskLabel: string;
  chosenDay: 'sabado' | 'domingo' | null;
  completed: boolean;
  createdAt: string;
}

export type ChatReactionMap = Record<string, ParticipantId[]>;

export interface ChatMessage {
  id: string;
  senderId: ParticipantId;
  text: string;
  kind?: 'text' | 'reaction_burst' | 'audio';
  audioUrl?: string;
  audioDurationSec?: number;
  replyToId?: string | null;
  reactions: ChatReactionMap;
  createdAtIso: string;
  timestamp: string;
  editedAtIso?: string;
  editedAt?: string;
}

export interface GameNotification {
  id: string;
  dateStr: string;
  timestamp: string; // e.g. "12/11, 15:34"
  createdAtIso: string;
  actorId?: ParticipantId;
  targetId?: ParticipantId;
  type: 'star' | 'penalty' | 'dice' | 'fantasma' | 'chefe' | 'escudo' | 'denuncia' | 'punishment' | 'rescue' | 'system';
  title: string;
  message: string;
  starDelta?: number;
  reactions?: ChatReactionMap;
}

export type NotificationCategory =
  | 'taskReminders'
  | 'rankingUpdates'
  | 'punishmentAlerts'
  | 'drawResults';

export type SoundThemeId =
  | 'classico'
  | 'cristal'
  | 'arcade'
  | 'marimba'
  | 'festa'
  | 'suave';

export interface NotificationPreferences {
  taskReminders: boolean;
  rankingUpdates: boolean;
  punishmentAlerts: boolean;
  drawResults: boolean;
  pushEnabled: boolean;
  antiOverloadEnabled: boolean;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  reminderMinutesBefore: 10 | 15 | 30;
}

export interface ParticipantGameState {
  id: ParticipantId;
  stars: number;
  frozenDateStr: string | null; // frozen for rest of day on R2 face 4
  shieldActiveUntil: string | null; // ISO timestamp or "2026-11-12T12:00" or "2026-11-12T23:59"
  inventory: {
    fantasma: number;
    escudo: number;
    chefe: number;
    coringa: number;
  };
  unlockedMilestones: number[]; // e.g., [35, 45, 55, 65]
  milestonesUsedToday: {
    dateStr: string;
    beforeNoon: number;
    afterNoon: number;
  };
  notificationPreferences: NotificationPreferences;
  hasPassword: boolean;
  hasBiometric: boolean;
  displayName?: string;
  avatarUrl?: string;
  soundTheme?: SoundThemeId;
  reactions?: ChatReactionMap;
}

export interface DiceJustificationEntry {
  text: string;
  updatedAt: string; // YYYY-MM-DDTHH:MM:00
}

export interface DayRecord {
  dateStr: string; // YYYY-MM-DD
  tasks: Record<TaskId, DayTaskState>;
  routines: Record<ParticipantId, ParticipantDayRoutines>;
  dice: Record<ParticipantId, { round1?: DiceRollState; round2?: DiceRollState }>;
  diceJustifications?: Partial<Record<ParticipantId, DiceJustificationEntry>>;
  pendingFantasmaQueue: Record<ParticipantId, Array<{ round: 1 | 2; remaining: number }>>;
  denunciationsUsed: Record<ParticipantId, boolean>;
}

export interface CloudBackupSnapshot {
  id: string;
  label: string;
  createdAt: string;
  createdBy: ParticipantId | 'system';
  starSummary: Record<ParticipantId, number>;
}

export interface CustomGameTask {
  id: string;
  dateStr: string; // YYYY-MM-DD or 'all'
  title: string;
  description?: string;
  assignedTo: ParticipantId | 'all';
  starReward: number;
  deadlineHHMM?: string | null;
  completedBy?: ParticipantId | null;
  completedAt?: string | null;
  createdAt: string;
}

export interface CustomGameRule {
  id: string;
  title: string;
  description: string;
  category: 'geral' | 'tarefa' | 'dado' | 'punicao' | 'premio';
  createdAt: string;
}

export interface TaskDefinitionOverride {
  label?: string;
  weekdayLimit?: string | null;
  weekendLimit?: string | null;
  note?: string;
}

export interface RoutineDefinitionOverride {
  label?: string;
  weekdayLimit?: string | null;
  weekendLimit?: string | null;
  note?: string;
}

export interface GameState {
  version: number;
  currentDateStr: string;
  simulatedClockTime: string | null; // null = real time, or "HH:MM" override from admin
  manualDateLocked?: boolean;
  diceDisabledDates?: string[];
  participants: Record<ParticipantId, ParticipantGameState>;
  days: Record<string, DayRecord>;
  fantasmaDraws: FantasmaDraw[];
  justifications: JustificationEntry[];
  denunciations: DenunciationEntry[];
  weekendPunishments: WeekendPunishment[];
  notifications: GameNotification[];
  chatMessages: ChatMessage[];
  goalBannerText?: string;
  publicAppUrl?: string | null;
  customTasks?: CustomGameTask[];
  customRules?: CustomGameRule[];
  taskOverrides?: Partial<Record<TaskId, TaskDefinitionOverride>>;
  routineOverrides?: Partial<Record<RoutineId, RoutineDefinitionOverride>>;
}

