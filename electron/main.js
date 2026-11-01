const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { spawn } = require('child_process');

let logFile = null;
try {
  logFile = path.join(app.getPath('userData'), 'ams-debug.log');
  fs.appendFileSync(logFile, `\n[${new Date().toISOString()}] === AMS Software starting (v${app.getVersion()}) ===\n`);
} catch (_e) {}

function log(msg) {
  if (logFile) {
    try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`); } catch(_e) {}
  }
  console.log(msg);
}

process.on('uncaughtException', (err) => {
  log('CRITICAL Uncaught Exception: ' + (err?.stack || err));
});
process.on('unhandledRejection', (reason) => {
  log('CRITICAL Unhandled Rejection: ' + (reason?.stack || reason));
});

let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (_e) {
  // Graceful fallback to built-in zero-dependency native updater
}

let mainWindow = null;
let localServer = null;
let serverPort = null;
let downloadedInstallerPath = null;
let fastUpdateInProgress = false;
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
        try {
          let reqUrl = req.url || '/';
          let reqPath = decodeURIComponent(reqUrl.split('?')[0]);

          if (reqPath === '/' || reqPath === '') {
            reqPath = '/dashboard.html';
          }

          let filePath = path.join(publicDir, reqPath);

          // If direct file does not exist, check variations safely
          try {
            if (!fs.existsSync(filePath) || (fs.statSync(filePath) && fs.statSync(filePath).isDirectory())) {
              if (fs.existsSync(filePath + '.html')) {
                filePath = filePath + '.html';
              } else if (fs.existsSync(path.join(filePath, 'index.html'))) {
                filePath = path.join(filePath, 'index.html');
              } else {
                filePath = path.join(publicDir, 'dashboard.html');
              }
            }
          } catch (_statErr) {
            filePath = path.join(publicDir, 'dashboard.html');
          }

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
          log('HTTP server request notice for ' + req.url + ': ' + (err?.message || err));
          res.writeHead(404);
          res.end('Asset not found');
        }
      });

      const FIXED_PORT = 32800;
      localServer.listen(FIXED_PORT, '127.0.0.1', () => {
        serverPort = localServer.address().port;
        resolve(serverPort);
      });

      localServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          log('Port 32800 in use, binding to ephemeral port...');
          localServer.listen(0, '127.0.0.1', () => {
            serverPort = localServer.address().port;
            resolve(serverPort);
          });
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
      log('Starting local static server for production window...');
      const port = await startLocalServer();
      log(`Local static server started on port ${port}. Loading URL...`);
      await mainWindow.loadURL(`http://127.0.0.1:${port}/dashboard`);
      log('mainWindow.loadURL completed successfully.');
    } catch (err) {
      log('Failed to load production window via HTTP, attempting direct loadFile: ' + (err?.stack || err));
      try {
        const publicDir = path.join(app.getAppPath(), 'out');
        await mainWindow.loadFile(path.join(publicDir, 'dashboard.html'));
        log('mainWindow.loadFile completed successfully.');
      } catch (fileErr) {
        log('Failed direct loadFile: ' + (fileErr?.stack || fileErr));
      }
    }
  }

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

  mainWindow.webContents.on('did-fail-load', (e, code, desc, url) => {
    log(`mainWindow did-fail-load: code=${code}, desc=${desc}, url=${url}`);
  });

  mainWindow.on('closed', () => {
    log('mainWindow "closed" event fired');
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

function sendUpdaterStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater-status', payload);
  }
}

function compareSemver(a, b) {
  const pa = String(a || '0.0.0').replace(/^v/, '').split('.').map(Number);
  const pb = String(b || '0.0.0').replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'AMS-Software-Updater',
          Accept: 'application/vnd.github+json',
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchJson(res.headers.location).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
  });
}

function downloadFileWithProgress(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl) => {
      const mod = currentUrl.startsWith('https') ? https : http;
      const req = mod.get(
        currentUrl,
        { headers: { 'User-Agent': 'AMS-Software-Updater' } },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            return follow(res.headers.location);
          }
          if (res.statusCode !== 200) {
            res.resume();
            return reject(new Error(`Download failed with status ${res.statusCode}`));
          }
          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let receivedBytes = 0;
          let lastEmit = 0;
          const fileStream = fs.createWriteStream(destPath);
          res.on('data', (chunk) => {
            receivedBytes += chunk.length;
            const now = Date.now();
            if (totalBytes > 0 && now - lastEmit > 150) {
              lastEmit = now;
              const pct = Math.min(99, Math.round((receivedBytes / totalBytes) * 100));
              onProgress(pct, receivedBytes, totalBytes);
            }
          });
          res.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close(() => {
              onProgress(100, receivedBytes, totalBytes);
              resolve(destPath);
            });
          });
          fileStream.on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
          });
        }
      );
      req.on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    };
    follow(url);
  });
}

async function runFastDirectUpdateCheck() {
  if (fastUpdateInProgress) return { status: 'checking' };
  fastUpdateInProgress = true;
  sendUpdaterStatus({ status: 'checking' });

  try {
    const release = await fetchJson('https://api.github.com/repos/leo3276/ams-web/releases/latest');
    const latestVersion = String(release.tag_name || '').replace(/^v/, '');
    const currentVersion = app.getVersion();

    if (!latestVersion || compareSemver(latestVersion, currentVersion) <= 0) {
      fastUpdateInProgress = false;
      sendUpdaterStatus({ status: 'up-to-date', version: currentVersion });
      return { status: 'up-to-date', version: currentVersion };
    }

    // Find Windows Setup .exe or Mac .dmg/.zip asset
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const winAsset = assets.find(
      (a) =>
        a.name &&
        a.name.endsWith('.exe') &&
        !a.name.endsWith('.blockmap') &&
        a.name.toLowerCase().includes('setup')
    );

    if (process.platform === 'win32' && winAsset && winAsset.browser_download_url) {
      sendUpdaterStatus({ status: 'available', version: latestVersion });
      const tempDir = app.getPath('temp');
      const targetPath = path.join(tempDir, `AMS-Update-${latestVersion}.exe`);

      await downloadFileWithProgress(winAsset.browser_download_url, targetPath, (percent) => {
        sendUpdaterStatus({
          status: 'downloading',
          percent,
          version: latestVersion,
        });
      });

      downloadedInstallerPath = targetPath;
      fastUpdateInProgress = false;
      sendUpdaterStatus({
        status: 'downloaded',
        version: latestVersion,
      });
      return { status: 'downloaded', version: latestVersion };
    }

    fastUpdateInProgress = false;
    sendUpdaterStatus({ status: 'available', version: latestVersion });
    return { status: 'available', version: latestVersion };
  } catch (err) {
    fastUpdateInProgress = false;
    sendUpdaterStatus({ status: 'error', error: err.message });
    return { status: 'error', message: err.message };
  }
}

// Auto-Updater configuration & background listener
function setupAutoUpdater() {
  if (autoUpdater) {
    try {
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.differentialDownload = false;

      autoUpdater.on('checking-for-update', () => {
        console.log('[AutoUpdater] Checking for updates from GitHub...');
        sendUpdaterStatus({ status: 'checking' });
      });

      autoUpdater.on('update-available', (info) => {
        console.log('[AutoUpdater] Update available:', info.version);
        sendUpdaterStatus({
          status: 'available',
          version: info.version,
        });
      });

      autoUpdater.on('update-not-available', (info) => {
        console.log('[AutoUpdater] App is up to date:', info.version);
        sendUpdaterStatus({
          status: 'up-to-date',
          version: info.version,
        });
      });

      autoUpdater.on('error', (err) => {
        console.warn('[AutoUpdater] Fallback to Fast Direct Updater:', err.message);
        runFastDirectUpdateCheck();
      });

      autoUpdater.on('download-progress', (progressObj) => {
        sendUpdaterStatus({
          status: 'downloading',
          percent: Math.round(progressObj.percent),
        });
      });

      autoUpdater.on('update-downloaded', (info) => {
        console.log('[AutoUpdater] Update downloaded successfully:', info.version);
        sendUpdaterStatus({
          status: 'downloaded',
          version: info.version,
        });
      });
    } catch (_err) {
      console.warn('[AutoUpdater] Could not initialize electron-updater, using native updater.');
    }
  }

  // Automatically check for updates 6 seconds after window launches using fast native updater
  if (!isDev) {
    setTimeout(() => {
      runFastDirectUpdateCheck().catch(() => {});
    }, 6000);
  }
}

ipcMain.handle('check-for-updates', async () => {
  return await runFastDirectUpdateCheck();
});

ipcMain.handle('restart-and-install-update', () => {
  if (downloadedInstallerPath && fs.existsSync(downloadedInstallerPath)) {
    const exeToLaunch = app.getPath('exe');
    const child = spawn(downloadedInstallerPath, ['/S', '--updated'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    setTimeout(() => {
      app.relaunch({ execPath: exeToLaunch });
      app.exit(0);
    }, 400);
    return true;
  }
  if (autoUpdater) {
    try {
      autoUpdater.quitAndInstall(false, true);
      return true;
    } catch (_e) {}
  }
  return true;
});

// App Lifecycle
app.whenReady().then(async () => {
  await createWindow();
  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  log('window-all-closed fired. localServer exists: ' + !!localServer);
  if (localServer) {
    localServer.close();
  }
  if (process.platform !== 'darwin') {
    log('Calling app.quit() from window-all-closed');
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

