// goblin-manager.js
const axios = require('axios');
const cheerio = require('cheerio');
const userAgents = require('user-agents');
const logger = require('./logger');
const config = require('./config');

class GoblinManager {
    constructor(accountName, fullCookieString) {
        this.accountName = accountName;
        this.fullCookieString = fullCookieString;
        this.baseUrl = config.api.baseUrl;
        
        // Setup axios instance dengan cookie spesifik untuk akun ini
        this.api = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Cookie': this.fullCookieString,
                'User-Agent': new userAgents().toString(), // Gunakan random user agent
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Referer': 'https://www.goblin.meme/',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin'
            },
            timeout: config.api.timeout
        });
        
        // Add request interceptor untuk logging
        this.api.interceptors.request.use(
            (reqConfig) => {
                logger.debug(`[${this.accountName}] Making request to: ${reqConfig.method?.toUpperCase()} ${reqConfig.url}`);
                return reqConfig;
            },
            (error) => {
                logger.error(`[${this.accountName}] Request error:`, error.message);
                return Promise.reject(error);
            }
        );
        
        // Add response interceptor untuk error handling
        this.api.interceptors.response.use(
            (response) => {
                logger.debug(`[${this.accountName}] Response received: ${response.status} from ${response.config.url}`);
                return response;
            },
            (error) => {
                if (error.response) {
                    logger.error(`[${this.accountName}] API Error: ${error.response.status} - ${error.response.statusText}`);
                    if (error.response.data) {
                        logger.error(`[${this.accountName}] Response data: ${typeof error.response.data === 'string' ? error.response.data.substring(0, 200) + '...' : JSON.stringify(error.response.data)}`);
                    }
                } else if (error.request) {
                    logger.error(`[${this.accountName}] Network error - no response received for ${error.config.url}`);
                } else {
                    logger.error(`[${this.accountName}] Request setup error: ${error.message}`);
                }
                return Promise.reject(error);
            }
        );
    }
    
    // Helper untuk menambahkan delay antar request
    async #addDelay() {
        await new Promise(resolve => setTimeout(resolve, config.api.requestDelay));
    }

    /**
     * Mendapatkan informasi pengguna (nama, rank, points)
     */
    async getUserInfo() {
        try {
            logger.loading(`[${this.accountName}] Mengambil data pengguna...`);
            const sessionResponse = await this.api.get('/auth/session', {
                headers: { 'Referer': 'https://www.goblin.meme/' }
            });
            await this.#addDelay(); // Tambah delay setelah request
            
            if (sessionResponse.status !== 200 || !sessionResponse.data || !sessionResponse.data.user) {
                throw new Error('Respons sesi tidak valid dari /api/auth/session');
            }
            const userData = sessionResponse.data.user;
            
            let rank = 'N/A';
            let totalPoints = 'N/A';
            try {
                // Untuk rank dan points, kita perlu ambil dari homepage karena tidak ada di /auth/session
                const homepageResponse = await axios.get('https://www.goblin.meme/', {
                    headers: {
                        'Cookie': this.fullCookieString,
                        'User-Agent': new userAgents().toString(),
                        'Referer': 'https://twitter.com/', // Referer untuk homepage
                    },
                    timeout: config.api.timeout
                });
                await this.#addDelay(); // Tambah delay setelah request
                const $ = cheerio.load(homepageResponse.data);
                const rankElement = $('.w-16.h-16.bg-lime-400.rounded-full').text().trim().replace('#', '');
                rank = rankElement ? parseInt(rankElement) : 'N/A';
                const pointsElement = $('.inline-flex.items-center.rounded-md.border.px-2\\.5.py-0\\.5.text-xs').first().text().trim();
                const pointsMatch = pointsElement.match(/(\d+)\s*Total Goblin Points/);
                totalPoints = pointsMatch ? parseInt(pointsMatch[1]) : 'N/A';
            } catch (htmlError) {
                logger.warn(`[${this.accountName}] Tidak dapat mengambil peringkat/poin dari beranda: ${htmlError.message}`);
            }

            logger.success(`[${this.accountName}] Nama Pengguna: ${userData.name || 'N/A'}`);
            logger.success(`[${this.accountName}] Peringkat Pengguna: #${rank}`);
            logger.success(`[${this.accountName}] Total Goblin Poin: ${totalPoints}`);
            return { name: userData.name, rank, totalPoints };
        } catch (error) {
            logger.error(`[${this.accountName}] Gagal mengambil data pengguna: ${error.message}`);
            throw new Error('Pengambilan data pengguna gagal, kemungkinan karena cookie tidak valid/kedaluwarsa.');
        }
    }

    /**
     * Dapatkan semua box yang tersedia
     */
    async getAllBoxes() {
        try {
            logger.loading(`[${this.accountName}] Mengambil semua kotak yang tersedia...`);
            const response = await this.api.get('/box');
            await this.#addDelay(); // Tambah delay setelah request
            
            if (response.data && response.data.boxes) {
                logger.info(`[${this.accountName}] Berhasil mengambil ${response.data.boxes.length} kotak.`);
                return response.data.boxes; 
            }
            return [];
        } catch (error) {
            logger.error(`[${this.accountName}] Gagal mengambil data boxes: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Dapatkan status detail box
     */
    async getBoxStatus(boxId) {
        try {
            logger.loading(`[${this.accountName}] Memeriksa detail kotak untuk ID: ${boxId}...`);
            const response = await this.api.get(`/box/${boxId}`);
            await this.#addDelay(); // Tambah delay setelah request
            logger.debug(`[${this.accountName}] Detail Kotak: ${JSON.stringify(response.data)}`);
            return response.data;
        } catch (error) {
            logger.error(`[${this.accountName}] Gagal mendapatkan detail kotak untuk ${boxId}: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Mulai penambangan box
     */
    async startBox(boxId) {
        try {
            logger.loading(`[${this.accountName}] Memulai penambangan untuk box ID: ${boxId}...`);
            const response = await this.api.post(`/box/${boxId}/start`, null, {
                headers: { 'Content-Length': '0', 'Content-Type': undefined }
            });
            await this.#addDelay(); // Tambah delay setelah request
            
            logger.success(`[${this.accountName}] Penambangan dimulai: ${response.data.message}`);
            logger.info(`[${this.accountName}] Hadiah: ${response.data.box.prizeAmount} ${response.data.box.prizeType}`);
            logger.info(`[${this.accountName}] Siap pada: ${new Date(response.data.box.readyAt).toLocaleString()}`);
            return {
                success: true,
                message: 'Box berhasil distart',
                readyAt: response.data.box.readyAt,
                data: response.data
            };
        } catch (error) {
            let errorMessage = error.message;
            if (error.response && error.response.data) {
                if (typeof error.response.data === 'string') {
                    errorMessage = error.response.data;
                } else if (error.response.data.message) {
                    errorMessage = error.response.data.message;
                } else if (error.response.data.error) {
                    errorMessage = error.response.data.error;
                }
            }
            logger.error(`[${this.accountName}] Gagal memulai penambangan box ${boxId}: ${errorMessage}`);
            
            if (errorMessage.includes("You already have an active box mining.")) {
                throw new Error("ALREADY_MINING");
            }
            throw error;
        }
    }
    
    /**
     * Menyelesaikan misi untuk box
     */
    async completeMission(boxId, missionUrl) {
        try {
            logger.loading(`[${this.accountName}] Menyelesaikan misi untuk kotak ${boxId} dengan URL: ${missionUrl}...`);
            const response = await this.api.post(`/box/${boxId}/mission`, { url: missionUrl }, {
                headers: { 'Content-Type': 'application/json' }
            });
            await this.#addDelay(); // Tambah delay setelah request
            
            logger.success(`[${this.accountName}] Misi untuk kotak ${boxId} berhasil diselesaikan: ${response.data.message || 'Misi berhasil.'}`);
            return { success: true, message: response.data.message };
        } catch (error) {
            let errorMessage = error.message;
            if (error.response && error.response.data) {
                if (typeof error.response.data === 'string') {
                    errorMessage = error.response.data;
                } else if (error.response.data.message) {
                    errorMessage = error.response.data.message;
                } else if (error.response.data.error) {
                    errorMessage = error.response.data.error;
                }
            }
            logger.error(`[${this.accountName}] Gagal menyelesaikan misi untuk kotak ${boxId}: ${errorMessage}`);
            if (errorMessage.includes("Quest already done") || errorMessage.includes("already verified")) {
                logger.warn(`[${this.accountName}] Misi untuk kotak ${boxId} sepertinya sudah selesai atau terverifikasi sebelumnya.`);
                return { success: true, message: errorMessage, alreadyCompleted: true }; // Anggap berhasil jika sudah selesai
            }
            throw error;
        }
    }
    
    /**
     * Buka box (claim box) - Termasuk logika misi otomatis
     */
    async openBox(boxId, boxDetails) { // Menerima boxDetails untuk akses missionUrl
        try {
            logger.loading(`[${this.accountName}] Mengklaim kotak ${boxId}...`);
            
            const response = await this.api.post(`/box/${boxId}/claim`, null, {
                headers: { 'Content-Length': '0', 'Content-Type': undefined }
            });
            await this.#addDelay(); // Tambah delay setelah request
            
            logger.success(`[${this.accountName}] Kotak ${boxId} berhasil diklaim: ${response.data.message}`);
            logger.info(`[${this.accountName}] Hadiah yang diklaim: ${response.data.prizeAmount} ${response.data.prizeType}`);
            return {
                success: true,
                message: response.data.message,
                reward: response.data.prizeAmount,
                rewardType: response.data.prizeType
            };
        } catch (error) {
            let errorMessage = error.message;
            if (error.response && error.response.data) {
                if (typeof error.response.data === 'string') {
                    errorMessage = error.response.data;
                } else if (error.response.data.error) {
                    errorMessage = error.response.data.error;
                } else if (error.response.data.message) {
                    errorMessage = error.response.data.message;
                }
            }
            logger.error(`[${this.accountName}] Gagal mengklaim kotak ${boxId}: ${errorMessage}`);
            
            // Jika error karena misi belum selesai, coba selesaikan misi dan klaim ulang
            if (errorMessage.includes("Mission not completed yet.") && boxDetails && boxDetails.missionUrl) {
                logger.warn(`[${this.accountName}] Kotak '${boxDetails.name}' (ID: ${boxId}) memerlukan misi. Mencoba menyelesaikan misi...`);
                const missionUrls = boxDetails.missionUrl.split(',').map(url => url.trim()).filter(url => url);
                
                let allMissionsCompleted = true;
                for (const missionUrl of missionUrls) {
                    try {
                        logger.info(`[${this.accountName}] Mencoba misi: ${missionUrl}`);
                        const missionResult = await this.completeMission(boxId, missionUrl);
                        if (!missionResult.success && !missionResult.alreadyCompleted) {
                            allMissionsCompleted = false;
                            break; // Hentikan jika satu misi gagal dan bukan karena sudah selesai
                        }
                        await new Promise(resolve => setTimeout(resolve, config.processing.delayBetweenChecks));
                    } catch (mError) {
                        logger.error(`[${this.accountName}] Error saat menjalankan misi ${missionUrl}: ${mError.message}`);
                        allMissionsCompleted = false;
                        break;
                    }
                }
                
                if (allMissionsCompleted) {
                    logger.success(`[${this.accountName}] Selesai mencoba semua misi untuk kotak '${boxDetails.name}'. Mencoba klaim ulang...`);
                    await new Promise(resolve => setTimeout(resolve, config.processing.delayBetweenChecks));
                    // Coba klaim ulang setelah misi selesai
                    return await this.openBox(boxId, boxDetails); // Rekursif klaim ulang
                } else {
                    return { success: false, message: "Misi tidak dapat diselesaikan sepenuhnya untuk klaim." };
                }
            } else {
                return { success: false, message: errorMessage };
            }
        }
    }
    
    /**
     * Cek apakah cookie masih valid
     */
    async validateCookie() {
        try {
            logger.debug(`[${this.accountName}] Validating cookie...`);
            const response = await this.api.get('/auth/session'); // Endpoint yang ringan untuk validasi
            await this.#addDelay(); // Tambah delay setelah request
            return response.status === 200 && response.data && response.data.user;
        } catch (error) {
            if (error.response && error.response.status === 401) {
                logger.error(`[${this.accountName}] Cookie expired atau invalid!`);
                return false;
            }
            logger.error(`[${this.accountName}] Error saat validasi cookie: ${error.message}`);
            return false; // Anggap tidak valid jika ada error lain
        }
    }
}

module.exports = GoblinManager;
