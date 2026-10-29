'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const { getDb } = require('../database');
const { requireType, signToken, setAuthCookie } = require('../middleware/auth');
const { sendEmail } = require('../config/email');
const { regLimiter } = require('../middleware/rateLimit');
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
const parseResume = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: (process.env.EVO_SERVERLESS ? 4 : 5) * 1024 * 1024 },
    fileFilter: (req,file,cb)=>['.pdf','.doc','.docx'].includes(path.extname(file.originalname).toLowerCase())
        ? cb(null,true) : cb(new Error('Only PDF and Word documents are allowed.'))
});
const uploadResume = { single: field => (req,res,next) => {
    parseResume.single(field)(req,res,err=>{
        if(err || !req.file)return next(err);
        req.file.filename=`resume_${require('crypto').randomUUID()}${path.extname(req.file.originalname).toLowerCase()}`;
        require('../services/file-storage').put('resumes',req.file.filename,req.file.buffer)
            .then(()=>next()).catch(next);
    });
}};

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
        values: req.session.laborReg || {}
    });
});

// ── POST /labor/register ───────────────────────────────────────────────────────
router.post('/register', regLimiter, (req, res, next) => {
    uploadResume.single('resume')(req, res, (err) => {
        if (err instanceof multer.MulterError || err) req.fileError = err.message || 'File upload error.';
        next();
    });
}, async (req, res) => {
    const v    = req.body;
    const step = parseInt(v.step) || 1;
    const errors = [];

    // ── Step 1: Personal Info ──────────────────────────────────────────────────
    if (step === 1) {
        const full_name  = (v.full_name || '').trim();
        const email      = (v.email || '').trim().toLowerCase();
        const phone      = (v.phone || '').trim();
        const password   = v.password || '';
        const confirm_pw = v.confirm_password || '';

        if (!full_name)  errors.push('Full name is required.');
        if (!email)      errors.push('Email address is required.');
        else if (!validateEmail(email)) errors.push('Please enter a valid email address.');
        if (!phone)      errors.push('Phone number is required.');
        if (!password)   errors.push('Password is required.');
        else if (password.length < 8) errors.push('Password must be at least 8 characters.');
        if (password !== confirm_pw)   errors.push('Passwords do not match.');

        if (errors.length) {
            return res.render('labor/register', {
                title: 'Register | EvoConnect Labor',
                flash: null, states: US_STATES, stateNames: STATE_NAMES,
                step: 1, errors, values: v
            });
        }
        req.session.laborReg = { full_name, email, phone, password };
        return res.redirect('/labor/register?step=2');
    }

    // ── Step 2: Trade & Skills ─────────────────────────────────────────────────
    if (step === 2) {
        const trade_category = (v.trade_category || '').trim();
        if (!trade_category) errors.push('Trade category is required.');

        if (errors.length) {
            return res.render('labor/register', {
                title: 'Register | EvoConnect Labor',
                flash: null, states: US_STATES, stateNames: STATE_NAMES,
                step: 2, errors, values: { ...(req.session.laborReg || {}), ...v }
            });
        }
        let skills = [];
        try { skills = JSON.parse(v.skills_json || '[]'); } catch {}
        const certifications = Array.isArray(v.certifications) ? v.certifications : (v.certifications ? [v.certifications] : []);
        req.session.laborReg = {
            ...(req.session.laborReg || {}),
            trade_category,
            skills_json: JSON.stringify(skills),
            certifications,
            years_experience: v.years_experience || '0'
        };
        return res.redirect('/labor/register?step=3');
    }

    // ── Step 3: Location & Final Submit ───────────────────────────────────────
    const saved = req.session.laborReg || {};
    const full_name      = saved.full_name || '';
    const email          = saved.email || '';
    const phone          = saved.phone || '';
    const password       = saved.password || '';
    const trade_category = saved.trade_category || '';
    const city           = (v.city || '').trim();
    const state          = (v.state || '').trim();
    const zip            = (v.zip || '').trim();

    if (!full_name || !email || !phone || !password) errors.push('Session expired — please start your registration over.');
    if (!trade_category) errors.push('Trade category missing — please go back to Step 2.');
    if (!city)           errors.push('City is required.');
    if (!state)          errors.push('State is required.');
    if (!zip)            errors.push('ZIP code is required.');
    if (req.fileError)   errors.push(req.fileError);

    if (errors.length) {
        return res.render('labor/register', {
            title: 'Register | EvoConnect Labor',
            flash: null, states: US_STATES, stateNames: STATE_NAMES,
            step: 3, errors, values: { ...saved, ...v }
        });
    }

    try {
        const db = getDb();

        const [existing] = await db.execute('SELECT id FROM workers WHERE email = ?', [email]);
        if (existing.length) {
            return res.render('labor/register', {
                title: 'Register | EvoConnect Labor',
                flash: null, states: US_STATES, stateNames: STATE_NAMES,
                errors: ['An account with that email already exists.'],
                step: 1, values: saved
            });
        }

        const password_hash = await bcrypt.hash(password, 12);

        let skills = [];
        try { skills = JSON.parse(saved.skills_json || '[]'); } catch {}
        const certifications = Array.isArray(saved.certifications) ? saved.certifications : (saved.certifications ? [saved.certifications] : []);
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
            parseInt(saved.years_experience) || 0,
            v.sam_registered || 'no',
            v.entity_type || 'none',
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

        // Clear registration session
        delete req.session.laborReg;

        // Sign in
        const token = signToken({ id: workerId, email, type: 'worker', name: full_name });
        setAuthCookie(res, token);

        flash(req, 'success', 'Welcome to EvoConnect! Your profile is live — start with the checklist below.');
        res.redirect('/labor/dashboard');

    } catch (err) {
        console.error('EvoConnect [labor/register]:', err);
        const saved = req.session.laborReg || {};
        res.render('labor/register', {
            title: 'Register | EvoConnect Labor',
            flash: null, states: US_STATES, stateNames: STATE_NAMES,
            errors: ['A server error occurred. Please try again.'],
            step: 3, values: { ...saved, ...v }
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
        const connections=await require('../services/role-connections').list(db,{type:req.user.type,id:userId});

        // Resources
        const [resources] = await db.execute(`
            SELECT * FROM resources
            WHERE audience IN ('all','worker') AND status = 'active'
            ORDER BY sort_order ASC LIMIT 4
        `);

        const autoMatches = await require('../services/naics-matching').opportunities(db,req.user.type,userId);
        res.render('labor/dashboard', {
            autoMatches,
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


// ── GET /labor/faq ─────────────────────────────────────────────────────────────
router.get('/faq', async (req, res, next) => {
    try {
        res.render('labor/faq', {
            title: 'FAQ | EvoConnect Labor',
            flash: getFlash(req),
            faqs: await require('../services/faqs').list(getDb(),'labor')
        });
    }catch(err){next(err);}
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


// ── Utility ───────────────────────────────────────────────────────────────────
function safeJson(val, fallback) {
    if (!val) return fallback;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return fallback; }
}


const pf = require('./portalFeatures');

router.get('/search', requireType('worker'), (req, res) => pf.renderOpportunitiesSearch(req, res, 'worker', '/labor'));
router.get('/saved', requireType('worker'), (req, res) => pf.renderSavedOpportunities(req, res, 'worker', '/labor'));
router.post('/saved/toggle', requireType('worker'), (req, res) => pf.toggleSavedOpportunity(req, res, 'worker', '/labor'));
router.get('/applications', requireType('worker'), (req, res) => pf.renderApplicationsList(req, res, 'worker', '/labor'));
router.post('/applications/apply', requireType('worker'), (req, res) => pf.submitApplication(req, res, 'worker', '/labor'));
router.get('/messages', requireType('worker'), (req, res) => pf.renderMessages(req, res, 'worker', '/labor'));
router.post('/messages/send', requireType('worker'), (req, res) => pf.sendMessage(req, res, 'worker', '/labor'));
router.get('/settings', requireType('worker'), (req, res) => pf.renderSettings(req, res, '/labor'));
router.post('/settings/password', requireType('worker'), (req, res) => pf.updatePassword(req, res, 'workers', '/labor'));

module.exports = router;
