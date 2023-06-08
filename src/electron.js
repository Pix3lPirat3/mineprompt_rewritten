process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'; // Disable warnings in the console for exposing Node
//process.env['ELECTRON_ENABLE_LOGGING'] = 'true'; // Enable logging console.log to console (terminal) (DEBUG)

const { app, BrowserWindow, shell, ipcMain, powerSaveBlocker } = require('electron');
const path = require('path');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let package = require('./../package.json');

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    title: 'MinePrompt v' + package.version,
    autoHideMenuBar: true,
    width: 1100,
    height: 600,
    icon: path.join(__dirname, '/img/heads/computer.png'),
    webPreferences: {
      preload: path.join(__dirname, '/js/preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false // Keep 'false' (Performance drops when window is minimized)
    }
  });

  // Triggers the flashing of the app's icon (Progress Bar)
  ipcMain.handle('runtime_end', async (event, someArgument) => {
    mainWindow.flashFrame(true);
  })

  // Open clicked links in the user's browser
  mainWindow.webContents.setWindowOpenHandler((details) => {
    let url = details.url;
    shell.openExternal(url);
    return { action: 'deny' }
  })

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
  
};


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

let sleeper_id = powerSaveBlocker.start('prevent-display-sleep')
let sleeper_running = powerSaveBlocker.isStarted(sleeper_id);
console.log(`[powerSaveBlocker] prevent-display-sleeper running: ${sleeper_running}`)