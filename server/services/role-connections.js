'use strict';
const policy=require('./role-policy');
function pair(a,b){return [a,b].sort((x,y)=>x.type.localeCompare(y.type)||Number(x.id)-Number(y.id));}
async function relationship(db,a,b){const [left,right]=pair(a,b);const [rows]=await db.execute('SELECT * FROM role_connections WHERE left_type=? AND left_id=? AND right_type=? AND right_id=?',[left.type,left.id,right.type,right.id]);return rows[0] || null;}
async function notify(db,from,to,subject,body){
    const [message]=await db.execute("INSERT INTO messages (sender_type,sender_id,sender_business_name,receiver_type,receiver_id,receiver_business_name,message_type,subject,body) VALUES (?,?,?,?,?,?,'system',?,?)",[from.type,from.id,from.name||'EVOConnect',to.type,to.id,to.name||'Member',subject,body]);
    await db.execute('INSERT INTO notifications (user_type,user_id,message_id) VALUES (?,?,?)',[to.type,to.id,message.insertId]);
}
async function list(db,actor){
    const [rows]=await db.execute('SELECT * FROM role_connections WHERE (left_type=? AND left_id=?) OR (right_type=? AND right_id=?) ORDER BY updated_at DESC,id DESC',[actor.type,actor.id,actor.type,actor.id]);
    const result=[];
    for(const row of rows){const left=row.left_type===actor.type && row.left_id===Number(actor.id);const type=left?row.right_type:row.left_type,id=left?row.right_id:row.left_id;if(!policy.canConnect(actor.type,type))continue;
        const other=await policy.account(db,type,id);if(!other)continue;
        result.push({...row,peer:{type,id,name:other.name,city:other.city,state:other.state,...(row.status==='accepted'?{email:other.email,phone:other.phone}:{})},incoming:row.requester_type!==actor.type || row.requester_id!==Number(actor.id),target_type:type,target_id:id,target_name:other.name,prime_company_name:other.name,company_name:other.name,prime_contact:other.contact_name || other.name});
    }return result;
}
async function recipients(db,actor){
    const peers=(await list(db,actor)).filter(row=>row.status==='accepted').map(row=>({type:row.peer.type,id:row.peer.id,name:row.peer.name,label:`${row.peer.name} (${row.peer.type==='worker'?'Labor':row.peer.type})`}));
    if(actor.type==='admin'){
        for(const type of ['worker','business','prime']){const [rows]=await db.execute(`SELECT id,${type==='worker'?'full_name':'company_name'} AS name FROM ${policy.tables[type]} WHERE ${type==='prime'?'active=1':"status='active'"} ORDER BY id LIMIT 100`);for(const row of rows)peers.push({type,id:row.id,name:row.name,label:`${row.name} (${type})`});}
    }else{const [admins]=await db.execute('SELECT id,name FROM admins ORDER BY id LIMIT 20');for(const row of admins)peers.push({type:'admin',id:row.id,name:row.name||'Support',label:`${row.name||'Support'} (Admin)`});}
    return peers;
}
module.exports={pair,relationship,notify,list,recipients};
