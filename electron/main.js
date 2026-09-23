import { app, BrowserWindow, dialog } from 'electron';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const port = process.env.DROOLYS_PORT || '8001';
const appUrl = `http://127.0.0.1:${port}`;
let backend;
let mainWindow;

if (!app.requestSingleInstanceLock()) {
    app.quit();
}

function isPortOpen() {
    return new Promise((resolve) => {
        const socket = net.createConnection(Number(port), '127.0.0.1');
        socket.once('connect', () => {
            socket.end();
            resolve(true);
        });
        socket.once('error', () => resolve(false));
        socket.setTimeout(500, () => {
            socket.destroy();
            resolve(false);
        });
    });
}

async function waitForBackend() {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        if (await isPortOpen()) return;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Laravel backend did not start.');
}

async function startBackend() {
    if (await isPortOpen()) return;
    backend = spawn('php', ['artisan', 'serve', '--host=127.0.0.1', `--port=${port}`], {
        cwd: root,
        windowsHide: true,
        stdio: 'ignore',
    });
    backend.unref();
    await waitForBackend();
}

async function createWindow() {
    await startBackend();
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 1024,
        minHeight: 700,
        title: "Drooly's POS and Inventory System",
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    await mainWindow.loadURL(appUrl);
}

app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
});

app.whenReady().then(createWindow).catch((error) => {
    dialog.showErrorBox("Drooly's POS", error.message);
    app.quit();
});

app.on('window-all-closed', () => {
    if (backend && !backend.killed) backend.kill();
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    if (backend && !backend.killed) backend.kill();
});
