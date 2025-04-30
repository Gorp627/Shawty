// --- START OF FULL gameLogic.js FILE (Manual Raycasting v3 - More Logging) ---
// docs/gameLogic.js (Manual Raycasting v3 - More Logging)

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
    // console.log("UpdateLocalPlayerInput called"); // <-- TEMP LOG
    if (!localPlayerId || !window.players || !window.playerVelocities || !window.playerIsGrounded) return;
    const localPlayer = window.players[localPlayerId];
    if (!localPlayer || !localPlayerMesh || !window.playerVelocities[localPlayerId]) return;

    const currentVel = playerVelocities[localPlayerId];
    const isGrounded = playerIsGrounded[localPlayerId];

    const isPlaying = stateMachine?.is('playing');
    const isLocked = window.controls?.isLocked;
    if (!isPlaying || !isLocked || localPlayer.health <= 0) {
        currentVel.x *= 0.9; currentVel.z *= 0.9;
        if (Math.abs(currentVel.x) < 0.1) currentVel.x = 0;
        if (Math.abs(currentVel.z) < 0.1) currentVel.z = 0;
        if (!isGrounded) currentVel.y -= GRAVITY * deltaTime; // Still apply gravity when dead/paused
        // console.log(`Velocity (Paused/Dead): X=${currentVel.x.toFixed(2)}, Y=${currentVel.y.toFixed(2)}, Z=${currentVel.z.toFixed(2)}, Grounded=${isGrounded}`);
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
         currentVel.y = Math.max(currentVel.y, -GRAVITY * deltaTime * 2);
    }

    // --- Handle Jump ---
    if (Input.keys['Space'] && isGrounded) {
        currentVel.y = JUMP_VELOCITY;
        playerIsGrounded[localPlayerId] = false; // Make airborne immediately on jump
        Input.keys['Space'] = false;
    }

    // --- Handle Dash ---
    if (Input.requestingDash) {
        const dashDir = Input.dashDirection;
        currentVel.x += dashDir.x * DASH_VELOCITY;
        currentVel.z += dashDir.z * DASH_VELOCITY;
        currentVel.y = Math.max(currentVel.y + DASH_VELOCITY * DASH_UP_FACTOR, currentVel.y * 0.5 + DASH_VELOCITY * DASH_UP_FACTOR * 0.5);
        playerIsGrounded[localPlayerId] = false; // Make airborne on dash
        Input.requestingDash = false;
    }

    // --- Handle Shooting ---
    const now = Date.now();
    if (Input.mouseButtons[0] && now > (window.lastShootTime || 0) + SHOOT_COOLDOWN_MS) {
        window.lastShootTime = now;
        performShoot(camera);
        Input.mouseButtons[0] = false;
    }

    // ***** ADD LOG HERE *****
    // console.log(`Velocity after input: X=${currentVel.x.toFixed(2)}, Y=${currentVel.y.toFixed(2)}, Z=${currentVel.z.toFixed(2)}, Grounded=${isGrounded}`);
} // End of updateLocalPlayerInput


/**
 * Performs collision detection and response for the local player.
 * Updates the player's position directly.
 */
function checkPlayerCollisionAndMove(playerMesh, playerVelocity, deltaTime) {
    // console.log(`CheckPlayerCollisionAndMove called - VelIn: Y=${playerVelocity.y.toFixed(3)}`); // <-- TEMP LOG

    /** Helper for Wall Collision Check */
    function checkWallCollision(currentPosFeet, direction, distance, collisionObjects) {
        const offsets = [PLAYER_RADIUS * 0.5, PLAYER_HEIGHT / 2, PLAYER_HEIGHT - PLAYER_RADIUS * 0.5];
        const checkDistance = PLAYER_RADIUS + distance; // Check exactly radius + distance

        for (const offsetY of offsets) {
            const checkOrigin = currentPosFeet.clone().add(new THREE.Vector3(0, offsetY, 0));
            tempRaycaster.set(checkOrigin, direction);
            tempRaycaster.far = checkDistance; // Set ray length precisely

            const intersects = tempRaycaster.intersectObjects(collisionObjects, true);

            // Check if the closest hit is within the actual movement radius
            if (intersects.length > 0 && intersects[0].distance <= checkDistance + 0.01) { // Add tolerance
                // console.log(`Wall Collision: Dir=${direction.x.toFixed(1)},${direction.z.toFixed(1)} OffsetY=${offsetY.toFixed(1)} HitDist=${intersects[0].distance.toFixed(2)} CheckDist=${checkDistance.toFixed(2)}`);
                return true; // Collision detected
            }
        }
        return false; // No collision
    }

    /** Helper for Ceiling/Floor Collision Check */
    function checkCeilingFloorCollision(currentPosFeet, direction, distance, movingUp, collisionObjects) {
        const offset = movingUp ? PLAYER_HEIGHT - 0.1 : 0.1;
        const checkOrigin = currentPosFeet.clone().add(new THREE.Vector3(0, offset, 0));
        tempRaycaster.set(checkOrigin, direction);
        tempRaycaster.far = distance + 0.05; // Check slightly beyond movement

        const intersects = tempRaycaster.intersectObjects(collisionObjects, true);
        // if (intersects.length > 0) {
        //     console.log(`Y Collision: Dir=${direction.y} OffsetY=${offset.toFixed(1)} HitDist=${intersects[0].distance.toFixed(2)} CheckDist=${(distance+0.05).toFixed(2)}`);
        // }
        return intersects.length > 0; // Any hit means collision
    }

    // --- Main collision logic ---
    if (!playerMesh || !playerVelocity || !window.mapMesh) {
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
        const wallHitX = checkWallCollision(finalPosition, new THREE.Vector3(Math.sign(movementVector.x), 0, 0), Math.abs(movementVector.x), collisionObjects);
        // console.log(`Move X Check: Target=${(finalPosition.x + movementVector.x).toFixed(2)}, Hit=${wallHitX}`); // <-- LOG X
        if (!wallHitX) {
            finalPosition.x += movementVector.x;
        } else { playerVelocity.x = 0; collidedX = true; }
    }
    // Move Z
    if (Math.abs(movementVector.z) > 0.001) {
        const wallHitZ = checkWallCollision(finalPosition, new THREE.Vector3(0, 0, Math.sign(movementVector.z)), Math.abs(movementVector.z), collisionObjects);
        // console.log(`Move Z Check: Target=${(finalPosition.z + movementVector.z).toFixed(2)}, Hit=${wallHitZ}`); // <-- LOG Z
        if (!wallHitZ) {
            finalPosition.z += movementVector.z;
        } else { playerVelocity.z = 0; collidedZ = true; }
    }
     // Move Y
    if (Math.abs(movementVector.y) > 0.001) {
        const movingUp = movementVector.y > 0;
        const yDir = movingUp ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, -1, 0);
        const ceilingFloorHit = checkCeilingFloorCollision(finalPosition, yDir, Math.abs(movementVector.y), movingUp, collisionObjects);
        // console.log(`Move Y Check: Target=${(finalPosition.y + movementVector.y).toFixed(2)}, Up=${movingUp}, Hit=${ceilingFloorHit}`); // <-- LOG Y
        if (!ceilingFloorHit) {
            finalPosition.y += movementVector.y;
        } else {
             if (!movingUp) { collidedY = true; } // Mark floor collision
             playerVelocity.y = 0;
         }
    }

    // --- Final Ground Check & Step Up Logic ---
    let isGrounded = false;
    const groundRayOriginFinal = finalPosition.clone().add(new THREE.Vector3(0, groundRayOriginOffset, 0));
    tempGroundRay.set(groundRayOriginFinal, groundRayDirection);
    const currentGroundCheckDist = groundRayOriginOffset + (playerVelocity.y <= 0 ? STEP_HEIGHT + GROUND_CHECK_DIST : GROUND_CHECK_DIST);
    tempGroundRay.far = currentGroundCheckDist;
    const finalGroundIntersects = tempGroundRay.intersectObjects(collisionObjects, true);

    let groundCheckDebug = `GChk: OY=${groundRayOriginFinal.y.toFixed(2)}, Far=${tempGroundRay.far.toFixed(2)}, Hits=${finalGroundIntersects.length}`;

    if (finalGroundIntersects.length > 0) {
        const hitPoint = finalGroundIntersects[0].point;
        const hitDistance = finalGroundIntersects[0].distance;
        groundCheckDebug += `, HDist=${hitDistance.toFixed(2)}`;

        if (hitDistance <= groundRayOriginOffset + GROUND_CHECK_DIST * 0.5) {
            isGrounded = true;
            finalPosition.y = hitPoint.y;
            if (playerVelocity.y < 0) playerVelocity.y = 0;
        }
        else if (hitDistance <= groundRayOriginOffset + STEP_HEIGHT && (onGroundBeforeMove || collidedY) && (collidedX || collidedZ || playerVelocity.y <=0) ) {
            const stepUpOrigin = hitPoint.clone().add(new THREE.Vector3(0, PLAYER_HEIGHT - 0.1, 0));
            tempRaycaster.set(stepUpOrigin, new THREE.Vector3(0,-1,0)); tempRaycaster.far = PLAYER_HEIGHT - 0.2;
             if (tempRaycaster.intersectObjects(collisionObjects, true).length === 0) {
                isGrounded = true;
                finalPosition.y = hitPoint.y;
                if (playerVelocity.y < 0) playerVelocity.y = 0;
                groundCheckDebug += ", StepUp=OK";
            } else {
                isGrounded = false;
                groundCheckDebug += ", StepUp=Blk";
            }
        } else {
             isGrounded = false;
             groundCheckDebug += ", StepUp=No";
        }
    } else {
        isGrounded = false;
        groundCheckDebug += ", NoHits";
    }

    // ***** MORE LOGGING *****
    if(localPlayerId) {
        // console.log(groundCheckDebug + `, Grounded=${isGrounded}, VelY=${playerVelocity.y.toFixed(3)}, PosY=${finalPosition.y.toFixed(3)}`);
    }
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
        return false;
    }

    // Update the actual player mesh position
    playerMesh.position.copy(finalPosition);

    // console.log(`Collision Check Result: Grounded=${isGrounded}, Final Pos Y=${finalPosition.y.toFixed(2)}, Vel Y=${playerVelocity.y.toFixed(2)}`);
    return isGrounded;
}


/**
 * Performs shooting logic: Raycast, send hit, trigger effects/rocket jump.
 */
function performShoot(camera) {
    // console.log("PerformShoot called"); // <-- TEMP LOG
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
                console.log(`Hit player ${hitPlayerId} at distance ${hit.distance}`); // Keep hit log
                Network.sendPlayerHit({ targetId: hitPlayerId, damage: BULLET_DMG });
                hitDetected = true; break;
            }
        }
    }

    // Rocket Jump
    if (Input.keys['KeyC']) {
        // console.log("Checking Rocket Jump"); // <-- TEMP LOG
        const worldDown = new THREE.Vector3(0, -1, 0);
        const dotProd = direction.dot(worldDown);
        // console.log("Rocket Jump Dot Product:", dotProd); // <-- TEMP LOG
        if (dotProd < ROCKET_JUMP_THRESH) {
            const localPlayerVelocity = playerVelocities[localPlayerId];
            if (localPlayerVelocity) {
                console.log("Applying Rocket Jump Velocity"); // Keep this log
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
     if (!window.players || !playerVelocities) return;
    // console.log(`Applying shockwave from dead player ${deadPlayerId} at`, originPosition);
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
                // console.log(`Applying shockwave velocity change to ${targetId}`);
                if (playerIsGrounded[targetId]) { playerIsGrounded[targetId] = false; }
            }
        } catch (e) { console.error(`Error calculating shockwave for player ${targetId}:`, e); }
    }
}


/**
 * Checks if the local player has moved/rotated enough and sends an update.
 */
function sendLocalPlayerUpdateIfNeeded(localPlayerMesh, camera) {
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


console.log("gameLogic.js loaded (Manual Raycasting v3 - More Logging)");
// --- END OF FULL gameLogic.js FILE ---
