import { describe, expect, it } from 'vitest';
import {
  computeRankedOrder,
  detectRankOvertakes,
  extractRankStars,
} from '../src/shared/rankTracker.ts';
import { createInitialSeedState } from '../src/shared/seedState.ts';

describe('Ranking Subida de Nível (Overtake Detection)', () => {
  it('detects when a participant overtakes one or more participants in stars', () => {
    const state1 = createInitialSeedState();
    // Initial: Carol 37 (1º), Karine 34 (2º), Tailan 25 (3º), Caio 22 (4º)
    const prevOrder = computeRankedOrder(state1);
    const prevStars = extractRankStars(state1);
    expect(prevOrder).toEqual(['carol', 'karine', 'tailan', 'caio']);

    // Tailan climbs from 25 -> 35 stars, overtaking Karine (34) from 3º to 2º
    const state2 = structuredClone(state1);
    state2.participants.tailan.stars = 35;
    const nextOrder = computeRankedOrder(state2);
    const nextStars = extractRankStars(state2);
    expect(nextOrder).toEqual(['carol', 'tailan', 'karine', 'caio']);

    const overtakes = detectRankOvertakes(prevOrder, nextOrder, prevStars, nextStars, 1000);
    expect(overtakes).toEqual([
      {
        participantId: 'tailan',
        fromRank: 3,
        toRank: 2,
        overtakenIds: ['karine'],
        timestamp: 1000,
      },
    ]);
  });

  it('detects multi-position climb when a participant overtakes multiple players at once', () => {
    const state1 = createInitialSeedState();
    const prevOrder = computeRankedOrder(state1);
    const prevStars = extractRankStars(state1);

    // Caio jumps from 22 -> 38 stars, going from 4º directly to 1º
    const state2 = structuredClone(state1);
    state2.participants.caio.stars = 38;
    const nextOrder = computeRankedOrder(state2);
    const nextStars = extractRankStars(state2);
    expect(nextOrder[0]).toBe('caio');

    const overtakes = detectRankOvertakes(prevOrder, nextOrder, prevStars, nextStars, 2000);
    expect(overtakes).toEqual([
      {
        participantId: 'caio',
        fromRank: 4,
        toRank: 1,
        overtakenIds: ['carol', 'karine', 'tailan'],
        timestamp: 2000,
      },
    ]);
  });

  it('does not trigger overtake when stars tie or rank order stays unchanged', () => {
    const state1 = createInitialSeedState();
    const prevOrder = computeRankedOrder(state1);
    const prevStars = extractRankStars(state1);

    // Tailan rises to 34 (tied with Karine, NOT strictly higher stars)
    const stateTie = structuredClone(state1);
    stateTie.participants.tailan.stars = 34;
    const tieOrder = computeRankedOrder(stateTie);
    const tieStars = extractRankStars(stateTie);

    const overtakes = detectRankOvertakes(prevOrder, tieOrder, prevStars, tieStars, 3000);
    expect(overtakes).toEqual([]);
  });
});
