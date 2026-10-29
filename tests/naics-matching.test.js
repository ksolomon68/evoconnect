'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { codes, score } = require('../server/services/naics-matching');
test('NAICS normalization accepts JSON, numbers, and legacy lists without duplicates or invalid tokens',()=>{
    assert.deepEqual(codes('[237130," 238210 ","237130","bad",{}]'),['237130','238210']);
    assert.deepEqual(codes('237130, 238210\n237130'),['237130','238210']);
    assert.deepEqual(codes('237130'),['237130']);
    for(const invalid of [null,{},'null','[]','["bad"]','{broken',true])assert.deepEqual(codes(invalid),[]);
});
test('match scores measure exact opportunity-code coverage; unrelated prefixes never match',()=>{
    assert.deepEqual(score(['237130','238210'],['237130','237130']),{matched:['237130'],score:50});
    assert.equal(score(['237130'],['23','23713','1237130']).score,0);
    assert.equal(score([],['237130']).score,0);
    assert.equal(score(['237130'],['237130','238210']).score,100);
});
