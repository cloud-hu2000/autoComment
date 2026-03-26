const express = require('express');
const router = express.Router();

const { queryOne, exec } = require('./storage');

/**
 * 扣减用户积分
 * POST /api/deduct-points
 * Body: { userId: string, points: number }
 */
router.post('/deduct-points', (req, res) => {
  const { userId, points } = req.body || {};

  if (!userId || points === undefined) {
    res.status(400).json({ error: '缺少必要参数' });
    return;
  }

  try {
    // 查询当前积分
    const row = queryOne`SELECT points FROM auto_comment_users WHERE user_id = ${userId}`;
    const currentPoints = row ? row.points : 0;

    if (currentPoints < points) {
      res.status(200).json({
        success: false,
        error: '积分不足',
        currentPoints,
        requiredPoints: points
      });
      return;
    }

    // 扣减积分
    const newPoints = currentPoints - points;

    if (row) {
      exec`UPDATE auto_comment_users SET points = ${newPoints}, updated_at = datetime('now') WHERE user_id = ${userId}`;
    } else {
      exec`INSERT INTO auto_comment_users (user_id, points, updated_at) VALUES (${userId}, ${newPoints}, datetime('now'))`;
    }

    res.status(200).json({
      success: true,
      deductedPoints: points,
      remainingPoints: newPoints
    });
  } catch (err) {
    console.error('[deduct-points] 数据库操作失败:', err.message);
    res.status(500).json({ error: '数据库操作失败', message: err.message });
  }
});

module.exports = router;
