'use strict';
const identifiers=/^(?:id|slug|appId|storagePrefix|storage_name|filename|password|secret|token|email|contactEmail|supportEmail)$/i;
// Keep URLs, file paths, addresses, and HTML link attributes intact while renaming prose.
function text(value){
    return value.replace(/(?:https?:\/\/|mailto:|\/)[^\s"'<>]*|[\w.+-]+@[\w.-]+|\b(?:EVOConnected|EVOConnect|EvoConnect|Evoconnect|WorkForce Connect|WORKFORCE CONNECT)\b/g,match=>
        /^(?:EVOConnected|EVOConnect|EvoConnect|Evoconnect|WorkForce Connect|WORKFORCE CONNECT)$/.test(match)?'EVOGovCon':match);
}
function display(value){
    if(typeof value==='string')return text(value);
    if(Array.isArray(value))return value.map(display);
    if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,identifiers.test(key)?item:display(item)]));
    return value;
}
module.exports={display};
