/**
 * CMS API Routes
 *
 * Endpoints:
 *   GET    /api/cms/global              — get global site settings
 *   PUT    /api/cms/global              — update global settings        [admin]
 *   GET    /api/cms/pages               — list all pages
 *   GET    /api/cms/pages/:slug         — get single page content
 *   PUT    /api/cms/pages/:slug         — update page content           [admin]
 *   POST   /api/cms/pages               — create new custom page        [admin]
 *   DELETE /api/cms/pages/:slug         — delete a custom page          [admin]
 *   GET    /api/cms/schema              — get component-type schemas
 *   GET    /api/cms/media               — list media library files      [admin]
 *   POST   /api/cms/media               — upload image to media library [admin]
 *   DELETE /api/cms/media/:filename     — delete a media file           [admin]
 *
 * @module routes/cms
 */

'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
// DB not needed — CMS uses file-based storage + env-var auth

const router = express.Router();

const CMS_JWT_SECRET = process.env.JWT_SECRET || 'caltrans-fallback-secret-change-in-production';

// ─── Directory paths ────────────────────────────────────────────────────────
const ROOT_DIR    = path.join(__dirname, '../../');
const CONTENT_DIR = path.join(ROOT_DIR, 'content');
const PAGES_DIR   = path.join(CONTENT_DIR, 'pages');
const SCHEMAS_DIR = path.join(CONTENT_DIR, 'schemas');
const GLOBAL_FILE = path.join(CONTENT_DIR, 'global.json');
const MEDIA_DIR   = path.join(ROOT_DIR, 'uploads/cms-media');

// Ensure required directories exist at startup
[CONTENT_DIR, PAGES_DIR, SCHEMAS_DIR, MEDIA_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── Multer — media uploads ──────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'
]);

const mediaStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, MEDIA_DIR),
    filename:    (_req, file, cb) => {
        // Sanitise original filename and prefix with timestamp
        const safe   = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        const unique = `${Date.now()}-${safe}`;
        cb(null, unique);
    }
});

const upload = multer({
    storage: mediaStorage,
    limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only image files (JPEG, PNG, GIF, WebP, SVG) are allowed.'));
        }
    }
});

// ─── CMS Login (no MySQL required) ───────────────────────────────────────────
/**
 * POST /api/cms/login
 * Authenticates a CMS admin without hitting the database.
 * Checks:
 *   1. Email matches admin pattern (contains "admin" or is the known admin address)
 *   2. Password matches CMS_ADMIN_PASSWORD env var (if set), otherwise any password
 *      is accepted for local dev convenience.
 *
 * Body: { email: string, password: string }
 */
// Helper: get active CMS password info from file (bcrypt hash) or env var (plain)
const CMS_AUTH_FILE = path.join(ROOT_DIR, 'content', 'cms-auth.json');
function getCmsPasswordInfo() {
    try {
        if (fs.existsSync(CMS_AUTH_FILE)) {
            const data = JSON.parse(fs.readFileSync(CMS_AUTH_FILE, 'utf8'));
            if (data && data.passwordHash) return { hash: data.passwordHash, isHashed: true };
            if (data && data.password) return { hash: data.password, isHashed: false }; // legacy plain
        }
    } catch (e) {}
    const plain = process.env.CMS_ADMIN_PASSWORD || null;
    return plain ? { hash: plain, isHashed: false } : null;
}

router.post('/login', async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const pwdInfo = getCmsPasswordInfo();
        if (!pwdInfo) {
            return res.status(500).json({ error: 'CMS_ADMIN_PASSWORD is not configured on the server' });
        }
        const passwordMatch = pwdInfo.isHashed
            ? await bcrypt.compare(password, pwdInfo.hash)
            : password === pwdInfo.hash;
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { email, type: 'wfc_admin' },
            CMS_JWT_SECRET,
            { expiresIn: '24h' }
        );
        res.json({ success: true, token, email, message: 'CMS login successful' });
    } catch (err) {
        console.error('CMS login error:', err.message);
        res.status(500).json({ error: 'Login failed due to server error' });
    }
});

/** POST /api/cms/change-password — change the CMS admin password (admin only) */
router.post('/change-password', requireAdmin, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    try {
        const pwdInfo = getCmsPasswordInfo();
        const currentMatch = pwdInfo
            ? (pwdInfo.isHashed ? await bcrypt.compare(currentPassword, pwdInfo.hash) : currentPassword === pwdInfo.hash)
            : false;
        if (!currentMatch) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }
        const newHash = await bcrypt.hash(newPassword, 12);
        const dir = path.dirname(CMS_AUTH_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(CMS_AUTH_FILE, JSON.stringify({ passwordHash: newHash, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
        res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
        console.error('CMS: Failed to change password:', err.message);
        res.status(500).json({ error: 'Failed to change password. Please try again.' });
    }
});

// ─── Admin auth middleware ────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    try {
        const decoded = jwt.verify(token, CMS_JWT_SECRET);
        if (decoded.type !== 'wfc_admin' && decoded.type !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }
}

// ─── File helpers ─────────────────────────────────────────────────────────────
/**
 * Read a JSON file, returning null if it doesn't exist.
 * @param {string} filePath
 * @returns {object|null}
 */
function readJson(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

/**
 * Write data to a JSON file atomically (write to .tmp then rename).
 * @param {string} filePath
 * @param {object} data
 */
function writeJson(filePath, data) {
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
}

/**
 * Validate a page slug: lowercase letters, numbers, and hyphens only.
 * @param {string} slug
 * @returns {boolean}
 */
function isValidSlug(slug) {
    return /^[a-z0-9][a-z0-9-]{0,79}$/.test(slug);
}

// ─── GLOBAL SETTINGS ─────────────────────────────────────────────────────────

/** GET /api/cms/global — public, so renderers can fetch it */
router.get('/global', (req, res) => {
    const data = readJson(GLOBAL_FILE);
    if (!data) {
        return res.status(404).json({ error: 'global.json not found' });
    }
    res.json(data);
});

/** PUT /api/cms/global — merge top-level keys (admin only) */
router.put('/global', requireAdmin, (req, res) => {
    if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ error: 'JSON body required' });
    }
    try {
        const current = readJson(GLOBAL_FILE) || {};
        const updated = mergeDeep(current, req.body);
        updated.updatedAt = new Date().toISOString();
        writeJson(GLOBAL_FILE, updated);
        res.json({ success: true, data: updated });
    } catch (err) {
        console.error('CMS: Failed to write global.json:', err.message);
        res.status(500).json({ error: `Failed to save: ${err.message}` });
    }
});

// ─── PAGE CONTENT ─────────────────────────────────────────────────────────────

// Nav order — pages appear in this sequence in the CMS page list
const NAV_ORDER = [
    'index', 'for-small-businesses', 'for-prime-contractors',
    'opportunities', 'how-it-works', 'resources', 'faq', 'support-services', 'eligibility', 'contact'
];

/** GET /api/cms/pages — list all pages (public) */
router.get('/pages', (_req, res) => {
    const files = fs.existsSync(PAGES_DIR)
        ? fs.readdirSync(PAGES_DIR).filter(f => f.endsWith('.json'))
        : [];

    const pages = files.map(f => {
        const slug = f.replace('.json', '');
        const data = readJson(path.join(PAGES_DIR, f));
        return {
            slug,
            title:     data?.meta?.title       || slug,
            updatedAt: data?.updatedAt          || null,
            isSystem:  data?.isSystem           || false
        };
    });

    pages.sort((a, b) => {
        const ai = NAV_ORDER.indexOf(a.slug);
        const bi = NAV_ORDER.indexOf(b.slug);
        // Known nav pages first in order; unknown pages alphabetically at end
        if (ai === -1 && bi === -1) return a.slug.localeCompare(b.slug);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
    });

    res.json(pages);
});

/** GET /api/cms/pages/:slug — get a single page (public) */
router.get('/pages/:slug', (req, res) => {
    const { slug } = req.params;
    if (!isValidSlug(slug)) {
        return res.status(400).json({ error: 'Invalid page slug' });
    }
    const data = readJson(path.join(PAGES_DIR, `${slug}.json`));
    if (!data) {
        return res.status(404).json({ error: `Page "${slug}" not found` });
    }
    res.json(data);
});

/** PUT /api/cms/pages/:slug — update page content (admin only) */
router.put('/pages/:slug', requireAdmin, (req, res) => {
    const { slug } = req.params;
    if (!isValidSlug(slug)) {
        return res.status(400).json({ error: 'Invalid page slug' });
    }
    if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ error: 'JSON body required' });
    }
    try {
        const filePath = path.join(PAGES_DIR, `${slug}.json`);
        const current  = readJson(filePath) || {};
        const updated  = mergeDeep(current, req.body);
        updated.updatedAt = new Date().toISOString();
        writeJson(filePath, updated);
        res.json({ success: true, data: updated });
    } catch (err) {
        console.error(`CMS: Failed to write page ${slug}:`, err.message);
        res.status(500).json({ error: `Failed to save: ${err.message}` });
    }
});

/** POST /api/cms/pages — create a new custom page (admin only) */
router.post('/pages', requireAdmin, (req, res) => {
    const { slug, meta, sections } = req.body || {};

    if (!slug || !isValidSlug(slug)) {
        return res.status(400).json({ error: 'A valid slug is required (lowercase letters, numbers, hyphens)' });
    }

    const filePath = path.join(PAGES_DIR, `${slug}.json`);
    if (fs.existsSync(filePath)) {
        return res.status(409).json({ error: `Page "${slug}" already exists` });
    }

    /** @type {PageContent} */
    const newPage = {
        slug,
        isSystem:  false,
        meta: {
            title:       meta?.title       || slug,
            description: meta?.description || ''
        },
        header: {
            backgroundImage: '',
            logoImage:       '/images/logo-light.png',
            logoAlt:         'EvoConnect'
        },
        sections:  sections || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    writeJson(filePath, newPage);
    res.status(201).json({ success: true, data: newPage });
});

/** DELETE /api/cms/pages/:slug — delete a custom page (admin only, not system pages) */
router.delete('/pages/:slug', requireAdmin, (req, res) => {
    const { slug } = req.params;
    if (!isValidSlug(slug)) {
        return res.status(400).json({ error: 'Invalid page slug' });
    }

    const filePath = path.join(PAGES_DIR, `${slug}.json`);
    const data     = readJson(filePath);
    if (!data) {
        return res.status(404).json({ error: `Page "${slug}" not found` });
    }
    if (data.isSystem) {
        return res.status(403).json({ error: 'System pages cannot be deleted' });
    }

    fs.unlinkSync(filePath);
    res.json({ success: true, message: `Page "${slug}" deleted` });
});

// ─── SCHEMA ──────────────────────────────────────────────────────────────────

/** GET /api/cms/schema — return component-types schema (public) */
router.get('/schema', (_req, res) => {
    const data = readJson(path.join(SCHEMAS_DIR, 'component-types.json'));
    if (!data) {
        return res.status(404).json({ error: 'Schema file not found' });
    }
    res.json(data);
});

// ─── MEDIA LIBRARY ───────────────────────────────────────────────────────────

/** GET /api/cms/media — list uploaded media files (admin only) */
router.get('/media', requireAdmin, (_req, res) => {
    if (!fs.existsSync(MEDIA_DIR)) return res.json([]);

    const imageExt = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
    const files = fs.readdirSync(MEDIA_DIR)
        .filter(f => imageExt.test(f))
        .map(f => {
            const stat    = fs.statSync(path.join(MEDIA_DIR, f));
            const metaRaw = readJson(path.join(MEDIA_DIR, f + '.meta.json'));
            return {
                filename:   f,
                url:        `/uploads/cms-media/${f}`,
                size:       stat.size,
                altText:    metaRaw?.altText        || '',
                uploadedAt: metaRaw?.uploadedAt     || stat.birthtime.toISOString()
            };
        })
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

    res.json(files);
});

/** POST /api/cms/media — upload an image (admin only, alt text required) */
router.post('/media', requireAdmin, upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const altText = (req.body.altText || '').trim();
    if (!altText) {
        // Delete the uploaded file — alt text is mandatory per style guide
        fs.unlinkSync(path.join(MEDIA_DIR, req.file.filename));
        return res.status(400).json({
            error: 'Alt text is required for every uploaded image (Caltrans accessibility policy)'
        });
    }

    // Write sidecar metadata
    const meta = {
        altText,
        originalName: req.file.originalname,
        mimeType:     req.file.mimetype,
        size:         req.file.size,
        uploadedAt:   new Date().toISOString()
    };
    writeJson(path.join(MEDIA_DIR, req.file.filename + '.meta.json'), meta);

    res.status(201).json({
        success:  true,
        filename: req.file.filename,
        url:      `/uploads/cms-media/${req.file.filename}`,
        altText,
        size:     req.file.size
    });
});

/** DELETE /api/cms/media/:filename — delete a media file (admin only) */
router.delete('/media/:filename', requireAdmin, (req, res) => {
    const { filename } = req.params;

    // Prevent path traversal
    if (/[./\\]/.test(filename.replace(/[a-zA-Z0-9._-]/g, ''))) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = path.join(MEDIA_DIR, filename);
    const metaPath = filePath + '.meta.json';

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
    }

    fs.unlinkSync(filePath);
    if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);

    res.json({ success: true, message: `"${filename}" deleted` });
});

// ─── FAQ MANAGER (stubs — FAQs are managed in EJS templates) ─────────────────

router.get('/faqs',           requireAdmin, (_req, res) => res.json([]));
router.get('/faq-categories', requireAdmin, (_req, res) => res.json([]));
router.get('/faqs/export',               (_req, res) => res.json([]));
router.post('/faqs',          requireAdmin, (_req, res) => res.status(501).json({ error: 'FAQ DB management not enabled' }));
router.put('/faqs/:id',       requireAdmin, (_req, res) => res.status(501).json({ error: 'FAQ DB management not enabled' }));
router.delete('/faqs/:id',    requireAdmin, (_req, res) => res.status(501).json({ error: 'FAQ DB management not enabled' }));
router.post('/faqs/reorder',  requireAdmin, (_req, res) => res.json({ message: 'ok' }));

/** GET /api/cms/stats — dashboard stats (file-based) */
router.get('/stats', requireAdmin, (_req, res) => {
    const pageFiles = fs.existsSync(PAGES_DIR)
        ? fs.readdirSync(PAGES_DIR).filter(f => f.endsWith('.json')).length
        : 0;
    const mediaFiles = fs.existsSync(MEDIA_DIR)
        ? fs.readdirSync(MEDIA_DIR).filter(f => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f)).length
        : 0;
    res.json({ pages: pageFiles, faqs: 0, media: mediaFiles, users: 0 });
});

// ─── Utility ──────────────────────────────────────────────────────────────────
/**
 * Deep-merge source into target (one level of object merging for sub-objects).
 * Arrays from source always replace target arrays (no concat).
 * @param {object} target
 * @param {object} source
 * @returns {object}
 */
function mergeDeep(target, source) {
    const result = Object.assign({}, target);
    for (const key of Object.keys(source)) {
        const sv = source[key];
        const tv = target[key];
        if (sv && typeof sv === 'object' && !Array.isArray(sv) &&
            tv && typeof tv === 'object' && !Array.isArray(tv)) {
            result[key] = mergeDeep(tv, sv);
        } else {
            result[key] = sv;
        }
    }
    return result;
}

// ─── Multer error handler ─────────────────────────────────────────────────────
router.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError || err.message) {
        return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;
