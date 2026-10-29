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
async function findUserByEmail(db, email, userType, password) {
    const tables = userType
        ? [tableFor(userType)]
        : ['admins', 'workers', 'businesses', 'primes'];

    for (const table of tables) {
        const [rows] = await db.execute(`SELECT * FROM ${table} WHERE email = ?`, [email]);
        if (rows.length) {
            if(password !== undefined) {
                const valid=table==='admins' ? await require('../services/admin-authentication').matches(rows[0],password) : await bcrypt.compare(password,rows[0].password_hash);
                if(!valid)continue;
            }
            return { row: rows[0], userType: TYPE_BY_TABLE[table] || 'worker' };
        }
    }
    return null;
}

const ensureDemoAccount = require('../services/demo-accounts');
const demo = require('../services/demo-sandbox');

// ── GET /login ─────────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
    const flash = req.session.flash || null;
    delete req.session.flash;
    res.render('login', {
        title: 'Log In | EVOConnect',
        flash,
        redirect: req.query.redirect || ''
    });
});

// ── GET /auth/demo/:role (1-click Demo Login) ──────────────────────────────────
router.get('/auth/demo/:role', authLimiter, demo.loginContext, async (req, res) => {
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
        const token = signToken({ id: row.id, email: row.email, type: userType, name, demo: true });
        setAuthCookie(res, token);

        const redirectMap = {
            worker:   '/labor/dashboard',
            business: '/business/dashboard',
            prime:    '/prime/dashboard',
            admin:    '/admin/dashboard'
        };
        return res.redirect(redirectMap[userType] || '/');
    } catch (err) {
        console.error('EVOConnect [auth/demo]:', err);
        flash(req, 'error', 'Demo login failed. Please try again.');
        return res.redirect('/login');
    }
});

// ── POST /login ────────────────────────────────────────────────────────────────
router.post('/login', authLimiter, demo.passwordContext, async (req, res) => {
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

        if (isDemoEmail && password !== 'DemoPass1!') {
            flash(req, 'error', 'Invalid demo email or password.');
            return res.redirect('/login');
        }
        if (isDemoEmail && password === 'DemoPass1!') {
            found = await ensureDemoAccount(db, email);
        } else {
            found = await findUserByEmail(db, email, userType, password);
        }

        if (!found || !found.row) {
            flash(req, 'error', 'Invalid email or password.');
            return res.redirect('/login');
        }

        const { row, userType: foundType } = found;
        const match = (isDemoEmail && password === 'DemoPass1!')
            ? true
            : foundType==='admin' ? await require('../services/admin-authentication').matches(row,password) : await bcrypt.compare(password, row.password_hash);

        if (!match) {
            flash(req, 'error', 'Invalid email or password.');
            return res.redirect('/login');
        }

        const name = row.company_name || row.full_name || row.contact_name || row.name || row.email;
        const token = signToken({ id: row.id, email: row.email, type: foundType, name, ...(demo.context.active() ? { demo: true } : {}) });
        setAuthCookie(res, token);

        const redirectMap = {
            worker:   '/labor/dashboard',
            business: '/business/dashboard',
            prime:    '/prime/dashboard',
            admin:    '/admin/dashboard'
        };
        res.redirect(redirectMap[foundType] || '/labor/dashboard');

    } catch (err) {
        console.error('EVOConnect [auth/login]:', err);
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
        title: 'Forgot Password | EVOConnect',
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
                <p>We received a request to reset your EVOConnect password. Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
                <p><a href="${resetLink}" style="display:inline-block;background:#1a56db;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:700;">Reset My Password</a></p>
                <p style="font-size:12px;color:#888;">If you did not request a password reset, you can safely ignore this email.</p>
                <p style="font-size:12px;color:#888;">Or copy this link: ${resetLink}</p>
            `;

            sendEmail({
                to: email,
                subject: 'Reset Your EVOConnect Password',
                html,
                text: `Reset your EVOConnect password: ${resetLink}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`
            }).catch(e => console.error('EVOConnect [auth/forgot-password] email error:', e));
        }

    } catch (err) {
        console.error('EVOConnect [auth/forgot-password]:', err);
    }

    res.render('forgot-password', {
        title: 'Forgot Password | EVOConnect',
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
            title: 'Reset Password | EVOConnect',
            token,
            flash: null
        });

    } catch (err) {
        console.error('EVOConnect [auth/reset-password GET]:', err);
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
            title: 'Reset Password | EVOConnect',
            token,
            flash: { type: 'error', message: 'Password must be at least 8 characters.' }
        });
    }

    if (password !== confirm_password) {
        return res.render('reset-password', {
            title: 'Reset Password | EVOConnect',
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
        console.error('EVOConnect [auth/reset-password POST]:', err);
        res.render('reset-password', {
            title: 'Reset Password | EVOConnect',
            token,
            flash: { type: 'error', message: 'A server error occurred. Please try again.' }
        });
    }
});

// ── GET /register ──────────────────────────────────────────────────────────────
router.get('/register', (req, res) => {
    res.render('register', {
        title: 'Choose Your Account Type | EVOConnect'
    });
});

module.exports = router;
