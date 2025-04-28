// docs/input.js (Rapier Version - Improved Camera/Controls Check)

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
        this.controls = controlsRef; // Store the reference passed from game.js
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
        if (event.code === 'ShiftLeft' && !event.repeat && !this.requestingDash) {
            const now = Date.now();
            const cooldown = (CONFIG?.DASH_COOLDOWN || 0.8) * 1000;
            const canDash = (now - this.lastDashTime) > cooldown;
            const isPlaying = stateMachine?.is('playing');

            if (canDash && isPlaying) {
                // Attempt to calculate direction - checks for controls/camera internally
                if (this.calculateDashDirection()) { // Check if calculation succeeded
                    this.requestingDash = true; // Set flag for gameLogic to process
                    this.lastDashTime = now; // Start cooldown timer
                    // console.log("Dash Requested. Direction:", this.dashDirection); // DEBUG
                } else {
                    // Warning already logged by calculateDashDirection
                }
                 // No timeout needed here, gameLogic consumes the flag once
            }
        }

        // --- Handle Jump (Space) ---
        if (event.code === 'Space') {
            event.preventDefault(); // Prevent default space action (like scrolling)
            // gameLogic checks Input.keys['Space'] && isGrounded to apply impulse
        }

        // --- Allow Controls Lock Toggle (Escape) ---
        // PointerLockControls handles Escape key automatically.
    },

    // Handle key release
    handleKeyUp: function(event) {
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
        // Firing logic could be triggered here
    },

    // Handle mouse button release
    handleMouseUp: function(event) {
        this.mouseButtons[event.button] = false;
        // console.log(`Mouse Up: ${event.button}`); // DEBUG
    },

    // Calculate dash direction based on current movement keys and camera orientation
    // Returns true if successful, false otherwise
    calculateDashDirection: function() {
         // *** Improved Check: Ensure controls AND global camera are ready ***
         if (!this.controls || !window.camera) {
             console.warn(`[Input] Cannot calculate dash direction: Controls (${!!this.controls}) or Global Camera (${!!window.camera}) missing.`);
             this.dashDirection.set(0, 0, -1); // Default forward as fallback
             return false; // Indicate failure
         }

         let inputDir = new THREE.Vector3(); // Local direction based on keys
         if(this.keys['KeyW']){ inputDir.z = -1; }
         if(this.keys['KeyS']){ inputDir.z = 1; }
         if(this.keys['KeyA']){ inputDir.x = -1; }
         if(this.keys['KeyD']){ inputDir.x = 1; }

         // Get camera's world quaternion (PointerLockControls rotates the camera object directly)
         const cameraQuaternion = window.camera.quaternion;

         if(inputDir.lengthSq() === 0){ // If no movement keys pressed, dash forward relative to camera
             this.dashDirection.set(0, 0, -1); // Forward in camera space is -Z
             this.dashDirection.applyQuaternion(cameraQuaternion); // Rotate to world space
         } else { // Dash in the direction of movement input keys, relative to camera
             inputDir.normalize(); // Normalize the input direction
             this.dashDirection.copy(inputDir); // Copy normalized input direction
             this.dashDirection.applyQuaternion(cameraQuaternion); // Rotate based on camera's orientation
         }

         this.dashDirection.y = 0; // Ensure dash is horizontal (gameLogic adds vertical component if needed)
         this.dashDirection.normalize(); // Normalize the final world direction vector

         return true; // Indicate success
    }
};

// Make Input globally accessible
window.Input = Input;
console.log("input.js loaded (Improved Camera/Controls Check)");
