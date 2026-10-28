// End-to-end checks for server GET /api/items according to contract.md
// Uses only built-in Node.js modules

const assert = require('assert');
const http = require('http');
const { createServer } = require('./server');

function requestJson(options) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(body); } catch (e) {}
        resolve({ status: res.statusCode, body, json });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    // 1. 200 OK (basic fetch)
    {
      const res = await requestJson({ hostname: '127.0.0.1', port, path: '/api/items', method: 'GET' });
      assert.strictEqual(res.status, 200, 'Expected 200 OK');
      assert.ok(res.json && Array.isArray(res.json.data), 'data should be array');
      assert.ok(res.json.meta && typeof res.json.meta.page === 'number', 'meta.page should be number');
    }

    // 2. Filtering by query and status
    {
      const res1 = await requestJson({ hostname: '127.0.0.1', port, path: '/api/items?status=active&limit=100', method: 'GET' });
      assert.strictEqual(res1.status, 200);
      const onlyActive = res1.json.data.every((x) => x.status === 'active');
      assert.ok(onlyActive, 'All items must be active');

      // Build URL with proper encoding for non-ASCII
      const u = new URL(`http://127.0.0.1:${port}/api/items`);
      u.searchParams.set('query', 'Документ');
      u.searchParams.set('limit', '100');
      const res2 = await requestJson({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'GET' });
      assert.strictEqual(res2.status, 200);
      const containsWord = res2.json.data.every((x) => x.title.toLowerCase().includes('документ'.toLowerCase()));
      assert.ok(containsWord, 'Title should contain query substring (case-insensitive)');
    }

    // 3. Empty state when nothing found
    {
      const res = await requestJson({ hostname: '127.0.0.1', port, path: '/api/items?query=ZZNoMatch123', method: 'GET' });
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.json.data));
      assert.strictEqual(res.json.data.length, 0, 'Expected empty data array');
      assert.strictEqual(res.json.meta.total, 0, 'meta.total should be 0');
      assert.strictEqual(res.json.meta.totalPages, 0, 'meta.totalPages should be 0');
    }

    // 4. 400 Bad Request when query shorter than 2
    {
      const res = await requestJson({ hostname: '127.0.0.1', port, path: '/api/items?query=a', method: 'GET' });
      assert.strictEqual(res.status, 400, 'Expected 400 on short query');
      assert.ok(res.json && res.json.code === 'VALIDATION_ERROR', 'Error code should be VALIDATION_ERROR');
      const detailsHasQuery = Array.isArray(res.json.details) && res.json.details.some(d => d.field === 'query');
      assert.ok(detailsHasQuery, 'Error details should include query');
    }

    console.log('All checks passed');
  } catch (e) {
    console.error('Test failed:', e && e.stack || e);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

run();
