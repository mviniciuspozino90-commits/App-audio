var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// main.ts
var import_electron = require("electron");
var path = __toESM(require("path"), 1);
var mainWindow = null;
function createWindow() {
  mainWindow = new import_electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      sandbox: true,
      autoplayPolicy: "no-user-gesture-required",
      preload: path.join(__dirname, "preload.cjs")
    },
    title: "I9 Fit Gym Voice",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "dist/favicon.ico")
  });
  mainWindow.webContents.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
  mainWindow.loadFile(path.join(__dirname, "dist/index.html")).catch((err) => {
    console.error("Failed to load local HTML file:", err);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      import_electron.shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
import_electron.app.on("web-contents-created", (event, contents) => {
  contents.on("will-attach-webview", (event2, webPreferences, params) => {
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.autoplayPolicy = "no-user-gesture-required";
  });
  contents.on("did-attach-webview", (event2, webviewWebContents) => {
    webviewWebContents.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
    webviewWebContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("http:") || url.startsWith("https:")) {
        import_electron.shell.openExternal(url);
      }
      return { action: "deny" };
    });
  });
});
import_electron.app.whenReady().then(() => {
  import_electron.session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders;
    const url = details.url.toLowerCase();
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === "user-agent") {
        delete headers[key];
      }
    }
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    if (url.includes("youtube.com") || url.includes("youtube-nocookie.com") || url.includes("googlevideo.com") || url.includes("ytimg.com")) {
      for (const key of Object.keys(headers)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === "referer" || lowerKey === "origin") {
          delete headers[key];
        }
      }
      headers["Referer"] = "https://www.youtube.com/";
      headers["Origin"] = "https://www.youtube.com";
    } else if (url.includes("spotify.com")) {
      for (const key of Object.keys(headers)) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === "referer" || lowerKey === "origin") {
          delete headers[key];
        }
      }
      headers["Referer"] = "https://open.spotify.com/";
      headers["Origin"] = "https://open.spotify.com";
    }
    callback({ cancel: false, requestHeaders: headers });
  });
  import_electron.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = details.responseHeaders || {};
    for (const key of Object.keys(responseHeaders)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === "x-frame-options" || lowerKey === "content-security-policy") {
        delete responseHeaders[key];
      }
    }
    callback({ cancel: false, responseHeaders });
  });
  createWindow();
  import_electron.app.on("activate", () => {
    if (import_electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
import_electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    import_electron.app.quit();
  }
});
