'use strict';

const path = require('path');
const fs = require('fs');

const CONTENT_DIR = path.join(__dirname, '../../content');
const PAGES_DIR   = path.join(CONTENT_DIR, 'pages');
const GLOBAL_FILE = path.join(CONTENT_DIR, 'global.json');

const SLUG_ALIASES = {
    'home': 'index',
    'business': 'for-small-businesses',
    'prime': 'for-prime-contractors',
};

function resolveSlug(slug) {
    if (!slug) return 'index';
    const s = String(slug).toLowerCase().trim();
    return SLUG_ALIASES[s] || s;
}

function readJsonSafe(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        return null;
    }
}

function getGlobal() {
    return readJsonSafe(GLOBAL_FILE) || {};
}

function getPage(slug) {
    const resolved = resolveSlug(slug);
    const filePath = path.join(PAGES_DIR, `${resolved}.json`);
    let data = readJsonSafe(filePath);
    if (!data && resolved !== slug) {
        data = readJsonSafe(path.join(PAGES_DIR, `${slug}.json`));
    }
    return data;
}

function getFieldValue(pageData, fieldPath) {
    if (!pageData || !fieldPath) return undefined;
    const parts = String(fieldPath).split('.');

    // Handle meta and header top-level namespaces
    if (parts[0] === 'meta' && pageData.meta) {
        let cur = pageData.meta;
        for (let i = 1; i < parts.length; i++) {
            if (cur == null) return undefined;
            cur = cur[parts[i]];
        }
        return cur;
    }
    if (parts[0] === 'header' && pageData.header) {
        let cur = pageData.header;
        for (let i = 1; i < parts.length; i++) {
            if (cur == null) return undefined;
            cur = cur[parts[i]];
        }
        return cur;
    }

    // Handle section fields: "sectionId.fieldKey"
    const sectionId = parts[0];
    const section = (pageData.sections || []).find(s => s.id === sectionId);
    if (!section || !section.fields) return undefined;

    let cur = section.fields;
    for (let i = 1; i < parts.length; i++) {
        if (cur == null) return undefined;
        cur = cur[parts[i]];
    }
    return cur;
}

function cmsMiddleware(req, res, next) {
    const globalData = getGlobal();
    res.locals.cmsGlobal = globalData;

    // Detect front-page slug from request path
    let slug = '';
    const p = req.path;
    if (p === '/') slug = 'index';
    else if (p === '/labor') slug = 'labor';
    else if (p === '/business') slug = 'for-small-businesses';
    else if (p === '/prime') slug = 'for-prime-contractors';
    else if (p === '/contact') slug = 'contact';
    else if (p === '/resources') slug = 'resources';

    const pageData = slug ? getPage(slug) : null;
    res.locals.cmsPageSlug = slug;
    res.locals.cmsPageData = pageData;

    // EJS Helper: safe value lookup with default fallback
    res.locals.cmsVal = function (fieldPath, fallback) {
        const val = getFieldValue(pageData, fieldPath);
        if (val !== undefined && val !== null && val !== '') {
            return val;
        }
        return fallback;
    };

    next();
}

module.exports = {
    getGlobal,
    getPage,
    getFieldValue,
    resolveSlug,
    cmsMiddleware
};
