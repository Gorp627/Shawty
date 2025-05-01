// --- START OF FULL gameLogic.js FILE (CLASS-BASED REFACTOR v1 - ACCEPTS INPUT STATE) ---
// docs/gameLogic.js - Encapsulates game simulation logic

// Accesses globals: CONFIG, THREE, Network, UIManager, stateMachine, Effects, scene, mapMesh, players, localPlayerId, playerVelocities, playerIsGrounded

console.log("gameLogic.js loading (CLASS-BASED REFACTOR v1 - ACCEPTS INPUT STATE)...");

class GameLogic {
    constructor(gameInstance) {
        console.log("[GameLogic] Constructor called.");
        this.game = gameInstance; // Reference back to the main Game instance (optional, but can be useful)

        // --- Constants (derived from global CONFIG) ---
        this.GRAVITY = CONFIG?.GRAVITY_ACCELERATION ?? 28.0;
        this.JUMP_VELOCITY = CONFIG?.JUMP_INITIAL_VELOCITY ?? 9.0;
        this.DASH_VELOCITY = CONFIG?.DASH_VELOCITY_MAGNITUDE ?? 15.0;
        this.DASH_UP_FACTOR = CONFIG?.DASH_UP_FACTOR ?? 0.15;
        this.GROUND_CHECK_DIST = CONFIG?.GROUND_CHECK_DISTANCE ?? 0.25;
        // Use player height/radius directly from CONFIG where needed
        this.PLAYER_HEIGHT = CONFIG?.PLAYER_HEIGHT ?? 1.8;
        this.STEP_HEIGHT = CONFIG?.PLAYER_STEP_HEIGHT ?? 0.3;
        this.SHOOT_COOLDOWN_MS = CONFIG?.SHOOT_COOLDOWN ?? 150;
        this.BULLET_DMG = CONFIG?.BULLET_DAMAGE ?? 25;
        this.BULLET_MAX_RANGE = CONFIG?.BULLET_RANGE ?? 300;
        this.ROCKET_JUMP_VEL = CONFIG?.ROCKET_JUMP_VELOCITY ?? 12.0;
        this.DEATH_SHOCKWAVE_VEL = CONFIG?.DEATH_SHOCKWAVE_VELOCITY ?? 18.0;
        this.DEATH_SHOCKWAVE_RADIUS = CONFIG?.DEATH_EXPLOSION_RADIUS ?? 15.0;

        // --- Reusable THREE objects ---
        this.tempVec = new THREE.Vector3();
        this.tempVec2 = new THREE.Vector3();
        this.tempRaycaster = new THREE.Raycaster();
        this.tempGroundRay = new THREE.Raycaster();

        console.log("[GameLogic] Instance created.");
    }

    // Method inside the GameLogic class
    /**
     * Updates the local player's velocity based on input state passed as an argument.
     * !!! MODIFIED SIGNATURE & INTERNAL ACCESS !!!
     */
    updateLocalPlayerInput(deltaTime, camera, localPlayerMesh, inputState) { // <-- Added inputState argument
        // Use this.GRAVITY etc. instead of global constants

        // Use guards - ensure player/velocity/grounded maps exist from global scope
        if (!localPlayerId || !window.players || !window.playerVelocities || !window.playerIsGrounded || !inputState) return; // Check inputState exists
        const localPlayer = window.players[localPlayerId];
        if (!localPlayer || !localPlayerMesh || !window.playerVelocities[localPlayerId]) return;
        const isGrounded = window.playerIsGrounded.hasOwnProperty(localPlayerId) ? window.playerIsGrounded[localPlayerId] : false;
        const currentVel = window.playerVelocities[localPlayerId];

        // Preserve current Y velocity unless jumping or dashing modifies it
        const previousVelY = currentVel.y;

        // Reset horizontal velocity each frame before applying input directly
        currentVel.x = 0;
        currentVel.z = 0;
        // Keep vertical velocity for gravity/jump/dash continuity, unless grounded
        if (isGrounded && previousVelY < 0) {
             currentVel.y = 0; // Reset Y velocity if landing
        } else {
             currentVel.y = previousVelY; // Keep previous Y velocity if airborne or moving up
        }

        // Use inputState argument instead of global Input
        const keys = inputState.keys;
        const mouseButtons = inputState.mouseButtons;
        const requestingDash = inputState.requestingDash;
        const dashDirection = inputState.dashDirection;
        const isLocked = inputState.isLocked; // Get lock state from passed object

        console.log(`[DEBUG InputLogic Start (State Passed)] Vel In:(${currentVel.x.toFixed(2)}, ${currentVel.y.toFixed(2)}, ${currentVel.z.toFixed(2)}), Grounded: ${isGrounded}, Locked: ${isLocked}`); // DEBUG

        const isPlaying = stateMachine?.is('playing');

        // Only process input if playing, locked, and alive
        if (isPlaying && isLocked && localPlayer.health > 0) {

            // --- Horizontal Movement (Direct Set) ---
            const moveSpeed = keys['ShiftLeft'] ? (CONFIG?.MOVEMENT_SPEED_SPRINTING ?? 10.5) : (CONFIG?.MOVEMENT_SPEED ?? 7.0); // Use local keys
            const forward = this.tempVec.set(0, 0, -1).applyQuaternion(camera.quaternion); forward.y = 0; forward.normalize();
            const right = this.tempVec2.set(1, 0, 0).applyQuaternion(camera.quaternion); right.y = 0; right.normalize();
            let moveDirectionX = 0;
            let moveDirectionZ = 0;
            let inputDetected = false; // DEBUG Flag

            if (keys['KeyW']) { moveDirectionX += forward.x; moveDirectionZ += forward.z; inputDetected = true; } // Use local keys
            if (keys['KeyS']) { moveDirectionX -= forward.x; moveDirectionZ -= forward.z; inputDetected = true; } // Use local keys
            if (keys['KeyA']) { moveDirectionX -= right.x; moveDirectionZ -= right.z; inputDetected = true; } // Use local keys
            if (keys['KeyD']) { moveDirectionX += right.x; moveDirectionZ += right.z; inputDetected = true; } // Use local keys

            if(inputDetected) { // Only apply velocity if WASD is pressed
                const inputLengthSq = moveDirectionX * moveDirectionX + moveDirectionZ * moveDirectionZ;
                if (inputLengthSq > 0.001) { // Normalize if necessary
                    if (inputLengthSq > 1.0) {
                        const inputLength = Math.sqrt(inputLengthSq);
                        moveDirectionX /= inputLength; moveDirectionZ /= inputLength;
                    }
                    // *** DIRECTLY SET VELOCITY ***
                    currentVel.x = moveDirectionX * moveSpeed;
                    currentVel.z = moveDirectionZ * moveSpeed;
                    console.log(`[DEBUG InputLogic Move (State Passed)] Applied Vel: (${currentVel.x.toFixed(2)}, ${currentVel.z.toFixed(2)})`); // DEBUG
                }
            } else {
                 // console.log(`[DEBUG InputLogic Move (State Passed)] No WASD detected.`); // DEBUG
            }

            // --- Handle Jump ---
            if (keys['Space'] && isGrounded) { // Use local keys
                console.log("[DEBUG InputLogic Jump (State Passed)] Applying Jump Velocity!"); // DEBUG
                currentVel.y = this.JUMP_VELOCITY;
                window.playerIsGrounded[localPlayerId] = false;
                // Consumption of Space key should happen in input.js or game.js now
                 if(window.Input) window.Input.keys['Space'] = false; // Consume globally after processing locally
            }

             // --- Handle Dash ---
             if (requestingDash) { // Use local requestingDash
                 console.log("[DEBUG InputLogic Dash (State Passed)] Consuming Dash Request!"); // DEBUG
                 const dashDir = dashDirection; // Use local dashDirection
                 // Apply dash velocity additively
                 currentVel.x += dashDir.x * this.DASH_VELOCITY;
                 currentVel.z += dashDir.z * this.DASH_VELOCITY;
                 currentVel.y = Math.max(currentVel.y + this.DASH_VELOCITY * this.DASH_UP_FACTOR, currentVel.y * 0.5 + this.DASH_VELOCITY * this.DASH_UP_FACTOR * 0.5);
                 window.playerIsGrounded[localPlayerId] = false;
                 // Consume dash request globally AFTER processing it here
                 if(window.Input) window.Input.requestingDash = false;
             }

             // --- Handle Shooting ---
             const now = Date.now();
             const shootReadyTime = (window.lastShootTime || 0) + this.SHOOT_COOLDOWN_MS;
             if (mouseButtons[0] && now > shootReadyTime) { // Use local mouseButtons
                 console.log("[DEBUG InputLogic Shoot (State Passed)] Shoot Triggered!"); // DEBUG
                 window.lastShootTime = now;
                 this.performShoot(camera);
             }

        } // End if (isPlaying && isLocked && localPlayer.health > 0)


        // --- Apply Gravity (Always applies if not grounded) ---
         const velYBeforeGravity = currentVel.y; // DEBUG
         if (!isGrounded) {
             currentVel.y -= this.GRAVITY * deltaTime;
         }
         // if (currentVel.y !== velYBeforeGravity) console.log(`[DEBUG InputLogic Gravity (State Passed)] Applied. VelY: ${currentVel.y.toFixed(2)} (was ${velYBeforeGravity.toFixed(2)}), Grounded: ${isGrounded}`); // DEBUG


         console.log(`[DEBUG InputLogic End (State Passed)] Vel Out:(${currentVel.x.toFixed(2)}, ${currentVel.y.toFixed(2)}, ${currentVel.z.toFixed(2)})`); // DEBUG
    } // End of updateLocalPlayerInput method


    /**
     * Performs collision detection and response for the local player.
     * Updates the player's position directly.
     */
    checkPlayerCollisionAndMove(playerMesh, playerVelocity, deltaTime) {
        // (This method's content remains the same as the previous 'Class-Based Refactor v1 - DIRECT VELOCITY SET DEBUG' version)
        // ... collision logic ...
        const localPlayerRadius = CONFIG?.PLAYER_RADIUS ?? 0.4;
        const checkWallCollision = (currentPosFeet, direction, distance, collisionObjects) => { const offsets = [localPlayerRadius * 0.5, this.PLAYER_HEIGHT / 2, this.PLAYER_HEIGHT - localPlayerRadius * 0.5]; const checkDistance = localPlayerRadius + distance; for (const offsetY of offsets) { const checkOrigin = currentPosFeet.clone().add(new THREE.Vector3(0, offsetY, 0)); this.tempRaycaster.set(checkOrigin, direction); this.tempRaycaster.far = checkDistance; const intersects = this.tempRaycaster.intersectObjects(collisionObjects, true); if (intersects.length > 0 && intersects[0].distance <= checkDistance + 0.01) { return true; } } return false; }
        const checkCeilingFloorCollision = (currentPosFeet, direction, distance, movingUp, collisionObjects) => { const offset = movingUp ? this.PLAYER_HEIGHT - 0.1 : 0.1; const checkOrigin = currentPosFeet.clone().add(new THREE.Vector3(0, offset, 0)); this.tempRaycaster.set(checkOrigin, direction); this.tempRaycaster.far = distance + 0.05; const intersects = this.tempRaycaster.intersectObjects(collisionObjects, true); return intersects.length > 0; }
        if (!playerMesh || !playerVelocity || !window.mapMesh) { return window.playerIsGrounded[localPlayerId] ?? false; }
        const currentPosition = playerMesh.position; const movementVector = this.tempVec.copy(playerVelocity).multiplyScalar(deltaTime); console.log(`[DEBUG Collision Check Start] PosIn: (${currentPosition.x.toFixed(2)}, ${currentPosition.y.toFixed(2)}, ${currentPosition.z.toFixed(2)}), VelIn: (${playerVelocity.x.toFixed(2)}, ${playerVelocity.y.toFixed(2)}, ${playerVelocity.z.toFixed(2)}), Delta: ${deltaTime.toFixed(4)}`); console.log(`[DEBUG Collision Check Start] Desired MoveVec: (${movementVector.x.toFixed(3)}, ${movementVector.y.toFixed(3)}, ${movementVector.z.toFixed(3)})`);
        const collisionObjects = [window.mapMesh]; const groundRayDirection = new THREE.Vector3(0, -1, 0); const groundRayOriginOffset = 0.1;
        const groundRayOriginBefore = currentPosition.clone().add(new THREE.Vector3(0, groundRayOriginOffset, 0)); this.tempGroundRay.set(groundRayOriginBefore, groundRayDirection); this.tempGroundRay.far = groundRayOriginOffset + this.STEP_HEIGHT + this.GROUND_CHECK_DIST; const groundIntersectsBefore = this.tempGroundRay.intersectObjects(collisionObjects, true); const onGroundBeforeMove = groundIntersectsBefore.length > 0 && groundIntersectsBefore[0].distance <= groundRayOriginOffset + this.GROUND_CHECK_DIST * 0.5;
        let moveX = movementVector.x; let moveY = movementVector.y; let moveZ = movementVector.z; let currentIterPosition = currentPosition.clone();
        if (Math.abs(moveX) > 0.001) { if (checkWallCollision(currentIterPosition, new THREE.Vector3(Math.sign(moveX), 0, 0), Math.abs(moveX), collisionObjects)) { console.log(`[DEBUG Collision Check] X-Collision detected! Halting X move.`); moveX = 0; playerVelocity.x = 0; } currentIterPosition.x += moveX; }
        if (Math.abs(moveZ) > 0.001) { if (checkWallCollision(currentIterPosition, new THREE.Vector3(0, 0, Math.sign(moveZ)), Math.abs(moveZ), collisionObjects)) { console.log(`[DEBUG Collision Check] Z-Collision detected! Halting Z move.`); moveZ = 0; playerVelocity.z = 0; } currentIterPosition.z += moveZ; }
        if (Math.abs(moveY) > 0.001) { const movingUp = moveY > 0; const yDir = movingUp ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, -1, 0); if (checkCeilingFloorCollision(currentIterPosition, yDir, Math.abs(moveY), movingUp, collisionObjects)) { console.log(`[DEBUG Collision Check] Y-Collision detected! (${movingUp?'Ceiling':'Floor'}) Halting Y move.`); moveY = 0; playerVelocity.y = 0; } currentIterPosition.y += moveY; }
        const finalPosition = currentIterPosition; let isGrounded = false; const groundRayOriginFinal = finalPosition.clone().add(new THREE.Vector3(0, groundRayOriginOffset, 0)); this.tempGroundRay.set(groundRayOriginFinal, groundRayDirection); const currentGroundCheckDist = groundRayOriginOffset + (playerVelocity.y <= 0 ? this.STEP_HEIGHT + this.GROUND_CHECK_DIST : this.GROUND_CHECK_DIST); this.tempGroundRay.far = currentGroundCheckDist; const finalGroundIntersects = this.tempGroundRay.intersectObjects(collisionObjects, true);
        if (finalGroundIntersects.length > 0) { const hitPoint = finalGroundIntersects[0].point; const hitDistance = finalGroundIntersects[0].distance; if (hitDistance <= groundRayOriginOffset + this.GROUND_CHECK_DIST * 0.5) { isGrounded = true; finalPosition.y = hitPoint.y; if (playerVelocity.y < 0) playerVelocity.y = 0; } else if (onGroundBeforeMove && playerVelocity.y <= 0 && hitDistance <= groundRayOriginOffset + this.STEP_HEIGHT) { const stepUpOrigin = hitPoint.clone().add(new THREE.Vector3(0, this.PLAYER_HEIGHT - 0.1, 0)); this.tempRaycaster.set(stepUpOrigin, groundRayDirection); this.tempRaycaster.far = this.PLAYER_HEIGHT - 0.2; if (this.tempRaycaster.intersectObjects(collisionObjects, true).length === 0) { console.log(`[DEBUG Collision Check] StepUp Allowed!`); isGrounded = true; finalPosition.y = hitPoint.y; if (playerVelocity.y < 0) playerVelocity.y = 0; } else { isGrounded = false; } } else { isGrounded = false; } } else { isGrounded = false; }
        if (finalPosition.y < CONFIG.VOID_Y_LEVEL) { const localPlayer = window.players[localPlayerId]; if (localPlayer?.health > 0) { localPlayer.health = 0; UIManager?.updateHealthBar(0); Network?.sendVoidDeath(); } return false; }
        playerMesh.position.copy(finalPosition); return isGrounded;

    } // End of checkPlayerCollisionAndMove method

    /**
     * Performs shooting logic: Raycast, send hit, trigger effects/rocket jump.
     */
    performShoot(camera) {
        // (This method's content remains the same - it uses the passed camera and global Input.keys['KeyE'])
        // ... shooting logic ...
        if (!camera || !Network || !scene) { return; } if (window.gunSoundBuffer) { Effects.playSound(window.gunSoundBuffer, null, false, 0.4); }
        const raycaster = new THREE.Raycaster(); const origin = new THREE.Vector3(); const direction = new THREE.Vector3(); camera.getWorldPosition(origin); camera.getWorldDirection(direction); console.log(`[DEBUG ShootLogic] Raycast from (${origin.x.toFixed(1)},${origin.y.toFixed(1)},${origin.z.toFixed(1)}) dir (${direction.x.toFixed(1)},${direction.y.toFixed(1)},${direction.z.toFixed(1)})`);
        raycaster.set(origin, direction); raycaster.far = this.BULLET_MAX_RANGE;
        const potentialTargets = []; for (const id in window.players) { if (id !== localPlayerId && window.players[id]?.mesh && window.players[id].health > 0) { potentialTargets.push(window.players[id].mesh); } } if (window.mapMesh) { potentialTargets.push(window.mapMesh); }
        const intersects = raycaster.intersectObjects(potentialTargets, true); console.log(`[DEBUG ShootLogic] Raycast hit ${intersects.length} objects.`);
        if (intersects.length > 0) { intersects.sort((a, b) => a.distance - b.distance); const nearestHit = intersects[0]; let hitObject = nearestHit.object; let hitPlayerId = null; while (hitObject && !hitPlayerId) { if (hitObject.userData?.entityId === window.localPlayerId) { break; } if (hitObject.userData?.isPlayer) { hitPlayerId = hitObject.userData.entityId; } hitObject = hitObject.parent; } if (hitPlayerId && hitPlayerId !== window.localPlayerId && window.players[hitPlayerId]?.health > 0) { console.log(`[DEBUG ShootLogic] Hit player ${hitPlayerId} (${window.players[hitPlayerId]?.name || '??'})`); Network.sendPlayerHit({ targetId: hitPlayerId, damage: this.BULLET_DMG }); } else { console.log(`[DEBUG ShootLogic] Hit environment/self/dead player`); } } else { console.log("[DEBUG ShootLogic] Shot missed."); }
        if (Input.keys['KeyE']) { console.log("[DEBUG ShootLogic] Checking Rocket Jump (E key held)"); const worldDown = new THREE.Vector3(0, -1, 0); const downwardLookThreshold = 0.5; const dotProd = direction.dot(worldDown); console.log("[DEBUG ShootLogic] Rocket Jump Dot Product (CamDir . WorldDown):", dotProd.toFixed(2)); if (dotProd > downwardLookThreshold) { const localPlayerVelocity = window.playerVelocities[localPlayerId]; if (localPlayerVelocity) { console.log("[DEBUG ShootLogic] Applying Rocket Jump Velocity!"); localPlayerVelocity.y += this.ROCKET_JUMP_VEL; if(window.playerIsGrounded) window.playerIsGrounded[localPlayerId] = false; } } else { console.log("[DEBUG ShootLogic] Rocket Jump condition not met (not looking down enough)."); } }

    } // End of performShoot method

    /**
     * Applies velocity change to nearby players on death.
     */
    applyShockwave(originPosition, deadPlayerId) {
        // (This method's content remains the same)
        // ... shockwave logic ...
        const playerCenterOffset = (CONFIG?.PLAYER_HEIGHT ?? 1.8) / 2.0; if (!window.players || !playerVelocities) { return; } const origin = originPosition; for (const targetId in window.players) { if (targetId === deadPlayerId) continue; const targetVelocity = playerVelocities[targetId]; if(!targetVelocity) continue; const targetPlayer = window.players[targetId]; const targetMesh = targetPlayer?.mesh; if (!targetMesh || targetPlayer.health <= 0) continue; try { const targetPos = targetMesh.position.clone().add(new THREE.Vector3(0, playerCenterOffset, 0)); const direction = this.tempVec.subVectors(targetPos, origin); const distance = direction.length(); if (distance < this.DEATH_SHOCKWAVE_RADIUS && distance > 0.01) { const forceFalloff = 1.0 - (distance / this.DEATH_SHOCKWAVE_RADIUS); const velocityMagnitude = this.DEATH_SHOCKWAVE_VEL * forceFalloff; direction.normalize(); targetVelocity.x += direction.x * velocityMagnitude; targetVelocity.y += direction.y * velocityMagnitude * 0.5 + velocityMagnitude * 0.6; targetVelocity.z += direction.z * velocityMagnitude; if (playerIsGrounded[targetId]) { playerIsGrounded[targetId] = false; } } } catch (e) { console.error(`Error calculating shockwave for player ${targetId}:`, e); } }

    } // End of applyShockwave method


    /**
     * Checks if the local player has moved/rotated enough and sends an update.
     */
    sendLocalPlayerUpdateIfNeeded(localPlayerMesh, camera) {
        // (This method's content remains the same)
        // ... network update logic ...
        if (!localPlayerId || !window.players[localPlayerId]) return; const localPlayer = window.players[localPlayerId]; if (!localPlayer || !localPlayerMesh || !camera || localPlayer.health <= 0) return; try { const feetPos = localPlayerMesh.position; const cameraEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); const currentRotationY = cameraEuler.y; const posThresholdSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ ?? 0.001; const rotThreshold = 0.02; const positionChanged = ((feetPos.x - (localPlayer.lastSentX ?? feetPos.x))**2 + (feetPos.y - (localPlayer.lastSentY ?? feetPos.y))**2 + (feetPos.z - (localPlayer.lastSentZ ?? feetPos.z))**2) > posThresholdSq; const rotationDiff = Math.abs(currentRotationY - (localPlayer.lastSentRotY ?? currentRotationY)); const rotationChanged = Math.min(rotationDiff, Math.abs(rotationDiff - Math.PI * 2)) > rotThreshold; if (positionChanged || rotationChanged) { localPlayer.lastSentX = feetPos.x; localPlayer.lastSentY = feetPos.y; localPlayer.lastSentZ = feetPos.z; localPlayer.lastSentRotY = currentRotationY; localPlayer.x = feetPos.x; localPlayer.y = feetPos.y; localPlayer.z = feetPos.z; localPlayer.rotationY = currentRotationY; Network?.sendPlayerUpdate({ x: feetPos.x, y: feetPos.y, z: feetPos.z, rotationY: currentRotationY }); } } catch(e) { console.error("!!! Error calculating/sending network update:", e); }

    } // End of sendLocalPlayerUpdateIfNeeded method

} // End GameLogic Class

console.log("gameLogic.js loaded successfully (CLASS-BASED REFACTOR v1 - ACCEPTS INPUT STATE).");

// --- END OF FULL gameLogic.js FILE ---
