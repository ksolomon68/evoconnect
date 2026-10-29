'use strict';
module.exports=async db=>{
    await db.execute(`CREATE TABLE IF NOT EXISTS cms_content (
        content_key VARCHAR(150) PRIMARY KEY,data LONGTEXT,deleted BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
};
