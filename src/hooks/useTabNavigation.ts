import { useCallback, useEffect, useState } from 'react';

export type MainTab = 'painel' | 'ranking' | 'chat' | 'ia' | 'regras';
export type SubRoute =
  | 'root'
  | 'notifications'
  | 'notif-prefs'
  | 'analytics-admin'
  | 'calendar'
  | 'tailan-editor';

interface HistorySnapshot {
  tab: MainTab;
  stacks: Record<MainTab, SubRoute[]>;
}

const INITIAL_STACKS: Record<MainTab, SubRoute[]> = {
  painel: ['root'],
  ranking: ['root'],
  chat: ['root'],
  ia: ['root'],
  regras: ['root'],
};

function getInitialTab(): MainTab {
  if (typeof window === 'undefined') return 'painel';
  const param = new URLSearchParams(window.location.search).get('tab');
  if (
    param === 'painel' ||
    param === 'ranking' ||
    param === 'chat' ||
    param === 'ia' ||
    param === 'regras'
  ) {
    return param;
  }
  return 'painel';
}

export function useTabNavigation() {
  const [activeTab, setActiveTab] = useState<MainTab>(() => getInitialTab());
  const [stacks, setStacks] = useState<Record<MainTab, SubRoute[]>>(INITIAL_STACKS);
  const [transitionDirection, setTransitionDirection] = useState<'push' | 'pop' | 'tab'>('tab');

  // Seed initial history state on mount for Android predictive-back gesture navigation
  useEffect(() => {
    const startTab = getInitialTab();
    if (typeof window !== 'undefined' && window.location.search.includes('tab=')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('tab');
      const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({ tab: startTab, stacks: INITIAL_STACKS }, '', cleanUrl);
    } else if (!window.history.state || !window.history.state.tab) {
      window.history.replaceState({ tab: startTab, stacks: INITIAL_STACKS }, '');
    }

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as HistorySnapshot | null;
      if (state && state.tab && state.stacks) {
        setTransitionDirection('pop');
        setActiveTab(state.tab);
        setStacks(state.stacks);
      } else {
        setTransitionDirection('pop');
        setActiveTab('painel');
        setStacks(INITIAL_STACKS);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const switchTab = useCallback(
    (nextTab: MainTab) => {
      if (nextTab === activeTab) {
        // Native behavior: tapping active tab pops back to root if inside a subroute
        const currentStack = stacks[nextTab];
        if (currentStack.length > 1) {
          const nextStacks = { ...stacks, [nextTab]: ['root' as SubRoute] };
          setTransitionDirection('pop');
          setStacks(nextStacks);
          window.history.pushState({ tab: nextTab, stacks: nextStacks }, '');
        }
        return;
      }
      setTransitionDirection('tab');
      setActiveTab(nextTab);
      window.history.pushState({ tab: nextTab, stacks }, '');
    },
    [activeTab, stacks]
  );

  const pushRoute = useCallback(
    (route: SubRoute) => {
      const currentStack = stacks[activeTab];
      if (currentStack[currentStack.length - 1] === route) return;
      const nextStacks = {
        ...stacks,
        [activeTab]: [...currentStack, route],
      };
      setTransitionDirection('push');
      setStacks(nextStacks);
      window.history.pushState({ tab: activeTab, stacks: nextStacks }, '');
    },
    [activeTab, stacks]
  );

  const popRoute = useCallback(() => {
    const currentStack = stacks[activeTab];
    if (currentStack.length <= 1) return;
    if (window.history.length > 1) {
      window.history.back();
    } else {
      const nextStacks = {
        ...stacks,
        [activeTab]: currentStack.slice(0, -1),
      };
      setTransitionDirection('pop');
      setStacks(nextStacks);
    }
  }, [activeTab, stacks]);

  const currentSubRoute = stacks[activeTab][stacks[activeTab].length - 1] || 'root';

  return {
    activeTab,
    currentSubRoute,
    canGoBack: stacks[activeTab].length > 1,
    transitionDirection,
    switchTab,
    pushRoute,
    popRoute,
  };
}
