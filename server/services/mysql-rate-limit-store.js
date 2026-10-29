'use strict';
const {createHash}=require('crypto');
const {getDb}=require('../database');
const context=require('./demo-context');
module.exports=class MySQLRateLimitStore {
    constructor(prefix){this.prefix=prefix;this.localKeys=false;}
    init(options){this.windowMs=options.windowMs;}
    key(key){return createHash('sha256').update(this.prefix+':'+key).digest('hex');}
    async increment(key){
        return context.live(async()=>{
            const connection=await getDb().getConnection();
            try{
                await connection.beginTransaction();
                const now=Date.now();
                await connection.execute('INSERT INTO app_rate_limits (id,hits,reset_at) VALUES (?,1,?) ON DUPLICATE KEY UPDATE hits=IF(reset_at<=?,1,hits+1),reset_at=IF(reset_at<=?,VALUES(reset_at),reset_at)',[this.key(key),now+this.windowMs,now,now]);
                const [[row]]=await connection.execute('SELECT hits,reset_at FROM app_rate_limits WHERE id=?',[this.key(key)]);
                await connection.commit();return {totalHits:Number(row.hits),resetTime:new Date(Number(row.reset_at))};
            }catch(err){await connection.rollback();throw err;}finally{connection.release();}
        });
    }
    async decrement(key){return context.live(()=>getDb().execute('UPDATE app_rate_limits SET hits=GREATEST(hits-1,0) WHERE id=?',[this.key(key)]));}
    async resetKey(key){return context.live(()=>getDb().execute('DELETE FROM app_rate_limits WHERE id=?',[this.key(key)]));}
};
