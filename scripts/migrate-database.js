'use strict';
require('dotenv').config();
// A one-off migration must finish and must not start HTTP servers or background timers.
process.env.EVO_SERVERLESS='true';
require('../server/database').initDatabase().then(()=>{
    console.log('Database schema is ready.');process.exit(0);
}).catch(err=>{console.error('Database migration failed:',err.code || err.name);process.exit(1);});
