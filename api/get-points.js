const express = require('express');
const router = express.Router();

const { queryOne } = require('./db');

/**
 * 查询用户积分
 * GET /api/get-points?userId=xxx
 */
router.get('/get-points', async (req, res) => {
  const { userId } = req.query || {};

  if (!userId) {
    res.status(400).json({ error: '缺少 userId 参数' });
    return;
  }

  try {
    const row = await queryOne`SELECT points FROM auto_comment_users WHERE user_id = ${userId}`;
    console.log(`[get-points] userId=${userId}, row=${JSON.stringify(row)}, DB_PATH=${process.env.DB_PATH || 'default'}`);
    const points = row ? row.points : 0;
    res.status(200).json({ success: true, points });
  } catch (err) {
    console.error('[get-points] 数据库查询失败:', err.message);
    res.status(500).json({ error: '数据库查询失败', message: err.message });
  }
});

module.exports = router;
