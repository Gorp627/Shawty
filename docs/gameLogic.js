// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, network.js, uiManager.js
// Accesses globals: camera, controls, players, localPlayerId, CONFIG, THREE, ClientPlayer, Network, Input, UIManager, stateMachine,
//                   velocityY, isOnGround, raycaster

// Controls movement (Horizontal + Vertical), Dash, Collision (Player/Ground), Void Check, and Network updates.

/**
 * Updates the local player's physics, state, movement, dash, collision, and network sync.
 * @param {number} deltaTime Time since last frame.
 * @param {THREE.Object3D} mapMeshParam Reference to the loaded map mesh object.
 */
function updateLocalPlayer(deltaTime, mapMeshParam) {
    // --- Guard Clause: Ensure map is validly passed ---
    if (!mapMeshParam) {
        console.error("!!! updateLocalPlayer called without valid mapMeshParam! Skipping update.");
        return; // Prevent physics/movement without a map
    }

    // --- Guard Clause: Ensure active play state and locked controls ---
    const isPlaying = typeof stateMachine !== 'undefined' && stateMachine.is('playing');
    const isLocked = typeof controls !== 'undefined' && controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;

    // STOP processing if not playing, not locked, or local player doesn't exist
    if (!isPlaying || !isLocked || !localPlayerData) {
        return;
    }

    // Check if alive *after* basic checks
    const isAlive = localPlayerData.health > 0;

    // --- Get References ---
    const controlsObject = controls.getObject();

    // --- Store Previous Position for Revert ---
    const previousPosition = controlsObject.position.clone();

    // --- 1. Apply Gravity ---
    if (isAlive) {
        // Apply gravity but clamp the maximum downward velocity to prevent extreme speeds
        const maxFallSpeed = 50.0; // Adjust as needed
        velocityY -= (CONFIG.GRAVITY || 25.0) * deltaTime;
        velocityY = Math.max(velocityY, -maxFallSpeed); // Clamp downward speed

    } else {
        velocityY = 0; // No velocity if dead
    }

    // --- 2. Update Vertical Position based on Velocity ---
    // Only apply vertical velocity if alive OR falling downwards (allows dead bodies to fall)
    if (isAlive || velocityY < 0) {
        controlsObject.position.y += velocityY * deltaTime;
    }
    let wasOnGround = isOnGround; // Store previous ground state
    isOnGround = false; // Assume not on ground for this frame

    // --- 3. Ground Collision Check (Raycast) ---
    if (isAlive) { // Only check ground if alive
        const feetOffset = 0.1; // Start ray slightly above feet
        const groundCheckDistance = feetOffset + 0.2; // Max distance slightly increased buffer
        const cameraOffsetCheck = CONFIG.CAMERA_Y_OFFSET || 1.9;
        const rayOrigin = new THREE.Vector3(
            controlsObject.position.x,
            controlsObject.position.y - cameraOffsetCheck + feetOffset,
            controlsObject.position.z
        );
        const rayDirection = new THREE.Vector3(0, -1, 0);

        if (typeof raycaster === 'undefined') { console.error("Raycaster missing!"); raycaster = new THREE.Raycaster(); }
        raycaster.set(rayOrigin, rayDirection);
        raycaster.far = groundCheckDistance;

        const intersects = raycaster.intersectObject(mapMeshParam, true);

        if (intersects.length > 0) {
            const intersectPoint = intersects[0].point;
            // Check if the intersection is close enough to be considered ground
            // Compare the ray origin's Y vs the intersection point's Y
            if (rayOrigin.y - intersectPoint.y <= groundCheckDistance + 0.01) {
                isOnGround = true;
                velocityY = 0; // Stop falling velocity ONLY if grounded
                // Snap player exactly to the ground surface + camera offset
                controlsObject.position.y = intersectPoint.y + cameraOffsetCheck;
                // console.log("Ground Hit! Snapped Y:", controlsObject.position.y); // Debug log
            } else {
                 // Intersected something below, but too far to be ground this frame
                 // console.log("Ray hit below, but too far:", rayOrigin.y - intersectPoint.y);
            }
        } else {
            // No intersection within groundCheckDistance
            if (wasOnGround) {
                console.log("Lost ground contact. Ray Origin:", rayOrigin, "VelocityY:", velocityY); // Log when losing ground
            }
        }
    }


    // --- 4. Void Check (AFTER potential ground snap) ---
    let fellIntoVoid = false;
    if (isAlive) { // Only check void if alive
        // Check Y Level first
        if (controlsObject.position.y < (CONFIG.VOID_Y_LEVEL || -40)) {
            console.log(`Fell below VOID_Y_LEVEL (${controlsObject.position.y.toFixed(2)} < ${CONFIG.VOID_Y_LEVEL || -40}).`);
            fellIntoVoid = true;
        }
        // Check X/Z map bounds only if not already below Y level
        if (!fellIntoVoid && (Math.abs(controlsObject.position.x) > (CONFIG.MAP_BOUNDS_X || 50) ||
            Math.abs(controlsObject.position.z) > (CONFIG.MAP_BOUNDS_Z || 50))) {
            console.log(`Fell outside MAP_BOUNDS (X: ${controlsObject.position.x.toFixed(2)}, Z: ${controlsObject.position.z.toFixed(2)}).`);
            fellIntoVoid = true;
        }

        if (fellIntoVoid) {
            console.log("Player fell into void!");
            localPlayerData.health = 0;
            if(typeof UIManager !== 'undefined') UIManager.updateHealthBar(0);
            if(typeof Network !== 'undefined') Network.sendVoidDeath();
            // Don't return here, allow the rest of the frame to potentially update network state if needed
            // The 'isAlive' flag will prevent movement/actions in subsequent frames until respawn
        }
    }

    // --- 5. Horizontal Movement (Only if Alive) ---
    if (isAlive) {
        const moveSpeed = (typeof Input !== 'undefined' && Input.keys['ShiftLeft']) ? CONFIG.MOVEMENT_SPEED_SPRINTING : CONFIG.MOVEMENT_SPEED;
        const deltaSpeed = moveSpeed * deltaTime;
        const forward = new THREE.Vector3(), right = new THREE.Vector3();

        if (typeof camera !== 'undefined') {
            camera.getWorldDirection(forward); forward.y=0; forward.normalize();
            right.crossVectors(camera.up, forward).normalize();
        } else { console.error("Camera missing!"); return; }

        let moveDirection = new THREE.Vector3(0,0,0);
        if(Input.keys['KeyW']){moveDirection.add(forward);} if(Input.keys['KeyS']){moveDirection.sub(forward);}
        if(Input.keys['KeyA']){moveDirection.add(right);}
        if(Input.keys['KeyD']){moveDirection.sub(right);}

        if(moveDirection.lengthSq() > 0){
            moveDirection.normalize();
            controlsObject.position.addScaledVector(moveDirection, deltaSpeed);
        }
    }

    // --- 6. Dash Movement (Only if Alive) ---
    if (isAlive && typeof Input !== 'undefined' && Input.isDashing) {
        controlsObject.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime);
    }

    // --- 7. Collision (Player-Player - Basic Horizontal Revert) ---
    if (isAlive) { // Only check player collision if alive
        const currentPosition = controlsObject.position;
        const collisionRadius = CONFIG.PLAYER_RADIUS || 0.4;
        const cameraOffsetCheck = CONFIG.CAMERA_Y_OFFSET || 1.9;
        const playerHeightCheck = CONFIG.PLAYER_HEIGHT || 1.8;

        for (const id in players) {
            if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh?.visible && players[id].mesh.position && players[id].health > 0) {
                const otherMesh = players[id].mesh;
                const otherPos = otherMesh.position;

                const distanceXZ = new THREE.Vector2(currentPosition.x - otherPos.x, currentPosition.z - otherPos.z).length();

                if (distanceXZ < collisionRadius * 2) {
                    const currentFeetY = currentPosition.y - cameraOffsetCheck;
                    let otherFeetY = otherPos.y;
                    if (otherMesh.geometry instanceof THREE.CylinderGeometry) {
                         otherFeetY = otherPos.y - playerHeightCheck / 2;
                    }
                    const verticalDistance = Math.abs(currentFeetY - otherFeetY);

                    if (verticalDistance < playerHeightCheck) {
                        currentPosition.x = previousPosition.x;
                        currentPosition.z = previousPosition.z;
                        break; // Stop checking after one collision
                    }
                }
            }
        }
    }


    // --- 8. Send Network Updates ---
    // Send updates regardless of alive status IF position/rotation changed
    // (Server needs to know final position before death/respawn)
    const cameraOffset = CONFIG?.CAMERA_Y_OFFSET || (CONFIG?.PLAYER_HEIGHT || 1.8);
    const logicalPosition = new THREE.Vector3(
            controlsObject.position.x,
            controlsObject.position.y - cameraOffset, // Calculate feet Y
            controlsObject.position.z
    );
    const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const currentRotationY = currentRotation.y;

    const pTSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ || 0.0001;
    const rTh = 0.01;

    // Check if position or rotation changed significantly compared to the data cache
    const posChanged = logicalPosition.distanceToSquared(new THREE.Vector3(localPlayerData?.x ?? 0, localPlayerData?.y ?? 0, localPlayerData?.z ?? 0)) > pTSq;
    const rotChanged = Math.abs(currentRotationY - (localPlayerData?.rotationY ?? 0)) > rTh;

    if (posChanged || rotChanged) {
        // Update local cache immediately (plain object)
        localPlayerData.x = logicalPosition.x;
        localPlayerData.y = logicalPosition.y;
        localPlayerData.z = logicalPosition.z;
        localPlayerData.rotationY = currentRotationY;

        // Send update to server
        if (typeof Network !== 'undefined') Network.sendPlayerUpdate({ x: localPlayerData.x, y: localPlayerData.y, z: localPlayerData.z, rotationY: localPlayerData.rotationY });
    }

} // End updateLocalPlayer


/** Updates remote players interpolation */
function updateRemotePlayers(deltaTime) {
    for (const id in players) {
        if (id !== localPlayerId && players[id] instanceof ClientPlayer) {
            players[id].interpolate(deltaTime);
        }
    }
}

console.log("gameLogic.js loaded (Added Velocity Clamp, Ground Check Refined)");
