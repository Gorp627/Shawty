// docs/input.js

// Manages keyboard and mouse state globally

const Input = {
    keys: {},
    mouseButtons: {},
    controls: null,
    lastDashTime: 0,
    dashDirection: new THREE.Vector3(), // Set on dash key down

    // These flags are set by keydown events and consumed by gameLogic.js
    attemptingJump: false,
    requestingDashImpulse: false,


    // Initialize input listeners
    init: function(controlsRef) {
        if (!controlsRef) { console.error("[Input] PointerLockControls ref needed!"); return; }
        this.controls = controlsRef;
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));
        document.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.attemptingJump = false;        // Ensure flags start false
        this.requestingDashImpulse = false; // Ensure flags start false
        console.log("[Input] Initialized.");
    },

    // Handle key press down
    handleKeyDown: function(event) {
        if (event.target.tagName === 'INPUT') return; // Ignore inputs in text fields
        this.keys[event.code] = true;

        // Handle Dash (ShiftLeft)
        // Only SET the request flag here if not on cooldown and playing
        if (event.code === 'ShiftLeft' && !event.repeat && !this.requestingDashImpulse && typeof CONFIG !== 'undefined' && typeof stateMachine !== 'undefined') {
            const now = Date.now(); const cooldown = (CONFIG.DASH_COOLDOWN || 0.8) * 1000;
            if ((now - this.lastDashTime > cooldown) && stateMachine.is('playing')) {
                this.startDash(); // Sets dashDirection and requestingDashImpulse=true
            }
        }

        // Handle Jump (Space)
        if (event.code === 'Space' && !event.repeat && typeof stateMachine !== 'undefined') {
            event.preventDefault();
            // Set jump request flag ONLY if playing - gameLogic checks isPlayerGrounded
            if (stateMachine.is('playing') && !this.attemptingJump) {
                 console.log("Jump key pressed.");
                 this.attemptingJump = true;
             }
        }
    },

    // Handle key release
    handleKeyUp: function(event) {
        if (event.target.tagName === 'INPUT') return;
        this.keys[event.code] = false;
        // Reset jump flag immediately on key up to prevent holding jump
        if (event.code === 'Space') {
            this.attemptingJump = false;
            // console.log("Jump key released, flag false.");
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

    // Initiate the dash - Calculate direction, reset cooldown, set impulse flag
    startDash: function() {
         if(!this.controls) return;
         console.log("Dash initiated!");
         this.lastDashTime = Date.now(); // Reset cooldown timer

         let inputDir = new THREE.Vector3();
         if(this.keys['KeyW']){ inputDir.z = -1; } if(this.keys['KeyS']){ inputDir.z = 1; }
         // Use correct A/D logic based on swapped gameLogic
         if(this.keys['KeyA']){ inputDir.x = -1; } if(this.keys['KeyD']){ inputDir.x = 1; }

         if(inputDir.lengthSq() === 0){ // Forward dash
             if (this.controls.getObject()) { this.controls.getObject().getWorldDirection(this.dashDirection); } else { this.dashDirection.set(0, 0, -1); }
         } else { // Movement direction dash
             inputDir.normalize(); if(this.controls.getObject()) { this.dashDirection.copy(inputDir).applyQuaternion(this.controls.getObject().quaternion); } else { this.dashDirection.copy(inputDir); }
         }
         this.dashDirection.normalize();

         this.requestingDashImpulse = true; // Set flag for gameLogic
    }
};

// Make Input globally accessible
window.Input = Input;
console.log("input.js loaded (Jump uses attempt flag, Dash uses impulse request)");
