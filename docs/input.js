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

        // Handle Jump (Space) - Requires isOnGround, velocityY, CONFIG, stateMachine
        if (event.code === 'Space' && !event.repeat && typeof CONFIG !== 'undefined' && typeof stateMachine !== 'undefined') {
            event.preventDefault(); // Prevent default space bar action (e.g., scrolling)
            if (typeof isOnGround !== 'undefined' && isOnGround && stateMachine.is('playing')) {
                // Only allow jump if on the ground and in playing state
                velocityY = CONFIG.JUMP_FORCE || 8.5; // Apply jump force from config or default
                isOnGround = false; // Player is no longer on the ground
            }
        }
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
        //     // Left mouse button (0) clicked while playing and locked
        //     if(typeof shoot === 'function') {
        //          shoot(); // Call the global shoot function (defined in gameLogic.js)
        //     } else {
        //          console.error("shoot function is not defined!");
        //     }
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

         // Calculate initial dash direction based on current movement keys
         let inputDirection = new THREE.Vector3();
         if(this.keys['KeyW']){ inputDirection.z = -1; }
         if(this.keys['KeyS']){ inputDirection.z = 1; }
         if(this.keys['KeyA']){ inputDirection.x = -1; }
         if(this.keys['KeyD']){ inputDirection.x = 1; }

         // If no movement keys pressed, dash forward by default
         if(inputDirection.lengthSq() === 0){ inputDirection.z = -1; }

         inputDirection.normalize(); // Ensure consistent magnitude

         // Apply camera's rotation to the input direction to get world-space dash direction
         if(this.controls.getObject()) {
             this.dashDirection.copy(inputDirection).applyQuaternion(this.controls.getObject().quaternion);
         } else {
             this.dashDirection.copy(inputDirection); // Fallback if controls object is missing
         }


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
console.log("input.js loaded");
