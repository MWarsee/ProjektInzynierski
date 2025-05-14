const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const WebSocket = require('ws');

// Keep a reference to the main window
let mainWindow;
let wsClient = null;
let graymapWsClient = null;

// Buffer for batching map data
let lastMapData = null;
let mapUpdatePending = false;
const MAP_UPDATE_INTERVAL = 200; // ms

// Function to create the main window
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
  
  // Set higher frame rate for smoother rendering
  if (mainWindow.webContents) {
    mainWindow.webContents.setFrameRate(60);
  }
  mainWindow.on('closed', () => {
    // Close any open WebSocket connections when the window closes
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

// Initialize the app
app.whenReady().then(() => {
  createWindow();
});

// Quit the app when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Recreate window when app icon is clicked (macOS)
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Throttled function to prevent overwhelming the renderer
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
    // Just update the latest data, will be sent when the timeout triggers
    lastMapData = data;
  }
}

// IPC handlers for WebSocket communication
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
      wsClient.terminate();  // Force close the connection
    } catch (error) {
      console.error('Error terminating websocket:', error);
    } finally {
      wsClient = null;  // Always make sure to set to null
    }
  }
});

// Graymap WebSocket handlers
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
      // Using throttled function to prevent performance issues
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
      graymapWsClient.terminate();  // Force close the connection
    } catch (error) {
      console.error('Error terminating graymap websocket:', error);
    } finally {
      graymapWsClient = null;  // Always make sure to set to null
    }
  }
});
