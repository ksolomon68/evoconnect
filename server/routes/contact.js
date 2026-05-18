'use strict';

const express = require('express');
const { sendEmail, getContactConfirmationEmail } = require('../config/email');

const router = express.Router();
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'michael.buniak@dot.ca.gov';

// ── POST /api/contact/submit ─────────────────────────────────────────────────
router.post('/submit', async (req, res) => {
    const { name, email, subject, message } = req.body || {};

    if (!name || !email || !message) {
        return res.status(400).json({ success: false, message: 'Name, email, and message are required.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ success: false, message: 'Invalid email address.' });
    }

    const msgSubject = subject ? subject.trim() : 'General Inquiry';

    // HTML-encode user-supplied values before embedding in email body
    function escHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    }

    try {
        // Notify admin
        await sendEmail({
            to: ADMIN_EMAIL,
            subject: `WorkForce Connect Contact Form: ${escHtml(msgSubject)}`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
                    <h2 style="color:#003D5B;border-bottom:3px solid #FDB714;padding-bottom:12px;">New Contact Form Submission</h2>
                    <table style="width:100%;border-collapse:collapse;margin-top:16px;">
                        <tr><td style="padding:8px 0;font-weight:bold;color:#003D5B;width:120px;">Name:</td><td style="padding:8px 0;">${escHtml(name)}</td></tr>
                        <tr><td style="padding:8px 0;font-weight:bold;color:#003D5B;">Email:</td><td style="padding:8px 0;"><a href="mailto:${escHtml(email)}" style="color:#046B99;">${escHtml(email)}</a></td></tr>
                        <tr><td style="padding:8px 0;font-weight:bold;color:#003D5B;">Subject:</td><td style="padding:8px 0;">${escHtml(msgSubject)}</td></tr>
                    </table>
                    <div style="margin-top:16px;padding:16px;background:#f5f5f5;border-radius:4px;">
                        <p style="font-weight:bold;color:#003D5B;margin:0 0 8px;">Message:</p>
                        <p style="margin:0;white-space:pre-wrap;">${escHtml(message)}</p>
                    </div>
                    <p style="margin-top:24px;font-size:12px;color:#666;">Sent via WorkForce Connect contact form at ${new Date().toISOString()}</p>
                </div>
            `,
            text: `New Contact Form Submission\n\nName: ${name}\nEmail: ${email}\nSubject: ${msgSubject}\n\nMessage:\n${message}\n\nSent at ${new Date().toISOString()}`
        });

        // Confirmation to sender
        const { html, text } = getContactConfirmationEmail(name, message);
        await sendEmail({
            to: email,
            subject: 'We received your message — WorkForce Connect',
            html,
            text
        });

        console.log(`WorkForce Connect: Contact form submitted by ${email}`);
        res.json({ success: true, message: 'Your message has been sent. We\'ll be in touch shortly.' });
    } catch (err) {
        console.error('Contact form error:', err);
        res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
    }
});

module.exports = router;
