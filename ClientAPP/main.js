const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const WebSocket = require('ws');

let mainWindow;
let wsClient = null;
let graymapWsClient = null;

let lastMapData = null;
let mapUpdatePending = false;
const MAP_UPDATE_INTERVAL = 200; 

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');
  
  if (mainWindow.webContents) {
    mainWindow.webContents.setFrameRate(60);
  }
  mainWindow.on('closed', () => {
    if (wsClient) {
      try {
        wsClient.terminate();
      } catch (error) {
        console.error('Error terminating WebSocket on window close:', error);
      }
      wsClient = null;
    }
    
    if (graymapWsClient) {
      try {
        graymapWsClient.terminate();
      } catch (error) {
        console.error('Error terminating GrayMap WebSocket on window close:', error);
      }
      graymapWsClient = null;
    }
    
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

function sendGraymapDataThrottled(data) {
  if (!mapUpdatePending) {
    lastMapData = data;
    mapUpdatePending = true;
    
    setTimeout(() => {
      if (mainWindow && lastMapData) {
        mainWindow.webContents.send('graymap-ws-message', lastMapData);
        mapUpdatePending = false;
      }
    }, MAP_UPDATE_INTERVAL);
  } else {
    lastMapData = data;
  }
}

ipcMain.on('connect-websocket', (event, url) => {
  if (wsClient) {
    wsClient.close();
  }

  wsClient = new WebSocket(url);

  wsClient.on('open', () => {
    if (mainWindow) {
      mainWindow.webContents.send('ws-connected');
    }
  });

  wsClient.on('message', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('ws-message', data.toString());
    }
  });

  wsClient.on('error', (error) => {
    if (mainWindow) {
      mainWindow.webContents.send('ws-error', error.toString());
    }
    wsClient = null;
  });

  wsClient.on('close', () => {
    if (mainWindow) {
      mainWindow.webContents.send('ws-closed');
    }
    wsClient = null;
  });
});

ipcMain.on('send-message', (event, message) => {
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    wsClient.send(message);
  }
});

ipcMain.on('close-websocket', () => {
  if (wsClient) {
    try {
      wsClient.terminate();  
    } catch (error) {
      console.error('Error terminating websocket:', error);
    } finally {
      wsClient = null; 
    }
  }
});

ipcMain.on('connect-graymap-websocket', (event, url) => {
  if (graymapWsClient) {
    graymapWsClient.close();
  }

  graymapWsClient = new WebSocket(url);

  graymapWsClient.on('open', () => {
    if (mainWindow) {
      mainWindow.webContents.send('graymap-ws-connected');
    }
  });

  graymapWsClient.on('message', (data) => {
    if (mainWindow) {
      sendGraymapDataThrottled(data.toString());
    }
  });

  graymapWsClient.on('error', (error) => {
    if (mainWindow) {
      mainWindow.webContents.send('graymap-ws-error', error.toString());
    }
    graymapWsClient = null;
  });

  graymapWsClient.on('close', () => {
    if (mainWindow) {
      mainWindow.webContents.send('graymap-ws-closed');
    }
    graymapWsClient = null;
  });
});

ipcMain.on('close-graymap-websocket', () => {
  if (graymapWsClient) {
    try {
      graymapWsClient.terminate();  
    } catch (error) {
      console.error('Error terminating graymap websocket:', error);
    } finally {
      graymapWsClient = null; 
    }
  }
});
