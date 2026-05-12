// 批量外链评论自动化 API（简化版：只提供评论生成）
const express = require('express');
const router = express.Router();

// 生成评论（保持原有逻辑不变）
router.post('/generate-comment', async (req, res) => {
  const { targetUrl, userId } = req.body || {};

  if (!targetUrl) {
    return res.status(400).json({ code: 400, message: '缺少 targetUrl 参数' });
  }
  if (!userId) {
    return res.status(400).json({ code: 400, message: '缺少 userId 参数' });
  }

  try {
    const { generateComment } = require('./comment');
    const result = await generateComment(targetUrl, userId);
    return res.json({ code: 0, data: result });
  } catch (err) {
    console.error('[generate-comment] 错误:', err.message);
    return res.status(500).json({ code: 500, message: '服务器内部错误', error: err.message });
  }
});

module.exports = router;
