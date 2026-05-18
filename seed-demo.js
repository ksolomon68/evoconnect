'use strict';
/**
 * EvoConnect — Demo Data Seed Script
 * ====================================
 * Creates one demo account for each portal role.
 * Safe to run multiple times — skips existing emails.
 *
 * Usage:  node seed-demo.js
 *
 * Demo credentials (all passwords: DemoPass1!)
 * ─────────────────────────────────────────────
 *  Admin:    demo-admin@evoconnect.io
 *  Prime:    demo-prime@evoconnect.io
 *  Business: demo-business@evoconnect.io
 *  Labor:    demo-labor@evoconnect.io
 */

const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path   = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const DEMO_PASSWORD = 'DemoPass1!';

async function seed() {
    console.log('\n🌱 EvoConnect Demo Seed — Starting...\n');

    const db = await mysql.createConnection({
        host:     process.env.DB_HOST     || 'localhost',
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME     || 'evoconnect'
    });

    const hash = await bcrypt.hash(DEMO_PASSWORD, 12);

    // ── Admin ───────────────────────────────────────────────────────────────────
    console.log('── Seeding demo admin...');
    try {
        const [ex] = await db.execute('SELECT id FROM admins WHERE email = ?', ['demo-admin@evoconnect.io']);
        if (ex.length) {
            console.log('  ⏭  demo-admin@evoconnect.io already exists — skipping');
        } else {
            await db.execute(
                'INSERT INTO admins (email, password_hash, name) VALUES (?, ?, ?)',
                ['demo-admin@evoconnect.io', hash, 'Demo Admin']
            );
            console.log('  ✅  Created: demo-admin@evoconnect.io (admin)');
        }
    } catch (e) { console.error('  ❌  Admin error:', e.message); }

    // ── Prime Contractor ────────────────────────────────────────────────────────
    console.log('── Seeding demo prime contractor...');
    try {
        const [ex] = await db.execute('SELECT id FROM primes WHERE email = ?', ['demo-prime@evoconnect.io']);
        if (ex.length) {
            console.log('  ⏭  demo-prime@evoconnect.io already exists — skipping');
        } else {
            await db.execute(
                `INSERT INTO primes
                    (company_name, contact_name, email, password_hash, phone,
                     sam_uei, contract_vehicles, naics_codes, city, state, zip,
                     subscription_tier, active, approved_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
                [
                    'Apex Construction Group',
                    'Marcus Thompson',
                    'demo-prime@evoconnect.io',
                    hash,
                    '512-555-0201',
                    'APEXCG1234567',
                    'GSA MAS, IDIQ, BPA',
                    JSON.stringify(['237310','238110','238210','238990']),
                    'Austin', 'TX', '78701',
                    'pro',
                    1  // active/approved
                ]
            );
            console.log('  ✅  Created: demo-prime@evoconnect.io (prime, tier: pro, approved)');
        }
    } catch (e) { console.error('  ❌  Prime error:', e.message); }

    // ── Business ────────────────────────────────────────────────────────────────
    console.log('── Seeding demo business...');
    try {
        const [ex] = await db.execute('SELECT id FROM businesses WHERE email = ?', ['demo-business@evoconnect.io']);
        if (ex.length) {
            console.log('  ⏭  demo-business@evoconnect.io already exists — skipping');
        } else {
            await db.execute(
                `INSERT INTO businesses
                    (company_name, contact_name, email, password_hash, phone,
                     business_type, certifications, sam_uei, sam_registered,
                     naics_codes, service_description, city, state, zip,
                     service_radius, profile_pct, status)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [
                    'GreenPath Environmental Services',
                    'Tanya Williams',
                    'demo-business@evoconnect.io',
                    hash,
                    '210-555-0301',
                    'LLC',
                    JSON.stringify(['DBE','SBE','WBE']),
                    'GRNPTH9876543',
                    'yes',
                    JSON.stringify(['541620','562910','238910']),
                    'Environmental consulting, site assessment, NEPA compliance, and hazardous materials management for transportation and infrastructure projects.',
                    'San Antonio', 'TX', '78205',
                    'statewide',
                    85,
                    'active'
                ]
            );
            console.log('  ✅  Created: demo-business@evoconnect.io (business, 85% profile)');
        }
    } catch (e) { console.error('  ❌  Business error:', e.message); }

    // ── Labor / Worker ──────────────────────────────────────────────────────────
    console.log('── Seeding demo labor worker...');
    try {
        const [ex] = await db.execute('SELECT id FROM workers WHERE email = ?', ['demo-labor@evoconnect.io']);
        if (ex.length) {
            console.log('  ⏭  demo-labor@evoconnect.io already exists — skipping');
        } else {
            await db.execute(
                `INSERT INTO workers
                    (full_name, email, password_hash, phone, trade_category,
                     skills, certifications, years_experience,
                     sam_registered, business_entity,
                     city, state, zip, travel_willingness, experience_summary,
                     profile_pct, status)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [
                    'James Okafor',
                    'demo-labor@evoconnect.io',
                    hash,
                    '713-555-0302',
                    'electrical',
                    JSON.stringify(['Traffic Signal Installation','Highway Lighting','Conduit & Pull Box','Fiber Conduit','Certified Payroll']),
                    JSON.stringify(['OSHA 30','IMSA Signal Level I','C-10 License']),
                    12,
                    'yes',
                    'sole_proprietor',
                    'Houston', 'TX', '77002',
                    'regional',
                    'Licensed electrical contractor with 12 years specializing in highway lighting, traffic signal upgrades, and electrical infrastructure for TxDOT and local public works projects. Certified payroll experience and prevailing wage compliance.',
                    72,
                    'active'
                ]
            );
            console.log('  ✅  Created: demo-labor@evoconnect.io (worker, 72% profile)');
        }
    } catch (e) { console.error('  ❌  Worker error:', e.message); }

    await db.end();

    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Demo seed complete!

All accounts use password: DemoPass1!

  Admin:    demo-admin@evoconnect.io    → /admin/dashboard
  Prime:    demo-prime@evoconnect.io    → /prime/dashboard
  Business: demo-business@evoconnect.io → /business/dashboard
  Labor:    demo-labor@evoconnect.io    → /labor/dashboard
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
}

seed().catch(err => {
    console.error('Seed failed:', err.message);
    process.exit(1);
});
