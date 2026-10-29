'use strict';
process.env.EVO_SERVERLESS='true';
const {setEnvironmentContext}=require('@netlify/blobs');
setEnvironmentContext({siteID:'local-netlify-test',token:'local-test-token',edgeURL:process.env.TEST_BLOBS_URL,uncachedEdgeURL:process.env.TEST_BLOBS_URL});
process.on('message',async({url,method='GET',headers={},body})=>{
    try {
        const {default:handler}=await import(process.env.TEST_FUNCTION_MODULE || '../../netlify/functions/app.mjs');
        const request=new Request('https://evo-test.netlify.app'+url,{method,headers:{host:'evo-test.netlify.app','x-forwarded-proto':'https',...headers},body:body?Buffer.from(body,'base64'):undefined});
        const response=await handler(request);
        process.send({status:response.status,headers:Object.fromEntries(response.headers),cookies:response.headers.getSetCookie(),body:Buffer.from(await response.arrayBuffer()).toString('base64')});
    }catch(err){process.send({error:err.stack});}
});
