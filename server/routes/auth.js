'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getDb } = require('../database');
const { signToken, setAuthCookie, clearAuthCookie } = require('../middleware/auth');
const { sendEmail } = require('../config/email');
const { authLimiter } = require('../middleware/rateLimit');
const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function flash(req, type, message) {
    req.session.flash = { type, message };
}

const APP_URL = process.env.APP_URL || 'https://evoconnect.evobrand.net';

const TYPE_BY_TABLE = {
    workers:    'worker',
    businesses: 'business',
    primes:     'prime',
    admins:     'admin'
};

// Normalize the singular type label back to a table name
function tableFor(type) {
    const map = { worker: 'workers', business: 'businesses', businesse: 'businesses', prime: 'primes', admin: 'admins' };
    return map[type] || 'workers';
}

// Look up a user by email across all tables. Returns { row, userType } or null.
async function findUserByEmail(db, email, userType) {
    const tables = userType
        ? [tableFor(userType)]
        : ['workers', 'businesses', 'primes', 'admins'];

    for (const table of tables) {
        const [rows] = await db.execute(`SELECT * FROM ${table} WHERE email = ?`, [email]);
        if (rows.length) {
            return { row: rows[0], userType: TYPE_BY_TABLE[table] || 'worker' };
        }
    }
    return null;
}

// Ensure a demo account exists and return { row, userType }
async function ensureDemoAccount(db, email) {
    const demoEmails = {
        'demo-labor@evoconnect.io':    'worker',
        'demo-business@evoconnect.io': 'business',
        'demo-prime@evoconnect.io':    'prime',
        'demo-admin@evoconnect.io':    'admin'
    };
    const role = demoEmails[email];
    if (!role) return null;

    const hash = await bcrypt.hash('DemoPass1!', 10);

    if (role === 'admin') {
        await db.execute(
            `INSERT INTO admins (email, password_hash, name) VALUES (?, ?, 'Demo Admin')
             ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), name = 'Demo Admin'`,
            [email, hash]
        );
        const [rows] = await db.execute('SELECT * FROM admins WHERE email = ?', [email]);
        return { row: rows[0], userType: 'admin' };
    }

    if (role === 'prime') {
        await db.execute(
            `INSERT INTO primes
                (company_name, contact_name, email, password_hash, phone,
                 sam_uei, contract_vehicles, naics_codes, city, state, zip,
                 subscription_tier, active, approved_at)
             VALUES ('Apex Construction Group', 'Marcus Thompson', ?, ?, '512-555-0201',
                     'APEXCG1234567', 'GSA MAS, IDIQ, BPA', '["237310","238110","238210","238990"]',
                     'Austin', 'TX', '78701', 'enterprise', 1, NOW())
             ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), active = 1, subscription_tier = 'enterprise'`,
            [email, hash]
        );
        const [rows] = await db.execute('SELECT * FROM primes WHERE email = ?', [email]);
        return { row: rows[0], userType: 'prime' };
    }

    if (role === 'business') {
        await db.execute(
            `INSERT INTO businesses
                (company_name, contact_name, email, password_hash, phone,
                 business_type, certifications, sam_uei, sam_registered,
                 naics_codes, service_description, city, state, zip,
                 service_radius, profile_pct, status)
             VALUES ('GreenPath Environmental Services', 'Tanya Williams', ?, ?, '210-555-0301',
                     'LLC', '["DBE","SBE","WBE"]', 'GRNPTH9876543', 'yes',
                     '["541620","562910","238910"]',
                     'Environmental consulting, site assessment, NEPA compliance, and hazardous materials management for transportation and infrastructure projects.',
                     'San Antonio', 'TX', '78205', 'statewide', 85, 'active')
             ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), status = 'active'`,
            [email, hash]
        );
        const [rows] = await db.execute('SELECT * FROM businesses WHERE email = ?', [email]);
        return { row: rows[0], userType: 'business' };
    }

    if (role === 'worker') {
        await db.execute(
            `INSERT INTO workers
                (full_name, email, password_hash, phone, trade_category,
                 skills, certifications, years_experience,
                 sam_registered, business_entity,
                 city, state, zip, travel_willingness, experience_summary,
                 profile_pct, status)
             VALUES ('James Okafor', ?, ?, '713-555-0302', 'electrical',
                     '["Traffic Signal Installation","Highway Lighting","Conduit & Pull Box","Fiber Conduit","Certified Payroll"]',
                     '["OSHA 30","IMSA Signal Level I","C-10 License"]', 12,
                     'yes', 'sole_proprietor', 'Houston', 'TX', '77002', 'regional',
                     'Licensed electrical contractor with 12 years specializing in highway lighting, traffic signal upgrades, and electrical infrastructure.',
                     72, 'active')
             ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), status = 'active'`,
            [email, hash]
        );
        const [rows] = await db.execute('SELECT * FROM workers WHERE email = ?', [email]);
        return { row: rows[0], userType: 'worker' };
    }

    return null;
}

// ── GET /login ─────────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
    const flash = req.session.flash || null;
    delete req.session.flash;
    res.render('login', {
        title: 'Log In | EvoConnect',
        flash,
        redirect: req.query.redirect || ''
    });
});

// ── GET /auth/demo/:role (1-click Demo Login) ──────────────────────────────────
router.get('/auth/demo/:role', async (req, res) => {
    const roleMap = {
        worker:   'demo-labor@evoconnect.io',
        labor:    'demo-labor@evoconnect.io',
        business: 'demo-business@evoconnect.io',
        prime:    'demo-prime@evoconnect.io',
        admin:    'demo-admin@evoconnect.io'
    };
    const email = roleMap[req.params.role];
    if (!email) return res.redirect('/login');

    try {
        const db = getDb();
        const found = await ensureDemoAccount(db, email);
        if (!found || !found.row) {
            flash(req, 'error', 'Could not initialize demo account.');
            return res.redirect('/login');
        }
        const { row, userType } = found;
        const name = row.company_name || row.full_name || row.contact_name || row.name || row.email;
        const token = signToken({ id: row.id, email: row.email, type: userType, name });
        setAuthCookie(res, token);

        const redirectMap = {
            worker:   '/labor/dashboard',
            business: '/business/dashboard',
            prime:    '/prime/dashboard',
            admin:    '/admin/dashboard'
        };
        return res.redirect(redirectMap[userType] || '/');
    } catch (err) {
        console.error('EvoConnect [auth/demo]:', err);
        flash(req, 'error', 'Demo login failed. Please try again.');
        return res.redirect('/login');
    }
});

// ── POST /login ────────────────────────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const userType = req.body.userType || null;

    try {
        const db = getDb();

        // If logging in with one of the 4 official demo emails and DemoPass1!, auto-ensure it exists
        let found = null;
        const isDemoEmail = [
            'demo-labor@evoconnect.io',
            'demo-business@evoconnect.io',
            'demo-prime@evoconnect.io',
            'demo-admin@evoconnect.io'
        ].includes(email);

        if (isDemoEmail && password === 'DemoPass1!') {
            found = await ensureDemoAccount(db, email);
        } else {
            found = await findUserByEmail(db, email, userType);
        }

        if (!found || !found.row) {
            flash(req, 'error', 'Invalid email or password.');
            return res.redirect('/login');
        }

        const { row, userType: foundType } = found;
        const match = (isDemoEmail && password === 'DemoPass1!')
            ? true
            : await bcrypt.compare(password, row.password_hash);

        if (!match) {
            flash(req, 'error', 'Invalid email or password.');
            return res.redirect('/login');
        }

        const name = row.company_name || row.full_name || row.contact_name || row.name || row.email;
        const token = signToken({ id: row.id, email: row.email, type: foundType, name });
        setAuthCookie(res, token);

        const redirectMap = {
            worker:   '/labor/dashboard',
            business: '/business/dashboard',
            prime:    '/prime/dashboard',
            admin:    '/admin/dashboard'
        };
        res.redirect(redirectMap[foundType] || '/labor/dashboard');

    } catch (err) {
        console.error('EvoConnect [auth/login]:', err);
        flash(req, 'error', 'A server error occurred. Please try again.');
        res.redirect('/login');
    }
});

// ── GET & POST /logout + /auth/logout ──────────────────────────────────────────
router.get('/logout', (req, res) => {
    clearAuthCookie(res);
    if (req.session) req.session.destroy(() => {});
    res.redirect('/login');
});

router.post('/logout', (req, res) => {
    clearAuthCookie(res);
    if (req.session) req.session.destroy(() => {});
    res.redirect('/login');
});

router.get('/auth/logout', (req, res) => {
    clearAuthCookie(res);
    if (req.session) req.session.destroy(() => {});
    res.redirect('/login');
});

router.post('/auth/logout', (req, res) => {
    clearAuthCookie(res);
    if (req.session) req.session.destroy(() => {});
    res.redirect('/login');
});

// ── GET /forgot-password ───────────────────────────────────────────────────────
router.get('/forgot-password', (req, res) => {
    const flash = req.session.flash || null;
    delete req.session.flash;
    res.render('forgot-password', {
        title: 'Forgot Password | EvoConnect',
        flash
    });
});

// ── POST /forgot-password ──────────────────────────────────────────────────────
router.post('/forgot-password', authLimiter, async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    const userType = req.body.userType || null;
    const successMsg = "If that email is registered, you'll receive a reset link shortly.";

    try {
        const db = getDb();
        const found = await findUserByEmail(db, email, userType);

        if (found) {
            const { row, userType: foundType } = found;
            const resetToken = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

            await db.execute(
                `INSERT INTO password_reset_tokens (user_type, user_id, token, expires_at)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE token = VALUES(token), expires_at = VALUES(expires_at), used = 0`,
                [foundType, row.id, resetToken, expiresAt]
            );

            const resetLink = `${APP_URL}/reset-password/${resetToken}`;
            const name = row.full_name || row.contact_name || row.name || 'there';

            const html = `
                <h2 style="color:#003D5B;">Reset Your Password</h2>
                <p>Hi ${name},</p>
                <p>We received a request to reset your EvoConnect password. Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
                <p><a href="${resetLink}" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;">Reset My Password</a></p>
                <p style="font-size:12px;color:#888;">If you did not request a password reset, you can safely ignore this email.</p>
                <p style="font-size:12px;color:#888;">Or copy this link: ${resetLink}</p>
            `;

            sendEmail({
                to: email,
                subject: 'Reset Your EvoConnect Password',
                html,
                text: `Reset your EvoConnect password: ${resetLink}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`
            }).catch(e => console.error('EvoConnect [auth/forgot-password] email error:', e));
        }

    } catch (err) {
        console.error('EvoConnect [auth/forgot-password]:', err);
    }

    res.render('forgot-password', {
        title: 'Forgot Password | EvoConnect',
        flash: { type: 'success', message: successMsg }
    });
});

// ── GET /reset-password/:token ─────────────────────────────────────────────────
router.get('/reset-password/:token', async (req, res) => {
    const { token } = req.params;

    try {
        const db = getDb();
        const [rows] = await db.execute(
            `SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > NOW()`,
            [token]
        );

        if (!rows.length) {
            flash(req, 'error', 'This reset link is invalid or has expired. Please request a new one.');
            return res.redirect('/forgot-password');
        }

        res.render('reset-password', {
            title: 'Reset Password | EvoConnect',
            token,
            flash: null
        });

    } catch (err) {
        console.error('EvoConnect [auth/reset-password GET]:', err);
        flash(req, 'error', 'A server error occurred. Please try again.');
        res.redirect('/forgot-password');
    }
});

// ── POST /reset-password/:token ────────────────────────────────────────────────
router.post('/reset-password/:token', authLimiter, async (req, res) => {
    const { token } = req.params;
    const { password, confirm_password } = req.body;

    if (!password || password.length < 8) {
        return res.render('reset-password', {
            title: 'Reset Password | EvoConnect',
            token,
            flash: { type: 'error', message: 'Password must be at least 8 characters.' }
        });
    }

    if (password !== confirm_password) {
        return res.render('reset-password', {
            title: 'Reset Password | EvoConnect',
            token,
            flash: { type: 'error', message: 'Passwords do not match.' }
        });
    }

    try {
        const db = getDb();
        const [rows] = await db.execute(
            `SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > NOW()`,
            [token]
        );

        if (!rows.length) {
            flash(req, 'error', 'This reset link is invalid or has expired.');
            return res.redirect('/forgot-password');
        }

        const { user_type, user_id } = rows[0];
        const table = tableFor(user_type);
        const hash = await bcrypt.hash(password, 12);

        await db.execute(`UPDATE ${table} SET password_hash = ? WHERE id = ?`, [hash, user_id]);
        await db.execute(`UPDATE password_reset_tokens SET used = 1 WHERE token = ?`, [token]);

        flash(req, 'success', 'Your password has been reset. Please log in with your new password.');
        res.redirect('/login');

    } catch (err) {
        console.error('EvoConnect [auth/reset-password POST]:', err);
        res.render('reset-password', {
            title: 'Reset Password | EvoConnect',
            token,
            flash: { type: 'error', message: 'A server error occurred. Please try again.' }
        });
    }
});

// ── GET /register ──────────────────────────────────────────────────────────────
router.get('/register', (req, res) => {
    res.render('register', {
        title: 'Choose Your Account Type | EvoConnect'
    });
});

module.exports = router;
