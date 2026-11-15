import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BookOpen,
  Crown,
  LayoutDashboard,
  Link2,
  LogOut,
  MessageCircle,
  Star,
  Trophy,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from 'lucide-react';
import AiSearchBar from './components/AiSearchBar.tsx';
import type { AiChatMessage } from './components/AiChatView.tsx';
import { MetaAiRingIcon } from './components/MetaAiRingIcon.tsx';
import PullToRefresh from './components/PullToRefresh.tsx';
import { ShareLinksModal } from './components/ShareLinksModal.tsx';
import { useGameStore } from './hooks/useGameStore.ts';
import { useTabNavigation, type MainTab } from './hooks/useTabNavigation.ts';
import { t } from './shared/i18n.ts';
import { getBrazilClockHHMM, getParticipantName } from './shared/schedule.ts';
import type { LanguageCode } from './shared/types.ts';

// Route-level code splitting
const LoginView = lazy(() => import('./components/LoginView.tsx'));
const PainelTab = lazy(() => import('./components/PainelTab.tsx'));
const RankingTab = lazy(() => import('./components/RankingTab.tsx'));
const ChatTab = lazy(() => import('./components/ChatTab.tsx'));
const AiChatView = lazy(() => import('./components/AiChatView.tsx'));
const RegrasTab = lazy(() => import('./components/RegrasTab.tsx'));
const NotificationsView = lazy(() => import('./components/NotificationsView.tsx'));
const NotifPreferencesView = lazy(() => import('./components/NotifPreferencesView.tsx'));
const AnalyticsAdminView = lazy(() => import('./components/AnalyticsAdminView.tsx'));
const CalendarScaleView = lazy(() => import('./components/CalendarScaleView.tsx'));
const TailanMasterEditor = lazy(() => import('./components/TailanMasterEditor.tsx'));

function RouteSkeleton() {
  return (
    <div className="space-y-4 animate-pulse py-4">
      <div className="h-24 rounded-3xl bg-slate-200 dark:bg-white/5" />
      <div className="h-44 rounded-3xl bg-slate-200 dark:bg-white/5" />
      <div className="h-36 rounded-3xl bg-slate-200 dark:bg-white/5" />
    </div>
  );
}

export default function App() {
  const store = useGameStore();
  const nav = useTabNavigation();

  const [lang, setLang] = useState<LanguageCode>(() => {
    return (localStorage.getItem('estrelas_lang') as LanguageCode) || 'pt-BR';
  });

  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('estrelas_theme');
    return saved ? saved === 'dark' : true;
  });

  const [lastSeenChatCount, setLastSeenChatCount] = useState<number>(0);
  const initializedChatBadge = useRef(false);
  const [shareModalOpen, setShareModalOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('install') === 'apk';
  });
  const [aiChatMessages, setAiChatMessages] = useState<AiChatMessage[]>([]);
  const [isMetaAiOpen, setIsMetaAiOpen] = useState(false);
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = localStorage.getItem('estrelas_meta_ai_fab_pos_v1');
      if (!saved) return null;
      const parsed = JSON.parse(saved) as { x?: unknown; y?: unknown };
      if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
        const w = typeof window !== 'undefined' ? window.innerWidth : 400;
        const h = typeof window !== 'undefined' ? window.innerHeight : 800;
        return {
          x: Math.min(Math.max(8, parsed.x), Math.max(8, w - 64)),
          y: Math.min(Math.max(58, parsed.y), Math.max(58, h - 72)),
        };
      }
    } catch {
      // ignore
    }
    return null;
  });
  const fabDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    moved: boolean;
  } | null>(null);
  const suppressFabClickRef = useRef(false);

  const totalChatCount = (store.gameState.chatMessages || []).length;

  useEffect(() => {
    const clampFabOnResize = () => {
      setFabPos((prev) => {
        if (!prev) return prev;
        const maxX = Math.max(8, window.innerWidth - 64);
        const maxY = Math.max(58, window.innerHeight - 72);
        const nextX = Math.min(Math.max(8, prev.x), maxX);
        const nextY = Math.min(Math.max(58, prev.y), maxY);
        if (nextX === prev.x && nextY === prev.y) return prev;
        return { x: nextX, y: nextY };
      });
    };
    window.addEventListener('resize', clampFabOnResize);
    return () => window.removeEventListener('resize', clampFabOnResize);
  }, []);

  useEffect(() => {
    setAiChatMessages([]);
    setIsMetaAiOpen(false);
  }, [store.session?.participantId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.search.includes('install=apk')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('install');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
    const canonicalUrl = `${window.location.origin}${window.location.pathname}`;
    let canonicalLink = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = canonicalUrl;

    let ogUrlMeta = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    if (!ogUrlMeta) {
      ogUrlMeta = document.createElement('meta');
      ogUrlMeta.setAttribute('property', 'og:url');
      document.head.appendChild(ogUrlMeta);
    }
    ogUrlMeta.content = canonicalUrl;
  }, []);

  useEffect(() => {
    if (!isMetaAiOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMetaAiOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMetaAiOpen]);

  useEffect(() => {
    if (!initializedChatBadge.current && store.session) {
      initializedChatBadge.current = true;
      setLastSeenChatCount(totalChatCount);
    }
  }, [store.session, totalChatCount]);

  useEffect(() => {
    if (nav.activeTab === 'chat') {
      setLastSeenChatCount(totalChatCount);
    }
  }, [nav.activeTab, totalChatCount]);

  const unreadChatCount =
    nav.activeTab === 'chat' ? 0 : Math.max(0, totalChatCount - lastSeenChatCount);

  useEffect(() => {
    localStorage.setItem('estrelas_lang', lang);
  }, [lang]);

  useEffect(() => {
    const root = document.documentElement;
    const targetColor = isDark ? '#090B10' : '#F8FAFC';
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('estrelas_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('estrelas_theme', 'light');
    }
    const themeMetas = document.querySelectorAll('meta[name="theme-color"]');
    themeMetas.forEach((meta) => meta.setAttribute('content', targetColor));
  }, [isDark]);

  if (!store.session) {
    return (
      <Suspense fallback={<RouteSkeleton />}>
        <LoginView
          lang={lang}
          gameState={store.gameState}
          onLoginSuccess={store.loginSuccess}
        />
      </Suspense>
    );
  }

  const currentUserId = store.session.participantId;
  const userState = store.gameState.participants[currentUserId];
  const userDisplayName = getParticipantName(store.gameState, currentUserId);
  const routeKey = `${nav.activeTab}:${nav.currentSubRoute}`;

  const enterX =
    nav.transitionDirection === 'push' ? 28 : nav.transitionDirection === 'pop' ? -28 : 0;
  const exitX =
    nav.transitionDirection === 'push' ? -20 : nav.transitionDirection === 'pop' ? 20 : 0;

  const renderRouteContent = () => {
    if (nav.activeTab === 'painel') {
      if (nav.currentSubRoute === 'notifications') {
        return (
          <NotificationsView
            gameState={store.gameState}
            currentUserId={currentUserId}
            onBack={nav.popRoute}
            onOpenPreferences={() => nav.pushRoute('notif-prefs')}
            onToggleReaction={(notificationId, emoji) =>
              store.dispatchAction('toggle_notif_reaction', {
                notificationId,
                emoji,
                dateStr: store.gameState.currentDateStr,
              })
            }
          />
        );
      }
      if (nav.currentSubRoute === 'notif-prefs') {
        return (
          <NotifPreferencesView
            gameState={store.gameState}
            currentUserId={currentUserId}
            onBack={nav.popRoute}
            onSavePreferences={(prefs) =>
              store.dispatchAction('update_notif_prefs', { preferences: prefs })
            }
            soundEnabled={store.soundEnabled}
            onToggleSound={store.toggleSoundEnabled}
            onSelectSoundTheme={store.selectSoundTheme}
          />
        );
      }
      if (nav.currentSubRoute === 'analytics-admin') {
        return (
          <AnalyticsAdminView
            lang={lang}
            onChangeLang={setLang}
            isDark={isDark}
            onToggleTheme={() => setIsDark((d) => !d)}
            gameState={store.gameState}
            currentUserId={currentUserId}
            sessionToken={store.session!.token}
            backups={store.backups}
            onBack={nav.popRoute}
            onLoadBackups={store.loadBackups}
            onCreateBackup={store.createCloudBackup}
            onRestoreBackup={store.restoreCloudBackup}
            onImportBackup={store.importBackupState}
            onDeleteAccount={store.deleteOwnAccount}
            onAction={store.dispatchAction}
            onShowToast={store.showToast}
            soundEnabled={store.soundEnabled}
            onToggleSound={store.toggleSoundEnabled}
            onSelectSoundTheme={store.selectSoundTheme}
            onOpenTailanEditor={
              currentUserId === 'tailan' ? () => nav.pushRoute('tailan-editor') : undefined
            }
          />
        );
      }
      if (nav.currentSubRoute === 'tailan-editor' && currentUserId === 'tailan') {
        return (
          <TailanMasterEditor
            gameState={store.gameState}
            currentUserId={currentUserId}
            onBack={nav.popRoute}
            onAction={store.dispatchAction}
            onShowToast={store.showToast}
          />
        );
      }
      if (nav.currentSubRoute === 'calendar') {
        return (
          <CalendarScaleView
            gameState={store.gameState}
            currentDateStr={store.gameState.currentDateStr}
            currentUserId={currentUserId}
            onBack={nav.popRoute}
          />
        );
      }
      return (
        <PainelTab
          lang={lang}
          gameState={store.gameState}
          currentUserId={currentUserId}
          onAction={store.dispatchAction}
          onPushRoute={nav.pushRoute}
          onOpenChat={() => nav.switchTab('chat')}
          soundEnabled={store.soundEnabled}
          onToggleSound={store.toggleSoundEnabled}
          onSelectSoundTheme={store.selectSoundTheme}
        />
      );
    }

    if (nav.activeTab === 'ranking') {
      return (
        <RankingTab
          lang={lang}
          gameState={store.gameState}
          currentUserId={currentUserId}
          rankClimbs={store.rankClimbs}
          onConsumeRankClimb={store.clearRankClimb}
          onToggleReaction={(targetId, emoji) =>
            store.dispatchAction('toggle_participant_reaction', {
              targetId,
              emoji,
              dateStr: store.gameState.currentDateStr,
            })
          }
        />
      );
    }

    if (nav.activeTab === 'chat') {
      return (
        <ChatTab
          lang={lang}
          gameState={store.gameState}
          currentUserId={currentUserId}
          onAction={store.dispatchAction}
          onShowToast={store.showToast}
        />
      );
    }

    if (nav.activeTab === 'ia') {
      return (
        <AiChatView
          lang={lang}
          gameState={store.gameState}
          currentUserId={currentUserId}
          sessionToken={store.session!.token}
          messages={aiChatMessages}
          onMessagesChange={setAiChatMessages}
          onAuthExpired={store.handleAuthExpired}
          onShowToast={store.showToast}
        />
      );
    }

    return (
      <RegrasTab
        gameState={store.gameState}
        currentUserId={currentUserId}
        onOpenTailanEditor={
          currentUserId === 'tailan'
            ? () => {
                nav.switchTab('painel');
                nav.pushRoute('tailan-editor');
              }
            : undefined
        }
      />
    );
  };

  const tabs: Array<{ id: MainTab; label: string; icon: typeof LayoutDashboard; badge?: number }> = [
    { id: 'painel', label: t(lang, 'tabPainel'), icon: LayoutDashboard },
    { id: 'ranking', label: t(lang, 'tabRanking'), icon: Trophy },
    { id: 'chat', label: t(lang, 'tabChat'), icon: MessageCircle, badge: unreadChatCount },
    { id: 'ia', label: t(lang, 'tabIA'), icon: MessageCircle },
    { id: 'regras', label: t(lang, 'tabRegras'), icon: BookOpen },
  ];

  return (
    <div className="relative min-h-dvh flex flex-col bg-gradient-to-br from-slate-100 via-amber-50/35 to-slate-100 dark:bg-none dark:bg-[#090B10] text-slate-900 dark:text-slate-100 overflow-x-hidden">
      {/* Subtle ambient light backdrop for glassmorphism refraction */}
      <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -top-32 -right-24 w-96 h-96 rounded-full bg-amber-400/15 dark:bg-amber-500/[0.09] blur-[110px]" />
        <div className="absolute top-1/3 -left-32 w-80 h-80 rounded-full bg-sky-400/12 dark:bg-sky-500/[0.07] blur-[110px]" />
        <div className="absolute -bottom-24 right-1/4 w-96 h-96 rounded-full bg-emerald-400/10 dark:bg-emerald-500/[0.06] blur-[120px]" />
      </div>

      {/* Compact Top App Header */}
      <header className="sticky top-0 z-30 bg-white/75 dark:bg-[#0B0E16]/75 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/[0.08] pt-safe px-safe">
        <div className="max-w-6xl mx-auto px-4 h-13 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Star className="w-5 h-5 fill-amber-400 text-amber-400 shrink-0" />
            <span className="font-display font-bold text-sm sm:text-base tracking-tight truncate">
              {t(lang, 'appTitle')}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShareModalOpen(true)}
              aria-label="Abrir link único e Sistema APK"
              title="Link Único do Jogo e Sistema APK (Instalar no Celular)"
              className="min-w-[40px] min-h-[40px] px-2.5 rounded-xl border border-sky-400/40 bg-sky-500/10 text-sky-600 dark:text-sky-300 hover:border-amber-400/60 hover:text-amber-500 flex items-center gap-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0"
            >
              <Link2 className="w-4 h-4 shrink-0" />
              <span className="md:hidden">APK</span>
              <span className="hidden md:inline">Link · APK</span>
            </button>
            <span className="font-mono-num text-xs sm:text-sm font-extrabold text-amber-500">
              {userDisplayName} · {userState.stars} ⭐
            </span>
            {currentUserId === 'tailan' && (
              <button
                type="button"
                onClick={() => {
                  nav.switchTab('painel');
                  nav.pushRoute('tailan-editor');
                }}
                aria-label="Editar Tudo no Jogo (Tailan)"
                title="Alterar e acrescentar qualquer coisa no jogo"
                className={`min-w-[40px] min-h-[40px] px-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-extrabold transition-colors whitespace-nowrap shrink-0 ${
                  nav.activeTab === 'painel' && nav.currentSubRoute === 'tailan-editor'
                    ? 'border-amber-400 bg-amber-400 text-slate-950'
                    : 'border-amber-400/50 bg-amber-400/15 text-amber-500 hover:bg-amber-400/25'
                }`}
              >
                <Crown className="w-4 h-4" />
                <span className="hidden sm:inline">Editar Tudo</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => nav.switchTab('chat')}
              aria-label="Abrir Chat da Casa"
              title="Abrir Chat da Casa"
              className={`relative min-w-[40px] min-h-[40px] px-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-colors ${
                nav.activeTab === 'chat'
                  ? 'border-amber-400 bg-amber-400/15 text-amber-500'
                  : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-amber-400/60 hover:text-amber-500'
              }`}
            >
              <MessageCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Chat</span>
              {unreadChatCount > 0 && (
                <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-amber-400 text-slate-950 font-mono-num text-[10px] font-extrabold flex items-center justify-center">
                  {unreadChatCount > 9 ? '9+' : unreadChatCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={store.toggleSoundEnabled}
              aria-label={store.soundEnabled ? 'Silenciar som festivo' : 'Ativar som festivo'}
              title={store.soundEnabled ? 'Som festivo ao ganhar ⭐ ativo (clique para silenciar)' : 'Som festivo silenciado (clique para ativar)'}
              className={`min-w-[40px] min-h-[40px] rounded-xl border flex items-center justify-center transition-colors ${
                store.soundEnabled
                  ? 'border-amber-400/40 text-amber-500 hover:bg-amber-400/15'
                  : 'border-slate-200 dark:border-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
              }`}
            >
              {store.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={store.logout}
              aria-label={t(lang, 'logout')}
              className="min-w-[40px] min-h-[40px] rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 hover:text-rose-400 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Network Disconnected Warning */}
      {!store.isOnline && (
        <div className="bg-rose-600 text-white px-4 py-1.5 text-xs font-bold flex items-center justify-center gap-2">
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>Sem conexão com a internet — reconecte para usar o aplicativo</span>
        </div>
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {store.toast && (
          <motion.div
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.18 }}
            className="fixed top-16 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50"
          >
            <div
              className={`rounded-2xl p-3.5 shadow-xl border backdrop-blur-md flex items-start justify-between gap-3 ${
                store.toast.tone === 'error'
                  ? 'bg-rose-950/95 border-rose-500/50 text-rose-100'
                  : store.toast.tone === 'success'
                  ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-100'
                  : 'bg-[#171B26]/95 border-amber-400/50 text-white'
              }`}
            >
              <div className="min-w-0">
                <p className="text-xs font-bold">{store.toast.title}</p>
                <p className="text-xs opacity-90 mt-0.5">{store.toast.message}</p>
              </div>
              <button
                type="button"
                onClick={store.dismissToast}
                className="p-1 opacity-70 hover:opacity-100"
                aria-label="Fechar aviso"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scrollable Main Content with AI Search Bar + Pull-to-Refresh + Native Push/Pop Transitions */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 pt-4 pb-nav-safe px-safe">
        {nav.activeTab !== 'ia' && (
          <AiSearchBar
            lang={lang}
            participantId={currentUserId}
            sessionToken={store.session.token}
            onAuthExpired={store.handleAuthExpired}
            onOpenAiChat={(seedExchange) => {
              if (seedExchange) {
                const nowTime = store.gameState.simulatedClockTime || getBrazilClockHHMM();
                const uid = `ai-seed-u-${Date.now()}`;
                const mid = `ai-seed-m-${Date.now()}`;
                setAiChatMessages((prev) => [
                  ...prev,
                  {
                    id: uid,
                    role: 'user',
                    text: seedExchange.query,
                    timestamp: nowTime,
                  },
                  {
                    id: mid,
                    role: 'model',
                    text: seedExchange.answer,
                    timestamp: nowTime,
                    sources: seedExchange.sources,
                  },
                ]);
              }
              setIsMetaAiOpen(true);
            }}
          />
        )}

        <PullToRefresh
          onRefresh={store.refreshFromServer}
          isRefreshing={store.isRefreshing}
          hintText={t(lang, 'pullToRefreshHint')}
        >
          <Suspense fallback={<RouteSkeleton />}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={routeKey}
                initial={{ opacity: 0, x: enterX }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: exitX }}
                transition={{ duration: 0.09, ease: [0.16, 1, 0.3, 1] }}
              >
                {renderRouteContent()}
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </PullToRefresh>
      </main>

      {/* Fixed 5-Tab Bottom Navigation Bar */}
      <nav
        aria-label="Menu principal"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-[#0B0D12]/90 backdrop-blur-md border-t border-slate-200 dark:border-white/10 pb-safe px-safe"
      >
        <div className="max-w-2xl mx-auto grid grid-cols-5 h-15">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = nav.activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => nav.switchTab(tab.id)}
                className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[48px] transition-colors ${
                  active
                    ? 'text-amber-500'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <div className="relative">
                  {tab.id === 'ia' ? (
                    <MetaAiRingIcon className="w-5 h-5" />
                  ) : (
                    <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`} />
                  )}
                  {tab.badge && tab.badge > 0 ? (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full bg-amber-400 text-slate-950 font-mono-num text-[10px] font-extrabold flex items-center justify-center">
                      {tab.badge > 9 ? '9+' : tab.badge}
                    </span>
                  ) : null}
                </div>
                <span className="text-[11px] font-bold tracking-tight whitespace-nowrap">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
      {/* Floating Meta AI Button (Draggable anywhere on screen) */}
      <AnimatePresence>
        {!isMetaAiOpen && nav.activeTab !== 'ia' && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.18 }}
            style={fabPos ? { left: `${fabPos.x}px`, top: `${fabPos.y}px` } : undefined}
            onPointerDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              fabDragRef.current = {
                pointerId: e.pointerId,
                startX: e.clientX,
                startY: e.clientY,
                originLeft: rect.left,
                originTop: rect.top,
                moved: false,
              };
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // ignore pointer capture errors
              }
            }}
            onPointerMove={(e) => {
              const drag = fabDragRef.current;
              if (!drag || drag.pointerId !== e.pointerId) return;
              const dx = e.clientX - drag.startX;
              const dy = e.clientY - drag.startY;
              if (!drag.moved && Math.hypot(dx, dy) > 6) {
                drag.moved = true;
              }
              if (!drag.moved) return;
              const maxX = Math.max(8, window.innerWidth - 64);
              const maxY = Math.max(58, window.innerHeight - 72);
              const nextX = Math.min(Math.max(8, drag.originLeft + dx), maxX);
              const nextY = Math.min(Math.max(58, drag.originTop + dy), maxY);
              setFabPos({ x: nextX, y: nextY });
            }}
            onPointerUp={(e) => {
              const drag = fabDragRef.current;
              if (!drag || drag.pointerId !== e.pointerId) return;
              fabDragRef.current = null;
              try {
                e.currentTarget.releasePointerCapture(e.pointerId);
              } catch {
                // ignore
              }
              if (drag.moved) {
                suppressFabClickRef.current = true;
                setTimeout(() => {
                  suppressFabClickRef.current = false;
                }, 80);
                const maxX = Math.max(8, window.innerWidth - 64);
                const maxY = Math.max(58, window.innerHeight - 72);
                const finalPos = {
                  x: Math.min(Math.max(8, drag.originLeft + (e.clientX - drag.startX)), maxX),
                  y: Math.min(Math.max(58, drag.originTop + (e.clientY - drag.startY)), maxY),
                };
                setFabPos(finalPos);
                try {
                  localStorage.setItem('estrelas_meta_ai_fab_pos_v1', JSON.stringify(finalPos));
                } catch {
                  // ignore storage errors
                }
              }
            }}
            onPointerCancel={() => {
              fabDragRef.current = null;
            }}
            onClick={() => {
              if (suppressFabClickRef.current) return;
              setIsMetaAiOpen(true);
            }}
            aria-label="Abrir Meta AI (arraste para mover)"
            title="Conversar com a Meta AI — arraste para mover para onde quiser"
            className={`fixed z-40 w-14 h-14 rounded-full bg-white/95 dark:bg-[#182229]/95 backdrop-blur-md border border-sky-400/45 shadow-[0_10px_28px_-6px_rgba(0,132,255,0.48)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform touch-none select-none cursor-grab active:cursor-grabbing ${
              fabPos
                ? ''
                : 'right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] sm:right-6'
            }`}
          >
            <MetaAiRingIcon className="w-9 h-9 pointer-events-none" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Full-Screen WhatsApp-Style Meta AI Chat Overlay */}
      <AnimatePresence>
        {isMetaAiOpen && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50"
            role="dialog"
            aria-modal="true"
            aria-label="Conversa privada com a Meta AI"
          >
            <Suspense fallback={<RouteSkeleton />}>
              <AiChatView
                isFloatingOverlay
                onClose={() => setIsMetaAiOpen(false)}
                lang={lang}
                gameState={store.gameState}
                currentUserId={currentUserId}
                sessionToken={store.session.token}
                messages={aiChatMessages}
                onMessagesChange={setAiChatMessages}
                onAuthExpired={store.handleAuthExpired}
                onShowToast={store.showToast}
              />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      <ShareLinksModal
        open={shareModalOpen}
        gameState={store.gameState}
        currentUserId={currentUserId}
        onSavePublicUrl={(url) =>
          store.dispatchAction('tailan_set_public_url', { publicAppUrl: url })
        }
        onClose={() => setShareModalOpen(false)}
        onNotify={store.showToast}
      />
    </div>
  );
}
