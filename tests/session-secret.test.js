'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const secret = require('../server/services/session-secret');
test('existing production JWT configuration derives a stable, separate session key', () => {
    const environment = { NODE_ENV: 'production', JWT_SECRET: 'test-authentication-key' };
    assert.match(secret(environment), /^[a-f0-9]{64}$/);
    assert.notEqual(secret(environment), environment.JWT_SECRET);
    assert.equal(secret(environment), secret(environment));
    assert.notEqual(secret(environment), secret({...environment,JWT_SECRET:'rotated-key'}));
});
test('explicit session configuration is preserved and production never uses the development key', () => {
    assert.equal(secret({SESSION_SECRET:'configured-session-key'}), 'configured-session-key');
    assert.throws(()=>secret({NODE_ENV:'production'}), /requires JWT_SECRET/);
    assert.equal(typeof secret({NODE_ENV:'development'}), 'string');
});
