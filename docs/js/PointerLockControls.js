// docs/js/PointerLockControls.js

// --- CORRECTED IMPORT ---
import {
	EventDispatcher as Controls, // Aliased EventDispatcher as Controls
	Euler,
	Vector3
} from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js'; // Using jsdelivr URL
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
        this.object = camera; this.domElement = domElement;
		this.isLocked = false; this.minPolarAngle = 0; this.maxPolarAngle = Math.PI;
		this.pointerSpeed = 1.0; this.enabled = true;
		this._onMouseMove = onMouseMove.bind( this ); this._onPointerlockChange = onPointerlockChange.bind( this ); this._onPointerlockError = onPointerlockError.bind( this );
		if ( this.domElement ) { this.connect(); }
        else { console.log('PointerLockControls: domElement not provided in constructor. Call connect() manually if needed.'); }
	}
	connect( element = this.domElement ) {
        if (!element) { console.error( 'THREE.PointerLockControls: No domElement specified to connect to.' ); return; }
        if (this.domElement && this.domElement !== element) { this.disconnect(); } // Disconnect old if changing
        this.domElement = element;
        // console.log("PointerLockControls: Connecting listeners to", this.domElement); // Less verbose
		this.domElement.ownerDocument.addEventListener( 'mousemove', this._onMouseMove ); this.domElement.ownerDocument.addEventListener( 'pointerlockchange', this._onPointerlockChange ); this.domElement.ownerDocument.addEventListener( 'pointerlockerror', this._onPointerlockError );
	}
	disconnect() {
        if (!this.domElement) { return; }
        // console.log("PointerLockControls: Disconnecting listeners from", this.domElement); // Less verbose
		this.domElement.ownerDocument.removeEventListener( 'mousemove', this._onMouseMove ); this.domElement.ownerDocument.removeEventListener( 'pointerlockchange', this._onPointerlockChange ); this.domElement.ownerDocument.removeEventListener( 'pointerlockerror', this._onPointerlockError );
	}
	dispose() { this.disconnect(); } // Ensure listeners are removed
	getObject() { return this.object; }
	getDirection( v ) { const target = v || new Vector3(); return target.set( 0, 0, - 1 ).applyQuaternion( this.object.quaternion ); }
	moveForward( distance ) { if ( this.enabled === false ) return; const camera = this.object; _vector.setFromMatrixColumn( camera.matrix, 0 ); _vector.crossVectors( camera.up, _vector ); _vector.y = 0; _vector.normalize(); camera.position.addScaledVector( _vector, distance ); }
	moveRight( distance ) { if ( this.enabled === false ) return; const camera = this.object; _vector.setFromMatrixColumn( camera.matrix, 0 ); _vector.y = 0; _vector.normalize(); camera.position.addScaledVector( _vector, distance ); }
	lock() { if (!this.domElement) { console.error( 'THREE.PointerLockControls: Cannot lock without a connected domElement.' ); return; } this.domElement.requestPointerLock(); }
	unlock() { if (!this.domElement || !this.domElement.ownerDocument) { return; } this.domElement.ownerDocument.exitPointerLock(); }
}
// --- Event listener functions ---
function onMouseMove( event ) { if ( this.enabled === false || this.isLocked === false ) return; const movementX = event.movementX || 0; const movementY = event.movementY || 0; const camera = this.object; _euler.setFromQuaternion( camera.quaternion ); _euler.y -= movementX * _MOUSE_SENSITIVITY * this.pointerSpeed; _euler.x -= movementY * _MOUSE_SENSITIVITY * this.pointerSpeed; _euler.x = Math.max( _PI_2 - this.maxPolarAngle, Math.min( _PI_2 - this.minPolarAngle, _euler.x ) ); camera.quaternion.setFromEuler( _euler ); this.dispatchEvent( _changeEvent ); }
function onPointerlockChange() { if (!this.domElement || !this.domElement.ownerDocument) return; if ( this.domElement.ownerDocument.pointerLockElement === this.domElement ) { this.dispatchEvent( _lockEvent ); this.isLocked = true; } else { this.dispatchEvent( _unlockEvent ); this.isLocked = false; } }
function onPointerlockError(event) { console.error( 'THREE.PointerLockControls: Pointer Lock Error.', event); this.isLocked = false; }
export { PointerLockControls };
