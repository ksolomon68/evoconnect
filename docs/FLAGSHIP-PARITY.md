# EvoConnect feature coverage and validation

This compares the current New-Caltrans repository with EvoConnect's server-rendered portals. Caltrans business accounts map to EvoConnect businesses; contractor/agency posting tasks map to prime contractors and administrators. EvoConnect also supports individual workers. This is a feature-workflow comparison, not a claim that the two applications share identical APIs or page filenames.

## Feature coverage

| Workflow in New-Caltrans | EvoConnect implementation | Validation |
| --- | --- | --- |
| Registration, login, password reset, account settings | Existing role-aware authentication and settings; corrected password-reset template includes | Public/account pages render; production demo-login rejection tested. Live email delivery is unverified. |
| Business profiles, qualifications, certifications, NAICS | Existing profile editors plus safe directory profiles for workers, businesses and primes | All role profile pages render; real profile-view tracking verified |
| Capability statement PDF uploads and downloads | All roles: `/{portal}/documents`; replacement/removal; signed-in viewing through `/capabilities/:id` | PDF size/type/signature validation, private storage, download bytes, replacement revocation, removal and authorization tested |
| Business capability statement generation | Existing business generator retained with links to uploads and analytics | Generator renders |
| Contractor/admin opportunity creation, editing and status management | Shared editor, admin publication review, typed ownership, drafts, pending review, publication, closure, awards and archival | Admin creation/editing; prime submission/review; cross-owner mutation rejection tested |
| Opportunity supporting documents | Owner-managed PDF specifications, accessible to eligible signed-in viewers | Upload, download, removal and owner restrictions tested |
| Opportunity discovery and saved opportunities | Existing category/NAICS/text filters; full detail pages; deadline checks | Search renders; save/unsave and unavailable-posting rejection tested |
| Applications and reviewer outcomes | Worker/business applications; owner-scoped prime review; platform admin review; withdrawal; internal notifications | Submission, reviewer isolation, review, withdrawal, notifications and retained histories tested |
| Suggested businesses and invitations | NAICS-ranked businesses with directory/capability links and owner-authorized invitations | Matching, sending invitations and cross-owner restrictions tested |
| Expired opportunity archival | Startup sweep and a once-per-minute expiry sweep; immediate submission/deadline checks | Expiry transition and retained application history tested |
| Messaging and notifications | Existing inbox/compose; new application, publication, review and invitation notifications; signed-in notification ownership | All inbox pages render; newly added notification delivery and user scoping tested. Existing compose/reply behavior is not exhaustively tested. |
| Administrator user management | Create, edit and deactivate/suspend accounts, alongside existing prime approvals and exports | Create/edit/suspend and denial of existing member tokens tested; listing/approval pages render. Deactivation retains history instead of hard deletion. |
| CMS, FAQs, media, announcements and resources | Existing CMS and admin tools retained; portal admin session accepted by CMS APIs | Core CMS reads/stats, role restrictions, resource and admin pages checked. Every media/content mutation is not exhaustively tested. |
| Profile, opportunity and capability performance | All four roles have analytics; admins see platform metrics, others see owned records | Real event recording, visitor/day deduplication, self-view exclusion, role scoping, 7/30/90-day reports and current-document reporting tested |
| Contact, policies, accessibility information | Existing public pages and contact handlers retained | Page coverage only; actual outbound mail and full accessibility/browser audits remain outside this test run |
| EvoConnect readiness checklists, connections and RFQs | Existing EvoConnect features retained | Role pages render; every existing mutation is not exhaustively tested |

## Analytics definitions

Profile and opportunity views are recorded when a signed-in person opens their detail page. Directory-search impressions are not counted as profile views. A capability view is a PDF view request; a download is a download request. Each member is counted once per item, event type and UTC day. Owners' own visits and HEAD requests are excluded. PDF downloads measure successful serving requests, not whether the person subsequently read the file.

Visitor identifiers are keyed hashes, not stored email addresses or raw IP addresses. Existing history cannot be reconstructed: counters begin when the feature is installed. Replacement creates a new document ID; previous document events remain in the account's overall totals, while the current-document table measures the replacement separately. Application/view ratios compare period totals and are not unique-person conversion rates.

## Running locally

Use Node.js 22 or newer and a running MySQL database. Run `npm ci`, configure `.env` using `.env.example`, and run `npm start` from the EvoConnect checkout. Startup applies additive schema migrations. New tables are `capability_documents`, `opportunity_attachments` and `performance_events`; `opportunities.posted_by_type` separates prime and admin owners with overlapping numeric IDs. Existing postings default to prime ownership.

The startup sweep archives already expired published postings and notifies their applicants. Back up the database before a production rollout. Archive operations retain applications, saved records and analytics history.

Set `CAPABILITY_STORAGE_DIR` to a private, persistent directory outside any static serving roots and include it in backups. The default is a sibling `evoconnect-private/capabilities` directory outside the checkout. Files are written with private permissions; database records hold generated storage names. These PDFs are not stored in public uploads. A file signature check is not a malware scan; no antivirus integration was introduced.

Production requires a unique `JWT_SECRET`; a separate `SESSION_SECRET` is optional because sessions otherwise use a distinct key derived from the JWT secret, and `ADMIN_DEFAULT_PASSWORD` to provision the first admin in an empty database. Development demo accounts and sample postings are not seeded in production; demo login is rejected there. Existing production deployments should review previously seeded accounts and rotate any historical default credentials: this change does not delete existing accounts or silently replace their passwords. Configure SMTP for welcome/reset emails and test delivery in the deployment environment.

## Integration tests

`npm test` starts and stops its own app processes, tests real HTTP routes, and uses a dedicated MySQL schema. Supply `DB_HOST`, `DB_USER`, `DB_PASSWORD` and optionally `TEST_DB_NAME` (default `evoconnect_test`). The database must already exist and its name must end in `_test`. The suite deletes fixture data in that test schema. Never point it at an application database. The suite uses ports 3102/3103 by default; override `TEST_PORT` if necessary.

No production deployment, production database migration, outbound email delivery or full browser/accessibility/performance audit is implied by these tests.

## Automatic NAICS matching

Business and labor dashboards now show the top three matching open opportunities. The **Automatic Matches** navigation item opens the full ranked list at `/business/matches` or `/labor/matches`. Results recompute from current profile codes and publication/deadline state whenever the page is requested; no manual search filter, scheduled refresh, or persisted match cache is required. Members are never automatically applied, invited, or connected.

Matching uses exact normalized NAICS codes, including legacy comma-separated values and JSON numeric/string arrays. The score is the percentage of the opportunity's distinct NAICS codes also present on the member's profile. Duplicate or malformed codes do not increase the score, and a shared prefix alone is not a match. Higher code coverage ranks first, followed by more shared codes and nearer deadlines. Codes are a relevance signal, not proof of qualifications.

Business members edit codes through their existing profile controls. Workers can review and update their codes directly on Automatic Matches using the platform's NAICS directory. Their selection is saved transactionally in `worker_matches` and takes effect on the next page load.

For opportunity owners, **Suggested partners** now ranks active businesses and workers using the same matching rules, with profile/capability links and the existing explicit invitation action. Existing ownership and account-status restrictions apply. Automated matching itself sends no emails or invitations.

## FAQ visibility

`/faq` (also `/faq.html`) is a public FAQ page with worker, business, and prime-contractor topics, linked from the public navigation and footer. Existing role FAQ URLs remain available. Every dashboard includes Help & FAQ, including the administrator console. Role pages and the public hub share the same FAQ content source in `server/services/faq-content.js`.

A scoped `/css/faq.css` stylesheet supplies explicit dark question/answer colors on light cards in both layouts, visible keyboard focus, and stacked responsive headings. Chromium checks at desktop and mobile widths verified computed text/background colors, expanded answers, keyboard toggling, and absence of horizontal page overflow in both the public and labor-dashboard layouts. HTTP tests cover public access and all role FAQ routes.
