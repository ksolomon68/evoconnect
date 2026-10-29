'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const policy=require('../server/services/role-policy');
test('member connections follow labor ↔ business ↔ prime in both directions',()=>{
    for(const from of ['worker','business','prime'])for(const to of ['worker','business','prime'])assert.equal(policy.canConnect(from,to),from!==to && (from==='business'||to==='business'),`${from} -> ${to}`);
    assert.equal(policy.canConnect('worker','admin'),false);assert.equal(policy.canConnect('unknown','business'),false);
});
test('applications depend on both listing type and publisher role',()=>{
    for(const actor of ['worker','business','prime','admin']){
        assert.equal(policy.canApply(actor,{listing_type:'opportunity',posted_by_type:'prime'}),actor==='business');
        assert.equal(policy.canApply(actor,{listing_type:'job',posted_by_type:'business'}),actor==='worker');
    }
    assert.equal(policy.canApply('worker',{listing_type:'job',posted_by_type:'prime'}),false);
    assert.equal(policy.canApply('business',{listing_type:'opportunity',posted_by_type:'business'}),false);
    assert.equal(policy.canApply('business',{posted_by_type:'prime'}),true);
});
