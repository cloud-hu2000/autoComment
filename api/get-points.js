const { sql } = require('./storage');

/**
 * 查询用户积分
 * GET /api/get-points?userId=xxx
 * 用户不存在时返回 0 积分
 */
module.exports = async function getPoints(req, res, query) {
  const { userId } = query;

  if (!userId) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: '缺少 userId 参数' }));
    return;
  }

  try {
    const rows = await sql`
      SELECT points FROM auto_comment_users WHERE user_id = ${userId}
    `;

    const points = rows.length > 0 ? rows[0].points : 0;

    res.writeHead(200);
    res.end(JSON.stringify({ success: true, points }));
  } catch (err) {
    console.error('[get-points] 数据库查询失败:', err.message);
    res.writeHead(500);
    res.end(JSON.stringify({ error: '数据库查询失败', message: err.message }));
  }
};
