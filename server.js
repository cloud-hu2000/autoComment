// 阿里云服务器部署入口
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 解析 JSON 请求体
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// 允许跨域
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  next();
});

// 挂载各 API 路由
app.use('/api', require('./api/generate-copy'));
app.use('/api', require('./api/get-points'));
app.use('/api', require('./api/deduct-points'));

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 静态文件（如果有）
app.use(express.static(path.join(__dirname, 'public')));

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// 启动
app.listen(PORT, () => {
  console.log(`[Server] 后端服务已启动，监听端口 ${PORT}`);
});
