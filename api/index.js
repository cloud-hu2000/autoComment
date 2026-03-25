// API路由配置
const http = require('http');
const url = require('url');

const deductPoints = require('./deduct-points');
const getPoints = require('./get-points');

const server = http.createServer(async (req, res) => {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // 设置JSON响应头
  res.setHeader('Content-Type', 'application/json');

  try {
    let body = '';
    if (req.method === 'POST') {
      for await (const chunk of req) {
        body += chunk;
      }
    }

    const query = parsedUrl.query;

    if (pathname === '/api/deduct-points' && req.method === 'POST') {
      await deductPoints(req, res, JSON.parse(body || '{}'));
    } else if (pathname === '/api/get-points' && req.method === 'GET') {
      await getPoints(req, res, query);
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not Found' }));
    }
  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Internal Server Error', message: error.message }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
