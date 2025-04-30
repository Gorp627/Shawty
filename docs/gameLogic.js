// --- START OF FULL gameLogic.js FILE (Manual Raycasting v1) ---
// docs/gameLogic.js (Manual Raycasting v1 - Movement & Collision)

// Accesses globals: players, localPlayerId, CONFIG, THREE, Network, Input, UIManager, stateMachine, Effects, scene, mapMesh, playerVelocities, playerIsGrounded

// --- Constants ---
// Get constants from CONFIG, provide defaults if needed
const GRAVITY = CONFIG?.GRAVITY_ACCELERATION ?? 28.0;
const JUMP_VELOCITY = CONFIG?.JUMP_INITIAL_VELOCITY ?? 9.0;
const DASH_VELOCITY = CONFIG?.DASH_VELOCITY_MAGNITUDE ?? 15.0;
const DASH_UP_FACTOR = CONFIG?.DASH_UP_FACTOR ?? 0.15;
const GROUND_CHECK_DIST = CONFIG?.GROUND_CHECK_DISTANCE ?? 0.25;
const COLLISION_CHECK_DIST = CONFIG?.COLLISION_CHECK_DISTANCE ?? 0.6;
const PLAYER_RADIUS = CONFIG?.PLAYER_RADIUS ?? 0.4;
const PLAYER_HEIGHT = CONFIG?.PLAYER_HEIGHT ?? 1.8;
const PLAYER_FEET_OFFSET = PLAYER_HEIGHT / 2.0; // Offset from center to feet
const PLAYER_CENTER_OFFSET = PLAYER_HEIGHT / 2.0; // Offset from feet to center
const STEP_HEIGHT = CONFIG?.PLAYER_STEP_HEIGHT ?? 0.3;

const SHOOT_COOLDOWN_MS = CONFIG?.SHOOT_COOLDOWN ?? 150;
const BULLET_DMG = CONFIG?.BULLET_DAMAGE ?? 25;
const BULLET_MAX_RANGE = CONFIG?.BULLET_RANGE ?? 300;
const ROCKET_JUMP_VEL = CONFIG?.ROCKET_JUMP_VELOCITY ?? 12.0;
const ROCKET_JUMP_THRESH = CONFIG?.ROCKET_JUMP_ANGLE_THRESHOLD ?? -0.7;
const DEATH_SHOCKWAVE_VEL = CONFIG?.DEATH_SHOCKWAVE_VELOCITY ?? 18.0;
const DEATH_SHOCKWAVE_RADIUS = CONFIG?.DEATH_EXPLOSION_RADIUS ?? 15.0;

const tempVec = new THREE.Vector3(); // Reusable vector for calculations
const tempVec2 = new THREE.Vector3(); // Another reusable vector
const tempRaycaster = new THREE.Raycaster();

/**
 * Updates the local player's state (velocity, grounded status) based on input.
 * Does NOT directly modify position - that happens in game.js after collision checks.
 * @param {number} deltaTime Time since last frame.
 * @param {THREE.PerspectiveCamera} camera Reference to the main camera.
 * @param {THREE.Object3D} localPlayerMesh Reference to the local player's visual mesh.
 */
function updateLocalPlayerInput(deltaTime, camera, localPlayerMesh) {
    const localPlayer = players[localPlayerId];
    if (!localPlayer || !localPlayerId || !localPlayerMesh || !playerVelocities[localPlayerId]) return;

    const isPlaying = stateMachine?.is('playing');
    const isLocked = controls?.isLocked;
    if (!isPlaying || !isLocked || localPlayer.health <= 0) {
        // If not playing, locked, or dead, gradually stop movement
        playerVelocities[localPlayerId].x *= 0.9; // Apply damping
        playerVelocities[localPlayerId].z *= 0.9;
        if (Math.abs(playerVelocities[localPlayerId].x) < 0.1) playerVelocities[localPlayerId].x = 0;
        if (Math.abs(playerVelocities[localPlayerId].z) < 0.1) playerVelocities[localPlayerId].z = 0;
        return;
    }

    const currentVel = playerVelocities[localPlayerId];
    const isGrounded = playerIsGrounded[localPlayerId];

    // --- Horizontal Movement ---
    const moveSpeed = Input.keys['ShiftLeft'] ? (CONFIG?.MOVEMENT_SPEED_SPRINTING ?? 10.5) : (CONFIG?.MOVEMENT_SPEED ?? 7.0);
    const forward = tempVec.set(0, 0, -1).applyQuaternion(camera.quaternion); forward.y = 0; forward.normalize();
    const right = tempVec2.set(1, 0, 0).applyQuaternion(camera.quaternion); right.y = 0; right.normalize();
    let moveDirectionX = 0;
    let moveDirectionZ = 0;

    if (Input.keys['KeyW']) { moveDirectionX += forward.x; moveDirectionZ += forward.z; }
    if (Input.keys['KeyS']) { moveDirectionX -= forward.x; moveDirectionZ -= forward.z; }
    if (Input.keys['KeyA']) { moveDirectionX -= right.x; moveDirectionZ -= right.z; } // Corrected A/D
    if (Input.keys['KeyD']) { moveDirectionX += right.x; moveDirectionZ += right.z; } // Corrected A/D

    // Normalize diagonal movement
    const inputLengthSq = moveDirectionX * moveDirectionX + moveDirectionZ * moveDirectionZ;
    if (inputLengthSq > 1.0) {
        const inputLength = Math.sqrt(inputLengthSq);
        moveDirectionX /= inputLength;
        moveDirectionZ /= inputLength;
    }

    const targetVelocityX = moveDirectionX * moveSpeed;
    const targetVelocityZ = moveDirectionZ * moveSpeed;

    // Apply horizontal velocity (approach target, allow air control slightly reduced)
    const accelFactor = isGrounded ? 0.2 : 0.08; // Faster acceleration on ground
    currentVel.x = THREE.MathUtils.lerp(currentVel.x, targetVelocityX, accelFactor);
    currentVel.z = THREE.MathUtils.lerp(currentVel.z, targetVelocityZ, accelFactor);

    // --- Apply Gravity ---
    if (!isGrounded) {
        currentVel.y -= GRAVITY * deltaTime;
    } else {
        // Apply slight downward force when grounded to prevent bouncing on slopes
         if (currentVel.y > 0) currentVel.y = 0; // Stop upward movement instantly on ground
         currentVel.y = Math.max(currentVel.y, -GRAVITY * deltaTime * 2); // Prevent excessive downward force build-up
    }


    // --- Handle Jump ---
    if (Input.keys['Space'] && isGrounded) {
        currentVel.y = JUMP_VELOCITY; // Set initial jump velocity
        playerIsGrounded[localPlayerId] = false; // Immediately set to not grounded
        Input.keys['Space'] = false; // Consume jump input
        // console.log("[GameLogic Update] Applied Jump Velocity");
    }

    // --- Handle Dash ---
    if (Input.requestingDash) {
        // console.log("[GameLogic Update] Applying Dash Velocity");
        const dashDir = Input.dashDirection; // Already calculated world direction by Input.js
        currentVel.x += dashDir.x * DASH_VELOCITY;
        currentVel.z += dashDir.z * DASH_VELOCITY;
        // Add slight upward boost during dash, even if grounded
        currentVel.y = Math.max(currentVel.y + DASH_VELOCITY * DASH_UP_FACTOR, currentVel.y * 0.5); // Boost but don't fully overwrite vertical if falling fast
        playerIsGrounded[localPlayerId] = false; // Dash always makes player airborne briefly
        Input.requestingDash = false;
    }

    // --- Handle Shooting ---
    const now = Date.now();
    if (Input.mouseButtons[0] && now > (window.lastShootTime || 0) + SHOOT_COOLDOWN_MS) {
        // console.log("[GameLogic] Shoot condition met");
        window.lastShootTime = now;
        performShoot(camera); // Pass camera for direction
        Input.mouseButtons[0] = false;
    }

} // End updateLocalPlayerInput

/**
 * Performs collision detection and response for the local player.
 * Updates the player's position directly.
 * @param {THREE.Object3D} playerMesh The player's visual mesh.
 * @param {THREE.Vector3} playerVelocity The player's current velocity.
 * @param {number} deltaTime The frame time.
 * @returns {boolean} True if the player is grounded after the movement.
 */
function checkPlayerCollisionAndMove(playerMesh, playerVelocity, deltaTime) {
    if (!playerMesh || !playerVelocity || !mapMesh) {
        console.warn("Collision check skipped: Missing playerMesh, velocity, or mapMesh");
        return false;
    }

    const currentPosition = playerMesh.position; // Feet position
    const movementVector = tempVec.copy(playerVelocity).multiplyScalar(deltaTime);
    const targetPosition = tempVec2.copy(currentPosition).add(movementVector);

    let isGrounded = false;
    let finalPosition = targetPosition; // Start assuming no collision

    // --- Collision Objects ---
    // For now, only collide with the loaded map mesh
    const collisionObjects = [mapMesh];

    // --- Ground Check (Before Movement) ---
    // Raycast slightly below current feet position
    const groundRayOrigin = currentPosition.clone().add(new THREE.Vector3(0, PLAYER_CENTER_OFFSET, 0)); // Ray from player center
    const groundRayDirection = new THREE.Vector3(0, -1, 0);
    tempRaycaster.set(groundRayOrigin, groundRayDirection);
    tempRaycaster.far = PLAYER_CENTER_OFFSET + GROUND_CHECK_DIST; // Distance from center to slightly below feet

    const groundIntersects = tempRaycaster.intersectObjects(collisionObjects, true);
    const onGroundBeforeMove = groundIntersects.length > 0 && groundIntersects[0].distance <= (PLAYER_CENTER_OFFSET + GROUND_CHECK_DIST * 0.5);

    // --- Wall Collision Detection (Iterative approach) ---
    // Check X, Y, Z movement independently to handle sliding
    const iterations = 3; // More iterations = better sliding but more cost
    const stepMovement = movementVector.clone().divideScalar(iterations);

    let currentIterPos = currentPosition.clone();

    for (let i = 0; i < iterations; i++) {
        const stepTargetPosX = currentIterPos.clone().add(new THREE.Vector3(stepMovement.x, 0, 0));
        const stepTargetPosY = currentIterPos.clone().add(new THREE.Vector3(0, stepMovement.y, 0));
        const stepTargetPosZ = currentIterPos.clone().add(new THREE.Vector3(0, 0, stepMovement.z));

        // Check X movement
        if (Math.abs(stepMovement.x) > 0.001) {
            if (!checkWallCollision(currentIterPos, new THREE.Vector3(Math.sign(stepMovement.x), 0, 0), Math.abs(stepMovement.x), collisionObjects)) {
                currentIterPos.x = stepTargetPosX.x;
            } else {
                playerVelocity.x = 0; // Stop horizontal movement in this direction
                stepMovement.x = 0;   // Don't try moving further in X this frame
            }
        }

         // Check Y movement (Falling / Jumping)
        if (Math.abs(stepMovement.y) > 0.001) {
             const movingUp = stepMovement.y > 0;
             const yDir = movingUp ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, -1, 0);
             if (!checkCeilingFloorCollision(currentIterPos, yDir, Math.abs(stepMovement.y), movingUp, collisionObjects)) {
                currentIterPos.y = stepTargetPosY.y;
             } else {
                 // If hitting floor while moving down
                 if (!movingUp) {
                     isGrounded = true;
                     // Allow stepping up slightly? Handled by ground check below potentially
                 }
                 playerVelocity.y = 0; // Stop vertical movement
                 stepMovement.y = 0;
             }
        }


        // Check Z movement
        if (Math.abs(stepMovement.z) > 0.001) {
            if (!checkWallCollision(currentIterPos, new THREE.Vector3(0, 0, Math.sign(stepMovement.z)), Math.abs(stepMovement.z), collisionObjects)) {
                currentIterPos.z = stepTargetPosZ.z;
            } else {
                playerVelocity.z = 0; // Stop horizontal movement in this direction
                stepMovement.z = 0;   // Don't try moving further in Z this frame
            }
        }
    }
    finalPosition = currentIterPos;


    // --- Final Ground Check & Step Up ---
    // Cast ray downwards from the *final* potential position's center
    const finalGroundRayOrigin = finalPosition.clone().add(new THREE.Vector3(0, PLAYER_CENTER_OFFSET, 0));
    tempRaycaster.set(finalGroundRayOrigin, groundRayDirection);
    tempRaycaster.far = PLAYER_CENTER_OFFSET + STEP_HEIGHT + 0.05; // Check further down to allow stepping

    const finalGroundIntersects = tempRaycaster.intersectObjects(collisionObjects, true);

    if (finalGroundIntersects.length > 0) {
        const hitDistance = finalGroundIntersects[0].distance;
        const hitPointY = finalGroundRayOrigin.y - hitDistance;
        const targetFeetY = finalPosition.y; // Where feet *would* be without adjustment
        const groundThreshold = PLAYER_CENTER_OFFSET + GROUND_CHECK_DIST * 0.5; // Distance from center for grounding

         // Check if the ground is close enough to be considered grounded
        if (hitDistance <= groundThreshold) {
            isGrounded = true;
            finalPosition.y = hitPointY; // Snap feet exactly to ground
            if (playerVelocity.y < 0) playerVelocity.y = 0; // Stop downward velocity if grounded
        }
        // Check if we can step up (ground hit is above current feet but within step height)
        else if (hitPointY > currentPosition.y && hitPointY <= currentPosition.y + STEP_HEIGHT && onGroundBeforeMove) {
            // Allow stepping up only if we were grounded before the move
            isGrounded = true;
            finalPosition.y = hitPointY; // Step up onto the ledge
            if (playerVelocity.y < 0) playerVelocity.y = 0;
            // console.log("Stepped up!");
        } else {
            isGrounded = false; // Fell off edge or jumping
        }

    } else {
        isGrounded = false; // In the air
    }


    // Update the actual player mesh position
    playerMesh.position.copy(finalPosition);

    return isGrounded;
}

 /** Helper for Wall Collision Check */
function checkWallCollision(currentPosFeet, direction, distance, collisionObjects) {
    const checkOrigin = currentPosFeet.clone().add(new THREE.Vector3(0, PLAYER_CENTER_OFFSET, 0)); // Check from player center
    tempRaycaster.set(checkOrigin, direction);
    tempRaycaster.far = PLAYER_RADIUS + distance + 0.01; // Check slightly beyond movement distance

    const intersects = tempRaycaster.intersectObjects(collisionObjects, true);
    // Check if the closest hit is within the actual movement radius
    return intersects.length > 0 && intersects[0].distance <= (PLAYER_RADIUS + distance);
}
/** Helper for Ceiling/Floor Collision Check */
 function checkCeilingFloorCollision(currentPosFeet, direction, distance, movingUp, collisionObjects) {
     const offset = movingUp ? PLAYER_HEIGHT : 0; // Check from head if moving up, feet if moving down
     const checkOrigin = currentPosFeet.clone().add(new THREE.Vector3(0, offset, 0));
     tempRaycaster.set(checkOrigin, direction);
     tempRaycaster.far = distance + 0.01; // Check just beyond movement

     const intersects = tempRaycaster.intersectObjects(collisionObjects, true);
     return intersects.length > 0; // Any hit means collision
 }


/** Performs shooting logic: Raycast, send hit, trigger effects/rocket jump */
function performShoot(camera) {
    // console.log("[GameLogic] performShoot called");
    if (!camera || !Network || !scene) { /* ... guard ... */ return; }
    if (window.gunSoundBuffer) { Effects.playSound(window.gunSoundBuffer, null, false, 0.4); }
    // else { console.warn("[GameLogic] Gun sound buffer not loaded."); }

    // --- Raycast (Uses THREE.js raycaster still) ---
    const raycaster = new THREE.Raycaster();
    const origin = new THREE.Vector3(); const direction = new THREE.Vector3();
    camera.getWorldPosition(origin); camera.getWorldDirection(direction);
    raycaster.set(origin, direction); raycaster.far = BULLET_MAX_RANGE;

    // Potential targets: meshes of remote players
    const potentialTargets = [];
    for (const id in window.players) {
        if (id !== localPlayerId && window.players[id]?.mesh) {
            potentialTargets.push(window.players[id].mesh);
        }
    }
    // console.log(`[GameLogic] Raycasting from camera. Targets: ${potentialTargets.length}`);
    const intersects = raycaster.intersectObjects(potentialTargets, true); // Check recursively

    // Find the actual player hit (traverse up from intersected submesh if needed)
    let hitDetected = false;
    if (intersects.length > 0) {
        for (const hit of intersects) {
            let hitObject = hit.object;
            let hitPlayerId = null;
            // Traverse up the hierarchy to find the parent with player userData
            while (hitObject && !hitPlayerId) {
                if (hitObject.userData?.isPlayer && hitObject.userData?.entityId !== localPlayerId) {
                    hitPlayerId = hitObject.userData.entityId;
                }
                hitObject = hitObject.parent;
            }

            if (hitPlayerId) {
                console.log(`Hit player ${hitPlayerId} at distance ${hit.distance}`);
                Network.sendPlayerHit({ targetId: hitPlayerId, damage: BULLET_DMG });
                hitDetected = true;
                break; // Only register the first player hit
            }
        }
    }
    // console.log(`[GameLogic] Raycast hit detected: ${hitDetected}`);


    // --- Rocket Jump Logic (Apply velocity to local player) ---
    if (Input.keys['KeyC']) {
        const worldDown = new THREE.Vector3(0, -1, 0);
        const dotProduct = direction.dot(worldDown); // How much is the camera looking down?
        if (dotProduct < ROCKET_JUMP_THRESH) { // If looking down significantly (dot product < threshold)
             const localPlayerVelocity = playerVelocities[localPlayerId];
             if (localPlayerVelocity) {
                console.log("Rocket Jump Triggered (Manual Velocity)");
                localPlayerVelocity.y += ROCKET_JUMP_VEL; // Add upward velocity
                playerIsGrounded[localPlayerId] = false; // Rocket jump makes you airborne
            }
        }
    }
}


/** Applies velocity change to nearby players on death */
function applyShockwave(originPosition, deadPlayerId) {
    if (!window.players || !playerVelocities) return;
    console.log(`Applying shockwave from dead player ${deadPlayerId} at`, originPosition);
    const origin = originPosition; // THREE.Vector3

    for (const targetId in window.players) {
        if (targetId === deadPlayerId || !playerVelocities[targetId]) continue;

        const targetPlayer = window.players[targetId];
        const targetMesh = targetPlayer?.mesh;
        if (!targetMesh || targetPlayer.health <= 0) continue;

        try {
            const targetPos = targetMesh.position.clone().add(new THREE.Vector3(0, PLAYER_CENTER_OFFSET, 0)); // Use target center
            const direction = tempVec.subVectors(targetPos, origin);
            const distance = direction.length();

            if (distance < DEATH_SHOCKWAVE_RADIUS && distance > 0.01) {
                const forceFalloff = 1.0 - (distance / DEATH_SHOCKWAVE_RADIUS); // Linear falloff
                const velocityMagnitude = DEATH_SHOCKWAVE_VEL * forceFalloff;
                direction.normalize();

                // Apply velocity change directly
                const targetVelocity = playerVelocities[targetId];
                targetVelocity.x += direction.x * velocityMagnitude;
                targetVelocity.y += direction.y * velocityMagnitude * 0.5 + velocityMagnitude * 0.3; // Add upward boost
                targetVelocity.z += direction.z * velocityMagnitude;

                console.log(`Applying shockwave velocity change to ${targetId}`);

                // Mark target as not grounded after being hit
                if (playerIsGrounded[targetId]) {
                     playerIsGrounded[targetId] = false;
                }

            }
        } catch (e) { console.error(`Error calculating shockwave for player ${targetId}:`, e); }
    }
}

// --- Network Update Helper ---
function sendLocalPlayerUpdateIfNeeded(localPlayerMesh, camera) {
     const localPlayer = players[localPlayerId];
     if (!localPlayer || !localPlayerMesh || !camera || localPlayer.health <= 0) return;

     try {
         const feetPos = localPlayerMesh.position; // Mesh position is already feet position
         const cameraEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
         const currentRotationY = cameraEuler.y;

         const posThreshold = CONFIG.PLAYER_MOVE_THRESHOLD_SQ ?? 0.001;
         const rotThreshold = 0.02; // Slightly larger rotation threshold

         // Check if position or rotation changed significantly since last *sent* update
         const positionChanged = (
             (feetPos.x - (localPlayer.lastSentX ?? 0))**2 +
             (feetPos.y - (localPlayer.lastSentY ?? 0))**2 +
             (feetPos.z - (localPlayer.lastSentZ ?? 0))**2
         ) > posThreshold;

         const rotationChanged = Math.abs(currentRotationY - (localPlayer.lastSentRotY ?? 0)) > rotThreshold;

         if (positionChanged || rotationChanged) {
             // Update local cache of *sent* data
             localPlayer.lastSentX = feetPos.x;
             localPlayer.lastSentY = feetPos.y;
             localPlayer.lastSentZ = feetPos.z;
             localPlayer.lastSentRotY = currentRotationY;

             // Update the main player data for reference by others (like interpolation target)
             localPlayer.x = feetPos.x;
             localPlayer.y = feetPos.y;
             localPlayer.z = feetPos.z;
             localPlayer.rotationY = currentRotationY;

             Network?.sendPlayerUpdate({
                 x: feetPos.x,
                 y: feetPos.y,
                 z: feetPos.z,
                 rotationY: currentRotationY
             });
         }
     } catch(e) { console.error("!!! Error calculating/sending network update:", e); }
}


console.log("gameLogic.js loaded (Manual Raycasting v1)");
// --- END OF FULL gameLogic.js FILE ---
