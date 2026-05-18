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

// ── FAQ Data ──────────────────────────────────────────────────────────────────
const PRIME_FAQS = [
    {
        q: 'How does the prime contractor approval process work?',
        a: 'After registering, your account is reviewed by an EvoConnect administrator within 1–2 business days. We verify your SAM.gov UEI, confirm your company is an active prime contractor, and review your stated subcontracting needs. Once approved, you gain full search access. This process ensures all prime contractors on the platform are verified and legitimate, which protects the workers and businesses you\'ll be contacting.'
    },
    {
        q: 'What are the subscription tiers and what do they include?',
        a: 'EvoConnect offers three tiers. Basic (Free): 5 profile views and 5 connection requests per month, standard search filters. Pro ($49/month): Unlimited profile views, 20 connection requests per month, advanced filters for certifications and travel willingness, and the ability to download contact cards. Enterprise ($99/month): Everything in Pro, unlimited connection requests, the RFQ system to post subcontracting requests directly to qualified candidates, dedicated account manager, and bulk export. All limits reset on the 1st of each calendar month.'
    },
    {
        q: 'How does the RFQ (Request for Quote) system work?',
        a: 'Enterprise tier subscribers can post detailed Requests for Quote directly to the platform. RFQs include trade/service type, location, timeline, contract vehicle, and project description. Qualified workers and businesses matching your criteria receive notification emails and can respond directly through the platform. This is ideal for primes with active contract vehicles who need to fill specific subcontracting roles quickly.'
    },
    {
        q: 'How do I search for workers and businesses?',
        a: 'Approved prime contractors can search the Labor Directory for individual workers or the Business Directory for subcontracting companies. You can filter by trade category, state, travel willingness, SAM.gov registration status, and certifications. Results are sorted by profile completeness, which correlates with readiness to work. Connection requests are sent through the platform — the worker or business is notified by email and must accept before any contact information is shared.'
    },
    {
        q: 'What should I do if my application is denied?',
        a: 'If your prime contractor application is denied, you will receive an email explaining the reason. Common reasons include an unverifiable SAM.gov UEI, an inactive SAM.gov registration, or a company that does not meet our prime contractor criteria. You can reapply with corrected information by emailing admin@evoconnect.evobrand.net. Active SAM.gov registration and a verifiable UEI are required for all prime contractor accounts.'
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
        title: 'Prime Contractor Portal | EvoConnect',
        flash: getFlash(req),
        tiers: SUBSCRIPTION_TIERS
    });
});

// ── GET /prime/register ────────────────────────────────────────────────────────
router.get('/register', (req, res) => {
    const step = parseInt(req.query.step) || 1;
    const queryTier = req.query.tier || '';
    res.render('prime/register', {
        title: 'Register as a Prime Contractor | EvoConnect',
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
            title: 'Register as a Prime Contractor | EvoConnect',
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
                title: 'Register as a Prime Contractor | EvoConnect',
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
            <h2 style="color:#1a56db;">Application Received — EvoConnect Prime Contractor</h2>
            <p>Hi ${contact_name},</p>
            <p>Thank you for applying to join EvoConnect as a prime contractor. Your application is under review and you will receive an email notification within <strong>1–2 business days</strong>.</p>
            <h3 style="color:#374151;">What happens next:</h3>
            <ol>
                <li>Our team verifies your SAM.gov UEI and company information</li>
                <li>You receive an approval email with full platform access</li>
                <li>You can immediately begin searching for workers and subcontractors</li>
            </ol>
            <p style="color:#6b7280;font-size:13px;">Questions? Reply to this email or visit <a href="${process.env.APP_URL || 'https://evoconnect.evobrand.net'}/prime/faq" style="color:#1a56db;">our FAQ</a>.</p>
        `;
        sendEmail({
            to: email,
            subject: 'EvoConnect: Your prime contractor application is under review',
            html: pendingHtml,
            text: `Hi ${contact_name},\n\nYour EvoConnect prime contractor application is under review. You'll receive a decision within 1–2 business days.\n\nQuestions? Reply to this email.`
        }).catch(e => console.error('EvoConnect [prime/register] confirmation email error:', e));

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
            <p><a href="${process.env.APP_URL || 'https://evoconnect.evobrand.net'}/admin/dashboard" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;">Review in Admin Dashboard</a></p>
        `;
        sendEmail({
            to: adminEmail,
            subject: `EvoConnect: New prime application — ${company_name}`,
            html: adminHtml,
            text: `New prime contractor application:\nCompany: ${company_name}\nContact: ${contact_name}\nEmail: ${email}\nSAM UEI: ${sam_uei}\nTier: ${subscription_tier}\n\nReview at: ${process.env.APP_URL || 'https://evoconnect.evobrand.net'}/admin/dashboard`
        }).catch(e => console.error('EvoConnect [prime/register] admin notification email error:', e));

        // Sign token and set cookie (they can access dashboard but with pending state)
        const token = signToken({ id: primeId, email, type: 'prime', name: company_name });
        setAuthCookie(res, token);

        flash(req, 'success', 'Your application has been submitted. You\'ll receive an approval email within 1–2 business days.');
        res.redirect('/prime/dashboard');

    } catch (err) {
        console.error('EvoConnect [prime/register]:', err);
        res.render('prime/register', {
            title: 'Register as a Prime Contractor | EvoConnect',
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
                title: 'Dashboard | EvoConnect Prime',
                flash: getFlash(req),
                prime,
                pendingApproval: true,
                connections: [],
                rfqs: []
            });
        }

        // Connections sent by this prime
        const [connections] = await db.execute(`
            SELECT c.*,
                CASE c.target_type
                    WHEN 'worker'   THEN w.full_name
                    WHEN 'business' THEN b.company_name
                END AS target_name,
                CASE c.target_type
                    WHEN 'worker'   THEN w.trade_category
                    WHEN 'business' THEN b.business_type
                END AS target_detail
            FROM connections c
            LEFT JOIN workers   w ON c.target_type = 'worker'   AND c.target_id = w.id
            LEFT JOIN businesses b ON c.target_type = 'business' AND c.target_id = b.id
            WHERE c.prime_id = ?
            ORDER BY c.created_at DESC
        `, [userId]);

        // RFQs by this prime
        const [rfqs] = await db.execute(
            `SELECT * FROM subcontractor_requests WHERE prime_id = ? ORDER BY created_at DESC`,
            [userId]
        );

        res.render('prime/dashboard', {
            title: 'Dashboard | EvoConnect Prime',
            flash: getFlash(req),
            prime,
            pendingApproval: false,
            connections,
            rfqs
        });

    } catch (err) {
        console.error('EvoConnect [prime/dashboard]:', err);
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
                title: 'Search Workers | EvoConnect',
                flash: { type: 'warning', message: `You've reached your ${viewLimit} monthly view limit. Upgrade to Pro for unlimited views.` },
                prime,
                results: [],
                filters: req.query,
                limitReached: true
            });
        }

        const { trade, state, travel_willingness, sam_registered } = req.query;
        const certFilter = req.query.certifications;

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
                    city, state, zip, travel_willingness, profile_pct
             FROM workers WHERE ${where}
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
            filtered = filtered.filter(w => w.certifications.includes(certFilter));
        }

        // Increment view count for basic tier
        if (prime.subscription_tier === 'basic' && filtered.length > 0) {
            await db.execute(
                'UPDATE primes SET monthly_views_used = monthly_views_used + 1 WHERE id = ?',
                [userId]
            );
        }

        res.render('prime/search-workers', {
            title: 'Search Workers | EvoConnect',
            flash: getFlash(req),
            prime,
            results: filtered,
            filters: req.query,
            limitReached: false,
            states: US_STATES
        });

    } catch (err) {
        console.error('EvoConnect [prime/search/workers]:', err);
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
                title: 'Search Businesses | EvoConnect',
                flash: { type: 'warning', message: `You've reached your ${viewLimit} monthly view limit. Upgrade to Pro for unlimited views.` },
                prime,
                results: [],
                filters: req.query,
                limitReached: true
            });
        }

        const { state, service_radius, naics_code } = req.query;
        const certFilter = req.query.certifications;

        const conditions = ['b.status = ?'];
        const params = ['active'];

        if (state)          { conditions.push('b.state = ?');          params.push(state); }
        if (service_radius) { conditions.push('b.service_radius = ?'); params.push(service_radius); }

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
            filtered = filtered.filter(b => b.certifications.includes(certFilter));
        }
        if (naics_code) {
            filtered = filtered.filter(b => b.naics_codes.includes(naics_code));
        }

        if (prime.subscription_tier === 'basic' && filtered.length > 0) {
            await db.execute(
                'UPDATE primes SET monthly_views_used = monthly_views_used + 1 WHERE id = ?',
                [userId]
            );
        }

        res.render('prime/search-businesses', {
            title: 'Search Businesses | EvoConnect',
            flash: getFlash(req),
            prime,
            results: filtered,
            filters: req.query,
            limitReached: false,
            states: US_STATES
        });

    } catch (err) {
        console.error('EvoConnect [prime/search/businesses]:', err);
        flash(req, 'error', 'Search failed. Please try again.');
        res.redirect('/prime/dashboard');
    }
});

// ── POST /prime/connect ────────────────────────────────────────────────────────
router.post('/connect', requireType('prime'), async (req, res) => {
    const { target_type, target_id, message } = req.body;
    const primeId = req.user.id;

    if (!['worker','business'].includes(target_type) || !target_id) {
        return res.status(400).json({ success: false, error: 'Invalid request.' });
    }

    try {
        const db = getDb();

        const [pRows] = await db.execute('SELECT * FROM primes WHERE id = ?', [primeId]);
        if (!pRows.length) return res.status(404).json({ success: false, error: 'Prime not found.' });

        const prime = decoratePrime(pRows[0]);
        if (prime.active !== 1) {
            return res.status(403).json({ success: false, error: 'Account pending approval.' });
        }

        await maybeResetMonthlyLimits(db, prime);

        const contactLimit = CONTACT_LIMITS[prime.subscription_tier] || 5;
        if (prime.monthly_contacts_used >= contactLimit) {
            return res.status(429).json({
                success: false,
                error: `You've reached your ${contactLimit} monthly connection limit. Upgrade your plan to send more.`
            });
        }

        // Upsert connection
        await db.execute(`
            INSERT INTO connections (prime_id, target_type, target_id, message, prime_company_name, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
            ON DUPLICATE KEY UPDATE message = VALUES(message), status = 'pending', updated_at = CURRENT_TIMESTAMP
        `, [primeId, target_type, target_id, message || null, prime.company_name]);

        // Increment contacts used
        await db.execute(
            'UPDATE primes SET monthly_contacts_used = monthly_contacts_used + 1 WHERE id = ?',
            [primeId]
        );

        // Notify the target
        let targetEmail = null, targetName = null;
        if (target_type === 'worker') {
            const [tr] = await db.execute('SELECT email, full_name FROM workers WHERE id = ?', [target_id]);
            if (tr.length) { targetEmail = tr[0].email; targetName = tr[0].full_name; }
        } else {
            const [tr] = await db.execute('SELECT email, contact_name, company_name FROM businesses WHERE id = ?', [target_id]);
            if (tr.length) { targetEmail = tr[0].email; targetName = tr[0].contact_name || tr[0].company_name; }
        }

        if (targetEmail) {
            const notifyHtml = `
                <h2 style="color:#1a56db;">New Connection Request on EvoConnect</h2>
                <p>Hi ${targetName},</p>
                <p><strong>${prime.company_name}</strong> has sent you a connection request on EvoConnect.</p>
                ${message ? `<div style="background:#f9fafb;border-left:4px solid #1a56db;padding:16px;margin:16px 0;border-radius:0 6px 6px 0;"><p style="margin:0;color:#374151;font-style:italic;">"${message}"</p></div>` : ''}
                <p>Log in to your dashboard to review this request and accept or decline.</p>
                <p><a href="${process.env.APP_URL || 'https://evoconnect.evobrand.net'}/${target_type === 'worker' ? 'labor' : 'business'}/dashboard" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;">Review Request</a></p>
            `;
            sendEmail({
                to: targetEmail,
                subject: `EvoConnect: ${prime.company_name} wants to connect`,
                html: notifyHtml,
                text: `Hi ${targetName},\n\n${prime.company_name} sent you a connection request on EvoConnect.${message ? `\n\nMessage: "${message}"` : ''}\n\nLog in to review: ${process.env.APP_URL || 'https://evoconnect.evobrand.net'}/${target_type === 'worker' ? 'labor' : 'business'}/dashboard`
            }).catch(e => console.error('EvoConnect [prime/connect] notification email error:', e));
        }

        res.json({ success: true });

    } catch (err) {
        console.error('EvoConnect [prime/connect]:', err);
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});

// ── GET /prime/rfq ─────────────────────────────────────────────────────────────
router.get('/rfq', requireType('prime'), async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;

        const [pRows] = await db.execute('SELECT * FROM primes WHERE id = ?', [userId]);
        if (!pRows.length) return res.redirect('/prime/dashboard');

        const prime = decoratePrime(pRows[0]);
        if (prime.subscription_tier !== 'enterprise') {
            flash(req, 'error', 'The RFQ system is available to Enterprise subscribers only.');
            return res.redirect('/prime/dashboard');
        }

        const [rfqs] = await db.execute(
            `SELECT * FROM subcontractor_requests WHERE prime_id = ? ORDER BY created_at DESC`,
            [userId]
        );

        res.render('prime/rfq', {
            title: 'My RFQs | EvoConnect Prime',
            flash: getFlash(req),
            prime,
            rfqs
        });

    } catch (err) {
        console.error('EvoConnect [prime/rfq GET]:', err);
        flash(req, 'error', 'Failed to load RFQs.');
        res.redirect('/prime/dashboard');
    }
});

// ── POST /prime/rfq ────────────────────────────────────────────────────────────
router.post('/rfq', requireType('prime'), async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;

        const [pRows] = await db.execute('SELECT * FROM primes WHERE id = ?', [userId]);
        if (!pRows.length) return res.redirect('/prime/dashboard');

        const prime = decoratePrime(pRows[0]);
        if (prime.subscription_tier !== 'enterprise') {
            flash(req, 'error', 'The RFQ system is available to Enterprise subscribers only.');
            return res.redirect('/prime/dashboard');
        }

        const { title, trade_service, location, timeline, contract_vehicle, description } = req.body;

        if (!title || !description) {
            flash(req, 'error', 'Title and description are required.');
            return res.redirect('/prime/rfq');
        }

        await db.execute(`
            INSERT INTO subcontractor_requests
                (prime_id, title, trade_service, location, timeline, contract_vehicle, description, status)
            VALUES (?,?,?,?,?,?,?,'open')
        `, [userId, title, trade_service || null, location || null, timeline || null, contract_vehicle || null, description]);

        flash(req, 'success', 'RFQ posted successfully.');
        res.redirect('/prime/rfq');

    } catch (err) {
        console.error('EvoConnect [prime/rfq POST]:', err);
        flash(req, 'error', 'Failed to post RFQ.');
        res.redirect('/prime/rfq');
    }
});

// ── GET /prime/faq ─────────────────────────────────────────────────────────────
router.get('/faq', (req, res) => {
    res.render('prime/faq', {
        title: 'FAQ | EvoConnect Prime',
        flash: getFlash(req),
        faqs: PRIME_FAQS
    });
});

// ── GET /prime/login ───────────────────────────────────────────────────────────
router.get('/login', (req, res) => res.redirect('/login'));

// ── Search aliases ─────────────────────────────────────────────────────────────
router.get('/search/labor',    requireType('prime'), (req, res) => res.redirect('/prime/search/workers' + (Object.keys(req.query).length ? '?' + new URLSearchParams(req.query).toString() : '')));
router.get('/search/business', requireType('prime'), (req, res) => res.redirect('/prime/search/businesses' + (Object.keys(req.query).length ? '?' + new URLSearchParams(req.query).toString() : '')));

// ── POST /prime/rfq/post alias ─────────────────────────────────────────────────
router.post('/rfq/post', requireType('prime'), async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const [pRows] = await db.execute('SELECT * FROM primes WHERE id = ?', [userId]);
        if (!pRows.length) return res.redirect('/prime/dashboard');
        const prime = decoratePrime(pRows[0]);
        if (prime.subscription_tier !== 'enterprise') {
            flash(req, 'error', 'The RFQ system is available to Enterprise subscribers only.');
            return res.redirect('/prime/rfq');
        }
        const { title, trade_service, location, timeline, contract_vehicle, description } = req.body;
        if (!title || !description) {
            flash(req, 'error', 'Title and description are required.');
            return res.redirect('/prime/rfq');
        }
        await db.execute(`
            INSERT INTO subcontractor_requests
                (prime_id, title, trade_service, location, timeline, contract_vehicle, description, status)
            VALUES (?,?,?,?,?,?,?,'open')
        `, [userId, title, trade_service || null, location || null, timeline || null, contract_vehicle || null, description]);
        flash(req, 'success', 'RFQ posted successfully.');
        res.redirect('/prime/rfq');
    } catch (err) {
        console.error('EvoConnect [prime/rfq/post]:', err);
        flash(req, 'error', 'Failed to post RFQ.');
        res.redirect('/prime/rfq');
    }
});

// ── GET /prime/connections ──────────────────────────────────────────────────────
router.get('/connections', requireType('prime'), async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;

        const [pRows] = await db.execute('SELECT * FROM primes WHERE id = ?', [userId]);
        if (!pRows.length) return res.redirect('/prime/dashboard');
        const prime = decoratePrime(pRows[0]);

        const [connections] = await db.execute(`
            SELECT c.*,
                CASE WHEN c.target_type='worker'
                    THEN w.full_name ELSE b.company_name END AS target_name,
                CASE WHEN c.target_type='worker'
                    THEN w.trade_category ELSE b.business_type END AS target_detail,
                CASE WHEN c.target_type='worker'
                    THEN w.city ELSE b.city END AS target_city,
                CASE WHEN c.target_type='worker'
                    THEN w.state ELSE b.state END AS target_state
            FROM connections c
            LEFT JOIN workers w ON c.target_type='worker' AND c.target_id=w.id
            LEFT JOIN businesses b ON c.target_type='business' AND c.target_id=b.id
            WHERE c.prime_id = ?
            ORDER BY FIELD(c.status,'pending','accepted','declined'), c.created_at DESC
        `, [userId]);

        res.render('prime/connections', {
            title: 'My Connections | EvoConnect Prime',
            flash: getFlash(req),
            prime,
            connections
        });

    } catch (err) {
        console.error('EvoConnect [prime/connections GET]:', err);
        flash(req, 'error', 'Failed to load connections.');
        res.redirect('/prime/dashboard');
    }
});

// ── GET /prime/profile/edit ────────────────────────────────────────────────────
router.get('/profile/edit', requireType('prime'), async (req, res) => {
    try {
        const db = getDb();
        const [pRows] = await db.execute('SELECT * FROM primes WHERE id = ?', [req.user.id]);
        if (!pRows.length) return res.redirect('/prime/dashboard');

        const prime = decoratePrime(pRows[0]);
        prime.naics_codes = safeJson(prime.naics_codes, []);

        res.render('prime/profile', {
            title: 'Edit Profile | EvoConnect Prime',
            flash: getFlash(req),
            prime,
            states: US_STATES,
            stateNames: STATE_NAMES,
            tiers: SUBSCRIPTION_TIERS
        });

    } catch (err) {
        console.error('EvoConnect [prime/profile/edit GET]:', err);
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
        console.error('EvoConnect [prime/profile/update POST]:', err);
        flash(req, 'error', 'Failed to update profile.');
        res.redirect('/prime/profile/edit');
    }
});

module.exports = router;
