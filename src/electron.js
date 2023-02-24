process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'; // Disable warnings in the console for exposing Node

const { app, BrowserWindow, shell } = require('electron');
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
    icon: __dirname + '/img/heads/computer.png',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false // Keep 'false' (Performance drops when window is minimized)
    },
  });

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

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
