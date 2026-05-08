// 批量外链评论自动化 API
const express = require('express');
const router = express.Router();

const { db, queryOne, exec, transaction } = require('./db');

// 生成 UUID v4
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ==================== 端点1：创建批次并批量插入 URL ====================
// POST /api/batch/create
router.post('/batch/create', async (req, res) => {
  const { batchId: givenBatchId, userId, totalCount, urls } = req.body || {};

  if (!userId) {
    return res.status(400).json({ code: 400, message: '缺少 userId 参数' });
  }
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ code: 400, message: 'urls 参数无效或为空' });
  }

  const batchId = givenBatchId || uuidv4();

  const existing = await queryOne`SELECT batch_id FROM batch_jobs WHERE batch_id = ${batchId}`;
  if (existing) {
    return res.status(409).json({ code: 409, message: 'batchId 已存在，请使用新的 batchId' });
  }

  try {
    await transaction(async (tx) => {
      await tx.exec`
        INSERT INTO batch_jobs (batch_id, user_id, total_count, pending_count, status)
        VALUES (${batchId}, ${userId}, ${urls.length}, ${urls.length}, 'pending')
      `;
      for (const item of urls) {
        await tx.exec`
          INSERT INTO batch_urls (batch_id, original_index, url, result, result_mark)
          VALUES (${batchId}, ${item.originalIndex}, ${item.url}, NULL, NULL)
        `;
      }
    });

    return res.status(200).json({
      code: 0,
      message: 'ok',
      data: { batchId, totalCount: urls.length, pendingCount: urls.length }
    });
  } catch (err) {
    console.error('[batch/create] 错误:', err.message);
    return res.status(500).json({ code: 500, message: '服务器内部错误', error: err.message });
  }
});

// ==================== 端点2：轮询获取下一个待处理 URL ====================
// GET /api/batch/:batchId/next-url
router.get('/batch/:batchId/next-url', async (req, res) => {
  const { batchId } = req.params;

  try {
    const job = await queryOne`SELECT status FROM batch_jobs WHERE batch_id = ${batchId}`;
    if (!job) {
      return res.status(404).json({ code: 404, message: '批次不存在' });
    }
    if (job.status === 'completed' || job.status === 'paused') {
      return res.status(200).json({ code: 0, data: null, message: job.status });
    }

    // 原子性获取下一条待处理 URL
    const urlRow = await db.prepare(`
      SELECT id, original_index as originalIndex, url
      FROM batch_urls
      WHERE batch_id = ? AND result IS NULL
      ORDER BY id
      LIMIT 1
    `).get(batchId);

    if (!urlRow) {
      await exec`UPDATE batch_jobs SET status = 'completed', updated_at = NOW() WHERE batch_id = ${batchId} AND status = 'pending'`;
      return res.status(200).json({ code: 0, data: null, message: 'completed' });
    }

    return res.status(200).json({
      code: 0,
      data: {
        urlId: urlRow.id,
        url: urlRow.url,
        originalIndex: urlRow.originalIndex
      }
    });
  } catch (err) {
    console.error('[batch/next-url] 错误:', err.message);
    return res.status(500).json({ code: 500, message: '服务器内部错误', error: err.message });
  }
});

// ==================== 端点3：上报单条处理结果 ====================
// POST /api/batch/:batchId/report
router.post('/batch/:batchId/report', async (req, res) => {
  const { batchId } = req.params;
  const { urlId, result, aiContent, errorMessage } = req.body || {};

  if (!urlId) {
    return res.status(400).json({ code: 400, message: '缺少 urlId 参数' });
  }
  if (!result || !['success', 'fail'].includes(result)) {
    return res.status(400).json({ code: 400, message: 'result 参数无效，必须为 success 或 fail' });
  }

  try {
    const job = await queryOne`SELECT status FROM batch_jobs WHERE batch_id = ${batchId}`;
    if (!job) {
      return res.status(404).json({ code: 404, message: '批次不存在' });
    }

    const existing = await queryOne`SELECT result FROM batch_urls WHERE id = ${urlId} AND batch_id = ${batchId}`;
    if (!existing) {
      return res.status(404).json({ code: 404, message: 'urlId 不属于该批次' });
    }
    if (existing.result !== null) {
      return res.status(200).json({ code: 0, message: '已处理，忽略重复上报' });
    }

    const isSuccess = result === 'success' ? 1 : 0;
    const isFail = result === 'fail' ? 1 : 0;

    await transaction(async (tx) => {
      await tx.exec`
        UPDATE batch_urls
        SET result = ${result},
            result_mark = ${result === 'success' ? '√' : '×'},
            ai_content = ${aiContent || null},
            error_message = ${errorMessage || null},
            processed_at = NOW()
        WHERE id = ${urlId} AND batch_id = ${batchId}
      `;
      await tx.exec`
        UPDATE batch_jobs
        SET pending_count = pending_count - 1,
            success_count = success_count + ${isSuccess},
            fail_count = fail_count + ${isFail},
            status = CASE WHEN pending_count - 1 <= 0 THEN 'completed' ELSE status END,
            updated_at = NOW()
        WHERE batch_id = ${batchId}
      `;
    });

    return res.status(200).json({ code: 0, message: 'ok' });
  } catch (err) {
    console.error('[batch/report] 错误:', err.message);
    return res.status(500).json({ code: 500, message: '服务器内部错误', error: err.message });
  }
});

// ==================== 端点4：查询批次状态 ====================
// GET /api/batch/:batchId/status
router.get('/batch/:batchId/status', async (req, res) => {
  const { batchId } = req.params;

  try {
    const job = await queryOne`
      SELECT batch_id as batchId, user_id as userId,
             total_count as totalCount, pending_count as pendingCount,
             success_count as successCount, fail_count as failCount,
             status, created_at as createdAt, updated_at as updatedAt
      FROM batch_jobs
      WHERE batch_id = ${batchId}
    `;

    if (!job) {
      return res.status(404).json({ code: 404, message: '批次不存在' });
    }

    return res.status(200).json({ code: 0, data: job });
  } catch (err) {
    console.error('[batch/status] 错误:', err.message);
    return res.status(500).json({ code: 500, message: '服务器内部错误', error: err.message });
  }
});

// ==================== 端点5：导出结果 CSV ====================
// GET /api/batch/:batchId/export
router.get('/batch/:batchId/export', async (req, res) => {
  const { batchId } = req.params;

  try {
    const job = await queryOne`SELECT batch_id FROM batch_jobs WHERE batch_id = ${batchId}`;
    if (!job) {
      return res.status(404).json({ code: 404, message: '批次不存在' });
    }

    const rows = await db.prepare(`
      SELECT original_index as originalIndex, url, result, result_mark as resultMark,
             ai_content as aiContent, error_message as errorMessage, processed_at as processedAt
      FROM batch_urls
      WHERE batch_id = ?
      ORDER BY original_index
    `).all(batchId);

    const header = 'originalIndex,url,result,resultMark,aiContent,errorMessage,processedAt';
    const csvRows = rows.map((u) => {
      const escape = (val) => {
        if (val == null) return '';
        const str = String(val);
        if (str.includes('"') || str.includes(',') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      return [
        u.originalIndex,
        escape(u.url),
        escape(u.result),
        escape(u.resultMark),
        escape(u.aiContent),
        escape(u.errorMessage),
        escape(u.processedAt)
      ].join(',');
    });

    const csvContent = [header, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="batch_result_${batchId}.csv"`);
    return res.send(csvContent);
  } catch (err) {
    console.error('[batch/export] 错误:', err.message);
    return res.status(500).json({ code: 500, message: '服务器内部错误', error: err.message });
  }
});

module.exports = router;
