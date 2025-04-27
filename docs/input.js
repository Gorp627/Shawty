// docs/input.js

// Manages keyboard and mouse state globally

const Input = {
    keys: {},
    mouseButtons: {},
    controls: null,
    lastDashTime: 0,
    isDashing: false, // Dash impulse flag, should be set false by gameLogic after use
    dashDirection: new THREE.Vector3(), // Set on dash key down

    // Initialize input listeners
    init: function(controlsRef) {
        if (!controlsRef) { console.error("[Input] PointerLockControls ref needed!"); return; }
        this.controls = controlsRef;
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));
        document.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        console.log("[Input] Initialized.");
    },

    // Handle key press down
    handleKeyDown: function(event) {
        if (event.target.tagName === 'INPUT') return; // Ignore inputs in text fields
        this.keys[event.code] = true;

        // Handle Dash (ShiftLeft)
        if (event.code === 'ShiftLeft' && !event.repeat && !this.isDashing && typeof CONFIG !== 'undefined' && typeof stateMachine !== 'undefined') {
            const now = Date.now(); const cooldown = (CONFIG.DASH_COOLDOWN || 0.8) * 1000;
            if ((now - this.lastDashTime > cooldown) && stateMachine.is('playing')) {
                this.startDash(); // Calls function below to set direction and flag
            }
        }

        // Handle Jump (Space)
        if (event.code === 'Space' && !event.repeat && typeof CONFIG !== 'undefined' && typeof stateMachine !== 'undefined') {
            event.preventDefault();
             // <<< CHANGED JUMP CONDITION: Check physics collision flag >>>
            if (typeof isPlayerGrounded !== 'undefined' && isPlayerGrounded && stateMachine.is('playing')) {
                console.log("Attempting Jump (Grounded=true)");
                 // Set flag or state for gameLogic to apply jump velocity
                 // Option 1: Let gameLogic handle velocity directly based on key press + ground state (requires slight change there)
                 // Option 2 (Current): We can try setting velocity directly here, BUT we need access to the player body. Easier to let gameLogic check Input.keys['Space'] & isPlayerGrounded flag.
                 // For now, keep simple key press logging, gameLogic will apply velocity.
                 // OR -> Let's keep it simple and have input tell gameLogic to *try* jumping:
                 Input.attemptingJump = true; // Set a flag for gameLogic to check and consume
            } else {
                 console.log("Jump key pressed but not grounded.");
                 Input.attemptingJump = false; // Ensure flag is false if not grounded
            }
        }
    },

    // Handle key release
    handleKeyUp: function(event) {
        if (event.target.tagName === 'INPUT') return;
        this.keys[event.code] = false;
        if (event.code === 'Space') {
            Input.attemptingJump = false; // Reset jump flag on key up
        }
    },

    // Handle mouse button press down
    handleMouseDown: function(event) {
        this.mouseButtons[event.button] = true;
        if (typeof stateMachine !== 'undefined' && stateMachine.is('playing') && this.controls && !this.controls.isLocked) {
             console.log("[Input] Attempting to lock controls...");
             this.controls.lock();
        }
    },

    // Handle mouse button release
    handleMouseUp: function(event) {
        this.mouseButtons[event.button] = false;
    },

    // Initiate the dash - Set direction and impulse flag
    startDash: function() {
         if(typeof CONFIG === 'undefined' || !this.controls) return;
         console.log("Dash!");
         // DON'T set isDashing true yet - let keydown set the flag & direction
         // We set a different flag to signal that an IMPULSE should be applied *once*
         this.lastDashTime = Date.now(); // Reset cooldown timer

         // Calculate dash direction based on current view/movement
         let inputDir = new THREE.Vector3();
         if(this.keys['KeyW']){ inputDir.z = -1; } if(this.keys['KeyS']){ inputDir.z = 1; }
         if(this.keys['KeyA']){ inputDir.x = -1; } if(this.keys['KeyD']){ inputDir.x = 1; }

         if(inputDir.lengthSq() === 0){ // Dash forward if no move keys
             if (this.controls.getObject()) { this.controls.getObject().getWorldDirection(this.dashDirection); } else { this.dashDirection.set(0, 0, -1); }
         } else { // Dash in movement direction relative to camera
             inputDir.normalize(); if(this.controls.getObject()) { this.dashDirection.copy(inputDir).applyQuaternion(this.controls.getObject().quaternion); } else { this.dashDirection.copy(inputDir); }
         }
         this.dashDirection.normalize(); // Final normalization

         // Set flags for gameLogic to use
         this.requestingDashImpulse = true; // Signal to apply ONE impulse
         // We don't use the timeout isDashing anymore - impulse is instantaneous
         // console.log("Dash Requested. Direction:", this.dashDirection);
    }
};
// Initialize attempt flags
Input.attemptingJump = false;
Input.requestingDashImpulse = false;

// Make Input globally accessible
window.Input = Input;
console.log("input.js loaded (Jump uses isPlayerGrounded, Dash uses impulse request)");
