// logger.js
const config = require('./config'); 

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
    debug: (msg) => {
        if (config.logging.debug) { // Hanya tampilkan jika mode debug diaktifkan
            console.log(`${colors.magenta}[🐛] ${msg}${colors.reset}`);
        }
    },
    banner: () => {
        console.log(`${colors.cyan}${colors.bold}`);
        console.log(`---------------------------------------------`);
        console.log(`  Goblin Auto   `);
        console.log(`---------------------------------------------${colors.reset}`);
        console.log();
    },
};

module.exports = logger;
