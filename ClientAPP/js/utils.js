const LIDAR_WS_URL = 'ws://raspberrypi.local:18080/ws/lidar';
const GRAYMAP_WS_URL = 'ws://raspberrypi.local:18080/ws/map';

function addMessage(text, type = '') {
    const messagesDiv = document.getElementById('messages');
    
    const MAX_MESSAGES = 50;
    while (messagesDiv.childElementCount > MAX_MESSAGES) {
        messagesDiv.removeChild(messagesDiv.firstChild);
    }
    
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    if (type) messageElement.classList.add(type);
    messageElement.textContent = text;
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

function debounce(func, wait) {
    let timeout;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    }
}

async function sendDpadCommand(dataString) {
    console.log(`Sending DPAD command to Arduino: ${dataString}`);
    try {
        const response = await fetch('http://raspberrypi.local:18080/arduino/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: dataString
            })
        });
        
        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }
        
        const result = await response.text();
        console.log(`Arduino command response: ${result}`);
        addMessage(`Wysłano do Arduino: ${dataString}`, 'status');
        return true;
    } catch (err) {
        console.error('Błąd wysyłania do Arduino:', err);
        addMessage(`Błąd wysyłania do Arduino: ${err.message}`, 'error');
        return false;
    }
}

function cleanupWebSockets() {
    try {
        if (window.electronAPI) {
            console.log('Terminating WebSocket connections...');
            window.electronAPI.closeWebSocket();
            window.electronAPI.closeGraymapWebSocket();
        }
    } catch (err) {
        console.error('Error during WebSocket cleanup:', err);
    }
}

window.utils = {
    LIDAR_WS_URL,
    GRAYMAP_WS_URL,
    addMessage,
    throttle,
    debounce,
    sendDpadCommand,
    cleanupWebSockets
};
