import { app, BrowserWindow, shell, session } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;

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
      autoplayPolicy: 'no-user-gesture-required',
      preload: path.join(__dirname, 'preload.cjs'),
    },
    title: "I9 Fit Gym Voice",
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'dist/favicon.ico'),
  });

  // Set a clean Chrome User-Agent on main window webContents
  mainWindow.webContents.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

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
    webPreferences.autoplayPolicy = 'no-user-gesture-required';
    // Do NOT inject preload script on third-party guest webviews to prevent security blocks or crashes
  });

  // Intercept target="_blank" and popups inside the webview (e.g., YouTube ads)
  // and open them in the user's default system browser instead of creating empty desktop windows
  contents.on('did-attach-webview', (event, webviewWebContents) => {
    // Set a standard Google Chrome user agent to prevent YouTube and Spotify from blocking embeds with "Error 153"
    webviewWebContents.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

    webviewWebContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http:') || url.startsWith('https:')) {
        shell.openExternal(url);
      }
      return { action: 'deny' };
    });
  });
});

app.whenReady().then(() => {
  // Override User-Agent, Referer, and Origin globally for all sessions to prevent YouTube and Spotify embedding/playback restrictions (Error 153)
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders;
    const url = details.url.toLowerCase();

    // Clean up existing case-insensitive user-agent header
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === 'user-agent') {
        delete headers[key];
      }
    }

    // Set standard Google Chrome User-Agent
    headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    // Spoof Referer and Origin headers for YouTube main domains to bypass player embedding blocks, but do NOT touch googlevideo.com or ytimg.com as that breaks stream signature validation (Error 152-4)
    if ((url.includes('youtube.com') || url.includes('youtube-nocookie.com')) && !url.includes('googlevideo.com') && !url.includes('ytimg.com')) {
      for (const key of Object.keys(headers)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'referer' || lowerKey === 'origin') {
          delete headers[key];
        }
      }
      headers['Referer'] = 'https://www.youtube.com/';
      headers['Origin'] = 'https://www.youtube.com';
    } else if (url.includes('spotify.com')) {
      for (const key of Object.keys(headers)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === 'referer' || lowerKey === 'origin') {
          delete headers[key];
        }
      }
      headers['Referer'] = 'https://open.spotify.com/';
      headers['Origin'] = 'https://open.spotify.com';
    }

    callback({ cancel: false, requestHeaders: headers });
  });

  // Intercept and strip restrictive security headers (X-Frame-Options and CSP) from response to allow embedding anything
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders || {};

    for (const key of Object.keys(responseHeaders)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'x-frame-options' || lowerKey === 'content-security-policy') {
        delete responseHeaders[key];
      }
    }

    callback({ cancel: false, responseHeaders });
  });

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
