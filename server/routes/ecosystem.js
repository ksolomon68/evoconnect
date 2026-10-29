'use strict';
const express=require('express'),crypto=require('crypto');
const {getDb}=require('../database');
const {requireAuth}=require('../middleware/auth');
const policy=require('../services/role-policy'),connections=require('../services/role-connections');
const lifecycle=require('../services/opportunity-lifecycle');
const validate=require('../services/listing-validation');
const router=express.Router();
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
router.use((req,res,next)=>{if(!req.session.csrfToken)req.session.csrfToken=crypto.randomBytes(32).toString('hex');res.locals.csrfToken=req.session.csrfToken;next();});
const auth=[requireAuth,wrap(async(req,res,next)=>{
    if(policy.portals[req.user.type]!==req.params.portal)return res.status(403).send('Access denied.');
    req.actor=await policy.account(getDb(),req.user.type,req.user.id);if(!req.actor)return res.status(403).send('Account unavailable.');next();
})];
const csrf=(req,res,next)=>req.body?._csrf===req.session.csrfToken || req.get('x-csrf-token')===req.session.csrfToken?next():res.status(403).send('Refresh the page and try again.');
const flash=(req,text)=>{req.session.flash={type:'success',message:text};};
router.get('/:portal(labor|business|prime)/connections',...auth,wrap(async(req,res)=>{
    res.render('shared/role-connections',{title:'Connections',basePath:`/${req.params.portal}`,connections:await connections.list(getDb(),req.actor),flash:req.session.flash||null});delete req.session.flash;
}));
router.post('/:portal(labor|business|prime)/connect',...auth,csrf,wrap(async(req,res)=>{
    const type=req.body.target_type,id=Number(req.body.target_id),db=getDb();
    if(!policy.canConnect(req.user.type,type))return res.status(403).json({success:false,error:'Labor connects with small businesses. Primes connect with small businesses.'});
    const target=await policy.account(db,type,id);if(!target)return res.status(404).json({success:false,error:'Member unavailable.'});
    const message=typeof req.body.message==='string'?req.body.message.trim():'';if(message.length>2000)return res.status(400).json({success:false,error:'Keep the request message under 2,000 characters.'});
    const connection=await db.getConnection();
    try{
        await connection.beginTransaction();
        await connection.execute(`SELECT id FROM ${policy.tables[req.user.type]} WHERE id=? FOR UPDATE`,[req.user.id]);
        const existing=await connections.relationship(connection,req.actor,target);
        if(existing && ['accepted','pending'].includes(existing.status)){await connection.commit();return res.json({success:true,status:existing.status});}
        if(req.user.type==='prime'){
            await connection.execute("UPDATE primes SET monthly_contacts_used=0,monthly_views_used=0,views_reset_at=UTC_DATE() WHERE id=? AND (views_reset_at IS NULL OR views_reset_at < DATE_FORMAT(UTC_DATE(),'%Y-%m-01'))",[req.user.id]);
            const [[prime]]=await connection.execute('SELECT monthly_contacts_used,subscription_tier FROM primes WHERE id=?',[req.user.id]);
            const limit={basic:5,pro:20,enterprise:1000000}[prime.subscription_tier]||5;
            if(prime.monthly_contacts_used>=limit){await connection.rollback();return res.status(429).json({success:false,error:'Your connection request allowance has been reached.'});}
            await connection.execute('UPDATE primes SET monthly_contacts_used=monthly_contacts_used+1 WHERE id=?',[req.user.id]);
        }
        if(existing)await connection.execute("UPDATE role_connections SET requester_type=?,requester_id=?,status='pending',message=? WHERE id=?",[req.user.type,req.user.id,message,existing.id]);
        else{const [left,right]=connections.pair(req.actor,target);await connection.execute("INSERT INTO role_connections (left_type,left_id,right_type,right_id,requester_type,requester_id,message) VALUES (?,?,?,?,?,?,?)",[left.type,left.id,right.type,right.id,req.user.type,req.user.id,message]);}
        await connections.notify(connection,req.actor,target,'New connection request',`${req.actor.name} would like to connect with you.${message?' '+message:''} Review the request in Connections.`);
        await connection.commit();res.json({success:true,status:'pending'});
    }catch(err){await connection.rollback();throw err;}finally{connection.release();}
}));
async function respond(req,res){
    const action=req.params.action || req.body.action,db=getDb();
    if(!['accept','decline','withdraw'].includes(action))return res.status(400).send('Invalid connection action.');
    const connection=await db.getConnection();
    try{
        await connection.beginTransaction();
        const [rows]=await connection.execute('SELECT * FROM role_connections WHERE id=? FOR UPDATE',[req.params.id]);const row=rows[0];
        if(!row || !((row.left_type===req.user.type && row.left_id===req.user.id)||(row.right_type===req.user.type && row.right_id===req.user.id))){await connection.rollback();return res.status(404).send('Connection unavailable.');}
        const sender=row.requester_type===req.user.type && row.requester_id===req.user.id;
        if(row.status!=='pending' || (action==='withdraw'?!sender:sender)){await connection.rollback();return res.status(409).send('This request cannot be changed by this account.');}
        const left=row.left_type===req.user.type && row.left_id===req.user.id;
        const type=left?row.right_type:row.left_type,id=left?row.right_id:row.left_id;
        if(!policy.canConnect(req.user.type,type)){await connection.rollback();return res.status(403).send('Role relationship unavailable.');}
        const target=await policy.account(connection,type,id);if(!target){await connection.rollback();return res.status(404).send('Member unavailable.');}
        const status={accept:'accepted',decline:'declined',withdraw:'withdrawn'}[action];
        await connection.execute('UPDATE role_connections SET status=? WHERE id=?',[status,row.id]);
        await connections.notify(connection,req.actor,target,'Connection request updated',`${req.actor.name} ${status} the connection request.`);
        await connection.commit();flash(req,`Connection request ${status}.`);res.redirect(`/${req.params.portal}/connections`);
    }catch(err){await connection.rollback();throw err;}finally{connection.release();}
}
router.post('/:portal(labor|business|prime)/connections/:id/:action(accept|decline|withdraw)',...auth,csrf,wrap(respond));
router.post('/:portal(labor|business|prime)/connections/:id',...auth,csrf,wrap(respond));
router.get('/:portal(labor|business|prime)/directory/:type(worker|business|prime)',...auth,wrap(async(req,res)=>{
    const type=req.params.type;if(!policy.canConnect(req.user.type,type))return res.status(403).send('This directory is not available for your role.');
    const fields={worker:'id,full_name,trade_category,skills,certifications,years_experience,city,state,profile_pct,experience_summary',business:'id,company_name,business_type,certifications,naics_codes,service_description,city,state,profile_pct',prime:'id,company_name,naics_codes,contract_vehicles AS service_description,city,state'};
    const params=[],conditions=[type==='prime'?'active=1':"status='active'"];
    if(typeof req.query.state==='string' && req.query.state.trim()){conditions.push('state=?');params.push(req.query.state.trim());}
    if(typeof req.query.q==='string' && req.query.q.trim()){conditions.push(`${type==='worker'?'full_name':'company_name'} LIKE ?`);params.push('%'+req.query.q.trim()+'%');}
    const [rows]=await getDb().execute(`SELECT ${fields[type]} FROM ${policy.tables[type]} WHERE ${conditions.join(' AND ')} ORDER BY ${type==='worker'?'full_name':'company_name'} LIMIT 100`,params);
    res.render('shared/member-directory',{title:type==='worker'?'Labor directory':type==='prime'?'Prime contractor directory':'Small business directory',profiles:await require('../services/directory-profiles')(getDb(),type,rows),profileType:type,filters:req.query});
}));
router.post('/:portal(labor|business|prime|admin)/messages/send',...auth,csrf,(req,res,next)=>next());
router.get('/prime/search/workers',requireAuth,(req,res)=>res.status(403).send('Primes connect with small businesses. Labor hiring is managed by small businesses.'));
const jobAuth=[requireAuth,wrap(async(req,res,next)=>{if(req.user.type!=='business')return res.status(403).send('Only small businesses can post jobs.');req.actor=await policy.account(getDb(),'business',req.user.id);if(!req.actor)return res.status(403).send('Account unavailable.');next();})];
async function ownJob(req){const [rows]=await getDb().execute("SELECT * FROM opportunities WHERE id=? AND posted_by_type='business' AND posted_by=? AND listing_type='job'",[req.params.id,req.user.id]);return rows[0];}
router.get('/business/post-job',...jobAuth,(req,res)=>res.render('shared/opportunity-editor',{title:'Post a job',basePath:'/business',opp:{listing_type:'job'},error:null}));
router.get('/business/jobs/:id/edit',...jobAuth,wrap(async(req,res)=>{const job=await ownJob(req);if(!job)return res.status(404).send('Job unavailable.');const [attachments]=await getDb().execute('SELECT id,original_name,size_bytes FROM opportunity_attachments WHERE opportunity_id=?',[job.id]);res.render('shared/opportunity-editor',{title:'Edit job',basePath:'/business',opp:job,attachments,error:null});}));
async function saveJob(req,res){
    const existing=req.params.id?await ownJob(req):null;if(req.params.id&&!existing)return res.status(404).send('Job unavailable.');
    const {data,error}=validate(req.body);if(error)return res.status(400).render('shared/opportunity-editor',{title:'Post a job',basePath:'/business',opp:{...data,id:existing?.id,listing_type:'job'},error});
    data.listing_type='job';const id=existing?.id || crypto.randomUUID();
    if(existing)await getDb().execute(`UPDATE opportunities SET ${Object.keys(data).map(k=>`${k}=?`).join(',')},category_name=?,description=? WHERE id=?`,[...Object.values(data),data.category,data.scope_summary,id]);
    else await getDb().execute(`INSERT INTO opportunities (id,${Object.keys(data).join(',')},category_name,description,posted_by,posted_by_type,posted_by_name) VALUES (${Array(Object.keys(data).length+6).fill('?').join(',')})`,[id,...Object.values(data),data.category,data.scope_summary,req.user.id,'business',req.actor.name]);
    if(existing)await lifecycle.statusChanged(getDb(),existing,data.status,req.actor);flash(req,'Job saved. Labor workers can apply when it is published.');res.redirect('/business/jobs');
}
router.post('/business/post-job',...jobAuth,csrf,wrap(saveJob));
router.post('/business/jobs/:id/edit',...jobAuth,csrf,wrap(saveJob));
router.get('/business/jobs',...jobAuth,wrap(async(req,res)=>{const [jobs]=await getDb().execute("SELECT o.*,(SELECT COUNT(*) FROM applications a WHERE a.opportunity_id=o.id) AS applications_count FROM opportunities o WHERE posted_by_type='business' AND posted_by=? AND listing_type='job' ORDER BY posted_date DESC",[req.user.id]);res.render('business/jobs',{title:'Manage jobs',jobs,flash:req.session.flash||null});delete req.session.flash;}));
router.post('/business/jobs/:id/:action(status|delete)',...jobAuth,csrf,wrap(async(req,res)=>{
    const job=await ownJob(req);if(!job)return res.status(404).send('Job unavailable.');const status=req.params.action==='delete'?'archived':req.body.status;
    if(!['draft','published','closed','awarded','archived'].includes(status))return res.status(400).send('Invalid job status.');
    if(status==='published'&&!lifecycle.isOpen({...job,status}))return res.status(400).send('Update the expired deadline first.');
    await getDb().execute('UPDATE opportunities SET status=? WHERE id=?',[status,job.id]);await lifecycle.statusChanged(getDb(),job,status,req.actor);res.redirect('/business/jobs');
}));
router.get('/business/job-applications',...jobAuth,wrap(async(req,res)=>{
    const [applications]=await getDb().execute("SELECT a.*,o.title AS opportunity_title,w.full_name AS applicant_name,w.email AS applicant_email FROM applications a JOIN opportunities o ON o.id=a.opportunity_id JOIN workers w ON a.applicant_type='worker' AND w.id=a.applicant_id WHERE o.posted_by_type='business' AND o.posted_by=? AND o.listing_type='job' ORDER BY a.applied_date DESC",[req.user.id]);
    res.render('prime/applications',{title:'Review job applications',applications,basePath:'/business',flash:req.session.flash||null});delete req.session.flash;
}));
router.use((err,req,res,next)=>{console.error('Role workflow:',err.code || err.message);if(res.headersSent)return next(err);res.status(500).send('Unable to complete this request. Please try again.');});
module.exports=router;
