'use strict';

const bcrypt = require('bcryptjs');
const { getDb } = require('../database');

function flash(req, type, message) {
    req.session.flash = { type, message };
}

function getFlash(req) {
    const f = req.session.flash || null;
    delete req.session.flash;
    return f;
}

// ── Shared Opportunities Search (Worker & Business) ──────────────────────────
async function renderOpportunitiesSearch(req, res, roleType, basePath) {
    try {
        const db = getDb();
        const { q, category, naics } = req.query;

        const conditions = ["status = 'published'"];
        const params = [];

        if (q && q.trim()) {
            conditions.push('(title LIKE ? OR scope_summary LIKE ? OR posted_by_name LIKE ? OR location LIKE ?)');
            const term = `%${q.trim()}%`;
            params.push(term, term, term, term);
        }
        if (category && category.trim()) {
            conditions.push('category = ?');
            params.push(category.trim());
        }
        if (naics && naics.trim()) {
            conditions.push('naics_codes LIKE ?');
            params.push(`%${naics.trim()}%`);
        }

        const [opportunities] = await db.execute(
            `SELECT * FROM opportunities WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
            params
        );

        let savedIds = [];
        let appliedIds = [];
        if (req.user) {
            const [sRows] = await db.execute(
                'SELECT opportunity_id FROM saved_opportunities WHERE user_type = ? AND user_id = ?',
                [roleType, req.user.id]
            );
            savedIds = sRows.map(r => Number(r.opportunity_id));

            const [aRows] = await db.execute(
                'SELECT opportunity_id FROM applications WHERE applicant_type = ? AND applicant_id = ?',
                [roleType, req.user.id]
            );
            appliedIds = aRows.map(r => Number(r.opportunity_id));
        }

        res.render('shared/opportunities-search', {
            title: 'Search Opportunities | EvoConnect',
            flash: getFlash(req),
            basePath,
            opportunities,
            savedIds,
            appliedIds,
            filters: { q, category, naics }
        });
    } catch (err) {
        console.error(`EvoConnect [${basePath}/search]:`, err);
        flash(req, 'error', 'Failed to load opportunities.');
        res.redirect(`${basePath}/dashboard`);
    }
}

// ── Toggle Saved Opportunity ─────────────────────────────────────────────────
async function toggleSavedOpportunity(req, res, roleType, basePath) {
    try {
        const db = getDb();
        const oppId = parseInt(req.body.opportunity_id);
        const redirectTo = req.body.redirect_to || `${basePath}/search`;
        if (!oppId) return res.redirect(redirectTo);

        const [existing] = await db.execute(
            'SELECT id FROM saved_opportunities WHERE user_type = ? AND user_id = ? AND opportunity_id = ?',
            [roleType, req.user.id, oppId]
        );

        if (existing.length) {
            await db.execute('DELETE FROM saved_opportunities WHERE id = ?', [existing[0].id]);
            flash(req, 'success', 'Removed from saved opportunities.');
        } else {
            await db.execute(
                'INSERT IGNORE INTO saved_opportunities (user_type, user_id, opportunity_id) VALUES (?, ?, ?)',
                [roleType, req.user.id, oppId]
            );
            flash(req, 'success', 'Opportunity saved.');
        }

        res.redirect(redirectTo);
    } catch (err) {
        console.error(`EvoConnect [${basePath}/saved/toggle]:`, err);
        res.redirect(`${basePath}/search`);
    }
}

// ── Saved Opportunities List ─────────────────────────────────────────────────
async function renderSavedOpportunities(req, res, roleType, basePath) {
    try {
        const db = getDb();
        const [opportunities] = await db.execute(`
            SELECT o.*
            FROM saved_opportunities s
            JOIN opportunities o ON s.opportunity_id = o.id
            WHERE s.user_type = ? AND s.user_id = ?
            ORDER BY s.saved_date DESC
        `, [roleType, req.user.id]);

        const [aRows] = await db.execute(
            'SELECT opportunity_id FROM applications WHERE applicant_type = ? AND applicant_id = ?',
            [roleType, req.user.id]
        );
        const appliedIds = aRows.map(r => Number(r.opportunity_id));

        res.render('shared/opportunities-saved', {
            title: 'Saved Opportunities | EvoConnect',
            flash: getFlash(req),
            basePath,
            opportunities,
            appliedIds
        });
    } catch (err) {
        console.error(`EvoConnect [${basePath}/saved]:`, err);
        res.redirect(`${basePath}/dashboard`);
    }
}

// ── Submit Application ───────────────────────────────────────────────────────
async function submitApplication(req, res, roleType, basePath) {
    try {
        const db = getDb();
        const oppId = parseInt(req.body.opportunity_id);
        const notes = (req.body.notes || '').trim();
        const proposedAmount = (req.body.proposed_amount || '').trim() || null;

        if (!oppId || !notes) {
            flash(req, 'error', 'Please provide a capability summary / note for your application.');
            return res.redirect(`${basePath}/search`);
        }

        await db.execute(`
            INSERT INTO applications (opportunity_id, applicant_type, applicant_id, notes, proposed_amount, status)
            VALUES (?, ?, ?, ?, ?, 'submitted')
            ON DUPLICATE KEY UPDATE notes = VALUES(notes), proposed_amount = VALUES(proposed_amount), updated_at = CURRENT_TIMESTAMP
        `, [oppId, roleType, req.user.id, notes, proposedAmount]);

        // Notify prime contractor if opportunity belongs to a prime
        const [opps] = await db.execute('SELECT title, posted_by_id FROM opportunities WHERE id = ?', [oppId]);
        if (opps.length && opps[0].posted_by_id) {
            await db.execute(`
                INSERT INTO notifications (user_type, user_id, type, message, related_id)
                VALUES ('prime', ?, 'application', ?, ?)
            `, [opps[0].posted_by_id, `New application submitted for "${opps[0].title}" by ${req.user.name}`, oppId]);
        }

        flash(req, 'success', 'Application submitted successfully!');
        res.redirect(`${basePath}/applications`);
    } catch (err) {
        console.error(`EvoConnect [${basePath}/applications/apply]:`, err);
        flash(req, 'error', 'Failed to submit application.');
        res.redirect(`${basePath}/search`);
    }
}

// ── My Applications List ─────────────────────────────────────────────────────
async function renderApplicationsList(req, res, roleType, basePath) {
    try {
        const db = getDb();
        const [applications] = await db.execute(`
            SELECT a.*, o.title AS opportunity_title, o.project_ref, o.posted_by_name
            FROM applications a
            JOIN opportunities o ON a.opportunity_id = o.id
            WHERE a.applicant_type = ? AND a.applicant_id = ?
            ORDER BY a.applied_date DESC
        `, [roleType, req.user.id]);

        res.render('shared/applications-list', {
            title: 'My Applications | EvoConnect',
            flash: getFlash(req),
            basePath,
            applications
        });
    } catch (err) {
        console.error(`EvoConnect [${basePath}/applications]:`, err);
        res.redirect(`${basePath}/dashboard`);
    }
}

// ── Messages Inbox & Compose ─────────────────────────────────────────────────
async function renderMessages(req, res, roleType, basePath) {
    try {
        const db = getDb();
        const userId = req.user.id;

        // Mark unread messages as read
        await db.execute(
            'UPDATE messages SET is_read = 1 WHERE receiver_type = ? AND receiver_id = ? AND is_read = 0',
            [roleType, userId]
        );

        const [inbox] = await db.execute(
            'SELECT * FROM messages WHERE receiver_type = ? AND receiver_id = ? ORDER BY created_at DESC LIMIT 50',
            [roleType, userId]
        );

        const [sent] = await db.execute(
            'SELECT * FROM messages WHERE sender_type = ? AND sender_id = ? ORDER BY created_at DESC LIMIT 50',
            [roleType, userId]
        );

        // Build recipient list depending on role
        const recipients = [];
        if (roleType === 'worker' || roleType === 'business') {
            const [primes] = await db.execute('SELECT id, company_name FROM primes WHERE active = 1 ORDER BY company_name ASC LIMIT 50');
            primes.forEach(p => recipients.push({ type: 'prime', id: p.id, name: p.company_name, label: `🏗️ ${p.company_name} (Prime Contractor)` }));
            const [admins] = await db.execute('SELECT id, name FROM admins ORDER BY id ASC LIMIT 5');
            admins.forEach(a => recipients.push({ type: 'admin', id: a.id, name: a.name || 'Platform Admin', label: `🛡️ ${a.name || 'EvoConnect Support'} (Admin)` }));
        } else {
            const [businesses] = await db.execute('SELECT id, company_name FROM businesses WHERE status = "active" ORDER BY company_name ASC LIMIT 50');
            businesses.forEach(b => recipients.push({ type: 'business', id: b.id, name: b.company_name, label: `🏢 ${b.company_name} (Business)` }));
            const [workers] = await db.execute('SELECT id, full_name FROM workers WHERE status = "active" ORDER BY full_name ASC LIMIT 50');
            workers.forEach(w => recipients.push({ type: 'worker', id: w.id, name: w.full_name, label: `👷 ${w.full_name} (Worker)` }));
            if (roleType === 'prime') {
                const [admins] = await db.execute('SELECT id, name FROM admins ORDER BY id ASC LIMIT 5');
                admins.forEach(a => recipients.push({ type: 'admin', id: a.id, name: a.name || 'Platform Admin', label: `🛡️ ${a.name || 'EvoConnect Support'} (Admin)` }));
            }
        }

        res.render('shared/messages', {
            title: 'Messages | EvoConnect',
            flash: getFlash(req),
            basePath,
            inbox,
            sent,
            recipients
        });
    } catch (err) {
        console.error(`EvoConnect [${basePath}/messages]:`, err);
        res.redirect(`${basePath}/dashboard`);
    }
}

async function sendMessage(req, res, roleType, basePath) {
    try {
        const db = getDb();
        const { recipient_key, subject, body } = req.body;
        if (!recipient_key || !body) {
            flash(req, 'error', 'Recipient and message are required.');
            return res.redirect(`${basePath}/messages`);
        }

        const parts = recipient_key.split(':');
        const receiverType = parts[0];
        const receiverId = parseInt(parts[1]);
        const receiverName = parts.slice(2).join(':') || 'Recipient';

        await db.execute(`
            INSERT INTO messages (sender_type, sender_id, sender_name, receiver_type, receiver_id, receiver_name, subject, body)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [roleType, req.user.id, req.user.name || req.user.email, receiverType, receiverId, receiverName, (subject || '').trim() || 'New Message', body.trim()]);

        await db.execute(`
            INSERT INTO notifications (user_type, user_id, type, message)
            VALUES (?, ?, 'message', ?)
        `, [receiverType, receiverId, `New message from ${req.user.name || req.user.email}: "${(subject || 'Inquiry').slice(0, 60)}"`]);

        flash(req, 'success', `Message sent to ${receiverName}.`);
        res.redirect(`${basePath}/messages`);
    } catch (err) {
        console.error(`EvoConnect [${basePath}/messages/send]:`, err);
        flash(req, 'error', 'Failed to send message.');
        res.redirect(`${basePath}/messages`);
    }
}

// ── Account Settings & Password Update ───────────────────────────────────────
function renderSettings(req, res, basePath) {
    res.render('shared/settings', {
        title: 'Account Settings | EvoConnect',
        flash: getFlash(req),
        basePath
    });
}

async function updatePassword(req, res, tableName, basePath) {
    try {
        const db = getDb();
        const { current_password, new_password, confirm_password } = req.body;

        if (!current_password || !new_password || new_password.length < 8) {
            flash(req, 'error', 'New password must be at least 8 characters.');
            return res.redirect(`${basePath}/settings`);
        }
        if (new_password !== confirm_password) {
            flash(req, 'error', 'New passwords do not match.');
            return res.redirect(`${basePath}/settings`);
        }

        const [rows] = await db.execute(`SELECT password_hash FROM ${tableName} WHERE id = ?`, [req.user.id]);
        if (!rows.length) return res.redirect('/login');

        const valid = await bcrypt.compare(current_password, rows[0].password_hash);
        if (!valid) {
            flash(req, 'error', 'Current password is incorrect.');
            return res.redirect(`${basePath}/settings`);
        }

        const newHash = await bcrypt.hash(new_password, 12);
        await db.execute(`UPDATE ${tableName} SET password_hash = ? WHERE id = ?`, [newHash, req.user.id]);

        flash(req, 'success', 'Password updated successfully.');
        res.redirect(`${basePath}/settings`);
    } catch (err) {
        console.error(`EvoConnect [${basePath}/settings/password]:`, err);
        flash(req, 'error', 'Failed to update password.');
        res.redirect(`${basePath}/settings`);
    }
}

module.exports = {
    renderOpportunitiesSearch,
    toggleSavedOpportunity,
    renderSavedOpportunities,
    submitApplication,
    renderApplicationsList,
    renderMessages,
    sendMessage,
    renderSettings,
    updatePassword
};
