// docs/input.js

// Manages keyboard and mouse state globally

const Input = {
    keys: {}, // e.g., { KeyW: true }
    mouseButtons: {}, // e.g., { 0: true } (Left mouse button)
    controls: null, // Reference to PointerLockControls
    lastDashTime: 0, // Cooldown tracking for dash
    dashDirection: new THREE.Vector3(), // Calculated direction for dash impulse

    // Flags used by gameLogic to trigger actions based on input events
    requestingDash: false, // Set true for one frame when dash is activated


    // Initialize input listeners
    init: function(controlsRef) {
        if (!controlsRef) { console.error("[Input] PointerLockControls ref needed!"); return; }
        this.controls = controlsRef;
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));
        document.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.requestingDash = false; // Ensure flag starts false
        console.log("[Input] Initialized.");
    },

    // Handle key press down
    handleKeyDown: function(event) {
        if (document.activeElement.tagName === 'INPUT') return; // Ignore if typing in input fields
        this.keys[event.code] = true;

        // Handle Dash (ShiftLeft) - Set flag if cooldown permits
        if (event.code === 'ShiftLeft' && !event.repeat && !this.requestingDash) {
            const now = Date.now(); const cooldown = (CONFIG?.DASH_COOLDOWN || 0.8) * 1000;
            if (stateMachine?.is('playing') && (now - this.lastDashTime > cooldown)) {
                this.startDash(); // Sets direction and requestingDash flag
            }
        }

        // Handle Jump (Space) - Just record key state, gameLogic handles physics check
        if (event.code === 'Space' && !event.repeat) {
            event.preventDefault(); // Prevent page scroll
            // No flag needed, gameLogic will check keys['Space'] directly
             console.log("Space key pressed down");
        }
    },

    // Handle key release
    handleKeyUp: function(event) {
        if (document.activeElement.tagName === 'INPUT') return;
        this.keys[event.code] = false;
    },

    // Handle mouse button press down
    handleMouseDown: function(event) {
        this.mouseButtons[event.button] = true;
        // Attempt to lock pointer if playing and not already locked
        if (stateMachine?.is('playing') && this.controls && !this.controls.isLocked) {
             this.controls.lock();
        }
        // Add other mouse actions here (e.g., shooting if re-implemented)
    },

    // Handle mouse button release
    handleMouseUp: function(event) {
        this.mouseButtons[event.button] = false;
    },

    // Calculate dash direction, reset timer, set impulse flag for gameLogic
    startDash: function() {
         if(!this.controls) { console.warn("Dash attempted but controls missing."); return; }
         this.lastDashTime = Date.now(); // Reset cooldown timer

         let inputDir = new THREE.Vector3();
         // W/A/S/D mapping relative to camera view (A/D corrected)
         if(this.keys['KeyW']){ inputDir.z = -1; } if(this.keys['KeyS']){ inputDir.z = 1; }
         if(this.keys['KeyA']){ inputDir.x = -1; } if(this.keys['KeyD']){ inputDir.x = 1; }

         if(inputDir.lengthSq() === 0){ // Dash forward if no move keys held
             if (this.controls.getObject()) { this.controls.getObject().getWorldDirection(this.dashDirection); }
             else { this.dashDirection.set(0, 0, -1); } // Fallback
         } else { // Dash in movement direction relative to camera
             inputDir.normalize();
             if(this.controls.getObject()) { this.dashDirection.copy(inputDir).applyQuaternion(this.controls.getObject().quaternion); }
             else { this.dashDirection.copy(inputDir); } // Fallback
         }
         this.dashDirection.normalize(); // Ensure consistent magnitude

         this.requestingDash = true; // Signal gameLogic to apply ONE dash impulse
         console.log("Dash Requested. Direction:", this.dashDirection.x.toFixed(2), this.dashDirection.y.toFixed(2), this.dashDirection.z.toFixed(2));
    }
};

// Make Input globally accessible
window.Input = Input;
console.log("input.js loaded (Using Dash Impulse Request)");
