# autoComment 项目概述

> 生成时间：2026-05-12
> 项目版本：1.4.0（Chrome 扩展 Manifest V3）

---

## 一、项目定位

**Auto Register Filler** 是一个 Chrome 浏览器扩展，核心功能是：

1. **自动填表** — 自动识别并填写网页上的注册/登录表单（邮箱、用户名、密码）
2. **AI 文案生成** — 调用阿里云通义千问 API，根据目标网站内容自动生成推广评论文案
3. **批量外链评论** — 支持从 CSV 文件导入大量 URL，批量打开页面并自动发评论（积分消耗）
4. **积分制付费系统** — 通过线下充值积分，AI 生成文案和批量处理均消耗积分

---

## 二、技术架构

```
Chrome 扩展端（前端）
  ├── content.js      — 内容脚本，注入所有页面，自动填表 + 识别评论框 + AI生成 + 发送评论
  ├── background.js   — Service Worker，处理批量标签页结果持久化和上报
  ├── batch.js        — 批量处理页面核心逻辑（轮询、标签页管理、重试、进度）
  ├── batch.html      — 批量处理 UI 页面
  ├── options.js      — 扩展设置页逻辑（API Key、Skill模板、用户资料、积分充值）
  ├── options.html    — 扩展设置页 UI
  ├── index.html      — 隐私政策页面
  └── manifest.json   — 扩展配置（Manifest V3）

后端 API（Node.js + Express）
  ├── server.js              — 主入口，挂载路由
  ├── api/
  │   ├── db.js              — 数据库统一入口（支持 SQLite / MySQL）
  │   ├── storage-mysql.js   — MySQL 适配器（积分存储）
  │   ├── storage.js         — 内存 Map 适配器（积分存储，Vercel 用）
  │   ├── batch.js           — 批量处理 API 路由
  │   ├── generate-copy.js   — AI 文案生成 API（通义千问）
  │   ├── get-points.js      — 查询积分 API
  │   └── deduct-points.js   — 扣减积分 API

部署方式：
  - 后端：阿里云 2核2G + Nginx + PM2 + SQLite（WAL模式）
  - 前端 API 地址：https://jieyunsang.cn/api（硬编码在多个文件中）
```

---

## 三、核心文件速查

| 文件 | 行数 | 职责 |
|------|------|------|
| `content.js` | ~3000 | 填表、AI生成评论、自动发送（入口在末尾） |
| `background.js` | ~90 | 批量结果持久化 + 上报服务器（不受页面关闭影响） |
| `batch.js` | ~914 | 批量处理核心逻辑：轮询、标签页调度、重试、进度显示 |
| `batch.html` | — | 批量处理 UI |
| `options.js` | ~300 | 设置页：保存 API Key、Skill 模板、用户信息、积分管理 |
| `options.html` | — | 设置页 UI |
| `api/batch.js` | ~248 | 后端批量 API（create / next-url / report / status / export） |
| `api/db.js` | — | 数据库抽象层，根据 `DATABASE_TYPE` 自动选择适配器 |
| `server.js` | ~50 | Express 主服务，端口 3000 |

---

## 四、API 接口清单

**后端基础地址：** `https://jieyunsang.cn/api`（`content.js`、`background.js`、`options.js` 中硬编码）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/batch/create` | 创建批次，上传 URL 列表 |
| GET | `/api/batch/:batchId/next-url` | 原子性获取下一条待处理 URL |
| POST | `/api/batch/:batchId/report` | 上报单条处理结果 |
| GET | `/api/batch/:batchId/status` | 查询批次状态 |
| GET | `/api/batch/:batchId/export` | 导出结果 CSV |
| POST | `/api/generate-copy` | AI 生成推广文案（通义千问） |
| GET | `/api/get-points` | 查询用户积分 |
| POST | `/api/deduct-points` | 扣减积分 |

---

## 五、关键设计要点

### 5.1 用户身份识别
- 用户 ID 基于**浏览器指纹**生成，存储在 `chrome.storage.local`（key: `auto_comment_user_id`）
- 换浏览器需要重新充值

### 5.2 积分系统
- 积分存在服务器的mysql中
- 充值套餐：200分/¥9.9、500分/¥19.9，新用户送10积分
- **开发者模式**：`content.js` 和 `options.js` 中 `DEV_MODE = true` 可获得无限积分（1000）

### 5.3 批量处理流程
```
上传CSV → 解析URL（Papaparse） → POST /api/batch/create
→ 轮询 GET /api/batch/:id/next-url
→ chrome.tabs.create 打开目标页
→ content.js 识别评论框 → AI生成 → 自动发送
→ background.js 上报结果 → 更新进度
→ 完成后导出CSV
```

### 5.4 速率控制
- 扩展端：最多 3 个并发标签页，轮询间隔 3 秒
- 服务器端：每条 URL 处理有积分校验

### 5.5 数据库
- 开发/生产：使用阿里云的mysql

---

## 六、配置修改注意事项

修改以下文件时需同步更新 API 地址（当前统一指向 `https://jieyunsang.cn/api`）：

- `content.js` — POINTS_API_BASE（第 287 行附近）
- `options.js` — POINTS_API_BASE（第 14 行附近）
- `background.js` — BATCH_API_BASE（第 10 行附近）

开发者模式开关：
- `content.js` 第 287 行：`const DEV_MODE = true;`
- `options.js` 第 186 行：`const DEV_MODE = true;`

---

## 七、快速开发命令

```bash
# 后端本地启动
npm start

# PM2 管理（阿里云部署）
npm run pm2:start
npm run pm2:restart
npm run pm2:logs

# 扩展加载
# chrome://extensions/ → 开启开发者模式 → 加载已解压扩展程序 → 选择项目目录
```

---

## 八、当前状态

- 项目使用 Git 仓库
- 后端部署在阿里云 `jieyunsang.cn`，由 Nginx 反向代理到端口 3000
- 前端 API 地址硬编码，未使用环境变量
