'use strict';
async function notify(db, sender, receiver, opportunity, subject, body) {
    const [message] = await db.execute(`INSERT INTO messages
        (sender_type,sender_id,receiver_type,receiver_id,opportunity_id,message_type,subject,body)
        VALUES (?,?,?,?,?,'system',?,?)`, [sender.type,sender.id,receiver.type,receiver.id,opportunity.id,subject,body]);
    await db.execute('INSERT INTO notifications (user_type,user_id,message_id) VALUES (?,?,?)',[receiver.type,receiver.id,message.insertId]);
}
async function statusChanged(db, opportunity, status, sender) {
    if (opportunity.status === status) return;
    const [applicants] = await db.execute('SELECT DISTINCT applicant_type,applicant_id FROM applications WHERE opportunity_id=?',[opportunity.id]);
    for(const person of applicants) await notify(db,sender,{type:person.applicant_type,id:person.applicant_id},opportunity,'Opportunity status updated',`${opportunity.title} is now ${status}. View your application for details.`);
    if(opportunity.posted_by && opportunity.posted_by_type === 'prime' && sender.type === 'admin') await notify(db,sender,{type:'prime',id:opportunity.posted_by},opportunity,'Opportunity publication updated',`${opportunity.title} is now ${status}.`);
}
async function submittedForReview(db, opportunity, sender) {
    const [admins] = await db.execute('SELECT id FROM admins');
    for(const admin of admins) await notify(db,sender,{type:'admin',id:admin.id},opportunity,'Opportunity pending review',`${opportunity.title} needs publication review in Opportunity Manager.`);
}
async function archiveExpired(db) {
    const [expired] = await db.execute(`SELECT * FROM opportunities WHERE status='published' AND due_date IS NOT NULL AND due_date<>''
        AND CONCAT(LEFT(due_date,10),' ',COALESCE(NULLIF(due_time,''),'23:59'),':59') < DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-%d %H:%i:%s')`);
    for(const opp of expired) {
        const [result] = await db.execute("UPDATE opportunities SET status='archived' WHERE id=? AND status='published'",[opp.id]);
        if(result.affectedRows)await statusChanged(db,opp,'archived',{type:'system',id:0});
    }
}
const openSql = "status = 'published' AND (due_date IS NULL OR due_date = '' OR CONCAT(LEFT(due_date,10), ' ', COALESCE(NULLIF(LEFT(due_time,5), ''), '23:59'), ':59') >= DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%d %H:%i:%s'))";
function isOpen(opp) {
    return opp.status === 'published' && (!opp.due_date || Date.parse(`${opp.due_date.slice(0,10)}T${opp.due_time || '23:59'}:59.999Z`) >= Date.now());
}
module.exports={statusChanged,submittedForReview,archiveExpired,openSql,isOpen};
