// docs/gameLogic.js (Reverted to Manual Physics + Debugging)

// Depends on: config.js, stateMachine.js, entities.js, input.js, network.js, uiManager.js
// Accesses globals: scene, camera, controls, players, localPlayerId, CONFIG, THREE, Network, Input, UIManager, stateMachine,
//                   velocityY, isOnGround, raycaster // Using manual physics state

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
        if (typeof velocityY !== 'number') velocityY = 0;
        velocityY -= (CONFIG?.GRAVITY || 25.0) * deltaTime;
    } else {
        velocityY = 0; // Stop vertical movement if dead
    }

    // --- 2. Update Vertical Position ---
    controlsObject.position.y += velocityY * deltaTime;
    let wasOnGround = typeof isOnGround === 'boolean' ? isOnGround : false; // Store previous state, default false
    isOnGround = false; // Assume not on ground

    // --- 3. Ground Collision Check (Raycast) ---
    let didHitGround = false; // Track if any ray hit
    if (mapMeshParam && isAlive) {
        const feetOffset = 0.1;
        const groundCheckDistance = feetOffset + 0.2;
        const cameraHeight = CONFIG?.CAMERA_Y_OFFSET || 1.6;

        // Ray starts near feet level
        const rayOrigin = new THREE.Vector3(
            controlsObject.position.x,
            controlsObject.position.y - cameraHeight + feetOffset, // Origin near logical feet
            controlsObject.position.z
        );
        const rayDirection = new THREE.Vector3(0, -1, 0);

        if (!raycaster) raycaster = new THREE.Raycaster();
        raycaster.set(rayOrigin, rayDirection);
        raycaster.far = groundCheckDistance;

        const intersects = raycaster.intersectObject(mapMeshParam, true); // Raycast

        if (intersects.length > 0) {
            const distanceToGround = intersects[0].distance;
             console.log(`Ray HIT: Dist=${distanceToGround.toFixed(3)}, PointY=${intersects[0].point.y.toFixed(3)}, FeetOffset=${feetOffset.toFixed(3)}`); // DEBUG LOG
            if (distanceToGround <= feetOffset + 0.05) { // Slightly larger tolerance maybe
                didHitGround = true;
                isOnGround = true;
                if (velocityY < 0) {
                    velocityY = 0;
                    controlsObject.position.y = intersects[0].point.y + cameraHeight; // Snap
                }
            }
        }

        // --- DEBUG RAYCAST VISUALIZATION ---
        if (typeof scene !== 'undefined' && scene) { // Check if scene global exists
            const existingLine = scene.getObjectByName("debugRayLine");
            if (existingLine) scene.remove(existingLine);
            const material = new THREE.LineBasicMaterial({ color: isOnGround ? 0x00ff00 : 0xff0000 });
            const points = [ rayOrigin.clone(), rayOrigin.clone().addScaledVector(rayDirection, groundCheckDistance) ];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, material);
            line.name = "debugRayLine";
            scene.add(line);
        }
        // --- END DEBUG RAYCAST ---

    } // End if(mapMeshParam && isAlive)

    if (wasOnGround && !isOnGround) { console.log("Left ground contact."); }
    else if (!wasOnGround && isOnGround) { console.log("Made ground contact."); }

    // --- 4. Void Check ---
    let fellIntoVoid = false;
    if (isAlive) {
        const currentFeetY = controlsObject.position.y - (CONFIG?.CAMERA_Y_OFFSET || 1.6);
        if (currentFeetY < (CONFIG.VOID_Y_LEVEL || -20)) { fellIntoVoid = true; console.log("Fell below Y level"); }
        if (!fellIntoVoid && (Math.abs(controlsObject.position.x) > (CONFIG.MAP_BOUNDS_X || 50) || Math.abs(controlsObject.position.z) > (CONFIG.MAP_BOUNDS_Z || 50))) { fellIntoVoid = true; console.log("Fell outside bounds"); }
        if (fellIntoVoid) { console.log("Void death triggered!"); localPlayerData.health = 0; if(UIManager) UIManager.updateHealthBar(0); if(Network) Network.sendVoidDeath(); }
    }

    // --- 5. Horizontal Movement (Only if Alive) ---
    if (isAlive) {
        const moveSpeed = Input.keys['ShiftLeft'] ? (CONFIG?.MOVEMENT_SPEED_SPRINTING || 10.5) : (CONFIG?.MOVEMENT_SPEED || 7.0);
        const deltaSpeed = moveSpeed * deltaTime;
        const forward = new THREE.Vector3(), right = new THREE.Vector3();
        if (camera) { camera.getWorldDirection(forward); forward.y=0; forward.normalize(); right.crossVectors(camera.up, forward).normalize(); }
        else { console.error("Camera missing!"); return; }
        let moveDirection = new THREE.Vector3(0,0,0);
        if(Input.keys['KeyW']){moveDirection.add(forward);} if(Input.keys['KeyS']){moveDirection.sub(forward);}
        if(Input.keys['KeyA']){moveDirection.sub(right);} if(Input.keys['KeyD']){moveDirection.add(right);} // Correct A/D
        if(moveDirection.lengthSq() > 0){ moveDirection.normalize(); controlsObject.position.addScaledVector(moveDirection, deltaSpeed); }
    }

    // --- 6. Dash Movement (Only if Alive) ---
    if (isAlive && typeof Input !== 'undefined' && Input.isDashing) {
        controlsObject.position.addScaledVector(Input.dashDirection, (CONFIG?.DASH_FORCE || 25.0) * deltaTime);
    }

    // --- 7. Collision (Player-Player - Basic Horizontal Revert) ---
    if (isAlive) {
        const currentPosition = controlsObject.position;
        const collisionRadius = CONFIG?.PLAYER_RADIUS || 0.4;
        const cameraHeight = CONFIG?.CAMERA_Y_OFFSET || 1.6;
        const playerHeightCheck = CONFIG?.PLAYER_HEIGHT || 1.8;

        for (const id in players) {
            if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh?.visible && players[id].mesh.position && players[id].health > 0) {
                const otherMesh = players[id].mesh;
                const otherPos = otherMesh.position;

                const distanceXZ = new THREE.Vector2(currentPosition.x - otherPos.x, currentPosition.z - otherPos.z).length();

                if (distanceXZ < collisionRadius * 2) {
                    const currentFeetY = currentPosition.y - cameraHeight;
                    let otherFeetY = otherPos.y;
                    if (otherMesh.geometry instanceof THREE.CylinderGeometry) { otherFeetY = otherPos.y - playerHeightCheck / 2; }
                    const verticalDistance = Math.abs(currentFeetY - otherFeetY);

                    if (verticalDistance < playerHeightCheck) {
                        currentPosition.x = previousPosition.x;
                        currentPosition.z = previousPosition.z;
                        break;
                    }
                }
            }
        }
    }

    // --- 8. Send Network Updates ---
    if (isAlive) {
        const cameraHeight = CONFIG?.CAMERA_Y_OFFSET || 1.6;
        const logicalPosition = new THREE.Vector3( controlsObject.position.x, controlsObject.position.y - cameraHeight, controlsObject.position.z );
        const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const currentRotationY = currentRotation.y;
        const pTSq = CONFIG?.PLAYER_MOVE_THRESHOLD_SQ || 0.0001; const rTh = 0.01;
        const posChanged = logicalPosition.distanceToSquared(new THREE.Vector3(localPlayerData.x??0, localPlayerData.y??0, localPlayerData.z??0)) > pTSq;
        const rotChanged = Math.abs(currentRotationY - (localPlayerData.rotationY??0)) > rTh;

        if (posChanged || rotChanged) {
            localPlayerData.x = logicalPosition.x; localPlayerData.y = logicalPosition.y; localPlayerData.z = logicalPosition.z; localPlayerData.rotationY = currentRotationY;
            if (Network) Network.sendPlayerUpdate({ x: localPlayerData.x, y: localPlayerData.y, z: localPlayerData.z, rotationY: localPlayerData.rotationY });
        }
    }

} // End updateLocalPlayer


/** Updates remote players interpolation */
function updateRemotePlayers(deltaTime) {
    for (const id in players) {
        if (id !== localPlayerId && players[id] instanceof ClientPlayer) {
            players[id].interpolate(deltaTime); // Uses ClientPlayer's internal lerping
        }
    }
}

console.log("gameLogic.js loaded (Manual Physics Reverted + Debug)");
