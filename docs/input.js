// docs/input.js (Rapier Version - Uses Global THREE/Scope - REGEN v3 Corrected - Key Handler Logging)

const Input = {
    keys: {}, // Stores currently pressed keys (e.g., { 'KeyW': true, 'Space': false })
    mouseButtons: {}, // Stores currently pressed mouse buttons (e.g., { 0: true })
    controls: null, // Reference to PointerLockControls
    lastDashTime: 0,
    requestingDash: false, // Flag set true when dash key pressed, consumed by gameLogic
    dashDirection: null, // Calculated direction vector (will be THREE.Vector3)
    _lastLoggedLockState: undefined, // Internal state for logging changes

    // Initialize input listeners
    init: function(controlsRef) {
        console.log('[DEBUG Input] init called.');
        if (typeof THREE === 'undefined') {
            console.error("[Input] THREE is not defined globally! Cannot initialize Input.");
            return false;
        }
        this.dashDirection = new THREE.Vector3();
        console.log('[DEBUG Input] THREE found, dashDirection vector created.');

        if (!controlsRef || typeof THREE === 'undefined' || typeof THREE.PointerLockControls === 'undefined' || !(controlsRef instanceof THREE.PointerLockControls)) {
            console.error("[Input] PointerLockControls reference missing, invalid, or THREE/Controls not loaded!");
            return false;
        }
        this.controls = controlsRef;
        console.log('[DEBUG Input] PointerLockControls reference stored.');

        // --- Bind Event Listeners ---
        console.log('[DEBUG Input] Binding event listeners...');
        // Ensure we don't add listeners multiple times if init is called again
        document.removeEventListener('keydown', this._boundHandleKeyDown, false);
        document.removeEventListener('keyup', this._boundHandleKeyUp, false);
        document.removeEventListener('mousedown', this._boundHandleMouseDown, false);
        document.removeEventListener('mouseup', this._boundHandleMouseUp, false);

        // Bind functions FIRST, then add listener using the bound reference
        this._boundHandleKeyDown = this.handleKeyDown.bind(this);
        this._boundHandleKeyUp = this.handleKeyUp.bind(this);
        this._boundHandleMouseDown = this.handleMouseDown.bind(this);
        this._boundHandleMouseUp = this.handleMouseUp.bind(this);

        document.addEventListener('keydown', this._boundHandleKeyDown, false);
        document.addEventListener('keyup', this._boundHandleKeyUp, false);
        document.addEventListener('mousedown', this._boundHandleMouseDown, false);
        document.addEventListener('mouseup', this._boundHandleMouseUp, false);
        console.log('[DEBUG Input] Listeners bound.');

        this.requestingDash = false;
        this.keys = {}; // Reset keys on init
        this.mouseButtons = {}; // Reset mouse buttons on init
        console.log("[Input] Initialized (Using Global THREE).");
        return true;
    },

    // Handle key press down
    handleKeyDown: function(event) {
        console.log(`--- Input handleKeyDown --- Code: ${event.code}, Repeat: ${event.repeat}`); // LOG ENTRY
        // Ignore input if typing in an input field
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
             console.log(`[DEBUG Input KeyDown] Ignored (typing in input): ${event.code}`);
            return;
        }

        // Log current state BEFORE modification
        const keyToSet = event.code; // Use event.code (e.g., 'KeyW', 'Space')
        console.log(`[DEBUG Input KeyDown] Key: ${keyToSet}, current value in this.keys:`, this.keys[keyToSet]);

        // Set the state
        this.keys[keyToSet] = true;

        // Log state AFTER modification
        console.log(`[DEBUG Input KeyDown] Set this.keys['${keyToSet}'] = true. New value:`, this.keys[keyToSet]);
        console.log(`[DEBUG Input KeyDown] Current this.keys object:`, { ...this.keys }); // Log shallow copy


        // --- Handle Dash Request (ShiftLeft) ---
        if (keyToSet === 'ShiftLeft' && !event.repeat && !this.requestingDash) {
            console.log(`[DEBUG Input KeyDown] ShiftLeft pressed (down). Checking dash conditions...`);
            const now = Date.now();
            const cooldown = (typeof CONFIG !== 'undefined' ? (CONFIG.DASH_COOLDOWN || 0.8) : 0.8) * 1000;
            const isPlaying = (typeof stateMachine !== 'undefined' && stateMachine.is('playing'));
            const canDash = (now - (window.lastDashTime || 0)) > cooldown;
            console.log(`[DEBUG Input KeyDown] Dash Check: isPlaying=${isPlaying}, canDash=${canDash} (Now: ${now}, Last: ${window.lastDashTime || 0}, CD: ${cooldown})`);

            if (canDash && isPlaying) {
                 console.log(`[DEBUG Input KeyDown] Attempting to calculate dash direction...`);
                if (this.calculateDashDirection()) {
                    this.requestingDash = true;
                    window.lastDashTime = now;
                    console.log("[DEBUG Input KeyDown] Dash Requested. Direction:", this.dashDirection.toArray().map(n=>n.toFixed(2)));
                } else {
                    console.warn("[DEBUG Input KeyDown] Dash direction calculation failed.");
                }
            }
        }

        // --- Handle Jump (Space) ---
        if (keyToSet === 'Space') {
             if (stateMachine?.is('playing')) { // Prevent space scrolling only when playing
                event.preventDefault();
             }
        }

        console.log(`--- Input handleKeyDown End --- Code: ${event.code}`); // LOG EXIT
    },

    // Handle key release
    handleKeyUp: function(event) {
         console.log(`--- Input handleKeyUp --- Code: ${event.code}`); // LOG ENTRY
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
            console.log(`[DEBUG Input KeyUp] Ignored (typing in input): ${event.code}`);
            return;
        }

        const keyToSet = event.code;
        console.log(`[DEBUG Input KeyUp] Key: ${keyToSet}, current value in this.keys:`, this.keys[keyToSet]);

        // Set the state
        this.keys[keyToSet] = false;

        // Log state AFTER modification
        console.log(`[DEBUG Input KeyUp] Set this.keys['${keyToSet}'] = false. New value:`, this.keys[keyToSet]);
        console.log(`[DEBUG Input KeyUp] Current this.keys object:`, { ...this.keys }); // Log shallow copy
        console.log(`--- Input handleKeyUp End --- Code: ${event.code}`); // LOG EXIT
    },

    // Handle mouse button press down
    handleMouseDown: function(event) {
        console.log(`--- Input handleMouseDown --- Button: ${event.button}`); // LOG ENTRY
        const uiScreens = document.querySelectorAll('.screen');
        let clickedOnUI = false;
        uiScreens.forEach(screen => { if (screen.classList.contains('visible') && screen.contains(event.target)) { clickedOnUI = true; } });
        if (clickedOnUI && event.target.tagName !== 'CANVAS') { console.log(`[DEBUG Input MouseDown] Ignored (clicked on UI element: ${event.target.tagName}#${event.target.id})`); return; }

        console.log(`[DEBUG Input MouseDown] Setting button ${event.button} to true.`);
        this.mouseButtons[event.button] = true;
        console.log(`[DEBUG Input MouseDown] Current this.mouseButtons object:`, { ...this.mouseButtons });

        if (typeof stateMachine !== 'undefined' && stateMachine.is('playing') && this.controls && !this.controls.isLocked) {
             console.log(`[DEBUG Input MouseDown] Requesting pointer lock.`);
             this.controls.lock();
        }
        console.log(`--- Input handleMouseDown End --- Button: ${event.button}`); // LOG EXIT
    },

    // Handle mouse button release
    handleMouseUp: function(event) {
        console.log(`--- Input handleMouseUp --- Button: ${event.button}`); // LOG ENTRY
        console.log(`[DEBUG Input MouseUp] Setting button ${event.button} to false.`);
        this.mouseButtons[event.button] = false;
        console.log(`[DEBUG Input MouseUp] Current this.mouseButtons object:`, { ...this.mouseButtons });
        console.log(`--- Input handleMouseUp End --- Button: ${event.button}`); // LOG EXIT
    },

    // Calculate dash direction based on current movement keys and camera orientation
    calculateDashDirection: function() {
         if (!this.controls || typeof window === 'undefined' || !window.camera || typeof THREE === 'undefined') {
             console.warn(`[DEBUG Input DashCalc] Cannot calculate dash direction: Controls, Camera, or THREE missing.`);
             if (this.dashDirection) this.dashDirection.set(0, 0, -1);
             return false;
         }
         let inputDir = new THREE.Vector3();
         if(this.keys['KeyW']){ inputDir.z = -1; }
         if(this.keys['KeyS']){ inputDir.z = 1; }
         if(this.keys['KeyA']){ inputDir.x = -1; }
         if(this.keys['KeyD']){ inputDir.x = 1; }
         const cameraQuaternion = window.camera.quaternion;
         if(inputDir.lengthSq() === 0){
             this.dashDirection.set(0, 0, -1);
             this.dashDirection.applyQuaternion(cameraQuaternion);
             // console.log(`[DEBUG Input DashCalc] Dash direction calculated based on camera forward.`);
         } else {
             inputDir.normalize();
             this.dashDirection.copy(inputDir);
             this.dashDirection.applyQuaternion(cameraQuaternion);
             // console.log(`[DEBUG Input DashCalc] Dash direction calculated based on input keys and camera.`);
         }
         this.dashDirection.y = 0;
         this.dashDirection.normalize();
         // console.log(`[DEBUG Input DashCalc] Final dash direction calculated: (${this.dashDirection.x.toFixed(2)}, ${this.dashDirection.y.toFixed(2)}, ${this.dashDirection.z.toFixed(2)})`);
         return true;
    }
};

// Export globally if not using modules
if (typeof window !== 'undefined') {
    window.Input = Input;
}
console.log("input.js loaded (Using Global THREE/Scope - Key Handler Logging)");
