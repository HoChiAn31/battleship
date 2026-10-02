// Minimal static file server. Browsers block ES modules on file://, so the game needs http://.
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath);

  if (!filePath.startsWith(root + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const data = await readFile(filePath);
    const type = contentTypes[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type }).end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

server.listen(port, () => {
  console.log(`Battleships running at http://localhost:${port}`);
});
