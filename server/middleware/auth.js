const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'evoconnect-change-in-production-2026';
const COOKIE_NAME = 'evo_token';

function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

function setAuthCookie(res, token) {
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
}

function clearAuthCookie(res) {
    res.clearCookie(COOKIE_NAME);
}

function getTokenFromRequest(req) {
    // Cookie-first, fallback to Bearer header
    if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
    const auth = req.headers['authorization'];
    if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
    return null;
}

// Middleware: require auth, redirect to login if missing
function requireAuth(req, res, next) {
    const token = getTokenFromRequest(req);
    if (!token) {
        req.session.flash = { type: 'error', message: 'Please log in to access your dashboard.' };
        return res.redirect('/login');
    }
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        clearAuthCookie(res);
        req.session.flash = { type: 'error', message: 'Your session expired. Please log in again.' };
        res.redirect('/login');
    }
}

// Middleware: require specific user type
function requireType(...types) {
    return [requireAuth, (req, res, next) => {
        if (!types.includes(req.user.type)) {
            return res.status(403).render('errors/403', { title: 'Access Denied' });
        }
        next();
    }];
}

// Middleware: require admin
function requireAdmin(req, res, next) {
    const token = getTokenFromRequest(req);
    if (!token) return res.redirect('/login');
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.type !== 'admin') return res.status(403).render('errors/403', { title: 'Access Denied' });
        req.user = decoded;
        next();
    } catch {
        clearAuthCookie(res);
        res.redirect('/login');
    }
}

// Middleware: attach user to res.locals if logged in (non-blocking)
function attachUser(req, res, next) {
    const token = getTokenFromRequest(req);
    if (token) {
        try {
            res.locals.user = jwt.verify(token, JWT_SECRET);
        } catch {
            clearAuthCookie(res);
        }
    }
    next();
}

module.exports = { signToken, setAuthCookie, clearAuthCookie, requireAuth, requireType, requireAdmin, attachUser, JWT_SECRET, COOKIE_NAME };
