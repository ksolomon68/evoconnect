'use strict';
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fileStorage = require('../services/file-storage');
const multer = require('multer');
const { getDb } = require('../database');
const { requireAuth } = require('../middleware/auth');
const { record } = require('../services/performance');
const lifecycle = require('../services/opportunity-lifecycle');
const policy = require('../services/role-policy');
const matching = require('../services/naics-matching');
const router = express.Router();
const roles = { labor: 'worker', business: 'business', prime: 'prime', admin: 'admin' };
const tables = { worker: 'workers', business: 'businesses', prime: 'primes', admin: 'admins' };
const uploadLimitMB = 10;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: uploadLimitMB * 1024 * 1024, files: 1, fields: 5 } });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const notFound = res => res.status(404).send('This item is unavailable.');
function flash(req, message) { req.session.flash = { type: 'success', message }; }
router.use((req, res, next) => {
    if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    res.locals.csrfToken = req.session.csrfToken;
    next();
});
function csrf(req, res, next) {
    const token = req.body?._csrf || req.get('x-csrf-token');
    if (typeof token !== 'string' || token !== req.session.csrfToken) return res.status(403).send('Please refresh the page and try again.');
    next();
}
const portalAuth = [requireAuth, wrap(async (req, res, next) => {
    if (roles[req.params.portal] !== req.user.type) return res.status(403).send('Access denied.');
    const [rows] = await getDb().execute(`SELECT * FROM ${tables[req.user.type]} WHERE id = ?`, [req.user.id]);
    if (!rows.length || (req.user.type === 'prime' ? !rows[0].active : rows[0].status && rows[0].status !== 'active')) return res.status(403).send('Account is not active.');
    req.account = rows[0];
    next();
})];
function managed(req, opp) { return req.user.type === 'admin' || (opp.posted_by_type === req.user.type && Number(opp.posted_by) === Number(req.user.id)); }
async function opportunity(req) {
    const [rows] = await getDb().execute('SELECT * FROM opportunities WHERE id = ?', [req.params.id]);
    return rows[0];
}
const open = lifecycle.isOpen;
function publisher(req, res, next) { return ['prime','business','admin'].includes(req.user.type) ? next() : res.status(403).send('Only posting owners and administrators can manage listings.'); }

// Matches are recomputed from current codes and publication state on every request.
router.get('/:portal(labor|business)/matches', ...portalAuth, wrap(async(req,res)=>{
    const result = await matching.opportunities(getDb(),req.user.type,req.user.id);
    const [directory]=req.user.type==='worker' ? await getDb().execute('SELECT code,description FROM naics_codes ORDER BY code') : [[]];
    res.render('shared/auto-matches',{directory,title:'Automatic NAICS Matches',basePath:`/${req.params.portal}`,result});
}));

router.post('/:portal(labor)/matches/codes', ...portalAuth, csrf, wrap(async(req,res)=>{
    const raw = typeof req.body.naics_codes === 'string' ? req.body.naics_codes.trim() : '';
    const parts = raw ? raw.split(/[\s,]+/).filter(Boolean) : [];
    if(parts.length > 100 || parts.some(code=>!/^\d{2,6}$/.test(code)))return res.status(400).send('Enter up to 100 valid NAICS codes, separated by commas.');
    const codes = matching.codes(parts);
    if(codes.length) {
        const [known]=await getDb().execute(`SELECT code FROM naics_codes WHERE code IN (${codes.map(()=>'?').join(',')})`,codes);
        if(known.length !== codes.length)return res.status(400).send('Choose codes from the EVOConnected NAICS directory.');
    }
    const connection=await getDb().getConnection();
    try {
        await connection.beginTransaction();
        // Lock the member record so concurrent updates cannot merge two selections.
        await connection.execute('SELECT id FROM workers WHERE id=? FOR UPDATE',[req.user.id]);
        await connection.execute('DELETE FROM worker_matches WHERE worker_id=?',[req.user.id]);
        for(const code of codes)await connection.execute('INSERT INTO worker_matches (worker_id,naics_code) VALUES (?,?)',[req.user.id,code]);
        await connection.commit();
    } catch(err){await connection.rollback();throw err;}finally{connection.release();}
    res.redirect('/labor/matches');
}));

// Private PDF storage: filenames and owners never come from a submitted user ID.
router.get('/:portal(labor|business|prime|admin)/documents', ...portalAuth, wrap(async (req,res) => {
    const [docs] = await getDb().execute('SELECT * FROM capability_documents WHERE owner_type = ? AND owner_id = ?', [req.user.type, req.user.id]);
    const isWorker = req.params.portal === 'labor' || req.user.type === 'worker';
    res.render('shared/documents', { title: isWorker ? 'Upload Resume | EVOConnected' : 'Capability Statement | EVOConnected', basePath: `/${req.params.portal}`, document: docs[0], flash: req.session.flash || null });
    delete req.session.flash;
}));
router.post('/:portal(labor|business|prime|admin)/documents', ...portalAuth, (req,res,next) => {
    // Check before buffering a multipart request.
    const origin = req.get('origin');
    if (origin && origin !== `${req.protocol}://${req.get('host')}`) return res.status(403).send('Invalid upload origin.');
    upload.single('statement')(req,res,err => err ? res.status(400).send(err.code === 'LIMIT_FILE_SIZE' ? `PDF must be ${uploadLimitMB} MB or smaller.` : `Upload one PDF, ${uploadLimitMB} MB or smaller.`) : next());
}, csrf, wrap(async (req,res) => {
    const file = req.file;
    if (!file || file.mimetype !== 'application/pdf' || !file.buffer.subarray(0,5).equals(Buffer.from('%PDF-')) || !file.buffer.subarray(-2048).includes(Buffer.from('%%EOF'))) return res.status(400).send(`Upload a valid PDF document, ${uploadLimitMB} MB or smaller.`);
    const id = crypto.randomUUID();
    const storage = `${id}.pdf`;
    const [old] = await getDb().execute('SELECT storage_name FROM capability_documents WHERE owner_type = ? AND owner_id = ?', [req.user.type, req.user.id]);
    await fileStorage.put('capabilities',storage,file.buffer);
    try {
        await getDb().execute(`INSERT INTO capability_documents (id, owner_type, owner_id, storage_name, original_name, size_bytes)
            VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = VALUES(id), storage_name = VALUES(storage_name), original_name = VALUES(original_name), size_bytes = VALUES(size_bytes), created_at = CURRENT_TIMESTAMP`,
        [id, req.user.type, req.user.id, storage, path.basename(file.originalname).slice(0,255), file.size]);
    } catch (err) { await fileStorage.remove('capabilities',storage); throw err; }
    for(const doc of old) await fileStorage.remove('capabilities',doc.storage_name).catch(err => { if(err.code !== 'ENOENT') console.error('Old capability cleanup failed:', err.code); });
    const isWorker = req.params.portal === 'labor' || req.user.type === 'worker';
    flash(req, isWorker ? 'Resume uploaded. Your profile now links to this PDF.' : 'Capability statement uploaded. Your profile now links to this PDF.');
    res.redirect(req.params.portal === 'business' ? '/business/profile#capability-statement' : `/${req.params.portal}/documents`);
}));
router.post('/:portal(labor|business|prime|admin)/documents/delete', ...portalAuth, csrf, wrap(async (req,res) => {
    const [docs] = await getDb().execute('SELECT * FROM capability_documents WHERE owner_type = ? AND owner_id = ?', [req.user.type,req.user.id]);
    if(docs[0]) {
        await getDb().execute('DELETE FROM capability_documents WHERE id = ? AND owner_type = ? AND owner_id = ?', [docs[0].id,req.user.type,req.user.id]);
        await fileStorage.remove('capabilities',docs[0].storage_name).catch(err => { if(err.code !== 'ENOENT') throw err; });
    }
    const isWorker = req.params.portal === 'labor' || req.user.type === 'worker';
    flash(req, isWorker ? 'Uploaded resume removed.' : 'Uploaded statement removed.');res.redirect(req.params.portal === 'business' ? '/business/profile#capability-statement' : `/${req.params.portal}/documents`);
}));
router.get('/capabilities/:id', requireAuth, wrap(async (req,res,next) => {
    const [docs] = await getDb().execute('SELECT * FROM capability_documents WHERE id = ?', [req.params.id]);
    const doc = docs[0]; if(!doc || !tables[doc.owner_type]) return notFound(res);
    const [owners] = await getDb().execute(`SELECT * FROM ${tables[doc.owner_type]} WHERE id = ?`,[doc.owner_id]);
    if(!owners.length || (doc.owner_type === 'prime' ? !owners[0].active : owners[0].status && owners[0].status !== 'active')) return notFound(res);
    if(doc.owner_type === 'admin' && req.user.type !== 'admin') return notFound(res);
    const stored = await fileStorage.get('capabilities',doc.storage_name);
    if(!stored)return notFound(res);
    await record(req,doc.owner_type,doc.owner_id,'capability',doc.id,req.query.download === '1' ? 'download' : 'view');
    res.set({ 'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    res.set('Content-Disposition',`${req.query.download==='1'?'attachment':'inline'}; filename="capability-statement.pdf"`);
    res.send(stored.buffer);
}));

// Directory profile views are measured when a person opens the profile, not on search impressions.
router.get('/directory/:type(worker|business|prime)/:id', requireAuth, wrap(async (req,res) => {
    const [rows] = await getDb().execute(`SELECT * FROM ${tables[req.params.type]} WHERE id = ?`, [req.params.id]);
    const account=rows[0];
    if(!account || (req.params.type === 'prime' ? !account.active : account.status !== 'active')) return notFound(res);
    const [documents] = await getDb().execute('SELECT id FROM capability_documents WHERE owner_type = ? AND owner_id = ?', [req.params.type,account.id]);
    await record(req,req.params.type,account.id,'profile',`${req.params.type}:${account.id}`,'view');
    res.set('Cache-Control','private, no-store');
    res.render('shared/directory-profile',{title:'Profile | EVOConnected', profile:{id:account.id,type:req.params.type,name:account.company_name || account.full_name, city:account.city,state:account.state,description:account.service_description || account.experience_summary || account.contract_vehicles,naics:account.naics_codes,certifications:account.certifications}, document:documents[0]});
}));
router.get(['/opportunities/:id','/jobs/:id'], requireAuth, wrap(async (req,res) => {
    const opp=await opportunity(req);if(!opp || (!open(opp) && !managed(req,opp))) return notFound(res);
    if(opp.posted_by) await record(req,opp.posted_by_type,opp.posted_by,'opportunity',opp.id,'view');
    const [publishers]=['prime','business'].includes(opp.posted_by_type) && opp.posted_by ? await getDb().execute(`SELECT id FROM ${policy.tables[opp.posted_by_type]} WHERE id=?`,[opp.posted_by]) : [[]];
    const publisherProfile=publishers[0]?{...publishers[0],type:opp.posted_by_type}:null;
    const [attachments]=await getDb().execute('SELECT id,original_name,size_bytes FROM opportunity_attachments WHERE opportunity_id=?',[opp.id]);
    res.render('shared/opportunity-detail',{title:opp.title,opp,attachments,publisherProfile,basePath:req.user.type === 'business' ? '/business' : '/labor'});
}));

// One validated editor serves both admin and prime owners.
router.get(['/:portal(prime|admin)/post-opportunity','/:portal(prime)/post-rfq'], ...portalAuth, publisher, (req,res) => {
    res.render('shared/opportunity-editor',{title:req.user.type==='prime'?'Request for Qualifications':'Create Opportunity',basePath:`/${req.params.portal}`,opp:{},error:null});
});
router.get('/:portal(prime|admin)/opportunities/:id/edit', ...portalAuth, publisher, wrap(async (req,res) => {
    const opp=await opportunity(req);if(!opp || !managed(req,opp)) return notFound(res);
    const [attachments]=await getDb().execute('SELECT id,original_name,size_bytes FROM opportunity_attachments WHERE opportunity_id=?',[opp.id]);
    res.render('shared/opportunity-editor',{title:req.user.type==='prime'?'Edit RFQ':'Edit Opportunity',basePath:`/${req.params.portal}`,opp,attachments,error:null});
}));
const validateOpportunity=require('../services/listing-validation');
async function saveOpportunity(req,res) {
    const existing=req.params.id ? await opportunity(req) : null;
    if(req.params.id && (!existing || !managed(req,existing)))return notFound(res);
    const {data,error}=validateOpportunity(req.body);
    if(error)return res.status(400).render('shared/opportunity-editor',{title:'Opportunity',basePath:`/${req.params.portal}`,opp:{...data,id:existing?.id},error});
    if(req.user.type === 'prime' && data.status === 'published') data.status = 'pending';
    data.listing_type=existing?.listing_type || (req.user.type==='admin' && req.body.listing_type==='job'?'job':'opportunity');
    const keys=Object.keys(data);
    const db=getDb();
    const id=existing?.id || crypto.randomUUID();
    if(existing) await db.execute(`UPDATE opportunities SET ${keys.map(k=>`${k} = ?`).join(',')}, category_name = ?, description = ? WHERE id = ?`,[...Object.values(data),data.category,data.scope_summary,existing.id]);
    else await db.execute(`INSERT INTO opportunities (id, ${keys.join(',')}, category_name, description, posted_by, posted_by_type, posted_by_name) VALUES (${Array(keys.length+6).fill('?').join(',')})`,[id,...Object.values(data),data.category,data.scope_summary,req.user.id,req.user.type,req.account.company_name || req.account.name || 'EVOConnected Admin']);
    if(existing) await lifecycle.statusChanged(db,existing,data.status,req.user);
    if(data.status === 'pending' && existing?.status !== 'pending')await lifecycle.submittedForReview(db,{id,title:data.title},req.user);
    flash(req, req.user.type==='prime' ? (existing?'RFQ updated.':'RFQ created.') : (existing?'Opportunity updated.':'Opportunity created.'));res.redirect(`/${req.params.portal}/opportunities`);
}
router.post(['/:portal(prime|admin)/post-opportunity','/:portal(prime)/post-rfq'], ...portalAuth, publisher, csrf, wrap(saveOpportunity));
router.post('/:portal(prime|admin)/opportunities/:id/edit', ...portalAuth, publisher, csrf, wrap(saveOpportunity));
router.post('/:portal(prime|admin)/opportunities/:id/:action(status|delete)', ...portalAuth, publisher, csrf, wrap(async(req,res)=>{
    const opp=await opportunity(req);if(!opp || !managed(req,opp))return notFound(res);
    if(req.params.action==='delete') {
        // Archive preserves application histories and performance reporting.
        await getDb().execute("UPDATE opportunities SET status = 'archived' WHERE id = ?",[opp.id]);
    } else {
        if(req.user.type === 'prime' && req.body.status === 'published')return res.status(403).send('An administrator must approve publication.');
        if(!['draft','pending','published','closed','awarded','archived'].includes(req.body.status))return res.status(400).send('Invalid status.');
        if(req.body.status==='published' && !open({...opp,status:'published'}))return res.status(400).send('Update the expired deadline before publishing.');
        await getDb().execute('UPDATE opportunities SET status = ? WHERE id = ?',[req.body.status,opp.id]);
    }
    await lifecycle.statusChanged(getDb(),opp,req.params.action === 'delete' ? 'archived' : req.body.status,req.user);
    if(req.body.status==='pending' && opp.status!=='pending')await lifecycle.submittedForReview(getDb(),opp,req.user);
    flash(req,'Opportunity updated.');res.redirect(`/${req.params.portal}/opportunities`);
}));

// Validate the session and form token before handing off to the existing applicant workflows.
router.post('/:portal(labor|business)/applications/apply', ...portalAuth, csrf, (req,res,next)=>next());
router.post('/:portal(labor|business)/saved/toggle', ...portalAuth, csrf, (req,res,next)=>next());

// Role-aware reporting: no platform totals masquerading as a contractor's performance.
router.get('/:portal(labor|business|prime|admin)/analytics', ...portalAuth, wrap(async(req,res)=>{
    const db=getDb();const days=[7,30,90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const platform=req.user.type==='admin';
    const scope=platform ? '' : ' AND owner_type = ? AND owner_id = ?';
    const args=platform ? [] : [req.user.type,req.user.id];
    const [totals]=await db.execute(`SELECT entity_type,event_type,COUNT(*) AS total FROM performance_events WHERE event_day >= UTC_DATE() - INTERVAL ? DAY${scope} GROUP BY entity_type,event_type`,[days-1,...args]);
    const [daily]=await db.execute(`SELECT DATE_FORMAT(event_day,'%Y-%m-%d') AS day,entity_type,event_type,COUNT(*) AS total FROM performance_events WHERE event_day >= UTC_DATE() - INTERVAL ? DAY${scope} GROUP BY event_day,entity_type,event_type ORDER BY event_day DESC`,[days-1,...args]);
    const [opps]=await db.execute(`SELECT o.id,o.title,o.status,
        (SELECT COUNT(*) FROM performance_events e WHERE e.entity_type='opportunity' AND e.entity_id=o.id AND e.event_type='view' AND e.event_day >= UTC_DATE() - INTERVAL ? DAY) AS views,
        (SELECT COUNT(*) FROM applications a WHERE a.opportunity_id=o.id AND a.applied_date >= UTC_DATE() - INTERVAL ? DAY) AS applications,
        (SELECT COUNT(*) FROM saved_opportunities s WHERE s.opportunity_id=o.id AND s.saved_at >= UTC_DATE() - INTERVAL ? DAY) AS saves
        FROM opportunities o ${platform ? '' : 'WHERE o.posted_by_type = ? AND o.posted_by = ?'} ORDER BY o.posted_date DESC`,[days-1,days-1,days-1,...args]);
    const [applications]=await db.execute(`SELECT status,COUNT(*) AS total FROM applications WHERE applied_date >= UTC_DATE() - INTERVAL ? DAY${platform ? '' : ' AND applicant_type = ? AND applicant_id = ?'} GROUP BY status`,[days-1,...args]);
    const [documents]=await db.execute(`SELECT d.id,d.owner_type,d.original_name,d.created_at,
        (SELECT COUNT(*) FROM performance_events e WHERE e.entity_type='capability' AND e.entity_id=d.id AND e.event_type='view' AND e.event_day >= UTC_DATE() - INTERVAL ? DAY) AS views,
        (SELECT COUNT(*) FROM performance_events e WHERE e.entity_type='capability' AND e.entity_id=d.id AND e.event_type='download' AND e.event_day >= UTC_DATE() - INTERVAL ? DAY) AS downloads
        FROM capability_documents d ${platform ? '' : 'WHERE d.owner_type = ? AND d.owner_id = ?'}`,[days-1,days-1,...args]);
    res.render('shared/performance',{title:platform ? 'Platform Analytics' : 'My Analytics',days,totals,daily,opps,applications,documents,platform,basePath:`/${req.params.portal}`});
}));

router.post('/:portal(labor|business)/applications/:id/withdraw', ...portalAuth, csrf, wrap(async(req,res)=>{
    const [result]=await getDb().execute("UPDATE applications SET status = 'withdrawn' WHERE id = ? AND applicant_type = ? AND applicant_id = ? AND status IN ('pending','submitted','under_review')",[req.params.id,req.user.type,req.user.id]);
    if(!result.affectedRows)return notFound(res);
    flash(req,'Application withdrawn.');res.redirect(req.user.type==='business'?'/business/job-applications':`/${req.params.portal}/applications`);
}));
router.get('/admin/applications', requireAuth, wrap(async(req,res)=>{
    if(req.user.type!=='admin')return res.status(403).send('Access denied.');
    const [applications]=await getDb().execute(`SELECT a.*,o.title AS opportunity_title,
        COALESCE(b.company_name,w.full_name) AS applicant_name,COALESCE(b.email,w.email) AS applicant_email
        FROM applications a JOIN opportunities o ON o.id=a.opportunity_id
        LEFT JOIN businesses b ON a.applicant_type='business' AND b.id=a.applicant_id
        LEFT JOIN workers w ON a.applicant_type='worker' AND w.id=a.applicant_id ORDER BY a.applied_date DESC`);
    res.render('prime/applications',{title:'Application Review',applications,flash:req.session.flash || null,basePath:'/admin'});delete req.session.flash;
}));
router.post('/:portal(prime|business|admin)/applications/:id/status', ...portalAuth, publisher, csrf, wrap(async(req,res)=>{
    if(!['under_review','approved','awarded','declined'].includes(req.body.status))return res.status(400).send('Invalid application status.');
    const [rows]=await getDb().execute('SELECT a.*, o.posted_by, o.posted_by_type, o.listing_type, o.title FROM applications a JOIN opportunities o ON o.id = a.opportunity_id WHERE a.id = ?',[req.params.id]);
    const app=rows[0];if(!app || !managed(req,app))return notFound(res);
    if(req.user.type!=='admin' && !policy.canApply(app.applicant_type,app))return res.status(403).send('Applicant role does not match the listing.');
    if(app.status==='withdrawn')return res.status(409).send('A withdrawn application cannot be reviewed.');
    await getDb().execute('UPDATE applications SET status = ? WHERE id = ?',[req.body.status,app.id]);
    const [msg]=await getDb().execute("INSERT INTO messages (sender_type,sender_id,receiver_type,receiver_id,opportunity_id,message_type,subject,body) VALUES (?,?,?,?,?,'system',?,?)",[req.user.type,req.user.id,app.applicant_type,app.applicant_id,app.opportunity_id,'Application status updated',`Your application for ${app.title} is now ${req.body.status.replace('_',' ')}.`]);
    await getDb().execute('INSERT INTO notifications (user_type,user_id,message_id) VALUES (?,?,?)',[app.applicant_type,app.applicant_id,msg.insertId]);
    flash(req,'Application status updated and applicant notified.');res.redirect(req.user.type==='business'?'/business/job-applications':`/${req.params.portal}/applications`);
}));
// Caltrans user management parity, with role-specific records and retained histories.
router.get('/admin/users/new', requireAuth, (req,res) => {
    if(req.user.type!=='admin')return res.status(403).send('Access denied.');
    res.render('admin/user-editor',{title:'Create member',member:{type:'business'},error:null});
});
router.get('/admin/users/:type(worker|business|prime)/:id/edit', requireAuth, wrap(async(req,res)=>{
    if(req.user.type!=='admin')return res.status(403).send('Access denied.');
    const [rows]=await getDb().execute(`SELECT * FROM ${tables[req.params.type]} WHERE id = ?`,[req.params.id]);
    if(!rows.length)return notFound(res);
    const row=rows[0];res.render('admin/user-editor',{title:'Edit member',member:{...row,type:req.params.type,name:row.company_name || row.full_name},error:null});
}));
async function saveMember(req,res) {
    if(req.user.type!=='admin')return res.status(403).send('Access denied.');
    const type=req.params.type || req.body.type;
    if(!['worker','business','prime'].includes(type))return res.status(400).send('Invalid member type.');
    const value=(key,max=255)=>typeof req.body[key]==='string' ? req.body[key].trim().slice(0,max) : '';
    const member={id:req.params.id,type,name:value('name'),contact_name:value('contact_name'),email:value('email').toLowerCase(),phone:value('phone',50),city:value('city',100),state:value('state',2),sam_uei:value('sam_uei',50),status:value('status',20)};
    const password=typeof req.body.password==='string' ? req.body.password : '';
    let error;
    if(!member.name || !member.contact_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email) || !member.phone)error='Name, contact, valid email, and phone are required.';
    if(!['active','inactive','suspended'].includes(member.status))error='Choose a valid account status.';
    if(!member.id && password.length<12)error='Use a temporary password with at least 12 characters. The member can change it in Settings.';
    if(type==='prime' && !member.sam_uei)error='Prime contractors need a SAM UEI.';
    if(error)return res.status(400).render('admin/user-editor',{title:'Member',member,error});
    const data={ [type==='worker'?'full_name':'company_name']:member.name, email:member.email, phone:member.phone,city:member.city,state:member.state };
    if(type!=='worker')data.contact_name=member.contact_name;
    if(type==='prime'){data.active=member.status==='active'?1:0;data.sam_uei=member.sam_uei;}else data.status=member.status;
    const keys=Object.keys(data);
    try {
        if(member.id){
            const [result]=await getDb().execute(`UPDATE ${tables[type]} SET ${keys.map(k=>`${k}=?`).join(',')} WHERE id=?`,[...Object.values(data),member.id]);
            if(!result.affectedRows)return notFound(res);
        } else {
            data.password_hash=await require('bcryptjs').hash(password,12);
            if(type==='worker')data.trade_category='general';
            await getDb().execute(`INSERT INTO ${tables[type]} (${Object.keys(data).join(',')}) VALUES (${Object.keys(data).map(()=>'?').join(',')})`,Object.values(data));
        }
    } catch(err){if(err.code==='ER_DUP_ENTRY')return res.status(400).render('admin/user-editor',{title:'Member',member,error:'This email already exists for this role.'});throw err;}
    flash(req,'Member saved.');res.redirect('/admin/users');
}
router.post('/admin/users/new', requireAuth, csrf, wrap(saveMember));
router.post('/admin/users/:type(worker|business|prime)/:id/edit', requireAuth, csrf, wrap(saveMember));

// Solicitation attachments are PDFs stored outside all public/static directories.
router.post('/:portal(prime|business|admin)/opportunities/:id/attachments', ...portalAuth, publisher, (req,res,next)=>{
    upload.single('statement')(req,res,err=>err?res.status(400).send(`Upload one PDF, ${uploadLimitMB} MB or smaller.`):next());
}, csrf, wrap(async(req,res)=>{
    const opp=await opportunity(req);if(!opp || !managed(req,opp))return notFound(res);
    const file=req.file;
    if(!file || file.mimetype!=='application/pdf' || !file.buffer.subarray(0,5).equals(Buffer.from('%PDF-')) || !file.buffer.subarray(-2048).includes(Buffer.from('%%EOF')))return res.status(400).send('A valid PDF is required.');
    const id=crypto.randomUUID(),storage=`${id}.pdf`;
    await fileStorage.put('capabilities',storage,file.buffer);
    try{await getDb().execute('INSERT INTO opportunity_attachments (id,opportunity_id,storage_name,original_name,size_bytes) VALUES (?,?,?,?,?)',[id,opp.id,storage,path.basename(file.originalname).slice(0,255),file.size]);}
    catch(err){await fileStorage.remove('capabilities',storage);throw err;}
    res.redirect(`/${req.params.portal}/${req.user.type==='business'?'jobs':'opportunities'}/${encodeURIComponent(opp.id)}/edit`);
}));
router.get('/opportunity-attachments/:attachment', requireAuth, wrap(async(req,res,next)=>{
    const [rows]=await getDb().execute('SELECT f.*,o.status,o.due_date,o.due_time,o.posted_by,o.posted_by_type FROM opportunity_attachments f JOIN opportunities o ON o.id=f.opportunity_id WHERE f.id=?',[req.params.attachment]);
    const file=rows[0];if(!file || (!open(file)&&!managed(req,file)))return notFound(res);
    const stored=await fileStorage.get('capabilities',file.storage_name);
    if(!stored)return notFound(res);
    if(file.posted_by)await record(req,file.posted_by_type,file.posted_by,'opportunity',file.opportunity_id,'download');
    res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
    res.type('application/pdf').set('Content-Disposition','attachment; filename="solicitation.pdf"').send(stored.buffer);
}));
router.post('/:portal(prime|business|admin)/opportunities/:id/attachments/:attachment/delete', ...portalAuth, publisher, csrf, wrap(async(req,res)=>{
    const opp=await opportunity(req);if(!opp || !managed(req,opp))return notFound(res);
    const [files]=await getDb().execute('SELECT * FROM opportunity_attachments WHERE id=? AND opportunity_id=?',[req.params.attachment,opp.id]);
    if(!files.length)return notFound(res);
    await getDb().execute('DELETE FROM opportunity_attachments WHERE id=?',[files[0].id]);
    await fileStorage.remove('capabilities',files[0].storage_name).catch(err=>{if(err.code!=='ENOENT')throw err;});
    res.redirect(`/${req.params.portal}/${req.user.type==='business'?'jobs':'opportunities'}/${encodeURIComponent(opp.id)}/edit`);
}));
router.get('/:portal(prime|business|admin)/opportunities/:id/matches', ...portalAuth, publisher, wrap(async(req,res)=>{
    const opp=await opportunity(req);if(!opp || !managed(req,opp))return notFound(res);
    const matches=await matching.partners(getDb(),opp.naics_codes,opp.listing_type || 'opportunity');
    res.render('shared/opportunity-matches',{title:'Suggested partners',basePath:`/${req.params.portal}`,opp,matches});
}));
router.post('/:portal(prime|business|admin)/opportunities/:id/invite', ...portalAuth, publisher, csrf, wrap(async(req,res)=>{
    const opp=await opportunity(req);if(!opp || !managed(req,opp))return notFound(res);
    if(!open(opp))return res.status(400).send('Publish an open opportunity before inviting applicants.');
    const [type,id]=String(req.body.target_key || '').split(':');
    if(!policy.canApply(type,opp) || !/^\d+$/.test(id))return res.status(400).send('Invalid recipient.');
    const [targets]=await getDb().execute(`SELECT id FROM ${tables[type]} WHERE id=? AND status='active'`,[id]);
    if(!targets.length)return notFound(res);
    const [message]=await getDb().execute("INSERT INTO messages (sender_type,sender_id,receiver_type,receiver_id,opportunity_id,message_type,subject,body) VALUES (?,?,?,?,?,'invite',?,?)",[req.user.type,req.user.id,type,id,opp.id,`Invitation: ${opp.title}`,`You are invited to apply for ${opp.title}. View the opportunity at /opportunities/${opp.id}.`]);
    await getDb().execute('INSERT INTO notifications (user_type,user_id,message_id) VALUES (?,?,?)',[type,id,message.insertId]);
    flash(req,'Invitation sent.');res.redirect(req.user.type==='business'?'/business/jobs':`/${req.params.portal}/opportunities`);
}));

router.use((err,req,res,next)=>{
    console.error('EVOConnected feature error:',err);
    if(res.headersSent)return next(err);
    res.status(500).send('Unable to complete this request. Please try again.');
});
module.exports=router;
