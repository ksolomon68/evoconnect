-- EvoConnect — Full Schema + Demo Accounts
-- Database: u579331817_evoconnect
-- Password for all demo accounts: DemoPass1!
-- Run this in phpMyAdmin — safe to run multiple times

-- ═══════════════════════════════════════════════════════════
-- PART 1: CREATE TABLES
-- ═══════════════════════════════════════════════════════════

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS naics_codes (
    code VARCHAR(10) PRIMARY KEY,
    description VARCHAR(255) NOT NULL,
    trade_category VARCHAR(100),
    avg_contract_size VARCHAR(50),
    set_aside_eligible TINYINT DEFAULT 1,
    resource_url VARCHAR(500),
    INDEX idx_trade_cat (trade_category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS worker_matches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    worker_id INT NOT NULL,
    naics_code VARCHAR(10) NOT NULL,
    matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(worker_id, naics_code),
    INDEX idx_worker (worker_id),
    FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
    FOREIGN KEY (naics_code) REFERENCES naics_codes(code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS announcements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message TEXT NOT NULL,
    type ENUM('info','warning','success') DEFAULT 'info',
    active TINYINT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════
-- PART 2: NAICS CODES
-- ═══════════════════════════════════════════════════════════

INSERT IGNORE INTO naics_codes (code, description, trade_category, avg_contract_size, set_aside_eligible) VALUES
('237130','Telecommunications Infrastructure Construction','fiber-broadband','$500K-$5M',1),
('517311','Wired Telecom Carriers','fiber-broadband','$250K-$2M',1),
('238210','Electrical Contractors','electrical','$100K-$1M',1),
('517410','Satellite Telecom Carriers','structured-cabling','$250K-$2M',1),
('541512','Computer Systems Design Services','cloud-network-infra','$150K-$1.5M',1),
('517210','Wireless Telecom Carriers (except Satellite)','cloud-network-infra','$250K-$3M',1),
('484110','General Freight Trucking (Local)','cdl-trucking','$50K-$500K',1),
('484121','General Freight Trucking (Long-Distance TL)','cdl-trucking','$100K-$1M',1),
('484122','General Freight Trucking (Long-Distance LTL)','cdl-trucking','$100K-$1M',1),
('488490','Other Support Activities for Road Transport','cdl-trucking','$50K-$250K',1),
('238220','Plumbing, Heating, A/C Contractors','plumbing-hvac','$75K-$750K',1),
('332312','Fabricated Structural Metal Manufacturing','welding-fabrication','$100K-$1M',1),
('332313','Plate Work Manufacturing','welding-fabrication','$100K-$1M',1),
('238130','Framing Contractors','construction-general','$50K-$500K',1),
('238110','Concrete Contractors','concrete-cement','$75K-$750K',1),
('238140','Masonry Contractors','concrete-cement','$75K-$500K',1),
('238910','Site Preparation Contractors','construction-general','$100K-$1M',1),
('238320','Painting & Wall Covering Contractors','construction-general','$50K-$500K',1),
('238160','Roofing Contractors','construction-general','$50K-$500K',1),
('561730','Landscaping Services','landscaping','$25K-$250K',1),
('238990','Other Specialty Trade Contractors','construction-general','$50K-$500K',1),
('561320','Temporary Help Services','admin-clerical','$25K-$250K',1),
('541511','Custom Computer Programming Services','it-support','$100K-$1M',1),
('811212','Computer & Peripheral Equipment Repair','it-support','$25K-$250K',1),
('236220','Commercial & Institutional Building Construction','construction-general','$500K-$10M',1),
('237310','Highway, Street, Bridge Construction','concrete-cement','$1M-$50M',1),
('541330','Engineering Services','cloud-network-infra','$250K-$5M',1),
('541620','Environmental Consulting Services','environmental','$85K-$500K',1),
('562910','Remediation Services','environmental','$100K-$1M',1),
('561110','Office Administrative Services','admin-clerical','$50K-$500K',1);

-- ═══════════════════════════════════════════════════════════
-- PART 3: DEFAULT RESOURCES
-- ═══════════════════════════════════════════════════════════

INSERT IGNORE INTO resources (title, description, url, category, audience, sort_order) VALUES
('SAM.gov Registration Guide','Step-by-step guide to registering on the federal vendor database.','https://sam.gov','Federal Basics','all',1),
('Capability Statement Template','Download and customize this one-page capability statement template.',NULL,'Capability Statement','all',2),
('Set-Aside Contract Explainer','Learn how set-aside programs work and which ones you qualify for.',NULL,'Federal Basics','worker',3),
('How Prime Contractors Pay Subs','Understand payment terms, milestone billing, and prompt pay requirements.',NULL,'Subcontracting','worker',4),
('8(a) Business Development Program','SBA flagship small business program — eligibility and application.','https://www.sba.gov/federal-contracting/contracting-assistance-programs/8a-business-development-program','Certifications','business',5),
('HUBZone Program Guide','Historically Underutilized Business Zone certification and benefits.','https://www.sba.gov/federal-contracting/contracting-assistance-programs/hubzone-program','Certifications','business',6),
('Texas HUB Certification','Texas Historically Underutilized Business certification guide.','https://comptroller.texas.gov/purchasing/vendor/hub/','Certifications','business',7),
('BEAD Program Overview','$42B Broadband Equity Access & Deployment — fiber installer opportunities.','https://broadbandusa.ntia.gov/funding-programs/bead','Industry News','worker',8);

-- ═══════════════════════════════════════════════════════════
-- PART 4: DEMO ACCOUNTS  (password: DemoPass1!)
-- ═══════════════════════════════════════════════════════════

-- Admin → /admin/dashboard
INSERT IGNORE INTO admins (email, password_hash, name)
VALUES ('demo-admin@evoconnect.io','$2a$12$x58F8CcalrNndb9SYpQCBu1qUN6LU9BIm6H56kGlDR0LqIj6SF.Qy','Demo Admin');

-- Prime Contractor (approved, pro tier) → /prime/dashboard
INSERT IGNORE INTO primes (company_name, contact_name, email, password_hash, phone, sam_uei, contract_vehicles, naics_codes, city, state, zip, subscription_tier, active, approved_at)
VALUES ('Apex Construction Group','Marcus Thompson','demo-prime@evoconnect.io','$2a$12$x58F8CcalrNndb9SYpQCBu1qUN6LU9BIm6H56kGlDR0LqIj6SF.Qy','512-555-0201','APEXCG1234567','GSA MAS, IDIQ, BPA','["237310","238110","238210","238990"]','Austin','TX','78701','pro',1,NOW());

-- Business (85% profile) → /business/dashboard
INSERT IGNORE INTO businesses (company_name, contact_name, email, password_hash, phone, business_type, certifications, sam_uei, sam_registered, naics_codes, service_description, city, state, zip, service_radius, profile_pct, status)
VALUES ('GreenPath Environmental Services','Tanya Williams','demo-business@evoconnect.io','$2a$12$x58F8CcalrNndb9SYpQCBu1qUN6LU9BIm6H56kGlDR0LqIj6SF.Qy','210-555-0301','LLC','["DBE","SBE","WBE"]','GRNPTH9876543','yes','["541620","562910","238910"]','Environmental consulting, site assessment, NEPA compliance, and hazardous materials management for transportation and infrastructure projects.','San Antonio','TX','78205','statewide',85,'active');

-- Labor / Worker (72% profile) → /labor/dashboard
INSERT IGNORE INTO workers (full_name, email, password_hash, phone, trade_category, skills, certifications, years_experience, sam_registered, business_entity, city, state, zip, travel_willingness, experience_summary, profile_pct, status)
VALUES ('James Okafor','demo-labor@evoconnect.io','$2a$12$x58F8CcalrNndb9SYpQCBu1qUN6LU9BIm6H56kGlDR0LqIj6SF.Qy','713-555-0302','electrical','["Traffic Signal Installation","Highway Lighting","Conduit & Pull Box","Fiber Conduit","Certified Payroll"]','["OSHA 30","IMSA Signal Level I","C-10 License"]',12,'yes','sole_proprietor','Houston','TX','77002','regional','Licensed electrical contractor with 12 years specializing in highway lighting, traffic signal upgrades, and electrical infrastructure for TxDOT and local public works projects.',72,'active');
