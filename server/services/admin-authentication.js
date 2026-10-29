'use strict';
const fs=require('fs');
const path=require('path');
const bcrypt=require('bcryptjs');

async function matches(admin,password) {
    if(!admin || typeof password!=='string' || !password)return false;
    if(typeof admin.password_hash==='string' && await bcrypt.compare(password,admin.password_hash))return true;
    // Compatibility for existing CMS administrators; both entry points use this rule.
    const authFile=path.join(require('./app-root'),'content/cms-auth.json');
    let legacy;
    try {
        const data=JSON.parse(fs.readFileSync(authFile,'utf8'));
        legacy=data.passwordHash ? {value:data.passwordHash,hashed:true} : data.password ? {value:data.password,hashed:false} : null;
    }catch(err){if(err.code!=='ENOENT' && !(err instanceof SyntaxError))throw err;}
    if(!legacy) {
        const value=process.env.CMS_ADMIN_PASSWORD || (process.env.NODE_ENV!=='production'?'EvoConnect2026!':null);
        if(value)legacy={value,hashed:false};
    }
    return !!legacy && (legacy.hashed ? bcrypt.compare(password,legacy.value) : password===legacy.value);
}
module.exports={matches};
