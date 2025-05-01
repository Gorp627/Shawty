// Docs/input.js
// Using Global THREE/Scope - v3 Corrected (with DEBUG logging)

console.log('input.js loaded (Using Global THREE/Scope - v3 Corrected)');

class InputManager {
    constructor(canvasElement) {
        console.log('[DEBUG] InputManager constructor called.');
        this.keysPressed = {};
        this.mouseButtonsPressed = {}; // 0: left, 1: middle, 2: right
        this.mousePosition = { x: 0, y: 0 };
        this.mouseDelta = { x: 0, y: 0 };
        this.canvas = canvasElement || window; // Attach to canvas if provided, otherwise window
        this._isPointerLocked = false;

        // Bind methods to ensure 'this' context is correct
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onPointerLockChange = this._onPointerLockChange.bind(this);
        this._onPointerLockError = this._onPointerLockError.bind(this);

        console.log('[DEBUG] InputManager instance created.');
    }

    bindEventListeners() {
        console.log('[DEBUG] InputManager: Binding event listeners...');
        window.addEventListener('keydown', this._onKeyDown, false);
        window.addEventListener('keyup', this._onKeyUp, false);

        // Attach mouse events to the canvas for better focus handling & pointer lock
        if (this.canvas && this.canvas.addEventListener) {
             console.log('[DEBUG] InputManager: Attaching mouse listeners to canvas:', this.canvas);
            this.canvas.addEventListener('mousedown', this._onMouseDown, false);
             // We still might want mouseup/mousemove on window if pointer isn't locked
            window.addEventListener('mouseup', this._onMouseUp, false);
            window.addEventListener('mousemove', this._onMouseMove, false);

            // Pointer Lock API listeners
            document.addEventListener('pointerlockchange', this._onPointerLockChange, false);
            document.addEventListener('pointerlockerror', this._onPointerLockError, false);

            // Request pointer lock on canvas click
            // Only add this if you WANT pointer lock on click
            // this.canvas.addEventListener('click', () => {
            //     if (!this._isPointerLocked) {
            //         console.log('[DEBUG] InputManager: Requesting pointer lock...');
            //         this.canvas.requestPointerLock();
            //     }
            // });

        } else {
             console.warn('[DEBUG] InputManager: Canvas element not found or invalid, attaching mouse listeners to window.');
             window.addEventListener('mousedown', this._onMouseDown, false);
             window.addEventListener('mouseup', this._onMouseUp, false);
             window.addEventListener('mousemove', this._onMouseMove, false);
        }
        console.log('[DEBUG] InputManager: Event listeners bound.');
    }

    unbindEventListeners() {
        console.log('[DEBUG] InputManager: Unbinding event listeners...');
        window.removeEventListener('keydown', this._onKeyDown, false);
        window.removeEventListener('keyup', this._onKeyUp, false);

         if (this.canvas && this.canvas.removeEventListener) {
            this.canvas.removeEventListener('mousedown', this._onMouseDown, false);
         }
         window.removeEventListener('mouseup', this._onMouseUp, false);
         window.removeEventListener('mousemove', this._onMouseMove, false);

         document.removeEventListener('pointerlockchange', this._onPointerLockChange, false);
         document.removeEventListener('pointerlockerror', this._onPointerLockError, false);

        console.log('[DEBUG] InputManager: Event listeners unbound.');
    }

    // --- Event Handlers ---

    _onKeyDown(event) {
        const key = event.key.toLowerCase();
        console.log(`[DEBUG] KeyDown: ${key} (Code: ${event.code})`);
        this.keysPressed[key] = true;
        // Special handling for keys that might act differently
        this.keysPressed[event.code] = true; // Store by code as well if needed
    }

    _onKeyUp(event) {
        const key = event.key.toLowerCase();
        console.log(`[DEBUG] KeyUp: ${key} (Code: ${event.code})`);
        this.keysPressed[key] = false;
        this.keysPressed[event.code] = false; // Store by code as well if needed
    }

    _onMouseDown(event) {
        console.log(`[DEBUG] MouseDown: Button ${event.button}`);
        this.mouseButtonsPressed[event.button] = true;

        // Optional: Attempt pointer lock on click if not already locked
        if (!this._isPointerLocked && this.canvas && this.canvas.requestPointerLock) {
            console.log('[DEBUG] InputManager: Requesting pointer lock on mousedown...');
            this.canvas.requestPointerLock();
        }
    }

    _onMouseUp(event) {
        console.log(`[DEBUG] MouseUp: Button ${event.button}`);
        this.mouseButtonsPressed[event.button] = false;
    }

    _onMouseMove(event) {
        // Calculate raw mouse position
        const rect = this.canvas instanceof HTMLCanvasElement ? this.canvas.getBoundingClientRect() : { top: 0, left: 0 };
        this.mousePosition.x = event.clientX - rect.left;
        this.mousePosition.y = event.clientY - rect.top;

        // Calculate mouse delta (movement)
        if (this._isPointerLocked) {
            this.mouseDelta.x = event.movementX || 0;
            this.mouseDelta.y = event.movementY || 0;
            // console.log(`[DEBUG] MouseMove (Locked): dX=${this.mouseDelta.x}, dY=${this.mouseDelta.y}`);
        } else {
            // Simple delta calculation when not locked (less useful for FPS controls)
            // This requires storing the previous position, which we aren't doing robustly here.
            // For non-locked scenarios, using raw mousePosition is often better.
            this.mouseDelta.x = 0; // Reset or implement previous position tracking
            this.mouseDelta.y = 0;
            // console.log(`[DEBUG] MouseMove (Unlocked): X=${this.mousePosition.x}, Y=${this.mousePosition.y}`);
        }
    }

     _onPointerLockChange() {
        if (document.pointerLockElement === this.canvas) {
            console.log('[DEBUG] Pointer Locked');
            this._isPointerLocked = true;
        } else {
            console.log('[DEBUG] Pointer Unlocked');
            this._isPointerLocked = false;
            // Optionally reset keys/mouse buttons when focus is lost
            // this.resetState();
        }
    }

    _onPointerLockError() {
        console.error('[DEBUG] Pointer Lock Error');
        this._isPointerLocked = false;
    }


    // --- State Accessors ---

    isKeyDown(key) {
        const lowerKey = key.toLowerCase();
        // Check both 'w' and 'KeyW' for robustness
        return !!this.keysPressed[lowerKey] || !!this.keysPressed[key];
    }

    isMouseButtonDown(button) {
        // button: 0 = left, 1 = middle, 2 = right
        return !!this.mouseButtonsPressed[button];
    }

    getMousePosition() {
        return { ...this.mousePosition }; // Return a copy
    }

    getMouseDelta() {
        // IMPORTANT: Reset delta after reading it if it represents movement *since last frame*
        const delta = { ...this.mouseDelta };
        // If delta is meant to be frame-by-frame, reset it here:
        // this.mouseDelta.x = 0;
        // this.mouseDelta.y = 0;
        return delta;
    }

     isPointerLocked() {
         return this._isPointerLocked;
     }

    // --- Utility ---
    resetFrameState() {
        // Reset states that should only last one frame, like mouse delta
        this.mouseDelta.x = 0;
        this.mouseDelta.y = 0;
        // DO NOT reset keysPressed or mouseButtonsPressed here,
        // they persist until the key/button is released.
        // console.log('[DEBUG] Input frame state reset (delta)');
    }

    resetAllState() {
        console.log('[DEBUG] Resetting all input state.');
        this.keysPressed = {};
        this.mouseButtonsPressed = {};
        this.mousePosition = { x: 0, y: 0 };
        this.mouseDelta = { x: 0, y: 0 };
    }
}

// Make it available globally or manage through modules
window.InputManager = InputManager;

// Example Initialization (usually done in game.js)
// Assuming a canvas with id="gameCanvas" exists
// const canvas = document.getElementById('gameCanvas');
// const inputManager = new InputManager(canvas);
// inputManager.bindEventListeners();

// --- Add this line at the end for initial load confirmation ---
console.log('[Input] Initialized (Using Global THREE). Ready for binding.');
// --- End of Added Line ---
