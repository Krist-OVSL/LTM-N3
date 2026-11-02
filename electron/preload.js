const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('miniBrowser', {
  navigate: (address) => ipcRenderer.invoke('browser:navigate', address),
  back: () => ipcRenderer.invoke('browser:back'),
  forward: () => ipcRenderer.invoke('browser:forward'),
  reload: () => ipcRenderer.invoke('browser:reload'),
  refreshInspection: () => ipcRenderer.invoke('browser:refresh-inspection'),
  getInspection: () => ipcRenderer.invoke('browser:get-inspection'),
  compareDns: (domain) => ipcRenderer.invoke('browser:compare-dns', domain),
  getTrace: () => ipcRenderer.invoke('browser:get-trace'),
  getConnection: () => ipcRenderer.invoke('browser:get-connection'),
  getSidebar: () => ipcRenderer.invoke('browser:get-sidebar'),
  toggleSidebar: () => ipcRenderer.invoke('browser:toggle-sidebar'),
  getDohMode: () => ipcRenderer.invoke('browser:get-doh-mode'),
  setDohMode: (enabled) => ipcRenderer.invoke('browser:set-doh-mode', enabled),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('browser:state', listener);
    return () => ipcRenderer.removeListener('browser:state', listener);
  },
  onLookup: (callback) => {
    const listener = (_event, result) => callback(result);
    ipcRenderer.on('browser:lookup', listener);
    return () => ipcRenderer.removeListener('browser:lookup', listener);
  },
  onTrace: (callback) => {
    const listener = (_event, trace) => callback(trace);
    ipcRenderer.on('browser:trace', listener);
    return () => ipcRenderer.removeListener('browser:trace', listener);
  },
  onConnection: (callback) => {
    const listener = (_event, connection) => callback(connection);
    ipcRenderer.on('browser:connection', listener);
    return () => ipcRenderer.removeListener('browser:connection', listener);
  },
  onSidebar: (callback) => {
    const listener = (_event, sidebar) => callback(sidebar);
    ipcRenderer.on('browser:sidebar', listener);
    return () => ipcRenderer.removeListener('browser:sidebar', listener);
  },
  onDohMode: (callback) => {
    const listener = (_event, mode) => callback(mode);
    ipcRenderer.on('browser:doh-mode', listener);
    return () => ipcRenderer.removeListener('browser:doh-mode', listener);
  },
});
