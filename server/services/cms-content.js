'use strict';
const fs=require('fs/promises');
const path=require('path');
const {getDb}=require('../database');
const execute=(sql,args)=>require('./demo-context').live(()=>getDb().execute(sql,args));
const root=path.join(require('./app-root'),'content');
function key(file){
    const relative=path.relative(root,file).split(path.sep).join('/');
    if(relative!=='global.json' && !/^pages\/[a-z0-9][a-z0-9-]{0,79}\.json$/.test(relative))throw new Error('Invalid content key.');
    return relative;
}
async function read(file){
    if(path.dirname(file)===path.join(root,'schemas'))return JSON.parse(await fs.readFile(file,'utf8'));
    const contentKey=key(file);
    const [rows]=await execute('SELECT data,deleted FROM cms_content WHERE content_key=?',[contentKey]);
    if(rows.length)return rows[0].deleted?null:JSON.parse(rows[0].data);
    let data;
    try{data=JSON.parse(await fs.readFile(file,'utf8'));}catch(err){if(err.code==='ENOENT')return null;throw err;}
    await execute('INSERT IGNORE INTO cms_content (content_key,data) VALUES (?,?)',[contentKey,JSON.stringify(data)]);
    return read(file);
}
module.exports={read,
    async write(file,data){await execute('INSERT INTO cms_content (content_key,data,deleted) VALUES (?,?,FALSE) ON DUPLICATE KEY UPDATE data=VALUES(data),deleted=FALSE',[key(file),JSON.stringify(data)]);},
    async remove(file){await execute('INSERT INTO cms_content (content_key,data,deleted) VALUES (?,NULL,TRUE) ON DUPLICATE KEY UPDATE data=NULL,deleted=TRUE',[key(file)]);},
    async pages(){
        const files=new Set((await fs.readdir(path.join(root,'pages'))).filter(f=>f.endsWith('.json')));
        const [rows]=await execute("SELECT content_key FROM cms_content WHERE content_key LIKE 'pages/%'");
        for(const row of rows)files.add(row.content_key.slice(6));
        const pages=await Promise.all([...files].map(async file=>({file,data:await read(path.join(root,'pages',file))})));
        return pages.filter(p=>p.data);
    }
};
