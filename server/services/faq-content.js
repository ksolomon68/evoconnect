'use strict';

const LABOR_FAQS = [
    {
        q: 'Is EVOConnected free to join?',
        a: 'Yes. Registering your skills profile and using the vendor readiness checklist is completely free. EVOConnected is funded through prime contractor subscriptions, not worker fees.'
    },
    {
        q: 'What is SAM.gov and do I need it?',
        a: 'SAM.gov (System for Award Management) is the federal government\'s official vendor database. Any individual or company seeking to work on federal contracts — either directly or as a subcontractor — must be registered. Registration is free and takes about 10–15 minutes. Our checklist walks you through every step. If you already have a DUNS/UEI number, have it ready. Registration must be renewed annually.'
    },
    {
        q: 'What kinds of workers does EVOConnected serve?',
        a: 'EVOConnected serves skilled tradespeople, technical specialists, and service professionals across a wide range of fields — including fiber/broadband installation, CDL trucking, electrical, concrete and civil construction, IT and cloud infrastructure, welding, HVAC/plumbing, landscaping, and administrative roles. If your skill is relevant to government infrastructure or services, you belong here.'
    },
    {
        q: 'How do prime contractors find me?',
        a: 'Once you complete your profile, prime contractors subscribed to EVOConnected can search for workers by trade, certifications, location, and availability. When a prime is interested, they send a connection request through the platform. You can review the request, see the prime\'s company information, and accept or decline. Your contact information is only shared after you accept.'
    },
    {
        q: 'Do I need to form a business to use this platform?',
        a: 'No — you can register as an individual worker. However, many federal and state contracts require subcontractors to operate as a legal business entity (LLC, sole proprietorship, or corporation). Our checklist covers how to form a basic business entity if you choose to, and explains the difference between working as an employee of a sub versus running your own firm.'
    },
    {
        q: 'What certifications help me get more work?',
        a: 'For government contracting, the most valuable certifications are those tied to set-aside programs: SBA 8(a), HUBZone, Service-Disabled Veteran-Owned Small Business (SDVOSB), Women-Owned Small Business (WOSB), and state-level equivalents like Texas HUB or California DVBE. Trade-specific certifications (OSHA-10/30, BICSI, CompTIA, CDL Class A/B, AWS Welding, NABCEP solar) also significantly improve your visibility on the platform.'
    },
    {
        q: 'How does the Vendor Readiness Checklist work?',
        a: 'The checklist is organized into three tracks: Federal Contracting, State & Local Contracting, and Subcontracting Readiness. Each track contains 8–12 action items. As you complete items, your readiness score updates in real time. When you hit 25%, 50%, and 100%, you\'ll receive milestone emails with next steps. Prime contractors can see your readiness score, so a higher score improves your chances of being contacted.'
    },
    {
        q: 'Is my profile information kept private?',
        a: 'Your profile is visible only to verified, approved prime contractors on the platform. Your full contact information (phone and email) is not shown to primes until you accept a connection request. You can deactivate your profile at any time from your profile settings page.'
    },
    {
        q: 'Can I upload a resume or portfolio?',
        a: 'Yes. During registration and from your profile page, you can upload a resume in PDF or Word format (up to 5 MB). This document is visible to prime contractors who have connected with you. We recommend keeping your resume focused on relevant experience and including any certifications or licenses prominently on the first page.'
    },
    {
        q: 'What happens after I register?',
        a: 'After registering, you\'ll receive a confirmation email with a summary of next steps. Your profile is immediately searchable by prime contractors. We recommend completing the Vendor Readiness Checklist as your first task — it walks you through SAM registration, business entity setup, and certification pathways, and increases your visibility in search results.'
    }
];

const BUSINESS_FAQS = [
    {
        q: 'How is a business different from a worker on EVOConnected?',
        a: 'Workers are individual tradespeople; businesses are companies (LLCs, S-corps, sole proprietors operating under a DBA, etc.) that hold contracts and hire labor. The business portal is designed for entities that want to compete for subcontracts as a company, generate a capability statement, and maintain a full company profile with NAICS codes and certifications.'
    },
    {
        q: 'What is a capability statement and why do I need one?',
        a: 'A capability statement is a one-page business summary required by most federal and state prime contractors before they will engage you as a subcontractor. It includes your company overview, core competencies, differentiators, past performance highlights, NAICS codes, and contact information. EVOConnected generates a formatted capability statement automatically from your profile data, which you can download and customize.'
    },
    {
        q: 'What certifications matter most for small businesses seeking government subcontracts?',
        a: 'The most valuable certifications are SBA 8(a) Business Development, HUBZone, Women-Owned Small Business (WOSB/EDWOSB), Service-Disabled Veteran-Owned Small Business (SDVOSB), and for Texas contractors, the HUB (Historically Underutilized Business) certification. These designations allow prime contractors to use your firm on set-aside contract vehicles and satisfy their small business subcontracting plans.'
    },
    {
        q: 'Do I need a SAM.gov registration?',
        a: 'Yes, SAM.gov registration is required to receive payments from any federal contract, including subcontracts. Registration is free at sam.gov and must be renewed annually. You will also receive a UEI (Unique Entity Identifier) which is required on all federal contract documentation. Our checklist walks through the SAM registration process step by step.'
    },
    {
        q: 'How does the NAICS code system work?',
        a: 'NAICS (North American Industry Classification System) codes identify what industry your business operates in. Every government contract is tagged with one or more NAICS codes, and prime contractors look for subcontractors with matching codes. EVOConnected automatically suggests NAICS codes based on your registered services, and prime contractors can search for businesses by specific NAICS code. Having the right codes significantly improves your match rate.'
    },
    {
        q: 'How do prime contractors contact my business?',
        a: 'Prime contractors on EVOConnected can search businesses by certifications, NAICS codes, state, and service radius. When they find your business, they send a connection request through the platform. You\'ll receive an email notification and can review the prime\'s information before accepting. Your contact details are only shared after you accept the connection.'
    }
];

const PRIME_FAQS = [
    {
        q: 'How does the prime contractor approval process work?',
        a: 'After registering, your account is reviewed by an EVOConnected administrator within 1–2 business days. We verify your SAM.gov UEI, confirm your company is an active prime contractor, and review your stated subcontracting needs. Once approved, you gain full search access. This process ensures all prime contractors on the platform are verified and legitimate, which protects the workers and businesses you\'ll be contacting.'
    },
    {
        q: 'What are the subscription tiers and what do they include?',
        a: 'EVOConnected offers three tiers. Basic (Free): 5 profile views and 5 connection requests per month, standard search filters. Pro ($49/month): Unlimited profile views, 20 connection requests per month, advanced filters for certifications and travel willingness, and the ability to download contact cards. Enterprise ($99/month): Everything in Pro, unlimited connection requests, the RFQ system to post subcontracting requests directly to qualified candidates, dedicated account manager, and bulk export. All limits reset on the 1st of each calendar month.'
    },
    {
        q: 'How does the RFQ (Request for Quote) system work?',
        a: 'Enterprise tier subscribers can post detailed Requests for Quote directly to the platform. RFQs include trade/service type, location, timeline, contract vehicle, and project description. Qualified workers and businesses matching your criteria receive notification emails and can respond directly through the platform. This is ideal for primes with active contract vehicles who need to fill specific subcontracting roles quickly.'
    },
    {
        q: 'How do I search for workers and businesses?',
        a: 'Approved prime contractors can search the Labor Directory for individual workers or the Business Directory for subcontracting companies. You can filter by trade category, state, travel willingness, SAM.gov registration status, and certifications. Results are sorted by profile completeness, which correlates with readiness to work. Connection requests are sent through the platform — the worker or business is notified by email and must accept before any contact information is shared.'
    },
    {
        q: 'What should I do if my application is denied?',
        a: 'If your prime contractor application is denied, you will receive an email explaining the reason. Common reasons include an unverifiable SAM.gov UEI, an inactive SAM.gov registration, or a company that does not meet our prime contractor criteria. You can reapply with corrected information by emailing admin@evoconnect.evobrand.net. Active SAM.gov registration and a verifiable UEI are required for all prime contractor accounts.'
    }
];

module.exports = { LABOR_FAQS, BUSINESS_FAQS, PRIME_FAQS };
