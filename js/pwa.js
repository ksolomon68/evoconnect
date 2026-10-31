/**
 * EVOGovCon PWA – Service Worker Registration & Install Prompt
 * Handles: Android Chrome (beforeinstallprompt), iOS Safari (manual guide),
 *          Android fallback (manual guide), and app update notifications.
 */
(function () {
  'use strict';

  const ICON = '/images/favicon.png';
  const FALLBACK_ICON = '/assets/icon-192.png';
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
        <img src="${ICON}" alt="EVOGovCon" class="pwa-logo" width="44" height="44" onerror="if(this.src.indexOf('favicon')!==-1)this.src='${FALLBACK_ICON}';">
        <div class="pwa-text">
          <strong>Install EVOGovCon</strong>
          <span>Add to your home screen for instant portal access</span>
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
        <img src="${ICON}" alt="EVOGovCon" class="pwa-logo" width="44" height="44" onerror="if(this.src.indexOf('favicon')!==-1)this.src='${FALLBACK_ICON}';">
        <div class="pwa-text">
          <strong>Install EVOGovCon</strong>
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
        <img src="${ICON}" alt="EVOGovCon" class="pwa-logo" width="44" height="44" onerror="if(this.src.indexOf('favicon')!==-1)this.src='${FALLBACK_ICON}';">
        <div class="pwa-text">
          <strong>Install EVOGovCon</strong>
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
        <img src="${ICON}" alt="EVOGovCon" class="pwa-logo" width="44" height="44" onerror="if(this.src.indexOf('favicon')!==-1)this.src='${FALLBACK_ICON}';">
        <div class="pwa-text">
          <strong>Update Ready</strong>
          <span>A new version of EVOGovCon is available</span>
        </div>
        <div class="pwa-actions">
          <button id="pwa-reload-btn">Update</button>
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
        background: rgba(15, 23, 42, 0.97);
        color: #F8FAFC;
        border: 1px solid rgba(0, 180, 216, 0.4);
        border-radius: 14px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 24px rgba(0, 180, 216, 0.16);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        animation: pwaUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        overflow: hidden;
      }
      @keyframes pwaUp {
        from { opacity: 0; transform: translateX(-50%) translateY(40px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      .pwa-inner {
        display: flex;
        align-items: center;
        gap: 0.85rem;
        padding: 0.85rem 1rem;
      }
      .pwa-logo {
        width: 44px;
        height: 44px;
        object-fit: contain;
        border-radius: 10px;
        flex-shrink: 0;
        background: #030712;
        border: 1px solid rgba(0, 180, 216, 0.3);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
        display: block;
      }
      .pwa-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
      }
      .pwa-text strong {
        font-size: 0.92rem;
        font-weight: 700;
        color: #F8FAFC;
        letter-spacing: -0.01em;
      }
      .pwa-text span {
        font-size: 0.78rem;
        color: #94A3B8;
        line-height: 1.4;
      }
      .pwa-text span b {
        color: #38BDF8;
      }
      .pwa-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-shrink: 0;
      }
      #pwa-install-btn, #pwa-reload-btn {
        background: linear-gradient(135deg, #00B4D8, #0077B6);
        color: #030712;
        border: none;
        border-radius: 8px;
        padding: 0.45rem 1rem;
        font-size: 0.85rem;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        box-shadow: 0 2px 10px rgba(0, 180, 216, 0.3);
      }
      #pwa-install-btn:hover, #pwa-reload-btn:hover {
        background: linear-gradient(135deg, #38BDF8, #00B4D8);
        transform: translateY(-1px);
        box-shadow: 0 4px 14px rgba(0, 180, 216, 0.45);
      }
      .pwa-dismiss {
        background: transparent;
        border: none;
        color: #94A3B8;
        font-size: 1.15rem;
        cursor: pointer;
        padding: 0.25rem 0.4rem;
        border-radius: 6px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .pwa-dismiss:hover {
        color: #F8FAFC;
        background: rgba(255, 255, 255, 0.1);
      }
      .pwa-ios-arrow {
        text-align: center;
        font-size: 1.2rem;
        color: #00B4D8;
        padding-bottom: 0.4rem;
        margin-top: -0.4rem;
      }
      @media (max-width: 480px) {
        #pwa-install-banner, #pwa-update-banner {
          bottom: 72px;
          border-radius: 12px;
        }
        .pwa-inner {
          padding: 0.75rem 0.85rem;
          gap: 0.7rem;
        }
        .pwa-logo {
          width: 38px;
          height: 38px;
        }
      }
    `;
    document.head.appendChild(s);
  }

  // ── Public API & Manual Trigger Support ──────────────────────────────────
  window.EVOConnectedPWA = {
    showInstallPrompt: function () {
      if (deferredPrompt) {
        showAndroidBanner();
      } else if (isIOS) {
        showIOSBanner();
      } else {
        showAndroidManualBanner();
      }
    }
  };

  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-install-app], .btn-download-app, #btn-download-app, [href="#download-app"], [href="#install-app"]');
    if (trigger) {
      e.preventDefault();
      if (window.EVOConnectedPWA) window.EVOConnectedPWA.showInstallPrompt();
    }
  });
})();
