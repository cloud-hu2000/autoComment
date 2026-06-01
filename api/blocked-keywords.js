const { execute, query } = require('./db');

let loadPromise;
let blockedKeywords = [];

async function ensureBlockedKeywordTable() {
  await execute(
    `
      CREATE TABLE IF NOT EXISTS promotion_blocked_keywords (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        keyword VARCHAR(255) NOT NULL,
        enabled TINYINT NOT NULL DEFAULT 1,
        note VARCHAR(255) DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_promotion_blocked_keywords_keyword (keyword),
        INDEX idx_promotion_blocked_keywords_enabled (enabled)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `,
    []
  );
}

async function loadBlockedKeywords() {
  if (!loadPromise) {
    loadPromise = (async () => {
      await ensureBlockedKeywordTable();
      const rows = await query(
        `
          SELECT keyword
          FROM promotion_blocked_keywords
          WHERE enabled = 1 AND keyword IS NOT NULL AND keyword <> ''
        `,
        []
      );

      blockedKeywords = rows
        .map((row) => String(row.keyword || '').trim().toLowerCase())
        .filter(Boolean);

      console.log(`[blocked-keywords] loaded ${blockedKeywords.length} keyword(s)`);
      return blockedKeywords;
    })().catch((err) => {
      loadPromise = null;
      throw err;
    });
  }

  return loadPromise;
}

async function findBlockedKeyword(text) {
  const value = String(text || '').toLowerCase();
  if (!value) return null;

  const keywords = await loadBlockedKeywords();
  return keywords.find((keyword) => value.includes(keyword)) || null;
}

module.exports = {
  findBlockedKeyword,
  loadBlockedKeywords
};
