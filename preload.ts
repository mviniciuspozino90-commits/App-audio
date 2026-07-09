import { contextBridge, ipcRenderer } from 'electron';

// Expose secure, custom APIs to the renderer (React) process
contextBridge.exposeInMainWorld('electron', {
  send: (channel: string, data: any) => {
    // Whitelist channels to send to main process
    const validChannels = ['toMain'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel: string, func: (...args: any[]) => void) => {
    // Whitelist channels to receive from main process
    const validChannels = ['fromMain'];
    if (validChannels.includes(channel)) {
      const subscription = (_event: any, ...args: any[]) => func(...args);
      ipcRenderer.on(channel, subscription);
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    }
    return () => {};
  },
  // Custom API to get platform info
  getPlatform: () => process.platform,
});
