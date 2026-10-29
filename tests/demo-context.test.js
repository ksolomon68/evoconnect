'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const context=require('../server/services/demo-context');
test('demo SQL is isolated while live SQL is unchanged',()=>{
 const query="SELECT a.id FROM applications a JOIN opportunities o ON o.id=a.opportunity_id WHERE o.title='FROM admins'";
 assert.equal(context.sql(query),query);
 const isolated=context.run(()=>context.sql(query));
 assert.match(isolated,/FROM demo_applications a JOIN demo_opportunities o/);
 assert.match(isolated,/'FROM admins'/);
 assert.throws(()=>context.run(()=>context.sql('SELECT * FROM unknown_live_table')),/unavailable/);
 assert.equal(context.run(()=>context.live(()=>context.sql(query))),query);
});
test('demo inserts and updates preserve upserts and quoted content',()=>{
 assert.equal(context.run(()=>context.sql("INSERT INTO admins (email) VALUES ('UPDATE users') ON DUPLICATE KEY UPDATE email=VALUES(email)")),"INSERT INTO demo_admins (email) VALUES ('UPDATE users') ON DUPLICATE KEY UPDATE email=VALUES(email)");
 assert.equal(context.run(()=>context.sql('UPDATE `workers` SET city=? WHERE id=?')),'UPDATE demo_workers SET city=? WHERE id=?');
});
