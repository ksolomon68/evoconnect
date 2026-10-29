'use strict';
const context = require('./demo-context');
const { getDb } = require('../database');
const ensureAccount = require('./demo-accounts');
const emails = ['demo-labor@evoconnect.io','demo-business@evoconnect.io','demo-prime@evoconnect.io','demo-admin@evoconnect.io'];
let initialized;
async function initialize() {
    if (!initialized) initialized=context.live(async()=>{
        const db=getDb();
        for(const table of context.tables)await db.execute(`CREATE TABLE IF NOT EXISTS demo_${table} LIKE ${table}`);
        const [columns]=await db.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='demo_opportunities' AND COLUMN_NAME='listing_type'");
        if(!columns.length)await db.execute("ALTER TABLE demo_opportunities ADD COLUMN listing_type ENUM('opportunity','job') NOT NULL DEFAULT 'opportunity'");
        // Only the public NAICS reference is copied; no live member data is copied.
        await db.execute('INSERT IGNORE INTO demo_naics_codes SELECT * FROM naics_codes');
        await context.run(async()=>{
            for(const email of emails)await ensureAccount(db,email);
            await require('./faqs').seed(db);
            const [[prime]]=await db.execute("SELECT id FROM primes WHERE email='demo-prime@evoconnect.io'");
            const [[worker]]=await db.execute("SELECT id FROM workers WHERE email='demo-labor@evoconnect.io'");
            const [[business]]=await db.execute("SELECT id FROM businesses WHERE email='demo-business@evoconnect.io'");
            for(const code of ['237130','238210'])await db.execute('INSERT IGNORE INTO worker_matches (worker_id,naics_code) VALUES (?,?)',[worker.id,code]);
            await db.execute("INSERT IGNORE INTO role_connections (left_type,left_id,right_type,right_id,requester_type,requester_id,status) VALUES ('business',?,'worker',?,'business',?,'accepted')",[business.id,worker.id,business.id]);
            await db.execute("INSERT IGNORE INTO role_connections (left_type,left_id,right_type,right_id,requester_type,requester_id,status) VALUES ('business',?,'prime',?,'prime',?,'accepted')",[business.id,prime.id,prime.id]);
            await db.execute("INSERT IGNORE INTO opportunities (id,title,scope_summary,category,category_name,status,due_date,naics_codes,posted_by,posted_by_type,posted_by_name,listing_type) VALUES ('demo-labor-job','Electrical field technician','Illustrative labor job posted by a small business.','Electrical','Electrical','published','2099-12-31','[\"238210\"]',?,'business','GreenPath Environmental Services','job')",[business.id]);
            for(const [id,title,naics] of [['demo-electrical','Highway lighting installation','["238210","237130"]'],['demo-environmental','Environmental site assessment','["541620","562910"]']]) {
                await db.execute(`INSERT IGNORE INTO opportunities (id,title,scope_summary,district_name,category,category_name,due_date,status,posted_by,posted_by_type,posted_by_name,naics_codes)
                    VALUES (?,?,'Illustrative demo project. No real solicitation or application.','Texas','Infrastructure','Infrastructure','2099-12-31','published',?,'prime','Apex Construction Group',?)`,[id,title,prime.id,naics]);
            }
        });
    }).catch(err=>{initialized=null;throw err;});
    return initialized;
}
async function loginContext(req,res,next) {
    if(!['worker','labor','business','prime','admin'].includes(req.params.role))return res.redirect('/login');
    try{await initialize();return context.run(next);}catch(err){console.error('Demo initialization failed:',err);return res.status(503).send('Demo preview is temporarily unavailable. Please try again.');}
}
async function passwordContext(req,res,next) {
    const email=typeof req.body.email==='string'?req.body.email.trim().toLowerCase():'';
    if(!emails.includes(email) || req.body.password!=='DemoPass1!')return context.live(next);
    try{await initialize();return context.run(next);}catch(err){console.error('Demo initialization failed:',err);return res.status(503).send('Demo preview is temporarily unavailable. Please try again.');}
}
function requestContext(req,res,next) {
    // Login/logout must be able to switch between live and demo sessions.
    if(!req.user?.demo || /^\/(?:login|logout|auth\/logout|auth\/demo\/[^/]+)$/.test(req.path))return context.live(next);
    if(!['GET','HEAD'].includes(req.method))return res.status(403).send('This is a read-only demo. Log out and use your own account to save changes.');
    if(/^\/(?:api\/cms|admin-cms|admin\/cms)(?:\/|\.|$)/.test(req.path))return res.status(403).send('Live content management is unavailable in demo previews.');
    return context.run(next);
}
module.exports={context,initialize,loginContext,passwordContext,requestContext};
