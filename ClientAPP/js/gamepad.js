// Gamepad support module

let gamepadIndex = null;
let lastDpadState = '';
let gamepadLoopActive = false;

// Initialize gamepad listeners
function initGamepad() {
  console.log("Initializing gamepad support...");
  window.addEventListener('gamepadconnected', handleGamepadConnected);
  window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);
  
  // Check if a gamepad is already connected (happens if gamepad was connected before page load)
  checkForGamepad();
}

function checkForGamepad() {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < gamepads.length; i++) {
    if (gamepads[i] && gamepads[i].connected) {
      console.log(`Found already connected gamepad: ${gamepads[i].id}`);
      gamepadIndex = i;
      startGamepadLoop();
      if (window.utils && window.utils.addMessage) {
        window.utils.addMessage(`Wykryto podłączony gamepad: ${gamepads[i].id}`, 'status');
      }
      break;
    }
  }
}

function handleGamepadConnected(e) {
  console.log(`Gamepad connected: ${e.gamepad.id} at index ${e.gamepad.index}`);
  gamepadIndex = e.gamepad.index;
  if (window.utils && window.utils.addMessage) {
    window.utils.addMessage(`Pad podłączony: ${e.gamepad.id}`, 'status');
  }
  startGamepadLoop();
}

function handleGamepadDisconnected(e) {
  console.log(`Gamepad disconnected: ${e.gamepad.id}`);
  if (window.utils && window.utils.addMessage) {
    window.utils.addMessage('Pad odłączony', 'status');
  }
  gamepadIndex = null;
  gamepadLoopActive = false;
}

function startGamepadLoop() {
  if (!gamepadLoopActive) {
    gamepadLoopActive = true;
    console.log("Starting gamepad update loop");
    requestAnimationFrame(updateGamepad);
  }
}

function updateGamepad() {
  if (!gamepadLoopActive) return;
  
  try {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[gamepadIndex];
    
    if (gp && gp.connected) {
      let dpadPayload = '';

      // Check DPAD buttons (standard mapping)
      if (gp.buttons[12] && gp.buttons[12].pressed) { // Up
        console.log("DPAD UP pressed");
        dpadPayload = '75;75;75;75';
      } else if (gp.buttons[13] && gp.buttons[13].pressed) { // Down
        console.log("DPAD DOWN pressed");
        dpadPayload = '-75;-75;-75;-75';
      } else if (gp.buttons[14] && gp.buttons[14].pressed) { // Left
        console.log("DPAD LEFT pressed");
        dpadPayload = '-75;75;-75;75';
      } else if (gp.buttons[15] && gp.buttons[15].pressed) { // Right
        console.log("DPAD RIGHT pressed");
        dpadPayload = '75;-75;75;-75';
      }

      // Send the command if it's changed from the last state
      if (dpadPayload && dpadPayload !== lastDpadState) {
        console.log(`Sending DPAD command: ${dpadPayload}`);
        lastDpadState = dpadPayload;
        
        if (window.utils && window.utils.sendDpadCommand) {
          window.utils.sendDpadCommand(dpadPayload);
        } else {
          console.error("utils.sendDpadCommand not available");
        }
      }

      // Reset if no buttons are pressed
      if (!gp.buttons[12].pressed && !gp.buttons[13].pressed && 
          !gp.buttons[14].pressed && !gp.buttons[15].pressed) {
        if (lastDpadState !== '') {
          console.log("Sending STOP command");
          lastDpadState = '';
          
          if (window.utils && window.utils.sendDpadCommand) {
            window.utils.sendDpadCommand('robot/stop');
          } else {
            console.error("utils.sendDpadCommand not available");
          }
        }
      }
      
      // Continue the loop
      requestAnimationFrame(updateGamepad);
    } else {
      console.log("Gamepad disconnected or not available");
      gamepadLoopActive = false;
    }
  } catch (err) {
    console.error("Error in gamepad handling:", err);
    gamepadLoopActive = false;
  }
}

// Export functions to make them available to other modules
window.gamepadHandler = {
  initGamepad
};
