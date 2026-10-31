'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { publicPagePath } = require('../server/services/analytics');

test('public analytics normalize aliases and group detail routes without exposing identifiers', () => {
    assert.equal(publicPagePath('/'), '/');
    assert.equal(publicPagePath('/index.html'), '/');
    assert.equal(publicPagePath('/faq.html'), '/faq');
    assert.equal(publicPagePath('/contact/'), '/contact');
    assert.equal(publicPagePath('/labor'), '/labor');
    assert.equal(publicPagePath('/business/register'), '/business/register');
    assert.equal(publicPagePath('/pages/custom-service'), '/pages/custom-service');
    assert.equal(publicPagePath('/opportunities/private-looking-id'), '/opportunities/:id');
    assert.equal(publicPagePath('/directory/business/123'), '/directory/business/:id');
    for (const path of ['/admin/analytics', '/admin-cms.html', '/api/health', '/auth/demo/business', '/login', '/reset-password/secret-token', '/labor/dashboard', '/business/profile', '/prime/applications', '/images/logo.png', '/agency.config.js']) {
        assert.equal(publicPagePath(path), null, path);
    }
});
