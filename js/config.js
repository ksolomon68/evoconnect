/**
 * Application Runtime Configuration
 *
 * Agency-specific values (domain, name, colors) live in agency.config.js.
 * This file only derives runtime settings (API base URL, environment) from
 * window.AGENCY so that core code remains agency-agnostic.
 *
 * Load order in HTML:  agency.config.js  →  config.js  →  auth.js  →  …
 */

(function () {
  const agency = window.AGENCY || {};
  const prodDomain = agency.domain || 'example.gov';

  const isProduction =
    window.location.hostname === prodDomain ||
    window.location.hostname === 'www.' + prodDomain ||
    (window.location.protocol === 'https:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1');

  // Always use relative '/api' path when served by the same Node process (works locally,
  // on Hostinger temporary domains, and on custom production domains without CORS/fetch failures).
  const baseApiUrl = '/api';

  window.APP_CONFIG = {
    API_URL:     baseApiUrl,
    ENVIRONMENT: isProduction ? 'production' : 'development',
    VERSION:     '2.0.9',
    FEATURES: {
      USE_MOCK_FALLBACK: false
    }
  };
}());
