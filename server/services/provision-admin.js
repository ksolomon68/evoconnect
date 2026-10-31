'use strict';
const bcrypt = require('bcryptjs');

module.exports = async function provisionAdmin(db, {email,password,name='EVOGovCon Admin',resetPassword=false}) {
    email = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('A valid administrator email is required.');
    if(typeof password!=='string' || password.length<12)throw new Error('Administrator password must contain at least 12 characters.');
    const [existing] = await db.execute('SELECT id FROM admins WHERE email=?',[email]);
    if(existing.length && !resetPassword)return {id:existing[0].id,created:false};
    const hash=await bcrypt.hash(password,12);
    if(existing.length) {
        await db.execute('UPDATE admins SET password_hash=? WHERE id=?',[hash,existing[0].id]);
        return {id:existing[0].id,created:false,passwordReset:true};
    }
    await db.execute('INSERT IGNORE INTO admins (email,password_hash,name) VALUES (?,?,?)',[email,hash,name]);
    const [[admin]]=await db.execute('SELECT id FROM admins WHERE email=?',[email]);
    return {id:admin.id,created:true};
};
