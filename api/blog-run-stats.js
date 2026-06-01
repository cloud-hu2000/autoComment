const { execute, query } = require('./db');

let initPromise;

async function tableExists() {
  const rows = await query(
    `
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      LIMIT 1
    `,
    ['blog_run_stats']
  );
  return rows.length > 0;
}

async function ensureTable() {
  if (!initPromise) {
    initPromise = (async () => {
      if (await tableExists()) {
        console.log('[blog-run-stats] table already exists');
        return;
      }

      await execute(
        `
          CREATE TABLE IF NOT EXISTS blog_run_stats (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            page_as VARCHAR(255) DEFAULT '',
            original_url TEXT NOT NULL,
            url_domain VARCHAR(255) NOT NULL,
            target_domain VARCHAR(255) DEFAULT '',
            link_type VARCHAR(255) DEFAULT '',
            external_link_count INT NOT NULL DEFAULT 0,
            validation_result TINYINT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uk_blog_run_stats_url_domain (url_domain)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `,
        []
      );
      console.log('[blog-run-stats] table created');
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeDomain(value) {
  const text = normalizeString(value);
  if (!text) return '';
  try {
    const url = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch (_) {
    return text.replace(/^www\./i, '').toLowerCase();
  }
}

function normalizeResult(value) {
  const result = Number(value);
  return result === 2 ? 2 : 1;
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const body = req.body || {};
  const originalUrl = normalizeString(body.originalUrl);
  const urlDomain = normalizeDomain(body.urlDomain);

  if (!originalUrl || !urlDomain) {
    return res.status(400).json({ success: false, message: 'originalUrl and urlDomain are required' });
  }

  try {
    await ensureTable();
    await execute(
      `
        INSERT INTO blog_run_stats (
          page_as,
          original_url,
          url_domain,
          target_domain,
          link_type,
          external_link_count,
          validation_result
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          page_as = VALUES(page_as),
          original_url = VALUES(original_url),
          target_domain = VALUES(target_domain),
          link_type = VALUES(link_type),
          external_link_count = VALUES(external_link_count),
          validation_result = VALUES(validation_result),
          updated_at = CURRENT_TIMESTAMP
      `,
      [
        normalizeString(body.pageAs),
        originalUrl,
        urlDomain,
        normalizeDomain(body.targetDomain),
        normalizeString(body.type),
        Number.isFinite(Number(body.externalLinkCount)) ? Number(body.externalLinkCount) : 0,
        normalizeResult(body.validationResult)
      ]
    );

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[blog-run-stats] save failed:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports.ensureTable = ensureTable;
