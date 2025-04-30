// docs/input.js (Rapier Version - Uses Global THREE/Scope - REGEN v3 Corrected)

const Input = {
    keys: {}, // Stores currently pressed keys (e.g., { 'KeyW': true, 'Space': false })
    mouseButtons: {}, // Stores currently pressed mouse buttons (e.g., { 0: true })
    controls: null, // Reference to PointerLockControls
    lastDashTime: 0,
    requestingDash: false, // Flag set true when dash key pressed, consumed by gameLogic
    dashDirection: null, // Calculated direction vector (will be THREE.Vector3)

    // Initialize input listeners
    init: function(controlsRef) {
        // Use global THREE
        if (typeof THREE === 'undefined') {
            console.error("[Input] THREE is not defined globally! Cannot initialize Input.");
            return false;
        }
        this.dashDirection = new THREE.Vector3(); // Initialize Vector3 using global THREE

        // Use global THREE.PointerLockControls constructor for type checking
        if (!controlsRef || typeof THREE === 'undefined' || typeof THREE.PointerLockControls === 'undefined' || !(controlsRef instanceof THREE.PointerLockControls)) {
            console.error("[Input] PointerLockControls reference missing, invalid, or THREE/Controls not loaded!");
            return false; // Indicate failure
        }
        this.controls = controlsRef; // Store the reference
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));
        document.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.requestingDash = false; // Ensure flag starts false
        console.log("[Input] Initialized (Using Global THREE).");
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
            // Access global CONFIG safely
            const cooldown = (typeof CONFIG !== 'undefined' ? (CONFIG.DASH_COOLDOWN || 0.8) : 0.8) * 1000;
            // Access global stateMachine safely
            const isPlaying = (typeof stateMachine !== 'undefined' && stateMachine.is('playing'));
            // Access global lastDashTime safely (assuming lastDashTime is global)
            const canDash = (now - (window.lastDashTime || 0)) > cooldown;

            if (canDash && isPlaying) {
                // Attempt to calculate direction - checks for controls/camera internally
                if (this.calculateDashDirection()) { // Check if calculation succeeded
                    this.requestingDash = true; // Set flag for gameLogic to process
                    window.lastDashTime = now; // Update global cooldown timer
                    // console.log("Dash Requested. Direction:", this.dashDirection); // DEBUG
                } else {
                    // Warning already logged by calculateDashDirection
                }
                 // No timeout needed here, gameLogic consumes the flag once
            }
        }

        // --- Handle Jump (Space) ---
        if (event.code === 'Space') {
            // gameLogic checks Input.keys['Space'] && isGrounded to apply velocity change
             if (stateMachine?.is('playing')) { // Prevent space scrolling only when playing
                event.preventDefault();
             }
        }

        // --- Allow Controls Lock Toggle (Escape) ---
        // PointerLockControls handles Escape key automatically to unlock.
        // Locking is handled on mouse down.
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
        // Ignore clicks on UI elements if needed (e.g., buttons)
        // if (event.target !== document.getElementById('gameCanvas')) return; // Example: only lock if clicking canvas

        this.mouseButtons[event.button] = true;
        // console.log(`Mouse Down: ${event.button}`); // DEBUG

        // Lock pointer if in playing state and not already locked
        // Access global stateMachine safely
        if (typeof stateMachine !== 'undefined' && stateMachine.is('playing') && this.controls && !this.controls.isLocked) {
             this.controls.lock();
        }
        // Firing logic checks Input.mouseButtons[0] in gameLogic.js update loop
    },

    // Handle mouse button release
    handleMouseUp: function(event) {
        this.mouseButtons[event.button] = false;
        // console.log(`Mouse Up: ${event.button}`); // DEBUG
    },

    // Calculate dash direction based on current movement keys and camera orientation
    // Returns true if successful, false otherwise
    calculateDashDirection: function() {
         // Use global THREE, controls, camera safely
         if (!this.controls || typeof window === 'undefined' || !window.camera || typeof THREE === 'undefined') {
             console.warn(`[Input] Cannot calculate dash direction: Controls, Camera, or THREE missing.`);
             if (this.dashDirection) this.dashDirection.set(0, 0, -1); // Default forward as fallback if vector exists
             return false; // Indicate failure
         }

         let inputDir = new THREE.Vector3(); // Use global THREE
         if(this.keys['KeyW']){ inputDir.z = -1; }
         if(this.keys['KeyS']){ inputDir.z = 1; }
         if(this.keys['KeyA']){ inputDir.x = -1; } // Corrected A/D relative to camera
         if(this.keys['KeyD']){ inputDir.x = 1; } // Corrected A/D relative to camera

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

// Export globally if not using modules
if (typeof window !== 'undefined') {
    window.Input = Input;
}
console.log("input.js loaded (Using Global THREE/Scope - v3 Corrected)");
