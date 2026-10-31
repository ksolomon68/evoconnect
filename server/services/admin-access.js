'use strict';
// Retire the historical public demo administrator, including already issued tokens.
const isRetiredDemoEmail=email=>typeof email==='string' && email.trim().toLowerCase()==='demo-admin@evoconnect.io';
const isDemoAdmin=user=>!!user && (isRetiredDemoEmail(user.email) || (['admin','admins','wfc_admin'].includes(user.type) && user.demo===true));
const displayName=user=>user && ['admin','admins','wfc_admin'].includes(user.type) && /^\s*demo\s+admin\s*$/i.test(user.name || '') ? 'EVOBRAND' : user?.name;
module.exports={isRetiredDemoEmail,isDemoAdmin,displayName};
