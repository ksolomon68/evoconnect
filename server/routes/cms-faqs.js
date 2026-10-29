'use strict';
const express=require('express');
const {getDb}=require('../database');
const faqs=require('../services/faqs');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
module.exports=function(requireAdmin){
    const router=express.Router();
    router.get('/faqs/export',wrap(async(req,res)=>{const rows=await faqs.list(getDb());res.set('Cache-Control','no-store').json(rows);}));
    router.get('/faqs',requireAdmin,wrap(async(req,res)=>{const [rows]=await getDb().execute('SELECT * FROM cms_faqs ORDER BY category,sort_order,id');res.json(rows);}));
    router.get('/faq-categories',requireAdmin,wrap(async(req,res)=>{const [rows]=await getDb().execute('SELECT DISTINCT category FROM cms_faqs ORDER BY category');res.json(rows.map(r=>r.category));}));
    const validate=body=>{
        if(typeof body.category!=='string'||!body.category.trim()||body.category.length>100||typeof body.question!=='string'||!body.question.trim()||body.question.length>2000||typeof body.answer!=='string'||body.answer.length>50000||!faqs.answer(body.answer).trim()||!['active','inactive'].includes(body.status || 'active'))return null;
        return [body.category.trim(),body.question.trim(),faqs.answer(body.answer),body.status || 'active'];
    };
    router.post('/faqs',requireAdmin,wrap(async(req,res)=>{
        const values=validate(req.body || {});if(!values)return res.status(400).json({error:'Provide a category, question, answer, and valid publication status.'});
        const [[row]]=await getDb().execute('SELECT COALESCE(MAX(sort_order),-1)+1 AS next_order FROM cms_faqs WHERE category=?',[values[0]]);
        const [result]=await getDb().execute('INSERT INTO cms_faqs (category,question,answer,status,sort_order) VALUES (?,?,?,?,?)',[...values,row.next_order]);res.status(201).json({id:result.insertId,message:'FAQ created'});
    }));
    router.post('/faqs/reorder',requireAdmin,wrap(async(req,res)=>{
        const updates=req.body?.updates;
        if(!Array.isArray(updates)||updates.length>1000||updates.some(r=>!r||!Number.isSafeInteger(r.id)||r.id<=0||!Number.isSafeInteger(r.sort_order)||r.sort_order<0)||new Set(updates.map(r=>r.id)).size!==updates.length)return res.status(400).json({error:'Provide valid unique FAQ IDs and nonnegative sort orders.'});
        const connection=await getDb().getConnection();
        try {await connection.beginTransaction();for(const item of updates){const [rows]=await connection.execute('SELECT id FROM cms_faqs WHERE id=? FOR UPDATE',[item.id]);if(!rows.length){await connection.rollback();return res.status(404).json({error:'FAQ not found'});}await connection.execute('UPDATE cms_faqs SET sort_order=? WHERE id=?',[item.sort_order,item.id]);}await connection.commit();}
        catch(err){await connection.rollback();throw err;}finally{connection.release();}
        res.json({message:'Order saved'});
    }));
    router.put('/faqs/:id',requireAdmin,wrap(async(req,res)=>{
        const values=validate(req.body || {});if(!values||!/^\d+$/.test(req.params.id))return res.status(400).json({error:'Provide valid FAQ fields.'});
        const [result]=await getDb().execute('UPDATE cms_faqs SET category=?,question=?,answer=?,status=? WHERE id=?',[...values,req.params.id]);if(!result.affectedRows)return res.status(404).json({error:'FAQ not found'});res.json({message:'FAQ updated'});
    }));
    router.delete('/faqs/:id',requireAdmin,wrap(async(req,res)=>{if(!/^\d+$/.test(req.params.id))return res.status(400).json({error:'Invalid FAQ ID'});const [result]=await getDb().execute('DELETE FROM cms_faqs WHERE id=?',[req.params.id]);if(!result.affectedRows)return res.status(404).json({error:'FAQ not found'});res.json({message:'FAQ deleted'});}));
    router.use((err,req,res,next)=>{console.error('CMS FAQ error:',err.code || err.message);res.status(500).json({error:'Unable to update FAQs. Please try again.'});});
    return router;
};
