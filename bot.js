// index.js

const cron = require('node-cron');
const GoblinManager = require('./goblin-manager');
const logger = require('./logger');
const config = require('./config');
const fs = require('fs');

// --- Fungsi utilitas tambahan (untuk logging saja, tidak memblokir) ---
const logRemainingTime = (accountName, boxName, readyAt) => {
    const now = new Date();
    const readyAtTime = new Date(readyAt);
    if (readyAtTime > now) {
        const timeLeft = readyAtTime - now;
        const hours = Math.floor(timeLeft / (1000 * 60 * 60));
        const minutes = Math.floor(((timeLeft % (1000 * 60 * 60)) / (1000 * 60)));
        const seconds = Math.floor(((timeLeft % (1000 * 60)) / 1000));
        logger.warn(`[${accountName}] Kotak '${boxName}' sedang ditambang, siap dalam: ${hours}j ${minutes}m ${seconds}d.`);
    } else {
        logger.warn(`[${accountName}] Kotak '${boxName}' seharusnya sudah siap diklaim. Akan dicoba di siklus berikutnya.`);
    }
};

/**
 * Memproses satu akun (termasuk klaim dan memulai penambangan)
 * @param {GoblinManager} goblinManagerInstance Instansi GoblinManager untuk akun ini.
 */
async function processAccountAutomation(goblinManagerInstance) {
    const accountName = goblinManagerInstance.accountName;
    logger.step(`[${accountName}] Memulai pemrosesan akun...`);

    try {
        // Cek validitas cookie
        const isValid = await goblinManagerInstance.validateCookie();
        if (!isValid) {
            logger.error(`[${accountName}] Cookie tidak valid atau sudah kadaluarsa. Melewatkan akun ini.`);
            return;
        }

        await goblinManagerInstance.getUserInfo(); // Ambil info pengguna
        
        let allAvailableBoxes;
        try {
            allAvailableBoxes = await goblinManagerInstance.getAllBoxes(); // Ambil semua kotak dari API (tidak difilter .active di sini)
        } catch (error) {
            logger.error(`[${accountName}] Gagal mengambil daftar semua kotak. Melewatkan akun ini. Error: ${error.message}`);
            // Melemparkan error agar bisa ditangkap oleh retry di main loop
            throw new Error(`Failed to get all boxes for ${accountName}: ${error.message}`);
        }

        if (allAvailableBoxes.length === 0) {
            logger.info(`[${accountName}] Tidak ada kotak aktif ditemukan untuk akun ini.`);
            return;
        }

        let claimedAnyBox = false; // Tetap lacak apakah ada box yang diklaim
        let activeMiningBox = null;

        // --- Tahap 1: Memeriksa dan mengklaim kotak yang siap ---
        logger.step(`[${accountName}] Tahap 1: Memeriksa dan mengklaim kotak yang siap.`);
        for (const box of allAvailableBoxes) {
            // Dapatkan detail kotak terbaru di setiap iterasi
            let boxDetail;
            try {
                boxDetail = await goblinManagerInstance.getBoxStatus(box._id);
            } catch (detailError) {
                logger.error(`[${accountName}] Gagal mengambil detail untuk kotak '${box.name}' (ID: ${box._id}). Melewatkan klaim/status untuk kotak ini. Error: ${detailError.message}`);
                continue; // Lanjutkan ke kotak berikutnya jika gagal mendapatkan detail
            }

            if (!boxDetail.active) { // Jika boxDetail melaporkan tidak aktif
                logger.info(`[${accountName}] Kotak '${box.name}' (ID: ${box._id}) tidak aktif. Melewatkan.`);
                continue; 
            }

            if (boxDetail.isReady && !boxDetail.opened && config.processing.autoOpen) {
                logger.success(`[${accountName}] Kotak '${box.name}' (ID: ${box._id}) siap diklaim!`);
                const openResult = await goblinManagerInstance.openBox(box._id, boxDetail); // Meneruskan boxDetail
                if (openResult.success) {
                    logger.success(`[${accountName}] BERHASIL! Kotak ${box.name} sudah dibuka. Hadiah: ${openResult.reward} ${openResult.rewardType}`);
                    claimedAnyBox = true; // Setel ke true jika berhasil klaim
                } else {
                    logger.error(`[${accountName}] Gagal membuka/mengklaim kotak ${box.name}: ${openResult.message}`);
                    throw new Error(`Failed to claim box ${box.name} for ${accountName}: ${openResult.message}`);
                }
                await new Promise(resolve => setTimeout(resolve, config.processing.delayBetweenBoxes));
            } else if (boxDetail.startTime !== null && !boxDetail.isReady && !boxDetail.opened) {
                // Kotak ini sedang ditambang
                activeMiningBox = boxDetail; // Simpan detail kotak yang sedang ditambang
                logger.warn(`[${accountName}] Kotak '${boxDetail.name}' (ID: ${boxDetail._id}) sudah dalam proses penambangan.`);
                logRemainingTime(accountName, boxDetail.name, boxDetail.readyAt); // Hanya log, tidak memblokir
            } else if (boxDetail.opened) {
                logger.info(`[${accountName}] Kotak '${box.name}' (ID: ${box._id}) sudah dibuka/diklaim.`);
            } else { // Kondisi default jika box tidak ready, tidak mining, tidak dibuka, dan aktif
                logger.debug(`[${accountName}] Kotak '${box.name}' (ID: ${box._id}) belum siap untuk diklaim atau dimulai. Status: ${JSON.stringify(boxDetail)}`);
            }
        }

        // --- Tahap 2: Memulai penambangan (prioritas 'The Mich Khan') ---
        // PERUBAHAN UTAMA DI SINI:
        // Kita tidak lagi menggunakan `if (claimedAnyBox)` untuk *menghindari* start mining.
        // Klaim box sekarang dianggap sebagai satu aktivitas, dan start mining adalah aktivitas lain.
        logger.step(`[${accountName}] Tahap 2: Memeriksa untuk memulai penambangan kotak baru.`);
        
        if (activeMiningBox) { // Jika sudah ada box yang ditambang, jangan start yang lain
            logger.warn(`[${accountName}] Sudah ada kotak aktif yang ditambang ('${activeMiningBox.name}' ID: ${activeMiningBox._id}). Tidak akan memulai penambangan kotak lain.`);
            logRemainingTime(accountName, activeMiningBox.name, activeMiningBox.readyAt); // Hanya log, tidak memblokir
        } else if (config.processing.autoStart) { // Jika autoStart diaktifkan dan tidak ada box yang sedang mining
            let boxToStart = null;
            
            // Prioritas pertama: "The Mich Khan"
            const michKhanBox = allAvailableBoxes.find(b => b.name === "The Mich Khan"); // Cari berdasarkan nama di semua box
            if (michKhanBox) { // Jika The Mich Khan ditemukan di daftar awal
                const michKhanDetail = await goblinManagerInstance.getBoxStatus(michKhanBox._id);
                // Pastikan box aktif dan belum dimulai mining
                if (michKhanDetail.active && michKhanDetail.startTime === null && michKhanDetail.isReady === false && !michKhanDetail.opened) {
                    boxToStart = michKhanDetail;
                    logger.info(`[${accountName}] Memprioritaskan 'The Mich Khan' (ID: ${boxToStart._id}) untuk dimulai penambangan.`);
                } else {
                    logger.info(`[${accountName}] Kotak 'The Mich Khan' ditemukan tetapi tidak dalam kondisi untuk memulai penambangan: ${JSON.stringify(michKhanDetail)}`);
                }
            }

            // Jika 'The Mich Khan' tidak bisa dimulai, cari kotak aktif lain yang bisa dimulai.
            if (!boxToStart) {
                logger.info(`[${accountName}] 'The Mich Khan' tidak dapat dimulai. Mencari kotak aktif lainnya.`);
                for (const box of allAvailableBoxes) { // Ulangi semuaAvailableBoxes
                    if (box.name !== "The Mich Khan") { // Lewati The Mich Khan karena sudah diperiksa
                        const otherBoxDetail = await goblinManagerInstance.getBoxStatus(box._id);
                        // Pastikan box aktif dan belum dimulai mining
                        if (otherBoxDetail.active && otherBoxDetail.startTime === null && otherBoxDetail.isReady === false && !otherBoxDetail.opened) {
                            boxToStart = otherBoxDetail;
                            logger.info(`[${accountName}] Memilih kotak '${boxToStart.name}' (ID: ${boxToStart._id}) untuk dimulai penambangan.`);
                            break; // Ambil kotak aktif pertama yang bisa dimulai
                        }
                    }
                }
            }

            if (boxToStart) {
                logger.info(`[${accountName}] Menemukan kotak aktif '${boxToStart.name}' (ID: ${boxToStart._id}) siap untuk MEMULAI PENAMBANGAN!`);
                const startResult = await goblinManagerInstance.startBox(boxToStart._id);
                if (startResult.success) {
                    logger.success(`[${accountName}] Penambangan untuk '${boxToStart.name}' berhasil dimulai. Akan siap pada: ${startResult.readyAt}`);
                    logRemainingTime(accountName, boxToStart.name, startResult.readyAt); // Hanya log, tidak memblokir
                } else {
                    logger.error(`[${accountName}] Gagal memulai penambangan untuk kotak '${boxToStart.name}' (ID: ${boxToStart._id}): ${startResult.message}`);
                    throw new Error(`Failed to start box ${boxToStart.name} for ${accountName}: ${startResult.message}`);
                }
            } else {
                logger.info(`[${accountName}] Tidak ada kotak yang dapat dimulai penambangannya untuk siklus ini.`);
            }
        } else {
            logger.info(`[${accountName}] Opsi 'autoStart' dinonaktifkan dalam konfigurasi.`);
        }

    } catch (error) {
        logger.error(`[${accountName}] Terjadi kesalahan fatal selama pemrosesan akun: ${error.message}`);
        throw error; 
    }
    logger.info(`[${accountName}] Selesai memproses akun.`);
}

/**
 * Fungsi utama untuk menjalankan otomatisasi untuk semua akun yang terdaftar
 */
async function runAllAccountsAutomation() {
    logger.banner();
    logger.info('Memulai siklus otomatisasi untuk semua akun...');

    const accountsFile = 'cookie.txt';
    let fullCookieStrings = [];
    const goblinManagers = []; // Array untuk menyimpan instance GoblinManager per akun

    try {
        const fileContent = fs.readFileSync(accountsFile, 'utf8');
        fullCookieStrings = fileContent.split('\n')
                                      .map(line => line.trim())
                                      .filter(line => line.length > 0);
        
        if (fullCookieStrings.length === 0) {
            logger.error(`Tidak ada akun ditemukan di ${accountsFile}. Harap tambahkan string cookie lengkap.`);
            process.exit(1);
        }
    } catch (error) {
        logger.error(`Error membaca ${accountsFile}: ${error.message}`);
        logger.error('Harap pastikan file ada dan memiliki izin baca. Keluar.');
        process.exit(1);
    }

    logger.info(`Memuat ${fullCookieStrings.length} akun dari ${accountsFile}.`);

    // Inisialisasi GoblinManager untuk setiap akun
    for (let i = 0; i < fullCookieStrings.length; i++) {
        const cookie = fullCookieStrings[i];
        const accountName = `Akun_${i + 1}`;
        goblinManagers.push(new GoblinManager(accountName, cookie));
    }

    // Loop utama untuk memproses semua akun
    // Ini akan berjalan tanpa henti, dengan delay 24 jam antar siklus penuh
    while (true) {
        logger.info(`Memulai siklus pemrosesan baru untuk semua akun pada ${new Date().toLocaleString('id-ID', { timeZone: config.scheduler.timezone })}.`);
        for (const manager of goblinManagers) {
            let attempt = 0;
            const maxAttempts = config.api.retryAttempts; // Ambil dari config

            while (attempt < maxAttempts) {
                try {
                    logger.info(`[MAIN] Memulai pemrosesan untuk ${manager.accountName} (Percobaan ${attempt + 1}/${maxAttempts})...`);
                    await processAccountAutomation(manager);
                    logger.info(`[MAIN] Selesai memproses ${manager.accountName}.`);
                    break; // Keluar dari loop retry jika berhasil
                } catch (accountError) {
                    logger.error(`[MAIN ERROR] Gagal memproses ${manager.accountName}: ${accountError.message}.`);
                    attempt++;
                    if (attempt < maxAttempts) {
                        logger.warn(`[MAIN] Mencoba lagi untuk ${manager.accountName} dalam ${config.api.retryDelay / 1000} detik...`);
                        await new Promise(resolve => setTimeout(resolve, config.api.retryDelay));
                    } else {
                        logger.error(`[MAIN] Gagal memproses ${manager.accountName} setelah ${maxAttempts} percobaan. Melewatkan akun ini.`);
                    }
                }
            }
            // Delay antar akun setelah semua percobaan untuk akun saat ini selesai
            await new Promise(resolve => setTimeout(resolve, config.processing.delayBetweenAccounts));
        }

        logger.info(`Semua akun diproses untuk siklus ini. Menunggu 24 jam untuk siklus berikutnya.`);
        await new Promise(resolve => setTimeout(resolve, 24 * 60 * 60 * 1000)); // Delay 24 jam untuk siklus berikutnya
    }
}

// --- Setup cron job dan eksekusi awal ---

// Run automation immediately if called directly (for testing/manual run)
if (require.main === module) {
    logger.info('Njalankan automation langsung...');
    runAllAccountsAutomation().catch(console.error);
}

// Setup cron job untuk running harian (full automation)
logger.info(`Setting up cron job untuk running harian jam ${config.scheduler.dailySchedule} WIB...`);
cron.schedule(config.scheduler.dailySchedule, () => {
    logger.info('CRON JOB TRIGGERED - Running daily automation');
    runAllAccountsAutomation().catch(console.error);
}, {
    scheduled: true,
    timezone: config.scheduler.timezone
});

// Setup cron job tambahan untuk ngecek box sing ready (tidak memulai baru, hanya klaim)
logger.info(`Setting up cron job untuk ngecek ready boxes saben ${config.scheduler.checkReadySchedule} WIB...`);
cron.schedule(config.scheduler.checkReadySchedule, async () => {
    logger.info('CRON JOB TRIGGERED - Checking ready boxes');
    
    // Perlu membaca ulang cookie.txt di sini untuk cron job,
    // karena `goblinManagers` di atas hanya dibuat saat `runAllAccountsAutomation` pertama kali dipanggil.
    const accountsFile = 'cookie.txt';
    let fullCookieStrings = [];
    let checkManagers = [];

    try {
        const fileContent = fs.readFileSync(accountsFile, 'utf8');
        fullCookieStrings = fileContent.split('\n')
                                      .map(line => line.trim())
                                      .filter(line => line.length > 0);
        
        if (fullCookieStrings.length === 0) {
            logger.error(`Tidak ada akun ditemukan di ${accountsFile} untuk cron check.`);
            return;
        }
    } catch (error) {
        logger.error(`Error membaca ${accountsFile} untuk cron check: ${error.message}`);
        return;
    }

    for (let i = 0; i < fullCookieStrings.length; i++) {
        checkManagers.push(new GoblinManager(`Akun_Check_${i + 1}`, fullCookieStrings[i]));
    }

    for (const manager of checkManagers) {
        // Logika retry untuk cron check juga
        let attempt = 0;
        const maxAttempts = config.api.retryAttempts;
        while (attempt < maxAttempts) {
            try {
                logger.info(`[CRON CHECK] Memeriksa box siap klaim untuk ${manager.accountName} (Percobaan ${attempt + 1}/${maxAttempts})...`);
                const isValid = await manager.validateCookie();
                if (!isValid) {
                    logger.error(`[CRON CHECK][${manager.accountName}] Cookie tidak valid. Melewatkan.`);
                    break; // Tidak perlu retry jika cookie invalid
                }

                // Mengambil semua kotak tanpa filter .active di sini
                const boxes = await manager.getAllBoxes(); 
                for (const box of boxes) {
                    let boxDetail;
                    try {
                        boxDetail = await manager.getBoxStatus(box._id);
                    } catch (detailError) {
                        logger.error(`[CRON CHECK][${manager.accountName}] Gagal ambil detail box ${box.name}: ${detailError.message}.`);
                        continue;
                    }

                    if (!boxDetail.active) {
                        logger.debug(`[CRON CHECK][${manager.accountName}] Kotak '${box.name}' (ID: ${box._id}) tidak aktif. Melewatkan.`);
                        continue;
                    }

                    if (boxDetail.isReady && !boxDetail.opened && config.processing.autoOpen) {
                        logger.success(`[CRON CHECK][${manager.accountName}] Box '${boxDetail.name}' ready untuk dibuka!`);
                        const openResult = await manager.openBox(box._id, boxDetail);
                        if (openResult.success) {
                            logger.success(`[CRON CHECK][${manager.accountName}] BERHASIL! Box ${boxDetail.name} dibuka. Reward: ${openResult.reward} ${openResult.rewardType}`);
                        } else {
                            logger.error(`[CRON CHECK][${manager.accountName}] Gagal buka box ${boxDetail.name}: ${openResult.message}`);
                            // Throw error untuk memicu retry jika gagal klaim
                            throw new Error(`Failed to open box ${boxDetail.name} for ${manager.accountName}: ${openResult.message}`);
                        }
                        await new Promise(resolve => setTimeout(resolve, config.processing.delayBetweenChecks));
                    } else if (boxDetail.startTime !== null && !boxDetail.isReady && !boxDetail.opened) {
                        logRemainingTime(manager.accountName, boxDetail.name, boxDetail.readyAt);
                    }
                }
                break; // Keluar dari loop retry jika berhasil
            } catch (error) {
                logger.error(`[CRON CHECK][${manager.accountName}] Error saat menjalankan cron check: ${error.message}`);
                attempt++;
                if (attempt < maxAttempts) {
                    logger.warn(`[CRON CHECK][${manager.accountName}] Mencoba lagi dalam ${config.api.retryDelay / 1000} detik...`);
                    await new Promise(resolve => setTimeout(resolve, config.api.retryDelay));
                } else {
                    logger.error(`[CRON CHECK][${manager.accountName}] Gagal memproses setelah ${maxAttempts} percobaan. Melewatkan.`);
                }
            }
        }
        await new Promise(resolve => setTimeout(resolve, config.processing.delayBetweenAccounts || 1000)); // Delay antar akun di cron check
    }
    logger.info('CRON JOB - Selesai cek ready boxes.');
}, {
    scheduled: true,
    timezone: config.scheduler.timezone
});

logger.info('Goblin Box Automation sudah siap! Skrip akan berjalan:');
logger.info(`- Setiap hari jam ${config.scheduler.dailySchedule} WIB (otomatisasi penuh)`);
logger.info(`- Setiap ${config.scheduler.checkReadySchedule} WIB (cek box siap klaim)`);
logger.info('Tekan Ctrl+C untuk menutup skrip.');

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('\nMematikan Goblin Box Automation...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('\nMematikan Goblin Box Automation...');
    process.exit(0);
});
