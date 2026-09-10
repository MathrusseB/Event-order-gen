// A static file server for the app under test.
//
// The app is ES modules and `fetch`es data/sample.json, so it cannot be opened
// over `file://` — module scripts and that fetch are both blocked by the origin
// rules. One http server, on an ephemeral port, serving the repo as-is: no
// build step, no bundler, nothing rewritten on the way out. What the browser
// loads here is byte-for-byte what Railway serves.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

/**
 * Serve `root` on an ephemeral port.
 *
 * @param {string} root absolute path to the repository root
 * @returns {Promise<{origin: string, close: () => Promise<void>}>}
 */
export async function serve(root) {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const requested = url.pathname === '/' ? '/index.html' : url.pathname;
    // Resolved against the root and then checked: a request for
    // `/../../etc/passwd` is a 403, not a file read.
    const file = path.resolve(root, `.${decodeURIComponent(requested)}`);
    if (!file.startsWith(path.resolve(root))) {
      response.writeHead(403).end('Outside the served root.');
      return;
    }
    try {
      const body = await fs.readFile(file);
      response.writeHead(200, {
        'content-type': CONTENT_TYPES[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store'
      });
      response.end(body);
    } catch {
      response.writeHead(404).end('Not found.');
    }
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}
