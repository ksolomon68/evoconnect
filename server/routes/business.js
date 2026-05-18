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

// ── FAQ Data ──────────────────────────────────────────────────────────────────
const BUSINESS_FAQS = [
    {
        q: 'How is a business different from a worker on EvoConnect?',
        a: 'Workers are individual tradespeople; businesses are companies (LLCs, S-corps, sole proprietors operating under a DBA, etc.) that hold contracts and hire labor. The business portal is designed for entities that want to compete for subcontracts as a company, generate a capability statement, and maintain a full company profile with NAICS codes and certifications.'
    },
    {
        q: 'What is a capability statement and why do I need one?',
        a: 'A capability statement is a one-page business summary required by most federal and state prime contractors before they will engage you as a subcontractor. It includes your company overview, core competencies, differentiators, past performance highlights, NAICS codes, and contact information. EvoConnect generates a formatted capability statement automatically from your profile data, which you can download and customize.'
    },
    {
        q: 'What certifications matter most for small businesses seeking government subcontracts?',
        a: 'The most valuable certifications are SBA 8(a) Business Development, HUBZone, Women-Owned Small Business (WOSB/EDWOSB), Service-Disabled Veteran-Owned Small Business (SDVOSB), and for Texas contractors, the HUB (Historically Underutilized Business) certification. These designations allow prime contractors to use your firm on set-aside contract vehicles and satisfy their small business subcontracting plans.'
    },
    {
        q: 'Do I need a SAM.gov registration?',
        a: 'Yes, SAM.gov registration is required to receive payments from any federal contract, including subcontracts. Registration is free at sam.gov and must be renewed annually. You will also receive a UEI (Unique Entity Identifier) which is required on all federal contract documentation. Our checklist walks through the SAM registration process step by step.'
    },
    {
        q: 'How does the NAICS code system work?',
        a: 'NAICS (North American Industry Classification System) codes identify what industry your business operates in. Every government contract is tagged with one or more NAICS codes, and prime contractors look for subcontractors with matching codes. EvoConnect automatically suggests NAICS codes based on your registered services, and prime contractors can search for businesses by specific NAICS code. Having the right codes significantly improves your match rate.'
    },
    {
        q: 'How do prime contractors contact my business?',
        a: 'Prime contractors on EvoConnect can search businesses by certifications, NAICS codes, state, and service radius. When they find your business, they send a connection request through the platform. You\'ll receive an email notification and can review the prime\'s information before accepting. Your contact details are only shared after you accept the connection.'
    }
];

// ── Profile Completion Calculator ─────────────────────────────────────────────
function calcBusinessPct(b) {
    const certs = safeJson(b.certifications, []);
    const naics = safeJson(b.naics_codes, []);
    const fields = [
        b.company_name, b.contact_name, b.email, b.phone, b.business_type,
        certs.length > 0 ? true : null,
        b.sam_registered,
        naics.length > 0 ? true : null,
        b.service_description,
        b.city, b.state, b.zip, b.service_radius
    ];
    const filled = fields.filter(f => f !== null && f !== undefined && f !== '').length;
    return Math.round(filled / 13 * 100);
}

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

// ── GET /business ──────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    res.render('business/index', {
        title: 'Business Portal | EvoConnect',
        flash: getFlash(req)
    });
});

// ── GET /business/register ─────────────────────────────────────────────────────
router.get('/register', (req, res) => {
    res.render('business/register', {
        title: 'Register Your Business | EvoConnect',
        flash: getFlash(req),
        states: US_STATES,
        stateNames: STATE_NAMES,
        errors: [],
        values: {}
    });
});

// ── POST /business/register ────────────────────────────────────────────────────
router.post('/register', regLimiter, async (req, res) => {
    const v = req.body;
    const errors = [];

    const company_name  = (v.company_name || '').trim();
    const contact_name  = (v.contact_name || '').trim();
    const email         = (v.email || '').trim().toLowerCase();
    const phone         = (v.phone || '').trim();
    const password      = v.password || '';
    const confirm_pw    = v.confirm_password || '';
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
    if (!city)          errors.push('City is required.');
    if (!state)         errors.push('State is required.');
    if (!zip)           errors.push('ZIP code is required.');

    if (errors.length) {
        return res.render('business/register', {
            title: 'Register Your Business | EvoConnect',
            flash: null,
            states: US_STATES,
            stateNames: STATE_NAMES,
            errors,
            values: v
        });
    }

    try {
        const db = getDb();

        // Check email uniqueness
        const [existing] = await db.execute('SELECT id FROM businesses WHERE email = ?', [email]);
        if (existing.length) {
            return res.render('business/register', {
                title: 'Register Your Business | EvoConnect',
                flash: null,
                states: US_STATES,
                stateNames: STATE_NAMES,
                errors: ['An account with that email already exists.'],
                values: v
            });
        }

        const password_hash = await bcrypt.hash(password, 12);

        // Parse certifications and NAICS codes
        const certifications = Array.isArray(v.certifications) ? v.certifications : (v.certifications ? [v.certifications] : []);
        let naics_codes = [];
        try { naics_codes = JSON.parse(v.naics_codes_json || '[]'); } catch {}

        const [result] = await db.execute(`
            INSERT INTO businesses
                (company_name, contact_name, email, password_hash, phone, business_type,
                 certifications, sam_registered, naics_codes, service_description,
                 city, state, zip, service_radius, profile_pct)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `, [
            company_name, contact_name, email, password_hash, phone,
            v.business_type || null,
            JSON.stringify(certifications),
            v.sam_registered || 'no',
            JSON.stringify(naics_codes),
            v.service_description || null,
            city, state, zip,
            v.service_radius || 'local',
            0
        ]);

        const bizId = result.insertId;

        // Recalculate profile_pct
        const [bRows] = await db.execute('SELECT * FROM businesses WHERE id = ?', [bizId]);
        const pct = calcBusinessPct(bRows[0]);
        await db.execute('UPDATE businesses SET profile_pct = ? WHERE id = ?', [pct, bizId]);

        // Send confirmation email (non-blocking)
        const confirmHtml = `
            <h2 style="color:#1a56db;">Welcome to EvoConnect, ${company_name}!</h2>
            <p>Hi ${contact_name},</p>
            <p>Your business profile is now live on EvoConnect and visible to approved prime contractors seeking subcontractors in your area.</p>
            <h3 style="color:#374151;">Recommended next steps:</h3>
            <ol>
                <li><strong>Complete the Vendor Readiness Checklist</strong> — Ensures your profile is fully visible and ready for subcontract opportunities.</li>
                <li><strong>Generate your Capability Statement</strong> — A one-page formatted document you can send to prime contractors immediately. Available in your dashboard.</li>
                <li><strong>Add your NAICS codes</strong> — Primes search by NAICS code. The more accurate your codes, the better your match rate.</li>
                <li><strong>Obtain set-aside certifications</strong> — 8(a), HUBZone, WOSB, and SDVOSB certifications significantly increase your opportunities.</li>
            </ol>
            <p><a href="${process.env.APP_URL || 'https://evoconnect.evobrand.net'}/business/dashboard" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;">Go to My Dashboard</a></p>
        `;
        sendEmail({
            to: email,
            subject: 'Welcome to EvoConnect — your business profile is live',
            html: confirmHtml,
            text: `Welcome to EvoConnect, ${company_name}!\n\nYour profile is live. Log in: ${process.env.APP_URL || 'https://evoconnect.evobrand.net'}/business/dashboard`
        }).catch(e => console.error('EvoConnect [business/register] email error:', e));

        // Sign in
        const token = signToken({ id: bizId, email, type: 'business', name: company_name });
        setAuthCookie(res, token);

        flash(req, 'success', `Welcome, ${company_name}! Your profile is live. Generate your capability statement from the dashboard.`);
        res.redirect('/business/dashboard');

    } catch (err) {
        console.error('EvoConnect [business/register]:', err);
        res.render('business/register', {
            title: 'Register Your Business | EvoConnect',
            flash: null,
            states: US_STATES,
            stateNames: STATE_NAMES,
            errors: ['A server error occurred. Please try again.'],
            values: v
        });
    }
});

// ── GET /business/dashboard ────────────────────────────────────────────────────
router.get('/dashboard', requireType('business'), async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;

        const [bRows] = await db.execute('SELECT * FROM businesses WHERE id = ?', [userId]);
        if (!bRows.length) {
            flash(req, 'error', 'Business profile not found.');
            return res.redirect('/login');
        }

        const business = bRows[0];
        business.certifications = safeJson(business.certifications, []);
        const naicsCodesArray = safeJson(business.naics_codes, []);
        business.naics_codes = naicsCodesArray;

        // NAICS code details
        let naicsDetails = [];
        if (naicsCodesArray.length) {
            const placeholders = naicsCodesArray.map(() => '?').join(',');
            const [nd] = await db.execute(
                `SELECT * FROM naics_codes WHERE code IN (${placeholders})`,
                naicsCodesArray
            );
            naicsDetails = nd;
        }

        // Checklist progress
        const [checklist] = await db.execute(
            `SELECT track, item_key, completed FROM checklist_progress WHERE user_type='business' AND user_id = ?`,
            [userId]
        );
        const checklistByTrack = {};
        for (const row of checklist) {
            if (!checklistByTrack[row.track]) checklistByTrack[row.track] = {};
            checklistByTrack[row.track][row.item_key] = row.completed;
        }

        // Connections
        const [connections] = await db.execute(`
            SELECT c.*, p.company_name as prime_company_name, p.contact_name as prime_contact
            FROM connections c
            JOIN primes p ON c.prime_id = p.id
            WHERE c.target_type = 'business' AND c.target_id = ?
            ORDER BY c.created_at DESC
        `, [userId]);

        // Resources
        const [resources] = await db.execute(`
            SELECT * FROM resources
            WHERE audience IN ('all','business') AND status = 'active'
            ORDER BY sort_order ASC LIMIT 4
        `);

        res.render('business/dashboard', {
            title: 'My Dashboard | EvoConnect Business',
            flash: getFlash(req),
            business,
            naicsDetails,
            checklistByTrack,
            connections,
            resources
        });

    } catch (err) {
        console.error('EvoConnect [business/dashboard]:', err);
        flash(req, 'error', 'Failed to load dashboard.');
        res.redirect('/login');
    }
});

// ── GET /business/profile ──────────────────────────────────────────────────────
router.get('/profile', requireType('business'), async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.execute('SELECT * FROM businesses WHERE id = ?', [req.user.id]);
        if (!rows.length) return res.redirect('/business/dashboard');

        const business = rows[0];
        business.certifications = safeJson(business.certifications, []);
        business.naics_codes = safeJson(business.naics_codes, []);

        res.render('business/profile', {
            title: 'My Profile | EvoConnect Business',
            flash: getFlash(req),
            business,
            states: US_STATES,
            stateNames: STATE_NAMES
        });

    } catch (err) {
        console.error('EvoConnect [business/profile GET]:', err);
        flash(req, 'error', 'Failed to load profile.');
        res.redirect('/business/dashboard');
    }
});

// ── POST /business/profile ─────────────────────────────────────────────────────
router.post('/profile', requireType('business'), async (req, res) => {
    try {
        const db = getDb();
        const v = req.body;
        const userId = req.user.id;

        const certifications = Array.isArray(v.certifications) ? v.certifications : (v.certifications ? [v.certifications] : []);
        let naics_codes = [];
        try { naics_codes = JSON.parse(v.naics_codes_json || '[]'); } catch {}

        await db.execute(`
            UPDATE businesses SET
                company_name = ?, contact_name = ?, phone = ?, business_type = ?,
                certifications = ?, sam_registered = ?, naics_codes = ?,
                service_description = ?, city = ?, state = ?, zip = ?, service_radius = ?
            WHERE id = ?
        `, [
            (v.company_name || '').trim(),
            (v.contact_name || '').trim(),
            (v.phone || '').trim(),
            v.business_type || null,
            JSON.stringify(certifications),
            v.sam_registered || 'no',
            JSON.stringify(naics_codes),
            v.service_description || null,
            (v.city || '').trim(),
            v.state || '',
            (v.zip || '').trim(),
            v.service_radius || 'local',
            userId
        ]);

        // Recalculate profile_pct
        const [bRows] = await db.execute('SELECT * FROM businesses WHERE id = ?', [userId]);
        const pct = calcBusinessPct(bRows[0]);
        await db.execute('UPDATE businesses SET profile_pct = ? WHERE id = ?', [pct, userId]);

        flash(req, 'success', 'Profile updated successfully.');
        res.redirect('/business/profile');

    } catch (err) {
        console.error('EvoConnect [business/profile POST]:', err);
        flash(req, 'error', 'Failed to update profile.');
        res.redirect('/business/profile');
    }
});

// ── POST /business/checklist ───────────────────────────────────────────────────
router.post('/checklist', requireType('business'), async (req, res) => {
    const { track, item_key, completed } = req.body;
    const userId = req.user.id;
    const isCompleted = completed === true || completed === 'true' || completed === 1 || completed === '1';

    try {
        const db = getDb();

        if (isCompleted) {
            await db.execute(`
                INSERT INTO checklist_progress (user_type, user_id, track, item_key, completed)
                VALUES ('business', ?, ?, ?, 1)
                ON DUPLICATE KEY UPDATE completed = 1, completed_at = CURRENT_TIMESTAMP
            `, [userId, track, item_key]);
        } else {
            await db.execute(
                `DELETE FROM checklist_progress WHERE user_type='business' AND user_id=? AND track=? AND item_key=?`,
                [userId, track, item_key]
            );
        }

        const TRACK_ITEMS = {
            federal:         ['sam-register','uei-number','naics-identify','cage-code','representations','capability-statement','past-performance','banking'],
            state:           ['state-vendor','hub-lookup','state-certify','local-bid-list','prequalify','bonding','insurance','references'],
            subcontractor:   ['llc-setup','ein-number','insurance-basic','w9-ready','direct-deposit','lien-waiver','payment-terms','references-sub']
        };
        const trackItems = TRACK_ITEMS[track] || [];
        const [completedRows] = await db.execute(
            `SELECT COUNT(*) AS cnt FROM checklist_progress WHERE user_type='business' AND user_id=? AND track=? AND completed=1`,
            [userId, track]
        );
        const completedCount = completedRows[0].cnt;
        const pct = trackItems.length > 0 ? Math.round(completedCount / trackItems.length * 100) : 0;

        const MILESTONES = [25, 50, 100];
        const prevCount = isCompleted ? completedCount - 1 : completedCount + 1;
        const prevPct = trackItems.length > 0 ? Math.round(prevCount / trackItems.length * 100) : 0;

        for (const milestone of MILESTONES) {
            if (prevPct < milestone && pct >= milestone) {
                const [bRows] = await db.execute('SELECT company_name, contact_name, email FROM businesses WHERE id = ?', [userId]);
                if (bRows.length) {
                    const { company_name, contact_name, email } = bRows[0];
                    const milestoneHtml = `
                        <h2 style="color:#1a56db;">${company_name} has hit ${milestone}% on the ${track} checklist!</h2>
                        <p>Hi ${contact_name},</p>
                        <p>Congratulations — your business has completed <strong>${milestone}%</strong> of the <strong>${track.charAt(0).toUpperCase() + track.slice(1)} Contracting</strong> readiness track on EvoConnect.</p>
                        ${milestone === 100 ? '<p><strong>Your business is fully ready in this track!</strong> Prime contractors see your completed readiness score when searching for subcontractors.</p>' : '<p>Keep going — each completed item increases your visibility to prime contractors searching in your area.</p>'}
                        <p><a href="${process.env.APP_URL || 'https://evoconnect.evobrand.net'}/business/dashboard" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;">Continue Checklist</a></p>
                    `;
                    sendEmail({
                        to: email,
                        subject: `EvoConnect: ${company_name} hit ${milestone}% on the ${track} checklist!`,
                        html: milestoneHtml,
                        text: `Congratulations! ${company_name} has completed ${milestone}% of the ${track} checklist on EvoConnect.`
                    }).catch(e => console.error('EvoConnect [business/checklist] milestone email error:', e));
                }
                break;
            }
        }

        res.json({ success: true, pct });

    } catch (err) {
        console.error('EvoConnect [business/checklist]:', err);
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});

// ── POST /business/connections/:id ─────────────────────────────────────────────
router.post('/connections/:id', requireType('business'), async (req, res) => {
    const connectionId = parseInt(req.params.id);
    const { action } = req.body;
    const userId = req.user.id;

    if (!['accept', 'decline'].includes(action)) {
        return res.status(400).json({ success: false, error: 'Invalid action.' });
    }

    try {
        const db = getDb();

        const [rows] = await db.execute(
            `SELECT c.*, p.email as prime_email, p.company_name as prime_company, p.contact_name as prime_contact
             FROM connections c JOIN primes p ON c.prime_id = p.id
             WHERE c.id = ? AND c.target_type = 'business' AND c.target_id = ?`,
            [connectionId, userId]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, error: 'Connection not found.' });
        }

        const conn = rows[0];
        const newStatus = action === 'accept' ? 'accepted' : 'declined';
        await db.execute('UPDATE connections SET status = ? WHERE id = ?', [newStatus, connectionId]);

        if (action === 'accept') {
            const [bRows] = await db.execute('SELECT company_name, contact_name, email, phone FROM businesses WHERE id = ?', [userId]);
            if (bRows.length) {
                const b = bRows[0];
                const notifyHtml = `
                    <h2 style="color:#1a56db;">Connection Accepted on EvoConnect</h2>
                    <p>Hi ${conn.prime_contact},</p>
                    <p>Good news — <strong>${b.company_name}</strong> has accepted your connection request on EvoConnect.</p>
                    <table style="border-collapse:collapse;width:100%;margin:16px 0;">
                        <tr><td style="padding:8px;font-weight:700;color:#374151;">Company</td><td style="padding:8px;">${b.company_name}</td></tr>
                        <tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;color:#374151;">Contact</td><td style="padding:8px;">${b.contact_name}</td></tr>
                        <tr><td style="padding:8px;font-weight:700;color:#374151;">Email</td><td style="padding:8px;"><a href="mailto:${b.email}" style="color:#1a56db;">${b.email}</a></td></tr>
                        <tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;color:#374151;">Phone</td><td style="padding:8px;">${b.phone}</td></tr>
                    </table>
                    <p><a href="${process.env.APP_URL || 'https://evoconnect.evobrand.net'}/prime/dashboard" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;">View Dashboard</a></p>
                `;
                sendEmail({
                    to: conn.prime_email,
                    subject: `EvoConnect: ${b.company_name} accepted your connection request`,
                    html: notifyHtml,
                    text: `${b.company_name} accepted your connection request on EvoConnect.\nContact: ${b.contact_name}\nEmail: ${b.email}\nPhone: ${b.phone}`
                }).catch(e => console.error('EvoConnect [business/connections] prime email error:', e));
            }
        }

        res.json({ success: true });

    } catch (err) {
        console.error('EvoConnect [business/connections]:', err);
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});

// ── GET /business/capability-statement ────────────────────────────────────────
router.get('/capability-statement', requireType('business'), async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.execute('SELECT * FROM businesses WHERE id = ?', [req.user.id]);
        if (!rows.length) return res.redirect('/business/dashboard');

        const business = rows[0];
        business.certifications = safeJson(business.certifications, []);
        const naicsCodesArray = safeJson(business.naics_codes, []);
        business.naics_codes = naicsCodesArray;

        let naicsDetails = [];
        if (naicsCodesArray.length) {
            const placeholders = naicsCodesArray.map(() => '?').join(',');
            const [nd] = await db.execute(
                `SELECT * FROM naics_codes WHERE code IN (${placeholders})`,
                naicsCodesArray
            );
            naicsDetails = nd;
        }

        res.setHeader('X-Page-For-Print', 'true');
        res.render('business/capability-statement', {
            title: `${business.company_name} — Capability Statement`,
            flash: getFlash(req),
            business,
            naicsDetails
        });

    } catch (err) {
        console.error('EvoConnect [business/capability-statement GET]:', err);
        flash(req, 'error', 'Failed to generate capability statement.');
        res.redirect('/business/dashboard');
    }
});

// ── POST /business/capability-statement/generate ──────────────────────────────
router.post('/capability-statement/generate', requireType('business'), async (req, res) => {
    try {
        const db = getDb();
        await db.execute(
            'UPDATE businesses SET capability_statement_generated_at = NOW() WHERE id = ?',
            [req.user.id]
        );
        res.redirect('/business/capability-statement');
    } catch (err) {
        console.error('EvoConnect [business/capability-statement/generate]:', err);
        flash(req, 'error', 'Failed to generate capability statement.');
        res.redirect('/business/dashboard');
    }
});

// ── GET /business/faq ──────────────────────────────────────────────────────────
router.get('/faq', (req, res) => {
    res.render('business/faq', {
        title: 'FAQ | EvoConnect Business',
        flash: getFlash(req),
        faqs: BUSINESS_FAQS
    });
});

// ── POST /business/profile/section ────────────────────────────────────────────
router.post('/profile/section', requireType('business'), async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const section = req.body.section;

        const updates = {};

        switch (section) {
            case 'basic':
                if (req.body.company_name !== undefined) updates.company_name = (req.body.company_name || '').trim();
                if (req.body.contact_name !== undefined) updates.contact_name = (req.body.contact_name || '').trim();
                if (req.body.phone        !== undefined) updates.phone        = (req.body.phone        || '').trim();
                break;
            case 'business':
                if (req.body.business_type !== undefined) updates.business_type = req.body.business_type || null;
                if (req.body.service_description !== undefined) updates.service_description = req.body.service_description || null;
                break;
            case 'certifications': {
                const certs = Array.isArray(req.body.certifications)
                    ? req.body.certifications
                    : (req.body.certifications ? [req.body.certifications] : []);
                updates.certifications = JSON.stringify(certs);
                break;
            }
            case 'vendor':
                if (req.body.sam_registered !== undefined) updates.sam_registered = req.body.sam_registered || 'no';
                if (req.body.sam_uei        !== undefined) updates.sam_uei        = (req.body.sam_uei || '').trim();
                break;
            case 'naics': {
                const naics = safeJson(req.body.naics_codes_json, []);
                updates.naics_codes = JSON.stringify(naics);
                break;
            }
            case 'location':
                if (req.body.city          !== undefined) updates.city          = (req.body.city   || '').trim();
                if (req.body.state         !== undefined) updates.state         = req.body.state    || '';
                if (req.body.zip           !== undefined) updates.zip           = (req.body.zip     || '').trim();
                if (req.body.service_radius !== undefined) updates.service_radius = req.body.service_radius || 'local';
                break;
        }

        if (Object.keys(updates).length) {
            const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
            await db.execute(`UPDATE businesses SET ${setClauses} WHERE id = ?`, [...Object.values(updates), userId]);
        }

        const [bRows] = await db.execute('SELECT * FROM businesses WHERE id = ?', [userId]);
        const pct = calcBusinessPct(bRows[0]);
        await db.execute('UPDATE businesses SET profile_pct = ? WHERE id = ?', [pct, userId]);

        const wantsJson = req.headers.accept && req.headers.accept.includes('application/json');
        if (wantsJson) return res.json({ success: true, pct });
        flash(req, 'success', 'Section saved.');
        res.redirect('/business/profile/edit');

    } catch (err) {
        console.error('EvoConnect [business/profile/section]:', err);
        const wantsJson = req.headers.accept && req.headers.accept.includes('application/json');
        if (wantsJson) return res.status(500).json({ success: false, error: 'Server error.' });
        flash(req, 'error', 'Failed to save section.');
        res.redirect('/business/profile/edit');
    }
});

// ── GET /business/login ────────────────────────────────────────────────────────
router.get('/login', (req, res) => res.redirect('/login'));

// ── GET /business/profile/edit ─────────────────────────────────────────────────
router.get('/profile/edit', requireType('business'), async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.execute('SELECT * FROM businesses WHERE id = ?', [req.user.id]);
        if (!rows.length) return res.redirect('/business/dashboard');

        const business = rows[0];
        business.certifications = safeJson(business.certifications, []);
        business.naics_codes = safeJson(business.naics_codes, []);

        res.render('business/profile', {
            title: 'Edit Profile | EvoConnect Business',
            flash: getFlash(req),
            business,
            states: US_STATES,
            stateNames: STATE_NAMES
        });

    } catch (err) {
        console.error('EvoConnect [business/profile/edit GET]:', err);
        flash(req, 'error', 'Failed to load profile.');
        res.redirect('/business/dashboard');
    }
});

// ── POST /business/profile/update ─────────────────────────────────────────────
router.post('/profile/update', requireType('business'), async (req, res) => {
    try {
        const db = getDb();
        const v = req.body;
        const userId = req.user.id;

        const certifications = Array.isArray(v.certifications) ? v.certifications : (v.certifications ? [v.certifications] : []);
        let naics_codes = [];
        try { naics_codes = JSON.parse(v.naics_codes_json || '[]'); } catch {}

        await db.execute(`
            UPDATE businesses SET
                company_name = ?, contact_name = ?, phone = ?, business_type = ?,
                certifications = ?, sam_registered = ?, naics_codes = ?,
                service_description = ?, city = ?, state = ?, zip = ?, service_radius = ?
            WHERE id = ?
        `, [
            (v.company_name || '').trim(),
            (v.contact_name || '').trim(),
            (v.phone || '').trim(),
            v.business_type || null,
            JSON.stringify(certifications),
            v.sam_registered || 'no',
            JSON.stringify(naics_codes),
            v.service_description || null,
            (v.city || '').trim(),
            v.state || '',
            (v.zip || '').trim(),
            v.service_radius || 'local',
            userId
        ]);

        const [bRows] = await db.execute('SELECT * FROM businesses WHERE id = ?', [userId]);
        const pct = calcBusinessPct(bRows[0]);
        await db.execute('UPDATE businesses SET profile_pct = ? WHERE id = ?', [pct, userId]);

        flash(req, 'success', 'Profile updated successfully.');
        res.redirect('/business/profile/edit');

    } catch (err) {
        console.error('EvoConnect [business/profile/update POST]:', err);
        flash(req, 'error', 'Failed to update profile.');
        res.redirect('/business/profile/edit');
    }
});

// ── GET /business/checklist ────────────────────────────────────────────────────
router.get('/checklist', requireType('business'), async (req, res) => {
    try {
        const db = getDb();
        const [bRows] = await db.execute('SELECT * FROM businesses WHERE id = ?', [req.user.id]);
        const business = bRows[0] || {};
        business.certifications = safeJson(business.certifications, []);

        const [progressRows] = await db.execute(
            `SELECT track, item_key FROM checklist_progress WHERE user_type='business' AND user_id=? AND completed=1`,
            [req.user.id]
        );
        const checklistByTrack = { federal: [], state: [], subcontractor: [] };
        for (const row of progressRows) {
            if (checklistByTrack[row.track]) checklistByTrack[row.track].push(row.item_key);
        }

        res.render('business/checklist', {
            title: 'Vendor Readiness Checklist | EvoConnect Business',
            flash: getFlash(req),
            business,
            checklistByTrack
        });

    } catch (err) {
        console.error('EvoConnect [business/checklist GET]:', err);
        flash(req, 'error', 'Failed to load checklist.');
        res.redirect('/business/dashboard');
    }
});

// ── GET /business/connections ──────────────────────────────────────────────────
router.get('/connections', requireType('business'), async (req, res) => {
    try {
        const db = getDb();
        const [connections] = await db.execute(
            `SELECT c.*, p.company_name AS prime_company_name, p.contact_name AS prime_contact, p.email AS prime_email
             FROM connections c
             JOIN primes p ON c.prime_id = p.id
             WHERE c.target_type = 'business' AND c.target_id = ?
             ORDER BY FIELD(c.status,'pending','accepted','declined'), c.created_at DESC`,
            [req.user.id]
        );

        res.render('business/connections', {
            title: 'My Connections | EvoConnect Business',
            flash: getFlash(req),
            connections
        });

    } catch (err) {
        console.error('EvoConnect [business/connections GET]:', err);
        flash(req, 'error', 'Failed to load connections.');
        res.redirect('/business/dashboard');
    }
});

module.exports = router;
