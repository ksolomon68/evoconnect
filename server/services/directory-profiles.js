'use strict';
module.exports=async function profiles(db,type,rows){
    if(!rows.length)return [];
    const ids=rows.map(row=>row.id),marks=ids.map(()=>'?').join(',');
    const [documents]=await db.execute(`SELECT owner_id,id FROM capability_documents WHERE owner_type=? AND owner_id IN (${marks})`,[type,...ids]);
    const documentsByOwner=new Map(documents.map(doc=>[doc.owner_id,doc.id]));
    const codes=new Map();
    if(type==='worker'){
        const [matches]=await db.execute(`SELECT worker_id,naics_code FROM worker_matches WHERE worker_id IN (${marks})`,ids);
        for(const match of matches){if(!codes.has(match.worker_id))codes.set(match.worker_id,[]);codes.get(match.worker_id).push(match.naics_code);}
    }
    return rows.map(row=>({...row,naics_codes:type==='worker'?codes.get(row.id)||[]:row.naics_codes,capability_id:documentsByOwner.get(row.id)||null}));
};
