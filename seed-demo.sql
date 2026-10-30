-- EVOConnected — Full Schema + Demo Accounts
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
VALUES ('Apex Construction Group','Marcus Thompson','demo-prime@evoconnect.io','$2a$12$x58F8CcalrNndb9SYpQCBu1qUN6LU9BIm6H56kGlDR0LqIj6SF.Qy','512-555-0201','APX123456789','GSA MAS, IDIQ, BPA','["237310","238110","238210","238990"]','Austin','TX','78701','pro',1,NOW());

-- Business (85% profile) → /business/dashboard
INSERT IGNORE INTO businesses (company_name, contact_name, email, password_hash, phone, business_type, certifications, sam_uei, sam_registered, naics_codes, service_description, city, state, zip, service_radius, profile_pct, status)
VALUES ('GreenPath Environmental Services','Tanya Williams','demo-business@evoconnect.io','$2a$12$x58F8CcalrNndb9SYpQCBu1qUN6LU9BIm6H56kGlDR0LqIj6SF.Qy','210-555-0301','LLC','["DBE","SBE","WBE"]','GPT987654321','yes','["541620","562910","238910"]','Environmental consulting, site assessment, NEPA compliance, and hazardous materials management for transportation and infrastructure projects.','San Antonio','TX','78205','statewide',85,'active');

-- Labor / Worker (72% profile) → /labor/dashboard
INSERT IGNORE INTO workers (full_name, email, password_hash, phone, trade_category, skills, certifications, years_experience, sam_registered, business_entity, city, state, zip, travel_willingness, experience_summary, profile_pct, status)
VALUES ('James Okafor','demo-labor@evoconnect.io','$2a$12$x58F8CcalrNndb9SYpQCBu1qUN6LU9BIm6H56kGlDR0LqIj6SF.Qy','713-555-0302','electrical','["Traffic Signal Installation","Highway Lighting","Conduit & Pull Box","Fiber Conduit","Certified Payroll"]','["OSHA 30","IMSA Signal Level I","C-10 License"]',12,'yes','sole_proprietor','Houston','TX','77002','regional','Licensed electrical contractor with 12 years specializing in highway lighting, traffic signal upgrades, and electrical infrastructure for TxDOT and local public works projects.',72,'active');


-- ═══════════════════════════════════════════════════════════
-- PART 5: AUTHENTIC STATE & FEDERAL SOLICITATIONS & LABOR JOBS
-- ═══════════════════════════════════════════════════════════

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
    posted_by INT DEFAULT 1,
    posted_by_name VARCHAR(255),
    posted_by_type VARCHAR(20) NOT NULL DEFAULT 'prime',
    listing_type ENUM('opportunity','job') NOT NULL DEFAULT 'opportunity',
    duration VARCHAR(100),
    requirements TEXT,
    certifications TEXT,
    naics_codes TEXT,
    INDEX idx_opp_status (status),
    INDEX idx_opp_cat (category),
    INDEX idx_opp_listing (listing_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO opportunities (
    id, title, scope_summary, description, district, district_name,
    category, category_name, subcategory, estimated_value,
    due_date, due_time, submission_method, status, posted_by,
    posted_by_name, posted_by_type, listing_type, duration,
    requirements, certifications, naics_codes
) VALUES (
    'NTIA-BEAD-TX-2026-014', 'BEAD Texas Broadband Office — Rural Fiber Backbone & Middle-Mile Splicing', 'Underground directional boring, conduit placement, fiber optic cable blowing, ribbon/loose-tube fusion splicing, and bi-directional OTDR testing across 68 miles of rural rights-of-way in East Texas.', 'Federal Broadband Equity, Access, and Deployment (BEAD) Program capital project funded under the Infrastructure Investment and Jobs Act (IIJA). Subcontractors will execute OSP fiber installation, high-count ribbon fusion splicing, handhole/vault placement, and end-to-end optical loss verification. Davis-Bacon Act prevailing wage requirements apply. Weekly certified payroll must be submitted via LCPtracker. Mandatory 15% DBE/HUB subcontractor participation target.', 'TX-Houston', 'Gulf Coast / Houston & East Texas',
    'fiber-broadband', 'Telecommunications, Fiber & Broadband', 'OSP Fiber Construction & Splicing', '$4,800,000 – $8,500,000',
    '2026-12-18', '16:00', 'Texas Broadband Portal / EVOConnected', 'published', 1,
    'Apex Infrastructure Solutions (Prime) / Texas BDO', 'prime', 'opportunity', '14 Months',
    'Active SAM.gov UEI registration, FOA/CFOT certified splicing crews, OSHA-10/30, $2M general liability aggregate, certified payroll compliance.', 'Texas HUB, DBE, SDVOSB, 8(a)', '["237130","517111","517311"]'
) ON DUPLICATE KEY UPDATE
    title = VALUES(title), scope_summary = VALUES(scope_summary), description = VALUES(description),
    district = VALUES(district), district_name = VALUES(district_name), category = VALUES(category),
    category_name = VALUES(category_name), subcategory = VALUES(subcategory), estimated_value = VALUES(estimated_value),
    due_date = VALUES(due_date), due_time = VALUES(due_time), submission_method = VALUES(submission_method),
    status = VALUES(status), posted_by_name = VALUES(posted_by_name), posted_by_type = VALUES(posted_by_type),
    listing_type = VALUES(listing_type), duration = VALUES(duration), requirements = VALUES(requirements),
    certifications = VALUES(certifications), naics_codes = VALUES(naics_codes);

INSERT INTO opportunities (
    id, title, scope_summary, description, district, district_name,
    category, category_name, subcategory, estimated_value,
    due_date, due_time, submission_method, status, posted_by,
    posted_by_name, posted_by_type, listing_type, duration,
    requirements, certifications, naics_codes
) VALUES (
    'USACE-SWF-2026-0089', 'USACE Fort Worth District — Trinity River Basin Flood Risk Management Levee Rehabilitation', 'Heavy civil earthwork, clay core embankment reconstruction, articulated concrete block (ACB) revetment installation, and drainage outfall structural gate replacements along 4.2 miles of floodway.', 'U.S. Army Corps of Engineers (USACE) Southwestern Division civil works solicitation. Project entails levee raising, structural slide repairs, placement of 38,000 SY of articulated concrete block matting, and installation of dual 72-inch cast iron sluice gates. Subcontractors must comply with USACE EM 385-1-1 Safety and Health Requirements Manual and maintain a full-time Site Safety and Health Officer (SSHO).', 'TX-Dallas', 'North Texas / DFW Region',
    'concrete-cement', 'Heavy Civil, Concrete & Flood Mitigation', 'Levee Earthwork & Concrete Revetment', '$7,200,000 – $14,000,000',
    '2027-01-20', '14:00', 'SAM.gov / EVOConnected Portal', 'published', 1,
    'U.S. Army Corps of Engineers (Fort Worth District)', 'prime', 'opportunity', '18 Months',
    'SAM.gov UEI verified, USACE EM 385-1-1 certified SSHO on site, minimum 5 years civil flood control experience, bonding capacity $5M+.', 'Small Business Set-Aside, 8(a), HUBZone', '["237990","237310","238910","238110"]'
) ON DUPLICATE KEY UPDATE
    title = VALUES(title), scope_summary = VALUES(scope_summary), description = VALUES(description),
    district = VALUES(district), district_name = VALUES(district_name), category = VALUES(category),
    category_name = VALUES(category_name), subcategory = VALUES(subcategory), estimated_value = VALUES(estimated_value),
    due_date = VALUES(due_date), due_time = VALUES(due_time), submission_method = VALUES(submission_method),
    status = VALUES(status), posted_by_name = VALUES(posted_by_name), posted_by_type = VALUES(posted_by_type),
    listing_type = VALUES(listing_type), duration = VALUES(duration), requirements = VALUES(requirements),
    certifications = VALUES(certifications), naics_codes = VALUES(naics_codes);

INSERT INTO opportunities (
    id, title, scope_summary, description, district, district_name,
    category, category_name, subcategory, estimated_value,
    due_date, due_time, submission_method, status, posted_by,
    posted_by_name, posted_by_type, listing_type, duration,
    requirements, certifications, naics_codes
) VALUES (
    'DOD-AF-2026-0312', 'DoD Joint Base San Antonio (Lackland AFB) — 15kV Medium Voltage Switchgear & Microgrid Modernization', 'Substation medium-voltage transformer replacement, 15kV vacuum circuit breaker switchgear commissioning, dual-redundant underground feeder raceways, and SCADA microgrid integration.', 'Department of the Air Force critical infrastructure resilience contract at JBSA-Lackland. Scope includes decommissioning legacy oil-filled transformers, installing three 3.5 MVA dry-type transformers, 15kV metal-clad drawout switchgear, and fiber-optic networked microgrid controls. All field personnel must pass DBIDS security background checks for military flightline and training compound access.', 'TX-SanAntonio', 'South Central / San Antonio Region',
    'electrical', 'Electrical & Power Systems', 'Medium Voltage & Substation Infrastructure', '$3,400,000 – $6,200,000',
    '2027-01-15', '15:00', 'SAM.gov / PIEE Solicitation', 'published', 1,
    'Department of the Air Force / 502d ABW', 'prime', 'opportunity', '12 Months',
    'TDLR Master Electricians on crew, NFPA 70E arc flash compliance, DBIDS base access clearance, certified factory test reports.', 'SDVOSB Set-Aside, SBE', '["238210","237130"]'
) ON DUPLICATE KEY UPDATE
    title = VALUES(title), scope_summary = VALUES(scope_summary), description = VALUES(description),
    district = VALUES(district), district_name = VALUES(district_name), category = VALUES(category),
    category_name = VALUES(category_name), subcategory = VALUES(subcategory), estimated_value = VALUES(estimated_value),
    due_date = VALUES(due_date), due_time = VALUES(due_time), submission_method = VALUES(submission_method),
    status = VALUES(status), posted_by_name = VALUES(posted_by_name), posted_by_type = VALUES(posted_by_type),
    listing_type = VALUES(listing_type), duration = VALUES(duration), requirements = VALUES(requirements),
    certifications = VALUES(certifications), naics_codes = VALUES(naics_codes);

INSERT INTO opportunities (
    id, title, scope_summary, description, district, district_name,
    category, category_name, subcategory, estimated_value,
    due_date, due_time, submission_method, status, posted_by,
    posted_by_name, posted_by_type, listing_type, duration,
    requirements, certifications, naics_codes
) VALUES (
    'VA-VISN17-2026-044', 'VA North Texas Health Care — Dallas VA Medical Center Central Utility Plant Chiller & Piping Overhaul', 'Turnkey replacement of two 1,200-ton water-cooled centrifugal chillers, induced-draft cooling towers, variable-speed secondary hydronic pumping skids, and automated central plant controls.', 'Department of Veterans Affairs medical center energy reliability overhaul. Demolition of end-of-life R-134a chillers, rigging and structural vibration isolation of high-efficiency magnetic-bearing centrifugal units, pre-insulated Schedule 40 carbon steel chilled water headers, and BACnet interface integration. Subcontractor must execute an approved Infection Control Risk Assessment (ICRA Class IV) containment plan.', 'TX-Dallas', 'North Texas / DFW Region',
    'plumbing-hvac', 'Commercial Mechanical & HVAC Systems', 'Central Utility Plant & Industrial Hydronics', '$2,600,000 – $4,900,000',
    '2026-12-05', '14:30', 'SAM.gov / EVOConnected Portal', 'published', 1,
    'Veterans Health Administration (VISN 17)', 'prime', 'opportunity', '10 Months',
    'Texas ACR Class A or Master Plumber/Pipefitter licenses, EPA Section 608 Universal, ICRA containment compliance, Davis-Bacon payroll.', 'SDVOSB, VOSB Set-Aside', '["238220","238290","237110"]'
) ON DUPLICATE KEY UPDATE
    title = VALUES(title), scope_summary = VALUES(scope_summary), description = VALUES(description),
    district = VALUES(district), district_name = VALUES(district_name), category = VALUES(category),
    category_name = VALUES(category_name), subcategory = VALUES(subcategory), estimated_value = VALUES(estimated_value),
    due_date = VALUES(due_date), due_time = VALUES(due_time), submission_method = VALUES(submission_method),
    status = VALUES(status), posted_by_name = VALUES(posted_by_name), posted_by_type = VALUES(posted_by_type),
    listing_type = VALUES(listing_type), duration = VALUES(duration), requirements = VALUES(requirements),
    certifications = VALUES(certifications), naics_codes = VALUES(naics_codes);

INSERT INTO opportunities (
    id, title, scope_summary, description, district, district_name,
    category, category_name, subcategory, estimated_value,
    due_date, due_time, submission_method, status, posted_by,
    posted_by_name, posted_by_type, listing_type, duration,
    requirements, certifications, naics_codes
) VALUES (
    'GSA-PBS-R7-2026-0155', 'GSA Public Buildings Service Region 7 — Federal Courthouse Physical Access Control & Structured Cabling', 'Comprehensive low-voltage structured cabling, Cat6A shielded plenum drops, OM4 armored optical riser backbone, and HSPD-12 / FIPS 201 compliant access control portal deployment.', 'General Services Administration PBS Region 7 task order for federal judicial facility security modernization. Installation of 1,450 Cat6A workstation runs, secure telecom closets (TRs), enterprise access control turnstiles, and biometric perimeter readers. Work must be scheduled during non-court operational hours. All lead technicians must hold active BICSI credentials.', 'TX-Austin', 'Central Texas / Austin Region',
    'structured-cabling', 'Low-Voltage & Telecommunications Systems', 'BICSI Structured Cabling & PACS Security', '$1,100,000 – $2,300,000',
    '2026-11-28', '17:00', 'GSA eBuy / EVOConnected Portal', 'published', 1,
    'General Services Administration (GSA PBS R7)', 'prime', 'opportunity', '8 Months',
    'BICSI RCDD or Technician certification, HSPD-12 clearance badging, certified Fluke Versiv optical / copper test summaries.', 'WOSB, SBE, Texas HUB', '["238210","561621","541512"]'
) ON DUPLICATE KEY UPDATE
    title = VALUES(title), scope_summary = VALUES(scope_summary), description = VALUES(description),
    district = VALUES(district), district_name = VALUES(district_name), category = VALUES(category),
    category_name = VALUES(category_name), subcategory = VALUES(subcategory), estimated_value = VALUES(estimated_value),
    due_date = VALUES(due_date), due_time = VALUES(due_time), submission_method = VALUES(submission_method),
    status = VALUES(status), posted_by_name = VALUES(posted_by_name), posted_by_type = VALUES(posted_by_type),
    listing_type = VALUES(listing_type), duration = VALUES(duration), requirements = VALUES(requirements),
    certifications = VALUES(certifications), naics_codes = VALUES(naics_codes);

INSERT INTO opportunities (
    id, title, scope_summary, description, district, district_name,
    category, category_name, subcategory, estimated_value,
    due_date, due_time, submission_method, status, posted_by,
    posted_by_name, posted_by_type, listing_type, duration,
    requirements, certifications, naics_codes
) VALUES (
    'FHWA-ERFO-TX-2026-09', 'FHWA Emergency Relief Program — FM 1485 Culvert & Roadway Flood Damage Reconstruction', 'Rapid repair of flood-damaged highway embankment, excavation and placement of triple 10ft x 8ft precast concrete box culverts, headwall concrete forming, and 1.8 miles of subgrade stabilization.', 'Federal Highway Administration Emergency Relief for Federally Owned Roads (ERFO) fast-track construction subcontract. Involves deep dewatering, sheet piling cofferdam installation, subgrade lime stabilization, and Class S structural concrete headwalls. Time is of the essence; contractor must mobilize within 14 calendar days of notice to proceed.', 'TX-Houston', 'Gulf Coast / Houston Region',
    'concrete-cement', 'Civil Infrastructure & Drainage', 'Precast Box Culverts & Asphalt Paving', '$3,800,000 – $5,900,000',
    '2026-12-22', '15:00', 'TxDOT Bonfire / EVOConnected Portal', 'published', 1,
    'Austin Bridge & Road (Prime Contractor)', 'prime', 'opportunity', '7 Months',
    'TxDOT prequalification in Earthwork, Box Culverts, and HMAC paving. 24/7 emergency mobilization capability.', 'Texas DBE, SBE, HUB', '["237310","238910","238110"]'
) ON DUPLICATE KEY UPDATE
    title = VALUES(title), scope_summary = VALUES(scope_summary), description = VALUES(description),
    district = VALUES(district), district_name = VALUES(district_name), category = VALUES(category),
    category_name = VALUES(category_name), subcategory = VALUES(subcategory), estimated_value = VALUES(estimated_value),
    due_date = VALUES(due_date), due_time = VALUES(due_time), submission_method = VALUES(submission_method),
    status = VALUES(status), posted_by_name = VALUES(posted_by_name), posted_by_type = VALUES(posted_by_type),
    listing_type = VALUES(listing_type), duration = VALUES(duration), requirements = VALUES(requirements),
    certifications = VALUES(certifications), naics_codes = VALUES(naics_codes);

INSERT INTO opportunities (
    id, title, scope_summary, description, district, district_name,
    category, category_name, subcategory, estimated_value,
    due_date, due_time, submission_method, status, posted_by,
    posted_by_name, posted_by_type, listing_type, duration,
    requirements, certifications, naics_codes
) VALUES (
    'TXDOT-2026-1044-HOU', 'TxDOT Houston District — I-45 North Corridor Concrete Pavement & ITS Modernization', 'Continuous Reinforced Concrete Pavement (CRCP) slipform paving (11-inch depth), steel rebar cage assembly, inductive loop detectors, dynamic message sign (DMS) truss assembly, and highway illumination.', 'TxDOT Houston District interstate highway reconstruction corridor. Subcontractors will execute slipform paving operations, placement of grade 60 epoxy-coated reinforcement, longitudinal sawing, joint sealing, and electrical infrastructure for TxDOT Lonestar Traffic Management integration. TxDOT audited certified payroll and DBE reporting mandatory.', 'TX-Houston', 'Gulf Coast / Houston Region',
    'concrete-cement', 'Highway, Street, Bridge & Heavy Civil', 'CRCP Slipform Paving & Rebar Placement', '$16,500,000 – $28,000,000',
    '2027-01-28', '14:00', 'TxDOT Bonfire Electronic Submittal', 'published', 1,
    'Williams Brothers Construction Co. (Prime) / TxDOT', 'prime', 'opportunity', '24 Months',
    'TxDOT Prequalified in Concrete Paving and Highway Illumination. Minimum $5M commercial bonding. Certified QC testing.', 'Texas DBE (Goal: 11.5%), Texas HUB', '["237310","238110","238120"]'
) ON DUPLICATE KEY UPDATE
    title = VALUES(title), scope_summary = VALUES(scope_summary), description = VALUES(description),
    district = VALUES(district), district_name = VALUES(district_name), category = VALUES(category),
    category_name = VALUES(category_name), subcategory = VALUES(subcategory), estimated_value = VALUES(estimated_value),
    due_date = VALUES(due_date), due_time = VALUES(due_time), submission_method = VALUES(submission_method),
    status = VALUES(status), posted_by_name = VALUES(posted_by_name), posted_by_type = VALUES(posted_by_type),
    listing_type = VALUES(listing_type), duration = VALUES(duration), requirements = VALUES(requirements),
    certifications = VALUES(certifications), naics_codes = VALUES(naics_codes);

INSERT INTO opportunities (
    id, title, scope_summary, description, district, district_name,
    category, category_name, subcategory, estimated_value,
    due_date, due_time, submission_method, status, posted_by,
    posted_by_name, posted_by_type, listing_type, duration,
    requirements, certifications, naics_codes
) VALUES (
    'TXDOT-2026-0881-DAL', 'TxDOT Dallas District — Loop 12 / I-30 Interchange Bridge Structural Steel & Expansion Joint Rehabilitation', 'Replacement of modular bridge expansion joints, bearing pad jacking and resetting, fatigue crack gouging and AWS D1.5 field welding, and SSPC-QP2 industrial coatings recoating on 8 bridge overpasses.', 'Major interchange structural maintenance for TxDOT Dallas District. Subcontractor packages include high-load multi-rotational elastomeric bearing installation, overhead SMAW/FCAW structural steel stiffener welding, blast cleaning to SSPC-SP 10 (Near-White), and three-coat moisture-cure urethane system application under strict environmental containment.', 'TX-Dallas', 'North Texas / DFW Region',
    'welding-fabrication', 'Structural Welding & Steel Fabrication', 'Bridge Expansion Joints, Bearings & Structural Steel', '$5,400,000 – $9,100,000',
    '2026-12-12', '16:00', 'TxDOT Bonfire / EVOConnected Portal', 'published', 1,
    'Granite Construction (Prime) / TxDOT Dallas', 'prime', 'opportunity', '11 Months',
    'AISC Certified Advanced Bridge Fabricator or Erector, AWS D1.5 certified welders, SSPC-QP1/QP2 certified industrial coating contractor.', 'Texas DBE (Goal: 9.0%), Texas HUB', '["332312","237310","238120","238320"]'
) ON DUPLICATE KEY UPDATE
    title = VALUES(title), scope_summary = VALUES(scope_summary), description = VALUES(description),
    district = VALUES(district), district_name = VALUES(district_name), category = VALUES(category),
    category_name = VALUES(category_name), subcategory = VALUES(subcategory), estimated_value = VALUES(estimated_value),
    due_date = VALUES(due_date), due_time = VALUES(due_time), submission_method = VALUES(submission_method),
    status = VALUES(status), posted_by_name = VALUES(posted_by_name), posted_by_type = VALUES(posted_by_type),
    listing_type = VALUES(listing_type), duration = VALUES(duration), requirements = VALUES(requirements),
    certifications = VALUES(certifications), naics_codes = VALUES(naics_codes);

INSERT INTO opportunities (
    id, title, scope_summary, description, district, district_name,
    category, category_name, subcategory, estimated_value,
    due_date, due_time, submission_method, status, posted_by,
    posted_by_name, posted_by_type, listing_type, duration,
    requirements, certifications, naics_codes
) VALUES (
    'TXDOT-2026-0842-AUS', 'TxDOT Austin District — I-35 Capital Express Central ITS, Fiber Conduit & Highway Illumination System', 'Installation of 22 miles of multi-duct fiber conduit bank, directional boring under highway ramps, high-mast LED illumination assemblies, and automated traffic surveillance CCTV towers.', 'Critical systems subcontract for the multi-billion-dollar I-35 Capital Express Central Project in Austin. Work encompasses electrical trenching, 4-inch SDR-11 HDPE multi-duct placement, pull boxes (TxDOT Type PB), bored road crossings, copper conductor pulls, and installation of 150-ft high-mast illumination towers with lowering mechanisms.', 'TX-Austin', 'Central Texas / Austin Region',
    'electrical', 'Electrical & Power Systems', 'Intelligent Transportation Systems (ITS) & High-Mast Lighting', '$8,200,000 – $13,500,000',
    '2027-02-10', '15:00', 'TxDOT Bonfire / EVOConnected Portal', 'published', 1,
    'Fluor-Balfour Beatty Infrastructure JV (Prime)', 'prime', 'opportunity', '16 Months',
    'TxDOT Electrical Prequalification, IMSA Level II Traffic Signal Inspectors, TDLR Journeyman/Master electricians on shift, certified payroll.', 'Texas DBE (Goal: 12.0%), Texas HUB, SBE', '["238210","237130","237310"]'
) ON DUPLICATE KEY UPDATE
    title = VALUES(title), scope_summary = VALUES(scope_summary), description = VALUES(description),
    district = VALUES(district), district_name = VALUES(district_name), category = VALUES(category),
    category_name = VALUES(category_name), subcategory = VALUES(subcategory), estimated_value = VALUES(estimated_value),
    due_date = VALUES(due_date), due_time = VALUES(due_time), submission_method = VALUES(submission_method),
    status = VALUES(status), posted_by_name = VALUES(posted_by_name), posted_by_type = VALUES(posted_by_type),
    listing_type = VALUES(listing_type), duration = VALUES(duration), requirements = VALUES(requirements),
    certifications = VALUES(certifications), naics_codes = VALUES(naics_codes);

INSERT INTO opportunities (
    id, title, scope_summary, description, district, district_name,
    category, category_name, subcategory, estimated_value,
    due_date, due_time, submission_method, status, posted_by,
    posted_by_name, posted_by_type, listing_type, duration,
    requirements, certifications, naics_codes
) VALUES (
    'DIR-TELECOM-2026-302', 'Texas DIR — Statewide Structured Cabling, Fiber Optic Splicing & Low-Voltage Maintenance', 'Ongoing statewide delivery order contract providing inside/outside plant voice-data structured cabling, fiber backbone terminations, rack-and-stack telecom room fit-outs, and emergency cable repair across state agency facilities.', 'Texas Department of Information Resources (DIR) cooperative procurement master contract subcontracting opportunities. Small businesses and trade vendors will fulfill regional work orders for Texas Health and Human Services (HHSC), Texas Department of Public Safety (DPS), and state university campuses across all Texas council of government regions.', 'TX-Statewide', 'Statewide / All Texas Regions',
    'structured-cabling', 'Telecommunications & Fiber', 'Enterprise Structured Cabling & Campus OSP', '$4,500,000 – $7,200,000',
    '2026-11-30', '17:00', 'Texas SmartBuy / EVOConnected Portal', 'published', 1,
    'Black Box Network Services / Texas DIR', 'prime', 'opportunity', '24 Months (Master IDIQ)',
    'Active Texas HUB certification (HSP required), certified copper/optical test equipment, technician background checks.', 'Texas HUB Mandatory, SBE', '["517111","238210","541512"]'
) ON DUPLICATE KEY UPDATE
    title = VALUES(title), scope_summary = VALUES(scope_summary), description = VALUES(description),
    district = VALUES(district), district_name = VALUES(district_name), category = VALUES(category),
    category_name = VALUES(category_name), subcategory = VALUES(subcategory), estimated_value = VALUES(estimated_value),
    due_date = VALUES(due_date), due_time = VALUES(due_time), submission_method = VALUES(submission_method),
    status = VALUES(status), posted_by_name = VALUES(posted_by_name), posted_by_type = VALUES(posted_by_type),
    listing_type = VALUES(listing_type), duration = VALUES(duration), requirements = VALUES(requirements),
    certifications = VALUES(certifications), naics_codes = VALUES(naics_codes);

INSERT INTO opportunities (
    id, title, scope_summary, description, district, district_name,
    category, category_name, subcategory, estimated_value,
    due_date, due_time, submission_method, status, posted_by,
    posted_by_name, posted_by_type, listing_type, duration,
    requirements, certifications, naics_codes
) VALUES (
    'TFC-CAPITOL-2026-077', 'Texas Facilities Commission — Capitol Complex Utility Tunnel Hydronic Piping & Mechanical Overhaul', 'Replacement of high-pressure carbon steel steam distribution piping, chilled water expansion loops, butterfly isolation valves, and seismic pipe supports within 1.4 miles of underground utility tunnels.', 'Texas Facilities Commission (TFC) state government complex renovation. Subcontractors will remove asbestos-insulated legacy lines under hazardous abatement controls, fabricate and erect 16-inch welded Schedule 80 carbon steel headers, perform non-destructive radiography (RT) testing on 100% of tunnel welds, and calibrate pneumatically actuated control valves.', 'TX-Austin', 'Central Texas / Austin Region',
    'plumbing-hvac', 'Mechanical & Plumbing Systems', 'High-Pressure Steam & Hydronic Piping', '$3,100,000 – $5,600,000',
    '2026-12-08', '14:00', 'Texas SmartBuy / Electronic Procurement', 'published', 1,
    'Vaughn Construction / Texas Facilities Commission', 'prime', 'opportunity', '9 Months',
    'ASME Section IX certified pipe welders, confined space entry certified crews, Texas Master Plumber / Mechanical contractor license.', 'Texas HUB, SBE', '["238220","238290","237110"]'
) ON DUPLICATE KEY UPDATE
    title = VALUES(title), scope_summary = VALUES(scope_summary), description = VALUES(description),
    district = VALUES(district), district_name = VALUES(district_name), category = VALUES(category),
    category_name = VALUES(category_name), subcategory = VALUES(subcategory), estimated_value = VALUES(estimated_value),
    due_date = VALUES(due_date), due_time = VALUES(due_time), submission_method = VALUES(submission_method),
    status = VALUES(status), posted_by_name = VALUES(posted_by_name), posted_by_type = VALUES(posted_by_type),
    listing_type = VALUES(listing_type), duration = VALUES(duration), requirements = VALUES(requirements),
    certifications = VALUES(certifications), naics_codes = VALUES(naics_codes);

INSERT INTO opportunities (
    id, title, scope_summary, description, district, district_name,
    category, category_name, subcategory, estimated_value,
    due_date, due_time, submission_method, status, posted_by,
    posted_by_name, posted_by_type, listing_type, duration,
    requirements, certifications, naics_codes
) VALUES (
    'TXDOT-2026-0511-SAT', 'TxDOT San Antonio District — Loop 1604 Expansion Aggregate Heavy Haul & Work Zone Traffic Control Subcontract', 'Subcontract for hauling 450,000 tons of TxDOT Type A Grade 1 flexbase and concrete aggregates, accompanied by complete work zone lane closures, TMA shadow vehicles, and portable PCMS message signs.', 'TxDOT San Antonio District Loop 1604 expansion project. Looking for certified trucking fleets (belly dump, end dump, tandem) and certified traffic control teams. Subcontractor must ensure continuous material supply to asphalt pavers and maintain strict adherence to Texas MUTCD standards during nightly lane and ramp closures.', 'TX-SanAntonio', 'South Central / San Antonio Region',
    'cdl-trucking', 'CDL Freight, Heavy Hauling & Traffic Control', 'Belly Dump Aggregate Hauling & Highway Lane Closures', '$1,800,000 – $3,200,000',
    '2026-12-20', '16:00', 'TxDOT Bonfire / EVOConnected Portal', 'published', 1,
    'Lane Construction Corp. / TxDOT San Antonio', 'prime', 'opportunity', '14 Months',
    'TXDOT motor carrier registration, $2M commercial auto liability, ATSSA or TEEX certified traffic control supervisors on duty.', 'Texas DBE (Goal: 14.0%), Texas HUB', '["484220","484110","488490","237310"]'
) ON DUPLICATE KEY UPDATE
    title = VALUES(title), scope_summary = VALUES(scope_summary), description = VALUES(description),
    district = VALUES(district), district_name = VALUES(district_name), category = VALUES(category),
    category_name = VALUES(category_name), subcategory = VALUES(subcategory), estimated_value = VALUES(estimated_value),
    due_date = VALUES(due_date), due_time = VALUES(due_time), submission_method = VALUES(submission_method),
    status = VALUES(status), posted_by_name = VALUES(posted_by_name), posted_by_type = VALUES(posted_by_type),
    listing_type = VALUES(listing_type), duration = VALUES(duration), requirements = VALUES(requirements),
    certifications = VALUES(certifications), naics_codes = VALUES(naics_codes);

INSERT INTO opportunities (
    id, title, scope_summary, description, district, district_name,
    category, category_name, subcategory, estimated_value,
    due_date, due_time, submission_method, status, posted_by,
    posted_by_name, posted_by_type, listing_type, duration,
    requirements, certifications, naics_codes
) VALUES (
    'JOB-TX-2026-FIBER', 'Lead OSP Fiber Splicer & Fusion Technician — BEAD East Texas Deployment', 'Ribbon and loose-tube fusion splicing, mid-sheath entries on 288-count fiber cable, optical power meter readings, and OTDR bi-directional trace analysis along rural highway corridors.', 'Gulf Coast Fiber Infrastructure is deploying BEAD high-speed internet across Walker, Montgomery, and San Jacinto counties. Seeking lead fiber optic splicers with bucket truck experience to operate Sumitomo / AFL fusion splicers, install splice trays in Coyote/FOSC dome enclosures, and document optical acceptance test results.', 'TX-Houston', 'Gulf Coast / Houston & East Texas',
    'fiber-broadband', 'Fiber & Broadband', 'OSP Fiber Splicing & OTDR Testing', '$38.50 – $48.00 / hour + $140/day Per Diem',
    '2026-12-31', '17:00', 'Direct Dispatch / EVOConnected Portal', 'published', 1,
    'Gulf Coast Fiber Infrastructure LLC', 'business', 'job', '12 Months Contract',
    'CFOT or FOA certification, 3+ years field fiber splicing, valid TX driver license with clean MVR, bucket truck safety trained.', 'CFOT, OSHA 10, BEAD Priority Qualified', '["237130","517311","517111"]'
) ON DUPLICATE KEY UPDATE
    title = VALUES(title), scope_summary = VALUES(scope_summary), description = VALUES(description),
    district = VALUES(district), district_name = VALUES(district_name), category = VALUES(category),
    category_name = VALUES(category_name), subcategory = VALUES(subcategory), estimated_value = VALUES(estimated_value),
    due_date = VALUES(due_date), due_time = VALUES(due_time), submission_method = VALUES(submission_method),
    status = VALUES(status), posted_by_name = VALUES(posted_by_name), posted_by_type = VALUES(posted_by_type),
    listing_type = VALUES(listing_type), duration = VALUES(duration), requirements = VALUES(requirements),
    certifications = VALUES(certifications), naics_codes = VALUES(naics_codes);

INSERT INTO opportunities (
    id, title, scope_summary, description, district, district_name,
    category, category_name, subcategory, estimated_value,
    due_date, due_time, submission_method, status, posted_by,
    posted_by_name, posted_by_type, listing_type, duration,
    requirements, certifications, naics_codes
) VALUES (
    'JOB-TX-2026-ELEC', 'Journeyman Highway Lighting & Traffic Signal Electrician — I-35 Austin Corridor', 'Installation and testing of TxDOT highway illumination, 480V high-mast pole wiring, signal mast arms, video detection cameras, and traffic controller cabinet terminations.', 'Lone Star State Electrical Contracting has immediate openings for licensed journeyman electricians on the I-35 Capital Express project. Shifts run 4x10 hour schedules with overtime. Certified payroll and prevailing wage scale under Texas heavy highway wage determinations.', 'TX-Austin', 'Central Texas / Austin Region',
    'electrical', 'Electrical Systems', 'Highway Lighting & Traffic Signals', '$36.00 – $45.50 / hour (Prevailing Wage Scale)',
    '2027-01-31', '17:00', 'Direct Dispatch / EVOConnected Portal', 'published', 1,
    'Lone Star State Electrical Contracting', 'business', 'job', '14 Months Ongoing',
    'TDLR Journeyman Electrician license, OSHA 30 Construction card, IMSA Signal Level I preferred, bucket truck operation.', 'TDLR Journeyman, OSHA-30, IMSA', '["238210","237310"]'
) ON DUPLICATE KEY UPDATE
    title = VALUES(title), scope_summary = VALUES(scope_summary), description = VALUES(description),
    district = VALUES(district), district_name = VALUES(district_name), category = VALUES(category),
    category_name = VALUES(category_name), subcategory = VALUES(subcategory), estimated_value = VALUES(estimated_value),
    due_date = VALUES(due_date), due_time = VALUES(due_time), submission_method = VALUES(submission_method),
    status = VALUES(status), posted_by_name = VALUES(posted_by_name), posted_by_type = VALUES(posted_by_type),
    listing_type = VALUES(listing_type), duration = VALUES(duration), requirements = VALUES(requirements),
    certifications = VALUES(certifications), naics_codes = VALUES(naics_codes);

INSERT INTO opportunities (
    id, title, scope_summary, description, district, district_name,
    category, category_name, subcategory, estimated_value,
    due_date, due_time, submission_method, status, posted_by,
    posted_by_name, posted_by_type, listing_type, duration,
    requirements, certifications, naics_codes
) VALUES (
    'JOB-TX-2026-CDL', 'Class A CDL Belly Dump / End Dump Aggregate Drivers (5 Openings) — Loop 1604 Project', 'Hauling TxDOT specification crushed stone aggregate, base material, and riprap from regional quarries to active Loop 1604 paving trains. Clean unloading and dump site safety management.', 'Bexar Heavy Transport & Hauling LLC is hiring full-time Class A CDL drivers for the Loop 1604 widening contract. Day and night shifts available. Clean, well-maintained Kenworth T880 and Peterbilt 389 tractors with Clement belly dump trailers. Weekly direct deposit pay with full safety bonuses.', 'TX-SanAntonio', 'South Central / San Antonio Region',
    'cdl-trucking', 'CDL Freight & Hauling', 'Belly Dump / Heavy Aggregate Transport', '$28.00 – $34.00 / hour + Overtime (10-12 hr shifts)',
    '2026-12-31', '17:00', 'Direct Dispatch / EVOConnected Portal', 'published', 1,
    'Bexar Heavy Transport & Hauling LLC', 'business', 'job', '9 Months Ongoing',
    'Valid Texas Class A CDL, clean MVR (no at-fault collisions in past 3 years), current DOT Medical Card, FMCSA Clearinghouse verified.', 'Class A CDL, DOT Medical, FMCSA Verified', '["484220","484110","488490"]'
) ON DUPLICATE KEY UPDATE
    title = VALUES(title), scope_summary = VALUES(scope_summary), description = VALUES(description),
    district = VALUES(district), district_name = VALUES(district_name), category = VALUES(category),
    category_name = VALUES(category_name), subcategory = VALUES(subcategory), estimated_value = VALUES(estimated_value),
    due_date = VALUES(due_date), due_time = VALUES(due_time), submission_method = VALUES(submission_method),
    status = VALUES(status), posted_by_name = VALUES(posted_by_name), posted_by_type = VALUES(posted_by_type),
    listing_type = VALUES(listing_type), duration = VALUES(duration), requirements = VALUES(requirements),
    certifications = VALUES(certifications), naics_codes = VALUES(naics_codes);

INSERT INTO opportunities (
    id, title, scope_summary, description, district, district_name,
    category, category_name, subcategory, estimated_value,
    due_date, due_time, submission_method, status, posted_by,
    posted_by_name, posted_by_type, listing_type, duration,
    requirements, certifications, naics_codes
) VALUES (
    'JOB-TX-2026-TOWER', 'Tower Technician III / NWSA Certified Top Hand — 5G Small Cell & Macro Upgrades', 'Tower climbing up to 350 ft, rigging, installing Ericsson/Nokia RRUs, antenna arrays, coax/hybrid trunk cable routing, weatherproofing, and PIM/sweep testing.', 'Pinnacle Telecom Infrastructure Group is mobilizing 4-person tower crews across the Dallas-Fort Worth metroplex. Responsible for leading aerial rigging operations, gin pole assembly, small cell streetlight installations, and radio head azimuth and down-tilt alignments.', 'TX-Dallas', 'North Texas / DFW Region',
    'cell-site-tech', 'Cell Site & Tower Tech', 'Cell Tower Climbing & RF Rigging', '$34.00 – $44.00 / hour + Per Diem',
    '2027-01-15', '17:00', 'Direct Dispatch / EVOConnected Portal', 'published', 1,
    'Pinnacle Telecom Infrastructure Group', 'business', 'job', 'Contract to Permanent',
    'NWSA TTT-1 or TTT-2 credential, Competent Climber & Rescuer certification, First Aid/CPR, valid driver license.', 'NWSA TTT, Competent Climber, OSHA 10', '["517311","238210","517112"]'
) ON DUPLICATE KEY UPDATE
    title = VALUES(title), scope_summary = VALUES(scope_summary), description = VALUES(description),
    district = VALUES(district), district_name = VALUES(district_name), category = VALUES(category),
    category_name = VALUES(category_name), subcategory = VALUES(subcategory), estimated_value = VALUES(estimated_value),
    due_date = VALUES(due_date), due_time = VALUES(due_time), submission_method = VALUES(submission_method),
    status = VALUES(status), posted_by_name = VALUES(posted_by_name), posted_by_type = VALUES(posted_by_type),
    listing_type = VALUES(listing_type), duration = VALUES(duration), requirements = VALUES(requirements),
    certifications = VALUES(certifications), naics_codes = VALUES(naics_codes);

INSERT INTO opportunities (
    id, title, scope_summary, description, district, district_name,
    category, category_name, subcategory, estimated_value,
    due_date, due_time, submission_method, status, posted_by,
    posted_by_name, posted_by_type, listing_type, duration,
    requirements, certifications, naics_codes
) VALUES (
    'JOB-TX-2026-WELD', 'AWS D1.5 Certified Structural Bridge Welder & Ironworker — I-30 Deck Replacement', 'Overhead and vertical SMAW/FCAW welding of steel bridge girder stiffener plates, expansion joint fingers, cross-frame diaphragms, and headed concrete anchor studs.', 'Trinity River Heavy Steel Services is deploying experienced bridge welders for the Loop 12 / I-30 interchange overhaul. Must be comfortable working at heights over traffic with 100% tie-off compliance. All welds subject to non-destructive magnetic particle (MT) and ultrasonic (UT) testing.', 'TX-Dallas', 'North Texas / DFW Region',
    'structural-welding', 'Structural Welding', 'AWS D1.5 Bridge Welding & Steel Erection', '$35.00 – $46.00 / hour (Certified Payroll / Davis-Bacon)',
    '2026-12-15', '17:00', 'Direct Dispatch / EVOConnected Portal', 'published', 1,
    'Trinity River Heavy Steel Services', 'business', 'job', '8 Months',
    'Current AWS D1.5 Bridge Welding certification card (SMAW/FCAW all positions), OSHA 10 Construction, fall protection certification.', 'AWS D1.5, OSHA 10, Ironworker Certified', '["332312","238120","237310"]'
) ON DUPLICATE KEY UPDATE
    title = VALUES(title), scope_summary = VALUES(scope_summary), description = VALUES(description),
    district = VALUES(district), district_name = VALUES(district_name), category = VALUES(category),
    category_name = VALUES(category_name), subcategory = VALUES(subcategory), estimated_value = VALUES(estimated_value),
    due_date = VALUES(due_date), due_time = VALUES(due_time), submission_method = VALUES(submission_method),
    status = VALUES(status), posted_by_name = VALUES(posted_by_name), posted_by_type = VALUES(posted_by_type),
    listing_type = VALUES(listing_type), duration = VALUES(duration), requirements = VALUES(requirements),
    certifications = VALUES(certifications), naics_codes = VALUES(naics_codes);

INSERT INTO opportunities (
    id, title, scope_summary, description, district, district_name,
    category, category_name, subcategory, estimated_value,
    due_date, due_time, submission_method, status, posted_by,
    posted_by_name, posted_by_type, listing_type, duration,
    requirements, certifications, naics_codes
) VALUES (
    'JOB-TX-2026-BORING', 'Horizontal Directional Drilling (HDD) Rig Operator & Steering Locator — Water/Fiber Utility', 'Operation of Vermeer D40x55 and D100x140 drill rigs, steering with Subsite/Falcon F5 tracking locators, mud mixing with bentonite recycling, and pulling HDPE conduit strings.', 'Underground Infrastructure Dynamics is executing municipal utility relocations and fiber backbones across greater Houston. Seeking an experienced drill operator and electronic locator pair capable of maintaining grade and navigating congested subterranean utility corridors.', 'TX-Houston', 'Gulf Coast / Houston Region',
    'heavy-civil-equipment', 'Heavy Civil Equipment', 'Directional Boring & Subsurface Utility', '$34.00 – $42.00 / hour',
    '2027-02-15', '17:00', 'Direct Dispatch / EVOConnected Portal', 'published', 1,
    'Underground Infrastructure Dynamics', 'business', 'job', '10 Months Contract',
    '3+ years verifiable HDD rig operation or walk-over locating experience, underground utility potholing safety, OSHA 10.', 'HDD Operator Qualified, OSHA 10', '["238910","237110","237130"]'
) ON DUPLICATE KEY UPDATE
    title = VALUES(title), scope_summary = VALUES(scope_summary), description = VALUES(description),
    district = VALUES(district), district_name = VALUES(district_name), category = VALUES(category),
    category_name = VALUES(category_name), subcategory = VALUES(subcategory), estimated_value = VALUES(estimated_value),
    due_date = VALUES(due_date), due_time = VALUES(due_time), submission_method = VALUES(submission_method),
    status = VALUES(status), posted_by_name = VALUES(posted_by_name), posted_by_type = VALUES(posted_by_type),
    listing_type = VALUES(listing_type), duration = VALUES(duration), requirements = VALUES(requirements),
    certifications = VALUES(certifications), naics_codes = VALUES(naics_codes);

INSERT INTO opportunities (
    id, title, scope_summary, description, district, district_name,
    category, category_name, subcategory, estimated_value,
    due_date, due_time, submission_method, status, posted_by,
    posted_by_name, posted_by_type, listing_type, duration,
    requirements, certifications, naics_codes
) VALUES (
    'JOB-TX-2026-CONC', 'Structural Concrete Finisher & Bridge Deck Form Carpenter — TxDOT Express Lane', 'Setting forms for highway parapet walls, bridge deck overhangs, curb and gutter, screeding and power-trowel finishing of TxDOT Class C structural concrete.', 'Lone Star Civil Builders is expanding crew capacity for concrete paving and structural bridge caps along the I-35 Austin corridor. Must be skilled in reading highway engineer grade stakes, setting Symons formwork, tying #6-#10 rebar mats, and applying curing compound coatings.', 'TX-Austin', 'Central Texas / Austin Region',
    'concrete-cement', 'Concrete & Civil Masonry', 'Bridge Deck Forms & Slipform Finishing', '$30.00 – $38.00 / hour',
    '2027-01-20', '17:00', 'Direct Dispatch / EVOConnected Portal', 'published', 1,
    'Lone Star Civil Builders', 'business', 'job', '11 Months',
    '5+ years heavy highway concrete experience, reliable transportation, ability to pass site drug test, OSHA 10.', 'ACI Flatwork Finisher, OSHA 10', '["238110","237310","238140"]'
) ON DUPLICATE KEY UPDATE
    title = VALUES(title), scope_summary = VALUES(scope_summary), description = VALUES(description),
    district = VALUES(district), district_name = VALUES(district_name), category = VALUES(category),
    category_name = VALUES(category_name), subcategory = VALUES(subcategory), estimated_value = VALUES(estimated_value),
    due_date = VALUES(due_date), due_time = VALUES(due_time), submission_method = VALUES(submission_method),
    status = VALUES(status), posted_by_name = VALUES(posted_by_name), posted_by_type = VALUES(posted_by_type),
    listing_type = VALUES(listing_type), duration = VALUES(duration), requirements = VALUES(requirements),
    certifications = VALUES(certifications), naics_codes = VALUES(naics_codes);

INSERT INTO opportunities (
    id, title, scope_summary, description, district, district_name,
    category, category_name, subcategory, estimated_value,
    due_date, due_time, submission_method, status, posted_by,
    posted_by_name, posted_by_type, listing_type, duration,
    requirements, certifications, naics_codes
) VALUES (
    'JOB-TX-2026-HVAC', 'Commercial HVAC Chiller & BAS Controls Field Specialist — State Facility Maintenance', 'Preventive maintenance and emergency service on centrifugal chillers, industrial air handlers, BACnet direct digital controls (DDC), and variable frequency drives (VFDs).', 'Brazos Mechanical Systems Inc. is onboarding commercial HVAC journeymen for long-term state government facility contracts in Austin. Responsibilities include refrigerant recovery, chiller eddy current testing, damper actuator calibration, and monitoring Niagara N4 building management systems.', 'TX-Austin', 'Central Texas / Austin Region',
    'hvac-climate-control', 'HVAC & Climate Control', 'Commercial Chillers & BAS Controls', '$38.00 – $48.00 / hour',
    '2026-12-31', '17:00', 'Direct Dispatch / EVOConnected Portal', 'published', 1,
    'Brazos Mechanical Systems Inc.', 'business', 'job', 'Full-time Permanent',
    'EPA Universal Certification, registered ACR technician or license, 4+ years commercial chiller experience, clean criminal background for state building badge.', 'EPA Universal, Texas ACR, Niagara N4 Certified', '["238220","238290"]'
) ON DUPLICATE KEY UPDATE
    title = VALUES(title), scope_summary = VALUES(scope_summary), description = VALUES(description),
    district = VALUES(district), district_name = VALUES(district_name), category = VALUES(category),
    category_name = VALUES(category_name), subcategory = VALUES(subcategory), estimated_value = VALUES(estimated_value),
    due_date = VALUES(due_date), due_time = VALUES(due_time), submission_method = VALUES(submission_method),
    status = VALUES(status), posted_by_name = VALUES(posted_by_name), posted_by_type = VALUES(posted_by_type),
    listing_type = VALUES(listing_type), duration = VALUES(duration), requirements = VALUES(requirements),
    certifications = VALUES(certifications), naics_codes = VALUES(naics_codes);

