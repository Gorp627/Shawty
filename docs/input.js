// docs/input.js (Reverted to Manual Physics Logic)

// Manages keyboard and mouse state globally

const Input = {
    keys: {},
    mouseButtons: {},
    controls: null,
    lastDashTime: 0,
    isDashing: false, // Flag for gameLogic to apply dash velocity
    dashDirection: new THREE.Vector3(), // Set on dash key down


    // Initialize input listeners
    init: function(controlsRef) {
        if (!controlsRef) { console.error("[Input] PointerLockControls ref needed!"); return; }
        this.controls = controlsRef;
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));
        document.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.isDashing = false; // Ensure flag starts false
        console.log("[Input] Initialized.");
    },

    // Handle key press down
    handleKeyDown: function(event) {
        if (document.activeElement.tagName === 'INPUT') return;
        this.keys[event.code] = true;

        // Handle Dash (ShiftLeft) - Original Flag Logic
        if (event.code === 'ShiftLeft' && !event.repeat && !this.isDashing && typeof CONFIG !== 'undefined' && typeof stateMachine !== 'undefined') {
            const now = Date.now(); const cooldown = (CONFIG.DASH_COOLDOWN || 0.8) * 1000;
            if ((now - this.lastDashTime > cooldown) && stateMachine.is('playing')) {
                this.startDash(); // Sets dashDirection and isDashing = true + timeout
            }
        }

        // Handle Jump (Space) - Original Velocity Logic
        if (event.code === 'Space' && !event.repeat && typeof CONFIG !== 'undefined' && typeof stateMachine !== 'undefined') {
            event.preventDefault();
             // Check global flag isOnGround (set by gameLogic raycast)
            if (typeof isOnGround !== 'undefined' && isOnGround && stateMachine.is('playing')) {
                velocityY = CONFIG.JUMP_FORCE || 9.0; // Directly set vertical velocity
                isOnGround = false; // Assume leaving ground
                console.log("Jump! Set velocityY:", velocityY);
            }
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
        if (stateMachine?.is('playing') && this.controls && !this.controls.isLocked) {
             this.controls.lock();
        }
    },

    // Handle mouse button release
    handleMouseUp: function(event) {
        this.mouseButtons[event.button] = false;
    },

    // Original Dash Logic: Set flag, calculate direction, set timeout to reset flag
    startDash: function() {
         if(!this.controls) return;
         console.log("Dash!");
         this.isDashing = true; // Set flag true
         this.lastDashTime = Date.now(); // Reset cooldown timer

         let inputDir = new THREE.Vector3();
         if(this.keys['KeyW']){ inputDir.z = -1; } if(this.keys['KeyS']){ inputDir.z = 1; }
         // <<< Use CORRECTED A/D for direction calculation >>>
         if(this.keys['KeyA']){ inputDir.x = -1; } if(this.keys['KeyD']){ inputDir.x = 1; }

         if(inputDir.lengthSq() === 0){ // Forward dash
             if (this.controls.getObject()) { this.controls.getObject().getWorldDirection(this.dashDirection); } else { this.dashDirection.set(0, 0, -1); }
         } else { // Movement direction dash
             inputDir.normalize(); if(this.controls.getObject()) { this.dashDirection.copy(inputDir).applyQuaternion(this.controls.getObject().quaternion); } else { this.dashDirection.copy(inputDir); }
         }
         this.dashDirection.normalize();

         // Set timeout to end the dash state after duration
         const duration = (CONFIG.DASH_DURATION || 0.15) * 1000;
         setTimeout(() => {
             this.isDashing = false; // Reset flag
             // console.log("Dash ended.");
         }, duration);
    }
};

// Make Input globally accessible
window.Input = Input;
console.log("input.js loaded (Reverted to Manual Jump/Dash Flags)");
