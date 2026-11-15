import { describe, expect, it } from 'vitest';
import { completeTask, ensureDayRecord } from '../src/shared/gameLogic.ts';
import {
  computeActionableAlerts,
  computeTimelyReminders,
  filterCurrentDayNotifications,
  isWithinQuietHours,
  shouldDeliverNotification,
} from '../src/shared/notificationFilter.ts';
import { createInitialSeedState, DEFAULT_NOTIFICATION_PREFS } from '../src/shared/seedState.ts';
import type { GameNotification } from '../src/shared/types.ts';

describe('Customizable Notification Filter & Anti-Overload Engine', () => {
  const sampleStarNotif: GameNotification = {
    id: 'n-1',
    dateStr: '2026-11-12',
    timestamp: '12/11, 14:00',
    createdAtIso: '2026-11-12T14:00:00',
    actorId: 'tailan',
    type: 'star',
    title: 'Tailan +1 ⭐',
    message: 'Garrafas conquistada.',
  };

  it('respects user category preferences and quiet hours', () => {
    const mutedRanking = { ...DEFAULT_NOTIFICATION_PREFS, rankingUpdates: false };
    const res = shouldDeliverNotification(sampleStarNotif, mutedRanking, '14:00', new Map());
    expect(res.deliver).toBe(false);

    const quietPrefs = {
      ...DEFAULT_NOTIFICATION_PREFS,
      quietHoursEnabled: true,
      quietStart: '23:00',
      quietEnd: '07:00',
    };
    expect(isWithinQuietHours('23:30', '23:00', '07:00')).toBe(true);
    expect(shouldDeliverNotification(sampleStarNotif, quietPrefs, '23:30', new Map()).deliver).toBe(
      false
    );
  });

  it('prevents notification overload using deduplication cooldown', () => {
    const recent = new Map<string, number>();
    const key = `${sampleStarNotif.type}:${sampleStarNotif.actorId}:${sampleStarNotif.title}`;
    recent.set(key, 100000);
    const res = shouldDeliverNotification(
      sampleStarNotif,
      DEFAULT_NOTIFICATION_PREFS,
      '14:00',
      recent,
      100000 + 60 * 1000
    );
    expect(res.deliver).toBe(false);
  });

  it('computes timely reminders before pending routine deadlines', () => {
    const state = createInitialSeedState();
    ensureDayRecord(state, '2026-11-14');
    // On Saturday 14/11, dobrar_lencol has weekend deadline 09:10 -> at 09:00 it's 10 min away!
    const reminders = computeTimelyReminders(state, 'tailan', '2026-11-14', '09:00');
    expect(reminders.some((r) => r.id === 'rem-r-dobrar_lencol')).toBe(true);
  });

  it('keeps notifications strictly within the current day and hides past days', () => {
    const state = createInitialSeedState();
    expect(state.notifications.every((n) => n.dateStr === state.currentDateStr)).toBe(true);

    const tomorrowStr = '2026-11-14';
    const nextDayList = filterCurrentDayNotifications(state.notifications, tomorrowStr);
    expect(nextDayList).toHaveLength(0);

    const staleDelivery = shouldDeliverNotification(
      sampleStarNotif,
      DEFAULT_NOTIFICATION_PREFS,
      '09:00',
      new Map(),
      Date.now(),
      tomorrowStr
    );
    expect(staleDelivery.deliver).toBe(false);
    expect(staleDelivery.reason).toBe('expired_day');
  });

  it('detects actionable powers and unlocked tasks in real time', () => {
    const state = createInitialSeedState();
    const karineFriAlerts = computeActionableAlerts(state, 'karine', '2026-11-13', '12:50');
    expect(karineFriAlerts.some((a) => a.id === 'act-inv-chefe')).toBe(true);
    expect(karineFriAlerts.some((a) => a.id === 'act-inv-coringa')).toBe(false);

    const carolFriAlerts = computeActionableAlerts(state, 'carol', '2026-11-13', '12:50');
    expect(carolFriAlerts.some((a) => a.id === 'act-inv-fantasma')).toBe(true);

    // On Saturday 14/11, fogao_almoco belongs to Tailan and unlocks only after Karine completes almoco
    ensureDayRecord(state, '2026-11-14');
    const beforeLunch = computeActionableAlerts(state, 'tailan', '2026-11-14', '11:45');
    expect(beforeLunch.some((a) => a.id === 'act-task-fogao_almoco')).toBe(false);

    completeTask(state, '2026-11-14', 'karine', 'almoco', '11:50');
    const afterLunch = computeActionableAlerts(state, 'tailan', '2026-11-14', '11:55');
    expect(afterLunch.some((a) => a.id === 'act-task-fogao_almoco')).toBe(true);
  });
});
