const express = require('express');
const { db } = require('../database');
const router = express.Router();

// NAICS code mapping by trade category
const NAICS_MAP = {
    'cdl-trucking':         ['484110','484121','484122','488490'],
    'concrete-cement':      ['238110','238190','237310'],
    'construction':         ['236220','237110','237310','238900'],
    'fiber-broadband':      ['237130','517311'],
    'cell-site-tech':       ['517311','238210'],
    'structured-cabling':   ['238210','517410'],
    'cloud-network-infra':  ['541512','517210'],
    'welding-fabrication':  ['332312','332313','811310'],
    'electrical':           ['238210'],
    'plumbing-hvac':        ['238220'],
    'landscaping':          ['561730'],
    'it-support':           ['541511','541512','811212'],
    'admin-clerical':       ['561110','561320'],
};

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/workers/register — public endpoint, no auth required
router.post('/register', async (req, res) => {
    try {
        const {
            full_name,
            email: rawEmail,
            phone,
            trade_category,
            years_experience,
            certifications,
            city,
            state,
            zip,
            travel_willingness,
            sam_registered,
            business_entity,
            experience_summary,
            skills
        } = req.body;

        // Sanitize email
        const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

        // Validate required fields
        const errors = [];
        if (!full_name || !String(full_name).trim()) errors.push('full_name is required');
        if (!email || !EMAIL_REGEX.test(email)) errors.push('A valid email address is required');
        if (!phone || !String(phone).trim()) errors.push('phone is required');
        if (!trade_category || !String(trade_category).trim()) errors.push('trade_category is required');
        if (!city || !String(city).trim()) errors.push('city is required');
        if (!state || !String(state).trim()) errors.push('state is required');

        if (errors.length > 0) {
            return res.status(400).json({ success: false, errors });
        }

        // Sanitize string fields
        const fullNameClean      = String(full_name).trim();
        const phoneClean         = String(phone).trim();
        const tradeCategoryClean = String(trade_category).trim();
        const cityClean          = String(city).trim();
        const stateClean         = String(state).trim().toUpperCase().slice(0, 2);
        const zipClean           = zip ? String(zip).trim() : null;
        const travelClean        = travel_willingness || 'local';
        const yearsExp           = years_experience != null ? parseInt(years_experience, 10) : null;
        const samReg             = sam_registered ? 1 : 0;
        const entityClean        = business_entity ? String(business_entity).trim() : null;
        const summaryClean       = experience_summary ? String(experience_summary).trim().slice(0, 500) : null;

        // Serialize JSON fields
        const certsJson  = certifications && Array.isArray(certifications) ? JSON.stringify(certifications) : null;
        const skillsJson = skills && Array.isArray(skills) ? JSON.stringify(skills) : null;

        // Insert worker record
        let insertResult;
        try {
            [insertResult] = await db.execute(
                `INSERT INTO workers
                    (full_name, email, phone, trade_category, skills, certifications,
                     years_experience, sam_registered, business_entity,
                     city, state, zip, travel_willingness, profile_complete, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active')`,
                [
                    fullNameClean, email, phoneClean, tradeCategoryClean,
                    skillsJson, certsJson, yearsExp, samReg, entityClean,
                    cityClean, stateClean, zipClean, travelClean
                ]
            );
        } catch (dbErr) {
            // Duplicate email (ER_DUP_ENTRY)
            if (dbErr.code === 'ER_DUP_ENTRY' || (dbErr.message && dbErr.message.includes('Duplicate'))) {
                return res.status(409).json({ success: false, error: 'An account with this email address already exists.' });
            }
            throw dbErr;
        }

        const workerId = insertResult.insertId;

        // Look up NAICS matches for the worker's trade category
        let naicsMatches = [];
        const codes = NAICS_MAP[tradeCategoryClean] || [];

        if (codes.length > 0) {
            try {
                const placeholders = codes.map(() => '?').join(',');
                const [naicsRows] = await db.execute(
                    `SELECT code, description, trade_category, avg_contract_size, set_aside_eligible
                     FROM naics_codes WHERE code IN (${placeholders})`,
                    codes
                );

                if (naicsRows.length > 0) {
                    naicsMatches = naicsRows;
                } else {
                    // Table exists but no rows found — return raw codes with note
                    naicsMatches = codes.map(c => ({
                        code: c,
                        description: 'Description loading — please check SAM.gov',
                        note: 'Full descriptions will be available shortly'
                    }));
                }
            } catch (naicsErr) {
                console.warn('WFC Workers: NAICS lookup failed, returning raw codes:', naicsErr.message);
                naicsMatches = codes.map(c => ({ code: c, description: 'Description loading' }));
            }
        }

        // Return worker data (without sensitive/internal fields)
        const workerResponse = {
            id: workerId,
            full_name: fullNameClean,
            email,
            phone: phoneClean,
            trade_category: tradeCategoryClean,
            city: cityClean,
            state: stateClean,
            zip: zipClean,
            travel_willingness: travelClean,
            years_experience: yearsExp,
            sam_registered: !!samReg,
            business_entity: entityClean,
            certifications: certifications || [],
            status: 'active'
        };

        return res.status(201).json({
            success: true,
            worker: workerResponse,
            naics_matches: naicsMatches
        });

    } catch (err) {
        console.error('WFC Workers: Registration error:', err);
        res.status(500).json({ success: false, error: 'Server error during registration. Please try again.' });
    }
});

// GET /api/workers — list workers, supports ?trade, ?state, ?zip query params
router.get('/', async (req, res) => {
    try {
        const { trade, state, zip } = req.query;

        let query = `SELECT id, full_name, email, phone, trade_category, skills,
                        certifications, years_experience, sam_registered, business_entity,
                        city, state, zip, travel_willingness, profile_complete,
                        status, created_at
                     FROM workers WHERE status = 'active'`;
        const params = [];

        if (trade) {
            query += ' AND trade_category = ?';
            params.push(String(trade).trim());
        }
        if (state) {
            query += ' AND state = ?';
            params.push(String(state).trim().toUpperCase().slice(0, 2));
        }
        if (zip) {
            query += ' AND zip = ?';
            params.push(String(zip).trim());
        }

        query += ' ORDER BY created_at DESC LIMIT 200';

        const [rows] = await db.execute(query, params);

        const workers = rows.map(w => ({
            ...w,
            skills: w.skills ? (() => { try { return JSON.parse(w.skills); } catch { return []; } })() : [],
            certifications: w.certifications ? (() => { try { return JSON.parse(w.certifications); } catch { return []; } })() : [],
            sam_registered: !!w.sam_registered,
            profile_complete: !!w.profile_complete
        }));

        res.json(workers);
    } catch (err) {
        console.error('WFC Workers: List error:', err);
        res.status(500).json({ error: 'Server error fetching workers.' });
    }
});

// GET /api/workers/:id — get single worker by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const numId = parseInt(id, 10);
        if (!numId || isNaN(numId)) {
            return res.status(400).json({ error: 'Invalid worker ID.' });
        }

        const [rows] = await db.execute(
            `SELECT id, full_name, email, phone, trade_category, skills,
                    certifications, years_experience, sam_registered, business_entity,
                    city, state, zip, travel_willingness, profile_complete,
                    status, created_at
             FROM workers WHERE id = ?`,
            [numId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Worker not found.' });
        }

        const w = rows[0];
        const worker = {
            ...w,
            skills: w.skills ? (() => { try { return JSON.parse(w.skills); } catch { return []; } })() : [],
            certifications: w.certifications ? (() => { try { return JSON.parse(w.certifications); } catch { return []; } })() : [],
            sam_registered: !!w.sam_registered,
            profile_complete: !!w.profile_complete
        };

        res.json(worker);
    } catch (err) {
        console.error('WFC Workers: Get by ID error:', err);
        res.status(500).json({ error: 'Server error fetching worker.' });
    }
});

module.exports = router;
