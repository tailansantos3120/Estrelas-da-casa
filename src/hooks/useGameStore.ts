import { useCallback, useEffect, useRef, useState } from 'react';
import { clearLocalBiometricData } from '../services/biometricAuth.ts';
import {
  computeTotalStarGain,
  computeTotalStarLoss,
  countTotalReactions,
  ensureAudioUnlockListeners,
  extractStarsMap,
  getActiveSoundTheme,
  isSoundEffectsEnabled,
  playChatReceiveEffect,
  playErrorEffect,
  playPenaltyEffect,
  playRankClimbEffect,
  playReactionEffect,
  playSoundForActionType,
  playStarEarnedEffect,
  setActiveSoundTheme,
  setSoundEffectsEnabled,
  unlockCelebrationAudio,
} from '../services/starCelebrationAudio.ts';
import {
  computeActionableAlerts,
  computeTimelyReminders,
  filterCurrentDayNotifications,
  isWithinQuietHours,
  shouldDeliverNotification,
} from '../shared/notificationFilter.ts';
import { createInitialSeedState } from '../shared/seedState.ts';
import {
  computeRankedOrder,
  detectRankOvertakes,
  extractRankStars,
  type RankOvertakeEvent,
} from '../shared/rankTracker.ts';
import { getBrazilClockHHMM, getBrazilDateStr } from '../shared/schedule.ts';
import type {
  CloudBackupSnapshot,
  GameNotification,
  GameState,
  ParticipantId,
  SoundThemeId,
} from '../shared/types.ts';

const STORAGE_STATE_KEY = 'estrelas_cached_state_v1';
const STORAGE_AUTH_KEY = 'estrelas_auth_session_v1';
const STORAGE_LAST_USER_KEY = 'estrelas_last_user_v1';
const STORAGE_PENDING_ACTIONS_KEY = 'estrelas_pending_actions_v1';

const RETRYABLE_ACTION_TYPES = new Set([
  'complete_routine',
  'complete_task',
  'complete_custom_task',
  'update_display_name',
  'update_avatar',
  'update_sound_theme',
  'update_notif_prefs',
  'save_dice_justification',
]);

interface AuthSession {
  participantId: ParticipantId;
  token: string;
}

interface PendingQueuedAction {
  id: string;
  participantId: ParticipantId;
  type: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

function loadPendingActions(participantId?: ParticipantId): PendingQueuedAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_PENDING_ACTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PendingQueuedAction =>
        Boolean(item?.id && item?.type && item?.participantId) &&
        (!participantId || item.participantId === participantId)
    );
  } catch {
    return [];
  }
}

function savePendingActions(items: PendingQueuedAction[]) {
  try {
    if (items.length === 0) {
      localStorage.removeItem(STORAGE_PENDING_ACTIONS_KEY);
    } else {
      localStorage.setItem(STORAGE_PENDING_ACTIONS_KEY, JSON.stringify(items));
    }
  } catch {
    // ignore storage quota errors
  }
}

function cloneGameState(state: GameState): GameState {
  return typeof structuredClone === 'function'
    ? structuredClone(state)
    : (JSON.parse(JSON.stringify(state)) as GameState);
}

function applyPendingMutationToDraft(draft: GameState, item: PendingQueuedAction) {
  const pid = item.participantId;
  const dateStr = String(item.payload.dateStr || draft.currentDateStr);
  const participant = draft.participants[pid];
  if (!participant) return;

  if (item.type === 'complete_routine') {
    const routineId = item.payload.routineId as keyof NonNullable<GameState['days'][string]['routines'][ParticipantId]>;
    const entry = draft.days[dateStr]?.routines?.[pid]?.[routineId];
    if (entry && !entry.completed && !entry.justified && !entry.expiredPenaltyApplied) {
      entry.completed = true;
      entry.completedAt = `${dateStr}T${String(item.payload.nowHHMM || '12:00')}:00`;
      if (participant.frozenDateStr !== dateStr) {
        participant.stars += 1;
      }
    }
  } else if (item.type === 'complete_task') {
    const taskId = item.payload.taskId as keyof GameState['days'][string]['tasks'];
    const st = draft.days[dateStr]?.tasks?.[taskId];
    if (st && !st.completedBy && !st.canceledByFantasma) {
      st.completedBy = pid;
      st.completedAt = `${dateStr}T${String(item.payload.nowHHMM || '12:00')}:00`;
      const isPunishmentCoverage =
        !st.rescue &&
        !st.delegatedBy &&
        Boolean(st.assignedTo && st.assignedTo !== pid);
      if (isPunishmentCoverage && st.assignedTo && draft.participants[st.assignedTo]) {
        st.weekendPunishmentFor = st.assignedTo;
        if (draft.participants[st.assignedTo].frozenDateStr !== dateStr) {
          draft.participants[st.assignedTo].stars += 1;
        }
      } else if (participant.frozenDateStr !== dateStr) {
        const reward = st.rescue
          ? st.rescue.rewardStars
          : st.delegationStage === 'accepted_draw' ||
            st.delegationStage === 'returned_to_owner' ||
            st.delegationReturnedToOwner
          ? 2
          : 1;
        participant.stars += reward;
        if (
          !st.rescue &&
          st.delegationStage === 'accepted_target' &&
          st.delegatedBy &&
          draft.participants[st.delegatedBy] &&
          draft.participants[st.delegatedBy].frozenDateStr !== dateStr
        ) {
          draft.participants[st.delegatedBy].stars += 1;
        }
      }
    }
  } else if (item.type === 'complete_custom_task') {
    const customTaskId = String(item.payload.customTaskId || '');
    const ct = (draft.customTasks || []).find((t) => t.id === customTaskId);
    if (ct && !ct.completedBy) {
      ct.completedBy = pid;
      ct.completedAt = `${dateStr}T${String(item.payload.nowHHMM || '12:00')}:00`;
      if (participant.frozenDateStr !== dateStr) {
        participant.stars += ct.starReward || 1;
      }
    }
  } else if (item.type === 'update_display_name') {
    const rawName = String(item.payload.name || '').trim().replace(/\s+/g, ' ');
    if (rawName.length >= 2 && rawName.length <= 24) {
      participant.displayName = rawName;
    }
  } else if (item.type === 'update_avatar') {
    const avatarUrl = item.payload.avatarUrl;
    participant.avatarUrl = avatarUrl == null ? undefined : String(avatarUrl);
  } else if (item.type === 'update_sound_theme') {
    if (typeof item.payload.soundTheme === 'string') {
      participant.soundTheme = item.payload.soundTheme as SoundThemeId;
    }
  } else if (item.type === 'update_notif_prefs' && item.payload.preferences) {
    participant.notificationPreferences = {
      ...participant.notificationPreferences,
      ...(item.payload.preferences as GameState['participants'][ParticipantId]['notificationPreferences']),
    };
  } else if (item.type === 'save_dice_justification') {
    const day = draft.days[dateStr];
    if (day) {
      if (!day.diceJustifications) day.diceJustifications = {};
      const text = String(item.payload.text || '').trim().replace(/\s+/g, ' ');
      if (!text) {
        delete day.diceJustifications[pid];
      } else {
        day.diceJustifications[pid] = {
          text: text.slice(0, 300),
          updatedAt: `${dateStr}T${String(item.payload.nowHHMM || '12:00')}:00`,
        };
      }
    }
  }
}

function getLocalHHMM(state: GameState): string {
  if (state.simulatedClockTime) return state.simulatedClockTime;
  return getBrazilClockHHMM();
}

function sanitizeStateForCurrentDay(state: GameState): GameState {
  const filtered = filterCurrentDayNotifications(state.notifications || [], state.currentDateStr);
  const hasChatArray = Array.isArray(state.chatMessages);
  const hasCustomTasks = Array.isArray(state.customTasks);
  const hasCustomRules = Array.isArray(state.customRules);
  const hasTaskOverrides = Boolean(state.taskOverrides && typeof state.taskOverrides === 'object');
  const hasRoutineOverrides = Boolean(
    state.routineOverrides && typeof state.routineOverrides === 'object'
  );
  const hasDiceDisabled = Array.isArray(state.diceDisabledDates);
  if (
    filtered.length === (state.notifications || []).length &&
    hasChatArray &&
    hasCustomTasks &&
    hasCustomRules &&
    hasTaskOverrides &&
    hasRoutineOverrides &&
    hasDiceDisabled
  ) {
    return state;
  }
  return {
    ...state,
    notifications: filtered,
    chatMessages: hasChatArray ? state.chatMessages : [],
    customTasks: hasCustomTasks ? state.customTasks : [],
    customRules: hasCustomRules ? state.customRules : [],
    taskOverrides: hasTaskOverrides ? state.taskOverrides : {},
    routineOverrides: hasRoutineOverrides ? state.routineOverrides : {},
    diceDisabledDates: hasDiceDisabled ? state.diceDisabledDates : [],
    manualDateLocked: Boolean(state.manualDateLocked),
  };
}

export function useGameStore() {
  const [gameState, setGameState] = useState<GameState>(() => {
    try {
      const cached = localStorage.getItem(STORAGE_STATE_KEY);
      if (cached) return sanitizeStateForCurrentDay(JSON.parse(cached) as GameState);
    } catch {
      // ignore
    }
    return createInitialSeedState();
  });

  const [session, setSession] = useState<AuthSession | null>(() => {
    try {
      localStorage.removeItem('estrelas_offline_queue_v1');
      const saved = localStorage.getItem(STORAGE_AUTH_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AuthSession;
        if (parsed?.token === 'offline-local') {
          localStorage.removeItem(STORAGE_AUTH_KEY);
          return null;
        }
        return parsed;
      }
    } catch {
      // ignore
    }
    return null;
  });

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toast, setToast] = useState<{ id: string; title: string; message: string; tone?: 'gold' | 'error' | 'success' } | null>(null);
  const [backups, setBackups] = useState<CloudBackupSnapshot[]>([]);

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => isSoundEffectsEnabled());
  const [rankClimbs, setRankClimbs] = useState<Partial<Record<ParticipantId, RankOvertakeEvent>>>({});

  const deliveredNotifIds = useRef<Set<string>>(new Set());
  const deliveredChatIds = useRef<Set<string>>(new Set());
  const deliveredKeysTimestamps = useRef<Map<string, number>>(new Map());
  const reminderSentKeys = useRef<Set<string>>(new Set());
  const lastActionableNotifyAt = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const serverVersionRef = useRef<string | null>(null);
  const serverRevisionRef = useRef<number>(0);
  const inFlightMutationsRef = useRef<number>(0);
  const actionQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const isFlushingQueueRef = useRef<boolean>(false);
  const pendingQueueRef = useRef<PendingQueuedAction[]>(loadPendingActions());
  const latestStateRef = useRef<GameState>(gameState);
  latestStateRef.current = gameState;
  const sessionRef = useRef<AuthSession | null>(session);
  sessionRef.current = session;
  const lastKnownStarsRef = useRef<Record<ParticipantId, number>>(extractStarsMap(gameState));
  const lastRankedOrderRef = useRef<ParticipantId[]>(computeRankedOrder(gameState));
  const lastReactionCountRef = useRef<number>(countTotalReactions(gameState));
  const suppressRemoteReactionUntilRef = useRef<number>(0);
  const suppressRemotePenaltyUntilRef = useRef<number>(0);
  const rankClimbTimersRef = useRef<Partial<Record<ParticipantId, ReturnType<typeof setTimeout>>>>({});

  useEffect(() => {
    ensureAudioUnlockListeners();
  }, []);

  useEffect(() => {
    if (!session) return;
    const pid = session.participantId;
    const serverTheme = gameState.participants[pid]?.soundTheme;
    const resolvedTheme = serverTheme || getActiveSoundTheme(pid);
    setActiveSoundTheme(resolvedTheme, pid);
  }, [session, gameState.participants]);

  const toggleSoundEnabled = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      setSoundEffectsEnabled(next);
      if (next) {
        unlockCelebrationAudio();
        playStarEarnedEffect(1);
      }
      return next;
    });
  }, []);

  const showToast = useCallback(
    (title: string, message: string, tone: 'gold' | 'error' | 'success' = 'gold') => {
      const id = `${Date.now()}-${Math.random()}`;
      setToast({ id, title, message, tone });
      setTimeout(() => {
        setToast((cur) => (cur?.id === id ? null : cur));
      }, 4200);
    },
    []
  );

  const handleAuthExpired = useCallback(() => {
    localStorage.removeItem(STORAGE_AUTH_KEY);
    setSession(null);
    showToast('Sessão expirada', 'Entre novamente com sua biometria ou senha.', 'error');
  }, [showToast]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantId: session.participantId,
        token: session.token,
      }),
    })
      .then((res) => {
        if (!cancelled && res.status === 401) {
          handleAuthExpired();
        }
      })
      .catch(() => {
        // ignore temporary network errors
      });
    return () => {
      cancelled = true;
    };
  }, [session?.participantId, session?.token, handleAuthExpired]);

  const triggerSystemPush = useCallback((_title: string, _body: string, _tag: string) => {
    // External browser/device push notifications disabled: alerts stay strictly inside the game.
  }, []);

  const clearRankClimb = useCallback((pid: ParticipantId) => {
    const existingTimer = rankClimbTimersRef.current[pid];
    if (existingTimer) {
      clearTimeout(existingTimer);
      delete rankClimbTimersRef.current[pid];
    }
    setRankClimbs((prev) => {
      if (!prev[pid]) return prev;
      const next = { ...prev };
      delete next[pid];
      return next;
    });
  }, []);

  const applyPendingQueueOverlay = useCallback((state: GameState): GameState => {
    const activePid = sessionRef.current?.participantId;
    const queued = activePid
      ? pendingQueueRef.current.filter((item) => item.participantId === activePid)
      : pendingQueueRef.current;
    if (queued.length === 0) return state;
    const draft = cloneGameState(state);
    for (const item of queued) {
      applyPendingMutationToDraft(draft, item);
    }
    return draft;
  }, []);

  const persistStateLocally = useCallback(
    (next: GameState, options?: { celebrateStarGain?: boolean; applyQueueOverlay?: boolean }) => {
      const overlaid = options?.applyQueueOverlay !== false ? applyPendingQueueOverlay(next) : next;
      const clean = sanitizeStateForCurrentDay(overlaid);
      const prevStars = lastKnownStarsRef.current;
      const prevOrder = lastRankedOrderRef.current;
      const prevReactionCount = lastReactionCountRef.current;
      const nextStars = extractStarsMap(clean);
      const nextOrder = computeRankedOrder(clean);
      const nextReactionCount = countTotalReactions(clean);
      const gain = computeTotalStarGain(prevStars, clean);
      const loss = computeTotalStarLoss(prevStars, clean);

      lastKnownStarsRef.current = nextStars;
      lastRankedOrderRef.current = nextOrder;
      lastReactionCountRef.current = nextReactionCount;
      latestStateRef.current = clean;

      if (options?.celebrateStarGain && sessionRef.current) {
        if (gain.totalGain > 0) {
          playStarEarnedEffect(gain.maxSingleGain);
        } else if (
          loss.totalLoss > 0 &&
          Date.now() > suppressRemotePenaltyUntilRef.current
        ) {
          playPenaltyEffect();
        }
        if (
          nextReactionCount > prevReactionCount &&
          Date.now() > suppressRemoteReactionUntilRef.current
        ) {
          playReactionEffect(true);
        }
        const overtakes = detectRankOvertakes(
          prevOrder,
          nextOrder,
          prevStars,
          extractRankStars(clean)
        );
        if (overtakes.length > 0) {
          playRankClimbEffect(gain.totalGain > 0 ? 240 : 40);
          setRankClimbs((prev) => {
            const updated = { ...prev };
            for (const ev of overtakes) {
              updated[ev.participantId] = ev;
              const oldTimer = rankClimbTimersRef.current[ev.participantId];
              if (oldTimer) clearTimeout(oldTimer);
              rankClimbTimersRef.current[ev.participantId] = setTimeout(() => {
                setRankClimbs((curr) => {
                  if (!curr[ev.participantId] || curr[ev.participantId]?.timestamp !== ev.timestamp) {
                    return curr;
                  }
                  const copy = { ...curr };
                  delete copy[ev.participantId];
                  return copy;
                });
              }, 25_000);
            }
            return updated;
          });
        }
      }

      setGameState(clean);
      try {
        localStorage.setItem(STORAGE_STATE_KEY, JSON.stringify(clean));
      } catch {
        // ignore storage quota errors
      }
    },
    [applyPendingQueueOverlay]
  );

  const handleIncomingNotification = useCallback(
    (notif: GameNotification, nextState: GameState) => {
      if (!session) return;
      if (notif.dateStr !== nextState.currentDateStr) return;
      if (deliveredNotifIds.current.has(notif.id)) return;
      deliveredNotifIds.current.add(notif.id);

      const userState = nextState.participants[session.participantId];
      if (!userState) return;

      const check = shouldDeliverNotification(
        notif,
        userState.notificationPreferences,
        getLocalHHMM(nextState),
        deliveredKeysTimestamps.current,
        Date.now(),
        nextState.currentDateStr
      );
      if (!check.deliver) return;

      deliveredKeysTimestamps.current.set(
        `${notif.type}:${notif.actorId || ''}:${notif.title}`,
        Date.now()
      );
      showToast(notif.title, notif.message, notif.type === 'penalty' || notif.type === 'denuncia' ? 'error' : 'gold');
      if (userState.notificationPreferences.pushEnabled) {
        triggerSystemPush(notif.title, notif.message, notif.id);
      }
    },
    [session, showToast, triggerSystemPush]
  );

  const syncVersionWithServer = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      const res = await fetch(`/api/version?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.version) return;
      if (!serverVersionRef.current) {
        serverVersionRef.current = String(data.version);
        return;
      }
      if (serverVersionRef.current !== String(data.version)) {
        serverVersionRef.current = String(data.version);
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            await reg.update().catch(() => {});
          }
        }
        try {
          const now = Date.now();
          const lastReload = Number(sessionStorage.getItem('estrelas_ver_reload_at') || '0');
          if (now - lastReload > 15_000) {
            sessionStorage.setItem('estrelas_ver_reload_at', String(now));
            window.location.reload();
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore temporary network errors
    }
  }, []);

  const flushPendingActions = useCallback(async () => {
    const activeSession = sessionRef.current;
    if (!activeSession) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (isFlushingQueueRef.current) return;
    const allPending = pendingQueueRef.current;
    if (allPending.length === 0) return;

    isFlushingQueueRef.current = true;
    inFlightMutationsRef.current += 1;
    try {
      while (true) {
        const currentSession = sessionRef.current;
        if (!currentSession) break;
        const nextIndex = pendingQueueRef.current.findIndex(
          (item) => item.participantId === currentSession.participantId
        );
        if (nextIndex === -1) break;
        const item = pendingQueueRef.current[nextIndex];

        try {
          const res = await fetch('/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: item.type,
              participantId: currentSession.participantId,
              token: currentSession.token,
              payload: { ...item.payload, isRetry: true },
            }),
          });

          if (res.status === 401) {
            handleAuthExpired();
            break;
          }

          if (res.status >= 500) {
            break;
          }

          const data = await res.json();
          if (typeof data.stateRevision === 'number') {
            serverRevisionRef.current = Math.max(serverRevisionRef.current, data.stateRevision);
          }

          // Remove from queue on either ok:true or authoritative 400 rejection
          pendingQueueRef.current = pendingQueueRef.current.filter((q) => q.id !== item.id);
          savePendingActions(pendingQueueRef.current);

          if (!res.ok || !data.ok) {
            if (data.state) {
              persistStateLocally(data.state);
            }
            showToast('Atenção', data.error || 'Não foi possível concluir uma ação pendente.', 'error');
          } else if (data.state) {
            persistStateLocally(data.state);
          }
        } catch {
          break;
        }
      }
    } finally {
      inFlightMutationsRef.current = Math.max(0, inFlightMutationsRef.current - 1);
      isFlushingQueueRef.current = false;
    }
  }, [handleAuthExpired, persistStateLocally, showToast]);

  const silentRefreshFromServer = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    if (inFlightMutationsRef.current > 0) return;
    try {
      const res = await fetch(`/api/state?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (inFlightMutationsRef.current > 0) return;
        const incomingRev = typeof data.stateRevision === 'number' ? data.stateRevision : 0;
        if (incomingRev > 0 && incomingRev < serverRevisionRef.current) return;
        if (incomingRev > 0) {
          serverRevisionRef.current = incomingRev;
        }
        if (data.state) {
          persistStateLocally(data.state);
        }
      }
    } catch {
      // keep last known state until connection returns
    }
  }, [persistStateLocally]);

  const refreshFromServer = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await flushPendingActions();
      await silentRefreshFromServer();
      await syncVersionWithServer();
    } finally {
      setIsRefreshing(false);
    }
  }, [flushPendingActions, silentRefreshFromServer, syncVersionWithServer]);

  // Initial fetch & WebSocket real-time connection
  useEffect(() => {
    refreshFromServer();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByCleanup = false;

    function connectWs() {
      if (closedByCleanup) return;
      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        void flushPendingActions();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if ((msg.type === 'state:init' || msg.type === 'state:update') && msg.state) {
            const incomingRev = typeof msg.stateRevision === 'number' ? msg.stateRevision : 0;
            if (incomingRev > 0 && incomingRev < serverRevisionRef.current) {
              return;
            }
            if (inFlightMutationsRef.current > 0) {
              return;
            }
            if (incomingRev > 0) {
              serverRevisionRef.current = incomingRev;
            }
            const nextState = msg.state as GameState;
            // Seed known IDs on init so we don't fire historical notifications as popups
            if (msg.type === 'state:init') {
              (nextState.notifications || []).forEach((n) => deliveredNotifIds.current.add(n.id));
              (nextState.chatMessages || []).forEach((m) => deliveredChatIds.current.add(m.id));
              persistStateLocally(nextState, { celebrateStarGain: false });
            } else {
              if (msg.latestNotifId) {
                const latest = (nextState.notifications || []).find((n) => n.id === msg.latestNotifId);
                if (latest) {
                  handleIncomingNotification(latest, nextState);
                }
              }
              if (msg.latestChatMsgId && sessionRef.current) {
                const latestChat = (nextState.chatMessages || []).find(
                  (m) => m.id === msg.latestChatMsgId
                );
                if (
                  latestChat &&
                  latestChat.senderId !== sessionRef.current.participantId &&
                  !deliveredChatIds.current.has(latestChat.id)
                ) {
                  deliveredChatIds.current.add(latestChat.id);
                  playChatReceiveEffect();
                  const senderName =
                    nextState.participants[latestChat.senderId]?.displayName ||
                    latestChat.senderId;
                  showToast(
                    `💬 ${senderName} no Chat`,
                    latestChat.text.length > 90
                      ? `${latestChat.text.slice(0, 87)}...`
                      : latestChat.text,
                    'gold'
                  );
                }
              }
              persistStateLocally(nextState, { celebrateStarGain: true });
            }
          }
        } catch {
          // ignore malformed ws message
        }
      };

      ws.onclose = () => {
        if (!closedByCleanup) {
          reconnectTimer = setTimeout(connectWs, 3000);
        }
      };
    }

    connectWs();

    const onOnline = () => {
      setIsOnline(true);
      connectWs();
      void flushPendingActions().then(() => silentRefreshFromServer());
      void syncVersionWithServer();
    };
    const onOffline = () => setIsOnline(false);

    const onWakeSync = () => {
      if (document.visibilityState === 'hidden') return;
      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED || wsRef.current.readyState === WebSocket.CLOSING) {
        connectWs();
      }
      void flushPendingActions().then(() => silentRefreshFromServer());
      void syncVersionWithServer();
    };

    const onPageShow = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      connectWs();
      void flushPendingActions().then(() => silentRefreshFromServer());
      void syncVersionWithServer();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', onWakeSync);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onWakeSync);

    const heartbeatTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (pendingQueueRef.current.length > 0) {
        void flushPendingActions();
      }
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connectWs();
        void silentRefreshFromServer();
      }
    }, 5000);

    return () => {
      closedByCleanup = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(heartbeatTimer);
      wsRef.current?.close();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', onWakeSync);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onWakeSync);
    };
  }, [flushPendingActions, refreshFromServer, silentRefreshFromServer, syncVersionWithServer, handleIncomingNotification, persistStateLocally, showToast]);

  // Automatic 00:00 rollover check
  useEffect(() => {
    const checkDateRollover = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (!gameState.manualDateLocked && getBrazilDateStr() > gameState.currentDateStr) {
        void silentRefreshFromServer();
      }
    };
    const timer = setInterval(checkDateRollover, 20000);
    return () => {
      clearInterval(timer);
    };
  }, [gameState.currentDateStr, gameState.manualDateLocked, silentRefreshFromServer]);

  // Continuous reminder loop: deadline warnings + ongoing notifications for available powers & unlocked tasks
  useEffect(() => {
    if (!session) return;
    const checkReminders = () => {
      const nowHHMM = getLocalHHMM(gameState);
      const userPrefs = gameState.participants[session.participantId]?.notificationPreferences;
      if (!userPrefs) return;

      const inQuietHours =
        userPrefs.quietHoursEnabled &&
        isWithinQuietHours(nowHHMM, userPrefs.quietStart, userPrefs.quietEnd);

      // 1. Deadline-approaching alerts (once per item/day)
      const reminders = computeTimelyReminders(
        gameState,
        session.participantId,
        gameState.currentDateStr,
        nowHHMM
      );
      for (const rem of reminders) {
        const key = `${gameState.currentDateStr}:${rem.id}`;
        if (reminderSentKeys.current.has(key)) continue;
        reminderSentKeys.current.add(key);
        if (inQuietHours) continue;
        const title = `⏰ Prazo próximo: ${rem.label}`;
        const body = `Faltam ${rem.minutesRemaining} min (limite ${rem.deadline}).`;
        showToast(title, body, 'gold');
        if (userPrefs.pushEnabled) {
          triggerSystemPush(title, body, key);
        }
      }

      // 2. Ongoing periodic alerts for powers to use, unlocked tasks, routines, Fantasma, dice & punishments
      const actionable = computeActionableAlerts(
        gameState,
        session.participantId,
        gameState.currentDateStr,
        nowHHMM
      ).filter((item) => userPrefs[item.category] && (!inQuietHours || item.urgent));

      if (actionable.length === 0) return;

      const cooldownMs = userPrefs.antiOverloadEnabled ? 5 * 60 * 1000 : 60 * 1000;
      const nowMs = Date.now();
      if (nowMs - lastActionableNotifyAt.current < cooldownMs) return;
      lastActionableNotifyAt.current = nowMs;

      const powerItems = actionable.filter((a) => a.kind === 'power' || a.kind === 'fantasma');
      const taskItems = actionable.filter((a) => a.kind === 'task' || a.kind === 'routine');
      const otherItems = actionable.filter(
        (a) => a.kind === 'dice' || a.kind === 'punishment'
      );

      const primary = powerItems[0] || taskItems[0] || otherItems[0];
      const extraCount = actionable.length - 1;
      const title =
        extraCount > 0
          ? `${primary.title} (+${extraCount} pendência${extraCount > 1 ? 's' : ''})`
          : primary.title;
      const parts: string[] = [];
      if (powerItems.length > 0) parts.push(`${powerItems.length} poder(es)/sorteio`);
      if (taskItems.length > 0) parts.push(`${taskItems.length} tarefa(s)/rotina liberada(s)`);
      if (otherItems.length > 0) parts.push(`${otherItems.length} dado/punição`);
      const body =
        parts.length > 1
          ? `Disponível agora: ${parts.join(' · ')}.`
          : primary.detail;

      showToast(title, body, primary.urgent ? 'gold' : 'success');
      if (userPrefs.pushEnabled) {
        triggerSystemPush(
          title,
          body,
          `actionable-${gameState.currentDateStr}-${session.participantId}`
        );
      }
    };

    checkReminders();
    const timer = setInterval(checkReminders, 60000);
    return () => clearInterval(timer);
  }, [session, gameState, showToast, triggerSystemPush]);

  const dispatchAction = useCallback(
    (
      type: string,
      payload: Record<string, unknown> = {},
      optimisticUpdater?: (draft: GameState) => void
    ): Promise<{ ok: boolean; error?: string; face?: number; queued?: boolean }> => {
      const execute = async (): Promise<{ ok: boolean; error?: string; face?: number; queued?: boolean }> => {
        const currentSession = sessionRef.current;
        if (!currentSession) return { ok: false, error: 'Faça login primeiro.' };

        unlockCelebrationAudio();

        const baseState = latestStateRef.current;
        const isReactionAction =
          type === 'toggle_chat_reaction' ||
          type === 'toggle_notif_reaction' ||
          type === 'toggle_participant_reaction';
        const isPenaltyAction =
          type === 'give_up_task' ||
          type === 'fail_rescue_step3' ||
          type === 'submit_denunciation';
        const isRetryable = RETRYABLE_ACTION_TYPES.has(type);

        const queueOfflineOrTransient = () => {
          const item: PendingQueuedAction = {
            id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            participantId: currentSession.participantId,
            type,
            payload,
            createdAt: Date.now(),
          };
          pendingQueueRef.current = [...pendingQueueRef.current, item];
          savePendingActions(pendingQueueRef.current);

          if (optimisticUpdater) {
            const draft = cloneGameState(baseState);
            optimisticUpdater(draft);
            playSoundForActionType(type);
            persistStateLocally(draft, { celebrateStarGain: true, applyQueueOverlay: false });
          } else {
            const draft = cloneGameState(baseState);
            applyPendingMutationToDraft(draft, item);
            playSoundForActionType(type);
            persistStateLocally(draft, { celebrateStarGain: true, applyQueueOverlay: false });
          }
          showToast(
            'Salvo no aparelho',
            'Sem conexão no momento — será sincronizado automaticamente.',
            'success'
          );
          return { ok: true, queued: true };
        };

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          if (isRetryable) {
            return queueOfflineOrTransient();
          }
          playErrorEffect();
          const msg = 'Sem conexão com a internet. Conecte-se para continuar.';
          showToast('Sem conexão', msg, 'error');
          return { ok: false, error: msg };
        }

        if (optimisticUpdater) {
          const draft = cloneGameState(baseState);
          optimisticUpdater(draft);
          playSoundForActionType(type);
          persistStateLocally(draft, { celebrateStarGain: true });
        }

        inFlightMutationsRef.current += 1;
        try {
          const res = await fetch('/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type,
              participantId: currentSession.participantId,
              token: currentSession.token,
              payload,
            }),
          });

          if (res.status >= 500 && isRetryable) {
            if (!optimisticUpdater) {
              return queueOfflineOrTransient();
            }
            const item: PendingQueuedAction = {
              id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              participantId: currentSession.participantId,
              type,
              payload,
              createdAt: Date.now(),
            };
            pendingQueueRef.current = [...pendingQueueRef.current, item];
            savePendingActions(pendingQueueRef.current);
            showToast(
              'Salvo localmente',
              'Servidor instável agora — tentando salvar automaticamente em segundos.',
              'success'
            );
            return { ok: true, queued: true };
          }

          const data = await res.json();
          if (typeof data.stateRevision === 'number') {
            serverRevisionRef.current = Math.max(serverRevisionRef.current, data.stateRevision);
          }

          if (!res.ok || !data.ok) {
            if (data.state) {
              persistStateLocally(data.state);
            } else if (optimisticUpdater) {
              persistStateLocally(baseState);
            }
            playErrorEffect();
            if (res.status === 401) {
              localStorage.removeItem(STORAGE_AUTH_KEY);
              setSession(null);
            }
            showToast('Atenção', data.error || 'Não foi possível concluir a ação.', 'error');
            return { ok: false, error: data.error };
          }
          if (isReactionAction) {
            suppressRemoteReactionUntilRef.current = Date.now() + 800;
          }
          if (isPenaltyAction) {
            suppressRemotePenaltyUntilRef.current = Date.now() + 800;
          }
          if (!optimisticUpdater) {
            playSoundForActionType(type);
          }
          if (data.state) {
            persistStateLocally(data.state, { celebrateStarGain: true });
          }
          return data;
        } catch {
          if (isRetryable) {
            if (!optimisticUpdater) {
              return queueOfflineOrTransient();
            }
            const item: PendingQueuedAction = {
              id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              participantId: currentSession.participantId,
              type,
              payload,
              createdAt: Date.now(),
            };
            pendingQueueRef.current = [...pendingQueueRef.current, item];
            savePendingActions(pendingQueueRef.current);
            showToast(
              'Salvo no aparelho',
              'Conexão oscilou — sincronização automática em andamento.',
              'success'
            );
            return { ok: true, queued: true };
          }
          if (optimisticUpdater) persistStateLocally(baseState);
          playErrorEffect();
          const msg = 'Falha de conexão com o servidor. Verifique sua internet e tente novamente.';
          showToast('Sem conexão', msg, 'error');
          return { ok: false, error: msg };
        } finally {
          inFlightMutationsRef.current = Math.max(0, inFlightMutationsRef.current - 1);
        }
      };

      const queuedRun = actionQueueRef.current.then(execute, execute);
      actionQueueRef.current = queuedRun.then(
        () => undefined,
        () => undefined
      );
      return queuedRun;
    },
    [persistStateLocally, showToast]
  );

  const loginSuccess = useCallback(
    (participantId: ParticipantId, token: string, state: GameState) => {
      const nextSession = { participantId, token };
      sessionRef.current = nextSession;
      localStorage.setItem(STORAGE_AUTH_KEY, JSON.stringify(nextSession));
      try {
        localStorage.setItem(
          STORAGE_LAST_USER_KEY,
          JSON.stringify({
            participantId,
            displayName: state.participants[participantId]?.displayName || participantId,
          })
        );
      } catch {
        // ignore
      }
      setSession(nextSession);
      state.notifications.forEach((n) => deliveredNotifIds.current.add(n.id));
      persistStateLocally(state);
      void flushPendingActions();
    },
    [flushPendingActions, persistStateLocally]
  );

  const logout = useCallback(() => {
    try {
      for (const pid of ['tailan', 'carol', 'karine', 'caio']) {
        localStorage.removeItem(`estrelas_ai_history_${pid}`);
        sessionStorage.removeItem(`estrelas_ai_history_${pid}`);
      }
    } catch {
      // ignore
    }
    pendingQueueRef.current = [];
    savePendingActions([]);
    localStorage.removeItem(STORAGE_AUTH_KEY);
    setSession(null);
  }, []);

  const loadBackups = useCallback(async () => {
    try {
      const res = await fetch('/api/backups');
      const data = await res.json();
      if (data.ok) setBackups(data.backups || []);
    } catch {
      // ignore
    }
  }, []);

  const createCloudBackup = useCallback(
    async (label: string) => {
      if (!session) return;
      try {
        const res = await fetch('/api/backups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participantId: session.participantId,
            token: session.token,
            label,
          }),
        });
        if (res.status === 401) {
          handleAuthExpired();
          return;
        }
        const data = await res.json();
        if (data.ok) {
          setBackups(data.backups || []);
          showToast('Backup na Nuvem', 'Cópia de segurança salva com sucesso.', 'success');
        } else {
          showToast('Erro no backup', data.error || 'Não foi possível salvar backup.', 'error');
        }
      } catch {
        showToast('Sem conexão', 'Conecte-se à internet para salvar backup.', 'error');
      }
    },
    [session, handleAuthExpired, showToast]
  );

  const restoreCloudBackup = useCallback(
    async (backupId: string) => {
      if (!session) return;
      try {
        const res = await fetch(`/api/backups/${backupId}/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participantId: session.participantId,
            token: session.token,
          }),
        });
        if (res.status === 401) {
          handleAuthExpired();
          return;
        }
        const data = await res.json();
        if (data.ok && data.state) {
          persistStateLocally(data.state);
          showToast('Restaurado', 'Estado do jogo restaurado do backup na nuvem.', 'success');
        } else {
          showToast('Erro ao restaurar', data.error || 'Backup não encontrado.', 'error');
        }
      } catch {
        showToast('Sem conexão', 'Conecte-se à internet para restaurar backup.', 'error');
      }
    },
    [session, handleAuthExpired, persistStateLocally, showToast]
  );

  const importBackupState = useCallback(
    async (importedState: GameState) => {
      if (!session) return;
      try {
        const res = await fetch('/api/backups/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participantId: session.participantId,
            token: session.token,
            importedState,
          }),
        });
        if (res.status === 401) {
          handleAuthExpired();
          return;
        }
        const data = await res.json();
        if (data.ok && data.state) {
          persistStateLocally(data.state);
          showToast('Importado', 'Backup restaurado com sucesso.', 'success');
        } else {
          showToast('Erro ao importar', data.error || 'Arquivo inválido.', 'error');
        }
      } catch {
        showToast('Sem conexão', 'Conecte-se à internet para importar backup.', 'error');
      }
    },
    [session, handleAuthExpired, persistStateLocally, showToast]
  );

  const deleteOwnAccount = useCallback(async () => {
    if (!session) return false;
    const res = await fetch('/api/auth/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        participantId: session.participantId,
        token: session.token,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      clearLocalBiometricData(session.participantId);
      localStorage.removeItem(STORAGE_AUTH_KEY);
      localStorage.removeItem(STORAGE_LAST_USER_KEY);
      setSession(null);
      if (data.state) persistStateLocally(data.state);
      showToast('Conta removida', 'Sua senha e acesso biométrico foram excluídos.', 'success');
      return true;
    }
    return false;
  }, [session, persistStateLocally, showToast]);

  const selectSoundTheme = useCallback(
    async (soundTheme: SoundThemeId) => {
      if (!session) return { ok: false, error: 'Faça login primeiro.' };
      const pid = session.participantId;
      setActiveSoundTheme(soundTheme, pid);
      return dispatchAction(
        'update_sound_theme',
        { soundTheme },
        (draft) => {
          if (draft.participants[pid]) {
            draft.participants[pid].soundTheme = soundTheme;
          }
        }
      );
    },
    [session, dispatchAction]
  );

  return {
    gameState,
    session,
    isOnline,
    isRefreshing,
    toast,
    backups,
    dismissToast: () => setToast(null),
    showToast,
    refreshFromServer,
    dispatchAction,
    loginSuccess,
    logout,
    handleAuthExpired,
    loadBackups,
    createCloudBackup,
    restoreCloudBackup,
    importBackupState,
    deleteOwnAccount,
    triggerSystemPush,
    soundEnabled,
    toggleSoundEnabled,
    selectSoundTheme,
    rankClimbs,
    clearRankClimb,
  };
}
