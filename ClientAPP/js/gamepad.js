// Gamepad support module

let gamepadIndex = null;
let lastDpadState = '';

// Initialize gamepad listeners
function initGamepad() {
  window.addEventListener('gamepadconnected', handleGamepadConnected);
  window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);
}

function handleGamepadConnected(e) {
  gamepadIndex = e.gamepad.index;
  requestAnimationFrame(updateGamepad);
}

function handleGamepadDisconnected(e) {
  gamepadIndex = null;
}

function updateGamepad() {
  const gamepads = navigator.getGamepads();
  const gp = gamepads[gamepadIndex];
  
  if (gp) {
    let dpadPayload = '';

    if (gp.buttons[12].pressed) { // Góra
      dpadPayload = '75;75;75;75';
    } else if (gp.buttons[13].pressed) { // Dół
      dpadPayload = '-75;-75;-75;-75';
    } else if (gp.buttons[14].pressed) { // Lewo
      dpadPayload = '-25;25;-25;25';
    } else if (gp.buttons[15].pressed) { // Prawo
      dpadPayload = '25;-25;25;-25';
    }

    if (dpadPayload && dpadPayload !== lastDpadState) {
      lastDpadState = dpadPayload;
      window.utils.sendDpadCommand(dpadPayload);
    }

    // Reset, jeśli nic nie wciśnięte
    if (!gp.buttons[12].pressed && !gp.buttons[13].pressed && !gp.buttons[14].pressed && !gp.buttons[15].pressed) {
      if (lastDpadState !== '') {
        lastDpadState = '';
        window.utils.sendDpadCommand('robot/stop');
      }
    }

    requestAnimationFrame(updateGamepad);
  }
}

// Export functions to make them available to other modules
window.gamepadHandler = {
  initGamepad
};
