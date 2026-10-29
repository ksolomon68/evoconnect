/**
 * CMS Renderer — EVOConnect
 *
 * Fetches page content and global settings from /api/cms and hydrates
 * data-cms-field and data-cms-global attributes in the DOM.
 *
 * Special data attributes on elements:
 *   data-cms-field="section-id.fieldKey"
 *   data-cms-global="site.name" (or path in global.json)
 *   data-cms-type="text"     → sets element's textContent (default)
 *   data-cms-type="html"     → sets element's innerHTML
 *   data-cms-type="eyebrow"  → updates the text label inside an eyebrow wrapper
 *   data-cms-type="src"      → sets element's src attribute (img)
 *   data-cms-type="href"     → sets element's href attribute (a)
 *   data-cms-type="alt"      → sets element's alt attribute (img)
 *   data-cms-type="bg"       → sets element's style.backgroundImage
 *
 * @module cms-renderer
 */

(function () {
    'use strict';

    const API = (window.APP_CONFIG && window.APP_CONFIG.API_URL) || '/api';

    function detectSlug() {
        let slug = document.body.getAttribute('data-cms-page');
        if (slug) return slug;

        const path = window.location.pathname.replace(/\/$/, '') || '/';
        if (path === '/' || path === '/index.html') return 'index';
        if (path === '/labor' || path.startsWith('/labor/')) return 'labor';
        if (path === '/business' || path.startsWith('/business/')) return 'for-small-businesses';
        if (path === '/prime' || path.startsWith('/prime/')) return 'for-prime-contractors';
        if (path === '/contact') return 'contact';
        if (path === '/resources') return 'resources';
        if (path.startsWith('/pages/')) return path.replace('/pages/', '');
        return '';
    }

    // ── Main entry ──────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', async function () {
        const slug = detectSlug();
        const urlParams = new URLSearchParams(window.location.search);
        const isPreview = urlParams.get('preview') === 'true';

        try {
            // Global data always fetched — applies to every page
            const globalData = await fetchJson(`${API}/cms/global`);
            if (globalData) hydrateGlobal(globalData);

            // Page-specific hydration
            if (slug) {
                let pageData = null;

                if (isPreview) {
                    const previewKey = 'cms_preview_' + slug;
                    const previewData = localStorage.getItem(previewKey);
                    if (previewData) {
                        try {
                            pageData = JSON.parse(previewData);
                            showPreviewBanner(slug);
                        } catch (e) {
                            console.error('[CMS Renderer] Bad preview data', e);
                        }
                    }
                }

                if (!pageData) {
                    pageData = await fetchJson(`${API}/cms/pages/${slug}`);
                }

                if (pageData) {
                    hydratePage(pageData, globalData);
                    hydrateListSections(pageData);
                }
            }

        } catch (err) {
            console.warn('[CMS Renderer] Failed to load CMS content:', err.message);
        }
    });

    function showPreviewBanner(slug) {
        const existing = document.getElementById('evo-cms-preview-banner');
        if (existing) existing.remove();

        const banner = document.createElement('div');
        banner.id = 'evo-cms-preview-banner';
        banner.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0F172A;border:1px solid #06B6D4;color:#F8FAFC;padding:10px 22px;border-radius:30px;box-shadow:0 8px 30px rgba(0,0,0,0.45);z-index:999999;font-size:13.5px;font-weight:600;display:flex;align-items:center;gap:12px;font-family:var(--font-family-sans, sans-serif);';
        banner.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#06B6D4;box-shadow:0 0 8px #06B6D4;"></span>
            <span>CMS Live Preview (${slug})</span>
            <a href="/admin-cms" style="color:#06B6D4;text-decoration:none;margin-left:4px;border-bottom:1px dotted #06B6D4;">← Return to CMS</a>
            <button style="background:rgba(255,255,255,0.12);border:none;color:#fff;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:12px;margin-left:6px;" onclick="this.parentElement.remove()">Dismiss</button>`;
        document.body.appendChild(banner);
    }

    // ── Page hydration ───────────────────────────────────────────────────────
    function hydratePage(pageData, globalData) {
        const sectionMap = {};
        if (Array.isArray(pageData.sections)) {
            pageData.sections.forEach(s => {
                sectionMap[s.id] = s.fields || {};
            });
        }

        document.querySelectorAll('[data-cms-field]').forEach(el => {
            const fieldPath = el.getAttribute('data-cms-field');
            const cmsType   = el.getAttribute('data-cms-type') || 'text';

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
            const heroEl = document.querySelector('.wfc-hero, .hero, .hero-inner');
            if (heroEl) {
                heroEl.style.backgroundImage = `url('${pageData.header.backgroundImage}')`;
                heroEl.style.backgroundSize  = 'cover';
                heroEl.style.backgroundPosition = 'center';
            }
        }
    }

    // ── Global hydration (footer, nav, announcements) ───────────────────────
    function hydrateGlobal(globalData) {
        document.querySelectorAll('[data-cms-global]').forEach(el => {
            const path    = el.getAttribute('data-cms-global');
            const cmsType = el.getAttribute('data-cms-type') || 'text';
            const value   = getNestedValue(globalData, path.split('.'));
            if (value !== null && value !== undefined && value !== '') {
                applyValue(el, cmsType, value);
            }
        });

        // Contact email
        if (globalData.site && globalData.site.contactEmail) {
            document.querySelectorAll('[data-cms-contact-email]').forEach(el => {
                el.href = `mailto:${globalData.site.contactEmail}`;
                if (el.textContent.includes('@')) el.textContent = globalData.site.contactEmail;
            });
        }

        // Contact phone
        if (globalData.site && globalData.site.contactPhone) {
            document.querySelectorAll('[data-cms-contact-phone]').forEach(el => {
                el.href = `tel:${globalData.site.contactPhone.replace(/[^0-9]/g, '')}`;
                el.textContent = globalData.site.contactPhone;
            });
        }

        // Copyright
        if (globalData.site && globalData.site.copyrightText) {
            document.querySelectorAll('[data-cms-copyright]').forEach(el => {
                el.textContent = globalData.site.copyrightText;
            });
        }
    }

    // ── Path resolution ──────────────────────────────────────────────────────
    function resolvePath(fieldPath, pageData, sectionMap, globalData) {
        const parts = fieldPath.split('.');

        if (parts[0] === 'meta' && pageData.meta) {
            return getNestedValue(pageData.meta, parts.slice(1));
        }

        if (parts[0] === 'header' && pageData.header) {
            return getNestedValue(pageData.header, parts.slice(1));
        }

        if (parts[0] === 'global' && globalData) {
            return getNestedValue(globalData, parts.slice(1));
        }

        const [sectionId, ...fieldParts] = parts;
        const fields = sectionMap[sectionId];
        if (!fields) return null;
        return getNestedValue(fields, fieldParts);
    }

    function getNestedValue(obj, keys) {
        let cur = obj;
        for (const k of keys) {
            if (cur == null || typeof cur !== 'object') return null;
            cur = cur[k];
        }
        return cur ?? null;
    }

    // ── DOM application ──────────────────────────────────────────────────────
    function applyValue(el, cmsType, value) {
        if (typeof value !== 'string' && typeof value !== 'number') return;
        const str = String(value);

        switch (cmsType) {
            case 'html':
                el.innerHTML = str;
                break;
            case 'eyebrow': {
                const textSpan = el.querySelector('span:not(.eyebrow-dot)') || el;
                textSpan.textContent = str;
                break;
            }
            case 'src':
                el.src = str;
                break;
            case 'href':
                el.href = str;
                break;
            case 'alt':
                el.alt = str;
                break;
            case 'bg':
                el.style.backgroundImage = `url('${str}')`;
                el.style.backgroundSize  = 'cover';
                el.style.backgroundPosition = 'center';
                break;
            case 'iframe-src':
                el.src = str;
                break;
            case 'text':
            default:
                el.textContent = str;
                break;
        }
    }

    // ── Dynamic list-section rendering ───────────────────────────────────────
    function hydrateListSections(pageData) {
        const sectionMap = {};
        if (Array.isArray(pageData.sections)) {
            pageData.sections.forEach(function (s) { sectionMap[s.id] = s.fields || {}; });
        }

        document.querySelectorAll('[data-cms-list]').forEach(function (container) {
            const fieldPath = container.getAttribute('data-cms-list');
            const listType  = container.getAttribute('data-cms-list-type') || '';
            const dotIdx    = fieldPath.indexOf('.');
            if (dotIdx === -1) return;
            const sectionId  = fieldPath.slice(0, dotIdx);
            const fieldParts = fieldPath.slice(dotIdx + 1).split('.');
            const fields     = sectionMap[sectionId];
            if (!fields) return;
            const items = getNestedValue(fields, fieldParts);
            if (!Array.isArray(items) || items.length === 0) return;

            // Only override if container has explicit data-cms-dynamic-render="1"
            if (container.getAttribute('data-cms-dynamic-render') === '1') {
                container.innerHTML = items.map(function (item, i) {
                    return renderDynamicItem(item, listType, i);
                }).join('');
            }
        });
    }

    function renderDynamicItem(item, listType, index) {
        if (!item || typeof item !== 'object') return '';
        const title = safeText(item.title || item.label || item.heading || '');
        const body  = String(item.body || item.detail || item.description || '');
        const href  = safeAttr(item.buttonHref || item.href || '#');
        const btnLbl= safeText(item.buttonLabel || item.linkText || 'Learn More');

        return `<div class="spotlight-card" style="padding:1.5rem;background:#1E293B;border-radius:12px;margin-bottom:1rem;">
            <h3 style="color:#F8FAFC;margin:0 0 0.5rem;">${title}</h3>
            <p style="color:#94A3B8;font-size:0.92rem;margin:0 0 1rem;">${body}</p>
            ${href !== '#' ? `<a href="${href}" class="btn-primary" style="display:inline-block;padding:0.5rem 1.2rem;font-size:0.85rem;">${btnLbl}</a>` : ''}
        </div>`;
    }

    function safeText(str) {
        const d = document.createElement('div');
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

    async function fetchJson(url) {
        try {
            const res = await fetch(url);
            if (!res.ok) return null;
            return await res.json();
        } catch {
            return null;
        }
    }

}());
