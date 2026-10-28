// Simple Node.js server using built-in modules only
// Serves UI at GET / and implements GET /api/items with filtering, pagination, and validation per docs/contract.md

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const PUBLIC_DIR = path.join(__dirname, 'public');

// In-memory dataset: deterministic set of items for testing and demo
const STATUSES = ['active', 'archived', 'draft'];

function generateItems() {
  const items = [];
  const baseDate = new Date('2026-01-01T00:00:00Z').getTime();
  const titles = [
    'Документ проекта',
    'Черновик заметки',
    'Архивный материал',
    'План работ',
    'Отчет по задаче',
    'TestAlpha элемент',
    'Справка пользователя',
    'Руководство администратора',
    'Разработка спецификации',
    'Протокол встречи',
  ];
  let i = 0;
  for (let n = 0; n < 45; n++) {
    const title = titles[n % titles.length] + ' #' + (n + 1);
    const status = STATUSES[n % STATUSES.length];
    const description = n % 3 === 0 ? null : `Описание элемента ${n + 1}`;
    const createdAt = new Date(baseDate + n * 24 * 60 * 60 * 1000).toISOString();
    items.push({
      id: randomUUID(),
      title,
      status,
      description,
      createdAt,
    });
    i++;
  }
  return items;
}

const DATA = generateItems();

// Helpers
function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendHTML(res, status, content) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(content);
}

function serveIndex(req, res) {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  fs.readFile(indexPath, 'utf8', (err, content) => {
    if (err) {
      sendHTML(res, 500, '<h1>500 Internal Server Error</h1>');
      return;
    }
    sendHTML(res, 200, content);
  });
}

// Validation per contract.md
// - query: optional string; allowed letters, digits and space; length 2..200 when provided and non-empty; empty means no filter
// - status: optional string; one of active|archived|draft
// - page: integer >=1 (default 1)
// - limit: integer 1..100 (default 20)
const QUERY_ALLOWED_RE = /^[\p{L}\p{Nd} ]+$/u; // Unicode letters, digits, space

function validateParams(q) {
  const errors = [];

  // query
  let query = q.query;
  if (typeof query === 'string') {
    // treat empty as not provided
    if (query.length > 0) {
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        errors.push({ field: 'query', message: 'Строка поиска должна содержать от 2 символов' });
      } else if (trimmed.length > 200) {
        errors.push({ field: 'query', message: 'Строка поиска не должна превышать 200 символов' });
      } else if (!QUERY_ALLOWED_RE.test(trimmed)) {
        errors.push({ field: 'query', message: 'Допустимы только буквы, цифры и пробелы' });
      }
    }
  } else if (query != null) {
    errors.push({ field: 'query', message: 'Неверный тип параметра' });
  }

  // status
  let status = q.status;
  if (typeof status === 'string') {
    if (!STATUSES.includes(status)) {
      errors.push({ field: 'status', message: 'Недопустимое значение статуса' });
    }
  } else if (status != null) {
    errors.push({ field: 'status', message: 'Неверный тип параметра' });
  }

  // page
  let page = q.page;
  if (page == null || page === '') {
    // ok, will default
  } else {
    const num = Number(page);
    if (!Number.isInteger(num) || num < 1) {
      errors.push({ field: 'page', message: 'page должен быть целым числом >= 1' });
    }
  }

  // limit
  let limit = q.limit;
  if (limit == null || limit === '') {
    // ok, will default
  } else {
    const num = Number(limit);
    if (!Number.isInteger(num) || num < 1 || num > 100) {
      errors.push({ field: 'limit', message: 'limit должен быть целым числом от 1 до 100' });
    }
  }

  return errors;
}

function handleApiItems(req, res, queryParams) {
  const errors = validateParams(queryParams);
  if (errors.length > 0) {
    return sendJSON(res, 400, {
      code: 'VALIDATION_ERROR',
      message: 'Некорректные параметры запроса',
      details: errors,
    });
  }

  const queryRaw = typeof queryParams.query === 'string' ? queryParams.query.trim() : '';
  const hasQuery = queryRaw.length >= 2; // empty or <2 is treated as no filter; validation above already ruled out 1-char
  const status = typeof queryParams.status === 'string' ? queryParams.status : undefined;
  const page = queryParams.page ? Number(queryParams.page) : 1;
  const limit = queryParams.limit ? Number(queryParams.limit) : 20;

  // Filter
  let list = DATA;
  if (hasQuery) {
    const qLower = queryRaw.toLocaleLowerCase();
    list = list.filter((item) => item.title.toLocaleLowerCase().includes(qLower));
  }
  if (status) {
    list = list.filter((item) => item.status === status);
  }

  const total = list.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  // Pagination
  const start = (page - 1) * limit;
  const end = start + limit;
  const paged = start >= total ? [] : list.slice(start, end);

  return sendJSON(res, 200, {
    data: paged,
    meta: {
      page,
      limit,
      total,
      totalPages,
    },
  });
}

function createServer() {
  const server = http.createServer((req, res) => {
    try {
      const parsed = url.parse(req.url, true);
      const method = req.method || 'GET';
      const pathname = parsed.pathname || '/';

      if (method === 'GET' && pathname === '/') {
        return serveIndex(req, res);
      }

      if (method === 'GET' && pathname === '/api/items') {
        return handleApiItems(req, res, parsed.query || {});
      }

      // 404 fallback
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ code: 'NOT_FOUND', message: 'Not Found' }));
    } catch (err) {
      // 500 fallback
      sendJSON(res, 500, { code: 'INTERNAL_ERROR', message: 'Unexpected server error' });
    }
  });

  return server;
}

// Export for tests
module.exports = { createServer };

// If run directly, start listening on PORT or 3000
if (require.main === module) {
  const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
  const srv = createServer();
  srv.listen(PORT, () => {
    console.log(`Server is listening on http://localhost:${PORT}`);
  });
}
