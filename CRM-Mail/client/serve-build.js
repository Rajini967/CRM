const http = require('http');
const path = require('path');
const handler = require('serve-handler');

const BUILD_DIR = path.resolve(__dirname, 'build');
const PORT = Number(process.env.CLIENT_PORT || process.env.PORT || 5000);

const server = http.createServer((request, response) => {
  handler(request, response, {
    public: BUILD_DIR,
    cleanUrls: true,
    rewrites: [
      { source: '**', destination: '/index.html' }
    ],
    headers: [
      {
        source: '**/*.@(js|css)',
        headers: [
          { key: 'Cache-Control', value: 'public,max-age=31536000,immutable' }
        ]
      }
    ]
  }).catch((error) => {
    console.error('Static handler error:', error);
    if (!response.headersSent) {
      response.writeHead(500, { 'Content-Type': 'text/plain' });
    }
    response.end('Internal server error');
  });
});

server.on('error', (error) => {
  console.error('Client static server error:', error);
  process.exitCode = 1;
});

server.listen(PORT, () => {
  console.log(`🟢 CRM client static build served from ${BUILD_DIR} on port ${PORT}`);
});

