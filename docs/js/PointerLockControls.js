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
        this.object = camera; // Assign camera
        this.domElement = domElement; // Assign domElement

		this.isLocked = false;
		this.minPolarAngle = 0;
		this.maxPolarAngle = Math.PI;
		this.pointerSpeed = 1.0;
        this.enabled = true;

		this._onMouseMove = onMouseMove.bind( this );
		this._onPointerlockChange = onPointerlockChange.bind( this );
		this._onPointerlockError = onPointerlockError.bind( this );

		if ( this.domElement !== null ) {
			this.connect( this.domElement );
		} else {
             console.warn( 'THREE.PointerLockControls: domElement not provided in constructor. Call connect() manually.' );
        }
	}

	connect( element = this.domElement ) {
        if (!element) {
            console.error( 'THREE.PointerLockControls: No domElement specified to connect to.' );
            return;
        }
        this.domElement = element;

		this.domElement.ownerDocument.addEventListener( 'mousemove', this._onMouseMove );
		this.domElement.ownerDocument.addEventListener( 'pointerlockchange', this._onPointerlockChange );
		this.domElement.ownerDocument.addEventListener( 'pointerlockerror', this._onPointerlockError );
	}

	disconnect() {
        if (!this.domElement) return;

		this.domElement.ownerDocument.removeEventListener( 'mousemove', this._onMouseMove );
		this.domElement.ownerDocument.removeEventListener( 'pointerlockchange', this._onPointerlockChange );
		this.domElement.ownerDocument.removeEventListener( 'pointerlockerror', this._onPointerlockError );
	}

	dispose() {
		this.disconnect();
	}

	getObject() {
		return this.object;
	}

	getDirection( v ) {
		return v.set( 0, 0, - 1 ).applyQuaternion( this.object.quaternion );
	}

	moveForward( distance ) {
		if ( this.enabled === false ) return;
		const camera = this.object;
		_vector.setFromMatrixColumn( camera.matrix, 0 );
		_vector.crossVectors( camera.up, _vector );
		camera.position.addScaledVector( _vector, distance );
	}

	moveRight( distance ) {
		if ( this.enabled === false ) return;
		const camera = this.object;
		_vector.setFromMatrixColumn( camera.matrix, 0 );
		camera.position.addScaledVector( _vector, distance );
	}

	lock( unadjustedMovement = false ) {
        if (!this.domElement) {
             console.error( 'THREE.PointerLockControls: Cannot lock without a domElement.' );
             return;
        }
		this.domElement.requestPointerLock( {
			unadjustedMovement
		} );
	}

	unlock() {
         if (!this.domElement) return;
		this.domElement.ownerDocument.exitPointerLock();
	}
}

// --- Event listener functions ---

function onMouseMove( event ) {
	if ( this.enabled === false || this.isLocked === false ) return;
	const camera = this.object;
	_euler.setFromQuaternion( camera.quaternion );
	_euler.y -= event.movementX * _MOUSE_SENSITIVITY * this.pointerSpeed;
	_euler.x -= event.movementY * _MOUSE_SENSITIVITY * this.pointerSpeed;
	_euler.x = Math.max( _PI_2 - this.maxPolarAngle, Math.min( _PI_2 - this.minPolarAngle, _euler.x ) );
	camera.quaternion.setFromEuler( _euler );
	this.dispatchEvent( _changeEvent );
}

function onPointerlockChange() {
    if (!this.domElement) return;
	if ( this.domElement.ownerDocument.pointerLockElement === this.domElement ) {
		this.dispatchEvent( _lockEvent );
		this.isLocked = true;
	} else {
		this.dispatchEvent( _unlockEvent );
		this.isLocked = false;
	}
}

function onPointerlockError() {
	console.error( 'THREE.PointerLockControls: Unable to use Pointer Lock API' );
}

export { PointerLockControls };
