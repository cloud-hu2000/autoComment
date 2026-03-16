// 简单的内存存储（生产环境应使用Redis或数据库）
const orders = new Map();
const users = new Map();

module.exports = {
  orders,
  users
};
