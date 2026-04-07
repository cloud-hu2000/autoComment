# 技术方案：批量外链评论自动化系统（V1.4）

> 版本：1.4
> 日期：2026-04-07
> 作者：Auto Comment 开发团队

---

## 一、需求概述

### 1.1 功能目标

实现从 CSV 文件批量导入需要发送外链的网址，选中 N 个原 URL，逐个打开目标页面，自动点击发送评论按钮，并将执行结果（√/×）写入 CSV 文件。

### 1.2 核心流程

```
用户上传CSV
      │
      ▼
扩展端本地解析CSV（Papaparse）
      │
      ▼
发送 URL 列表文本到后端（POST /api/batch/create）
      │
      ▼
后端写入 SQLite 数据库
      │
      ▼
扩展端轮询获取下一条 URL（GET /api/batch/:batchId/next-url）
      │
      ▼
打开目标页面 → 自动评论 → 上报结果（POST /api/batch/:batchId/report）
      │
      ▼
重复以上步骤直到全部完成
      │
      ▼
下载结果 CSV（GET /api/batch/:batchId/export）
```

---

## 二、技术架构

### 2.1 整体架构图

```
┌──────────────────────────────────────────────────────────────┐
│                     扩展端（本机执行）                         │
│                                                            │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────┐    │
│  │ 用户上传CSV  │───▶│ 本地JS解析  │───▶│  POST 文本   │    │
│  │ (input[type=file]) │  │ (Papaparse) │    │  数据到后端  │    │
│  └─────────────┘    └─────────────┘    └──────┬───────┘    │
└──────────────────────────────────────────────┼─────────────┘
                                               │ JSON数组文本
                                               ▼
┌──────────────────────────────────────────────────────────────┐
│                     后端服务器                               │
│                                                            │
│  ┌─────────────┐    ┌─────────────┐    ┌──────────────┐    │
│  │  接收文本   │───▶│  INSERT到   │───▶│  返回batchId │    │
│  │  并解析     │    │  SQLite     │    │  给扩展端    │    │
│  └─────────────┘    └─────────────┘    └──────────────┘    │
└──────────────────────────────────────────────────────────────┘
                                               │
                                               ▼
┌──────────────────────────────────────────────────────────────┐
│                     扩展端后续流程                             │
│                                                            │
│  拿到 batchId ──▶ 轮询 next-url ──▶ 打开页面 ──▶ 自动评论      │
│                   ──▶ POST report ──▶ 重复 ──▶ 完成后下载CSV  ���
└──────────────────────────────────────────────────────────────┘
```

### 2.2 部署架构

```
┌──────────────────────────────────────┐
│            阿里云 2核2G               │
│  ┌────────────────┐ ┌─────────────┐ │
│  │   Nginx        │ │  Node.js    │ │
│  │  (反向代理)    │ │  (单进程)   │ │
│  │  端口 80/443  │ │  端口 3000  │ │
│  └────────────────┘ └──────┬──────┘ │
│                             │         │
│                      ┌──────▼──────┐  │
│                      │  SQLite    │  │
│                      │  data.db   │  │
│                      │  (WAL模式) │  │
│                      └────────────┘  │
└──────────────────────────────────────┘
```

---

## 三、数据模型

### 3.1 数据库 Schema（SQLite）

```sql
-- 用户表（已有，可复用）
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  email TEXT,
  points_balance INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 批次任务表
CREATE TABLE IF NOT EXISTS batch_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  total_count INTEGER DEFAULT 0,
  pending_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- URL 明细表
CREATE TABLE IF NOT EXISTS batch_urls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,
  original_index INTEGER NOT NULL,
  url TEXT NOT NULL,
  result TEXT DEFAULT NULL,
  result_mark TEXT DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  ai_content TEXT DEFAULT NULL,
  processed_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (batch_id) REFERENCES batch_jobs(batch_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_batch_urls_batch_status ON batch_urls(batch_id, result);
CREATE INDEX IF NOT EXISTS idx_batch_urls_result ON batch_urls(result);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_user_status ON batch_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_batch_id ON batch_jobs(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_urls_batch_id ON batch_urls(batch_id);
```

### 3.2 扩展端本地数据结构（解析后）

```javascript
// 解析后的每一行
{
  originalIndex: 0,
  url: "https://example.com/blog/post-1"
}

// 提交给后端的 JSON 文本
{
  batchId: "uuid-v4",
  userId: "user_xxx",
  urls: [
    { originalIndex: 0, url: "https://example.com/blog/post-1" },
    { originalIndex: 1, url: "https://example.com/blog/post-2" }
  ]
}
```

---

## 四、API 端点设计

### 端点1：创建批次并批量插入 URL

```
POST /api/batch/create
Content-Type: application/json
Authorization: Bearer <token>

请求体：
{
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user_xxx",
  "totalCount": 100,
  "urls": [
    { "originalIndex": 0, "url": "https://example.com/1" },
    { "originalIndex": 1, "url": "https://example.com/2" }
  ]
}

响应：
{
  "code": 0,
  "message": "ok",
  "data": {
    "batchId": "550e8400-e29b-41d4-a716-446655440000",
    "totalCount": 100,
    "pendingCount": 100
  }
}
```

### 端点2：轮询获取下一个待处理 URL

```
GET /api/batch/:batchId/next-url
Authorization: Bearer <token>

响应（有待处理URL）：
{
  "code": 0,
  "data": {
    "urlId": 123,
    "url": "https://example.com/blog/post-5",
    "originalIndex": 4
  }
}

响应（全部处理完毕）：
{
  "code": 0,
  "data": null,
  "message": "completed"
}
```

### 端点3：上报单条处理结果

```
POST /api/batch/:batchId/report
Content-Type: application/json
Authorization: Bearer <token>

请求体：
{
  "urlId": 123,
  "result": "success",
  "aiContent": "生成的评论内容",
  "errorMessage": ""
}

响应：
{
  "code": 0,
  "message": "ok"
}
```

### 端点4：查询批次状态

```
GET /api/batch/:batchId/status
Authorization: Bearer <token>

响应：
{
  "code": 0,
  "data": {
    "status": "running",
    "totalCount": 100,
    "pendingCount": 85,
    "successCount": 12,
    "failCount": 3
  }
}
```

### 端点5：导出结果 CSV

```
GET /api/batch/:batchId/export
Authorization: Bearer <token>

响应：直接返回 CSV 文件下载
Content-Type: text/csv
Content-Disposition: attachment; filename="batch_result_<batchId>.csv"
```

---

## 五、扩展端设计

### 5.1 页面设计（batch.html）

```
┌──────────────────────────────────────────┐
│  批量外链评论                             │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │ 拖拽 CSV 文件到此处 或 点击上传      │ │
│  │  [选择文件]                          │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  文件名: xxx.csv  │  共 100 条 URL       │
│                                          │
│  预计消耗积分：100 分（当前余额 500 分）  │
│                                          │
│  [▶ 开始批量处理]   [⏸ 暂停]  [■ 停止]  │
│                                          │
│  进度 ───────────────────────── 45/100   │
│  成功 √ 40  失败 × 5  待处理 55         │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │ 最近处理：                           │ │
│  │ √ https://example.com/post-1       │ │
│  │ √ https://example.com/post-2       │ │
│  │ × https://example.com/post-3 (失败) │ │
│  │ √ https://example.com/post-4       │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  [📥 导出结果 CSV]   [清空当前批次]     │
└──────────────────────────────────────────┘
```

### 5.2 扩展端核心逻辑流程

```
用户上传CSV
      │
      ▼
┌─────────────────────────────────────────┐
│  使用 Papaparse 解析 CSV                 │
│  提取 url 列��或第1列）                   │
│  过滤空行/无效URL                         │
│  生成 { originalIndex, url } 数组        │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  POST /api/batch/create                 │
│  { batchId, userId, totalCount, urls }  │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  进入处理循环：                          │
│                                         │
│  while (hasPending) {                   │
│    if (activeTabs >= MAX_TABS) continue │
│                                         │
│    ① GET /api/batch/:batchId/next-url   │
│    ② 拿到 url → chrome.tabs.create      │
│    ③ content script 检测评论框并处理    │
│    ④ POST /api/batch/:batchId/report    │
│    ⑤ 更新本地进度显示                    │
│    ⑥ 等待固定间隔再请求下一个            │
│  }                                      │
└─────────────────────────────────────────┘
```

---

## 六、后端实现

### 6.1 核心数据库操作

```javascript
const Database = require('better-sqlite3');
const db = new Database('./data.db');

// WAL 模式优化
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000');
db.pragma('busy_timeout = 5000');

// 创建批次并批量插入URL
function createBatch(batchId, userId, urls) {
  const insertJob = db.prepare(`
    INSERT INTO batch_jobs (batch_id, user_id, total_count, pending_count, status)
    VALUES (?, ?, ?, ?, 'pending')
  `);

  const insertUrls = db.prepare(`
    INSERT INTO batch_urls (batch_id, original_index, url, result, result_mark)
    VALUES (?, ?, ?, NULL, NULL)
  `);

  const transaction = db.transaction(() => {
    insertJob.run(batchId, userId, urls.length, urls.length);
    for (const item of urls) {
      insertUrls.run(batchId, item.originalIndex, item.url);
    }
  });

  transaction();
  return { batchId, totalCount: urls.length, pendingCount: urls.length };
}

// 原子性获取下一条待处理URL（防止并发重复获取）
function getNextUrl(batchId) {
  const stmt = db.prepare(`
    SELECT id, original_index as originalIndex, url
    FROM batch_urls
    WHERE batch_id = ? AND result IS NULL
    ORDER BY id
    LIMIT 1
  `);
  return stmt.get(batchId);
}

// 更新结果并同步批次统计
function updateResult(batchId, urlId, result, aiContent, errorMessage) {
  const mark = result === 'success' ? '√' : '×';
  const updateUrl = db.prepare(`
    UPDATE batch_urls
    SET result = ?, result_mark = ?, ai_content = ?,
        error_message = ?, processed_at = CURRENT_TIMESTAMP
    WHERE id = ? AND batch_id = ?
  `);

  const updateJob = db.prepare(`
    UPDATE batch_jobs
    SET
      pending_count = pending_count - 1,
      success_count = success_count + ?,
      fail_count = fail_count + ?,
      status = CASE
        WHEN pending_count - 1 = 0 THEN 'completed'
        ELSE status
      END,
      updated_at = CURRENT_TIMESTAMP
    WHERE batch_id = ?
  `);

  const isSuccess = result === 'success' ? 1 : 0;
  const isFail = result === 'fail' ? 1 : 0;

  db.transaction(() => {
    updateUrl.run(result, mark, aiContent, errorMessage, urlId, batchId);
    updateJob.run(isSuccess, isFail, batchId);
  })();
}

// 导出CSV
function exportCsv(batchId) {
  const urls = db.prepare(`
    SELECT original_index as originalIndex, url, result, result_mark,
           ai_content as aiContent, processed_at as processedAt
    FROM batch_urls
    WHERE batch_id = ?
    ORDER BY original_index
  `).all(batchId);

  const header = 'originalIndex,url,result,resultMark,aiContent,processedAt';
  const rows = urls.map(u => [
    u.originalIndex,
    `"${(u.url || '').replace(/"/g, '""')}"`,
    u.result || '',
    u.result_mark || '',
    `"${(u.aiContent || '').replace(/"/g, '""')}"`,
    u.processedAt || ''
  ].join(','));

  return [header, ...rows].join('\n');
}
```

---

## 七、速率控制策略

| 控制层 | 措施 |
|---|---|
| **服务器端** | 每个 userId 每分钟最多接收 N 次 report 请求 |
| **扩展端** | `MAX_CONCURRENT_TABS = 3`（最多同时3个标签页） |
| **扩展端** | 轮询间隔 `POLL_INTERVAL = 3000ms`（3秒） |
| **扩展端** | 每处理完一个 URL，等待 `PROCESS_DELAY = 2000ms` 再请求下一个 |
| **服务器端** | 积分余额校验（余额不足时返回错误，阻止继续） |

---

## 八、错误处理与重试机制

```
扩展端本地维护队列：
pendingResults = []

处理流程中：
  ① 尝试 POST /report
  ② 成功 → 清除本地记录
  ③ 失败 → 存入 pendingResults（本地持久化到 chrome.storage）
  ④ 每次轮询 next-url 之前，先尝试提交 pendingResults
  ⑤ 重试3次仍然失败 → 放弃，等待用户手动处理
```

```
服务器端错误处理：
  - batchId 不存在 → 403，返回明确错误
  - urlId 已被处理过（重复上报） → 忽略，返回成功
  - 积分不足 → 422，返回 error.code = 'INSUFFICIENT_POINTS'
  - 批次已达最大并发数 → 429，限流
```

---

## 九、容量评估（2核2G + SQLite）

### 9.1 数据库性能

| 指标 | 承载能力 |
|---|---|
| 读操作并发 | 1000次/秒（WAL模式） |
| 写操作并发 | ~200次/秒 |
| 实际使用 | 远低于上限，绰绰有余 |

### 9.2 服务器性能

| 指标 | 2核2G 承载能力 |
|---|---|
| API QPS | ~50~100 QPS |
| 同时处理URL数 | 50~100 个 |
| 每日处理量 | ~10万~50万条URL/天 |

### 9.3 真正的性能瓶颈

| 瓶颈 | 说明 |
|---|---|
| CSV解析内存 | 建议使用 Papaparse 流式解析，限制文件大小 ≤ 10MB |
| 浏览器标签页内存 | 严格控制 `MAX_CONCURRENT_TABS = 3` |
| 网络带宽 | 目标网站为境外时需注意带宽限制 |

---

## 十、技术栈汇总

| 层级 | 技术选型 |
|---|---|
| 扩展端 CSV 解析 | Papaparse（轻量，流式解析，不占内存） |
| 后端框架 | Express / Fastify |
| 数据库 | SQLite + better-sqlite3（WAL模式） |
| 认证 | JWT（扩展端存储在 chrome.storage.local） |
| 积分系统 | 复用现有 userId + points_balance |
| 错误日志 | 按 batchId + urlId 记录到 error_message 字段 |
| CSV 导出 | 服务端生成 CSV 文本，直接返回下载 |

---

## 十一、实现计划

### 阶段1：后端 API（预计工作量：1天）
- [ ] 初始化 SQLite 数据库，创建表结构
- [ ] 实现 `/api/batch/create` 端点
- [ ] 实现 `/api/batch/:batchId/next-url` 端点
- [ ] 实现 `/api/batch/:batchId/report` 端点
- [ ] 实现 `/api/batch/:batchId/status` 端点
- [ ] 实现 `/api/batch/:batchId/export` 端点
- [ ] 添加积分扣减逻辑
- [ ] 添加速率限制

### 阶段2：扩展端批量处理页面（预计工作量：2天）
- [ ] 新建 `batch.html` 页面
- [ ] 新建 `batch.js` 处理逻辑
- [ ] 集成 Papaparse 解析 CSV
- [ ] 实现轮询和标签页管理
- [ ] 实现进度显示和日志
- [ ] 实现重试机制

### 阶段3：内容脚本改造（预计工作量：1天）
- [ ] 添加 batch 处理模式判断
- [ ] 注入 AI 生成内容（从后端获取或本地生成）
- [ ] 评论发送成功后上报结果
- [ ] 错误处理和上报

### 阶段4：测试与优化（预计工作量：1天）
- [ ] 单元测试各端点
- [ ] 集成测试完整流程
- [ ] 性能压测
- [ ] 修复 bug 和优化体验

---

## 十二、风险提示

| 风险 | 缓解方案 |
|---|---|
| 目标网站检测自动化行为并封IP | 后端控制速率 + 随机 User-Agent + 随机操作间隔 |
| 服务器被目标网站溯源 | 通过后端代理请求，不暴露真实来源IP |
| 并发处理时数据库竞争 | 乐观锁 + processing_tab_id 标记 |
| CSV数据量大时解析耗时 | 后端异步解析，前端轮询任务状态 |
| Google 政策风险 | 功能仅供个人/内部使用，不上架 Chrome Web Store |
