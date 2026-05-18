const express = require('express');
const { db } = require('../database');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

// Get application by ID — caller must be the applicant, the posting agency, or an admin
router.get('/:id', requireRole('any'), async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.execute(`
            SELECT a.*, o.title as opportunity_title, o.category, o.district as district_id, o.category_name as project_type,
                   o.posted_by as agency_id,
                   u.organization_name as agency_name, v.business_name as business_name, v.email as small_business_email
            FROM applications a
            JOIN opportunities o ON a.opportunity_id = o.id
            JOIN users u ON o.posted_by = u.id
            JOIN users v ON a.small_business_id = v.id
            WHERE a.id = ?
        `, [id]);

        if (rows.length === 0) return res.status(404).json({ error: 'Application not found' });

        const app = rows[0];
        const isAdmin = req.user.type === 'admin' || req.user.type === 'wfc_admin';
        const isApplicant = String(req.user.id) === String(app.small_business_id);
        const isAgency = String(req.user.id) === String(app.agency_id);
        if (!isAdmin && !isApplicant && !isAgency) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        res.json(app);
    } catch (error) {
        console.error('Error fetching application:', error);
        res.status(500).json({ error: 'Failed to fetch application' });
    }
});

// Get applications (filtered by small business or agency) — caller must own the ID being queried
router.get('/', requireRole('any'), async (req, res) => {
    const { smallBusinessId, primeContractorId } = req.query;
    const isAdmin = req.user.type === 'admin' || req.user.type === 'wfc_admin';

    // Non-admins may only query their own records
    if (!isAdmin) {
        const requestedId = smallBusinessId || primeContractorId;
        if (!requestedId || String(req.user.id) !== String(requestedId)) {
            return res.status(403).json({ error: 'Forbidden: You may only view your own applications' });
        }
    }

    try {
        let query = `
            SELECT a.*, o.title as project_title, o.district_name, u.organization_name as agency_name, v.business_name as business_name
            FROM applications a
            JOIN opportunities o ON a.opportunity_id = o.id
            JOIN users u ON o.posted_by = u.id
            JOIN users v ON a.small_business_id = v.id
            WHERE 1=1
        `;
        const params = [];

        if (smallBusinessId) {
            query += " AND a.small_business_id = ?";
            params.push(smallBusinessId);
        }

        if (primeContractorId) {
            query += " AND a.prime_contractor_id = ?";
            params.push(primeContractorId);
        }

        query += " ORDER BY a.applied_date DESC";

        const [rows] = await db.execute(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching applications:', error);
        res.status(500).json({ error: 'Failed to fetch applications' });
    }
});

// Submit new application / interest
router.post('/', requireRole('small_business'), async (req, res) => {
    const { opportunityId, smallBusinessId, notes } = req.body;

    if (!opportunityId || !smallBusinessId) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Find agency ID and Opportunity details
        const [oppRows] = await db.execute('SELECT title, posted_by FROM opportunities WHERE id = ?', [opportunityId]);
        if (oppRows.length === 0) return res.status(404).json({ error: 'Opportunity not found' });
        const opp = oppRows[0];

        // Fetch Prime's business name
        const [primeRows] = await db.execute('SELECT organization_name, business_name FROM users WHERE id = ?', [opp.posted_by]);
        const receiverBusinessName = primeRows[0]?.organization_name || primeRows[0]?.business_name || 'Prime Contractor';

        const senderBusinessName = req.user.business_name || req.user.contact_name;

        const sql = `
            INSERT INTO applications (opportunity_id, small_business_id, prime_contractor_id, notes)
            VALUES (?, ?, ?, ?)
        `;

        await db.execute(sql, [opportunityId, smallBusinessId, opp.posted_by, notes || null]);

        // Create message for Prime Contractor
        const body = `We have submitted an application for the opportunity: ${opp.title}.\n\nAdditional Notes: ${notes || 'None provided.'}`;
        
        const [msgResult] = await db.execute(`
            INSERT INTO messages (sender_id, receiver_id, sender_business_name, receiver_business_name, opportunity_id, message_type, subject, body)
            VALUES (?, ?, ?, ?, ?, 'application', ?, ?)
        `, [smallBusinessId, opp.posted_by, senderBusinessName, receiverBusinessName, opportunityId, `New Application: ${opp.title}`, body]);

        // Create notification for Prime Contractor
        await db.execute(`
            INSERT INTO notifications (user_id, message_id)
            VALUES (?, ?)
        `, [opp.posted_by, msgResult.insertId]);

        res.status(201).json({ message: 'Interest submitted successfully' });
    } catch (error) {
        console.error('Error submitting application:', error);
        if (error.code === 'ER_DUP_ENTRY' || error.message.includes('UNIQUE')) {
            return res.status(400).json({ error: 'Already applied' });
        }
        res.status(500).json({ error: 'Failed to submit application' });
    }
});

// Get applications for a specific opportunity — agency must own the opportunity, or admin
router.get('/opportunity/:opportunityId', requireRole(['agency', 'admin', 'wfc_admin']), async (req, res) => {
    const { opportunityId } = req.params;
    try {
        const isAdmin = req.user.type === 'admin' || req.user.type === 'wfc_admin';
        if (!isAdmin) {
            const [oppCheck] = await db.execute('SELECT posted_by FROM opportunities WHERE id = ?', [opportunityId]);
            if (oppCheck.length === 0) return res.status(404).json({ error: 'Opportunity not found' });
            if (String(oppCheck[0].posted_by) !== String(req.user.id)) {
                return res.status(403).json({ error: 'Forbidden: You may only view applicants for your own opportunities' });
            }
        }
        const [rows] = await db.execute(`
            SELECT a.id as application_id, a.applied_date, a.status, a.notes,
                   u.id as small_business_id, u.business_name, u.email, u.phone, u.contact_name,
                   u.districts, u.categories, u.capability_statement
            FROM applications a
            JOIN users u ON a.small_business_id = u.id
            WHERE a.opportunity_id = ?
            ORDER BY a.applied_date DESC
        `, [opportunityId]);

        // Parse JSON fields for small businesses
        const processed = rows.map(app => ({
            ...app,
            districts: app.districts ? (typeof app.districts === 'string' && app.districts.startsWith('[') ? JSON.parse(app.districts) : (Array.isArray(app.districts) ? app.districts : [app.districts])) : [],
            categories: app.categories ? (typeof app.categories === 'string' && app.categories.startsWith('[') ? JSON.parse(app.categories) : (Array.isArray(app.categories) ? app.categories : [app.categories])) : []
        }));

        res.json(processed);
    } catch (error) {
        console.error('Error fetching applications for opportunity:', error);
        res.status(500).json({ error: 'Failed to fetch applications' });
    }
});

// Get applications for a specific small business — caller must be that business or admin
router.get('/small-business/:smallBusinessId', requireRole(['small_business', 'admin', 'wfc_admin']), async (req, res) => {
    const { smallBusinessId } = req.params;
    const isAdmin = req.user.type === 'admin' || req.user.type === 'wfc_admin';
    if (!isAdmin && String(req.user.id) !== String(smallBusinessId)) {
        return res.status(403).json({ error: 'Forbidden: You may only view your own applications' });
    }
    try {
        const [rows] = await db.execute(`
            SELECT a.*, o.title as project_title, o.district_name, u.organization_name as agency_name
            FROM applications a
            JOIN opportunities o ON a.opportunity_id = o.id
            JOIN users u ON o.posted_by = u.id
            WHERE a.small_business_id = ?
            ORDER BY a.applied_date DESC
        `, [smallBusinessId]);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching applications for small business:', error);
        res.status(500).json({ error: 'Failed to fetch applications' });
    }
});

// Update application status — agency must own the opportunity; admin can update any
router.put('/:id', requireRole(['agency', 'admin', 'wfc_admin']), async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const allowed = ['pending', 'under_review', 'approved', 'declined', 'awarded'];
    if (!status || !allowed.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${allowed.join(', ')}` });
    }
    try {
        const isAdmin = req.user.type === 'admin' || req.user.type === 'wfc_admin';
        if (!isAdmin) {
            const [appCheck] = await db.execute(
                'SELECT o.posted_by FROM applications a JOIN opportunities o ON a.opportunity_id = o.id WHERE a.id = ?',
                [id]
            );
            if (appCheck.length === 0) return res.status(404).json({ error: 'Application not found' });
            if (String(appCheck[0].posted_by) !== String(req.user.id)) {
                return res.status(403).json({ error: 'Forbidden: You may only update applications for your own opportunities' });
            }
        }
        const [result] = await db.execute(
            'UPDATE applications SET status = ? WHERE id = ?',
            [status, id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Application not found' });
        res.json({ success: true, status });
    } catch (error) {
        console.error('Error updating application status:', error);
        res.status(500).json({ error: 'Failed to update application' });
    }
});

// Withdraw (delete) an application — caller must be the applicant
router.delete('/:id', requireRole('small_business'), async (req, res) => {
    const { id } = req.params;
    try {
        const [appCheck] = await db.execute('SELECT small_business_id FROM applications WHERE id = ?', [id]);
        if (appCheck.length === 0) return res.status(404).json({ error: 'Application not found' });
        if (String(appCheck[0].small_business_id) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Forbidden: You may only withdraw your own applications' });
        }
        const [result] = await db.execute(
            "DELETE FROM applications WHERE id = ? AND status = 'pending'",
            [id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Application not found or cannot be withdrawn (only pending applications can be withdrawn)' });
        }
        res.json({ success: true, message: 'Application withdrawn successfully' });
    } catch (error) {
        console.error('Error withdrawing application:', error);
        res.status(500).json({ error: 'Failed to withdraw application' });
    }
});

module.exports = router;
