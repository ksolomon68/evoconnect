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

            // Illustrative cross-role activity: a worker applying to a business's
            // job, and a business applying to a prime's opportunity, each with
            // the application message + a reply, so every demo role has
            // something to see in Applications and Messages on first login.
            const [[existingWorkerApp]]=await db.execute("SELECT id FROM applications WHERE opportunity_id='demo-labor-job' AND applicant_type='worker' AND applicant_id=?",[worker.id]);
            if(!existingWorkerApp){
                await db.execute("INSERT INTO applications (opportunity_id,applicant_type,applicant_id,status,notes) VALUES ('demo-labor-job','worker',?,'under_review','12 years in highway lighting and traffic signal work, IMSA Signal Level I certified. Available to start within two weeks.')",[worker.id]);
                await db.execute("INSERT INTO messages (sender_type,sender_id,sender_business_name,receiver_type,receiver_id,receiver_business_name,opportunity_id,message_type,subject,body,is_read) VALUES ('worker',?,'James Okafor','business',?,'GreenPath Environmental Services','demo-labor-job','application','New Application: Electrical field technician','I applied for the Electrical field technician role. 12 years in highway lighting and traffic signal work, IMSA Signal Level I certified, available to start within two weeks.',1)",[worker.id,business.id]);
                const [replyMsg]=await db.execute("INSERT INTO messages (sender_type,sender_id,sender_business_name,receiver_type,receiver_id,receiver_business_name,opportunity_id,message_type,subject,body,is_read) VALUES ('business',?,'GreenPath Environmental Services','worker',?,'James Okafor','demo-labor-job','reply','Re: New Application: Electrical field technician','Thanks for applying, James — your IMSA certification is exactly what we need. We are reviewing applications now and will follow up this week to schedule a call.',0)",[business.id,worker.id]);
                await db.execute("INSERT INTO notifications (user_type,user_id,message_id,is_read) VALUES ('worker',?,?,0)",[worker.id,replyMsg.insertId]);
            }

            const [[existingBizApp]]=await db.execute("SELECT id FROM applications WHERE opportunity_id='demo-environmental' AND applicant_type='business' AND applicant_id=?",[business.id]);
            if(!existingBizApp){
                await db.execute("INSERT INTO applications (opportunity_id,applicant_type,applicant_id,status,notes) VALUES ('demo-environmental','business',?,'under_review','GreenPath specializes in NEPA compliance and site assessment for transportation projects. SAM.gov registered, DBE/SBE/WBE certified.')",[business.id]);
                await db.execute("INSERT INTO messages (sender_type,sender_id,sender_business_name,receiver_type,receiver_id,receiver_business_name,opportunity_id,message_type,subject,body,is_read) VALUES ('business',?,'GreenPath Environmental Services','prime',?,'Apex Construction Group','demo-environmental','application','New Application: Environmental site assessment','GreenPath Environmental Services has submitted a proposal for Environmental site assessment. We specialize in NEPA compliance and hazardous materials management for transportation projects, DBE/SBE/WBE certified.',1)",[business.id,prime.id]);
                const [replyMsg2]=await db.execute("INSERT INTO messages (sender_type,sender_id,sender_business_name,receiver_type,receiver_id,receiver_business_name,opportunity_id,message_type,subject,body,is_read) VALUES ('prime',?,'Apex Construction Group','business',?,'GreenPath Environmental Services','demo-environmental','reply','Re: New Application: Environmental site assessment','Thanks for the submission, Tanya. Your DBE/SBE/WBE certifications help us meet our participation goals on this project. We are reviewing qualifications now and will follow up by the end of the week.',0)",[prime.id,business.id]);
                await db.execute("INSERT INTO notifications (user_type,user_id,message_id,is_read) VALUES ('business',?,?,0)",[business.id,replyMsg2.insertId]);
            }

            const [[existingSave]]=await db.execute("SELECT id FROM saved_opportunities WHERE opportunity_id='demo-electrical' AND user_type='business' AND user_id=?",[business.id]);
            if(!existingSave)await db.execute("INSERT INTO saved_opportunities (user_type,user_id,opportunity_id) VALUES ('business',?,'demo-electrical')",[business.id]);
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
