'use strict';
/**
 * EVOConnected — Automatic Federal & State Seed Migration
 * ========================================================
 * Runs on database initialization to clean up legacy demo placeholders
 * and ensure authentic Federal and Texas State solicitations & jobs are live.
 */

module.exports = async function migrateSeeds(db) {
    try {
        // Clean up legacy placeholders
        await db.execute("DELETE FROM opportunities WHERE id IN ('OPP-2026-001', 'OPP-2026-002', 'OPP-2026-003', 'OPP-2026-004')");

        // Run authentic seeding routine
        const { seed } = require('../../scripts/seed-federal-state');
        await seed();
    } catch (err) {
        console.warn('EVOConnected: Seed migration notice:', err.message);
    }
};
