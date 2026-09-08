'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, dialog, ipcMain, powerSaveBlocker, shell } = require('electron');
const packageJson = require('../package.json');
const { ApplicationRuntime } = require('./main/application-runtime');
const { RELEASES_URL, checkForUpdate } = require('./main/update-check');

const isInstallerEvent = require('electron-squirrel-startup');
const hasSingleInstanceLock = !isInstallerEvent && app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:']);
const APPLICATION_URL = pathToFileURL(path.join(__dirname, 'index.html')).href;
let mainWindow = null;
let runtime = null;
let powerSaveBlockerId = null;

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

process.on('uncaughtException', (error) => {
  if (runtime) runtime.logger.error(`[Application] ${error.stack || error.message}`);
  else console.error(error);
});

process.on('unhandledRejection', (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  if (runtime) runtime.logger.error(`[Application] ${message}`);
  else console.error(message);
});

function emit(channel, payload) {
  if (channel === 'state') updatePowerSaveBlocker(['authenticating', 'connecting', 'joining', 'online', 'reconnecting'].includes(payload.status));
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(`mineprompt:${channel}`, payload);
  }
}

function updatePowerSaveBlocker(needed) {
  const running = powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId);
  if (needed && !running) powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
  if (!needed && running) {
    powerSaveBlocker.stop(powerSaveBlockerId);
    powerSaveBlockerId = null;
  }
}

function isTrustedSender(event) {
  return Boolean(
    mainWindow &&
    event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame &&
    event.senderFrame.url === APPLICATION_URL
  );
}

function registerIpc() {
  const guard = (handler) => async (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error('Request rejected from an untrusted frame.');
    return handler(...args);
  };
  ipcMain.handle('mineprompt:get-snapshot', guard(() => runtime.snapshot()));
  ipcMain.handle('mineprompt:execute', guard((input) => runtime.execute(input)));
  ipcMain.handle('mineprompt:connect', guard((options) => runtime.connect(options)));
  ipcMain.handle('mineprompt:disconnect', guard(() => runtime.disconnect()));
  ipcMain.handle('mineprompt:complete', guard((input) => runtime.complete(input)));
  ipcMain.handle('mineprompt:reload-commands', guard(() => runtime.reloadCommands()));
  ipcMain.handle('mineprompt:save-profile', guard((profile) => runtime.saveProfile(profile)));
  ipcMain.handle('mineprompt:remove-profile', guard((username) => runtime.removeProfile(username)));
  ipcMain.handle('mineprompt:save-server', guard((profile) => runtime.saveServer(profile)));
  ipcMain.handle('mineprompt:remove-server', guard((name) => runtime.removeServer(name)));
  ipcMain.handle('mineprompt:save-preferences', guard((preferences) => runtime.savePreferences(preferences)));
  ipcMain.handle('mineprompt:check-for-update', guard(() => checkForUpdate()));
  ipcMain.handle('mineprompt:open-releases', guard(() => openExternal(RELEASES_URL)));
  ipcMain.handle('mineprompt:export-diagnostics', guard(async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export MinePrompt diagnostics',
      defaultPath: `mineprompt-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    await fs.writeFile(result.filePath, `${JSON.stringify(runtime.diagnostics(), null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    return { ok: true };
  }));
}

async function openExternal(url) {
  try {
    const target = new URL(url);
    if (ALLOWED_EXTERNAL_PROTOCOLS.has(target.protocol)) await shell.openExternal(target.href);
  } catch {
    return;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: `MinePrompt ${packageJson.version}`,
    width: 1180,
    height: 720,
    minWidth: 820,
    minHeight: 520,
    autoHideMenuBar: true,
    backgroundColor: '#090c12',
    icon: path.join(__dirname, 'img', 'heads', 'computer.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'js', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.on('focus', () => mainWindow?.flashFrame(false));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      void openExternal(url);
    }
  });
  void mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

if (hasSingleInstanceLock) {
  app.whenReady().then(async () => {
    runtime = await new ApplicationRuntime({
      rootPath: app.getAppPath(),
      userDataPath: app.getPath('userData'),
      emit
    }).init();
    registerIpc();
    createWindow();
  }).catch((error) => {
    console.error('MinePrompt failed to start:', error);
    app.quit();
  });
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  if (!runtime) return;
  event.preventDefault();
  const closingRuntime = runtime;
  runtime = null;
  void closingRuntime.close().finally(() => {
    if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
      powerSaveBlocker.stop(powerSaveBlockerId);
    }
    app.quit();
  });
});
