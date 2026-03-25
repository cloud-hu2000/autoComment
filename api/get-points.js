const { sql } = require('./storage');

/**
 * 查询用户积分
 * GET /api/get-points?userId=xxx
 */
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { userId } = req.query || {};

  if (!userId) {
    res.status(400).json({ error: '缺少 userId 参数' });
    return;
  }

  try {
    const rows = await sql`
      SELECT points FROM auto_comment_users WHERE user_id = ${userId}
    `;
    const points = rows.length > 0 ? rows[0].points : 0;
    res.status(200).json({ success: true, points });
  } catch (err) {
    console.error('[get-points] 数据库查询失败:', err.message);
    res.status(500).json({ error: '数据库查询失败', message: err.message });
  }
};
