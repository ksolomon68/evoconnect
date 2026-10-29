'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fork,spawn}=require('node:child_process');
const {once}=require('node:events');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const mysql=require('mysql2/promise');
const {BlobsServer}=require('@netlify/blobs/server');
const jwt=require('jsonwebtoken');

test('managed MySQL config uses provider port and verified TLS without exposing credentials',()=>{
    const config=require('../server/services/database-config')({DB_HOST:'mysql.example.invalid',DB_PORT:'12345',DB_NAME:'defaultdb',DB_USER:'test',DB_PASSWORD:' test password ',DB_SSL:'true',DB_SSL_CA:'line1\\nline2'});
    assert.equal(config.port,12345);assert.equal(config.ssl.rejectUnauthorized,true);assert.equal(config.ssl.ca,'line1\nline2');assert.equal(config.password,' test password ');
});

test('native Netlify requests retain sessions, CMS edits, media and private PDFs across cold instances',async()=>{
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'evo-blobs-'));
    const blobs=new BlobsServer({directory,token:'local-test-token',logger:()=>{}});
    const address=await blobs.start();
    const database='evoconnect_netlify_test';
    const cfg=require('../server/services/database-config')({...process.env,DB_HOST:process.env.DB_HOST||'127.0.0.1',DB_USER:process.env.DB_USER||'dev',DB_NAME:database});
    let setup,db;const workers=[];
    const env={...process.env,DB_HOST:cfg.host,DB_PORT:String(cfg.port),DB_USER:cfg.user,DB_PASSWORD:cfg.password,DB_NAME:database,NODE_ENV:'production',...(process.env.TEST_FUNCTION_ROOT?{LAMBDA_TASK_ROOT:process.env.TEST_FUNCTION_ROOT}:{}),JWT_SECRET:'local-netlify-test-only-random-secret',ADMIN_EMAIL:'netlify-admin@example.invalid',ADMIN_DEFAULT_PASSWORD:'Local-Netlify-Test-Only-Password',EMAIL_USER:'',EMAIL_PASSWORD:'',TEST_BLOBS_URL:`http://127.0.0.1:${address.port}`};
    try {
        setup=await mysql.createConnection({...cfg,database:undefined});
        await setup.execute(`CREATE DATABASE \`${database}\``);
        const migrate=spawn(process.execPath,['scripts/migrate-database.js'],{cwd:path.join(__dirname,'..'),env,stdio:['ignore','pipe','pipe']});
        let log='';migrate.stdout.on('data',v=>log+=v);migrate.stderr.on('data',v=>log+=v);
        assert.equal((await once(migrate,'exit'))[0],0,log);
        db=await mysql.createConnection(cfg);
        const [[admin]]=await db.execute('SELECT id FROM admins WHERE email=?',[env.ADMIN_EMAIL]);
        const token=jwt.sign({id:admin.id,type:'admin',email:env.ADMIN_EMAIL,name:'Test Admin'},env.JWT_SECRET);
        const cookie=new Map();
        function start(){const child=fork(path.join(__dirname,'helpers/netlify-worker.cjs'),{env,stdio:['ignore','pipe','pipe','ipc']});workers.push(child);return child;}
        let worker=start();
        async function request(url,options={}){
            const headers={cookie:[...cookie].map(([k,v])=>`${k}=${v}`).join('; '),...options.headers};
            const pending=once(worker,'message');worker.send({url,...options,headers});const [result]=await pending;
            assert.equal(result.error,undefined,result.error);
            for(const entry of result.cookies){const [pair]=entry.split(';');const i=pair.indexOf('=');cookie.set(pair.slice(0,i),pair.slice(i+1));}
            return {...result,text:Buffer.from(result.body,'base64').toString('utf8')};
        }
        const home=await request('/');assert.equal(home.status,200);assert.match(home.text,/EVOConnect/i);
        assert.equal((await request('/login')).status,200);
        assert.equal((await request('/.netlify/functions/app/login')).status,200);
        cookie.set('evo_token',token);
        const login=await request('/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:Buffer.from(new URLSearchParams({email:env.ADMIN_EMAIL,password:env.ADMIN_DEFAULT_PASSWORD,userType:'admin'}).toString()).toString('base64')});assert.equal(login.status,302,login.text);assert.equal(login.headers.location,'/admin/dashboard');
        const page=await request('/admin/documents');assert.equal(page.status,200);assert.match(page.text,/4 MB/);
        const csrf=page.text.match(/name="_csrf" value="([^"]+)"/)[1];assert.ok(cookie.has('connect.sid'));
        const put=await request('/api/cms/global',{method:'PUT',headers:{'content-type':'application/json'},body:Buffer.from(JSON.stringify({netlifyPersistenceTest:'saved in MySQL'})).toString('base64')});assert.equal(put.status,200,put.text);
        const createdPage=await request('/api/cms/pages',{method:'POST',headers:{'content-type':'application/json'},body:Buffer.from(JSON.stringify({slug:'netlify-persistence',meta:{title:'Persistent custom page'},sections:[]})).toString('base64')});assert.equal(createdPage.status,201,createdPage.text);
        const pdf=Buffer.from('%PDF-1.4\nserverless-test\n%%EOF\n');
        async function multipart(url,fields,name,bytes,filename,mime){
            const form=new FormData();for(const [key,value]of Object.entries(fields))form.set(key,value);form.set(name,new Blob([bytes],{type:mime}),filename);
            const req=new Request('https://evo-test.netlify.app'+url,{method:'POST',body:form});
            return request(url,{method:'POST',headers:{'content-type':req.headers.get('content-type')},body:Buffer.from(await req.arrayBuffer()).toString('base64')});
        }
        const upload=await multipart('/admin/documents',{_csrf:csrf},'statement',pdf,'serverless.pdf','application/pdf');assert.equal(upload.status,302,upload.text);
        const media=await multipart('/api/cms/media',{altText:'Persistent test image'},'image',Buffer.from('test-image-bytes'),'persist.png','image/png');assert.equal(media.status,201,media.text);const image=JSON.parse(media.text);
        const [labor]=await db.execute("INSERT INTO workers (full_name,email,password_hash,phone,trade_category,status) VALUES ('Netlify Worker','netlify-worker@example.invalid','unused','0','electrical','active')");
        const adminToken=cookie.get('evo_token');cookie.set('evo_token',jwt.sign({id:labor.insertId,type:'worker',email:'netlify-worker@example.invalid'},env.JWT_SECRET));
        const resume=await multipart('/labor/profile/section',{section:'resume'},'resume',pdf,'resume.pdf','application/pdf');assert.equal(resume.status,302,resume.text);
        const [[laborRow]]=await db.execute('SELECT resume_path FROM workers WHERE id=?',[labor.insertId]);assert.ok(laborRow.resume_path);
        cookie.set('evo_token',adminToken);
        worker.kill();await once(worker,'exit');worker=start();
        const restored=await request('/admin/documents');assert.equal(restored.status,200);assert.match(restored.text,/serverless.pdf/);assert.match(restored.text,new RegExp(csrf));
        assert.equal(JSON.parse((await request('/api/cms/global')).text).netlifyPersistenceTest,'saved in MySQL');
        assert.equal(JSON.parse((await request('/api/cms/pages/netlify-persistence')).text).meta.title,'Persistent custom page');
        const customPage=await request('/pages/netlify-persistence');assert.equal(customPage.status,200);assert.match(customPage.text,/Persistent custom page/);assert.equal((await request('/pages/netlify-persistence.html')).status,200);
        assert.equal((await request('/api/cms/pages/home')).status,200);
        assert.equal((await request('/api/cms/pages/netlify-persistence',{method:'DELETE'})).status,200);
        assert.equal((await request('/api/cms/pages/netlify-persistence')).status,404);
        assert.doesNotMatch((await request('/api/cms/pages')).text,/netlify-persistence/);
        const [[doc]]=await db.execute("SELECT id FROM capability_documents WHERE owner_type='admin' AND owner_id=?",[admin.id]);
        const download=await request('/capabilities/'+doc.id+'?download=1');assert.equal(download.status,200);assert.equal(Buffer.from(download.body,'base64').compare(pdf),0);
        const resumeGet=await request('/uploads/resumes/'+path.basename(laborRow.resume_path));assert.equal(resumeGet.status,200);assert.equal(Buffer.from(resumeGet.body,'base64').compare(pdf),0);
        const [[rate]]=await db.execute('SELECT hits FROM app_rate_limits LIMIT 1');assert.equal(rate.hits,1);
        const mediaGet=await request(image.url);assert.equal(mediaGet.status,200);assert.equal(mediaGet.text,'test-image-bytes');
        assert.match((await request('/api/cms/media')).text,/Persistent test image/);
        const badCsrf=await multipart('/admin/documents',{_csrf:'wrong'},'statement',pdf,'bad.pdf','application/pdf');assert.equal(badCsrf.status,403);
        const formPage=await request('/admin/post-opportunity');assert.equal(formPage.status,200);assert.match(formPage.text,/name="title"/);
        const anonymousCookie=cookie.get('evo_token');cookie.delete('evo_token');assert.equal((await request('/capabilities/'+doc.id)).status,302);cookie.set('evo_token',anonymousCookie);
        const remove=await request('/api/cms/media/'+image.filename,{method:'DELETE'});assert.equal(remove.status,200);assert.equal((await request(image.url)).status,404);
        assert.equal((await request('/api/health')).status,200);
    }finally{
        for(const worker of workers)if(worker.exitCode===null && !worker.killed){worker.kill();await once(worker,'exit');}
        if(db)await db.end();if(setup){await setup.execute(`DROP DATABASE IF EXISTS \`${database}\``);await setup.end();}await blobs.stop();await fs.rm(directory,{recursive:true,force:true});
    }
});
