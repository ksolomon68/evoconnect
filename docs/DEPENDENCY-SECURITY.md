# Dependency security maintenance

The security update refreshes the lockfile and raises the dependency minimums to Express 4.22.3, Multer 2.5.0, and Nodemailer 10.3.1. Express stays on version 4 to retain the application's route syntax and middleware behavior.

The resolved dependency tree includes patched `proxy-addr` 2.0.8, `body-parser` 1.20.9, `path-to-regexp` 0.1.13, `qs` 6.16.2, and `brace-expansion` 5.0.12. A `minimatch` override selects the patched version 11 line for both EJS's command-line build tooling and nodemon. Both consumers' used APIs (`match` and `minimatch`) are verified by compatibility checks. This avoids an unrelated EJS major-version migration or npm's suggested nodemon downgrade.

Validation includes `npm audit` across production and development dependencies, the application's database-backed integration suite, malformed and oversized uploads, rendering and authentication workflows, and offline MIME generation for password-reset emails. No production email or payment is sent by these checks.

Hosting scanners can count individual advisories separately, whereas npm reports affected dependency packages. The screenshot's count therefore need not match npm's package count. A zero-result npm audit applies to the registry advisory data used at that scan; it does not prove that every application or hosting configuration is secure.

Deploy the committed `package.json` and `package-lock.json` together. Hostinger's normal Git deployment installs the updated dependency tree. A clean `npm ci` also reproduces that tree. After deployment, rerun the Hostinger vulnerability scan so it checks the new installed versions; its previous report will not change merely because the repository was updated. Check `/api/health`, login, CMS, and uploads after the deployment. SMTP delivery still requires valid hosting environment credentials.
