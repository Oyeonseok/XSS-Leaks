const puppeteer = require('puppeteer-core');
const {
  DISABLE_SOCKET_POOL_RANDOMIZATION,
  FLAG,
  MIRROR_FLAG_TO_EXPLOIT_ORIGIN,
  PUPPETEER_EXECUTABLE_PATH,
  SITE
} = require('./config');

const FLAG_REGEX = /^wsl\{.+\}$/;
const NAVIGATION_OPTIONS = { waitUntil: 'domcontentloaded', timeout: 5000 };
const ADMIN_PAGE_SETTLE_DELAY_MS = 100;
const POST_FLAG_SET_DELAY_MS = 500;
const INITIAL_EXPLOIT_LOG_DELAY_MS = 15_000;
const EXPLOIT_LOG_INTERVAL_MS = 30_000;
const MAX_EXPLOIT_OBSERVATION_MS = 480_000;
const SOCKET_POOL_RANDOMIZATION_FLAG = '--disable-features=SocketPoolRandomization';

const sleep = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const closeQuietly = async (resource) => {
  if (!resource) {
    return;
  }

  try {
    await resource.close();
  } catch (error) {
    console.error('Failed to close resource cleanly:', error);
  }
};

const createLaunchArgs = () => {
  const launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--disable-default-apps',
    '--disable-extensions'
  ];

  // The original exploit was reported to work around Chrome 133/134.
  // Keep the newer SocketPoolRandomization mitigation opt-in so the default
  // setup matches the original conditions, while still allowing manual override.
  if (DISABLE_SOCKET_POOL_RANDOMIZATION) {
    launchArgs.push(SOCKET_POOL_RANDOMIZATION_FLAG);
  }

  return launchArgs;
};

const launchBrowser = () =>
  puppeteer.launch({
    headless: true,
    args: createLaunchArgs(),
    dumpio: true,
    pipe: true,
    executablePath: PUPPETEER_EXECUTABLE_PATH
  });

const snapshotExploitLog = async (page, label) => {
  try {
    const exploitLog = await page.evaluate(() => {
      const log = document.getElementById('log');
      return log ? log.value : null;
    });
    if (exploitLog !== null) {
      console.log(`Exploit log snapshot ${label}:\n${exploitLog}`);
      return exploitLog;
    }
  } catch (err) {
    console.error(`Failed to snapshot exploit log (${label}):`, err);
  }

  return null;
};

const ensureFlagFormat = () => {
  if (!FLAG) {
    throw new Error('Error: FLAG is not configured');
  }

  if (!FLAG_REGEX.test(FLAG)) {
    throw new Error('Error: Flag does not match flag regex, contact the author if this is on remote');
  }
};

const seedFlag = async (context, origin) => {
  const page = await context.newPage();

  try {
    await page.goto(origin, NAVIGATION_OPTIONS);
    await sleep(ADMIN_PAGE_SETTLE_DELAY_MS);
    await page.evaluate((flag) => {
      localStorage.setItem('flag', flag);
    }, FLAG);
    console.log(`localStorage flag seeded @ ${origin} (length=${FLAG.length})`);
    await sleep(POST_FLAG_SET_DELAY_MS);
  } finally {
    await closeQuietly(page);
  }
};

const watchExploitLog = async (page) => {
  await sleep(INITIAL_EXPLOIT_LOG_DELAY_MS);
  let exploitLog = await snapshotExploitLog(page, 'after 15s');

  for (
    let elapsed = EXPLOIT_LOG_INTERVAL_MS;
    elapsed <= MAX_EXPLOIT_OBSERVATION_MS;
    elapsed += EXPLOIT_LOG_INTERVAL_MS
  ) {
    if (exploitLog && exploitLog.includes('}')) {
      break;
    }

    await sleep(EXPLOIT_LOG_INTERVAL_MS);
    exploitLog = await snapshotExploitLog(page, `after ${15 + elapsed / 1000}s`);
  }
};

const visit = async (url) => {
  ensureFlagFormat();

  let browser;
  let context;

  try {
    browser = await launchBrowser();
    context = await browser.createIncognitoBrowserContext();

    console.log(`The admin will visit ${SITE} first, and then ${url}`);
    await seedFlag(context, SITE);

    if (MIRROR_FLAG_TO_EXPLOIT_ORIGIN) {
      const exploitOrigin = new URL(url).origin;
      await seedFlag(context, exploitOrigin);
    }
  } catch (error) {
    console.error(error);
    await closeQuietly(browser);

    throw new Error('Error: Setup failed, if this happens consistently on remote contact the admin');
  }

  const observeVisit = (async () => {
    try {
      const page = await context.newPage();

      try {
        await page.goto(url, NAVIGATION_OPTIONS);
        await watchExploitLog(page);
      } finally {
        await closeQuietly(page);
      }
    } catch (error) {
      console.error(error);
    } finally {
      await closeQuietly(browser);
    }
  })();

  observeVisit.catch((error) => {
    console.error('Unexpected visit failure:', error);
  });

  return 'The admin will visit your URL soon';
};

module.exports = { visit };
