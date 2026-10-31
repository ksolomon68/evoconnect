'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {display}=require('../server/services/branding');
test('display rename preserves identifiers, credentials, addresses, and the deployment hostname',()=>{
    const input={name:'EVOConnect',title:'Welcome to EvoConnect',nested:['EVOConnect Logo'],appId:'net.evobrand.evoconnect',cookie:'evo_token',database:'evoconnect',password:'EvoConnect2026!',demo:'demo-admin@evoconnect.io',hostname:'darkslategrey-partridge-695960.hostingersite.com'};
    assert.deepEqual(display(input),{...input,name:'EVOGovCon',title:'Welcome to EVOGovCon',nested:['EVOGovCon Logo']});
    assert.deepEqual(display(display(input)),display(input));
    const cfg=require('../server/agency.config');assert.equal(cfg.name,'EVOGovCon');assert.equal(cfg.intendedDomain,'evogovcon.com');
    if(!process.env.DOMAIN)assert.equal(cfg.domain,input.hostname);
    assert.equal(cfg.appId,input.appId);
});

test('stored CMS branding preserves uploaded filenames and links within HTML',()=>{
    const input={id:'EVOConnect',password:'EVOConnect',header:{backgroundImage:'/uploads/cms-media/EVOConnect-hero.png'},body:'<a href="https://example.invalid/EVOConnect"><img src="/uploads/EVOConnect.pdf" alt="EVOConnect logo">EVOConnect</a>'};
    const renamed=display(input);
    assert.equal(renamed.id,input.id);assert.equal(renamed.password,input.password);assert.equal(renamed.header.backgroundImage,input.header.backgroundImage);
    assert.equal(renamed.body,'<a href="https://example.invalid/EVOConnect"><img src="/uploads/EVOConnect.pdf" alt="EVOGovCon logo">EVOGovCon</a>');
});

test('the previous EVOConnected display brand upgrades without changing its links or identifiers',()=>{
    const source={id:'EVOConnected',title:'EVOConnected',description:'Welcome to EVOConnected',url:'https://evoconnected.com/login',image:'/uploads/EVOConnected-profile.pdf'};
    assert.deepEqual(display(source),{...source,title:'EVOGovCon',description:'Welcome to EVOGovCon'});
});
