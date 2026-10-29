# EVOConnect feature coverage and validation

This compares the current New-Caltrans repository with EVOConnect's server-rendered portals. Caltrans business accounts map to EVOConnect businesses; contractor/agency posting tasks map to prime contractors and administrators. EVOConnect also supports individual workers. This is a feature-workflow comparison, not a claim that the two applications share identical APIs or page filenames.

## Feature coverage

| Workflow in New-Caltrans | EVOConnect implementation | Validation |
| --- | --- | --- |
| Registration, login, password reset, account settings | Existing role-aware authentication and settings; corrected password-reset template includes | Public/account pages render; production demo and regular logins tested. Live email delivery is unverified. |
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
| EVOConnect readiness checklists, connections and RFQs | Existing EVOConnect features retained | Role pages render; every existing mutation is not exhaustively tested |

## Analytics definitions

Profile and opportunity views are recorded when a signed-in person opens their detail page. Directory-search impressions are not counted as profile views. A capability view is a PDF view request; a download is a download request. Each member is counted once per item, event type and UTC day. Owners' own visits and HEAD requests are excluded. PDF downloads measure successful serving requests, not whether the person subsequently read the file.

Visitor identifiers are keyed hashes, not stored email addresses or raw IP addresses. Existing history cannot be reconstructed: counters begin when the feature is installed. Replacement creates a new document ID; previous document events remain in the account's overall totals, while the current-document table measures the replacement separately. Application/view ratios compare period totals and are not unique-person conversion rates.

## Running locally

Use Node.js 22 or newer and a running MySQL database. Run `npm ci`, configure `.env` using `.env.example`, and run `npm start` from the EVOConnect checkout. Startup applies additive schema migrations. New tables are `capability_documents`, `opportunity_attachments` and `performance_events`; `opportunities.posted_by_type` separates prime and admin owners with overlapping numeric IDs. Existing postings default to prime ownership.

The startup sweep archives already expired published postings and notifies their applicants. Back up the database before a production rollout. Archive operations retain applications, saved records and analytics history.

Set `CAPABILITY_STORAGE_DIR` to a private, persistent directory outside any static serving roots and include it in backups. The default is a sibling `evoconnect-private/capabilities` directory outside the checkout. Files are written with private permissions; database records hold generated storage names. These PDFs are not stored in public uploads. A file signature check is not a malware scan; no antivirus integration was introduced.

Production requires a unique `JWT_SECRET`; a separate `SESSION_SECRET` is optional because sessions otherwise use a distinct key derived from the JWT secret, and `ADMIN_DEFAULT_PASSWORD` to provision the first admin in an empty database. Development demo accounts and sample postings are not seeded in production; demo logins use isolated sample tables and read-only sessions in every environment. Existing production deployments should review previously seeded accounts and rotate any historical default credentials: this change does not delete existing accounts or silently replace their passwords. Configure SMTP for welcome/reset emails and test delivery in the deployment environment.

## Integration tests

`npm test` starts and stops its own app processes, tests real HTTP routes, and uses a dedicated MySQL schema. Supply `DB_HOST`, `DB_USER`, `DB_PASSWORD` and optionally `TEST_DB_NAME` (default `evoconnect_test`). The database must already exist and its name must end in `_test`. The suite deletes fixture data in that test schema. Never point it at an application database. The suite uses ports 3102/3103 by default; override `TEST_PORT` if necessary.

No production deployment, production database migration, outbound email delivery or full browser/accessibility/performance audit is implied by these tests.

## Automatic NAICS matching

Business and labor dashboards now show the top three matching open opportunities. The **Automatic Matches** navigation item opens the full ranked list at `/business/matches` or `/labor/matches`. Results recompute from current profile codes and publication/deadline state whenever the page is requested; no manual search filter, scheduled refresh, or persisted match cache is required. Members are never automatically applied, invited, or connected.

Matching uses exact normalized NAICS codes, including legacy comma-separated values and JSON numeric/string arrays. The score is the percentage of the opportunity's distinct NAICS codes also present on the member's profile. Duplicate or malformed codes do not increase the score, and a shared prefix alone is not a match. Higher code coverage ranks first, followed by more shared codes and nearer deadlines. Codes are a relevance signal, not proof of qualifications.

Business members edit codes through their existing profile controls. Workers can review and update their codes directly on Automatic Matches using the platform's NAICS directory. Their selection is saved transactionally in `worker_matches` and takes effect on the next page load.

For opportunity owners, **Suggested partners** now ranks active businesses and workers using the same matching rules, with profile/capability links and the existing explicit invitation action. Existing ownership and account-status restrictions apply. Automated matching itself sends no emails or invitations.

## FAQ visibility

`/faq` (also `/faq.html`) is a public FAQ page with worker, business, and prime-contractor topics, linked from the public navigation and footer. Existing role FAQ URLs remain available. Every dashboard includes Help & FAQ, including the administrator console. Role pages, the public hub, and CMS FAQ Manager share the `cms_faqs` database table. The former static content is used only for the one-time initial migration.

A scoped `/css/faq.css` stylesheet supplies explicit dark question/answer colors on light cards in both layouts, visible keyboard focus, and stacked responsive headings. Chromium checks at desktop and mobile widths verified computed text/background colors, expanded answers, keyboard toggling, and absence of horizontal page overflow in both the public and labor-dashboard layouts. HTTP tests cover public access and all role FAQ routes.


## Demo sign-in

The four login-page demo buttons work in production as well as development. Both one-click access and the existing demo email/password form issue signed tokens marked as demo sessions. The four sample emails use `DemoPass1!`; normal accounts still authenticate against their stored password hashes.

Demo requests use separate `demo_` tables in the configured database, created lazily with the same schema as the app tables. Only public NAICS reference data is copied. Sample members and sample opportunities are fictional fixtures; live user records, applications and messages are never copied. The database account needs CREATE and INSERT privileges, which the app's schema initialization also uses. These tables are shared read-only preview data, not a separate writable account per visitor.

A visible preview banner identifies demo sessions. Changes and live CMS access are blocked for those sessions; signing out returns to normal login. The SQL adapter scopes demo queries (including transactions) without changing live queries. Production HTTP tests exercise every demo role, preview pages, both sign-in methods, denied writes, no live users in the admin preview, and a normal account sign-in.


## Creating a real administrator and CMS administrator

Set `ADMIN_EMAIL` to the intended real email and `ADMIN_DEFAULT_PASSWORD` to the password in the hosting provider's secure environment settings. Never add the password to Git or command arguments. On startup the application creates that real administrator even when other administrators already exist. It stores a bcrypt hash and preserves an existing account's password on subsequent restarts.

The same email and account password now work at `/login` and the CMS login (`/admin-cms`). A signed-in admin can also use the portal session for CMS APIs. CMS account-password changes update the actual administrator record, so the portal and CMS remain in sync.

An operator with access to the live application's terminal can run `npm run create-admin` using those environment settings. If the account already exists and the password should be replaced, run `npm run create-admin -- --reset-password` once. Remove the bootstrap password from the hosting settings after confirming successful sign-in. The command never prints the password or its hash.

Creating or testing an account in the cloud workspace does not create it in Hostinger's live database. The live database operation must run in the hosting environment, using its database bindings.


## Shared CMS and dashboard authentication

CMS and dashboard sign-in now validate real administrators with the same password rules, including existing legacy CMS password configuration. Where one email belongs to more than one role, sign-in checks the submitted password against the matching records instead of stopping at the first email match. Confirmed administrator credentials take precedence when no role is specified.

CMS sign-in also sets the HTTP-only dashboard cookie. Opening CMS recognizes an existing dashboard admin cookie automatically; no separate CMS login is required. Reopening a saved CMS session also exchanges its valid admin token for that cookie through `/api/cms/session`, after checking that the administrator still exists. CMS sign-out clears the dashboard cookie as well. Refreshing the CMS after deployment restores access through its Admin Dashboard link without another account setup step.


## Live CMS FAQs and administrator management

FAQ Manager now supports create, update, active/inactive visibility, delete, category listing, export, and drag-and-drop ordering. Every public and dashboard FAQ request reads the same database rows; CMS changes appear on the next page load without a code deployment. Existing defaults are migrated once when the FAQ table is empty. A migration marker prevents deleted FAQs from reappearing on restart. Existing CMS content is preserved.

Public `/faq` includes all active categories. Worker/business/prime categories appear on their respective role pages; general and custom categories are shared with all roles. Rich-text answers use a sanitizing HTML allowlist, including safe links and lists. Inactive answers are excluded from public pages and export. The CMS FAQ count reflects the database.

CMS Admin Accounts now uses a working JSON API at `/api/admin/users` for listing, creation, name/password editing, and deletion. Responses omit password hashes. These are system administrators with access to both dashboard and CMS; unsupported legacy editor roles are not offered. Self-deletion and deletion of the last admin are blocked. Deleting an account revokes dashboard and CMS access for its existing token. The CMS count now reflects actual administrator records.

## Directory profile cards

Business and labor directory routes and templates now share the same `results` list, fixing the prior empty lists despite matching database records. Responsive cards show identity initials, location, specialism, experience/description, certifications, NAICS codes, profile completeness, full-profile links, and uploaded capability statement links when present. Private email addresses and phone numbers are not shown in the cards. Worker codes and document availability are loaded in batches.

Connection request forms use the existing `/prime/connect` endpoint with in-place success/error feedback. Read-only demos show preview status instead. Existing query names in the visible directory filters are supported, including case-insensitive certification matching and exact NAICS code filtering.

Browser checks verified the CMS FAQ/Admin Accounts lists load successfully and business/labor profile cards render without horizontal overflow at desktop and mobile widths. Integration tests cover FAQ publication/update/removal/order/sanitization and one-time seeding, admin account management/revocation, and directory card content/filtering/statement links.


## Role communication and hiring workflows

Member relationships follow **labor ↔ small business ↔ prime contractor**. Either side can request a connection. Only the recipient can accept/decline a pending request; only its sender can withdraw it. Acceptance unlocks contact details and direct messages for that pair. Direct labor-to-prime connections/messages and same-role member connections are rejected by the server. Administrator/support messages remain available independently of a member connection. Recipient IDs, account activity, role compatibility and connection ownership are validated on the server; recipient names cannot be supplied to impersonate a member.

Prime contractors post contracting **opportunities**, which small businesses/subcontractors can discover, match, save and apply to. The existing administrator publication-review process for primes is retained. Small businesses post **jobs** at `/business/post-job`, manage them at `/business/jobs`, and review labor applications at `/business/job-applications`. Labor discovers jobs at `/labor/search` and applies using its own applicant identity. Small businesses can still submit their own opportunity applications separately at `/business/applications`.

Posting type and owner role are enforced independently of submitted form fields. Businesses cannot impersonate primes, labor cannot apply to prime opportunities, and businesses cannot apply to labor jobs. Posting owners review only their own applications. Submissions notify the actual typed owner; review outcomes notify the actual typed applicant. Duplicate submissions do not create duplicate records or notifications. Closed/expired postings cannot receive applications. Withdrawal and archival retain application histories.

New directories let labor find small businesses and let small businesses find both labor and primes. Prime directories and invitations target small businesses. Automatic NAICS matching uses the same applicant audiences: labor gets jobs, businesses get opportunities, and posting owners get eligible partners. Dashboards and navigation use the corresponding role relationships.

Startup adds `opportunities.listing_type` and the typed `role_connections` table. Existing postings default to opportunities; when the type column is first added, business-owned postings are classified as jobs. Existing prime–business connections are copied idempotently. Historical prime–labor connections remain in the legacy table but do not grant new member messaging or application permissions. No existing connections or applications are deleted.

Demo tables receive the new listing column and role-connection schema, fictional accepted labor/business and business/prime connections, and a sample business job. Demos remain read-only and isolated from live data. Notifications in these workflows are in-app messages/notifications; no production SMTP delivery was exercised during validation.

Validation includes the full role-pair permission matrix, request/accept/decline/withdraw ownership, messaging before and after acceptance, recipient identity checks, both posting/application paths, duplicate prevention, wrong-role rejections and same-role cross-owner rejections. Browser checks also exercised job posting → labor application → business review and labor connection request → business acceptance → message delivery.

Untrusted message subjects are escaped before appearing in the notification dropdown; a browser check verified that HTML in a message subject is displayed as text rather than executed.

### Unified prime RFQs

Prime posting is presented as Request for Qualifications (RFQ), using the existing shared listing, business application, review, NAICS matching, attachment, notification, and analytics services. `/prime/post-rfq` creates an RFQ; `/prime/opportunities` manages RFQs. Existing opportunity URLs remain supported. `/prime/rfq` redirects to the unified manager, and stale legacy form submissions redirect to the new form rather than creating disconnected records.

Old `subcontractor_requests` records are copied once into the shared listings using stable `legacy-rfq-<id>` identifiers. Closed records remain closed; others start as drafts for owner review and the normal publication approval process. The original records remain intact, and subsequent startups preserve edits to the migrated copies.
