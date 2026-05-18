const express = require('express');
const { db } = require('../database');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

const ensureHttps = (url) => {
    if (!url) return url;
    const trimmed = url.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return trimmed;
    }
    return `https://${trimmed}`;
};

// Get public users list (filtered by type, district, category)
router.get('/', async (req, res) => {
    const { type, district, category, search } = req.query;

    try {
        let query = "SELECT id, email, type, business_name, organization_name, contact_name, phone, districts, categories, business_description, certifications, years_in_business, capability_statement, created_at, naics_codes FROM users WHERE 1=1";
        const params = [];

        if (type) {
            query += " AND type = ?";
            params.push(type);
        }

        if (district) {
            query += " AND districts LIKE ?";
            params.push(`%${district}%`);
        }

        if (category) {
            query += " AND categories LIKE ?";
            params.push(`%${category}%`);
        }

        if (search) {
            query += " AND (business_name LIKE ? OR organization_name LIKE ? OR email LIKE ?)";
            const term = `%${search}%`;
            params.push(term, term, term);
        }

        query += " ORDER BY created_at DESC LIMIT 50";

        const [rows] = await db.execute(query, params);

        const processedUsers = rows.map(user => {
            let districts = [];
            let categories = [];
            let naics_codes = [];
            try {
                districts = user.districts ? (typeof user.districts === 'string' && user.districts.startsWith('[') ? JSON.parse(user.districts) : (Array.isArray(user.districts) ? user.districts : [user.districts])) : [];
                categories = user.categories ? (typeof user.categories === 'string' && user.categories.startsWith('[') ? JSON.parse(user.categories) : (Array.isArray(user.categories) ? user.categories : [user.categories])) : [];
                naics_codes = user.naics_codes ? (typeof user.naics_codes === 'string' && user.naics_codes.startsWith('[') ? JSON.parse(user.naics_codes) : (Array.isArray(user.naics_codes) ? user.naics_codes : [user.naics_codes])) : [];
            } catch (e) {
                console.warn(`Failed to parse fields for user ${user.id}`, e);
                districts = user.districts ? [user.districts] : [];
                categories = user.categories ? [user.categories] : [];
                naics_codes = user.naics_codes ? [user.naics_codes] : [];
            }
            return { ...user, districts, categories, naics_codes };
        });

        res.json(processedUsers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get public user profile by ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    console.log(`Fetching user profile for ID: ${id}`);

    try {
        const [rows] = await db.execute(`
            SELECT id, email, type, business_name, organization_name, contact_name, 
                   phone, ein, certification_number, districts, categories, business_description, 
                   capability_statement, website, address, city, state, zip, years_in_business, certifications, created_at, naics_codes 
            FROM users WHERE id = ?
        `, [id]);

        if (rows.length === 0) {
            console.warn(`User with ID ${id} not found in database.`);
            return res.status(404).json({ error: 'User not found' });
        }

        const user = rows[0];

        // Parse JSON fields safely
        try {
            user.districts = user.districts ? (typeof user.districts === 'string' && user.districts.startsWith('[') ? JSON.parse(user.districts) : (Array.isArray(user.districts) ? user.districts : [user.districts])) : [];
            user.categories = user.categories ? (typeof user.categories === 'string' && user.categories.startsWith('[') ? JSON.parse(user.categories) : (Array.isArray(user.categories) ? user.categories : [user.categories])) : [];
            user.naics_codes = user.naics_codes ? (typeof user.naics_codes === 'string' && user.naics_codes.startsWith('[') ? JSON.parse(user.naics_codes) : (Array.isArray(user.naics_codes) ? user.naics_codes : [user.naics_codes])) : [];
        } catch (e) {
            console.warn(`Failed to parse fields for user ${user.id}`, e);
            user.districts = user.districts ? [user.districts] : [];
            user.categories = user.categories ? [user.categories] : [];
            user.naics_codes = user.naics_codes ? [user.naics_codes] : [];
        }

        res.json(user);
    } catch (error) {
        console.error(`Error fetching user profile for ID ${id}:`, error.message);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// Update user profile — requires auth; users may only update their own record
router.put('/:id', requireRole('any'), async (req, res) => {
    const { id } = req.params;
    if (String(req.user.id) !== String(id) && req.user.type !== 'admin' && req.user.type !== 'wfc_admin') {
        return res.status(403).json({ error: 'Forbidden: You may only update your own profile' });
    }
    const {
        business_name, organization_name, contact_name, phone,
        website, address, city, state, zip, description,
        certifications, years_in_business, districts, categories,
        capability_statement, naics_codes
    } = req.body;

    const bizDesc = description || req.body.business_description;

    try {
        // Fetch existing user to prevent overwriting with nulls
        const [existingRows] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
        if (existingRows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const existingUser = existingRows[0];

        const safeVal = (newVal, oldVal) => (newVal !== undefined ? newVal : oldVal);

        const newBusinessName = safeVal(business_name, existingUser.business_name);
        const newOrgName = safeVal(organization_name, existingUser.organization_name);
        const newContactName = safeVal(contact_name, existingUser.contact_name);
        const newPhone = safeVal(phone, existingUser.phone);
        const newWebsite = ensureHttps(safeVal(website, existingUser.website));
        const newAddress = safeVal(address, existingUser.address);
        const newCity = safeVal(city, existingUser.city);
        const newState = safeVal(state, existingUser.state);
        const newZip = safeVal(zip, existingUser.zip);
        const newDesc = safeVal(bizDesc, existingUser.business_description);
        const newCerts = safeVal(certifications, existingUser.certifications);
        const newYears = safeVal(years_in_business, existingUser.years_in_business);
        const newCS = safeVal(capability_statement, existingUser.capability_statement);

        // Handle JSON arrays specially
        let newDistricts = existingUser.districts;
        if (districts !== undefined) {
            newDistricts = Array.isArray(districts) ? JSON.stringify(districts) : districts;
        }

        let newCategories = existingUser.categories;
        if (categories !== undefined) {
            newCategories = Array.isArray(categories) ? JSON.stringify(categories) : categories;
        }

        let newNaicsCodes = existingUser.naics_codes;
        if (naics_codes !== undefined) {
            newNaicsCodes = Array.isArray(naics_codes) ? JSON.stringify(naics_codes) : naics_codes;
        }

        const sql = `
            UPDATE users SET
                business_name = ?, organization_name = ?, contact_name = ?, phone = ?,
                website = ?, address = ?, city = ?, state = ?, zip = ?,
                business_description = ?, certifications = ?, years_in_business = ?,
                districts = ?, categories = ?, capability_statement = ?, naics_codes = ?
            WHERE id = ?
        `;

        const [result] = await db.execute(sql, [
            newBusinessName, newOrgName, newContactName, newPhone,
            newWebsite, newAddress, newCity, newState, newZip,
            newDesc, newCerts, newYears,
            newDistricts, newCategories, newCS, newNaicsCodes,
            id
        ]);

        // Fetch updated user to return
        const [updatedRows] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
        res.json(updatedRows[0]);
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

module.exports = router;
