'use strict';
const { AsyncLocalStorage } = require('async_hooks');
const storage = new AsyncLocalStorage();
const tables = ['workers','businesses','primes','admins','naics_codes','worker_matches','connections','role_connections','checklist_progress','subcontractor_requests','password_reset_tokens','resources','announcements','opportunities','applications','saved_opportunities','messages','notifications','site_issues','cms_faqs','capability_documents','opportunity_attachments','performance_events'];
const allowed = new Set(tables);
function sql(statement) {
    if (!storage.getStore()) return statement;
    // Skip literals/comments so SQL text inside content is never rewritten.
    return statement.replace(/'(?:''|\\.|[^'])*'|"(?:""|\\.|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\b(FROM|JOIN|UPDATE|INTO)\s+`?([a-zA-Z_]\w*)`?/gi,(match,keyword,table,offset)=>{
        if (!keyword) return match;
        if(keyword.toUpperCase()==='UPDATE' && /\bKEY\s*$/i.test(statement.slice(0,offset)))return match;
        if (!allowed.has(table.toLowerCase())) throw new Error('Table is unavailable in the demo.');
        return `${keyword} demo_${table.toLowerCase()}`;
    });
}
function connection(connection) {
    return new Proxy(connection,{get(target,key){
        if(key==='execute'||key==='query')return (statement,...args)=>target[key](sql(statement),...args);
        const value=target[key];return typeof value==='function'?value.bind(target):value;
    }});
}
module.exports = { tables, sql, connection, active:()=>!!storage.getStore(), run:(callback)=>storage.run(true,callback), live:(callback)=>storage.run(false,callback) };
