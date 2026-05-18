# EvoConnect Hardening — Deferred Items (TODO)

These items require live DB access, business content decisions, or are lower priority and can be completed before Hostinger deployment.

## Requires Live DB / Integration Testing

1. **Checklist AJAX persistence** — The labor/business checklist AJAX now sends correct `{track, item_key, completed}` format. Needs to be tested against a live MySQL DB to confirm `checklist_progress` table writes are correct.

2. **Dashboard rendering with real data** — Dashboards fixed for variable names but should be smoke-tested with actual DB records for:
   - Worker: `matches`, `connections`, `checklistByTrack`, `worker.skills`
   - Business: `naicsDetails`, `connections`, `checklistByTrack`
   - Prime: pending state shows correctly for newly registered unapproved primes

3. **Email delivery** — All email triggers (registration confirmation, milestone emails, connection request emails) need SMTP credentials verified in `.env` before deployment. See `server/config/email.js`.

## Content Decisions Needed

4. **Business FAQs** — The existing business FAQ data should be reviewed. Currently it has several Q&As in `server/routes/business.js` — confirm these match the final content spec before go-live.

5. **Contact page** — `/contact` route and `views/contact.ejs` should be verified to work (form submission, email forwarding).

6. **Accessibility statement / Privacy policy / Terms of service** — These pages exist as EJS files. Confirm content is finalized and legally reviewed before launch.

## Minor UI / Feature Gaps

7. **Prime dashboard pending state** — After prime login (now unblocked), the prime dashboard should show a clear "Your account is pending review" message when `prime.active !== 1`. Verify `views/prime/dashboard.ejs` shows this state.

8. **Business NAICS codes** — The business register form does not yet have a NAICS code multi-select (no MVP blocker since NAICS matching happens via `naics_codes_json` after profile completion). Add this to the business profile edit page.

9. **Experience summary field** — The labor register form is missing the `experience_summary` textarea (it's in the DB schema and POST handler). Can be added to Step 2 or the profile edit page.

10. **Hamburger menu JS** — Mobile nav toggle is in the nav markup but needs JS in `public/js/evo.js` to function. Verify `.hamburger` button click toggles `#main-nav` visibility on mobile.

11. **Admin announcements broadcast** — The admin announcements page exists but the "send to all workers/businesses" email broadcast should be tested end-to-end.

## Pre-Deployment Checklist

Before Hostinger deployment:
- [ ] Set `NODE_ENV=production` in `.env.production`
- [ ] Set `SESSION_SECRET` to a strong random value
- [ ] Set `JWT_SECRET` to a strong random value  
- [ ] Configure SMTP credentials (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`)
- [ ] Set `APP_URL=https://evoconnect.evobrand.net` (or production domain)
- [ ] Set `DB_HOST`, `DB_USER`, `DB_PASS`, `DB_NAME` to Hostinger MySQL values
- [ ] Upload `uploads/resumes/` directory (or configure cloud storage)
- [ ] Run `node server/database.js` once to initialize schema on production DB
- [ ] Test all 3 registration flows end-to-end on production
