'use strict';
const { Store } = require('express-session');
const { getDb } = require('../database');
const execute=(sql,args)=>require('./demo-context').live(()=>getDb().execute(sql,args));
module.exports = class MySQLSessionStore extends Store {
    get(sid, callback) {
        execute('SELECT data FROM app_sessions WHERE id=? AND expires_at>UTC_TIMESTAMP()',[sid])
            .then(([rows])=>callback(null,rows.length?JSON.parse(rows[0].data):null)).catch(callback);
    }
    set(sid, session, callback = ()=>{}) {
        const expiry = session.cookie?.expires ? new Date(session.cookie.expires) : new Date(Date.now()+86400000);
        execute('INSERT INTO app_sessions (id,data,expires_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data),expires_at=VALUES(expires_at)',[sid,JSON.stringify(session),expiry])
            .then(()=>callback()).catch(callback);
    }
    destroy(sid, callback = ()=>{}) {
        execute('DELETE FROM app_sessions WHERE id=?',[sid]).then(()=>callback()).catch(callback);
    }
    touch(sid, session, callback = ()=>{}) {
        const expiry = session.cookie?.expires ? new Date(session.cookie.expires) : new Date(Date.now()+86400000);
        execute('UPDATE app_sessions SET expires_at=? WHERE id=?',[expiry,sid]).then(()=>callback()).catch(callback);
    }
};
