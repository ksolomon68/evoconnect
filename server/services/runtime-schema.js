'use strict';
module.exports=async db=>{
    await db.execute(`CREATE TABLE IF NOT EXISTS app_rate_limits (
        id CHAR(64) PRIMARY KEY,hits INT NOT NULL,reset_at BIGINT NOT NULL,KEY rate_expiry(reset_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.execute(`CREATE TABLE IF NOT EXISTS app_sessions (
        id VARCHAR(128) PRIMARY KEY,data MEDIUMTEXT NOT NULL,expires_at DATETIME NOT NULL,
        KEY session_expiry(expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db.execute(`CREATE TABLE IF NOT EXISTS cms_content (
        content_key VARCHAR(150) PRIMARY KEY,data LONGTEXT,deleted BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
};
