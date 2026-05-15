const express = require('express');
const router = express.Router();

const { queryOne, exec } = require('./db');

const POINTS_REFUND = 1; // 每次补偿积分数量
const DAILY_REFUND_LIMIT = 50; // 每个用户每天最多补偿次数

/**
 * 补偿积分
 * POST /api/refund-points
 * Body: { userId, batchId, url, reason }
 */
router.post('/refund-points', async (req, res) => {
  const { userId, batchId, url, reason } = req.body || {};

  if (!userId) {
    return res.status(400).json({ error: '缺少 userId 参数' });
  }

  try {
    // 1. 检查今日补偿次数
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const countRow = await queryOne`
      SELECT COUNT(*) as count FROM refund_points_log
      WHERE user_id = ${userId}
        AND DATE(created_at) = ${today}
    `;
    const todayCount = countRow ? countRow.count : 0;

    if (todayCount >= DAILY_REFUND_LIMIT) {
      console.log(`[refund-points] 用户 ${userId} 今日补偿次数已达上限(${DAILY_REFUND_LIMIT}次)`);
      return res.status(200).json({
        success: false,
        error: '今日补偿次数已达上限',
        dailyLimit: DAILY_REFUND_LIMIT,
        todayCount
      });
    }

    // 2. 记录补偿日志
    await exec`
      INSERT INTO refund_points_log (user_id, batch_id, url, points, reason, created_at)
      VALUES (${userId}, ${batchId || null}, ${url || null}, ${POINTS_REFUND}, ${reason || null}, NOW())
    `;

    // 3. 给用户加积分（UPSERT）
    const row = await queryOne`SELECT points FROM auto_comment_users WHERE user_id = ${userId}`;
    const currentPoints = row ? row.points : 0;
    const newPoints = currentPoints + POINTS_REFUND;

    await exec`
      INSERT INTO auto_comment_users (user_id, points, updated_at)
      VALUES (${userId}, ${newPoints}, NOW())
      ON DUPLICATE KEY UPDATE points = points + ${POINTS_REFUND}, updated_at = NOW()
    `;

    console.log(`[refund-points] 用户 ${userId} 补偿成功，+${POINTS_REFUND}积分，当前: ${newPoints}，今日补偿: ${todayCount + 1}/${DAILY_REFUND_LIMIT}`);

    return res.status(200).json({
      success: true,
      refundedPoints: POINTS_REFUND,
      remainingPoints: newPoints,
      todayRefundCount: todayCount + 1,
      dailyLimit: DAILY_REFUND_LIMIT
    });
  } catch (err) {
    console.error('[refund-points] 错误：', err.message);
    res.status(500).json({ error: '服务器内部错误', message: err.message });
  }
});

module.exports = router;
