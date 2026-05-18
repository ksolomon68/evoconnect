/**
 * WorkForce Connect PWA – Service Worker Registration & Install Prompt
 * Handles: Android Chrome (beforeinstallprompt), iOS Safari (manual guide),
 *          Android fallback (manual guide), and app update notifications.
 */
(function () {
  'use strict';

  const ICON = '/assets/icon-192.png';
  const DISMISS_KEY = 'pwa-install-dismissed';
  const INSTALLED_KEY = 'pwa-installed';
  const DISMISS_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

  // ── Platform Detection ───────────────────────────────────────────────────
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);
  const isMobile = isIOS || isAndroid;
  const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  function wasDismissedRecently() {
    const ts = localStorage.getItem(DISMISS_KEY);
    return ts && Date.now() - parseInt(ts, 10) < DISMISS_TTL;
  }

  function isAlreadyInstalled() {
    return localStorage.getItem(INSTALLED_KEY) === 'true' || isInStandaloneMode;
  }

  // ── Service Worker Registration ──────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then(reg => {
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateBanner();
              }
            });
          });
        })
        .catch(err => console.warn('[PWA] SW registration failed:', err));

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) { refreshing = true; window.location.reload(); }
      });
    });
  }

  // ── Android: beforeinstallprompt ─────────────────────────────────────────
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    if (isAlreadyInstalled() || wasDismissedRecently()) return;
    showAndroidBanner();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    removeBanner('pwa-install-banner');
    localStorage.setItem(INSTALLED_KEY, 'true');
  });

  // ── iOS: show guide after short delay ────────────────────────────────────
  if (isIOS && !isAlreadyInstalled() && !wasDismissedRecently()) {
    window.addEventListener('load', () => {
      setTimeout(showIOSBanner, 3000);
    });
  }

  // ── Android fallback: if beforeinstallprompt never fires (HTTP/old Chrome)
  if (isAndroid && !isAlreadyInstalled() && !wasDismissedRecently()) {
    window.addEventListener('load', () => {
      // Wait 5s — if beforeinstallprompt hasn't fired, show manual guide
      setTimeout(() => {
        if (!deferredPrompt && !document.getElementById('pwa-install-banner')) {
          showAndroidManualBanner();
        }
      }, 5000);
    });
  }

  // ── Android Auto-prompt Banner ───────────────────────────────────────────
  function showAndroidBanner() {
    if (document.getElementById('pwa-install-banner')) return;
    injectStyles();

    const banner = createBanner('pwa-install-banner', `
      <div class="pwa-inner">
        <img src="${ICON}" alt="" aria-hidden="true" class="pwa-logo">
        <div class="pwa-text">
          <strong>Install WorkForce Connect</strong>
          <span>Add to your home screen for quick access</span>
        </div>
        <div class="pwa-actions">
          <button id="pwa-install-btn">Install</button>
          <button class="pwa-dismiss" aria-label="Dismiss">✕</button>
        </div>
      </div>
    `);

    banner.querySelector('#pwa-install-btn').addEventListener('click', () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(choice => {
        deferredPrompt = null;
        removeBanner('pwa-install-banner');
        if (choice.outcome === 'dismissed') {
          localStorage.setItem(DISMISS_KEY, Date.now().toString());
        }
      });
    });

    banner.querySelector('.pwa-dismiss').addEventListener('click', () => {
      removeBanner('pwa-install-banner');
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    });
  }

  // ── Android Manual Guide (HTTP / no prompt) ──────────────────────────────
  function showAndroidManualBanner() {
    if (document.getElementById('pwa-install-banner')) return;
    injectStyles();

    const banner = createBanner('pwa-install-banner', `
      <div class="pwa-inner">
        <img src="${ICON}" alt="" aria-hidden="true" class="pwa-logo">
        <div class="pwa-text">
          <strong>Install WorkForce Connect</strong>
          <span>Tap <b>⋮ Menu</b> → <b>Add to Home screen</b></span>
        </div>
        <div class="pwa-actions">
          <button class="pwa-dismiss" aria-label="Dismiss">✕</button>
        </div>
      </div>
    `);

    banner.querySelector('.pwa-dismiss').addEventListener('click', () => {
      removeBanner('pwa-install-banner');
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    });
  }

  // ── iOS Guide Banner ─────────────────────────────────────────────────────
  function showIOSBanner() {
    if (document.getElementById('pwa-install-banner')) return;
    injectStyles();

    const banner = createBanner('pwa-install-banner', `
      <div class="pwa-inner pwa-ios">
        <img src="${ICON}" alt="" aria-hidden="true" class="pwa-logo">
        <div class="pwa-text">
          <strong>Install WorkForce Connect</strong>
          <span>Tap <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle;margin:0 2px"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> then <b>"Add to Home Screen"</b></span>
        </div>
        <div class="pwa-actions">
          <button class="pwa-dismiss" aria-label="Dismiss">✕</button>
        </div>
      </div>
      <div class="pwa-ios-arrow" aria-hidden="true">▼</div>
    `);

    banner.querySelector('.pwa-dismiss').addEventListener('click', () => {
      removeBanner('pwa-install-banner');
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    });
  }

  // ── Update Banner ────────────────────────────────────────────────────────
  function showUpdateBanner() {
    if (document.getElementById('pwa-update-banner')) return;
    injectStyles();

    const banner = createBanner('pwa-update-banner', `
      <div class="pwa-inner">
        <span style="flex:1;font-size:0.88rem;color:#333;">🔄 A new version is available.</span>
        <div class="pwa-actions">
          <button id="pwa-reload-btn">Reload</button>
          <button class="pwa-dismiss" aria-label="Dismiss">✕</button>
        </div>
      </div>
    `);

    banner.querySelector('#pwa-reload-btn').addEventListener('click', () => window.location.reload());
    banner.querySelector('.pwa-dismiss').addEventListener('click', () => banner.remove());
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function createBanner(id, html) {
    const el = document.createElement('div');
    el.id = id;
    el.setAttribute('role', id === 'pwa-update-banner' ? 'alert' : 'region');
    el.setAttribute('aria-label', id === 'pwa-update-banner' ? 'App update available' : 'App install prompt');
    el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  }

  function removeBanner(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.transform = 'translateX(-50%) translateY(120%)';
    setTimeout(() => el.remove(), 300);
  }

  function injectStyles() {
    if (document.getElementById('pwa-styles')) return;
    const s = document.createElement('style');
    s.id = 'pwa-styles';
    s.textContent = `
      #pwa-install-banner, #pwa-update-banner {
        position: fixed;
        bottom: 76px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 99999;
        width: min(500px, calc(100vw - 1.5rem));
        background: #fff;
        border: 1.5px solid #005A8C;
        border-radius: 14px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.18);
        animation: pwaUp 0.35s cubic-bezier(0.34,1.56,0.64,1) both;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        overflow: hidden;
      }
      @keyframes pwaUp {
        from { opacity:0; transform:translateX(-50%) translateY(40px); }
        to   { opacity:1; transform:translateX(-50%) translateY(0); }
      }
      .pwa-inner {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.9rem 1rem;
      }
      .pwa-logo {
        width: 42px; height: 42px;
        object-fit: contain;
        border-radius: 10px;
        flex-shrink: 0;
      }
      .pwa-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
      }
      .pwa-text strong {
        font-size: 0.88rem;
        font-weight: 700;
        color: #005A8C;
      }
      .pwa-text span {
        font-size: 0.78rem;
        color: #555;
        line-height: 1.4;
      }
      .pwa-actions {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex-shrink: 0;
      }
      #pwa-install-btn, #pwa-reload-btn {
        background: #005A8C;
        color: #fff;
        border: none;
        border-radius: 7px;
        padding: 0.45rem 1rem;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
      }
      #pwa-install-btn:hover, #pwa-reload-btn:hover { background: #004470; }
      .pwa-dismiss {
        background: transparent;
        border: none;
        color: #999;
        font-size: 1.1rem;
        cursor: pointer;
        padding: 0.25rem 0.4rem;
        border-radius: 4px;
        line-height: 1;
      }
      .pwa-dismiss:hover { color: #333; background: #f0f0f0; }
      /* iOS arrow pointing to browser share button */
      .pwa-ios-arrow {
        text-align: center;
        font-size: 1.3rem;
        color: #005A8C;
        padding-bottom: 0.5rem;
        margin-top: -0.5rem;
      }
      @media (max-width: 480px) {
        #pwa-install-banner, #pwa-update-banner { bottom: 68px; border-radius: 12px; }
      }
    `;
    document.head.appendChild(s);
  }
})();
