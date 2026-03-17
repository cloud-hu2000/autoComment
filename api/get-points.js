const { users } = require('./storage');

/**
 * 查询/初始化外链余额
 * GET /api/get-points?userId=xxx
 * 新用户初始赠送10个外链
 */
module.exports = async function getPoints(req, res, query) {
  const { userId } = query;

  if (!userId) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: '缺少userId参数' }));
    return;
  }

  let points = users.get(userId);

  // 新用户初始赠送10个外链
  if (points === undefined) {
    points = 10;
    users.set(userId, points);
  }

  res.writeHead(200);
  res.end(JSON.stringify({
    success: true,
    points
  }));
};
