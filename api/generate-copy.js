const express = require('express');
const router = express.Router();

const { queryOne, exec } = require('./storage');

const POINTS_COST_PER_GENERATION = 1;

/**
 * 生成推广文案
 * POST /api/generate-copy
 * Body: { userId, websiteUrl, title, description, bodyText, skillTemplate }
 */
router.post('/generate-copy', async (req, res) => {

  const { userId, websiteUrl, title, description, bodyText, skillTemplate } = req.body || {};

  if (!userId) {
    res.status(400).json({ error: '缺少 userId 参数' });
    return;
  }

  try {
    // 1. 查询当前积分
    const row = queryOne`SELECT points FROM auto_comment_users WHERE user_id = ${userId}`;
    const currentPoints = row ? row.points : 0;

    if (currentPoints < POINTS_COST_PER_GENERATION) {
      res.status(200).json({
        success: false,
        error: '积分不足',
        currentPoints,
        requiredPoints: POINTS_COST_PER_GENERATION
      });
      return;
    }

    const newPoints = currentPoints - POINTS_COST_PER_GENERATION;

    // 2. 扣减积分（UPSERT）
    if (row) {
      exec`UPDATE auto_comment_users SET points = ${newPoints}, updated_at = datetime('now') WHERE user_id = ${userId}`;
    } else {
      exec`INSERT INTO auto_comment_users (user_id, points, updated_at) VALUES (${userId}, ${newPoints}, datetime('now'))`;
    }

    // 3. 构造发送给通义千问的内容
    const DEFAULT_SKILL_TEMPLATE = [
      '你是一个资深的网站营销与文案专家，擅长为各类网站撰写高转化率的推广文案。',
      '请严格根据我提供的"当前网站内容"进行分析和创作，不要凭空捏造网站不存在的功能或信息。',
      '',
      '【输出要求】',
      '1. 先用 1–2 句话高度概括该网站的核心价值和目标用户。',
      '2. 我需要在该网站发表评论，关联到我的网站并吸引用户点击访问我的网站。',
      '3. 语气可以专业但要自然、真实，避免夸张、虚假宣传。',
      '4. 使用英文输出，字数建议控制在 100-200词。'
    ].join('\n');

    const template = skillTemplate && skillTemplate.trim() ? skillTemplate : DEFAULT_SKILL_TEMPLATE;

    const websiteContent = [
      `【网站标题】${title || '(无标题)'}`,
      `【网站 URL】${websiteUrl || '(无URL)'}`,
      description ? `【网站描述】${description}` : '',
      '【页面正文节选】',
      (bodyText || '(当前页面正文内容为空或无法提取)')
    ]
      .filter(Boolean)
      .join('\n');

    const userPrompt = [
      '下面是当前网站的内容，请根据 Skill 模板的要求，为该网站生成一份推广文案：',
      '',
      websiteContent
    ].join('\n');

    // 4. 调用通义千问
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) {
      console.error('[generate-copy] DASHSCOPE_API_KEY 环境变量未配置');
      res.status(500).json({ error: '后端未配置通义千问 API Key，请联系管理员。' });
      return;
    }

    const qwenResponse = await fetch(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'qwen-plus',
          messages: [
            { role: 'system', content: template },
            { role: 'user', content: userPrompt }
          ]
        })
      }
    );

    if (!qwenResponse.ok) {
      const errorText = await qwenResponse.text();
      console.error('[generate-copy] 通义千问调用失败：', qwenResponse.status, errorText);
      res.status(502).json({ error: '通义千问接口调用失败，请稍后重试。' });
      return;
    }

    const qwenData = await qwenResponse.json();
    const generatedText =
      qwenData &&
      qwenData.choices &&
      qwenData.choices[0] &&
      qwenData.choices[0].message &&
      qwenData.choices[0].message.content
        ? qwenData.choices[0].message.content
        : '';

    res.status(200).json({
      success: true,
      text: generatedText,
      remainingPoints: newPoints
    });
  } catch (err) {
    console.error('[generate-copy] 错误：', err.message);
    res.status(500).json({ error: '服务器内部错误', message: err.message });
  }
});

module.exports = router;
