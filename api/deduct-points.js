const { users } = require('./storage');

/**
 * 扣减积分
 * POST /api/deduct-points
 * Body: { userId: string, points: number, description?: string }
 */
module.exports = async function deductPoints(req, res, body) {
  const { userId, points, description } = body;

  if (!userId || !points) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: '缺少必要参数' }));
    return;
  }

  const currentPoints = users.get(userId) || 0;

  if (currentPoints < points) {
    res.writeHead(200);
    res.end(JSON.stringify({
      success: false,
      error: '积分不足',
      currentPoints,
      requiredPoints: points
    }));
    return;
  }

  // 扣减积分
  const newPoints = currentPoints - points;
  users.set(userId, newPoints);

  res.writeHead(200);
  res.end(JSON.stringify({
    success: true,
    deductedPoints: points,
    remainingPoints: newPoints
  }));
};
