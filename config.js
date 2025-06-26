// config.js

const config = {
    // Konfigurasi API
    api: {
        baseUrl: 'https://www.goblin.meme/api',
        timeout: 30000, // Timeout untuk request Axios (dalam milliseconds)
        retryAttempts: 3, // Jumlah percobaan ulang jika ada kegagalan API
        retryDelay: 5000, // Delay antara percobaan ulang (dalam milliseconds, 5 detik)
        requestDelay: 2500 // Delay antara setiap panggilan API (2.5 detik)
    },
    
    // Konfigurasi Penjadwal (Cron Jobs)
    scheduler: {
        dailySchedule: '0 9 * * *', // Cron expression untuk daily run (jam 9 pagi WIB)
        checkReadySchedule: '0 */4 * * *', // Cron expression untuk check ready boxes (setiap 4 jam)
        timezone: 'Asia/Jakarta' // Zona waktu untuk cron job
    },
    
    // Konfigurasi Logging
    logging: {
        level: 'info', // Level logging default (info, warn, error, debug)
        debug: false, // Set true untuk logging debug yang lebih detail
        maxLogSize: 10 * 1024 * 1024, // Ukuran maksimal file log (10MB)
        maxLogFiles: 5 // Jumlah maksimal file log yang disimpan
    },
    
    // Konfigurasi Pemrosesan Box
    processing: {
        delayBetweenBoxes: 2000, // Delay antara pemrosesan box yang berbeda (dalam milliseconds)
        delayBetweenChecks: 1000, // Delay antara pengecekan status di cron check (dalam milliseconds)
        delayBetweenAccounts: 10000, // Delay antara pemrosesan akun yang berbeda (10 detik)
        autoStart: true, // Set true untuk otomatis memulai box yang belum dimulai
        autoOpen: true // Set true untuk otomatis membuka box yang sudah ready
    },
    
    // Konfigurasi Notifikasi (untuk pengembangan di masa depan)
    notification: {
        enabled: false,
        webhookUrl: '',
        telegramBotToken: '',
        telegramChatId: ''
    }
};

// Menampilkan konfigurasi (tanpa data sensitif seperti cookie)
console.log('Goblin Box Automation Configuration:');
console.log('- API Base URL:', config.api.baseUrl);
console.log('- Daily Schedule:', config.scheduler.dailySchedule);
console.log('- Check Ready Schedule:', config.scheduler.checkReadySchedule);
console.log('- Timezone:', config.scheduler.timezone);
console.log('- Auto Start:', config.processing.autoStart);
console.log('- Auto Open:', config.processing.autoOpen);
console.log('- Debug Mode:', config.logging.debug);
console.log('- API Request Delay:', config.api.requestDelay / 1000, 'seconds');

module.exports = config;
