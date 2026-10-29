'use strict';

const rateLimit = require('express-rate-limit');

const MySQLStore=require('../services/mysql-rate-limit-store');
const isDev = process.env.NODE_ENV !== 'production';

// Rate limiter for authentication actions (Login, Forgot Password, Reset Password)
const authLimiter = rateLimit({
    store: process.env.EVO_SERVERLESS ? new MySQLStore('auth') : undefined,
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDev ? 10000 : 30, // 30 requests per 15 mins in production
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login or password reset attempts. Please try again after 15 minutes.' }
});

// Rate limiter for portal registrations (Worker, Business, Prime Contractor)
const regLimiter = rateLimit({
    store: process.env.EVO_SERVERLESS ? new MySQLStore('registration') : undefined,
    windowMs: 60 * 60 * 1000, // 1 hour
    max: isDev ? 10000 : 20, // 20 registration attempts per hour in production
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many registration attempts from this IP. Please try again after an hour.' }
});

module.exports = {
    authLimiter,
    regLimiter
};
