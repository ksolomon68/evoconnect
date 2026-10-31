'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { signToken, attachUser, JWT_SECRET, COOKIE_NAME } = require('../server/middleware/auth');

test('legacy admin labels become EVOBRAND in new and existing sessions without changing access', () => {
    const account = { id: 1, type: 'admin', email: 'owner@example.invalid', name: 'Demo Admin' };
    const current = jwt.verify(signToken(account), JWT_SECRET);
    assert.equal(current.name, 'EVOBRAND');
    assert.equal(current.type, 'admin');
    assert.equal(current.demo, undefined);
    const req = { cookies: { [COOKIE_NAME]: jwt.sign(account, JWT_SECRET) }, headers: {} };
    const res = { locals: {} };
    let called = false;
    attachUser(req, res, () => { called = true; });
    assert.ok(called);
    assert.equal(req.user.name, 'EVOBRAND');
    assert.equal(res.locals.user.name, 'EVOBRAND');
    assert.equal(jwt.verify(signToken({ ...account, name: 'Custom Administrator' }), JWT_SECRET).name, 'Custom Administrator');
    assert.equal(jwt.verify(signToken({ ...account, type: 'business' }), JWT_SECRET).name, 'Demo Admin');
});
