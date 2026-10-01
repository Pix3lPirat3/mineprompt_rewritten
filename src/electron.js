'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, dialog, ipcMain, Menu, net, powerSaveBlocker, protocol, shell, utilityProcess } = require('electron');
const packageJson = require('../package.json');
const { ProcessSession } = require('./main/process-session');
const { HostClient } = require('./main/host-client');
const { HostServer } = require('./main/host-server');
const { RELEASES_URL, checkForUpdate } = require('./main/update-check');

const isInstallerEvent = require('electron-squirrel-startup');
const configuredDataPath = process.env.MINEPROMPT_DATA_DIR;
if (configuredDataPath && path.isAbsolute(configuredDataPath)) app.setPath('userData', configuredDataPath);
protocol.registerSchemesAsPrivileged([{
  scheme: 'mineprompt',
  privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true }
}]);
const hasSingleInstanceLock = !isInstallerEvent && app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:']);
let mainWindow = null;
let runtime = null;
let ownedHost = null;
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
  if (channel === 'renderer-reload') {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reloadIgnoringCache();
    return;
  }
  if (channel === 'state') {
    const active = runtime?.snapshot().sessions.some((session) =>
      ['authenticating', 'connecting', 'joining', 'online', 'reconnecting'].includes(session.state.status)
    );
    updatePowerSaveBlocker(Boolean(active));
  }
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
    event.senderFrame.url === mainWindow.webContents.getURL()
  );
}

function registerApplicationProtocol() {
  const rendererRoot = path.resolve(__dirname, '..', 'renderer', MAIN_WINDOW_VITE_NAME);
  protocol.handle('mineprompt', (request) => {
    const target = new URL(request.url);
    if (target.host !== 'app') return new Response('Not found', { status: 404 });
    let pathname;
    try {
      pathname = decodeURIComponent(target.pathname).replace(/^\/+|\\/gu, '');
    } catch {
      return new Response('Invalid path', { status: 400 });
    }
    const filePath = path.resolve(rendererRoot, pathname || 'index.html');
    const relative = path.relative(rendererRoot, filePath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(filePath).href);
  });
}

function registerIpc() {
  const guard = (handler) => async (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error('Request rejected from an untrusted frame.');
    return handler(...args);
  };
  ipcMain.handle('mineprompt:get-snapshot', guard(() => runtime.snapshot()));
  ipcMain.handle('mineprompt:execute', guard((input, sessionId) => runtime.execute(input, sessionId)));
  ipcMain.handle('mineprompt:connect', guard((options) => runtime.connect(options)));
  ipcMain.handle('mineprompt:disconnect', guard((sessionId) => runtime.disconnect(sessionId)));
  ipcMain.handle('mineprompt:complete', guard((input, sessionId) => runtime.complete(input, sessionId)));
  ipcMain.handle('mineprompt:select-session', guard((sessionId) => runtime.selectSession(sessionId)));
  ipcMain.handle('mineprompt:close-session', guard((sessionId) => runtime.closeSession(sessionId)));
  ipcMain.handle('mineprompt:reload-commands', guard(() => runtime.reloadCommands()));
  ipcMain.handle('mineprompt:inventory-action', guard((request) => runtime.inventoryAction(request)));
  ipcMain.handle('mineprompt:ui-state', guard((request) => runtime.uiState(request)));
  ipcMain.handle('mineprompt:report-renderer-issue', guard((issue) => runtime.reportRendererIssue(issue)));
  ipcMain.handle('mineprompt:report-renderer-state', guard((state) => runtime.reportRendererState(state)));
  ipcMain.handle('mineprompt:player-action', guard((request) => runtime.playerAction(request)));
  ipcMain.handle('mineprompt:target-action', guard((request) => runtime.targetAction(request)));
  ipcMain.handle('mineprompt:recipes', guard((request) => runtime.recipes(request)));
  ipcMain.handle('mineprompt:craft', guard((request) => runtime.craft(request)));
  ipcMain.handle('mineprompt:save-workflow', guard((workflow) => runtime.saveWorkflow(workflow)));
  ipcMain.handle('mineprompt:remove-workflow', guard((id) => runtime.removeWorkflow(id)));
  ipcMain.handle('mineprompt:run-workflow', guard((request) => runtime.runWorkflow(request)));
  ipcMain.handle('mineprompt:stop-workflow', guard((request) => runtime.stopWorkflow(request)));
  ipcMain.handle('mineprompt:save-profile', guard((profile) => runtime.saveProfile(profile)));
  ipcMain.handle('mineprompt:remove-profile', guard((username) => runtime.removeProfile(username)));
  ipcMain.handle('mineprompt:save-server', guard((profile) => runtime.saveServer(profile)));
  ipcMain.handle('mineprompt:remove-server', guard((name) => runtime.removeServer(name)));
  ipcMain.handle('mineprompt:save-preferences', guard((preferences) => runtime.savePreferences(preferences)));
  ipcMain.handle('mineprompt:save-mining-preset', guard((preset) => runtime.saveMiningPreset(preset)));
  ipcMain.handle('mineprompt:remove-mining-preset', guard((id) => runtime.removeMiningPreset(id)));
  ipcMain.handle('mineprompt:select-mining-preset', guard((id) => runtime.selectMiningPreset(id)));
  ipcMain.handle('mineprompt:check-for-update', guard(() => checkForUpdate()));
  ipcMain.handle('mineprompt:open-releases', guard(() => openExternal(RELEASES_URL)));
  ipcMain.handle('mineprompt:export-diagnostics', guard(async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export MinePrompt diagnostics',
      defaultPath: `mineprompt-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    await fs.writeFile(result.filePath, `${JSON.stringify(await runtime.diagnostics(), null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
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
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    autoHideMenuBar: true,
    backgroundColor: '#090c12',
    icon: app.isPackaged ? undefined : path.join(app.getAppPath(), 'src', 'img', 'heads', 'computer.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false
    }
  });
  mainWindow.removeMenu();

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
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.key.toLowerCase() !== 'r' || !(input.control || input.meta)) return;
    event.preventDefault();
    void runtime?.reload({ scope: input.shift ? 'all' : 'renderer' }).catch((error) => runtime?.logger.error(`[Reload] ${error.message}`));
  });
  mainWindow.webContents.on('did-fail-load', (event, code, description, url) => {
    runtime?.logger.error(`[Application] Failed to load ${url}: ${description} (${code}).`);
  });
  const target = MAIN_WINDOW_VITE_DEV_SERVER_URL || 'mineprompt://app/index.html';
  const load = mainWindow.loadURL(target);
  void load.catch((error) => runtime?.logger.error(`[Application] ${error.message}`));
}

if (hasSingleInstanceLock) {
  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) registerApplicationProtocol();
    const runtimeRoot = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked') : app.getAppPath();
    const runtimeDataPath = configuredDataPath && path.isAbsolute(configuredDataPath) ? configuredDataPath : app.getPath('userData');
    const client = new HostClient({ userDataPath: runtimeDataPath });
    try {
      runtime = await client.open();
      client.on('event', emit);
    } catch {
      ownedHost = await new HostServer({
        rootPath: runtimeRoot,
        userDataPath: runtimeDataPath,
        sessionFactory: (options) => new ProcessSession({
          ...options,
          spawn: (sessionId) => utilityProcess.fork(path.join(runtimeRoot, 'src', 'session-worker.js'), [], {
            serviceName: `MinePrompt Bot ${sessionId}`,
            stdio: 'ignore'
          })
        })
      }).start();
      runtime = await new HostClient({ userDataPath: runtimeDataPath }).open();
      runtime.on('event', emit);
    }
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
  const closingHost = ownedHost;
  runtime = null;
  ownedHost = null;
  void closingRuntime.close().then(() => closingHost?.close()).finally(() => {
    if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
      powerSaveBlocker.stop(powerSaveBlockerId);
    }
    app.quit();
  });
});
