const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Original WebSocket functions
  connectToWebSocket: (url) => ipcRenderer.send('connect-websocket', url),
  sendMessage: (message) => ipcRenderer.send('send-message', message),
  closeWebSocket: () => ipcRenderer.send('close-websocket'),
  onConnected: (callback) => ipcRenderer.on('ws-connected', callback),
  onMessage: (callback) => ipcRenderer.on('ws-message', callback),
  onError: (callback) => ipcRenderer.on('ws-error', callback),
  onClosed: (callback) => ipcRenderer.on('ws-closed', callback),
  
  // New graymap WebSocket functions
  connectToGraymapWebSocket: (url) => ipcRenderer.send('connect-graymap-websocket', url),
  closeGraymapWebSocket: () => ipcRenderer.send('close-graymap-websocket'),
  onGraymapConnected: (callback) => ipcRenderer.on('graymap-ws-connected', callback),
  onGraymapMessage: (callback) => ipcRenderer.on('graymap-ws-message', callback),
  onGraymapError: (callback) => ipcRenderer.on('graymap-ws-error', callback),
  onGraymapClosed: (callback) => ipcRenderer.on('graymap-ws-closed', callback),
  
  // New debug position info event
  onPositionDebugInfo: (callback) => ipcRenderer.on('position-debug-info', callback)
});