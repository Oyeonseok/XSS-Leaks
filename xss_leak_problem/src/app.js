const express = require('express');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { visit } = require('./bot');
const { DOMAIN, PORT } = require('./config');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const TEMPLATE_DIR = path.join(__dirname, '..', 'template');
const EXPLOIT_PAGE_PATH = path.join(__dirname, '..', 'exploit', 'exploit.html');
const NONCED_ROUTE_PATTERNS = [
  '/index.html',
  '/40sleep',
  '/ssleep',
  /^\/ssleep\/\d+$/,
  /^\/\d+$/
];
const REPORT_LIMIT_WINDOW_MS = 60 * 1000;
const REPORT_LIMIT_MAX_REQUESTS = 1;
const DEFAULT_SHORT_SLEEP_MS = 250;
const LONG_SLEEP_MS = 40 * 1000;
const SECOND_TO_MS = 1000;

const createCspDirectives = (nonce) =>
  `default-src 'none'; script-src 'nonce-${nonce}'; connect-src *.${DOMAIN}:${PORT}; base-uri 'none'; frame-ancestors 'none'`;

const createExploitState = () => ({
  log: '',
  updatedAt: null
});

const isExploitRoute = (requestPath) =>
  NONCED_ROUTE_PATTERNS.some((pattern) =>
    pattern instanceof RegExp ? pattern.test(requestPath) : pattern === requestPath
  );

const parseDelay = (value, multiplier = 1) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return parsed * multiplier;
};

const sendDelayedOk = (res, ms) => {
  setTimeout(() => {
    res.status(200).send('OK');
  }, ms);
};

const validateReportUrl = (url) => {
  if (!url) {
    return { valid: false, status: 400, error: 'Bad request' };
  }

  try {
    const { protocol } = new URL(url);
    if (!['http:', 'https:'].includes(protocol)) {
      return { valid: false, status: 400, error: 'Bad request' };
    }
  } catch (error) {
    return { valid: false, status: 400, error: 'Invalid URL' };
  }

  return { valid: true };
};

const createReportLimiter = () =>
  rateLimit({
    windowMs: REPORT_LIMIT_WINDOW_MS,
    max: REPORT_LIMIT_MAX_REQUESTS,
    message: {
      error: 'Rate limit exceeded',
      message: 'Too many URL reports'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

const createApp = () => {
  const app = express();
  let exploitState = createExploitState();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    const nonce = crypto.randomBytes(16).toString('base64');
    const exploitRoute = isExploitRoute(req.path);
    res.locals.nonce = nonce;

    if (exploitRoute) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    }

    if (!exploitRoute) {
      res.setHeader('Content-Security-Policy', createCspDirectives(nonce));
    }

    next();
  });

  app.set('view engine', 'ejs');
  app.set('views', TEMPLATE_DIR);

  app.use(express.static(PUBLIC_DIR));

  app.get('/index.html', (req, res) => {
    res.sendFile(EXPLOIT_PAGE_PATH);
  });

  app.get('/api/exploit-state', (req, res) => {
    res.json(exploitState);
  });

  app.post('/api/exploit-state', (req, res) => {
    const { log = '' } = req.body || {};
    exploitState = {
      log: typeof log === 'string' ? log : '',
      updatedAt: Date.now()
    };
    res.json({ ok: true });
  });

  app.get('/40sleep', (req, res) => {
    sendDelayedOk(res, LONG_SLEEP_MS);
  });

  app.get('/ssleep', (req, res) => {
    sendDelayedOk(res, DEFAULT_SHORT_SLEEP_MS);
  });

  app.get('/ssleep/:ms', (req, res) => {
    const delay = parseDelay(req.params.ms);
    if (delay === null) {
      return res.status(400).send('Invalid milliseconds parameter');
    }

    sendDelayedOk(res, delay);
  });

  app.post('/report', createReportLimiter(), async (req, res) => {
    const { url } = req.body;
    const validation = validateReportUrl(url);

    if (!validation.valid) {
      return res.status(validation.status).json({ error: validation.error });
    }

    try {
      exploitState = createExploitState();
      const result = await visit(url);

      res.json({
        success: true,
        message: 'URL reported successfully. The admin will visit it soon.',
        details: result
      });
    } catch (error) {
      console.error('Error visiting URL:', error);
      res.status(500).json({
        error: 'Failed to process URL report',
        message: error.message
      });
    }
  });

  app.get('/', (req, res) => {
    res.render('index', { DOMAIN, PORT });
  });

  app.get('/:sec', (req, res, next) => {
    const delay = parseDelay(req.params.sec, SECOND_TO_MS);
    if (delay === null) {
      return next();
    }

    sendDelayedOk(res, delay);
  });

  return app;
};

module.exports = { createApp };
