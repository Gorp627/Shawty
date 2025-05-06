// docs/js/CharacterControls.js
import * as THREE from 'three';

const MOVE_SPEED = 5.0;
const DASH_SPEED_MULTIPLIER = 3.0; // Multiplier for dash speed relative to move speed
const DASH_DURATION = 150; // ms
const DASH_COOLDOWN = 2000; // ms
const JUMP_VELOCITY = 7.0; // Initial upward velocity
const GRAVITY = -19.62; // Acceleration due to gravity (m/s^2)
const MOUSE_SENSITIVITY = 0.002;

export class CharacterControls {
    constructor(camera, domElement, initialPosition, socket, ui) {
        this.camera = camera;
        this.domElement = domElement || document.body;
        this.socket = socket;
        this.ui = ui; // For checking if chat is active

        this.position = new THREE.Vector3().copy(initialPosition);
        this.velocity = new THREE.Vector3();
        
        this.pitchObject = new THREE.Object3D(); // For looking up/down
        this.pitchObject.add(camera);
        this.yawObject = new THREE.Object3D(); // For looking left/right
        this.yawObject.position.copy(this.position);
        this.yawObject.add(this.pitchObject);

        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            space: false, // Jump
            shift: false, // Dash
        };

        this.isGrounded = false;
        this.canDash = true;
        this.isDashing = false;
        this.lastDashTime = 0;
        this.dashDirection = new THREE.Vector3();

        this.inputVelocity = new THREE.Vector3(); // Based on WASD
        this.rotation = { pitch: 0, yaw: 0 }; // Radians

        this.isChatting = false;
        this.isPointerLocked = false;

        this.bindEventListeners();
        this.requestPointerLock();
    }

    get sceneObject() {
        return this.yawObject; // This is what you add to the Three.js scene
    }
    
    setChatting(isChatting) {
        this.isChatting = isChatting;
        if (isChatting && this.isPointerLocked) {
            document.exitPointerLock();
        } else if (!isChatting && !this.isPointerLocked) {
            this.requestPointerLock();
        }
    }

    bindEventListeners() {
        document.addEventListener('keydown', this.onKeyDown.bind(this));
        document.addEventListener('keyup', this.onKeyUp.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('pointerlockchange', this.onPointerLockChange.bind(this));
        document.addEventListener('click', () => { // Re-request lock on click if not chatting
            if (!this.isPointerLocked && !this.isChatting) {
                this.requestPointerLock();
            }
        });
    }

    requestPointerLock() {
        if (this.ui.isChatting()) return; // Don't lock if chat is active
        this.domElement.requestPointerLock = this.domElement.requestPointerLock ||
                                           this.domElement.mozRequestPointerLock ||
                                           this.domElement.webkitRequestPointerLock;
        if (this.domElement.requestPointerLock) {
            this.domElement.requestPointerLock();
        }
    }

    onPointerLockChange() {
        if (document.pointerLockElement === this.domElement ||
            document.mozPointerLockElement === this.domElement ||
            document.webkitPointerLockElement === this.domElement) {
            this.isPointerLocked = true;
        } else {
            this.isPointerLocked = false;
            // Optionally show menu or pause game if pointer lock is lost involuntarily
        }
    }

    onKeyDown(event) {
        if (this.isChatting) return;
        switch (event.code) {
            case 'KeyW': case 'ArrowUp':    this.keys.forward = true; break;
            case 'KeyA': case 'ArrowLeft':  this.keys.left = true; break;
            case 'KeyS': case 'ArrowDown':  this.keys.backward = true; break;
            case 'KeyD': case 'ArrowRight': this.keys.right = true; break;
            case 'Space':                   this.keys.space = true; break;
            case 'ShiftLeft': case 'ShiftRight': this.keys.shift = true; break;
        }
    }

    onKeyUp(event) {
        // No need to check isChatting here, as keyup should always register
        switch (event.code) {
            case 'KeyW': case 'ArrowUp':    this.keys.forward = false; break;
            case 'KeyA': case 'ArrowLeft':  this.keys.left = false; break;
            case 'KeyS': case 'ArrowDown':  this.keys.backward = false; break;
            case 'KeyD': case 'ArrowRight': this.keys.right = false; break;
            case 'Space':                   this.keys.space = false; break;
            case 'ShiftLeft': case 'ShiftRight': this.keys.shift = false; break;
        }
    }

    onMouseMove(event) {
        if (!this.isPointerLocked || this.isChatting) return;

        const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
        const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

        this.rotation.yaw -= movementX * MOUSE_SENSITIVITY;
        this.rotation.pitch -= movementY * MOUSE_SENSITIVITY;

        // Clamp pitch to prevent camera flipping
        this.rotation.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.rotation.pitch));

        this.pitchObject.rotation.x = this.rotation.pitch;
        this.yawObject.rotation.y = this.rotation.yaw;
    }
    
    // Called by main game loop, not directly tied to physics simulation rate
    // This sends input to server. Actual movement is dictated by server.
    sendInputToServer() {
        // Only send if there's actual input or rotation change
        // This can be optimized further to send only on change
        this.socket.emit('playerInput', {
            keys: this.keys, // Send the raw key state
            rotation: { x: this.rotation.pitch, y: this.rotation.yaw }
        });
         // Reset single-press keys after sending, so they are not sent continuously
         // if (this.keys.space) this.keys.space = false; 
         // if (this.keys.shift) this.keys.shift = false; // Dash is more of a hold or timed event
    }

    // This update function is for client-side prediction or visual updates
    // For a server-authoritative model, this might just update camera position
    // based on the player's model position received from server.
    update(deltaTime, currentServerPosition) {
        // For a fully server-authoritative model, the CharacterControls
        // primarily handles input and camera. The player's visual position
        // (this.yawObject.position) should be updated from the server state.
        
        if (currentServerPosition) {
            this.yawObject.position.lerp(currentServerPosition, 0.5); // Smoothly move camera container
            this.position.copy(this.yawObject.position);
        }

        // The key states (this.keys) are still important for sending to the server.
        // The server uses these to update its physics simulation.
        
        // Example: Client-side dash initiation (visual feedback, server will verify and apply actual physics)
        if (this.keys.shift && !this.isDashing && this.canDash && Date.now() - this.lastDashTime > DASH_COOLDOWN) {
            // This is more about *requesting* a dash from the server.
            // The server's PlayerServer.js `applyInput` will handle the actual dash impulse.
            // Client might play a dash sound or visual effect here.
            this.lastDashTime = Date.now(); // For client-side cooldown tracking of the *request*
            // this.keys.shift is already true and will be sent to server.
        }

        // Gravity and jump are fully server-side now. Client just renders.
        // If you wanted client-side prediction for jump/gravity, you'd do:
        // if (this.keys.space && this.isGrounded) {
        //     this.velocity.y = JUMP_VELOCITY;
        //     this.isGrounded = false;
        // }
        // this.velocity.y += GRAVITY * deltaTime;
        // this.position.y += this.velocity.y * deltaTime;
        // if (this.position.y < 0) { // Simple ground collision
        //     this.position.y = 0;
        //     this.velocity.y = 0;
        //     this.isGrounded = true;
        // }
        // this.yawObject.position.copy(this.position);
    }

    // Teleport the controls (e.g., on respawn)
    teleport(newPosition) {
        this.position.copy(newPosition);
        this.yawObject.position.copy(newPosition);
        this.velocity.set(0, 0, 0);
        // Reset rotation if needed, or let server dictate it
        // this.rotation.yaw = 0;
        // this.rotation.pitch = 0;
        // this.pitchObject.rotation.x = this.rotation.pitch;
        // this.yawObject.rotation.y = this.rotation.yaw;
    }

    dispose() {
        document.removeEventListener('keydown', this.onKeyDown.bind(this));
        document.removeEventListener('keyup', this.onKeyUp.bind(this));
        document.removeEventListener('mousemove', this.onMouseMove.bind(this));
        document.removeEventListener('pointerlockchange', this.onPointerLockChange.bind(this));
        if (this.isPointerLocked) {
            document.exitPointerLock();
        }
        if (this.pitchObject.parent) this.pitchObject.parent.remove(this.pitchObject);
        if (this.yawObject.parent) this.yawObject.parent.remove(this.yawObject);
    }
}
