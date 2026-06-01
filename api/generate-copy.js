const { execute, queryOne } = require('./db');
const { findBlockedKeyword, loadBlockedKeywords } = require('./blocked-keywords');

const POINTS_COST_PER_GENERATION = 1;

const LINK_HREF_NEWLINE_RULE = [
  '',
  '【链接格式要求】',
  'If you output any HTML link, the href attribute value MUST contain a real line break immediately before the closing double quote.',
  'Correct example:',
  '<a href="https://example.com/',
  '">点击这里</a>',
  'Wrong examples:',
  '<a href="https://example.com/">点击这里</a>',
  '<a href="https://example.com/\\n">点击这里</a>',
  'The required line break must be an actual newline character in the output, not the two characters \\ and n.'
].join('\n');

loadBlockedKeywords().catch((err) => {
  console.error('[generate-copy] failed to preload blocked keywords:', err);
});

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function ensureTables() {
  await execute(
    `
      CREATE TABLE IF NOT EXISTS auto_comment_users (
        user_id VARCHAR(255) PRIMARY KEY,
        points INT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `,
    []
  );

  await execute(
    `
      CREATE TABLE IF NOT EXISTS refund_points_log (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id VARCHAR(255) NOT NULL,
        batch_id VARCHAR(36) DEFAULT NULL,
        url TEXT DEFAULT NULL,
        points INT NOT NULL DEFAULT 1,
        reason VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_user_refund_date (user_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `,
    []
  );
}

function getDefaultSkillTemplate() {
  return [
    '你是一个资深的网站营销与文案专家，擅长为各类网站撰写高转化率的推广文案。',
    '请严格根据我提供的"当前网站内容"进行分析和创作，不要凭空捏造网站不存在的功能或信息。',
    '',
    '【输出要求】',
    '1. 先用 1-2 句话高度概括该网站的核心价值和目标用户。',
    '2. 我需要在该网站发表评论，关联到我的网站并吸引用户点击访问我的网站。',
    '3. 语气可以专业但要自然、真实，避免夸张、虚假宣传。',
    '4. 使用英文输出，字数建议控制在 100-200词。'
  ].join('\n');
}

function appendRequiredOutputRules(skillTemplate) {
  return `${skillTemplate.trim()}\n${LINK_HREF_NEWLINE_RULE}`;
}

function buildUserPrompt({ websiteUrl, title, description, bodyText }) {
  const websiteContent = [
    `【网站标题】${title || '(无标题)'}`,
    `【网站 URL】${websiteUrl || '(无URL)'}`,
    description ? `【网站描述】${description}` : '',
    '【页面正文节选】',
    bodyText || '(当前页面正文内容为空或无法提取)'
  ]
    .filter(Boolean)
    .join('\n');

  return [
    '下面是当前网站的内容，请根据 Skill 模板的要求，为该网站生成一份推广文案：',
    '',
    websiteContent
  ].join('\n');
}

async function deductPoint(userId) {
  const row = await queryOne('SELECT points FROM auto_comment_users WHERE user_id = ?', [userId]);
  const currentPoints = row ? Number(row.points) : 0;

  if (currentPoints < POINTS_COST_PER_GENERATION) {
    return { success: false, currentPoints };
  }

  const remainingPoints = currentPoints - POINTS_COST_PER_GENERATION;
  await execute(
    `
      INSERT INTO auto_comment_users (user_id, points, updated_at)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE points = VALUES(points), updated_at = NOW()
    `,
    [userId, remainingPoints]
  );

  return { success: true, remainingPoints };
}

async function refundPoint(userId, url, reason) {
  await execute(
    `
      INSERT INTO refund_points_log (user_id, url, points, reason, created_at)
      VALUES (?, ?, ?, ?, NOW())
    `,
    [userId, url || null, POINTS_COST_PER_GENERATION, reason]
  );

  const result = await execute(
    `
      INSERT INTO auto_comment_users (user_id, points, updated_at)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE points = points + VALUES(points), updated_at = NOW()
    `,
    [userId, POINTS_COST_PER_GENERATION]
  );

  return result;
}

async function generateWithQwen(skillTemplate, userPrompt) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    throw new Error('后端未配置通义千问 API Key，请联系管理员。');
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
        model: process.env.QWEN_MODEL || 'qwen-plus',
        messages: [
          { role: 'system', content: skillTemplate },
          { role: 'user', content: userPrompt }
        ]
      })
    }
  );

  if (!qwenResponse.ok) {
    const errorText = await qwenResponse.text();
    console.error('[generate-copy] qwen failed:', qwenResponse.status, errorText);
    throw new Error('通义千问接口调用失败，请稍后重试。');
  }

  const qwenData = await qwenResponse.json();
  return (
    qwenData &&
    qwenData.choices &&
    qwenData.choices[0] &&
    qwenData.choices[0].message &&
    qwenData.choices[0].message.content
  ) || '';
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const body = req.body || {};
  const { userId, websiteUrl, title, description, bodyText, skillTemplate } = body;

  if (!userId) {
    return res.status(400).json({ success: false, error: '缺少 userId 参数' });
  }

  try {
    await ensureTables();

    const deducted = await deductPoint(userId);
    if (!deducted.success) {
      return res.status(200).json({
        success: false,
        error: '积分不足',
        currentPoints: deducted.currentPoints,
        requiredPoints: POINTS_COST_PER_GENERATION
      });
    }

    const baseTemplate = skillTemplate && skillTemplate.trim()
      ? skillTemplate.trim()
      : getDefaultSkillTemplate();
    const template = appendRequiredOutputRules(baseTemplate);
    const userPrompt = buildUserPrompt({ websiteUrl, title, description, bodyText });
    const generatedText = await generateWithQwen(template, userPrompt);

    const blockedKeyword = await findBlockedKeyword(generatedText);
    if (blockedKeyword) {
      await refundPoint(userId, websiteUrl, `blocked_keyword:${blockedKeyword}`);
      console.log('[generate-copy] blocked generated copy and refunded point:', {
        userId,
        websiteUrl,
        blockedKeyword
      });

      return res.status(200).json({
        success: true,
        text: '',
        blocked: true,
        remainingPoints: deducted.remainingPoints + POINTS_COST_PER_GENERATION
      });
    }

    return res.status(200).json({
      success: true,
      text: generatedText,
      remainingPoints: deducted.remainingPoints
    });
  } catch (err) {
    console.error('[generate-copy] error:', err);
    return res.status(500).json({ success: false, error: '服务器内部错误', message: err.message });
  }
};
