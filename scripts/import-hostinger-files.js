'use strict';
// Run only after importing the SQL dump and running migrate:db against the new database.
require('dotenv').config();
process.env.EVO_SERVERLESS='true';
process.env.FILE_STORAGE='netlify';
const fs=require('fs/promises');
const path=require('path');
const {getDb}=require('../server/database');
const storage=require('../server/services/file-storage');
const content=require('../server/services/cms-content');
(async()=>{
    const sourceArgument=process.argv.indexOf('--source');
    if(sourceArgument<0 || !process.argv[sourceArgument+1])throw new Error('Use --source /absolute/path/to/hostinger-export');
    if(!process.env.NETLIFY_SITE_ID || !process.env.NETLIFY_AUTH_TOKEN)throw new Error('Set NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN locally for the file import.');
    const source=path.resolve(process.argv[sourceArgument+1]),db=getDb(),pending=[];
    for(const table of ['capability_documents','opportunity_attachments']){
        const [rows]=await db.execute(`SELECT storage_name FROM ${table}`);
        for(const row of rows)pending.push({group:'capabilities',key:row.storage_name,file:path.join(source,'capabilities',path.basename(row.storage_name))});
    }
    const [workers]=await db.execute("SELECT resume_path FROM workers WHERE resume_path IS NOT NULL AND resume_path<>''");
    for(const worker of workers)pending.push({group:'resumes',key:path.basename(worker.resume_path),file:path.join(source,'uploads/resumes',path.basename(worker.resume_path))});
    const mediaDir=path.join(source,'uploads/cms-media');
    try{
        for(const key of await fs.readdir(mediaDir))if(/\.(jpe?g|png|gif|webp|svg)$/i.test(key)){
            let metadata={};try{metadata=JSON.parse(await fs.readFile(path.join(mediaDir,key+'.meta.json'),'utf8'));}catch(err){if(err.code!=='ENOENT')throw err;}
            const types={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml'};
            metadata.size=(await fs.stat(path.join(mediaDir,key))).size;
            metadata.mimeType ||=types[path.extname(key).toLowerCase()];pending.push({group:'media',key,file:path.join(mediaDir,key),metadata});
        }
    }catch(err){if(err.code!=='ENOENT')throw err;}
    // Validate the complete set first; never report success with missing or unsupported files.
    const problems=[];
    for(const item of pending){
        try{const info=await fs.stat(item.file);if(info.size>4*1024*1024)problems.push(`${item.group}/${item.key}: exceeds the 4 MB serverless transfer limit; compress or replace before migration.`);}
        catch(err){if(err.code==='ENOENT')problems.push(`${item.group}/${item.key}: missing from export.`);else throw err;}
    }
    if(problems.length)throw new Error('File import validation failed:\n'+problems.join('\n'));
    for(const item of pending)await storage.put(item.group,item.key,await fs.readFile(item.file),item.metadata||{});
    let pages=0;
    const contentSource=path.join(source,'content');
    try{
        const global=await fs.readFile(path.join(contentSource,'global.json'),'utf8');await content.write(path.join(__dirname,'../content/global.json'),JSON.parse(global));
        for(const file of await fs.readdir(path.join(contentSource,'pages')))if(/^[a-z0-9][a-z0-9-]{0,79}\.json$/.test(file)){
            await content.write(path.join(__dirname,'../content/pages',file),JSON.parse(await fs.readFile(path.join(contentSource,'pages',file),'utf8')));pages++;
        }
    }catch(err){throw new Error(`CMS export is incomplete or invalid (${err.code || err.name}). Include content/global.json and content/pages/.`);}
    console.log(`Imported ${pending.length} file references and ${pages} CMS pages into the new services.`);
    process.exit(0);
})().catch(err=>{console.error(err.message);process.exit(1);});
