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
const tempGroundRay = new THREE.Raycaster(); // Separate raycaster for ground checks

/**
 * Updates the local player's state (velocity, grounded status) based on input.
 * Does NOT directly modify position - that happens in game.js after collision checks.
 * @param {number} deltaTime Time since last frame.
 * @param {THREE.PerspectiveCamera} camera Reference to the main camera.
 * @param {THREE.Object3D} localPlayerMesh Reference to the local player's visual mesh.
 */
function updateLocalPlayerInput(deltaTime, camera, localPlayerMesh) {
    if (!localPlayerId || !window.players || !window.playerVelocities || !window.playerIsGrounded) return;
    const localPlayer = window.players[localPlayerId];
    if (!localPlayer || !localPlayerMesh || !window.playerVelocities[localPlayerId]) return;

    const isPlaying = stateMachine?.is('playing');
    const isLocked = window.controls?.isLocked; // Use window.controls safely
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
    // Calculate forward/right based on camera, ignore Y component
    const forward = tempVec.set(0, 0, -1).applyQuaternion(camera.quaternion); forward.y = 0; forward.normalize();
    const right = tempVec2.set(1, 0, 0).applyQuaternion(camera.quaternion); right.y = 0; right.normalize();
    let moveDirectionX = 0;
    let moveDirectionZ = 0;

    if (Input.keys['KeyW']) { moveDirectionX += forward.x; moveDirectionZ += forward.z; }
    if (Input.keys['KeyS']) { moveDirectionX -= forward.x; moveDirectionZ -= forward.z; }
    if (Input.keys['KeyA']) { moveDirectionX -= right.x; moveDirectionZ -= right.z; } // Corrected A/D
    if (Input.keys['KeyD']) { moveDirectionX += right.x; moveDirectionZ += right.z; } // Corrected A/D

    // Normalize diagonal movement speed
    const inputLengthSq = moveDirectionX * moveDirectionX + moveDirectionZ * moveDirectionZ;
    if (inputLengthSq > 1.0) { // If moving diagonally, normalize to prevent faster speed
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
        // Apply slight downward force when grounded to prevent bouncing on slopes and ensure grounding sticks
         if (currentVel.y > 0) currentVel.y = 0; // Stop upward movement instantly on ground
         currentVel.y = Math.max(currentVel.y, -GRAVITY * deltaTime * 2); // Prevent excessive downward force build-up but ensure some pressure
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
        // Make sure dash doesn't completely negate downward velocity if falling fast
        currentVel.y = Math.max(currentVel.y + DASH_VELOCITY * DASH_UP_FACTOR, currentVel.y * 0.5 + DASH_VELOCITY * DASH_UP_FACTOR * 0.5);
        playerIsGrounded[localPlayerId] = false; // Dash always makes player airborne briefly
        Input.requestingDash = false;
    }

    // --- Handle Shooting ---
    const now = Date.now();
    if (Input.mouseButtons[0] && now > (window.lastShootTime || 0) + SHOOT_COOLDOWN_MS) {
        // console.log("[GameLogic] Shoot condition met");
        window.lastShootTime = now;
        performShoot(camera); // Pass camera for direction
        Input.mouseButtons[0] = false; // Consume mouse click for single shot
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
    if (!playerMesh || !playerVelocity || !window.mapMesh) {
        console.warn("Collision check skipped: Missing playerMesh, velocity, or mapMesh");
        return playerIsGrounded[localPlayerId] ?? false; // Return previous grounded state if check fails
    }

    const currentPosition = playerMesh.position; // Feet position
    const movementVector = tempVec.copy(playerVelocity).multiplyScalar(deltaTime);
    const collisionObjects = [window.mapMesh]; // Only check against map for now

    // --- Ground Check (Before Movement) ---
    const groundRayOriginOffset = 0.1; // Start ray slightly above feet
    const groundRayOrigin = currentPosition.clone().add(new THREE.Vector3(0, groundRayOriginOffset, 0));
    const groundRayDirection = new THREE.Vector3(0, -1, 0);
    tempGroundRay.set(groundRayOrigin, groundRayDirection);
    // Check slightly further than step height + ground check distance to detect ground for stepping up
    tempGroundRay.far = groundRayOriginOffset + STEP_HEIGHT + GROUND_CHECK_DIST;

    const groundIntersectsBefore = tempGroundRay.intersectObjects(collisionObjects, true);
    // Considered grounded before move if a hit is very close to the feet origin
    const onGroundBeforeMove = groundIntersectsBefore.length > 0 && groundIntersectsBefore[0].distance <= groundRayOriginOffset + GROUND_CHECK_DIST * 0.5;

    // --- Horizontal and Vertical Movement with Collision ---
    let finalPosition = currentPosition.clone();
    let collidedX = false;
    let collidedY = false;
    let collidedZ = false;

    // Move X
    if (Math.abs(movementVector.x) > 0.001) {
        if (!checkWallCollision(finalPosition, new THREE.Vector3(Math.sign(movementVector.x), 0, 0), Math.abs(movementVector.x), collisionObjects)) {
            finalPosition.x += movementVector.x;
        } else {
            playerVelocity.x = 0;
            collidedX = true;
        }
    }

    // Move Z
    if (Math.abs(movementVector.z) > 0.001) {
        if (!checkWallCollision(finalPosition, new THREE.Vector3(0, 0, Math.sign(movementVector.z)), Math.abs(movementVector.z), collisionObjects)) {
            finalPosition.z += movementVector.z;
        } else {
            playerVelocity.z = 0;
            collidedZ = true;
        }
    }

     // Move Y (Gravity/Jumping)
    if (Math.abs(movementVector.y) > 0.001) {
        const movingUp = movementVector.y > 0;
        const yDir = movingUp ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, -1, 0);
        if (!checkCeilingFloorCollision(finalPosition, yDir, Math.abs(movementVector.y), movingUp, collisionObjects)) {
            finalPosition.y += movementVector.y;
        } else {
            playerVelocity.y = 0;
            collidedY = true;
        }
    }

    // --- Final Ground Check & Step Up Logic ---
    let isGrounded = false;
    // Use the same ray as before, but update origin based on the new potential final position
    groundRayOrigin.copy(finalPosition).add(new THREE.Vector3(0, groundRayOriginOffset, 0));
    tempGroundRay.set(groundRayOrigin, groundRayDirection);
    // Recalculate FAR distance based on potentially changed vertical velocity
    const currentGroundCheckDist = groundRayOriginOffset + (playerVelocity.y <= 0 ? STEP_HEIGHT + GROUND_CHECK_DIST : GROUND_CHECK_DIST); // Check further down if moving down or stable
    tempGroundRay.far = currentGroundCheckDist;


    const finalGroundIntersects = tempGroundRay.intersectObjects(collisionObjects, true);

    if (finalGroundIntersects.length > 0) {
        const hitPoint = finalGroundIntersects[0].point;
        const hitDistance = finalGroundIntersects[0].distance;
        const targetFeetY = finalPosition.y; // Where feet *would* be without adjustment

        // Grounded if the hit is within the normal ground check distance from the origin
        if (hitDistance <= groundRayOriginOffset + GROUND_CHECK_DIST * 0.5) {
            isGrounded = true;
            finalPosition.y = hitPoint.y; // Snap feet exactly to ground
            if (playerVelocity.y < 0) playerVelocity.y = 0;
        }
        // Step up logic: Hit is further than ground check, but within step height, and we were grounded before moving horizontally
        else if (hitDistance <= groundRayOriginOffset + STEP_HEIGHT && onGroundBeforeMove && (collidedX || collidedZ || playerVelocity.y <=0) ) {
             // Check if the step is feasible (e.g., not blocked right above the step)
            const stepUpOrigin = hitPoint.clone().add(new THREE.Vector3(0, PLAYER_HEIGHT - 0.1, 0)); // Check near head level above step
            const stepUpDir = new THREE.Vector3(0,-1,0); // Check down slightly
            tempRaycaster.set(stepUpOrigin, stepUpDir);
            tempRaycaster.far = PLAYER_HEIGHT - 0.2;
             if (tempRaycaster.intersectObjects(collisionObjects, true).length === 0) { // If no immediate ceiling obstruction
                isGrounded = true;
                finalPosition.y = hitPoint.y; // Step up onto the ledge
                if (playerVelocity.y < 0) playerVelocity.y = 0;
                // console.log("Stepped up!");
            } else {
                isGrounded = false; // Cannot step up, obstructed
            }
        } else {
             isGrounded = false; // In air or falling
        }

    } else {
        isGrounded = false; // In the air
    }


    // --- Void Check ---
    if (finalPosition.y < CONFIG.VOID_Y_LEVEL) {
        console.log(`Player ${localPlayerId} fell into void.`);
        const localPlayer = window.players[localPlayerId];
        if (localPlayer && localPlayer.health > 0) {
            localPlayer.health = 0; // Update local state immediately
            UIManager?.updateHealthBar(0);
            Network?.sendVoidDeath(); // Notify server
        }
        // Don't update position if in void, let server handle respawn
        return false; // Not grounded
    }

    // Update the actual player mesh position
    playerMesh.position.copy(finalPosition);

    return isGrounded;
}

/** Helper for Wall Collision Check */
function checkWallCollision(currentPosFeet, direction, distance, collisionObjects) {
    // Check from multiple points vertically along the player capsule
    const offsets = [PLAYER_RADIUS * 0.5, PLAYER_HEIGHT / 2, PLAYER_HEIGHT - PLAYER_RADIUS * 0.5]; // Feet-ish, Center, Head-ish
    const checkDistance = PLAYER_RADIUS + distance + 0.01; // Check slightly beyond movement distance

    for (const offsetY of offsets) {
        const checkOrigin = currentPosFeet.clone().add(new THREE.Vector3(0, offsetY, 0));
        tempRaycaster.set(checkOrigin, direction);
        tempRaycaster.far = checkDistance;

        const intersects = tempRaycaster.intersectObjects(collisionObjects, true);
        // Check if the closest hit is within the actual movement radius for this check point
        if (intersects.length > 0 && intersects[0].distance <= (PLAYER_RADIUS + distance)) {
            return true; // Collision detected
        }
    }
    return false; // No collision
}

/** Helper for Ceiling/Floor Collision Check */
function checkCeilingFloorCollision(currentPosFeet, direction, distance, movingUp, collisionObjects) {
    // If moving up, check from near the head. If moving down, check from feet.
    const offset = movingUp ? PLAYER_HEIGHT - 0.1 : 0.1; // Small offsets from top/bottom
    const checkOrigin = currentPosFeet.clone().add(new THREE.Vector3(0, offset, 0));
    tempRaycaster.set(checkOrigin, direction);
    tempRaycaster.far = distance + 0.05; // Check slightly beyond movement

    const intersects = tempRaycaster.intersectObjects(collisionObjects, true);
    return intersects.length > 0; // Any hit means collision
}


/** Performs shooting logic: Raycast, send hit, trigger effects/rocket jump */
function performShoot(camera) {
    // console.log("[GameLogic] performShoot called");
    if (!camera || !Network || !scene) { return; }
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
        if (id !== localPlayerId && window.players[id]?.mesh && window.players[id].health > 0) { // Only target living players
            potentialTargets.push(window.players[id].mesh);
        }
    }
    // console.log(`[GameLogic] Raycasting from camera. Targets: ${potentialTargets.length}`);
    const intersects = raycaster.intersectObjects(potentialTargets, true); // Check recursively

    // Find the actual player hit (traverse up from intersected submesh if needed)
    let hitDetected = false;
    if (intersects.length > 0) {
        // Sort intersects by distance, closest first
        intersects.sort((a, b) => a.distance - b.distance);

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
                // Check if the hit player is actually alive (double check)
                if(window.players[hitPlayerId]?.health > 0) {
                    console.log(`Hit player ${hitPlayerId} at distance ${hit.distance}`);
                    Network.sendPlayerHit({ targetId: hitPlayerId, damage: BULLET_DMG });
                    hitDetected = true;
                    break; // Only register the first living player hit
                } else {
                    console.log(`Raycast hit dead player ${hitPlayerId}, ignoring.`);
                }
            }
        }
    }
    // console.log(`[GameLogic] Raycast hit detected: ${hitDetected}`);


    // --- Rocket Jump Logic (Apply velocity to local player) ---
    if (Input.keys['KeyC']) {
        const worldDown = new THREE.Vector3(0, -1, 0);
        const dotProduct = direction.dot(worldDown); // How much is the camera looking down? (-1 is straight down)
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
    const origin = originPosition; // THREE.Vector3 (should be center mass)

    for (const targetId in window.players) {
        // Don't apply to self or dead players, ensure velocity exists
        if (targetId === deadPlayerId || !playerVelocities[targetId]) continue;

        const targetPlayer = window.players[targetId];
        const targetMesh = targetPlayer?.mesh;
        if (!targetMesh || targetPlayer.health <= 0) continue; // Skip if no mesh or dead

        try {
            // Calculate direction from origin to target's center
            const targetPos = targetMesh.position.clone().add(new THREE.Vector3(0, PLAYER_CENTER_OFFSET, 0));
            const direction = tempVec.subVectors(targetPos, origin);
            const distance = direction.length();

            if (distance < DEATH_SHOCKWAVE_RADIUS && distance > 0.01) {
                const forceFalloff = 1.0 - (distance / DEATH_SHOCKWAVE_RADIUS); // Linear falloff
                const velocityMagnitude = DEATH_SHOCKWAVE_VEL * forceFalloff;
                direction.normalize();

                // Apply velocity change directly to the target's velocity vector
                const targetVelocity = playerVelocities[targetId];
                targetVelocity.x += direction.x * velocityMagnitude;
                // Add more upward boost to the shockwave
                targetVelocity.y += direction.y * velocityMagnitude * 0.5 + velocityMagnitude * 0.6;
                targetVelocity.z += direction.z * velocityMagnitude;

                console.log(`Applying shockwave velocity change to ${targetId}`);

                // Mark target as not grounded after being hit by shockwave
                if (playerIsGrounded[targetId]) {
                     playerIsGrounded[targetId] = false;
                }

            }
        } catch (e) { console.error(`Error calculating shockwave for player ${targetId}:`, e); }
    }
}

// --- Network Update Helper ---
function sendLocalPlayerUpdateIfNeeded(localPlayerMesh, camera) {
     if (!localPlayerId || !window.players[localPlayerId]) return;
     const localPlayer = window.players[localPlayerId];
     if (!localPlayer || !localPlayerMesh || !camera || localPlayer.health <= 0) return;

     try {
         const feetPos = localPlayerMesh.position; // Mesh position is already feet position
         const cameraEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
         const currentRotationY = cameraEuler.y;

         const posThresholdSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ ?? 0.001;
         const rotThreshold = 0.02; // Radians difference threshold for rotation update

         // Check if position or rotation changed significantly since last *sent* update
         // Use optional chaining for safety if lastSent values are initially undefined
         const positionChanged = (
             (feetPos.x - (localPlayer.lastSentX ?? feetPos.x))**2 +
             (feetPos.y - (localPlayer.lastSentY ?? feetPos.y))**2 +
             (feetPos.z - (localPlayer.lastSentZ ?? feetPos.z))**2
         ) > posThresholdSq;

         // More robust rotation change check using angle difference
         const rotationDiff = Math.abs(currentRotationY - (localPlayer.lastSentRotY ?? currentRotationY));
         // Handle angle wrapping (e.g., difference between 0.1 and 6.2 radians)
         const rotationChanged = Math.min(rotationDiff, Math.abs(rotationDiff - Math.PI * 2)) > rotThreshold;

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
