const express = require('express');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const rateLimit = require('express-rate-limit');
const { visit } = require('./bot');
const {
  ATTACKER_DOMAIN,
  ATTACKER_UPSTREAM,
  DOMAIN,
  PORT
} = require('./config');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const TEMPLATE_DIR = path.join(__dirname, '..', '..', 'views');
const REPORT_LIMIT_WINDOW_MS = 60 * 1000;
const REPORT_LIMIT_MAX_REQUESTS = 1;
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept'
};
const VICTIM_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

const createCspDirectives = (nonce) =>
  `default-src 'none'; script-src 'nonce-${nonce}'; connect-src *.${DOMAIN}:${PORT}; base-uri 'none'; frame-ancestors 'none'`;

const applyHeaders = (res, headers) => {
  Object.entries(headers).forEach(([name, value]) => {
    res.setHeader(name, value);
  });
};

const normalizeHost = (hostHeader) =>
  (hostHeader || '').split(':', 1)[0].toLowerCase();

const isVictimHost = (host) =>
  host === DOMAIN ||
  VICTIM_LOCAL_HOSTS.has(host) ||
  host.endsWith(`.${DOMAIN}`);

const isAttackerHost = (host) =>
  host === ATTACKER_DOMAIN ||
  host.endsWith(`.${ATTACKER_DOMAIN}`);

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
    legacyHeaders: false
  });

const applyVictimHeaders = (req, res, next) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.nonce = nonce;

  if (req.path === '/report') {
    applyHeaders(res, CORS_HEADERS);
  } else {
    res.setHeader('Content-Security-Policy', createCspDirectives(nonce));
  }

  next();
};

const sendReportSuccess = (res, result) => {
  res.json({
    success: true,
    message: 'URL reported successfully. The admin will visit it soon.',
    details: result
  });
};

const sendReportFailure = (res, error) => {
  console.error('Error visiting URL:', error);
  res.status(500).json({
    error: 'Failed to process URL report',
    message: error.message
  });
};

const createVictimApp = () => {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(applyVictimHeaders);

  app.set('view engine', 'ejs');
  app.set('views', TEMPLATE_DIR);
  app.use(express.static(PUBLIC_DIR));

  app.post('/report', createReportLimiter(), async (req, res) => {
    const { url } = req.body;
    const validation = validateReportUrl(url);

    if (!validation.valid) {
      return res.status(validation.status).json({ error: validation.error });
    }

    try {
      const result = await visit(url);
      sendReportSuccess(res, result);
    } catch (error) {
      sendReportFailure(res, error);
    }
  });

  app.get('/', (req, res) => {
    res.render('index', { DOMAIN, PORT });
  });

  app.get('/index.html', (req, res) => {
    res.status(404).send('Exploit UI is not served from the victim host');
  });

  return app;
};

const copyProxyResponse = (proxyRes, res) => {
  res.status(proxyRes.statusCode || 502);

  Object.entries(proxyRes.headers).forEach(([name, value]) => {
    if (value !== undefined) {
      res.setHeader(name, value);
    }
  });

  proxyRes.pipe(res);
};

const createBadGatewayHandler = (res) => (error) => {
  console.error('Attacker upstream proxy failed:', error);
  if (!res.headersSent) {
    res.status(502).json({
      error: 'Bad gateway',
      message: `Attacker upstream is unavailable: ${ATTACKER_UPSTREAM}`
    });
  } else {
    res.end();
  }
};

const createAttackerProxy = () => {
  const upstream = new URL(ATTACKER_UPSTREAM);
  const proxyClient = upstream.protocol === 'https:' ? https : http;
  const upstreamPort = upstream.port || (upstream.protocol === 'https:' ? 443 : 80);

  return (req, res) => {
    const headers = {
      ...req.headers,
      host: req.headers.host
    };

    const proxyReq = proxyClient.request(
      {
        protocol: upstream.protocol,
        hostname: upstream.hostname,
        port: upstreamPort,
        method: req.method,
        path: req.originalUrl || req.url,
        headers
      },
      (proxyRes) => copyProxyResponse(proxyRes, res)
    );

    proxyReq.on('error', createBadGatewayHandler(res));

    req.pipe(proxyReq);
  };
};

const createHostRouter = () => {
  const victimApp = createVictimApp();
  const proxyToAttacker = createAttackerProxy();
  const router = express();

  router.use((req, res, next) => {
    const host = normalizeHost(req.headers.host);

    if (isAttackerHost(host)) {
      return proxyToAttacker(req, res);
    }

    if (isVictimHost(host)) {
      return victimApp(req, res, next);
    }

    return res.status(404).json({
      error: 'Unknown host',
      message: `Use ${DOMAIN}:${PORT} or ${ATTACKER_DOMAIN}:${PORT}`
    });
  });

  return router;
};

const createApp = () => createHostRouter();

module.exports = { createApp };
