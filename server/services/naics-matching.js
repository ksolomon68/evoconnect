'use strict';
const { openSql } = require('./opportunity-lifecycle');

// Support MySQL JSON arrays and older comma-separated values without substring matches.
function codes(value) {
    if (typeof value === 'string') {
        const raw = value.trim();
        if (!raw) return [];
        try { value = JSON.parse(raw); }
        catch { value = raw.split(/[\s,]+/); }
    }
    if (typeof value === 'number' || typeof value === 'string') value = [value];
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter(v => typeof v === 'string' || typeof v === 'number')
        .map(v => String(v).trim()).filter(v => /^\d{2,6}$/.test(v)))].sort();
}
function score(required, offered) {
    const target = codes(required), available = new Set(codes(offered));
    const matched = target.filter(code => available.has(code));
    return { matched, score: target.length ? Math.round(100 * matched.length / target.length) : 0 };
}
function ranked(rows, required) {
    return rows.map(row => ({ ...row, ...score(required, row.naics_codes) }))
        .filter(row => row.matched.length)
        .sort((a,b) => b.score - a.score || b.matched.length - a.matched.length || a.name.localeCompare(b.name) || String(a.id).localeCompare(String(b.id)));
}
async function memberCodes(db, type, id) {
    if (type === 'worker') {
        const [rows] = await db.execute('SELECT naics_code FROM worker_matches WHERE worker_id = ?', [id]);
        return codes(rows.map(row => row.naics_code));
    }
    if (type !== 'business') throw new Error('Unsupported applicant type');
    const [rows] = await db.execute('SELECT naics_codes FROM businesses WHERE id = ?', [id]);
    return codes(rows[0]?.naics_codes);
}
async function opportunities(db, type, id) {
    const naics = await memberCodes(db, type, id);
    if (!naics.length) return { codes: naics, matches: [] };
    const [rows] = await db.execute(`SELECT id,title,scope_summary,posted_by_name,district_name,due_date,naics_codes,posted_date FROM opportunities WHERE ${openSql} AND listing_type=?`,[type==='worker'?'job':'opportunity']);
    const matches = rows.map(row => ({ ...row, ...score(row.naics_codes, naics) }))
        .filter(row => row.matched.length)
        .sort((a,b) => b.score - a.score || b.matched.length - a.matched.length ||
            (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.title.localeCompare(b.title) || String(a.id).localeCompare(String(b.id)));
    return { codes: naics, matches };
}
async function partners(db, required,kind='opportunity') {
    if (!codes(required).length) return [];
    const [businesses] = await db.execute("SELECT id,company_name AS name,naics_codes,city,state FROM businesses WHERE status='active'");
    if(kind!=='job')return ranked(businesses.map(row=>({...row,type:'business'})),required);
    const [workers] = await db.execute(`SELECT w.id,w.full_name AS name,w.city,w.state,wm.naics_code
        FROM workers w JOIN worker_matches wm ON wm.worker_id=w.id WHERE w.status='active'`);
    const byWorker = new Map();
    for (const worker of workers) {
        if (!byWorker.has(worker.id)) byWorker.set(worker.id,{id:worker.id,name:worker.name,city:worker.city,state:worker.state,type:'worker',naics_codes:[]});
        byWorker.get(worker.id).naics_codes.push(worker.naics_code);
    }
    return ranked([...byWorker.values()],required);
}
module.exports = { codes, score, opportunities, partners };
