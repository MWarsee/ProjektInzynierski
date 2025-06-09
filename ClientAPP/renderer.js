document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connect-button');
    const disconnectButton = document.getElementById('disconnect-button');
    const connectGraymapButton = document.getElementById('connect-graymap-button');
    const disconnectGraymapButton = document.getElementById('disconnect-graymap-button');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const messagesDiv = document.getElementById('messages');
    const connectionStatus = document.getElementById('connection-status');
    const graymapConnectionStatus = document.getElementById('graymap-connection-status');
    const canvas = document.getElementById('point-canvas');
    const graymapCanvas = document.getElementById('graymap-canvas');
    const ctx = canvas.getContext('2d');
    const graymapCtx = graymapCanvas.getContext('2d');
    const clearPointsButton = document.getElementById('clear-points');
    const zoomInButton = document.getElementById('zoom-in');
    const zoomOutButton = document.getElementById('zoom-out');
    const pointCountElement = document.getElementById('point-count');
    const fetchMapButton = document.getElementById('fetch-map');
    const colorChangeButton = document.getElementById('color-change-button');
    
    const LIDAR_WS_URL = 'ws://raspberrypi.local:18080/ws/lidar';
    const GRAYMAP_WS_URL = 'ws://raspberrypi.local:18080/ws/map';
    
    if (!window.utils) {
        window.utils = {
            LIDAR_WS_URL,
            GRAYMAP_WS_URL,
            addMessage: addMessage,
            sendDpadCommand: sendDpadCommand
        };
    }
    
    if (!window.mapHandler) {
        window.mapHandler = {
            initMaps: function() {
                initCanvas();
                setupMapControls();
            },
            processPoints: processPoints,
            drawGrayscaleMap: drawGrayscaleMap
        };
    } else {
        window.mapHandler.initMaps();
    }
    
    if (!window.debugHandler) {
        window.debugHandler = {
            initDebug: function() {
            setupDebugHandlers();
            }
        };
    } else {
        window.debugHandler.initDebug();
    }
    
    if (!window.gamepadHandler) {
        window.gamepadHandler = {
            initGamepad: function() {
            setupGamepadHandlers();
            }
        };
    } else {
        window.gamepadHandler.initGamepad();
    }
    
    let connected = false;
    let graymapConnected = false;
    let allPoints = [];
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let robotPosition = null; 
    
    if (!window.modulesInitialized) {
        if (typeof window.mapHandler.initMaps === 'function') {
            window.mapHandler.initMaps();
        } else {
            initCanvas();
            setupMapControls();
        }
        
        if (typeof window.debugHandler.initDebug === 'function') {
            window.debugHandler.initDebug();
        } else {
            setupDebugHandlers();
        }
        
        if (typeof window.gamepadHandler.initGamepad === 'function') {
            window.gamepadHandler.initGamepad();
        } else {
            setupGamepadHandlers();
        }
        
        window.modulesInitialized = true;
    }
    
    window.addEventListener('beforeunload', (event) => {
        if (connected) {
            try {
                window.electronAPI.closeWebSocket();
            } catch (err) {
                console.error('Error during LiDAR WebSocket cleanup:', err);
            }
        }
        
        if (graymapConnected) {
            try {
                window.electronAPI.closeGraymapWebSocket();
            } catch (err) {
                console.error('Error during GrayMap WebSocket cleanup:', err);
            }
        }
    });
        
    async function sendDpadCommand(dataString) {
      try {
        await fetch('http://raspberrypi.local:18080/arduino/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            data: dataString
          })
        });
        addMessage(`Wysłano do Arduino: ${dataString}`, 'status');
      } catch (err) {
        console.error('Błąd wysyłania do Arduino:', err);
        addMessage('Błąd wysyłania: ' + err.message, 'error');
      }
    }
    
    function addMessage(text, type = '') {
      const messageElement = document.createElement('div');
      messageElement.classList.add('message');
      if (type) messageElement.classList.add(type);
      messageElement.textContent = text;
      messagesDiv.appendChild(messageElement);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    function updateConnectionState(isConnected) {
      connected = isConnected;
      connectButton.disabled = isConnected;
      disconnectButton.disabled = !isConnected;
      messageInput.disabled = !isConnected;
      sendButton.disabled = !isConnected;
      connectionStatus.textContent = isConnected ? 'Połączono' : 'Nie połączono';
      connectionStatus.style.color = isConnected ? 'green' : 'red';
    }
    
    function updateGraymapConnectionState(isConnected) {
      graymapConnected = isConnected;
      connectGraymapButton.disabled = isConnected;
      disconnectGraymapButton.disabled = !isConnected;
      graymapConnectionStatus.textContent = isConnected ? 'Połączono' : 'Nie połączono';
      graymapConnectionStatus.style.color = isConnected ? 'green' : 'red';
    }
        
    function setupDebugHandlers() {
        connectButton.addEventListener('click', () => {
          window.electronAPI.connectToWebSocket(LIDAR_WS_URL);
        });
        
        connectGraymapButton.addEventListener('click', () => {
          window.electronAPI.connectToGraymapWebSocket(GRAYMAP_WS_URL);
        });
          disconnectButton.addEventListener('click', () => {
          try {
            window.electronAPI.closeWebSocket();
            addMessage('Zamykanie połączenia...', 'status');
          } catch (err) {
            console.error('Error disconnecting from WebSocket:', err);
            addMessage('Błąd zamykania połączenia: ' + err.message, 'error');
          }
        });
          disconnectGraymapButton.addEventListener('click', () => {
          try {
            window.electronAPI.closeGraymapWebSocket();
            addMessage('Zamykanie połączenia GrayMap...', 'status');
          } catch (err) {
            console.error('Error disconnecting from GrayMap WebSocket:', err);
            addMessage('Błąd zamykania połączenia GrayMap: ' + err.message, 'error');
          }
        });
        
        sendButton.addEventListener('click', () => {
          const message = messageInput.value;
          if (message && connected) {
            window.electronAPI.sendMessage(message);
            messageInput.value = '';
          }
        });
        
        messageInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter' && messageInput.value && connected) {
            window.electronAPI.sendMessage(messageInput.value);
            messageInput.value = '';
          }
        });
        
        window.electronAPI.onConnected(() => {
          updateConnectionState(true);
        });
        
        window.electronAPI.onMessage((event, message) => {
          
          try {
            const data = JSON.parse(message);
            if (data.points && Array.isArray(data.points)) {
              window.mapHandler.processPoints(data.points);
            }
          } catch (e) {
            console.error("Błąd parsowania JSON:", e);
          }
        });
        
        window.electronAPI.onError((event, errorMessage) => {
          updateConnectionState(false);
        });
          window.electronAPI.onClosed(() => {
          console.log('WebSocket connection closed');
          updateConnectionState(false);
          addMessage('Połączenie zostało zamknięte', 'status');
        });
        
        window.electronAPI.onGraymapConnected(() => {
          updateGraymapConnectionState(true);
        });
        
        window.electronAPI.onGraymapMessage((event, message) => {
          
          try {
            const data = JSON.parse(message);
            
            console.log("Full graymap message:", data);
            
            if (data.map && Array.isArray(data.map)) {
                if (data.position) {
                    console.log("Full position data:", data.position);
                    
                    robotPosition = {
                        x: data.position.x_pixel,
                        y: data.position.y_pixel,
                        theta: data.position.theta_degrees
                    };
                    
                    console.log("Extracted robot position:", robotPosition);
                    
                    drawGrayscaleMap(data.map, robotPosition);
                } else {
                    console.log("No position data in map message");
                    drawGrayscaleMap(data.map, null);
                }
            }
          } catch (e) {
            console.error("Błąd parsowania danych GrayMap:", e);
          }
        });
        
        window.electronAPI.onGraymapError((event, errorMessage) => {
          updateGraymapConnectionState(false);
        });
          window.electronAPI.onGraymapClosed(() => {
          console.log('GrayMap WebSocket connection closed');
          updateGraymapConnectionState(false);
          addMessage('Połączenie GrayMap zostało zamknięte', 'status');
        });
        
        fetchMapButton.addEventListener('click', async () => {
          try {
            const response = await fetch('http://raspberrypi.local:18080/lidar/map');
            const json = await response.json();
    
            if (json.map && Array.isArray(json.map)) {
              if (json.position) {
                const pos = {
                  x: json.position.x_pixel,
                  y: json.position.y_pixel,
                  theta: json.position.theta_degrees
                };
                console.log("Fetched position:", pos);
                drawGrayscaleMap(json.map, pos);
              } else {
                drawGrayscaleMap(json.map, null);
              }
            } else {
            }
          } catch (err) {
            console.error('Błąd podczas pobierania mapy:', err);
          }
        });
    }
    
    function setupMapControls() {
        clearPointsButton.addEventListener('click', () => {
          allPoints = [];
          pointCountElement.textContent = `Punkty: 0`;
          redrawCanvas();
        });
        
        zoomInButton.addEventListener('click', () => {
          scale *= 1.2;
          redrawCanvas();
        });
        
        zoomOutButton.addEventListener('click', () => {
          scale /= 1.2;
          redrawCanvas();
        });
        
        if (colorChangeButton) {
          let isColorChanged = false;
          colorChangeButton.addEventListener('click', () => {
            isColorChanged = !isColorChanged;
            
            if (isColorChanged) {
                colorChangeButton.style.backgroundColor = '#3498db';
                colorChangeButton.style.color = 'white';
                colorChangeButton.textContent = 'Tryb zwiedzania';
            } else {
                colorChangeButton.style.backgroundColor = '';
                colorChangeButton.style.color = '';
                colorChangeButton.textContent = 'Tryb manualny';
            }
          });
        }
        
        let isDragging = false;
        let lastX, lastY;
        
        canvas.addEventListener('mousedown', (e) => {
          isDragging = true;
          lastX = e.clientX;
          lastY = e.clientY;
          canvas.style.cursor = 'grabbing';
        });
        
        canvas.addEventListener('mousemove', (e) => {
          if (isDragging) {
            const deltaX = e.clientX - lastX;
            const deltaY = e.clientY - lastY;
            
            offsetX += deltaX;
            offsetY += deltaY;
            
            lastX = e.clientX;
            lastY = e.clientY;
            
            redrawCanvas();
          }
        });
        
        canvas.addEventListener('mouseup', () => {
          isDragging = false;
          canvas.style.cursor = 'grab';
        });
        
        canvas.addEventListener('mouseleave', () => {
          isDragging = false;
          canvas.style.cursor = 'grab';
        });
    }
    
    function setupGamepadHandlers() {
        let gamepadIndex = null;
        let lastDpadState = '';
        
        window.addEventListener('gamepadconnected', (e) => {
          gamepadIndex = e.gamepad.index;
          addMessage(`Pad podłączony: ${e.gamepad.id}`, 'status');
          requestAnimationFrame(updateGamepad);
        });
    
        window.addEventListener('gamepaddisconnected', (e) => {
          addMessage('Pad odłączony', 'status');
          gamepadIndex = null;
        });
    
        function updateGamepad() {
          const gamepads = navigator.getGamepads();
          const gp = gamepads[gamepadIndex];
          if (gp) {
            let dpadPayload = '';
    
            if (gp.buttons[12].pressed) { 
              dpadPayload = '75;75;75;75';
            } else if (gp.buttons[13].pressed) { 
              dpadPayload = '-75;-75;-75;-75';
            } else if (gp.buttons[14].pressed) { 
              dpadPayload = '-75;75;-75;75';
            } else if (gp.buttons[15].pressed) {
              dpadPayload = '75;-75;75;-75';
            }
    
            if (dpadPayload && dpadPayload !== lastDpadState) {
              lastDpadState = dpadPayload;
              sendDpadCommand(dpadPayload);
            }
    
            if (!gp.buttons[12].pressed && !gp.buttons[13].pressed && !gp.buttons[14].pressed && !gp.buttons[15].pressed) {
              if (lastDpadState !== '') {
                lastDpadState = '';
                sendDpadCommand('robot/stop');
              }
            }
    
            requestAnimationFrame(updateGamepad);
          }
        }
    }
    
    function initCanvas() {
      ctx.fillStyle = '#f8f8f8';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      canvas.style.cursor = 'grab';
      
      graymapCtx.fillStyle = '#f8f8f8';
      graymapCtx.fillRect(0, 0, graymapCanvas.width, graymapCanvas.height);
    }
    
    function processPoints(points) {
      allPoints = points;
      pointCountElement.textContent = `Punkty: ${allPoints.length}`;
      
      redrawCanvas();
    }
    
    function redrawCanvas() {
      ctx.fillStyle = '#f8f8f8';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      drawGrid();
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      ctx.fillStyle = 'blue';
      for (const point of allPoints) {
        const screenX = centerX + (point.x * scale) + offsetX;
        const screenY = centerY - (point.y * scale) + offsetY; 
        
        if (screenX >= 0 && screenX <= canvas.width && screenY >= 0 && screenY <= canvas.height) {
          ctx.beginPath();
          ctx.arc(screenX, screenY, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      drawAxes();
    }
    
    function drawGrid() {
      const gridSize = 50 * scale;
      const offsetGridX = offsetX % gridSize;
      const offsetGridY = offsetY % gridSize;
      
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 0.5;
      
      for (let x = offsetGridX; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      
      for (let y = offsetGridY; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }
    
    function drawAxes() {
      const centerX = canvas.width / 2 + offsetX;
      const centerY = canvas.height / 2 + offsetY;
      
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(canvas.width, centerY);
      ctx.stroke();
      
      ctx.strokeStyle = 'rgba(0, 128, 0, 0.5)';
      ctx.beginPath();
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, canvas.height);
      ctx.stroke();
      
      ctx.fillStyle = 'red';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    
    function drawGrayscaleMap(mapData, position = null) {
      console.log("Drawing grayscale map with position:", position);
      
      graymapCtx.clearRect(0, 0, graymapCanvas.width, graymapCanvas.height);
      graymapCtx.fillStyle = '#f8f8f8';
      graymapCtx.fillRect(0, 0, graymapCanvas.width, graymapCanvas.height);
      
      const rows = mapData.length;
      const cols = mapData[0].length;

      const scaleX = graymapCanvas.width / cols;
      const scaleY = graymapCanvas.height / rows;
      const mapScale = Math.min(scaleX, scaleY);
      
      const offsetX = (graymapCanvas.width - cols * mapScale) / 2;
      const offsetY = (graymapCanvas.height - rows * mapScale) / 2;
      
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const value = mapData[y][x];
          const color = Math.max(0, Math.min(255, value)); // Clamp to 0-255
          
          const screenX = x * mapScale + offsetX;
          const screenY = y * mapScale + offsetY;
          
          graymapCtx.fillStyle = `rgb(${color},${color},${color})`;
          graymapCtx.fillRect(screenX, screenY, mapScale, mapScale);
        }
      }
      
      if (position) {
        console.log(`Drawing robot position at: (${position.x}, ${position.y})`);
        
        const screenX = position.x * mapScale + offsetX;
        const screenY = position.y * mapScale + offsetY;
        const theta = position.theta * (Math.PI / 180); // Convert to radians
        
        graymapCtx.beginPath();
        graymapCtx.arc(screenX, screenY, 6, 0, Math.PI * 2);
        graymapCtx.fillStyle = 'red';
        graymapCtx.fill();
        
        const directionLength = 15; 
        const dirX = screenX + directionLength * Math.cos(theta);
        const dirY = screenY + directionLength * Math.sin(theta);
        
        graymapCtx.beginPath();
        graymapCtx.moveTo(screenX, screenY);
        graymapCtx.lineTo(dirX, dirY);
        graymapCtx.strokeStyle = 'blue';
        graymapCtx.lineWidth = 2;
        graymapCtx.stroke();
      }
    }
    
    if (window.gamepadHandler && typeof window.gamepadHandler.initGamepad === 'function') {
        console.log("Initializing gamepad support from renderer.js");
        setTimeout(() => {
            window.gamepadHandler.initGamepad();
        }, 500); 
    } else {
        console.warn("Gamepad handler not available!");
    }
    
    console.log('Application initialized successfully');
});