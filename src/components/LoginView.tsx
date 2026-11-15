import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Download,
  Eye,
  EyeOff,
  Fingerprint,
  Link2,
  Lock,
  ShieldCheck,
  Star,
  WifiOff,
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';
import { ShareLinksModal } from './ShareLinksModal.tsx';
import {
  clearLocalBiometricData,
  enrollDeviceBiometric,
  getLocalBiometricToken,
  hasLocalBiometricToken,
  isPlatformBiometricSupported,
  saveLocalBiometricToken,
  verifyDeviceBiometric,
} from '../services/biometricAuth.ts';
import { t } from '../shared/i18n.ts';
import { getParticipantAvatar, getParticipantName, PARTICIPANT_PROFILES, ROTATION_ORDER } from '../shared/schedule.ts';
import type { GameState, LanguageCode, ParticipantId } from '../shared/types.ts';

interface LoginViewProps {
  lang: LanguageCode;
  gameState: GameState;
  onLoginSuccess: (participantId: ParticipantId, token: string, state: GameState) => void;
}

export default function LoginView({
  lang,
  gameState,
  onLoginSuccess,
}: LoginViewProps) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saveBioOnLogin, setSaveBioOnLogin] = useState(true);
  const [deviceBioSupported, setDeviceBioSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bioLoadingPid, setBioLoadingPid] = useState<ParticipantId | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [statusInfo, setStatusInfo] = useState<{
    validParticipant: boolean;
    participantId?: ParticipantId;
    hasPassword: boolean;
    hasBiometric: boolean;
  }>({ validParticipant: false, hasPassword: false, hasBiometric: false });

  const ageInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const [shareModalOpen, setShareModalOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('install') === 'apk';
  });
  const { isInstallable, isInstalled, install } = usePWAInstall();

  useEffect(() => {
    isPlatformBiometricSupported().then(setDeviceBioSupported);
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const clean = name.trim();
    if (!clean) {
      setStatusInfo({ validParticipant: false, hasPassword: false, hasBiometric: false });
      return;
    }

    // Immediate local match from live gameState while /api/auth/status loads
    const localMatch = ROTATION_ORDER.find((id) => {
      const currentName = getParticipantName(gameState, id).toLowerCase();
      const baseName = PARTICIPANT_PROFILES[id].name.toLowerCase();
      return currentName === clean.toLowerCase() || baseName === clean.toLowerCase();
    });
    if (localMatch) {
      setStatusInfo({
        validParticipant: true,
        participantId: localMatch,
        hasPassword: gameState.participants[localMatch].hasPassword,
        hasBiometric: gameState.participants[localMatch].hasBiometric,
      });
    }

    let cancelled = false;
    fetch(`/api/auth/status?name=${encodeURIComponent(clean)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setStatusInfo(data);
      })
      .catch(() => {
        // ignore network hiccups; keep current match
      });
    return () => {
      cancelled = true;
    };
  }, [name, gameState]);

  const handleSelectAvatar = (pid: ParticipantId) => {
    const displayName = getParticipantName(gameState, pid);
    const participantAge = String(PARTICIPANT_PROFILES[pid].age);
    const participantState = gameState.participants[pid];
    setName(displayName);
    setAge(participantAge);
    setError(null);
    setStatusInfo({
      validParticipant: true,
      participantId: pid,
      hasPassword: participantState.hasPassword,
      hasBiometric: participantState.hasBiometric,
    });

    if (hasLocalBiometricToken(pid) && participantState.hasBiometric) {
      void handleBiometricLoginForPid(pid, {
        displayNameOverride: displayName,
        ageOverride: participantAge,
      });
    }
  };

  const handleBiometricLoginForPid = async (
    pid: ParticipantId,
    overrides?: { displayNameOverride?: string; ageOverride?: string }
  ) => {
    if (loading || bioLoadingPid) return;
    if (!navigator.onLine) {
      setError('Sem conexão com a internet. Conecte-se para entrar.');
      return;
    }

    const displayName = overrides?.displayNameOverride || getParticipantName(gameState, pid);
    const savedBio = getLocalBiometricToken(pid);
    const participantState = gameState.participants[pid];
    const hasActiveServerBio =
      statusInfo.participantId === pid ? statusInfo.hasBiometric : participantState.hasBiometric;
    const hasAccountPassword =
      statusInfo.participantId === pid ? statusInfo.hasPassword : participantState.hasPassword;

    setError(null);
    setName(displayName);
    const effectiveAge = overrides?.ageOverride ?? age;
    if (overrides?.ageOverride) {
      setAge(overrides.ageOverride);
    }

    // Case 1: Biometric already configured on this device & server -> 1-tap biometric prompt & login
    if (savedBio && hasActiveServerBio) {
      setBioLoadingPid(pid);
      try {
        const verifyRes = await verifyDeviceBiometric(pid, displayName);
        if (!verifyRes.ok) {
          setError(verifyRes.error || 'Biometria cancelada no aparelho.');
          return;
        }
        const res = await fetch('/api/auth/biometric/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            participantId: pid,
            biometricToken: savedBio,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          if (res.status === 401) {
            clearLocalBiometricData(pid);
            setError('Biometria expirada neste aparelho. Confirme sua idade abaixo para reativar.');
          } else {
            setError(data.error || 'Falha na autenticação biométrica.');
          }
          return;
        }
        onLoginSuccess(data.participantId, data.token, data.state);
      } catch {
        setError('Falha de conexão com o servidor ao entrar com biometria.');
      } finally {
        setBioLoadingPid(null);
      }
      return;
    }

    // Case 2: First-time biometric setup directly from the avatar screen
    const numericAge = Number(effectiveAge);
    if (!effectiveAge.trim() || Number.isNaN(numericAge)) {
      setError(
        hasAccountPassword
          ? `Para ativar a biometria de ${displayName} neste aparelho, informe sua idade e senha abaixo.`
          : `Para ativar a biometria de ${displayName} neste aparelho, informe sua idade abaixo.`
      );
      ageInputRef.current?.focus();
      return;
    }

    if (hasAccountPassword && password.trim().length < 3) {
      setError(`Informe a senha de ${displayName} abaixo para vincular a biometria.`);
      passwordInputRef.current?.focus();
      return;
    }

    setBioLoadingPid(pid);
    try {
      const enrollPrompt = await enrollDeviceBiometric(pid, displayName);
      if (!enrollPrompt.ok) {
        setError(enrollPrompt.error || 'Leitura biométrica cancelada.');
        return;
      }

      const res = await fetch('/api/auth/biometric/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: pid,
          age: numericAge,
          password: password || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Não foi possível ativar a biometria.');
        return;
      }
      if (data.biometricToken) {
        saveLocalBiometricToken(pid, data.biometricToken);
      }
      onLoginSuccess(data.participantId, data.token, data.state);
    } catch {
      setError('Falha de conexão com o servidor ao ativar biometria.');
    } finally {
      setBioLoadingPid(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!navigator.onLine) {
      setError('Sem conexão com a internet. Conecte-se para entrar.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          age: Number(age),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Não foi possível entrar.');
        return;
      }

      const loggedPid = data.participantId as ParticipantId;
      const loggedName = getParticipantName(data.state || gameState, loggedPid);
      if (saveBioOnLogin && !hasLocalBiometricToken(loggedPid)) {
        try {
          const bioCheck = await enrollDeviceBiometric(loggedPid, loggedName);
          if (bioCheck.ok) {
            const regRes = await fetch('/api/auth/biometric/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ participantId: loggedPid, token: data.token }),
            });
            const regData = await regRes.json();
            if (regData.ok && regData.biometricToken) {
              saveLocalBiometricToken(loggedPid, regData.biometricToken);
              onLoginSuccess(loggedPid, data.token, regData.state || data.state);
              return;
            }
          }
        } catch {
          // Non-fatal: password login already succeeded
        }
      }

      onLoginSuccess(loggedPid, data.token, data.state);
    } catch {
      setError('Falha de conexão com o servidor. Verifique sua internet e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const selectedPid = statusInfo.participantId;
  const selectedProfile = selectedPid ? PARTICIPANT_PROFILES[selectedPid] : null;
  const selectedDisplayName = selectedPid ? getParticipantName(gameState, selectedPid) : null;
  const selectedHasLocalBio = Boolean(
    selectedPid && hasLocalBiometricToken(selectedPid) && statusInfo.hasBiometric
  );
  const readyBiometricPids = ROTATION_ORDER.filter(
    (pid) => hasLocalBiometricToken(pid) && gameState.participants[pid].hasBiometric
  );

  return (
    <div className="min-h-dvh flex flex-col justify-center px-4 py-8 pt-safe pb-safe px-safe bg-slate-50 dark:bg-[#0B0D12]">
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 mb-3 shadow-lg shadow-amber-500/10">
            <Star className="w-7 h-7 fill-amber-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            {t(lang, 'appTitle')}
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            {t(lang, 'loginSubtitle')}
          </p>
        </div>

        <div className="rounded-3xl bg-white dark:bg-[#13161E] border border-slate-200 dark:border-white/10 p-5 sm:p-6 shadow-xl shadow-black/5 dark:shadow-black/40">
          {!isOnline && (
            <div className="mb-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 flex items-center gap-2 text-xs font-semibold text-rose-600 dark:text-rose-300">
              <WifiOff className="w-4 h-4 shrink-0" />
              <span>Sem conexão com a internet — conecte-se para entrar.</span>
            </div>
          )}

          {/* Avatar Selection & Biometric Entry Section */}
          <div className="mb-5">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Toque no avatar para preencher nome e idade ou entrar com biometria
              </p>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                <Fingerprint className="w-3.5 h-3.5" />
                <span>Biometria liberada</span>
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2.5">
              {ROTATION_ORDER.map((pid) => {
                const displayName = getParticipantName(gameState, pid);
                const isSelected = selectedProfile?.id === pid;
                const bioReady =
                  hasLocalBiometricToken(pid) && gameState.participants[pid].hasBiometric;
                return (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => handleSelectAvatar(pid)}
                    className={`relative group flex flex-col items-center p-2 rounded-2xl border transition-all min-h-[44px] ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/10 shadow-md shadow-amber-500/15'
                        : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] hover:border-amber-400/50'
                    }`}
                  >
                    <div className="relative">
                      <img
                        src={getParticipantAvatar(gameState, pid)}
                        alt={displayName}
                        referrerPolicy="no-referrer"
                        className={`w-12 h-12 rounded-xl object-cover transition-transform ${
                          isSelected
                            ? 'scale-105 ring-2 ring-amber-400'
                            : 'opacity-85 group-hover:opacity-100'
                        }`}
                      />
                      {bioReady && (
                        <span
                          title={`Biometria ativa para ${displayName}`}
                          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center ring-2 ring-white dark:ring-[#13161E] shadow-sm"
                        >
                          <Fingerprint className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                    <span className="mt-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 truncate w-full text-center">
                      {displayName}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Direct Biometric Action right in the Avatar screen */}
            <div className="mt-3 space-y-2">
              {selectedPid && selectedDisplayName ? (
                <button
                  type="button"
                  disabled={loading || bioLoadingPid !== null}
                  onClick={() => handleBiometricLoginForPid(selectedPid)}
                  className={`w-full min-h-[50px] px-4 py-2.5 rounded-2xl border font-bold text-sm transition-all flex items-center justify-between gap-3 disabled:opacity-50 ${
                    selectedHasLocalBio
                      ? 'border-emerald-500/50 bg-emerald-500/15 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 shadow-sm'
                      : 'border-amber-400/50 bg-amber-500/10 hover:bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 text-left">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        selectedHasLocalBio
                          ? 'bg-emerald-500 text-white'
                          : 'bg-amber-400 text-slate-950'
                      }`}
                    >
                      <Fingerprint className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-bold leading-tight">
                        {bioLoadingPid === selectedPid
                          ? 'Confirmando biometria...'
                          : selectedHasLocalBio
                          ? `Entrar com Biometria · ${selectedDisplayName}`
                          : `Ativar e Entrar com Biometria · ${selectedDisplayName}`}
                      </p>
                      <p className="text-[11px] font-medium opacity-80 truncate">
                        {selectedHasLocalBio
                          ? 'Toque para confirmar sua digital ou rosto neste aparelho'
                          : statusInfo.hasPassword
                          ? 'Nome e idade preenchidos · informe sua senha abaixo para vincular a digital'
                          : 'Nome e idade preenchidos · toque aqui para vincular e entrar com digital'}
                      </p>
                    </div>
                  </div>
                </button>
              ) : readyBiometricPids.length > 0 ? (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
                  <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                    <Fingerprint className="w-4 h-4" />
                    <span>Entrar direto com Biometria neste aparelho:</span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {readyBiometricPids.map((pid) => {
                      const dName = getParticipantName(gameState, pid);
                      return (
                        <button
                          key={pid}
                          type="button"
                          disabled={loading || bioLoadingPid !== null}
                          onClick={() => handleBiometricLoginForPid(pid)}
                          className="min-h-[44px] px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50"
                        >
                          <Fingerprint className="w-4 h-4 shrink-0" />
                          <span className="truncate">
                            {bioLoadingPid === pid ? 'Verificando...' : `Digital de ${dName}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] px-3.5 py-2.5 flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                  <Fingerprint className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>
                    Toque em um avatar acima para ativar ou entrar colocando sua <strong>biometria</strong>.
                  </span>
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="login-name"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                {t(lang, 'fieldName')}
              </label>
              <input
                id="login-name"
                type="text"
                autoComplete="username"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`Ex: ${ROTATION_ORDER.map((id) => getParticipantName(gameState, id)).join(', ')}`}
                className="modern-input w-full px-4 py-3 bg-slate-50 dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>

            <div>
              <label
                htmlFor="login-age"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                {t(lang, 'fieldAge')}
              </label>
              <input
                ref={ageInputRef}
                id="login-age"
                type="number"
                inputMode="numeric"
                min={10}
                max={99}
                required
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Digite sua idade exata"
                className="modern-input w-full px-4 py-3 bg-slate-50 dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white placeholder:text-slate-400 font-mono-num"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  {t(lang, 'fieldPassword')}
                </label>
                {statusInfo.validParticipant && (
                  <span className="text-xs font-medium text-amber-500">
                    {statusInfo.hasPassword ? 'Senha já cadastrada' : '1º acesso: crie sua senha'}
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  ref={passwordInputRef}
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={statusInfo.hasPassword ? 'current-password' : 'new-password'}
                  required
                  minLength={3}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    statusInfo.validParticipant && !statusInfo.hasPassword
                      ? 'Crie sua senha pessoal'
                      : 'Digite sua senha pessoal'
                  }
                  className="modern-input w-full px-4 py-3 pr-12 bg-slate-50 dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-slate-900 dark:text-white placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-amber-400 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {(!selectedPid || !selectedHasLocalBio) && (
              <button
                type="button"
                role="checkbox"
                aria-checked={saveBioOnLogin}
                onClick={() => setSaveBioOnLogin((v) => !v)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02] flex items-center justify-between gap-2 text-left"
              >
                <span className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <Fingerprint className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>
                    {deviceBioSupported
                      ? 'Salvar biometria (digital/rosto) neste aparelho ao entrar'
                      : 'Salvar acesso rápido por biometria neste aparelho ao entrar'}
                  </span>
                </span>
                <span
                  className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border transition-colors ${
                    saveBioOnLogin
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-slate-300 dark:border-white/20'
                  }`}
                >
                  {saveBioOnLogin && <Check className="w-3.5 h-3.5" />}
                </span>
              </button>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-[14px] border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || bioLoadingPid !== null}
              className="w-full min-h-[50px] rounded-[14px] bg-amber-400 hover:bg-amber-300 active:scale-[0.99] text-slate-950 font-bold text-base shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Lock className="w-4 h-4" />
              {loading
                ? 'Verificando...'
                : statusInfo.validParticipant && !statusInfo.hasPassword
                ? t(lang, 'createPasswordButton')
                : t(lang, 'enterButton')}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-200 dark:border-white/10 space-y-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Acesso privado por participante. Sem e-mail e protegido por senha pessoal.</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {!isInstalled && (
                <button
                  type="button"
                  onClick={async () => {
                    if (isInstallable) {
                      const ok = await install();
                      if (ok) return;
                    }
                    setShareModalOpen(true);
                  }}
                  className="min-h-[42px] px-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>Baixar Jogo das Estrelas (APK)</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShareModalOpen(true)}
                className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-white/[0.03] hover:border-amber-400/60 text-slate-700 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 transition-colors ml-auto"
              >
                <Link2 className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Link Único · Sistema APK</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <ShareLinksModal
        open={shareModalOpen}
        gameState={gameState}
        onClose={() => setShareModalOpen(false)}
      />
    </div>
  );
}
