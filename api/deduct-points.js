const { sql } = require('./storage');

/**
 * 扣减用户积分
 * POST /api/deduct-points
 * Body: { userId: string, points: number }
 */
module.exports = async function deductPoints(req, res, body) {
  const { userId, points } = body;

  if (!userId || !points) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: '缺少必要参数' }));
    return;
  }

  try {
    // 查询当前积分
    const rows = await sql`
      SELECT points FROM auto_comment_users WHERE user_id = ${userId}
    `;

    const currentPoints = rows.length > 0 ? rows[0].points : 0;

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
    await sql`
      INSERT INTO auto_comment_users (user_id, points, updated_at)
      VALUES (${userId}, ${newPoints}, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id)
      DO UPDATE SET points = EXCLUDED.points, updated_at = CURRENT_TIMESTAMP
    `;

    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      deductedPoints: points,
      remainingPoints: newPoints
    }));
  } catch (err) {
    console.error('[deduct-points] 数据库操作失败:', err.message);
    res.writeHead(500);
    res.end(JSON.stringify({ error: '数据库操作失败', message: err.message }));
  }
};
