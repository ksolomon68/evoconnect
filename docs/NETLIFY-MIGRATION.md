# Move EvoConnect from Hostinger to Netlify

Target Netlify project: `1cf135cc-b02f-485a-a1ac-57170e516117`.

The repository supports Netlify Functions for Express, a new external managed MySQL database (for example Aiven MySQL), and site-wide Netlify Blobs for uploaded PDFs, resumes, and CMS media. Accounts, RFQs, jobs, applications, analytics, FAQs, CMS edits, sessions, and authentication rate limits persist in MySQL. This does not require a running Hostinger backend after migration.

## 1. Create the new database

Create a managed MySQL 8 service with a provider such as Aiven. Choose a region near the Netlify Functions region. Record its hostname, port, database name, username, and password. Download its CA certificate. Netlify Functions must be permitted to connect to the database; standard Functions do not have a fixed outgoing IP. Select a provider/network option that supports your Netlify plan, and keep verified TLS enabled.

Netlify does not supply MySQL through the application's `DB_*` variables. `127.0.0.1` is never the correct host for this external service. The new database may be called `defaultdb`; use the actual provider value.

## 2. Export existing data before cutover

Temporarily stop writes on Hostinger for the final export. In phpMyAdmin, export **all application tables** as SQL, including data and indexes. Export tables only: omit `CREATE DATABASE`, `USE` statements, and provider-specific definers. Keep the dump private. Import it into the newly provisioned database using your provider's import tool or MySQL Workbench over verified TLS. Existing password hashes are retained; account records do not need to be recreated.

Download the current CMS content and upload directories into this local folder structure:

```
hostinger-export/
  capabilities/             # CAPABILITY_STORAGE_DIR, outside the public website
  uploads/
    cms-media/              # include .meta.json sidecars
    resumes/
  content/
    global.json
    pages/
```

The private PDF directory is not necessarily inside `public_html`. Check the current `CAPABILITY_STORAGE_DIR`; its default is `../evoconnect-private/capabilities` relative to the checkout. Include PDFs referenced by both `capability_documents` and `opportunity_attachments`. Include all uploaded media, custom pages, and resumes. Downloading the GitHub repository alone does not include these files or the production database.

## 3. Configure the new environment

Rotate the previously shared database/admin passwords and JWT secret. Use fresh credentials for the new service. Enter secrets directly in Netlify's environment settings; do not commit or paste them into chat.

Set these for the **Functions runtime**, including the scheduled maintenance function:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DB_HOST` | New provider hostname |
| `DB_PORT` | New provider port |
| `DB_USER` | New provider username |
| `DB_PASSWORD` | New provider password |
| `DB_NAME` | New provider database name |
| `DB_SSL` | `true` |
| `DB_SSL_CA` | Full provider CA PEM; literal `\n` escapes also work |
| `DB_CONNECTION_LIMIT` | `2` initially; size for provider connection limits and Function concurrency |
| `DB_SKIP_CREATE` | `true` |
| `JWT_SECRET` | New random secret, at least 48 random bytes |
| `APP_URL` | Your full Netlify URL initially; final HTTPS domain after cutover |
| `DOMAIN` | Same hostname, without `https://` or a trailing slash |
| `ADMIN_EMAIL` | Your administrator email |
| `ADMIN_DEFAULT_PASSWORD` | A new temporary password, only if creating a new account |

The Function automatically enables serverless mode and Netlify file storage. Do not set `CAPABILITY_STORAGE_DIR` for Netlify. Do not carry over `CMS_ADMIN_PASSWORD`; admins use their real account password and the shared CMS session. An imported admin's old password is not overwritten by `ADMIN_DEFAULT_PASSWORD`; reset it explicitly with `npm run create-admin -- --reset-password` against the new database if needed.

For email, configure a non-Hostinger SMTP provider through `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_SECURE`, `EMAIL_USER`, `EMAIL_PASS`, and `EMAIL_FROM`. Verify your sending domain with that provider. Without SMTP, welcome and password-reset messages will not be delivered. Mailboxes and DNS are separate services; move any Hostinger-hosted email or DNS before canceling that service.

## 4. Apply the schema and import files

On a trusted local machine with Node 22.12 or later, configure the same **new database** credentials in an ignored `.env`. Use a fresh JWT secret; never run migration commands against the old source database by mistake.

```
npm ci
npm run migrate:db
```

This adds schema needed for durable sessions, CMS content, and shared rate limits while preserving imported data. Database creation is handled by the provider. Production Functions connect to an already migrated database; they do not run the full schema migration on each cold start.

For this one-time local file import, also set `NETLIFY_SITE_ID=1cf135cc-b02f-485a-a1ac-57170e516117` and a Netlify personal access token as `NETLIFY_AUTH_TOKEN` in the ignored local environment. The token needs access to this project's Blobs. It is not needed in the deployed Function, which uses Netlify's built-in storage credentials.

```
node scripts/import-hostinger-files.js --source /absolute/path/to/hostinger-export
```

The importer checks that referenced files exist before uploading them. It preserves PDF storage names and existing profile/document URLs. Run it before opening the new site to edits; rerunning imports overwrites the corresponding migrated files and CMS content. Remove the temporary local Netlify token after import.

Uploads through the Netlify Function are limited to **4 MB per file**, leaving room for multipart and platform request encoding overhead. The same conservative limit applies to imported files served through the Function; compress larger source PDFs/images/resumes before import. The importer stops and lists missing or oversized files rather than silently dropping them. Keeping larger files requires a separate direct-upload/download storage integration.

## 5. Deploy this repository

In the Netlify project, connect `ksolomon68/evoconnect`, branch `main`, base directory repository root. Use the checked-in `netlify.toml`:

- Build command: `npm run build:netlify`
- Publish directory: `dist/netlify`
- Functions directory: `netlify/functions`
- Node: 22 (22.12 or later)

Clear any old UI overrides for publish/build settings. A drag-and-drop deployment of the static assets alone will not deploy the Express Function. Public assets are copied to the CDN; application pages, login, APIs, private downloads, and CMS routes are rewritten to the Function. Only public assets are published: no environment files, database dumps, private uploads, or CMS authentication files.

A scheduled Function runs every 15 minutes to archive expired postings and clean expired sessions, rate limits, and password-reset tokens. It runs only on published production deployments; staging previews should use a separate database and separate site for storage isolation. Site-wide Blobs persist across deployments of this project, so preview deploys on the same site can access the same storage.

## 6. Verify before ending Hostinger service

Check `/api/health`, the home page and login, every demo role, your real admin login and CMS access, a business PDF upload/download, a labor resume upload, CMS page/media edits, RFQ creation/application/review, and analytics. Confirm edits and uploads survive a new deployment and that private documents require login. Test email delivery and password reset with your new SMTP provider.

Compare table counts against the source export and verify private PDFs and CMS images. Take a backup of the new database and retain the export privately. Point the custom domain to Netlify and update `APP_URL`/`DOMAIN` only after validation. Keep the old export and service available for rollback until the new deployment is verified; cancel Hostinger after the migration, DNS, and mail transfer are complete.

Local validation covers the Function adapter, MySQL-backed sessions/content/rate limits, and a Netlify Blobs emulator. A successful local build is not evidence that the new provider credentials, live Netlify project, domain, or imported production data have been verified.
