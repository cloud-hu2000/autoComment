const { users } = require('./storage');

/**
 * 查询积分余额
 * GET /api/get-points?userId=xxx
 */
module.exports = async function getPoints(req, res, query) {
  const { userId } = query;

  if (!userId) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: '缺少userId参数' }));
    return;
  }

  const points = users.get(userId) || 0;

  res.writeHead(200);
  res.end(JSON.stringify({
    success: true,
    points
  }));
};
