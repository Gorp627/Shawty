// docs/input.js (Rapier Version - Improved Camera/Controls Check & Unlock Handling)

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
        // Add listener for pointer lock/unlock events
        this.controls.addEventListener('lock', this.handlePointerLock.bind(this));
        this.controls.addEventListener('unlock', this.handlePointerUnlock.bind(this));
        this.requestingDash = false; // Ensure flag starts false
        console.log("[Input] Initialized.");
        return true; // Indicate success
    },

     handlePointerLock: function() {
         console.log("[Input] Pointer Locked");
         // Optional: Hide cursor, resume game logic if paused on unlock
          document.body.style.cursor = 'none';
          if(gameUI) gameUI.classList.add('locked'); // Add class to hide/show UI elements like crosshair
     },

     handlePointerUnlock: function() {
         console.log("[Input] Pointer Unlocked");
         // IMPORTANT: Clear movement keys when pointer unlocks to prevent unwanted movement
         // This happens if player presses ESC while holding W, for example
         this.clearMovementKeys();
         // Optional: Pause game logic or show menu
         document.body.style.cursor = 'auto';
         if(gameUI) gameUI.classList.remove('locked');
     },

     clearMovementKeys: function() {
        this.keys['KeyW'] = false;
        this.keys['KeyA'] = false;
        this.keys['KeyS'] = false;
        this.keys['KeyD'] = false;
        this.keys['Space'] = false; // Also clear jump
        this.keys['ShiftLeft'] = false; // Also clear sprint/dash trigger key
        console.log("[Input] Cleared movement keys on pointer unlock.");
     },


    // Handle key press down
    handleKeyDown: function(event) {
        // Ignore input if typing in an input field
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
            return;
        }
        // Ignore if pointer isn't locked (except for keys that might unlock/lock like ESC, handled by PointerLockControls)
        if (!this.controls?.isLocked && event.code !== 'Escape') {
             // Don't process game input like W,A,S,D, Space, Shift if pointer isn't locked
             return;
        }

        this.keys[event.code] = true;
        // console.log(`Key Down: ${event.code}`); // DEBUG

        // --- Handle Dash Request (ShiftLeft) ---
        // Check ShiftLeft AND a movement key to allow shift for other things later?
        // Or just ShiftLeft is fine for now.
        if (event.code === 'ShiftLeft' && !event.repeat && !this.requestingDash) {
            const now = Date.now();
            const cooldown = (CONFIG?.DASH_COOLDOWN || 0.8) * 1000;
            const player = localPlayerId ? players[localPlayerId] : null;
            const canDash = (now - this.lastDashTime) > cooldown;
            const isPlaying = stateMachine?.is('playing');
            const isAlive = player?.health > 0;

            if (canDash && isPlaying && isAlive) {
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
        // We might receive keyup events even if pointer wasn't locked when keydown happened (e.g., Alt+Tab)
        // So, always register the keyup event.
        this.keys[event.code] = false;
        // console.log(`Key Up: ${event.code}`); // DEBUG
    },

    // Handle mouse button press down
    handleMouseDown: function(event) {
        // If not locked and we're on homescreen/loading, ignore.
        if (!this.controls?.isLocked) {
             if(stateMachine?.is('playing')) {
                  // Attempt to lock pointer on click when in 'playing' state but unlocked (e.g. after death/respawn)
                  this.controls.lock();
             }
             return;
        }

        this.mouseButtons[event.button] = true;
        // console.log(`Mouse Down: ${event.button}`); // DEBUG

        // Firing logic could be triggered here based on event.button (0 = left, 1 = middle, 2 = right)
        if (event.button === 0) { // Left mouse button
             // console.log("Left Mouse Button Pressed (FIRE)");
             // Trigger shooting logic in gameLogic or weapon handling module
             // Example: if (typeof WeaponManager !== 'undefined') WeaponManager.startShooting();
        }
    },

    // Handle mouse button release
    handleMouseUp: function(event) {
        // Process mouse up regardless of lock state to ensure button state is reset correctly
        this.mouseButtons[event.button] = false;
        // console.log(`Mouse Up: ${event.button}`); // DEBUG

        if (event.button === 0) { // Left mouse button released
            // Trigger stop shooting logic if needed
             // Example: if (typeof WeaponManager !== 'undefined') WeaponManager.stopShooting();
        }
    },

    // Calculate dash direction based on current movement keys and camera orientation
    // Returns true if successful, false otherwise
    calculateDashDirection: function() {
         // *** Improved Check: Ensure controls AND global camera are ready AND controls are locked ***
         if (!this.controls || !window.camera || !this.controls.isLocked) {
             console.warn(`[Input] Cannot calculate dash direction: Controls (${!!this.controls}) or Global Camera (${!!window.camera}) missing, or Pointer not Locked (${this.controls?.isLocked}).`);
             this.dashDirection.set(0, 0, -1); // Default forward as fallback
             return false; // Indicate failure
         }

         let inputDir = new THREE.Vector3(); // Local direction based on keys relative to camera
         if(this.keys['KeyW']){ inputDir.z = -1; }
         if(this.keys['KeyS']){ inputDir.z = 1; }
         if(this.keys['KeyA']){ inputDir.x = -1; }
         if(this.keys['KeyD']){ inputDir.x = 1; }

         // Get camera's world direction (PointerLockControls updates camera directly)
         const cameraDirection = new THREE.Vector3();
         window.camera.getWorldDirection(cameraDirection);

         if(inputDir.lengthSq() === 0){ // If no movement keys pressed, dash forward relative to camera
             this.dashDirection.copy(cameraDirection); // Dash in the direction camera is facing
         } else { // Dash in the direction of movement input keys, relative to camera
             inputDir.normalize(); // Normalize the XZ input direction
             // Apply input direction relative to camera's orientation
             const cameraQuaternion = window.camera.quaternion;
             this.dashDirection.copy(inputDir).applyQuaternion(cameraQuaternion);
         }

         this.dashDirection.y = 0; // Ensure dash is horizontal relative to the world (gameLogic adds vertical component if needed)
         this.dashDirection.normalize(); // Normalize the final world direction vector

         // Final check for NaN cases (shouldn't happen if normalize works)
         if(isNaN(this.dashDirection.x) || isNaN(this.dashDirection.y) || isNaN(this.dashDirection.z)){
              console.error("!!! Dash direction calculation resulted in NaN!");
              this.dashDirection.set(0, 0, -1); // Fallback
              return false;
         }

         return true; // Indicate success
    }
};

// Make Input globally accessible
window.Input = Input;
console.log("input.js loaded (Improved Camera/Controls Check & Unlock Handling)");
