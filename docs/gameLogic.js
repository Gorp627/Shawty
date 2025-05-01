// Docs/gameLogic.js
// Manual Raycasting v6 - Simplified Collision (Fixed: Removed duplicate const)

// REMOVE OR COMMENT OUT THIS LINE:
// const PLAYER_RADIUS = 0.4; // <--- REMOVE THIS LINE

// Assuming THREE is global
// import * as THREE from 'three';

console.log('gameLogic.js loaded (Manual Raycasting v6 - Simplified Collision)');

class GameLogic {
    constructor(game) {
        this.game = game; // Reference to the main game instance
        this.gravity = new THREE.Vector3(0, -25.0, 0); // Default gravity
        this.tempVector = new THREE.Vector3(); // For temporary calculations
        this.collisionRaycaster = new THREE.Raycaster();
        this.groundCheckRaycaster = new THREE.Raycaster();

        // Configuration (can be overridden by game config)
        this.config = {
            friction: 0.90,
            airFriction: 0.98,
            groundCheckDistance: 0.2, // How far below the player base to check for ground
            collisionSkinWidth: 0.05, // Small buffer for collision checks
            slideThreshold: 0.707, // Cosine of the angle (approx 45 degrees) - steeper slopes aren't "ground"
            maxSpeed: 15.0, // Max horizontal speed clamp
             // Player dimensions needed for raycasting offsets
             playerHeight: 1.8, // Match PlayerEntity
             playerRadius: 0.4, // Match PlayerEntity
            ... (game.config?.physics || {}) // Merge overrides from game config if present
        };

         console.log("[GameLogic] Initialized. Config:", this.config);
    }

    initializePhysicsState(playerEntity) {
         // Set initial physics properties if needed
         playerEntity.isOnGround = false;
         playerEntity.velocity = new THREE.Vector3(0, 0, 0);
         console.log(`[GameLogic] Initialized physics state for ${playerEntity.id}`);
    }


    update(deltaTime, entities, mapMesh) {
        // Might not be needed if physics is driven by player update calling applyPhysicsAndCollision
         // console.log('[DEBUG GameLogic] Update Tick');

        // Example: Update projectiles or other physics-driven objects here if any
        // entities.forEach(entity => {
        //     if (entity instanceof Projectile) { // Assuming a Projectile class exists
        //         this.applyProjectilePhysics(entity, deltaTime, mapMesh, entities);
        //     }
        // });
    }

    applyPhysicsAndCollision(player, dt) {
        // --- DEBUG: Physics Step Start ---
        // console.log(`[DEBUG Physics ${player.id}] Start | Pos: ${player.position.toArray().map(v=>v.toFixed(2))} | Vel: ${player.velocity.toArray().map(v=>v.toFixed(2))} | OnGround: ${player.isOnGround}`);
        // ---

        const mapMesh = this.game.mapMesh; // Get map mesh reference

        // 1. Apply Gravity
        player.velocity.addScaledVector(this.gravity, dt);

        // 2. Apply Friction (based on ground state)
        const currentFriction = player.isOnGround ? this.config.friction : this.config.airFriction;
        player.velocity.x *= currentFriction; // Apply friction only on XZ plane
        player.velocity.z *= currentFriction;

        // 3. Check for Ground Collision (Vertical Raycast)
        this.checkGround(player, mapMesh); // Updates player.isOnGround

        // 4. Horizontal Collision Detection & Response (before moving)
        this.handleHorizontalCollisions(player, dt, mapMesh); // Adjusts velocity based on potential collisions

        // 5. Vertical Collision & Response (after horizontal adjustment, handles landing/bonking head)
         this.handleVerticalCollisions(player, dt, mapMesh); // Adjusts velocity.y and potentially position

        // 6. Clamp Speed (optional, prevents excessive speeds)
         const horizontalSpeedSq = player.velocity.x * player.velocity.x + player.velocity.z * player.velocity.z;
         if (horizontalSpeedSq > this.config.maxSpeed * this.config.maxSpeed) {
             const horizontalSpeed = Math.sqrt(horizontalSpeedSq);
             const scale = this.config.maxSpeed / horizontalSpeed;
             player.velocity.x *= scale;
             player.velocity.z *= scale;
             // console.log(`[DEBUG Physics ${player.id}] Clamped speed`);
         }

        // 7. Update Position based on FINAL velocity
        player.position.addScaledVector(player.velocity, dt);

        // --- DEBUG: Physics Step End ---
        // console.log(`[DEBUG Physics ${player.id}] End | Pos: ${player.position.toArray().map(v=>v.toFixed(2))} | Vel: ${player.velocity.toArray().map(v=>v.toFixed(2))} | OnGround: ${player.isOnGround}`);
        // ---
    }

    checkGround(player, mapMesh) {
        if (!mapMesh) {
             player.isOnGround = false; // Can't be on ground if no map exists
             // console.warn("[DEBUG Physics] checkGround: No map mesh provided.");
             return;
        }

        // Raycast downwards from slightly above the player's base
        const rayOrigin = this.tempVector.copy(player.position);
        rayOrigin.y += this.config.groundCheckDistance * 0.5; // Start slightly above base
        const rayDirection = new THREE.Vector3(0, -1, 0);
        const maxDistance = this.config.groundCheckDistance + this.config.collisionSkinWidth; // Check slightly below base

        this.groundCheckRaycaster.set(rayOrigin, rayDirection);
        this.groundCheckRaycaster.far = maxDistance;

        const collisionObjects = [mapMesh]; // Add other collidable entities if needed
        const intersects = this.groundCheckRaycaster.intersectObjects(collisionObjects, true); // Check recursively

        let foundGround = false;
        if (intersects.length > 0) {
            const nearestHit = intersects[0];

            // Check if the surface normal is flat enough to be considered "ground"
            if (nearestHit.face && nearestHit.face.normal.y >= this.config.slideThreshold) {
                 foundGround = true;
                 // Snap player to ground if they are penetrating slightly or very close
                 const penetrationDepth = maxDistance - nearestHit.distance;
                 if (penetrationDepth > -this.config.collisionSkinWidth * 2) { // Allow snapping up slightly too
                      player.position.y += penetrationDepth;
                      player.velocity.y = Math.max(0, player.velocity.y); // Stop downward velocity on landing
                     // console.log(`[DEBUG Physics ${player.id}] Snapped to ground. Depth: ${penetrationDepth.toFixed(3)}`);
                 } else {
                    // console.log(`[DEBUG Physics ${player.id}] Ground detected below.`);
                 }
            } else {
                 // console.log(`[DEBUG Physics ${player.id}] Hit steep slope, not ground. NormalY: ${nearestHit.face?.normal.y.toFixed(2)}`);
            }
        } else {
            // console.log(`[DEBUG Physics ${player.id}] No ground detected below.`);
        }

        if (player.isOnGround !== foundGround) {
             console.log(`[DEBUG Physics ${player.id}] isOnGround changed to: ${foundGround}`);
        }
         player.isOnGround = foundGround;

    }

    handleHorizontalCollisions(player, dt, mapMesh) {
         if (!mapMesh || (player.velocity.x === 0 && player.velocity.z === 0)) {
             // No horizontal movement or no map, skip check
             return;
         }

        const currentPos = player.position;
        const horizontalVel = this.tempVector.set(player.velocity.x, 0, player.velocity.z);
        const desiredMovement = horizontalVel.clone().multiplyScalar(dt);
        const moveDistance = desiredMovement.length();

         if (moveDistance < 0.001) return; // Negligible movement

        const moveDirection = desiredMovement.normalize();

        // Raycast from player center in the direction of movement
        // Adjust ray origin slightly based on player radius? Simpler for now: center.
        const rayOrigin = new THREE.Vector3(currentPos.x, currentPos.y + this.config.playerHeight * 0.5, currentPos.z); // Ray from approx center mass

        this.collisionRaycaster.set(rayOrigin, moveDirection);
        // Check distance + radius + skin width
        this.collisionRaycaster.far = moveDistance + this.config.playerRadius + this.config.collisionSkinWidth;

        const collisionObjects = [mapMesh]; // Add other players later?
        const intersects = this.collisionRaycaster.intersectObjects(collisionObjects, true);

        if (intersects.length > 0) {
            const nearestHit = intersects[0];
            // Calculate how far the player *can* move before hitting
            const allowedDistance = Math.max(0, nearestHit.distance - this.config.playerRadius - this.config.collisionSkinWidth);

            // Project velocity onto the collision normal (the part of velocity moving *into* the wall)
            const collisionNormal = nearestHit.face.normal;
            const velocityIntoWall = player.velocity.dot(collisionNormal);

            if (velocityIntoWall < 0) { // Only react if moving towards the wall
                // Remove the velocity component pointing into the wall
                const rejectionForce = collisionNormal.clone().multiplyScalar(-velocityIntoWall * 1.05); // * 1.05 to prevent sticking
                 player.velocity.add(rejectionForce); // Modify velocity directly

                // Allow movement up to the collision point
                 // Optional: Adjust position precisely? More complex. Stopping velocity is simpler.
                 // player.position.addScaledVector(moveDirection, allowedDistance); // Move partially

                 console.log(`[DEBUG Physics ${player.id}] Horizontal collision! Normal: ${collisionNormal.toArray().map(v=>v.toFixed(2))}. Vel adjusted.`);
            }
        }
        // If no intersection, velocity remains unchanged by this function
    }


     handleVerticalCollisions(player, dt, mapMesh) {
         if (!mapMesh || player.velocity.y === 0) {
             return; // No vertical movement or map
         }

         const isMovingUp = player.velocity.y > 0;
         const verticalVel = player.velocity.y;
         const desiredMovement = verticalVel * dt;
         const moveDistance = Math.abs(desiredMovement);
         const moveDirection = isMovingUp ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, -1, 0);

         // Raycast origin depends on direction
         const rayOrigin = player.position.clone();
         let checkDistance = 0;

         if (isMovingUp) {
             rayOrigin.y += this.config.playerHeight - this.config.collisionSkinWidth; // Ray from near the top
             checkDistance = moveDistance + this.config.collisionSkinWidth * 2;
         } else { // Moving Down (redundant with checkGround, but useful if ground check is different)
             rayOrigin.y += this.config.collisionSkinWidth; // Ray from near the bottom
             checkDistance = moveDistance + this.config.collisionSkinWidth * 2;
             // Note: checkGround already handles landing response better.
             // This might primarily catch fast falls through thin floors if ground check fails.
             // For now, rely on checkGround for landing.
             if (!isMovingUp) return; // Let checkGround handle downward movement/landing
         }


        this.collisionRaycaster.set(rayOrigin, moveDirection);
        this.collisionRaycaster.far = checkDistance;

        const collisionObjects = [mapMesh];
        const intersects = this.collisionRaycaster.intersectObjects(collisionObjects, true);

         if (intersects.length > 0) {
             const nearestHit = intersects[0];
             const penetration = checkDistance - nearestHit.distance;

             if (isMovingUp && penetration > 0) {
                 console.log(`[DEBUG Physics ${player.id}] Vertical collision (Head Bonk!)`);
                 // Hit something above
                 player.position.y -= penetration; // Adjust position back
                 player.velocity.y = 0; // Stop upward velocity
             }
             // Downward case handled by checkGround snapping
         }
     }

}

// Make available globally or manage via modules
window.GameLogic = GameLogic;

console.log('[GameLogic] Class defined.');
