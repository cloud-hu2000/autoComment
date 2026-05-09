// 数据库统一入口 - 根据 DATABASE_TYPE 选择适配器，默认使用 MySQL
const DB_TYPE = (process.env.DATABASE_TYPE || 'mysql').toLowerCase();

let storage;
if (DB_TYPE === 'mysql') {
  storage = require('./storage-mysql');
} else {
  storage = require('./storage');
}

module.exports = storage;
