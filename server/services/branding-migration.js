'use strict';
const {display}=require('./branding');
module.exports=async db=>{
    const connection=await db.getConnection();
    try{
        await connection.beginTransaction();
        const [marker]=await connection.execute("INSERT IGNORE INTO app_migrations (name) VALUES ('evogovcon-display-brand-v1')");
        if(marker.affectedRows){
            const [pages]=await connection.execute('SELECT content_key,data FROM cms_content WHERE deleted=FALSE FOR UPDATE');
            for(const page of pages){
                const value=JSON.parse(page.data),updated=display(value);
                if(JSON.stringify(value)!==JSON.stringify(updated))await connection.execute('UPDATE cms_content SET data=? WHERE content_key=?',[JSON.stringify(updated),page.content_key]);
            }
            const [faqs]=await connection.execute('SELECT id,question,answer FROM cms_faqs FOR UPDATE');
            for(const faq of faqs){
                const question=display(faq.question),answer=display(faq.answer);
                if(question!==faq.question || answer!==faq.answer)await connection.execute('UPDATE cms_faqs SET question=?,answer=? WHERE id=?',[question,answer,faq.id]);
            }
        }
        await connection.commit();
    }catch(err){await connection.rollback();throw err;}finally{connection.release();}
};
