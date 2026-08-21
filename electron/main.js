const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let mainWindow = null;
let localServer = null;
let serverPort = null;
const isDev = !app.isPackaged;

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
          reqPath = '/login.html';
        }

        let filePath = path.join(publicDir, reqPath);

        // If direct file does not exist, check variations
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          if (fs.existsSync(filePath + '.html')) {
            filePath = filePath + '.html';
          } else if (fs.existsSync(path.join(filePath, 'index.html'))) {
            filePath = path.join(filePath, 'index.html');
          } else {
            filePath = path.join(publicDir, 'login.html');
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
          // If port is already in use by another instance, try to connect to it directly
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
    title: 'AMS - Accounting Made Simple',
    backgroundColor: '#090D16',
    autoHideMenuBar: true,
    show: true, // Show immediately
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

  try {
    const port = await startLocalServer();
    const targetUrl = `http://127.0.0.1:${port}/dashboard`;
    await mainWindow.loadURL(targetUrl);
  } catch (err) {
    console.error('Failed to load application:', err);
  }

  // Intercept external links to open in the user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || (url.startsWith('http:') && !url.includes(`127.0.0.1:${serverPort}`))) {
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

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  if (localServer) {
    try {
      localServer.close();
    } catch (_e) {}
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
