import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'caches' in window) {
  caches.delete('estrelas-da-casa-v1').catch(() => {});
  caches.delete('estrelas-da-casa-v2').catch(() => {});
}

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  let hadController = Boolean(navigator.serviceWorker.controller);
  let activeRegistration: ServiceWorkerRegistration | undefined;

  const triggerSafeReload = () => {
    try {
      const now = Date.now();
      const lastReload = Number(sessionStorage.getItem('estrelas_sw_reload_at') || '0');
      if (now - lastReload < 10_000) return;
      sessionStorage.setItem('estrelas_sw_reload_at', String(now));
    } catch {
      // ignore storage errors
    }
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    triggerSafeReload();
  });

  const checkForSwUpdate = () => {
    if (navigator.onLine === false) return;
    if (activeRegistration) {
      activeRegistration.update().catch(() => {});
    } else {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => reg?.update().catch(() => {}))
        .catch(() => {});
    }
  };

  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      activeRegistration = registration;
      if (registration) {
        registration.update().catch(() => {});
      }
    },
    onNeedRefresh() {
      void updateSW(true);
    },
    onRegisterError() {
      // ignore registration errors in unsupported sandboxes
    },
  });

  window.addEventListener('focus', checkForSwUpdate);
  window.addEventListener('pageshow', checkForSwUpdate);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForSwUpdate();
    }
  });
}

createRoot(document.getElementById('root')!).render(<App />);
