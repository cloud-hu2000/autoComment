// Neon PostgreSQL 数据库存储
// 生产环境使用 Neon（Vercel 原生支持），本地开发使用 DATABASE_URL 环境变量
const { neon } = require('@neondatabase/serverless');

// 支持本地开发时的连接串（环境变量 DATABASE_URL）
// Vercel 部署时会自动注入 VERCEL_POSTGRES_URL 或 DATABASE_URL
const sql = neon(process.env.DATABASE_URL || process.env.VERCEL_POSTGRES_URL || '');

// 初始化数据库表（如果不存在）
async function initDb() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS auto_comment_users (
        user_id VARCHAR(255) PRIMARY KEY,
        points INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('[DB] users 表已就绪');
  } catch (err) {
    console.error('[DB] 初始化表失败:', err.message);
  }
}

// 启动时初始化
initDb();

module.exports = { sql };
