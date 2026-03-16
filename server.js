// 内容质量仪表盘服务器 - v3.1
// 启动: node server.js
// 访问: http://localhost:8080

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const PUBLIC_DIR = path.join(__dirname, 'dashboard');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);

  // 默认返回index.html
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(PUBLIC_DIR, filePath);

  const extname = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // 文件不存在
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(`
          <h1>404 Not Found</h1>
          <p>File not found: ${req.url}</p>
          <a href="/">返回首页</a>
        `);
      } else {
        // 服务器错误
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`<h1>500 Server Error</h1><p>${err.code}</p>`);
      }
    } else {
      // 成功返回
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║     内容质量输入体系 v3.1 - 智能推荐系统               ║
╠════════════════════════════════════════════════════════╣
║                                                        ║
║  🌐 仪表盘地址: http://localhost:${PORT}                 ║
║                                                        ║
║  功能模块:                                             ║
║    ✅ 热点话题监控                                     ║
║    ✅ 实时质量预警                                     ║
║    ✅ RSS源状态管理                                    ║
║    ✅ 内容分析器                                       ║
║    🆕 智能推荐系统 (v3.1)                              ║
║    🆕 用户兴趣画像 (v3.1)                              ║
║                                                        ║
║  按 Ctrl+C 停止服务器                                 ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
  `);
});

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n\n服务器已关闭');
  process.exit(0);
});
