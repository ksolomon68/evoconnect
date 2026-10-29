'use strict';

const bcrypt = require('bcryptjs');
const { getDb } = require('../database');
const { openSql } = require('../services/opportunity-lifecycle');
const policy=require('../services/role-policy');
const roles=require('../services/role-connections');

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

        const conditions = [openSql,'listing_type=?'];
        const params = [policy.listingType(roleType) || 'opportunity'];

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
            title: roleType==='worker'?'Find Jobs | EVOConnect':'Search Opportunities | EVOConnect',
            flash: getFlash(req),
            basePath,
            opportunities,
            savedIds,
            appliedIds,
            filters: { q, category, naics }
        });
    } catch (err) {
        console.error(`EVOConnect [${basePath}/search]:`, err);
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
        const [available] = await db.execute(`SELECT * FROM opportunities WHERE id = ? AND ${openSql}`, [oppId]);
        if (!available.length) return res.status(404).send('Listing unavailable.');
        if(!policy.canApply(roleType,available[0]))return res.status(403).send('Businesses apply to prime opportunities; labor workers apply to small-business jobs.');

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
        console.error(`EVOConnect [${basePath}/saved/toggle]:`, err);
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
            WHERE s.user_type = ? AND s.user_id = ? AND o.listing_type = ?
            ORDER BY s.saved_at DESC
        `, [roleType, req.user.id,policy.listingType(roleType)]);

        const [aRows] = await db.execute(
            'SELECT opportunity_id FROM applications WHERE applicant_type = ? AND applicant_id = ?',
            [roleType, req.user.id]
        );
        const appliedIds = aRows.map(r => String(r.opportunity_id));

        res.render('shared/opportunities-saved', {
            title: 'Saved Opportunities | EVOConnect',
            flash: getFlash(req),
            basePath,
            opportunities,
            appliedIds
        });
    } catch (err) {
        console.error(`EVOConnect [${basePath}/saved]:`, err);
        res.redirect(`${basePath}/dashboard`);
    }
}

// ── Submit Application ───────────────────────────────────────────────────────
async function submitApplication(req, res, roleType, basePath) {
    const payload=req.body || {};
    const oppId=typeof payload.opportunity_id==='string'?payload.opportunity_id.trim():'';
    const notes=typeof payload.notes==='string'?payload.notes.trim():'';
    const amount=typeof payload.proposed_amount==='string'?payload.proposed_amount.trim():'';
    if(!oppId || !notes || notes.length>10000 || amount.length>100)return res.status(400).send('Provide an application note of up to 10,000 characters.');
    let connection;
    try {
        connection=await getDb().getConnection();
        await connection.beginTransaction();
        // Serializing submissions for this listing also prevents duplicate applications on double clicks.
        const [available]=await connection.execute(`SELECT * FROM opportunities WHERE id=? AND ${openSql} FOR UPDATE`,[oppId]);
        const listing=available[0];
        if(!listing){await connection.rollback();return res.status(404).send('Listing unavailable.');}
        if(!policy.canApply(roleType,listing)){await connection.rollback();return res.status(403).send('Businesses apply to prime opportunities; labor workers apply to small-business jobs.');}
        const [existing]=await connection.execute('SELECT id,status FROM applications WHERE opportunity_id=? AND applicant_type=? AND applicant_id=? FOR UPDATE',[oppId,roleType,req.user.id]);
        if(existing.length && existing[0].status!=='withdrawn'){await connection.rollback();return res.status(409).send('You have already applied to this listing.');}
        const body=amount?`[Proposed: ${amount}] ${notes}`:notes;
        if(existing.length)await connection.execute("UPDATE applications SET notes=?,status='submitted',applied_date=CURRENT_TIMESTAMP WHERE id=?",[body,existing[0].id]);
        else await connection.execute("INSERT INTO applications (opportunity_id,applicant_type,applicant_id,notes,status) VALUES (?,?,?,?,'submitted')",[oppId,roleType,req.user.id,body]);
        const owner=await policy.account(connection,listing.posted_by_type,listing.posted_by);
        const actor=await policy.account(connection,roleType,req.user.id);
        if(owner && actor){
            const [message]=await connection.execute("INSERT INTO messages (sender_type,sender_id,sender_business_name,receiver_type,receiver_id,receiver_business_name,opportunity_id,message_type,subject,body) VALUES (?,?,?,?,?,?,?,'application',?,?)",[roleType,req.user.id,actor.name,owner.type,owner.id,owner.name,oppId,`New Application: ${listing.title}`,`${actor.name} applied for ${listing.title}.\n\n${body}`]);
            await connection.execute('INSERT INTO notifications (user_type,user_id,message_id) VALUES (?,?,?)',[owner.type,owner.id,message.insertId]);
        }
        await connection.commit();flash(req,'success','Application submitted.');res.redirect(`${basePath}/applications`);
    }catch(err){if(connection)await connection.rollback().catch(()=>{});console.error('Application submission:',err.code || err.message);res.status(500).send('Unable to submit your application. Please try again.');}
    finally{if(connection)connection.release();}
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
            title: 'My Applications | EVOConnect',
            flash: getFlash(req),
            basePath,
            applications
        });
    } catch (err) {
        console.error(`EVOConnect [${basePath}/applications]:`, err);
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

        const recipients = await roles.recipients(db,{type:roleType,id:userId});

        res.render('shared/messages', {
            title: 'Messages | EVOConnect',
            flash: getFlash(req),
            basePath,
            inbox,
            sent,
            recipients
        });
    } catch (err) {
        console.error(`EVOConnect [${basePath}/messages]:`, err);
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
        const target=await policy.account(db,receiverType,receiverId);
        if(!target)return res.status(404).send('Recipient unavailable.');
        if(roleType!=='admin' && receiverType!=='admin') {
            if(!policy.canConnect(roleType,receiverType))return res.status(403).send('These roles cannot communicate directly.');
            const connection=await roles.relationship(db,{type:roleType,id:req.user.id},target);
            if(!connection || connection.status!=='accepted')return res.status(403).send('Accept a connection request before sending direct messages.');
        }
        const receiverName=target.name;
        if(typeof body!=='string' || body.trim().length>10000 || typeof subject!=='string' || subject.length>255)return res.status(400).send('Enter a valid subject and a message up to 10,000 characters.');

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
        console.error(`EVOConnect [${basePath}/messages/send]:`, err);
        flash(req, 'error', 'Failed to send message.');
        res.redirect(`${basePath}/messages`);
    }
}

// ── Account Settings & Password Update ───────────────────────────────────────
function renderSettings(req, res, basePath) {
    res.render('shared/settings', {
        title: 'Account Settings | EVOConnect',
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
        console.error(`EVOConnect [${basePath}/settings/password]:`, err);
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
