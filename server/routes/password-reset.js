'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db } = require('../database');
const { sendEmail, getPasswordResetEmail } = require('../config/email');

const router = express.Router();
const APP_URL = process.env.APP_URL || 'https://workforceconnect.io';

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// ── POST /api/password-reset/request-reset ───────────────────────────────────
router.post('/request-reset', async (req, res) => {
    const { email } = req.body || {};

    if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    // Always return the same message to prevent email enumeration
    const successMessage = 'If an account with that email exists, a reset link has been sent.';

    try {
        const [rows] = await db.execute('SELECT id, contact_name, business_name FROM users WHERE email = ?', [email.trim().toLowerCase()]);
        const user = rows[0];

        if (user) {
            // Generate a secure random token
            const rawToken = crypto.randomBytes(32).toString('hex');
            const hashedToken = hashToken(rawToken);
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

            // Invalidate any existing tokens for this user
            await db.execute('DELETE FROM password_reset_tokens WHERE user_id = ?', [user.id]);

            // Store hashed token
            await db.execute(
                'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
                [user.id, hashedToken, expiresAt]
            );

            const resetLink = `${APP_URL}/reset-password.html?token=${rawToken}`;
            const userName = user.contact_name || user.business_name || 'there';
            const { html, text } = getPasswordResetEmail(resetLink, userName);

            await sendEmail({
                to: email,
                subject: 'Reset Your PrimeReach Password',
                html,
                text
            });

            console.log(`PrimeReach: Password reset requested for ${email}`);
        }

        res.json({ success: true, message: successMessage });
    } catch (err) {
        console.error('Password reset request error:', err);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
});

// ── GET /api/password-reset/verify-token ────────────────────────────────────
router.get('/verify-token', async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).json({ valid: false, message: 'Token is required.' });
    }

    try {
        const hashedToken = hashToken(token);

        const [rows] = await db.execute(`
            SELECT prt.id, prt.expires_at, prt.used, u.email
            FROM password_reset_tokens prt
            JOIN users u ON prt.user_id = u.id
            WHERE prt.token = ?
        `, [hashedToken]);

        const record = rows[0];

        if (!record) {
            return res.json({ valid: false, message: 'Invalid or expired reset link.' });
        }
        if (record.used) {
            return res.json({ valid: false, message: 'This reset link has already been used.' });
        }
        if (new Date(record.expires_at) < new Date()) {
            return res.json({ valid: false, message: 'This reset link has expired. Please request a new one.' });
        }

        res.json({ valid: true, email: record.email });
    } catch (err) {
        console.error('Token verification error:', err);
        res.status(500).json({ valid: false, message: 'Server error verifying token.' });
    }
});

// ── POST /api/password-reset/reset-password ──────────────────────────────────
router.post('/reset-password', async (req, res) => {
    const { token, newPassword } = req.body || {};

    if (!token || !newPassword) {
        return res.status(400).json({ success: false, message: 'Token and new password are required.' });
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    try {
        const hashedToken = hashToken(token);

        const [rows] = await db.execute(`
            SELECT prt.id, prt.expires_at, prt.used, prt.user_id, u.email
            FROM password_reset_tokens prt
            JOIN users u ON prt.user_id = u.id
            WHERE prt.token = ?
        `, [hashedToken]);

        const record = rows[0];

        if (!record || record.used || new Date(record.expires_at) < new Date()) {
            return res.status(400).json({ success: false, message: 'Invalid or expired reset link. Please request a new one.' });
        }

        const password_hash = await bcrypt.hash(newPassword, 10);

        await db.execute('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, record.user_id]);
        await db.execute('UPDATE password_reset_tokens SET used = TRUE WHERE id = ?', [record.id]);

        console.log(`PrimeReach: Password reset completed for user ${record.user_id}`);
        res.json({ success: true, message: 'Password updated successfully. You can now log in.' });
    } catch (err) {
        console.error('Password reset error:', err);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
});

module.exports = router;
