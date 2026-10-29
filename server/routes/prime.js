'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../database');
const { requireType, signToken, setAuthCookie } = require('../middleware/auth');
const { sendEmail } = require('../config/email');
const { regLimiter } = require('../middleware/rateLimit');
const router = express.Router();

// ── US States ─────────────────────────────────────────────────────────────────
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];
const STATE_NAMES = { AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia' };

// ── Subscription Tiers ────────────────────────────────────────────────────────
const SUBSCRIPTION_TIERS = [
    {
        id: 'basic',
        name: 'Basic',
        price: 'Free',
        features: [
            'Search worker and business profiles',
            'Up to 5 profile views per month',
            'Send up to 5 connection requests per month',
            'Standard search filters'
        ]
    },
    {
        id: 'pro',
        name: 'Pro',
        price: '$49/month',
        features: [
            'Unlimited profile views',
            'Send up to 20 connection requests per month',
            'Advanced search filters (certifications, travel willingness)',
            'Priority listing in search results',
            'Download worker/business contact cards'
        ]
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        price: '$99/month',
        features: [
            'Everything in Pro',
            'Unlimited connection requests',
            'Post RFQs directly to qualified subcontractors',
            'Dedicated account manager',
            'Custom NAICS matching',
            'Bulk export of search results'
        ]
    }
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function flash(req, type, message) {
    req.session.flash = { type, message };
}

function getFlash(req) {
    const f = req.session.flash || null;
    delete req.session.flash;
    return f;
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function safeJson(val, fallback) {
    if (!val) return fallback;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return fallback; }
}

function decoratePrime(prime) {
    if (!prime) return prime;
    prime.tier = prime.subscription_tier;
    prime.status = prime.active === 1 ? 'active' : (prime.active === -1 ? 'suspended' : 'pending');
    return prime;
}

// Check and reset monthly limits if needed (call before limit checks)
async function maybeResetMonthlyLimits(db, prime) {
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];

    if (!prime.views_reset_at || prime.views_reset_at < firstOfMonth) {
        await db.execute(
            'UPDATE primes SET monthly_views_used = 0, monthly_contacts_used = 0, views_reset_at = ? WHERE id = ?',
            [firstOfMonth, prime.id]
        );
        prime.monthly_views_used = 0;
        prime.monthly_contacts_used = 0;
        prime.views_reset_at = firstOfMonth;
    }
}

const VIEW_LIMITS    = { basic: 5,  pro: Infinity, enterprise: Infinity };
const CONTACT_LIMITS = { basic: 5,  pro: 20,       enterprise: Infinity };

// ── GET /prime ─────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    res.render('prime/index', {
        title: 'Prime Contractor Portal | EVOConnected',
        flash: getFlash(req),
        tiers: SUBSCRIPTION_TIERS
    });
});

// ── GET /prime/register ────────────────────────────────────────────────────────
router.get('/register', (req, res) => {
    const step = parseInt(req.query.step) || 1;
    const queryTier = req.query.tier || '';
    res.render('prime/register', {
        title: 'Register as a Prime Contractor | EVOConnected',
        flash: getFlash(req),
        states: US_STATES,
        stateNames: STATE_NAMES,
        tiers: SUBSCRIPTION_TIERS,
        step,
        queryTier,
        errors: [],
        values: {}
    });
});

// ── POST /prime/register ───────────────────────────────────────────────────────
router.post('/register', regLimiter, async (req, res) => {
    const v = req.body;
    const errors = [];

    const company_name  = (v.company_name || '').trim();
    const contact_name  = (v.contact_name || '').trim();
    const email         = (v.email || '').trim().toLowerCase();
    const phone         = (v.phone || '').trim();
    const password      = v.password || '';
    const confirm_pw    = v.confirm_password || '';
    const sam_uei       = (v.sam_uei || '').trim();
    const city          = (v.city || '').trim();
    const state         = (v.state || '').trim();
    const zip           = (v.zip || '').trim();

    if (!company_name)  errors.push('Company name is required.');
    if (!contact_name)  errors.push('Contact name is required.');
    if (!email)         errors.push('Email address is required.');
    else if (!validateEmail(email)) errors.push('Please enter a valid email address.');
    if (!phone)         errors.push('Phone number is required.');
    if (!password)      errors.push('Password is required.');
    else if (password.length < 8) errors.push('Password must be at least 8 characters.');
    if (password !== confirm_pw) errors.push('Passwords do not match.');
    if (!sam_uei)       errors.push('SAM.gov UEI is required.');
    if (!city)          errors.push('City is required.');
    if (!state)         errors.push('State is required.');
    if (!zip)           errors.push('ZIP code is required.');

    if (errors.length) {
        return res.render('prime/register', {
            title: 'Register as a Prime Contractor | EVOConnected',
            flash: null,
            states: US_STATES,
            stateNames: STATE_NAMES,
            tiers: SUBSCRIPTION_TIERS,
            errors,
            values: v
        });
    }

    try {
        const db = getDb();

        // Check email uniqueness in primes table
        const [existing] = await db.execute('SELECT id FROM primes WHERE email = ?', [email]);
        if (existing.length) {
            return res.render('prime/register', {
                title: 'Register as a Prime Contractor | EVOConnected',
                flash: null,
                states: US_STATES,
                stateNames: STATE_NAMES,
                tiers: SUBSCRIPTION_TIERS,
                errors: ['An account with that email already exists.'],
                values: v
            });
        }

        const password_hash = await bcrypt.hash(password, 12);

        let naics_codes = [];
        try { naics_codes = JSON.parse(v.naics_codes_json || '[]'); } catch {}
        const sub_types_needed = Array.isArray(v.sub_types_needed) ? v.sub_types_needed : (v.sub_types_needed ? [v.sub_types_needed] : []);
        const subscription_tier = ['basic','pro','enterprise'].includes(v.subscription_tier) ? v.subscription_tier : 'basic';

        const [result] = await db.execute(`
            INSERT INTO primes
                (company_name, contact_name, email, password_hash, phone, sam_uei,
                 naics_codes, sub_types_needed, city, state, zip,
                 subscription_tier, active)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)
        `, [
            company_name, contact_name, email, password_hash, phone, sam_uei,
            JSON.stringify(naics_codes),
            JSON.stringify(sub_types_needed),
            city, state, zip,
            subscription_tier
        ]);

        const primeId = result.insertId;

        // Send "pending approval" confirmation to prime (non-blocking)
        const pendingHtml = `
            <h2 style="color:#1a56db;">Application Received — EVOConnected Prime Contractor</h2>
            <p>Hi ${contact_name},</p>
            <p>Thank you for applying to join EVOConnected as a prime contractor. Your application is under review and you will receive an email notification within <strong>1–2 business days</strong>.</p>
            <h3 style="color:#374151;">What happens next:</h3>
            <ol>
                <li>Our team verifies your SAM.gov UEI and company information</li>
                <li>You receive an approval email with full platform access</li>
                <li>You can immediately begin searching for workers and subcontractors</li>
            </ol>
            <p style="color:#6b7280;font-size:13px;">Questions? Reply to this email or visit <a href="${require('../agency.config').baseUrl}/prime/faq" style="color:#1a56db;">our FAQ</a>.</p>
        `;
        sendEmail({
            to: email,
            subject: 'EVOConnected: Your prime contractor application is under review',
            html: pendingHtml,
            text: `Hi ${contact_name},\n\nYour EVOConnected prime contractor application is under review. You'll receive a decision within 1–2 business days.\n\nQuestions? Reply to this email.`
        }).catch(e => console.error('EVOConnected [prime/register] confirmation email error:', e));

        // Internal admin notification
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@evoconnect.evobrand.net';
        const adminHtml = `
            <h2>New Prime Contractor Application</h2>
            <table style="border-collapse:collapse;width:100%;">
                <tr><td style="padding:8px;font-weight:700;">Company</td><td style="padding:8px;">${company_name}</td></tr>
                <tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;">Contact</td><td style="padding:8px;">${contact_name}</td></tr>
                <tr><td style="padding:8px;font-weight:700;">Email</td><td style="padding:8px;">${email}</td></tr>
                <tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;">Phone</td><td style="padding:8px;">${phone}</td></tr>
                <tr><td style="padding:8px;font-weight:700;">SAM UEI</td><td style="padding:8px;">${sam_uei}</td></tr>
                <tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;">Location</td><td style="padding:8px;">${city}, ${state} ${zip}</td></tr>
                <tr><td style="padding:8px;font-weight:700;">Tier Selected</td><td style="padding:8px;">${subscription_tier}</td></tr>
            </table>
            <p><a href="${require('../agency.config').baseUrl}/admin/dashboard" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;">Review in Admin Dashboard</a></p>
        `;
        sendEmail({
            to: adminEmail,
            subject: `EVOConnected: New prime application — ${company_name}`,
            html: adminHtml,
            text: `New prime contractor application:\nCompany: ${company_name}\nContact: ${contact_name}\nEmail: ${email}\nSAM UEI: ${sam_uei}\nTier: ${subscription_tier}\n\nReview at: ${require('../agency.config').baseUrl}/admin/dashboard`
        }).catch(e => console.error('EVOConnected [prime/register] admin notification email error:', e));

        // Sign token and set cookie (they can access dashboard but with pending state)
        const token = signToken({ id: primeId, email, type: 'prime', name: company_name });
        setAuthCookie(res, token);

        flash(req, 'success', 'Your application has been submitted. You\'ll receive an approval email within 1–2 business days.');
        res.redirect('/prime/dashboard');

    } catch (err) {
        console.error('EVOConnected [prime/register]:', err);
        res.render('prime/register', {
            title: 'Register as a Prime Contractor | EVOConnected',
            flash: null,
            states: US_STATES,
            stateNames: STATE_NAMES,
            tiers: SUBSCRIPTION_TIERS,
            errors: ['A server error occurred. Please try again.'],
            values: v
        });
    }
});

// ── GET /prime/dashboard ───────────────────────────────────────────────────────
router.get('/dashboard', requireType('prime'), async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;

        const [pRows] = await db.execute('SELECT * FROM primes WHERE id = ?', [userId]);
        if (!pRows.length) {
            flash(req, 'error', 'Prime profile not found.');
            return res.redirect('/login');
        }

        const prime = decoratePrime(pRows[0]);
        prime.naics_codes    = safeJson(prime.naics_codes, []);
        prime.sub_types_needed = safeJson(prime.sub_types_needed, []);

        // Pending approval — show limited view
        if (prime.active !== 1) {
            return res.render('prime/dashboard', {
                title: 'Dashboard | EVOConnected Prime',
                flash: getFlash(req),
                prime,
                pendingApproval: true,
                connections: [],
                rfqs: []
            });
        }

        // Connections sent by this prime
        const connections=await require('../services/role-connections').list(db,{type:req.user.type,id:userId});

        // RFQs by this prime
        const [rfqs] = await db.execute(
            `SELECT id,title,category AS trade_service,district_name AS location,duration AS timeline,status FROM opportunities WHERE posted_by_type='prime' AND posted_by=? ORDER BY posted_date DESC`,
            [userId]
        );

        const [[{ pendingAppsCount }]]=await db.execute("SELECT COUNT(*) AS pendingAppsCount FROM applications a JOIN opportunities o ON o.id=a.opportunity_id WHERE o.posted_by_type='prime' AND o.posted_by=? AND a.applicant_type='business' AND a.status IN ('submitted','pending','under_review')",[userId]);
        const [[{ myOppsCount }]] = await db.execute("SELECT COUNT(*) AS myOppsCount FROM opportunities WHERE posted_by = ? AND posted_by_type = 'prime'", [userId]);
        const [[{ wCnt }]] = await db.execute("SELECT COUNT(*) AS wCnt FROM workers WHERE status='active'");
        const [[{ bCnt }]] = await db.execute("SELECT COUNT(*) AS bCnt FROM businesses WHERE status='active'");
        res.render('prime/dashboard', {
            title: 'Dashboard | EVOConnected Prime',
            flash: getFlash(req),
            prime,
            pendingApproval: false,
            connections,
            rfqs,
            myOppsCount,
            pendingAppsCount,
            totalDirectoryCount: Number(bCnt)
        });

    } catch (err) {
        console.error('EVOConnected [prime/dashboard]:', err);
        flash(req, 'error', 'Failed to load dashboard.');
        res.redirect('/login');
    }
});

// ── GET /prime/search/workers ──────────────────────────────────────────────────
router.get('/search/workers', requireType('prime'), async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;

        const [pRows] = await db.execute('SELECT * FROM primes WHERE id = ?', [userId]);
        if (!pRows.length) return res.redirect('/prime/dashboard');

        const prime = decoratePrime(pRows[0]);
        if (prime.active !== 1) {
            return res.status(403).render('errors/403', {
                title: 'Account Pending Approval',
                message: 'Your account is pending approval. You\'ll receive full access once reviewed.'
            });
        }

        await maybeResetMonthlyLimits(db, prime);

        const viewLimit = VIEW_LIMITS[prime.subscription_tier] || 5;
        if (prime.subscription_tier === 'basic' && prime.monthly_views_used >= viewLimit) {
            return res.render('prime/search-workers', {
                title: 'Search Workers | EVOConnected',
                flash: { type: 'warning', message: `You've reached your ${viewLimit} monthly view limit. Upgrade to Pro for unlimited views.` },
                prime,
                results: [],
                filters: req.query,
                limitReached: true
            });
        }

        const { trade, state } = req.query;
        const travel_willingness=(req.query.travel_willingness || req.query.travel || '').replace('local_only','local');
        const sam_registered=req.query.sam_registered || req.query.sam;
        const certFilter=req.query.certifications || req.query.cert;

        const conditions = ['w.status = ?'];
        const params = ['active'];

        if (trade)             { conditions.push('w.trade_category = ?');      params.push(trade); }
        if (state)             { conditions.push('w.state = ?');               params.push(state); }
        if (travel_willingness){ conditions.push('w.travel_willingness = ?');  params.push(travel_willingness); }
        if (sam_registered)    { conditions.push('w.sam_registered = ?');      params.push(sam_registered); }

        const where = conditions.join(' AND ');
        const [results] = await db.execute(
            `SELECT id, full_name, trade_category, skills, certifications,
                    years_experience, sam_registered, business_entity,
                    city, state, zip, travel_willingness, profile_pct, experience_summary
             FROM workers w WHERE ${where}
             ORDER BY profile_pct DESC LIMIT 50`,
            params
        );

        // Filter by certification client-side friendly (JSON field)
        let filtered = results.map(w => ({
            ...w,
            skills: safeJson(w.skills, []),
            certifications: safeJson(w.certifications, [])
        }));

        if (certFilter) {
            const selected=Array.isArray(certFilter)?certFilter:[certFilter];
            const normalize=value=>String(value).toLowerCase().replace(/[^a-z0-9]/g,'');
            filtered = filtered.filter(w => selected.every(cert=>w.certifications.map(normalize).includes(normalize(cert))));
        }

        // Increment view count for basic tier
        if (prime.subscription_tier === 'basic' && filtered.length > 0) {
            await db.execute(
                'UPDATE primes SET monthly_views_used = monthly_views_used + 1 WHERE id = ?',
                [userId]
            );
        }

        res.render('prime/search-workers', {
            title: 'Search Workers | EVOConnected',
            flash: getFlash(req),
            prime,
            results: await require('../services/directory-profiles')(db,'worker',filtered),
            filters: req.query,
            limitReached: false,
            states: US_STATES
        });

    } catch (err) {
        console.error('EVOConnected [prime/search/workers]:', err);
        flash(req, 'error', 'Search failed. Please try again.');
        res.redirect('/prime/dashboard');
    }
});

// ── GET /prime/search/businesses ──────────────────────────────────────────────
router.get('/search/businesses', requireType('prime'), async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;

        const [pRows] = await db.execute('SELECT * FROM primes WHERE id = ?', [userId]);
        if (!pRows.length) return res.redirect('/prime/dashboard');

        const prime = decoratePrime(pRows[0]);
        if (prime.active !== 1) {
            return res.status(403).render('errors/403', {
                title: 'Account Pending Approval',
                message: 'Your account is pending approval.'
            });
        }

        await maybeResetMonthlyLimits(db, prime);

        const viewLimit = VIEW_LIMITS[prime.subscription_tier] || 5;
        if (prime.subscription_tier === 'basic' && prime.monthly_views_used >= viewLimit) {
            return res.render('prime/search-businesses', {
                title: 'Search Businesses | EVOConnected',
                flash: { type: 'warning', message: `You've reached your ${viewLimit} monthly view limit. Upgrade to Pro for unlimited views.` },
                prime,
                results: [],
                filters: req.query,
                limitReached: true
            });
        }

        const { state, service_radius } = req.query;
        const naics_code=req.query.naics_code || req.query.naics;
        const sam_registered=req.query.sam_registered || req.query.sam;
        const certFilter=req.query.certifications || req.query.cert;

        const conditions = ['status = ?'];
        const params = ['active'];

        if (state)          { conditions.push('state = ?');          params.push(state); }
        if (service_radius) { conditions.push('service_radius = ?'); params.push(service_radius); }
        if (sam_registered) { conditions.push('sam_registered = ?'); params.push(sam_registered); }

        const where = conditions.join(' AND ');
        const [results] = await db.execute(
            `SELECT id, company_name, contact_name, business_type, certifications,
                    sam_registered, naics_codes, service_description,
                    city, state, zip, service_radius, profile_pct
             FROM businesses WHERE ${where}
             ORDER BY profile_pct DESC LIMIT 50`,
            params
        );

        let filtered = results.map(b => ({
            ...b,
            certifications: safeJson(b.certifications, []),
            naics_codes:    safeJson(b.naics_codes, [])
        }));

        if (certFilter) {
            const selected=Array.isArray(certFilter)?certFilter:[certFilter];
            const normalize=value=>String(value).toLowerCase().replace(/[^a-z0-9]/g,'');
            filtered = filtered.filter(b => selected.every(cert=>b.certifications.map(normalize).includes(normalize(cert))));
        }
        if (naics_code) {
            filtered = filtered.filter(b => b.naics_codes.map(String).includes(String(naics_code)));
        }

        if (prime.subscription_tier === 'basic' && filtered.length > 0) {
            await db.execute(
                'UPDATE primes SET monthly_views_used = monthly_views_used + 1 WHERE id = ?',
                [userId]
            );
        }

        res.render('prime/search-businesses', {
            title: 'Search Businesses | EVOConnected',
            flash: getFlash(req),
            prime,
            results: await require('../services/directory-profiles')(db,'business',filtered),
            filters: req.query,
            limitReached: false,
            states: US_STATES
        });

    } catch (err) {
        console.error('EVOConnected [prime/search/businesses]:', err);
        flash(req, 'error', 'Search failed. Please try again.');
        res.redirect('/prime/dashboard');
    }
});

// ── POST /prime/connect ────────────────────────────────────────────────────────


// Legacy RFQ URLs now lead to the unified posting workflow.
router.get('/rfq', requireType('prime'), (req,res)=>res.redirect('/prime/opportunities'));
router.post(['/rfq','/rfq/post'], requireType('prime'), (req,res)=>{
    flash(req, 'info', 'Please complete the Request for Qualifications form to submit your RFQ.');
    res.redirect(303,'/prime/post-rfq');
});

// ── GET /prime/faq ─────────────────────────────────────────────────────────────
router.get('/faq', async (req, res, next) => {
    try {
        res.render('prime/faq', {
            title: 'FAQ | EVOConnected Prime',
            flash: getFlash(req),
            faqs: await require('../services/faqs').list(getDb(),'prime')
        });
    }catch(err){next(err);}
});

// ── GET /prime/login ───────────────────────────────────────────────────────────
router.get('/login', (req, res) => res.redirect('/login'));

// ── Search aliases ─────────────────────────────────────────────────────────────
router.get('/search/labor',    requireType('prime'), (req, res) => res.redirect('/prime/search/workers' + (Object.keys(req.query).length ? '?' + new URLSearchParams(req.query).toString() : '')));
router.get('/search/business', requireType('prime'), (req, res) => res.redirect('/prime/search/businesses' + (Object.keys(req.query).length ? '?' + new URLSearchParams(req.query).toString() : '')));

// ── GET /prime/connections ──────────────────────────────────────────────────────


// ── GET /prime/profile/edit ────────────────────────────────────────────────────
router.get('/profile/edit', requireType('prime'), async (req, res) => {
    try {
        const db = getDb();
        const [pRows] = await db.execute('SELECT * FROM primes WHERE id = ?', [req.user.id]);
        if (!pRows.length) return res.redirect('/prime/dashboard');

        const prime = decoratePrime(pRows[0]);
        prime.naics_codes = safeJson(prime.naics_codes, []);

        res.render('prime/profile', {
            title: 'Edit Profile | EVOConnected Prime',
            flash: getFlash(req),
            prime,
            states: US_STATES,
            stateNames: STATE_NAMES,
            tiers: SUBSCRIPTION_TIERS
        });

    } catch (err) {
        console.error('EVOConnected [prime/profile/edit GET]:', err);
        flash(req, 'error', 'Failed to load profile.');
        res.redirect('/prime/dashboard');
    }
});

// ── POST /prime/profile/update ─────────────────────────────────────────────────
router.post('/profile/update', requireType('prime'), async (req, res) => {
    try {
        const db = getDb();
        const v = req.body;
        const userId = req.user.id;

        let naics_codes = [];
        try { naics_codes = JSON.parse(v.naics_codes_json || '[]'); } catch {}

        await db.execute(`
            UPDATE primes SET
                company_name = ?, contact_name = ?, phone = ?,
                sam_uei = ?, contract_vehicles = ?, naics_codes = ?,
                city = ?, state = ?, zip = ?
            WHERE id = ?
        `, [
            (v.company_name || '').trim(),
            (v.contact_name || '').trim(),
            (v.phone || '').trim(),
            (v.sam_uei || '').trim(),
            v.contract_vehicles || null,
            JSON.stringify(naics_codes),
            (v.city || '').trim(),
            v.state || '',
            (v.zip || '').trim(),
            userId
        ]);

        flash(req, 'success', 'Profile updated successfully.');
        res.redirect('/prime/profile/edit');

    } catch (err) {
        console.error('EVOConnected [prime/profile/update POST]:', err);
        flash(req, 'error', 'Failed to update profile.');
        res.redirect('/prime/profile/edit');
    }
});


const pf = require('./portalFeatures');

router.get('/profile', requireType('prime'), (req, res) => res.redirect('/prime/profile/edit'));
router.get('/search', requireType('prime'), (req, res) => res.redirect('/prime/search/businesses'));

// Manage Opportunities
router.get('/opportunities', requireType('prime'), async (req, res) => {
    try {
        const db = getDb();
        const [opportunities] = await db.execute(
            "SELECT * FROM opportunities WHERE posted_by = ? AND posted_by_type = 'prime' ORDER BY posted_date DESC",
            [req.user.id]
        );
        const [businesses] = await db.execute("SELECT id, company_name FROM businesses WHERE status='active' ORDER BY company_name ASC LIMIT 50");
        const [workers] = await db.execute("SELECT id, full_name FROM workers WHERE status='active' ORDER BY full_name ASC LIMIT 50");
        const candidates = [
            ...businesses.map(b => ({ type: 'business', id: b.id, name: b.company_name, label: `🏢 ${b.company_name} (Business)` })),

        ];
        res.render('prime/opportunities', {
            title: 'Manage RFQs | EVOConnected Prime',
            flash: getFlash(req),
            opportunities,
            candidates
        });
    } catch (err) {
        console.error('EVOConnected [prime/opportunities]:', err);
        res.redirect('/prime/dashboard');
    }
});

// Applications Review
router.get('/applications', requireType('prime'), async (req, res) => {
    try {
        const db = getDb();
        const [applications] = await db.execute(`
            SELECT a.*, o.title AS opportunity_title,
                CASE a.applicant_type
                    WHEN 'worker' THEN w.full_name
                    WHEN 'business' THEN b.company_name
                END AS applicant_name,
                CASE a.applicant_type
                    WHEN 'worker' THEN w.email
                    WHEN 'business' THEN b.email
                END AS applicant_email
            FROM applications a
            JOIN opportunities o ON a.opportunity_id = o.id
            LEFT JOIN workers w ON a.applicant_type = 'worker' AND a.applicant_id = w.id
            LEFT JOIN businesses b ON a.applicant_type = 'business' AND a.applicant_id = b.id
            WHERE o.posted_by = ? AND o.posted_by_type = 'prime' AND a.applicant_type='business'
            ORDER BY a.applied_date DESC
        `, [req.user.id]);
        res.render('prime/applications', {
            title: 'Review Applications | EVOConnected Prime',
            flash: getFlash(req),
            applications
        });
    } catch (err) {
        console.error('EVOConnected [prime/applications]:', err);
        res.redirect('/prime/dashboard');
    }
});

// Messages & Settings
router.get('/messages', requireType('prime'), (req, res) => pf.renderMessages(req, res, 'prime', '/prime'));
router.post('/messages/send', requireType('prime'), (req, res) => pf.sendMessage(req, res, 'prime', '/prime'));
router.get('/settings', requireType('prime'), (req, res) => pf.renderSettings(req, res, '/prime'));
router.post('/settings/password', requireType('prime'), (req, res) => pf.updatePassword(req, res, 'primes', '/prime'));


// Resources Library for Primes
router.get('/resources', requireType('prime'), async (req, res) => {
    try {
        const db = getDb();
        const [resources] = await db.execute(`
            SELECT * FROM resources
            WHERE audience IN ('all','business','prime') AND status = 'active'
            ORDER BY sort_order ASC
        `);
        res.render('labor/resources', { title: 'Resources | EVOConnected Prime', flash: getFlash(req), resources });
    } catch (err) {
        console.error('EVOConnected [prime/resources]:', err);
        flash(req, 'error', 'Failed to load resources.');
        res.redirect('/prime/dashboard');
    }
});

module.exports = router;
