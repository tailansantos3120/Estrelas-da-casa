import { ROTATION_ORDER } from './schedule.ts';
import type { GameState, ParticipantId } from './types.ts';

export interface RankOvertakeEvent {
  participantId: ParticipantId;
  fromRank: number;
  toRank: number;
  overtakenIds: ParticipantId[];
  timestamp: number;
}

export function extractRankStars(state: GameState): Record<ParticipantId, number> {
  return {
    tailan: state.participants?.tailan?.stars ?? 0,
    carol: state.participants?.carol?.stars ?? 0,
    karine: state.participants?.karine?.stars ?? 0,
    caio: state.participants?.caio?.stars ?? 0,
  };
}

export function computeRankedOrder(state: GameState): ParticipantId[] {
  return [...ROTATION_ORDER].sort((a, b) => {
    const diff = (state.participants?.[b]?.stars ?? 0) - (state.participants?.[a]?.stars ?? 0);
    if (diff !== 0) return diff;
    return ROTATION_ORDER.indexOf(a) - ROTATION_ORDER.indexOf(b);
  });
}

/**
 * Detects participants who climbed in the ranking by overtaking at least one
 * other participant in star count.
 */
export function detectRankOvertakes(
  prevOrder: ParticipantId[] | null,
  nextOrder: ParticipantId[],
  prevStars?: Record<ParticipantId, number> | null,
  nextStars?: Record<ParticipantId, number> | null,
  nowMs: number = Date.now()
): RankOvertakeEvent[] {
  if (!prevOrder || prevOrder.length === 0) return [];

  const events: RankOvertakeEvent[] = [];

  for (let nextIdx = 0; nextIdx < nextOrder.length; nextIdx++) {
    const pid = nextOrder[nextIdx];
    const prevIdx = prevOrder.indexOf(pid);
    if (prevIdx < 0 || nextIdx >= prevIdx) continue;

    // Identify participants who were strictly ahead in prevOrder and are now behind in nextOrder
    const overtakenIds = prevOrder.slice(0, prevIdx).filter((otherId) => {
      const otherNextIdx = nextOrder.indexOf(otherId);
      if (otherNextIdx <= nextIdx) return false;
      if (nextStars) {
        return (nextStars[pid] ?? 0) > (nextStars[otherId] ?? 0);
      }
      return true;
    });

    if (overtakenIds.length > 0) {
      // Ensure this participant actually gained stars or surpassed in stars
      const gainedOrSurpassed =
        !prevStars ||
        !nextStars ||
        (nextStars[pid] ?? 0) > (prevStars[pid] ?? 0) ||
        overtakenIds.some(
          (otherId) =>
            (prevStars[pid] ?? 0) <= (prevStars[otherId] ?? 0) &&
            (nextStars[pid] ?? 0) > (nextStars[otherId] ?? 0)
        );

      if (gainedOrSurpassed) {
        events.push({
          participantId: pid,
          fromRank: prevIdx + 1,
          toRank: nextIdx + 1,
          overtakenIds,
          timestamp: nowMs,
        });
      }
    }
  }

  return events;
}
