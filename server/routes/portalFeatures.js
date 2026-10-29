'use strict';

const bcrypt = require('bcryptjs');
const { getDb } = require('../database');
const { openSql } = require('../services/opportunity-lifecycle');

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

        const conditions = [openSql];
        const params = [];

        if (q && q.trim()) {
            conditions.push('(title LIKE ? OR scope_summary LIKE ? OR posted_by_name LIKE ? OR district_name LIKE ?)');
            const term = `%${q.trim()}%`;
            params.push(term, term, term, term);
        }
        if (category && category.trim()) {
            conditions.push('(category = ? OR category_name = ?)');
            params.push(category.trim(), category.trim());
        }
        if (naics && naics.trim()) {
            conditions.push('naics_codes LIKE ?');
            params.push(`%${naics.trim()}%`);
        }

        const [opportunities] = await db.execute(
            `SELECT * FROM opportunities WHERE ${conditions.join(' AND ')} ORDER BY posted_date DESC`,
            params
        );

        let savedIds = [];
        let appliedIds = [];
        if (req.user) {
            const [sRows] = await db.execute(
                'SELECT opportunity_id FROM saved_opportunities WHERE user_type = ? AND user_id = ?',
                [roleType, req.user.id]
            );
            savedIds = sRows.map(r => String(r.opportunity_id));

            const [aRows] = await db.execute(
                'SELECT opportunity_id FROM applications WHERE applicant_type = ? AND applicant_id = ?',
                [roleType, req.user.id]
            );
            appliedIds = aRows.map(r => String(r.opportunity_id));
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
        const oppId = String(req.body.opportunity_id || '').trim();
        const redirectTo = `${basePath}/search`;
        if (!oppId) return res.redirect(redirectTo);
        const [available] = await db.execute(`SELECT id FROM opportunities WHERE id = ? AND ${openSql}`, [oppId]);
        if (!available.length) return res.status(404).send('Opportunity unavailable.');

        const [existing] = await db.execute(
            'SELECT id FROM saved_opportunities WHERE user_type = ? AND user_id = ? AND opportunity_id = ?',
            [roleType, req.user.id, oppId]
        );

        if (existing.length) {
            await db.execute('DELETE FROM saved_opportunities WHERE id = ?', [existing[0].id]);
            flash(req, 'success', 'Removed from saved opportunities.');
        } else {
            await db.execute(
                'INSERT INTO saved_opportunities (user_type, user_id, opportunity_id) VALUES (?, ?, ?)',
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
            ORDER BY s.saved_at DESC
        `, [roleType, req.user.id]);

        const [aRows] = await db.execute(
            'SELECT opportunity_id FROM applications WHERE applicant_type = ? AND applicant_id = ?',
            [roleType, req.user.id]
        );
        const appliedIds = aRows.map(r => String(r.opportunity_id));

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
        const oppId = String(req.body.opportunity_id || '').trim();
        const notes = (req.body.notes || '').trim();
        const proposedAmount = (req.body.proposed_amount || '').trim();
        const fullNotes = proposedAmount ? `[Proposed: ${proposedAmount}] ${notes}` : notes;

        if (!oppId || !notes) {
            flash(req, 'error', 'Please provide a capability summary / note for your application.');
            return res.redirect(`${basePath}/search`);
        }

        const [available] = await db.execute(`SELECT id FROM opportunities WHERE id = ? AND ${openSql}`, [oppId]);
        if (!available.length) return res.status(404).send('Opportunity unavailable.');
        const [existing] = await db.execute(
            'SELECT id FROM applications WHERE opportunity_id = ? AND applicant_type = ? AND applicant_id = ?',
            [oppId, roleType, req.user.id]
        );

        if (existing.length) {
            await db.execute(
                'UPDATE applications SET notes = ?, status = ? WHERE id = ?',
                [fullNotes, 'submitted', existing[0].id]
            );
        } else {
            await db.execute(
                'INSERT INTO applications (opportunity_id, applicant_type, applicant_id, notes, status) VALUES (?, ?, ?, ?, ?)',
                [oppId, roleType, req.user.id, fullNotes, 'submitted']
            );
        }

        // Send internal message & notification to prime contractor
        const [opps] = await db.execute('SELECT title, posted_by, posted_by_type, posted_by_name FROM opportunities WHERE id = ?', [oppId]);
        if (opps.length && opps[0].posted_by) {
            const [msgRes] = await db.execute(`
                INSERT INTO messages (sender_type, sender_id, sender_business_name, receiver_type, receiver_id, receiver_business_name, opportunity_id, message_type, subject, body)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'application', ?, ?)
            `, [
                roleType,
                req.user.id,
                req.user.name || req.user.email,
                opps[0].posted_by_type,
                opps[0].posted_by,
                opps[0].posted_by_name || 'Prime Contractor',
                oppId,
                `New Application: ${opps[0].title}`,
                `${req.user.name || req.user.email} submitted an application for "${opps[0].title}".\n\n${fullNotes}`
            ]);
            await db.execute(
                'INSERT INTO notifications (user_type, user_id, message_id) VALUES (?, ?, ?)',
                [opps[0].posted_by_type, opps[0].posted_by, msgRes.insertId]
            );
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
            SELECT a.*, o.title AS opportunity_title, o.id AS project_ref, o.posted_by_name
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

        // Mark unread messages & notifications as read
        await db.execute(
            'UPDATE messages SET is_read = 1 WHERE receiver_type = ? AND receiver_id = ? AND is_read = 0',
            [roleType, userId]
        );
        await db.execute(
            'UPDATE notifications SET is_read = 1 WHERE user_type = ? AND user_id = ? AND is_read = 0',
            [roleType, userId]
        );

        const [inboxRows] = await db.execute(
            'SELECT * FROM messages WHERE receiver_type = ? AND receiver_id = ? ORDER BY created_at DESC LIMIT 50',
            [roleType, userId]
        );
        const inbox = inboxRows.map(m => ({
            ...m,
            sender_name: m.sender_business_name || m.sender_name || m.sender_type
        }));

        const [sentRows] = await db.execute(
            'SELECT * FROM messages WHERE sender_type = ? AND sender_id = ? ORDER BY created_at DESC LIMIT 50',
            [roleType, userId]
        );
        const sent = sentRows.map(m => ({
            ...m,
            receiver_name: m.receiver_business_name || m.receiver_name || m.receiver_type
        }));

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
            } else if (roleType === 'admin') {
                const [primes] = await db.execute('SELECT id, company_name FROM primes ORDER BY company_name ASC LIMIT 50');
                primes.forEach(p => recipients.push({ type: 'prime', id: p.id, name: p.company_name, label: `🏗️ ${p.company_name} (Prime Contractor)` }));
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

        const [msgRes] = await db.execute(`
            INSERT INTO messages (sender_type, sender_id, sender_business_name, receiver_type, receiver_id, receiver_business_name, message_type, subject, body)
            VALUES (?, ?, ?, ?, ?, ?, 'reply', ?, ?)
        `, [roleType, req.user.id, req.user.name || req.user.email, receiverType, receiverId, receiverName, (subject || '').trim() || 'New Message', body.trim()]);

        await db.execute(
            'INSERT INTO notifications (user_type, user_id, message_id) VALUES (?, ?, ?)',
            [receiverType, receiverId, msgRes.insertId]
        );

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
