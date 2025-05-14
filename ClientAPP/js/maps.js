// This file handles map drawing and processing functionality

let mapHandler = {
    initMaps: function() {
        initCanvas();
        setupMapControls();
    },
    processPoints: processPoints,
    drawGrayscaleMap: drawGrayscaleMap,
    redrawCanvas: redrawCanvas
};

let allPoints = [];
let scale = 1;
let offsetX = 0;
let offsetY = 0;

// Canvas references
const canvas = document.getElementById('point-canvas');
const graymapCanvas = document.getElementById('graymap-canvas');
const ctx = canvas.getContext('2d');
const graymapCtx = graymapCanvas.getContext('2d');

function initCanvas() {
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    canvas.style.cursor = 'grab';

    graymapCtx.fillStyle = '#f8f8f8';
    graymapCtx.fillRect(0, 0, graymapCanvas.width, graymapCanvas.height);
}

function setupMapControls() {
    // DOM Elements
    const clearPointsButton = document.getElementById('clear-points');
    const zoomInButton = document.getElementById('zoom-in');
    const zoomOutButton = document.getElementById('zoom-out');
    const pointCountElement = document.getElementById('point-count');

    // Map controls
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

    // Canvas dragging
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

function processPoints(points) {
    // Dodajemy nowe punkty do istniejących
    allPoints = points;
    const pointCountElement = document.getElementById('point-count');
    pointCountElement.textContent = `Punkty: ${allPoints.length}`;

    // Rysujemy wszystkie punkty
    redrawCanvas();
}

function redrawCanvas() {
    // Czyszczenie canvas
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Rysowanie siatki
    drawGrid();

    // Środek canvas
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Rysowanie punktów
    ctx.fillStyle = 'blue';
    for (const point of allPoints) {
        const screenX = centerX + (point.x * scale) + offsetX;
        const screenY = centerY - (point.y * scale) + offsetY;

        // Sprawdzamy czy punkt jest widoczny na canvas
        if (screenX >= 0 && screenX <= canvas.width && screenY >= 0 && screenY <= canvas.height) {
            ctx.beginPath();
            ctx.arc(screenX, screenY, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Rysowanie osi
    drawAxes();
}

function drawGrid() {
    const gridSize = 50 * scale;
    const offsetGridX = offsetX % gridSize;
    const offsetGridY = offsetY % gridSize;

    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.5;

    // Pionowe linie siatki
    for (let x = offsetGridX; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    // Poziome linie siatki
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

    // Rysowanie osi X
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(canvas.width, centerY);
    ctx.stroke();

    // Rysowanie osi Y
    ctx.strokeStyle = 'rgba(0, 128, 0, 0.5)';
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, canvas.height);
    ctx.stroke();

    // Rysowanie punktu (0,0)
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
    ctx.fill();
}

function drawGrayscaleMap(mapData, position = null) {
    
    // Clear the canvas
    graymapCtx.clearRect(0, 0, graymapCanvas.width, graymapCanvas.height);
    graymapCtx.fillStyle = '#f8f8f8';
    graymapCtx.fillRect(0, 0, graymapCanvas.width, graymapCanvas.height);
    
    const rows = mapData.length;
    const cols = mapData[0].length;

    // Calculate scaling to fit the canvas
    const scaleX = graymapCanvas.width / cols;
    const scaleY = graymapCanvas.height / rows;
    const mapScale = Math.min(scaleX, scaleY);
    
    // Calculate offsets to center the map
    const offsetX = (graymapCanvas.width - cols * mapScale) / 2;
    const offsetY = (graymapCanvas.height - rows * mapScale) / 2;
    
    // Draw map in a temporary canvas first (for better performance)
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
    
    // Draw the map on the main canvas
    graymapCtx.drawImage(
        tempCanvas, 
        offsetX, offsetY, 
        cols * mapScale, rows * mapScale
    );
    
    // Draw robot position if available
    if (position) {
        console.log(`Drawing robot at position: (${position.x}, ${position.y})`);
        drawRobotPosition(position, mapScale, offsetX, offsetY);
    }
}

function drawRobotPosition(position, scale, offsetX, offsetY) {
    // Calculate screen coordinates for the robot position
    const screenX = offsetX + position.x * scale;
    const screenY = offsetY + position.y * scale;
    const theta = position.theta * (Math.PI / 180); // Convert to radians
    
    // Draw position dot
    graymapCtx.beginPath();
    graymapCtx.arc(screenX, screenY, 6, 0, Math.PI * 2);
    graymapCtx.fillStyle = 'red';
    graymapCtx.fill();
    
    // Simple direction indicator
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

// Make mapHandler available globally
window.mapHandler = mapHandler;
