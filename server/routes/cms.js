/**
 * CMS API Routes
 *
 * Endpoints:
 *   GET    /api/cms/global              — get global site settings
 *   PUT    /api/cms/global              — update global settings        [admin]
 *   GET    /api/cms/pages               — list all pages
 *   GET    /api/cms/pages/:slug         — get single page content
 *   PUT    /api/cms/pages/:slug         — update page content           [admin]
 *   POST   /api/cms/pages               — create new custom page        [admin]
 *   DELETE /api/cms/pages/:slug         — delete a custom page          [admin]
 *   GET    /api/cms/schema              — get component-type schemas
 *   GET    /api/cms/media               — list media library files      [admin]
 *   POST   /api/cms/media               — upload image to media library [admin]
 *   DELETE /api/cms/media/:filename     — delete a media file           [admin]
 *
 * @module routes/cms
 */

'use strict';

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
// Content and administrator authentication persist in the database.

const router = express.Router();

const { JWT_SECRET: CMS_JWT_SECRET, setAuthCookie, signToken } = require('../middleware/auth');

// ─── Directory paths ────────────────────────────────────────────────────────
const ROOT_DIR    = require('../services/app-root');
const CONTENT_DIR = path.join(ROOT_DIR, 'content');
const PAGES_DIR   = path.join(CONTENT_DIR, 'pages');
const SCHEMAS_DIR = path.join(CONTENT_DIR, 'schemas');
const GLOBAL_FILE = path.join(CONTENT_DIR, 'global.json');
const MEDIA_DIR   = path.join(ROOT_DIR, 'uploads/cms-media');

// ─── Multer — media uploads ──────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'
]);

const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only image files (JPEG, PNG, GIF, WebP, SVG) are allowed.'));
        }
    }
});

// ─── CMS Login (real administrator account) ───────────────────────────────────────────
/**
 * POST /api/cms/login authenticates an existing real administrator.
 * The administrator's stored password works in both the portal and CMS.
 * An explicitly configured legacy CMS password remains supported.
 */
router.post('/login', async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const [admins] = await require('../database').getDb().execute('SELECT id,password_hash FROM admins WHERE email = ?', [String(email).trim().toLowerCase()]);
        if (!admins.length) return res.status(401).json({ error: 'Invalid credentials' });
        const passwordMatch = await require('../services/admin-authentication').matches(admins[0],password);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { email, id: admins[0].id, type: 'admin' },
            CMS_JWT_SECRET,
            { expiresIn: '24h' }
        );
        setAuthCookie(res,token);
        res.json({ success: true, token, email, message: 'CMS login successful' });
    } catch (err) {
        console.error('CMS login error:', err.message);
        res.status(500).json({ error: 'Login failed due to server error' });
    }
});

// Restore dashboard access for a CMS session already saved in this browser tab.
router.post('/session', requireAdmin, async(req,res)=>{
    try {
        const [admins]=await require('../database').getDb().execute('SELECT id,email,name FROM admins WHERE id=? AND email=?',[req.user.id,req.user.email]);
        if(!admins.length)return res.status(401).json({error:'Administrator account unavailable.'});
        const admin=admins[0];
        const token=signToken({id:admin.id,email:admin.email,name:admin.name,type:'admin'});
        setAuthCookie(res,token);
        res.json({success:true,email:admin.email,token});
    }catch(err){console.error('CMS session restore:',err.code || err.message);res.status(500).json({error:'Unable to restore admin session.'});}
});

/** POST /api/cms/change-password — change the CMS admin password (admin only) */
router.post('/change-password', requireAdmin, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 12) {
        return res.status(400).json({ error: 'New password must be at least 12 characters' });
    }

    try {
        const db = require('../database').getDb();
        const [admins] = await db.execute('SELECT id,password_hash FROM admins WHERE id=? AND email=?', [req.user.id,req.user.email]);
        if (!admins.length || !await bcrypt.compare(currentPassword,admins[0].password_hash)) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }
        const newHash = await bcrypt.hash(newPassword,12);
        await db.execute('UPDATE admins SET password_hash=? WHERE id=?',[newHash,admins[0].id]);
        res.json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
        console.error('CMS: Failed to change password:', err.message);
        res.status(500).json({ error: 'Failed to change password. Please try again.' });
    }
});

// ─── Admin auth middleware ────────────────────────────────────────────────────
async function requireAdmin(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.cookies?.evo_token;
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    try {
        const decoded = jwt.verify(token, CMS_JWT_SECRET);
        if (decoded.type !== 'wfc_admin' && decoded.type !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const [accounts]=await require('../database').getDb().execute('SELECT id FROM admins WHERE id=?',[decoded.id]);
        if(!accounts.length)return res.status(401).json({error:'Administrator account unavailable.'});
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }
}

const content = require('../services/cms-content');
const {resolveSlug}=content;
const files = require('../services/file-storage');
const wrap = fn => (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const NAV_ORDER = ['index','labor','for-small-businesses','for-prime-contractors','contact','resources','opportunities','how-it-works','faq','support-services','eligibility'];
const isValidSlug = slug => /^[a-z0-9][a-z0-9-]{0,79}$/.test(slug);
router.get('/global',wrap(async(req,res)=>{
    const data=await content.read(GLOBAL_FILE);
    return data?res.json(data):res.status(404).json({error:'Global settings unavailable.'});
}));
router.put('/global',requireAdmin,wrap(async(req,res)=>{
    if(!req.body || typeof req.body!=='object')return res.status(400).json({error:'JSON body required'});
    const updated=mergeDeep(await content.read(GLOBAL_FILE)||{},req.body);
    updated.updatedAt=new Date().toISOString();await content.write(GLOBAL_FILE,updated);
    res.json({success:true,data:updated});
}));
router.get('/pages',wrap(async(req,res)=>{
    const pages=(await content.pages()).map(({file,data})=>({slug:file.slice(0,-5),title:data.meta?.title||file.slice(0,-5),updatedAt:data.updatedAt||null,isSystem:data.isSystem||false}));
    pages.sort((a,b)=>{
        const ai=NAV_ORDER.indexOf(a.slug),bi=NAV_ORDER.indexOf(b.slug);
        if(ai===-1 && bi===-1)return a.slug.localeCompare(b.slug);
        return ai===-1?1:bi===-1?-1:ai-bi;
    });res.json(pages);
}));
router.get('/pages/:slug',wrap(async(req,res)=>{
    if(!isValidSlug(resolveSlug(req.params.slug)))return res.status(400).json({error:'Invalid page slug'});
    const data=await content.read(path.join(PAGES_DIR,resolveSlug(req.params.slug)+'.json'));
    return data?res.json(data):res.status(404).json({error:'Page not found'});
}));
router.put('/pages/:slug',requireAdmin,wrap(async(req,res)=>{
    if(!isValidSlug(resolveSlug(req.params.slug)))return res.status(400).json({error:'Invalid page slug'});
    if(!req.body || typeof req.body!=='object')return res.status(400).json({error:'JSON body required'});
    const file=path.join(PAGES_DIR,resolveSlug(req.params.slug)+'.json');
    const updated=mergeDeep(await content.read(file)||{},req.body);
    updated.updatedAt=new Date().toISOString();await content.write(file,updated);
    res.json({success:true,data:updated});
}));
router.post('/pages',requireAdmin,wrap(async(req,res)=>{
    const {slug,meta,sections}=req.body||{};
    if(!slug || !isValidSlug(slug))return res.status(400).json({error:'A valid slug is required'});
    const file=path.join(PAGES_DIR,slug+'.json');
    if(await content.read(file))return res.status(409).json({error:'Page already exists'});
    const data={slug,isSystem:false,meta:{title:meta?.title||slug,description:meta?.description||''},header:{backgroundImage:'',logoImage:'/images/favicon.png',logoAlt:'EVOConnect'},sections:sections||[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    await content.write(file,data);res.status(201).json({success:true,data});
}));
router.delete('/pages/:slug',requireAdmin,wrap(async(req,res)=>{
    if(!isValidSlug(resolveSlug(req.params.slug)))return res.status(400).json({error:'Invalid page slug'});
    const file=path.join(PAGES_DIR,resolveSlug(req.params.slug)+'.json'),data=await content.read(file);
    if(!data)return res.status(404).json({error:'Page not found'});
    if(data.isSystem)return res.status(403).json({error:'System pages cannot be deleted'});
    await content.remove(file);res.json({success:true});
}));
router.get('/schema',wrap(async(req,res)=>res.json(JSON.parse(await fs.promises.readFile(path.join(SCHEMAS_DIR,'component-types.json'),'utf8')))));
router.get('/media',requireAdmin,wrap(async(req,res)=>{
    const items=await Promise.all((await files.list('media')).map(async filename=>{
        const file=await files.stat('media',filename);
        if(!file)return null;
        return {filename,url:`/uploads/cms-media/${filename}`,size:file.size,altText:file.metadata.altText||'',uploadedAt:file.metadata.uploadedAt||null};
    }));res.json(items.filter(Boolean).sort((a,b)=>String(b.uploadedAt).localeCompare(String(a.uploadedAt))));
}));
router.post('/media',requireAdmin,upload.single('image'),wrap(async(req,res)=>{
    if(!req.file)return res.status(400).json({error:'No file uploaded'});
    const altText=String(req.body.altText||'').trim();
    if(!altText)return res.status(400).json({error:'Alt text is required for every uploaded image'});
    const filename=`${require('crypto').randomUUID()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120)}`;
    const metadata={altText,originalName:req.file.originalname,mimeType:req.file.mimetype,size:req.file.size,uploadedAt:new Date().toISOString()};
    await files.put('media',filename,req.file.buffer,metadata);
    res.status(201).json({success:true,filename,url:`/uploads/cms-media/${filename}`,altText,size:req.file.size});
}));
router.delete('/media/:filename',requireAdmin,wrap(async(req,res)=>{
    const filename=req.params.filename;
    if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(filename))return res.status(400).json({error:'Invalid filename'});
    if(!await files.get('media',filename))return res.status(404).json({error:'File not found'});
    await files.remove('media',filename);res.json({success:true});
}));

// FAQ Manager and public pages share the cms_faqs table.
router.use(require('./cms-faqs')(requireAdmin));

/** GET /api/cms/stats — dashboard stats (file-based) */
router.get('/stats', requireAdmin, async (_req, res, next) => {
    try {
    const pageFiles=(await content.pages()).length;
    const mediaFiles=(await files.list('media')).length;
    const [[counts]]=await require('../database').getDb().execute('SELECT COUNT(*) AS faqs FROM cms_faqs');
    const [[admins]]=await require('../database').getDb().execute('SELECT COUNT(*) AS users FROM admins');
    res.json({ pages: pageFiles, faqs: counts.faqs, media: mediaFiles, users: admins.users, maxUploadMB: 10 });
    }catch(err){next(err);}
});

router.use((err,req,res,next)=>{
    console.error('CMS request failed:',err.code || err.message);
    res.status(err instanceof multer.MulterError ? 400 : 500).json({error:err instanceof multer.MulterError ? 'Upload is too large or invalid.' : 'Unable to complete CMS request.'});
});

// ─── Utility ──────────────────────────────────────────────────────────────────
/**
 * Deep-merge source into target (one level of object merging for sub-objects).
 * Arrays from source always replace target arrays (no concat).
 * @param {object} target
 * @param {object} source
 * @returns {object}
 */
function mergeDeep(target, source) {
    const result = Object.assign({}, target);
    for (const key of Object.keys(source)) {
        const sv = source[key];
        const tv = target[key];
        if (sv && typeof sv === 'object' && !Array.isArray(sv) &&
            tv && typeof tv === 'object' && !Array.isArray(tv)) {
            result[key] = mergeDeep(tv, sv);
        } else {
            result[key] = sv;
        }
    }
    return result;
}

// ─── Multer error handler ─────────────────────────────────────────────────────
router.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError || err.message) {
        return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;
