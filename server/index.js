const path        = require('path');
const root = require('./services/app-root');
const dotenv      = require('dotenv');
const express     = require('express');
const layouts     = require('express-ejs-layouts');
const cookieParser= require('cookie-parser');
const session     = require('express-session');
const flash       = require('connect-flash');
const methodOvr   = require('method-override');
const helmet      = require('helmet');
const cors        = require('cors');
const fs          = require('fs');

dotenv.config({ path: path.join(root, '.env') });
// Always load .env.production if present — dotenv silently ignores missing files
dotenv.config({ path: path.join(root, '.env.production'), override: true });
const isLive = !!(process.env.PHUSION_PASSENGER || process.env.PASSENGER_NODE_CONTROL_REPO || process.env.NODE_ENV === 'production');

const cfg = require('./agency.config');
const { initDatabase, getDb } = require('./database');
const { attachUser }   = require('./middleware/auth');

const app  = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('Production requires JWT_SECRET for authentication.');
}

// ── Security ──────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: false,
    hsts: isLive ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
}));

// ── View engine: EJS ──────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(root, 'views'));
app.use(layouts);
app.set('layout', 'layouts/default');

// ── Middleware ────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());
app.use(methodOvr('_method'));
app.use(session({
    secret:            require('./services/session-secret')(),
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


// ── Globals: attach user + flash to res.locals ────────────────────
app.use(attachUser);
app.use(require('./services/demo-sandbox').requestContext);
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
    res.locals.uploadLimitMB = 10;
    res.locals.cfg     = cfg;
    res.locals.year    = new Date().getFullYear();

    // Automatically use dashboard layout for logged-in portal sub-pages
    if (req.user) {
        const p = req.path;
        const isPortalSubpage =
            (p.startsWith('/labor/') && !p.startsWith('/labor/register')) ||
            (p.startsWith('/business/') && !p.startsWith('/business/register') && !p.startsWith('/business/capability-statement')) ||
            (p.startsWith('/prime/') && !p.startsWith('/prime/register')) ||
            p.startsWith('/admin') ||
            p === '/opportunities' || p.startsWith('/opportunities/') || p.startsWith('/jobs/') || p.startsWith('/directory/');
        if (isPortalSubpage) {
            res.locals.layout = 'layouts/dashboard';
        }
    }
    next();
});

app.use(require('./services/cms-content').cmsMiddleware);

// ── No-cache for HTML ─────────────────────────────────────────────
app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/' || !req.path.includes('.')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
    next();
});

// Resumes stay available across deployments and remain restricted to hiring roles.
app.get('/uploads/resumes/:filename', require('./middleware/auth').requireAuth, async(req,res,next)=>{
    try {
        if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(req.params.filename))return res.sendStatus(404);
        const policy=require('./services/role-policy');
        if(!await policy.account(getDb(),req.user.type,req.user.id))return res.sendStatus(403);
        const [owners]=await getDb().execute('SELECT id FROM workers WHERE resume_path=? OR resume_path=?',[req.params.filename,'/uploads/resumes/'+req.params.filename]);
        if(!owners.length || !(['business','admin'].includes(req.user.type) || (req.user.type==='worker' && owners.some(w=>Number(w.id)===Number(req.user.id)))))return res.sendStatus(404);
        const file=await require('./services/file-storage').get('resumes',req.params.filename);
        if(!file)return res.sendStatus(404);
        res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'attachment; filename="resume'+path.extname(req.params.filename)+'"'}).type(path.extname(req.params.filename)).send(file.buffer);
    }catch(err){next(err);}
});

// CMS media is served from persistent storage, including on serverless instances.
app.get('/uploads/cms-media/:filename', async (req,res,next)=>{
    try {
        if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(req.params.filename))return res.sendStatus(404);
        const file=await require('./services/file-storage').get('media',req.params.filename);
        if(!file)return res.sendStatus(404);
        res.set({'Content-Type':file.metadata.mimeType || 'application/octet-stream','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}).send(file.buffer);
    }catch(err){next(err);}
});

// ── Static files ──────────────────────────────────────────────────
const publicPath = path.join(root, 'public');
app.use(express.static(publicPath, { etag: false, lastModified: false }));

// Also serve the old /images, /css, /js, /uploads root directories for backwards compat
app.use('/images',  express.static(path.join(root, 'images')));
app.use('/assets',  express.static(path.join(root, 'assets')));
app.use('/css',     express.static(path.join(root, 'css')));
app.use('/js',      express.static(path.join(root, 'js')));
app.use('/uploads', express.static(path.join(root, 'uploads')));

// Serve the client-side agency.config.js file from root
app.get('/agency.config.js', (req, res) => {
    res.sendFile(path.join(root, 'agency.config.js'));
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

        app.use(require('./routes/ecosystem'));
        app.use(require('./routes/flagship'));

        // Auth
        app.use('/', require('./routes/auth'));

        // Portal routes
        app.use('/labor',    require('./routes/labor'));
        app.use('/business', require('./routes/business'));
        app.use('/prime',    require('./routes/prime'));
        app.use('/admin',    require('./routes/admin'));
        app.use('/api/cms',  require('./routes/cms'));
        app.use('/api/admin/users', require('./routes/cms-admins'));

        // Notifications API (cookie-aware + query fallback)
        app.get('/api/notifications', async (req, res) => {
            try {
                const db = getDb();
                const userId = req.user?.id;
                const userType = req.user?.type;
                if (!userId) return res.status(401).json({ error: 'Please log in.' });
                const [rows] = await db.execute(`
                    SELECT n.*, m.subject, m.message_type, m.sender_business_name
                    FROM notifications n
                    LEFT JOIN messages m ON n.message_id = m.id
                    WHERE n.user_type = ? AND n.user_id = ?
                    ORDER BY n.created_at DESC LIMIT 20
                `, [userType, userId]);
                res.json(rows);
            } catch (err) {
                res.json([]);
            }
        });

        app.post('/api/notifications/:id/read', async (req, res) => {
            try {
                const db = getDb();
                if (!req.user) return res.status(401).json({ error: 'Please log in.' });
                await db.execute('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_type = ? AND user_id = ?', [req.params.id, req.user.type, req.user.id]);
                res.json({ success: true });
            } catch (err) {
                res.json({ success: false });
            }
        });

        // Public Opportunities Board
        const pf = require('./routes/portalFeatures');
        app.get('/opportunities', (req, res) => {
            const roleType = req.user?.type || 'business';
            const basePath = req.user?.type === 'worker' ? '/labor' : '/business';
            return pf.renderOpportunitiesSearch(req, res, roleType, basePath);
        });

        // CMS admin SPA (file-based content management, JWT auth)
        app.get(['/admin-cms', '/admin-cms.html'], (req, res) => {
            res.sendFile(path.join(root, 'admin-cms.html'));
        });

        // CMS & Admin tutorial routes (both clean URLs and legacy .html URLs)
        app.get(['/cms-tutorial', '/cms-tutorial.html'], (req, res) => {
            res.render('admin/tutorial', { title: 'CMS Admin Guide | EVOConnected', guideType: 'cms', layout: req.user ? 'layouts/dashboard' : 'layouts/default' });
        });
        app.get(['/admin-tutorial', '/admin-tutorial.html'], (req, res) => {
            res.render('admin/tutorial', { title: 'Platform Admin Guide | EVOConnected', guideType: 'platform', layout: req.user ? 'layouts/dashboard' : 'layouts/default' });
        });

        // Custom CMS Pages created in Page Builder
        app.get(['/pages/:slug', '/pages/:slug.html'], async (req, res, next) => {
            try {
            const pageData = await require('./services/cms-content').getPage(req.params.slug.replace(/\.html$/, ''));
            if (!pageData) return next();
            res.render('shared/cms-page', {
                title: pageData.meta?.title || 'EVOConnected',
                page: pageData,
                layout: 'layouts/default'
            });
            }catch(err){next(err);}
        });

        // Public home
        app.get('/', (req, res) => {
            if (req.user && !req.query.public) {
                const dest = { worker: '/labor/dashboard', business: '/business/dashboard', prime: '/prime/dashboard', admin: '/admin/dashboard' };
                if (dest[req.user.type]) return res.redirect(dest[req.user.type]);
            }
            res.render('index', {
                title:      'Government Contract Workforce Ecosystem',
                activePage: 'home',
                layout:     'layouts/default',
            });
        });

        // Contact & Issue Reporting
        app.get('/contact', (req, res) => res.render('contact', { title: 'Contact' }));
        app.post('/contact', async (req, res) => {
            try {
                const db = getDb();
                const { name, email, subject, message, issue_type } = req.body;
                await db.execute(
                    'INSERT INTO site_issues (name, email, issue_type, page_url, description) VALUES (?,?,?,?,?)',
                    [name || 'Visitor', email || '', issue_type || 'Contact Inquiry', subject || '/contact', message || '']
                );
                req.session.flash = { type: 'success', message: 'Thank you! Your message has been received by our team.' };
            } catch (err) {
                console.error('EVOConnected [/contact POST]:', err);
            }
            res.redirect('/contact');
        });
        app.post('/api/contact/submit', async (req, res) => {
            try {
                const db = getDb();
                const { name, email, subject, message, issue_type, page_url } = req.body;
                await db.execute(
                    'INSERT INTO site_issues (name, email, issue_type, page_url, description) VALUES (?,?,?,?,?)',
                    [name || 'Visitor', email || '', issue_type || 'Support', page_url || subject || '', message || '']
                );
                res.json({ success: true });
            } catch (err) {
                res.status(500).json({ success: false });
            }
        });

        // Legal information pages (canonical URLs + short aliases)
        app.get('/accessibility-statement', (req, res) => res.render('accessibility-statement', { title: 'Accessibility Statement', year: new Date().getFullYear() }));
        app.get('/privacy-policy', (req, res) => res.render('privacy-policy', { title: 'Privacy Policy', year: new Date().getFullYear() }));
        app.get('/terms-of-service', (req, res) => res.render('terms-of-service', { title: 'Terms of Service', year: new Date().getFullYear() }));
        app.get('/privacy', (req, res) => res.redirect(301, '/privacy-policy'));
        app.get('/terms',   (req, res) => res.redirect(301, '/terms-of-service'));

        // Utility redirects that are linked from marketing copy
        app.get('/checklist',    (req, res) => res.redirect('/labor/checklist'));
        app.get('/how-it-works', (req, res) => res.redirect('/#how-it-works'));
        app.get(['/faq', '/faq.html'], async (req, res, next) => {
            try {
                res.render('shared/faq-index', { title: 'Frequently Asked Questions', activePage: 'faq', layout: req.user ? 'layouts/dashboard' : 'layouts/default', groups: await require('./services/faqs').groups(getDb()) });
            }catch(err){next(err);}
        });

        app.get('/manifest.json',(req,res)=>res.sendFile(path.join(root,'manifest.json')));
        app.get('/robots.txt',(req,res)=>res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${cfg.baseUrl}/sitemap.xml\n`));

        // Sitemap
        app.get('/sitemap.xml', (req, res) => {
            const base = `https://${cfg.domain}`;
            const urls = [
                '/', '/labor', '/business', '/prime', 
                '/register', '/labor/register', '/business/register', '/prime/register', 
                '/login', '/faq', '/labor/faq', '/business/faq', '/prime/faq',
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
            console.error('EVOConnected Server Error:', err);
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
        throw err;
    }
}

// Passenger loads the entry module with require(), so startup must be unconditional.
startServer().catch(()=>process.exit(1));
