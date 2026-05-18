'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const { getDb } = require('../database');
const { requireType, signToken, setAuthCookie } = require('../middleware/auth');
const { sendEmail } = require('../config/email');
const router = express.Router();

// ── NAICS Map ─────────────────────────────────────────────────────────────────
const NAICS_MAP = {
    'cdl-trucking':         ['484110','484121','484122','488490'],
    'concrete-cement':      ['238110','238140','237310'],
    'construction-general': ['236220','238130','238910','238320','238160','238990'],
    'fiber-broadband':      ['237130','517311'],
    'cell-site-tech':       ['517311','238210'],
    'structured-cabling':   ['238210','517410'],
    'cloud-network-infra':  ['541512','517210','541330'],
    'welding-fabrication':  ['332312','332313'],
    'electrical':           ['238210'],
    'plumbing-hvac':        ['238220'],
    'landscaping':          ['561730'],
    'it-support':           ['541511','541512','811212'],
    'admin-clerical':       ['561110','561320'],
    'other':                [],
};

// ── US States ─────────────────────────────────────────────────────────────────
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];
const STATE_NAMES = { AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia' };

// ── FAQ Data ──────────────────────────────────────────────────────────────────
const LABOR_FAQS = [
    {
        q: 'Is EvoConnect free to join?',
        a: 'Yes. Registering your skills profile and using the vendor readiness checklist is completely free. EvoConnect is funded through prime contractor subscriptions, not worker fees.'
    },
    {
        q: 'What is SAM.gov and do I need it?',
        a: 'SAM.gov (System for Award Management) is the federal government\'s official vendor database. Any individual or company seeking to work on federal contracts — either directly or as a subcontractor — must be registered. Registration is free and takes about 10–15 minutes. Our checklist walks you through every step. If you already have a DUNS/UEI number, have it ready. Registration must be renewed annually.'
    },
    {
        q: 'What kinds of workers does EvoConnect serve?',
        a: 'EvoConnect serves skilled tradespeople, technical specialists, and service professionals across a wide range of fields — including fiber/broadband installation, CDL trucking, electrical, concrete and civil construction, IT and cloud infrastructure, welding, HVAC/plumbing, landscaping, and administrative roles. If your skill is relevant to government infrastructure or services, you belong here.'
    },
    {
        q: 'How do prime contractors find me?',
        a: 'Once you complete your profile, prime contractors subscribed to EvoConnect can search for workers by trade, certifications, location, and availability. When a prime is interested, they send a connection request through the platform. You can review the request, see the prime\'s company information, and accept or decline. Your contact information is only shared after you accept.'
    },
    {
        q: 'Do I need to form a business to use this platform?',
        a: 'No — you can register as an individual worker. However, many federal and state contracts require subcontractors to operate as a legal business entity (LLC, sole proprietorship, or corporation). Our checklist covers how to form a basic business entity if you choose to, and explains the difference between working as an employee of a sub versus running your own firm.'
    },
    {
        q: 'What certifications help me get more work?',
        a: 'For government contracting, the most valuable certifications are those tied to set-aside programs: SBA 8(a), HUBZone, Service-Disabled Veteran-Owned Small Business (SDVOSB), Women-Owned Small Business (WOSB), and state-level equivalents like Texas HUB or California DVBE. Trade-specific certifications (OSHA-10/30, BICSI, CompTIA, CDL Class A/B, AWS Welding, NABCEP solar) also significantly improve your visibility on the platform.'
    },
    {
        q: 'How does the Vendor Readiness Checklist work?',
        a: 'The checklist is organized into three tracks: Federal Contracting, State & Local Contracting, and Subcontracting Readiness. Each track contains 8–12 action items. As you complete items, your readiness score updates in real time. When you hit 25%, 50%, and 100%, you\'ll receive milestone emails with next steps. Prime contractors can see your readiness score, so a higher score improves your chances of being contacted.'
    },
    {
        q: 'Is my profile information kept private?',
        a: 'Your profile is visible only to verified, approved prime contractors on the platform. Your full contact information (phone and email) is not shown to primes until you accept a connection request. You can deactivate your profile at any time from your profile settings page.'
    },
    {
        q: 'Can I upload a resume or portfolio?',
        a: 'Yes. During registration and from your profile page, you can upload a resume in PDF or Word format (up to 5 MB). This document is visible to prime contractors who have connected with you. We recommend keeping your resume focused on relevant experience and including any certifications or licenses prominently on the first page.'
    },
    {
        q: 'What happens after I register?',
        a: 'After registering, you\'ll receive a confirmation email with a summary of next steps. Your profile is immediately searchable by prime contractors. We recommend completing the Vendor Readiness Checklist as your first task — it walks you through SAM registration, business entity setup, and certification pathways, and increases your visibility in search results.'
    }
];

// ── Profile Completion Calculator ─────────────────────────────────────────────
function calcWorkerPct(w) {
    const fields = [
        w.full_name, w.email, w.phone, w.trade_category,
        (w.skills && (Array.isArray(w.skills) ? w.skills.length : JSON.parse(w.skills || '[]').length) > 0) ? true : null,
        w.certifications, w.years_experience, w.sam_registered,
        w.business_entity, w.city, w.state, w.zip, w.travel_willingness
    ];
    const filled = fields.filter(f => f !== null && f !== undefined && f !== '').length;
    return Math.round(filled / 13 * 100);
}

// ── Multer Upload ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../uploads/resumes'));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `resume_${Date.now()}${ext}`);
    }
});
const uploadResume = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.doc', '.docx'];
        if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
        else cb(new Error('Only PDF and Word documents are allowed.'));
    }
});

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

// ── GET /labor ─────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    res.render('labor/index', {
        title: 'Labor Portal | EvoConnect',
        flash: getFlash(req)
    });
});

// ── GET /labor/register ────────────────────────────────────────────────────────
router.get('/register', (req, res) => {
    const step = parseInt(req.query.step) || 1;
    res.render('labor/register', {
        title: 'Register | EvoConnect Labor',
        flash: getFlash(req),
        states: US_STATES,
        stateNames: STATE_NAMES,
        step,
        errors: [],
        values: {}
    });
});

// ── POST /labor/register ───────────────────────────────────────────────────────
router.post('/register', (req, res, next) => {
    uploadResume.single('resume')(req, res, (err) => {
        if (err instanceof multer.MulterError || err) {
            req.fileError = err.message || 'File upload error.';
        }
        next();
    });
}, async (req, res) => {
    const v = req.body;
    const errors = [];

    const full_name    = (v.full_name || '').trim();
    const email        = (v.email || '').trim().toLowerCase();
    const phone        = (v.phone || '').trim();
    const password     = v.password || '';
    const confirm_pw   = v.confirm_password || '';
    const trade_category = (v.trade_category || '').trim();
    const city         = (v.city || '').trim();
    const state        = (v.state || '').trim();
    const zip          = (v.zip || '').trim();

    if (!full_name)      errors.push('Full name is required.');
    if (!email)          errors.push('Email address is required.');
    else if (!validateEmail(email)) errors.push('Please enter a valid email address.');
    if (!phone)          errors.push('Phone number is required.');
    if (!password)       errors.push('Password is required.');
    else if (password.length < 8) errors.push('Password must be at least 8 characters.');
    if (password !== confirm_pw)  errors.push('Passwords do not match.');
    if (!trade_category) errors.push('Trade category is required.');
    if (!city)           errors.push('City is required.');
    if (!state)          errors.push('State is required.');
    if (!zip)            errors.push('ZIP code is required.');
    if (req.fileError)   errors.push(req.fileError);

    if (errors.length) {
        return res.render('labor/register', {
            title: 'Register | EvoConnect Labor',
            flash: null,
            states: US_STATES,
            stateNames: STATE_NAMES,
            step: parseInt(v.step) || 1,
            errors,
            values: v
        });
    }

    try {
        const db = getDb();

        // Check email uniqueness
        const [existing] = await db.execute('SELECT id FROM workers WHERE email = ?', [email]);
        if (existing.length) {
            return res.render('labor/register', {
                title: 'Register | EvoConnect Labor',
                flash: null,
                states: US_STATES,
                stateNames: STATE_NAMES,
                errors: ['An account with that email already exists.'],
                values: v
            });
        }

        const password_hash = await bcrypt.hash(password, 12);

        // Parse skills from JSON hidden field, certifications from checkboxes
        let skills = [];
        try { skills = JSON.parse(v.skills_json || '[]'); } catch {}
        const certifications = Array.isArray(v.certifications) ? v.certifications : (v.certifications ? [v.certifications] : []);

        const resume_path = req.file ? req.file.filename : null;

        const [result] = await db.execute(`
            INSERT INTO workers
                (full_name, email, password_hash, phone, trade_category, skills, certifications,
                 years_experience, sam_registered, business_entity, city, state, zip,
                 travel_willingness, experience_summary, resume_path, profile_pct)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `, [
            full_name, email, password_hash, phone, trade_category,
            JSON.stringify(skills),
            JSON.stringify(certifications),
            parseInt(v.years_experience) || 0,
            v.sam_registered || 'no',
            v.entity_type || v.business_entity || 'none',
            city, state, zip,
            v.travel_willingness || 'local',
            v.experience_summary || null,
            resume_path,
            0
        ]);

        const workerId = result.insertId;

        // NAICS auto-match
        const codes = NAICS_MAP[trade_category] || [];
        for (const code of codes) {
            const [nc] = await db.execute('SELECT code FROM naics_codes WHERE code = ?', [code]);
            if (nc.length) {
                await db.execute(
                    'INSERT IGNORE INTO worker_matches (worker_id, naics_code) VALUES (?,?)',
                    [workerId, code]
                );
            }
        }

        // Calculate and update profile_pct
        const [wRows] = await db.execute('SELECT * FROM workers WHERE id = ?', [workerId]);
        const pct = calcWorkerPct(wRows[0]);
        await db.execute('UPDATE workers SET profile_pct = ? WHERE id = ?', [pct, workerId]);

        // Send confirmation email (non-blocking)
        const confirmHtml = `
            <h2 style="color:#1a56db;">Welcome to EvoConnect, ${full_name}!</h2>
            <p>Your labor profile has been created and is now visible to approved prime contractors on the platform.</p>
            <h3 style="color:#374151;">Here's what happens next:</h3>
            <ol>
                <li><strong>Complete the Vendor Readiness Checklist</strong> — This boosts your profile ranking and walks you through SAM.gov registration, business entity setup, and key certifications.</li>
                <li><strong>Prime contractors will find you</strong> — When a prime sends a connection request, you'll receive an email and can accept or decline from your dashboard.</li>
                <li><strong>Build your certifications</strong> — Workers with at least one set-aside certification (8(a), SDVOSB, HUBZone, WOSB) receive significantly more connection requests.</li>
            </ol>
            <p><a href="${process.env.APP_URL || 'https://evoconnect.evobrand.net'}/labor/dashboard" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;">Go to My Dashboard</a></p>
            <p style="color:#6b7280;font-size:13px;">Questions? Reply to this email or visit our FAQ at <a href="${process.env.APP_URL || 'https://evoconnect.evobrand.net'}/labor/faq" style="color:#1a56db;">evoconnect.evobrand.net/labor/faq</a></p>
        `;
        sendEmail({
            to: email,
            subject: 'Welcome to EvoConnect — here\'s what happens next',
            html: confirmHtml,
            text: `Welcome to EvoConnect, ${full_name}!\n\nYour labor profile is live. Log in at: ${process.env.APP_URL || 'https://evoconnect.evobrand.net'}/labor/dashboard\n\nNext steps:\n1. Complete the Vendor Readiness Checklist\n2. Watch for prime contractor connection requests\n3. Add certifications to improve visibility`
        }).catch(e => console.error('EvoConnect [labor/register] email error:', e));

        // Sign in
        const token = signToken({ id: workerId, email, type: 'worker', name: full_name });
        setAuthCookie(res, token);

        flash(req, 'success', 'Welcome to EvoConnect! Your profile is live — start with the checklist below.');
        res.redirect('/labor/dashboard');

    } catch (err) {
        console.error('EvoConnect [labor/register]:', err);
        res.render('labor/register', {
            title: 'Register | EvoConnect Labor',
            flash: null,
            states: US_STATES,
            stateNames: STATE_NAMES,
            errors: ['A server error occurred. Please try again.'],
            values: v
        });
    }
});

// ── GET /labor/dashboard ───────────────────────────────────────────────────────
router.get('/dashboard', requireType('worker'), async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;

        const [wRows] = await db.execute('SELECT * FROM workers WHERE id = ?', [userId]);
        if (!wRows.length) {
            flash(req, 'error', 'Worker profile not found.');
            return res.redirect('/login');
        }
        const worker = wRows[0];
        worker.skills = safeJson(worker.skills, []);
        worker.certifications = safeJson(worker.certifications, []);

        // NAICS matches
        const [matches] = await db.execute(`
            SELECT wm.naics_code, nc.description, nc.avg_contract_size, nc.set_aside_eligible
            FROM worker_matches wm
            JOIN naics_codes nc ON wm.naics_code = nc.code
            WHERE wm.worker_id = ?
        `, [userId]);

        // Checklist progress (all tracks)
        const [checklist] = await db.execute(
            `SELECT track, item_key, completed FROM checklist_progress WHERE user_type='worker' AND user_id = ?`,
            [userId]
        );

        // Group checklist by track
        const checklistByTrack = {};
        for (const row of checklist) {
            if (!checklistByTrack[row.track]) checklistByTrack[row.track] = {};
            checklistByTrack[row.track][row.item_key] = row.completed;
        }

        // Connection requests from primes
        const [connections] = await db.execute(`
            SELECT c.*, p.company_name as prime_company_name, p.contact_name as prime_contact
            FROM connections c
            JOIN primes p ON c.prime_id = p.id
            WHERE c.target_type = 'worker' AND c.target_id = ?
            ORDER BY c.created_at DESC
        `, [userId]);

        // Resources
        const [resources] = await db.execute(`
            SELECT * FROM resources
            WHERE audience IN ('all','worker') AND status = 'active'
            ORDER BY sort_order ASC LIMIT 4
        `);

        res.render('labor/dashboard', {
            title: 'My Dashboard | EvoConnect Labor',
            flash: getFlash(req),
            worker,
            matches,
            checklistByTrack,
            connections,
            resources
        });

    } catch (err) {
        console.error('EvoConnect [labor/dashboard]:', err);
        flash(req, 'error', 'Failed to load dashboard.');
        res.redirect('/login');
    }
});

// ── GET /labor/profile ─────────────────────────────────────────────────────────
router.get('/profile', requireType('worker'), async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.execute('SELECT * FROM workers WHERE id = ?', [req.user.id]);
        if (!rows.length) return res.redirect('/labor/dashboard');

        const worker = rows[0];
        worker.skills = safeJson(worker.skills, []);
        worker.certifications = safeJson(worker.certifications, []);

        res.render('labor/profile', {
            title: 'My Profile | EvoConnect Labor',
            flash: getFlash(req),
            worker,
            states: US_STATES,
            stateNames: STATE_NAMES
        });

    } catch (err) {
        console.error('EvoConnect [labor/profile GET]:', err);
        flash(req, 'error', 'Failed to load profile.');
        res.redirect('/labor/dashboard');
    }
});

// ── POST /labor/profile ────────────────────────────────────────────────────────
router.post('/profile', requireType('worker'), async (req, res) => {
    try {
        const db = getDb();
        const v = req.body;
        const userId = req.user.id;

        let skills = [];
        try { skills = JSON.parse(v.skills_json || '[]'); } catch {}
        const certifications = Array.isArray(v.certifications) ? v.certifications : (v.certifications ? [v.certifications] : []);

        await db.execute(`
            UPDATE workers SET
                full_name = ?, phone = ?, trade_category = ?,
                skills = ?, certifications = ?, years_experience = ?,
                sam_registered = ?, business_entity = ?,
                city = ?, state = ?, zip = ?,
                travel_willingness = ?, experience_summary = ?
            WHERE id = ?
        `, [
            (v.full_name || '').trim(),
            (v.phone || '').trim(),
            v.trade_category || '',
            JSON.stringify(skills),
            JSON.stringify(certifications),
            parseInt(v.years_experience) || 0,
            v.sam_registered || 'no',
            v.business_entity || 'none',
            (v.city || '').trim(),
            v.state || '',
            (v.zip || '').trim(),
            v.travel_willingness || 'local',
            v.experience_summary || null,
            userId
        ]);

        // Recalculate profile_pct
        const [wRows] = await db.execute('SELECT * FROM workers WHERE id = ?', [userId]);
        const pct = calcWorkerPct(wRows[0]);
        await db.execute('UPDATE workers SET profile_pct = ? WHERE id = ?', [pct, userId]);

        flash(req, 'success', 'Profile updated successfully.');
        res.redirect('/labor/profile');

    } catch (err) {
        console.error('EvoConnect [labor/profile POST]:', err);
        flash(req, 'error', 'Failed to update profile.');
        res.redirect('/labor/profile');
    }
});

// ── POST /labor/checklist ──────────────────────────────────────────────────────
router.post('/checklist', requireType('worker'), async (req, res) => {
    const { track, item_key, completed } = req.body;
    const userId = req.user.id;
    const isCompleted = completed === true || completed === 'true' || completed === 1 || completed === '1';

    try {
        const db = getDb();

        if (isCompleted) {
            await db.execute(`
                INSERT INTO checklist_progress (user_type, user_id, track, item_key, completed)
                VALUES ('worker', ?, ?, ?, 1)
                ON DUPLICATE KEY UPDATE completed = 1, completed_at = CURRENT_TIMESTAMP
            `, [userId, track, item_key]);
        } else {
            await db.execute(
                `DELETE FROM checklist_progress WHERE user_type='worker' AND user_id=? AND track=? AND item_key=?`,
                [userId, track, item_key]
            );
        }

        // Count completion for the track — use a known item set per track
        const TRACK_ITEMS = {
            federal:         ['sam-register','uei-number','naics-identify','cage-code','representations','capability-statement','past-performance','banking'],
            state:           ['state-vendor','hub-lookup','state-certify','local-bid-list','prequalify','bonding','insurance','references'],
            subcontractor:   ['llc-setup','ein-number','insurance-basic','w9-ready','direct-deposit','lien-waiver','payment-terms','references-sub']
        };
        const trackItems = TRACK_ITEMS[track] || [];
        const [completedRows] = await db.execute(
            `SELECT COUNT(*) AS cnt FROM checklist_progress WHERE user_type='worker' AND user_id=? AND track=? AND completed=1`,
            [userId, track]
        );
        const completedCount = completedRows[0].cnt;
        const pct = trackItems.length > 0 ? Math.round(completedCount / trackItems.length * 100) : 0;

        // Check milestones and send email if just crossed
        const MILESTONES = [25, 50, 100];
        const prevCount = isCompleted ? completedCount - 1 : completedCount + 1;
        const prevPct = trackItems.length > 0 ? Math.round(prevCount / trackItems.length * 100) : 0;

        for (const milestone of MILESTONES) {
            if (prevPct < milestone && pct >= milestone) {
                const [wRows] = await db.execute('SELECT full_name, email FROM workers WHERE id = ?', [userId]);
                if (wRows.length) {
                    const { full_name, email } = wRows[0];
                    const milestoneHtml = `
                        <h2 style="color:#1a56db;">You've hit ${milestone}% on the ${track} checklist!</h2>
                        <p>Hi ${full_name},</p>
                        <p>Congratulations — you've completed <strong>${milestone}%</strong> of the <strong>${track.charAt(0).toUpperCase() + track.slice(1)} Contracting</strong> readiness track on EvoConnect.</p>
                        ${milestone === 100 ? '<p><strong>You\'re fully ready in this track!</strong> Prime contractors who search for workers in your trade will see your completed readiness score.</p>' : '<p>Keep going — each completed item increases your visibility to prime contractors.</p>'}
                        <p><a href="${process.env.APP_URL || 'https://evoconnect.evobrand.net'}/labor/dashboard" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;">Continue Checklist</a></p>
                    `;
                    sendEmail({
                        to: email,
                        subject: `EvoConnect: You've hit ${milestone}% on the ${track} checklist!`,
                        html: milestoneHtml,
                        text: `Congratulations! You've completed ${milestone}% of the ${track} checklist on EvoConnect. Log in to keep going: ${process.env.APP_URL || 'https://evoconnect.evobrand.net'}/labor/dashboard`
                    }).catch(e => console.error('EvoConnect [labor/checklist] milestone email error:', e));
                }
                break;
            }
        }

        res.json({ success: true, pct });

    } catch (err) {
        console.error('EvoConnect [labor/checklist]:', err);
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});

// ── POST /labor/connections/:id ────────────────────────────────────────────────
router.post('/connections/:id', requireType('worker'), async (req, res) => {
    const connectionId = parseInt(req.params.id);
    const { action } = req.body; // 'accept' or 'decline'
    const userId = req.user.id;

    if (!['accept', 'decline'].includes(action)) {
        return res.status(400).json({ success: false, error: 'Invalid action.' });
    }

    try {
        const db = getDb();

        // Verify this connection belongs to this worker
        const [rows] = await db.execute(
            `SELECT c.*, p.email as prime_email, p.company_name as prime_company, p.contact_name as prime_contact
             FROM connections c JOIN primes p ON c.prime_id = p.id
             WHERE c.id = ? AND c.target_type = 'worker' AND c.target_id = ?`,
            [connectionId, userId]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, error: 'Connection not found.' });
        }

        const conn = rows[0];
        const newStatus = action === 'accept' ? 'accepted' : 'declined';
        await db.execute('UPDATE connections SET status = ? WHERE id = ?', [newStatus, connectionId]);

        // If accepted, notify the prime
        if (action === 'accept') {
            const [wRows] = await db.execute('SELECT full_name, email, phone, trade_category FROM workers WHERE id = ?', [userId]);
            if (wRows.length) {
                const w = wRows[0];
                const notifyHtml = `
                    <h2 style="color:#1a56db;">Connection Accepted on EvoConnect</h2>
                    <p>Hi ${conn.prime_contact},</p>
                    <p>Good news — <strong>${w.full_name}</strong> has accepted your connection request on EvoConnect.</p>
                    <table style="border-collapse:collapse;width:100%;margin:16px 0;">
                        <tr><td style="padding:8px;font-weight:700;color:#374151;">Name</td><td style="padding:8px;">${w.full_name}</td></tr>
                        <tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;color:#374151;">Trade</td><td style="padding:8px;">${w.trade_category}</td></tr>
                        <tr><td style="padding:8px;font-weight:700;color:#374151;">Email</td><td style="padding:8px;"><a href="mailto:${w.email}" style="color:#1a56db;">${w.email}</a></td></tr>
                        <tr style="background:#f9fafb;"><td style="padding:8px;font-weight:700;color:#374151;">Phone</td><td style="padding:8px;">${w.phone}</td></tr>
                    </table>
                    <p><a href="${process.env.APP_URL || 'https://evoconnect.evobrand.net'}/prime/dashboard" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;">View Dashboard</a></p>
                `;
                sendEmail({
                    to: conn.prime_email,
                    subject: `EvoConnect: ${w.full_name} accepted your connection request`,
                    html: notifyHtml,
                    text: `${w.full_name} (${w.trade_category}) accepted your connection request on EvoConnect.\nEmail: ${w.email}\nPhone: ${w.phone}`
                }).catch(e => console.error('EvoConnect [labor/connections] prime email error:', e));
            }
        }

        res.json({ success: true });

    } catch (err) {
        console.error('EvoConnect [labor/connections]:', err);
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});

// ── GET /labor/faq ─────────────────────────────────────────────────────────────
router.get('/faq', (req, res) => {
    res.render('labor/faq', {
        title: 'FAQ | EvoConnect Labor',
        flash: getFlash(req),
        faqs: LABOR_FAQS
    });
});

// ── POST /labor/profile/section ────────────────────────────────────────────────
router.post('/profile/section', requireType('worker'), uploadResume.single('resume'), async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const section = req.body.section;

        const updates = {};

        switch (section) {
            case 'basic':
                if (req.body.full_name !== undefined) updates.full_name = (req.body.full_name || '').trim();
                if (req.body.phone     !== undefined) updates.phone     = (req.body.phone     || '').trim();
                break;
            case 'trade':
                if (req.body.trade_category   !== undefined) updates.trade_category   = req.body.trade_category   || null;
                if (req.body.years_experience !== undefined) updates.years_experience = parseInt(req.body.years_experience) || 0;
                if (req.body.skills_json      !== undefined) updates.skills           = JSON.stringify(safeJson(req.body.skills_json, []));
                break;
            case 'certifications': {
                const certs = Array.isArray(req.body.certifications)
                    ? req.body.certifications
                    : (req.body.certifications ? [req.body.certifications] : []);
                updates.certifications = JSON.stringify(certs);
                break;
            }
            case 'vendor':
                if (req.body.sam_registered  !== undefined) updates.sam_registered  = req.body.sam_registered  || 'no';
                if (req.body.business_entity !== undefined) updates.business_entity = req.body.business_entity || null;
                break;
            case 'availability':
                if (req.body.travel_willingness !== undefined) updates.travel_willingness = req.body.travel_willingness || null;
                if (req.body.city               !== undefined) updates.city               = (req.body.city   || '').trim();
                if (req.body.state              !== undefined) updates.state              = req.body.state    || '';
                if (req.body.zip                !== undefined) updates.zip                = (req.body.zip     || '').trim();
                if (req.body.experience_summary !== undefined) updates.experience_summary = req.body.experience_summary || null;
                break;
            case 'resume':
                if (req.file) updates.resume_path = '/uploads/resumes/' + req.file.filename;
                break;
        }

        if (Object.keys(updates).length) {
            const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
            await db.execute(`UPDATE workers SET ${setClauses} WHERE id = ?`, [...Object.values(updates), userId]);
        }

        const [wRows] = await db.execute('SELECT * FROM workers WHERE id = ?', [userId]);
        const pct = calcWorkerPct(wRows[0]);
        await db.execute('UPDATE workers SET profile_pct = ? WHERE id = ?', [pct, userId]);

        const wantsJson = req.headers.accept && req.headers.accept.includes('application/json');
        if (wantsJson) return res.json({ success: true, pct });
        flash(req, 'success', 'Section saved.');
        res.redirect('/labor/profile/edit');

    } catch (err) {
        console.error('EvoConnect [labor/profile/section]:', err);
        const wantsJson = req.headers.accept && req.headers.accept.includes('application/json');
        if (wantsJson) return res.status(500).json({ success: false, error: 'Server error.' });
        flash(req, 'error', 'Failed to save section.');
        res.redirect('/labor/profile/edit');
    }
});

// ── GET /labor/login → redirect to unified login ───────────────────────────────
router.get('/login', (req, res) => res.redirect('/login'));

// ── GET /labor/profile/edit → alias for /labor/profile ────────────────────────
router.get('/profile/edit', requireType('worker'), async (req, res) => {
    try {
        const db = getDb();
        const [rows] = await db.execute('SELECT * FROM workers WHERE id = ?', [req.user.id]);
        if (!rows.length) return res.redirect('/labor/dashboard');
        const worker = rows[0];
        worker.skills = safeJson(worker.skills, []);
        worker.certifications = safeJson(worker.certifications, []);
        res.render('labor/profile', {
            title: 'Edit Profile | EvoConnect Labor',
            flash: getFlash(req),
            worker,
            states: US_STATES,
            stateNames: STATE_NAMES
        });
    } catch (err) {
        console.error('EvoConnect [labor/profile/edit]:', err);
        res.redirect('/labor/dashboard');
    }
});

// ── POST /labor/profile/update → alias for POST /labor/profile ────────────────
router.post('/profile/update', requireType('worker'), uploadResume.single('resume'), async (req, res) => {
    try {
        const db = getDb();
        const v = req.body;
        const userId = req.user.id;
        let skills = [];
        try { skills = JSON.parse(v.skills_json || '[]'); } catch {}
        const certifications = Array.isArray(v.certifications) ? v.certifications : (v.certifications ? [v.certifications] : []);

        const updates = [
            (v.full_name || '').trim(), (v.phone || '').trim(),
            v.trade_category || '', JSON.stringify(skills), JSON.stringify(certifications),
            parseInt(v.years_experience) || 0, v.sam_registered || 'no',
            v.business_entity || 'none', (v.city || '').trim(),
            v.state || '', (v.zip || '').trim(),
            v.travel_willingness || 'local', v.experience_summary || null, userId
        ];
        await db.execute(`UPDATE workers SET full_name=?,phone=?,trade_category=?,skills=?,certifications=?,years_experience=?,sam_registered=?,business_entity=?,city=?,state=?,zip=?,travel_willingness=?,experience_summary=? WHERE id=?`, updates);
        if (req.file) await db.execute('UPDATE workers SET resume_path=? WHERE id=?', [req.file.filename, userId]);
        const [wRows] = await db.execute('SELECT * FROM workers WHERE id = ?', [userId]);
        await db.execute('UPDATE workers SET profile_pct=? WHERE id=?', [calcWorkerPct(wRows[0]), userId]);
        flash(req, 'success', 'Profile updated successfully.');
        res.redirect('/labor/profile/edit');
    } catch (err) {
        console.error('EvoConnect [labor/profile/update]:', err);
        flash(req, 'error', 'Failed to update profile.');
        res.redirect('/labor/profile/edit');
    }
});

// ── GET /labor/checklist ───────────────────────────────────────────────────────
router.get('/checklist', requireType('worker'), async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const [wRows] = await db.execute('SELECT full_name, profile_pct FROM workers WHERE id=?', [userId]);
        const [checklist] = await db.execute(
            `SELECT track, item_key, completed FROM checklist_progress WHERE user_type='worker' AND user_id=?`, [userId]
        );
        const checklistByTrack = {};
        for (const row of checklist) {
            if (!checklistByTrack[row.track]) checklistByTrack[row.track] = {};
            checklistByTrack[row.track][row.item_key] = row.completed;
        }
        res.render('labor/checklist', {
            title: 'Vendor Readiness Checklist | EvoConnect Labor',
            flash: getFlash(req),
            worker: wRows[0] || {},
            checklistByTrack
        });
    } catch (err) {
        console.error('EvoConnect [labor/checklist GET]:', err);
        res.redirect('/labor/dashboard');
    }
});

// ── GET /labor/resources ───────────────────────────────────────────────────────
router.get('/resources', requireType('worker'), async (req, res) => {
    try {
        const db = getDb();
        const [resources] = await db.execute(
            `SELECT * FROM resources WHERE audience IN ('all','worker') AND status='active' ORDER BY sort_order ASC`
        );
        res.render('labor/resources', {
            title: 'Resources | EvoConnect Labor',
            flash: getFlash(req),
            resources
        });
    } catch (err) {
        console.error('EvoConnect [labor/resources]:', err);
        res.redirect('/labor/dashboard');
    }
});

// ── GET /labor/connections ─────────────────────────────────────────────────────
router.get('/connections', requireType('worker'), async (req, res) => {
    try {
        const db = getDb();
        const userId = req.user.id;
        const [connections] = await db.execute(`
            SELECT c.*, p.company_name AS prime_company_name, p.contact_name AS prime_contact, p.email AS prime_email
            FROM connections c
            JOIN primes p ON c.prime_id = p.id
            WHERE c.target_type='worker' AND c.target_id=?
            ORDER BY c.status ASC, c.created_at DESC
        `, [userId]);
        res.render('labor/connections', {
            title: 'My Connections | EvoConnect Labor',
            flash: getFlash(req),
            connections
        });
    } catch (err) {
        console.error('EvoConnect [labor/connections GET]:', err);
        res.redirect('/labor/dashboard');
    }
});

// ── Utility ───────────────────────────────────────────────────────────────────
function safeJson(val, fallback) {
    if (!val) return fallback;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return fallback; }
}

module.exports = router;
