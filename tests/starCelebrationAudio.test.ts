import { describe, expect, it, vi } from 'vitest';
import {
  computeTotalStarGain,
  computeTotalStarLoss,
  countTotalReactions,
  extractStarsMap,
  playChatReceiveEffect,
  playChatSendEffect,
  playDiceRollEffect,
  playPenaltyEffect,
  playPowerEffect,
  playRankClimbEffect,
  playReactionEffect,
  playSoundForActionType,
  playStarEarnedEffect,
  playTaskCompleteEffect,
  triggerActionHaptic,
  triggerStarHaptic,
} from '../src/services/starCelebrationAudio.ts';
import { createInitialSeedState } from '../src/shared/seedState.ts';

describe('Festive & Interactive Game Audio & Haptics', () => {
  it('detects single and multi-participant positive star gains and star losses accurately', () => {
    const base = createInitialSeedState();
    const prevStars = extractStarsMap(base);

    expect(prevStars).toEqual({
      tailan: 25,
      carol: 37,
      karine: 34,
      caio: 22,
    });

    expect(computeTotalStarGain(prevStars, base)).toEqual({
      totalGain: 0,
      maxSingleGain: 0,
      earners: [],
    });
    expect(computeTotalStarLoss(prevStars, base)).toEqual({
      totalLoss: 0,
      losers: [],
    });

    expect(computeTotalStarGain(null, base)).toEqual({
      totalGain: 0,
      maxSingleGain: 0,
      earners: [],
    });

    const lossState = structuredClone(base);
    lossState.participants.caio.stars = 19;
    expect(computeTotalStarGain(prevStars, lossState)).toEqual({
      totalGain: 0,
      maxSingleGain: 0,
      earners: [],
    });
    expect(computeTotalStarLoss(prevStars, lossState)).toEqual({
      totalLoss: 3,
      losers: ['caio'],
    });

    const gainState = structuredClone(base);
    gainState.participants.tailan.stars = 26;
    gainState.participants.carol.stars = 40;
    gainState.participants.caio.stars = 21;

    const result = computeTotalStarGain(prevStars, gainState);
    expect(result.totalGain).toBe(4);
    expect(result.maxSingleGain).toBe(3);
    expect(result.earners).toEqual(['tailan', 'carol']);
    expect(computeTotalStarLoss(prevStars, gainState)).toEqual({
      totalLoss: 1,
      losers: ['caio'],
    });
  });

  it('counts emoji reactions across chat messages, notifications, and ranking cards', () => {
    const state = createInitialSeedState();
    const baseCount = countTotalReactions(state);

    state.chatMessages.push({
      id: 'm1',
      senderId: 'tailan',
      text: 'Bora!',
      timestamp: '12/11, 17:10',
      createdAtIso: '2026-11-12T17:10:00',
      kind: 'text',
      reactions: { '🔥': ['carol', 'karine'] },
    });
    if (state.notifications[0]) {
      state.notifications[0].reactions = { '🤬': ['caio'] };
    }
    state.participants.carol.reactions = { '👑': ['tailan'] };

    expect(countTotalReactions(state)).toBe(baseCount + 4);
  });

  it('triggers haptic feedback for stars, reactions, chat, tasks, dice, powers, penalties, and rank climbs gracefully', () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { vibrate: vibrateMock });

    expect(triggerStarHaptic(1)).toBe(true);
    expect(vibrateMock).toHaveBeenCalledWith([22, 28, 38, 28, 62]);

    expect(triggerStarHaptic(3)).toBe(true);
    expect(vibrateMock).toHaveBeenCalledWith([28, 32, 42, 32, 75, 40, 95]);

    expect(triggerActionHaptic('reaction')).toBe(true);
    expect(triggerActionHaptic('chat_send')).toBe(true);
    expect(triggerActionHaptic('task')).toBe(true);
    expect(triggerActionHaptic('dice_roll')).toBe(true);
    expect(triggerActionHaptic('power')).toBe(true);
    expect(triggerActionHaptic('penalty')).toBe(true);
    expect(triggerActionHaptic('rank_climb')).toBe(true);

    expect(() => {
      playStarEarnedEffect(1);
      playTaskCompleteEffect();
      playReactionEffect(false);
      playReactionEffect(true);
      playChatSendEffect();
      playChatReceiveEffect();
      playDiceRollEffect();
      playPowerEffect();
      playPenaltyEffect();
      playRankClimbEffect();
      playSoundForActionType('complete_task');
      playSoundForActionType('send_chat_message');
      playSoundForActionType('toggle_chat_reaction');
      playSoundForActionType('toggle_notif_reaction');
      playSoundForActionType('toggle_participant_reaction');
      playSoundForActionType('roll_dice');
      playSoundForActionType('use_power');
      playSoundForActionType('give_up_task');
    }).not.toThrow();

    vi.unstubAllGlobals();
  });

  it('allows each participant to independently choose and persist their own ringtone sound theme', async () => {
    const { updateParticipantSoundTheme } = await import('../src/shared/gameLogic.ts');
    const {
      SOUND_THEMES,
      getActiveSoundTheme,
      getSoundThemeMeta,
      previewSoundTheme,
      setActiveSoundTheme,
    } = await import('../src/services/starCelebrationAudio.ts');

    const state = createInitialSeedState();
    expect(SOUND_THEMES.length).toBeGreaterThanOrEqual(5);

    const r1 = updateParticipantSoundTheme(state, 'carol', 'cristal');
    const r2 = updateParticipantSoundTheme(state, 'tailan', 'arcade');
    const r3 = updateParticipantSoundTheme(state, 'karine', 'marimba');
    const invalid = updateParticipantSoundTheme(state, 'caio', 'tema_inexistente');

    expect(r1).toEqual({ ok: true, soundTheme: 'cristal' });
    expect(r2).toEqual({ ok: true, soundTheme: 'arcade' });
    expect(r3).toEqual({ ok: true, soundTheme: 'marimba' });
    expect(invalid.ok).toBe(false);

    expect(state.participants.carol.soundTheme).toBe('cristal');
    expect(state.participants.tailan.soundTheme).toBe('arcade');
    expect(state.participants.karine.soundTheme).toBe('marimba');
    expect(state.participants.caio.soundTheme).toBeUndefined();

    expect(setActiveSoundTheme('arcade', 'tailan')).toBe('arcade');
    expect(getActiveSoundTheme()).toBe('arcade');
    expect(getSoundThemeMeta('cristal').name).toBe('Cristal Luxo');
    expect(() => previewSoundTheme('festa')).not.toThrow();
  });
});
