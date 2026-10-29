# EVOConnect Platform

A mission-critical digital platform connecting Small Businesses (Small Businesses) with contracting opportunities and Prime Contractors/Prime Contractors with qualified partners.

## Overview

CaltransBizConnect serves as the central hub for the Small Business Supportive Services Business Development Program (Small Business/BDP). The platform streamlines the contracting process by providing:

- **For Small Businesses/Small Businesses**: Opportunity discovery, profile management, capability statement uploads, and application tracking
- **For Prime Contractors**: Structured opportunity posting, small business search, and submission management

## Key Features

### Dual User Flows
- **Small Business (Small Business) Flow**: Home → For Small Businesses → Create Account → Dashboard → Profile Completion → Search Opportunities
- **Prime Contractor Flow**: Home → For Prime Contractors → Create Account → Dashboard → Post Opportunity → Manage Postings

### Quality Standards
- All opportunity postings must meet strict validation requirements
- 2-day administrator review process before publication
- Automatic archival of expired opportunities
- No placeholder content permitted

### Accessibility
- Built to WCAG 2.1 AA standards
- Full keyboard operability
- High contrast ratios for all text
- Descriptive alt text for all images
- Responsive design for mobile and desktop

## Project Structure

```
Antig2/
├── index.html                  # Home page with dual pathway hero
├── for-small businesses.html            # Small Business landing page
├── for-prime contractors.html           # Prime Contractor landing page
├── opportunities.html          # Opportunity listing with filters
├── login.html                  # Login page
├── dashboard-small-business.html       # Small Business dashboard
├── dashboard-prime-contractor-contractor-contractor.html       # Prime Contractor dashboard
├── capability-statement.html   # Capability statement upload
├── post-opportunity.html       # Opportunity posting form
├── contact.html                # Contact page
├── report-issue.html           # Issue reporting form
├── css/
│   ├── design-system.css       # Design tokens and component styles
│   └── main.css                # Layout and page-specific styles
├── js/
│   ├── main.js                 # Core JavaScript utilities
│   ├── auth.js                 # Authentication module
│   └── components/
│       ├── filter-bar.js       # Opportunity filtering
│       ├── file-upload.js      # File upload with validation
│       └── form-validation.js  # Form validation utilities
└── data/
    ├── districts.json          # Caltrans district data
    ├── work-categories.json    # Work category taxonomy
    └── sample-opportunities.json # Sample opportunity data
```

## Design Standards

### Typography
- **Fonts**: Arial or Calibri (sans serif)
- **Body Text**: 11pt to 14pt
- **Color**: Black text on no-color background

### Editorial Standards
- Use active voice and plain language
- Single space after periods
- Serial commas for lists of three or more items
- Use "must" (not shall), "authorize" (not approve)
- Use "contract specifications" (not standard specifications)
- Use "as-built" in lowercase

### Accessibility Requirements
- Alternative text for all images
- Keyboard-only navigation support
- High contrast for all text
- Color not used alone to convey meaning
- Clean, human-readable URLs

## Getting Started

EVOConnect uses Node.js and MySQL for its role-based portals. See [feature coverage and development instructions](docs/FLAGSHIP-PARITY.md) for capability uploads, opportunity management, analytics, database setup, and integration tests.

### For Development
1. Run `npm ci` and configure the local database using `.env.example`.
2. Run `npm start` and open the application through its server.
3. No compilation step is required. Use a separate test database for `npm test`.

### For Production
- Implement server-side authentication
- Connect to database for user and opportunity management
- Set up file storage for capability statements and attachments
- Configure email notifications
- Implement administrator review workflow

## Key Pages

### Public Pages
- **Home** (`index.html`): Dual pathway selection
- **For Small Businesses** (`for-small businesses.html`): Small Business journey and requirements
- **For Prime Contractors** (`for-prime contractors.html`): Posting process and standards
- **Opportunities** (`opportunities.html`): Filterable opportunity listing

### Small Business Dashboard
- Profile completeness indicator
- Action tiles for key tasks
- Capability statement upload
- Opportunity search and filtering

### Prime Contractor Dashboard
- Summary metrics
- Opportunity posting form with validation
- Posting management
- Small Business search

## Browser Support
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Contact
For questions or support:
- **Email**: SBEss@dot.ca.gov
- **Phone**: (916) 324-1700
- **Hours**: Monday - Friday, 8:00 AM - 5:00 PM PST

## License
© 2026 California Department of Transportation. All rights reserved.


-- Last deployed: 03/09/2026 18:39:40
