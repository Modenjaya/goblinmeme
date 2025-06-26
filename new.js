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
    console.log(`  Goblin Auto   `);
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
    logger.loading('Mengambil data pengguna...');
    const sessionResponse = await axios.get('https://www.goblin.meme/api/auth/session', getAxiosConfig(fullCookieString, 'https://www.goblin.meme/'));
    if (sessionResponse.status !== 200 || !sessionResponse.data || !sessionResponse.data.user) {
        throw new Error('Respons sesi tidak valid dari /api/auth/session');
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
        logger.warn(`Tidak dapat mengambil peringkat/poin dari beranda: ${htmlError.message}`);
    }

    logger.success(`Nama Pengguna: ${userData.name || 'N/A'}`);
    logger.success(`Peringkat Pengguna: #${rank}`);
    logger.success(`Total Goblin Poin: ${totalPoints}`);
    return { name: userData.name, rank, totalPoints };
  } catch (error) {
    logger.error(`Gagal mengambil data pengguna: ${error.message}`);
    if (error.response) {
      logger.error(`Status: ${error.response.status}, Data: ${typeof error.response.data === 'string' ? error.response.data.substring(0, 200) + '...' : JSON.stringify(error.response.data)}`);
    }
    throw new Error('Pengambilan data pengguna gagal, kemungkinan karena cookie tidak valid/kedaluwarsa.');
  }
};

const displayCountdown = (readyAt) => {
  return new Promise((resolve) => {
    if (!readyAt || isNaN(new Date(readyAt).getTime())) {
      logger.warn('Waktu readyAt tidak valid atau null disediakan. Melewatkan hitungan mundur.');
      resolve();
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const timeLeft = new Date(readyAt) - now;
      
      if (timeLeft <= 0) {
        process.stdout.write(`\r${colors.green}[⏰] Hitungan mundur selesai! Penambangan siap diklaim atau dimulai.${colors.reset}\n`);
        clearInterval(countdownInterval);
        resolve();
        return;
      }

      const hours = Math.floor(timeLeft / (1000 * 60 * 60));
      const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
      
      process.stdout.write(`\r${colors.cyan}[⏰] Menunggu: ${hours}j ${minutes}m ${seconds}d${colors.reset}    `);
    };

    updateCountdown();
    const countdownInterval = setInterval(updateCountdown, 1000);
  });
};

const getBoxDetails = async (boxId, fullCookieString) => {
  try {
    logger.loading(`Memeriksa detail kotak untuk ID: ${boxId}...`);
    const config = getAxiosConfig(fullCookieString, `https://www.goblin.meme/box/${boxId}`);
    const response = await axios.get(
      `https://www.goblin.meme/api/box/${boxId}`,
      config
    );
    logger.info(`Detail Kotak: ${JSON.stringify(response.data)}`);
    return response.data;
  } catch (error) {
    logger.error(`Gagal mendapatkan detail kotak untuk ${boxId}: ${error.message}`);
    if (error.response) {
      logger.error(`Status: ${error.response.status}, Data: ${typeof error.response.data === 'string' ? error.response.data.substring(0, 200) + '...' : JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
};

const startMining = async (boxId, fullCookieString) => {
  try {
    logger.loading('Memulai penambangan...');
    const config = getAxiosConfig(fullCookieString, `https://www.goblin.meme/box/${boxId}`);
    config.headers['Content-Length'] = '0';
    config.headers['Content-Type'] = undefined;
    config.headers['accept'] = 'application/json, text/plain, */*'; 

    const response = await axios.post(
      `https://www.goblin.meme/api/box/${boxId}/start`,
      null,
      config
    );
    
    logger.success(`Penambangan dimulai: ${response.data.message}`);
    logger.info(`Hadiah: ${response.data.box.prizeAmount} ${response.data.box.prizeType}`);
    logger.info(`Siap pada: ${new Date(response.data.box.readyAt).toLocaleString()}`);
    return response.data.box.readyAt;
  } catch (error) {
    logger.error(`Gagal memulai penambangan: ${error.message}`);
    if (error.response) {
      logger.error(`Status: ${error.response.status}, Data: ${typeof error.response.data === 'string' ? error.response.data.substring(0, 200) + '...' : JSON.stringify(error.response.data)}`);
      if (error.response.data && typeof error.response.data === 'object' && error.response.data.error && error.response.data.error.includes("You already have an active box mining.")) {
        throw new Error("ALREADY_MINING"); // Custom error untuk menandai sudah ada yang menambang
      }
    }
    throw error;
  }
};

const completeMission = async (boxId, fullCookieString, missionUrl) => {
    try {
        logger.loading(`Menyelesaikan misi untuk kotak ${boxId} dengan URL: ${missionUrl}...`);
        const config = getAxiosConfig(fullCookieString, `https://www.goblin.meme/box/${boxId}`);
        config.headers['Content-Type'] = 'application/json';
        const payload = { url: missionUrl };

        const response = await axios.post(
            `https://www.goblin.meme/api/box/${boxId}/mission`,
            payload,
            config
        );

        logger.success(`Misi untuk kotak ${boxId} berhasil diselesaikan: ${response.data.message || 'Misi berhasil.'}`);
        return response.data;
    } catch (error) {
        logger.error(`Gagal menyelesaikan misi untuk kotak ${boxId}: ${error.message}`);
        if (error.response) {
            logger.error(`Status: ${error.response.status}, Data: ${typeof error.response.data === 'string' ? error.response.data.substring(0, 200) + '...' : JSON.stringify(error.response.data)}`);
            if (error.response.data && typeof error.response.data === 'object' && error.response.data.message) {
                if (error.response.data.message.includes("Quest already done") || error.response.data.message.includes("already verified")) {
                    logger.warn(`[!] Misi untuk kotak ${boxId} sepertinya sudah selesai atau terverifikasi sebelumnya.`);
                    return { missionCompleted: true, message: error.response.data.message }; // Treat as success for retries
                }
            }
        }
        throw error;
    }
};


const claimBox = async (boxId, fullCookieString) => {
  try {
    logger.loading(`Mengklaim kotak ${boxId}...`);
    const claimUrl = `https://www.goblin.meme/api/box/${boxId}/claim`; 
    const config = getAxiosConfig(fullCookieString, `https://www.goblin.meme/box/${boxId}`);
    config.headers['Content-Length'] = '0';
    config.headers['Content-Type'] = undefined;
    config.headers['accept'] = 'application/json, text/plain, */*';

    const response = await axios.post(claimUrl, null, config);
    
    logger.success(`Kotak ${boxId} berhasil diklaim: ${response.data.message}`);
    logger.info(`Hadiah yang diklaim: ${response.data.prizeAmount} ${response.data.prizeType}`);
    return response.data;
  } catch (error) {
    logger.error(`Gagal mengklaim kotak ${boxId}: ${error.message}`);
    if (error.response) {
      logger.error(`Status: ${error.response.status}, Data: ${typeof error.response.data === 'string' ? error.response.data.substring(0, 200) + '...' : JSON.stringify(error.response.data)}`);
      // Cek apakah error karena misi belum selesai
      if (error.response.data && typeof error.response.data === 'object' && error.response.data.error && error.response.data.error.includes("Mission not completed yet.")) {
        throw new Error("MISSION_REQUIRED"); // Custom error untuk menandai misi diperlukan
      }
    }
    throw error;
  }
};

const getAllBoxes = async (fullCookieString) => {
  try {
    logger.loading('Mengambil semua kotak yang tersedia...');
    const config = getAxiosConfig(fullCookieString, 'https://www.goblin.meme/box');
    const response = await axios.get('https://www.goblin.meme/api/box', config);
    logger.info(`Berhasil mengambil ${response.data.boxes.length} kotak.`);
    return response.data.boxes;
  } catch (error) {
    logger.error(`Gagal mengambil semua kotak: ${error.message}`);
    if (error.response) {
      logger.error(`Status: ${error.response.status}, Data: ${typeof error.response.data === 'string' ? error.response.data.substring(0, 200) + '...' : JSON.stringify(error.response.data)}`);
    }
    return [];
  }
};

const processAccount = async (fullCookieString, accountName) => {
  logger.step(`Memproses ${accountName}...`);

  try {
    await fetchUserData(fullCookieString);

    const availableBoxes = await getAllBoxes(fullCookieString);
    
    if (availableBoxes.length === 0) {
      logger.info(`[${accountName}] Tidak ada kotak ditemukan untuk akun ini.`);
      return;
    }

    let claimedABox = false;
    let startedMining = false;
    let activeMiningBox = null; // Store the box object if it's currently mining

    // Tahap 1: Prioritaskan klaim kotak yang siap
    logger.step(`[${accountName}] Tahap 1: Memeriksa kotak yang siap diklaim.`);
    for (const box of availableBoxes) {
        if (box.active) { // Pastikan kotak aktif
            const boxDetail = await getBoxDetails(box._id, fullCookieString);

            if (boxDetail.isReady && !boxDetail.opened) {
                logger.success(`[${accountName}] Kotak '${box.name}' (ID: ${box._id}) siap diklaim!`);
                try {
                    await claimBox(box._id, fullCookieString);
                    logger.success(`[${accountName}] Berhasil mengklaim kotak '${box.name}'.`);
                    claimedABox = true;
                    await new Promise(resolve => setTimeout(resolve, 5000)); // Delay pendek setelah aksi
                } catch (claimError) {
                    if (claimError.message === "MISSION_REQUIRED") {
                        logger.warn(`[${accountName}] Kotak '${box.name}' (ID: ${box._id}) memerlukan misi. Mencoba menyelesaikan misi...`);
                        
                        // Periksa apakah missionUrl tersedia dan bukan string kosong
                        const missionUrls = boxDetail.missionUrl ? boxDetail.missionUrl.split(',').map(url => url.trim()) : [];
                        
                        if (missionUrls.length > 0) {
                            // Mencoba menyelesaikan setiap misi yang ada
                            for (const missionUrl of missionUrls) {
                                try {
                                    await completeMission(box._id, fullCookieString, missionUrl);
                                    await new Promise(resolve => setTimeout(resolve, 3000)); // Delay sebelum misi berikutnya
                                } catch (innerMissionError) {
                                    logger.error(`[${accountName}] Gagal menyelesaikan misi '${missionUrl}' untuk kotak '${box.name}': ${innerMissionError.message}`);
                                    // Jika satu misi gagal, kita mungkin tidak bisa melanjutkan.
                                    // Untuk saat ini, kita biarkan saja dan coba misi berikutnya jika ada.
                                }
                            }
                            // Setelah mencoba semua misi, coba klaim ulang kotaknya
                            logger.success(`[${accountName}] Selesai mencoba semua misi untuk kotak '${box.name}'. Mencoba klaim ulang...`);
                            await new Promise(resolve => setTimeout(resolve, 3000)); // Delay sebelum klaim ulang
                            try {
                                await claimBox(box._id, fullCookieString);
                                logger.success(`[${accountName}] Berhasil mengklaim kotak '${box.name}' setelah menyelesaikan misi.`);
                                claimedABox = true;
                                await new Promise(resolve => setTimeout(resolve, 5000));
                            } catch (retryClaimError) {
                                logger.error(`[${accountName}] Gagal mengklaim kotak '${box.name}' (ID: ${box._id}) setelah menyelesaikan misi: ${retryClaimError.message}`);
                            }
                        } else {
                            logger.error(`[${accountName}] Kotak '${box.name}' (ID: ${box._id}) memerlukan misi tetapi tidak ada missionUrl yang ditemukan.`);
                        }
                    } else {
                        logger.error(`[${accountName}] Gagal mengklaim kotak '${box.name}' (ID: ${box._id}): ${claimError.message}`);
                    }
                }
            } else if (boxDetail.startTime !== null && boxDetail.isReady === false) {
                logger.warn(`[${accountName}] Kotak '${box.name}' (ID: ${box._id}) sudah dalam proses penambangan. Akan siap pada: ${new Date(boxDetail.readyAt).toLocaleString()}.`);
                activeMiningBox = boxDetail; // Simpan detail kotak yang sedang ditambang
            } else if (boxDetail.opened) {
                logger.info(`[${accountName}] Kotak '${box.name}' (ID: ${box._id}) sudah dibuka/diklaim.`);
            }
        } else {
            logger.info(`[${accountName}] Kotak '${box.name}' (ID: ${box._id}) tidak aktif.`);
        }
    }

    // Tahap 2: Mulai penambangan kotak baru HANYA jika tidak ada penambangan aktif DAN belum ada klaim baru.
    // Jika ada box yang baru diklaim, kemungkinan besar kuota harian untuk akun tersebut sudah terpenuhi.
    logger.step(`[${accountName}] Tahap 2: Memeriksa untuk memulai penambangan kotak baru.`);
    if (claimedABox) {
        logger.info(`[${accountName}] Sebuah kotak baru saja diklaim. Tidak akan memulai penambangan baru untuk siklus ini.`);
    } else if (activeMiningBox) {
        logger.warn(`[${accountName}] Sudah ada kotak aktif yang ditambang ('${activeMiningBox.name}' ID: ${activeMiningBox._id}). Tidak akan memulai penambangan kotak lain.`);
        // display countdown for this box
        const now = new Date();
        const readyAtTime = new Date(activeMiningBox.readyAt);
        if (readyAtTime > now) {
            await displayCountdown(activeMiningBox.readyAt);
        } else {
            logger.info(`[${accountName}] Kotak aktif '${activeMiningBox.name}' seharusnya sudah siap diklaim, periksa pada siklus berikutnya.`);
        }
    } else {
        // Cari kotak yang bisa dimulai penambangannya (prioritaskan yang normal jika ada, atau partner jika tidak ada normal)
        let boxToStart = null;
        for (const box of availableBoxes) {
            if (box.active) {
                const boxDetail = await getBoxDetails(box._id, fullCookieString);
                if (boxDetail.startTime === null && boxDetail.isReady === false && !boxDetail.opened) {
                    boxToStart = box;
                    // Jika Anda ingin memprioritaskan "normal" box:
                    // if (box.boxType === 'normal') {
                    //     boxToStart = box;
                    //     break; // Temukan normal, langsung ambil
                    // } else if (boxToStart === null) {
                    //     boxToStart = box; // Simpan partner jika belum ada normal
                    // }
                    break; // Ambil kotak pertama yang memenuhi kriteria
                }
            }
        }

        if (boxToStart) {
            logger.info(`[${accountName}] Menemukan kotak aktif '${boxToStart.name}' (ID: ${boxToStart._id}) siap untuk MEMULAI PENAMBANGAN!`);
            try {
                const readyAt = await startMining(boxToStart._id, fullCookieString);
                logger.success(`[${accountName}] Penambangan untuk '${boxToStart.name}' berhasil dimulai. Akan siap pada: ${new Date(readyAt).toLocaleString()}.`);
                startedMining = true;
                // Tidak perlu break di sini karena loop sudah berhenti
            } catch (startError) {
                // ALREADY_MINING seharusnya tidak terjadi di sini karena kita sudah cek
                logger.error(`[${accountName}] Gagal memulai penambangan untuk kotak '${boxToStart.name}' (ID: ${boxToStart._id}): ${startError.message}`);
            }
        } else {
            logger.info(`[${accountName}] Tidak ada kotak yang dapat dimulai penambangannya untuk siklus ini.`);
        }
    }


  } catch (error) {
    logger.error(`[${accountName}] Terjadi kesalahan selama pemrosesan: ${error.message}`);
  }
  logger.info(`Selesai memproses ${accountName}.`);
  await new Promise(resolve => setTimeout(resolve, 10 * 1000));
};

const main = async () => {
  logger.banner();
  
  const accountsFile = 'cookie.txt'; // <-- PASTIKAN FILE COOKIE ANDA BERNAMA 'cookie.txt'
  let fullCookieStrings = [];

  try {
    const fileContent = fs.readFileSync(accountsFile, 'utf8');
    fullCookieStrings = fileContent.split('\n')
                                   .map(line => line.trim())
                                   .filter(line => line.length > 0);
    if (fullCookieStrings.length === 0) {
      logger.error(`Tidak ada akun ditemukan di ${accountsFile}. Harap tambahkan string cookie lengkap.`);
      return;
    }
  } catch (error) {
    logger.error(`Error membaca ${accountsFile}: ${error.message}`);
    logger.error('Harap pastikan file ada dan memiliki izin baca. Keluar.');
    return;
  }

  logger.info(`Memuat ${fullCookieStrings.length} akun dari ${accountsFile}.`);

  while (true) {
    logger.info(`Memulai siklus pemrosesan baru untuk semua akun pada ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB.`);
    for (let i = 0; i < fullCookieStrings.length; i++) {
      const fullCookieString = fullCookieStrings[i];
      const accountName = `Akun_${i + 1}`;
      await processAccount(fullCookieString, accountName);
    }

    logger.info(`Semua akun diproses untuk siklus ini. Menunggu 24 jam untuk siklus berikutnya.`);
    await new Promise(resolve => setTimeout(resolve, 24 * 60 * 60 * 1000)); 
  }
};

main().catch(console.error);
