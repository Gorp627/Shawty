// docs/input.js

// Manages keyboard and mouse state globally

const Input = {
    keys: {},
    mouseButtons: {},
    controls: null,
    lastDashTime: 0,
    dashDirection: new THREE.Vector3(), // Calculated when dash is activated

    // Flags for gameLogic
    dashJustActivated: false, // Set true for ONE frame when dash key pressed + ready


    // Initialize input listeners
    init: function(controlsRef) {
        if (!controlsRef) { console.error("[Input] PointerLockControls ref needed!"); return; }
        this.controls = controlsRef;
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));
        document.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.dashJustActivated = false; // Ensure flag starts false
        console.log("[Input] Initialized.");
    },

    // Handle key press down
    handleKeyDown: function(event) {
        if (event.target.tagName === 'INPUT') return; // Ignore inputs in text fields
        this.keys[event.code] = true;

        // Handle Dash (ShiftLeft) - Set flag if cooldown ready
        if (event.code === 'ShiftLeft' && !event.repeat && !this.dashJustActivated && typeof CONFIG !== 'undefined' && typeof stateMachine !== 'undefined') {
            const now = Date.now(); const cooldown = (CONFIG.DASH_COOLDOWN || 0.8) * 1000;
            if ((now - this.lastDashTime > cooldown) && stateMachine.is('playing')) {
                this.startDash(); // Calculates direction, resets timer, sets dashJustActivated = true
            }
        }

        // Handle Jump (Space) - Just records the key press, logic is in gameLogic
        if (event.code === 'Space' && !event.repeat) {
            event.preventDefault();
             // No flag needed here, gameLogic checks keys['Space'] directly now
             console.log("Space pressed");
        }
    },

    // Handle key release
    handleKeyUp: function(event) {
        if (event.target.tagName === 'INPUT') return;
        this.keys[event.code] = false;
        // Reset jump 'attempt' immediately? Not strictly needed if gameLogic checks ground state
        // if (event.code === 'Space') { }
    },

    // Handle mouse button press down
    handleMouseDown: function(event) {
        this.mouseButtons[event.button] = true;
        if (stateMachine?.is('playing') && this.controls && !this.controls.isLocked) {
             this.controls.lock();
        }
    },

    // Handle mouse button release
    handleMouseUp: function(event) {
        this.mouseButtons[event.button] = false;
    },

    // Calculate direction, set flag for gameLogic
    startDash: function() {
         if(!this.controls) return;
         this.lastDashTime = Date.now(); // Reset cooldown timer

         let inputDir = new THREE.Vector3();
         if(this.keys['KeyW']){ inputDir.z = -1; } if(this.keys['KeyS']){ inputDir.z = 1; }
         // Corrected A/D logic matching gameLogic fix
         if(this.keys['KeyA']){ inputDir.x = -1; } if(this.keys['KeyD']){ inputDir.x = 1; }

         if(inputDir.lengthSq() === 0){ // Forward dash
             if (this.controls.getObject()) { this.controls.getObject().getWorldDirection(this.dashDirection); } else { this.dashDirection.set(0, 0, -1); }
         } else { // Movement direction dash
             inputDir.normalize(); if(this.controls.getObject()) { this.dashDirection.copy(inputDir).applyQuaternion(this.controls.getObject().quaternion); } else { this.dashDirection.copy(inputDir); }
         }
         this.dashDirection.normalize();

         this.dashJustActivated = true; // Set flag for ONE frame
         console.log("Dash Requested. Direction:", this.dashDirection);
    }
};

// Make Input globally accessible
window.Input = Input;
console.log("input.js loaded (Simplified Jump/Dash Flags)");
