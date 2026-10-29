'use strict';
const open=require('./opportunity-lifecycle').isOpen;
function validateOpportunity(body) {
    const text=(key,max) => typeof body[key] === 'string' ? body[key].trim().slice(0,max) : '';
    const data={ title:text('title',255),scope_summary:text('scope_summary',20000),category:text('category',100),district_name:text('district_name',100),estimated_value:text('estimated_value',100),due_date:text('due_date',10),due_time:text('due_time',5),submission_method:text('submission_method',255),requirements:text('requirements',10000),certifications:text('certifications',5000),naics_codes:text('naics_codes',1000),status:text('status',20) };
    if(!data.title || !data.scope_summary || !data.category || !data.district_name) return {data,error:'Title, scope, category, and location are required.'};
    if(!['draft','pending','published','closed','awarded','archived'].includes(data.status))return {data,error:'Select a valid publication status.'};
    if(data.due_time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.due_time))return {data,error:'Enter a valid deadline time.'};
    if(data.due_date && (!/^\d{4}-\d{2}-\d{2}$/.test(data.due_date) || Number.isNaN(Date.parse(data.due_date)) || new Date(data.due_date).toISOString().slice(0,10)!==data.due_date))return {data,error:'Enter a valid deadline.'};
    if(data.status==='published' && !open(data))return {data,error:'Published opportunities need a current or future deadline.'};
    const codes=data.naics_codes.split(/[\s,]+/).filter(Boolean);
    if(codes.some(c=>!/^\d{2,6}$/.test(c)))return {data,error:'Use comma-separated NAICS codes, each 2–6 digits.'};
    data.naics_codes=JSON.stringify([...new Set(codes)]);
    return {data};
}

module.exports=validateOpportunity;
