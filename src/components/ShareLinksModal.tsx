import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Crown,
  Download,
  ExternalLink,
  FileArchive,
  Globe,
  Link2,
  PackageCheck,
  RefreshCw,
  Share2,
  Smartphone,
  X,
} from 'lucide-react';
import { copyTextSafely, usePWAInstall } from '../hooks/usePWAInstall.ts';
import type { GameState, ParticipantId } from '../shared/types.ts';

interface AppLinksData {
  gameUrl: string;
  previewUrl: string;
  apkInstallUrl: string;
  apkBuilderUrl: string;
  manifestUrl: string;
  zipDownloadUrl: string;
  isSharedLive: boolean;
  pendingSharedUrl: string | null;
  savedPublicUrl: string | null;
  checkingPublic: boolean;
  refreshLinks: () => Promise<boolean>;
}

function deriveApkUrls(gameUrl: string) {
  const clean = gameUrl.replace(/\/+$/, '');
  return {
    apkInstallUrl: clean ? `${clean}/?install=apk` : '',
    apkBuilderUrl: clean
      ? `https://www.pwabuilder.com/reportcard?site=${encodeURIComponent(clean)}`
      : '',
    manifestUrl: clean ? `${clean}/manifest.json` : '',
    zipDownloadUrl: clean ? `${clean}/api/download-zip` : '/api/download-zip',
  };
}

function computeFallbackLinks(): {
  gameUrl: string;
  previewUrl: string;
  apkInstallUrl: string;
  apkBuilderUrl: string;
  manifestUrl: string;
  zipDownloadUrl: string;
  isSharedLive: boolean;
  pendingSharedUrl: string | null;
  savedPublicUrl: string | null;
} {
  if (typeof window === 'undefined') {
    return {
      gameUrl: '',
      previewUrl: '',
      apkInstallUrl: '',
      apkBuilderUrl: '',
      manifestUrl: '',
      zipDownloadUrl: '/api/download-zip',
      isSharedLive: true,
      pendingSharedUrl: null,
      savedPublicUrl: null,
    };
  }
  const origin = window.location.origin;
  const isDevHost = /^(https?:\/\/)ais-dev-/i.test(origin);
  const sharedCandidate = isDevHost
    ? origin.replace(/^(https?:\/\/)ais-dev-/i, '$1ais-pre-')
    : null;
  const shareBase = sharedCandidate || origin;
  return {
    gameUrl: shareBase,
    previewUrl: origin,
    ...deriveApkUrls(shareBase),
    isSharedLive: !isDevHost,
    pendingSharedUrl: sharedCandidate,
    savedPublicUrl: null,
  };
}

export function useAppLinks(gameState?: GameState): AppLinksData {
  const [rawBase, setRawBase] = useState(() => computeFallbackLinks());
  const [checkingPublic, setCheckingPublic] = useState(false);

  const fetchLinks = useCallback(async (forceRefresh = false): Promise<boolean> => {
    setCheckingPublic(true);
    try {
      const endpoint = forceRefresh ? '/api/app-links?refresh=1' : '/api/app-links';
      const r = await fetch(endpoint, { cache: 'no-store' });
      const data = r.ok ? await r.json() : null;
      if (data?.ok && data.gameUrl) {
        const live = data.isSharedLive !== false;
        const derived = deriveApkUrls(data.gameUrl);
        setRawBase({
          gameUrl: data.gameUrl,
          previewUrl:
            data.previewUrl ||
            (typeof window !== 'undefined' ? window.location.origin : data.gameUrl),
          apkInstallUrl: data.apkInstallUrl || derived.apkInstallUrl,
          apkBuilderUrl: data.apkBuilderUrl || derived.apkBuilderUrl,
          manifestUrl: data.manifestUrl || derived.manifestUrl,
          zipDownloadUrl: data.zipDownloadUrl || derived.zipDownloadUrl,
          isSharedLive: live,
          pendingSharedUrl: data.pendingSharedUrl || null,
          savedPublicUrl: data.savedPublicUrl || null,
        });
        return live;
      }
    } catch {
      // Keep fallback link derived from window.location.origin
    } finally {
      setCheckingPublic(false);
    }
    return false;
  }, []);

  useEffect(() => {
    void fetchLinks(false);
  }, [fetchLinks, gameState?.publicAppUrl]);

  return {
    gameUrl: rawBase.gameUrl,
    previewUrl: rawBase.previewUrl,
    apkInstallUrl: rawBase.apkInstallUrl,
    apkBuilderUrl: rawBase.apkBuilderUrl,
    manifestUrl: rawBase.manifestUrl,
    zipDownloadUrl: rawBase.zipDownloadUrl,
    isSharedLive: rawBase.isSharedLive,
    pendingSharedUrl: rawBase.pendingSharedUrl,
    savedPublicUrl: rawBase.savedPublicUrl,
    checkingPublic,
    refreshLinks: () => fetchLinks(true),
  };
}

interface ShareLinksCardProps {
  compact?: boolean;
  gameState?: GameState;
  currentUserId?: ParticipantId;
  onSavePublicUrl?: (url: string | null) => Promise<{ ok: boolean; error?: string }>;
  onNotify?: (title: string, msg: string, tone?: 'gold' | 'error' | 'success') => void;
}

export const ShareLinksCard: React.FC<ShareLinksCardProps> = ({
  compact = false,
  gameState,
  currentUserId,
  onSavePublicUrl,
  onNotify,
}) => {
  const {
    gameUrl,
    previewUrl,
    apkInstallUrl,
    apkBuilderUrl,
    zipDownloadUrl,
    isSharedLive,
    pendingSharedUrl,
    savedPublicUrl,
    checkingPublic,
    refreshLinks,
  } = useAppLinks(gameState);
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [copiedKey, setCopiedKey] = useState<'web' | 'apk' | 'builder' | 'desc' | 'zip' | null>(null);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [publicUrlInput, setPublicUrlInput] = useState(
    () => gameState?.publicAppUrl || savedPublicUrl || ''
  );
  const [savingPublicUrl, setSavingPublicUrl] = useState(false);

  useEffect(() => {
    const nextVal = gameState?.publicAppUrl || savedPublicUrl || '';
    setPublicUrlInput(nextVal);
  }, [gameState?.publicAppUrl, savedPublicUrl]);

  const copyLink = async (
    text: string,
    key: 'web' | 'apk' | 'builder' | 'desc' | 'zip',
    label: string
  ) => {
    const ok = await copyTextSafely(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2200);
      onNotify?.('Copiado', `${label} copiado para a área de transferência.`, 'success');
    } else {
      onNotify?.('Copie manualmente', 'Selecione o texto acima para copiar.', 'gold');
    }
  };

  const handleCheckPublic = async () => {
    const isNowLive = await refreshLinks();
    if (isNowLive) {
      onNotify?.(
        'App público ativo!',
        'O link único já está liberado para Tailan, Carol, Karine e Caio.',
        'success'
      );
    } else {
      onNotify?.(
        'Ainda privado no Preview',
        'Clique em Share (Compartilhar) ou Deploy no topo do AI Studio para liberar o acesso público.',
        'gold'
      );
    }
  };

  const handleSaveCustomPublicUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSavePublicUrl) return;
    setSavingPublicUrl(true);
    const trimmed = publicUrlInput.trim();
    const res = await onSavePublicUrl(trimmed || null);
    setSavingPublicUrl(false);
    if (res.ok) {
      await refreshLinks();
      onNotify?.(
        trimmed ? 'Link público salvo!' : 'Link personalizado removido',
        trimmed
          ? 'O link único agora aponta para o endereço público.'
          : 'Voltando à detecção automática do servidor.',
        'success'
      );
    } else {
      onNotify?.('Link inválido', res.error || 'Verifique o endereço informado.', 'error');
    }
  };

  const handleDirectInstall = async () => {
    const accepted = await install();
    if (accepted) {
      onNotify?.(
        'Aplicativo instalado!',
        'O Estrelas da Casa foi instalado como WebAPK na sua tela inicial.',
        'success'
      );
    }
  };

  const handleDownloadZip = async () => {
    if (downloadingZip) return;
    setDownloadingZip(true);
    try {
      const response = await fetch('/api/download-zip', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Falha ao gerar ZIP');
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = 'estrelas-da-casa-app.zip';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      onNotify?.(
        'Arquivo .zip baixado!',
        'O pacote estrelas-da-casa-app.zip foi salvo no seu aparelho.',
        'success'
      );
    } catch {
      onNotify?.(
        'Erro ao baixar .zip',
        'Tente copiar o link do arquivo .zip ou usar o download direto.',
        'error'
      );
    } finally {
      setDownloadingZip(false);
    }
  };

  const shareMessage = `⭐ Estrelas da Casa - Cada um por si\n\nEntre no jogo pelo link único:\n${gameUrl}\n\n📲 Link do Sistema APK (instalar no celular):\n${apkInstallUrl}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
  const apkWhatsappMessage = `📲 Estrelas da Casa - Sistema APK (App no Celular)\n\nAbra este link no Chrome (Android) ou Safari (iPhone) para instalar o aplicativo com ícone na tela inicial:\n${apkInstallUrl}`;
  const apkWhatsappHref = `https://wa.me/?text=${encodeURIComponent(apkWhatsappMessage)}`;
  const fullApkDescriptionText = [
    '⭐ Jogo das Estrelas — Estrelas da Casa (Cada um por si)',
    '',
    'Competição familiar entre Tailan, Carol, Karine e Caio valendo R$ 150,00 para o 1º lugar em 31/12.',
    '',
    '• 7 rotinas diárias (+1 ⭐ cada; perde -1 ⭐ se atrasar sem justificar).',
    '• 13 tarefas em rodízio automático (+1 ⭐ cada; atraso/desistência -3 ⭐ + punição de fim de semana).',
    '• Justificativas (0 ⭐): para tarefas/rotinas e campo de Justificativa do Dado no Painel (não perde nem ganha estrela).',
    '• Dado do Dia em 2 rodadas (Manhã 05:00–10:00 e Tarde 12:00–19:00) + Poderes: Fantasma (35⭐), Escudo (45⭐), Chefe (55⭐) e Coringa (65⭐).',
    '• Denúncia diária (+1 ⭐ / -1 ⭐), Ranking ao vivo, PDF, Chat com áudio/reações, IA do Jogo e biometria.',
    '',
    `🌐 Link do Jogo: ${gameUrl}`,
    `📲 Link Sistema APK (instalar no celular): ${apkInstallUrl}`,
    apkBuilderUrl ? `📦 Gerar .apk (PWABuilder): ${apkBuilderUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const openHref = !isSharedLive && previewUrl ? previewUrl : gameUrl;

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Estrelas da Casa - Cada um por si',
          text: 'Entre no jogo da casa pelo link único:',
          url: gameUrl,
        });
        return;
      } catch {
        // User cancelled or unsupported; fallback to copy
      }
    }
    await copyLink(gameUrl, 'web', 'Link único do jogo');
  };

  const showTailanPublicPanel = !isSharedLive || currentUserId === 'tailan';

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {showTailanPublicPanel && (
        <div
          className={`rounded-2xl border p-3.5 space-y-2.5 ${
            isSharedLive
              ? 'border-emerald-500/35 bg-emerald-500/[0.08]'
              : 'border-amber-400/50 bg-amber-400/12'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p
                className={`text-xs font-extrabold flex items-center gap-1.5 ${
                  isSharedLive
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-amber-800 dark:text-amber-200'
                }`}
              >
                {isSharedLive ? (
                  <Globe className="w-4 h-4 shrink-0" />
                ) : (
                  <Crown className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {isSharedLive
                    ? 'Acesso Público Ativo para Todos'
                    : 'Como o Tailan deixa o App Público'}
                </span>
              </p>
              {isSharedLive ? (
                <p className="text-[11px] text-emerald-700/90 dark:text-emerald-200/90 mt-1 leading-relaxed">
                  O link único abaixo já está usando o endereço público. Tailan, Carol, Karine e Caio podem abrir em qualquer celular.
                </p>
              ) : (
                <div className="text-[11px] text-amber-900 dark:text-amber-100 mt-1.5 space-y-1 leading-relaxed">
                  <p>
                    O link abaixo já aponta para o endereço público (<strong>Share</strong>), abrindo sempre atualizado para Tailan, Carol, Karine e Caio.
                  </p>
                  <p>
                    1. No topo direito da tela do <strong>AI Studio</strong>, ative o botão{' '}
                    <strong>Share</strong> (ou publique com <strong>Deploy</strong>).
                  </p>
                  <p>
                    2. Depois de ativar, toque em <strong>Verificar</strong> para confirmar que está público.
                  </p>
                  {pendingSharedUrl && (
                    <p className="font-mono-num text-[10px] opacity-85 break-all pt-0.5">
                      Link público (Share): {pendingSharedUrl}
                    </p>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={checkingPublic}
              onClick={handleCheckPublic}
              className="min-h-[34px] px-2.5 rounded-xl bg-white/80 dark:bg-[#0B0D12]/80 border border-slate-300 dark:border-white/15 text-[11px] font-bold text-slate-800 dark:text-slate-100 inline-flex items-center gap-1.5 shrink-0 hover:border-amber-400 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingPublic ? 'animate-spin' : ''}`} />
              <span>{checkingPublic ? 'Testando...' : 'Verificar'}</span>
            </button>
          </div>

          {currentUserId === 'tailan' && onSavePublicUrl && (
            <form onSubmit={handleSaveCustomPublicUrl} className="pt-1 space-y-1.5">
              <label
                htmlFor="tailan-public-url-input"
                className="block text-[11px] font-bold text-slate-700 dark:text-slate-200"
              >
                Ou cole aqui o link oficial de Deploy / Share (opcional):
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  id="tailan-public-url-input"
                  type="url"
                  value={publicUrlInput}
                  onChange={(e) => setPublicUrlInput(e.target.value)}
                  placeholder="https://ais-pre-...run.app ou https://seu-app.run.app"
                  className="modern-input flex-1 min-w-0 px-2.5 py-1.5 bg-white dark:bg-[#0B0D12] border border-slate-300 dark:border-white/15 text-[11px] font-mono-num text-slate-800 dark:text-slate-100"
                />
                <button
                  type="submit"
                  disabled={savingPublicUrl}
                  className="min-h-[34px] px-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-[11px] shrink-0 disabled:opacity-50"
                >
                  {savingPublicUrl ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Link Único para Todos os Participantes */}
      <div className="rounded-2xl bg-amber-500/[0.07] dark:bg-amber-400/[0.08] border border-amber-400/35 p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-slate-900 dark:text-amber-200 flex items-center gap-1.5">
            <Link2 className="w-4 h-4 text-amber-500 shrink-0" />
            <span>Link Único do Jogo para Todos</span>
          </p>
          <a
            href={openHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-bold text-amber-500 hover:underline inline-flex items-center gap-1 shrink-0"
          >
            <span>Abrir</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          Um único endereço para Tailan, Carol, Karine e Caio entrarem e jogarem sempre com os dados atualizados em tempo real.
        </p>

        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={gameUrl}
            aria-label="Link único do jogo para todos"
            onFocus={(e) => e.currentTarget.select()}
            className="modern-input flex-1 min-w-0 px-3 py-2 bg-white dark:bg-[#13161E] border border-slate-200 dark:border-white/10 text-xs font-mono-num text-slate-700 dark:text-slate-200"
          />
          <button
            type="button"
            onClick={() => copyLink(gameUrl, 'web', 'Link único do jogo')}
            className="min-h-[38px] px-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 shrink-0 transition-colors"
          >
            {copiedKey === 'web' ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Sistema APK / Aplicativo Android & PWA */}
      <div className="rounded-2xl bg-sky-500/[0.08] dark:bg-sky-500/[0.09] border border-sky-400/40 p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-sky-800 dark:text-sky-200 flex items-center gap-1.5">
            <Smartphone className="w-4 h-4 text-sky-500 shrink-0" />
            <span>Sistema APK · Aplicativo no Celular (WebAPK / PWA)</span>
          </p>
          <span className="px-2 py-0.5 rounded-lg bg-sky-500/20 text-sky-700 dark:text-sky-300 text-[10px] font-extrabold uppercase tracking-wide shrink-0">
            Android &amp; iOS
          </span>
        </div>

        <div className="text-[11px] text-slate-700 dark:text-slate-300 space-y-1.5 leading-relaxed">
          <p>
            <strong>O que é o Jogo das Estrelas (Estrelas da Casa - Cada um por si):</strong> é um aplicativo competitivo familiar entre <strong>Tailan, Carol, Karine e Caio</strong> com prêmio de <strong>R$ 150,00</strong> para o 1º lugar em 31/12.
          </p>
          <p>
            • <strong>Tudo o que o app inclui:</strong> <strong>7 rotinas diárias</strong> (+1 ⭐ cada), <strong>13 tarefas em rodízio automático</strong> (+1 ⭐ cada; atraso/desistência -3 ⭐ + punição de fim de semana), campo de <strong>Justificativa</strong> para tarefas/rotinas e para não jogar o <strong>Dado</strong> (<strong>0 ⭐</strong>: não perde nem ganha estrela), <strong>Dado do Dia</strong> em 2 rodadas (Manhã 05:00–10:00 e Tarde 12:00–19:00), poderes <strong>👻 Fantasma (35⭐), 🛡️ Escudo (45⭐), 👑 Chefe (55⭐) e 🃏 Coringa (65⭐)</strong>, denúncia diária, <strong>Ranking</strong> ao vivo, <strong>Chat da Casa</strong> com áudio/reações, <strong>IA do Jogo</strong> e <strong>Modo Mestre do Tailan</strong>.
          </p>
          <p>
            • <strong>Tecnologia WebAPK / PWA:</strong> funciona com ícone próprio na tela inicial, tela cheia sem barra de navegador, login com senha ou <strong>biometria</strong>, fila offline automática e sincronização em tempo real para todos.
          </p>
          <p>
            • <strong>Busca no navegador (&ldquo;Baixar jogo das Estrelas&rdquo;):</strong> configurado com SEO (<code className="font-mono-num">Jogo das Estrelas - Estrelas da Casa | Baixar App</code>, Schema.org <code className="font-mono-num">WebApplication</code>, <code className="font-mono-num">sitemap.xml</code> e <code className="font-mono-num">robots.txt</code>) para ser encontrado nos buscadores após publicação pública via <strong>Share</strong> ou <strong>Deploy</strong>.
          </p>
          <p>
            • <strong>Baixar direto no Android (WebAPK):</strong> abra o link APK no <strong>Google Chrome</strong> e toque em <strong>&ldquo;Baixar / Instalar aplicativo&rdquo;</strong> (ou menu <strong>⋮ → Adicionar à tela inicial</strong>).
          </p>
          <p>
            • <strong>Baixar no iPhone / iPad:</strong> abra no <strong>Safari</strong>, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.
          </p>
          <p>
            • <strong>Gerar e baixar arquivo .apk tradicional:</strong> também é possível empacotar o link abaixo em um arquivo <code className="font-mono-num">.apk</code> instalável usando o gerador oficial <strong>PWABuilder</strong>.
          </p>
        </div>

        <button
          type="button"
          onClick={() => copyLink(fullApkDescriptionText, 'desc', 'Descrição completa do app')}
          className="w-full min-h-[36px] px-3 rounded-xl border border-sky-400/40 bg-white/70 dark:bg-[#0B0D12]/60 hover:bg-sky-500/15 text-[11px] font-bold text-sky-800 dark:text-sky-200 inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          {copiedKey === 'desc' ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span>Descrição completa copiada!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copiar descrição completa + links</span>
            </>
          )}
        </button>

        {/* Botão de instalação direta quando suportado */}
        {isInstalled ? (
          <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/35 px-3 py-2 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <PackageCheck className="w-4 h-4 shrink-0" />
            <span>Aplicativo já está instalado em modo tela cheia neste aparelho!</span>
          </div>
        ) : isInstallable ? (
          <button
            type="button"
            onClick={handleDirectInstall}
            className="w-full min-h-[42px] px-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs inline-flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span>Baixar / Instalar Aplicativo (WebAPK) Agora</span>
          </button>
        ) : (
          <div className="rounded-xl bg-white/60 dark:bg-[#0B0D12]/60 border border-slate-200/80 dark:border-white/10 px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">
            {isIOS
              ? '📱 iPhone/iPad detectado: toque em Compartilhar no Safari → Adicionar à Tela de Início.'
              : isAndroid
              ? '🤖 Android detectado: se o botão automático não aparecer, toque no menu ⋮ do Chrome → Instalar aplicativo.'
              : '📲 Copie o Link do Sistema APK abaixo e abra no Chrome do Android ou Safari do iPhone para instalar o app.'}
          </div>
        )}

        {/* Link do Sistema APK */}
        <div className="space-y-1.5">
          <label
            htmlFor="apk-install-link-input"
            className="block text-[11px] font-bold text-sky-800 dark:text-sky-200"
          >
            Link do Sistema APK (instalação no celular):
          </label>
          <div className="flex items-center gap-2">
            <input
              id="apk-install-link-input"
              type="text"
              readOnly
              value={apkInstallUrl}
              aria-label="Link do sistema APK"
              onFocus={(e) => e.currentTarget.select()}
              className="modern-input flex-1 min-w-0 px-3 py-2 bg-white dark:bg-[#13161E] border border-sky-300/70 dark:border-sky-400/25 text-xs font-mono-num text-slate-700 dark:text-slate-200"
            />
            <button
              type="button"
              onClick={() => copyLink(apkInstallUrl, 'apk', 'Link do Sistema APK')}
              className="min-h-[38px] px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 shrink-0 transition-colors"
            >
              {copiedKey === 'apk' ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar APK</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Gerador de arquivo .apk (PWABuilder) */}
        {apkBuilderUrl && (
          <div className="pt-1 flex flex-wrap items-center justify-between gap-2 border-t border-sky-400/25">
            <span className="text-[11px] text-slate-600 dark:text-slate-300">
              Quer baixar o arquivo <strong className="font-mono-num">.apk</strong>?
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => copyLink(apkBuilderUrl, 'builder', 'Link do gerador .apk')}
                className="min-h-[32px] px-2.5 rounded-lg border border-sky-400/40 text-[11px] font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-500/15 inline-flex items-center gap-1"
              >
                {copiedKey === 'builder' ? (
                  <>
                    <Check className="w-3 h-3" />
                    <span>Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copiar gerador</span>
                  </>
                )}
              </button>
              <a
                href={apkBuilderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[32px] px-2.5 rounded-lg bg-sky-500/20 border border-sky-400/50 text-[11px] font-bold text-sky-700 dark:text-sky-200 hover:bg-sky-500/30 inline-flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                <span>Baixar .apk (PWABuilder)</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        {/* Arquivo .ZIP completo do projeto */}
        <div className="pt-2 border-t border-sky-400/25 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-sky-800 dark:text-sky-200 flex items-center gap-1.5">
              <FileArchive className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <span>Arquivo .ZIP do Aplicativo (estrelas-da-casa-app.zip)</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={downloadingZip}
              onClick={handleDownloadZip}
              className="flex-1 min-w-[160px] min-h-[38px] px-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-extrabold text-xs inline-flex items-center justify-center gap-1.5 transition-colors shadow-sm"
            >
              <FileArchive className="w-4 h-4 shrink-0" />
              <span>{downloadingZip ? 'Gerando .ZIP...' : 'Baixar Arquivo .ZIP'}</span>
            </button>
            <button
              type="button"
              onClick={() => copyLink(zipDownloadUrl, 'zip', 'Link do arquivo .ZIP')}
              className="min-h-[38px] px-3 rounded-xl border border-sky-400/40 text-[11px] font-bold text-sky-700 dark:text-sky-200 hover:bg-sky-500/15 inline-flex items-center gap-1.5 shrink-0 transition-colors"
            >
              {copiedKey === 'zip' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Link .ZIP copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Link .ZIP</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Compartilhar rápido */}
      <div className="flex flex-wrap gap-2">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 min-w-[150px] min-h-[42px] px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <Share2 className="w-4 h-4" />
          <span>Enviar no WhatsApp</span>
        </a>
        <a
          href={apkWhatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 min-w-[150px] min-h-[42px] px-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <Smartphone className="w-4 h-4" />
          <span>WhatsApp Link APK</span>
        </a>
        <button
          type="button"
          onClick={handleNativeShare}
          className="flex-1 min-w-[150px] min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-white/15 bg-white dark:bg-[#13161E] hover:border-amber-400/60 text-slate-800 dark:text-slate-100 font-bold text-xs inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <Link2 className="w-4 h-4 text-amber-500" />
          <span>Compartilhar Link</span>
        </button>
      </div>
    </div>
  );
};

interface ShareLinksModalProps {
  open: boolean;
  onClose: () => void;
  gameState?: GameState;
  currentUserId?: ParticipantId;
  onSavePublicUrl?: (url: string | null) => Promise<{ ok: boolean; error?: string }>;
  onNotify?: (title: string, msg: string, tone?: 'gold' | 'error' | 'success') => void;
}

export const ShareLinksModal: React.FC<ShareLinksModalProps> = ({
  open,
  onClose,
  gameState,
  currentUserId,
  onSavePublicUrl,
  onNotify,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-links-modal-title"
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl bg-white dark:bg-[#13161E] border border-slate-200 dark:border-white/15 p-5 shadow-2xl space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="share-links-modal-title"
              className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2"
            >
              <Link2 className="w-5 h-5 text-amber-400 shrink-0" />
              <span>Link Único &amp; Sistema APK</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Link compartilhado para todos e acesso ao aplicativo instalável no celular.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela do link"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <ShareLinksCard
          gameState={gameState}
          currentUserId={currentUserId}
          onSavePublicUrl={onSavePublicUrl}
          onNotify={onNotify}
        />

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[42px] rounded-2xl border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
        >
          Fechar
        </button>
      </div>
    </div>
  );
};
