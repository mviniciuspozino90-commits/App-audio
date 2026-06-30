import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      sandbox: true,
    },
    title: "I9 Fit Gym Voice",
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'dist/favicon.ico'),
  });

  // Load the built HTML file from Vite compilation
  mainWindow.loadFile(path.join(__dirname, 'dist/index.html')).catch((err) => {
    console.error('Failed to load local HTML file:', err);
  });

  // Open external links (e.g., shortcuts or external resources) in the default system web browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Global listener for web contents creation to secure webviews and intercept their popups
app.on('web-contents-created', (event, contents) => {
  // Ensure strict sandboxing and isolation for nested webviews
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
  });

  // Intercept target="_blank" and popups inside the webview (e.g., YouTube ads)
  // and open them in the user's default system browser instead of creating empty desktop windows
  contents.on('did-attach-webview', (event, webviewWebContents) => {
    webviewWebContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http:') || url.startsWith('https:')) {
        shell.openExternal(url);
      }
      return { action: 'deny' };
    });
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
