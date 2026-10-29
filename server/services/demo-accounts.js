'use strict';
const bcrypt = require('bcryptjs');

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


module.exports = ensureDemoAccount;
