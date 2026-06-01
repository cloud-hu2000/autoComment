const mysql = require('mysql2/promise');

require('dotenv').config();

function isMysqlConnectionUrl(value) {
  return /^mysql(?:2)?:\/\//i.test(String(value || '').trim());
}

function buildDbConfig() {
  const databaseUrl = String(process.env.DATABASE_URL || '').trim();

  if (isMysqlConnectionUrl(databaseUrl)) {
    return databaseUrl;
  }

  if (databaseUrl && /^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    console.warn('[db] Ignoring PostgreSQL DATABASE_URL; using MYSQL_* configuration instead.');
  }

  return {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'auto_comment',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    charset: 'utf8mb4'
  };
}

const DB_CONFIG = buildDbConfig();

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool(DB_CONFIG);
  }
  return pool;
}

async function execute(sql, params) {
  const [result] = await getPool().execute(sql, params);
  return result;
}

async function query(sql, params) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

async function queryOne(sql, params) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

module.exports = {
  execute,
  getPool,
  query,
  queryOne
};
