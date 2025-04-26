// docs/input.js

// Manages keyboard and mouse state globally

const Input = {
    keys: {}, // Stores currently pressed keyboard keys (e.g., { KeyW: true, ShiftLeft: false })
    mouseButtons: {}, // Stores currently pressed mouse buttons (e.g., { 0: true, 1: false })
    controls: null, // Reference to PointerLockControls, set during initialization
    lastDashTime: 0, // Timestamp of the last dash initiation
    isDashing: false, // Flag indicating if currently dashing
    dashDirection: new THREE.Vector3(), // World-space direction of the current dash

    // Initialize input listeners
    init: function(controlsRef) {
        if (!controlsRef) { console.error("[Input] PointerLockControls reference is needed for initialization!"); return; }
        this.controls = controlsRef;

        // Bind event listeners to the document
        document.addEventListener('keydown', this.handleKeyDown.bind(this));
        document.addEventListener('keyup', this.handleKeyUp.bind(this));
        document.addEventListener('mousedown', this.handleMouseDown.bind(this));
        document.addEventListener('mouseup', this.handleMouseUp.bind(this));
        console.log("[Input] Initialized.");
    },

    // Handle key press down
    handleKeyDown: function(event) {
        // Don't process inputs if typing in an input field (e.g., player name)
        if (event.target.tagName === 'INPUT') return;

        this.keys[event.code] = true; // Mark key as pressed

        // Handle Dash (ShiftLeft) - Requires CONFIG, stateMachine
        if (event.code === 'ShiftLeft' && !event.repeat && !this.isDashing && typeof CONFIG !== 'undefined' && typeof stateMachine !== 'undefined') {
            const now = Date.now();
            const cooldown = (CONFIG.DASH_COOLDOWN || 0.8) * 1000; // Get cooldown in ms
            if ((now - this.lastDashTime > cooldown) && stateMachine.is('playing')) {
                this.startDash();
            }
        }

        // Handle Jump (Space) - REMOVED
        // if (event.code === 'Space' && !event.repeat && typeof CONFIG !== 'undefined' && typeof stateMachine !== 'undefined') {
        //     event.preventDefault(); // Prevent default space bar action (e.g., scrolling)
        //     // Jump logic removed - requires isOnGround, velocityY
        // }
    },

    // Handle key release
    handleKeyUp: function(event) {
        if (event.target.tagName === 'INPUT') return; // Ignore if focus is on input field
        this.keys[event.code] = false; // Mark key as released
    },

    // Handle mouse button press down
    handleMouseDown: function(event) {
        this.mouseButtons[event.button] = true; // Mark button as pressed

        // If in playing state but controls are not locked, lock them on any click
        if (typeof stateMachine !== 'undefined' && stateMachine.is('playing') && this.controls && !this.controls.isLocked) {
             console.log("[Input] Attempting to lock controls...");
             this.controls.lock();
        }
        // --- REMOVED SHOOTING LOGIC ---
        // else if (stateMachine.is('playing') && this.controls?.isLocked && event.button === 0) {
        //     // Shooting logic removed
        // }
    },

    // Handle mouse button release
    handleMouseUp: function(event) {
        this.mouseButtons[event.button] = false; // Mark button as released
    },

    // Initiate the dash movement
    startDash: function() {
         if(typeof CONFIG === 'undefined' || !this.controls) return; // Check dependencies
         console.log("Dash!");
         this.isDashing = true;
         this.lastDashTime = Date.now();

         // Calculate initial dash direction based on current movement keys (relative to camera)
         let inputDirection = new THREE.Vector3();
         if(this.keys['KeyW']){ inputDirection.z = -1; }
         if(this.keys['KeyS']){ inputDirection.z = 1; }
         if(this.keys['KeyA']){ inputDirection.x = -1; } // Corrected A/D relative to camera view
         if(this.keys['KeyD']){ inputDirection.x = 1; }

         // If no movement keys pressed, dash in the direction the camera is facing
         if(inputDirection.lengthSq() === 0){
             if (this.controls.getObject()) {
                 // Get camera forward direction, ignore Y component for pure forward dash
                 this.controls.getObject().getWorldDirection(this.dashDirection);
                 // Optional: Uncomment below if you want forward dash strictly on XZ plane
                 // this.dashDirection.y = 0;
                 // this.dashDirection.normalize();
             } else {
                 this.dashDirection.set(0, 0, -1); // Fallback: forward in Z
             }
         } else {
             inputDirection.normalize(); // Ensure consistent magnitude for diagonal input
             // Apply camera's rotation to the input direction to get world-space dash direction
             if(this.controls.getObject()) {
                 this.dashDirection.copy(inputDirection).applyQuaternion(this.controls.getObject().quaternion);
             } else {
                 this.dashDirection.copy(inputDirection); // Fallback if controls object is missing
             }
         }

         // Ensure dash direction is normalized (might not be needed if derived from normalized vectors)
         this.dashDirection.normalize();

         // Set timeout to end the dash after duration
         const duration = (CONFIG.DASH_DURATION || 0.15) * 1000; // Get duration in ms
         setTimeout(() => {
             this.isDashing = false;
             // console.log("Dash ended."); // Optional log
         }, duration);
    }
};
// Make Input globally accessible
window.Input = Input;
console.log("input.js loaded (Jump Removed)");
