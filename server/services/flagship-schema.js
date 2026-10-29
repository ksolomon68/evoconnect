'use strict';

// Additive migrations work on both MySQL 8 and MariaDB. Never swallow failures.
module.exports = async function migrate(db) {
    const [columns] = await db.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'opportunities' AND COLUMN_NAME = 'posted_by_type'");
    if (!columns.length) await db.execute("ALTER TABLE opportunities ADD COLUMN posted_by_type VARCHAR(20) NOT NULL DEFAULT 'prime'");
    await db.execute(`CREATE TABLE IF NOT EXISTS capability_documents (
        id CHAR(36) PRIMARY KEY, owner_type VARCHAR(20) NOT NULL, owner_id INT NOT NULL,
        storage_name VARCHAR(80) NOT NULL, original_name VARCHAR(255) NOT NULL,
        size_bytes INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY owner_document (owner_type, owner_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await db.execute(`CREATE TABLE IF NOT EXISTS opportunity_attachments (
        id CHAR(36) PRIMARY KEY, opportunity_id VARCHAR(100) NOT NULL,
        storage_name VARCHAR(80) NOT NULL, original_name VARCHAR(255) NOT NULL,
        size_bytes INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        KEY opportunity_files (opportunity_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await db.execute(`CREATE TABLE IF NOT EXISTS performance_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY, owner_type VARCHAR(20) NOT NULL, owner_id INT NOT NULL,
        entity_type VARCHAR(20) NOT NULL, entity_id VARCHAR(100) NOT NULL,
        event_type VARCHAR(30) NOT NULL, visitor_hash CHAR(64) NOT NULL,
        event_day DATE NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY daily_visitor (entity_type, entity_id, event_type, visitor_hash, event_day),
        KEY owner_date (owner_type, owner_id, event_day)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    for (const table of ['capability_documents', 'performance_events']) {
        const [[metadata]] = await db.execute('SELECT TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table]);
        if (metadata.TABLE_COLLATION !== 'utf8mb4_unicode_ci') await db.execute(`ALTER TABLE ${table} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    }
};
