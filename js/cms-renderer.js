/**
 * CMS Renderer — WorkForce Connect
 *
 * Fetches page content and global settings from /api/cms and hydrates
 * data-cms-field attributes in the DOM. Must be included after all other
 * page scripts so the DOM is fully parsed.
 *
 * Usage on a page:
 *   1. Add  data-cms-page="slug"  to  <body>
 *   2. Add  data-cms-field="section-id.fieldKey"  to editable elements
 *   3. Include this script last: <script src="js/cms-renderer.js"></script>
 *
 * Field path conventions
 *   "hero.title"             → sections[id=hero].fields.title
 *   "meta.title"             → meta.title
 *   "header.backgroundImage" → header.backgroundImage
 *   "global.site.name"       → global config key path
 *
 * Special data attributes on elements:
 *   data-cms-type="text"     → sets element's textContent (default)
 *   data-cms-type="html"     → sets element's innerHTML
 *   data-cms-type="src"      → sets element's src attribute (img)
 *   data-cms-type="href"     → sets element's href attribute (a)
 *   data-cms-type="alt"      → sets element's alt attribute (img)
 *   data-cms-type="bg"       → sets element's style.backgroundImage
 *   data-cms-type="iframe-src" → sets element's src on iframe
 *
 * @module cms-renderer
 */

(function () {
    'use strict';

    const API = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '/api';

    // ── Main entry ──────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', async function () {
        const slug = document.body.getAttribute('data-cms-page');

        try {
            // Global data always fetched — applies to every page (email, announcement, etc.)
            const globalData = await fetchJson(`${API}/cms/global`);
            if (globalData) hydrateGlobal(globalData);

            // Page-specific hydration only when page is opted into CMS
            if (slug) {
                const urlParams  = new URLSearchParams(window.location.search);
                const isPreview  = urlParams.get('preview') === 'true';
                let pageData;

                if (isPreview) {
                    const previewData = localStorage.getItem('cms_preview_' + slug);
                    if (previewData) {
                        pageData = JSON.parse(previewData);
                        showPreviewBanner();
                    } else {
                        pageData = await fetchJson(`${API}/cms/pages/${slug}`);
                    }
                } else {
                    pageData = await fetchJson(`${API}/cms/pages/${slug}`);
                }

                if (pageData) hydratePage(pageData, globalData);
                if (pageData) hydrateListSections(pageData);
            }

        } catch (err) {
            console.warn('[CMS Renderer] Failed to load CMS content:', err.message);
        }
    });

    function showPreviewBanner() {
        const banner = document.createElement('div');
        banner.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#003D5B;color:#fff;padding:10px 20px;border-radius:30px;box-shadow:0 4px 12px rgba(0,0,0,0.2);z-index:99999;font-size:14px;font-weight:600;display:flex;align-items:center;gap:10px;';
        banner.innerHTML = '<span>👁️ CMS Preview Mode (Unsaved Changes)</span> <button style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:12px;" onclick="this.parentElement.remove()">Dismiss</button>';
        document.body.appendChild(banner);
    }

    // ── Page hydration ───────────────────────────────────────────────────────
    /**
     * Walk every [data-cms-field] element and replace its content.
     * @param {object} pageData
     * @param {object|null} globalData
     */
    function hydratePage(pageData, globalData) {
        // Build a flat lookup: section-id → fields object
        const sectionMap = {};
        if (Array.isArray(pageData.sections)) {
            pageData.sections.forEach(s => {
                sectionMap[s.id] = s.fields || {};
            });
        }

        document.querySelectorAll('[data-cms-field]').forEach(el => {
            const fieldPath = el.getAttribute('data-cms-field');
            const cmsType   = el.getAttribute('data-cms-type') || 'text';

            // Resolve the value from fieldPath
            let value = resolvePath(fieldPath, pageData, sectionMap, globalData);
            if (value === null || value === undefined || value === '') return;

            applyValue(el, cmsType, value);
        });

        // Update <title> and <meta name="description">
        if (pageData.meta) {
            if (pageData.meta.title) document.title = pageData.meta.title;
            const metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc && pageData.meta.description) {
                metaDesc.setAttribute('content', pageData.meta.description);
            }
        }

        // Header background image
        if (pageData.header && pageData.header.backgroundImage) {
            const heroEl = document.querySelector('.hero, .hero-inner');
            if (heroEl) {
                heroEl.style.backgroundImage = `url('${pageData.header.backgroundImage}')`;
                heroEl.style.backgroundSize  = 'cover';
                heroEl.style.backgroundPosition = 'center';
            }
        }

        // Logo swap (if page-specific logo set)
        if (pageData.header && pageData.header.logoImage) {
            const logoImg = document.querySelector('.site-logo img');
            if (logoImg) {
                logoImg.src = pageData.header.logoImage;
                if (pageData.header.logoAlt) logoImg.alt = pageData.header.logoAlt;
            }
        }
    }

    // ── Global hydration (footer, nav, external links) ───────────────────────
    /**
     * Hydrate footer columns and nav items from global.json.
     * Elements should carry data-cms-global="path.to.key".
     * @param {object} globalData
     */
    function hydrateGlobal(globalData) {
        document.querySelectorAll('[data-cms-global]').forEach(el => {
            const path    = el.getAttribute('data-cms-global');
            const cmsType = el.getAttribute('data-cms-type') || 'text';
            const value   = getNestedValue(globalData, path.split('.'));
            if (value !== null && value !== undefined && value !== '') {
                applyValue(el, cmsType, value);
            }
        });

        // Auto-update footer external links from global.externalPortals
        if (globalData.externalPortals) {
            document.querySelectorAll('[data-cms-portal]').forEach(el => {
                const key = el.getAttribute('data-cms-portal');
                const url = globalData.externalPortals[key];
                if (url && el.tagName === 'A') el.href = url;
            });
        }

        // Auto-update Smartsheet form links
        if (globalData.smartsheetForms) {
            document.querySelectorAll('[data-cms-smartsheet]').forEach(el => {
                const key = el.getAttribute('data-cms-smartsheet');
                const url = globalData.smartsheetForms[key];
                if (url && el.tagName === 'A') el.href = url;
            });
        }

        // Announcement banner
        var ann = globalData.announcement;
        var annEl = document.getElementById('site-announcement');
        if (ann && annEl) {
            var version   = ann.version || 'v1';
            var dismissed = localStorage.getItem('caltrans-announcement-dismissed');
            if (ann.enabled && dismissed !== version) {
                annEl.style.display = 'block';
            } else {
                annEl.style.display = 'none';
            }
            var dismissBtn = document.getElementById('dismiss-announcement');
            if (dismissBtn) {
                // Remove any prior listener by cloning
                var newBtn = dismissBtn.cloneNode(true);
                dismissBtn.parentNode.replaceChild(newBtn, dismissBtn);
                newBtn.addEventListener('click', function () {
                    localStorage.setItem('caltrans-announcement-dismissed', version);
                    annEl.style.display = 'none';
                });
            }
        }

        // Contact email — targets all elements marked data-cms-contact-email
        if (globalData.site && globalData.site.contactEmail) {
            document.querySelectorAll('[data-cms-contact-email]').forEach(el => {
                el.href        = `mailto:${globalData.site.contactEmail}`;
                if (el.textContent.includes('@')) el.textContent = globalData.site.contactEmail;
            });
        }

        // Copyright
        if (globalData.site && globalData.site.copyrightText) {
            document.querySelectorAll('[data-cms-copyright]').forEach(el => {
                el.textContent = globalData.site.copyrightText;
            });
        }

        // Navigation active state sync
        if (globalData.navigation && Array.isArray(globalData.navigation.items)) {
            syncNavActiveState(globalData.navigation.items);
        }
    }

    // ── Path resolution ──────────────────────────────────────────────────────
    /**
     * Resolve a dotted field path like "hero.title" or "meta.description".
     * @param {string}      fieldPath
     * @param {object}      pageData
     * @param {object}      sectionMap   id → fields
     * @param {object|null} globalData
     * @returns {*}
     */
    function resolvePath(fieldPath, pageData, sectionMap, globalData) {
        const parts = fieldPath.split('.');

        // meta.xxx
        if (parts[0] === 'meta' && pageData.meta) {
            return getNestedValue(pageData.meta, parts.slice(1));
        }

        // header.xxx
        if (parts[0] === 'header' && pageData.header) {
            return getNestedValue(pageData.header, parts.slice(1));
        }

        // global.xxx
        if (parts[0] === 'global' && globalData) {
            return getNestedValue(globalData, parts.slice(1));
        }

        // section-id.field or section-id.subfield.deeper
        const [sectionId, ...fieldParts] = parts;
        const fields = sectionMap[sectionId];
        if (!fields) return null;
        return getNestedValue(fields, fieldParts);
    }

    /**
     * Walk a nested object by an array of keys.
     * @param {object}   obj
     * @param {string[]} keys
     * @returns {*}
     */
    function getNestedValue(obj, keys) {
        let cur = obj;
        for (const k of keys) {
            if (cur == null || typeof cur !== 'object') return null;
            cur = cur[k];
        }
        return cur ?? null;
    }

    // ── DOM application ──────────────────────────────────────────────────────
    /**
     * Apply a CMS value to a DOM element based on its cmsType.
     * @param {Element} el
     * @param {string}  cmsType
     * @param {*}       value
     */
    function applyValue(el, cmsType, value) {
        if (typeof value !== 'string' && typeof value !== 'number') return;
        const str = String(value);

        switch (cmsType) {
            case 'html':      el.innerHTML = str; break;
            case 'src':       el.src       = str; break;
            case 'href':      el.href      = str; break;
            case 'alt':       el.alt       = str; break;
            case 'bg':
                el.style.backgroundImage    = `url('${str}')`;
                el.style.backgroundSize     = 'cover';
                el.style.backgroundPosition = 'center';
                break;
            case 'iframe-src': el.src = str; break;
            case 'text':
            default:          el.textContent = str; break;
        }
    }

    // ── Nav active state ─────────────────────────────────────────────────────
    /**
     * Mark the nav link matching the current page as active.
     * Hides nav items whose active flag is false in global config.
     * @param {Array<{href:string, label:string, active:boolean}>} items
     */
    function syncNavActiveState(items) {
        const currentFile = window.location.pathname.split('/').pop() || 'index.html';

        items.forEach(item => {
            const navLink = document.querySelector(`.main-nav a[href="${item.href}"]`);
            if (!navLink) return;

            // Show/hide based on active flag
            const li = navLink.closest('li');
            if (li) li.style.display = item.active ? '' : 'none';

            // Set aria-current on matching page
            const linkFile = item.href.split('/').pop();
            if (linkFile === currentFile) {
                navLink.setAttribute('aria-current', 'page');
                navLink.classList.add('active');
            }

            // Sync label text
            if (item.label) navLink.textContent = item.label;
            // Restore login button style if needed
            if (item.href === 'login.html') {
                navLink.className = 'btn btn-secondary btn-small';
            }
        });
    }

    // ── Dynamic list-section rendering ───────────────────────────────────────
    /**
     * Find every [data-cms-list] container on the page and replace its
     * children with items from CMS data. This enables admin-added cards,
     * tiles, and CTA columns to appear on the live site.
     *
     * Attribute contract on the container element:
     *   data-cms-list="sectionId.fieldKey"   e.g. "value-tiles.tiles"
     *   data-cms-list-type="tile|cta-column|card|step"
     *
     * @param {object} pageData
     */
    function hydrateListSections(pageData) {
        var sectionMap = {};
        if (Array.isArray(pageData.sections)) {
            pageData.sections.forEach(function (s) { sectionMap[s.id] = s.fields || {}; });
        }

        document.querySelectorAll('[data-cms-list]').forEach(function (container) {
            var fieldPath = container.getAttribute('data-cms-list');   // e.g. "value-tiles.tiles"
            var listType  = container.getAttribute('data-cms-list-type') || '';
            var dotIdx    = fieldPath.indexOf('.');
            if (dotIdx === -1) return;
            var sectionId  = fieldPath.slice(0, dotIdx);
            var fieldParts = fieldPath.slice(dotIdx + 1).split('.');
            var fields     = sectionMap[sectionId];
            if (!fields) return;
            var items = getNestedValue(fields, fieldParts);
            if (!Array.isArray(items) || items.length === 0) return;

            container.innerHTML = items.map(function (item, i) {
                return renderDynamicItem(item, listType, i);
            }).join('');
        });
    }

    function renderDynamicItem(item, listType, index) {
        if (!item || typeof item !== 'object') return '';
        switch (listType) {
            case 'tile':       return renderTileItem(item, index);
            case 'cta-column': return renderCtaColumnItem(item);
            case 'card':       return renderCardItem(item);
            case 'video-card': return renderVideoCardItem(item);
            default:           return '';
        }
    }

    function renderTileItem(tile, index) {
        var href     = safeAttr(tile.href || '#');
        var title    = safeText(tile.title || '');
        var desc     = String(tile.description || ''); // Allow HTML
        var linkText = safeText(tile.linkText || 'Learn More');
        var delay    = (index * 100) + 'ms';
        return '<a href="' + href + '" class="action-tile reveal-slide-up" data-delay="' + delay + '">' +
               '<h3 class="action-tile-title">' + title + '</h3>' +
               '<p class="action-tile-description">' + desc + '</p>' +
               '<span class="action-tile-link">' + linkText +
               ' <span aria-hidden="true">→</span></span>' +
               '</a>';
    }

    function renderCtaColumnItem(col) {
        var href    = safeAttr(col.buttonHref || '#');
        var label   = safeText(col.buttonLabel || 'Learn More');
        var heading = col.heading
            ? '<h3 class="mb-xs" style="color:white;font-size:var(--font-size-md);">' + safeText(col.heading) + '</h3>'
            : '';
        var text = col.text
            ? '<p class="mb-sm" style="opacity:0.9;font-size:0.9rem;">' + String(col.text) + '</p>'
            : '';
        return '<div>' + heading + text +
               '<a href="' + href + '" class="btn btn-secondary">' + label + '</a></div>';
    }

    function renderCardItem(card) {
        var title   = safeText(card.title || '');
        var body    = String(card.body  || ''); // Allow HTML
        var imgHtml = card.image
            ? '<img src="' + safeAttr(card.image) + '" alt="' + safeAttr(card.imageAlt || '') +
              '" class="card-image" loading="lazy" style="width:100%;border-radius:4px;margin-bottom:.75rem">'
            : '';
        var btnHtml = (card.buttonLabel && card.buttonHref)
            ? '<a href="' + safeAttr(card.buttonHref) + '" class="btn btn-outline btn-small"' +
              (card.external ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' +
              safeText(card.buttonLabel) + '</a>'
            : '';
        return '<div class="feature-card" style="background:#fff;padding:1.5rem;border-radius:8px;' +
               'box-shadow:0 2px 8px rgba(0,0,0,.08)">' +
               imgHtml +
               '<h3 style="font-size:1.05rem;margin-bottom:.5rem;color:var(--color-primary)">' + title + '</h3>' +
               '<p style="color:var(--color-text-secondary);font-size:.9rem;margin-bottom:.75rem">' + body + '</p>' +
               btnHtml + '</div>';
    }

    function renderVideoCardItem(video) {
        var title = safeText(video.title || '');
        var src = safeAttr(video.src || '');
        
        // Ensure YouTube URLs are embeddable format
        if (src.includes('youtu.be/')) {
            var id = src.split('youtu.be/')[1].split('?')[0];
            src = 'https://www.youtube.com/embed/' + id;
        } else if (src.includes('youtube.com/watch')) {
            var urlParams = new URL(src).searchParams;
            var id = urlParams.get('v');
            if (id) src = 'https://www.youtube.com/embed/' + id;
        }

        return '<div class="video-card" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);display:flex;flex-direction:column;">' +
               '<div class="video-wrapper" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;">' +
               '<iframe src="' + src + '" title="' + title + '" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;"></iframe>' +
               '</div>' +
               '<div style="padding:1rem;">' +
               '<h3 style="font-size:1.05rem;margin:0;color:var(--color-primary)">' + title + '</h3>' +
               '</div></div>';
    }

    // Safe-escaping helpers for renderer-generated HTML
    function safeText(str) {
        var d = document.createElement('div');
        d.textContent = String(str || '');
        return d.innerHTML;
    }

    function safeAttr(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // ── Fetch helper ─────────────────────────────────────────────────────────
    /**
     * @param {string} url
     * @returns {Promise<object|null>}
     */
    async function fetchJson(url) {
        const res = await fetch(url);
        if (!res.ok) return null;
        return res.json();
    }

}());
