'use strict';

const { getDb } = require('../database');

const VISIT_COOKIE = 'evo_vid';
const VISIT_WINDOW_MS = 30 * 60 * 1000; // a new "visit" after 30 min of inactivity

// Common crawler/bot substrings worth excluding from public traffic counts.
const BOT_UA_PATTERN = /bot|crawler|spider|crawl|slurp|facebookexternalhit|preview|monitor|pingdom|uptime|headlesschrome/i;

// Express middleware: counts a page view (and, once per rolling session, a
// visit) for public, anonymous, successful HTML page requests. Never throws
// or blocks the response — tracking failures are swallowed.
function trackRequest(req, res, next) {
    const eligible =
        req.method === 'GET' &&
        !req.user &&
        !BOT_UA_PATTERN.test(req.headers['user-agent'] || '');

    let isNewSession = false;
    if (eligible) {
        if (!req.cookies || !req.cookies[VISIT_COOKIE]) {
            isNewSession = true;
        }
        try {
            res.cookie(VISIT_COOKIE, '1', { maxAge: VISIT_WINDOW_MS, httpOnly: true, sameSite: 'lax' });
        } catch { /* cookies unavailable this early in some error paths */ }
    }

    res.on('finish', () => {
        if (!eligible) return;
        if (res.statusCode >= 400) return;
        const contentType = res.get('Content-Type') || '';
        if (!contentType.includes('text/html')) return;
        recordPageView(isNewSession).catch(err => console.error('EVOConnected [analytics] track error:', err.message));
    });

    next();
}

async function recordPageView(isNewSession) {
    const db = getDb();
    // Use MySQL's own CURDATE() rather than computing "today" in Node, so
    // writes always agree with the CURDATE()-based reads in getTotals()
    // regardless of the app server's timezone.
    await db.execute(
        `INSERT INTO site_analytics_daily (date, page_views, visits) VALUES (CURDATE(), 1, ?)
         ON DUPLICATE KEY UPDATE page_views = page_views + 1, visits = visits + VALUES(visits)`,
        [isNewSession ? 1 : 0]
    );
}

// Daily rows for the last `days` days (including days with no traffic),
// merging visits/page views with new signups across all three roles.
async function getDailySeries(db, days) {
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    const sinceStr = since.toISOString().slice(0, 10);

    const [trafficRows] = await db.execute(
        `SELECT date, page_views, visits FROM site_analytics_daily WHERE date >= ? ORDER BY date`,
        [sinceStr]
    );
    const [signupRows] = await db.execute(`
        SELECT date, SUM(cnt) AS signups FROM (
            SELECT DATE(created_at) AS date, COUNT(*) AS cnt FROM workers WHERE created_at >= ? GROUP BY DATE(created_at)
            UNION ALL
            SELECT DATE(created_at) AS date, COUNT(*) AS cnt FROM businesses WHERE created_at >= ? GROUP BY DATE(created_at)
            UNION ALL
            SELECT DATE(created_at) AS date, COUNT(*) AS cnt FROM primes WHERE created_at >= ? GROUP BY DATE(created_at)
        ) t GROUP BY date
    `, [sinceStr, sinceStr, sinceStr]);

    const trafficMap = {};
    for (const r of trafficRows) trafficMap[toDateStr(r.date)] = { page_views: r.page_views, visits: r.visits };
    const signupMap = {};
    for (const r of signupRows) signupMap[toDateStr(r.date)] = Number(r.signups);

    const series = [];
    const cursor = new Date(since);
    const today = new Date();
    while (cursor <= today) {
        const key = cursor.toISOString().slice(0, 10);
        series.push({
            date: key,
            pageViews: trafficMap[key]?.page_views || 0,
            visits: trafficMap[key]?.visits || 0,
            signups: signupMap[key] || 0
        });
        cursor.setDate(cursor.getDate() + 1);
    }
    return series.reverse(); // most recent first
}

function toDateStr(d) {
    // mysql2 returns DATE columns as a JS Date built from local-time
    // components, so reading it back with local getters (not
    // toISOString, which converts through UTC) avoids an off-by-one-day
    // shift when the server's timezone isn't UTC.
    if (d instanceof Date) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    return String(d).slice(0, 10);
}

// Today / 7-day / 30-day / all-time totals for visits, page views, signups.
async function getTotals(db) {
    const [[traffic]] = await db.execute(`
        SELECT
            COALESCE(SUM(CASE WHEN date = CURDATE() THEN page_views END), 0) AS pv_today,
            COALESCE(SUM(CASE WHEN date = CURDATE() THEN visits END), 0) AS v_today,
            COALESCE(SUM(CASE WHEN date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) THEN page_views END), 0) AS pv_7d,
            COALESCE(SUM(CASE WHEN date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) THEN visits END), 0) AS v_7d,
            COALESCE(SUM(CASE WHEN date >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) THEN page_views END), 0) AS pv_30d,
            COALESCE(SUM(CASE WHEN date >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) THEN visits END), 0) AS v_30d,
            COALESCE(SUM(page_views), 0) AS pv_all,
            COALESCE(SUM(visits), 0) AS v_all
        FROM site_analytics_daily
    `);

    const signupTotal = async (interval) => {
        const where = interval ? `WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${interval})` : '';
        const [[{ cnt }]] = await db.execute(`
            SELECT
                (SELECT COUNT(*) FROM workers ${where}) +
                (SELECT COUNT(*) FROM businesses ${where}) +
                (SELECT COUNT(*) FROM primes ${where}) AS cnt
        `);
        return Number(cnt);
    };

    const [signupsToday, signups7d, signups30d, signupsAll] = await Promise.all([
        signupTotal('1 DAY'),
        signupTotal('7 DAY'),
        signupTotal('30 DAY'),
        signupTotal(null)
    ]);

    return {
        pageViews: { today: Number(traffic.pv_today), days7: Number(traffic.pv_7d), days30: Number(traffic.pv_30d), allTime: Number(traffic.pv_all) },
        visits:    { today: Number(traffic.v_today),  days7: Number(traffic.v_7d),  days30: Number(traffic.v_30d),  allTime: Number(traffic.v_all) },
        signups:   { today: signupsToday, days7: signups7d, days30: signups30d, allTime: signupsAll }
    };
}

module.exports = { trackRequest, getDailySeries, getTotals };
