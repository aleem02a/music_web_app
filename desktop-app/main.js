const { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, session, dialog } = require('electron');
const path = require('path');

// ── Configuration ─────────────────────────────────────────────
const APP_URL = 'https://aurafy-music-player.onrender.com';
const APP_NAME = 'Aurafy Music';
const APP_ORIGIN = new URL(APP_URL).origin;

const isTrustedAppUrl = (url) => {
  try {
    return new URL(url).origin === APP_ORIGIN;
  } catch (_) {
    return false;
  }
};

let mainWindow = null;
let tray = null;
let isQuitting = false;

// ── Single instance lock ──────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ── Create main window ────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 720,
    minHeight: 520,
    title: APP_NAME,
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#090E18',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // Remove menu bar completely
  mainWindow.setMenu(null);

  // Load the app
  mainWindow.loadURL(APP_URL);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isTrustedAppUrl(targetUrl)) event.preventDefault();
  });

  // Show window when ready (avoids white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Set user agent to desktop Chrome (avoid mobile detection)
  mainWindow.webContents.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
  );

  // Request microphone access only after a user-initiated voice-search action.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission === 'fullscreen') return callback(true);
    const isAudioOnly = permission === 'media' && details && Array.isArray(details.mediaTypes) &&
      details.mediaTypes.includes('audio') && !details.mediaTypes.includes('video');
    if (!isAudioOnly || !mainWindow) return callback(false);
    dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'Microphone access',
      message: 'Allow Aurafy to use your microphone for voice search?',
      buttons: ['Not now', 'Allow microphone'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    }).then((result) => callback(result.response === 1)).catch(() => callback(false));
  });
}

// ── System Tray ───────────────────────────────────────────────
function createTray() {
  // Create a simple tray icon from the SVG favicon
  const iconPath = path.join(__dirname, 'icon.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch {
    // Fallback: create a simple colored icon
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip(APP_NAME);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Aurafy',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Play / Pause',
      click: () => sendMediaCommand('togglePlay')
    },
    {
      label: 'Next Track',
      click: () => sendMediaCommand('next')
    },
    {
      label: 'Previous Track',
      click: () => sendMediaCommand('previous')
    },
    { type: 'separator' },
    {
      label: 'Quit Aurafy',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ── Media key support ─────────────────────────────────────────
function registerMediaKeys() {
  // Media play/pause key
  globalShortcut.register('MediaPlayPause', () => sendMediaCommand('togglePlay'));
  globalShortcut.register('MediaNextTrack', () => sendMediaCommand('next'));
  globalShortcut.register('MediaPreviousTrack', () => sendMediaCommand('previous'));
  globalShortcut.register('MediaStop', () => sendMediaCommand('pause'));
}

function sendMediaCommand(command) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.executeJavaScript(`
      if (window.Player) {
        window.Player.${command}();
      }
    `).catch(() => {});
  }
}

// ── App lifecycle ─────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createTray();
  registerMediaKeys();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
