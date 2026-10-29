'use strict';
const sanitize=require('sanitize-html');
const defaults=require('./faq-content');
function answer(html) {
    return sanitize(html,{allowedTags:['p','br','strong','b','em','i','ul','ol','li','a','code','blockquote'],allowedAttributes:{a:['href','title']},allowedSchemes:['http','https','mailto','tel'],allowProtocolRelative:false});
}
function audience(category) {
    const name=category.trim().toLowerCase();
    if(['for workers','for labor','labor','labor portal','workers'].includes(name))return 'labor';
    if(['for small businesses','for businesses','business','business portal'].includes(name))return 'business';
    if(['for prime contractors','for primes','prime','prime portal'].includes(name))return 'prime';
    return 'all';
}
async function list(db,role) {
    const [rows]=await db.execute("SELECT * FROM cms_faqs WHERE status='active' ORDER BY category,sort_order,id");
    return rows.map(row=>require('./branding').display(row)).filter(row=>!role || audience(row.category)==='all' || audience(row.category)===role)
        .map(row=>{const html=answer(row.answer);return {...row,answer:html,q:row.question,a:html};});
}
async function groups(db) {
    const rows=await list(db);const groups=new Map();
    for(const row of rows){if(!groups.has(row.category))groups.set(row.category,{id:audience(row.category)==='all'?`category-${row.id}`:audience(row.category),title:row.category,items:[]});groups.get(row.category).items.push(row);}
    // Include the first row ID to distinguish multiple categories aimed at one audience.
    const ids=new Set();for(const group of groups.values()){if(ids.has(group.id))group.id+=`-${group.items[0].id}`;ids.add(group.id);}
    return [...groups.values()];
}
async function seed(db) {
    const [[{count}]]=await db.execute('SELECT COUNT(*) AS count FROM cms_faqs');
    if(count)return;
    for(const [category,items] of [['For workers',defaults.LABOR_FAQS],['For small businesses',defaults.BUSINESS_FAQS],['For prime contractors',defaults.PRIME_FAQS]]) {
        for(const [order,item] of items.entries())await db.execute('INSERT INTO cms_faqs (category,question,answer,sort_order,status) VALUES (?,?,?,?,?)',[category,item.q,'<p>'+sanitize(item.a,{allowedTags:[],allowedAttributes:{}})+'</p>',order,'active']);
    }
}
async function migrate(db) {
    await db.execute('CREATE TABLE IF NOT EXISTS app_migrations (name VARCHAR(100) PRIMARY KEY) ENGINE=InnoDB');
    const connection=await db.getConnection();
    try {
        await connection.beginTransaction();
        const [result]=await connection.execute("INSERT IGNORE INTO app_migrations (name) VALUES ('cms-faq-source-v1')");
        if(result.affectedRows)await seed(connection);
        await connection.commit();
    }catch(err){await connection.rollback();throw err;}finally{connection.release();}
}
module.exports={answer,audience,list,groups,seed,migrate};
