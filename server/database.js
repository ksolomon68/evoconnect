const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const isLive = !!(process.env.PHUSION_PASSENGER || process.env.PASSENGER_NODE_CONTROL_REPO || process.env.NODE_ENV === 'production');
if (isLive) {
    dotenv.config({ path: path.join(__dirname, '../.env.production'), override: true });
}

console.log('EvoConnect DB: Initializing MySQL Connection Pool...');

let pool;

function getDb() {
    if (!pool) {
        pool = mysql.createPool({
            host:             process.env.DB_HOST || 'localhost',
            user:             process.env.DB_USER,
            password:         process.env.DB_PASSWORD,
            database:         process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit:  10,
            queueLimit:       0,
            enableKeepAlive:  true,
            keepAliveInitialDelay: 10000
        });
        console.log('EvoConnect DB: MySQL Pool Created.');
    }
    return pool;
}

async function initDatabase() {
    console.log('EvoConnect DB: Running initDatabase()...');

    try {
        const setupConn = await mysql.createConnection({
            host:     process.env.DB_HOST || 'localhost',
            user:     process.env.DB_USER,
            password: process.env.DB_PASSWORD || ''
        });
        const dbName = process.env.DB_NAME || 'evoconnect';
        await setupConn.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        console.log(`EvoConnect DB: Database "${dbName}" ready.`);
        await setupConn.end();
    } catch (err) {
        console.warn('EvoConnect DB: Could not auto-create database:', err.message);
    }

    const db = getDb();

    try {
        await db.execute('SELECT 1');
        console.log('EvoConnect DB: Connection verified.');

        // ── 1. Workers (Labor Portal) ─────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS workers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                phone VARCHAR(50) NOT NULL,
                trade_category VARCHAR(100) NOT NULL,
                skills JSON,
                certifications JSON,
                years_experience INT DEFAULT 0,
                sam_registered ENUM('yes','no','needs_help') DEFAULT 'no',
                business_entity VARCHAR(100) DEFAULT 'none',
                city VARCHAR(100),
                state VARCHAR(2),
                zip VARCHAR(20),
                travel_willingness VARCHAR(50) DEFAULT 'local',
                experience_summary TEXT,
                resume_path VARCHAR(500),
                profile_pct TINYINT DEFAULT 0,
                status ENUM('active','inactive','suspended') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_trade (trade_category),
                INDEX idx_state (state),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 2. Businesses (Business Portal) ───────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS businesses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_name VARCHAR(255) NOT NULL,
                contact_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                phone VARCHAR(50) NOT NULL,
                business_type VARCHAR(100),
                certifications JSON,
                sam_uei VARCHAR(50),
                sam_registered ENUM('yes','no','needs_help') DEFAULT 'no',
                naics_codes JSON,
                service_description TEXT,
                city VARCHAR(100),
                state VARCHAR(2),
                zip VARCHAR(20),
                service_radius VARCHAR(50) DEFAULT 'local',
                capability_statement_generated_at DATETIME,
                profile_pct TINYINT DEFAULT 0,
                status ENUM('active','inactive','suspended') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_state (state),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 3. Prime Contractors ───────────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS primes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company_name VARCHAR(255) NOT NULL,
                contact_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                phone VARCHAR(50) NOT NULL,
                sam_uei VARCHAR(50) NOT NULL,
                contract_vehicles TEXT,
                naics_codes JSON,
                sub_types_needed JSON,
                city VARCHAR(100),
                state VARCHAR(2),
                zip VARCHAR(20),
                subscription_tier ENUM('basic','pro','enterprise') DEFAULT 'basic',
                monthly_views_used INT DEFAULT 0,
                monthly_contacts_used INT DEFAULT 0,
                views_reset_at DATE,
                active TINYINT DEFAULT 0,
                approved_at DATETIME,
                approved_by VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_status (active),
                INDEX idx_tier (subscription_tier)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 4. NAICS Codes Reference ───────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS naics_codes (
                code VARCHAR(10) PRIMARY KEY,
                description VARCHAR(255) NOT NULL,
                trade_category VARCHAR(100),
                avg_contract_size VARCHAR(50),
                set_aside_eligible TINYINT DEFAULT 1,
                resource_url VARCHAR(500),
                INDEX idx_trade_cat (trade_category)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 5. Worker NAICS Matches ────────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS worker_matches (
                id INT AUTO_INCREMENT PRIMARY KEY,
                worker_id INT NOT NULL,
                naics_code VARCHAR(10) NOT NULL,
                matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(worker_id, naics_code),
                INDEX idx_worker (worker_id),
                FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
                FOREIGN KEY (naics_code) REFERENCES naics_codes(code) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 6. Connections (Prime → Worker/Business) ───────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS connections (
                id INT AUTO_INCREMENT PRIMARY KEY,
                prime_id INT NOT NULL,
                target_type ENUM('worker','business') NOT NULL,
                target_id INT NOT NULL,
                status ENUM('pending','accepted','declined') DEFAULT 'pending',
                message TEXT,
                prime_company_name VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE(prime_id, target_type, target_id),
                INDEX idx_prime (prime_id),
                INDEX idx_target (target_type, target_id),
                FOREIGN KEY (prime_id) REFERENCES primes(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 7. Checklist Progress ──────────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS checklist_progress (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_type ENUM('worker','business') NOT NULL,
                user_id INT NOT NULL,
                track ENUM('federal','state','subcontractor') NOT NULL,
                item_key VARCHAR(100) NOT NULL,
                completed TINYINT DEFAULT 1,
                completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_type, user_id, track, item_key),
                INDEX idx_user (user_type, user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 8. Subcontractor RFQs (Enterprise primes) ─────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS subcontractor_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                prime_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                trade_service VARCHAR(100),
                location VARCHAR(255),
                timeline VARCHAR(100),
                contract_vehicle VARCHAR(255),
                description TEXT,
                status ENUM('open','closed','draft') DEFAULT 'open',
                applicant_count INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_prime (prime_id),
                FOREIGN KEY (prime_id) REFERENCES primes(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 9. Admin Users ─────────────────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS admins (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                name VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 10. Password Reset Tokens ──────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_type ENUM('worker','business','prime','admin') NOT NULL,
                user_id INT NOT NULL,
                token VARCHAR(255) NOT NULL UNIQUE,
                expires_at DATETIME NOT NULL,
                used TINYINT DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_token (token),
                INDEX idx_expires (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 11. Resource Library ───────────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS resources (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                url VARCHAR(500),
                category VARCHAR(100),
                audience ENUM('all','worker','business','prime') DEFAULT 'all',
                sort_order INT DEFAULT 0,
                status ENUM('active','inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 12. Announcements ──────────────────────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS announcements (
                id INT AUTO_INCREMENT PRIMARY KEY,
                message TEXT NOT NULL,
                type ENUM('info','warning','success') DEFAULT 'info',
                active TINYINT DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        console.log('EvoConnect DB: Core tables initialized.');

        // ── Seed NAICS codes ───────────────────────────────────────
        const [[{ nc }]] = await db.execute('SELECT COUNT(*) AS nc FROM naics_codes');
        if (nc === 0) {
            const naics = [
                ['237130','Telecommunications Infrastructure Construction','fiber-broadband','$500K–$5M',1],
                ['517311','Wired Telecom Carriers','fiber-broadband','$250K–$2M',1],
                ['238210','Electrical Contractors','electrical','$100K–$1M',1],
                ['517410','Satellite Telecom Carriers','structured-cabling','$250K–$2M',1],
                ['541512','Computer Systems Design Services','cloud-network-infra','$150K–$1.5M',1],
                ['517210','Wireless Telecom Carriers (except Satellite)','cloud-network-infra','$250K–$3M',1],
                ['484110','General Freight Trucking (Local)','cdl-trucking','$50K–$500K',1],
                ['484121','General Freight Trucking (Long-Distance TL)','cdl-trucking','$100K–$1M',1],
                ['484122','General Freight Trucking (Long-Distance LTL)','cdl-trucking','$100K–$1M',1],
                ['488490','Other Support Activities for Road Transport','cdl-trucking','$50K–$250K',1],
                ['238220','Plumbing, Heating, A/C Contractors','plumbing-hvac','$75K–$750K',1],
                ['332312','Fabricated Structural Metal Manufacturing','welding-fabrication','$100K–$1M',1],
                ['332313','Plate Work Manufacturing','welding-fabrication','$100K–$1M',1],
                ['238130','Framing Contractors','construction-general','$50K–$500K',1],
                ['238110','Concrete Contractors','concrete-cement','$75K–$750K',1],
                ['238140','Masonry Contractors','concrete-cement','$75K–$500K',1],
                ['238910','Site Preparation Contractors','construction-general','$100K–$1M',1],
                ['238320','Painting & Wall Covering Contractors','construction-general','$50K–$500K',1],
                ['238160','Roofing Contractors','construction-general','$50K–$500K',1],
                ['561730','Landscaping Services','landscaping','$25K–$250K',1],
                ['238990','Other Specialty Trade Contractors','construction-general','$50K–$500K',1],
                ['561320','Temporary Help Services','admin-clerical','$25K–$250K',1],
                ['541511','Custom Computer Programming Services','it-support','$100K–$1M',1],
                ['811212','Computer & Peripheral Equipment Repair','it-support','$25K–$250K',1],
                ['236220','Commercial & Institutional Building Construction','construction-general','$500K–$10M',1],
                ['237310','Highway, Street, Bridge Construction','concrete-cement','$1M–$50M',1],
                ['236115','New Single-Family Housing Construction','construction-general','$250K–$5M',0],
                ['541330','Engineering Services','cloud-network-infra','$250K–$5M',1],
                ['561110','Office Administrative Services','admin-clerical','$50K–$500K',1],
            ];
            for (const [code, desc, trade, avg, sa] of naics) {
                await db.execute(
                    `INSERT IGNORE INTO naics_codes (code, description, trade_category, avg_contract_size, set_aside_eligible) VALUES (?,?,?,?,?)`,
                    [code, desc, trade, avg, sa]
                );
            }
            console.log(`EvoConnect DB: Seeded ${naics.length} NAICS codes.`);
        }

        // ── Seed default resources ─────────────────────────────────
        const [[{ rc }]] = await db.execute('SELECT COUNT(*) AS rc FROM resources');
        if (rc === 0) {
            const resources = [
                ['SAM.gov Registration Guide','Step-by-step guide to registering on the federal vendor database.','https://sam.gov','Federal Basics','all',1],
                ['Capability Statement Template','Download and customize this one-page capability statement template.', null,'Capability Statement','all',2],
                ['Set-Aside Contract Explainer','Learn how set-aside programs work and which ones you qualify for.', null,'Federal Basics','worker',3],
                ['How Prime Contractors Pay Subs','Understand payment terms, milestone billing, and prompt pay requirements.', null,'Subcontracting','worker',4],
                ['8(a) Business Development Program','SBA\'s flagship small business program — eligibility and application.','https://www.sba.gov/federal-contracting/contracting-assistance-programs/8a-business-development-program','Certifications','business',5],
                ['HUBZone Program Guide','Historically Underutilized Business Zone certification and benefits.','https://www.sba.gov/federal-contracting/contracting-assistance-programs/hubzone-program','Certifications','business',6],
                ['Texas HUB Certification','Texas Historically Underutilized Business certification guide.','https://comptroller.texas.gov/purchasing/vendor/hub/','Certifications','business',7],
                ['BEAD Program Overview','$42B Broadband Equity Access & Deployment — fiber installer opportunities.','https://broadbandusa.ntia.gov/funding-programs/bead','Industry News','worker',8],
            ];
            for (const [title, desc, url, cat, audience, sort] of resources) {
                await db.execute(
                    `INSERT INTO resources (title, description, url, category, audience, sort_order) VALUES (?,?,?,?,?,?)`,
                    [title, desc, url, cat, audience, sort]
                );
            }
            console.log('EvoConnect DB: Seeded default resources.');
        }

        // ── Seed default admin ─────────────────────────────────────
        const [[{ ac }]] = await db.execute('SELECT COUNT(*) AS ac FROM admins');
        if (ac === 0) {
            const bcrypt = require('bcryptjs');
            const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'EvoConnect2026!';
            const hash = await bcrypt.hash(adminPassword, 12);
            await db.execute(
                `INSERT INTO admins (email, password_hash, name) VALUES (?, ?, ?)`,
                [process.env.ADMIN_EMAIL || 'admin@evoconnect.evobrand.net', hash, 'EvoConnect Admin']
            );
            console.log('EvoConnect DB: Default admin created.');
        }

        console.log('EvoConnect DB: All tables initialized successfully.');

        // Cleanup expired tokens hourly
        setInterval(async () => {
            try {
                const d = getDb();
                await d.execute('DELETE FROM password_reset_tokens WHERE expires_at < NOW() OR used = 1');
            } catch {}
        }, 60 * 60 * 1000);

    } catch (err) {
        console.error('EvoConnect DB CRITICAL ERROR:', err);
    }
}

module.exports = { getDb, initDatabase };
