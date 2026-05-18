-- EvoConnect Demo Accounts
-- Password for ALL accounts: DemoPass1!
-- Run this in phpMyAdmin against u579331817_evoconnect
-- Safe to run multiple times (INSERT IGNORE skips duplicates)

-- Admin
INSERT IGNORE INTO admins (email, password_hash, name)
VALUES ('demo-admin@evoconnect.io','$2a$12$x58F8CcalrNndb9SYpQCBu1qUN6LU9BIm6H56kGlDR0LqIj6SF.Qy','Demo Admin');

-- Prime Contractor (approved, pro tier)
INSERT IGNORE INTO primes (company_name, contact_name, email, password_hash, phone, sam_uei, contract_vehicles, naics_codes, city, state, zip, subscription_tier, active, approved_at)
VALUES ('Apex Construction Group','Marcus Thompson','demo-prime@evoconnect.io','$2a$12$x58F8CcalrNndb9SYpQCBu1qUN6LU9BIm6H56kGlDR0LqIj6SF.Qy','512-555-0201','APEXCG1234567','GSA MAS, IDIQ, BPA','["237310","238110","238210","238990"]','Austin','TX','78701','pro',1,NOW());

-- Business (85% profile complete)
INSERT IGNORE INTO businesses (company_name, contact_name, email, password_hash, phone, business_type, certifications, sam_uei, sam_registered, naics_codes, service_description, city, state, zip, service_radius, profile_pct, status)
VALUES ('GreenPath Environmental Services','Tanya Williams','demo-business@evoconnect.io','$2a$12$x58F8CcalrNndb9SYpQCBu1qUN6LU9BIm6H56kGlDR0LqIj6SF.Qy','210-555-0301','LLC','["DBE","SBE","WBE"]','GRNPTH9876543','yes','["541620","562910","238910"]','Environmental consulting, site assessment, NEPA compliance, and hazardous materials management for transportation and infrastructure projects.','San Antonio','TX','78205','statewide',85,'active');

-- Labor / Worker (72% profile complete)
INSERT IGNORE INTO workers (full_name, email, password_hash, phone, trade_category, skills, certifications, years_experience, sam_registered, business_entity, city, state, zip, travel_willingness, experience_summary, profile_pct, status)
VALUES ('James Okafor','demo-labor@evoconnect.io','$2a$12$x58F8CcalrNndb9SYpQCBu1qUN6LU9BIm6H56kGlDR0LqIj6SF.Qy','713-555-0302','electrical','["Traffic Signal Installation","Highway Lighting","Conduit & Pull Box","Fiber Conduit","Certified Payroll"]','["OSHA 30","IMSA Signal Level I","C-10 License"]',12,'yes','sole_proprietor','Houston','TX','77002','regional','Licensed electrical contractor with 12 years specializing in highway lighting, traffic signal upgrades, and electrical infrastructure for TxDOT and local public works projects.',72,'active');
