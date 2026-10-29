'use strict';
const crypto = require('crypto');
const { getDb } = require('../database');
const { JWT_SECRET } = require('../middleware/auth');

async function record(req, ownerType, ownerId, entityType, entityId, eventType) {
    if (req.method !== 'GET' || (req.user?.type === ownerType && Number(req.user.id) === Number(ownerId))) return;
    const identity = req.user ? `${req.user.type}:${req.user.id}` : req.sessionID;
    if (!identity) return;
    const hash = crypto.createHmac('sha256', JWT_SECRET).update(identity).digest('hex');
    await getDb().execute(`INSERT IGNORE INTO performance_events
        (owner_type, owner_id, entity_type, entity_id, event_type, visitor_hash, event_day)
        VALUES (?, ?, ?, ?, ?, ?, UTC_DATE())`, [ownerType, ownerId, entityType, String(entityId), eventType, hash]);
}
module.exports = { record };
