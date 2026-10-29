'use strict';
const fs=require('fs/promises');
const path=require('path');
const roots={
    resumes:()=>path.join(__dirname,'../../uploads/resumes'),
    capabilities:()=>path.resolve(process.env.CAPABILITY_STORAGE_DIR || path.join(__dirname,'../../../evoconnect-private/capabilities')),
    media:()=>path.join(__dirname,'../../uploads/cms-media')
};
function validate(group,key){
    if(!roots[group] || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(key))throw new Error('Invalid storage key.');
}
module.exports={
    async put(group,key,buffer,metadata={}){
        validate(group,key);
        await fs.mkdir(roots[group](),{recursive:true,mode:0o700});
        await fs.writeFile(path.join(roots[group](),key),buffer,{mode:0o600});
        if(group==='media')await fs.writeFile(path.join(roots[group](),key+'.meta.json'),JSON.stringify(metadata));
    },
    async get(group,key){
        validate(group,key);
        try{
            const buffer=await fs.readFile(path.join(roots[group](),key));
            let metadata={};
            if(group==='media')try{metadata=JSON.parse(await fs.readFile(path.join(roots[group](),key+'.meta.json'),'utf8'));}catch(err){if(err.code!=='ENOENT')throw err;}
            return {buffer,metadata};
        }catch(err){if(err.code==='ENOENT')return null;throw err;}
    },
    async stat(group,key){
        validate(group,key);
        try{
            const info=await fs.stat(path.join(roots[group](),key));let metadata={};
            if(group==='media')try{metadata=JSON.parse(await fs.readFile(path.join(roots[group](),key+'.meta.json'),'utf8'));}catch(err){if(err.code!=='ENOENT')throw err;}
            return {metadata,size:info.size};
        }catch(err){if(err.code==='ENOENT')return null;throw err;}
    },
    async remove(group,key){
        validate(group,key);
        await fs.rm(path.join(roots[group](),key),{force:true});
        if(group==='media')await fs.rm(path.join(roots[group](),key+'.meta.json'),{force:true});
    },
    async list(group){
        if(!roots[group])throw new Error('Invalid storage group.');
        try{return (await fs.readdir(roots[group]())).filter(f=>!f.endsWith('.meta.json'));}
        catch(err){if(err.code==='ENOENT')return [];throw err;}
    }
};
