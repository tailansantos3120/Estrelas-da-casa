import { describe, expect, it } from 'vitest';
import {
  choosePunishmentDay,
  completeCustomTask,
  completeFantasmaDrawTask,
  completeRoutine,
  completeTask,
  computeDaySummary,
  deleteChatMessage,
  drawDelegationFallback,
  editChatMessage,
  ensureDayRecord,
  failTaskRescueStep3,
  getDiceWindowStatus,
  giveUpTask,
  isDeadlineBypassedByPrerequisite,
  isRoutineUnlocked,
  isTaskUnlocked,
  processExpiredDeadlines,
  respondToDelegation,
  respondToFantasmaDraw,
  respondToTaskRescue,
  rollDice,
  resolveDiceAction,
  saveDiceJustification,
  sendChatMessage,
  submitDenunciation,
  submitJustification,
  syncAutomaticDayRollover,
  tailanDeleteCustomRule,
  tailanDeleteCustomTask,
  tailanDeleteNotification,
  tailanPostAnnouncement,
  tailanSetDayDice,
  tailanSetDiceDisabledForDate,
  tailanSetManualDateLock,
  tailanSetParticipantFlags,
  tailanSetParticipantInventory,
  tailanSetParticipantStars,
  tailanUpdateDayRoutine,
  tailanUpdateDayTask,
  tailanUpdateGoalBanner,
  tailanUpdateParticipantProfile,
  tailanUpdateRoutineOverride,
  tailanUpdateTaskOverride,
  tailanUpdateWeekendPunishment,
  tailanUpsertCustomRule,
  tailanUpsertCustomTask,
  toggleChatReaction,
  toggleNotificationReaction,
  toggleParticipantReaction,
  updateParticipantAvatar,
  updateParticipantDisplayName,
  useInventoryPower,
} from '../src/shared/gameLogic.ts';
import { computeActionableAlerts } from '../src/shared/notificationFilter.ts';
import { getParticipantAvatar, getParticipantName, PARTICIPANT_PROFILES } from '../src/shared/schedule.ts';
import { createInitialSeedState } from '../src/shared/seedState.ts';

describe('Estrelas da Casa Game Logic Integration', () => {
  it('initializes Friday 13/11 with exact standings, Friday dice rolls, and accumulated items', () => {
    const state = createInitialSeedState();
    expect(state.currentDateStr).toBe('2026-11-13');
    expect(state.simulatedClockTime).toBeNull();
    expect(state.diceDisabledDates).toEqual([]);
    expect(state.participants.carol.stars).toBe(37);
    expect(state.participants.carol.unlockedMilestones).toEqual([35]);
    expect(state.participants.carol.inventory).toEqual({ fantasma: 4, escudo: 0, chefe: 0, coringa: 0 });
    expect(state.participants.karine.stars).toBe(34);
    expect(state.participants.karine.inventory).toEqual({ fantasma: 1, escudo: 0, chefe: 1, coringa: 0 });
    expect(state.participants.tailan.stars).toBe(25);
    expect(state.participants.tailan.inventory).toEqual({ fantasma: 2, escudo: 1, chefe: 0, coringa: 0 });
    expect(state.participants.caio.stars).toBe(22);
    expect(state.participants.caio.inventory).toEqual({ fantasma: 0, escudo: 0, chefe: 2, coringa: 0 });

    const friDice = state.days['2026-11-13'].dice;
    expect(friDice.caio.round1?.face).toBe(6);
    expect(friDice.caio.round1?.chosenPower).toBe('chefe');
    expect(friDice.caio.round2?.face).toBe(1);
    expect(friDice.caio.round2?.pendingAction).toBe('pick_steal_target');
    expect(friDice.tailan.round1?.face).toBe(3);
    expect(friDice.tailan.round2?.face).toBe(3);
    expect(friDice.carol.round1?.face).toBe(2);
    expect(friDice.carol.round2?.face).toBe(3);
    expect(friDice.karine.round1?.face).toBe(4);
    expect(friDice.karine.round2?.face).toBe(1);
    expect(friDice.karine.round2?.pendingAction).toBe('pick_steal_target');
  });

  it('preserves Wednesday 11/11, Thursday 12/11, and Friday 13/11 summaries totaling exact current standings', () => {
    const state = createInitialSeedState();

    const wed = computeDaySummary(state, '2026-11-11')!;
    const wedMap = Object.fromEntries(wed.map((r) => [r.pid, r]));
    expect(wedMap.carol.netStars).toBe(12);
    expect(wedMap.karine.netStars).toBe(11);
    expect(wedMap.tailan.netStars).toBe(9);
    expect(wedMap.caio.netStars).toBe(9);

    const thu = computeDaySummary(state, '2026-11-12')!;
    const thuMap = Object.fromEntries(thu.map((r) => [r.pid, r]));
    expect(thuMap.carol.netStars).toBe(13);
    expect(thuMap.karine.netStars).toBe(10);
    expect(thuMap.tailan.netStars).toBe(7);
    expect(thuMap.caio.netStars).toBe(3);

    const fri = computeDaySummary(state, '2026-11-13')!;
    const friMap = Object.fromEntries(fri.map((r) => [r.pid, r]));
    // Friday: Tailan missed cafe_manha (-3⭐), Carol rescued (+2⭐), all 7 routines completed + Friday dice powers
    expect(friMap.tailan.taskPenaltyStars).toBe(3);
    expect(friMap.carol.netStars).toBe(12);
    expect(friMap.karine.netStars).toBe(13);
    expect(friMap.tailan.netStars).toBe(9);
    expect(friMap.caio.netStars).toBe(10);

    for (const pid of ['tailan', 'carol', 'karine', 'caio'] as const) {
      expect(wedMap[pid].netStars + thuMap[pid].netStars + friMap[pid].netStars).toBe(
        state.participants[pid].stars
      );
    }

    // Thursday powers & outcome strings preserved
    expect(thuMap.carol.round1Summary?.powerTitle).toContain('Face 2');
    expect(thuMap.carol.round2Summary?.usageText).toContain('Café da tarde');
    expect(thuMap.carol.round2Summary?.usageText).toContain('Karine');
    expect(thuMap.carol.round2Summary?.finalOutcome).toContain('1 👻');
    expect(thuMap.karine.round1Summary?.usageText).toContain('Organizar');
    expect(thuMap.karine.round2Summary?.usageText).toContain('acumulou 1 👑 Chefe');
    expect(thuMap.tailan.round1Summary?.usageText).toContain('Escudo');
    expect(thuMap.caio.round1Summary?.usageText).toContain('acumulou 1 👑 Chefe');

    // Friday powers & accumulated outcome strings
    expect(friMap.tailan.round1Summary?.usageText).toContain('Escudo');
    expect(friMap.tailan.round2Summary?.finalOutcome).toContain('2 👻');
    expect(friMap.caio.round1Summary?.powerTitle).toContain('Coringa → 👑 Chefe');
    expect(friMap.caio.round2Summary?.finalOutcome).toContain('Escolha pendente');
  });

  it('prevents re-rolling Friday 13/11 completed rounds, lets Caio & Karine resolve R2 Face 1 steal, and enforces 05:00–10:00 / 12:00–19:00 windows from Saturday 14/11 onward', () => {
    const state = createInitialSeedState();

    // Friday 13/11: already rolled both rounds for everyone
    expect(rollDice(state, '2026-11-13', 'tailan', 1, '09:00', 4).ok).toBe(false);
    expect(rollDice(state, '2026-11-13', 'carol', 2, '14:00', 3).ok).toBe(false);

    // Caio & Karine can resolve Friday R2 Face 1 steal target
    const stealCaio = resolveDiceAction(state, '2026-11-13', 'caio', 2, '16:00', {
      action: 'steal',
      targetId: 'carol',
    });
    expect(stealCaio.ok).toBe(true);
    expect(state.participants.caio.stars).toBe(26);
    expect(state.participants.carol.stars).toBe(33);

    // Saturday 14/11: morning window is strictly 05:00–10:00
    expect(rollDice(state, '2026-11-14', 'tailan', 1, '04:59', 4).ok).toBe(false);
    expect(rollDice(state, '2026-11-14', 'tailan', 1, '10:01', 4).ok).toBe(false);
    expect(rollDice(state, '2026-11-14', 'tailan', 1, '05:00', 2).ok).toBe(true);
    // Cannot roll round 1 a second time after using it
    expect(rollDice(state, '2026-11-14', 'tailan', 1, '09:30', 3).ok).toBe(false);

    // Saturday 14/11: afternoon window is strictly 12:00–19:00
    expect(rollDice(state, '2026-11-14', 'tailan', 2, '11:59', 3).ok).toBe(false);
    expect(rollDice(state, '2026-11-14', 'tailan', 2, '19:01', 3).ok).toBe(false);
    expect(rollDice(state, '2026-11-14', 'tailan', 2, '12:00', 2).ok).toBe(true);
    // Cannot roll round 2 a second time
    expect(rollDice(state, '2026-11-14', 'tailan', 2, '15:00', 3).ok).toBe(false);
  });

  it('enforces routine deadline auto-penalty (-1 ⭐) when past time limit on Saturday 14/11', () => {
    const state = createInitialSeedState();
    // Saturday weekend limit for acordar is 09:01
    const res = completeRoutine(state, '2026-11-14', 'tailan', 'acordar', '09:05');
    expect(res.ok).toBe(false);
    expect(state.participants.tailan.stars).toBe(24);
    expect(state.days['2026-11-14'].routines.tailan.acordar.expiredPenaltyApplied).toBe(true);
  });

  it('awards +1 ⭐ for routine completed on time and enforces meal-to-dishes dependency on Saturday 14/11', () => {
    const state = createInitialSeedState();
    const blocked = completeRoutine(state, '2026-11-14', 'tailan', 'vasilhas_almoco', '12:15');
    expect(blocked.ok).toBe(false);

    // Complete Almoço (Karine on Saturday 14/11) first, then unlock dishes
    const lunch = completeTask(state, '2026-11-14', 'karine', 'almoco', '12:10');
    expect(lunch.ok).toBe(true);
    // Saturday 14/11: tailan already at 25 from Friday dice, completes vasilhas_almoco (+1)
    expect(state.participants.karine.stars).toBe(35);

    const dishes = completeRoutine(state, '2026-11-14', 'tailan', 'vasilhas_almoco', '12:15');
    expect(dishes.ok).toBe(true);
    expect(state.participants.tailan.stars).toBe(26);
  });

  it('unlocks dependent routines and tasks with NO time limit ("horas que quiser") when prerequisite was missed or is under draw/decision', () => {
    const state = createInitialSeedState();
    // Mark morning routines complete to isolate cafe_manha + vasilhas_cafe_manha
    for (const pid of ['tailan', 'carol', 'karine', 'caio'] as const) {
      const day = state.days['2026-11-14'] || undefined;
      expect(day).toBeUndefined();
    }
    // Expire Carol's cafe_manha on Saturday 14/11 (weekend limit 08:00)
    processExpiredDeadlines(state, '2026-11-14', '08:05');
    const satDay = state.days['2026-11-14'];
    expect(satDay.tasks.cafe_manha.expiredPenaltyApplied).toBe(true);
    expect(satDay.tasks.cafe_manha.rescue).toBeTruthy();

    // Dependent routine (vasilhas_cafe_manha, normal weekend limit 10:10) unlocks with no time limit
    const routineUnlock = isRoutineUnlocked(satDay, 'vasilhas_cafe_manha', state);
    expect(routineUnlock.unlocked).toBe(true);
    expect(routineUnlock.bypassedDeadline).toBe(true);
    expect(isDeadlineBypassedByPrerequisite(state, satDay, '2026-11-14', 'cafe_manha')).toBe(true);

    // Tailan can mark vasilhas_cafe_manha at 23:10 ("horas que quiser") without deadline penalty!
    const tailanBefore = state.participants.tailan.stars;
    const lateRoutine = completeRoutine(state, '2026-11-14', 'tailan', 'vasilhas_cafe_manha', '23:10');
    expect(lateRoutine.ok).toBe(true);
    expect(state.participants.tailan.stars).toBe(tailanBefore + 1);

    // Dependent task (fogao_almoco, owned by Tailan, weekend limit 14:00) unlocks when almoco is under Chefe decision
    const state2 = createInitialSeedState();
    rollDice(state2, '2026-11-14', 'karine', 1, '09:00', 5);
    resolveDiceAction(state2, '2026-11-14', 'karine', 1, '09:01', {
      action: 'chefe',
      taskId: 'almoco',
      targetId: 'caio',
    });
    const sat2 = state2.days['2026-11-14'];
    const taskUnlock = isTaskUnlocked(sat2, 'fogao_almoco', state2);
    expect(taskUnlock.unlocked).toBe(true);
    expect(taskUnlock.bypassedDeadline).toBe(true);

    // Tailan completes fogao_almoco at 23:10 (well past 14:00) with no deadline block
    const t2Before = state2.participants.tailan.stars;
    expect(completeTask(state2, '2026-11-14', 'tailan', 'fogao_almoco', '23:10').ok).toBe(true);
    expect(state2.participants.tailan.stars).toBe(t2Before + 1);
  });

  it('gives +1 ⭐ immediately to Fantasma owner and +3 ⭐ to drawn participant who accepts & completes', () => {
    const state = createInitialSeedState();
    // On Saturday 14/11, almoco belongs to Karine
    const roll = rollDice(state, '2026-11-14', 'karine', 1, '09:00', 4);
    expect(roll.ok).toBe(true);
    expect(state.participants.karine.stars).toBe(35); // 34 + 1 immediately on Fantasma

    const resolve = resolveDiceAction(state, '2026-11-14', 'karine', 1, '09:01', {
      action: 'fantasma',
      taskId: 'almoco',
    });
    expect(resolve.ok).toBe(true);

    const draw = state.fantasmaDraws.find((d) => d.dateStr === '2026-11-14' && d.ownerId === 'karine')!;
    expect(draw.drawnParticipantId).not.toBe('karine');
    const drawnId = draw.drawnParticipantId;
    const beforeStars = state.participants[drawnId].stars;

    expect(respondToFantasmaDraw(state, draw.id, drawnId, true, '09:02').ok).toBe(true);
    expect(completeFantasmaDrawTask(state, draw.id, drawnId, '11:30').ok).toBe(true);
    expect(state.participants[drawnId].stars).toBe(beforeStars + 3);
    expect(state.participants.karine.stars).toBe(35);
  });

  it('blocks Chefe delegation when target has active Escudo', () => {
    const state = createInitialSeedState();
    rollDice(state, '2026-11-14', 'tailan', 1, '09:00', 3);
    resolveDiceAction(state, '2026-11-14', 'tailan', 1, '09:01', { action: 'activate_shield' });

    rollDice(state, '2026-11-14', 'karine', 1, '09:05', 5);
    const blocked = resolveDiceAction(state, '2026-11-14', 'karine', 1, '09:06', {
      action: 'chefe',
      taskId: 'almoco',
      targetId: 'tailan',
    });
    expect(blocked.ok).toBe(false);
  });

  it('handles denunciations (+1/-1) and adversary SÁBADO/DOMINGO weekend punishment choice', () => {
    const state = createInitialSeedState();
    const den = submitDenunciation(
      state,
      '2026-11-14',
      'tailan',
      'caio',
      'tarefa',
      'roupa',
      'Não lavou a roupa',
      '14:00'
    );
    expect(den.ok).toBe(true);
    expect(state.participants.tailan.stars).toBe(26);
    expect(state.participants.caio.stars).toBe(21);
    expect(state.weekendPunishments.length).toBe(1);
    expect(state.weekendPunishments[0].coveringForId).toBe('tailan');

    const choose = choosePunishmentDay(
      state,
      state.weekendPunishments[0].id,
      'tailan',
      'domingo',
      '14:05'
    );
    expect(choose.ok).toBe(true);
    expect(state.weekendPunishments[0].chosenDay).toBe('domingo');
  });

  it('records daily justifications with reason and details', () => {
    const state = createInitialSeedState();
    const just = submitJustification(state, '2026-11-13', 'caio', 'doente', 'Febre hoje', '13:00');
    expect(just.ok).toBe(true);
    expect(state.justifications[0].reason).toBe('doente');
    expect(state.justifications[0].details).toBe('Febre hoje');
  });

  it('carries accumulated powers from Friday dice, prevents duplicate +1 ⭐ on inventory use, and allows using multiple items anytime', () => {
    const state = createInitialSeedState();
    expect(state.participants.karine.inventory.chefe).toBe(1);
    expect(state.participants.karine.inventory.fantasma).toBe(1);
    expect(state.participants.caio.inventory.chefe).toBe(2);
    expect(state.participants.carol.inventory.fantasma).toBe(4);
    expect(state.participants.tailan.inventory.escudo).toBe(1);
    expect(state.participants.tailan.inventory.fantasma).toBe(2);

    // Carol uses 1 accumulated Fantasma on Saturday 14/11 (banheiro belongs to Carol)
    const carolBefore = state.participants.carol.stars;
    const useCarolRes = useInventoryPower(state, '2026-11-14', 'carol', 'fantasma', '10:30', {
      taskId: 'banheiro',
    });
    expect(useCarolRes.ok).toBe(true);
    expect(state.participants.carol.inventory.fantasma).toBe(3);
    // No duplicate +1 ⭐ when activating accumulated Fantasma
    expect(state.participants.carol.stars).toBe(carolBefore);

    // Tailan uses both accumulated Escudo and Fantasma before 12:00 ("usar quando quiser")
    expect(useInventoryPower(state, '2026-11-14', 'tailan', 'escudo', '08:00', {}).ok).toBe(true);
    expect(
      useInventoryPower(state, '2026-11-14', 'tailan', 'fantasma', '08:10', {
        taskId: 'fogao_almoco',
      }).ok
    ).toBe(true);
    expect(state.participants.tailan.inventory.escudo).toBe(0);
    expect(state.participants.tailan.inventory.fantasma).toBe(1);

    const draw = state.fantasmaDraws.find((d) => d.dateStr === '2026-11-14' && d.ownerId === 'carol');
    expect(draw).toBeDefined();
    expect(draw?.taskId).toBe('banheiro');
    const drawnPid = draw!.drawnParticipantId;
    const beforeStars = state.participants[drawnPid].stars;
    expect(respondToFantasmaDraw(state, draw!.id, drawnPid, true, '10:35').ok).toBe(true);
    expect(completeFantasmaDrawTask(state, draw!.id, drawnPid, '11:30').ok).toBe(true);
    expect(state.participants[drawnPid].stars).toBe(beforeStars + 3);

    const karineBeforeRoll = state.participants.karine.stars;
    rollDice(state, '2026-11-14', 'karine', 1, '09:30', 5);
    expect(state.participants.karine.stars).toBe(karineBeforeRoll + 1);
    const saveRes = resolveDiceAction(state, '2026-11-14', 'karine', 1, '09:31', {
      action: 'save_to_inventory',
    });
    expect(saveRes.ok).toBe(true);
    expect(state.participants.karine.inventory.chefe).toBe(2);
  });

  it('delegation flow on Saturday 14/11: QUERO gives +1⭐ to both; failing gives -1⭐ & punishment; NÃO QUERO -> owner draws 2 -> +2⭐ or returns to owner (+2⭐)', () => {
    // 1. Accepted & completed -> +1⭐ target AND +1⭐ delegator (Sat 14/11 almoco belongs to Karine)
    const state1 = createInitialSeedState();
    rollDice(state1, '2026-11-14', 'karine', 1, '09:00', 5);
    expect(
      resolveDiceAction(state1, '2026-11-14', 'karine', 1, '09:01', {
        action: 'chefe',
        taskId: 'almoco',
        targetId: 'tailan',
      }).ok
    ).toBe(true);

    expect(state1.days['2026-11-14'].tasks.almoco.delegationStage).toBe('pending_target');
    expect(completeTask(state1, '2026-11-14', 'tailan', 'almoco', '11:30').ok).toBe(false);

    expect(respondToDelegation(state1, '2026-11-14', 'almoco', 'tailan', true, '09:05').ok).toBe(true);
    expect(completeTask(state1, '2026-11-14', 'tailan', 'almoco', '11:30').ok).toBe(true);
    expect(state1.participants.tailan.stars).toBe(26); // 25 + 1
    expect(state1.participants.karine.stars).toBe(36); // 34 + 1 (Chefe roll) + 1 (delegation completed)

    // 2. Delegated target fails deadline -> -1⭐ + weekend punishment
    const state2 = createInitialSeedState();
    rollDice(state2, '2026-11-14', 'karine', 1, '09:00', 5);
    resolveDiceAction(state2, '2026-11-14', 'karine', 1, '09:01', {
      action: 'chefe',
      taskId: 'almoco',
      targetId: 'tailan',
    });
    respondToDelegation(state2, '2026-11-14', 'almoco', 'tailan', true, '09:05');
    const sat2 = state2.days['2026-11-14'];
    sat2.tasks.cafe_manha.completedBy = 'carol';
    sat2.tasks.varrer_manha.completedBy = 'caio';
    sat2.routines.tailan.acordar.completed = true;
    sat2.routines.tailan.dobrar_lencol.completed = true;
    sat2.routines.tailan.escovar_cafe.completed = true;
    sat2.routines.tailan.vasilhas_cafe_manha.completed = true;
    processExpiredDeadlines(state2, '2026-11-14', '12:35');
    expect(state2.participants.tailan.stars).toBe(24); // 25 - 1 star only from delegated almoco
    expect(state2.weekendPunishments.some((wp) => wp.punishedId === 'tailan' && wp.taskId === 'almoco')).toBe(true);

    // 3. Target declines (NÃO QUERO) -> owner draws between other 2 (carol, caio) -> drawn declines -> returns to owner (+2⭐)
    const state3 = createInitialSeedState();
    rollDice(state3, '2026-11-14', 'karine', 1, '09:00', 5);
    resolveDiceAction(state3, '2026-11-14', 'karine', 1, '09:01', {
      action: 'chefe',
      taskId: 'almoco',
      targetId: 'tailan',
    });
    expect(respondToDelegation(state3, '2026-11-14', 'almoco', 'tailan', false, '09:05').ok).toBe(true);
    expect(state3.days['2026-11-14'].tasks.almoco.delegationStage).toBe('awaiting_owner_draw');

    const drawRes = drawDelegationFallback(state3, '2026-11-14', 'almoco', 'karine', '09:06', 'carol');
    expect(drawRes.ok).toBe(true);
    expect(drawRes.drawnParticipantId).toBe('carol');

    expect(respondToDelegation(state3, '2026-11-14', 'almoco', 'carol', false, '12:31').ok).toBe(true);
    expect(state3.participants.carol.stars).toBe(37);
    expect(state3.days['2026-11-14'].tasks.almoco.delegationStage).toBe('returned_to_owner');

    expect(completeTask(state3, '2026-11-14', 'karine', 'almoco', '12:45').ok).toBe(true);
    expect(state3.participants.karine.stars).toBe(37); // 34 + 1 (Chefe roll) + 2

    // 4. Drawn participant accepts -> earns +2⭐
    const state4 = createInitialSeedState();
    rollDice(state4, '2026-11-14', 'karine', 1, '09:00', 5);
    resolveDiceAction(state4, '2026-11-14', 'karine', 1, '09:01', {
      action: 'chefe',
      taskId: 'almoco',
      targetId: 'tailan',
    });
    respondToDelegation(state4, '2026-11-14', 'almoco', 'tailan', false, '09:05');
    drawDelegationFallback(state4, '2026-11-14', 'almoco', 'karine', '09:06', 'caio');
    respondToDelegation(state4, '2026-11-14', 'almoco', 'caio', true, '09:07');
    expect(completeTask(state4, '2026-11-14', 'caio', 'almoco', '11:40').ok).toBe(true);
    expect(state4.participants.caio.stars).toBe(24); // 22 + 2
  });

  it('auto-triggers rescue cascade (+2⭐ -> +3⭐ -> +6⭐ mandatory + weekend punishment), excluding roupa', () => {
    const state = createInitialSeedState();
    // Saturday 14/11: cafe_manha belongs to Carol (weekend limit 08:00), covering Karine in rotation
    processExpiredDeadlines(state, '2026-11-14', '08:05');

    expect(state.weekendPunishments.some((w) => w.punishedId === 'carol' && w.coveringForId === 'karine')).toBe(true);
    const rescue1 = state.days['2026-11-14'].tasks.cafe_manha.rescue!;
    expect(rescue1).toBeTruthy();
    expect(rescue1.step).toBe(1);
    expect(rescue1.rewardStars).toBe(2);
    expect(rescue1.currentAssigneeId).not.toBe('carol');

    expect(state.days['2026-11-14'].tasks.roupa.rescue).toBeUndefined();

    const step1Assignee = rescue1.currentAssigneeId;
    const step1StarsBefore = state.participants[step1Assignee].stars;
    expect(respondToTaskRescue(state, '2026-11-14', 'cafe_manha', step1Assignee, false, '08:06').ok).toBe(true);
    expect(state.participants[step1Assignee].stars).toBe(step1StarsBefore);
    expect(rescue1.step).toBe(2);
    expect(rescue1.rewardStars).toBe(3);

    const step2Assignee = rescue1.currentAssigneeId;
    expect(step2Assignee).not.toBe(step1Assignee);
    expect(respondToTaskRescue(state, '2026-11-14', 'cafe_manha', step2Assignee, false, '08:07').ok).toBe(true);
    expect(rescue1.step).toBe(3);
    expect(rescue1.rewardStars).toBe(6);
    expect(rescue1.accepted).toBe(true);

    const step3Assignee = rescue1.currentAssigneeId;
    expect(respondToTaskRescue(state, '2026-11-14', 'cafe_manha', step3Assignee, false, '08:08').ok).toBe(false);

    expect(failTaskRescueStep3(state, '2026-11-14', 'cafe_manha', step3Assignee, '08:30').ok).toBe(true);
    expect(state.weekendPunishments.some((w) => w.punishedId === step3Assignee && w.taskId === 'cafe_manha')).toBe(true);

    const stateWin = createInitialSeedState();
    processExpiredDeadlines(stateWin, '2026-11-14', '08:05');
    const rWin = stateWin.days['2026-11-14'].tasks.cafe_manha.rescue!;
    respondToTaskRescue(stateWin, '2026-11-14', 'cafe_manha', rWin.currentAssigneeId, false, '08:06');
    respondToTaskRescue(stateWin, '2026-11-14', 'cafe_manha', rWin.currentAssigneeId, false, '08:07');
    const winnerId = rWin.currentAssigneeId;
    const beforeWinStars = stateWin.participants[winnerId].stars;
    expect(completeTask(stateWin, '2026-11-14', winnerId, 'cafe_manha', '08:20').ok).toBe(true);
    expect(stateWin.participants[winnerId].stars).toBe(beforeWinStars + 6);
  });

  it('awards +1⭐ on Round 1 Chefe and +2⭐ on Round 2 Chefe automatically even without using, and requires Chefe to delegate owner task', () => {
    const state = createInitialSeedState();

    rollDice(state, '2026-11-14', 'tailan', 1, '09:00', 5);
    expect(state.participants.tailan.stars).toBe(26); // 25 + 1
    expect(
      resolveDiceAction(state, '2026-11-14', 'tailan', 1, '09:01', {
        action: 'save_to_inventory',
      }).ok
    ).toBe(true);
    expect(state.participants.tailan.stars).toBe(26);

    rollDice(state, '2026-11-14', 'tailan', 2, '14:00', 5);
    expect(state.participants.tailan.stars).toBe(28); // 26 + 2
    expect(
      resolveDiceAction(state, '2026-11-14', 'tailan', 2, '14:01', {
        action: 'save_to_inventory',
      }).ok
    ).toBe(true);
    expect(state.participants.tailan.stars).toBe(28);

    rollDice(state, '2026-11-14', 'caio', 2, '14:10', 6);
    expect(state.participants.caio.stars).toBe(22);
    expect(
      resolveDiceAction(state, '2026-11-14', 'caio', 2, '14:11', {
        action: 'pick_coringa',
        powerChoice: 'chefe',
      }).ok
    ).toBe(true);
    expect(state.participants.caio.stars).toBe(24); // 22 + 2

    const wrongOwner = resolveDiceAction(state, '2026-11-14', 'caio', 2, '14:12', {
      action: 'chefe',
      taskId: 'almoco', // Karine's task on Saturday 14/11
      targetId: 'tailan',
    });
    expect(wrongOwner.ok).toBe(false);
  });

  it('automatically rolls over at 00:00, clears expired flags, creates next day record, and respects manualDateLocked', () => {
    const state = createInitialSeedState();
    state.participants.caio.frozenDateStr = '2026-11-13';
    state.participants.karine.shieldActiveUntil = '2026-11-13T23:59';

    // When locked manually, automatic rollover is skipped
    expect(tailanSetManualDateLock(state, 'tailan', true).ok).toBe(true);
    expect(syncAutomaticDayRollover(state, '2026-11-14')).toBe(false);
    expect(state.currentDateStr).toBe('2026-11-13');

    // Unlock and roll over automatically to 2026-11-14
    expect(tailanSetManualDateLock(state, 'tailan', false).ok).toBe(true);
    expect(syncAutomaticDayRollover(state, '2026-11-14')).toBe(true);
    expect(state.currentDateStr).toBe('2026-11-14');
    expect(state.days['2026-11-14']).toBeDefined();
    expect(state.participants.caio.frozenDateStr).toBeNull();
    expect(state.participants.karine.shieldActiveUntil).toBeNull();
    expect(state.notifications.every((n) => n.dateStr === '2026-11-14')).toBe(true);

    // Dice works normally on the newly rolled-over Saturday!
    expect(rollDice(state, '2026-11-14', 'tailan', 1, '07:30', 4).ok).toBe(true);
  });

  it('updates participant display name and profile photo cleanly without altering stars or inventory', () => {
    const state = createInitialSeedState();
    const res = updateParticipantDisplayName(state, 'tailan', 'Tai Casa', '13:00');
    expect(res.ok).toBe(true);
    expect(getParticipantName(state, 'tailan')).toBe('Tai Casa');
    expect(state.participants.tailan.stars).toBe(25);

    expect(updateParticipantDisplayName(state, 'carol', 'Tai Casa', '13:01').ok).toBe(false);
    expect(updateParticipantDisplayName(state, 'carol', 'Caio', '13:01').ok).toBe(false);
    expect(updateParticipantDisplayName(state, 'carol', 'A', '13:02').ok).toBe(false);

    const sampleDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/';
    const avatarRes = updateParticipantAvatar(state, 'carol', sampleDataUrl, '13:15');
    expect(avatarRes.ok).toBe(true);
    expect(getParticipantAvatar(state, 'carol')).toBe(sampleDataUrl);
    expect(state.participants.carol.stars).toBe(37);
    expect(state.participants.carol.inventory).toEqual({
      fantasma: 4,
      escudo: 0,
      chefe: 0,
      coringa: 0,
    });

    expect(updateParticipantAvatar(state, 'carol', 'javascript:alert(1)', '13:16').ok).toBe(false);
    const resetRes = updateParticipantAvatar(state, 'carol', null, '13:17');
    expect(resetRes.ok).toBe(true);
    expect(getParticipantAvatar(state, 'carol')).toBe(PARTICIPANT_PROFILES.carol.avatarUrl);
  });

  it('supports free-form house chat messages and emoji reactions on chat, notifications, and participant cards', () => {
    const state = createInitialSeedState();

    const sent = sendChatMessage(state, 'caio', 'Perdi estrela mas vou virar esse jogo! 🔥', '16:10');
    expect(sent.ok).toBe(true);
    const msgId = sent.message!.id;

    const reply = sendChatMessage(state, 'carol', 'Duvido 😂', '16:11', { replyToId: msgId });
    expect(reply.ok).toBe(true);
    expect(reply.message!.replyToId).toBe(msgId);

    expect(toggleChatReaction(state, msgId, 'tailan', '😃').ok).toBe(true);
    expect(toggleChatReaction(state, msgId, 'karine', '😃').ok).toBe(true);
    expect(toggleChatReaction(state, msgId, 'tailan', '🔥').ok).toBe(true);
    expect(state.chatMessages[0].reactions['😃']).toEqual(['karine']);
    expect(state.chatMessages[0].reactions['🔥']).toEqual(['tailan']);

    expect(editChatMessage(state, msgId, 'carol', 'Hack', '16:12').ok).toBe(false);
    expect(editChatMessage(state, msgId, 'caio', '   ', '16:12').ok).toBe(false);
    const edited = editChatMessage(state, msgId, 'caio', 'Vou virar esse jogo hoje! 🚀', '16:12');
    expect(edited.ok).toBe(true);
    expect(edited.message?.text).toBe('Vou virar esse jogo hoje! 🚀');
    expect(edited.message?.editedAt).toBeTruthy();

    expect(deleteChatMessage(state, msgId, 'carol').ok).toBe(false);
    expect(deleteChatMessage(state, msgId, 'caio').ok).toBe(true);

    const friPenaltyNotif = state.notifications.find((n) => n.id === 'n-fri-1');
    expect(friPenaltyNotif).toBeDefined();
    expect(toggleNotificationReaction(state, friPenaltyNotif!.id, 'caio', '🤬').ok).toBe(true);
    expect(toggleNotificationReaction(state, friPenaltyNotif!.id, 'carol', '🤣').ok).toBe(true);
    expect(friPenaltyNotif!.reactions?.['🤬']).toEqual(['caio']);

    expect(toggleParticipantReaction(state, 'caio', 'caio', '🤬').ok).toBe(true);
    expect(toggleParticipantReaction(state, 'caio', 'tailan', '🤣').ok).toBe(true);
    expect(state.participants.caio.reactions?.['🤬']).toEqual(['caio']);
  });

  it('allows only Tailan to alter and add anything in the game (including dice, routines, punishments, profiles, and notifications)', () => {
    const state = createInitialSeedState();

    for (const nonMaster of ['carol', 'karine', 'caio'] as const) {
      expect(tailanSetParticipantStars(state, nonMaster, 'carol', 99, '15:00').ok).toBe(false);
      expect(tailanSetParticipantInventory(state, nonMaster, 'carol', 'coringa', 5).ok).toBe(false);
      expect(tailanSetParticipantFlags(state, nonMaster, 'carol', { frozenToday: true }).ok).toBe(false);
      expect(tailanSetDiceDisabledForDate(state, nonMaster, '2026-11-13', false).ok).toBe(false);
      expect(tailanSetDayDice(state, nonMaster, '2026-11-13', 'tailan', 1, 6, '15:00').ok).toBe(false);
      expect(
        tailanUpdateRoutineOverride(state, nonMaster, 'acordar', { label: 'Hack' }).ok
      ).toBe(false);
      expect(
        tailanUpsertCustomTask(
          state,
          nonMaster,
          { title: 'Invasão', assignedTo: 'all', starReward: 10 },
          '15:00'
        ).ok
      ).toBe(false);
      expect(
        tailanUpsertCustomRule(
          state,
          nonMaster,
          { title: 'Regra fake', description: 'Teste', category: 'geral' },
          '15:00'
        ).ok
      ).toBe(false);
      expect(tailanUpdateGoalBanner(state, nonMaster, 'Outro prêmio', '15:00').ok).toBe(false);
    }

    // Tailan edits stars, inventory, flags, dice disabled toggle, and manual dice face
    expect(tailanSetParticipantStars(state, 'tailan', 'caio', 25, '15:05').ok).toBe(true);
    expect(state.participants.caio.stars).toBe(25);
    expect(tailanSetParticipantInventory(state, 'tailan', 'tailan', 'coringa', 2).ok).toBe(true);
    expect(state.participants.tailan.inventory.coringa).toBe(2);
    expect(
      tailanSetDiceDisabledForDate(state, 'tailan', '2026-11-13', false).ok
    ).toBe(true);
    expect(state.diceDisabledDates).not.toContain('2026-11-13');
    expect(tailanSetDayDice(state, 'tailan', '2026-11-13', 'tailan', 1, 4, '09:00').ok).toBe(true);
    expect(state.days['2026-11-13'].dice.tailan.round1?.face).toBe(4);
    expect(tailanSetDayDice(state, 'tailan', '2026-11-13', 'tailan', 1, null, '09:00').ok).toBe(true);
    expect(state.days['2026-11-13'].dice.tailan.round1).toBeUndefined();

    expect(
      tailanSetParticipantFlags(state, 'tailan', 'tailan', {
        shieldActiveToday: true,
        frozenToday: true,
      }).ok
    ).toBe(true);
    expect(state.participants.tailan.shieldActiveUntil).toBe(`${state.currentDateStr}T23:59`);
    expect(state.participants.tailan.frozenDateStr).toBe(state.currentDateStr);
    expect(tailanSetParticipantFlags(state, 'tailan', 'tailan', { frozenToday: false }).ok).toBe(true);

    // Tailan edits custom task, day task/routine, task & routine overrides, participant profile, punishment, and notifications
    const ctRes = tailanUpsertCustomTask(
      state,
      'tailan',
      {
        dateStr: state.currentDateStr,
        title: 'Organizar área de serviço',
        description: 'Valendo bônus especial',
        assignedTo: 'all',
        starReward: 4,
        deadlineHHMM: '19:00',
      },
      '15:10'
    );
    expect(ctRes.ok).toBe(true);
    const carolBefore = state.participants.carol.stars;
    expect(completeCustomTask(state, state.currentDateStr, 'carol', ctRes.task!.id, '15:20').ok).toBe(true);
    expect(state.participants.carol.stars).toBe(carolBefore + 4);

    expect(
      tailanUpdateDayTask(
        state,
        'tailan',
        state.currentDateStr,
        'banheiro',
        { assignedTo: 'karine', status: 'completed', completedBy: 'karine' },
        '15:25'
      ).ok
    ).toBe(true);
    expect(state.days[state.currentDateStr].tasks.banheiro.completedBy).toBe('karine');

    expect(
      tailanUpdateDayRoutine(
        state,
        'tailan',
        state.currentDateStr,
        'caio',
        'acordar',
        'missed',
        '15:26'
      ).ok
    ).toBe(true);
    expect(state.days[state.currentDateStr].routines.caio.acordar.expiredPenaltyApplied).toBe(true);

    expect(
      tailanUpdateTaskOverride(state, 'tailan', 'banheiro', {
        label: 'Banheiro Geral',
        weekdayLimit: '18:00',
      }).ok
    ).toBe(true);
    expect(state.taskOverrides?.banheiro?.label).toBe('Banheiro Geral');

    expect(
      tailanUpdateRoutineOverride(state, 'tailan', 'acordar', {
        label: 'Acordar cedo',
        weekdayLimit: '07:45',
      }).ok
    ).toBe(true);
    expect(state.routineOverrides?.acordar?.label).toBe('Acordar cedo');

    expect(
      tailanUpdateParticipantProfile(
        state,
        'tailan',
        'caio',
        { displayName: 'Caio Jr', soundTheme: 'festa' },
        '15:28'
      ).ok
    ).toBe(true);
    expect(getParticipantName(state, 'caio')).toBe('Caio Jr');
    expect(state.participants.caio.soundTheme).toBe('festa');

    const punRes = tailanUpdateWeekendPunishment(
      state,
      'tailan',
      {
        punishedId: 'caio',
        coveringForId: 'tailan',
        taskId: 'banheiro',
        chosenDay: 'sabado',
      },
      '15:29'
    );
    expect(punRes.ok).toBe(true);
    expect(state.weekendPunishments[0].chosenDay).toBe('sabado');

    const ruleRes = tailanUpsertCustomRule(
      state,
      'tailan',
      {
        title: 'Bônus de Domingo',
        description: 'Quem fizer todas as rotinas no domingo ganha +1 ⭐ extra.',
        category: 'premio',
      },
      '15:30'
    );
    expect(ruleRes.ok).toBe(true);
    expect(
      tailanUpdateGoalBanner(state, 'tailan', 'Meta Final: R$ 200 + Jantar Pago!', '15:32').ok
    ).toBe(true);
    expect(
      tailanPostAnnouncement(
        state,
        'tailan',
        'Bônus da Casa',
        'Carol ajudou na compra',
        '15:35',
        { targetId: 'carol', delta: 2 }
      ).ok
    ).toBe(true);
    expect(state.participants.carol.stars).toBe(carolBefore + 6);

    const beforeNotifs = state.notifications.length;
    expect(tailanDeleteNotification(state, 'tailan', state.notifications[0].id).ok).toBe(true);
    expect(state.notifications.length).toBe(beforeNotifs - 1);

    expect(tailanDeleteCustomRule(state, 'tailan', ruleRes.rule!.id).ok).toBe(true);
    expect(tailanDeleteCustomTask(state, 'tailan', ctRes.task!.id).ok).toBe(true);
    expect(computeActionableAlerts(state, 'carol', '2026-11-13', '12:50')).toBeDefined();
  });

  it('protects shielded participants from EVERYTHING (Fantasma draw, delegation draw, rescue draw, R2 Face 1 steal, and denunciation)', () => {
    const state = createInitialSeedState();
    // Tailan activates his accumulated Escudo on Saturday 14/11 at 09:00 (active until 12:00)
    expect(useInventoryPower(state, '2026-11-14', 'tailan', 'escudo', '09:00', {}).ok).toBe(true);

    // 1. Blocks Fantasma draw targeting shielded participant (even if forced) and never draws him randomly
    rollDice(state, '2026-11-14', 'karine', 1, '09:05', 4);
    expect(
      resolveDiceAction(state, '2026-11-14', 'karine', 1, '09:06', {
        action: 'fantasma',
        taskId: 'almoco',
      }).ok
    ).toBe(true);
    const draw = state.fantasmaDraws.find((d) => d.dateStr === '2026-11-14' && d.ownerId === 'karine')!;
    expect(draw.drawnParticipantId).not.toBe('tailan');

    // 2. Blocks R2 Face 1 steal against shielded participant (afternoon shield)
    expect(useInventoryPower(state, '2026-11-14', 'tailan', 'escudo', '13:00', {}).ok).toBe(false); // already 0 left
    // Give Carol afternoon shield on Friday 13/11 and verify Caio cannot steal from Carol
    state.participants.carol.shieldActiveUntil = '2026-11-13T23:59:00';
    const stealBlocked = resolveDiceAction(state, '2026-11-13', 'caio', 2, '16:00', {
      action: 'steal',
      targetId: 'carol',
    });
    expect(stealBlocked.ok).toBe(false);

    // 3. Blocks denunciation against shielded participant
    const denBlocked = submitDenunciation(
      state,
      '2026-11-13',
      'caio',
      'carol',
      'rotina',
      'acordar',
      'Teste',
      '16:05'
    );
    expect(denBlocked.ok).toBe(false);

    // 4. Excludes shielded participant from rescue cascade & delegation fallback draw
    const state2 = createInitialSeedState();
    state2.participants.tailan.shieldActiveUntil = '2026-11-14T23:59:00';
    processExpiredDeadlines(state2, '2026-11-14', '08:05');
    const rescue = state2.days['2026-11-14'].tasks.cafe_manha.rescue!;
    expect(rescue.currentAssigneeId).not.toBe('tailan');
    expect(rescue.candidatePool).not.toContain('tailan');

    // Delegation fallback skips shielded Tailan
    rollDice(state2, '2026-11-14', 'karine', 1, '09:00', 5);
    resolveDiceAction(state2, '2026-11-14', 'karine', 1, '09:01', {
      action: 'chefe',
      taskId: 'almoco',
      targetId: 'caio',
    });
    respondToDelegation(state2, '2026-11-14', 'almoco', 'caio', false, '09:02');
    const blockedFallback = drawDelegationFallback(
      state2,
      '2026-11-14',
      'almoco',
      'karine',
      '09:03',
      'tailan'
    );
    expect(blockedFallback.ok).toBe(false);
    const validFallback = drawDelegationFallback(state2, '2026-11-14', 'almoco', 'karine', '09:04');
    expect(validFallback.ok).toBe(true);
    expect(validFallback.drawnParticipantId).toBe('carol');
  });

  it('justified routines neither lose (-1 ⭐) nor gain (+1 ⭐) stars', () => {
    const state = createInitialSeedState();
    const tailanStart = state.participants.tailan.stars;

    // 1. Justify a specific routine before deadline -> cannot earn +1 ⭐ and does not lose -1 ⭐ after deadline
    submitJustification(state, '2026-11-14', 'tailan', 'saiu', 'Consulta médica', '08:30', {
      routineIds: ['acordar'],
    });
    expect(state.days['2026-11-14'].routines.tailan.acordar.justified).toBe(true);
    // Attempting to complete justified routine does not grant +1 ⭐
    expect(completeRoutine(state, '2026-11-14', 'tailan', 'acordar', '08:40').ok).toBe(false);
    expect(state.participants.tailan.stars).toBe(tailanStart);

    // Past deadline (weekend limit 09:01) -> no -1 ⭐ penalty applied to acordar
    processExpiredDeadlines(state, '2026-11-14', '09:05');
    expect(state.days['2026-11-14'].routines.tailan.acordar.expiredPenaltyApplied).toBe(false);
    // dobrar_lencol (limit 09:10) not expired yet; let's expire it at 09:15 for Carol, then justify afterwards
    const carolStart = state.participants.carol.stars;
    processExpiredDeadlines(state, '2026-11-14', '09:15');
    expect(state.days['2026-11-14'].routines.carol.dobrar_lencol.expiredPenaltyApplied).toBe(true);
    expect(state.participants.carol.stars).toBe(carolStart - 1);

    // Carol justifies dobrar_lencol afterwards -> -1 ⭐ penalty is refunded, 0 ⭐ net (neither loses nor gains)
    submitJustification(state, '2026-11-14', 'carol', 'doente', 'Passou mal', '09:20', {
      routineIds: ['dobrar_lencol'],
    });
    expect(state.days['2026-11-14'].routines.carol.dobrar_lencol.expiredPenaltyApplied).toBe(false);
    expect(state.days['2026-11-14'].routines.carol.dobrar_lencol.justified).toBe(true);
    expect(state.participants.carol.stars).toBe(carolStart);
    expect(completeRoutine(state, '2026-11-14', 'carol', 'dobrar_lencol', '09:22').ok).toBe(false);
    expect(state.participants.carol.stars).toBe(carolStart);
  });

  it('justified tasks with "Tá doente" or "Teve que sair" neither lose (-3 ⭐) nor gain (0 ⭐) stars and avoid weekend punishment', () => {
    // 1. Justified before task deadline / giveUpTask -> 0 ⭐, no weekend punishment, rescue still runs
    const state1 = createInitialSeedState();
    const carolStart1 = state1.participants.carol.stars;
    submitJustification(state1, '2026-11-14', 'carol', 'doente', 'Febre hoje', '07:30');
    processExpiredDeadlines(state1, '2026-11-14', '08:05');

    const satCafe = state1.days['2026-11-14'].tasks.cafe_manha;
    expect(satCafe.justified).toBe(true);
    expect(satCafe.expiredPenaltyApplied).toBe(false);
    expect(state1.participants.carol.stars).toBe(carolStart1); // no -3 ⭐ lost, 0 ⭐ net
    expect(state1.weekendPunishments.some((w) => w.punishedId === 'carol' && w.taskId === 'cafe_manha')).toBe(false);
    expect(satCafe.rescue).toBeTruthy();

    // Rescue assignee can still complete the rescued task and earn +2 ⭐
    const rescuerId = satCafe.rescue!.currentAssigneeId;
    const rescuerBefore = state1.participants[rescuerId].stars;
    expect(respondToTaskRescue(state1, '2026-11-14', 'cafe_manha', rescuerId, true, '08:06').ok).toBe(true);
    expect(completeTask(state1, '2026-11-14', rescuerId, 'cafe_manha', '08:20').ok).toBe(true);
    expect(state1.participants[rescuerId].stars).toBe(rescuerBefore + 2);
    expect(state1.participants.carol.stars).toBe(carolStart1);

    // 2. General justification ("Teve que sair") AFTER task expired -> refunds -3 ⭐ and cancels weekend punishment (0 ⭐ net)
    const state2 = createInitialSeedState();
    const carolStart2 = state2.participants.carol.stars;
    processExpiredDeadlines(state2, '2026-11-14', '08:05');
    expect(state2.participants.carol.stars).toBe(carolStart2 - 3);
    expect(state2.weekendPunishments.some((w) => w.punishedId === 'carol' && w.taskId === 'cafe_manha')).toBe(true);

    submitJustification(state2, '2026-11-14', 'carol', 'saiu', 'Teve que sair de emergência', '08:15');
    expect(state2.days['2026-11-14'].tasks.cafe_manha.justified).toBe(true);
    expect(state2.days['2026-11-14'].tasks.cafe_manha.expiredPenaltyApplied).toBe(false);
    expect(state2.participants.carol.stars).toBe(carolStart2);
    expect(state2.weekendPunishments.some((w) => w.punishedId === 'carol' && w.taskId === 'cafe_manha')).toBe(false);

    // 3. giveUpTask with "doente" -> 0 ⭐ and no weekend punishment; "outro" -> still loses -3 ⭐ + weekend punishment
    const state3 = createInitialSeedState();
    const karineStart = state3.participants.karine.stars;
    submitJustification(state3, '2026-11-14', 'karine', 'doente', 'Passando mal', '10:00');
    expect(giveUpTask(state3, '2026-11-14', 'almoco', 'karine', '10:05').ok).toBe(true);
    expect(state3.participants.karine.stars).toBe(karineStart);
    expect(state3.days['2026-11-14'].tasks.almoco.justified).toBe(true);
    expect(state3.weekendPunishments.some((w) => w.punishedId === 'karine' && w.taskId === 'almoco')).toBe(false);

    const caioStart = state3.participants.caio.stars;
    submitJustification(state3, '2026-11-14', 'caio', 'outro', 'Esqueceu', '10:10');
    expect(giveUpTask(state3, '2026-11-14', 'varrer_manha', 'caio', '10:15').ok).toBe(true);
    expect(state3.participants.caio.stars).toBe(caioStart - 3);
    expect(state3.weekendPunishments.some((w) => w.punishedId === 'caio' && w.taskId === 'varrer_manha')).toBe(true);

    // Day summary reports 0 taskPenaltyStars for justified task
    const satSummary = computeDaySummary(state3, '2026-11-14')!;
    const karineSummary = satSummary.find((r) => r.pid === 'karine')!;
    expect(karineSummary.taskPenaltyStars).toBe(0);
    expect(karineSummary.missedTaskDetails.some((mt) => mt.def.id === 'almoco' && mt.justified)).toBe(true);
  });

  it('weekend punishment on Saturday: punished worker does both own and covered tasks, and covered participant automatically receives task stars only', () => {
    const state = createInitialSeedState();
    const carolStart = state.participants.carol.stars;
    const tailanStart = state.participants.tailan.stars;

    // Friday punishment for Tailan covering Carol; Carol chooses Saturday
    tailanUpdateWeekendPunishment(
      state,
      'tailan',
      {
        dateStr: '2026-11-13',
        punishedId: 'tailan',
        coveringForId: 'carol',
        deciderId: 'carol',
        taskId: 'cafe_manha',
        chosenDay: 'sabado',
      },
      '10:00'
    );

    // Carol cannot mark her covered Saturday task; Tailan marks Carol's cafe_manha & banheiro -> Carol gets +1⭐ automatically per task
    expect(completeTask(state, '2026-11-14', 'carol', 'cafe_manha', '07:45').ok).toBe(false);
    expect(completeTask(state, '2026-11-14', 'tailan', 'cafe_manha', '07:50').ok).toBe(true);
    expect(state.participants.carol.stars).toBe(carolStart + 1);
    expect(state.participants.tailan.stars).toBe(tailanStart);

    expect(completeTask(state, '2026-11-14', 'tailan', 'banheiro', '11:00').ok).toBe(true);
    expect(state.participants.carol.stars).toBe(carolStart + 2);
    expect(state.participants.tailan.stars).toBe(tailanStart);

    // Tailan completes his own task (organizar) -> Tailan gets +1⭐
    expect(completeTask(state, '2026-11-14', 'tailan', 'organizar', '11:10').ok).toBe(true);
    expect(state.participants.tailan.stars).toBe(tailanStart + 1);

    // Routines remain individual (not covered by weekend punishment)
    expect(completeRoutine(state, '2026-11-14', 'carol', 'acordar', '08:30').ok).toBe(true);
    expect(state.participants.carol.stars).toBe(carolStart + 3);

    // Summary matches actual star deltas
    const satSummary = computeDaySummary(state, '2026-11-14')!;
    const carolSat = satSummary.find((r) => r.pid === 'carol')!;
    const tailanSat = satSummary.find((r) => r.pid === 'tailan')!;
    expect(carolSat.taskEarnedStars).toBe(2);
    expect(carolSat.routineEarnedStars).toBe(1);
    expect(carolSat.netStars).toBe(3);
    expect(tailanSat.taskEarnedStars).toBe(1);
    expect(tailanSat.netStars).toBe(1);
  });

  it('bypasses dependent deadline when prerequisite was finished within 15 minutes of dependent limit and never penalizes already completed items', () => {
    const state = createInitialSeedState();
    // Saturday 14/11: vasilhas_almoco weekend limit is 12:20.
    // If almoco finishes at 12:18, 12:18 + 15min = 12:33 > 12:20 -> dependent deadline is bypassed!
    expect(completeTask(state, '2026-11-14', 'karine', 'almoco', '12:18').ok).toBe(true);
    const sat = state.days['2026-11-14'];
    expect(isDeadlineBypassedByPrerequisite(state, sat, '2026-11-14', 'almoco', '12:20')).toBe(true);

    const routineUnlock = isRoutineUnlocked(sat, 'vasilhas_almoco', state);
    expect(routineUnlock.unlocked).toBe(true);
    expect(routineUnlock.bypassedDeadline).toBe(true);

    // Even well after 12:20, processExpiredDeadlines must NOT penalize vasilhas_almoco and Tailan can complete it
    processExpiredDeadlines(state, '2026-11-14', '14:30');
    expect(sat.routines.tailan.vasilhas_almoco.expiredPenaltyApplied).toBe(false);

    const beforeTailan = state.participants.tailan.stars;
    expect(completeRoutine(state, '2026-11-14', 'tailan', 'vasilhas_almoco', '14:35').ok).toBe(true);
    expect(state.participants.tailan.stars).toBe(beforeTailan + 1);

    // Once completed, running processExpiredDeadlines later never flips completed items back to missed/penalized
    processExpiredDeadlines(state, '2026-11-14', '23:55');
    expect(sat.routines.tailan.vasilhas_almoco.completed).toBe(true);
    expect(sat.routines.tailan.vasilhas_almoco.expiredPenaltyApplied).toBe(false);
    expect(sat.tasks.almoco.completedBy).toBe('karine');
    expect(sat.tasks.almoco.expiredPenaltyApplied).toBe(false);
  });

  it('preserves completed tasks, routines, custom displayName, and data-URL avatar (including charset) across midnight day rollovers', () => {
    const state = createInitialSeedState();
    const customAvatar = 'data:image/jpeg;charset=utf-8;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/';

    expect(updateParticipantDisplayName(state, 'tailan', 'Tailan Silva', '10:00').ok).toBe(true);
    expect(updateParticipantAvatar(state, 'tailan', customAvatar, '10:01').ok).toBe(true);
    expect(completeRoutine(state, '2026-11-14', 'tailan', 'acordar', '08:30').ok).toBe(true);
    expect(completeTask(state, '2026-11-14', 'tailan', 'organizar', '16:00').ok).toBe(true);
    // Remaining tasks/routines not done at midnight don't touch already-completed acordar & organizar
    expect(syncAutomaticDayRollover(state, '2026-11-15')).toBe(true);
    expect(state.currentDateStr).toBe('2026-11-15');
    expect(getParticipantName(state, 'tailan')).toBe('Tailan Silva');
    expect(getParticipantAvatar(state, 'tailan')).toBe(customAvatar);
    expect(state.days['2026-11-14'].routines.tailan.acordar.completed).toBe(true);
    expect(state.days['2026-11-14'].routines.tailan.acordar.expiredPenaltyApplied).toBe(false);
    expect(state.days['2026-11-14'].tasks.organizar.completedBy).toBe('tailan');
    expect(state.days['2026-11-14'].tasks.organizar.expiredPenaltyApplied).toBe(false);
  });

  it('computes exact Saturday 14/11 net deltas for Tailan + Carol covered tasks + R2 Face 1 steal and Carol R2 Face 2', () => {
    const state = createInitialSeedState();

    // Friday punishment on Saturday for Tailan covering Carol
    tailanUpdateWeekendPunishment(
      state,
      'tailan',
      {
        dateStr: '2026-11-13',
        punishedId: 'tailan',
        coveringForId: 'carol',
        deciderId: 'carol',
        taskId: 'cafe_manha',
        chosenDay: 'sabado',
      },
      '07:00'
    );

    // Carol tasks covered by Tailan: cafe_manha (+1 Carol), varrer_tarde (+1 Carol), banheiro (+1 Carol)
    expect(completeTask(state, '2026-11-14', 'tailan', 'cafe_manha', '07:50').ok).toBe(true);
    // Morning/lunch tasks + 5 routines for everyone
    for (const pid of ['tailan', 'carol', 'karine', 'caio'] as const) {
      expect(completeRoutine(state, '2026-11-14', pid, 'acordar', '08:50').ok).toBe(true);
      expect(completeRoutine(state, '2026-11-14', pid, 'dobrar_lencol', '09:05').ok).toBe(true);
      expect(completeRoutine(state, '2026-11-14', pid, 'escovar_cafe', '09:45').ok).toBe(true);
      expect(completeRoutine(state, '2026-11-14', pid, 'vasilhas_cafe_manha', '10:05').ok).toBe(true);
    }
    expect(completeTask(state, '2026-11-14', 'caio', 'varrer_manha', '09:50').ok).toBe(true);
    expect(completeTask(state, '2026-11-14', 'karine', 'almoco', '12:05').ok).toBe(true);
    for (const pid of ['tailan', 'carol', 'karine', 'caio'] as const) {
      expect(completeRoutine(state, '2026-11-14', pid, 'vasilhas_almoco', '12:15').ok).toBe(true);
    }

    // Tailan own & afternoon Carol tasks
    expect(completeTask(state, '2026-11-14', 'tailan', 'fogao_almoco', '13:30').ok).toBe(true);
    expect(rollDice(state, '2026-11-14', 'tailan', 2, '14:15', 1).ok).toBe(true);
    expect(resolveDiceAction(state, '2026-11-14', 'tailan', 2, '14:15', { action: 'steal', targetId: 'karine' }).ok).toBe(true);
    expect(rollDice(state, '2026-11-14', 'carol', 2, '14:20', 2).ok).toBe(true);
    expect(completeTask(state, '2026-11-14', 'tailan', 'varrer_tarde', '16:50').ok).toBe(true);
    expect(completeTask(state, '2026-11-14', 'tailan', 'banheiro', '17:20').ok).toBe(true);
    expect(completeTask(state, '2026-11-14', 'tailan', 'organizar', '17:25').ok).toBe(true);

    // Caio missed cafe_tarde (-3)
    processExpiredDeadlines(state, '2026-11-14', '15:25');

    expect(state.participants.carol.stars).toBe(42);
    expect(state.participants.tailan.stars).toBe(37);
    expect(state.participants.karine.stars).toBe(37);
    expect(state.participants.caio.stars).toBe(26);
    expect(state.participants.tailan.unlockedMilestones).toContain(35);
    expect(state.participants.tailan.inventory.fantasma).toBe(3);

    const sat = computeDaySummary(state, '2026-11-14')!;
    const satMap = Object.fromEntries(sat.map((r) => [r.pid, r]));
    expect(satMap.carol.netStars).toBe(5);
    expect(satMap.tailan.netStars).toBe(12);
    expect(satMap.karine.netStars).toBe(3);
    expect(satMap.caio.netStars).toBe(4);
  });

  it('saves and isolates per-day dice non-roll justifications in gameState without altering stars', () => {
    const state = createInitialSeedState();
    const karineStarsBefore = state.participants.karine.stars;
    const caioStarsBefore = state.participants.caio.stars;

    // Reject empty text when nothing was saved yet
    expect(saveDiceJustification(state, '2026-11-14', 'karine', '   ', '19:30').ok).toBe(false);

    // Save justification for Karine on 2026-11-14
    const res = saveDiceJustification(
      state,
      '2026-11-14',
      'karine',
      '  Não consegui jogar no horário hoje  ',
      '19:35'
    );
    expect(res.ok).toBe(true);
    expect(state.participants.karine.stars).toBe(karineStarsBefore);
    expect(state.participants.caio.stars).toBe(caioStarsBefore);
    expect(state.days['2026-11-14'].diceJustifications?.karine).toEqual({
      text: 'Não consegui jogar no horário hoje',
      updatedAt: '2026-11-14T19:35:00',
    });

    // Does not leak into another day
    ensureDayRecord(state, '2026-11-15');
    expect(state.days['2026-11-15'].diceJustifications?.karine).toBeUndefined();

    // Surfaced in computeDaySummary for that specific day
    const satSummary = computeDaySummary(state, '2026-11-14')!;
    const karineSat = satSummary.find((r) => r.pid === 'karine')!;
    expect(karineSat.diceJustification?.text).toBe('Não consegui jogar no horário hoje');

    // Clearing with empty text removes saved entry for that day
    expect(saveDiceJustification(state, '2026-11-14', 'karine', '', '19:40').ok).toBe(true);
    expect(state.days['2026-11-14'].diceJustifications?.karine).toBeUndefined();
  });
});


