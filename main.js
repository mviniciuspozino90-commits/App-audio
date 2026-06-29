import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
    },
    // Customize your desktop window
    autoHideMenuBar: true, // Hides standard top menus like File, Edit, View for a sleeker look
    icon: path.join(__dirname, 'dist/favicon.ico'), // Desktop app icon (optional, using Vite's favicon)
  });

  // Load the built HTML file from your React/Vite compilation
  mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));

  // Open developer tools (uncomment below if you need to debug during development)
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
