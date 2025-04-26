// docs/input.js

// Manages keyboard and mouse state

const Input = {
    keys: {}, // Stores current state of keys { KeyW: true, ShiftLeft: false }
    mouseButtons: {}, // { 0: true } (0=left, 1=middle, 2=right)
    controls: null, // Will be set by Game.js after init
    lastDashTime: 0,
    isDashing: false,
    dashDirection: new THREE.Vector3(),

    init: function(controlsRef) {
        this.controls = controlsRef;
        document.addEventListener('keydown', (e) => this.setKey(e.code, true));
        document.addEventListener('keyup', (e) => this.setKey(e.code, false));
        // Assuming mousedown/up are needed for shooting state potentially later
        document.addEventListener('mousedown', (e) => this.setMouseButton(e.button, true));
        document.addEventListener('mouseup', (e) => this.setMouseButton(e.button, false));
        console.log("Input handler initialized.");
    },

    setKey: function(code, isPressed) {
        this.keys[code] = isPressed;

        // Handle Dash trigger on Shift press (if not cooling down)
        if (code === 'ShiftLeft' && isPressed && !this.isDashing && (Date.now() - this.lastDashTime > CONFIG.DASH_COOLDOWN * 1000) && stateMachine.is('playing')) {
             this.startDash();
        }

        if (code === 'Space' && isPressed) {
            event.preventDefault(); // Prevent space scrolling
            if (isOnGround && stateMachine.is('playing')) { // Use global physics vars for now
                 velocityY = CONFIG.JUMP_FORCE;
                 isOnGround = false;
            }
        }
    },

    setMouseButton: function(button, isPressed) {
         this.mouseButtons[button] = isPressed;
         // Handle click-to-lock and shooting
         if (isPressed && button === 0 && stateMachine.is('playing')) {
              if (!this.controls?.isLocked) {
                   this.controls?.lock();
              } else {
                   if (typeof shoot === 'function') shoot(); // Call shoot function if locked
              }
         }
    },

    // --- Dash Logic ---
    startDash: function() {
         console.log("Dash!");
         this.isDashing = true;
         this.lastDashTime = Date.now();

         // Determine dash direction based on current movement keys OR forward if not moving
         this.dashDirection.set(0,0,0);
         let intendedDir = new THREE.Vector3();
         if (this.keys['KeyW']) { intendedDir.z = -1; }
         if (this.keys['KeyS']) { intendedDir.z = 1; }
         if (this.keys['KeyA']) { intendedDir.x = -1; }
         if (this.keys['KeyD']) { intendedDir.x = 1; }

         if (intendedDir.lengthSq() === 0) { // If no keys pressed, dash forward
              intendedDir.z = -1;
         }
         intendedDir.normalize();

         // Apply camera rotation to the intended direction
         if(this.controls?.getObject()) { // Check if controls object exists
             this.dashDirection.copy(intendedDir).applyQuaternion(this.controls.getObject().quaternion);
         }

         // Stop dash after duration
         setTimeout(() => {
             this.isDashing = false;
             console.log("Dash end.");
         }, CONFIG.DASH_DURATION * 1000);
    }
};

console.log("input.js loaded");
