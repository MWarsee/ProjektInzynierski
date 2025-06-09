let mapHandler = {
    initMaps: function() {
        initCanvas();
        setupMapControls();
        setupMapInteractions();
    },
    processPoints: processPoints,
    drawGrayscaleMap: drawGrayscaleMap,
    redrawCanvas: redrawCanvas
};

let allPoints = [];
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let targetPoint = null; 

const canvas = document.getElementById('point-canvas');
const graymapCanvas = document.getElementById('graymap-canvas');
const ctx = canvas.getContext('2d');
const graymapCtx = graymapCanvas.getContext('2d');

let currentMapData = {
    rows: 0,
    cols: 0,
    scale: 1,
    offsetX: 0,
    offsetY: 0
};

function initCanvas() {
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    canvas.style.cursor = 'grab';

    graymapCtx.fillStyle = '#f8f8f8';
    graymapCtx.fillRect(0, 0, graymapCanvas.width, graymapCanvas.height);
}

function setupMapControls() {
    const clearPointsButton = document.getElementById('clear-points');
    const zoomInButton = document.getElementById('zoom-in');
    const zoomOutButton = document.getElementById('zoom-out');
    const pointCountElement = document.getElementById('point-count');
    const colorChangeButton = document.getElementById('color-change-button');

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
        let isExploreMode = false;
        colorChangeButton.textContent = 'Tryb manualny';
        
        colorChangeButton.addEventListener('click', async () => {
            try {
                const newMode = isExploreMode ? 'manual' : 'explore';
                
                const response = await fetch('http://raspberrypi.local:18080/robot/mode', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        mode: newMode
                    })
                });
                
                const result = await response.json();
                
                if (result.status === 'ok') {
                    isExploreMode = newMode === 'explore';
                    
                    if (isExploreMode) {
                        colorChangeButton.style.backgroundColor = '#e74c3c'; // Red color
                        colorChangeButton.style.color = 'white';
                        colorChangeButton.textContent = 'Tryb manualny';
                        if (window.utils && window.utils.addMessage) {
                            window.utils.addMessage('Aktywowano tryb zwiedzania - robot będzie samodzielnie eksplorować przestrzeń', 'status');
                        }
                    } else {
                        colorChangeButton.style.backgroundColor = '#3498db'; // Blue color
                        colorChangeButton.style.color = 'white';
                        colorChangeButton.textContent = 'Tryb zwiedzania';
                        if (window.utils && window.utils.addMessage) {
                            window.utils.addMessage('Przywrócono tryb manualny - robot oczekuje na polecenia', 'status');
                        }
                    }
                } else {
                    console.error('Error changing robot mode:', result.reason);
                    if (window.utils && window.utils.addMessage) {
                        window.utils.addMessage(`Błąd zmiany trybu: ${result.reason}`, 'error');
                    }
                }
            } catch (err) {
                console.error('Error changing robot mode:', err);
                if (window.utils && window.utils.addMessage) {
                    window.utils.addMessage(`Błąd zmiany trybu: ${err.message}`, 'error');
                }
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

function setupMapInteractions() {
    graymapCanvas.addEventListener('click', handleMapClick);
}

function handleMapClick(event) {
    const rect = graymapCanvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    
    const mapX = Math.floor((clickX - currentMapData.offsetX) / currentMapData.scale);
    const mapY = Math.floor((clickY - currentMapData.offsetY) / currentMapData.scale);
    
    if (mapX >= 0 && mapX < currentMapData.cols && mapY >= 0 && mapY < currentMapData.rows) {
        console.log(`Map clicked at: (${mapX}, ${mapY})`);
        
        targetPoint = { x: mapX, y: mapY };
        
        sendTargetToServer(mapX, mapY);
        
        if (window.utils && window.utils.addMessage) {
            window.utils.addMessage(`Ustawiono cel na pozycji (${mapX}, ${mapY})`, 'status');
        }
    }
}

async function sendTargetToServer(x, y) {
    try {
        const response = await fetch('http://raspberrypi.local:18080/robot/target', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                x_pixel: x,
                y_pixel: y
            })
        });
        
        const result = await response.json();
        if (result.status === 'ok') {
            console.log('Target sent successfully');
            if (window.utils && window.utils.addMessage) {
                window.utils.addMessage('Wysłano współrzędne celu do robota', 'status');
            }
        } else {
            console.error('Error sending target:', result.reason);
            if (window.utils && window.utils.addMessage) {
                window.utils.addMessage(`Błąd wysyłania celu: ${result.reason}`, 'error');
            }
        }
    } catch (err) {
        console.error('Error sending target:', err);
        if (window.utils && window.utils.addMessage) {
            window.utils.addMessage(`Błąd wysyłania celu: ${err.message}`, 'error');
        }
    }
}

function processPoints(points) {
    allPoints = points;
    const pointCountElement = document.getElementById('point-count');
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
    
    currentMapData = {
        rows: rows,
        cols: cols,
        scale: mapScale,
        offsetX: offsetX,
        offsetY: offsetY
    };
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cols;
    tempCanvas.height = rows;
    const tempCtx = tempCanvas.getContext('2d');
    const tempImageData = tempCtx.createImageData(cols, rows);
    
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const value = mapData[y][x];
            const color = Math.max(0, Math.min(255, value)); // Clamp to 0-255
            
            const index = (y * cols + x) * 4;
            tempImageData.data[index + 0] = color;     // R
            tempImageData.data[index + 1] = color;     // G
            tempImageData.data[index + 2] = color;     // B
            tempImageData.data[index + 3] = 255;       // A
        }
    }
    
    tempCtx.putImageData(tempImageData, 0, 0);
    
    graymapCtx.drawImage(
        tempCanvas, 
        offsetX, offsetY, 
        cols * mapScale, rows * mapScale
    );
    
    if (targetPoint) {
        const targetScreenX = offsetX + targetPoint.x * mapScale;
        const targetScreenY = offsetY + targetPoint.y * mapScale;
        
        graymapCtx.beginPath();
        graymapCtx.arc(targetScreenX, targetScreenY, 8, 0, Math.PI * 2);
        graymapCtx.fillStyle = 'rgba(0, 255, 0, 0.5)';
        graymapCtx.fill();
        graymapCtx.strokeStyle = 'green';
        graymapCtx.lineWidth = 2;
        graymapCtx.stroke();
        
        graymapCtx.beginPath();
        graymapCtx.moveTo(targetScreenX - 5, targetScreenY);
        graymapCtx.lineTo(targetScreenX + 5, targetScreenY);
        graymapCtx.moveTo(targetScreenX, targetScreenY - 5);
        graymapCtx.lineTo(targetScreenX, targetScreenY + 5);
        graymapCtx.strokeStyle = 'green';
        graymapCtx.lineWidth = 2;
        graymapCtx.stroke();
    }
    
    if (position) {
        drawRobotPosition(position, mapScale, offsetX, offsetY);
    }
}

function drawRobotPosition(position, scale, offsetX, offsetY) {
    const screenX = offsetX + position.x * scale;
    const screenY = offsetY + position.y * scale;
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

window.mapHandler = mapHandler;
