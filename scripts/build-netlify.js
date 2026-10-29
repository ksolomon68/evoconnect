'use strict';
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
const destination=path.join(root,'dist/netlify');
fs.rmSync(destination,{recursive:true,force:true});fs.mkdirSync(destination,{recursive:true});
// Only public assets go to the CDN. HTML, content, credentials, and uploads go through Express.
for(const name of ['css','js','images','assets']){
    const source=path.join(root,name);
    if(fs.existsSync(source))fs.cpSync(source,path.join(destination,name),{recursive:true});
}
if(fs.existsSync(path.join(root,'public')))fs.cpSync(path.join(root,'public'),destination,{recursive:true,filter:source=>!source.endsWith('.html')});
for(const name of ['manifest.json'])if(fs.existsSync(path.join(root,name)))fs.copyFileSync(path.join(root,name),path.join(destination,name));
console.log('Netlify public assets prepared. Application routes are handled by the Express function.');
