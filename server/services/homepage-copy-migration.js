'use strict';

// One-time, idempotent fix for homepage copy that read as a blanket
// "zero cost" platform claim — Prime Contractor Pro/Enterprise plans are
// paid (see server/routes/prime.js), while Labor and Business remain free.
// Rewrites the already-seeded cms_content row for pages/index.json in place;
// the content/pages/index.json file carries the same corrected text for any
// environment that hasn't seeded that row yet.

const REPLACEMENTS = [
    {
        old: 'FEDERAL & STATE CONTRACTING INFRASTRUCTURE • ZERO COST',
        updated: 'FEDERAL & STATE CONTRACTING INFRASTRUCTURE • FREE FOR LABOR & BUSINESSES'
    },
    {
        old: 'Register your primary trade, equipment capabilities, service radius, and active licenses in under five minutes—at zero cost.',
        updated: 'Register your primary trade, equipment capabilities, service radius, and active licenses in under five minutes.'
    }
];

function rewrite(value) {
    if (typeof value === 'string') {
        const hit = REPLACEMENTS.find(r => value === r.old);
        return hit ? hit.updated : value;
    }
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === 'object') {
        const out = {};
        for (const k of Object.keys(value)) out[k] = rewrite(value[k]);
        return out;
    }
    return value;
}

module.exports = async db => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [marker] = await connection.execute("INSERT IGNORE INTO app_migrations (name) VALUES ('homepage-remove-blanket-zero-cost-v1')");
        if (marker.affectedRows) {
            const [rows] = await connection.execute("SELECT content_key, data FROM cms_content WHERE content_key = 'pages/index.json' AND deleted = FALSE FOR UPDATE");
            for (const row of rows) {
                const value = JSON.parse(row.data);
                const updated = rewrite(value);
                if (JSON.stringify(value) !== JSON.stringify(updated)) {
                    await connection.execute('UPDATE cms_content SET data = ? WHERE content_key = ?', [JSON.stringify(updated), row.content_key]);
                }
            }
        }
        await connection.commit();
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
};
