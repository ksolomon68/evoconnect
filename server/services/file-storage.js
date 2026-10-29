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
function store(){
    const {getStore}=require('@netlify/blobs');
    return getStore({name:'evoconnect-files',consistency:'strong',
        ...(process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN ? {siteID:process.env.NETLIFY_SITE_ID,token:process.env.NETLIFY_AUTH_TOKEN} : {})});
}
const remote=()=>process.env.FILE_STORAGE==='netlify';
module.exports={
    async put(group,key,buffer,metadata={}){
        validate(group,key);
        if(remote())return store().set(`${group}/${key}`,new Uint8Array(buffer).buffer,{metadata});
        await fs.mkdir(roots[group](),{recursive:true,mode:0o700});
        await fs.writeFile(path.join(roots[group](),key),buffer,{mode:0o600});
        if(group==='media')await fs.writeFile(path.join(roots[group](),key+'.meta.json'),JSON.stringify(metadata));
    },
    async get(group,key){
        validate(group,key);
        if(remote()){
            const result=await store().getWithMetadata(`${group}/${key}`,{type:'arrayBuffer'});
            return result?{buffer:Buffer.from(result.data),metadata:result.metadata}:null;
        }
        try{
            const buffer=await fs.readFile(path.join(roots[group](),key));
            let metadata={};
            if(group==='media')try{metadata=JSON.parse(await fs.readFile(path.join(roots[group](),key+'.meta.json'),'utf8'));}catch(err){if(err.code!=='ENOENT')throw err;}
            return {buffer,metadata};
        }catch(err){if(err.code==='ENOENT')return null;throw err;}
    },
    async stat(group,key){
        validate(group,key);
        if(remote()){
            const entry=await store().getMetadata(`${group}/${key}`);
            return entry?{metadata:entry.metadata,size:Number(entry.metadata.size || 0)}:null;
        }
        try{
            const info=await fs.stat(path.join(roots[group](),key));let metadata={};
            if(group==='media')try{metadata=JSON.parse(await fs.readFile(path.join(roots[group](),key+'.meta.json'),'utf8'));}catch(err){if(err.code!=='ENOENT')throw err;}
            return {metadata,size:info.size};
        }catch(err){if(err.code==='ENOENT')return null;throw err;}
    },
    async remove(group,key){
        validate(group,key);
        if(remote())return store().delete(`${group}/${key}`);
        await fs.rm(path.join(roots[group](),key),{force:true});
        if(group==='media')await fs.rm(path.join(roots[group](),key+'.meta.json'),{force:true});
    },
    async list(group){
        if(!roots[group])throw new Error('Invalid storage group.');
        if(remote()){
            const keys=[];
            for await(const page of store().list({prefix:`${group}/`,paginate:true}))for(const blob of page.blobs)keys.push(blob.key.slice(group.length+1));
            return keys;
        }
        try{return (await fs.readdir(roots[group]())).filter(f=>!f.endsWith('.meta.json'));}
        catch(err){if(err.code==='ENOENT')return [];throw err;}
    }
};
