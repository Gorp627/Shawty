// docs/input.js (Rapier Version - Uses Global THREE/Scope - REGEN v3 Corrected - WITH DEBUG LOGS)

const Input = {
    keys: {}, // Stores currently pressed keys (e.g., { 'KeyW': true, 'Space': false })
    mouseButtons: {}, // Stores currently pressed mouse buttons (e.g., { 0: true })
    controls: null, // Reference to PointerLockControls
    lastDashTime: 0,
    requestingDash: false, // Flag set true when dash key pressed, consumed by gameLogic
    dashDirection: null, // Calculated direction vector (will be THREE.Vector3)

    // Initialize input listeners
    init: function(controlsRef) {
        console.log('[DEBUG Input] init called.'); // DEBUG
        // Use global THREE
        if (typeof THREE === 'undefined') {
            console.error("[Input] THREE is not defined globally! Cannot initialize Input.");
            return false;
        }
        this.dashDirection = new THREE.Vector3(); // Initialize Vector3 using global THREE
        console.log('[DEBUG Input] THREE found, dashDirection vector created.'); // DEBUG

        // Use global THREE.PointerLockControls constructor for type checking
        if (!controlsRef || typeof THREE === 'undefined' || typeof THREE.PointerLockControls === 'undefined' || !(controlsRef instanceof THREE.PointerLockControls)) {
            console.error("[Input] PointerLockControls reference missing, invalid, or THREE/Controls not loaded!");
            return false; // Indicate failure
        }
        this.controls = controlsRef; // Store the reference
        console.log('[DEBUG Input] PointerLockControls reference stored.'); // DEBUG

        // --- Bind Event Listeners ---
        console.log('[DEBUG Input] Binding event listeners...'); // DEBUG
        document.addEventListener('keydown', this.handleKeyDown.bind(this), false);
        document.addEventListener('keyup', this.handleKeyUp.bind(this), false);
        document.addEventListener('mousedown', this.handleMouseDown.bind(this), false);
        document.addEventListener('mouseup', this.handleMouseUp.bind(this), false);
        console.log('[DEBUG Input] Listeners bound.'); // DEBUG

        this.requestingDash = false; // Ensure flag starts false
        console.log("[Input] Initialized (Using Global THREE).");
        return true; // Indicate success
    },

    // Handle key press down
    handleKeyDown: function(event) {
        // Ignore input if typing in an input field
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
             console.log(`[DEBUG Input] KeyDown ignored (typing in input): ${event.code}`); // DEBUG
            return;
        }

        // Only log if state changes to prevent console spam on key hold
        if (!this.keys[event.code]) {
            console.log(`[DEBUG Input] KeyDown registered: ${event.code}`); // DEBUG
        }
        this.keys[event.code] = true; // Store the key state

        // --- Handle Dash Request (ShiftLeft) ---
        if (event.code === 'ShiftLeft' && !event.repeat && !this.requestingDash) {
            console.log(`[DEBUG Input] ShiftLeft pressed (down). Checking dash conditions...`); // DEBUG
            const now = Date.now();
            const cooldown = (typeof CONFIG !== 'undefined' ? (CONFIG.DASH_COOLDOWN || 0.8) : 0.8) * 1000;
            const isPlaying = (typeof stateMachine !== 'undefined' && stateMachine.is('playing'));
            const canDash = (now - (window.lastDashTime || 0)) > cooldown;
            console.log(`[DEBUG Input] Dash Check: isPlaying=${isPlaying}, canDash=${canDash} (Now: ${now}, Last: ${window.lastDashTime || 0}, CD: ${cooldown})`); // DEBUG

            if (canDash && isPlaying) {
                 console.log(`[DEBUG Input] Attempting to calculate dash direction...`); // DEBUG
                if (this.calculateDashDirection()) { // Check if calculation succeeded
                    this.requestingDash = true; // Set flag for gameLogic to process
                    window.lastDashTime = now; // Update global cooldown timer
                    console.log("[DEBUG Input] Dash Requested. Direction:", this.dashDirection.toArray().map(n=>n.toFixed(2))); // DEBUG
                } else {
                    console.warn("[DEBUG Input] Dash direction calculation failed."); // DEBUG calculation logs warning too
                }
            }
        }

        // --- Handle Jump (Space) ---
        if (event.code === 'Space') {
             // Logic in gameLogic checks this key state along with grounded status
             console.log(`[DEBUG Input] Space key pressed (down).`); // DEBUG
             if (stateMachine?.is('playing')) { // Prevent space scrolling only when playing
                event.preventDefault();
             }
        }

        // --- Handle Rocket Jump Modifier Key (E) ---
         if (event.code === 'KeyE') {
             console.log(`[DEBUG Input] E key pressed (down).`); // DEBUG
             // Logic in performShoot checks this key state when mouse is clicked
         }

        // --- Allow Controls Lock Toggle (Escape) ---
        // PointerLockControls handles Escape key automatically to unlock.
        // Locking is handled on mouse down.
    },

    // Handle key release
    handleKeyUp: function(event) {
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
            console.log(`[DEBUG Input] KeyUp ignored (typing in input): ${event.code}`); // DEBUG
            return;
        }
         // Only log if state changes
         if (this.keys[event.code]) {
            console.log(`[DEBUG Input] KeyUp registered: ${event.code}`); // DEBUG
         }
        this.keys[event.code] = false;
    },

    // Handle mouse button press down
    handleMouseDown: function(event) {
        // Ignore clicks on UI elements if needed (e.g., buttons on overlay)
        // Example: Check if click target is inside a UI container
        const uiScreens = document.querySelectorAll('.screen');
        let clickedOnUI = false;
        uiScreens.forEach(screen => {
             if (screen.classList.contains('visible') && screen.contains(event.target)) {
                 clickedOnUI = true;
             }
        });
        if (clickedOnUI && event.target.tagName !== 'CANVAS') { // Allow clicking canvas even if UI visible
             console.log(`[DEBUG Input] MouseDown ignored (clicked on UI element: ${event.target.tagName}#${event.target.id})`); // DEBUG
             return;
        }


        console.log(`[DEBUG Input] MouseDown registered: Button ${event.button}`); // DEBUG
        this.mouseButtons[event.button] = true;

        // Lock pointer if in playing state and not already locked
        if (typeof stateMachine !== 'undefined' && stateMachine.is('playing') && this.controls && !this.controls.isLocked) {
             console.log(`[DEBUG Input] Requesting pointer lock on MouseDown.`); // DEBUG
             this.controls.lock();
        }
        // Firing logic checks Input.mouseButtons[0] in gameLogic.js update loop
    },

    // Handle mouse button release
    handleMouseUp: function(event) {
         // Only log if state changes
         if (this.mouseButtons[event.button]) {
            console.log(`[DEBUG Input] MouseUp registered: Button ${event.button}`); // DEBUG
         }
        this.mouseButtons[event.button] = false;
    },

    // Calculate dash direction based on current movement keys and camera orientation
    // Returns true if successful, false otherwise
    calculateDashDirection: function() {
         if (!this.controls || typeof window === 'undefined' || !window.camera || typeof THREE === 'undefined') {
             console.warn(`[DEBUG Input] Cannot calculate dash direction: Controls, Camera, or THREE missing.`); // DEBUG
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
             console.log(`[DEBUG Input] Dash direction calculated based on camera forward.`); // DEBUG
         } else { // Dash in the direction of movement input keys, relative to camera
             inputDir.normalize(); // Normalize the input direction
             this.dashDirection.copy(inputDir); // Copy normalized input direction
             this.dashDirection.applyQuaternion(cameraQuaternion); // Rotate based on camera's orientation
             console.log(`[DEBUG Input] Dash direction calculated based on input keys and camera.`); // DEBUG
         }

         this.dashDirection.y = 0; // Ensure dash is horizontal (gameLogic adds vertical component if needed)
         this.dashDirection.normalize(); // Normalize the final world direction vector

         console.log(`[DEBUG Input] Final dash direction calculated: (${this.dashDirection.x.toFixed(2)}, ${this.dashDirection.y.toFixed(2)}, ${this.dashDirection.z.toFixed(2)})`); // DEBUG
         return true; // Indicate success
    }
};

// Export globally if not using modules
if (typeof window !== 'undefined') {
    window.Input = Input;
}
console.log("input.js loaded (Using Global THREE/Scope - v3 Corrected - WITH DEBUG LOGS)");
