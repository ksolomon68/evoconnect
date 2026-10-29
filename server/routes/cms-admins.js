'use strict';
const express=require('express');
const bcrypt=require('bcryptjs');
const {getDb}=require('../database');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const router=express.Router();
router.use(wrap(async(req,res,next)=>{
    if(!req.user)return res.status(401).json({error:'Please sign in as an administrator.'});
    if(req.user.type!=='admin')return res.status(403).json({error:'Administrator access required.'});
    const [rows]=await getDb().execute('SELECT id FROM admins WHERE id=?',[req.user.id]);
    if(!rows.length)return res.status(401).json({error:'Administrator account unavailable.'});
    next();
}));
router.get('/',wrap(async(req,res)=>{
    const [rows]=await getDb().execute("SELECT id,email,name,name AS contact_name,name AS organization_name,'admin' AS type,created_at FROM admins ORDER BY created_at,id");res.json(rows);
}));
const data=body=>{
    const name=typeof body.organization_name==='string'?body.organization_name.trim():typeof body.name==='string'?body.name.trim():'';
    const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
    const password=typeof body.password==='string'?body.password:'';
    if(!name||name.length>255||email.length>255||!/^\S+@\S+\.\S+$/.test(email)||body.type && body.type!=='admin'||password && (password.length<12||Buffer.byteLength(password)>72))return null;
    return {name,email,password};
};
router.post('/',wrap(async(req,res)=>{
    const values=data(req.body || {});if(!values||!values.password)return res.status(400).json({error:'Provide a name, valid email, and password of 12–72 bytes. Only administrator accounts are supported.'});
    const hash=await bcrypt.hash(values.password,12);
    const [result]=await getDb().execute('INSERT INTO admins (name,email,password_hash) VALUES (?,?,?)',[values.name,values.email,hash]);res.status(201).json({id:result.insertId,message:'Administrator created'});
}));
router.put('/:id',wrap(async(req,res)=>{
    const values=data(req.body || {});if(!values||!/^\d+$/.test(req.params.id))return res.status(400).json({error:'Provide valid administrator details.'});
    const [rows]=await getDb().execute('SELECT id FROM admins WHERE id=?',[req.params.id]);if(!rows.length)return res.status(404).json({error:'Administrator not found'});
    if(values.password)await getDb().execute('UPDATE admins SET name=?,password_hash=? WHERE id=?',[values.name,await bcrypt.hash(values.password,12),req.params.id]);
    else await getDb().execute('UPDATE admins SET name=? WHERE id=?',[values.name,req.params.id]);
    res.json({message:'Administrator updated'});
}));
router.delete('/:id',wrap(async(req,res)=>{
    if(!/^\d+$/.test(req.params.id))return res.status(400).json({error:'Invalid administrator ID'});
    if(Number(req.params.id)===Number(req.user.id))return res.status(409).json({error:'You cannot delete your own administrator account.'});
    const connection=await getDb().getConnection();
    try {
        await connection.beginTransaction();
        const [rows]=await connection.execute('SELECT id FROM admins ORDER BY id FOR UPDATE');
        if(!rows.some(row=>row.id===Number(req.params.id))){await connection.rollback();return res.status(404).json({error:'Administrator not found'});}
        if(rows.length<=1){await connection.rollback();return res.status(409).json({error:'Keep at least one administrator.'});}
        if(!rows.some(row=>row.id===Number(req.user.id))){await connection.rollback();return res.status(401).json({error:'Administrator account unavailable.'});}
        await connection.execute('DELETE FROM admins WHERE id=?',[req.params.id]);await connection.commit();
    }catch(err){await connection.rollback();throw err;}finally{connection.release();}
    res.json({message:'Administrator deleted'});
}));
router.use((err,req,res,next)=>{console.error('CMS admin management:',err.code || err.message);res.status(err.code==='ER_DUP_ENTRY'?409:500).json({error:err.code==='ER_DUP_ENTRY'?'That administrator email already exists.':'Unable to update administrator accounts.'});});
module.exports=router;
