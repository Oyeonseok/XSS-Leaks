const DEFAULT_PORT = 1337;
const DEFAULT_DOMAIN = 'example.localhost';
const DEFAULT_ATTACKER_DOMAIN = 'attacker.localhost';
const DEFAULT_ATTACKER_UPSTREAM = 'http://host.docker.internal:3001';
const DEFAULT_SITE_PROTOCOL = 'http:';
const DEFAULT_DISABLE_SOCKET_POOL_RANDOMIZATION = false;
const DEFAULT_MIRROR_FLAG_TO_EXPLOIT_ORIGIN = false;

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
const ATTACKER_DOMAIN = readString(process.env.ATTACKER_DOMAIN, DEFAULT_ATTACKER_DOMAIN);
const ATTACKER_UPSTREAM = readString(process.env.ATTACKER_UPSTREAM, DEFAULT_ATTACKER_UPSTREAM);
const SITE = readString(process.env.SITE, `${DEFAULT_SITE_PROTOCOL}//${DOMAIN}:${PORT}`);
const FLAG = readString(process.env.FLAG, '');
const PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH;
const DISABLE_SOCKET_POOL_RANDOMIZATION = readBoolean(
  process.env.DISABLE_SOCKET_POOL_RANDOMIZATION,
  DEFAULT_DISABLE_SOCKET_POOL_RANDOMIZATION
);
const MIRROR_FLAG_TO_EXPLOIT_ORIGIN = readBoolean(
  process.env.MIRROR_FLAG_TO_EXPLOIT_ORIGIN,
  DEFAULT_MIRROR_FLAG_TO_EXPLOIT_ORIGIN
);

if (!FLAG) {
  throw new Error('FLAG environment variable is required');
}

console.log(`[*] Flag configured (length=${FLAG.length})`);

module.exports = {
  ATTACKER_DOMAIN,
  ATTACKER_UPSTREAM,
  DISABLE_SOCKET_POOL_RANDOMIZATION,
  DOMAIN,
  FLAG,
  MIRROR_FLAG_TO_EXPLOIT_ORIGIN,
  PORT,
  PUPPETEER_EXECUTABLE_PATH,
  SITE
};
