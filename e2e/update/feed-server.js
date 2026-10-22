'use strict';

// The release feed, served from the machine itself.
//
// The app finds its next version on a release feed: in production that is the
// GitHub releases page, and here it is a directory on disk, served over HTTP
// the way a server serves it. Same shape, same files, same names — so the
// app takes the same road in the test as it does in the world.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const TYPES = {
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.zip': 'application/zip',
  '.dmg': 'application/x-apple-diskimage',
  '.blockmap': 'application/octet-stream',
};

/**
 * Serves a directory as a release feed.
 *
 * @param {string} root the directory holding the feed
 * @param {number} port the port to listen on
 * @returns {Promise<{ url: string, close: () => Promise<void>, requests: string[] }>}
 */
function serveFeed(root, port) {
  const requests = [];

  const server = http.createServer((request, response) => {
    const name = decodeURIComponent((request.url || '/').split('?')[0]);
    requests.push(name);
    // The feed only ever serves the files it holds: a name that tries to
    // climb out of the directory is refused.
    const file = path.join(root, path.normalize(name).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.statusCode = 404;
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Content-Length': fs.statSync(file).size,
    });
    fs.createReadStream(file).pipe(response);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () =>
          new Promise((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

module.exports = { serveFeed };
