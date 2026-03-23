const crypto = require('crypto');

const DEFAULT_PORT = 1337;
const DEFAULT_DOMAIN = 'example.localhost';
const DEFAULT_SITE_PROTOCOL = 'http:';
const DEFAULT_DISABLE_SOCKET_POOL_RANDOMIZATION = false;
const DEFAULT_MIRROR_FLAG_TO_EXPLOIT_ORIGIN = false;
const RANDOM_FLAG_BYTE_LENGTH = 12;

const generateRandomFlag = () => {
  // The victim hex-encodes the whole flag into a single subdomain label, so keep
  // the random portion short enough to stay below the 63-character DNS label limit.
  const hex = crypto.randomBytes(RANDOM_FLAG_BYTE_LENGTH).toString('hex');
  return `wsl{${hex}}`;
};

const readString = (value, fallback) => {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  return typeof fallback === 'function' ? fallback() : fallback;
};

const readInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const readBoolean = (value, fallback) => (
  value === undefined ? fallback : value !== 'false'
);

const PORT = readInteger(process.env.PORT, DEFAULT_PORT);
const DOMAIN = readString(process.env.DOMAIN, DEFAULT_DOMAIN);
const SITE = readString(process.env.SITE, `${DEFAULT_SITE_PROTOCOL}//${DOMAIN}:${PORT}`);
const FLAG = readString(process.env.FLAG, generateRandomFlag);
const PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH;
const DISABLE_SOCKET_POOL_RANDOMIZATION = readBoolean(
  process.env.DISABLE_SOCKET_POOL_RANDOMIZATION,
  DEFAULT_DISABLE_SOCKET_POOL_RANDOMIZATION
);
const MIRROR_FLAG_TO_EXPLOIT_ORIGIN = readBoolean(
  process.env.MIRROR_FLAG_TO_EXPLOIT_ORIGIN,
  DEFAULT_MIRROR_FLAG_TO_EXPLOIT_ORIGIN
);

console.log(`[*] Flag generated (length=${FLAG.length})`);

module.exports = {
  DISABLE_SOCKET_POOL_RANDOMIZATION,
  DOMAIN,
  FLAG,
  MIRROR_FLAG_TO_EXPLOIT_ORIGIN,
  PORT,
  PUPPETEER_EXECUTABLE_PATH,
  SITE
};
