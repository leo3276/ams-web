const { app, BrowserWindow, shell, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const http = require('http');
const fs = require('fs');

let mainWindow = null;
let localServer = null;
let serverPort = null;
const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

function startLocalServer() {
  return new Promise((resolve, reject) => {
    try {
      const publicDir = isDev
        ? path.join(__dirname, '..', 'out')
        : path.join(app.getAppPath(), 'out');

      localServer = http.createServer((req, res) => {
        let reqUrl = req.url || '/';
        let reqPath = decodeURIComponent(reqUrl.split('?')[0]);

        if (reqPath === '/' || reqPath === '') {
          reqPath = '/dashboard.html';
        }

        let filePath = path.join(publicDir, reqPath);

        // If direct file does not exist, check variations
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          if (fs.existsSync(filePath + '.html')) {
            filePath = filePath + '.html';
          } else if (fs.existsSync(path.join(filePath, 'index.html'))) {
            filePath = path.join(filePath, 'index.html');
          } else {
            filePath = path.join(publicDir, 'dashboard.html');
          }
        }

        try {
          const ext = path.extname(filePath).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';
          const content = fs.readFileSync(filePath);
          res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(content);
        } catch (err) {
          res.writeHead(404);
          res.end('Asset not found');
        }
      });

      const FIXED_PORT = 32800;
      localServer.listen(FIXED_PORT, '127.0.0.1', () => {
        serverPort = FIXED_PORT;
        resolve(serverPort);
      });

      localServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          serverPort = FIXED_PORT;
          resolve(serverPort);
        } else {
          reject(err);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    icon: iconPath,
    title: 'AMS Software (Desktop)',
    backgroundColor: '#FFFFFF',
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: true,
    },
  });

  if (process.platform === 'win32') {
    try {
      mainWindow.setIcon(iconPath);
    } catch (_e) {}
  }

  // Smart Loader: Load Next.js dev server or fall back to local static server
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  
  if (isDev) {
    try {
      await mainWindow.loadURL('http://127.0.0.1:3000/login');
    } catch (devErr) {
      console.warn('Could not load Next.js dev server, starting local static fallback:', devErr.message);
      try {
        const port = await startLocalServer();
        await mainWindow.loadURL(`http://127.0.0.1:${port}/dashboard`);
      } catch (staticErr) {
        console.error('Failed to load static fallback:', staticErr.message);
      }
    }
  } else {
    try {
      const port = await startLocalServer();
      await mainWindow.loadURL(`http://127.0.0.1:${port}/dashboard`);
    } catch (err) {
      console.error('Failed to load production window:', err.message);
    }
  }

  // Intercept external links to open in the user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.startsWith('https:') ||
      (url.startsWith('http:') && !url.includes('localhost:3000') && !url.includes('127.0.0.1'))
    ) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers for Desktop features
ipcMain.handle('print-receipt', async (event, options) => {
  if (!mainWindow) return false;
  return new Promise((resolve) => {
    mainWindow.webContents.print(
      {
        silent: options?.silent ?? false,
        printBackground: true,
        deviceName: options?.deviceName ?? '',
      },
      (success, errorType) => {
        if (!success) {
          resolve({ success: false, error: errorType });
        } else {
          resolve({ success: true });
        }
      }
    );
  });
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('open-external-link', (event, url) => {
  shell.openExternal(url);
  return true;
});

// Auto-Updater configuration & background listener
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for updates from GitHub...');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', { status: 'checking' });
    }
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', {
        status: 'available',
        version: info.version,
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] App is up to date:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', {
        status: 'up-to-date',
        version: info.version,
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.warn('[AutoUpdater] Notice:', err.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', {
        status: 'error',
        error: err.message,
      });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', {
        status: 'downloading',
        percent: Math.round(progressObj.percent),
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded successfully:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', {
        status: 'downloaded',
        version: info.version,
      });
    }
  });

  // Automatically check for updates 10 seconds after window launches
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.warn('[AutoUpdater] Initial check notice:', err.message);
      });
    }, 10000);
  }
}

ipcMain.handle('check-for-updates', async () => {
  if (isDev) {
    return { status: 'dev-mode', message: 'Auto-update is disabled in development mode.' };
  }
  try {
    const res = await autoUpdater.checkForUpdates();
    return { status: 'checking', updateInfo: res?.updateInfo };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
});

ipcMain.handle('restart-and-install-update', () => {
  autoUpdater.quitAndInstall(false, true);
  return true;
});

// App Lifecycle
app.whenReady().then(async () => {
  await createWindow();
  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  if (localServer) {
    localServer.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

