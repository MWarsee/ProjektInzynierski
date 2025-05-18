// Gamepad test utility

function testGamepad() {
    const gamepadStatusDiv = document.createElement('div');
    gamepadStatusDiv.id = 'gamepad-status';
    gamepadStatusDiv.style.position = 'fixed';
    gamepadStatusDiv.style.bottom = '10px';
    gamepadStatusDiv.style.right = '10px';
    gamepadStatusDiv.style.background = 'rgba(0,0,0,0.7)';
    gamepadStatusDiv.style.color = 'white';
    gamepadStatusDiv.style.padding = '10px';
    gamepadStatusDiv.style.borderRadius = '5px';
    gamepadStatusDiv.style.fontFamily = 'monospace';
    gamepadStatusDiv.style.zIndex = '1000';
    gamepadStatusDiv.innerHTML = 'Gamepad Status: Not Connected';
    document.body.appendChild(gamepadStatusDiv);

    window.addEventListener('gamepadconnected', function(e) {
        console.log("Gamepad connected at index %d: %s. %d buttons, %d axes.",
            e.gamepad.index, e.gamepad.id,
            e.gamepad.buttons.length, e.gamepad.axes.length);
        
        gamepadStatusDiv.innerHTML = `Gamepad connected: ${e.gamepad.id}<br>Buttons: ${e.gamepad.buttons.length}<br>Axes: ${e.gamepad.axes.length}`;
        gamepadStatusDiv.style.background = 'rgba(0,128,0,0.7)';
        
        // Start the gamepad loop
        requestAnimationFrame(updateGamepadStatus);
    });

    window.addEventListener('gamepaddisconnected', function(e) {
        console.log("Gamepad disconnected from index %d: %s",
            e.gamepad.index, e.gamepad.id);
        
        gamepadStatusDiv.innerHTML = 'Gamepad disconnected';
        gamepadStatusDiv.style.background = 'rgba(255,0,0,0.7)';
    });

    function updateGamepadStatus() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        
        let statusHTML = 'Gamepad Status:<br>';
        let activeGamepad = null;
        
        for (let i = 0; i < gamepads.length; i++) {
            const gp = gamepads[i];
            if (gp && gp.connected) {
                activeGamepad = gp;
                statusHTML += `<strong>${gp.id}</strong> (index ${i})<br>`;
                break;
            }
        }
        
        if (activeGamepad) {
            // Show button states
            statusHTML += '<br>Buttons:<br>';
            for (let i = 0; i < activeGamepad.buttons.length; i++) {
                const val = activeGamepad.buttons[i].value;
                const pressed = activeGamepad.buttons[i].pressed;
                statusHTML += `B${i}: ${pressed ? '<strong style="color:lime">PRESSED</strong>' : 'released'} (${val.toFixed(2)})<br>`;
            }
            
            // Show axes
            statusHTML += '<br>Axes:<br>';
            for (let i = 0; i < activeGamepad.axes.length; i++) {
                const val = activeGamepad.axes[i];
                statusHTML += `A${i}: ${val.toFixed(4)}<br>`;
            }
            
            gamepadStatusDiv.innerHTML = statusHTML;
            requestAnimationFrame(updateGamepadStatus);
        }
    }

    console.log("Gamepad test utility loaded. Connect a gamepad to see button status.");
}

// Add a button to toggle the gamepad test
function addGamepadTestButton() {
    const button = document.createElement('button');
    button.textContent = 'Test Gamepad';
    button.style.position = 'fixed';
    button.style.bottom = '10px';
    button.style.right = '10px';
    button.style.zIndex = '1001';
    button.onclick = testGamepad;
    document.body.appendChild(button);
}

// Initialize when the document is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addGamepadTestButton);
} else {
    addGamepadTestButton();
}
