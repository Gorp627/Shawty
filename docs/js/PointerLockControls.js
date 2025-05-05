// docs/js/PointerLockControls.js

// --- CORRECTED IMPORT ---
import {
	EventDispatcher as Controls, // Aliased EventDispatcher as Controls
	Euler,
	Vector3
} from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js'; // Using jsdelivr URL
// --- END CORRECTED IMPORT ---


const _euler = new Euler( 0, 0, 0, 'YXZ' ); // Use YXZ order for FPS controls
const _vector = new Vector3(); // Reusable vector for calculations

// Event objects dispatched by the controls
const _changeEvent = { type: 'change' };
const _lockEvent = { type: 'lock' };
const _unlockEvent = { type: 'unlock' };

// Constants
const _MOUSE_SENSITIVITY = 0.002; // Adjust sensitivity as needed
const _PI_2 = Math.PI / 2; // Cache Math.PI / 2

class PointerLockControls extends Controls { // Extend our 'Controls' alias (EventDispatcher)

	constructor( camera, domElement = document.body ) { // Default to document.body if no element provided

		super(); // Call EventDispatcher constructor

        // Validate required camera argument
        if (!camera) {
            console.error("PointerLockControls: Camera object is required.");
            // Optionally throw an error to prevent instantiation
            // throw new Error("PointerLockControls requires a camera object.");
            return; // Exit if no camera provided
        }

        this.object = camera; // The camera being controlled
        this.domElement = domElement; // The element to attach listeners to

		// API
		this.isLocked = false; // Read-only status flag

		// Vertical (pitch) constraints
		this.minPolarAngle = 0; // radians, 0 = straight up
		this.maxPolarAngle = Math.PI; // radians, PI = straight down

		// Horizontal sensitivity multiplier
		this.pointerSpeed = 1.0;

        // Enable/disable flag
        this.enabled = true;

		// Private bound event listeners (ensures 'this' context is correct)
		this._onMouseMove = onMouseMove.bind( this );
		this._onPointerlockChange = onPointerlockChange.bind( this );
		this._onPointerlockError = onPointerlockError.bind( this );

		// Automatically connect listeners if domElement is provided
		this.connect();

	}

	// Add event listeners
	connect() {
        if (!this.domElement) {
            console.error( 'THREE.PointerLockControls: Cannot connect without a domElement.' );
            return;
        }
        // console.log("PointerLockControls: Connecting listeners."); // Less verbose
		// Use ownerDocument to ensure listeners are added to the correct document context (important for iframes)
		this.domElement.ownerDocument.addEventListener( 'mousemove', this._onMouseMove );
		this.domElement.ownerDocument.addEventListener( 'pointerlockchange', this._onPointerlockChange );
		this.domElement.ownerDocument.addEventListener( 'pointerlockerror', this._onPointerlockError );
	}

	// Remove event listeners
	disconnect() {
        if (!this.domElement) { return; } // Nothing to disconnect
        // console.log("PointerLockControls: Disconnecting listeners."); // Less verbose
		this.domElement.ownerDocument.removeEventListener( 'mousemove', this._onMouseMove );
		this.domElement.ownerDocument.removeEventListener( 'pointerlockchange', this._onPointerlockChange );
		this.domElement.ownerDocument.removeEventListener( 'pointerlockerror', this._onPointerlockError );
	}

	// Clean up resources (remove listeners)
	dispose() {
        // console.log("PointerLockControls: Disposing."); // Less verbose
		this.disconnect();
	}

	// Get controlled object (camera) - kept for potential backward compatibility
	getObject() {
		return this.object;
	}

	// Get camera's forward direction vector
	getDirection( v ) {
        const target = v || new Vector3(); // Use provided vector or create a new one
		// Start with base forward vector (0, 0, -1) and rotate it by camera's quaternion
		return target.set( 0, 0, - 1 ).applyQuaternion( this.object.quaternion );
	}

	// --- Movement Methods (Optional - Often handled in main game loop) ---
	// These methods move the camera directly, which might conflict with physics-based movement.
	// It's usually better to calculate direction here and apply velocity/position changes elsewhere.

	// Move forward parallel to the ground plane (XZ)
	moveForward( distance ) {
		if ( this.enabled === false ) return;
		const camera = this.object;
		// Get the camera's forward direction projected onto the XZ plane
		_vector.setFromMatrixColumn( camera.matrix, 0 ); // Get X (right) vector
		_vector.crossVectors( camera.up, _vector ); // Calculate Z (forward) vector
        _vector.y = 0; // Remove vertical component
        _vector.normalize(); // Ensure consistent speed
		// Add scaled movement vector to camera's position
		camera.position.addScaledVector( _vector, distance );
	}

	// Move sideways parallel to the ground plane (XZ)
	moveRight( distance ) {
		if ( this.enabled === false ) return;
		const camera = this.object;
        // Get the camera's right direction projected onto the XZ plane
		_vector.setFromMatrixColumn( camera.matrix, 0 ); // Get X (right) vector
        _vector.y = 0; // Remove vertical component
        _vector.normalize(); // Ensure consistent speed
		// Add scaled movement vector to camera's position
		camera.position.addScaledVector( _vector, distance );
	}
	// --- End Optional Movement Methods ---

	// Request pointer lock from the browser
	lock() {
        if (!this.domElement) {
             console.error( 'THREE.PointerLockControls: Cannot lock without a connected domElement.' );
             return;
        }
        // console.log("PointerLockControls: Requesting pointer lock."); // Less verbose
		this.domElement.requestPointerLock();
	}

	// Release pointer lock
	unlock() {
         if (!this.domElement || !this.domElement.ownerDocument) { return; } // Safety check
         // console.log("PointerLockControls: Releasing pointer lock."); // Less verbose
		this.domElement.ownerDocument.exitPointerLock();
	}
}

// --- Internal Event Listener Functions ---
// These run with 'this' bound to the PointerLockControls instance

function onMouseMove( event ) {
	// Ignore mouse movement if controls are disabled or pointer isn't locked
	if ( this.enabled === false || this.isLocked === false ) return;

	// Get mouse movement delta (handle browser differences)
	const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
	const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

	const camera = this.object;
	_euler.setFromQuaternion( camera.quaternion ); // Get current rotation in Euler angles (YXZ order)

	// Adjust rotation based on mouse movement and sensitivity
	_euler.y -= movementX * _MOUSE_SENSITIVITY * this.pointerSpeed; // Yaw (left/right)
	_euler.x -= movementY * _MOUSE_SENSITIVITY * this.pointerSpeed; // Pitch (up/down)

    // Clamp the vertical pitch rotation within the defined limits
	_euler.x = Math.max( _PI_2 - this.maxPolarAngle, Math.min( _PI_2 - this.minPolarAngle, _euler.x ) );

	// Apply the new rotation back to the camera using a quaternion
	camera.quaternion.setFromEuler( _euler );

	// Dispatch a 'change' event so the main game loop knows the camera moved
	this.dispatchEvent( _changeEvent );
}

function onPointerlockChange() {
    // Check if pointer lock is now active for our element
    if (!this.domElement || !this.domElement.ownerDocument) return; // Safety check

	if ( this.domElement.ownerDocument.pointerLockElement === this.domElement ) {
        // Pointer was successfully locked
		this.dispatchEvent( _lockEvent );
		this.isLocked = true;
	} else {
        // Pointer was released (or lock failed after request)
		this.dispatchEvent( _unlockEvent );
		this.isLocked = false;
	}
}

function onPointerlockError(event) {
	// Handle errors during pointer lock request
	console.error( 'THREE.PointerLockControls: Pointer Lock Error.', event);
    this.isLocked = false; // Ensure state reflects the failure
    // Optionally alert the user or provide feedback
}

// Export the class for use in other modules
export { PointerLockControls };
