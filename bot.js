require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const userAgents = require('user-agents');
const fs = require('fs');

const colors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  white: "\x1b[37m",
  bold: "\x1b[1m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
};

const logger = {
  info: (msg) => console.log(`${colors.green}[✓] ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}[⚠] ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}[✗] ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}[✅] ${msg}${colors.reset}`),
  loading: (msg) => console.log(`${colors.cyan}[⟳] ${msg}${colors.reset}`),
  step: (msg) => console.log(`${colors.white}[➤] ${msg}${colors.reset}`),
  banner: () => {
    console.log(`${colors.cyan}${colors.bold}`);
    console.log(`---------------------------------------------`);
    console.log(`  Goblin Auto   `);
    console.log(`---------------------------------------------${colors.reset}`);
    console.log();
  },
};

const getRandomUserAgent = () => {
  const ua = new userAgents();
  return ua.toString();
};

const getAxiosConfig = (fullCookieString, refererUrl = 'https://www.goblin.meme/') => ({
  headers: {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.7',
    'priority': 'u=1, i',
    'sec-ch-ua': getRandomUserAgent(),
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'sec-gpc': '1',
    'cookie': fullCookieString,
    'Referer': refererUrl,
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  },
});

const getUserAxiosConfig = (fullCookieString, refererUrl = 'https://twitter.com/') => ({
  headers: {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.7',
    'cache-control': 'max-age=0',
    'priority': 'u=0, i',
    'sec-ch-ua': getRandomUserAgent(),
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-user': '?1',
    'sec-gpc': '1',
    'upgrade-insecure-requests': '1',
    'cookie': fullCookieString,
    'Referer': refererUrl,
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  },
});

const fetchUserData = async (fullCookieString) => {
  try {
    logger.loading('Fetching user data...');
    const sessionResponse = await axios.get('https://www.goblin.meme/api/auth/session', getAxiosConfig(fullCookieString, 'https://www.goblin.meme/'));
    if (sessionResponse.status !== 200 || !sessionResponse.data || !sessionResponse.data.user) {
        throw new Error('Invalid session response from /api/auth/session');
    }
    const userData = sessionResponse.data.user;
    
    let rank = 'N/A';
    let totalPoints = 'N/A';
    try {
        const homepageResponse = await axios.get('https://www.goblin.meme/', getUserAxiosConfig(fullCookieString));
        const $ = cheerio.load(homepageResponse.data);
        const rankElement = $('.w-16.h-16.bg-lime-400.rounded-full').text().trim().replace('#', '');
        rank = rankElement ? parseInt(rankElement) : 'N/A';
        const pointsElement = $('.inline-flex.items-center.rounded-md.border.px-2\\.5.py-0\\.5.text-xs').first().text().trim();
        const pointsMatch = pointsElement.match(/(\d+)\s*Total Goblin Points/);
        totalPoints = pointsMatch ? parseInt(pointsMatch[1]) : 'N/A';
    } catch (htmlError) {
        logger.warn(`Could not fetch rank/points from homepage: ${htmlError.message}`);
    }

    logger.success(`User Name: ${userData.name || 'N/A'}`);
    logger.success(`User Rank: #${rank}`);
    logger.success(`Total Goblin Points: ${totalPoints}`);
    return { name: userData.name, rank, totalPoints };
  } catch (error) {
    logger.error(`Failed to fetch user data: ${error.message}`);
    if (error.response) {
      logger.error(`Status: ${error.response.status}, Data: ${typeof error.response.data === 'string' ? error.response.data.substring(0, 200) + '...' : JSON.stringify(error.response.data)}`);
    }
    throw new Error('User data fetch failed, likely due to invalid/expired cookie.');
  }
};

const displayCountdown = (readyAt) => {
  return new Promise((resolve) => {
    if (!readyAt || isNaN(new Date(readyAt).getTime())) {
      logger.warn('Invalid or null readyAt time provided. Skipping countdown.');
      resolve();
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const timeLeft = new Date(readyAt) - now;
      
      if (timeLeft <= 0) {
        process.stdout.write(`\r${colors.green}[⏰] Countdown finished! Mining is ready to be claimed or started.${colors.reset}\n`);
        clearInterval(countdownInterval);
        resolve();
        return;
      }

      const hours = Math.floor(timeLeft / (1000 * 60 * 60));
      const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
      
      process.stdout.write(`\r${colors.cyan}[⏰] Waiting: ${hours}h ${minutes}m ${seconds}s${colors.reset}    `);
    };

    updateCountdown();
    const countdownInterval = setInterval(updateCountdown, 1000);
  });
};

const getBoxDetails = async (boxId, fullCookieString) => {
  try {
    logger.loading(`Checking box details for ID: ${boxId}...`);
    const config = getAxiosConfig(fullCookieString, `https://www.goblin.meme/box/${boxId}`);
    const response = await axios.get(
      `https://www.goblin.meme/api/box/${boxId}`,
      config
    );
    logger.info(`Box Details: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    logger.error(`Failed to get box details for ${boxId}: ${error.message}`);
    if (error.response) {
      logger.error(`Status: ${error.response.status}, Data: ${typeof error.response.data === 'string' ? error.response.data.substring(0, 200) + '...' : JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
};

const startMining = async (boxId, fullCookieString) => {
  try {
    logger.loading('Starting mining...');
    const config = getAxiosConfig(fullCookieString, `https://www.goblin.meme/box/${boxId}`);
    config.headers['Content-Length'] = '0';
    config.headers['Content-Type'] = undefined;
    config.headers['accept'] = 'application/json, text/plain, */*'; 

    const response = await axios.post(
      `https://www.goblin.meme/api/box/${boxId}/start`,
      null,
      config
    );
    
    logger.success(`Mining started: ${response.data.message}`);
    logger.info(`Prize: ${response.data.box.prizeAmount} ${response.data.box.prizeType}`);
    logger.info(`Ready at: ${new Date(response.data.box.readyAt).toLocaleString()}`);
    return response.data.box.readyAt;
  } catch (error) {
    logger.error(`Failed to start mining: ${error.message}`);
    if (error.response) {
      logger.error(`Status: ${error.response.status}, Data: ${typeof error.response.data === 'string' ? error.response.data.substring(0, 200) + '...' : JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
};

const claimBox = async (boxId, fullCookieString) => {
  try {
    logger.loading(`Claiming box ${boxId}...`);
    const claimUrl = `https://www.goblin.meme/api/box/${boxId}/claim`; 
    const config = getAxiosConfig(fullCookieString, `https://www.goblin.meme/box/${boxId}`);
    config.headers['Content-Length'] = '0';
    config.headers['Content-Type'] = undefined;
    config.headers['accept'] = 'application/json, text/plain, */*';

    const response = await axios.post(claimUrl, null, config);
    
    logger.success(`Claimed box ${boxId}: ${response.data.message}`);
    logger.info(`Claimed prize: ${response.data.prizeAmount} ${response.data.prizeType}`);
    return response.data;
  } catch (error) {
    logger.error(`Failed to claim box ${boxId}: ${error.message}`);
    if (error.response) {
      logger.error(`Status: ${error.response.status}, Data: ${typeof error.response.data === 'string' ? error.response.data.substring(0, 200) + '...' : JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
};

const getAllBoxes = async (fullCookieString) => {
  try {
    logger.loading('Fetching all available boxes...');
    const config = getAxiosConfig(fullCookieString, 'https://www.goblin.meme/box');
    const response = await axios.get('https://www.goblin.meme/api/box', config);
    logger.info(`Fetched ${response.data.boxes.length} boxes.`);
    return response.data.boxes;
  } catch (error) {
    logger.error(`Failed to fetch all boxes: ${error.message}`);
    if (error.response) {
      logger.error(`Status: ${error.response.status}, Data: ${typeof error.response.data === 'string' ? error.response.data.substring(0, 200) + '...' : JSON.stringify(error.response.data)}`);
    }
    return [];
  }
};

const processAccount = async (fullCookieString, accountName) => {
  logger.step(`Processing ${accountName}...`);

  try {
    await fetchUserData(fullCookieString);

    const availableBoxes = await getAllBoxes(fullCookieString);
    
    let boxActionTaken = false;

    for (const box of availableBoxes) {
      if (box.active) { 
        const boxDetail = await getBoxDetails(box._id, fullCookieString);
        
        if (boxDetail.isReady && !boxDetail.opened) {
          logger.success(`[${accountName}] Box '${box.name}' is ready to be claimed!`);
          try {
              await claimBox(box._id, fullCookieString);
              logger.success(`[${accountName}] Successfully claimed box '${box.name}'.`);
              await new Promise(resolve => setTimeout(resolve, 5000)); 
              boxActionTaken = true;
          } catch (claimError) {
              logger.error(`[${accountName}] Failed to claim box '${box.name}': ${claimError.message}`);
          }
        } 
        
        if (box.active && boxDetail.startTime === null && boxDetail.isReady === false) {
          logger.info(`[${accountName}] Found active box '${box.name}' ready to START MINING!`);
          const readyAt = await startMining(box._id, fullCookieString);
          logger.success(`[${accountName}] Mining for '${box.name}' started successfully. Will be ready at: ${new Date(readyAt).toLocaleString()}.`);
          boxActionTaken = true;
        } else if (boxDetail.startTime !== null && boxDetail.isReady === false) {
          logger.warn(`[${accountName}] Box '${box.name}' is already mining. Will be ready at: ${new Date(boxDetail.readyAt).toLocaleString()}.`);
          boxActionTaken = true;
        } else if (boxDetail.opened) {
            logger.info(`[${accountName}] Box '${box.name}' already opened/claimed.`);
        } else {
            logger.info(`[${accountName}] Box '${box.name}' not in a state to perform action. Details: ${JSON.stringify(boxDetail)}`);
        }
        
        if (boxActionTaken) {
            break; 
        }
      }
    }

    if (!boxActionTaken) {
      logger.info(`[${accountName}] No direct action (start/claim) taken for any active box this cycle.`);
    }

  } catch (error) {
    logger.error(`[${accountName}] An error occurred during processing: ${error.message}`);
  }
  logger.info(`Finished processing ${accountName}.`);
  await new Promise(resolve => setTimeout(resolve, 10 * 1000)); 
};

const main = async () => {
  logger.banner();
  
  const accountsFile = 'cookie.txt';
  let fullCookieStrings = [];

  try {
    const fileContent = fs.readFileSync(accountsFile, 'utf8');
    fullCookieStrings = fileContent.split('\n')
                                   .map(line => line.trim())
                                   .filter(line => line.length > 0);
    if (fullCookieStrings.length === 0) {
      logger.error(`No accounts found in ${accountsFile}. Please add full cookie strings.`);
      return;
    }
  } catch (error) {
    logger.error(`Error reading ${accountsFile}: ${error.message}`);
    logger.error('Please ensure the file exists and has read permissions. Exiting.');
    return;
  }

  logger.info(`Loaded ${fullCookieStrings.length} account(s) from ${accountsFile}.`);

  while (true) {
    logger.info(`Starting new processing cycle for all accounts at ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB.`);
    for (let i = 0; i < fullCookieStrings.length; i++) {
      const fullCookieString = fullCookieStrings[i];
      const accountName = `Akun_${i + 1}`;
      await processAccount(fullCookieString, accountName);
    }

    logger.info(`All accounts processed for this cycle. Waiting 24 hours for next cycle.`);
    await new Promise(resolve => setTimeout(resolve, 24 * 60 * 60 * 1000)); 
  }
};

main().catch(console.error);
