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
    let wasOnGround = isOnGround; isOnGround = false;

    // --- 2. Ground Collision Check (Raycast) ---
    let didHitGround = false;
    if (mapMeshParam && isAlive) {
        const feetOffset = 0.1; const groundCheckDistance = feetOffset + 0.2; const cameraHeight = CONFIG?.CAMERA_Y_OFFSET || 1.6;
        const rayOrigin = new THREE.Vector3( controlsObject.position.x, controlsObject.position.y - cameraHeight + feetOffset, controlsObject.position.z ); const rayDirection = new THREE.Vector3(0, -1, 0);
        if (!raycaster) raycaster = new THREE.Raycaster(); raycaster.set(rayOrigin, rayDirection); raycaster.far = groundCheckDistance;
        const intersects = raycaster.intersectObject(mapMeshParam, true);
        if (intersects.length > 0) { const distanceToGround = intersects[0].distance; if (distanceToGround <= feetOffset + 0.05) { didHitGround = true; isOnGround = true; if (velocityY < 0) { velocityY = 0; controlsObject.position.y = intersects[0].point.y + cameraHeight; } } }
        // --- Ground Check Debug Ray ---
        if (scene) { /* ... (debug ray logic same as before) ... */ }
    } else if (!mapMeshParam && isAlive) { console.warn("mapMeshParam missing for ground check!"); }
    if (wasOnGround && !isOnGround) { console.log("Left ground."); } else if (!wasOnGround && isOnGround) { console.log("On ground."); }

    // --- 3. Void Check ---
    let fellIntoVoid = false;
    if (isAlive) { const currentFeetY = controlsObject.position.y - (CONFIG?.CAMERA_Y_OFFSET || 1.6); if (currentFeetY < (CONFIG.VOID_Y_LEVEL || -50)) { fellIntoVoid = true; console.log("Fell below Y level"); } if (!fellIntoVoid && (Math.abs(controlsObject.position.x) > (CONFIG.MAP_BOUNDS_X || 50) || Math.abs(controlsObject.position.z) > (CONFIG.MAP_BOUNDS_Z || 50))) { fellIntoVoid = true; console.log("Fell outside bounds"); } if (fellIntoVoid) { console.log("Void death!"); localPlayerData.health = 0; if(UIManager) UIManager.updateHealthBar(0); if(Network) Network.sendVoidDeath(); } }

    // --- 4. Calculate Intended Horizontal Movement (Only if Alive) ---
    let intendedMove = new THREE.Vector3(0, 0, 0); // Store intended displacement vector
    if (isAlive) {
        const moveSpeed = Input.keys['ShiftLeft'] ? (CONFIG.MOVEMENT_SPEED_SPRINTING || 10.5) : (CONFIG.MOVEMENT_SPEED || 7.0);
        const deltaSpeed = moveSpeed * deltaTime;
        const forward = new THREE.Vector3(), right = new THREE.Vector3();
        if (camera) { camera.getWorldDirection(forward); forward.y=0; forward.normalize(); right.crossVectors(camera.up, forward).normalize(); } else { console.error("Camera missing!"); return; }
        let moveDirection = new THREE.Vector3(0,0,0);
        if(Input.keys['KeyW']){moveDirection.add(forward);} if(Input.keys['KeyS']){moveDirection.sub(forward);}
        if(Input.keys['KeyA']){moveDirection.sub(right);} if(Input.keys['KeyD']){moveDirection.add(right);} // Corrected A/D
        if(moveDirection.lengthSq() > 0){ moveDirection.normalize(); intendedMove.addScaledVector(moveDirection, deltaSpeed); }
    }

    // --- 5. Wall Collision Check (Horizontal Raycasts) ---
    if (isAlive && mapMeshParam && intendedMove.lengthSq() > 0.0001) { // Only check if trying to move
        const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4;
        const checkDistance = playerRadius + 0.1; // Ray length: radius + small buffer
        const cameraHeight = CONFIG?.CAMERA_Y_OFFSET || 1.6;
        const playerCenterY = controlsObject.position.y - cameraHeight + (CONFIG.PLAYER_HEIGHT / 2.0); // Approx vertical center

        const horizontalMoveDir = intendedMove.clone().normalize(); // Direction player wants to move horizontally

        // Define ray origins (e.g., slightly above feet, center height, near head height)
        const rayOrigins = [
             new THREE.Vector3(controlsObject.position.x, controlsObject.position.y - cameraHeight + 0.2, controlsObject.position.z), // Near feet
             new THREE.Vector3(controlsObject.position.x, playerCenterY, controlsObject.position.z), // Center H
             new THREE.Vector3(controlsObject.position.x, controlsObject.position.y - 0.2, controlsObject.position.z) // Near Head (using controls Y directly)
        ];

        if (!raycaster) raycaster = new THREE.Raycaster();
        raycaster.far = checkDistance;

        let blocked = false;
        for(const origin of rayOrigins) {
             raycaster.set(origin, horizontalMoveDir); // Cast in the direction of intended movement
             const wallIntersects = raycaster.intersectObject(mapMeshParam, true);
             if (wallIntersects.length > 0) {
                 // Hit something in the direction of movement, very close
                 console.log("Wall collision detected!");
                 intendedMove.set(0,0,0); // Block movement
                 blocked = true;
                 break; // Stop checking other rays if blocked
             }
        }
        // --- Optionally add side rays if needed for more accuracy ---
        // You might need 4 horizontal rays (fwd, back, left, right RELATIVE to camera)
        // if the simple movement direction check isn't robust enough.
    }

    // --- 6. Apply FINAL Horizontal Movement (Intended move, possibly modified by wall check) ---
    controlsObject.position.add(intendedMove);

    // --- 7. Apply Dash Velocity (Only if Alive) ---
    if (isAlive && Input.isDashing) {
        // Add dash velocity ON TOP of regular movement for this frame
        controlsObject.position.addScaledVector(Input.dashDirection, (CONFIG.DASH_FORCE || 25.0) * deltaTime);
    }

    // --- 8. Collision (Player-Player - Revert Horizontal based on PREVIOUS frame) ---
    if (isAlive) {
        const currentPosition = controlsObject.position; // Position AFTER applying movement/dash
        const collisionRadius = CONFIG?.PLAYER_RADIUS || 0.4; const cameraHeight = CONFIG?.CAMERA_Y_OFFSET || 1.6; const playerHeightCheck = CONFIG?.PLAYER_HEIGHT || 1.8;
        for (const id in players) { if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh?.visible && players[id].mesh.position && players[id].health > 0) { const otherMesh = players[id].mesh; const otherPos = otherMesh.position; const distanceXZ = new THREE.Vector2(currentPosition.x - otherPos.x, currentPosition.z - otherPos.z).length(); if (distanceXZ < collisionRadius * 2) { const currentFeetY = currentPosition.y - cameraHeight; let otherFeetY = otherPos.y; if (otherMesh.geometry instanceof THREE.CylinderGeometry) { otherFeetY = otherPos.y - playerHeightCheck / 2; } const verticalDistance = Math.abs(currentFeetY - otherFeetY); if (verticalDistance < playerHeightCheck) { // Revert HORIZONTAL components using previousPosition recorded at start
                        currentPosition.x = previousPosition.x + intendedMove.x; // Apply allowed intended X move
                        currentPosition.z = previousPosition.z + intendedMove.z; // Apply allowed intended Z move
                        // We don't revert Y as vertical physics already happened
                        console.log("Player collision - Attempting non-revert horizontal."); // This might still allow sticking
                        break; // Collision detected and handled (sort of)
                    } } } }


    // --- 9. Send Network Updates ---
    if (isAlive) {
        const cameraHeight = CONFIG?.CAMERA_Y_OFFSET || 1.6; const logicalPosition = new THREE.Vector3( controlsObject.position.x, controlsObject.position.y - cameraHeight, controlsObject.position.z ); const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const currentRotationY = currentRotation.y; const pTSq = CONFIG?.PLAYER_MOVE_THRESHOLD_SQ || 0.0001; const rTh = 0.01; const posChanged = logicalPosition.distanceToSquared(new THREE.Vector3(localPlayerData.x??0, localPlayerData.y??0, localPlayerData.z??0)) > pTSq; const rotChanged = Math.abs(currentRotationY - (localPlayerData.rotationY??0)) > rTh; if (posChanged || rotChanged) { localPlayerData.x = logicalPosition.x; localPlayerData.y = logicalPosition.y; localPlayerData.z = logicalPosition.z; localPlayerData.rotationY = currentRotationY; if (Network) Network.sendPlayerUpdate({ x: localPlayerData.x, y: localPlayerData.y, z: localPlayerData.z, rotationY: localPlayerData.rotationY }); }
    }

} // End updateLocalPlayer


/** Updates remote players interpolation */
function updateRemotePlayers(deltaTime) {
    for (const id in players) { if (id !== localPlayerId && players[id] instanceof ClientPlayer) { players[id].interpolate(deltaTime); } }
}

console.log("gameLogic.js loaded (Manual Physics + Wall Raycast Attempt)");
