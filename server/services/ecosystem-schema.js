'use strict';
module.exports=async db=>{
    const [columns]=await db.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='opportunities' AND COLUMN_NAME='listing_type'");
    if(!columns.length){
        await db.execute("ALTER TABLE opportunities ADD COLUMN listing_type ENUM('opportunity','job') NOT NULL DEFAULT 'opportunity'");
        await db.execute("UPDATE opportunities SET listing_type='job' WHERE posted_by_type='business'");
    }
    await db.execute(`CREATE TABLE IF NOT EXISTS role_connections (
        id INT AUTO_INCREMENT PRIMARY KEY,left_type VARCHAR(20) NOT NULL,left_id INT NOT NULL,
        right_type VARCHAR(20) NOT NULL,right_id INT NOT NULL,requester_type VARCHAR(20) NOT NULL,requester_id INT NOT NULL,
        status ENUM('pending','accepted','declined','withdrawn') NOT NULL DEFAULT 'pending',message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY role_pair (left_type,left_id,right_type,right_id),KEY right_member(right_type,right_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    // Preserve legacy prime–business relationships; prime–labor histories remain in the legacy table.
    await db.execute(`INSERT IGNORE INTO role_connections (left_type,left_id,right_type,right_id,requester_type,requester_id,status,message,created_at,updated_at)
        SELECT 'business',target_id,'prime',prime_id,'prime',prime_id,status,message,created_at,updated_at FROM connections WHERE target_type='business'`);
};
