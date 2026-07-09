// preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electron", {
  send: (channel, data) => {
    const validChannels = ["toMain"];
    if (validChannels.includes(channel)) {
      import_electron.ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, func) => {
    const validChannels = ["fromMain"];
    if (validChannels.includes(channel)) {
      const subscription = (_event, ...args) => func(...args);
      import_electron.ipcRenderer.on(channel, subscription);
      return () => {
        import_electron.ipcRenderer.removeListener(channel, subscription);
      };
    }
    return () => {
    };
  },
  // Custom API to get platform info
  getPlatform: () => process.platform
});
