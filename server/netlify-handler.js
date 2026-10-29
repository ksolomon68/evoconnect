'use strict';
process.env.EVO_SERVERLESS='true';
process.env.NODE_ENV='production';
process.env.FILE_STORAGE='netlify';
const serverless=require('serverless-http');
let handler;
exports.handleRequest=async request=>{
    try {
        if(!handler)handler=serverless(await require('./index').getApp(),{
            binary:['application/pdf','image/*','application/octet-stream'],basePath:'/.netlify/functions/app'
        });
        const url=new URL(request.url),query={};
        for(const [key,value] of url.searchParams)(query[key] ||= []).push(value);
        const event={
            httpMethod:request.method,path:url.pathname,rawUrl:request.url,
            headers:Object.fromEntries(request.headers),
            multiValueQueryStringParameters:query,
            body:['GET','HEAD'].includes(request.method)?null:Buffer.from(await request.arrayBuffer()).toString('base64'),
            isBase64Encoded:true,requestContext:{identity:{sourceIp:request.headers.get('x-nf-client-connection-ip') || '127.0.0.1'}}
        };
        const result=await handler(event,{callbackWaitsForEmptyEventLoop:false});
        const headers=new Headers(result.headers);
        for(const [key,values] of Object.entries(result.multiValueHeaders || {})){
            headers.delete(key);for(const value of values)headers.append(key,value);
        }
        const body=result.body?Buffer.from(result.body,result.isBase64Encoded?'base64':'utf8'):null;
        return new Response(request.method==='HEAD' || [204,304].includes(result.statusCode)?null:body,{status:result.statusCode,headers});
    }catch(err){
        console.error('EvoConnect function unavailable:',err.code || err.name);
        return new Response('<!doctype html><html lang="en"><title>EvoConnect</title><h1>EvoConnect is starting up</h1><p>The application could not reach its configured services. Please try again shortly.</p></html>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
    }
};
