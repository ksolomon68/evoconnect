'use strict';
module.exports = function databaseConfig(env = process.env) {
    const cfg = {
        host: (env.DB_HOST || 'localhost').trim(), user: (env.DB_USER || 'root').trim(),
        password: env.DB_PASSWORD || '', database: (env.DB_NAME || 'evoconnect').trim(),
        port: Number(env.DB_PORT || 3306), connectTimeout: 10000
    };
    if (env.DB_SSL === 'true') cfg.ssl = {
        rejectUnauthorized: true,
        ...(env.DB_SSL_CA ? { ca: env.DB_SSL_CA.replace(/\\n/g, '\n') } : {})
    };
    return cfg;
};
