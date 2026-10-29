'use strict';
const path=require('path');
// Bundled Functions relocate modules; deployed assets remain at the task root.
module.exports=process.env.EVO_SERVERLESS
    ? (process.env.LAMBDA_TASK_ROOT || process.cwd())
    : path.resolve(__dirname,'../..');
