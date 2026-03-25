const resolveExpress = () => {
  try {
    return require('express');
  } catch (error) {
    return require('../app/node_modules/express');
  }
};

const express = resolveExpress();

const DEFAULT_SHORT_SLEEP_MS = 250;
const DEFAULT_LONG_SLEEP_MS = 40 * 1000;
const SECOND_TO_MS = 1000;
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept'
};

const createExploitState = () => ({
  log: '',
  updatedAt: null
});

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

const applyHeaders = (res, headers) => {
  Object.entries(headers).forEach(([name, value]) => {
    res.setHeader(name, value);
  });
};

const applyAttackCors = (req, res, next) => {
  applyHeaders(res, CORS_HEADERS);
  next();
};

const serveExploitPage = (exploitPagePath) => (req, res) => {
  res.sendFile(exploitPagePath);
};

const updateExploitState = (req, res, setExploitState) => {
  const { log = '' } = req.body || {};
  setExploitState({
    log: typeof log === 'string' ? log : '',
    updatedAt: Date.now()
  });
  res.json({ ok: true });
};

const createAttackerApp = ({
  exploitPagePath,
  defaultShortSleepMs = DEFAULT_SHORT_SLEEP_MS,
  longSleepMs = DEFAULT_LONG_SLEEP_MS
}) => {
  const app = express();
  let exploitState = createExploitState();
  const sendExploitPage = serveExploitPage(exploitPagePath);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(applyAttackCors);

  app.get('/', sendExploitPage);
  app.get('/index.html', sendExploitPage);

  app.get('/api/exploit-state', (req, res) => {
    res.json(exploitState);
  });

  app.post('/api/exploit-state', (req, res) => {
    updateExploitState(req, res, (nextExploitState) => {
      exploitState = nextExploitState;
    });
  });

  app.get('/40sleep', (req, res) => {
    sendDelayedOk(res, longSleepMs);
  });

  app.get('/ssleep', (req, res) => {
    sendDelayedOk(res, defaultShortSleepMs);
  });

  app.get('/ssleep/:ms', (req, res) => {
    const delay = parseDelay(req.params.ms);
    if (delay === null) {
      return res.status(400).send('Invalid milliseconds parameter');
    }

    sendDelayedOk(res, delay);
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

module.exports = { createAttackerApp };
