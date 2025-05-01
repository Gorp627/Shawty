// Docs/entities.js
// Basic Player Entity with DEBUG logging

console.log('entities.js loaded');

// Assuming THREE is global
// import * as THREE from 'three';

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4; // Approximate radius for collisions

class Entity {
    constructor(id, game, mesh = null) {
        this.id = id;
        this.game = game; // Reference to the main game instance
        this.mesh = mesh; // THREE.Object3D (could be Group, Mesh, etc.)
        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();

        if (this.mesh) {
            this.position.copy(this.mesh.position);
        }
    }

    // Basic update (mainly for interpolation on remote clients)
    update(deltaTime) {
        // Default: Apply velocity to position
        // this.position.addScaledVector(this.velocity, deltaTime);
        // if (this.mesh) {
        //     this.mesh.position.copy(this.position);
        // }
    }

    // Method to update entity state from network data
    setState(data) {
        if (data.position) {
            // Directly setting position for remote entities (consider interpolation later)
            this.position.set(data.position.x, data.position.y, data.position.z);
            if (this.mesh) {
                this.mesh.position.copy(this.position);
            }
        }
        if (data.rotation) {
            // Assuming rotation is Euler or Quaternion
            if (this.mesh) {
                 if (data.rotation.isQuaternion) {
                    this.mesh.quaternion.copy(data.rotation);
                 } else { // Assuming Euler for simplicity
                    this.mesh.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
                 }
            }
        }
        // Update other state variables as needed (e.g., animation state)
    }

    // Method to get entity state for sending over network
    getState() {
        const state = {
            id: this.id,
            position: { x: this.position.x, y: this.position.y, z: this.position.z },
            // Include rotation, velocity, animation state etc. as needed
        };
        if (this.mesh) {
             state.rotation = { x: this.mesh.rotation.x, y: this.mesh.rotation.y, z: this.mesh.rotation.z }; // Or quaternion
        }
        return state;
    }

     dispose() {
         // Clean up resources, e.g., remove mesh from scene (done in game.js), dispose geometry/material
         console.log(`[Entity ${this.id}] Dispose called.`);
         if (this.mesh) {
            // Geometry and material disposal might be needed if they are unique to this entity
            // Traverse the mesh if it's a group
            this.mesh.traverse(child => {
                if (child.isMesh) {
                    child.geometry?.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => mat.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            });
         }
     }
}

class PlayerEntity extends Entity {
    constructor(id, isLocal, game, modelMesh, config = {}) {
        // Ensure modelMesh is a valid Object3D
        if (!modelMesh || !(modelMesh instanceof THREE.Object3D)) {
             console.error(`[PlayerEntity ${id}] Invalid modelMesh provided!`, modelMesh);
             // Create a fallback mesh or throw error
             modelMesh = new THREE.Mesh(
                new THREE.BoxGeometry(PLAYER_RADIUS * 2, PLAYER_HEIGHT, PLAYER_RADIUS * 2),
                new THREE.MeshStandardMaterial({ color: isLocal ? 0x00ff00 : 0xff0000 })
            );
            modelMesh.position.set(0, PLAYER_HEIGHT / 2, 0); // Center geometry
        }

        // Create a parent container for logical position/rotation and the visual model
        const container = new THREE.Group();
        container.add(modelMesh);

        // Adjust model position/scale within the container if needed
        // e.g., modelMesh.position.y = -PLAYER_HEIGHT / 2; to have container origin at feet

        super(id, game, container); // Pass the container group as the main mesh

        this.isLocal = isLocal;
        this.config = { // Default configuration
            moveSpeed: 5.0,
            runSpeedMultiplier: 1.8, // No dash, using run terminology
            jumpForce: 8.0,
            gravity: -25.0, // Stronger gravity
            lookSpeed: 0.003, // Mouse sensitivity
            friction: 0.90, // Ground friction (closer to 1 = less friction)
            airFriction: 0.98, // Air friction
            maxSpeed: 15.0, // Maximum horizontal speed
            shootCooldown: 0.15, // Seconds between shots
            rocketJumpForce: 15.0, // Upward force for rocket jump
            ...config // Override with provided config
        };

        this.isOnGround = false;
        this.canJump = true;
        this.isShooting = false;
        this.shootTimer = 0;

        // Camera handling (for local player)
        this.camera = game.camera; // Reference the main game camera
        this.cameraTarget = new THREE.Object3D(); // Invisible target for camera to follow/use rotation
        this.mesh.add(this.cameraTarget); // Attach target to player container
        this.cameraTarget.position.y = PLAYER_HEIGHT * 0.85; // Eye level

        // Player orientation (controlled by mouse) - Use Euler for simplicity first
        this.rotationY = 0; // Left/Right rotation (applied to container mesh)
        this.rotationX = 0; // Up/Down rotation (applied to cameraTarget)
         this.maxPitch = Math.PI / 2 - 0.1; // Limit looking straight up/down
         this.minPitch = -Math.PI / 2 + 0.1;

         console.log(`[PlayerEntity ${id}] Created. IsLocal: ${isLocal}`);

         // Initialize physics state via GameLogic after creation
         // this.game.gameLogic.initializePhysicsState(this); // Now called from game.js
    }

    // Override update for player-specific logic (input, physics)
    update(deltaTime, inputManager, gameLogic) {
        // --- DEBUG: Confirm Update Call ---
        // console.log(`[DEBUG Player ${this.id}] Update | dt: ${deltaTime.toFixed(4)} | OnGround: ${this.isOnGround}`);
        // ---

        if (!this.isLocal || !inputManager || !gameLogic) {
            // Remote player update logic (e.g., interpolation) or basic velocity application
            super.update(deltaTime); // Apply basic velocity if any
            return;
        }

        // --- Local Player Update Logic ---

        // 1. Handle Input (Movement, Look, Actions)
        this.handleInput(deltaTime, inputManager);

         // --- DEBUG: Log Velocity after input ---
         // console.log(`[DEBUG Player ${this.id}] Velocity after input: `, this.velocity.toArray().map(v => v.toFixed(2)));
         // ---

        // 2. Apply Physics & Collisions (via GameLogic)
        // GameLogic needs current velocity, player object, delta time, map mesh
        gameLogic.applyPhysicsAndCollision(this, deltaTime); // Modifies velocity and position

         // --- DEBUG: Log state after physics ---
         // console.log(`[DEBUG Player ${this.id}] Position after physics: `, this.position.toArray().map(v => v.toFixed(2)));
         // console.log(`[DEBUG Player ${this.id}] Velocity after physics: `, this.velocity.toArray().map(v => v.toFixed(2)));
         // console.log(`[DEBUG Player ${this.id}] OnGround state after physics: ${this.isOnGround}`);
         // ---


        // 3. Update Mesh Position/Rotation based on physics results
        if (this.mesh) {
            this.mesh.position.copy(this.position);
            // Y rotation is applied directly to the container mesh
            this.mesh.rotation.y = this.rotationY;

            // X rotation (pitch) is applied to the camera target *within* the container
            this.cameraTarget.rotation.x = this.rotationX;
        }

         // 4. Update Camera Position/Orientation
         this.updateCamera();

         // 5. Update Timers (e.g., shooting cooldown)
         this.shootTimer = Math.max(0, this.shootTimer - deltaTime);

         // 6. Reset one-time action flags
         this.isShooting = false; // Reset shooting flag for next frame check

        // --- DEBUG: Log end of update ---
        // console.log(`[DEBUG Player ${this.id}] Update finished.`);
        // ---
    }

    handleInput(deltaTime, inputManager) {
        // --- DEBUG: Input Handling Start ---
        // console.log(`[DEBUG Player ${this.id}] Handling Input...`);
        // ---

        // --- Mouse Look ---
        const mouseDelta = inputManager.getMouseDelta(); // Get delta since last frame
        if (inputManager.isPointerLocked()) {
            this.rotationY -= mouseDelta.x * this.config.lookSpeed;
            this.rotationX -= mouseDelta.y * this.config.lookSpeed;

            // Clamp pitch (up/down look)
            this.rotationX = Math.max(this.minPitch, Math.min(this.maxPitch, this.rotationX));
            // console.log(`[DEBUG] Look Input: dX=${mouseDelta.x}, dY=${mouseDelta.y} | rotY=${this.rotationY.toFixed(2)}, rotX=${this.rotationX.toFixed(2)}`);
        }

        // --- Movement ---
        const moveDirection = new THREE.Vector3(0, 0, 0);
        let isRunning = false; // Changed from isDashing

        if (inputManager.isKeyDown('w') || inputManager.isKeyDown('KeyW')) {
            // console.log("[DEBUG] W pressed");
            moveDirection.z -= 1;
        }
        if (inputManager.isKeyDown('s') || inputManager.isKeyDown('KeyS')) {
            // console.log("[DEBUG] S pressed");
            moveDirection.z += 1;
        }
        if (inputManager.isKeyDown('a') || inputManager.isKeyDown('KeyA')) {
            // console.log("[DEBUG] A pressed");
            moveDirection.x -= 1;
        }
        if (inputManager.isKeyDown('d') || inputManager.isKeyDown('KeyD')) {
            // console.log("[DEBUG] D pressed");
            moveDirection.x += 1;
        }

        // Determine speed based on Shift key (Running)
        let currentSpeed = this.config.moveSpeed;
        if (inputManager.isKeyDown('shift') || inputManager.isKeyDown('ShiftLeft') || inputManager.isKeyDown('ShiftRight')) {
             // console.log("[DEBUG] Shift pressed");
             isRunning = true;
             currentSpeed *= this.config.runSpeedMultiplier;
        }


        if (moveDirection.lengthSq() > 0) { // Only apply movement if key is pressed
            moveDirection.normalize();
             // console.log(`[DEBUG] Normalized Move Direction: ${moveDirection.x.toFixed(2)}, ${moveDirection.z.toFixed(2)} | Speed: ${currentSpeed}`);

            // Apply rotation to move direction vector
            moveDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationY);

            // Apply movement force/velocity change (additive for now, physics step will clamp)
             const moveForce = moveDirection.multiplyScalar(currentSpeed * deltaTime * 10); // Scaled for impulse-like effect

            // Apply force more directly, letting friction handle slowdown
             this.velocity.x += moveForce.x;
             this.velocity.z += moveForce.z; // Apply force in XZ plane

            // console.log(`[DEBUG] Applied Move Force: ${moveForce.x.toFixed(2)}, ${moveForce.z.toFixed(2)}`);

        } else {
            // Apply friction if on ground and not moving intentionally
            // Let GameLogic handle friction
        }

         // --- Jump ---
         if ((inputManager.isKeyDown(' ') || inputManager.isKeyDown('Space')) && this.isOnGround && this.canJump) {
             console.log("[DEBUG] Jump Action Triggered");
             this.velocity.y = this.config.jumpForce; // Directly set upward velocity
             this.isOnGround = false; // Immediately leave ground state
             this.canJump = false; // Prevent holding space for continuous jump
             console.log(`[DEBUG] Jump! Set velocity.y to ${this.velocity.y}`);
         }
         // Reset jump flag when key is released (or maybe when landing?)
         if (!(inputManager.isKeyDown(' ') || inputManager.isKeyDown('Space'))) {
              this.canJump = true; // Allow jump again once space is released
         }
         // GameLogic should set isOnGround = true when landing.


        // --- Shoot ---
        if (inputManager.isMouseButtonDown(0) && this.shootTimer <= 0) { // Left mouse button
            console.log("[DEBUG] Shoot Action Triggered");
            this.isShooting = true; // Mark that a shot happened this frame
            this.shootTimer = this.config.shootCooldown; // Reset cooldown

             // Calculate shot origin and direction
             const shotOrigin = new THREE.Vector3();
             const shotDirection = new THREE.Vector3();

             // Get world position of camera target (approximate eye level)
            this.cameraTarget.getWorldPosition(shotOrigin);

             // Get camera direction
            this.camera.getWorldDirection(shotDirection);

            console.log(`[DEBUG] Shooting from ${shotOrigin.toArray().map(n=>n.toFixed(2))}, direction ${shotDirection.toArray().map(n=>n.toFixed(2))}`);

             // Tell GameLogic or NetworkManager to fire a projectile
            this.game.networkManager.sendShootAction(shotOrigin, shotDirection); // Send to server

            // Optional: Play sound effect locally immediately
            this.game.effectManager.playSound('gunSound', shotOrigin);

            // Optional: Create visual muzzle flash effect locally
            // this.game.effectManager.createMuzzleFlash(shotOrigin, shotDirection);

            // --- Rocket Jump Check ---
             if (inputManager.isKeyDown('e') || inputManager.isKeyDown('KeyE')) {
                 console.log("[DEBUG] Rocket Jump Condition Met (E + Click)");
                 // Apply force opposite to shot direction
                 const rocketForce = shotDirection.clone().negate().multiplyScalar(this.config.rocketJumpForce);
                  // Make sure force has an upward component or is mostly backward
                  rocketForce.y = Math.max(rocketForce.y, 0.5) * this.config.rocketJumpForce; // Add some upward bias
                 this.velocity.add(rocketForce);
                 console.log(`[DEBUG] Applied Rocket Jump Force: ${rocketForce.toArray().map(n=>n.toFixed(2))}`);
                 // Ensure player leaves ground if they were on it
                 this.isOnGround = false;
             }
        }
    }

     updateCamera() {
        if (!this.isLocal || !this.camera) return;

        // Camera position should be the world position of the cameraTarget
        const cameraWorldPos = new THREE.Vector3();
        this.cameraTarget.getWorldPosition(cameraWorldPos);
        this.camera.position.copy(cameraWorldPos);

        // Camera rotation is determined by the player's container rotation (Y)
        // and the cameraTarget's local rotation (X)
        // We can construct the final world quaternion

        // Method 1: Set camera rotation directly based on angles
         // This is simpler but can lead to gimbal lock issues if not careful
         // this.camera.rotation.set(this.rotationX, this.rotationY, 0, 'YXZ'); // Use YXZ order common for FPS

         // Method 2: Use quaternions (more robust)
         const playerQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationY);
         const pitchQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.rotationX);
         const finalQuaternion = playerQuaternion.multiply(pitchQuaternion); // Order matters!
         this.camera.quaternion.copy(finalQuaternion);


        // --- DEBUG: Log Camera ---
        // const p = this.camera.position;
        // const q = this.camera.quaternion;
        // console.log(`[DEBUG] Camera Updated | Pos: ${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)} | Quat: ${q.x.toFixed(2)},${q.y.toFixed(2)},${q.z.toFixed(2)},${q.w.toFixed(2)}`);
        // ---
     }

    // Override to include player-specific state
    getState() {
        const baseState = super.getState();
        return {
            ...baseState,
            rotationY: this.rotationY, // Send orientation for remote players
            rotationX: this.rotationX, // Needed if showing weapon direction?
            velocity: { x: this.velocity.x, y: this.velocity.y, z: this.velocity.z },
            isOnGround: this.isOnGround,
             // Add animation state, health, etc.
        };
    }

     // Update based on network data for remote players
     setState(data) {
        super.setState(data); // Handle position/base rotation

         // Update specific player properties for remote instances
         if (!this.isLocal) {
            if (data.rotationY !== undefined) this.rotationY = data.rotationY;
            if (data.rotationX !== undefined) this.rotationX = data.rotationX;
             if (data.velocity !== undefined) this.velocity.set(data.velocity.x, data.velocity.y, data.velocity.z);
             if (data.isOnGround !== undefined) this.isOnGround = data.isOnGround;

            // Apply rotations to mesh for visual representation
            if (this.mesh) {
                this.mesh.rotation.y = this.rotationY;
                // Potentially update an animation controller based on velocity/isOnGround
            }
         }
     }
}

// Make classes available globally or manage through modules
window.Entity = Entity;
window.PlayerEntity = PlayerEntity;

console.log('[Entities] PlayerEntity class defined.');
