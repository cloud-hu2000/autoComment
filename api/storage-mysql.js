// MySQL 数据库存储
const mysql = require('mysql2/promise');

// 本地 MySQL 连接信息（默认写死，可通过环境变量覆盖）
const DB_CONFIG = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'auto_comment',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
};

// 创建连接池
const pool = mysql.createPool(DB_CONFIG);

console.log(`[MySQL] 连接池已就绪，数据库：${DB_CONFIG.database}@${DB_CONFIG.host}:${DB_CONFIG.port}`);

// ==================== 初始化表结构 ====================
async function initDb() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS auto_comment_users (
        user_id    VARCHAR(255)  PRIMARY KEY,
        points     INT           NOT NULL DEFAULT 0,
        updated_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[MySQL] auto_comment_users 表已就绪');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS batch_jobs (
        id            INT          PRIMARY KEY AUTO_INCREMENT,
        batch_id      VARCHAR(36)  UNIQUE NOT NULL,
        user_id       VARCHAR(255) NOT NULL,
        total_count   INT          DEFAULT 0,
        pending_count INT          DEFAULT 0,
        success_count INT          DEFAULT 0,
        fail_count    INT          DEFAULT 0,
        status        VARCHAR(20)  DEFAULT 'pending',
        created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_status (user_id, status),
        INDEX idx_batch_id (batch_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[MySQL] batch_jobs 表已就绪');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS batch_urls (
        id             INT          PRIMARY KEY AUTO_INCREMENT,
        batch_id       VARCHAR(36)  NOT NULL,
        original_index INT          NOT NULL,
        url            TEXT         NOT NULL,
        result         VARCHAR(20)  DEFAULT NULL,
        result_mark    VARCHAR(10)  DEFAULT NULL,
        error_message  TEXT         DEFAULT NULL,
        ai_content     TEXT         DEFAULT NULL,
        processed_at   TIMESTAMP    DEFAULT NULL,
        created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_batch_result (batch_id, result),
        INDEX idx_batch_id (batch_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[MySQL] batch_urls 表已就绪');

    console.log('[MySQL] 所有表已就绪');
  } finally {
    conn.release();
  }
}

initDb().catch((err) => {
  console.error('[MySQL] 初始化表失败:', err.message);
});

// ==================== 辅助函数 ====================

// 通用的 SQL 构建（将 tagged template 转为普通 SQL 字符串）
function buildQuery(sqlParts, values) {
  let q = '';
  for (let i = 0; i < sqlParts.length; i++) {
    q += sqlParts[i];
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

// 将 tagged template 转为 [sql, params]（用于 prepared statement）
function parseTemplate(sqlParts, values) {
  const params = [];
  let sql = '';
  for (let i = 0; i < sqlParts.length; i++) {
    sql += sqlParts[i];
    if (i < values.length) {
      const v = values[i];
      if (typeof v === 'string' || v === null || v === undefined) {
        sql += '?';
        params.push(v);
      } else {
        sql += '?';
        params.push(v);
      }
    }
  }
  return [sql, params];
}

// 查询所有行: query`SELECT * FROM t WHERE id = ${id}`
async function query(sqlParts, ...values) {
  const [sql, params] = parseTemplate(sqlParts, values);
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// 查询单行: queryOne`SELECT * FROM t WHERE id = ${id}`
async function queryOne(sqlParts, ...values) {
  const [sql, params] = parseTemplate(sqlParts, values);
  const [rows] = await pool.execute(sql, params);
  return rows[0] || undefined;
}

// 执行 INSERT/UPDATE/DELETE: exec`UPDATE t SET name = ${name} WHERE id = ${id}`
async function exec(sqlParts, ...values) {
  const [sql, params] = parseTemplate(sqlParts, values);
  const [result] = await pool.execute(sql, params);
  return result;
}

// 事务包装器: await db.transaction(async (conn) => { ... })
// 兼容 SQLite 代码中 db.transaction(() => { ... })() 的同步调用风格
async function transaction(fn) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    // 将 conn 装扮成简化的事务句柄，提供 .run / .get / .all / .prepare
    const tx = {
      query: async (sqlParts, ...values) => {
        const [sql, params] = parseTemplate(sqlParts, values);
        const [rows] = await conn.execute(sql, params);
        return rows;
      },
      queryOne: async (sqlParts, ...values) => {
        const [sql, params] = parseTemplate(sqlParts, values);
        const [rows] = await conn.execute(sql, params);
        return rows[0] || undefined;
      },
      exec: async (sqlParts, ...values) => {
        const [sql, params] = parseTemplate(sqlParts, values);
        const [result] = await conn.execute(sql, params);
        return result;
      },
      // 提供 prepared statement 风格的 run/get/all（兼容 batch.js 中的 db.prepare().run/get/all 用法）
      prepare: (sql) => ({
        run: (...params) => conn.execute(sql, params).then(([r]) => r),
        get: (...params) => conn.execute(sql, params).then(([rows]) => rows[0] || undefined),
        all: (...params) => conn.execute(sql, params).then(([rows]) => rows)
      }),
      commit: () => conn.commit(),
      rollback: () => conn.rollback()
    };

    // 支持同步调用: transaction(() => { ... })() 风格
    const result = fn(tx);
    if (result && typeof result.then === 'function') {
      await result;
      await conn.commit();
    } else {
      await conn.commit();
    }
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// UPSERT: 存在则更新，不存在则插入
// 用法: upsert('users', ['name', 'email'], ['Tom', 'tom@x.com'], 'email')
async function upsert(table, cols, values, primaryKey) {
  const colStr = cols.join(', ');
  const placeholders = cols.map(() => '?').join(', ');
  const updateStr = cols.map((c) => `${c}=VALUES(${c})`).join(', ');
  const [result] = await pool.execute(
    `INSERT INTO ${table} (${colStr}) VALUES (${placeholders})
     ON DUPLICATE KEY UPDATE ${updateStr}`,
    values
  );
  return result;
}

// 提供 pool 本身（用于需要原生连接的场景）
module.exports = {
  db: {
    query,
    queryOne,
    exec,
    transaction,
    prepare: (sql) => ({
      run: (...params) => pool.execute(sql, params).then(([r]) => r),
      get: (...params) => pool.execute(sql, params).then(([rows]) => rows[0] || undefined),
      all: (...params) => pool.execute(sql, params).then(([rows]) => rows)
    })
  },
  pool,
  query,
  queryOne,
  exec,
  transaction,
  upsert
};
