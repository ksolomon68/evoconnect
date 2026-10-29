'use strict';
const tables={worker:'workers',business:'businesses',prime:'primes',admin:'admins'};
const portals={worker:'labor',business:'business',prime:'prime',admin:'admin'};
function canConnect(from,to){return (from==='business' && ['worker','prime'].includes(to)) || (to==='business' && ['worker','prime'].includes(from));}
function canApply(type,listing){
    const kind=listing.listing_type || 'opportunity';
    return kind==='job' ? type==='worker' && ['business','admin'].includes(listing.posted_by_type) : kind==='opportunity' && type==='business' && ['prime','admin'].includes(listing.posted_by_type);
}
function listingType(type){return type==='worker'?'job':type==='business'?'opportunity':null;}
async function account(db,type,id){
    if(!tables[type] || !Number.isSafeInteger(Number(id)) || Number(id)<1)return null;
    const [rows]=await db.execute(`SELECT * FROM ${tables[type]} WHERE id=?`,[Number(id)]);const row=rows[0];
    if(!row || (type==='prime'?row.active!==1:row.status && row.status!=='active'))return null;
    return {...row,type,name:row.company_name || row.full_name || row.name || row.email};
}
module.exports={tables,portals,canConnect,canApply,listingType,account};
