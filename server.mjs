import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('./dist/', import.meta.url));
const port = Number(process.env.PORT || 3000);
const origin = 'https://mercury.com';

try {
  await stat(join(dist, 'command.html'));
} catch {
  const result = spawnSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4'
};

function redirect(res, location, status = 307) {
  res.writeHead(status, { location, 'cache-control': 'no-store' });
  res.end();
}

createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/') {
    redirect(res, `/command${url.search}`);
    return;
  }

  if (pathname === '/command' || pathname === '/command/') {
    const body = await readFile(join(dist, 'command.html'));
    res.writeHead(200, { 'content-type': mime['.html'], 'cache-control': 'no-cache' });
    res.end(body);
    return;
  }

  const relative = normalize(pathname.replace(/^\/+/, '')).replace(/^(\.\.[/\\])+/, '');
  const file = join(dist, relative);

  try {
    if ((await stat(file)).isFile()) {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': mime[extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(body);
      return;
    }
  } catch {
  }

  redirect(res, `${origin}${pathname}${url.search}`);
}).listen(port, '0.0.0.0', () => {
  console.log(`Mercury Command running at http://localhost:${port}/command`);
});
