# Hostinger deployment

EVOConnect runs as an Express application on Hostinger. Deploy the GitHub repository `ksolomon68/evoconnect`, branch `main`.

Use these application settings:

| Setting | Value |
| --- | --- |
| Application type | Express / Node.js |
| Node.js | 22 |
| Entry file | `server/index.js` |
| Build command | None |
| Output directory | None |
| Package install | `npm install` |
| Start command, if requested | `npm start` |

Hostinger's Git integration automatically redeploys after pushes to main. The server supports Hostinger Passenger and the platform-provided `PORT`; it does not publish a static `dist/netlify` directory or require Netlify Functions.

Keep the current Hostinger database settings in the hosting environment: `DB_HOST`, `DB_PORT` if needed, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`. `127.0.0.1` is appropriate when MySQL runs on the same Hostinger server. Keep a strong `JWT_SECRET` and the real administrator configuration. Set `NODE_ENV=production`. Set `DOMAIN` to the current hostname and `APP_URL` to its full HTTPS URL. Never commit credentials.

Startup initializes the required database tables and applies additive migrations. Existing members, admin accounts, role connections, RFQs, jobs, applications, analytics, FAQs, and CMS content remain in the current database; no data export or external database is required. CMS content stays database-backed so edits made after the Netlify preparation remain available. Templates and the latest dashboard designs are preserved.

PDF capability statements, resume PDFs, and posting attachments support up to 10 MB. The legacy labor profile resume endpoint accepts up to 5 MB. Files use the filesystem rather than Netlify Blobs. Retain the existing `CAPABILITY_STORAGE_DIR` if configured; its default is `../evoconnect-private/capabilities` relative to the checkout, outside public directories. CMS images remain in `uploads/cms-media`, and legacy resumes in `uploads/resumes`. Back up these directories with the database and preserve them across releases.

SMTP settings are unchanged. Check `/api/health` after deployment, then sign in and verify CMS access and existing uploaded documents. The application does not depend on `EVO_SERVERLESS`, `FILE_STORAGE`, or any Netlify token. A future migration can be recovered from Git history without changing the current Hostinger deployment.
