let debugHandler = {
    initDebug: function() {
        setupDebugHandlers();
    }
};

function setupDebugHandlers() {
    const connectButton = document.getElementById('connect-button');
    const disconnectButton = document.getElementById('disconnect-button');
    const connectGraymapButton = document.getElementById('connect-graymap-button');
    const disconnectGraymapButton = document.getElementById('disconnect-graymap-button');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const fetchMapButton = document.getElementById('fetch-map');
    const messagesDiv = document.getElementById('messages');
    const connectionStatus = document.getElementById('connection-status');
    const graymapConnectionStatus = document.getElementById('graymap-connection-status');
    
    let connected = false;
    let graymapConnected = false;
    
    connectButton.addEventListener('click', () => {
        window.electronAPI.connectToWebSocket(window.utils.LIDAR_WS_URL);
    });
    
    connectGraymapButton.addEventListener('click', () => {
        window.electronAPI.connectToGraymapWebSocket(window.utils.GRAYMAP_WS_URL);
    });
    
    disconnectButton.addEventListener('click', () => {
        window.electronAPI.closeWebSocket();
    });
    
    disconnectGraymapButton.addEventListener('click', () => {
        window.electronAPI.closeGraymapWebSocket();
    });
    
    sendButton.addEventListener('click', () => {
        const message = messageInput.value;
        if (message && connected) {
            window.electronAPI.sendMessage(message);
            window.utils.addMessage(`Wysłano: ${message}`);
            messageInput.value = '';
        }
    });
    
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && messageInput.value && connected) {
            window.electronAPI.sendMessage(messageInput.value);
            window.utils.addMessage(`Wysłano: ${messageInput.value}`);
            messageInput.value = '';
        }
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
                    console.log("Fetched position from HTTP request:", pos);
                    window.mapHandler.drawGrayscaleMap(json.map, pos);
                } else {
                    window.mapHandler.drawGrayscaleMap(json.map, null);
                }
            }
        } catch (err) {
            console.error('Błąd podczas pobierania mapy:', err);
        }
    });
    
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
        updateConnectionState(false);
    });
    
    window.electronAPI.onGraymapConnected(() => {
        updateGraymapConnectionState(true);
    });
    
    window.electronAPI.onGraymapMessage((event, message) => {
        try {
            const data = JSON.parse(message);
            console.log("Full graymap message received:", data);
            
            if (data.map && Array.isArray(data.map)) {
                if (data.position) {
                    const robotPosition = {
                        x: data.position.x_pixel,
                        y: data.position.y_pixel,
                        theta: data.position.theta_degrees
                    };
                    window.mapHandler.drawGrayscaleMap(data.map, robotPosition);
                } else {
                    window.mapHandler.drawGrayscaleMap(data.map, null);
                }
            }
        } catch (e) {
            console.error("Błąd parsowania danych GrayMap:", e);
        }
    });
    
    window.electronAPI.onPositionDebugInfo && window.electronAPI.onPositionDebugInfo((event, positionInfo) => {
        try {
            const posData = JSON.parse(positionInfo);
        } catch (e) {
            console.error("Error parsing position debug info:", e);
        }
    });
    
    window.electronAPI.onGraymapError((event, errorMessage) => {
        updateGraymapConnectionState(false);
    });
    
    window.electronAPI.onGraymapClosed(() => {
        updateGraymapConnectionState(false);
    });
}

window.debugHandler = debugHandler;
