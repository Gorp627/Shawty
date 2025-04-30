// --- START OF FULL gameLogic.js FILE (Manual Raycasting v2 - Logging) ---
// docs/gameLogic.js (Manual Raycasting v2 - Logging)

// Accesses globals: players, localPlayerId, CONFIG, THREE, Network, Input, UIManager, stateMachine, Effects, scene, mapMesh, playerVelocities, playerIsGrounded

// --- Constants ---
const GRAVITY = CONFIG?.GRAVITY_ACCELERATION ?? 28.0;
const JUMP_VELOCITY = CONFIG?.JUMP_INITIAL_VELOCITY ?? 9.0;
const DASH_VELOCITY = CONFIG?.DASH_VELOCITY_MAGNITUDE ?? 15.0;
const DASH_UP_FACTOR = CONFIG?.DASH_UP_FACTOR ?? 0.15;
const GROUND_CHECK_DIST = CONFIG?.GROUND_CHECK_DISTANCE ?? 0.25;
const COLLISION_CHECK_DIST = CONFIG?.COLLISION_CHECK_DISTANCE ?? 0.6;
const PLAYER_RADIUS = CONFIG?.PLAYER_RADIUS ?? 0.4;
const PLAYER_HEIGHT = CONFIG?.PLAYER_HEIGHT ?? 1.8;
const PLAYER_FEET_OFFSET = PLAYER_HEIGHT / 2.0;
const PLAYER_CENTER_OFFSET = PLAYER_HEIGHT / 2.0;
const STEP_HEIGHT = CONFIG?.PLAYER_STEP_HEIGHT ?? 0.3;

const SHOOT_COOLDOWN_MS = CONFIG?.SHOOT_COOLDOWN ?? 150;
const BULLET_DMG = CONFIG?.BULLET_DAMAGE ?? 25;
const BULLET_MAX_RANGE = CONFIG?.BULLET_RANGE ?? 300;
const ROCKET_JUMP_VEL = CONFIG?.ROCKET_JUMP_VELOCITY ?? 12.0;
const ROCKET_JUMP_THRESH = CONFIG?.ROCKET_JUMP_ANGLE_THRESHOLD ?? -0.7;
const DEATH_SHOCKWAVE_VEL = CONFIG?.DEATH_SHOCKWAVE_VELOCITY ?? 18.0;
const DEATH_SHOCKWAVE_RADIUS = CONFIG?.DEATH_EXPLOSION_RADIUS ?? 15.0;

const tempVec = new THREE.Vector3();
const tempVec2 = new THREE.Vector3();
const tempRaycaster = new THREE.Raycaster();
const tempGroundRay = new THREE.Raycaster();

/**
 * Updates the local player's velocity based on input.
 */
function updateLocalPlayerInput(deltaTime, camera, localPlayerMesh) {
    // ... (Keep the existing updateLocalPlayerInput function content as provided in the previous response) ...
    // ... (It calculates horizontal/vertical velocity changes based on WASD, Space, Shift, C+Shoot) ...

    if (!localPlayerId || !window.players || !window.playerVelocities || !window.playerIsGrounded) return;
    const localPlayer = window.players[localPlayerId];
    if (!localPlayer || !localPlayerMesh || !window.playerVelocities[localPlayerId]) return;

    const currentVel = playerVelocities[localPlayerId]; // Reference global velocity map
    const isGrounded = playerIsGrounded[localPlayerId]; // Reference global grounded map

    const isPlaying = stateMachine?.is('playing');
    const isLocked = window.controls?.isLocked;
    if (!isPlaying || !isLocked || localPlayer.health <= 0) {
        currentVel.x *= 0.9; currentVel.z *= 0.9; // Dampen velocity if dead/paused
        if (Math.abs(currentVel.x) < 0.1) currentVel.x = 0;
        if (Math.abs(currentVel.z) < 0.1) currentVel.z = 0;
        // Apply gravity even if dead/paused to fall down
        if (!isGrounded) currentVel.y -= GRAVITY * deltaTime;
        return;
    }

    // --- Horizontal Movement ---
    const moveSpeed = Input.keys['ShiftLeft'] ? (CONFIG?.MOVEMENT_SPEED_SPRINTING ?? 10.5) : (CONFIG?.MOVEMENT_SPEED ?? 7.0);
    const forward = tempVec.set(0, 0, -1).applyQuaternion(camera.quaternion); forward.y = 0; forward.normalize();
    const right = tempVec2.set(1, 0, 0).applyQuaternion(camera.quaternion); right.y = 0; right.normalize();
    let moveDirectionX = 0;
    let moveDirectionZ = 0;
    if (Input.keys['KeyW']) { moveDirectionX += forward.x; moveDirectionZ += forward.z; }
    if (Input.keys['KeyS']) { moveDirectionX -= forward.x; moveDirectionZ -= forward.z; }
    if (Input.keys['KeyA']) { moveDirectionX -= right.x; moveDirectionZ -= right.z; }
    if (Input.keys['KeyD']) { moveDirectionX += right.x; moveDirectionZ += right.z; }
    const inputLengthSq = moveDirectionX * moveDirectionX + moveDirectionZ * moveDirectionZ;
    if (inputLengthSq > 1.0) {
        const inputLength = Math.sqrt(inputLengthSq);
        moveDirectionX /= inputLength; moveDirectionZ /= inputLength;
    }
    const targetVelocityX = moveDirectionX * moveSpeed;
    const targetVelocityZ = moveDirectionZ * moveSpeed;
    const accelFactor = isGrounded ? 0.2 : 0.08;
    currentVel.x = THREE.MathUtils.lerp(currentVel.x, targetVelocityX, accelFactor);
    currentVel.z = THREE.MathUtils.lerp(currentVel.z, targetVelocityZ, accelFactor);

    // --- Apply Gravity ---
    if (!isGrounded) {
        currentVel.y -= GRAVITY * deltaTime;
    } else {
         if (currentVel.y > 0) currentVel.y = 0;
         currentVel.y = Math.max(currentVel.y, -GRAVITY * deltaTime * 2); // Slight downward force
    }

    // --- Handle Jump ---
    if (Input.keys['Space'] && isGrounded) {
        currentVel.y = JUMP_VELOCITY;
        playerIsGrounded[localPlayerId] = false;
        Input.keys['Space'] = false;
    }

    // --- Handle Dash ---
    if (Input.requestingDash) {
        const dashDir = Input.dashDirection;
        currentVel.x += dashDir.x * DASH_VELOCITY;
        currentVel.z += dashDir.z * DASH_VELOCITY;
        currentVel.y = Math.max(currentVel.y + DASH_VELOCITY * DASH_UP_FACTOR, currentVel.y * 0.5 + DASH_VELOCITY * DASH_UP_FACTOR * 0.5);
        playerIsGrounded[localPlayerId] = false;
        Input.requestingDash = false;
    }

    // --- Handle Shooting ---
    const now = Date.now();
    if (Input.mouseButtons[0] && now > (window.lastShootTime || 0) + SHOOT_COOLDOWN_MS) {
        window.lastShootTime = now;
        performShoot(camera);
        Input.mouseButtons[0] = false;
    }
}

/**
 * Performs collision detection and response for the local player.
 * Updates the player's position directly.
 */
function checkPlayerCollisionAndMove(playerMesh, playerVelocity, deltaTime) {
    // ... (Keep the existing checkWallCollision and checkCeilingFloorCollision helper functions) ...
    /** Helper for Wall Collision Check */
    function checkWallCollision(currentPosFeet, direction, distance, collisionObjects) {
        const offsets = [PLAYER_RADIUS * 0.5, PLAYER_HEIGHT / 2, PLAYER_HEIGHT - PLAYER_RADIUS * 0.5];
        const checkDistance = PLAYER_RADIUS + distance + 0.01;
        for (const offsetY of offsets) {
            const checkOrigin = currentPosFeet.clone().add(new THREE.Vector3(0, offsetY, 0));
            tempRaycaster.set(checkOrigin, direction); tempRaycaster.far = checkDistance;
            const intersects = tempRaycaster.intersectObjects(collisionObjects, true);
            if (intersects.length > 0 && intersects[0].distance <= (PLAYER_RADIUS + distance)) { return true; }
        }
        return false;
    }
    /** Helper for Ceiling/Floor Collision Check */
    function checkCeilingFloorCollision(currentPosFeet, direction, distance, movingUp, collisionObjects) {
        const offset = movingUp ? PLAYER_HEIGHT - 0.1 : 0.1;
        const checkOrigin = currentPosFeet.clone().add(new THREE.Vector3(0, offset, 0));
        tempRaycaster.set(checkOrigin, direction); tempRaycaster.far = distance + 0.05;
        const intersects = tempRaycaster.intersectObjects(collisionObjects, true);
        return intersects.length > 0;
    }

    // --- Main collision logic ---
    if (!playerMesh || !playerVelocity || !window.mapMesh) {
        // console.warn("Collision check skipped: Missing playerMesh, velocity, or mapMesh");
        return playerIsGrounded[localPlayerId] ?? false;
    }

    const currentPosition = playerMesh.position;
    const movementVector = tempVec.copy(playerVelocity).multiplyScalar(deltaTime);
    const collisionObjects = [window.mapMesh];

    // --- Ground Check (Before Movement) ---
    const groundRayOriginOffset = 0.1;
    const groundRayOriginBefore = currentPosition.clone().add(new THREE.Vector3(0, groundRayOriginOffset, 0));
    const groundRayDirection = new THREE.Vector3(0, -1, 0);
    tempGroundRay.set(groundRayOriginBefore, groundRayDirection);
    tempGroundRay.far = groundRayOriginOffset + STEP_HEIGHT + GROUND_CHECK_DIST;
    const groundIntersectsBefore = tempGroundRay.intersectObjects(collisionObjects, true);
    const onGroundBeforeMove = groundIntersectsBefore.length > 0 && groundIntersectsBefore[0].distance <= groundRayOriginOffset + GROUND_CHECK_DIST * 0.5;

    // --- Movement with Collision ---
    let finalPosition = currentPosition.clone();
    let collidedX = false, collidedY = false, collidedZ = false;

    // Move X
    if (Math.abs(movementVector.x) > 0.001) {
        if (!checkWallCollision(finalPosition, new THREE.Vector3(Math.sign(movementVector.x), 0, 0), Math.abs(movementVector.x), collisionObjects)) {
            finalPosition.x += movementVector.x;
        } else { playerVelocity.x = 0; collidedX = true; }
    }
    // Move Z
    if (Math.abs(movementVector.z) > 0.001) {
        if (!checkWallCollision(finalPosition, new THREE.Vector3(0, 0, Math.sign(movementVector.z)), Math.abs(movementVector.z), collisionObjects)) {
            finalPosition.z += movementVector.z;
        } else { playerVelocity.z = 0; collidedZ = true; }
    }
     // Move Y
    if (Math.abs(movementVector.y) > 0.001) {
        const movingUp = movementVector.y > 0;
        if (!checkCeilingFloorCollision(finalPosition, new THREE.Vector3(0, (movingUp ? 1 : -1), 0), Math.abs(movementVector.y), movingUp, collisionObjects)) {
            finalPosition.y += movementVector.y;
        } else { playerVelocity.y = 0; collidedY = true; }
    }

    // --- Final Ground Check & Step Up ---
    let isGrounded = false;
    const groundRayOriginFinal = finalPosition.clone().add(new THREE.Vector3(0, groundRayOriginOffset, 0));
    tempGroundRay.set(groundRayOriginFinal, groundRayDirection);
    tempGroundRay.far = groundRayOriginOffset + STEP_HEIGHT + GROUND_CHECK_DIST;
    const finalGroundIntersects = tempGroundRay.intersectObjects(collisionObjects, true);

    // ***** TEMPORARY LOGGING *****
    // let groundCheckDebug = `GCheck: OriginY=${groundRayOriginFinal.y.toFixed(2)}, Far=${tempGroundRay.far.toFixed(2)}, Hits=${finalGroundIntersects.length}`;
    // **************************

    if (finalGroundIntersects.length > 0) {
        const hitPoint = finalGroundIntersects[0].point;
        const hitDistance = finalGroundIntersects[0].distance;
        // groundCheckDebug += `, HitDist=${hitDistance.toFixed(2)}`; // Add hit distance to log

        // Grounded if hit is close enough
        if (hitDistance <= groundRayOriginOffset + GROUND_CHECK_DIST * 0.5) {
            isGrounded = true;
            finalPosition.y = hitPoint.y; // Snap feet
            if (playerVelocity.y < 0) playerVelocity.y = 0;
        }
        // Step up check
        else if (hitDistance <= groundRayOriginOffset + STEP_HEIGHT && onGroundBeforeMove && (collidedX || collidedZ || playerVelocity.y <=0) ) {
            const stepUpOrigin = hitPoint.clone().add(new THREE.Vector3(0, PLAYER_HEIGHT - 0.1, 0));
            tempRaycaster.set(stepUpOrigin, new THREE.Vector3(0,-1,0)); tempRaycaster.far = PLAYER_HEIGHT - 0.2;
             if (tempRaycaster.intersectObjects(collisionObjects, true).length === 0) { // Check for headroom
                isGrounded = true;
                finalPosition.y = hitPoint.y; // Step up
                if (playerVelocity.y < 0) playerVelocity.y = 0;
                // groundCheckDebug += ", SteppedUp=true";
            } else {
                isGrounded = false; // Cannot step up, blocked
                // groundCheckDebug += ", SteppedUp=false(Blocked)";
            }
        } else {
             isGrounded = false; // In air or falling off edge
            //  groundCheckDebug += ", SteppedUp=false(TooFar/Airborne)";
        }
    } else {
        isGrounded = false; // In the air
        // groundCheckDebug += ", NoHits";
    }

    // ***** TEMPORARY LOGGING *****
    // if(localPlayerId) { // Only log for local player
    //     console.log(groundCheckDebug + `, FinalGrounded=${isGrounded}, VelY=${playerVelocity.y.toFixed(2)}, PosY=${finalPosition.y.toFixed(2)}`);
    // }
    // **************************


    // --- Void Check ---
    if (finalPosition.y < CONFIG.VOID_Y_LEVEL) {
        console.log(`Player ${localPlayerId} fell into void.`);
        const localPlayer = window.players[localPlayerId];
        if (localPlayer && localPlayer.health > 0) {
            localPlayer.health = 0;
            UIManager?.updateHealthBar(0);
            Network?.sendVoidDeath();
        }
        return false; // Not grounded, prevents position update below
    }

    // Update the actual player mesh position
    playerMesh.position.copy(finalPosition);

    return isGrounded;
}

/**
 * Performs shooting logic: Raycast, send hit, trigger effects/rocket jump.
 */
function performShoot(camera) {
    // ... (Keep the existing performShoot function content as provided in the previous response) ...
    // ... (It handles raycasting for hits and rocket jump velocity) ...
    if (!camera || !Network || !scene) { return; }
    if (window.gunSoundBuffer) { Effects.playSound(window.gunSoundBuffer, null, false, 0.4); }

    const raycaster = new THREE.Raycaster();
    const origin = new THREE.Vector3(); const direction = new THREE.Vector3();
    camera.getWorldPosition(origin); camera.getWorldDirection(direction);
    raycaster.set(origin, direction); raycaster.far = BULLET_MAX_RANGE;

    const potentialTargets = [];
    for (const id in window.players) {
        if (id !== localPlayerId && window.players[id]?.mesh && window.players[id].health > 0) {
            potentialTargets.push(window.players[id].mesh);
        }
    }
    const intersects = raycaster.intersectObjects(potentialTargets, true);
    let hitDetected = false;
    if (intersects.length > 0) {
        intersects.sort((a, b) => a.distance - b.distance);
        for (const hit of intersects) {
            let hitObject = hit.object; let hitPlayerId = null;
            while (hitObject && !hitPlayerId) {
                if (hitObject.userData?.isPlayer && hitObject.userData?.entityId !== localPlayerId) { hitPlayerId = hitObject.userData.entityId; }
                hitObject = hitObject.parent;
            }
            if (hitPlayerId && window.players[hitPlayerId]?.health > 0) {
                Network.sendPlayerHit({ targetId: hitPlayerId, damage: BULLET_DMG });
                hitDetected = true; break;
            }
        }
    }

    // Rocket Jump
    if (Input.keys['KeyC']) {
        const worldDown = new THREE.Vector3(0, -1, 0);
        if (direction.dot(worldDown) < ROCKET_JUMP_THRESH) {
            const localPlayerVelocity = playerVelocities[localPlayerId];
            if (localPlayerVelocity) {
                localPlayerVelocity.y += ROCKET_JUMP_VEL;
                playerIsGrounded[localPlayerId] = false;
            }
        }
    }
}

/**
 * Applies velocity change to nearby players on death.
 */
function applyShockwave(originPosition, deadPlayerId) {
     // ... (Keep the existing applyShockwave function content as provided in the previous response) ...
     // ... (It iterates players and applies velocity changes) ...
     if (!window.players || !playerVelocities) return;
    const origin = originPosition;

    for (const targetId in window.players) {
        if (targetId === deadPlayerId || !playerVelocities[targetId]) continue;
        const targetPlayer = window.players[targetId];
        const targetMesh = targetPlayer?.mesh;
        if (!targetMesh || targetPlayer.health <= 0) continue;

        try {
            const targetPos = targetMesh.position.clone().add(new THREE.Vector3(0, PLAYER_CENTER_OFFSET, 0));
            const direction = tempVec.subVectors(targetPos, origin);
            const distance = direction.length();

            if (distance < DEATH_SHOCKWAVE_RADIUS && distance > 0.01) {
                const forceFalloff = 1.0 - (distance / DEATH_SHOCKWAVE_RADIUS);
                const velocityMagnitude = DEATH_SHOCKWAVE_VEL * forceFalloff;
                direction.normalize();
                const targetVelocity = playerVelocities[targetId];
                targetVelocity.x += direction.x * velocityMagnitude;
                targetVelocity.y += direction.y * velocityMagnitude * 0.5 + velocityMagnitude * 0.6; // Boost upwards
                targetVelocity.z += direction.z * velocityMagnitude;
                if (playerIsGrounded[targetId]) { playerIsGrounded[targetId] = false; }
            }
        } catch (e) { console.error(`Error calculating shockwave for player ${targetId}:`, e); }
    }
}

/**
 * Checks if the local player has moved/rotated enough and sends an update.
 */
function sendLocalPlayerUpdateIfNeeded(localPlayerMesh, camera) {
     // ... (Keep the existing sendLocalPlayerUpdateIfNeeded function content as provided in the previous response) ...
     // ... (It compares current pos/rot with lastSent pos/rot and emits if changed) ...
      if (!localPlayerId || !window.players[localPlayerId]) return;
     const localPlayer = window.players[localPlayerId];
     if (!localPlayer || !localPlayerMesh || !camera || localPlayer.health <= 0) return;

     try {
         const feetPos = localPlayerMesh.position;
         const cameraEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
         const currentRotationY = cameraEuler.y;
         const posThresholdSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ ?? 0.001;
         const rotThreshold = 0.02;

         const positionChanged = ((feetPos.x - (localPlayer.lastSentX ?? feetPos.x))**2 + (feetPos.y - (localPlayer.lastSentY ?? feetPos.y))**2 + (feetPos.z - (localPlayer.lastSentZ ?? feetPos.z))**2) > posThresholdSq;
         const rotationDiff = Math.abs(currentRotationY - (localPlayer.lastSentRotY ?? currentRotationY));
         const rotationChanged = Math.min(rotationDiff, Math.abs(rotationDiff - Math.PI * 2)) > rotThreshold;

         if (positionChanged || rotationChanged) {
             localPlayer.lastSentX = feetPos.x; localPlayer.lastSentY = feetPos.y; localPlayer.lastSentZ = feetPos.z; localPlayer.lastSentRotY = currentRotationY;
             localPlayer.x = feetPos.x; localPlayer.y = feetPos.y; localPlayer.z = feetPos.z; localPlayer.rotationY = currentRotationY;
             Network?.sendPlayerUpdate({ x: feetPos.x, y: feetPos.y, z: feetPos.z, rotationY: currentRotationY });
         }
     } catch(e) { console.error("!!! Error calculating/sending network update:", e); }
}


console.log("gameLogic.js loaded (Manual Raycasting v2 - Logging)");
// --- END OF FULL gameLogic.js FILE ---
