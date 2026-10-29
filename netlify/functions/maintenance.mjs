import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
process.env.EVO_SERVERLESS='true';
export default async () => {
    const db=require('../../server/database').getDb();
    await require('../../server/services/opportunity-lifecycle').archiveExpired(db);
    await db.execute('DELETE FROM password_reset_tokens WHERE expires_at<UTC_TIMESTAMP() OR used=1');
    await db.execute('DELETE FROM app_rate_limits WHERE reset_at<?',[Date.now()]);
    await db.execute('DELETE FROM app_sessions WHERE expires_at<UTC_TIMESTAMP()');
    return new Response(null,{status:204});
};
export const config={schedule:'*/15 * * * *'};
