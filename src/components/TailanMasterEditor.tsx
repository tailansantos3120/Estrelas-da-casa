import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Check,
  Crown,
  Dices,
  Flame,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  ScrollText,
  Shield,
  Snowflake,
  Sparkles,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react';
import { isDiceDisabledForDate, isFrozenToday, isShieldActiveNow } from '../shared/gameLogic.ts';
import {
  getBrazilClockHHMM,
  getEffectiveRoutineDefinition,
  getEffectiveTaskDefinition,
  getParticipantAvatar,
  getParticipantName,
  PARTICIPANT_PROFILES,
  ROTATION_ORDER,
  ROUTINE_DEFINITIONS,
  TASK_DEFINITIONS,
} from '../shared/schedule.ts';
import type {
  CustomGameRule,
  CustomGameTask,
  GameState,
  ParticipantId,
  PowerType,
  RoutineId,
  TaskId,
} from '../shared/types.ts';

interface TailanMasterEditorProps {
  gameState: GameState;
  currentUserId: ParticipantId;
  onBack: () => void;
  onAction: (
    type: string,
    payload?: Record<string, unknown>
  ) => Promise<{ ok: boolean; error?: string }>;
  onShowToast: (title: string, msg: string, tone?: 'gold' | 'error' | 'success') => void;
}

type MasterSection = 'participantes' | 'tarefas' | 'regras' | 'sistema';

export default function TailanMasterEditor({
  gameState,
  currentUserId,
  onBack,
  onAction,
  onShowToast,
}: TailanMasterEditorProps) {
  const [section, setSection] = useState<MasterSection>('participantes');

  // Star inputs & profile displayName drafts per participant
  const [starDrafts, setStarDrafts] = useState<Record<ParticipantId, string>>(() => ({
    tailan: String(gameState.participants.tailan.stars),
    carol: String(gameState.participants.carol.stars),
    karine: String(gameState.participants.karine.stars),
    caio: String(gameState.participants.caio.stars),
  }));
  const [nameDrafts, setNameDrafts] = useState<Record<ParticipantId, string>>(() => ({
    tailan: getParticipantName(gameState, 'tailan'),
    carol: getParticipantName(gameState, 'carol'),
    karine: getParticipantName(gameState, 'karine'),
    caio: getParticipantName(gameState, 'caio'),
  }));

  // Target date selector for editing tasks, routines, and dice
  const [editDateStr, setEditDateStr] = useState(gameState.currentDateStr);

  // Custom Task form
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [ctTitle, setCtTitle] = useState('');
  const [ctDesc, setCtDesc] = useState('');
  const [ctAssignee, setCtAssignee] = useState<ParticipantId | 'all'>('all');
  const [ctStars, setCtStars] = useState('2');
  const [ctDeadline, setCtDeadline] = useState('');
  const [ctScope, setCtScope] = useState<'today' | 'all'>('today');

  // Task override editor
  const [overrideTaskId, setOverrideTaskId] = useState<TaskId>('cafe_manha');
  const [overrideLabel, setOverrideLabel] = useState('');
  const [overrideWeekLimit, setOverrideWeekLimit] = useState('');
  const [overrideWeekendLimit, setOverrideWeekendLimit] = useState('');

  // Routine override editor
  const [overrideRoutineId, setOverrideRoutineId] = useState<RoutineId>('acordar');
  const [routineOvLabel, setRoutineOvLabel] = useState('');
  const [routineOvWeekLimit, setRoutineOvWeekLimit] = useState('');
  const [routineOvWeekendLimit, setRoutineOvWeekendLimit] = useState('');

  // Routine editor target
  const [routineTargetPid, setRoutineTargetPid] = useState<ParticipantId>('tailan');

  // Custom Rule form
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleTitle, setRuleTitle] = useState('');
  const [ruleDesc, setRuleDesc] = useState('');
  const [ruleCategory, setRuleCategory] = useState<CustomGameRule['category']>('geral');

  // Goal banner form
  const [goalDraft, setGoalDraft] = useState(
    gameState.goalBannerText || 'Meta Final: R$ 150 para o 1º Colocado no Fim de Ano!'
  );

  // Weekend punishment creator
  const [punTargetPid, setPunTargetPid] = useState<ParticipantId>('caio');
  const [punCoverPid, setPunCoverPid] = useState<ParticipantId>('tailan');
  const [punTaskId, setPunTaskId] = useState<TaskId>('cafe_manha');
  const [punDay, setPunDay] = useState<'sabado' | 'domingo' | ''>('');

  // Announcement form
  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [annTargetId, setAnnTargetId] = useState<ParticipantId | ''>('');
  const [annDelta, setAnnDelta] = useState('0');

  // Date & Clock
  const [dateInput, setDateInput] = useState(gameState.currentDateStr);
  const [clockInput, setClockInput] = useState(gameState.simulatedClockTime || '');

  // Keep form drafts synchronized when remote updates arrive
  useEffect(() => {
    setStarDrafts({
      tailan: String(gameState.participants.tailan.stars),
      carol: String(gameState.participants.carol.stars),
      karine: String(gameState.participants.karine.stars),
      caio: String(gameState.participants.caio.stars),
    });
  }, [
    gameState.participants.tailan.stars,
    gameState.participants.carol.stars,
    gameState.participants.karine.stars,
    gameState.participants.caio.stars,
  ]);

  useEffect(() => {
    setNameDrafts({
      tailan: getParticipantName(gameState, 'tailan'),
      carol: getParticipantName(gameState, 'carol'),
      karine: getParticipantName(gameState, 'karine'),
      caio: getParticipantName(gameState, 'caio'),
    });
  }, [
    gameState.participants.tailan.displayName,
    gameState.participants.carol.displayName,
    gameState.participants.karine.displayName,
    gameState.participants.caio.displayName,
  ]);

  useEffect(() => {
    setGoalDraft(
      gameState.goalBannerText || 'Meta Final: R$ 150 para o 1º Colocado no Fim de Ano!'
    );
  }, [gameState.goalBannerText]);

  useEffect(() => {
    setDateInput(gameState.currentDateStr);
    setEditDateStr(gameState.currentDateStr);
  }, [gameState.currentDateStr]);

  useEffect(() => {
    setClockInput(gameState.simulatedClockTime || '');
  }, [gameState.simulatedClockTime]);

  useEffect(() => {
    const ov = gameState.taskOverrides?.[overrideTaskId];
    setOverrideLabel(ov?.label || '');
    setOverrideWeekLimit(ov?.weekdayLimit || '');
    setOverrideWeekendLimit(ov?.weekendLimit || '');
  }, [overrideTaskId, gameState.taskOverrides]);

  useEffect(() => {
    const ov = gameState.routineOverrides?.[overrideRoutineId];
    setRoutineOvLabel(ov?.label || '');
    setRoutineOvWeekLimit(ov?.weekdayLimit || '');
    setRoutineOvWeekendLimit(ov?.weekendLimit || '');
  }, [overrideRoutineId, gameState.routineOverrides]);

  const dateStr = gameState.currentDateStr;
  const editDay = gameState.days[editDateStr];
  const recordedDates = useMemo(
    () => Object.keys(gameState.days).sort((a, b) => b.localeCompare(a)),
    [gameState.days]
  );
  const nowHHMM = useMemo(() => {
    if (gameState.simulatedClockTime) return gameState.simulatedClockTime;
    return getBrazilClockHHMM();
  }, [gameState.simulatedClockTime]);

  if (currentUserId !== 'tailan') {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="glass-subcard min-h-[44px] px-3.5 rounded-2xl flex items-center gap-2 text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar</span>
        </button>
        <div className="glass-card rounded-3xl p-6 text-center space-y-2">
          <Crown className="w-8 h-8 text-amber-400 mx-auto" />
          <p className="text-base font-bold text-slate-900 dark:text-white">
            Área exclusiva do Tailan
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Somente a conta de Tailan pode editar e acrescentar regras, tarefas e pontuações do jogo.
          </p>
        </div>
      </div>
    );
  }

  const handleSaveCustomTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await onAction('tailan_upsert_custom_task', {
      id: editingTaskId || undefined,
      title: ctTitle,
      description: ctDesc,
      assignedTo: ctAssignee,
      starReward: Number(ctStars || 1),
      deadlineHHMM: ctDeadline || null,
      taskDateStr: ctScope === 'all' ? 'all' : dateStr,
      dateStr,
      nowHHMM,
    });
    if (res.ok) {
      onShowToast(
        editingTaskId ? 'Tarefa atualizada' : 'Tarefa criada',
        `"${ctTitle}" já está ativa no jogo para todos.`,
        'success'
      );
      setEditingTaskId(null);
      setCtTitle('');
      setCtDesc('');
      setCtStars('2');
      setCtDeadline('');
    }
  };

  const handleEditCustomTask = (ct: CustomGameTask) => {
    setEditingTaskId(ct.id);
    setCtTitle(ct.title);
    setCtDesc(ct.description || '');
    setCtAssignee(ct.assignedTo);
    setCtStars(String(ct.starReward));
    setCtDeadline(ct.deadlineHHMM || '');
    setCtScope(ct.dateStr === 'all' ? 'all' : 'today');
  };

  const handleSaveCustomRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await onAction('tailan_upsert_custom_rule', {
      id: editingRuleId || undefined,
      title: ruleTitle,
      description: ruleDesc,
      category: ruleCategory,
      dateStr,
      nowHHMM,
    });
    if (res.ok) {
      onShowToast(
        editingRuleId ? 'Regra atualizada' : 'Regra adicionada',
        `"${ruleTitle}" já aparece na aba Regras.`,
        'success'
      );
      setEditingRuleId(null);
      setRuleTitle('');
      setRuleDesc('');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="glass-subcard min-h-[44px] px-3.5 rounded-2xl flex items-center gap-2 text-sm font-semibold hover:border-amber-400/50 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar</span>
        </button>

        <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
          <Crown className="w-4 h-4" />
          <span>Modo Mestre · Tailan pode alterar tudo a qualquer hora</span>
        </div>
      </div>

      {/* Header + Section Switcher */}
      <section className="glass-gold rounded-3xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-md">
            <Crown className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
              Editor Total do Jogo (Tailan)
            </h1>
            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 mt-0.5">
              Altere e acrescente estrelas, poderes, tarefas, rotinas, regras, prêmios, avisos e datas em tempo real.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(
            [
              { id: 'participantes', label: 'Participantes & ⭐', icon: Users },
              { id: 'tarefas', label: 'Tarefas & Rotinas', icon: Flame },
              { id: 'regras', label: 'Regras & Prêmio', icon: ScrollText },
              { id: 'sistema', label: 'Avisos, Data & Chat', icon: Bell },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
                className={`min-h-[44px] px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all border ${
                  active
                    ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-sm'
                    : 'bg-white/60 dark:bg-black/25 border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:border-amber-400/60'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* SECTION 1: PARTICIPANTES & ESTRELAS & PODERES */}
      {section === 'participantes' && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ROTATION_ORDER.map((pid) => {
            const p = gameState.participants[pid];
            const pName = getParticipantName(gameState, pid);
            const shieldOn = isShieldActiveNow(gameState, pid, dateStr, nowHHMM);
            const frozenOn = isFrozenToday(gameState, pid, dateStr);
            return (
              <div key={pid} className="glass-card rounded-3xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={getParticipantAvatar(gameState, pid)}
                      alt={pName}
                      referrerPolicy="no-referrer"
                      className="w-11 h-11 rounded-2xl object-cover ring-1 ring-white/20 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-base font-bold text-slate-900 dark:text-white truncate">
                        {pName}
                      </p>
                      <p className="font-mono-num text-xs font-extrabold text-amber-500">
                        Atual: {p.stars} ⭐
                      </p>
                    </div>
                  </div>
                </div>

                {/* Exact stars + quick delta */}
                <div className="glass-subcard rounded-2xl p-3 space-y-2">
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    Alterar estrelas
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[-5, -1, 1, 5].map((delta) => (
                      <button
                        key={delta}
                        type="button"
                        onClick={async () => {
                          const nextVal = p.stars + delta;
                          const res = await onAction('tailan_set_stars', {
                            targetId: pid,
                            stars: nextVal,
                            dateStr,
                            nowHHMM,
                          });
                          if (res.ok) {
                            setStarDrafts((d) => ({ ...d, [pid]: String(nextVal) }));
                          }
                        }}
                        className={`min-h-[36px] px-2.5 rounded-xl font-mono-num text-xs font-extrabold border ${
                          delta < 0
                            ? 'border-rose-500/40 text-rose-500 hover:bg-rose-500/10'
                            : 'border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10'
                        }`}
                      >
                        {delta > 0 ? `+${delta}` : delta} ⭐
                      </button>
                    ))}
                    <div className="flex items-center gap-1.5 ml-auto">
                      <input
                        type="number"
                        value={starDrafts[pid]}
                        onChange={(e) =>
                          setStarDrafts((d) => ({ ...d, [pid]: e.target.value }))
                        }
                        className="w-20 min-h-[36px] px-2.5 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 font-mono-num text-xs font-bold text-slate-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const val = Number(starDrafts[pid]);
                          if (!Number.isFinite(val)) return;
                          const res = await onAction('tailan_set_stars', {
                            targetId: pid,
                            stars: val,
                            dateStr,
                            nowHHMM,
                          });
                          if (res.ok) {
                            onShowToast('Estrelas atualizadas', `${pName}: ${Math.round(val)} ⭐`, 'success');
                          }
                        }}
                        className="min-h-[36px] px-3 rounded-xl bg-amber-400 text-slate-950 text-xs font-bold"
                      >
                        Definir
                      </button>
                    </div>
                  </div>
                </div>

                {/* Inventory quantities */}
                <div className="glass-subcard rounded-2xl p-3 space-y-2">
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    Poderes acumulados nos itens
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { key: 'fantasma', label: '👻 Fantasma' },
                        { key: 'escudo', label: '🛡️ Escudo' },
                        { key: 'chefe', label: '👑 Chefe' },
                        { key: 'coringa', label: '🃏 Coringa' },
                      ] as Array<{ key: PowerType; label: string }>
                    ).map((pw) => (
                      <div
                        key={pw.key}
                        className="flex items-center justify-between gap-1 rounded-xl border border-slate-200/80 dark:border-white/10 px-2.5 py-1.5 text-xs"
                      >
                        <span className="font-semibold truncate">{pw.label}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              onAction('tailan_set_inventory', {
                                targetId: pid,
                                power: pw.key,
                                quantity: Math.max(0, p.inventory[pw.key] - 1),
                              })
                            }
                            className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-white/10 font-bold"
                          >
                            -
                          </button>
                          <span className="font-mono-num font-bold w-4 text-center">
                            {p.inventory[pw.key]}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onAction('tailan_set_inventory', {
                                targetId: pid,
                                power: pw.key,
                                quantity: p.inventory[pw.key] + 1,
                              })
                            }
                            className="w-6 h-6 rounded-lg bg-amber-400 text-slate-950 font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Flags & Dice Reset */}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onAction('tailan_set_flags', {
                        targetId: pid,
                        shieldActiveToday: !shieldOn,
                      })
                    }
                    className={`min-h-[36px] px-3 rounded-xl text-xs font-bold border flex items-center gap-1 ${
                      shieldOn
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-500'
                        : 'border-slate-300 dark:border-white/15 text-slate-500'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>{shieldOn ? 'Escudo ON' : 'Ativar Escudo'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onAction('tailan_set_flags', {
                        targetId: pid,
                        frozenToday: !frozenOn,
                      })
                    }
                    className={`min-h-[36px] px-3 rounded-xl text-xs font-bold border flex items-center gap-1 ${
                      frozenOn
                        ? 'bg-sky-500/20 border-sky-500/50 text-sky-400'
                        : 'border-slate-300 dark:border-white/15 text-slate-500'
                    }`}
                  >
                    <Snowflake className="w-3.5 h-3.5" />
                    <span>{frozenOn ? 'Congelado ON' : 'Congelar hoje'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onAction('tailan_set_flags', { targetId: pid, resetDiceRound: 1 })
                    }
                    className="min-h-[36px] px-2.5 rounded-xl text-xs font-semibold border border-slate-300 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:border-amber-400/60 flex items-center gap-1"
                  >
                    <Dices className="w-3.5 h-3.5 text-amber-400" /> Reset R1
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onAction('tailan_set_flags', { targetId: pid, resetDiceRound: 2 })
                    }
                    className="min-h-[36px] px-2.5 rounded-xl text-xs font-semibold border border-slate-300 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:border-amber-400/60 flex items-center gap-1"
                  >
                    <Dices className="w-3.5 h-3.5 text-amber-400" /> Reset R2
                  </button>
                </div>

                {/* Profile Name, Avatar Reset & Auth Reset */}
                <div className="glass-subcard rounded-2xl p-3 space-y-2">
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    Perfil &amp; Acesso de {PARTICIPANT_PROFILES[pid].name}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      type="text"
                      value={nameDrafts[pid] || ''}
                      onChange={(e) =>
                        setNameDrafts((d) => ({ ...d, [pid]: e.target.value }))
                      }
                      maxLength={24}
                      placeholder="Nome exibido"
                      className="flex-1 min-w-[120px] min-h-[36px] px-2.5 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs font-semibold text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await onAction('tailan_update_participant_profile', {
                          targetId: pid,
                          displayName: nameDrafts[pid],
                          dateStr,
                          nowHHMM,
                        });
                        if (res.ok) {
                          onShowToast('Nome atualizado', `${nameDrafts[pid]} salvo.`, 'success');
                        }
                      }}
                      className="min-h-[36px] px-3 rounded-xl bg-amber-400 text-slate-950 text-xs font-bold"
                    >
                      Renomear
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Boolean(p.avatarUrl) && (
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await onAction('tailan_update_participant_profile', {
                            targetId: pid,
                            avatarUrl: null,
                            dateStr,
                            nowHHMM,
                          });
                          if (res.ok) {
                            onShowToast('Foto restaurada', `Foto padrão de ${pName} aplicada.`, 'success');
                          }
                        }}
                        className="min-h-[34px] px-2.5 rounded-xl border border-slate-300 dark:border-white/15 text-[11px] font-semibold flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" /> Foto padrão
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await onAction('tailan_reset_participant_auth', {
                          targetId: pid,
                        });
                        if (res.ok) {
                          onShowToast(
                            'Acesso redefinido',
                            `${pName} poderá criar uma nova senha no próximo login.`,
                            'success'
                          );
                        }
                      }}
                      className="min-h-[34px] px-2.5 rounded-xl border border-rose-500/35 text-rose-500 text-[11px] font-bold flex items-center gap-1"
                    >
                      <KeyRound className="w-3 h-3" /> Resetar senha/biometria
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* SECTION 2: TAREFAS EXTRAS + ALTERAR ESCALA DE HOJE + ROTINAS */}
      {section === 'tarefas' && (
        <div className="space-y-5">
          {/* Create / Edit Custom Task */}
          <section className="glass-card rounded-3xl p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Plus className="w-4 h-4 text-amber-400" />
              <span>{editingTaskId ? 'Editar Tarefa Extra' : 'Acrescentar Nova Tarefa no Jogo'}</span>
            </h2>
            <form onSubmit={handleSaveCustomTask} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={ctTitle}
                  onChange={(e) => setCtTitle(e.target.value)}
                  placeholder="Nome da tarefa (ex.: Lavar a varanda)"
                  className="modern-input px-3.5 py-2.5 bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-sm"
                />
                <input
                  type="text"
                  value={ctDesc}
                  onChange={(e) => setCtDesc(e.target.value)}
                  placeholder="Observação opcional (ex.: com sabão)"
                  className="modern-input px-3.5 py-2.5 bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Responsável</label>
                  <select
                    value={ctAssignee}
                    onChange={(e) => setCtAssignee(e.target.value as ParticipantId | 'all')}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs font-semibold text-slate-900 dark:text-white"
                  >
                    <option value="all">Qualquer um (Livre)</option>
                    {ROTATION_ORDER.map((id) => (
                      <option key={id} value={id}>
                        {getParticipantName(gameState, id)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Estrelas (⭐)</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={ctStars}
                    onChange={(e) => setCtStars(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs font-mono-num font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Horário limite</label>
                  <input
                    type="time"
                    value={ctDeadline}
                    onChange={(e) => setCtDeadline(e.target.value)}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Validade</label>
                  <select
                    value={ctScope}
                    onChange={(e) => setCtScope(e.target.value as 'today' | 'all')}
                    className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs font-semibold text-slate-900 dark:text-white"
                  >
                    <option value="today">Só hoje ({dateStr})</option>
                    <option value="all">Permanente</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="min-h-[44px] px-5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingTaskId ? 'Salvar Alterações' : 'Adicionar Tarefa no Jogo'}</span>
                </button>
                {editingTaskId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTaskId(null);
                      setCtTitle('');
                      setCtDesc('');
                    }}
                    className="min-h-[44px] px-4 rounded-2xl border border-slate-300 dark:border-white/15 text-xs font-semibold"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>

            {(gameState.customTasks || []).length > 0 && (
              <div className="pt-3 border-t border-slate-200/70 dark:border-white/10 space-y-2">
                <p className="text-xs font-bold text-slate-500">Tarefas extras cadastradas</p>
                {(gameState.customTasks || []).map((ct) => (
                  <div
                    key={ct.id}
                    className="glass-subcard rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {ct.title} · <span className="text-amber-500">+{ct.starReward} ⭐</span>
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {ct.assignedTo === 'all'
                          ? 'Qualquer participante'
                          : getParticipantName(gameState, ct.assignedTo)}
                        {ct.deadlineHHMM ? ` · limite ${ct.deadlineHHMM}` : ''}
                        {ct.completedBy
                          ? ` · Concluída por ${getParticipantName(gameState, ct.completedBy)}`
                          : ' · Pendente'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleEditCustomTask(ct)}
                        className="min-h-[34px] px-2.5 rounded-xl border border-slate-300 dark:border-white/15 text-xs font-semibold flex items-center gap-1"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onAction('tailan_delete_custom_task', { customTaskId: ct.id })
                        }
                        className="min-h-[34px] px-2.5 rounded-xl border border-rose-500/35 text-rose-500 text-xs font-semibold flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Apagar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Date Switcher for Day Tasks, Routines & Dice */}
          <section className="glass-card rounded-3xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                Dia selecionado para edição: {editDateStr.split('-').reverse().join('/')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Edite tarefas, rotinas e dado de hoje, de dias anteriores ou já deixe pronto para amanhã.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {recordedDates.map((dKey) => (
                <button
                  key={dKey}
                  type="button"
                  onClick={() => setEditDateStr(dKey)}
                  className={`min-h-[34px] px-2.5 rounded-xl text-xs font-bold border ${
                    editDateStr === dKey
                      ? 'bg-amber-400 text-slate-950 border-amber-400'
                      : 'border-slate-300 dark:border-white/15 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {dKey === dateStr ? `Hoje (${dKey.slice(8)}/${dKey.slice(5, 7)})` : `${dKey.slice(8)}/${dKey.slice(5, 7)}`}
                </button>
              ))}
              <input
                type="date"
                value={editDateStr}
                onChange={(e) => setEditDateStr(e.target.value)}
                className="min-h-[34px] px-2.5 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs font-semibold"
              />
            </div>
          </section>

          {/* Dice Day Toggle & Manual Face Override */}
          <section className="glass-card rounded-3xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Dices className="w-4 h-4 text-amber-400" />
                  <span>Controle do Dado ({editDateStr.split('-').reverse().join('/')})</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Janelas padrão: Manhã 05:00–10:00 · Tarde 12:00–19:00.
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const disabled = isDiceDisabledForDate(gameState, editDateStr);
                  const res = await onAction('tailan_set_dice_disabled', {
                    targetDateStr: editDateStr,
                    disabled: !disabled,
                  });
                  if (res.ok) {
                    onShowToast(
                      !disabled ? 'Dado desativado no dia' : 'Dado reativado no dia',
                      `${editDateStr.split('-').reverse().join('/')}: ${!disabled ? 'bloqueado' : 'liberado nas janelas'}`,
                      'success'
                    );
                  }
                }}
                className={`min-h-[40px] px-3.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                  isDiceDisabledForDate(gameState, editDateStr)
                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-400'
                    : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-500'
                }`}
              >
                {isDiceDisabledForDate(gameState, editDateStr) ? (
                  <>
                    <Lock className="w-3.5 h-3.5" /> Dado DESATIVADO nesse dia (clique p/ liberar)
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5" /> Dado LIBERADO nesse dia (clique p/ desativar)
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ROTATION_ORDER.map((pid) => {
                const diceEntry = editDay?.dice[pid];
                return (
                  <div key={`dice-edit-${pid}`} className="glass-subcard rounded-2xl p-3 space-y-2 text-xs">
                    <p className="font-bold text-slate-900 dark:text-white">
                      {getParticipantName(gameState, pid)}
                    </p>
                    {([1, 2] as const).map((round) => {
                      const currentFace =
                        diceEntry?.[round === 1 ? 'round1' : 'round2']?.face ?? '';
                      return (
                        <div key={round} className="flex items-center justify-between gap-2">
                          <span className="text-slate-500 dark:text-slate-400">
                            Rodada {round} ({round === 1 ? 'Manhã' : 'Tarde'}):
                          </span>
                          <select
                            value={String(currentFace)}
                            onChange={(e) =>
                              onAction('tailan_set_day_dice', {
                                targetDateStr: editDateStr,
                                targetId: pid,
                                round,
                                face: e.target.value ? Number(e.target.value) : null,
                                dateStr,
                                nowHHMM,
                              })
                            }
                            className="min-h-[34px] px-2.5 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 font-mono-num text-xs font-bold"
                          >
                            <option value="">Não jogado / Limpar</option>
                            {[1, 2, 3, 4, 5, 6].map((f) => (
                              <option key={f} value={f}>
                                Face {f}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Edit selected day's standard task owners & statuses */}
          <section className="glass-card rounded-3xl p-5 space-y-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Alterar Escala &amp; Estado das Tarefas ({editDateStr.split('-').reverse().join('/')})
            </h2>
            <div className="divide-y divide-slate-200/60 dark:divide-white/[0.06]">
              {TASK_DEFINITIONS.map((td) => {
                const st = editDay?.tasks[td.id];
                const customName = getEffectiveTaskDefinition(gameState, td.id).label;
                return (
                  <div
                    key={td.id}
                    className="py-2.5 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                        {customName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {st?.completedBy
                          ? `Feita por ${getParticipantName(gameState, st.completedBy)}`
                          : st?.canceledByFantasma
                          ? 'Cancelada'
                          : st?.expiredPenaltyApplied
                          ? 'Expirada / Sem fazer'
                          : 'Pendente'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select
                        value={st?.assignedTo || ''}
                        onChange={(e) =>
                          onAction('tailan_update_day_task', {
                            taskId: td.id,
                            assignedTo: e.target.value || null,
                            dateStr: editDateStr,
                            nowHHMM,
                          })
                        }
                        className="min-h-[34px] px-2.5 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs font-semibold"
                      >
                        <option value="">Sem dono</option>
                        {ROTATION_ORDER.map((id) => (
                          <option key={id} value={id}>
                            {getParticipantName(gameState, id)}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          onAction('tailan_update_day_task', {
                            taskId: td.id,
                            status: 'completed',
                            dateStr: editDateStr,
                            nowHHMM,
                          })
                        }
                        className="min-h-[34px] px-2.5 rounded-xl bg-emerald-500/20 text-emerald-500 text-xs font-bold"
                      >
                        Feita
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onAction('tailan_update_day_task', {
                            taskId: td.id,
                            status: 'pending',
                            dateStr: editDateStr,
                            nowHHMM,
                          })
                        }
                        className="min-h-[34px] px-2.5 rounded-xl bg-amber-400/20 text-amber-500 text-xs font-bold"
                      >
                        Reabrir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Rename or change limits of standard tasks */}
          <section className="glass-card rounded-3xl p-5 space-y-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Renomear ou Alterar Horário das Tarefas Padrão
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <select
                value={overrideTaskId}
                onChange={(e) => setOverrideTaskId(e.target.value as TaskId)}
                className="min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs font-semibold"
              >
                {TASK_DEFINITIONS.map((td) => (
                  <option key={td.id} value={td.id}>
                    {getEffectiveTaskDefinition(gameState, td.id).label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={overrideLabel}
                onChange={(e) => setOverrideLabel(e.target.value)}
                placeholder="Novo nome (vazio = padrão)"
                className="min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs"
              />
              <input
                type="time"
                value={overrideWeekLimit}
                onChange={(e) => setOverrideWeekLimit(e.target.value)}
                title="Limite semana"
                className="min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs"
              />
              <input
                type="time"
                value={overrideWeekendLimit}
                onChange={(e) => setOverrideWeekendLimit(e.target.value)}
                title="Limite fim de semana"
                className="min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  const res = await onAction('tailan_update_task_override', {
                    taskId: overrideTaskId,
                    override: {
                      label: overrideLabel.trim() || undefined,
                      weekdayLimit: overrideWeekLimit || undefined,
                      weekendLimit: overrideWeekendLimit || undefined,
                    },
                  });
                  if (res.ok) {
                    onShowToast('Tarefa atualizada', 'Alteração aplicada em todo o aplicativo.', 'success');
                  }
                }}
                className="min-h-[40px] px-4 rounded-xl bg-amber-400 text-slate-950 text-xs font-bold"
              >
                Salvar alteração da tarefa
              </button>
              <button
                type="button"
                onClick={() =>
                  onAction('tailan_update_task_override', {
                    taskId: overrideTaskId,
                    override: null,
                  })
                }
                className="min-h-[40px] px-3.5 rounded-xl border border-slate-300 dark:border-white/15 text-xs font-semibold"
              >
                Restaurar padrão
              </button>
            </div>
          </section>

          {/* Rename or change limits of standard routines */}
          <section className="glass-card rounded-3xl p-5 space-y-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Renomear ou Alterar Horário das 7 Rotinas Padrão
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <select
                value={overrideRoutineId}
                onChange={(e) => setOverrideRoutineId(e.target.value as RoutineId)}
                className="min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs font-semibold"
              >
                {ROUTINE_DEFINITIONS.map((rd) => (
                  <option key={rd.id} value={rd.id}>
                    {getEffectiveRoutineDefinition(gameState, rd.id).label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={routineOvLabel}
                onChange={(e) => setRoutineOvLabel(e.target.value)}
                placeholder="Novo nome da rotina"
                className="min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs"
              />
              <input
                type="time"
                value={routineOvWeekLimit}
                onChange={(e) => setRoutineOvWeekLimit(e.target.value)}
                title="Limite semana"
                className="min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs"
              />
              <input
                type="time"
                value={routineOvWeekendLimit}
                onChange={(e) => setRoutineOvWeekendLimit(e.target.value)}
                title="Limite fim de semana"
                className="min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  const res = await onAction('tailan_update_routine_override', {
                    routineId: overrideRoutineId,
                    override: {
                      label: routineOvLabel.trim() || undefined,
                      weekdayLimit: routineOvWeekLimit || undefined,
                      weekendLimit: routineOvWeekendLimit || undefined,
                    },
                  });
                  if (res.ok) {
                    onShowToast('Rotina atualizada', 'Alteração aplicada em todo o aplicativo.', 'success');
                  }
                }}
                className="min-h-[40px] px-4 rounded-xl bg-amber-400 text-slate-950 text-xs font-bold"
              >
                Salvar alteração da rotina
              </button>
              <button
                type="button"
                onClick={() =>
                  onAction('tailan_update_routine_override', {
                    routineId: overrideRoutineId,
                    override: null,
                  })
                }
                className="min-h-[40px] px-3.5 rounded-xl border border-slate-300 dark:border-white/15 text-xs font-semibold"
              >
                Restaurar padrão
              </button>
            </div>
          </section>

          {/* Routine state editor */}
          <section className="glass-card rounded-3xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Alterar Rotinas ({editDateStr.split('-').reverse().join('/')})
              </h2>
              <div className="flex gap-1.5">
                {ROTATION_ORDER.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setRoutineTargetPid(id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                      routineTargetPid === id
                        ? 'bg-amber-400 text-slate-950 border-amber-400'
                        : 'border-slate-300 dark:border-white/15'
                    }`}
                  >
                    {getParticipantName(gameState, id)}
                  </button>
                ))}
              </div>
            </div>
            <div className="divide-y divide-slate-200/60 dark:divide-white/[0.06]">
              {ROUTINE_DEFINITIONS.map((baseR) => {
                const r = getEffectiveRoutineDefinition(gameState, baseR.id);
                const st = editDay?.routines[routineTargetPid]?.[r.id];
                return (
                  <div
                    key={r.id}
                    className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {r.label}
                    </span>
                    <div className="flex gap-1.5">
                      {(
                        [
                          { id: 'completed', label: 'Feita', active: Boolean(st?.completed) },
                          {
                            id: 'pending',
                            label: 'Pendente',
                            active: Boolean(st && !st.completed && !st.expiredPenaltyApplied),
                          },
                          {
                            id: 'missed',
                            label: 'Perdida',
                            active: Boolean(st?.expiredPenaltyApplied),
                          },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            onAction('tailan_update_day_routine', {
                              targetId: routineTargetPid,
                              routineId: r.id as RoutineId,
                              status: opt.id,
                              dateStr: editDateStr,
                              nowHHMM,
                            })
                          }
                          className={`px-2.5 py-1 rounded-lg font-bold border ${
                            opt.active
                              ? 'bg-amber-400 text-slate-950 border-amber-400'
                              : 'border-slate-300 dark:border-white/15 text-slate-500'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* SECTION 3: REGRAS PERSONALIZADAS & PRÊMIO */}
      {section === 'regras' && (
        <div className="space-y-5">
          {/* Edit Goal Banner */}
          <section className="glass-card rounded-3xl p-5 space-y-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Alterar Meta & Prêmio Final</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={goalDraft}
                onChange={(e) => setGoalDraft(e.target.value)}
                placeholder="Ex.: Meta Final: R$ 200 + Pizza para o 1º Colocado!"
                className="modern-input flex-1 min-w-[220px] px-3.5 py-2.5 bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-sm"
              />
              <button
                type="button"
                onClick={async () => {
                  const res = await onAction('tailan_update_goal', {
                    goalText: goalDraft,
                    dateStr,
                    nowHHMM,
                  });
                  if (res.ok) {
                    onShowToast('Meta atualizada', 'Novo prêmio exibido em todo o aplicativo.', 'success');
                  }
                }}
                className="min-h-[44px] px-4 rounded-2xl bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm"
              >
                Salvar Meta/Prêmio
              </button>
            </div>
          </section>

          {/* Add / Edit Custom Rules */}
          <section className="glass-card rounded-3xl p-5 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ScrollText className="w-4 h-4 text-amber-400" />
              <span>
                {editingRuleId ? 'Editar Regra Personalizada' : 'Acrescentar Nova Regra no Jogo'}
              </span>
            </h2>
            <form onSubmit={handleSaveCustomRule} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  required
                  value={ruleTitle}
                  onChange={(e) => setRuleTitle(e.target.value)}
                  placeholder="Título da regra (ex.: Bônus de Domingo)"
                  className="sm:col-span-2 modern-input px-3.5 py-2.5 bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-sm"
                />
                <select
                  value={ruleCategory}
                  onChange={(e) =>
                    setRuleCategory(e.target.value as CustomGameRule['category'])
                  }
                  className="min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs font-semibold"
                >
                  <option value="geral">Regra Geral</option>
                  <option value="tarefa">Regra de Tarefa</option>
                  <option value="dado">Regra do Dado</option>
                  <option value="punicao">Punição</option>
                  <option value="premio">Prêmio</option>
                </select>
              </div>
              <textarea
                required
                rows={3}
                value={ruleDesc}
                onChange={(e) => setRuleDesc(e.target.value)}
                placeholder="Explique como funciona a regra..."
                className="w-full rounded-2xl px-3.5 py-2.5 bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-sm text-slate-900 dark:text-white"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="min-h-[44px] px-5 rounded-2xl bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm"
                >
                  {editingRuleId ? 'Atualizar Regra' : 'Publicar Regra na Aba Regras'}
                </button>
                {editingRuleId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRuleId(null);
                      setRuleTitle('');
                      setRuleDesc('');
                    }}
                    className="min-h-[44px] px-4 rounded-2xl border border-slate-300 dark:border-white/15 text-xs font-semibold"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>

            {(gameState.customRules || []).length > 0 && (
              <div className="pt-3 border-t border-slate-200/70 dark:border-white/10 space-y-2.5">
                {(gameState.customRules || []).map((rule) => (
                  <div
                    key={rule.id}
                    className="glass-subcard rounded-2xl p-3.5 flex flex-wrap items-start justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {rule.title}
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                        {rule.description}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRuleId(rule.id);
                          setRuleTitle(rule.title);
                          setRuleDesc(rule.description);
                          setRuleCategory(rule.category);
                        }}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-white/15 text-xs font-semibold"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onAction('tailan_delete_custom_rule', { ruleId: rule.id })
                        }
                        className="px-2.5 py-1.5 rounded-xl border border-rose-500/35 text-rose-500 text-xs font-semibold"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* SECTION 4: AVISOS, PUNIÇÕES, CHAT E SISTEMA */}
      {section === 'sistema' && (
        <div className="space-y-5">
          {/* Official Announcement + Optional Star Delta */}
          <section className="glass-card rounded-3xl p-5 space-y-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Enviar Aviso / Evento Oficial no Jogo
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                placeholder="Título do aviso (ex.: Desafio relâmpago!)"
                className="modern-input px-3.5 py-2.5 bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={annTargetId}
                  onChange={(e) => setAnnTargetId(e.target.value as ParticipantId | '')}
                  className="min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs font-semibold"
                >
                  <option value="">Sem alteração de ⭐</option>
                  {ROTATION_ORDER.map((id) => (
                    <option key={id} value={id}>
                      {getParticipantName(gameState, id)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={annDelta}
                  onChange={(e) => setAnnDelta(e.target.value)}
                  placeholder="Delta ⭐"
                  className="min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs font-mono-num font-bold"
                />
              </div>
            </div>
            <textarea
              rows={2}
              value={annMessage}
              onChange={(e) => setAnnMessage(e.target.value)}
              placeholder="Mensagem do evento para toda a casa..."
              className="w-full rounded-2xl px-3.5 py-2.5 bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-sm"
            />
            <button
              type="button"
              onClick={async () => {
                const res = await onAction('tailan_post_announcement', {
                  title: annTitle,
                  message: annMessage,
                  bonusTargetId: annTargetId || undefined,
                  bonusDelta: Number(annDelta || 0),
                  dateStr,
                  nowHHMM,
                });
                if (res.ok) {
                  setAnnTitle('');
                  setAnnMessage('');
                  setAnnTargetId('');
                  setAnnDelta('0');
                  onShowToast('Aviso publicado', 'Todos receberam em tempo real.', 'success');
                }
              }}
              className="min-h-[44px] px-5 rounded-2xl bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm"
            >
              Publicar Evento no Jogo
            </button>
          </section>

          {/* Weekend punishments + Denunciations + Justifications + Notifications + Chat moderation */}
          <section className="glass-card rounded-3xl p-5 space-y-5">
            <div className="space-y-3">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Gerenciar Punições de Fim de Semana ({gameState.weekendPunishments.length})
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <select
                  value={punTargetPid}
                  onChange={(e) => setPunTargetPid(e.target.value as ParticipantId)}
                  className="min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs font-semibold"
                >
                  {ROTATION_ORDER.map((id) => (
                    <option key={id} value={id}>
                      Punido: {getParticipantName(gameState, id)}
                    </option>
                  ))}
                </select>
                <select
                  value={punCoverPid}
                  onChange={(e) => setPunCoverPid(e.target.value as ParticipantId)}
                  className="min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs font-semibold"
                >
                  {ROTATION_ORDER.map((id) => (
                    <option key={id} value={id}>
                      Cobrindo: {getParticipantName(gameState, id)}
                    </option>
                  ))}
                </select>
                <select
                  value={punTaskId}
                  onChange={(e) => setPunTaskId(e.target.value as TaskId)}
                  className="min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs font-semibold"
                >
                  {TASK_DEFINITIONS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {getEffectiveTaskDefinition(gameState, t.id).label}
                    </option>
                  ))}
                </select>
                <select
                  value={punDay}
                  onChange={(e) => setPunDay(e.target.value as 'sabado' | 'domingo' | '')}
                  className="min-h-[38px] px-2.5 rounded-xl bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-xs font-semibold"
                >
                  <option value="">Dia a escolher</option>
                  <option value="sabado">Sábado</option>
                  <option value="domingo">Domingo</option>
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await onAction('tailan_update_punishment', {
                      punishedId: punTargetPid,
                      coveringForId: punCoverPid,
                      taskId: punTaskId,
                      chosenDay: punDay || null,
                      dateStr,
                      nowHHMM,
                    });
                    if (res.ok) {
                      onShowToast('Punição adicionada', 'Punição registrada no jogo.', 'success');
                    }
                  }}
                  className="min-h-[38px] px-3 rounded-xl bg-amber-400 text-slate-950 font-bold text-xs"
                >
                  + Adicionar
                </button>
              </div>

              {gameState.weekendPunishments.length > 0 ? (
                <div className="space-y-2">
                  {gameState.weekendPunishments.map((wp) => (
                    <div
                      key={wp.id}
                      className="glass-subcard rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <span>
                        <strong>{getParticipantName(gameState, wp.punishedId)}</strong> cobrindo{' '}
                        <strong>{getParticipantName(gameState, wp.coveringForId)}</strong> ({wp.taskLabel}) ·{' '}
                        {wp.chosenDay ? wp.chosenDay.toUpperCase() : 'sem dia'} ·{' '}
                        {wp.completed ? 'Cumprida ✓' : 'Pendente'}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            onAction('tailan_update_punishment', {
                              id: wp.id,
                              chosenDay: wp.chosenDay === 'sabado' ? 'domingo' : 'sabado',
                            })
                          }
                          className="px-2.5 py-1 rounded-xl border border-slate-300 dark:border-white/15 font-semibold"
                        >
                          {wp.chosenDay === 'sabado' ? 'Mudar Dom' : 'Mudar Sáb'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onAction('tailan_update_punishment', {
                              id: wp.id,
                              completed: !wp.completed,
                            })
                          }
                          className="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-500 font-bold"
                        >
                          {wp.completed ? 'Reabrir' : 'Cumprida'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onAction('tailan_delete_punishment', { punishmentId: wp.id })
                          }
                          className="px-2.5 py-1 rounded-xl border border-rose-500/35 text-rose-500 font-bold"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">Nenhuma punição pendente.</p>
              )}
            </div>

            {/* Justifications, Denunciations, Fantasma Draws & Notifications cleanup */}
            <div className="pt-3 border-t border-slate-200/70 dark:border-white/10 space-y-3">
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                Limpeza &amp; Moderação (Justificativas, Denúncias, Sorteios &amp; Alertas)
              </p>

              {gameState.justifications.slice(0, 6).map((j) => (
                <div
                  key={j.id}
                  className="glass-subcard rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs"
                >
                  <span className="truncate">
                    📝 <strong>{getParticipantName(gameState, j.participantId)}</strong> ({j.dateStr}):{' '}
                    {j.reason} — {j.details || 'sem detalhes'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onAction('tailan_delete_justification', { justificationId: j.id })}
                    className="px-2 py-1 rounded-lg border border-rose-500/35 text-rose-500 font-bold shrink-0"
                  >
                    Excluir
                  </button>
                </div>
              ))}

              {gameState.denunciations.slice(0, 6).map((d) => (
                <div
                  key={d.id}
                  className="glass-subcard rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs"
                >
                  <span className="truncate">
                    🚩 <strong>{getParticipantName(gameState, d.reporterId)}</strong> →{' '}
                    <strong>{getParticipantName(gameState, d.targetId)}</strong> ({d.itemLabel})
                  </span>
                  <button
                    type="button"
                    onClick={() => onAction('tailan_delete_denunciation', { denunciationId: d.id })}
                    className="px-2 py-1 rounded-lg border border-rose-500/35 text-rose-500 font-bold shrink-0"
                  >
                    Excluir
                  </button>
                </div>
              ))}

              {gameState.fantasmaDraws.slice(0, 6).map((fd) => (
                <div
                  key={fd.id}
                  className="glass-subcard rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs"
                >
                  <span className="truncate">
                    👻 {fd.dateStr} · <strong>{getParticipantName(gameState, fd.ownerId)}</strong> →{' '}
                    <strong>{getParticipantName(gameState, fd.drawnParticipantId)}</strong> ({fd.taskLabel} · {fd.status})
                  </span>
                  <button
                    type="button"
                    onClick={() => onAction('tailan_delete_fantasma_draw', { drawId: fd.id })}
                    className="px-2 py-1 rounded-lg border border-rose-500/35 text-rose-500 font-bold shrink-0"
                  >
                    Excluir
                  </button>
                </div>
              ))}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    const res = await onAction('tailan_delete_notification', {});
                    if (res.ok) onShowToast('Alertas limpos', 'Notificações removidas.', 'success');
                  }}
                  className="min-h-[38px] px-3 rounded-xl border border-rose-500/35 text-rose-500 text-xs font-bold"
                >
                  Limpar notificações de hoje ({gameState.notifications.length})
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await onAction('tailan_clear_chat', {});
                    if (res.ok) onShowToast('Chat limpo', 'Mensagens do chat removidas.', 'success');
                  }}
                  className="min-h-[38px] px-3.5 rounded-xl border border-rose-500/35 text-rose-500 text-xs font-bold"
                >
                  Limpar histórico do Chat ({(gameState.chatMessages || []).length})
                </button>
              </div>
            </div>
          </section>

          {/* Date, Clock & Global Actions (no end date restriction) */}
          <section className="glass-card rounded-3xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Data, Virada Automática 00:00, Relógio &amp; Ações Globais
              </h2>
              <button
                type="button"
                onClick={() =>
                  onAction('tailan_set_manual_date_lock', {
                    locked: !gameState.manualDateLocked,
                  })
                }
                className={`min-h-[36px] px-3 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                  gameState.manualDateLocked
                    ? 'bg-amber-400 text-slate-950 border-amber-400'
                    : 'border-emerald-500/40 text-emerald-500 bg-emerald-500/10'
                }`}
              >
                {gameState.manualDateLocked ? (
                  <>
                    <Lock className="w-3.5 h-3.5" /> Data travada manualmente (clique p/ reativar 00:00)
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5" /> Virada automática após 00:00 ATIVA
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">Data ativa (sem limite final)</label>
                  <input
                    type="date"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="modern-input w-full px-3 py-2 bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onAction('admin_set_date', { newDateStr: dateInput })}
                  className="min-h-[44px] px-3.5 rounded-[14px] bg-slate-900 dark:bg-white/10 text-white text-xs font-bold"
                >
                  Aplicar data
                </button>
              </div>

              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">Horário simulado (vazio = real BR)</label>
                  <input
                    type="time"
                    value={clockInput}
                    onChange={(e) => setClockInput(e.target.value)}
                    className="modern-input w-full px-3 py-2 bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onAction('admin_set_clock', { clockTime: clockInput || null })}
                  className="min-h-[44px] px-3.5 rounded-[14px] bg-slate-900 dark:bg-white/10 text-white text-xs font-bold"
                >
                  Aplicar hora
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onAction('process_deadlines', { dateStr })}
                className="min-h-[40px] px-3.5 rounded-xl bg-amber-400/20 border border-amber-400/40 text-amber-500 text-xs font-bold"
              >
                ⚡ Verificar prazos e sortear
              </button>
              <button
                type="button"
                onClick={() => onAction('admin_complete_all_today_tasks', {})}
                className="min-h-[40px] px-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-500 text-xs font-bold"
              >
                ✓ Concluir todas tarefas de hoje
              </button>
              <button
                type="button"
                onClick={() => onAction('admin_reset_seed', {})}
                className="min-h-[40px] px-3.5 rounded-xl border border-rose-500/35 text-rose-500 text-xs font-bold flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Restaurar estado inicial 13/11
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
