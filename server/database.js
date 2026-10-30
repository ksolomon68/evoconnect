const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
const root = require('./services/app-root');
const demoContext = require('./services/demo-context');

dotenv.config({ path: path.join(root, '.env') });
// Always load .env.production if present — dotenv silently ignores missing files
dotenv.config({ path: path.join(root, '.env.production'), override: true });

console.log('EVOConnected DB: Initializing MySQL Connection Pool...');

let pool;

function createPool() {
    const cfg = {
        ...require('./services/database-config')(),
        waitForConnections: true,
        connectionLimit:  Number(process.env.DB_CONNECTION_LIMIT || 10),
        queueLimit:       0,
        enableKeepAlive:  true,
        keepAliveInitialDelay: 10000
    };
    const p = mysql.createPool(cfg);
    p.pool.on('error', (err) => {
        console.error('EVOConnected DB: Pool connection error —', err.message);
        if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
            pool = null;
        }
    });
    console.log(`EVOConnected DB: MySQL Pool Created → ${cfg.user}@${cfg.host}/${cfg.database}`);
    return p;
}

function getDb() {
    if (!pool) {
        pool = createPool();
    }
    return {
        async execute(sql, values) {
            try {
                return await pool.execute(demoContext.sql(sql), values);
            } catch (err) {
                if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
                    console.warn(`EVOConnected DB: Connection lost during execute, retrying... (${err.message})`);
                    pool = createPool();
                    return await pool.execute(demoContext.sql(sql), values);
                }
                throw err;
            }
        },
        async query(sql, values) {
            try {
                return await pool.query(demoContext.sql(sql), values);
            } catch (err) {
                if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
                    console.warn(`EVOConnected DB: Connection lost during query, retrying... (${err.message})`);
                    pool = createPool();
                    return await pool.query(demoContext.sql(sql), values);
                }
                throw err;
            }
        },
        async getConnection() {
            try {
                return demoContext.connection(await pool.getConnection());
            } catch (err) {
                if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
                    pool = createPool();
                    return demoContext.connection(await pool.getConnection());
                }
                throw err;
            }
        }
    };
}

// Keep-alive ping every 60s to prevent Hostinger idle disconnects
setInterval(async () => {
    try {
        await getDb().execute('SELECT 1');
    } catch (e) {
        pool = null;
    }
}, 60 * 1000);

async function initDatabase() {
    console.log('EVOConnected DB: Running initDatabase()...');

    try {
        if (process.env.DB_SKIP_CREATE === 'true') throw new Error('Using a provisioned database; skipping CREATE DATABASE.');
        const { database, ...setupConfig } = require('./services/database-config')();
        const setupConn = await mysql.createConnection(setupConfig);
        const dbName = process.env.DB_NAME || 'evoconnect';
        if (!/^[a-zA-Z0-9_-]+$/.test(dbName)) throw new Error('Invalid database name.');
        await setupConn.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        console.log(`EVOConnected DB: Database "${dbName}" ready.`);
        await setupConn.end();
    } catch (err) {
        console.warn('EVOConnected DB: Could not auto-create database:', err.message);
    }

    const db = getDb();

    try {
        await db.execute('SELECT 1');
        console.log('EVOConnected DB: Connection verified.');

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

        // ── 13. Contracting Opportunities (Caltrans Parity) ────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS opportunities (
                id VARCHAR(100) PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                scope_summary TEXT NOT NULL,
                description TEXT,
                district VARCHAR(50) NOT NULL DEFAULT 'all',
                district_name VARCHAR(100) NOT NULL DEFAULT 'Statewide / All Regions',
                category VARCHAR(100) NOT NULL,
                category_name VARCHAR(100) NOT NULL,
                subcategory VARCHAR(100),
                estimated_value VARCHAR(100),
                due_date VARCHAR(50),
                due_time VARCHAR(50),
                submission_method VARCHAR(255) DEFAULT 'Online Portal',
                status VARCHAR(50) NOT NULL DEFAULT 'published',
                posted_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                posted_by INT,
                posted_by_name VARCHAR(255),
                attachments TEXT,
                duration VARCHAR(100),
                requirements TEXT,
                certifications TEXT,
                experience TEXT,
                tags TEXT,
                naics_codes TEXT,
                INDEX idx_opp_status (status),
                INDEX idx_opp_cat (category),
                INDEX idx_opp_posted_by (posted_by)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 14. Opportunity Applications (Caltrans Parity) ─────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS applications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                opportunity_id VARCHAR(100) NOT NULL,
                applicant_type VARCHAR(50) NOT NULL DEFAULT 'business',
                applicant_id INT NOT NULL DEFAULT 0,
                small_business_id INT,
                prime_contractor_id INT,
                status VARCHAR(50) NOT NULL DEFAULT 'pending',
                applied_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                notes TEXT,
                INDEX idx_app_opp (opportunity_id),
                INDEX idx_app_user (applicant_type, applicant_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Safe column additions if legacy applications table existed
        await db.execute(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS applicant_type VARCHAR(50) NOT NULL DEFAULT 'business'`).catch(() => {});
        await db.execute(`ALTER TABLE applications ADD COLUMN IF NOT EXISTS applicant_id INT NOT NULL DEFAULT 0`).catch(() => {});

        // ── 15. Saved Opportunities (Caltrans Parity) ──────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS saved_opportunities (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_type VARCHAR(50) NOT NULL DEFAULT 'business',
                user_id INT NOT NULL DEFAULT 0,
                small_business_id INT,
                opportunity_id VARCHAR(100) NOT NULL,
                saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_saved_user (user_type, user_id),
                INDEX idx_saved_opp (opportunity_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await db.execute(`ALTER TABLE saved_opportunities ADD COLUMN IF NOT EXISTS user_type VARCHAR(50) NOT NULL DEFAULT 'business'`).catch(() => {});
        await db.execute(`ALTER TABLE saved_opportunities ADD COLUMN IF NOT EXISTS user_id INT NOT NULL DEFAULT 0`).catch(() => {});

        // ── 16. Internal Messages (Caltrans Parity) ────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS messages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sender_type VARCHAR(50) DEFAULT 'prime',
                sender_id INT NOT NULL,
                receiver_type VARCHAR(50) DEFAULT 'business',
                receiver_id INT NOT NULL,
                sender_business_name VARCHAR(255),
                receiver_business_name VARCHAR(255),
                opportunity_id VARCHAR(100),
                message_type ENUM('invite','application','reply','system') DEFAULT 'reply',
                subject VARCHAR(255),
                body TEXT NOT NULL,
                is_read TINYINT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_msg_receiver (receiver_type, receiver_id),
                INDEX idx_msg_sender (sender_type, sender_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await db.execute(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_type VARCHAR(50) DEFAULT 'prime'`).catch(() => {});
        await db.execute(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS receiver_type VARCHAR(50) DEFAULT 'business'`).catch(() => {});

        // ── 17. Notifications (Caltrans Parity) ────────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS notifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_type VARCHAR(50) DEFAULT 'business',
                user_id INT NOT NULL,
                message_id INT,
                is_read TINYINT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_notif_user (user_type, user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await db.execute(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_type VARCHAR(50) DEFAULT 'business'`).catch(() => {});

        // ── 18. Site Issues & Contact Submissions ──────────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS site_issues (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_type VARCHAR(50),
                user_id INT,
                name VARCHAR(255),
                email VARCHAR(255),
                issue_type VARCHAR(100) DEFAULT 'general',
                page_url VARCHAR(500),
                description TEXT NOT NULL,
                status ENUM('open','resolved') DEFAULT 'open',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // ── 19. CMS FAQs Table (Caltrans CMS Parity) ───────────────
        await db.execute(`
            CREATE TABLE IF NOT EXISTS cms_faqs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                category VARCHAR(100) NOT NULL DEFAULT 'General',
                question TEXT NOT NULL,
                answer LONGTEXT NOT NULL,
                sort_order INT DEFAULT 0,
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        console.log('EVOConnected DB: Core + Caltrans parity tables initialized.');

        // ── Seed & Sync Federal/State NAICS Codes ──────────────────
        const naics = [
            // Sector 23 — Construction & Specialty Infrastructure Trades
            ['236115','New Single-Family Housing Construction','construction-general','$250K–$5M',0],
            ['236116','New Multifamily Housing Construction','construction-general','$500K–$15M',1],
            ['236118','Residential & Facility Remodelers','construction-general','$100K–$2.5M',1],
            ['236210','Industrial Building Construction','construction-general','$1M–$25M',1],
            ['236220','Commercial & Institutional Building Construction','construction-general','$500K–$10M',1],
            ['237110','Water & Sewer Line and Related Structures Construction','underground-utilities','$250K–$5M',1],
            ['237120','Oil & Gas Pipeline and Related Structures Construction','underground-utilities','$500K–$10M',1],
            ['237130','Power & Communication Line and Related Structures Construction','fiber-broadband','$500K–$5M',1],
            ['237310','Highway, Street, and Bridge Construction','civil-construction','$1M–$50M',1],
            ['237990','Other Heavy & Civil Engineering Construction','civil-construction','$500K–$15M',1],
            ['238110','Poured Concrete Foundation & Structure Contractors','concrete-cement','$75K–$750K',1],
            ['238120','Structural Steel & Precast Concrete Contractors','welding-fabrication','$150K–$2M',1],
            ['238130','Framing Contractors','carpentry-framing','$50K–$500K',1],
            ['238140','Masonry Contractors','concrete-cement','$75K–$500K',1],
            ['238150','Glass & Glazing Contractors','painting-finishing','$50K–$500K',1],
            ['238160','Roofing Contractors','roofing','$50K–$500K',1],
            ['238170','Siding & Sheet Metal Exterior Contractors','roofing','$50K–$350K',1],
            ['238210','Electrical Contractors & Other Wiring Installation Contractors','electrical','$100K–$1M',1],
            ['238220','Plumbing, Heating, and Air-Conditioning Contractors','plumbing-hvac','$75K–$750K',1],
            ['238290','Other Building Equipment & Mechanical Contractors','hvac-mechanical','$100K–$1M',1],
            ['238310','Drywall & Insulation Contractors','carpentry-framing','$50K–$500K',1],
            ['238320','Painting & Wall Covering Contractors','painting-finishing','$50K–$500K',1],
            ['238330','Flooring Contractors','carpentry-framing','$35K–$350K',1],
            ['238350','Finish Carpentry Contractors','carpentry-framing','$50K–$400K',1],
            ['238910','Site Preparation, Excavation & Demolition Contractors','equipment-operation','$100K–$1M',1],
            ['238990','All Other Specialty Trade Contractors','construction-general','$50K–$500K',1],

            // Sector 33 — Structural Metal & Industrial Fabrication
            ['332312','Fabricated Structural Metal Manufacturing','welding-fabrication','$100K–$1M',1],
            ['332313','Plate Work Manufacturing','welding-fabrication','$100K–$1M',1],
            ['332322','Sheet Metal Work Manufacturing','welding-fabrication','$75K–$750K',1],

            // Sector 48 — CDL Trucking, Specialized Freight & Traffic Control
            ['484110','General Freight Trucking, Local','cdl-trucking','$50K–$500K',1],
            ['484121','General Freight Trucking, Long-Distance, Truckload','cdl-trucking','$100K–$1M',1],
            ['484122','General Freight Trucking, Long-Distance, Less Than Truckload','cdl-trucking','$100K–$1M',1],
            ['484220','Specialized Freight (Dump, Aggregate & Heavy Haul) Trucking, Local','cdl-trucking','$75K–$750K',1],
            ['484230','Specialized Freight (except Used Goods) Trucking, Long-Distance','cdl-trucking','$100K–$1.2M',1],
            ['488490','Other Support Activities for Road Transportation (Traffic Control)','cdl-trucking','$50K–$250K',1],

            // Sector 51 — Telecommunications, Broadband & Wireless Carriers
            ['517111','Wired Telecommunications Carriers (Fiber & Broadband)','fiber-broadband','$250K–$2.5M',1],
            ['517112','Wireless Telecommunications Carriers (5G & Cell Towers)','cell-site-tech','$250K–$3M',1],
            ['517210','Wireless Telecommunications Carriers (except Satellite)','cell-site-tech','$250K–$3M',1],
            ['517311','Wired Telecommunications Carriers','fiber-broadband','$250K–$2M',1],
            ['517410','Satellite Telecommunications','structured-cabling','$250K–$2M',1],

            // Sector 54 — Engineering, Surveying, IT & Environmental Consulting
            ['541330','Engineering Services','cloud-network-infra','$250K–$5M',1],
            ['541370','Surveying & Mapping (except Geophysical) Services','civil-construction','$75K–$750K',1],
            ['541511','Custom Computer Programming Services','it-support','$100K–$1M',1],
            ['541512','Computer Systems Design & Network Integration Services','cloud-network-infra','$150K–$1.5M',1],
            ['541513','Computer Facilities Management & Data Center Services','cloud-network-infra','$200K–$2M',1],
            ['541519','Other Computer Related & Field Tech Services','it-support','$75K–$750K',1],
            ['541620','Environmental Consulting Services','environmental','$85K–$500K',1],

            // Sector 56 — Facilities, Remediation, Security, Grounds & Staffing
            ['561110','Office Administrative & Project Support Services','admin-clerical','$50K–$500K',1],
            ['561210','Facilities Support & Base Operations Services','facilities-maintenance','$150K–$2.5M',1],
            ['561320','Temporary Help & Skilled Trade Staffing Services','admin-clerical','$25K–$250K',1],
            ['561612','Security Guards & Site Patrol Services','facilities-maintenance','$50K–$500K',1],
            ['561621','Security Systems Services (Access Control & CCTV)','structured-cabling','$75K–$750K',1],
            ['561720','Janitorial & Post-Construction Cleaning Services','facilities-maintenance','$25K–$300K',1],
            ['561730','Landscaping & Right-of-Way Vegetation Management','landscaping','$25K–$250K',1],
            ['562112','Hazardous Waste Collection Services','environmental','$100K–$1M',1],
            ['562910','Remediation, Abatement & Environmental Cleanup Services','environmental','$100K–$1M',1],

            // Sector 81 — Commercial Equipment & Electronic Repair
            ['811210','Electronic & Precision Equipment Repair and Maintenance','it-support','$50K–$400K',1],
            ['811212','Computer & Office Machine Repair and Maintenance','it-support','$25K–$250K',1],
            ['811310','Commercial & Industrial Machinery and Equipment Repair','welding-fabrication','$75K–$750K',1],
        ];
        for (const [code, desc, trade, avg, sa] of naics) {
            await db.execute(
                `INSERT IGNORE INTO naics_codes (code, description, trade_category, avg_contract_size, set_aside_eligible) VALUES (?,?,?,?,?)`,
                [code, desc, trade, avg, sa]
            );
        }
        console.log(`EVOConnected DB: Verified ${naics.length} NAICS codes.`);

        // ── Seed default resources ─────────────────────────────────
        const [[{ rc }]] = await db.execute('SELECT COUNT(*) AS rc FROM resources');
        if (rc === 0) {
            const resources = [
                ['SAM.gov Registration Guide','Step-by-step guide to registering on the federal vendor database.','https://sam.gov/content/entity-registration','Federal Basics','all',1],
                ['Capability Statement Template','Generate or customize a formatted one-page capability statement.','/business/capability-statement','Capability Statement','all',2],
                ['Set-Aside Contract Explainer','Learn how set-aside programs work and which ones you qualify for.','https://www.sba.gov/federal-contracting/contracting-guide/types-contracts','Federal Basics','worker',3],
                ['How Prime Contractors Pay Subs','Understand payment terms, milestone billing, and prompt pay requirements.','https://www.sba.gov/federal-contracting/contracting-guide/prime-subcontracting','Subcontracting','worker',4],
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
            console.log('EVOConnected DB: Seeded default resources.');
        }

        // Backfill any existing resources that had NULL urls from earlier seeds
        await db.execute(`UPDATE resources SET url = 'https://sam.gov/content/entity-registration' WHERE title = 'SAM.gov Registration Guide' AND (url IS NULL OR url = '' OR url = '#')`);
        await db.execute(`UPDATE resources SET url = 'https://www.sba.gov/federal-contracting/contracting-guide/basic-requirements' WHERE title = 'Capability Statement Template' AND (url IS NULL OR url = '' OR url = '#')`);
        await db.execute(`UPDATE resources SET url = 'https://www.sba.gov/federal-contracting/contracting-guide/types-contracts' WHERE title = 'Set-Aside Contract Explainer' AND (url IS NULL OR url = '' OR url = '#')`);
        await db.execute(`UPDATE resources SET url = 'https://www.sba.gov/federal-contracting/contracting-guide/prime-subcontracting' WHERE title = 'How Prime Contractors Pay Subs' AND (url IS NULL OR url = '' OR url = '#')`);

        // Provision the explicitly configured real administrator even if other admins exist.
        const [[{ ac }]] = await db.execute('SELECT COUNT(*) AS ac FROM admins');
        if (process.env.ADMIN_DEFAULT_PASSWORD) {
            await require('./services/provision-admin')(db, {
                email: process.env.ADMIN_EMAIL || 'admin@evoconnect.evobrand.net',
                password: process.env.ADMIN_DEFAULT_PASSWORD
            });
        } else if (ac === 0) {
            if (process.env.NODE_ENV === 'production') throw new Error('Set ADMIN_EMAIL and ADMIN_DEFAULT_PASSWORD to provision the first administrator.');
            await require('./services/provision-admin')(db, {
                email: process.env.ADMIN_EMAIL || 'admin@evoconnect.evobrand.net',
                password: 'EVOConnect2026!'
            });
        }

        if (process.env.NODE_ENV !== 'production') {
        // ── Auto-Seed Demo Accounts for All 4 Roles (Password: DemoPass1!) ──
        const bcryptDemo = require('bcryptjs');
        const demoHash = await bcryptDemo.hash('DemoPass1!', 10);

        await db.execute(
            `INSERT IGNORE INTO admins (email, password_hash, name) VALUES (?, ?, ?)`,
            ['demo-admin@evoconnect.io', demoHash, 'Demo Admin']
        );

        await db.execute(
            `INSERT IGNORE INTO primes
                (company_name, contact_name, email, password_hash, phone,
                 sam_uei, contract_vehicles, naics_codes, city, state, zip,
                 subscription_tier, active, approved_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), active = 1, subscription_tier = 'enterprise'`,
            [
                'Apex Construction Group',
                'Marcus Thompson',
                'demo-prime@evoconnect.io',
                demoHash,
                '512-555-0201',
                'APX123456789',
                'GSA MAS, IDIQ, BPA',
                '["237310","238110","238210","238990"]',
                'Austin', 'TX', '78701',
                'enterprise',
                1
            ]
        );

        await db.execute(
            `INSERT INTO businesses
                (company_name, contact_name, email, password_hash, phone,
                 business_type, certifications, sam_uei, sam_registered,
                 naics_codes, service_description, city, state, zip,
                 service_radius, profile_pct, status)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), status = 'active'`,
            [
                'GreenPath Environmental Services',
                'Tanya Williams',
                'demo-business@evoconnect.io',
                demoHash,
                '210-555-0301',
                'LLC',
                '["DBE","SBE","WBE"]',
                'GPT987654321',
                'yes',
                '["541620","562910","238910"]',
                'Environmental consulting, site assessment, NEPA compliance, and hazardous materials management for transportation and infrastructure projects.',
                'San Antonio', 'TX', '78205',
                'statewide',
                85,
                'active'
            ]
        );

        await db.execute(
            `INSERT INTO workers
                (full_name, email, password_hash, phone, trade_category,
                 skills, certifications, years_experience,
                 sam_registered, business_entity,
                 city, state, zip, travel_willingness, experience_summary,
                 profile_pct, status)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), status = 'active'`,
            [
                'James Okafor',
                'demo-labor@evoconnect.io',
                demoHash,
                '713-555-0302',
                'electrical',
                '["Traffic Signal Installation","Highway Lighting","Conduit & Pull Box","Fiber Conduit","Certified Payroll"]',
                '["OSHA 30","IMSA Signal Level I","C-10 License"]',
                12,
                'yes',
                'sole_proprietor',
                'Houston', 'TX', '77002',
                'regional',
                'Licensed electrical contractor with 12 years specializing in highway lighting, traffic signal upgrades, and electrical infrastructure for TxDOT and local public works projects.',
                72,
                'active'
            ]
        );

        // Ensure demo worker has NAICS matches
        const [demoW] = await db.execute(`SELECT id FROM workers WHERE email = 'demo-labor@evoconnect.io'`);
        if (demoW.length) {
            await db.execute(`INSERT IGNORE INTO worker_matches (worker_id, naics_code) VALUES (?, '238210')`, [demoW[0].id]);
            await db.execute(`INSERT IGNORE INTO worker_matches (worker_id, naics_code) VALUES (?, '237130')`, [demoW[0].id]);
        }

        // ── Seed Authentic Federal & State Solicitations & Trade Jobs ─────────────
        const [[{ oppCount }]] = await db.execute('SELECT COUNT(*) AS oppCount FROM opportunities');
        if (oppCount === 0) {
            const [demoP] = await db.execute(`SELECT id FROM primes WHERE email = 'demo-prime@evoconnect.io'`);
            const primeId = demoP.length ? demoP[0].id : 1;
            const [demoB] = await db.execute(`SELECT id FROM businesses WHERE email = 'demo-business@evoconnect.io'`);
            const businessId = demoB.length ? demoB[0].id : 1;
            const { federalAndStateOpportunities } = require('../scripts/seed-federal-state');

            for (const opp of federalAndStateOpportunities) {
                const actualPostedBy = opp.listing_type === 'job' ? businessId : primeId;
                await db.execute(`
                    INSERT IGNORE INTO opportunities (
                        id, title, scope_summary, description, district, district_name,
                        category, category_name, subcategory, estimated_value,
                        due_date, due_time, submission_method, status, posted_by, posted_by_name,
                        duration, requirements, certifications, naics_codes, posted_by_type, listing_type
                    ) VALUES (?,?,?, ?,?,?, ?,?,?,?, ?,?,?,?,?,?, ?,?,?,?, ?,?)
                `, [
                    opp.id, opp.title, opp.scope_summary, opp.description, opp.district, opp.district_name,
                    opp.category, opp.category_name, opp.subcategory, opp.estimated_value,
                    opp.due_date, opp.due_time, opp.submission_method, opp.status, actualPostedBy, opp.posted_by_name,
                    opp.duration, opp.requirements, opp.certifications, opp.naics_codes,
                    opp.posted_by_type, opp.listing_type
                ]);
            }
            console.log(`EVOConnected DB: Seeded ${federalAndStateOpportunities.length} authentic Federal & State contracting opportunities and labor jobs.`);
        }

        } // Development-only demo accounts and sample opportunities.
        console.log('EVOConnected DB: All tables initialized successfully.');

        await require('./services/runtime-schema')(db);
        await require('./services/flagship-schema')(db);
        await require('./services/faqs').migrate(db);
        await require('./services/branding-migration')(db);
        await require('./services/ecosystem-schema')(db);
        await require('./services/seed-migration')(db);
        await require('./services/opportunity-lifecycle').archiveExpired(db);
        setInterval(() => require('./services/opportunity-lifecycle').archiveExpired(db).catch(err => console.error('Opportunity expiry:', err)), 60 * 1000).unref();

        // Cleanup expired tokens hourly
        setInterval(async () => {
            try {
                const d = getDb();
                await d.execute('DELETE FROM password_reset_tokens WHERE expires_at < NOW() OR used = 1');
            } catch {}
        }, 60 * 60 * 1000);

    } catch (err) {
        console.error('EVOConnected DB CRITICAL ERROR:', err);
        throw err;
    }
}

module.exports = {
    get db() { return getDb(); },
    getDb,
    initDatabase
};
