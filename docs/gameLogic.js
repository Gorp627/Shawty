// --- START OF FULL gameLogic.js FILE (CLASS-BASED REFACTOR v1 - COMPLETE CODE) ---
// docs/gameLogic.js - Encapsulates game simulation logic

// Accesses globals: CONFIG, THREE, Network, Input, UIManager, stateMachine, Effects, scene, mapMesh, players, localPlayerId, playerVelocities, playerIsGrounded

console.log("gameLogic.js loading (CLASS-BASED REFACTOR v1)...");

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

    /**
     * Updates the local player's velocity based on input.
     */
    updateLocalPlayerInput(deltaTime, camera, localPlayerMesh) {
        // Use this.GRAVITY etc. instead of global constants

        // Use guards - ensure player/velocity/grounded maps exist from global scope
        if (!localPlayerId || !window.players || !window.playerVelocities || !window.playerIsGrounded) return;
        const localPlayer = window.players[localPlayerId];
        if (!localPlayer || !localPlayerMesh || !window.playerVelocities[localPlayerId]) return;
        const isGrounded = window.playerIsGrounded.hasOwnProperty(localPlayerId) ? window.playerIsGrounded[localPlayerId] : false;
        const currentVel = window.playerVelocities[localPlayerId];

        const isPlaying = stateMachine?.is('playing');
        const isLocked = window.controls?.isLocked;
        if (!isPlaying || !isLocked || localPlayer.health <= 0) {
            currentVel.x *= 0.9; currentVel.z *= 0.9;
            if (Math.abs(currentVel.x) < 0.1) currentVel.x = 0;
            if (Math.abs(currentVel.z) < 0.1) currentVel.z = 0;
            if (!isGrounded) currentVel.y -= this.GRAVITY * deltaTime;
            return;
        }

        const moveSpeed = Input.keys['ShiftLeft'] ? (CONFIG?.MOVEMENT_SPEED_SPRINTING ?? 10.5) : (CONFIG?.MOVEMENT_SPEED ?? 7.0);
        const forward = this.tempVec.set(0, 0, -1).applyQuaternion(camera.quaternion); forward.y = 0; forward.normalize();
        const right = this.tempVec2.set(1, 0, 0).applyQuaternion(camera.quaternion); right.y = 0; right.normalize();
        let moveDirectionX = 0;
        let moveDirectionZ = 0;

        if (Input.keys['KeyW']) { /*console.log("[DEBUG InputLogic] W Detected");*/ moveDirectionX += forward.x; moveDirectionZ += forward.z; }
        if (Input.keys['KeyS']) { /*console.log("[DEBUG InputLogic] S Detected");*/ moveDirectionX -= forward.x; moveDirectionZ -= forward.z; }
        if (Input.keys['KeyA']) { /*console.log("[DEBUG InputLogic] A Detected");*/ moveDirectionX -= right.x; moveDirectionZ -= right.z; }
        if (Input.keys['KeyD']) { /*console.log("[DEBUG InputLogic] D Detected");*/ moveDirectionX += right.x; moveDirectionZ += right.z; }

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

        if (!isGrounded) {
            currentVel.y -= this.GRAVITY * deltaTime;
        } else {
            if (currentVel.y > 0) currentVel.y = 0;
            currentVel.y = Math.max(currentVel.y, -this.GRAVITY * deltaTime * 2);
        }

        if (Input.keys['Space'] && isGrounded) {
            console.log("[DEBUG InputLogic] Jump Detected & Grounded"); // DEBUG
            currentVel.y = this.JUMP_VELOCITY;
            window.playerIsGrounded[localPlayerId] = false;
            Input.keys['Space'] = false;
        }

        if (Input.requestingDash) {
            console.log("[DEBUG InputLogic] Dash Consumed"); // DEBUG
            const dashDir = Input.dashDirection;
            currentVel.x += dashDir.x * this.DASH_VELOCITY;
            currentVel.z += dashDir.z * this.DASH_VELOCITY;
            currentVel.y = Math.max(currentVel.y + this.DASH_VELOCITY * this.DASH_UP_FACTOR, currentVel.y * 0.5 + this.DASH_VELOCITY * this.DASH_UP_FACTOR * 0.5);
            window.playerIsGrounded[localPlayerId] = false;
            Input.requestingDash = false;
        }

        const now = Date.now();
        if (Input.mouseButtons[0] && now > (window.lastShootTime || 0) + this.SHOOT_COOLDOWN_MS) {
            console.log("[DEBUG InputLogic] Shoot Detected (Button 0)"); // DEBUG
            window.lastShootTime = now;
            this.performShoot(camera); // Call class method
        }
    } // End of updateLocalPlayerInput method

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
                    return true;
                }
            }
            return false;
        }
        /** Helper for Ceiling/Floor Collision Check */
       const checkCeilingFloorCollision = (currentPosFeet, direction, distance, movingUp, collisionObjects) => {
            const offset = movingUp ? this.PLAYER_HEIGHT - 0.1 : 0.1;
            const checkOrigin = currentPosFeet.clone().add(new THREE.Vector3(0, offset, 0));
            this.tempRaycaster.set(checkOrigin, direction); this.tempRaycaster.far = distance + 0.05;
            const intersects = this.tempRaycaster.intersectObjects(collisionObjects, true);
            return intersects.length > 0;
        }

        if (!playerMesh || !playerVelocity || !window.mapMesh) {
            return window.playerIsGrounded[localPlayerId] ?? false;
        }

        const currentPosition = playerMesh.position;
        const movementVector = this.tempVec.copy(playerVelocity).multiplyScalar(deltaTime);
        const collisionObjects = [window.mapMesh];
        const groundRayDirection = new THREE.Vector3(0, -1, 0);
        const groundRayOriginOffset = 0.1;

        const groundRayOriginBefore = currentPosition.clone().add(new THREE.Vector3(0, groundRayOriginOffset, 0));
        this.tempGroundRay.set(groundRayOriginBefore, groundRayDirection);
        this.tempGroundRay.far = groundRayOriginOffset + this.STEP_HEIGHT + this.GROUND_CHECK_DIST;
        const groundIntersectsBefore = this.tempGroundRay.intersectObjects(collisionObjects, true);
        const onGroundBeforeMove = groundIntersectsBefore.length > 0 && groundIntersectsBefore[0].distance <= groundRayOriginOffset + this.GROUND_CHECK_DIST * 0.5;

        let moveX = movementVector.x;
        let moveY = movementVector.y;
        let moveZ = movementVector.z;
        let currentIterPosition = currentPosition.clone();

        if (Math.abs(moveX) > 0.001) {
            if (checkWallCollision(currentIterPosition, new THREE.Vector3(Math.sign(moveX), 0, 0), Math.abs(moveX), collisionObjects)) {
                moveX = 0; playerVelocity.x = 0;
            } currentIterPosition.x += moveX;
        }
        if (Math.abs(moveZ) > 0.001) {
            if (checkWallCollision(currentIterPosition, new THREE.Vector3(0, 0, Math.sign(moveZ)), Math.abs(moveZ), collisionObjects)) {
                moveZ = 0; playerVelocity.z = 0;
            } currentIterPosition.z += moveZ;
        }
        if (Math.abs(moveY) > 0.001) {
            const movingUp = moveY > 0;
            const yDir = movingUp ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, -1, 0);
            if (checkCeilingFloorCollision(currentIterPosition, yDir, Math.abs(moveY), movingUp, collisionObjects)) {
                moveY = 0; playerVelocity.y = 0;
            } currentIterPosition.y += moveY;
        }

        const finalPosition = currentIterPosition;
        let isGrounded = false;
        const groundRayOriginFinal = finalPosition.clone().add(new THREE.Vector3(0, groundRayOriginOffset, 0));
        this.tempGroundRay.set(groundRayOriginFinal, groundRayDirection);
        const currentGroundCheckDist = groundRayOriginOffset + (playerVelocity.y <= 0 ? this.STEP_HEIGHT + this.GROUND_CHECK_DIST : this.GROUND_CHECK_DIST);
        this.tempGroundRay.far = currentGroundCheckDist;
        const finalGroundIntersects = this.tempGroundRay.intersectObjects(collisionObjects, true);

        if (finalGroundIntersects.length > 0) {
            const hitPoint = finalGroundIntersects[0].point;
            const hitDistance = finalGroundIntersects[0].distance;
            if (hitDistance <= groundRayOriginOffset + this.GROUND_CHECK_DIST * 0.5) {
                isGrounded = true; finalPosition.y = hitPoint.y; if (playerVelocity.y < 0) playerVelocity.y = 0;
            } else if (onGroundBeforeMove && playerVelocity.y <= 0 && hitDistance <= groundRayOriginOffset + this.STEP_HEIGHT) {
                const stepUpOrigin = hitPoint.clone().add(new THREE.Vector3(0, this.PLAYER_HEIGHT - 0.1, 0));
                this.tempRaycaster.set(stepUpOrigin, groundRayDirection); this.tempRaycaster.far = this.PLAYER_HEIGHT - 0.2;
                if (this.tempRaycaster.intersectObjects(collisionObjects, true).length === 0) {
                    isGrounded = true; finalPosition.y = hitPoint.y; if (playerVelocity.y < 0) playerVelocity.y = 0;
                } else { isGrounded = false; }
            } else { isGrounded = false; }
        } else { isGrounded = false; }

        if (finalPosition.y < CONFIG.VOID_Y_LEVEL) {
            const localPlayer = window.players[localPlayerId];
            if (localPlayer?.health > 0) {
                localPlayer.health = 0; UIManager?.updateHealthBar(0); Network?.sendVoidDeath();
            } return false;
        }
        playerMesh.position.copy(finalPosition);
        return isGrounded;
    } // End of checkPlayerCollisionAndMove method

    /**
     * Performs shooting logic: Raycast, send hit, trigger effects/rocket jump.
     */
    performShoot(camera) {
        // Use this.BULLET_MAX_RANGE etc.
        if (!camera || !Network || !scene) { return; }
        if (window.gunSoundBuffer) { Effects.playSound(window.gunSoundBuffer, null, false, 0.4); }

        const raycaster = new THREE.Raycaster(); // Use local instance variable? Maybe not needed if tempRaycaster is ok.
        const origin = new THREE.Vector3(); const direction = new THREE.Vector3();
        camera.getWorldPosition(origin); camera.getWorldDirection(direction);

        raycaster.set(origin, direction);
        raycaster.far = this.BULLET_MAX_RANGE;

        const potentialTargets = [];
        for (const id in window.players) {
            if (id !== localPlayerId && window.players[id]?.mesh && window.players[id].health > 0) {
                potentialTargets.push(window.players[id].mesh);
            }
        }
        if (window.mapMesh) { potentialTargets.push(window.mapMesh); }

        const intersects = raycaster.intersectObjects(potentialTargets, true);

        if (intersects.length > 0) {
            intersects.sort((a, b) => a.distance - b.distance);
            const nearestHit = intersects[0];
            let hitObject = nearestHit.object; let hitPlayerId = null;
            while (hitObject && !hitPlayerId) {
                if (hitObject.userData?.entityId === window.localPlayerId) { break; }
                if (hitObject.userData?.isPlayer) { hitPlayerId = hitObject.userData.entityId; }
                hitObject = hitObject.parent;
            }
            if (hitPlayerId && hitPlayerId !== window.localPlayerId && window.players[hitPlayerId]?.health > 0) {
                console.log(`[DEBUG ShootLogic] Hit player ${hitPlayerId} (${window.players[hitPlayerId]?.name || '??'})`); // DEBUG
                Network.sendPlayerHit({ targetId: hitPlayerId, damage: this.BULLET_DMG });
            } else {
                // console.log(`[DEBUG ShootLogic] Hit environment/self/dead player`); // DEBUG
            }
        } else {
            // console.log("[DEBUG ShootLogic] Shot missed."); // DEBUG
        }

        if (Input.keys['KeyE']) {
            const worldDown = new THREE.Vector3(0, -1, 0);
            const downwardLookThreshold = 0.5;
            const dotProd = direction.dot(worldDown);
            if (dotProd > downwardLookThreshold) {
                const localPlayerVelocity = window.playerVelocities[localPlayerId];
                if (localPlayerVelocity) {
                    console.log("[DEBUG ShootLogic] Applying Rocket Jump Velocity!"); // DEBUG
                    localPlayerVelocity.y += this.ROCKET_JUMP_VEL;
                    if(window.playerIsGrounded) window.playerIsGrounded[localPlayerId] = false;
                }
            }
        }
    } // End of performShoot method

    /**
     * Applies velocity change to nearby players on death.
     * This could potentially remain a global function or be moved here.
     * Let's move it here for better encapsulation.
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
                }
            } catch (e) { console.error(`Error calculating shockwave for player ${targetId}:`, e); }
        }
    } // End of applyShockwave method


    /**
     * Checks if the local player has moved/rotated enough and sends an update.
     * Also moved into the class.
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
            }
        } catch(e) { console.error("!!! Error calculating/sending network update:", e); }
    } // End of sendLocalPlayerUpdateIfNeeded method

} // End GameLogic Class

console.log("gameLogic.js loaded successfully (CLASS-BASED REFACTOR v1).");

// --- END OF FULL gameLogic.js FILE ---
