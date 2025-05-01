// --- START OF FULL gameLogic.js FILE (CLASS-BASED REFACTOR v1 - DIRECT VELOCITY SET DEBUG) ---
// docs/gameLogic.js - Encapsulates game simulation logic

// Accesses globals: CONFIG, THREE, Network, Input, UIManager, stateMachine, Effects, scene, mapMesh, players, localPlayerId, playerVelocities, playerIsGrounded

console.log("gameLogic.js loading (CLASS-BASED REFACTOR v1 - DIRECT VELOCITY SET DEBUG)...");

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
     * Updates the local player's velocity based on input.
     * !!! MODIFIED FOR DEBUGGING: DIRECT VELOCITY SET !!!
     */
    updateLocalPlayerInput(deltaTime, camera, localPlayerMesh) {
        // Use this.GRAVITY etc. instead of global constants

        // Use guards - ensure player/velocity/grounded maps exist from global scope
        if (!localPlayerId || !window.players || !window.playerVelocities || !window.playerIsGrounded) return;
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


        console.log(`[DEBUG InputLogic Start (Direct Set)] Vel In:(${currentVel.x.toFixed(2)}, ${currentVel.y.toFixed(2)}, ${currentVel.z.toFixed(2)}), Grounded: ${isGrounded}`); // DEBUG

        const isPlaying = stateMachine?.is('playing');
        const isLocked = window.controls?.isLocked;

        // Only process input if playing, locked, and alive
        if (isPlaying && isLocked && localPlayer.health > 0) {

            // --- Horizontal Movement (Direct Set) ---
            const moveSpeed = Input.keys['ShiftLeft'] ? (CONFIG?.MOVEMENT_SPEED_SPRINTING ?? 10.5) : (CONFIG?.MOVEMENT_SPEED ?? 7.0);
            const forward = this.tempVec.set(0, 0, -1).applyQuaternion(camera.quaternion); forward.y = 0; forward.normalize();
            const right = this.tempVec2.set(1, 0, 0).applyQuaternion(camera.quaternion); right.y = 0; right.normalize();
            let moveDirectionX = 0;
            let moveDirectionZ = 0;
            let inputDetected = false; // DEBUG Flag

            if (Input.keys['KeyW']) { moveDirectionX += forward.x; moveDirectionZ += forward.z; inputDetected = true; }
            if (Input.keys['KeyS']) { moveDirectionX -= forward.x; moveDirectionZ -= forward.z; inputDetected = true; }
            if (Input.keys['KeyA']) { moveDirectionX -= right.x; moveDirectionZ -= right.z; inputDetected = true; }
            if (Input.keys['KeyD']) { moveDirectionX += right.x; moveDirectionZ += right.z; inputDetected = true; }

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
                    console.log(`[DEBUG InputLogic Move (Direct Set)] Applied Vel: (${currentVel.x.toFixed(2)}, ${currentVel.z.toFixed(2)})`); // DEBUG
                }
            } else {
                 // console.log(`[DEBUG InputLogic Move (Direct Set)] No WASD detected.`); // DEBUG
            }

            // --- Handle Jump ---
            if (Input.keys['Space'] && isGrounded) {
                console.log("[DEBUG InputLogic Jump (Direct Set)] Applying Jump Velocity!"); // DEBUG
                currentVel.y = this.JUMP_VELOCITY;
                window.playerIsGrounded[localPlayerId] = false;
                Input.keys['Space'] = false;
            }

             // --- Handle Dash ---
             if (Input.requestingDash) {
                 console.log("[DEBUG InputLogic Dash (Direct Set)] Consuming Dash Request!"); // DEBUG
                 const dashDir = Input.dashDirection;
                 // Apply dash velocity additively
                 currentVel.x += dashDir.x * this.DASH_VELOCITY;
                 currentVel.z += dashDir.z * this.DASH_VELOCITY;
                 currentVel.y = Math.max(currentVel.y + this.DASH_VELOCITY * this.DASH_UP_FACTOR, currentVel.y * 0.5 + this.DASH_VELOCITY * this.DASH_UP_FACTOR * 0.5);
                 window.playerIsGrounded[localPlayerId] = false;
                 Input.requestingDash = false;
             }

             // --- Handle Shooting ---
             const now = Date.now();
             const shootReadyTime = (window.lastShootTime || 0) + this.SHOOT_COOLDOWN_MS;
             if (Input.mouseButtons[0] && now > shootReadyTime) {
                 console.log("[DEBUG InputLogic Shoot (Direct Set)] Shoot Triggered!"); // DEBUG
                 window.lastShootTime = now;
                 this.performShoot(camera);
             }

        } // End if (isPlaying && isLocked && localPlayer.health > 0)


        // --- Apply Gravity (Always applies if not grounded) ---
         const velYBeforeGravity = currentVel.y; // DEBUG
         if (!isGrounded) {
             currentVel.y -= this.GRAVITY * deltaTime;
         }
         // if (currentVel.y !== velYBeforeGravity) console.log(`[DEBUG InputLogic Gravity (Direct Set)] Applied. VelY: ${currentVel.y.toFixed(2)} (was ${velYBeforeGravity.toFixed(2)}), Grounded: ${isGrounded}`); // DEBUG


         console.log(`[DEBUG InputLogic End (Direct Set)] Vel Out:(${currentVel.x.toFixed(2)}, ${currentVel.y.toFixed(2)}, ${currentVel.z.toFixed(2)})`); // DEBUG
    } // End of updateLocalPlayerInput method (Direct Set Version)


    /**
     * Performs collision detection and response for the local player.
     * Updates the player's position directly.
     */
    checkPlayerCollisionAndMove(playerMesh, playerVelocity, deltaTime) {
        // Use this.PLAYER_HEIGHT etc.
        const localPlayerRadius = CONFIG?.PLAYER_RADIUS ?? 0.4; // Still get from config

        /** Helper for Wall Collision Check */
        const checkWallCollision = (currentPosFeet, direction, distance, collisionObjects) => {
            const offsets = [localPlayerRadius * 0.5, this.PLAYER_HEIGHT / 2, this.PLAYER_HEIGHT - localPlayerRadius * 0.5];
            const checkDistance = localPlayerRadius + distance;
            for (const offsetY of offsets) {
                const checkOrigin = currentPosFeet.clone().add(new THREE.Vector3(0, offsetY, 0));
                this.tempRaycaster.set(checkOrigin, direction); this.tempRaycaster.far = checkDistance;
                const intersects = this.tempRaycaster.intersectObjects(collisionObjects, true);
                if (intersects.length > 0 && intersects[0].distance <= checkDistance + 0.01) {
                    // console.log(`[DEBUG Collision] Wall hit! Dir: ${direction.x.toFixed(1)},${direction.z.toFixed(1)} Dist: ${intersects[0].distance.toFixed(2)} CheckDist: ${checkDistance.toFixed(2)}`); // DEBUG
                    return true; // Collision detected
                }
            }
            return false; // No collision
        }
        /** Helper for Ceiling/Floor Collision Check */
       const checkCeilingFloorCollision = (currentPosFeet, direction, distance, movingUp, collisionObjects) => {
            const offset = movingUp ? this.PLAYER_HEIGHT - 0.1 : 0.1;
            const checkOrigin = currentPosFeet.clone().add(new THREE.Vector3(0, offset, 0));
            this.tempRaycaster.set(checkOrigin, direction); this.tempRaycaster.far = distance + 0.05;
            const intersects = this.tempRaycaster.intersectObjects(collisionObjects, true);
            if(intersects.length > 0) {
                 // console.log(`[DEBUG Collision] Vert hit! Up:${movingUp} Dist: ${intersects[0].distance.toFixed(2)} CheckDist: ${(distance + 0.05).toFixed(2)}`); // DEBUG
            }
            return intersects.length > 0; // Collision detected if any intersects
        }

        if (!playerMesh || !playerVelocity || !window.mapMesh) {
            console.warn("[Collision Check] Skipped - Missing playerMesh, velocity, or mapMesh."); // DEBUG
            return window.playerIsGrounded[localPlayerId] ?? false;
        }

        const currentPosition = playerMesh.position; // Feet position
        const movementVector = this.tempVec.copy(playerVelocity).multiplyScalar(deltaTime); // How much player *wants* to move this frame
        console.log(`[DEBUG Collision Check Start] PosIn: (${currentPosition.x.toFixed(2)}, ${currentPosition.y.toFixed(2)}, ${currentPosition.z.toFixed(2)}), VelIn: (${playerVelocity.x.toFixed(2)}, ${playerVelocity.y.toFixed(2)}, ${playerVelocity.z.toFixed(2)}), Delta: ${deltaTime.toFixed(4)}`); // DEBUG
        console.log(`[DEBUG Collision Check Start] Desired MoveVec: (${movementVector.x.toFixed(3)}, ${movementVector.y.toFixed(3)}, ${movementVector.z.toFixed(3)})`); // DEBUG


        const collisionObjects = [window.mapMesh]; // Objects to collide with
        const groundRayDirection = new THREE.Vector3(0, -1, 0);
        const groundRayOriginOffset = 0.1; // Start ground check slightly above feet

        // --- Ground Check (Before Movement) ---
        // Helps determine if step-up is possible
        const groundRayOriginBefore = currentPosition.clone().add(new THREE.Vector3(0, groundRayOriginOffset, 0));
        this.tempGroundRay.set(groundRayOriginBefore, groundRayDirection);
        this.tempGroundRay.far = groundRayOriginOffset + this.STEP_HEIGHT + this.GROUND_CHECK_DIST; // Check down far enough for stepping
        const groundIntersectsBefore = this.tempGroundRay.intersectObjects(collisionObjects, true);
        const onGroundBeforeMove = groundIntersectsBefore.length > 0 && groundIntersectsBefore[0].distance <= groundRayOriginOffset + this.GROUND_CHECK_DIST * 0.5;
        // console.log(`[DEBUG Collision Check] OnGroundBeforeMove: ${onGroundBeforeMove}`); // DEBUG

        // --- Movement & Collision Resolution ---
        // Apply movement axis by axis and check for collisions at each step
        let moveX = movementVector.x;
        let moveY = movementVector.y;
        let moveZ = movementVector.z;
        let currentIterPosition = currentPosition.clone(); // Start from current position

        // Move X
        if (Math.abs(moveX) > 0.001) {
            if (checkWallCollision(currentIterPosition, new THREE.Vector3(Math.sign(moveX), 0, 0), Math.abs(moveX), collisionObjects)) {
                console.log(`[DEBUG Collision Check] X-Collision detected! Halting X move.`); // DEBUG
                moveX = 0; // Collision, cancel X movement
                playerVelocity.x = 0; // Stop X velocity
            }
            currentIterPosition.x += moveX; // Apply (potentially zeroed) X movement
        }

        // Move Z (Start check from position potentially updated by X move)
        if (Math.abs(moveZ) > 0.001) {
            if (checkWallCollision(currentIterPosition, new THREE.Vector3(0, 0, Math.sign(moveZ)), Math.abs(moveZ), collisionObjects)) {
                console.log(`[DEBUG Collision Check] Z-Collision detected! Halting Z move.`); // DEBUG
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
                console.log(`[DEBUG Collision Check] Y-Collision detected! (${movingUp?'Ceiling':'Floor'}) Halting Y move.`); // DEBUG
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
        this.tempGroundRay.set(groundRayOriginFinal, groundRayDirection);
        // Check distance depends on whether we were moving down or potentially stepping up
        const currentGroundCheckDist = groundRayOriginOffset + (playerVelocity.y <= 0 ? this.STEP_HEIGHT + this.GROUND_CHECK_DIST : this.GROUND_CHECK_DIST);
        this.tempGroundRay.far = currentGroundCheckDist;
        const finalGroundIntersects = this.tempGroundRay.intersectObjects(collisionObjects, true);

        // Debug log string
        // let groundCheckDebug = `GChk: OY=${groundRayOriginFinal.y.toFixed(2)}, Far=${tempGroundRay.far.toFixed(2)}, Hits=${finalGroundIntersects.length}`;

        if (finalGroundIntersects.length > 0) {
            const hitPoint = finalGroundIntersects[0].point;
            const hitDistance = finalGroundIntersects[0].distance;
            // groundCheckDebug += `, HDist=${hitDistance.toFixed(2)}`;

            // Check if the hit is close enough to be considered grounded (within skin width)
            if (hitDistance <= groundRayOriginOffset + this.GROUND_CHECK_DIST * 0.5) {
                isGrounded = true;
                finalPosition.y = hitPoint.y; // Snap feet to ground level
                if (playerVelocity.y < 0) playerVelocity.y = 0; // Stop downward velocity on landing
                // groundCheckDebug += ", Grounded=Yes";
            }
            // Check for step-up condition: Were on ground before, moving down or hit wall, hit is within step height
            else if (onGroundBeforeMove && playerVelocity.y <= 0 && hitDistance <= groundRayOriginOffset + this.STEP_HEIGHT) {
                // Check if space above the step is clear
                const stepUpOrigin = hitPoint.clone().add(new THREE.Vector3(0, this.PLAYER_HEIGHT - 0.1, 0)); // Check from top of player height at step location
                this.tempRaycaster.set(stepUpOrigin, groundRayDirection); // Raycast down from above step
                this.tempRaycaster.far = this.PLAYER_HEIGHT - 0.2; // Check most of the player height is clear
                 if (this.tempRaycaster.intersectObjects(collisionObjects, true).length === 0) { // If no hit, space is clear
                    console.log(`[DEBUG Collision Check] StepUp Allowed!`); // DEBUG
                    isGrounded = true; // Considered grounded after stepping up
                    finalPosition.y = hitPoint.y; // Snap feet to step height
                    if (playerVelocity.y < 0) playerVelocity.y = 0; // Stop downward velocity
                    // groundCheckDebug += ", StepUp=OK";
                } else {
                    // console.log(`[DEBUG Collision Check] StepUp Blocked (Head hit).`); // DEBUG
                    isGrounded = false; /* groundCheckDebug += ", StepUp=Blocked"; */ }
            } else { isGrounded = false; /* groundCheckDebug += ", TooFar/Airborne"; */ }
        } else {
            isGrounded = false; // No ground hit
            // groundCheckDebug += ", NoHits";
        }

        // Print the debug string
        // if(localPlayerId) { console.log(groundCheckDebug + `, isGnd=${isGrounded}, VelY=${playerVelocity.y.toFixed(3)}, FinPosY=${finalPosition.y.toFixed(3)}`); }


        // --- Void Check ---
        if (finalPosition.y < CONFIG.VOID_Y_LEVEL) {
             console.log(`[DEBUG Collision Check] Player fell into void at Y=${finalPosition.y.toFixed(2)}.`); // DEBUG
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
        // console.log(`[DEBUG Collision Check End] Final Pos: (${finalPosition.x.toFixed(2)}, ${finalPosition.y.toFixed(2)}, ${finalPosition.z.toFixed(2)}), Final VelY: ${playerVelocity.y.toFixed(2)}, Final Grounded: ${isGrounded}`); // DEBUG

        // Return the final grounded state
        return isGrounded;
    } // End of checkPlayerCollisionAndMove method

    /**
     * Performs shooting logic: Raycast, send hit, trigger effects/rocket jump.
     */
    performShoot(camera) {
        // Use this.BULLET_MAX_RANGE etc.
        if (!camera || !Network || !scene) { return; }
        if (window.gunSoundBuffer) { Effects.playSound(window.gunSoundBuffer, null, false, 0.4); }
        // console.log("[DEBUG ShootLogic] Gun sound played (attempted)."); // DEBUG

        const raycaster = new THREE.Raycaster(); // Use local instance variable? Maybe not needed if tempRaycaster is ok.
        const origin = new THREE.Vector3(); const direction = new THREE.Vector3();
        camera.getWorldPosition(origin); camera.getWorldDirection(direction);
        console.log(`[DEBUG ShootLogic] Raycast from (${origin.x.toFixed(1)},${origin.y.toFixed(1)},${origin.z.toFixed(1)}) dir (${direction.x.toFixed(1)},${direction.y.toFixed(1)},${direction.z.toFixed(1)})`); // DEBUG


        raycaster.set(origin, direction);
        raycaster.far = this.BULLET_MAX_RANGE;

        // --- Target Selection ---
        const potentialTargets = []; // Objects to check for hits
        // Add other players' meshes
        for (const id in window.players) {
            if (id !== localPlayerId && window.players[id]?.mesh && window.players[id].health > 0) {
                potentialTargets.push(window.players[id].mesh);
            }
        }
        // Add the map mesh for environment hits
        if (window.mapMesh) { potentialTargets.push(window.mapMesh); }

        const intersects = raycaster.intersectObjects(potentialTargets, true); // Check recursively
        console.log(`[DEBUG ShootLogic] Raycast hit ${intersects.length} objects.`); // DEBUG

        if (intersects.length > 0) {
            // Sort hits by distance (nearest first)
            intersects.sort((a, b) => a.distance - b.distance);

            // Process the nearest hit
            const nearestHit = intersects[0];
            let hitObject = nearestHit.object;
            let hitPlayerId = null;

            // Traverse up the hierarchy to find the parent object with player ID (if it's a player model part)
            while (hitObject && !hitPlayerId) {
                if (hitObject.userData?.entityId === window.localPlayerId) { break; } // Stop check if self hit
                 if (hitObject.userData?.isPlayer) { // Check if the object or its parent has the marker
                     hitPlayerId = hitObject.userData.entityId;
                 }
                hitObject = hitObject.parent;
            }

            // Ensure hitPlayerId is set AND it's not the local player
            if (hitPlayerId && hitPlayerId !== window.localPlayerId && window.players[hitPlayerId]?.health > 0) {
                 console.log(`[DEBUG ShootLogic] Hit player ${hitPlayerId} (${window.players[hitPlayerId]?.name || '??'}) at distance ${nearestHit.distance.toFixed(2)}`); // DEBUG
                 Network.sendPlayerHit({ targetId: hitPlayerId, damage: this.BULLET_DMG });
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
                    localPlayerVelocity.y += this.ROCKET_JUMP_VEL; // Apply upward velocity boost
                    if(window.playerIsGrounded) window.playerIsGrounded[localPlayerId] = false; // Ensure player becomes airborne
                }
            } else {
                console.log("[DEBUG ShootLogic] Rocket Jump condition not met (not looking down enough)."); // DEBUG
            }
        }
    } // End of performShoot method

    /**
     * Applies velocity change to nearby players on death.
     */
    applyShockwave(originPosition, deadPlayerId) {
        // Use this.DEATH_SHOCKWAVE_RADIUS etc.
        const playerCenterOffset = (CONFIG?.PLAYER_HEIGHT ?? 1.8) / 2.0; // Calculate locally

        if (!window.players || !playerVelocities) { return; }
        const origin = originPosition;

        for (const targetId in window.players) {
            if (targetId === deadPlayerId) continue;
            const targetVelocity = playerVelocities[targetId];
            if(!targetVelocity) continue;
            const targetPlayer = window.players[targetId];
            const targetMesh = targetPlayer?.mesh;
            if (!targetMesh || targetPlayer.health <= 0) continue;

            try {
                const targetPos = targetMesh.position.clone().add(new THREE.Vector3(0, playerCenterOffset, 0));
                const direction = this.tempVec.subVectors(targetPos, origin);
                const distance = direction.length();
                if (distance < this.DEATH_SHOCKWAVE_RADIUS && distance > 0.01) {
                    const forceFalloff = 1.0 - (distance / this.DEATH_SHOCKWAVE_RADIUS);
                    const velocityMagnitude = this.DEATH_SHOCKWAVE_VEL * forceFalloff;
                    direction.normalize();
                    targetVelocity.x += direction.x * velocityMagnitude;
                    targetVelocity.y += direction.y * velocityMagnitude * 0.5 + velocityMagnitude * 0.6;
                    targetVelocity.z += direction.z * velocityMagnitude;
                    if (playerIsGrounded[targetId]) { playerIsGrounded[targetId] = false; }
                     // console.log(`[DEBUG Shockwave] Applied force to ${targetId}. Dist: ${distance.toFixed(1)}, Mag: ${velocityMagnitude.toFixed(1)}`); // DEBUG
                }
            } catch (e) { console.error(`Error calculating shockwave for player ${targetId}:`, e); }
        }
    } // End of applyShockwave method


    /**
     * Checks if the local player has moved/rotated enough and sends an update.
     */
    sendLocalPlayerUpdateIfNeeded(localPlayerMesh, camera) {
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
                 // console.log(`[DEBUG NetworkSend] Sent Update. PosChanged: ${positionChanged}, RotChanged: ${rotationChanged}`); // DEBUG
            }
        } catch(e) { console.error("!!! Error calculating/sending network update:", e); }
    } // End of sendLocalPlayerUpdateIfNeeded method

} // End GameLogic Class

console.log("gameLogic.js loaded successfully (CLASS-BASED REFACTOR v1 - DIRECT VELOCITY SET DEBUG).");

// --- END OF FULL gameLogic.js FILE ---
