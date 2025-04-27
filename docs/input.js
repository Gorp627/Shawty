// docs/input.js

// Manages keyboard and mouse state globally

const Input = {
    keys: {},
    mouseButtons: {},
    controls: null,
    lastDashTime: 0,
    dashDirection: new THREE.Vector3(),

    // Flags for gameLogic (set by keydown, consumed by gameLogic)
    requestingDash: false,


    // Initialize input listeners
    init: function(controlsRef) {
        if (!controlsRef) { console.error("[Input] PointerLockControls ref needed!"); return; }
        this.controls = controlsRef;
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));
        document.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.requestingDash = false; // Init flag
        console.log("[Input] Initialized.");
    },

    // Handle key press down
    handleKeyDown: function(event) {
        if (event.target.tagName === 'INPUT') return;
        this.keys[event.code] = true;

        // Handle Dash (ShiftLeft) - Set request flag
        if (event.code === 'ShiftLeft' && !event.repeat && !this.requestingDash) {
            const now = Date.now(); const cooldown = CONFIG?.DASH_COOLDOWN || 0.8 * 1000;
            if (stateMachine?.is('playing') && (now - this.lastDashTime > cooldown)) {
                this.startDash(); // Sets direction and requestingDash flag
            }
        }

        // Handle Jump (Space) - Record key press, logic is purely in gameLogic now
        if (event.code === 'Space' && !event.repeat) {
            event.preventDefault();
            // console.log("Space pressed"); // gameLogic checks keys['Space'] + ground state
        }
    },

    // Handle key release
    handleKeyUp: function(event) {
        if (event.target.tagName === 'INPUT') return;
        this.keys[event.code] = false;
        // No specific key up logic needed now for jump/dash flags
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

    // Calculate direction, set request flag, reset cooldown timer
    startDash: function() {
         if(!this.controls) return;
         this.lastDashTime = Date.now(); // Reset timer

         let inputDir = new THREE.Vector3();
         // Use player's perception: W = Forward, S = Backward, A = Strafe Left, D = Strafe Right
         if(this.keys['KeyW']){ inputDir.z = -1; } if(this.keys['KeyS']){ inputDir.z = 1; }
         if(this.keys['KeyA']){ inputDir.x = -1; } if(this.keys['KeyD']){ inputDir.x = 1; }

         if(inputDir.lengthSq() === 0){ // Dash forward if no move keys
             if (this.controls.getObject()) { this.controls.getObject().getWorldDirection(this.dashDirection); } else { this.dashDirection.set(0, 0, -1); }
         } else { // Dash in movement direction relative to camera
             inputDir.normalize(); if(this.controls.getObject()) { this.dashDirection.copy(inputDir).applyQuaternion(this.controls.getObject().quaternion); } else { this.dashDirection.copy(inputDir); }
         }
         this.dashDirection.normalize();

         this.requestingDash = true; // Signal gameLogic to apply ONE dash impulse
         console.log("Dash Requested. Direction:", this.dashDirection);
    }
};

// Make Input globally accessible
window.Input = Input;
console.log("input.js loaded (No Jump flag, Dash uses request flag)");
