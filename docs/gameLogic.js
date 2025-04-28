// docs/gameLogic.js (Manual Physics + Wall Collision + Re-added updateRemotePlayers)

// Depends on: config.js, stateMachine.js, entities.js, input.js, network.js, uiManager.js
// Accesses globals: scene, camera, controls, players, localPlayerId, CONFIG, THREE, Network, Input, UIManager, stateMachine,
//                   velocityY, isOnGround, raycaster

/**
 * Updates the local player's physics, state, movement, dash, collision, and network sync MANUALLY.
 * @param {number} deltaTime Time since last frame.
 * @param {THREE.Object3D} mapMeshParam Reference to the visual map mesh object for raycasting.
 */
function updateLocalPlayer(deltaTime, mapMeshParam) {
    // --- Guard Clause: Ensure active play state and locked controls ---
    const isPlaying = typeof stateMachine !== 'undefined' && stateMachine.is('playing');
    const isLocked = typeof controls !== 'undefined' && controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;

    if (!isPlaying || !isLocked || !localPlayerData) { return; }

    const isAlive = localPlayerData.health > 0;
    const controlsObject = typeof controls !== 'undefined' ? controls.getObject() : null; // Get controls object

    // Ensure controls object exists
    if (!controlsObject) { console.error("Controls object missing in updateLocalPlayer!"); return; }

    // --- Guard Clause for Map Mesh (Still good practice) ---
    if (!mapMeshParam && isAlive) { // Check map exists if alive (needed for ground check)
        console.warn("updateLocalPlayer: mapMeshParam missing for physics update!");
        // Allow falling even if map missing? Or freeze? Let's allow falling for now.
    }

    // --- Store Previous Position for Revert ---
    const previousPosition = controlsObject.position.clone();

    // --- 1. Apply Gravity ---
    if (isAlive) {
        // Ensure velocityY is a number before applying gravity
        if (typeof velocityY !== 'number') window.velocityY = 0; // Use window scope explicitly if needed
        velocityY -= (CONFIG?.GRAVITY || 25.0) * deltaTime;
    } else {
        window.velocityY = 0; // Stop vertical movement if dead
    }

    // --- 2. Update Vertical Position ---
    // Ensure velocityY is used from correct scope
    controlsObject.position.y += window.velocityY * deltaTime;
    let wasOnGround = typeof isOnGround === 'boolean' ? isOnGround : false; // Store previous state, default false
    window.isOnGround = false; // Assume not on ground for this frame, assign to global

    // --- 3. Ground Collision Check (Raycast) ---
    let didHitGround = false; // Track if any ray hit
    if (mapMeshParam && isAlive) {
        const feetOffset = 0.1; // Start ray slightly above feet
        const groundCheckDistance = feetOffset + 0.2; // Max distance to check down
        const cameraHeight = CONFIG?.CAMERA_Y_OFFSET || 1.6; // Camera offset from feet Y=0

        // Ray starts near feet level
        const rayOrigin = new THREE.Vector3(
            controlsObject.position.x,
            controlsObject.position.y - cameraHeight + feetOffset, // Origin near logical feet
            controlsObject.position.z
        );
        const rayDirection = new THREE.Vector3(0, -1, 0); // Straight down

        // Ensure global raycaster exists
        if (typeof raycaster === 'undefined' || !raycaster) raycaster = new THREE.Raycaster();
        raycaster.set(rayOrigin, rayDirection);
        raycaster.far = groundCheckDistance;

        const intersects = raycaster.intersectObject(mapMeshParam, true); // Use passed map mesh

        if (intersects.length > 0) {
            const distanceToGround = intersects[0].distance;
             // console.log(`Ray HIT: Dist=${distanceToGround.toFixed(3)}, PointY=${intersects[0].point.y.toFixed(3)}, FeetOffset=${feetOffset.toFixed(3)}`); // DEBUG LOG
            if (distanceToGround <= feetOffset + 0.05) { // Allow tiny tolerance
                didHitGround = true;
                window.isOnGround = true; // Set global flag
                if (window.velocityY < 0) { // Check global velocityY
                    window.velocityY = 0; // Reset global velocityY
                    controlsObject.position.y = intersects[0].point.y + cameraHeight; // Snap
                }
            }
        }

        // --- DEBUG RAYCAST VISUALIZATION ---
        if (typeof scene !== 'undefined' && scene) { // Check if scene global exists
            const existingLine = scene.getObjectByName("debugRayLine");
            if (existingLine) scene.remove(existingLine);
            const material = new THREE.LineBasicMaterial({ color: window.isOnGround ? 0x00ff00 : 0xff0000 }); // Use global isOnGround
            const points = [ rayOrigin.clone(), rayOrigin.clone().addScaledVector(rayDirection, groundCheckDistance) ];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, material);
            line.name = "debugRayLine";
            scene.add(line);
        }
        // --- END DEBUG RAYCAST ---

    } // End if(mapMeshParam && isAlive)

    if (wasOnGround && !window.isOnGround) { console.log("Left ground contact."); }
    else if (!wasOnGround && window.isOnGround) { console.log("Made ground contact."); }


    // --- 4. Void Check ---
    let fellIntoVoid = false;
    if (isAlive) {
        const currentFeetY = controlsObject.position.y - (CONFIG?.CAMERA_Y_OFFSET || 1.6);
        if (currentFeetY < (CONFIG.VOID_Y_LEVEL || -100)) { fellIntoVoid = true; console.log("Fell below Y level"); }
        if (!fellIntoVoid && (Math.abs(controlsObject.position.x) > (CONFIG.MAP_BOUNDS_X || 100) || Math.abs(controlsObject.position.z) > (CONFIG.MAP_BOUNDS_Z || 100))) { fellIntoVoid = true; console.log("Fell outside bounds"); }
        if (fellIntoVoid) { console.log("Void death triggered!"); localPlayerData.health = 0; if(UIManager) UIManager.updateHealthBar(0); if(Network) Network.sendVoidDeath(); /* Continue processing this frame to send update */ }
    }

    // --- 5. Calculate Intended Horizontal Movement (Only if Alive and not in void) ---
    let intendedMove = new THREE.Vector3(0, 0, 0);
    let horizontalMoveDir = new THREE.Vector3(0, 0, 0);
    if (isAlive && !fellIntoVoid) {
        const moveSpeed = Input.keys['ShiftLeft'] ? (CONFIG?.MOVEMENT_SPEED_SPRINTING || 10.5) : (CONFIG?.MOVEMENT_SPEED || 7.0);
        const deltaSpeed = moveSpeed * deltaTime;
        const forward = new THREE.Vector3(), right = new THREE.Vector3();
        if (camera) { camera.getWorldDirection(forward); forward.y=0; forward.normalize(); right.crossVectors(camera.up, forward).normalize(); }
        else { console.error("Camera missing!"); return; }
        let moveDirection = new THREE.Vector3(0,0,0);
        if(Input.keys['KeyW']){moveDirection.add(forward);} if(Input.keys['KeyS']){moveDirection.sub(forward);}
        if(Input.keys['KeyA']){moveDirection.sub(right);} if(Input.keys['KeyD']){moveDirection.add(right);} // A/D corrected
        if(moveDirection.lengthSq() > 0.0001){ horizontalMoveDir.copy(moveDirection).normalize(); intendedMove.addScaledVector(horizontalMoveDir, deltaSpeed); }
    }

    // --- 6. Wall Collision Check (Horizontal Raycasts) ---
    if (isAlive && !fellIntoVoid && mapMeshParam && intendedMove.lengthSq() > 0.0001) {
        const playerRadius = CONFIG?.PLAYER_RADIUS || 0.4;
        const checkDistance = playerRadius + intendedMove.length() + 0.1; // Check slightly ahead
        const cameraHeight = CONFIG?.CAMERA_Y_OFFSET || 1.6; const playerHeight = CONFIG?.PLAYER_HEIGHT || 1.8; const playerCenterY = controlsObject.position.y - cameraHeight + playerHeight / 2.0;
        const rayOrigins = [ new THREE.Vector3(controlsObject.position.x, controlsObject.position.y - cameraHeight + 0.2, controlsObject.position.z), new THREE.Vector3(controlsObject.position.x, playerCenterY, controlsObject.position.z), new THREE.Vector3(controlsObject.position.x, controlsObject.position.y - 0.2, controlsObject.position.z) ];
        if (!raycaster) raycaster = new THREE.Raycaster(); raycaster.far = checkDistance; let wallBlocked = false;
        for(const origin of rayOrigins) { raycaster.set(origin, horizontalMoveDir); const wallIntersects = raycaster.intersectObject(mapMeshParam, true); if (wallIntersects.length > 0 && wallIntersects[0].distance < (intendedMove.length() + playerRadius)) { intendedMove.set(0,0,0); wallBlocked = true; break; } }
    }

    // --- 7. Apply FINAL Calculated Horizontal Movement ---
    controlsObject.position.x += intendedMove.x;
    controlsObject.position.z += intendedMove.z;

    // --- 8. Apply Dash Velocity Additively (Only if Alive) ---
    if (isAlive && !fellIntoVoid && typeof Input !== 'undefined' && Input.isDashing) {
        controlsObject.position.addScaledVector(Input.dashDirection, (CONFIG?.DASH_FORCE || 25.0) * deltaTime);
    }

    // --- 9. Collision (Player-Player - Revert to PREVIOUS frame's position) ---
    if (isAlive) {
        const currentPosAfterMove = controlsObject.position; const collisionRadius = CONFIG?.PLAYER_RADIUS || 0.4; const cameraHeight = CONFIG?.CAMERA_Y_OFFSET || 1.6; const playerHeightCheck = CONFIG?.PLAYER_HEIGHT || 1.8;
        for (const id in players) { if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh?.visible && players[id].mesh.position && players[id].health > 0) { const otherMesh = players[id].mesh; const otherPos = otherMesh.position; const distanceXZ = new THREE.Vector2(currentPosAfterMove.x - otherPos.x, currentPosAfterMove.z - otherPos.z).length(); if (distanceXZ < collisionRadius * 2) { const currentFeetY = currentPosAfterMove.y - cameraHeight; let otherFeetY = otherPos.y; if (otherMesh.geometry instanceof THREE.CylinderGeometry) { otherFeetY = otherPos.y - playerHeightCheck / 2; } const verticalDistance = Math.abs(currentFeetY - otherFeetY); if (verticalDistance < playerHeightCheck) { controlsObject.position.copy(previousPosition); console.log("Player collision - reverted to previous position."); break; } } } }
    }

    // --- 10. Send Network Updates ---
    if (isAlive && !fellIntoVoid) {
        const cameraHeight = CONFIG?.CAMERA_Y_OFFSET || 1.6; const logicalPosition = new THREE.Vector3( controlsObject.position.x, controlsObject.position.y - cameraHeight, controlsObject.position.z ); const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const currentRotationY = currentRotation.y; const pTSq = CONFIG?.PLAYER_MOVE_THRESHOLD_SQ || 0.0001; const rTh = 0.01; const posChanged = logicalPosition.distanceToSquared(new THREE.Vector3(localPlayerData.x??0, localPlayerData.y??0, localPlayerData.z??0)) > pTSq; const rotChanged = Math.abs(currentRotationY - (localPlayerData.rotationY??0)) > rTh; if (posChanged || rotChanged) { localPlayerData.x = logicalPosition.x; localPlayerData.y = logicalPosition.y; localPlayerData.z = logicalPosition.z; localPlayerData.rotationY = currentRotationY; if (Network) Network.sendPlayerUpdate({ x: localPlayerData.x, y: localPlayerData.y, z: localPlayerData.z, rotationY: localPlayerData.rotationY }); }
    }

} // End updateLocalPlayer


// --- <<< RE-ADDED updateRemotePlayers Function >>> ---
/** Updates remote players interpolation */
function updateRemotePlayers(deltaTime) {
    for (const id in players) {
        // Ensure it's a remote player and an instance of ClientPlayer which has interpolate method
        if (id !== localPlayerId && players[id] instanceof ClientPlayer) {
            players[id].interpolate(deltaTime); // Uses ClientPlayer's internal lerping
        }
    }
}
// --- <<< END RE-ADDED Function >>> ---

console.log("gameLogic.js loaded (Manual Physics + Wall Raycast + Re-added updateRemotePlayers)");
