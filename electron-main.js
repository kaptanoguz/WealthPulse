// ============================================================
// WealthPulse — Electron shell
// ============================================================
//
// The packaged app is self-contained: the Next.js standalone server is copied
// next to the app (resources/app-server) and started with Electron's own
// Node runtime via utilityProcess, so the user's machine needs neither Node
// nor npm.
//
// The server always listens on the same loopback port. Portfolio data lives in
// localStorage, which is scoped to the page origin (host + port), so a stable
// port is what keeps the data across launches.

/* eslint-disable @typescript-eslint/no-require-imports -- Electron main process is CommonJS */
const { app, BrowserWindow, utilityProcess, shell, dialog } = require('electron');
const http = require('http');
const path = require('path');

const isDev = process.argv.includes('--dev');
const HOST = '127.0.0.1';
const PORT = isDev ? 3000 : 39_871;
const APP_URL = isDev ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
const READY_TIMEOUT_MS = 30_000;

let mainWindow = null;
let serverProcess = null;

function serverEntry() {
    // Packaged: resources/app-server/server.js. Unpackaged (npm run electron:start): .next/standalone/server.js
    return app.isPackaged
        ? path.join(process.resourcesPath, 'app-server', 'server.js')
        : path.join(__dirname, '.next', 'standalone', 'server.js');
}

function startServer() {
    serverProcess = utilityProcess.fork(serverEntry(), [], {
        cwd: path.dirname(serverEntry()),
        env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT), HOSTNAME: HOST },
        stdio: 'pipe',
        serviceName: 'WealthPulse server',
    });
    serverProcess.stdout?.on('data', d => console.log('[server]', d.toString().trim()));
    serverProcess.stderr?.on('data', d => console.error('[server]', d.toString().trim()));
    serverProcess.on('exit', code => {
        serverProcess = null;
        if (code !== 0 && !app.isQuitting) {
            dialog.showErrorBox('WealthPulse', `Uygulama sunucusu beklenmedik şekilde kapandı (kod ${code}).`);
            app.quit();
        }
    });
}

/** Resolves once the server answers HTTP, rejects after the timeout. */
function waitForServer(url, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
        const attempt = () => {
            const req = http.get(url, res => {
                res.resume();
                resolve();
            });
            req.on('error', () => {
                if (Date.now() > deadline) reject(new Error('Sunucu zamanında başlamadı.'));
                else setTimeout(attempt, 150);
            });
            req.setTimeout(2000, () => req.destroy());
        };
        attempt();
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: 'WealthPulse',
        icon: path.join(__dirname, 'public', 'icon.png'),
        backgroundColor: '#0b0d10',
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
        },
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.loadURL(`${APP_URL}/dashboard`);

    // External links (data sources, GitHub) open in the default browser, not inside the app.
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (!url.startsWith(APP_URL)) shell.openExternal(url);
        return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith(APP_URL)) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// One instance only: a second one could not bind the fixed port.
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    app.whenReady().then(async () => {
        try {
            if (!isDev) startServer();
            await waitForServer(APP_URL, isDev ? 120_000 : READY_TIMEOUT_MS);
            createWindow();
        } catch (err) {
            dialog.showErrorBox('WealthPulse başlatılamadı', String(err?.message ?? err));
            app.quit();
        }
    });
}

app.on('before-quit', () => {
    app.isQuitting = true;
    serverProcess?.kill();
});

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && app.isReady()) createWindow();
});
