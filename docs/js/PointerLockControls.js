// docs/js/PointerLockControls.js

// --- CORRECTED IMPORT ---
import {
	EventDispatcher as Controls, // Aliased EventDispatcher as Controls
	Euler,
	Vector3
} from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js'; // Using CDN URL
// --- END CORRECTED IMPORT ---


const _euler = new Euler( 0, 0, 0, 'YXZ' );
const _vector = new Vector3();

const _changeEvent = { type: 'change' };
const _lockEvent = { type: 'lock' };
const _unlockEvent = { type: 'unlock' };

const _MOUSE_SENSITIVITY = 0.002;
const _PI_2 = Math.PI / 2;

class PointerLockControls extends Controls { // Extends the alias 'Controls'

	constructor( camera, domElement = null ) {

		super(); // Call base EventDispatcher constructor
        if (!camera) { console.error("PointerLockControls: Camera object is required."); return; }
        this.object = camera; // Assign camera
        this.domElement = domElement; // Assign domElement (can be null initially)

		this.isLocked = false;
		this.minPolarAngle = 0; // radians
		this.maxPolarAngle = Math.PI; // radians
		this.pointerSpeed = 1.0;
        this.enabled = true; // Control enabled state

		// Private bound event listeners
		this._onMouseMove = onMouseMove.bind( this );
		this._onPointerlockChange = onPointerlockChange.bind( this );
		this._onPointerlockError = onPointerlockError.bind( this );

		// Connect automatically if domElement is provided
		if ( this.domElement ) {
			this.connect(); // Call connect method
		} else {
             // Allow manual connection later if domElement wasn't provided
             console.log('PointerLockControls: domElement not provided in constructor. Call connect() manually if needed.');
        }
	}

	connect( element = this.domElement ) {
        // Use provided element or fallback to stored one
        if (!element) {
            console.error( 'THREE.PointerLockControls: No domElement specified to connect to.' );
            return;
        }
        // Disconnect previous listeners if changing element
        if (this.domElement) {
            this.disconnect();
        }
        this.domElement = element; // Store the element we're connecting to

        console.log("PointerLockControls: Connecting listeners to", this.domElement);
		this.domElement.ownerDocument.addEventListener( 'mousemove', this._onMouseMove );
		this.domElement.ownerDocument.addEventListener( 'pointerlockchange', this._onPointerlockChange );
		this.domElement.ownerDocument.addEventListener( 'pointerlockerror', this._onPointerlockError );
	}

	disconnect() {
        if (!this.domElement) {
            // console.log("PointerLockControls: disconnect() called but no domElement to disconnect from.");
            return; // Nothing to disconnect
        }
        console.log("PointerLockControls: Disconnecting listeners from", this.domElement);
		this.domElement.ownerDocument.removeEventListener( 'mousemove', this._onMouseMove );
		this.domElement.ownerDocument.removeEventListener( 'pointerlockchange', this._onPointerlockChange );
		this.domElement.ownerDocument.removeEventListener( 'pointerlockerror', this._onPointerlockError );
        // Don't nullify this.domElement here, as connect might be called again
	}

	dispose() {
        console.log("PointerLockControls: Disposing.");
		this.disconnect(); // Ensure listeners are removed
	}

	getObject() { // Keep for backward compatibility if needed
		return this.object;
	}

	getDirection( v ) { // v is an optional target Vector3
        const target = v || new Vector3();
		return target.set( 0, 0, - 1 ).applyQuaternion( this.object.quaternion );
	}

	moveForward( distance ) {
		if ( this.enabled === false ) return;
		const camera = this.object;
		// Get forward vector aligned with the ground plane
		_vector.setFromMatrixColumn( camera.matrix, 0 ); // X column = right vector
		_vector.crossVectors( camera.up, _vector ); // Z column = forward vector (camera space)
        _vector.y = 0; // Project onto XZ plane
        _vector.normalize(); // Ensure unit length
		camera.position.addScaledVector( _vector, distance );
	}

	moveRight( distance ) {
		if ( this.enabled === false ) return;
		const camera = this.object;
        // Get right vector aligned with the ground plane
		_vector.setFromMatrixColumn( camera.matrix, 0 ); // X column = right vector
        _vector.y = 0; // Project onto XZ plane
        _vector.normalize(); // Ensure unit length
		camera.position.addScaledVector( _vector, distance );
	}

	lock() {
        if (!this.domElement) {
             console.error( 'THREE.PointerLockControls: Cannot lock without a connected domElement.' );
             return;
        }
		this.domElement.requestPointerLock(); // Standard options are usually fine
	}

	unlock() {
         if (!this.domElement || !this.domElement.ownerDocument) {
              // console.warn( 'THREE.PointerLockControls: Cannot unlock without a connected domElement.' );
              return; // Avoid error if disconnected or element missing
         }
		this.domElement.ownerDocument.exitPointerLock();
	}
}

// --- Event listener functions (defined outside class for clarity) ---

function onMouseMove( event ) {
	if ( this.enabled === false || this.isLocked === false ) return;

	const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
	const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

	const camera = this.object;
	_euler.setFromQuaternion( camera.quaternion ); // Get current rotation

	_euler.y -= movementX * _MOUSE_SENSITIVITY * this.pointerSpeed;
	_euler.x -= movementY * _MOUSE_SENSITIVITY * this.pointerSpeed;

    // Clamp vertical rotation (pitch)
	_euler.x = Math.max( _PI_2 - this.maxPolarAngle, Math.min( _PI_2 - this.minPolarAngle, _euler.x ) );

	camera.quaternion.setFromEuler( _euler ); // Apply new rotation

	this.dispatchEvent( _changeEvent ); // Notify listeners (like playerController) of change
}

function onPointerlockChange() {
    // console.log("Pointer lock change detected"); // Debug log
    if (!this.domElement || !this.domElement.ownerDocument) return; // Safety check

	if ( this.domElement.ownerDocument.pointerLockElement === this.domElement ) {
        // console.log("Pointer lock ACQUIRED"); // Debug log
		this.dispatchEvent( _lockEvent );
		this.isLocked = true;
	} else {
         // console.log("Pointer lock RELEASED"); // Debug log
		this.dispatchEvent( _unlockEvent );
		this.isLocked = false;
	}
}

function onPointerlockError(event) {
	console.error( 'THREE.PointerLockControls: Pointer Lock Error.', event);
    this.isLocked = false; // Ensure state is correct on error
}

export { PointerLockControls };
