/**
 * PrimeReach Accessibility Widget v3.0
 * Design: EVOBRAND Concepts | evobrand.net
 * WCAG 2.1 AA/AAA | Keyboard: Alt+A (open/close), Escape (close)
 */
(function () {
  'use strict';

  const PREFS_KEY = 'cbc-a11y-v3';

  /* ── Icons (inline SVG strings) ─────────────────────────── */
  const IC = {
    a11y:       `<svg viewBox="0 0 24 24" fill="white"><circle cx="12" cy="4" r="2"/><path d="M19 9H5a1 1 0 000 2h4.5l-1.6 7.4a1 1 0 001.96.4L11 13h2l1.14 5.84a1 1 0 001.96-.4L14.5 11H19a1 1 0 000-2z"/></svg>`,
    wheelchair: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><path d="M8 9h3l1 5h4"/><path d="M10 14l-1 5"/><path d="M8 18a5 5 0 1 0 8 0"/></svg>`,
    eye:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    droplet:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
    df:         `<svg viewBox="0 0 24 24"><text x="3" y="17" font-size="14" font-weight="700" fill="currentColor" font-family="Georgia,serif">Df</text></svg>`,
    headphones: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`,
    contrast:   `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2a10 10 0 0 1 0 20V2z" fill="currentColor"/></svg>`,
    moon:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
    palette:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/><circle cx="7.5" cy="12.5" r="1.5" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1.5" fill="currentColor"/><circle cx="16.5" cy="10.5" r="1.5" fill="currentColor"/></svg>`,
    textA:      `<svg viewBox="0 0 24 24"><text x="2" y="18" font-size="18" font-weight="700" fill="currentColor" font-family="Arial,sans-serif">A</text><text x="14" y="16" font-size="11" font-weight="700" fill="currentColor" font-family="Arial,sans-serif">A</text></svg>`,
    link:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`,
    cursor:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l7.07 17 2.51-7.39L21 11.07z"/></svg>`,
    guide:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" y1="12" x2="22" y2="12"/><polyline points="5 8 2 12 5 16"/><polyline points="19 8 22 12 19 16"/></svg>`,
    mask:       `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="2" y="2" width="20" height="7" rx="1" opacity="0.35"/><rect x="2" y="15" width="20" height="7" rx="1" opacity="0.35"/><rect x="2" y="9" width="20" height="6" rx="1" opacity="0.08"/></svg>`,
    pause:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
    keyboard:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6.01" y2="10" stroke-width="3" stroke-linecap="round"/><line x1="10" y1="10" x2="10.01" y2="10" stroke-width="3" stroke-linecap="round"/><line x1="14" y1="10" x2="14.01" y2="10" stroke-width="3" stroke-linecap="round"/><line x1="18" y1="10" x2="18.01" y2="10" stroke-width="3" stroke-linecap="round"/><line x1="8" y1="14" x2="16" y2="14" stroke-linecap="round"/></svg>`,
    underline:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3v7a6 6 0 0 0 12 0V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>`,
    headphone2: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`,
    reset:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>`,
  };

  /* ── Feature definitions ─────────────────────────────────── */
  const FEATURES = [
    { id: 'screenReader',   label: 'Screen Reader',   ico: 'headphones', cls: 'aw-sr'       },
    { id: 'highContrast',   label: 'Contrast +',      ico: 'contrast',   cls: 'aw-contrast'  },
    { id: 'darkMode',       label: 'Dark Mode',       ico: 'moon',       cls: 'aw-dark'      },
    { id: 'desaturate',     label: 'Desaturate',      ico: 'palette',    cls: 'aw-desat'     },
    { id: 'highlightLinks', label: 'Highlight Links', ico: 'link',       cls: 'aw-hilite'    },
    { id: 'dyslexiaFont',   label: 'Dyslexia Font',   ico: 'df',         cls: 'aw-dyslexia'  },
    { id: 'bigCursor',      label: 'Big Cursor',      ico: 'cursor',     cls: 'aw-cursor'    },
    { id: 'readingGuide',   label: 'Reading Guide',   ico: 'guide',      cls: 'aw-guide-on'  },
    { id: 'readingMask',    label: 'Reading Mask',    ico: 'mask',       cls: 'aw-mask-on'   },
    { id: 'stopAnimations', label: 'Stop Animations', ico: 'pause',      cls: 'aw-freeze'    },
    { id: 'keyboardNav',    label: 'Keyboard Nav',    ico: 'keyboard',   cls: 'aw-keynav'    },
    { id: 'linkUnderline',  label: 'Link Underline',  ico: 'underline',  cls: 'aw-underline' },
  ];

  /* ── Profile presets ─────────────────────────────────────── */
  const PROFILES = [
    {
      id: 'motor', label: 'Motor\nImpaired', ico: 'wheelchair',
      set: { keyboardNav: true, bigCursor: true, stopAnimations: true }
    },
    {
      id: 'visual', label: 'Visually\nImpaired', ico: 'eye',
      set: { highContrast: true, textSize: 130, screenReader: true }
    },
    {
      id: 'colorblind', label: 'Color\nBlind', ico: 'droplet',
      set: { desaturate: true, linkUnderline: true, highlightLinks: true }
    },
    {
      id: 'dyslexia', label: 'Dyslexia', ico: 'df',
      set: { dyslexiaFont: true, linkUnderline: true, readingGuide: true }
    },
  ];

  /* ── Defaults ────────────────────────────────────────────── */
  const DEFAULTS = {
    activeProfile: null,
    textSize: 100,
    screenReader: false,
    highContrast: false,
    darkMode: false,
    desaturate: false,
    highlightLinks: false,
    dyslexiaFont: false,
    bigCursor: false,
    readingGuide: false,
    readingMask: false,
    stopAnimations: false,
    keyboardNav: false,
    linkUnderline: false,
  };

  /* ── State ───────────────────────────────────────────────── */
  let P = load();     // prefs
  let open = false;

  /* ── Persistence ─────────────────────────────────────────── */
  function load() {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREFS_KEY)) }; }
    catch { return { ...DEFAULTS }; }
  }
  function save() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(P)); } catch {}
  }

  /* ── Apply preferences ───────────────────────────────────── */
  function applyAll() {
    // Text size classes
    for (let s = 110; s <= 150; s += 10) document.documentElement.classList.remove(`aw-t${s}`);
    if (P.textSize > 100) document.documentElement.classList.add(`aw-t${Math.min(P.textSize, 150)}`);

    // Feature classes
    FEATURES.forEach(f => document.documentElement.classList.toggle(f.cls, !!P[f.id]));

    updateBadge();
    syncUI();
  }

  /* ── Toggle a feature ────────────────────────────────────── */
  function toggle(id) {
    P[id] = !P[id];
    P.activeProfile = null;
    save();
    applyAll();
    announce((P[id] ? 'Enabled' : 'Disabled') + ': ' + (FEATURES.find(f => f.id === id)?.label || id));
  }

  /* ── Apply / clear a profile ─────────────────────────────── */
  function applyProfile(id) {
    if (P.activeProfile === id) {
      P = { ...DEFAULTS };
    } else {
      const prof = PROFILES.find(p => p.id === id);
      if (!prof) return;
      P = { ...DEFAULTS, activeProfile: id, ...prof.set };
    }
    save();
    applyAll();
    announce(P.activeProfile ? PROFILES.find(p => p.id === id)?.label.replace('\n', ' ') + ' profile applied.' : 'Profile cleared.');
  }

  /* ── Reset ───────────────────────────────────────────────── */
  function resetAll() {
    P = { ...DEFAULTS };
    save();
    applyAll();
    announce('All accessibility settings reset.');
  }

  /* ── Badge ───────────────────────────────────────────────── */
  function updateBadge() {
    const el = document.getElementById('a11y-badge');
    if (!el) return;
    const n = FEATURES.filter(f => P[f.id]).length + (P.textSize !== 100 ? 1 : 0);
    el.textContent = n;
    el.classList.toggle('show', n > 0);
  }

  /* ── Sync panel UI to state ──────────────────────────────── */
  function syncUI() {
    FEATURES.forEach(f => {
      const c = document.getElementById(`aw-card-${f.id}`);
      if (c) { c.classList.toggle('on', !!P[f.id]); c.setAttribute('aria-pressed', String(!!P[f.id])); }
    });
    PROFILES.forEach(p => {
      const b = document.getElementById(`aw-prof-${p.id}`);
      if (b) { b.classList.toggle('on', P.activeProfile === p.id); b.setAttribute('aria-pressed', String(P.activeProfile === p.id)); }
    });
    const val = document.getElementById('aw-ts-val');
    const dec = document.getElementById('aw-ts-dec');
    const inc = document.getElementById('aw-ts-inc');
    if (val) val.textContent = P.textSize + '%';
    if (dec) dec.disabled = P.textSize <= 100;
    if (inc) inc.disabled = P.textSize >= 150;
  }

  /* ── Announce to screen readers ──────────────────────────── */
  function announce(msg) {
    const el = document.getElementById('a11y-live');
    if (!el) return;
    el.textContent = '';
    setTimeout(() => { el.textContent = msg; }, 50);
  }

  /* ── Build HTML ──────────────────────────────────────────── */
  function buildHTML() {
    const profiles = PROFILES.map(p => `
      <button class="aw-profile" id="aw-prof-${p.id}" data-prof="${p.id}"
              aria-pressed="false" title="${p.label.replace('\n',' ')}">
        <span class="aw-profile-ico">${IC[p.ico]}</span>
        <span class="aw-profile-name">${p.label.replace('\n','<br>')}</span>
      </button>`).join('');

    const cards = FEATURES.map(f => `
      <button class="aw-card" id="aw-card-${f.id}" data-feat="${f.id}"
              role="switch" aria-checked="false" title="${f.label}">
        <span class="aw-card-ico">${IC[f.ico]}</span>
        <span class="aw-card-lbl">${f.label}</span>
      </button>`).join('');

    return `
      <div id="a11y-panel" role="dialog" aria-modal="true" aria-label="Accessibility Menu">
        <div class="aw-header">
          <div class="aw-header-icon">${IC.a11y}</div>
          <div class="aw-header-copy">
            <h2>Accessibility Menu</h2>
            <p>Customize your experience · Alt+A</p>
          </div>
          <button class="aw-close" id="aw-close" aria-label="Close accessibility menu">&#x2715;</button>
        </div>

        <div class="aw-body">
          <div class="aw-section">
            <div class="aw-section-title">Accessibility Profiles</div>
            <div class="aw-profiles">${profiles}</div>
          </div>

          <div class="aw-section">
            <div class="aw-section-title">Text Size</div>
            <div class="aw-stepper">
              <div class="aw-stepper-lbl">${IC.textA} Font Size</div>
              <div class="aw-stepper-ctrl">
                <button class="aw-step-btn" id="aw-ts-dec" aria-label="Decrease text size" disabled>&#8722;</button>
                <span class="aw-step-val" id="aw-ts-val">100%</span>
                <button class="aw-step-btn" id="aw-ts-inc" aria-label="Increase text size">&#43;</button>
              </div>
            </div>
          </div>

          <div class="aw-section">
            <div class="aw-section-title">Adjustments</div>
            <div class="aw-grid">${cards}</div>
          </div>

          <button class="aw-reset" id="aw-reset">${IC.reset}&nbsp; Reset All Settings</button>
        </div>

        <div class="aw-footer">
          <a class="stmt" href="/accessibility-statement" target="_blank" rel="noopener">Accessibility Statement</a>
          <div class="aw-branding">Accessibility by <a href="https://evobrand.net" target="_blank" rel="noopener noreferrer">EVOBRAND Concepts</a></div>
        </div>
      </div>

      <button id="a11y-trigger" aria-label="Open Accessibility Menu"
              aria-expanded="false" aria-controls="a11y-panel">
        ${IC.a11y}
        <span id="a11y-badge" aria-hidden="true"></span>
      </button>

      <div id="a11y-overlay" aria-hidden="true"></div>
      <div id="a11y-guide"  aria-hidden="true"></div>
      <div id="a11y-mask"   aria-hidden="true"></div>
      <div id="a11y-live" role="status" aria-live="polite" aria-atomic="true"></div>
    `;
  }

  /* ── Open / Close ────────────────────────────────────────── */
  function openPanel() {
    open = true;
    document.getElementById('a11y-panel').classList.add('open');
    document.getElementById('a11y-overlay').classList.add('show');
    document.getElementById('a11y-trigger').setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('aw-close')?.focus(), 50);
    announce('Accessibility menu opened.');
  }

  function closePanel() {
    open = false;
    document.getElementById('a11y-panel').classList.remove('open');
    document.getElementById('a11y-overlay').classList.remove('show');
    document.getElementById('a11y-trigger').setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    document.getElementById('a11y-trigger').focus();
    announce('Accessibility menu closed.');
  }

  /* ── Mouse tracking (guide & mask) ──────────────────────── */
  function setupMouse() {
    document.addEventListener('mousemove', e => {
      if (P.readingGuide) document.documentElement.style.setProperty('--aw-guide', e.clientY + 'px');
      if (P.readingMask)  document.documentElement.style.setProperty('--aw-mask', ((e.clientY / innerHeight) * 100).toFixed(1) + '%');
    });
  }

  /* ── Focus trap ──────────────────────────────────────────── */
  function trapFocus(panel) {
    panel.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const els = [...panel.querySelectorAll('button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')];
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* ── Wire up events ──────────────────────────────────────── */
  function bindEvents() {
    const panel   = document.getElementById('a11y-panel');
    const trigger = document.getElementById('a11y-trigger');
    const overlay = document.getElementById('a11y-overlay');

    trigger.addEventListener('click', () => open ? closePanel() : openPanel());
    overlay.addEventListener('click', closePanel);
    document.getElementById('aw-close').addEventListener('click', closePanel);

    PROFILES.forEach(p => {
      document.getElementById(`aw-prof-${p.id}`)?.addEventListener('click', () => applyProfile(p.id));
    });

    FEATURES.forEach(f => {
      document.getElementById(`aw-card-${f.id}`)?.addEventListener('click', () => toggle(f.id));
    });

    document.getElementById('aw-ts-inc')?.addEventListener('click', () => {
      if (P.textSize >= 150) return;
      P.textSize = Math.min(P.textSize + 10, 150);
      P.activeProfile = null; save(); applyAll();
      announce('Text size: ' + P.textSize + '%');
    });

    document.getElementById('aw-ts-dec')?.addEventListener('click', () => {
      if (P.textSize <= 100) return;
      P.textSize = Math.max(P.textSize - 10, 100);
      P.activeProfile = null; save(); applyAll();
      announce('Text size: ' + P.textSize + '%');
    });

    document.getElementById('aw-reset')?.addEventListener('click', resetAll);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && open) { closePanel(); return; }
      if (e.altKey && e.key.toLowerCase() === 'a') { e.preventDefault(); open ? closePanel() : openPanel(); }
    });

    trapFocus(panel);
  }

  /* ── Init ────────────────────────────────────────────────── */
  function init() {
    // Remove old instances
    ['a11y-panel','a11y-trigger','a11y-overlay','a11y-guide','a11y-mask','a11y-live']
      .forEach(id => document.getElementById(id)?.remove());

    const wrap = document.createElement('div');
    wrap.innerHTML = buildHTML();
    document.body.appendChild(wrap);

    applyAll();
    bindEvents();
    setupMouse();
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
