'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../database');
const { requireAdmin } = require('../middleware/auth');
const { sendEmail } = require('../config/email');
const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────────────
function flash(req, type, message) {
    req.session.flash = { type, message };
}

function getFlash(req) {
    const f = req.session.flash || null;
    delete req.session.flash;
    return f;
}

function safeJson(val, fallback) {
    if (!val) return fallback;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return fallback; }
}

// Escape a value for CSV output
function csvEscape(val) {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

// ── GET /admin → redirect ──────────────────────────────────────────────────────
router.get('/', (req, res) => {
    res.redirect('/admin/dashboard');
});

// ── GET /admin/dashboard ───────────────────────────────────────────────────────
router.get('/dashboard', requireAdmin, async (req, res) => {
    try {
        const db = getDb();

        // Counts
        const [[{ workerCount }]]   = await db.execute('SELECT COUNT(*) AS workerCount FROM workers');
        const [[{ bizCount }]]      = await db.execute('SELECT COUNT(*) AS bizCount FROM businesses');
        const [[{ primeCount }]]    = await db.execute('SELECT COUNT(*) AS primeCount FROM primes');
        const [[{ pendingPrimes }]] = await db.execute('SELECT COUNT(*) AS pendingPrimes FROM primes WHERE active = 0');
        const [[{ connectionCount }]] = await db.execute('SELECT COUNT(*) AS connectionCount FROM connections');

        // Pending prime approvals (full rows)
        const [pendingList] = await db.execute(
            `SELECT id, company_name, contact_name, email, phone, sam_uei, subscription_tier, created_at
             FROM primes WHERE active = 0 ORDER BY created_at ASC`
        );

        // Weekly registrations for past 8 weeks (combined workers + businesses + primes)
        const [weeklyWorkers] = await db.execute(`
            SELECT YEARWEEK(created_at, 1) AS wk, COUNT(*) AS cnt
            FROM workers WHERE created_at >= DATE_SUB(NOW(), INTERVAL 8 WEEK)
            GROUP BY wk ORDER BY wk
        `);
        const [weeklyBiz] = await db.execute(`
            SELECT YEARWEEK(created_at, 1) AS wk, COUNT(*) AS cnt
            FROM businesses WHERE created_at >= DATE_SUB(NOW(), INTERVAL 8 WEEK)
            GROUP BY wk ORDER BY wk
        `);
        const [weeklyPrime] = await db.execute(`
            SELECT YEARWEEK(created_at, 1) AS wk, COUNT(*) AS cnt
            FROM primes WHERE created_at >= DATE_SUB(NOW(), INTERVAL 8 WEEK)
            GROUP BY wk ORDER BY wk
        `);
        const [weeklyConns] = await db.execute(`
            SELECT YEARWEEK(created_at, 1) AS wk, COUNT(*) AS cnt
            FROM connections WHERE created_at >= DATE_SUB(NOW(), INTERVAL 8 WEEK)
            GROUP BY wk ORDER BY wk
        `);

        // Merge into a single weekly map
        const weeklyMap = {};
        const addToMap = (rows) => {
            for (const row of rows) {
                if (!weeklyMap[row.wk]) weeklyMap[row.wk] = 0;
                weeklyMap[row.wk] += Number(row.cnt);
            }
        };
        addToMap(weeklyWorkers);
        addToMap(weeklyBiz);
        addToMap(weeklyPrime);

        const weeklyConnMap = {};
        for (const row of weeklyConns) weeklyConnMap[row.wk] = Number(row.cnt);

        const sortedWeeks = Object.keys(weeklyMap).sort();
        const weeklyRegistrations = sortedWeeks.map(wk => ({ week: wk, count: weeklyMap[wk] }));
        const weeklyConnections   = sortedWeeks.map(wk => ({ week: wk, count: weeklyConnMap[wk] || 0 }));

        // Checklist completion rates
        const [checklistStats] = await db.execute(`
            SELECT user_type, track, COUNT(*) AS total_completions
            FROM checklist_progress WHERE completed = 1
            GROUP BY user_type, track
        `);

        res.render('admin/dashboard', {
            title: 'Admin Dashboard | EvoConnect',
            flash: getFlash(req),
            stats: {
                workerCount,
                bizCount,
                primeCount,
                pendingPrimes,
                connectionCount
            },
            pendingList,
            weeklyRegistrations,
            weeklyConnections,
            checklistStats
        });

    } catch (err) {
        console.error('EvoConnect [admin/dashboard]:', err);
        flash(req, 'error', 'Failed to load dashboard data.');
        res.redirect('/admin/dashboard');
    }
});

// ── POST /admin/primes/:id/approve ─────────────────────────────────────────────
router.post('/primes/:id/approve', requireAdmin, async (req, res) => {
    const primeId = parseInt(req.params.id);
    try {
        const db = getDb();
        await db.execute(
            `UPDATE primes SET active = 1, approved_at = NOW(), approved_by = ? WHERE id = ?`,
            [req.user.email, primeId]
        );

        const [rows] = await db.execute('SELECT * FROM primes WHERE id = ?', [primeId]);
        if (rows.length) {
            const p = rows[0];
            const approvalHtml = `
                <h2 style="color:#1a56db;">Your EvoConnect Account is Approved!</h2>
                <p>Hi ${p.contact_name},</p>
                <p>Great news — your <strong>${p.company_name}</strong> prime contractor account on EvoConnect has been approved. You now have full access to search for workers and subcontractors.</p>
                <h3 style="color:#374151;">Getting started:</h3>
                <ul>
                    <li>Search the <a href="${process.env.APP_URL || 'https://evoconnect.evobrand.net'}/prime/search/workers" style="color:#1a56db;">Worker Directory</a> by trade, location, and certifications</li>
                    <li>Search the <a href="${process.env.APP_URL || 'https://evoconnect.evobrand.net'}/prime/search/businesses" style="color:#1a56db;">Business Directory</a> by NAICS code and certifications</li>
                    <li>Send connection requests — workers and businesses will be notified immediately</li>
                </ul>
                <p><a href="${process.env.APP_URL || 'https://evoconnect.evobrand.net'}/prime/dashboard" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;">Go to My Dashboard</a></p>
            `;
            sendEmail({
                to: p.email,
                subject: 'EvoConnect: Your prime contractor account is approved',
                html: approvalHtml,
                text: `Hi ${p.contact_name},\n\nYour EvoConnect prime contractor account for ${p.company_name} has been approved! Log in at: ${process.env.APP_URL || 'https://evoconnect.evobrand.net'}/prime/dashboard`
            }).catch(e => console.error('EvoConnect [admin/primes/approve] email error:', e));
        }

        flash(req, 'success', 'Prime contractor approved and notified.');
        res.redirect('/admin/dashboard');

    } catch (err) {
        console.error('EvoConnect [admin/primes/approve]:', err);
        flash(req, 'error', 'Failed to approve prime contractor.');
        res.redirect('/admin/dashboard');
    }
});

// ── POST /admin/primes/:id/deny ────────────────────────────────────────────────
router.post('/primes/:id/deny', requireAdmin, async (req, res) => {
    const primeId = parseInt(req.params.id);
    const reason = (req.body.reason || '').trim();

    try {
        const db = getDb();

        const [rows] = await db.execute('SELECT * FROM primes WHERE id = ?', [primeId]);
        if (rows.length) {
            const p = rows[0];
            const denyHtml = `
                <h2 style="color:#dc2626;">EvoConnect Application Update</h2>
                <p>Hi ${p.contact_name},</p>
                <p>After reviewing your application, we are unable to approve your <strong>${p.company_name}</strong> account on EvoConnect at this time.</p>
                ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
                <p>If you believe this is an error or would like to reapply with updated information, please contact us at <a href="mailto:${process.env.ADMIN_EMAIL || 'admin@evoconnect.evobrand.net'}" style="color:#1a56db;">${process.env.ADMIN_EMAIL || 'admin@evoconnect.evobrand.net'}</a>.</p>
            `;
            sendEmail({
                to: p.email,
                subject: 'EvoConnect: Application Status Update',
                html: denyHtml,
                text: `Hi ${p.contact_name},\n\nWe are unable to approve your EvoConnect application for ${p.company_name} at this time.${reason ? `\n\nReason: ${reason}` : ''}\n\nContact us to reapply: ${process.env.ADMIN_EMAIL || 'admin@evoconnect.evobrand.net'}`
            }).catch(e => console.error('EvoConnect [admin/primes/deny] email error:', e));
        }

        // Set active = -1 (denied)
        await db.execute('UPDATE primes SET active = -1 WHERE id = ?', [primeId]);

        flash(req, 'success', 'Prime contractor denied and notified.');
        res.redirect('/admin/dashboard');

    } catch (err) {
        console.error('EvoConnect [admin/primes/deny]:', err);
        flash(req, 'error', 'Failed to deny prime contractor.');
        res.redirect('/admin/dashboard');
    }
});

// ── GET /admin/users ───────────────────────────────────────────────────────────
router.get('/users', requireAdmin, async (req, res) => {
    try {
        const db = getDb();

        const page    = Math.max(1, parseInt(req.query.page) || 1);
        const limit   = 25;
        const offset  = (page - 1) * limit;
        const search  = (req.query.search || '').trim();
        const typeFilter = req.query.type || 'all';

        let workers = [], businesses = [], primes = [];

        const searchClause = search ? `AND (email LIKE ? OR full_name LIKE ? OR contact_name LIKE ? OR company_name LIKE ?)` : '';
        const searchParams = search ? [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`] : [];

        if (typeFilter === 'all' || typeFilter === 'worker') {
            const [r] = await db.execute(
                `SELECT id, 'worker' AS type, full_name AS name, email, phone, city, state, status, created_at FROM workers WHERE 1=1 ${search ? 'AND (email LIKE ? OR full_name LIKE ?)' : ''} ORDER BY created_at DESC`,
                search ? [`%${search}%`, `%${search}%`] : []
            );
            workers = r;
        }
        if (typeFilter === 'all' || typeFilter === 'business') {
            const [r] = await db.execute(
                `SELECT id, 'business' AS type, company_name AS name, email, phone, city, state, status, created_at FROM businesses WHERE 1=1 ${search ? 'AND (email LIKE ? OR company_name LIKE ?)' : ''} ORDER BY created_at DESC`,
                search ? [`%${search}%`, `%${search}%`] : []
            );
            businesses = r;
        }
        if (typeFilter === 'all' || typeFilter === 'prime') {
            const [r] = await db.execute(
                `SELECT id, 'prime' AS type, company_name AS name, email, phone, city, state, active AS status, subscription_tier, created_at FROM primes WHERE 1=1 ${search ? 'AND (email LIKE ? OR company_name LIKE ?)' : ''} ORDER BY created_at DESC`,
                search ? [`%${search}%`, `%${search}%`] : []
            );
            primes = r;
        }

        // Combine and sort by created_at
        const allUsers = [...workers, ...businesses, ...primes]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const total = allUsers.length;
        const paginated = allUsers.slice(offset, offset + limit);
        const totalPages = Math.ceil(total / limit);

        res.render('admin/users', {
            title: 'User Management | EvoConnect Admin',
            flash: getFlash(req),
            users: paginated,
            page,
            totalPages,
            total,
            search,
            typeFilter
        });

    } catch (err) {
        console.error('EvoConnect [admin/users]:', err);
        flash(req, 'error', 'Failed to load users.');
        res.redirect('/admin/dashboard');
    }
});

// ── GET /admin/naics ───────────────────────────────────────────────────────────
router.get('/naics', requireAdmin, async (req, res) => {
    try {
        const db = getDb();
        const [codes] = await db.execute('SELECT * FROM naics_codes ORDER BY code ASC');

        res.render('admin/naics', {
            title: 'NAICS Code Management | EvoConnect Admin',
            flash: getFlash(req),
            codes
        });

    } catch (err) {
        console.error('EvoConnect [admin/naics GET]:', err);
        flash(req, 'error', 'Failed to load NAICS codes.');
        res.redirect('/admin/dashboard');
    }
});

// ── POST /admin/naics ──────────────────────────────────────────────────────────
router.post('/naics', requireAdmin, async (req, res) => {
    const { code, description, trade_category, avg_contract_size, set_aside_eligible } = req.body;

    if (!code || !description) {
        flash(req, 'error', 'Code and description are required.');
        return res.redirect('/admin/naics');
    }

    try {
        const db = getDb();
        await db.execute(
            `INSERT INTO naics_codes (code, description, trade_category, avg_contract_size, set_aside_eligible)
             VALUES (?,?,?,?,?)`,
            [
                code.trim(),
                description.trim(),
                trade_category || null,
                avg_contract_size || null,
                set_aside_eligible === '1' || set_aside_eligible === 'on' ? 1 : 0
            ]
        );
        flash(req, 'success', `NAICS code ${code} added.`);
        res.redirect('/admin/naics');

    } catch (err) {
        console.error('EvoConnect [admin/naics POST]:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            flash(req, 'error', `NAICS code ${code} already exists.`);
        } else {
            flash(req, 'error', 'Failed to add NAICS code.');
        }
        res.redirect('/admin/naics');
    }
});

// ── PUT /admin/naics/:code ─────────────────────────────────────────────────────
router.put('/naics/:code', requireAdmin, async (req, res) => {
    const { code } = req.params;
    const { description, trade_category, avg_contract_size, set_aside_eligible } = req.body;

    try {
        const db = getDb();
        await db.execute(
            `UPDATE naics_codes SET description=?, trade_category=?, avg_contract_size=?, set_aside_eligible=? WHERE code=?`,
            [
                description || '',
                trade_category || null,
                avg_contract_size || null,
                set_aside_eligible === '1' || set_aside_eligible === 'on' ? 1 : 0,
                code
            ]
        );
        res.json({ success: true });

    } catch (err) {
        console.error('EvoConnect [admin/naics PUT]:', err);
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});

// ── DELETE /admin/naics/:code ──────────────────────────────────────────────────
router.delete('/naics/:code', requireAdmin, async (req, res) => {
    const { code } = req.params;
    try {
        const db = getDb();
        await db.execute('DELETE FROM naics_codes WHERE code = ?', [code]);
        res.json({ success: true });
    } catch (err) {
        console.error('EvoConnect [admin/naics DELETE]:', err);
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});

// ── GET /admin/resources ───────────────────────────────────────────────────────
router.get('/resources', requireAdmin, async (req, res) => {
    try {
        const db = getDb();
        const [resources] = await db.execute('SELECT * FROM resources ORDER BY sort_order ASC, id ASC');

        res.render('admin/resources', {
            title: 'Resource Library | EvoConnect Admin',
            flash: getFlash(req),
            resources
        });

    } catch (err) {
        console.error('EvoConnect [admin/resources GET]:', err);
        flash(req, 'error', 'Failed to load resources.');
        res.redirect('/admin/dashboard');
    }
});

// ── POST /admin/resources ──────────────────────────────────────────────────────
router.post('/resources', requireAdmin, async (req, res) => {
    const { title, description, url, category, audience, sort_order, status } = req.body;

    if (!title) {
        flash(req, 'error', 'Resource title is required.');
        return res.redirect('/admin/resources');
    }

    try {
        const db = getDb();
        await db.execute(
            `INSERT INTO resources (title, description, url, category, audience, sort_order, status)
             VALUES (?,?,?,?,?,?,?)`,
            [
                title.trim(),
                description || null,
                url || null,
                category || null,
                ['all','worker','business','prime'].includes(audience) ? audience : 'all',
                parseInt(sort_order) || 0,
                status === 'inactive' ? 'inactive' : 'active'
            ]
        );
        flash(req, 'success', 'Resource added.');
        res.redirect('/admin/resources');

    } catch (err) {
        console.error('EvoConnect [admin/resources POST]:', err);
        flash(req, 'error', 'Failed to add resource.');
        res.redirect('/admin/resources');
    }
});

// ── PUT /admin/resources/:id ───────────────────────────────────────────────────
router.put('/resources/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { title, description, url, category, audience, sort_order, status } = req.body;

    try {
        const db = getDb();
        await db.execute(
            `UPDATE resources SET title=?, description=?, url=?, category=?, audience=?, sort_order=?, status=? WHERE id=?`,
            [
                title || '',
                description || null,
                url || null,
                category || null,
                ['all','worker','business','prime'].includes(audience) ? audience : 'all',
                parseInt(sort_order) || 0,
                status === 'inactive' ? 'inactive' : 'active',
                id
            ]
        );
        res.json({ success: true });

    } catch (err) {
        console.error('EvoConnect [admin/resources PUT]:', err);
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});

// ── DELETE /admin/resources/:id ────────────────────────────────────────────────
router.delete('/resources/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const db = getDb();
        await db.execute('DELETE FROM resources WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('EvoConnect [admin/resources DELETE]:', err);
        res.status(500).json({ success: false, error: 'Server error.' });
    }
});

// ── GET /admin/announcements ───────────────────────────────────────────────────
router.get('/announcements', requireAdmin, async (req, res) => {
    try {
        const db = getDb();
        const [announcements] = await db.execute(
            'SELECT * FROM announcements ORDER BY created_at DESC'
        );

        res.render('admin/announcements', {
            title: 'Announcements | EvoConnect Admin',
            flash: getFlash(req),
            announcements
        });

    } catch (err) {
        console.error('EvoConnect [admin/announcements GET]:', err);
        flash(req, 'error', 'Failed to load announcements.');
        res.redirect('/admin/dashboard');
    }
});

// ── POST /admin/announcements ──────────────────────────────────────────────────
router.post('/announcements', requireAdmin, async (req, res) => {
    const { message, type, active, expires_at } = req.body;

    if (!message) {
        flash(req, 'error', 'Announcement message is required.');
        return res.redirect('/admin/announcements');
    }

    try {
        const db = getDb();
        const announcementType = ['info','warning','success'].includes(type) ? type : 'info';
        const isActive = active === 'on' || active === '1' || active === true ? 1 : 0;
        const expiry = expires_at || null;

        // Deactivate existing active announcements before upserting a new one
        await db.execute('UPDATE announcements SET active = 0');

        await db.execute(
            `INSERT INTO announcements (message, type, active, expires_at) VALUES (?,?,?,?)`,
            [message.trim(), announcementType, isActive, expiry]
        );

        flash(req, 'success', 'Announcement saved.');
        res.redirect('/admin/announcements');

    } catch (err) {
        console.error('EvoConnect [admin/announcements POST]:', err);
        flash(req, 'error', 'Failed to save announcement.');
        res.redirect('/admin/announcements');
    }
});

// ── GET /admin/export/csv ──────────────────────────────────────────────────────
router.get('/export/csv', requireAdmin, async (req, res) => {
    try {
        const db = getDb();

        const [workers] = await db.execute(
            `SELECT 'worker' AS type, id, full_name AS name, email, phone,
                    trade_category, city, state, zip, status,
                    profile_pct, sam_registered, created_at
             FROM workers`
        );
        const [businesses] = await db.execute(
            `SELECT 'business' AS type, id, company_name AS name, email, phone,
                    business_type AS trade_category, city, state, zip, status,
                    profile_pct, sam_registered, created_at
             FROM businesses`
        );
        const [primes] = await db.execute(
            `SELECT 'prime' AS type, id, company_name AS name, email, phone,
                    subscription_tier AS trade_category, city, state, zip,
                    CASE active WHEN 1 THEN 'approved' WHEN 0 THEN 'pending' ELSE 'denied' END AS status,
                    0 AS profile_pct, '' AS sam_registered, created_at
             FROM primes`
        );

        const all = [...workers, ...businesses, ...primes]
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        const headers = ['type','id','name','email','phone','category','city','state','zip','status','profile_pct','sam_registered','created_at'];
        const rows = [
            headers.join(','),
            ...all.map(u => [
                csvEscape(u.type),
                csvEscape(u.id),
                csvEscape(u.name),
                csvEscape(u.email),
                csvEscape(u.phone),
                csvEscape(u.trade_category),
                csvEscape(u.city),
                csvEscape(u.state),
                csvEscape(u.zip),
                csvEscape(u.status),
                csvEscape(u.profile_pct),
                csvEscape(u.sam_registered),
                csvEscape(u.created_at)
            ].join(','))
        ];

        const csv = rows.join('\r\n');
        const filename = `evoconnect-users-${new Date().toISOString().split('T')[0]}.csv`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);

    } catch (err) {
        console.error('EvoConnect [admin/export/csv]:', err);
        flash(req, 'error', 'Failed to export CSV.');
        res.redirect('/admin/dashboard');
    }
});

// ── GET /admin/approvals ───────────────────────────────────────────────────────
router.get('/approvals', requireAdmin, async (req, res) => {
    try {
        const db = getDb();
        const [pendingList] = await db.execute(
            `SELECT id, company_name, contact_name, email, phone, sam_uei, subscription_tier, city, state, created_at
             FROM primes WHERE active = 0 ORDER BY created_at ASC`
        );
        const [deniedList] = await db.execute(
            `SELECT id, company_name, contact_name, email, phone, sam_uei, subscription_tier, city, state, created_at
             FROM primes WHERE active = -1 ORDER BY created_at DESC LIMIT 20`
        );

        res.render('admin/approvals', {
            title: 'Prime Approvals | EvoConnect Admin',
            flash: getFlash(req),
            pendingList,
            deniedList
        });

    } catch (err) {
        console.error('EvoConnect [admin/approvals]:', err);
        flash(req, 'error', 'Failed to load approvals.');
        res.redirect('/admin/dashboard');
    }
});

// ── POST /admin/approve/:id alias ─────────────────────────────────────────────
router.post('/approve/:id', requireAdmin, async (req, res, next) => {
    req.params.id = req.params.id;
    const primeId = parseInt(req.params.id);
    try {
        const db = getDb();
        await db.execute(
            `UPDATE primes SET active = 1, approved_at = NOW(), approved_by = ? WHERE id = ?`,
            [req.user.email, primeId]
        );
        const [rows] = await db.execute('SELECT * FROM primes WHERE id = ?', [primeId]);
        if (rows.length) {
            const p = rows[0];
            const approvalHtml = `<h2 style="color:#1a56db;">Your EvoConnect Account is Approved!</h2><p>Hi ${p.contact_name},</p><p>Your <strong>${p.company_name}</strong> prime contractor account has been approved. <a href="${process.env.APP_URL || 'https://evoconnect.evobrand.net'}/prime/dashboard" style="color:#1a56db;">Log in now</a> to start searching.</p>`;
            sendEmail({ to: p.email, subject: 'EvoConnect: Your prime contractor account is approved', html: approvalHtml, text: `Your EvoConnect account for ${p.company_name} is approved.` }).catch(() => {});
        }
        flash(req, 'success', 'Prime contractor approved.');
        res.redirect('/admin/approvals');
    } catch (err) {
        console.error('EvoConnect [admin/approve]:', err);
        flash(req, 'error', 'Failed to approve prime contractor.');
        res.redirect('/admin/approvals');
    }
});

// ── POST /admin/deny/:id alias ─────────────────────────────────────────────────
router.post('/deny/:id', requireAdmin, async (req, res) => {
    const primeId = parseInt(req.params.id);
    const reason = (req.body.reason || '').trim();
    try {
        const db = getDb();
        const [rows] = await db.execute('SELECT * FROM primes WHERE id = ?', [primeId]);
        if (rows.length) {
            const p = rows[0];
            const denyHtml = `<h2 style="color:#dc2626;">EvoConnect Application Update</h2><p>Hi ${p.contact_name},</p><p>We are unable to approve your <strong>${p.company_name}</strong> account at this time.${reason ? `<br><strong>Reason:</strong> ${reason}` : ''}</p>`;
            sendEmail({ to: p.email, subject: 'EvoConnect: Application Status Update', html: denyHtml, text: `Your EvoConnect application for ${p.company_name} was not approved.${reason ? ` Reason: ${reason}` : ''}` }).catch(() => {});
        }
        await db.execute('UPDATE primes SET active = -1 WHERE id = ?', [primeId]);
        flash(req, 'success', 'Prime contractor denied.');
        res.redirect('/admin/approvals');
    } catch (err) {
        console.error('EvoConnect [admin/deny]:', err);
        flash(req, 'error', 'Failed to deny prime contractor.');
        res.redirect('/admin/approvals');
    }
});

module.exports = router;
