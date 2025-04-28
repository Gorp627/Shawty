// docs/input.js (Rapier Version - Sets Flags/Requests for gameLogic)

// Manages keyboard and mouse state globally

const Input = {
    keys: {}, // Stores currently pressed keys (e.g., { 'KeyW': true, 'Space': false })
    mouseButtons: {}, // Stores currently pressed mouse buttons (e.g., { 0: true })
    controls: null, // Reference to PointerLockControls
    lastDashTime: 0,
    requestingDash: false, // Flag set true when dash key pressed, consumed by gameLogic
    dashDirection: new THREE.Vector3(), // Calculated direction for the requested dash

    // Initialize input listeners
    init: function(controlsRef) {
        if (!controlsRef) {
            console.error("[Input] PointerLockControls reference is required for initialization!");
            return false; // Indicate failure
        }
        this.controls = controlsRef;
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));
        document.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.requestingDash = false; // Ensure flag starts false
        console.log("[Input] Initialized.");
        return true; // Indicate success
    },

    // Handle key press down
    handleKeyDown: function(event) {
        // Ignore input if typing in an input field
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
            return;
        }

        this.keys[event.code] = true;
        // console.log(`Key Down: ${event.code}`); // DEBUG

        // --- Handle Dash Request (ShiftLeft) ---
        // We just set a flag and direction; gameLogic applies the impulse.
        if (event.code === 'ShiftLeft' && !event.repeat && !this.requestingDash) {
             // Check cooldown and game state
            const now = Date.now();
            const cooldown = (CONFIG?.DASH_COOLDOWN || 0.8) * 1000;
            const canDash = (now - this.lastDashTime) > cooldown;
            const isPlaying = stateMachine?.is('playing');

            if (canDash && isPlaying) {
                this.calculateDashDirection(); // Calculate and store dash direction
                this.requestingDash = true; // Set flag for gameLogic to process
                this.lastDashTime = now; // Start cooldown timer
                // console.log("Dash Requested. Direction:", this.dashDirection); // DEBUG
                 // No timeout needed here, gameLogic consumes the flag once
            }
        }

        // --- Handle Jump (Space) ---
        // gameLogic handles applying the jump impulse based on this key state and ground check.
        if (event.code === 'Space') {
            event.preventDefault(); // Prevent default space action (like scrolling)
            // We don't apply physics here, just record the key press.
            // gameLogic will check Input.keys['Space'] && isGrounded
        }

        // --- Allow Controls Lock Toggle (Escape) ---
        // PointerLockControls handles Escape key for unlocking automatically.
        // We might need custom handling if Escape is used for other menus.
    },

    // Handle key release
    handleKeyUp: function(event) {
        // Ignore input if typing in an input field
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
            return;
        }
        this.keys[event.code] = false;
        // console.log(`Key Up: ${event.code}`); // DEBUG
    },

    // Handle mouse button press down
    handleMouseDown: function(event) {
        this.mouseButtons[event.button] = true;
        // console.log(`Mouse Down: ${event.button}`); // DEBUG

        // Lock pointer if in playing state and not already locked
        if (stateMachine?.is('playing') && this.controls && !this.controls.isLocked) {
             this.controls.lock();
        }
        // Note: Firing logic would typically go here or be triggered from here
    },

    // Handle mouse button release
    handleMouseUp: function(event) {
        this.mouseButtons[event.button] = false;
        // console.log(`Mouse Up: ${event.button}`); // DEBUG
    },

    // Calculate dash direction based on current movement keys and camera orientation
    calculateDashDirection: function() {
         if(!this.controls || !camera) {
             console.warn("[Input] Cannot calculate dash direction: Controls or Camera missing.");
             this.dashDirection.set(0, 0, -1); // Default forward
             return;
         }

         let inputDir = new THREE.Vector3(); // Local direction based on keys
         if(this.keys['KeyW']){ inputDir.z = -1; }
         if(this.keys['KeyS']){ inputDir.z = 1; }
         if(this.keys['KeyA']){ inputDir.x = -1; }
         if(this.keys['KeyD']){ inputDir.x = 1; }

         // Get camera's world quaternion
         const cameraQuaternion = camera.quaternion; // PointerLockControls applies rotation to the camera directly

         if(inputDir.lengthSq() === 0){ // If no movement keys pressed, dash forward
             this.dashDirection.set(0, 0, -1); // Forward in camera space is -Z
             this.dashDirection.applyQuaternion(cameraQuaternion); // Rotate to world space
         } else { // Dash in the direction of movement input keys
             inputDir.normalize(); // Normalize the input direction
             this.dashDirection.copy(inputDir); // Copy normalized input direction
             this.dashDirection.applyQuaternion(cameraQuaternion); // Rotate based on camera's orientation
         }

         this.dashDirection.y = 0; // Ensure dash is horizontal (gameLogic adds vertical component)
         this.dashDirection.normalize(); // Normalize the final world direction vector
    }
};

// Make Input globally accessible
window.Input = Input;
console.log("input.js loaded (Rapier - Flags/Requests for gameLogic)");
