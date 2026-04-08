// SQLite 数据库存储
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'auto_comment.db');

// 确保 data 目录存在
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// 启用 WAL 模式，提升并发性能
db.pragma('journal_mode = WAL');

// ==================== 初始化表结构 ====================
function initDb() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS auto_comment_users (
        user_id    TEXT    PRIMARY KEY,
        points     INTEGER NOT NULL DEFAULT 0,
        updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
    console.log('[DB] auto_comment_users 表已就绪');

    // 批量任务批次表
    db.exec(`
      CREATE TABLE IF NOT EXISTS batch_jobs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id      TEXT    UNIQUE NOT NULL,
        user_id       TEXT    NOT NULL,
        total_count   INTEGER DEFAULT 0,
        pending_count INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        fail_count    INTEGER DEFAULT 0,
        status        TEXT    DEFAULT 'pending',
        created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
    console.log('[DB] batch_jobs 表已就绪');

    // 批量 URL 明细表
    db.exec(`
      CREATE TABLE IF NOT EXISTS batch_urls (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id      TEXT    NOT NULL,
        original_index INTEGER NOT NULL,
        url           TEXT    NOT NULL,
        result        TEXT    DEFAULT NULL,
        result_mark   TEXT    DEFAULT NULL,
        error_message TEXT    DEFAULT NULL,
        ai_content    TEXT    DEFAULT NULL,
        processed_at  TEXT    DEFAULT NULL,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
    console.log('[DB] batch_urls 表已就绪');

    // 创建索引
    db.exec(`CREATE INDEX IF NOT EXISTS idx_batch_urls_batch_result ON batch_urls(batch_id, result)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_batch_jobs_user_status ON batch_jobs(user_id, status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_batch_jobs_batch_id ON batch_jobs(batch_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_batch_urls_batch_id ON batch_urls(batch_id)`);
    console.log('[DB] 索引已就绪，数据库路径:', DB_PATH);
  } catch (err) {
    console.error('[DB] 初始化表失败:', err.message);
  }
}

initDb();

// ==================== 辅助函数 ====================

// 兼容 neon tagged template 语法:
//   query`SELECT points FROM auto_comment_users WHERE user_id = ${userId}`
// 返回所有匹配行: [{col: val}, ...]
function query(strings, ...values) {
  const q = buildQuery(strings, values);
  return db.prepare(q).all();
}

// 查询单行，返回 {col: val} | undefined
function queryOne(strings, ...values) {
  const q = buildQuery(strings, values);
  return db.prepare(q).get();
}

// 执行 INSERT/UPDATE/DELETE（自动转义值）
function exec(strings, ...values) {
  const q = buildQuery(strings, values);
  return db.prepare(q).run();
}

// UPSERT: 存在则更新，不存在则插入
function upsert(table, cols, values, primaryKey) {
  const colStr  = cols.join(', ');
  const valStr  = values.map(v => typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v).join(', ');
  const exclStr = cols.map(c => `${c}=excluded.${c}`).join(', ');
  const sql = `INSERT INTO ${table} (${colStr}, ${primaryKey}) VALUES (${valStr}, ${primaryKey}) ON CONFLICT(${primaryKey}) DO UPDATE SET ${exclStr}`;
  return db.prepare(sql).run();
}

function buildQuery(strings, values) {
  let q = '';
  for (let i = 0; i < strings.length; i++) {
    q += strings[i];
    if (i < values.length) {
      const v = values[i];
      if (typeof v === 'string') {
        q += `'${v.replace(/'/g, "''")}'`;
      } else if (v === null || v === undefined) {
        q += 'NULL';
      } else {
        q += String(v);
      }
    }
  }
  return q;
}

module.exports = { db, query, queryOne, exec, upsert };
