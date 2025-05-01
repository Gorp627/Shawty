// --- START OF FULL gameLogic.js FILE (Manual Raycasting v6 - Simplified Collision - FIXED SCOPE) ---
// docs/gameLogic.js (Manual Raycasting v6 - Simplified Collision)

// Accesses globals: players, localPlayerId, CONFIG, THREE, Network, Input, UIManager, stateMachine, Effects, scene, mapMesh, playerVelocities, playerIsGrounded

// --- Constants ---
// Use CONFIG values directly where needed, remove redundant const declarations here
const GRAVITY = CONFIG?.GRAVITY_ACCELERATION ?? 28.0;
const JUMP_VELOCITY = CONFIG?.JUMP_INITIAL_VELOCITY ?? 9.0;
const DASH_VELOCITY = CONFIG?.DASH_VELOCITY_MAGNITUDE ?? 15.0;
const DASH_UP_FACTOR = CONFIG?.DASH_UP_FACTOR ?? 0.15;
const GROUND_CHECK_DIST = CONFIG?.GROUND_CHECK_DISTANCE ?? 0.25;
const COLLISION_CHECK_DIST = CONFIG?.COLLISION_CHECK_DISTANCE ?? 0.6;
const PLAYER_HEIGHT = CONFIG?.PLAYER_HEIGHT ?? 1.8;
const PLAYER_FEET_OFFSET = PLAYER_HEIGHT / 2.0;
const PLAYER_CENTER_OFFSET = PLAYER_HEIGHT / 2.0;
const STEP_HEIGHT = CONFIG?.PLAYER_STEP_HEIGHT ?? 0.3;

const SHOOT_COOLDOWN_MS = CONFIG?.SHOOT_COOLDOWN ?? 150;
const BULLET_DMG = CONFIG?.BULLET_DAMAGE ?? 25;
const BULLET_MAX_RANGE = CONFIG?.BULLET_RANGE ?? 300;
const ROCKET_JUMP_VEL = CONFIG?.ROCKET_JUMP_VELOCITY ?? 12.0;
// ROCKET_JUMP_THRESH was defined but not used in performShoot fix, using threshold directly
const DEATH_SHOCKWAVE_VEL = CONFIG?.DEATH_SHOCKWAVE_VELOCITY ?? 18.0;
const DEATH_SHOCKWAVE_RADIUS = CONFIG?.DEATH_EXPLOSION_RADIUS ?? 15.0;

const tempVec = new THREE.Vector3();
const tempVec2 = new THREE.Vector3();
const tempRaycaster = new THREE.Raycaster();
const tempGroundRay = new THREE.Raycaster();

/**
 * Updates the local player's velocity based on input.
 * ATTACHED TO WINDOW object to make it globally accessible from game.js
 */
window.updateLocalPlayerInput = function(deltaTime, camera, localPlayerMesh) { // <--- Added window.
    // console.log("Entered updateLocalPlayerInput"); // Keep commented unless needed

    // Use guards - ensure player/velocity/grounded maps exist
    if (!localPlayerId || !window.players || !window.playerVelocities || !window.playerIsGrounded) return;
    const localPlayer = window.players[localPlayerId];
    if (!localPlayer || !localPlayerMesh || !window.playerVelocities[localPlayerId]) return;
    // Check if grounded entry exists, default to false if not (should be created in game.js)
    const isGrounded = window.playerIsGrounded.hasOwnProperty(localPlayerId) ? window.playerIsGrounded[localPlayerId] : false;
    const currentVel = window.playerVelocities[localPlayerId]; // Must exist if we pass guard

    const isPlaying = stateMachine?.is('playing');
    const isLocked = window.controls?.isLocked;
    if (!isPlaying || !isLocked || localPlayer.health <= 0) {
        // Apply damping when not actively playing/locked/alive
        currentVel.x *= 0.9; currentVel.z *= 0.9;
        if (Math.abs(currentVel.x) < 0.1) currentVel.x = 0;
        if (Math.abs(currentVel.z) < 0.1) currentVel.z = 0;
        if (!isGrounded) currentVel.y -= GRAVITY * deltaTime; // Still apply gravity if airborne
        // console.log(`Velocity (Paused/Dead): X=${currentVel.x.toFixed(2)}, Y=${currentVel.y.toFixed(2)}, Z=${currentVel.z.toFixed(2)}, Grounded=${isGrounded}`);
        return;
    }

    // --- Horizontal Movement ---
    // Use CONFIG directly, or fallback default
    const moveSpeed = Input.keys['ShiftLeft'] ? (CONFIG?.MOVEMENT_SPEED_SPRINTING ?? 10.5) : (CONFIG?.MOVEMENT_SPEED ?? 7.0);
    const forward = tempVec.set(0, 0, -1).applyQuaternion(camera.quaternion); forward.y = 0; forward.normalize();
    const right = tempVec2.set(1, 0, 0).applyQuaternion(camera.quaternion); right.y = 0; right.normalize();
    let moveDirectionX = 0;
    let moveDirectionZ = 0;
    // Check WASD keys specifically
    if (Input.keys['KeyW']) { console.log("[DEBUG InputLogic] W Detected"); moveDirectionX += forward.x; moveDirectionZ += forward.z; } // DEBUG
    if (Input.keys['KeyS']) { console.log("[DEBUG InputLogic] S Detected"); moveDirectionX -= forward.x; moveDirectionZ -= forward.z; } // DEBUG
    if (Input.keys['KeyA']) { console.log("[DEBUG InputLogic] A Detected"); moveDirectionX -= right.x; moveDirectionZ -= right.z; } // DEBUG
    if (Input.keys['KeyD']) { console.log("[DEBUG InputLogic] D Detected"); moveDirectionX += right.x; moveDirectionZ += right.z; } // DEBUG


    const inputLengthSq = moveDirectionX * moveDirectionX + moveDirectionZ * moveDirectionZ;
    if (inputLengthSq > 1.0) { // Normalize if magnitude > 1 (diagonal movement)
        const inputLength = Math.sqrt(inputLengthSq);
        moveDirectionX /= inputLength; moveDirectionZ /= inputLength;
    }

    // Apply movement velocity (using lerp for smoother acceleration/deceleration)
    const targetVelocityX = moveDirectionX * moveSpeed;
    const targetVelocityZ = moveDirectionZ * moveSpeed;
    const accelFactor = isGrounded ? 0.2 : 0.08; // Faster acceleration on ground
    currentVel.x = THREE.MathUtils.lerp(currentVel.x, targetVelocityX, accelFactor);
    currentVel.z = THREE.MathUtils.lerp(currentVel.z, targetVelocityZ, accelFactor);

    // --- Apply Gravity ---
    if (!isGrounded) {
        currentVel.y -= GRAVITY * deltaTime;
    } else {
         // Prevent positive Y velocity when grounded (can happen from step-up)
         if (currentVel.y > 0) currentVel.y = 0;
         // Apply slight downward force if grounded to help stick on slopes, limited by gravity itself
         currentVel.y = Math.max(currentVel.y, -GRAVITY * deltaTime * 2);
    }

    // --- Handle Jump ---
    if (Input.keys['Space'] && isGrounded) {
        console.log("[DEBUG InputLogic] Jump Detected & Grounded"); // DEBUG
        currentVel.y = JUMP_VELOCITY;
        window.playerIsGrounded[localPlayerId] = false; // Update global directly
        Input.keys['Space'] = false; // Consume the jump input immediately
    }

    // --- Handle Dash ---
    // Dash is requested via Input.requestingDash flag, set by input.js
    if (Input.requestingDash) {
        console.log("[DEBUG InputLogic] Dash Consumed"); // DEBUG
        const dashDir = Input.dashDirection; // Get direction calculated by input.js
        currentVel.x += dashDir.x * DASH_VELOCITY;
        currentVel.z += dashDir.z * DASH_VELOCITY;
        // Add upward component, ensuring it doesn't cancel existing upward velocity completely
        currentVel.y = Math.max(currentVel.y + DASH_VELOCITY * DASH_UP_FACTOR, currentVel.y * 0.5 + DASH_VELOCITY * DASH_UP_FACTOR * 0.5);
        window.playerIsGrounded[localPlayerId] = false; // Dashing makes you airborne
        Input.requestingDash = false; // Consume the dash request
    }

    // --- Handle Shooting ---
    const now = Date.now();
    if (Input.mouseButtons[0] && now > (window.lastShootTime || 0) + SHOOT_COOLDOWN_MS) {
        console.log("[DEBUG InputLogic] Shoot Detected (Button 0)"); // DEBUG
        window.lastShootTime = now;
        performShoot(camera); // Handles raycasting, network messages, effects, rocket jump
        // Input.mouseButtons[0] = false; // Optional: Consume click immediately (or allow holding)
                                       // Current logic allows holding, cooldown prevents rapid fire.
    }

    // console.log(`Velocity after input: X=${currentVel.x.toFixed(2)}, Y=${currentVel.y.toFixed(2)}, Z=${currentVel.z.toFixed(2)}, Grounded=${isGrounded}`);
} // End of updateLocalPlayerInput


/**
 * Performs collision detection and response for the local player.
 * Updates the player's position directly.
 * ATTACHED TO WINDOW object to make it globally accessible from game.js
 */
window.checkPlayerCollisionAndMove = function(playerMesh, playerVelocity, deltaTime) { // <--- Added window.
    // console.log("Entered checkPlayerCollisionAndMove"); // Keep commented unless needed

    /** Helper for Wall Collision Check */
    // Uses global PLAYER_RADIUS from CONFIG
    function checkWallCollision(currentPosFeet, direction, distance, collisionObjects) {
        const localPlayerRadius = CONFIG?.PLAYER_RADIUS ?? 0.4; // Get radius from config
        const offsets = [localPlayerRadius * 0.5, PLAYER_HEIGHT / 2, PLAYER_HEIGHT - localPlayerRadius * 0.5]; // Use PLAYER_HEIGHT
        const checkDistance = localPlayerRadius + distance;
        for (const offsetY of offsets) {
            const checkOrigin = currentPosFeet.clone().add(new THREE.Vector3(0, offsetY, 0));
            tempRaycaster.set(checkOrigin, direction); tempRaycaster.far = checkDistance;
            const intersects = tempRaycaster.intersectObjects(collisionObjects, true);
            if (intersects.length > 0 && intersects[0].distance <= checkDistance + 0.01) { // Check slightly beyond target distance
                // console.log(`[DEBUG Collision] Wall hit! Dir: ${direction.x.toFixed(1)},${direction.z.toFixed(1)} Dist: ${intersects[0].distance.toFixed(2)} CheckDist: ${checkDistance.toFixed(2)}`); // DEBUG
                return true; // Collision detected
            }
        }
        return false; // No collision
    }
    /** Helper for Ceiling/Floor Collision Check */
    function checkCeilingFloorCollision(currentPosFeet, direction, distance, movingUp, collisionObjects) {
        const offset = movingUp ? PLAYER_HEIGHT - 0.1 : 0.1; // Use PLAYER_HEIGHT
        const checkOrigin = currentPosFeet.clone().add(new THREE.Vector3(0, offset, 0));
        tempRaycaster.set(checkOrigin, direction); tempRaycaster.far = distance + 0.05; // Check slightly beyond target distance
        const intersects = tempRaycaster.intersectObjects(collisionObjects, true);
        if(intersects.length > 0) {
             // console.log(`[DEBUG Collision] Vert hit! Up:${movingUp} Dist: ${intersects[0].distance.toFixed(2)} CheckDist: ${(distance + 0.05).toFixed(2)}`); // DEBUG
        }
        return intersects.length > 0; // Collision detected if any intersects
    }

    // --- Main collision logic ---
    // Use guards
    if (!playerMesh || !playerVelocity || !window.mapMesh) {
        console.warn("[Collision] Missing playerMesh, velocity, or mapMesh.");
        return window.playerIsGrounded[localPlayerId] ?? false; // Return previous state if possible
    }

    const currentPosition = playerMesh.position; // Feet position
    const movementVector = tempVec.copy(playerVelocity).multiplyScalar(deltaTime); // How much player *wants* to move this frame
    const collisionObjects = [window.mapMesh]; // Objects to collide with
    const groundRayDirection = new THREE.Vector3(0, -1, 0);
    const groundRayOriginOffset = 0.1; // Start ground check slightly above feet

    // --- Ground Check (Before Movement) ---
    // Helps determine if step-up is possible
    const groundRayOriginBefore = currentPosition.clone().add(new THREE.Vector3(0, groundRayOriginOffset, 0));
    tempGroundRay.set(groundRayOriginBefore, groundRayDirection);
    tempGroundRay.far = groundRayOriginOffset + STEP_HEIGHT + GROUND_CHECK_DIST; // Check down far enough for stepping
    const groundIntersectsBefore = tempGroundRay.intersectObjects(collisionObjects, true);
    const onGroundBeforeMove = groundIntersectsBefore.length > 0 && groundIntersectsBefore[0].distance <= groundRayOriginOffset + GROUND_CHECK_DIST * 0.5;

    // --- Movement & Collision Resolution ---
    // IMPORTANT: Apply movement axis by axis and check for collisions at each step
    // This prevents phasing through corners.

    let moveX = movementVector.x;
    let moveY = movementVector.y;
    let moveZ = movementVector.z;
    let currentIterPosition = currentPosition.clone(); // Start from current position

    // Move X
    if (Math.abs(moveX) > 0.001) {
        if (checkWallCollision(currentIterPosition, new THREE.Vector3(Math.sign(moveX), 0, 0), Math.abs(moveX), collisionObjects)) {
            moveX = 0; // Collision, cancel X movement
            playerVelocity.x = 0; // Stop X velocity
        }
        currentIterPosition.x += moveX; // Apply (potentially zeroed) X movement
    }

    // Move Z (Start check from position potentially updated by X move)
    if (Math.abs(moveZ) > 0.001) {
        if (checkWallCollision(currentIterPosition, new THREE.Vector3(0, 0, Math.sign(moveZ)), Math.abs(moveZ), collisionObjects)) {
            moveZ = 0; // Collision, cancel Z movement
            playerVelocity.z = 0; // Stop Z velocity
        }
        currentIterPosition.z += moveZ; // Apply (potentially zeroed) Z movement
    }

    // Move Y (Start check from position potentially updated by X/Z moves)
    if (Math.abs(moveY) > 0.001) {
        const movingUp = moveY > 0;
        const yDir = movingUp ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, -1, 0);
        if (checkCeilingFloorCollision(currentIterPosition, yDir, Math.abs(moveY), movingUp, collisionObjects)) {
            moveY = 0; // Collision, cancel Y movement
            playerVelocity.y = 0; // Stop Y velocity
        }
        currentIterPosition.y += moveY; // Apply (potentially zeroed) Y movement
    }
    // --- End of Axis-by-Axis Movement ---

    const finalPosition = currentIterPosition; // The position after attempting movement on each axis

    // --- Final Ground Check & Step Up Logic ---
    // Perform ground check at the *final* potential position
    let isGrounded = false;
    const groundRayOriginFinal = finalPosition.clone().add(new THREE.Vector3(0, groundRayOriginOffset, 0));
    tempGroundRay.set(groundRayOriginFinal, groundRayDirection);
    // Check distance depends on whether we were moving down or potentially stepping up
    const currentGroundCheckDist = groundRayOriginOffset + (playerVelocity.y <= 0 ? STEP_HEIGHT + GROUND_CHECK_DIST : GROUND_CHECK_DIST);
    tempGroundRay.far = currentGroundCheckDist;
    const finalGroundIntersects = tempGroundRay.intersectObjects(collisionObjects, true);

    // Debug log string
    // let groundCheckDebug = `GChk: OY=${groundRayOriginFinal.y.toFixed(2)}, Far=${tempGroundRay.far.toFixed(2)}, Hits=${finalGroundIntersects.length}`;

    if (finalGroundIntersects.length > 0) {
        const hitPoint = finalGroundIntersects[0].point;
        const hitDistance = finalGroundIntersects[0].distance;
        // groundCheckDebug += `, HDist=${hitDistance.toFixed(2)}`;

        // Check if the hit is close enough to be considered grounded (within skin width)
        if (hitDistance <= groundRayOriginOffset + GROUND_CHECK_DIST * 0.5) {
            isGrounded = true;
            finalPosition.y = hitPoint.y; // Snap feet to ground level
            if (playerVelocity.y < 0) playerVelocity.y = 0; // Stop downward velocity on landing
            // groundCheckDebug += ", Grounded=Yes";
        }
        // Check for step-up condition: Were on ground before, moving down or hit wall, hit is within step height
        else if (onGroundBeforeMove && playerVelocity.y <= 0 && hitDistance <= groundRayOriginOffset + STEP_HEIGHT) {
            // Check if space above the step is clear
            const stepUpOrigin = hitPoint.clone().add(new THREE.Vector3(0, PLAYER_HEIGHT - 0.1, 0)); // Check from top of player height at step location
            tempRaycaster.set(stepUpOrigin, groundRayDirection); // Raycast down from above step
            tempRaycaster.far = PLAYER_HEIGHT - 0.2; // Check most of the player height is clear
             if (tempRaycaster.intersectObjects(collisionObjects, true).length === 0) { // If no hit, space is clear
                isGrounded = true; // Considered grounded after stepping up
                finalPosition.y = hitPoint.y; // Snap feet to step height
                if (playerVelocity.y < 0) playerVelocity.y = 0; // Stop downward velocity
                // groundCheckDebug += ", StepUp=OK";
            } else { isGrounded = false; /* groundCheckDebug += ", StepUp=Blocked"; */ }
        } else { isGrounded = false; /* groundCheckDebug += ", TooFar/Airborne"; */ }
    } else {
        isGrounded = false; // No ground hit
        // groundCheckDebug += ", NoHits";
    }

    // Print the debug string
    // if(localPlayerId) { console.log(groundCheckDebug + `, isGnd=${isGrounded}, VelY=${playerVelocity.y.toFixed(3)}, FinPosY=${finalPosition.y.toFixed(3)}`); }


    // --- Void Check ---
    if (finalPosition.y < CONFIG.VOID_Y_LEVEL) {
         console.log(`Player ${localPlayerId} fell into void at Y=${finalPosition.y.toFixed(2)}.`);
         const localPlayer = window.players[localPlayerId];
         // Ensure player exists and is alive before triggering void death
         if (localPlayer?.health > 0) {
              localPlayer.health = 0; // Set health to 0 locally
              UIManager?.updateHealthBar(0); // Update UI
              Network?.sendVoidDeath(); // Tell server about void death
         }
         return false; // Prevent position update below, player is dead
    }

    // --- Final Position Update ---
    // Update the actual player mesh position AFTER all checks and potential adjustments
    playerMesh.position.copy(finalPosition);

    // Return the final grounded state
    // console.log(`Collision Check Result: Grounded=${isGrounded}, Final Pos Y=${finalPosition.y.toFixed(2)}, Vel Y=${playerVelocity.y.toFixed(2)}`);
    return isGrounded;
} // End of checkPlayerCollisionAndMove


/**
 * Performs shooting logic: Raycast, send hit, trigger effects/rocket jump.
 * ATTACHED TO WINDOW object to make it globally accessible (called by InputLogic)
 */
window.performShoot = function(camera) { // <--- Added window.
    // console.log("Entered performShoot"); // Keep commented unless needed
    if (!camera || !Network || !scene) {
        console.warn("[Shoot] Missing camera, Network, or scene reference.");
        return;
    }

    // Play sound effect locally immediately
    if (window.gunSoundBuffer) { Effects.playSound(window.gunSoundBuffer, null, false, 0.4); }
    console.log("[DEBUG ShootLogic] Gun sound played (attempted)."); // DEBUG

    const raycaster = new THREE.Raycaster();
    const origin = new THREE.Vector3(); const direction = new THREE.Vector3();
    camera.getWorldPosition(origin); // Get camera's world position
    camera.getWorldDirection(direction); // Get camera's world direction
    console.log(`[DEBUG ShootLogic] Raycast from (${origin.x.toFixed(1)},${origin.y.toFixed(1)},${origin.z.toFixed(1)}) dir (${direction.x.toFixed(1)},${direction.y.toFixed(1)},${direction.z.toFixed(1)})`); // DEBUG


    raycaster.set(origin, direction);
    raycaster.far = BULLET_MAX_RANGE;

    // --- Target Selection ---
    const potentialTargets = []; // Objects to check for hits
    // Add other players' meshes
    for (const id in window.players) {
        if (id !== localPlayerId && window.players[id]?.mesh && window.players[id].health > 0) {
            potentialTargets.push(window.players[id].mesh);
        }
    }
    // Add the map mesh for environment hits (optional, if bullets should stop on walls)
    if (window.mapMesh) { potentialTargets.push(window.mapMesh); } // ADDED MAP MESH TO TARGETS

    const intersects = raycaster.intersectObjects(potentialTargets, true); // Check recursively

    if (intersects.length > 0) {
        // Sort hits by distance (nearest first)
        intersects.sort((a, b) => a.distance - b.distance);

        // Process the nearest hit
        const nearestHit = intersects[0];
        let hitObject = nearestHit.object;
        let hitPlayerId = null;

        // Traverse up the hierarchy to find the parent object with player ID (if it's a player model part)
        while (hitObject && !hitPlayerId) {
            // Fix: Check for self-hit BEFORE checking if it's a player
             if (hitObject.userData?.entityId === window.localPlayerId) {
                // console.log("[Shoot] Hit self, ignoring.");
                break; // Stop check if self hit
             }
             if (hitObject.userData?.isPlayer) { // Check if the object or its parent has the marker
                 hitPlayerId = hitObject.userData.entityId;
             }
            hitObject = hitObject.parent;
        }

        // Ensure hitPlayerId is set AND it's not the local player
        if (hitPlayerId && hitPlayerId !== window.localPlayerId && window.players[hitPlayerId]?.health > 0) {
             console.log(`[DEBUG ShootLogic] Hit player ${hitPlayerId} (${window.players[hitPlayerId]?.name || '??'}) at distance ${nearestHit.distance.toFixed(2)}`); // DEBUG
             Network.sendPlayerHit({ targetId: hitPlayerId, damage: BULLET_DMG });
             // Optional: Show hit marker effect here
        } else {
             // Hit the environment or self, no damage dealt to others
             console.log(`[DEBUG ShootLogic] Hit environment/self/dead player at distance ${nearestHit.distance.toFixed(2)}`); // DEBUG
             // Optional: Create bullet hole decal or spark effect at nearestHit.point
        }
    } else {
         // Shot hit nothing within range
         console.log("[DEBUG ShootLogic] Shot missed."); // DEBUG
    }

    // --- Rocket Jump Check ---
    // Check if 'E' key is held down ('KeyE' for code)
    if (Input.keys['KeyE']) {
        console.log("[DEBUG ShootLogic] Checking Rocket Jump (E key held)"); // DEBUG
        const worldDown = new THREE.Vector3(0, -1, 0);
        const downwardLookThreshold = 0.5; // Look significantly down (0 = horizontal, 1 = straight down)
        const dotProd = direction.dot(worldDown);
        console.log("[DEBUG ShootLogic] Rocket Jump Dot Product (CamDir . WorldDown):", dotProd.toFixed(2)); // DEBUG

        if (dotProd > downwardLookThreshold) { // Check if looking sufficiently downward
            const localPlayerVelocity = window.playerVelocities[localPlayerId];
            if (localPlayerVelocity) {
                console.log("[DEBUG ShootLogic] Applying Rocket Jump Velocity!"); // DEBUG
                localPlayerVelocity.y += ROCKET_JUMP_VEL; // Apply upward velocity boost
                if(window.playerIsGrounded) window.playerIsGrounded[localPlayerId] = false; // Ensure player becomes airborne
            }
        } else {
            console.log("[DEBUG ShootLogic] Rocket Jump condition not met (not looking down enough)."); // DEBUG
        }
    }
} // End of performShoot


/**
 * Applies velocity change to nearby players on death.
 * ATTACHED TO WINDOW object to make it globally accessible (called by Network)
 */
window.applyShockwave = function(originPosition, deadPlayerId) { // <--- Added window.
     if (!window.players || !playerVelocities) { console.warn("[Shockwave] Missing players or velocities map."); return; }
    const origin = originPosition; // Assumed to be center of explosion

    for (const targetId in window.players) {
        if (targetId === deadPlayerId) continue; // Don't apply to the dead player
        const targetVelocity = playerVelocities[targetId];
        if(!targetVelocity) continue; // Skip if target has no velocity entry

        const targetPlayer = window.players[targetId];
        const targetMesh = targetPlayer?.mesh;
        if (!targetMesh || targetPlayer.health <= 0) continue; // Skip dead or meshless targets

        try {
            // Calculate direction from explosion center to target player's center
            const targetPos = targetMesh.position.clone().add(new THREE.Vector3(0, PLAYER_CENTER_OFFSET, 0)); // Target center
            const direction = tempVec.subVectors(targetPos, origin);
            const distance = direction.length();

            // Check if within radius and avoid division by zero
            if (distance < DEATH_SHOCKWAVE_RADIUS && distance > 0.01) {
                // Calculate force based on distance (stronger closer)
                const forceFalloff = 1.0 - (distance / DEATH_SHOCKWAVE_RADIUS);
                const velocityMagnitude = DEATH_SHOCKWAVE_VEL * forceFalloff;
                direction.normalize(); // Normalize direction vector

                // Apply force (add velocity)
                targetVelocity.x += direction.x * velocityMagnitude;
                // Add more upward force than sideways for a 'pop' effect
                targetVelocity.y += direction.y * velocityMagnitude * 0.5 + velocityMagnitude * 0.6;
                targetVelocity.z += direction.z * velocityMagnitude;

                // Make sure target becomes airborne if they were grounded
                if (playerIsGrounded[targetId]) { playerIsGrounded[targetId] = false; }
                 console.log(`[DEBUG Shockwave] Applied force to ${targetId}. Dist: ${distance.toFixed(1)}, Mag: ${velocityMagnitude.toFixed(1)}`); // DEBUG
            }
        } catch (e) { console.error(`Error calculating shockwave for player ${targetId}:`, e); }
    }
} // End of applyShockwave


/**
 * Checks if the local player has moved/rotated enough and sends an update.
 * ATTACHED TO WINDOW object to make it globally accessible (called by game.js)
 */
window.sendLocalPlayerUpdateIfNeeded = function(localPlayerMesh, camera) { // <--- Added window.
      if (!localPlayerId || !window.players[localPlayerId]) return;
     const localPlayer = window.players[localPlayerId];
     if (!localPlayer || !localPlayerMesh || !camera || localPlayer.health <= 0) return;

     try {
         const feetPos = localPlayerMesh.position; // Current feet position
         // Get camera rotation (Y-axis only matters for server)
         const cameraEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
         const currentRotationY = cameraEuler.y;

         // Thresholds for sending update
         const posThresholdSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ ?? 0.001;
         const rotThreshold = 0.02; // Radians (~1 degree)

         // Check if position changed significantly since last sent update
         const positionChanged = (
             (feetPos.x - (localPlayer.lastSentX ?? feetPos.x))**2 +
             (feetPos.y - (localPlayer.lastSentY ?? feetPos.y))**2 +
             (feetPos.z - (localPlayer.lastSentZ ?? feetPos.z))**2
         ) > posThresholdSq;

         // Check if rotation changed significantly (handle angle wrapping)
         const rotationDiff = Math.abs(currentRotationY - (localPlayer.lastSentRotY ?? currentRotationY));
         const rotationChanged = Math.min(rotationDiff, Math.abs(rotationDiff - Math.PI * 2)) > rotThreshold;

         // Send update if position or rotation changed enough
         if (positionChanged || rotationChanged) {
             // Update last sent values
             localPlayer.lastSentX = feetPos.x;
             localPlayer.lastSentY = feetPos.y;
             localPlayer.lastSentZ = feetPos.z;
             localPlayer.lastSentRotY = currentRotationY;

             // Also update the local player object's main x,y,z,rotY for consistency (if needed elsewhere)
             localPlayer.x = feetPos.x;
             localPlayer.y = feetPos.y;
             localPlayer.z = feetPos.z;
             localPlayer.rotationY = currentRotationY;

             // Send the update via Network module
             Network?.sendPlayerUpdate({ x: feetPos.x, y: feetPos.y, z: feetPos.z, rotationY: currentRotationY });
             // console.log(`[DEBUG NetworkSend] Sent Update. PosChanged: ${positionChanged}, RotChanged: ${rotationChanged}`); // DEBUG
         }
     } catch(e) { console.error("!!! Error calculating/sending network update:", e); }
} // End of sendLocalPlayerUpdateIfNeeded


console.log("gameLogic.js loaded (Manual Raycasting v6 - Simplified Collision - FIXED SCOPE)");
// --- END OF FULL gameLogic.js FILE ---
