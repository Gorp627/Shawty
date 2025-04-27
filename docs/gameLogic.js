// docs/gameLogic.js (Manual Physics + Wall Collision Raycasts)

// Depends on: config.js, stateMachine.js, entities.js, input.js, network.js, uiManager.js
// Accesses globals: scene, camera, controls, players, localPlayerId, CONFIG, THREE, Network, Input, UIManager, stateMachine,
//                   velocityY, isOnGround, raycaster

/**
 * Updates the local player's physics, state, movement, dash, collision, and network sync MANUALLY.
 * @param {number} deltaTime Time since last frame.
 * @param {THREE.Object3D} mapMeshParam Reference to the visual map mesh object for raycasting.
 */
function updateLocalPlayer(deltaTime, mapMeshParam) {
    const isPlaying = stateMachine?.is('playing');
    const isLocked = controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;
    if (!isPlaying || !isLocked || !localPlayerData) { return; }

    const isAlive = localPlayerData.health > 0;
    const controlsObject = controls?.getObject();
    if (!controlsObject) { console.error("Controls missing!"); return; }

    const previousPosition = controlsObject.position.clone(); // Store position BEFORE any movement

    // --- 1. Vertical Physics ---
    if (isAlive) { if (typeof velocityY !== 'number') velocityY = 0; velocityY -= (CONFIG?.GRAVITY || 25.0) * deltaTime; } else { velocityY = 0; }
    controlsObject.position.y += velocityY * deltaTime;
    let wasOnGround = typeof isOnGround === 'boolean' ? isOnGround : false; isOnGround = false;

    // --- 2. Ground Collision Check (Raycast) ---
    let didHitGround = false;
    if (mapMeshParam && isAlive) {
        const feetOffset = 0.1; const groundCheckDistance = feetOffset + 0.2; const cameraHeight = CONFIG?.CAMERA_Y_OFFSET || 1.6;
        const rayOrigin = new THREE.Vector3( controlsObject.position.x, controlsObject.position.y - cameraHeight + feetOffset, controlsObject.position.z ); const rayDirection = new THREE.Vector3(0, -1, 0);
        if (!raycaster) raycaster = new THREE.Raycaster(); raycaster.set(rayOrigin, rayDirection); raycaster.far = groundCheckDistance;
        const intersects = raycaster.intersectObject(mapMeshParam, true);
        if (intersects.length > 0) { const distanceToGround = intersects[0].distance; if (distanceToGround <= feetOffset + 0.05) { didHitGround = true; isOnGround = true; if (velocityY < 0) { velocityY = 0; controlsObject.position.y = intersects[0].point.y + cameraHeight; } } }
        // Ground Check Debug Ray Visualization (Optional)
        // if (scene) { const line = scene.getObjectByName("debugRayLine"); if (line) scene.remove(line); const mat = new THREE.LineBasicMaterial({ color: isOnGround ? 0x00ff00 : 0xff0000 }); const pts = [ rayOrigin.clone(), rayOrigin.clone().addScaledVector(rayDirection, groundCheckDistance) ]; const geo = new THREE.BufferGeometry().setFromPoints(pts); const newLine = new THREE.Line(geo, mat); newLine.name = "debugRayLine"; scene.add(newLine); }
    } else if (!mapMeshParam && isAlive) { console.warn("mapMeshParam missing for ground check!"); }
    //if (wasOnGround && !isOnGround) { console.log("Left ground."); } else if (!wasOnGround && isOnGround) { console.log("On ground."); } // Less spammy logs


    // --- 3. Void Check ---
    let fellIntoVoid = false;
    if (isAlive) { const currentFeetY = controlsObject.position.y - (CONFIG?.CAMERA_Y_OFFSET || 1.6); if (currentFeetY < (CONFIG.VOID_Y_LEVEL || -50)) { fellIntoVoid = true; console.log("Fell below Y level"); } if (!fellIntoVoid && (Math.abs(controlsObject.position.x) > (CONFIG.MAP_BOUNDS_X || 50) || Math.abs(controlsObject.position.z) > (CONFIG.MAP_BOUNDS_Z || 50))) { fellIntoVoid = true; console.log("Fell outside bounds"); } if (fellIntoVoid) { console.log("Void death!"); localPlayerData.health = 0; if(UIManager) UIManager.updateHealthBar(0); if(Network) Network.sendVoidDeath(); } }

    // --- 4. Calculate Intended Horizontal Movement (Only if Alive) ---
    let intendedMove = new THREE.Vector3(0, 0, 0);
    if (isAlive && !fellIntoVoid) { // Don't calculate movement if dead or falling
        const moveSpeed = Input.keys['ShiftLeft'] ? (CONFIG?.MOVEMENT_SPEED_SPRINTING || 10.5) : (CONFIG?.MOVEMENT_SPEED || 7.0);
        const deltaSpeed = moveSpeed * deltaTime;
        const forward = new THREE.Vector3(), right = new THREE.Vector3();
        if (camera) { camera.getWorldDirection(forward); forward.y=0; forward.normalize(); right.crossVectors(camera.up, forward).normalize(); } else { console.error("Camera missing!"); return; }
        let moveDirection = new THREE.Vector3(0,0,0);
        if(Input.keys['KeyW']){moveDirection.add(forward);} if(Input.keys['KeyS']){moveDirection.sub(forward);}
        if(Input.keys['KeyA']){moveDirection.sub(right);} if(Input.keys['KeyD']){moveDirection.add(right);} // Corrected A/D
        if(moveDirection.lengthSq() > 0.0001){ moveDirection.normalize(); intendedMove.addScaledVector(moveDirection, deltaSpeed); }
    }

    // --- 5. Wall Collision Check (Horizontal Raycasts) ---
    if (isAlive && !fellIntoVoid && mapMeshParam && intendedMove.lengthSq() > 0.0001) {
        const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4;
        const checkDistance = playerRadius + 0.1; // How far to check for walls
        const cameraHeight = CONFIG?.CAMERA_Y_OFFSET || 1.6;
        const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8;
        const playerCenterY = controlsObject.position.y - cameraHeight + playerHeight / 2.0;

        const horizontalMoveDir = intendedMove.clone().normalize(); // Direction of intended movement

        const rayOrigins = [
             new THREE.Vector3(controlsObject.position.x, controlsObject.position.y - cameraHeight + 0.2, controlsObject.position.z), // Feet
             new THREE.Vector3(controlsObject.position.x, playerCenterY, controlsObject.position.z),                           // Center
             new THREE.Vector3(controlsObject.position.x, controlsObject.position.y - 0.2, controlsObject.position.z)              // Head
        ];

        if (!raycaster) raycaster = new THREE.Raycaster();
        raycaster.far = checkDistance;
        let wallBlocked = false;

        for(const origin of rayOrigins) {
             raycaster.set(origin, horizontalMoveDir); // Cast ray in movement direction
             const wallIntersects = raycaster.intersectObject(mapMeshParam, true);
             if (wallIntersects.length > 0) {
                 // console.log("Wall collision detected!"); // Optional log
                 intendedMove.set(0,0,0); // Cancel horizontal movement
                 wallBlocked = true;
                 break; // No need to check other rays
             }
        }
    }

    // --- 6. Apply FINAL Horizontal Movement ---
    controlsObject.position.add(intendedMove);

    // --- 7. Apply Dash Velocity (Only if Alive) ---
    if (isAlive && !fellIntoVoid && Input.isDashing) {
        controlsObject.position.addScaledVector(Input.dashDirection, (CONFIG?.DASH_FORCE || 25.0) * deltaTime);
    }

    // --- 8. Collision (Player-Player - Revert Horizontal based on *PREVIOUS* frame position) ---
    if (isAlive) {
        const currentPosAfterMove = controlsObject.position; // Where player is now
        const collisionRadius = CONFIG?.PLAYER_RADIUS || 0.4; const cameraHeight = CONFIG?.CAMERA_Y_OFFSET || 1.6; const playerHeightCheck = CONFIG?.PLAYER_HEIGHT || 1.8;
        for (const id in players) { if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh?.visible && players[id].mesh.position && players[id].health > 0) { const otherMesh = players[id].mesh; const otherPos = otherMesh.position; const distanceXZ = new THREE.Vector2(currentPosAfterMove.x - otherPos.x, currentPosAfterMove.z - otherPos.z).length(); if (distanceXZ < collisionRadius * 2) { const currentFeetY = currentPosAfterMove.y - cameraHeight; let otherFeetY = otherPos.y; if (otherMesh.geometry instanceof THREE.CylinderGeometry) { otherFeetY = otherPos.y - playerHeightCheck / 2; } const verticalDistance = Math.abs(currentFeetY - otherFeetY); if (verticalDistance < playerHeightCheck) {
                        // Revert X and Z to state *before* this frame's horizontal move/dash
                        controlsObject.position.x = previousPosition.x;
                        controlsObject.position.z = previousPosition.z;
                        console.log("Player collision - reverted XZ.");
                        break;
                    } } } }
    }


    // --- 9. Send Network Updates ---
    // Only send if alive state hasn't changed this frame (prevents sending update after void death triggered locally)
    if (isAlive && !fellIntoVoid) {
        const cameraHeight = CONFIG?.CAMERA_Y_OFFSET || 1.6; const logicalPosition = new THREE.Vector3( controlsObject.position.x, controlsObject.position.y - cameraHeight, controlsObject.position.z ); const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const currentRotationY = currentRotation.y; const pTSq = CONFIG?.PLAYER_MOVE_THRESHOLD_SQ || 0.0001; const rTh = 0.01; const posChanged = logicalPosition.distanceToSquared(new THREE.Vector3(localPlayerData.x??0, localPlayerData.y??0, localPlayerData.z??0)) > pTSq; const rotChanged = Math.abs(currentRotationY - (localPlayerData.rotationY??0)) > rTh; if (posChanged || rotChanged) { localPlayerData.x = logicalPosition.x; localPlayerData.y = logicalPosition.y; localPlayerData.z = logicalPosition.z; localPlayerData.rotationY = currentRotationY; if (Network) Network.sendPlayerUpdate({ x: localPlayerData.x, y: localPlayerData.y, z: localPlayerData.z, rotationY: localPlayerData.rotationY }); }
    }

} // End updateLocalPlayer


/** Updates remote players interpolation */
function updateRemotePlayers(deltaTime) {
    for (const id in players) { if (id !== localPlayerId && players[id] instanceof ClientPlayer) { players[id].interpolate(deltaTime); } }
}

console.log("gameLogic.js loaded (Manual Physics + Wall Raycast)");
