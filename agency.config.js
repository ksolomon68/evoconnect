/**
 * ============================================================
 *  WORKFORCE CONNECT — CLIENT-SIDE AGENCY CONFIG
 * ============================================================
 *  All brand values live here. Do not hard-code platform names,
 *  colors, or emails anywhere else in the codebase.
 * ============================================================
 */

window.AGENCY = {

  name:      'EvoConnect',
  shortName: 'EvoConnect',
  appId:     'net.evobrand.evoconnect',
  domain:    'darkslategrey-partridge-695960.hostingersite.com',
  logoPath:  '/images/logo-light.png',
  logoAlt:   'EvoConnect Logo',

  colors: {
    primary:        '#0F172A', // Background base
    primaryDark:    '#0B1220', // Surface theme
    primaryLight:   '#06B6D4', // Cyan primary action
    secondary:      '#1E293B', // Surface slate
    secondaryDark:  '#1E3A4A', // Border
    secondaryLight: '#94A3B8', // Muted text
    theme:          '#0F172A'
  },

  supportEmail:     'support@evoconnect.evobrand.net',
  supportPhone:     '214-531-4427',
  organizationName: 'EVOBRAND Concepts',
  programName:      'Government Contract Workforce Ecosystem',
  copyrightYear:    'auto',
  address: { street: '', city: 'Dallas', state: 'TX', zip: '' },

  storagePrefix: 'wfc',
  programTypes:  ['SAM', 'HUBZone', 'WOSB', 'SDVOSB', '8a'],

  links: {
    agencyHome:        'https://workforceconnect.io',
    contractingPortal: { url: 'https://sam.gov', label: 'SAM.gov Federal Contracts' },
    resources:         'https://workforceconnect.io/resources',
    owner:             'https://evobrand.net'
  },

  districts: []
};

// ── Runtime injection — applies colors, title, logo, copyright ─────────────
(function applyAgencyConfig() {
  const cfg = window.AGENCY;
  if (!cfg) return;

  const styleId = 'agency-color-overrides';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = [
      ':root {',
      `  --color-primary:         ${cfg.colors.primary};`,
      `  --color-primary-dark:    ${cfg.colors.primaryDark};`,
      `  --color-primary-light:   ${cfg.colors.primaryLight};`,
      `  --color-secondary:       ${cfg.colors.secondary};`,
      `  --color-secondary-dark:  ${cfg.colors.secondaryDark};`,
      `  --color-secondary-light: ${cfg.colors.secondaryLight};`,
      '}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  function patchThemeColor() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', cfg.colors.theme);
  }

  function patchTitle() {
    if (document.title && cfg.name) {
      document.title = document.title
        .replace(/CaltransBizConnect/gi, cfg.name)
        .replace(/PrimeReach/gi, cfg.name);
    }
  }

  function patchLogos() {
    document.querySelectorAll('img[src*="logo"]').forEach(img => {
      img.src = cfg.logoPath;
      img.alt = cfg.logoAlt;
    });
  }

  function patchCopyright() {
    const year = cfg.copyrightYear === 'auto' ? new Date().getFullYear() : cfg.copyrightYear;
    document.querySelectorAll('[data-cms-copyright]').forEach(el => {
      el.textContent = `© ${year} ${cfg.organizationName}. All rights reserved.`;
    });
    document.querySelectorAll('.footer-bottom p').forEach(el => {
      if (el.textContent.includes('©') && (
        el.textContent.includes('PrimeReach') ||
        el.textContent.includes('CaltransBizConnect')
      )) {
        el.textContent = `© ${year} ${cfg.organizationName}. All rights reserved.`;
      }
    });
  }

  function patchAppleMeta() {
    const m = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (m) m.setAttribute('content', cfg.shortName);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      patchThemeColor(); patchTitle(); patchLogos(); patchCopyright(); patchAppleMeta();
    });
  } else {
    patchThemeColor(); patchTitle(); patchLogos(); patchCopyright(); patchAppleMeta();
  }
}());
