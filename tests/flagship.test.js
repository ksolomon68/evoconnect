'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const { signToken } = require('../server/middleware/auth');
const port = Number(process.env.TEST_PORT || 3102);
const base = `http://127.0.0.1:${port}`;
const { spawn } = require('node:child_process');
let server;
let serverLog = '';
let db;
const clients = {};
function client(type,id) {
    let cookie=`evo_token=${signToken({type,id,email:`test-${type}@example.invalid`,name:`Test ${type}`})}`;
    let csrf;
    return {
        async request(url,options={}) {
            const res=await fetch(base+url,{redirect:'manual',...options,headers:{cookie,...options.headers}});
            const session=res.headers.getSetCookie().find(c=>c.startsWith('connect.sid='));
            if(session)cookie=`${cookie.split('; connect.sid=')[0]}; ${session.split(';')[0]}`;
            return res;
        },
        async page(url) {const res=await this.request(url);const text=await res.text();csrf=text.match(/name="_csrf" value="([^"]+)"/)?.[1] || csrf;return {res,text};},
        async post(url,data={}) {return this.request(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:csrf,...data})});},
        async upload(portal,bytes,name='statement.pdf',mime='application/pdf') {
            const form=new FormData();form.set('_csrf',csrf);form.set('statement',new Blob([bytes],{type:mime}),name);
            return this.request(`/${portal}/documents`,{method:'POST',body:form});
        }
    };
}
const pdf=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
before(async()=>{
    const database=process.env.TEST_DB_NAME || 'evoconnect_test';
    assert.match(database,/_test$/);
    server=spawn(process.execPath,['server/index.js'],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,NODE_ENV:'development',PORT:String(port),DB_HOST:process.env.DB_HOST || '127.0.0.1',DB_USER:process.env.DB_USER || 'dev',DB_NAME:database,CAPABILITY_STORAGE_DIR:`/tmp/evo-capabilities-${port}`,CMS_ADMIN_PASSWORD:'Legacy-cms-fixture-secret',EMAIL_USER:'',EMAIL_PASSWORD:''},stdio:['ignore','pipe','pipe']});
    server.stdout.on('data',data=>{serverLog+=data;});server.stderr.on('data',data=>{serverLog+=data;});
    let ready=false;
    for(let i=0;i<100;i++){try{const r=await fetch(base+'/api/health');if((await r.json()).status==='ok'){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
    assert.ok(ready,serverLog);
    db=await mysql.createConnection({host:process.env.DB_HOST || '127.0.0.1',user:process.env.DB_USER || 'dev',password:process.env.DB_PASSWORD,database:process.env.TEST_DB_NAME || 'evoconnect_test'});
    // Dedicated test schema; never run destructive fixtures against an app database.
    assert.match(process.env.TEST_DB_NAME || 'evoconnect_test',/_test$/);
    for(const table of ['performance_events','opportunity_attachments','capability_documents','applications','saved_opportunities','notifications','messages'])await db.execute(`DELETE FROM ${table}`);
    await db.execute("DELETE FROM opportunities WHERE id LIKE 'flagship-%' OR title LIKE 'Flagship %'");
    const [[admin]]=await db.execute('SELECT id FROM admins LIMIT 1');
    const [[prime]]=await db.execute('SELECT id FROM primes WHERE active = 1 LIMIT 1');
    const [[business]]=await db.execute('SELECT id FROM businesses LIMIT 1');
    const [[worker]]=await db.execute('SELECT id FROM workers LIMIT 1');
    clients.admin=client('admin',admin.id);clients.prime=client('prime',prime.id);clients.business=client('business',business.id);clients.worker=client('worker',worker.id);
    await db.execute("UPDATE businesses SET naics_codes='[\"237130\"]' WHERE id=?",[business.id]);
    clients.primeId=prime.id;clients.businessId=business.id;clients.workerId=worker.id;clients.adminId=admin.id;
    const [other]=await db.execute("INSERT INTO primes (company_name,contact_name,email,password_hash,phone,sam_uei,active) VALUES ('Other owner','Other','flagship-other@example.invalid','unused','0','TEST',1) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)");
    clients.other=client('prime',other.insertId);clients.otherId=other.insertId;
    for(const [type,portal] of [['admin','admin'],['prime','prime'],['business','business'],['worker','labor'],['other','prime']])assert.equal((await clients[type].page(`/${portal}/documents`)).res.status,200);
});
after(async()=>{if(db)await db.end();if(server){server.kill();await new Promise(r=>server.once('exit',r));}});

test('each role can upload a PDF; invalid files, excess size and CSRF fail',async()=>{
    for(const [role,portal] of [['admin','admin'],['prime','prime'],['business','business'],['worker','labor']]) {
        assert.equal((await clients[role].upload(portal,pdf)).status,302);
        assert.match((await clients[role].page(`/${portal}/documents`)).text,/statement.pdf/);
    }
    assert.equal((await clients.business.upload('business',Buffer.from('<script>alert(1)</script>'))).status,400);
    assert.equal((await clients.business.upload('business',pdf,'fake.txt','text/plain')).status,400);
    assert.equal((await clients.business.upload('business',Buffer.alloc(10*1024*1024+1))).status,400);
    assert.equal((await clients.business.post('/business/documents/delete',{_csrf:'wrong'})).status,403);
    assert.equal((await clients.worker.page('/business/documents')).res.status,403);
});
test('documents stay private, owner visits excluded, external visits deduplicated, replacement revokes old URL',async()=>{
    const [[doc]]=await db.execute("SELECT * FROM capability_documents WHERE owner_type='business' AND owner_id=?",[clients.businessId]);
    assert.equal((await fetch(base+`/capabilities/${doc.id}`,{redirect:'manual'})).status,302);
    assert.equal((await fetch(base+`/uploads/${doc.storage_name}`,{redirect:'manual'})).status,404);
    assert.equal((await clients.business.request(`/capabilities/${doc.id}`)).status,200);
    for(let i=0;i<2;i++)assert.equal((await clients.prime.request(`/capabilities/${doc.id}`)).status,200);
    const download=await clients.prime.request(`/capabilities/${doc.id}?download=1`);
    assert.match(download.headers.get('content-disposition'),/attachment/);assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdf);
    const [[count]]=await db.execute("SELECT COUNT(*) AS n FROM performance_events WHERE entity_id=?",[doc.id]);assert.equal(count.n,2);
    assert.equal((await clients.business.upload('business',pdf,'replacement.pdf')).status,302);
    assert.equal((await clients.prime.request(`/capabilities/${doc.id}`)).status,404);
    const [[replacement]]=await db.execute("SELECT id FROM capability_documents WHERE owner_type='business' AND owner_id=?",[clients.businessId]);
    assert.notEqual(doc.id,replacement.id);
});
test('admins create and edit; primes submit for review; ownership prevents cross-account changes',async()=>{
    const data={title:'Flagship admin opportunity',scope_summary:'Complete a public works project',category:'Construction',district_name:'Texas',due_date:'2099-01-01',status:'published',naics_codes:'237130, 238210'};
    assert.equal((await clients.admin.post('/admin/post-opportunity',data)).status,302);
    const [[opp]]=await db.execute('SELECT * FROM opportunities WHERE title=?',[data.title]);
    assert.equal(opp.posted_by_type,'admin');assert.equal(opp.posted_by,clients.adminId);assert.deepEqual(JSON.parse(opp.naics_codes),['237130','238210']);
    assert.equal((await clients.prime.post(`/prime/opportunities/${opp.id}/status`,{status:'closed'})).status,404);
    assert.equal((await clients.prime.post(`/prime/opportunities/${opp.id}/delete`)).status,404);
    assert.equal((await clients.prime.page(`/prime/opportunities/${opp.id}/edit`)).res.status,404);
    assert.equal((await clients.prime.post('/prime/post-opportunity',{...data,title:'Flagship prime opportunity'})).status,302);
    const [[owned]]=await db.execute("SELECT * FROM opportunities WHERE title='Flagship prime opportunity'");
    assert.equal(owned.status,'pending');assert.equal(owned.posted_by_type,'prime');
    assert.equal((await clients.business.request(`/opportunities/${owned.id}`)).status,404);
    assert.equal((await clients.other.post(`/prime/opportunities/${owned.id}/status`,{status:'closed'})).status,404);
    assert.equal((await clients.prime.post(`/prime/opportunities/${owned.id}/status`,{status:'published'})).status,403);
    assert.equal((await clients.admin.post(`/admin/opportunities/${owned.id}/status`,{status:'published'})).status,302);
    assert.equal((await clients.business.request(`/opportunities/${owned.id}`)).status,200);
    assert.equal((await clients.admin.post(`/admin/opportunities/${opp.id}/edit`,{...data,title:'Flagship revised opportunity'})).status,302);
    assert.equal((await clients.admin.post('/admin/post-opportunity',{...data,title:'',due_date:'bad'})).status,400);
    assert.equal((await clients.admin.post('/admin/post-opportunity',{...data,due_date:'2020-01-01'})).status,400);
});
test('applications reach correct owner, reviewers isolated, outcomes notify and withdrawals work',async()=>{
    const [[opp]]=await db.execute("SELECT * FROM opportunities WHERE title='Flagship revised opportunity'");
    assert.equal((await clients.business.post('/business/applications/apply',{opportunity_id:opp.id,notes:'Qualified bid'})).status,302);
    const [[application]]=await db.execute('SELECT * FROM applications WHERE opportunity_id=?',[opp.id]);assert.ok(application);
    const [[notification]]=await db.execute("SELECT COUNT(*) n FROM notifications n JOIN messages m ON m.id=n.message_id WHERE n.user_type='admin' AND n.user_id=? AND m.message_type='application'",[clients.adminId]);assert.equal(notification.n,1);
    const list=await clients.prime.page('/prime/applications');assert.equal(list.res.status,200);assert.doesNotMatch(list.text,/Qualified bid/);
    assert.equal((await clients.prime.post(`/prime/applications/${application.id}/status`,{status:'awarded'})).status,404);
    assert.equal((await clients.admin.page('/admin/applications')).res.status,200);
    assert.equal((await clients.admin.post(`/admin/applications/${application.id}/status`,{status:'under_review'})).status,302);
    assert.equal((await clients.business.post(`/business/applications/${application.id}/withdraw`)).status,302);
    assert.equal((await clients.admin.post(`/admin/applications/${application.id}/status`,{status:'awarded'})).status,409);
    assert.equal((await clients.worker.post(`/labor/applications/${application.id}/withdraw`)).status,404);
    assert.equal((await clients.admin.post(`/admin/opportunities/${opp.id}/delete`)).status,302);
    assert.equal((await clients.business.post('/business/applications/apply',{opportunity_id:opp.id,notes:'Reapply'})).status,404);
    assert.equal((await clients.business.post('/business/saved/toggle',{opportunity_id:opp.id})).status,404);
});
test('analytics are real, scoped by role and owner, and all role navigation works',async()=>{
    for(let i=0;i<2;i++)assert.equal((await clients.prime.request(`/directory/business/${clients.businessId}`)).status,200);
    assert.equal((await clients.business.request(`/directory/business/${clients.businessId}`)).status,200);
    const [[profile]]=await db.execute("SELECT COUNT(*) n FROM performance_events WHERE owner_type='business' AND owner_id=? AND entity_type='profile'",[clients.businessId]);assert.equal(profile.n,1);
    for(const [type,portal] of [['business','business'],['worker','labor'],['prime','prime'],['admin','admin']]) {
        for(const days of [7,30,90]) {const {res,text}=await clients[type].page(`/${portal}/analytics?days=${days}`);assert.equal(res.status,200,serverLog);assert.match(text,/Profile views/);assert.match(text,/Statement downloads/);assert.match(text,/Daily activity/);}
        assert.equal((await clients[type].page(`/${portal}/opportunities`)).res.status,type==='business'||type==='worker'?404:200);
    }
    assert.doesNotMatch((await clients.other.page('/prime/analytics')).text,/Flagship prime opportunity/);
    assert.match((await clients.prime.page('/prime/analytics')).text,/Flagship prime opportunity/);
    assert.equal((await clients.prime.page('/prime/search/businesses?state=TX')).res.status,200);
    assert.equal((await clients.prime.page('/prime/search/workers')).res.status,200);
    assert.equal((await clients.business.page('/business/search')).res.status,200);
    assert.equal((await clients.worker.page('/labor/applications')).res.status,200);
    assert.equal((await clients.business.request('/business/analytics',{method:'HEAD'})).status,200);
    assert.equal((await clients.business.post('/business/documents/delete')).status,302);
    const [[count]]=await db.execute("SELECT COUNT(*) n FROM capability_documents WHERE owner_type='business' AND owner_id=?",[clients.businessId]);assert.equal(count.n,0);
});
test('supporting PDFs, NAICS suggestions and invitations preserve ownership',async()=>{
    const [[opp]]=await db.execute("SELECT * FROM opportunities WHERE title='Flagship prime opportunity'");
    const edit=await clients.prime.page(`/prime/opportunities/${opp.id}/edit`);assert.equal(edit.res.status,200);
    const form=new FormData();form.set('_csrf',edit.text.match(/name="_csrf" value="([^"]+)"/)[1]);form.set('statement',new Blob([pdf],{type:'application/pdf'}),'specification.pdf');
    assert.equal((await clients.prime.request(`/prime/opportunities/${opp.id}/attachments`,{method:'POST',body:form})).status,302);
    const [[file]]=await db.execute('SELECT * FROM opportunity_attachments WHERE opportunity_id=?',[opp.id]);assert.ok(file);
    const downloaded=await clients.business.request(`/opportunity-attachments/${file.id}`);assert.equal(downloaded.status,200);assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),pdf);
    assert.match((await clients.business.page(`/opportunities/${opp.id}`)).text,/specification.pdf/);
    const match=await clients.prime.page(`/prime/opportunities/${opp.id}/matches`);assert.equal(match.res.status,200);assert.match(match.text,/Matching NAICS/);
    assert.equal((await clients.other.page(`/prime/opportunities/${opp.id}/matches`)).res.status,404);
    assert.equal((await clients.prime.post(`/prime/opportunities/${opp.id}/invite`,{target_key:`business:${clients.businessId}`})).status,302);
    assert.equal((await clients.other.post(`/prime/opportunities/${opp.id}/invite`,{target_key:`business:${clients.businessId}`})).status,404);
    assert.equal((await clients.other.post(`/prime/opportunities/${opp.id}/attachments/${file.id}/delete`)).status,404);
    assert.equal((await clients.prime.post(`/prime/opportunities/${opp.id}/attachments/${file.id}/delete`)).status,302);
    assert.equal((await clients.business.request(`/opportunity-attachments/${file.id}`)).status,404);
});
test('administrators create, edit and suspend members; existing tokens lose access',async()=>{
    assert.equal((await clients.admin.page('/admin/users/new')).res.status,200);
    const member={type:'business',name:'Flagship managed member',contact_name:'Test contact',email:`managed-${Date.now()}@example.invalid`,phone:'123',city:'Austin',state:'TX',status:'active',password:'Temporary-test-password'};
    assert.equal((await clients.business.post('/admin/users/new',member)).status,403);
    assert.equal((await clients.admin.post('/admin/users/new',member)).status,302);
    const [[created]]=await db.execute('SELECT * FROM businesses WHERE email=?',[member.email]);assert.ok(created);assert.notEqual(created.password_hash,member.password);
    const account=client('business',created.id);assert.equal((await account.page('/business/documents')).res.status,200);
    assert.equal((await clients.admin.page(`/admin/users/business/${created.id}/edit`)).res.status,200);
    assert.equal((await clients.admin.post(`/admin/users/business/${created.id}/edit`,{...member,status:'suspended'})).status,302);
    assert.equal((await account.page('/business/documents')).res.status,403);
    assert.equal((await account.page('/business/profile')).res.status,403);
    assert.equal((await clients.admin.post('/admin/users/new',{...member,email:'invalid'})).status,400);
});
test('Caltrans-equivalent role pages and shared services render without broken destinations',async()=>{
    for(const [role,portal,paths] of [
        ['worker','labor',['dashboard','profile','checklist','connections','messages','settings','resources','faq','saved','applications']],
        ['business','business',['dashboard','profile','checklist','connections','messages','settings','resources','faq','saved','applications','capability-statement']],
        ['prime','prime',['dashboard','profile/edit','connections','messages','settings','faq','rfq']],
        ['admin','admin',['dashboard','users','approvals','naics','resources','announcements','issues','tutorial','cms-tutorial','messages','settings','post-opportunity','applications']]
    ])for(const page of paths){const result=await clients[role].page(`/${portal}/${page}`);assert.equal(result.res.status,200,`${role} ${page}\n${serverLog}`);}
    for(const url of ['/','/login','/register','/labor','/business','/prime','/forgot-password','/api/cms/global','/api/cms/pages'])assert.equal((await fetch(base+url)).status,200,`${url}\n${serverLog}`);
    assert.equal((await clients.admin.request('/api/cms/stats')).status,200);
    assert.equal((await clients.business.request('/api/cms/stats')).status,403);
    assert.equal((await fetch(base+'/api/notifications?userId=1&userType=admin')).status,401);
});
test('saved opportunities and authenticated notifications operate for the signed-in member only',async()=>{
    const [[opp]]=await db.execute("SELECT id FROM opportunities WHERE title='Flagship prime opportunity'");
    assert.equal((await clients.business.page('/business/search')).res.status,200);
    assert.equal((await clients.business.post('/business/saved/toggle',{opportunity_id:opp.id})).status,302);
    assert.match((await clients.business.page('/business/saved')).text,/Flagship prime opportunity/);
    assert.equal((await clients.business.post('/business/saved/toggle',{opportunity_id:opp.id})).status,302);
    const [[count]]=await db.execute('SELECT COUNT(*) n FROM saved_opportunities WHERE opportunity_id=? AND user_type=? AND user_id=?',[opp.id,'business',clients.businessId]);assert.equal(count.n,0);
    const response=await clients.business.request(`/api/notifications?userId=${clients.adminId}&userType=admin`);assert.equal(response.status,200);
    const notifications=await response.json();assert.ok(notifications.every(n=>n.user_type==='business' && n.user_id===clients.businessId));
    assert.equal((await clients.business.post('/business/applications/apply',{opportunity_id:opp.id,notes:'Invalid CSRF',_csrf:'wrong'})).status,403);
});
test('expired postings archive automatically with application history intact',async()=>{
    const id='flagship-expired';
    await db.execute("INSERT INTO opportunities (id,title,scope_summary,category,category_name,status,due_date,posted_by,posted_by_type) VALUES (?,'Expired fixture','Scope','General','General','published','2020-01-01',?,'prime')",[id,clients.primeId]);
    await db.execute("INSERT INTO applications (opportunity_id,applicant_type,applicant_id,status) VALUES (?,'business',?,'submitted')",[id,clients.businessId]);
    await require('../server/services/opportunity-lifecycle').archiveExpired(db);
    const [[opp]]=await db.execute('SELECT status FROM opportunities WHERE id=?',[id]);assert.equal(opp.status,'archived');
    const [[application]]=await db.execute('SELECT status FROM applications WHERE opportunity_id=?',[id]);assert.equal(application.status,'submitted');
    assert.equal((await clients.business.post('/business/applications/apply',{opportunity_id:id,notes:'Too late'})).status,404);
    assert.equal((await clients.business.request(`/opportunities/${id}`)).status,404);
});
test('production starts with JWT_SECRET and all demo roles use isolated read-only sample data',async()=>{
    const crypto=require('node:crypto');
    const production=spawn(process.execPath,['server/index.js'],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,NODE_ENV:'production',PORT:String(port+1),DB_HOST:process.env.DB_HOST || '127.0.0.1',DB_USER:process.env.DB_USER || 'dev',DB_NAME:process.env.TEST_DB_NAME || 'evoconnect_test',JWT_SECRET:crypto.randomBytes(48).toString('hex'),SESSION_SECRET:'',EMAIL_USER:'',EMAIL_PASSWORD:''},stdio:'ignore'});
    const url=`http://127.0.0.1:${port+1}`;
    try {
        let ready=false;for(let i=0;i<100;i++){try{const r=await fetch(url+'/api/health');if((await r.json()).status==='ok'){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
        for(const [role,portal] of [['worker','labor'],['business','business'],['prime','prime'],['admin','admin']]) {
            const login=await fetch(url+`/auth/demo/${role}`,{redirect:'manual'});assert.equal(login.status,302,await login.clone().text());
            assert.equal(login.headers.get('location'),`/${portal}/dashboard`);
            const tokenCookie=login.headers.getSetCookie().find(c=>c.startsWith('evo_token='));assert.ok(tokenCookie);assert.match(tokenCookie,/Secure/);
            const cookie=tokenCookie.split(';')[0];
            const page=await fetch(url+`/${portal}/dashboard`,{headers:{cookie},redirect:'manual'});assert.equal(page.status,200,await page.clone().text());
            assert.match(await page.text(),/Demo preview/);
            const own=await fetch(url+`/${portal}/analytics`,{headers:{cookie},redirect:'manual'});assert.equal(own.status,200);
            const denied=await fetch(url+`/${portal}/documents/delete`,{method:'POST',headers:{cookie}});assert.equal(denied.status,403);
            const pages=role==='admin'?['users','opportunities','applications','messages','resources']:role==='prime'?['opportunities','applications','search/businesses','search/workers','messages','rfq','settings']:['profile','matches','applications','messages','settings','resources','faq'];
            for(const path of pages){const response=await fetch(url+`/${portal}/${path}`,{headers:{cookie},redirect:'manual'});assert.equal(response.status,200,`${role} ${path}: ${await response.clone().text()}`);}
            if(role==='admin') {
                const users=await fetch(url+'/admin/users',{headers:{cookie}});assert.equal(users.status,200);
                assert.doesNotMatch(await users.text(),/flagship-other@example.invalid|managed-\d+@example.invalid/);
                assert.equal((await fetch(url+'/api/cms/stats',{headers:{cookie}})).status,403);
            }
            const passwordLogin=await fetch(url+'/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:`demo-${role==='worker'?'labor':role}@evoconnect.io`,password:'DemoPass1!'})});
            assert.equal(passwordLogin.status,302);assert.equal(passwordLogin.headers.get('location'),`/${portal}/dashboard`);
        }
        const regularPassword='Regular-sign-in-test-only';
        const regularHash=await require('bcryptjs').hash(regularPassword,10);
        await db.execute("INSERT INTO businesses (company_name,contact_name,email,password_hash,phone,status) VALUES ('Live login fixture','Real member','live-login-probe@example.invalid',?,'123','active') ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash)",[regularHash]);
        const regularLogin=await fetch(url+'/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'live-login-probe@example.invalid',password:regularPassword})});
        assert.equal(regularLogin.headers.get('location'),'/business/dashboard');
        const regularCookie=regularLogin.headers.getSetCookie().find(c=>c.startsWith('evo_token=')).split(';')[0];
        const regularDashboard=await fetch(url+'/business/dashboard',{headers:{cookie:regularCookie}});
        const regularHtml=await regularDashboard.text();assert.match(regularHtml,/Live login fixture/);assert.doesNotMatch(regularHtml,/Demo preview/);
        const badPassword=await fetch(url+'/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'demo-admin@evoconnect.io',password:'wrong'})});
        assert.equal(badPassword.headers.get('location'),'/login');assert.ok(!badPassword.headers.getSetCookie().some(c=>c.startsWith('evo_token=')));
        assert.equal((await fetch(url+'/api/cms/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'arbitrary-admin@example.invalid',password:'DemoPass1!'})})).status,401);
    } finally {production.kill();await new Promise(r=>production.once('exit',r));}
});
test('NAICS auto-match refreshes for code edits and publication changes, with no cross-role access',async()=>{
    const insert=async(id,codes,status='published',due='2099-01-01')=>db.execute("INSERT INTO opportunities (id,title,scope_summary,category,category_name,district_name,status,due_date,naics_codes,posted_by,posted_by_type) VALUES (?,?, 'Matched work','Construction','Construction','Texas',?,?,?,?, 'prime')",[id,`Auto ${id}`,status,due,codes,clients.primeId]);
    await db.execute("DELETE FROM opportunities WHERE id LIKE 'auto-test-%'");
    await db.execute("UPDATE businesses SET naics_codes='[237130]' WHERE id=?",[clients.businessId]);
    await insert('auto-test-full','237130');
    await insert('auto-test-partial','["237130","238210"]');
    await insert('auto-test-prefix','["23713"]');
    await insert('auto-test-draft','["237130"]','draft');
    await insert('auto-test-expired','["237130"]','published','2020-01-01');
    let page=await clients.business.page('/business/matches');assert.equal(page.res.status,200);
    assert.ok(page.text.indexOf('Auto auto-test-full')<page.text.indexOf('Auto auto-test-partial'));
    assert.match(page.text,/100% code coverage/);assert.match(page.text,/50% code coverage/);
    for(const hidden of ['prefix','draft','expired'])assert.ok(!page.text.includes(`Auto auto-test-${hidden}`));
    assert.match((await clients.business.page('/business/dashboard')).text,/Auto auto-test-full/);
    assert.equal((await clients.worker.page('/business/matches')).res.status,403);
    assert.equal((await clients.prime.page('/business/matches')).res.status,403);
    await clients.worker.page('/labor/matches');
    assert.equal((await clients.worker.post('/labor/matches/codes',{naics_codes:'237130'})).status,302);
    assert.match((await clients.worker.page('/labor/matches')).text,/Auto auto-test-full/);
    const partners=await clients.prime.page('/prime/opportunities/auto-test-full/matches');
    assert.match(partners.text,new RegExp(`/directory/worker/${clients.workerId}`));
    assert.match(partners.text,new RegExp(`/directory/business/${clients.businessId}`));
    assert.equal((await clients.worker.post('/labor/matches/codes',{naics_codes:'not-a-code'})).status,400);
    assert.equal((await clients.worker.post('/labor/matches/codes',{naics_codes:'999999'})).status,400);
    assert.equal((await clients.worker.post('/labor/matches/codes',{naics_codes:'237130',_csrf:'wrong'})).status,403);
    await db.execute("UPDATE businesses SET naics_codes='[]' WHERE id=?",[clients.businessId]);
    page=await clients.business.page('/business/matches');assert.doesNotMatch(page.text,/Auto auto-test-full/);assert.match(page.text,/enable automatic matching/);
    await db.execute("UPDATE businesses SET naics_codes='[\"237130\"]' WHERE id=?",[clients.businessId]);
    await db.execute("UPDATE opportunities SET status='closed' WHERE id='auto-test-full'");
    assert.doesNotMatch((await clients.business.page('/business/matches')).text,/Auto auto-test-full/);
    await clients.worker.post('/labor/matches/codes',{naics_codes:''});
    assert.match((await clients.worker.page('/labor/matches')).text,/enable automatic matching/);
    await db.execute("DELETE FROM opportunities WHERE id LIKE 'auto-test-%'");
});
test('FAQs are public, discoverable, and readable through every dashboard route',async()=>{
    for(const path of ['/faq','/faq.html','/labor/faq','/business/faq','/prime/faq']) {
        const response=await fetch(base+path,{redirect:'manual'});assert.equal(response.status,200,path);
        const html=await response.text();assert.match(html,/class="faq-question"/);assert.match(html,/class="faq-answer"/);assert.match(html,/\/css\/faq\.css/);
    }
    const publicHtml=await(await fetch(base+'/faq')).text();
    for(const group of ['faq-labor','faq-business','faq-prime'])assert.ok(publicHtml.includes(`id="${group}"`));
    const homepage=await(await fetch(base+'/')).text();assert.match(homepage,/href="\/faq"/);
    for(const [role,portal] of [['worker','labor'],['business','business'],['prime','prime']]) {
        const page=await clients[role].page(`/${portal}/faq`);assert.equal(page.res.status,200);assert.match(page.text,/sidebar-nav/);assert.match(page.text,/\/css\/faq\.css/);
    }
    const admin=await clients.admin.page('/faq');assert.equal(admin.res.status,200);assert.match(admin.text,/Help &amp; FAQ/);
});
test('configured real admins are created alongside existing admins and use the same portal/CMS password',async()=>{
    const provision=require('../server/services/provision-admin');
    const email=`provisioned-${Date.now()}@example.invalid`, password='Provisioning-test-password';
    const result=await provision(db,{email,password});assert.equal(result.created,true);
    const rerun=await provision(db,{email,password:'Different-bootstrap-password'});assert.equal(rerun.created,false);assert.equal(rerun.id,result.id);
    const portalLogin=async pwd=>fetch(base+'/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email,password:pwd})});
    const portal=await portalLogin(password);assert.equal(portal.headers.get('location'),'/admin/dashboard');
    const cms=await fetch(base+'/api/cms/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});assert.equal(cms.status,200);
    const {token}=await cms.json();assert.ok(token);
    assert.equal((await fetch(base+'/api/cms/stats',{headers:{authorization:`Bearer ${token}`}})).status,200);
    const changedPassword='New-administrator-test-password';
    const changed=await fetch(base+'/api/cms/change-password',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({currentPassword:password,newPassword:changedPassword})});assert.equal(changed.status,200);
    assert.equal((await portalLogin(changedPassword)).headers.get('location'),'/admin/dashboard');
    const old=await fetch(base+'/api/cms/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});assert.equal(old.status,401);
    await provision(db,{email,password,resetPassword:true});
    assert.equal((await portalLogin(password)).headers.get('location'),'/admin/dashboard');
});
test('legacy CMS password and account password both reach the admin dashboard, even with a duplicate role email',async()=>{
    const email=`shared-admin-${Date.now()}@example.invalid`;
    const accountPassword='Real-admin-account-test-password',workerPassword='Separate-worker-test-password';
    const hash=await require('bcryptjs').hash(accountPassword,10);
    const [admin]=await db.execute('INSERT INTO admins (email,password_hash,name) VALUES (?,?,?)',[email,hash,'Unified sign-in admin']);
    await db.execute("INSERT INTO workers (full_name,email,password_hash,phone,trade_category,status) VALUES ('Duplicate worker',?,?,'123','general','active')",[email,await require('bcryptjs').hash(workerPassword,10)]);
    const post=async(password)=>fetch(base+'/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email,password})});
    for(const password of [accountPassword,'Legacy-cms-fixture-secret']) {
        const login=await post(password);assert.equal(login.headers.get('location'),'/admin/dashboard');
        const cookie=login.headers.getSetCookie().find(c=>c.startsWith('evo_token=')).split(';')[0];
        const dashboard=await fetch(base+'/admin/dashboard',{headers:{cookie},redirect:'manual'});assert.equal(dashboard.status,200);
        const cms=await fetch(base+'/api/cms/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});assert.equal(cms.status,200);
        const cmsCookie=cms.headers.getSetCookie().find(c=>c.startsWith('evo_token='));assert.ok(cmsCookie);
        assert.equal((await fetch(base+'/admin/dashboard',{headers:{cookie:cmsCookie.split(';')[0]},redirect:'manual'})).status,200);
        const {token}=await cms.json();
        const restored=await fetch(base+'/api/cms/session',{method:'POST',headers:{authorization:`Bearer ${token}`}});assert.equal(restored.status,200);assert.ok(restored.headers.getSetCookie().some(c=>c.startsWith('evo_token=')));
    }
    assert.equal((await post(workerPassword)).headers.get('location'),'/labor/dashboard');
    const bad=await post('incorrect-password');assert.equal(bad.headers.get('location'),'/login');assert.ok(!bad.headers.getSetCookie().some(c=>c.startsWith('evo_token=')));
    const missing=signToken({id:admin.insertId+100000,email,type:'admin'});
    const orphan=await fetch(base+'/api/cms/session',{method:'POST',headers:{authorization:`Bearer ${missing}`}});assert.equal(orphan.status,401);
});

test('dashboard admin sessions open CMS without a separate login; other roles cannot',async()=>{
    const [[admin]]=await db.execute('SELECT id,email FROM admins WHERE id=?',[clients.adminId]);
    const cookie=`evo_token=${signToken({...admin,type:'admin'})}`;
    const response=await fetch(base+'/api/cms/session',{method:'POST',headers:{cookie}});assert.equal(response.status,200);
    const session=await response.json();assert.ok(session.token);assert.equal(session.success,true);assert.ok(session.email);
    assert.equal((await fetch(base+'/api/cms/stats',{headers:{authorization:`Bearer ${session.token}`}})).status,200);
    assert.equal((await clients.business.request('/api/cms/session',{method:'POST'})).status,403);
    assert.equal((await fetch(base+'/api/cms/session',{method:'POST'})).status,401);
});
test('CMS FAQ edits, rich text, visibility, categories, order and deletion sync to public and dashboard pages',async()=>{
    const api=async(method,path,body)=>clients.admin.request('/api/cms'+path,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const initial=await api('GET','/faqs');assert.equal(initial.status,200);assert.ok((await initial.json()).length);
    assert.equal((await clients.business.request('/api/cms/faqs')).status,403);
    assert.equal((await fetch(base+'/api/cms/faqs')).status,401);
    const payload={category:'General',question:'CMS sync fixture question',answer:'<p>CMS edited <strong>answer</strong>.</p><script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(1)">Link</a>',status:'active'};
    const created=await api('POST','/faqs',payload);assert.equal(created.status,201);const {id}=await created.json();
    for(const path of ['/faq','/labor/faq','/business/faq','/prime/faq']){const html=await(await fetch(base+path)).text();assert.match(html,/CMS sync fixture question/);assert.match(html,/<strong>answer<\/strong>/);assert.doesNotMatch(html,/javascript:alert|onclick="alert|<script>alert/);}
    assert.equal((await api('PUT',`/faqs/${id}`,{...payload,status:'inactive'})).status,200);
    assert.doesNotMatch(await(await fetch(base+'/faq')).text(),/CMS sync fixture question/);
    assert.ok((await(await api('GET','/faqs')).json()).some(row=>row.id===id && row.status==='inactive'));
    assert.ok(!(await(await fetch(base+'/api/cms/faqs/export')).json()).some(row=>row.id===id));
    assert.equal((await api('PUT',`/faqs/${id}`,{...payload,category:'For workers',status:'active'})).status,200);
    assert.match(await(await fetch(base+'/labor/faq')).text(),/CMS sync fixture question/);assert.doesNotMatch(await(await fetch(base+'/business/faq')).text(),/CMS sync fixture question/);
    assert.ok((await(await api('GET','/faq-categories')).json()).includes('For workers'));
    const second=await api('POST','/faqs',{...payload,category:'For workers',question:'CMS second fixture question'});const {id:secondId}=await second.json();
    assert.equal((await api('POST','/faqs/reorder',{updates:[{id,sort_order:50},{id:secondId,sort_order:0}]})).status,200);
    const ordered=await(await fetch(base+'/labor/faq')).text();assert.ok(ordered.indexOf('CMS second fixture question')<ordered.indexOf('CMS sync fixture question'));
    assert.equal((await api('POST','/faqs/reorder',{updates:[{id,sort_order:-1}]})).status,400);
    assert.equal((await api('POST','/faqs',{...payload,answer:'<script>bad()</script>'})).status,400);
    assert.equal((await api('DELETE',`/faqs/${id}`)).status,200);assert.equal((await api('DELETE',`/faqs/${secondId}`)).status,200);
    assert.doesNotMatch(await(await fetch(base+'/faq')).text(),/CMS sync fixture question|CMS second fixture question/);
    const [rows]=await db.execute('SELECT COUNT(*) n FROM cms_faqs');assert.equal((await(await api('GET','/stats')).json()).faqs,rows[0].n);
});
test('FAQ seeding is one-time and does not restore intentionally removed content',async()=>{
    const [original]=await db.execute('SELECT * FROM cms_faqs');
    try {
        await db.execute('DELETE FROM cms_faqs');await require('../server/services/faqs').migrate({execute:(...args)=>db.execute(...args),getConnection:async()=>new Proxy(db,{get(target,key){if(key==='release')return ()=>{};const value=target[key];return typeof value==='function'?value.bind(target):value;}})});
        const [[count]]=await db.execute('SELECT COUNT(*) n FROM cms_faqs');assert.equal(count.n,0);
        assert.match(await(await fetch(base+'/faq')).text(),/No published FAQs/);
    }finally{for(const row of original)await db.execute('INSERT INTO cms_faqs (id,category,question,answer,sort_order,status) VALUES (?,?,?,?,?,?)',[row.id,row.category,row.question,row.answer,row.sort_order,row.status]);}
});
test('CMS Admin Accounts returns JSON, supports account management and revokes deleted accounts',async()=>{
    const api=async(method,path='',body)=>clients.admin.request('/api/admin/users'+path,{method,headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const list=await api('GET');assert.equal(list.status,200);assert.match(list.headers.get('content-type'),/application\/json/);const rows=await list.json();assert.ok(rows.length);assert.ok(rows.every(row=>!('password_hash' in row)));
    assert.equal((await clients.business.request('/api/admin/users')).status,403);
    const anonymous=await fetch(base+'/api/admin/users');assert.equal(anonymous.status,401);assert.match(anonymous.headers.get('content-type'),/application\/json/);
    const email=`cms-created-${Date.now()}@example.invalid`,password='CMS-created-admin-password';
    const added=await api('POST','',{email,password,organization_name:'CMS Admin Fixture',type:'admin'});assert.equal(added.status,201);const {id}=await added.json();
    assert.equal((await api('POST','',{email,password,organization_name:'Duplicate',type:'admin'})).status,409);
    const logged=await fetch(base+'/api/cms/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});assert.equal(logged.status,200);const {token}=await logged.json();
    assert.equal((await api('PUT',`/${id}`,{email,organization_name:'Updated CMS Admin',type:'admin'})).status,200);
    assert.equal((await api('DELETE',`/${clients.adminId}`)).status,409);
    assert.equal((await api('DELETE',`/${id}`)).status,200);
    assert.equal((await fetch(base+'/api/cms/stats',{headers:{authorization:`Bearer ${token}`}})).status,401);
    assert.equal((await fetch(base+'/admin/dashboard',{headers:{authorization:`Bearer ${token}`},redirect:'manual'})).status,302);
});
test('business and labor directories render real profile cards with qualifications and statement links',async()=>{
    await clients.business.page('/business/documents');assert.equal((await clients.business.upload('business',pdf,'directory-statement.pdf')).status,302);
    const [[document]]=await db.execute("SELECT id FROM capability_documents WHERE owner_type='business' AND owner_id=?",[clients.businessId]);
    const business=await clients.prime.page('/prime/search/businesses');assert.equal(business.res.status,200);
    assert.match(business.text,/directory-profile-card/);assert.match(business.text,/Profile completeness/);assert.match(business.text,new RegExp(`/directory/business/${clients.businessId}`));assert.match(business.text,new RegExp(`/capabilities/${document.id}`));
    const workers=await clients.prime.page('/prime/search/workers');assert.equal(workers.res.status,200);assert.match(workers.text,/directory-profile-card/);assert.match(workers.text,new RegExp(`/directory/worker/${clients.workerId}`));assert.match(workers.text,/Request a connection/);
    assert.doesNotMatch(business.text,/<form method="POST" action="\/prime\/connect\/business/);
    assert.match(business.text,/action="\/prime\/connect"/);
    const naicsFiltered=await clients.prime.page('/prime/search/businesses?naics=999999');assert.doesNotMatch(naicsFiltered.text,/<article class="directory-profile-card"/);
    const certFiltered=await clients.prime.page('/prime/search/businesses?cert=dbe');assert.match(certFiltered.text,/directory-profile-card/);
    const empty=await clients.prime.page('/prime/search/businesses?state=ZZ');assert.equal(empty.res.status,200);assert.doesNotMatch(empty.text,/<article class="directory-profile-card"/);
    const filtered=await clients.prime.page('/prime/search/workers?state=ZZ');assert.equal(filtered.res.status,200);assert.doesNotMatch(filtered.text,/<article class="directory-profile-card"/);
});
