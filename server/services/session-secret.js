'use strict';
const { createHmac } = require('crypto');

module.exports = function sessionSecret(environment = process.env) {
    if (environment.SESSION_SECRET) return environment.SESSION_SECRET;
    // Existing deployments already configure JWT_SECRET. Derive a distinct,
    // stable session key rather than making another variable a startup prerequisite.
    if (environment.JWT_SECRET) {
        return createHmac('sha256', environment.JWT_SECRET)
            .update('evoconnect:express-session:v1').digest('hex');
    }
    if (environment.NODE_ENV === 'production') {
        throw new Error('Production requires JWT_SECRET for authentication.');
    }
    return 'evoconnect-session-secret-2026';
};
