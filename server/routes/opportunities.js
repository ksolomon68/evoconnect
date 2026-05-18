const express = require('express');
const { db } = require('../database');
const { requireRole, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Get all opportunities
router.get('/', async (req, res) => {
    try {
        console.log('WorkForce Connect API: Fetching all opportunities');
        let query = 'SELECT * FROM opportunities WHERE 1=1';
        const params = [];
        
        const { district, category, naics } = req.query;
        const userId = req.headers['x-user-id'];

        // Filter by NAICS code (exact match within JSON array)
        if (naics) {
            const naicsArray = naics.split(',').map(n => n.trim());
            if (naicsArray.length > 0) {
                // Use LIKE to avoid JSON_CONTAINS crashes on malformed JSON data in the DB
                const naicsConditions = naicsArray.map(() => 'naics_codes LIKE ?').join(' OR ');
                query += ` AND (${naicsConditions})`;
                naicsArray.forEach(code => params.push(`%"${code}"%`));
            }
        }

        // Filter by district (handle "all" districts)
        if (district && district !== 'all') {
            query += ' AND (district = ? OR district = "all")';
            params.push(district);
        }
        
        // Filter by category
        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }
        
        query += ' ORDER BY posted_date DESC';
        
        const [rows] = await db.execute(query, params);
        console.log(`WorkForce Connect API: Found ${rows.length} opportunities`);
        
        let userNaics = [];
        if (userId) {
            try {
                const [uRows] = await db.execute('SELECT naics_codes FROM users WHERE id = ?', [userId]);
                if (uRows.length > 0 && uRows[0].naics_codes) {
                    const parsed = typeof uRows[0].naics_codes === 'string' && uRows[0].naics_codes.startsWith('[') ? JSON.parse(uRows[0].naics_codes) : [];
                    userNaics = Array.isArray(parsed) ? parsed : [parsed];
                }
            } catch (e) {}
        }

        // Parse tags and NAICS from JSON, and determine Top Match
        rows.forEach(opp => {
            try { opp.tags = opp.tags ? JSON.parse(opp.tags) : []; } catch(e) { opp.tags = []; }
            try { opp.naics_codes = opp.naics_codes ? JSON.parse(opp.naics_codes) : []; } catch(e) { opp.naics_codes = []; }
            
            opp.is_top_match = false;
            if (userNaics.length > 0 && Array.isArray(opp.naics_codes) && opp.naics_codes.length > 0) {
                if (opp.naics_codes.some(code => userNaics.includes(code))) {
                    opp.is_top_match = true;
                }
            }
        });
        
        res.json(rows);
    } catch (error) {
        console.error('WorkForce Connect API Error fetching opportunities:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get opportunities by agency ID
router.get('/agency/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.execute('SELECT * FROM opportunities WHERE posted_by = ? ORDER BY posted_date DESC', [id]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get agency's opportunities with application status for a specific small business
router.get('/prime/:primeId/for-sb/:smallBusinessId', async (req, res) => {
    const { primeId, smallBusinessId } = req.params;
    try {
        const [rows] = await db.execute(`
            SELECT 
                o.id, o.title, o.status,
                IF(a.id IS NOT NULL, 1, 0) as has_applied
            FROM opportunities o
            LEFT JOIN applications a ON a.opportunity_id = o.id AND a.small_business_id = ?
            WHERE o.posted_by = ?
            ORDER BY o.posted_date DESC
        `, [smallBusinessId, primeId]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching prime opportunities for SB:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get single opportunity by ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    if (id === 'agency' || id === 'saved' || id === 'save' || id === 'unsave') return res.status(404).json({ error: 'Not found' });

    try {
        const [rows] = await db.execute('SELECT * FROM opportunities WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Opportunity not found' });
        }
        
        const opp = rows[0];
        try { opp.tags = opp.tags ? JSON.parse(opp.tags) : []; } catch(e) { opp.tags = []; }
        try { opp.naics_codes = opp.naics_codes ? JSON.parse(opp.naics_codes) : []; } catch(e) { opp.naics_codes = []; }
        
        res.json(opp);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Post new opportunity
router.post('/', requireRole(['agency', 'admin', 'wfc_admin']), async (req, res) => {
    let {
        id, title, scopeSummary, district, districtName,
        category, categoryName, subcategory, estimatedValue,
        dueDate, dueTime, submissionMethod, postedBy, status, attachments,
        duration, requirements, certifications, experience, description, tags, naics_codes
    } = req.body;

    const oppId = id || `OPP-${Date.now()}`;
    const desc = description || scopeSummary || '';
    
    // Determine status based on due date if not explicitly published
    let calcStatus = status || 'published';
    if (req.user && req.user.type === 'agency') {
        calcStatus = 'pending';
    } else if (dueDate && calcStatus !== 'published') {
        const due = new Date(dueDate);
        const now = new Date();
        calcStatus = due < now ? 'closed' : 'open';
    }

    if (!title || !district || !category || !estimatedValue || !dueDate || !desc) {
         return res.status(400).json({ error: 'All required fields must be filled' });
    }

    try {
        const uId = postedBy || req.user.id;
        // Validate postedBy user exists
        const [userRows] = await db.execute('SELECT id, business_name, organization_name FROM users WHERE id = ?', [uId]);
        if (userRows.length === 0) {
            return res.status(400).json({ error: 'Invalid postedBy User ID' });
        }
        
        const postedByName = userRows[0].business_name || userRows[0].organization_name || 'Prime Contractor';
        
        // Clean tags and NAICS
        const cleanTags = tags ? tags.filter(tag => tag && tag.trim()) : [];
        const cleanNaics = naics_codes ? naics_codes.filter(n => n && n.trim()) : [];

        const sql = `
            INSERT INTO opportunities (
                id, title, scope_summary, district, district_name, 
                category, category_name, subcategory, estimated_value, 
                due_date, due_time, submission_method, status, posted_by, attachments,
                duration, requirements, certifications, experience, description, tags, naics_codes, posted_by_name
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await db.execute(sql, [
            oppId, title, desc, district, districtName || district,
            category, categoryName || category, subcategory || null, estimatedValue || null,
            dueDate || null, dueTime || null, submissionMethod || null,
            calcStatus, uId, attachments ? JSON.stringify(attachments) : null,
            duration || null, requirements || null, certifications || null, experience || null,
            desc, JSON.stringify(cleanTags), JSON.stringify(cleanNaics), postedByName
        ]);

        if (calcStatus === 'pending') {
            await notifyAdminsOfPendingOpportunity(oppId, title, postedByName);
        }

        res.status(201).json({ id: oppId, success: true, opportunityId: oppId, title, status: calcStatus });
    } catch (error) {
        console.error('Error creating opportunity:', error);
        res.status(500).json({ error: error.message });
    }
});

// Approve opportunity (Admin only)
router.post('/:id/approve', requireAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const [existing] = await db.execute('SELECT status, title, posted_by, posted_by_name FROM opportunities WHERE id = ?', [id]);
        if (existing.length === 0) return res.status(404).json({ error: 'Opportunity not found' });

        const [result] = await db.execute('UPDATE opportunities SET status = ? WHERE id = ?', ['published', id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Opportunity not found' });
        }

        if (existing[0].status !== 'published') {
            const senderId = existing[0].posted_by || req.user?.id || 1;
            const senderName = existing[0].posted_by_name || 'Caltrans Admin';
            await notifyApplicantsOfStatusChange(id, existing[0].title, 'published', senderId, senderName);
            
            // Mark the admin notification message as completed
            await db.execute(`
                UPDATE messages 
                SET is_read = 1, subject = CONCAT('[Completed] ', subject)
                WHERE opportunity_id = ? AND message_type = 'system' AND subject LIKE 'Pending Approval:%'
            `, [id]);
        }

        res.json({ id, status: 'published' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper: notify all applicants of a status change via the messages system
async function notifyApplicantsOfStatusChange(opportunityId, opportunityTitle, newStatus, senderId, senderName) {
    try {
        const [applicants] = await db.execute(
            `SELECT a.small_business_id, u.business_name
             FROM applications a
             JOIN users u ON u.id = a.small_business_id
             WHERE a.opportunity_id = ?`,
            [opportunityId]
        );
        if (applicants.length === 0) return;

        const statusLabels = {
            published: 'open and accepting applications',
            open: 'open and accepting applications',
            closed: 'closed — applications are no longer being accepted',
            awarded: 'awarded',
            cancelled: 'cancelled'
        };
        const label = statusLabels[newStatus] || newStatus;
        const subject = `Update: ${opportunityTitle}`;
        const body = `This is an update regarding the opportunity you applied for.\n\nOpportunity: ${opportunityTitle}\nNew Status: ${newStatus.toUpperCase()}\n\nThis opportunity is now ${label}.\n\nPlease log in to WorkForce Connect to view full details.`;

        for (const applicant of applicants) {
            const receiverName = applicant.business_name || `Applicant ${applicant.small_business_id}`;
            const [msgResult] = await db.execute(
                `INSERT INTO messages (sender_id, receiver_id, sender_business_name, receiver_business_name, opportunity_id, message_type, subject, body)
                 VALUES (?, ?, ?, ?, ?, 'reply', ?, ?)`,
                [senderId, applicant.small_business_id, senderName, receiverName, opportunityId, subject, body]
            );
            await db.execute(
                `INSERT INTO notifications (user_id, message_id) VALUES (?, ?)`,
                [applicant.small_business_id, msgResult.insertId]
            );
        }
        console.log(`WorkForce Connect: Notified ${applicants.length} applicants of status change to "${newStatus}" for ${opportunityId}`);
    } catch (err) {
        console.error('WorkForce Connect: Failed to notify applicants:', err.message);
    }
}

// Helper: notify admins of a pending opportunity
async function notifyAdminsOfPendingOpportunity(opportunityId, opportunityTitle, postedByName) {
    try {
        const [admins] = await db.execute(`SELECT id FROM users WHERE type IN ('admin', 'wfc_admin')`);
        if (admins.length === 0) return;

        const subject = `Pending Approval: ${opportunityTitle}`;
        const body = `A new opportunity "${opportunityTitle}" has been submitted by ${postedByName} and is pending review. Please visit the admin dashboard to review and approve this opportunity.`;

        for (const admin of admins) {
            const [msgResult] = await db.execute(
                `INSERT INTO messages (sender_id, receiver_id, sender_business_name, receiver_business_name, opportunity_id, message_type, subject, body)
                 VALUES (?, ?, ?, ?, ?, 'system', ?, ?)`,
                [1, admin.id, 'System', 'Admin', opportunityId, subject, body]
            );
            await db.execute(
                `INSERT INTO notifications (user_id, message_id) VALUES (?, ?)`,
                [admin.id, msgResult.insertId]
            );
        }
        console.log(`WorkForce Connect: Notified admins of pending opportunity ${opportunityId}`);
    } catch (err) {
        console.error('WorkForce Connect: Failed to notify admins:', err.message);
    }
}

// Update opportunity
router.put('/:id', requireRole(['agency', 'admin']), async (req, res) => {
    const { id } = req.params;
    const {
        title, scopeSummary, description, tags, district, districtName,
        category, categoryName, subcategory, estimatedValue,
        dueDate, dueTime, submissionMethod, status, attachments,
        duration, requirements, certifications, experience, naics_codes
    } = req.body;

    const desc = description || scopeSummary;
    const cleanTags = tags ? tags.filter(tag => tag && tag.trim()) : [];
    const cleanNaics = naics_codes ? naics_codes.filter(n => n && n.trim()) : [];

    try {
        // Fetch current record to detect status change
        const [existing] = await db.execute('SELECT status, title, posted_by, posted_by_name FROM opportunities WHERE id = ?', [id]);
        if (existing.length === 0) return res.status(404).json({ error: 'Opportunity not found' });
        const oldStatus = existing[0].status;
        const oppTitle = title || existing[0].title;
        const senderId = existing[0].posted_by || req.user.id;
        const senderName = existing[0].posted_by_name || req.user.organization_name || 'Prime Contractor';

        const sql = `
            UPDATE opportunities SET
                title = ?, scope_summary = ?, district = ?, district_name = ?,
                category = ?, category_name = ?, subcategory = ?, estimated_value = ?,
                due_date = ?, due_time = ?, submission_method = ?, status = ?, attachments = ?,
                duration = ?, requirements = ?, certifications = ?, experience = ?, description = ?, tags = ?, naics_codes = ?
            WHERE id = ?
        `;

        await db.execute(sql, [
            title, desc, district, districtName,
            category, categoryName, subcategory || null, estimatedValue || null,
            dueDate || null, dueTime || null, submissionMethod || null,
            status || 'published', attachments ? JSON.stringify(attachments) : null,
            duration || null, requirements || null, certifications || null, experience || null, desc, JSON.stringify(cleanTags), JSON.stringify(cleanNaics),
            id
        ]);

        const newStatus = status || 'published';
        if (newStatus !== oldStatus) {
            await notifyApplicantsOfStatusChange(id, oppTitle, newStatus, senderId, senderName);
        }

        res.json({ id, title, status: newStatus });
    } catch (error) {
        console.error('Error updating opportunity:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete opportunity
router.delete('/:id', requireRole(['agency', 'admin']), async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await db.execute('DELETE FROM opportunities WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Opportunity not found' });
        }

        res.json({ message: 'Opportunity deleted successfully', id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Saved Opportunities Endpoints ---

// Get saved opportunities — caller must be the business whose saved list is requested
router.get('/saved/:smallBusinessId', requireRole(['small_business', 'admin', 'wfc_admin']), async (req, res) => {
    const { smallBusinessId } = req.params;
    const isAdmin = req.user.type === 'admin' || req.user.type === 'wfc_admin';
    if (!isAdmin && String(req.user.id) !== String(smallBusinessId)) {
        return res.status(403).json({ error: 'Forbidden: You may only view your own saved opportunities' });
    }
    try {
        const [rows] = await db.execute(`
            SELECT o.* FROM opportunities o
            JOIN saved_opportunities s ON o.id = s.opportunity_id
            WHERE s.small_business_id = ?
            ORDER BY s.saved_at DESC
        `, [smallBusinessId]);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Save an opportunity — smallBusinessId must match the authenticated user
router.post('/save', requireRole('small_business'), async (req, res) => {
    const { smallBusinessId, opportunityId } = req.body;
    if (!smallBusinessId || !opportunityId) {
        return res.status(400).json({ error: 'Small Business ID and Opportunity ID are required' });
    }
    if (String(req.user.id) !== String(smallBusinessId)) {
        return res.status(403).json({ error: 'Forbidden: You may only save opportunities for your own account' });
    }
    try {
        await db.execute(
            'INSERT IGNORE INTO saved_opportunities (small_business_id, opportunity_id) VALUES (?, ?)',
            [smallBusinessId, opportunityId]
        );
        res.status(201).json({ message: 'Opportunity saved successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save opportunity' });
    }
});

// Unsave an opportunity — smallBusinessId must match the authenticated user
router.post('/unsave', requireRole('small_business'), async (req, res) => {
    const { smallBusinessId, opportunityId } = req.body;
    if (!smallBusinessId || !opportunityId) {
        return res.status(400).json({ error: 'Small Business ID and Opportunity ID are required' });
    }
    if (String(req.user.id) !== String(smallBusinessId)) {
        return res.status(403).json({ error: 'Forbidden: You may only unsave opportunities for your own account' });
    }
    try {
        await db.execute(
            'DELETE FROM saved_opportunities WHERE small_business_id = ? AND opportunity_id = ?',
            [smallBusinessId, opportunityId]
        );
        res.status(200).json({ message: 'Opportunity unsaved successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to unsave opportunity' });
    }
});

// Unsave an opportunity (DELETE method) — path param must match authenticated user
router.delete('/unsave/:smallBusinessId/:opportunityId', requireRole('small_business'), async (req, res) => {
    const { smallBusinessId, opportunityId } = req.params;
    if (String(req.user.id) !== String(smallBusinessId)) {
        return res.status(403).json({ error: 'Forbidden: You may only remove your own saved opportunities' });
    }
    try {
        const [result] = await db.execute('DELETE FROM saved_opportunities WHERE small_business_id = ? AND opportunity_id = ?', [smallBusinessId, opportunityId]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Saved opportunity not found' });
        }
        res.json({ message: 'Opportunity removed from saved list' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove saved opportunity' });
    }
});

// Invite Small Business to Apply
router.post('/:id/invite', requireRole('agency'), async (req, res) => {
    const { id: opportunityId } = req.params;
    const { smallBusinessId, note } = req.body;
    const senderId = req.user.id;
    const senderBusinessName = req.user.business_name || req.user.organization_name || 'Prime Contractor';

    if (!smallBusinessId) {
        return res.status(400).json({ error: 'Small Business ID is required' });
    }

    try {
        // Fetch receiver's business name
        const [sbRows] = await db.execute('SELECT business_name FROM users WHERE id = ? AND type = "small_business"', [smallBusinessId]);
        if (sbRows.length === 0) return res.status(404).json({ error: 'Small Business not found' });
        const receiverBusinessName = sbRows[0].business_name;

        // Fetch opportunity details
        const [oppRows] = await db.execute('SELECT title FROM opportunities WHERE id = ?', [opportunityId]);
        if (oppRows.length === 0) return res.status(404).json({ error: 'Opportunity not found' });
        const oppTitle = oppRows[0].title;

        // Check for existing invitation
        const [existingInvites] = await db.execute(
            'SELECT id FROM messages WHERE sender_id = ? AND receiver_id = ? AND opportunity_id = ? AND message_type = "invite"',
            [senderId, smallBusinessId, opportunityId]
        );
        if (existingInvites.length > 0) {
            return res.status(400).json({ error: 'You have already invited this Small Business to this opportunity.' });
        }

        const appUrl = process.env.PUBLIC_URL || 'http://localhost:3001';
        let body = `You've been invited to apply for this opportunity.\n\nOpportunity: ${oppTitle}\n\nPlease review the details and submit your application if it aligns with your interests, or reply to this message if you'd like to discuss further.`;
        
        if (note) {
            body = `${note}\n\n---\n${body}`;
        }
        
        // Insert Message
        const [msgResult] = await db.execute(`
            INSERT INTO messages (sender_id, receiver_id, sender_business_name, receiver_business_name, opportunity_id, message_type, subject, body)
            VALUES (?, ?, ?, ?, ?, 'invite', ?, ?)
        `, [senderId, smallBusinessId, senderBusinessName, receiverBusinessName, opportunityId, `Invitation to Apply: ${oppTitle}`, body]);

        // Insert Notification
        await db.execute(`
            INSERT INTO notifications (user_id, message_id)
            VALUES (?, ?)
        `, [smallBusinessId, msgResult.insertId]);

        res.status(200).json({ message: 'Invitation sent successfully' });
    } catch (error) {
        console.error('Error sending invite:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get recommended Small Businesses for a specific opportunity
router.get('/:id/recommended-sbs', requireRole(['agency', 'admin']), async (req, res) => {
    const { id } = req.params;
    
    try {
        // Fetch opportunity's NAICS codes
        const [oppRows] = await db.execute('SELECT naics_codes FROM opportunities WHERE id = ?', [id]);
        if (oppRows.length === 0) {
            return res.status(404).json({ error: 'Opportunity not found' });
        }
        
        let oppNaics = [];
        try {
            oppNaics = oppRows[0].naics_codes ? JSON.parse(oppRows[0].naics_codes) : [];
        } catch (e) {}

        if (!Array.isArray(oppNaics) || oppNaics.length === 0) {
            // If the opportunity has no NAICS codes, we can't recommend matches based on NAICS
            return res.json([]);
        }

        // Use LIKE instead of JSON_CONTAINS to prevent crashes if DB contains malformed JSON
        const conditions = oppNaics.map(() => 'naics_codes LIKE ?').join(' OR ');
        const params = oppNaics.map(code => `%"${code}"%`);

        const query = `
            SELECT id, business_name, email, city, naics_codes
            FROM users 
            WHERE type = 'small_business' 
            AND (${conditions})
            LIMIT 50
        `;
        
        const [rows] = await db.execute(query, params);
        
        // Parse the naics_codes and identify matches
        const recommended = rows.map(sb => {
            let sbNaics = [];
            try { sbNaics = JSON.parse(sb.naics_codes); } catch (e) {}
            
            // Calculate intersection
            const matches = sbNaics.filter(code => oppNaics.includes(code));
            
            return {
                id: sb.id,
                business_name: sb.business_name,
                email: sb.email,
                city: sb.city,
                naics_codes: sbNaics,
                matched_codes: matches
            };
        });

        // Sort by number of matched NAICS codes descending
        recommended.sort((a, b) => b.matched_codes.length - a.matched_codes.length);

        res.json(recommended);
    } catch (error) {
        console.error('Error fetching recommended SBs:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
