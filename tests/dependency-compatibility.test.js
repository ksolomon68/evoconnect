'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');

test('patched minimatch supports EJS build tooling and nodemon watch filters',()=>{
    const {FileList}=require('filelist');
    assert.ok(new FileList('views/*.ejs').toArray().includes('views/login.ejs'));
    const result=require('nodemon/lib/monitor/match')(['server/index.js','README.md'],['**/*.js'],'js');
    assert.deepEqual(result.result,[path.resolve('server/index.js')]);
});

test('updated Nodemailer builds branded password-reset mail without network delivery',async()=>{
    const nodemailer=require('nodemailer');
    const createTransport=nodemailer.createTransport;
    const transport=createTransport({streamTransport:true,buffer:true,newline:'unix'});
    const saved={EMAIL_HOST:process.env.EMAIL_HOST,EMAIL_FROM:process.env.EMAIL_FROM};
    try{
        process.env.EMAIL_HOST='smtp.example.invalid';process.env.EMAIL_FROM='sender@example.invalid';
        nodemailer.createTransport=()=>transport;
        const result=await require('../server/config/email').sendPasswordReset({to:'recipient@example.invalid',resetUrl:'https://example.invalid/reset-password/test-token'});
        assert.deepEqual(result.envelope.to,['recipient@example.invalid']);
        const message=result.message.toString('utf8');
        assert.match(message,/Subject: Reset your EVOGovCon password/);
        assert.match(message,/From: .*EVOGovCon.*sender@example.invalid/);
        assert.match(message,/reset-password\/test-token/);
    }finally{
        nodemailer.createTransport=createTransport;
        for(const [key,value]of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;
        transport.close();
    }
});
