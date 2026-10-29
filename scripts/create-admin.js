'use strict';
const path=require('path');
require('dotenv').config({path:path.join(__dirname,'../.env')});
require('dotenv').config({path:path.join(__dirname,'../.env.production'),override:true});
const mysql=require('mysql2/promise');
const provision=require('../server/services/provision-admin');
(async()=>{
    // Read credentials from environment settings, never command arguments or logs.
    if(!process.env.ADMIN_EMAIL || !process.env.ADMIN_DEFAULT_PASSWORD)throw new Error('Set ADMIN_EMAIL and ADMIN_DEFAULT_PASSWORD in environment settings.');
    const db=await mysql.createConnection({host:process.env.DB_HOST || 'localhost',port:Number(process.env.DB_PORT || 3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
    try{
        const result=await provision(db,{email:process.env.ADMIN_EMAIL,password:process.env.ADMIN_DEFAULT_PASSWORD,resetPassword:process.argv.includes('--reset-password')});
        console.log(result.created?'Real administrator created.':result.passwordReset?'Administrator password updated.':'Administrator already exists; password preserved.');
        console.log('The same account can sign in to the admin portal and CMS.');
    }finally{await db.end();}
})().catch(err=>{console.error('Administrator setup failed:',err.code || err.message);process.exitCode=1;});
