import *اترTHREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';

const PLAYER_MOVE_SPEED = 5.0; // Units per second
const PLAYER_DASH_SPEED = 15.0;
const PLAYER_DASH_DURATION = 150; // milliseconds
const PLAYER_JUMP_VELOCITY = 8.0; // Initial upward velocity
const PLAYER_SHOOT_COOLDOWN = 200; // milliseconds
const GUN_PROPULSION_FORCE = 20.0; // Force for E + Shoot
const SHOCKWAVE_FORCE = 30.0;

export class PlayerController {
    constructor(camera, scene, physicsWorld, uiManager, networkManager, assets) {
        this.camera = camera;
        this.scene = scene;
        this.physicsWorld = physicsWorld;
        this.RAPIER = window.RAPIER; // Assuming Rapier is global
        this.uiManager = uiManager;
        this.networkManager = networkManager;
        this.assets = assets; // Loaded assets (models, sounds)

        this.id = null;
        this.name = "Player";
        this.health = 100;
        this.model = null; // Three.js group/object3D
        this.gunModel = null;
        this.physicsBody = null; // Rapier rigid body
        this.collider = null; // Rapier collider

        this.movement = { forward: 0, backward: 0, left: 0, right: 0 };
        this.isJumping = false;
        this.isDashing = false;
        this.dashTimeout = null;
        this.canDash = true;
        this.dashCooldownTimeout = null;
        this.lastShotTime = 0;
        this.isShooting = false; // For animation state
        this.shootAnimationTimeout = null;

        this.isChatting = false;
        this.yVelocity = 0; // For simple gravity calculation if not using full Rapier forces for jump

        this.gunshotSound = new THREE.Audio(new THREE.AudioListener());
        if (assets.gunshotSound) {
            this.gunshotSound.setBuffer(assets.gunshotSound);
            this.gunshotSound.setVolume(0.3);
        } else {
            console.warn("Gunshot sound not loaded!");
        }
        
        this.playerHeight = 1.8; // Approximate height for camera and collider
        this.playerRadius = 0.4;

        this.euler = new THREE.Euler(0, 0, 0, 'YXZ'); // For camera rotation
        this.minPolarAngle = 0; // radians
        this.maxPolarAngle = Math.PI; // radians
        
        this.keys = {}; // To track key presses

        // For interpolation of remote players, not used by local player directly here
        this.lerpFactor = 0.2; 
        this.serverPosition = new THREE.Vector3();
        this.serverQuaternion = new THREE.Quaternion();
    }

    init(id, name, characterData, spawnPoint) {
        this.id = id;
        this.name = name;
        
        // Create player model
        const playerAsset = this.assets.playerModel; // Assuming Shawty1.glb is 'playerModel'
        if (!playerAsset) {
            console.error("Player model not found in assets!");
            return;
        }
        this.model = playerAsset.scene.clone();
        this.model.scale.set(1, 1, 1); // Adjust scale as needed
        this.model.name = `player_${id}`;
        this.scene.add(this.model);

        // Attach gun model (simplified: position relative to player model)
        const gunAsset = this.assets.gunModel;
        if (gunAsset) {
            this.gunModel = gunAsset.scene.clone();
            this.gunModel.scale.set(0.2, 0.2, 0.2); // Adjust scale
            // Attempt to find a hand bone (this is model-specific)
            // const handBone = this.model.getObjectByName("mixamorigRightHand"); // Example bone name
            // if (handBone) {
            //     handBone.add(this.gunModel);
            //     this.gunModel.position.set(0.1, 0.1, 0.1); // Adjust relative to hand
            //     this.gunModel.rotation.set(0, Math.PI / 2, 0); // Adjust rotation
            // } else {
                this.model.add(this.gunModel); // Add to player model root
                this.gunModel.position.set(0.3, this.playerHeight * 0.6, 0.5); // Adjust position
                this.gunModel.rotation.y = Math.PI / 2;
            // }
        }


        // Create Rapier physics body (Capsule)
        const rigidBodyDesc = this.RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(spawnPoint.x, spawnPoint.y, spawnPoint.z)
            .setLinearDamping(0.5) // Some air resistance / friction
            .setAngularDamping(1.0) // Prevent infinite spinning
            .setCanSleep(false) // Keep active for player
            .setCcdEnabled(true); // Continuous Collision Detection for fast moving player
        this.physicsBody = this.physicsWorld.createRigidBody(rigidBodyDesc);

        const colliderDesc = this.RAPIER.ColliderDesc.capsuleY(this.playerHeight / 2 - this.playerRadius, this.playerRadius)
            .setRestitution(0.1) // Bounciness
            .setFriction(0.7)    // Friction against surfaces
            .setDensity(1.0);
        this.collider = this.physicsWorld.createCollider(colliderDesc, this.physicsBody);
        
        // Store player ID on collider for raycasting identification
        this.collider.userData = { type: 'player', id: this.id, object: this };

        this.resetToSpawn(spawnPoint);
        this.uiManager.updateHealth(this.health);

        // Setup camera to follow player (first-person)
        this.camera.position.set(spawnPoint.x, spawnPoint.y + this.playerHeight * 0.8, spawnPoint.z); // Eye level
        this.model.add(this.camera); // Attach camera to player model for third person, or position relative for first person
        this.camera.position.set(0, this.playerHeight * 0.8, 0.1); // Offset for first-person view from model center
        
        // For true first person, hide local player's own model or parts of it
        // this.model.visible = false; // Simplest way to hide own model for FPS
        // Or selectively hide parts:
        this.model.traverse(child => {
            if (child.isMesh) { // Only make meshes invisible, not lights or cameras attached
                 // child.visible = false; // Hides full body
                 // Alternatively, use layers to not render for main camera
                 // child.layers.set(1); // Assign to a layer that the main camera doesn't render
            }
        });
        if (this.gunModel) this.gunModel.visible = true; // Ensure gun is visible

        // Initial network update
        this.sendStateToServer();
    }
    
    setupControls() {
        document.addEventListener('keydown', this.onKeyDown.bind(this));
        document.addEventListener('keyup', this.onKeyUp.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('mousedown', this.onMouseDown.bind(this));
    }

    onKeyDown(event) {
        if (this.isChatting) return;
        this.keys[event.code] = true;

        switch (event.code) {
            case 'KeyW': this.movement.forward = 1; break;
            case 'KeyS': this.movement.backward = 1; break;
            case 'KeyA': this.movement.left = 1; break;
            case 'KeyD': this.movement.right = 1; break;
            case 'Space': if (!this.isJumping && this.isOnGround()) this.jump(); break;
            case 'ShiftLeft': if (this.canDash && !this.isDashing) this.dash(); break;
        }
    }

    onKeyUp(event) {
        this.keys[event.code] = false;
        switch (event.code) {
            case 'KeyW': this.movement.forward = 0; break;
            case 'KeyS': this.movement.backward = 0; break;
            case 'KeyA': this.movement.left = 0; break;
            case 'KeyD': this.movement.right = 0; break;
        }
    }
    
    onMouseMove(event) {
        if (document.pointerLockElement === document.body && !this.isChatting) {
            this.euler.setFromQuaternion(this.model.quaternion); // Get current model Y rotation

            this.euler.y -= event.movementX * 0.002; // Yaw (around Y axis for model)
            this.euler.x -= event.movementY * 0.002; // Pitch (around X axis for camera)

            this.euler.x = Math.max(Math.PI / 2 - this.maxPolarAngle, Math.min(Math.PI / 2 - this.minPolarAngle, this.euler.x));
            
            this.model.quaternion.setFromEuler(new THREE.Euler(0, this.euler.y, 0, 'YXZ')); // Apply Yaw to model
            this.camera.quaternion.setFromEuler(new THREE.Euler(this.euler.x, 0, 0, 'YXZ')); // Apply Pitch to camera relative to model
        }
    }

    onMouseDown(event) {
        if (document.pointerLockElement !== document.body) {
            document.body.requestPointerLock();
        } else if (!this.isChatting && event.button === 0) { // Left mouse button
            this.shoot();
        }
    }
    
    isOnGround() {
        if (!this.physicsBody || !this.collider) return false;
    
        const rayOrigin = this.physicsBody.translation();
        const rayDir = { x: 0, y: -1, z: 0 };
        // Check slightly below the capsule base
        const rayCastDistance = this.playerHeight / 2 - this.playerRadius + 0.1; 
    
        const ray = new this.RAPIER.Ray(rayOrigin, rayDir);
        const maxToi = rayCastDistance; // Max distance to check
        const solid = true; // Check against solid objects
    
        // Exclude self collider from raycast
        const filterFlags = this.RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC; // Example filter, might need adjustment
        const filterGroups = undefined; // Or set up collision groups
        const filterExcludeCollider = this.collider;
    
        const hit = this.physicsWorld.castRay(
            ray, 
            maxToi, 
            solid
            // Potentially add filter parameters if available in your Rapier version/bindings
            // queryFilterFlags?: QueryFilterFlags,
            // queryFilterGroups?: InteractionGroups,
            // queryFilterExcludeCollider?: Collider,
            // queryFilterExcludeRigidBody?: RigidBody,
            // queryFilterPredicate?: (collider: Collider) => boolean
        );
        return hit !== null;
    }

    jump() {
        if (this.isOnGround()) {
            this.isJumping = true; // State flag, actual jump by impulse
            const impulse = { x: 0, y: PLAYER_JUMP_VELOCITY, z: 0 };
            this.physicsBody.applyImpulse(impulse, true);
            // After applying impulse, Rapier handles gravity. isJumping used to prevent double jumps.
            // isJumping state can be reset when isOnGround() is true again after a jump.
            setTimeout(() => { this.isJumping = false; }, 500); // Simple cooldown for jump flag
        }
    }

    dash() {
        this.isDashing = true;
        this.canDash = false; // Prevent dashing again immediately
        this.networkManager.sendDash(); // Notify server (for effects on other clients or validation)

        const dashDirection = new THREE.Vector3();
        const forward = new THREE.Vector3(0,0,-1).applyQuaternion(this.model.quaternion);
        const right = new THREE.Vector3(1,0,0).applyQuaternion(this.model.quaternion);

        if (this.movement.forward) dashDirection.add(forward);
        if (this.movement.backward) dashDirection.sub(forward);
        if (this.movement.left) dashDirection.sub(right);
        if (this.movement.right) dashDirection.add(right);

        if (dashDirection.lengthSq() === 0) { // No direction pressed, dash forward
            dashDirection.copy(forward);
        }
        dashDirection.normalize();
        dashDirection.multiplyScalar(PLAYER_DASH_SPEED);

        this.physicsBody.setLinvel({x: dashDirection.x, y: this.physicsBody.linvel().y, z: dashDirection.z}, true); // Maintain Y velocity

        if (this.dashTimeout) clearTimeout(this.dashTimeout);
        this.dashTimeout = setTimeout(() => {
            this.isDashing = false;
            // Restore normal speed influence if needed, or let damping handle it
        }, PLAYER_DASH_DURATION);

        if (this.dashCooldownTimeout) clearTimeout(this.dashCooldownTimeout);
        this.dashCooldownTimeout = setTimeout(() => {
            this.canDash = true;
        }, 1000); // 1 second dash cooldown
    }

    shoot() {
        const now = Date.now();
        if (now - this.lastShotTime < PLAYER_SHOOT_COOLDOWN || this.health <=0) return;
        this.lastShotTime = now;

        if (this.gunshotSound.isPlaying) this.gunshotSound.stop();
        this.gunshotSound.play();

        this.isShooting = true;
        if(this.shootAnimationTimeout) clearTimeout(this.shootAnimationTimeout);
        this.shootAnimationTimeout = setTimeout(() => this.isShooting = false, 150);


        const E_pressed = this.keys['KeyE'] === true;

        // Raycast from camera center
        const raycaster = new THREE.Raycaster();
        const cameraDirection = new THREE.Vector3();
        this.camera.getWorldDirection(cameraDirection);
        
        // Use camera position for ray origin for better FPS aiming
        const rayOrigin = new THREE.Vector3();
        this.camera.getWorldPosition(rayOrigin);
        
        raycaster.set(rayOrigin, cameraDirection);

        this.networkManager.sendShoot(cameraDirection, E_pressed); // Send to server

        if (E_pressed) {
            this.applyGunPropulsion(cameraDirection);
        }

        // Client-side hit detection (prediction)
        // This is for immediate feedback. Server will confirm hits.
        const intersects = [];
        this.physicsWorld.castRay(
            new this.RAPIER.Ray(rayOrigin, cameraDirection),
            1000, // Max distance
            true, // Query solid colliders
            this.RAPIER.QueryFilterFlags.EXCLUDE_FIXED | this.RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC, // Hit only dynamic bodies (players)
            undefined, // groups
            this.collider, // exclude self
            null, // rigidBody, (Rapier will set this if hit)
            (hitCollider) => { // Callback for each hit
                if (hitCollider.userData && hitCollider.userData.type === 'player' && hitCollider.userData.id !== this.id) {
                    // Check if this collider belongs to a known remote player
                    const game = this.networkManager.gameManager; // Access game manager
                    if (game && game.remotePlayers[hitCollider.userData.id]) {
                         intersects.push({
                            distance: 0, // Rapier's castRay doesn't directly give distance in this callback, but gives collider.
                                         // For simple check, we just know it hit.
                            object: { userData: hitCollider.userData } // Mock THREE.js intersect object
                        });
                        return false; // Stop at first player hit
                    }
                }
                return true; // Continue raycast
            }
        );


        if (intersects.length > 0) {
            const hit = intersects[0]; // Closest hit (if sorted, or first if stopAtFirstHit)
            if (hit.object.userData && hit.object.userData.type === 'player') {
                const victimId = hit.object.userData.id;
                console.log(`Client-side raycast hit player: ${victimId}`);
                // Send hit confirmation to server
                this.networkManager.sendPlayerHit(victimId, 25); // Example damage
            }
        }
    }
    
    applyGunPropulsion(shotDirection) {
        if (!this.physicsBody) return;
        const propulsionForce = new THREE.Vector3().copy(shotDirection).negate().multiplyScalar(GUN_PROPULSION_FORCE);
        this.physicsBody.applyImpulse({ x: propulsionForce.x, y: propulsionForce.y, z: propulsionForce.z }, true);
        console.log("Applied gun propulsion");
    }
    
    applyShockwave(originPosition, strength) {
        if (!this.physicsBody || this.health <= 0) return;

        const currentPos = this.physicsBody.translation();
        const direction = new THREE.Vector3(currentPos.x - originPosition.x, currentPos.y - originPosition.y, currentPos.z - originPosition.z);
        
        const distance = direction.length();
        if (distance === 0 || distance > 15) return; // Max shockwave radius 15 units

        const forceMagnitude = strength * (1 - distance / 15); // Force decreases with distance
        direction.normalize().multiplyScalar(forceMagnitude);

        this.physicsBody.applyImpulse({x: direction.x, y: direction.y, z: direction.z}, true);
        console.log(`Player ${this.id} affected by shockwave`);
    }


    update(deltaTime) {
        if (!this.physicsBody || this.health <= 0 || this.isChatting) {
             if (this.physicsBody && this.health <=0) { // If dead, stop movement
                this.physicsBody.setLinvel({ x: 0, y: this.physicsBody.linvel().y, z: 0 }, true); // Stop XZ movement, let Y be affected by gravity
            }
            return;
        }

        const speed = this.isDashing ? 0 : PLAYER_MOVE_SPEED; // Dashing overrides regular movement impulses for its duration

        const moveDirection = new THREE.Vector3();
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.model.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.model.quaternion);

        if (this.movement.forward) moveDirection.add(forward);
        if (this.movement.backward) moveDirection.sub(forward);
        if (this.movement.left) moveDirection.sub(right);
        if (this.movement.right) moveDirection.add(right);
        
        moveDirection.normalize().multiplyScalar(speed * deltaTime * 50); // Multiply by some factor as impulse is different from setting velocity directly


        // Apply movement as impulse or by setting velocity
        // Setting linvel directly gives more responsive control for players
        const currentLinvel = this.physicsBody.linvel();
        // Preserve Y velocity (gravity, jump), change XZ
        this.physicsBody.setLinvel({ x: moveDirection.x, y: currentLinvel.y, z: moveDirection.z }, true);

        // Sync Three.js model with physics body
        const bodyPosition = this.physicsBody.translation();
        this.model.position.set(bodyPosition.x, bodyPosition.y - (this.playerHeight/2 - this.playerRadius), bodyPosition.z); // Adjust for capsule center vs model base
        // Rotation is handled by mouse look for the model, physics body rotation might be locked or handled differently
        // this.model.quaternion.copy(this.physicsBody.rotation()); // If physics body rotation is used

        // Check if fallen off map (this is also checked server-side but good for client feedback)
        if (bodyPosition.y < (this.networkManager.gameManager.gameSettings.VOID_Y_THRESHOLD || -50) && this.health > 0) {
            // Already handled by server sending playerUpdate. Client could show "falling" state.
        }

        // Reset jump flag if on ground
        if (this.isOnGround() && this.physicsBody.linvel().y <= 0.1) { // Small threshold for Y velocity
            this.isJumping = false;
        }
        
        this.sendStateToServer();
    }
    
    sendStateToServer() {
        // Send updates to server periodically
        if (this.networkManager && this.physicsBody) {
            const pos = this.physicsBody.translation();
            const rot = this.model.quaternion; // Send visual rotation
            const vel = this.physicsBody.linvel();
            this.networkManager.sendPlayerUpdate(
                { x: pos.x, y: pos.y, z: pos.z },
                { x: rot.x, y: rot.y, z: rot.z, w: rot.w },
                { x: vel.x, y: vel.y, z: vel.z },
                this.isDashing,
                this.isShooting
            );
        }
    }

    takeDamage(amount) {
        this.health -= amount;
        this.uiManager.updateHealth(this.health);
        if (this.health <= 0) {
            this.health = 0;
            // Death handling is primarily server-driven via 'playerDied' event
            console.log("Local player died (client-side health update)");
        }
    }

    resetToSpawn(spawnPoint) {
        this.health = 100;
        this.uiManager.updateHealth(this.health);
        if (this.physicsBody) {
            this.physicsBody.setTranslation(spawnPoint, true);
            this.physicsBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
            this.physicsBody.setAngvel({ x: 0, y: 0, z: 0 }, true); // Reset angular velocity
        }
        this.model.position.set(spawnPoint.x, spawnPoint.y - (this.playerHeight/2 - this.playerRadius), spawnPoint.z);
        this.model.rotation.y = Math.random() * Math.PI * 2; // Random initial facing direction
        this.camera.rotation.x = 0; // Reset camera pitch

        // Reset movement states
        this.movement = { forward: 0, backward: 0, left: 0, right: 0 };
        this.isJumping = false;
        this.isDashing = false;
        this.canDash = true;
        this.isShooting = false;
    }
    
    dispose() {
        if (this.model) this.scene.remove(this.model);
        if (this.gunModel && this.model) this.model.remove(this.gunModel); // If attached
        else if (this.gunModel) this.scene.remove(this.gunModel); // If separate
        
        if (this.physicsBody) this.physicsWorld.removeRigidBody(this.physicsBody);
        // Collider is removed with rigid body automatically in Rapier

        document.removeEventListener('keydown', this.onKeyDown);
        document.removeEventListener('keyup', this.onKeyUp);
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mousedown', this.onMouseDown);
        if (this.gunshotSound && this.gunshotSound.isPlaying) this.gunshotSound.stop();

        clearTimeout(this.dashTimeout);
        clearTimeout(this.dashCooldownTimeout);
        clearTimeout(this.shootAnimationTimeout);
        console.log(`Player ${this.id} disposed.`);
    }
}

// Helper class for remote players
export class RemotePlayer {
    constructor(id, name, characterData, scene, assets, physicsWorld, RAPIER_INSTANCE) {
        this.id = id;
        this.name = name; // Store name for leaderboard/UI
        this.scene = scene;
        this.assets = assets;
        this.physicsWorld = physicsWorld;
        this.RAPIER = RAPIER_INSTANCE;

        this.model = null;
        this.gunModel = null;
        this.physicsBody = null; // For collision (kinematic or static for remote)
        this.collider = null;

        this.targetPosition = new THREE.Vector3();
        this.targetQuaternion = new THREE.Quaternion();
        this.targetVelocity = new THREE.Vector3(); // For potential dead reckoning / animation
        this.isDashing = false;
        this.isShooting = false;
        this.shootAnimationTimeout = null;


        this.playerHeight = 1.8; 
        this.playerRadius = 0.4;

        // Load model based on characterData.modelPath
        const playerAsset = this.assets.playerModel; // Assuming one player model for now
        if (!playerAsset) {
            console.error("Remote Player model asset not found!");
            return;
        }
        this.model = playerAsset.scene.clone();
        this.model.scale.set(1,1,1); // Adjust scale
        this.model.name = `player_${id}`;
        this.scene.add(this.model);

        // Attach gun model (similar to local player)
        const gunAsset = this.assets.gunModel;
        if (gunAsset) {
            this.gunModel = gunAsset.scene.clone();
            this.gunModel.scale.set(0.2, 0.2, 0.2);
            // this.model.getObjectByName("mixamorigRightHand")?.add(this.gunModel) || this.model.add(this.gunModel);
            this.model.add(this.gunModel);
            this.gunModel.position.set(0.3, this.playerHeight * 0.6, 0.5);
            this.gunModel.rotation.y = Math.PI / 2;
        }

        // Create a Rapier collider for raycasting against (kinematic or static)
        // For simplicity, remote players won't have full dynamic bodies on other clients
        // to avoid complex synchronization. A kinematic body is better.
        const rigidBodyDesc = this.RAPIER.RigidBodyDesc.kinematicPositionBased();
        this.physicsBody = this.physicsWorld.createRigidBody(rigidBodyDesc);
        
        const colliderDesc = this.RAPIER.ColliderDesc.capsuleY(this.playerHeight / 2 - this.playerRadius, this.playerRadius)
            .setSensor(false); // Make it a sensor if it shouldn't physically block local player, or true if it should
        this.collider = this.physicsWorld.createCollider(colliderDesc, this.physicsBody);
        this.collider.userData = { type: 'player', id: this.id, object: this }; // For raycasting identification
        
        this.health = 100; // Track health for effects perhaps, server is authoritative
    }

    updateState(data) { // data: { position, rotation, velocity, isDashing, isShooting }
        this.targetPosition.set(data.position.x, data.position.y, data.position.z);
        this.targetQuaternion.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.w);
        if (data.velocity) this.targetVelocity.set(data.velocity.x, data.velocity.y, data.velocity.z);
        this.isDashing = data.isDashing;
        
        if (data.isShooting && !this.isShooting) { // Start shoot animation
            this.isShooting = true;
            if(this.shootAnimationTimeout) clearTimeout(this.shootAnimationTimeout);
            this.shootAnimationTimeout = setTimeout(() => this.isShooting = false, 150);
        } else if (!data.isShooting && this.isShooting) { // Explicitly stop if server says so
             this.isShooting = false;
        }
    }

    interpolate(deltaTime) {
        if (!this.model || !this.physicsBody) return;

        // Interpolate visual model
        const adjustedTargetY = this.targetPosition.y - (this.playerHeight/2 - this.playerRadius);
        this.model.position.lerp(new THREE.Vector3(this.targetPosition.x, adjustedTargetY, this.targetPosition.z), 0.2); // Adjust lerp factor
        this.model.quaternion.slerp(this.targetQuaternion, 0.2);

        // Update kinematic physics body for collision detection by local player's raycasts
        this.physicsBody.setNextKinematicTranslation(this.targetPosition);
        // Potentially set rotation if needed for more accurate hitboxes
        // this.physicsBody.setNextKinematicRotation(this.targetQuaternion);
        
        // TODO: Update animations based on isDashing, isShooting, velocity
    }
    
    applyShockwave(originPosition, strength) {
        // Remote players are not physically simulated on client, but could show visual effect
        console.log(`Remote player ${this.id} would visually react to shockwave.`);
    }

    dispose() {
        if (this.model) this.scene.remove(this.model);
        if (this.gunModel && this.model) this.model.remove(this.gunModel);
        else if (this.gunModel) this.scene.remove(this.gunModel);

        if (this.physicsBody) this.physicsWorld.removeRigidBody(this.physicsBody);
        clearTimeout(this.shootAnimationTimeout);
        console.log(`Remote player ${this.id} disposed.`);
    }
}
