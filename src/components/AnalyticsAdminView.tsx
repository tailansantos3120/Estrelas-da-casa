import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  Camera,
  Check,
  Cloud,
  Crown,
  Download,
  FileText,
  Fingerprint,
  Globe,
  Moon,
  Pencil,
  RotateCcw,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ComparativeColumnsChart,
  HouseActivityHeatmap,
  InteractiveDonutChart,
  PerformanceRadarChart,
  StarBreakdownChart,
  StarTrajectoryChart,
} from './charts/NextGenCharts.tsx';
import SoundThemePicker from './SoundThemePicker.tsx';
import { ShareLinksCard } from './ShareLinksModal.tsx';
import { processAvatarFile } from '../services/avatarUpload.ts';
import { enrollDeviceBiometric, saveLocalBiometricToken } from '../services/biometricAuth.ts';
import { exportAnalyticsPdf } from '../services/pdfExport.ts';
import { t } from '../shared/i18n.ts';
import {
  getBrazilClockHHMM,
  getParticipantAvatar,
  getParticipantName,
  PARTICIPANT_PROFILES,
  ROTATION_ORDER,
} from '../shared/schedule.ts';
import type {
  CloudBackupSnapshot,
  GameState,
  LanguageCode,
  ParticipantId,
  SoundThemeId,
} from '../shared/types.ts';

interface AnalyticsAdminViewProps {
  lang: LanguageCode;
  onChangeLang: (lang: LanguageCode) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  gameState: GameState;
  currentUserId: ParticipantId;
  sessionToken: string;
  backups: CloudBackupSnapshot[];
  onBack: () => void;
  onLoadBackups: () => Promise<void>;
  onCreateBackup: (label: string) => Promise<void>;
  onRestoreBackup: (id: string) => Promise<void>;
  onImportBackup: (state: GameState) => Promise<void>;
  onDeleteAccount: () => Promise<boolean>;
  onAction: (
    type: string,
    payload?: Record<string, unknown>,
    optimistic?: (draft: GameState) => void
  ) => Promise<{ ok: boolean; error?: string }>;
  onShowToast: (title: string, msg: string, tone?: 'gold' | 'error' | 'success') => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onSelectSoundTheme?: (themeId: SoundThemeId) => Promise<unknown>;
  onOpenTailanEditor?: () => void;
}

export default function AnalyticsAdminView({
  lang,
  onChangeLang,
  isDark,
  onToggleTheme,
  gameState,
  currentUserId,
  sessionToken,
  backups,
  onBack,
  onLoadBackups,
  onCreateBackup,
  onRestoreBackup,
  onImportBackup,
  onDeleteAccount,
  onAction,
  onShowToast,
  soundEnabled = true,
  onToggleSound,
  onSelectSoundTheme,
  onOpenTailanEditor,
}: AnalyticsAdminViewProps) {
  const [backupLabel, setBackupLabel] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [clockInput, setClockInput] = useState(gameState.simulatedClockTime || '');
  const [dateInput, setDateInput] = useState(gameState.currentDateStr);
  const currentDisplayName = getParticipantName(gameState, currentUserId);
  const [nameInput, setNameInput] = useState(currentDisplayName);
  const [savingName, setSavingName] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNameInput(currentDisplayName);
  }, [currentDisplayName]);

  useEffect(() => {
    setDateInput(gameState.currentDateStr);
  }, [gameState.currentDateStr]);

  useEffect(() => {
    setClockInput(gameState.simulatedClockTime || '');
  }, [gameState.simulatedClockTime]);

  useEffect(() => {
    onLoadBackups();
  }, [onLoadBackups]);

  const totalStarsAll = ROTATION_ORDER.reduce(
    (sum, pid) => sum + gameState.participants[pid].stars,
    0
  );
  const rankedForCharts = useMemo(
    () =>
      [...ROTATION_ORDER].sort(
        (a, b) => gameState.participants[b].stars - gameState.participants[a].stars
      ),
    [gameState.participants]
  );

  const handleRegisterBiometric = async () => {
    try {
      const deviceCheck = await enrollDeviceBiometric(currentUserId, currentDisplayName);
      if (!deviceCheck.ok) {
        onShowToast('Biometria', deviceCheck.error || 'Registro cancelado no aparelho.', 'error');
        return;
      }
      const res = await fetch('/api/auth/biometric/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantId: currentUserId, token: sessionToken }),
      });
      const data = await res.json();
      if (data.ok && data.biometricToken) {
        saveLocalBiometricToken(currentUserId, data.biometricToken);
        onShowToast('Biometria ativada', 'Acesso rápido com digital/rosto configurado neste dispositivo.', 'success');
      } else {
        onShowToast('Erro', data.error || 'Não foi possível registrar biometria.', 'error');
      }
    } catch {
      onShowToast('Erro', 'Não foi possível registrar biometria.', 'error');
    }
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(gameState, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estrelas-backup-${gameState.currentDateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        await onImportBackup(parsed);
      } catch {
        onShowToast('Arquivo inválido', 'Selecione um arquivo JSON de backup válido.', 'error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="min-h-[44px] px-3 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#13161E] flex items-center gap-2 text-sm font-semibold"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Voltar</span>
      </button>

      {/* Custom Analytics + PDF Export */}
      <section className="glass-card rounded-3xl p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-amber-400" />
              <span>{t(lang, 'analyticsAdminTitle')}</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Painel analítico interativo, radar multidimensional e exportação em PDF
            </p>
          </div>

          <button
            type="button"
            onClick={() => exportAnalyticsPdf(gameState)}
            className="min-h-[44px] px-4 rounded-[14px] bg-gradient-to-r from-amber-400 to-yellow-300 hover:from-amber-300 hover:to-yellow-200 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md shadow-amber-500/20 whitespace-nowrap shrink-0"
          >
            <FileText className="w-4 h-4" />
            <span>{t(lang, 'exportPdfBtn')}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="glass-subcard rounded-2xl p-3.5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Estrelas em jogo</p>
            <p className="text-2xl font-extrabold font-mono-num text-amber-500 mt-1">
              {totalStarsAll} ⭐
            </p>
          </div>
          <div className="glass-subcard rounded-2xl p-3.5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Sorteios Fantasma</p>
            <p className="text-2xl font-extrabold font-mono-num text-slate-900 dark:text-white mt-1">
              {gameState.fantasmaDraws.length}
            </p>
          </div>
          <div className="glass-subcard rounded-2xl p-3.5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Denúncias</p>
            <p className="text-2xl font-extrabold font-mono-num text-rose-400 mt-1">
              {gameState.denunciations.length}
            </p>
          </div>
          <div className="glass-subcard rounded-2xl p-3.5">
            <p className="text-xs text-slate-500 dark:text-slate-400">Punições</p>
            <p className="text-2xl font-extrabold font-mono-num text-slate-900 dark:text-white mt-1">
              {gameState.weekendPunishments.length}
            </p>
          </div>
        </div>

        {/* Next-Gen Interactive Visual Charts Suite */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3">
              <ComparativeColumnsChart
                gameState={gameState}
                dateStr={gameState.currentDateStr}
                ranked={rankedForCharts}
                currentUserId={currentUserId}
              />
            </div>
            <div className="lg:col-span-2">
              <InteractiveDonutChart
                gameState={gameState}
                dateStr={gameState.currentDateStr}
                ranked={rankedForCharts}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <StarTrajectoryChart
              gameState={gameState}
              ranked={rankedForCharts}
              currentUserId={currentUserId}
            />
            <PerformanceRadarChart
              gameState={gameState}
              dateStr={gameState.currentDateStr}
              ranked={rankedForCharts}
              currentUserId={currentUserId}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <StarBreakdownChart
              gameState={gameState}
              dateStr={gameState.currentDateStr}
              ranked={rankedForCharts}
              currentUserId={currentUserId}
            />
            <HouseActivityHeatmap
              gameState={gameState}
              ranked={rankedForCharts}
            />
          </div>
        </div>
      </section>

      {/* Theme, Language, Biometric, Account Deletion */}
      <section className="rounded-3xl bg-white dark:bg-[#13161E] border border-slate-200 dark:border-white/10 p-5 space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          Aparência, Idioma e Segurança
        </h2>

        {/* Change profile photo without losing login/access */}
        <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-white/10 p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img
                src={getParticipantAvatar(gameState, currentUserId)}
                alt={currentDisplayName}
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-2xl object-cover ring-2 ring-amber-400/70 shrink-0"
              />
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-amber-400" />
                  <span>Minha foto de perfil</span>
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Atualiza sua foto no login, painel e ranking sem alterar acesso ou estrelas.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file || savingAvatar) return;
                  setSavingAvatar(true);
                  try {
                    const dataUrl = await processAvatarFile(file);
                    const nowHHMM = gameState.simulatedClockTime || getBrazilClockHHMM();
                    const res = await onAction(
                      'update_avatar',
                      { avatarUrl: dataUrl, dateStr: gameState.currentDateStr, nowHHMM },
                      (draft) => {
                        if (draft.participants[currentUserId]) {
                          draft.participants[currentUserId].avatarUrl = dataUrl;
                        }
                      }
                    );
                    if (res.ok) {
                      onShowToast(
                        'Foto atualizada',
                        'Sua nova foto já aparece para toda a casa.',
                        'success'
                      );
                    }
                  } catch (err) {
                    onShowToast(
                      'Erro na imagem',
                      err instanceof Error ? err.message : 'Escolha outra foto.',
                      'error'
                    );
                  } finally {
                    setSavingAvatar(false);
                  }
                }}
              />
              <button
                type="button"
                disabled={savingAvatar}
                onClick={() => avatarInputRef.current?.click()}
                className="min-h-[40px] px-3.5 rounded-[14px] bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{savingAvatar ? 'Enviando...' : 'Trocar foto'}</span>
              </button>
              {Boolean(gameState.participants[currentUserId].avatarUrl) && (
                <button
                  type="button"
                  disabled={savingAvatar}
                  onClick={async () => {
                    if (savingAvatar) return;
                    setSavingAvatar(true);
                    const nowHHMM = gameState.simulatedClockTime || getBrazilClockHHMM();
                    const res = await onAction(
                      'update_avatar',
                      { avatarUrl: null, dateStr: gameState.currentDateStr, nowHHMM },
                      (draft) => {
                        if (draft.participants[currentUserId]) {
                          draft.participants[currentUserId].avatarUrl = undefined;
                        }
                      }
                    );
                    setSavingAvatar(false);
                    if (res.ok) {
                      onShowToast('Foto restaurada', 'Foto padrão restaurada.', 'success');
                    }
                  }}
                  className="min-h-[40px] px-3 rounded-[14px] border border-slate-300 dark:border-white/15 bg-white dark:bg-[#13161E] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-amber-400/50 flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restaurar padrão</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Change display name without losing login/access */}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (savingName) return;
            const trimmedName = nameInput.trim().replace(/\s+/g, ' ');
            setSavingName(true);
            const nowHHMM = gameState.simulatedClockTime || getBrazilClockHHMM();
            const res = await onAction(
              'update_display_name',
              { name: nameInput, dateStr: gameState.currentDateStr, nowHHMM },
              (draft) => {
                if (
                  draft.participants[currentUserId] &&
                  trimmedName.length >= 2 &&
                  trimmedName.length <= 24
                ) {
                  draft.participants[currentUserId].displayName =
                    trimmedName === PARTICIPANT_PROFILES[currentUserId].name
                      ? undefined
                      : trimmedName;
                }
              }
            );
            setSavingName(false);
            if (res.ok) {
              onShowToast(
                'Nome atualizado',
                'Seu nome foi alterado sem afetar senha, biometria, estrelas ou escala.',
                'success'
              );
            }
          }}
          className="rounded-2xl bg-slate-50 dark:bg-[#0B0D12] border border-slate-200 dark:border-white/10 p-3.5 space-y-2"
        >
          <label
            htmlFor="display-name-input"
            className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5 text-amber-400" />
            <span>Meu nome no aplicativo</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="display-name-input"
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              minLength={2}
              maxLength={24}
              required
              placeholder="Digite seu novo nome"
              className="modern-input flex-1 min-w-[180px] px-3.5 py-2 bg-white dark:bg-[#13161E] border border-slate-300 dark:border-white/15 text-sm font-semibold"
            />
            <button
              type="submit"
              disabled={savingName}
              className="min-h-[42px] px-4 rounded-[14px] bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Salvar nome</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Você continua entrando normalmente com sua senha ou biometria usando o nome novo ou o nome original.
          </p>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onToggleTheme}
            className="min-h-[48px] px-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0D12] flex items-center justify-between text-sm font-semibold"
          >
            <span className="flex items-center gap-2">
              {isDark ? <Moon className="w-4 h-4 text-amber-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
              <span>{isDark ? 'Modo Escuro ativo' : 'Modo Claro ativo'}</span>
            </span>
            <span className="text-xs text-amber-500">Alternar</span>
          </button>

          <button
            type="button"
            onClick={handleRegisterBiometric}
            className="min-h-[48px] px-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B0D12] flex items-center justify-between text-sm font-semibold"
          >
            <span className="flex items-center gap-2">
              <Fingerprint className="w-4 h-4 text-emerald-400" />
              <span>Ativar Biometria neste aparelho</span>
            </span>
            <span className="text-xs text-emerald-500">
              {gameState.participants[currentUserId].hasBiometric ? 'Ativa' : 'Configurar'}
            </span>
          </button>
        </div>

        {/* Personalized Ringtone & Sound Control */}
        <SoundThemePicker
          currentTheme={gameState.participants[currentUserId]?.soundTheme}
          participantName={currentDisplayName}
          soundEnabled={soundEnabled}
          onToggleSound={onToggleSound}
          onSelectTheme={(themeId) =>
            onSelectSoundTheme
              ? onSelectSoundTheme(themeId)
              : onAction('update_sound_theme', { soundTheme: themeId })
          }
          compact
        />

        {/* Single shared game link */}
        <div className="rounded-2xl bg-slate-50/70 dark:bg-[#0B0D12]/60 border border-slate-200 dark:border-white/10 p-4 space-y-3">
          <div>
            <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
              Link Único do Jogo para Todos
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Copie ou envie no WhatsApp o mesmo link para qualquer participante entrar no jogo.
            </p>
          </div>
          <ShareLinksCard
            compact
            gameState={gameState}
            currentUserId={currentUserId}
            onSavePublicUrl={(url) =>
              onAction('tailan_set_public_url', { publicAppUrl: url })
            }
            onNotify={onShowToast}
          />
        </div>

        {/* Language selector (no grey select!) */}
        <div>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" /> Idioma / Language / Idioma
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { code: 'pt-BR', label: 'Português' },
                { code: 'en', label: 'English' },
                { code: 'es', label: 'Español' },
              ] as const
            ).map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => onChangeLang(l.code)}
                className={`min-h-[42px] rounded-[14px] text-xs font-bold border ${
                  lang === l.code
                    ? 'bg-amber-400 text-slate-950 border-amber-400'
                    : 'border-slate-200 dark:border-white/15'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* Account Deletion */}
        <div className="pt-3 border-t border-slate-100 dark:border-white/10">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="min-h-[44px] px-4 rounded-[14px] border border-rose-500/35 text-rose-500 text-xs font-bold flex items-center gap-2 hover:bg-rose-500/10"
            >
              <Trash2 className="w-4 h-4" />
              <span>Excluir minha conta e senha de acesso</span>
            </button>
          ) : (
            <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 p-3.5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-rose-400 font-semibold">
                Confirmar exclusão da sua senha pessoal e biometria?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-white/10 text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={onDeleteAccount}
                  className="px-3 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold"
                >
                  Confirmar exclusão
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Cloud Backup & Restore */}
      <section className="rounded-3xl bg-white dark:bg-[#13161E] border border-slate-200 dark:border-white/10 p-5 space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Cloud className="w-5 h-5 text-sky-400" />
          <span>{t(lang, 'cloudBackupTitle')}</span>
        </h2>

        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={backupLabel}
            onChange={(e) => setBackupLabel(e.target.value)}
            placeholder="Nome do backup na nuvem (opcional)"
            className="modern-input flex-1 min-w-[200px] px-4 py-2.5 bg-slate-50 dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15"
          />
          <button
            type="button"
            onClick={async () => {
              await onCreateBackup(backupLabel || `Backup ${new Date().toLocaleTimeString('pt-BR')}`);
              setBackupLabel('');
            }}
            className="min-h-[44px] px-4 rounded-[14px] bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs"
          >
            Salvar na Nuvem
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            className="min-h-[44px] px-3.5 rounded-[14px] border border-slate-300 dark:border-white/15 text-xs font-bold flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> Exportar JSON
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] px-3.5 rounded-[14px] border border-slate-300 dark:border-white/15 text-xs font-bold flex items-center gap-1.5"
          >
            <Upload className="w-4 h-4" /> Importar JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportFile}
            className="hidden"
          />
        </div>

        {backups.length > 0 && (
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {backups.map((b) => (
              <div key={b.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{b.label}</p>
                  <p className="text-slate-500">
                    {new Date(b.createdAt).toLocaleString('pt-BR')} · Carol {b.starSummary.carol}⭐ / Karine {b.starSummary.karine}⭐ / Tailan {b.starSummary.tailan}⭐ / Caio {b.starSummary.caio}⭐
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRestoreBackup(b.id)}
                  className="px-3 py-1.5 rounded-xl bg-amber-400/20 text-amber-500 font-bold hover:bg-amber-400/30"
                >
                  Restaurar
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Intuitive Admin Panel for Content Management (Exclusive to Tailan) */}
      {currentUserId === 'tailan' && (
        <section className="rounded-3xl bg-white dark:bg-[#121620] border border-amber-400/35 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-400" />
                <span>Painel Administrativo do Tailan</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Apenas Tailan pode alterar qualquer configuração do jogo a qualquer momento.
              </p>
            </div>

            {onOpenTailanEditor && (
              <button
                type="button"
                onClick={onOpenTailanEditor}
                className="min-h-[44px] px-4 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 hover:from-amber-300 hover:to-yellow-200 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-md shadow-amber-500/20 whitespace-nowrap shrink-0"
              >
                <Crown className="w-4 h-4" />
                <span>Abrir Editor Completo (Alterar &amp; Acrescentar Tudo)</span>
              </button>
            )}
          </div>

          {/* Date & Clock management */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">
                  Data ativa do painel{' '}
                  {gameState.manualDateLocked ? '· 🔒 Travada manualmente' : '· 🌙 Vira às 00:00'}
                </label>
                <input
                  type="date"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  className="modern-input w-full px-3 py-2 bg-slate-50 dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15"
                />
              </div>
              <button
                type="button"
                onClick={() => onAction('admin_set_date', { newDateStr: dateInput })}
                className="min-h-[44px] px-3.5 rounded-[14px] bg-slate-900 dark:bg-white/10 text-white text-xs font-bold"
              >
                Aplicar data
              </button>
              {gameState.manualDateLocked && (
                <button
                  type="button"
                  onClick={() => onAction('tailan_set_manual_date_lock', { locked: false })}
                  className="min-h-[44px] px-3 rounded-[14px] bg-amber-400 text-slate-950 text-xs font-bold"
                >
                  Destravar 00:00
                </button>
              )}
            </div>

          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs text-slate-500 mb-1">Horário simulado (vazio = real)</label>
              <input
                type="time"
                value={clockInput}
                onChange={(e) => setClockInput(e.target.value)}
                className="modern-input w-full px-3 py-2 bg-slate-50 dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15"
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

        {/* Star adjustment & Reset */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-white/10">
          <div className="flex flex-wrap gap-2">
            {ROTATION_ORDER.map((pid) => (
              <div key={pid} className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-white/10 px-2.5 py-1 text-xs">
                <span className="font-bold">{getParticipantName(gameState, pid)}:</span>
                <button
                  type="button"
                  onClick={() => onAction('admin_adjust_stars', { targetId: pid, delta: -1 })}
                  className="px-1.5 text-rose-400 font-bold"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => onAction('admin_adjust_stars', { targetId: pid, delta: 1 })}
                  className="px-1.5 text-emerald-400 font-bold"
                >
                  +1
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                const res = await onAction('process_deadlines', {
                  dateStr: gameState.currentDateStr,
                });
                if (res.ok) {
                  onShowToast('Prazos verificados', 'Prazos vencidos e sorteios automáticos atualizados.', 'success');
                }
              }}
              className="min-h-[40px] px-3.5 rounded-xl bg-amber-400/20 border border-amber-400/40 text-amber-400 text-xs font-bold"
            >
              ⚡ Verificar prazos e sortear
            </button>

            <button
              type="button"
              onClick={async () => {
                const res = await onAction('admin_complete_all_today_tasks', {});
                if (res.ok) {
                  onShowToast('Tarefas concluídas', 'Todas as tarefas de hoje foram marcadas como feitas.', 'success');
                }
              }}
              className="min-h-[40px] px-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-bold"
            >
              ✓ Concluir todas tarefas de hoje
            </button>

            <button
              type="button"
              onClick={() => onAction('admin_reset_seed', {})}
              className="min-h-[40px] px-3.5 rounded-xl border border-rose-500/30 text-rose-400 text-xs font-bold flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Restaurar estado inicial 13/11
            </button>
          </div>
        </div>
        </section>
      )}
    </div>
  );
}
