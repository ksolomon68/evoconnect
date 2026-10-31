const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'evoconnect-change-in-production-2026';
const COOKIE_NAME = 'evo_token';

function normalizeUserType(type) {
    if (!type) return 'worker';
    const map = {
        worker: 'worker',
        workers: 'worker',
        labor: 'worker',
        business: 'business',
        businesse: 'business',
        businesses: 'business',
        small_business: 'business',
        vendor: 'business',
        prime: 'prime',
        primes: 'prime',
        prime_contractor: 'prime',
        admin: 'admin',
        admins: 'admin'
    };
    return map[type] || type;
}

function signToken(payload) {
    const normalized = { ...payload, type: normalizeUserType(payload.type) };
    return jwt.sign(normalized, JWT_SECRET, { expiresIn: '24h' });
}

function setAuthCookie(res, token, { sessionOnly = false } = {}) {
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: !!(process.env.PHUSION_PASSENGER || process.env.PASSENGER_NODE_CONTROL_REPO || process.env.NODE_ENV === 'production'),
        sameSite: 'lax',
        path: '/',
        ...(sessionOnly ? {} : { maxAge: 24 * 60 * 60 * 1000 }) // Keep public demos in the browser session only.
    });
}

function clearAuthCookie(res) {
    res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: !!(process.env.PHUSION_PASSENGER || process.env.PASSENGER_NODE_CONTROL_REPO || process.env.NODE_ENV === 'production'),
        sameSite: 'lax',
        path: '/'
    });
    res.clearCookie(COOKIE_NAME, { path: '/' });
}

function getTokenFromRequest(req) {
    if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
    const auth = req.headers['authorization'];
    if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
    return null;
}

// Middleware: require auth, redirect to login if missing
async function requireAuth(req, res, next) {
    const token = getTokenFromRequest(req);
    if (!token) {
        req.session.flash = { type: 'error', message: 'Please log in to access your dashboard.' };
        return res.redirect('/login');
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        decoded.type = normalizeUserType(decoded.type);
        if(require('../services/admin-access').isDemoAdmin(decoded)){clearAuthCookie(res);return res.status(403).send('Administrator demos are unavailable. Please sign in with your real account.');}
        const tables = { worker: 'workers', business: 'businesses', prime: 'primes', admin: 'admins' };
        if (!tables[decoded.type]) return res.status(403).send('Access denied.');
        const [accounts] = await require('../database').getDb().execute(`SELECT * FROM ${tables[decoded.type]} WHERE id = ?`, [decoded.id]);
        if (!accounts.length || (decoded.type === 'prime' ? accounts[0].active !== 1 : accounts[0].status && accounts[0].status !== 'active')) {
            clearAuthCookie(res);
            return res.status(403).send('Your account is inactive or awaiting approval.');
        }
        req.user = decoded;
        res.locals.user = decoded;
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
        const normTypes = types.map(normalizeUserType);
        if (!normTypes.includes(req.user.type)) {
            const dest = {
                worker: '/labor/dashboard',
                business: '/business/dashboard',
                prime: '/prime/dashboard',
                admin: '/admin/dashboard'
            };
            return res.redirect(dest[req.user.type] || '/login');
        }
        next();
    }];
}

// Middleware: require admin
async function requireAdmin(req, res, next) {
    const token = getTokenFromRequest(req);
    if (!token) return res.redirect('/login');
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        decoded.type = normalizeUserType(decoded.type);
        if(require('../services/admin-access').isDemoAdmin(decoded)){clearAuthCookie(res);return res.status(403).send('Administrator demos are unavailable. Please sign in with your real account.');}
        if (decoded.type !== 'admin') {
            const dest = {
                worker: '/labor/dashboard',
                business: '/business/dashboard',
                prime: '/prime/dashboard'
            };
            return res.redirect(dest[decoded.type] || '/login');
        }
        const [accounts]=await require('../database').getDb().execute('SELECT id FROM admins WHERE id=?',[decoded.id]);
        if(!accounts.length){clearAuthCookie(res);return res.redirect('/login');}
        req.user = decoded;
        res.locals.user = decoded;
        next();
    } catch {
        clearAuthCookie(res);
        res.redirect('/login');
    }
}

// Middleware: attach user to req.user AND res.locals.user if logged in (non-blocking)
function attachUser(req, res, next) {
    const token = getTokenFromRequest(req);
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            decoded.type = normalizeUserType(decoded.type);
            req.user = decoded;
            res.locals.user = decoded;
        } catch {
            clearAuthCookie(res);
        }
    }
    next();
}

module.exports = {
    signToken,
    setAuthCookie,
    clearAuthCookie,
    requireAuth,
    requireType,
    requireAdmin,
    attachUser,
    normalizeUserType,
    JWT_SECRET,
    COOKIE_NAME
};
