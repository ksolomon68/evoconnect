const path        = require('path');
const dotenv      = require('dotenv');
const express     = require('express');
const layouts     = require('express-ejs-layouts');
const cookieParser= require('cookie-parser');
const session     = require('express-session');
const flash       = require('connect-flash');
const methodOvr   = require('method-override');
const helmet      = require('helmet');
const cors        = require('cors');
const rateLimit   = require('express-rate-limit');
const fs          = require('fs');

dotenv.config({ path: path.join(__dirname, '../.env') });
const isLive = !!(process.env.PHUSION_PASSENGER || process.env.PASSENGER_NODE_CONTROL_REPO || process.env.NODE_ENV === 'production');
if (isLive) dotenv.config({ path: path.join(__dirname, '../.env.production'), override: true });

const cfg = require('./agency.config');
const { initDatabase } = require('./database');
const { attachUser }   = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Security ──────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: false,
    hsts: isLive ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
}));

// ── View engine: EJS ──────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(layouts);
app.set('layout', 'layouts/default');

// ── Middleware ────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());
app.use(methodOvr('_method'));
app.use(session({
    secret:            process.env.SESSION_SECRET || 'evoconnect-session-secret-2026',
    resave:            false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure:   isLive,
        maxAge:   24 * 60 * 60 * 1000,
    },
}));
app.use(flash());

// ── CORS ──────────────────────────────────────────────────────────
app.use(cors({
    origin: (origin, cb) => {
        const allowed = [
            `https://${cfg.domain}`,
            `https://www.${cfg.domain}`,
            'http://localhost:3001',
            'http://127.0.0.1:3001',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
        ];
        if (!origin || allowed.includes(origin) || origin.endsWith('.hostingersite.com')) {
            cb(null, true);
        } else {
            cb(null, false); // Deny CORS headers but do not crash the request with a 500 Error
        }
    },
    credentials: true,
}));

// ── Rate limits ───────────────────────────────────────────────────
const isDev = process.env.NODE_ENV !== 'production';
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: isDev ? 10000 : 20, standardHeaders: true, legacyHeaders: false });
const regLimiter  = rateLimit({ windowMs: 60 * 60 * 1000, max: isDev ? 10000 : 10, standardHeaders: true, legacyHeaders: false });

// ── Globals: attach user + flash to res.locals ────────────────────
app.use(attachUser);
app.use((req, res, next) => {
    // Flash messages
    const sessionFlash = req.session.flash;
    if (sessionFlash) {
        res.locals.flash = sessionFlash;
        delete req.session.flash;
    } else {
        const msgs = req.flash();
        if (msgs.success?.length) res.locals.flash = { type: 'success', message: msgs.success[0] };
        else if (msgs.error?.length) res.locals.flash  = { type: 'error',   message: msgs.error[0]   };
        else res.locals.flash = null;
    }
    res.locals.cfg     = cfg;
    res.locals.year    = new Date().getFullYear();
    next();
});

// ── No-cache for HTML ─────────────────────────────────────────────
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/' || !req.path.includes('.')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
    next();
});

// ── Static files ──────────────────────────────────────────────────
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath, { etag: false, lastModified: false }));

// Also serve the old /images, /css, /js, /uploads root directories for backwards compat
app.use('/images',  express.static(path.join(__dirname, '../images')));
app.use('/css',     express.static(path.join(__dirname, '../css')));
app.use('/js',      express.static(path.join(__dirname, '../js')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve the client-side agency.config.js file from root
app.get('/agency.config.js', (req, res) => {
    res.sendFile(path.join(__dirname, '../agency.config.js'));
});

// ── Maintenance mode ──────────────────────────────────────────────
app.use((req, res, next) => {
    if (process.env.MAINTENANCE_MODE === 'true') {
        const bypass = req.cookies?.admin_bypass === 'true' || ['127.0.0.1','::1'].includes(req.ip);
        if (!bypass) {
            if (req.path.startsWith('/api/') || req.path.startsWith('/admin')) return next();
            return res.status(503).render('errors/503', { title: 'Maintenance' });
        }
    }
    next();
});

// ── Routes ────────────────────────────────────────────────────────
async function startServer() {
    try {
        await initDatabase();

        // Auth
        app.use('/', authLimiter, require('./routes/auth'));

        // Portal routes
        app.use('/labor',    regLimiter,  require('./routes/labor'));
        app.use('/business', regLimiter,  require('./routes/business'));
        app.use('/prime',    regLimiter,  require('./routes/prime'));
        app.use('/admin',    require('./routes/admin'));
        app.use('/api/cms',  require('./routes/cms'));

        // CMS admin SPA (file-based content management, JWT auth)
        app.get('/admin-cms', (req, res) => {
            res.sendFile(path.join(__dirname, '../admin-cms.html'));
        });

        // Public home
        app.get('/', (req, res) => {
            if (req.user) {
                const dest = { worker: '/labor/dashboard', business: '/business/dashboard', prime: '/prime/dashboard', admin: '/admin/dashboard' };
                return res.redirect(dest[req.user.type] || '/');
            }
            res.render('index', {
                title:      'Government Contract Workforce Ecosystem',
                activePage: 'home',
                layout:     'layouts/default',
            });
        });

        // Contact page (kept for compatibility)
        app.get('/contact', (req, res) => res.render('contact', { title: 'Contact' }));

        // Legal information pages (canonical URLs + short aliases)
        app.get('/accessibility-statement', (req, res) => res.render('accessibility-statement', { title: 'Accessibility Statement', year: new Date().getFullYear() }));
        app.get('/privacy-policy', (req, res) => res.render('privacy-policy', { title: 'Privacy Policy', year: new Date().getFullYear() }));
        app.get('/terms-of-service', (req, res) => res.render('terms-of-service', { title: 'Terms of Service', year: new Date().getFullYear() }));
        app.get('/privacy', (req, res) => res.redirect(301, '/privacy-policy'));
        app.get('/terms',   (req, res) => res.redirect(301, '/terms-of-service'));

        // Utility redirects that are linked from marketing copy
        app.get('/checklist',    (req, res) => res.redirect('/labor/checklist'));
        app.get('/how-it-works', (req, res) => res.redirect('/#how-it-works'));
        app.get('/faq',          (req, res) => res.redirect('/labor/faq'));

        // Sitemap
        app.get('/sitemap.xml', (req, res) => {
            const base = `https://${cfg.domain}`;
            const urls = [
                '/', '/labor', '/business', '/prime', 
                '/register', '/labor/register', '/business/register', '/prime/register', 
                '/login', '/labor/faq', '/business/faq', '/prime/faq',
                '/accessibility-statement', '/privacy-policy', '/terms-of-service'
            ];
            const xml  = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${base}${u}</loc></url>`).join('\n')}\n</urlset>`;
            res.type('application/xml').send(xml);
        });

        // Health check
        app.get('/api/health', async (req, res) => {
            let db = 'ok';
            try { const d = require('./database').getDb(); await d.execute('SELECT 1'); } catch { db = 'error'; }
            res.json({ status: db === 'ok' ? 'ok' : 'degraded', database: db, version: '3.0.0-evoconnect' });
        });

        // 404
        app.use((req, res) => {
            res.status(404).render('errors/404', { title: 'Page Not Found' });
        });

        // 500
        app.use((err, req, res, next) => {
            console.error('EvoConnect Server Error:', err);
            res.status(500).render('errors/500', {
                title: 'Server Error',
                errMsg: isLive ? null : (err.message || String(err))
            });
        });

        // Start
        if (process.env.PHUSION_PASSENGER || process.env.PASSENGER_NODE_CONTROL_REPO) {
            app.listen('passenger');
            console.log(`${cfg.name}: Listening on Phusion Passenger`);
        } else {
            app.listen(PORT, () => console.log(`${cfg.name}: Running on http://localhost:${PORT}`));
        }
    } catch (err) {
        console.error(`${cfg.name} CRITICAL STARTUP ERROR:`, err);
        process.exit(1);
    }
}

startServer();
