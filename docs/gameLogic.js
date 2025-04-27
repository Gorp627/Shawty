// docs/gameLogic.js (Reverted to Manual Physics)

// Depends on: config.js, stateMachine.js, entities.js, input.js, network.js, uiManager.js
// Accesses globals: camera, controls, players, localPlayerId, CONFIG, THREE, ClientPlayer, Network, Input, UIManager, stateMachine,
//                   mapMesh, velocityY, isOnGround, raycaster // Back to using these globals

/**
 * Updates the local player's physics, state, movement, dash, collision, and network sync MANUALLY.
 * @param {number} deltaTime Time since last frame.
 * @param {THREE.Object3D} mapMeshParam Reference to the visual map mesh object for raycasting.
 */
function updateLocalPlayer(deltaTime, mapMeshParam) { // Accept map mesh again
    // --- Guard Clause: Ensure active play state and locked controls ---
    const isPlaying = stateMachine?.is('playing');
    const isLocked = controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null;

    if (!isPlaying || !isLocked || !localPlayerData) { return; }

    const isAlive = localPlayerData.health > 0;
    const controlsObject = controls.getObject();

    // --- Store Previous Position for Revert ---
    const previousPosition = controlsObject.position.clone();

    // --- 1. Apply Gravity ---
    if (isAlive) {
        velocityY -= (CONFIG.GRAVITY || 25.0) * deltaTime;
    } else {
        velocityY = 0; // Stop vertical movement if dead
    }

    // --- 2. Update Vertical Position ---
    controlsObject.position.y += velocityY * deltaTime;
    let wasOnGround = isOnGround; // Store previous state
    isOnGround = false; // Assume not on ground

    // --- 3. Ground Collision Check (Raycast) ---
    if (mapMeshParam && isAlive) { // Check map exists and player alive
        const feetOffset = 0.1; // Start ray slightly above feet
        const groundCheckDistance = feetOffset + 0.2; // Max distance to check down
        const cameraHeight = CONFIG?.CAMERA_Y_OFFSET || 1.6; // Camera offset from feet Y=0

        // Ray starts near feet level
        const rayOrigin = new THREE.Vector3(
            controlsObject.position.x,
            controlsObject.position.y - cameraHeight + feetOffset, // Origin near logical feet
            controlsObject.position.z
        );
        const rayDirection = new THREE.Vector3(0, -1, 0);

        if (!raycaster) raycaster = new THREE.Raycaster(); // Initialize if missing
        raycaster.set(rayOrigin, rayDirection);
        raycaster.far = groundCheckDistance;

        const intersects = raycaster.intersectObject(mapMeshParam, true); // Use passed map mesh

        if (intersects.length > 0) {
            const distanceToGround = intersects[0].distance;
            // Check if the hit is close enough to the feet origin point
            if (distanceToGround <= feetOffset + 0.01) { // Allow tiny tolerance
                isOnGround = true;
                // If falling onto ground, stop velocity and snap position
                if (velocityY < 0) {
                    velocityY = 0;
                     // Snap controls Y so feet are on ground + camera height
                    controlsObject.position.y = intersects[0].point.y + cameraHeight;
                }
            }
        } else {
             // No ground detected directly below
             if (wasOnGround) console.log("Left ground contact.");
        }
    } else if (!mapMeshParam && isAlive) {
         console.warn("updateLocalPlayer: mapMeshParam was null/undefined during physics update!");
    }

    // --- 4. Void Check ---
    let fellIntoVoid = false;
    if (isAlive) {
        const currentY = controlsObject.position.y - (CONFIG?.CAMERA_Y_OFFSET || 1.6); // Calculate feet Y
        if (currentY < (CONFIG.VOID_Y_LEVEL || -40)) { fellIntoVoid = true; console.log("Fell below Y level"); }
        if (!fellIntoVoid && (Math.abs(controlsObject.position.x) > (CONFIG.MAP_BOUNDS_X || 50) || Math.abs(controlsObject.position.z) > (CONFIG.MAP_BOUNDS_Z || 50))) { fellIntoVoid = true; console.log("Fell outside bounds"); }
        if (fellIntoVoid) {
            console.log("Player fell into void!"); localPlayerData.health = 0;
            if(UIManager) UIManager.updateHealthBar(0); if(Network) Network.sendVoidDeath();
             // Optionally reset position immediately? Or wait for respawn packet?
             // controlsObject.position.y = 100; // Teleport way up
        }
    }

    // --- 5. Horizontal Movement (Only if Alive) ---
    if (isAlive) {
        const moveSpeed = Input.keys['ShiftLeft'] ? (CONFIG.MOVEMENT_SPEED_SPRINTING || 9.5) : (CONFIG.MOVEMENT_SPEED || 7.0);
        const deltaSpeed = moveSpeed * deltaTime;
        const forward = new THREE.Vector3(), right = new THREE.Vector3();

        if (camera) {
            camera.getWorldDirection(forward); forward.y=0; forward.normalize();
            right.crossVectors(camera.up, forward).normalize(); // Use camera up which should be (0,1,0)
        } else { console.error("Camera missing!"); return; }

        let moveDirection = new THREE.Vector3(0,0,0);
        // Apply Input (A/D Swapped correctly from original)
        if(Input.keys['KeyW']){moveDirection.add(forward);}
        if(Input.keys['KeyS']){moveDirection.sub(forward);}
        if(Input.keys['KeyA']){moveDirection.sub(right);} // A = Strafe Left
        if(Input.keys['KeyD']){moveDirection.add(right);} // D = Strafe Right

        if(moveDirection.lengthSq() > 0){
            moveDirection.normalize();
            // Directly modify controls object position for movement
            controlsObject.position.addScaledVector(moveDirection, deltaSpeed);
        }
    }

    // --- 6. Dash Movement (Only if Alive) ---
    if (isAlive && Input.isDashing) {
        // Apply extra velocity based on dash direction for a duration
        controlsObject.position.addScaledVector(Input.dashDirection, (CONFIG.DASH_FORCE || 25.0) * deltaTime);
        // isDashing flag is reset via timeout in Input.js
    }

    // --- 7. Collision (Player-Player - Basic Horizontal Revert) ---
    if (isAlive) {
        const currentPosition = controlsObject.position;
        const collisionRadius = CONFIG.PLAYER_RADIUS || 0.4;
        const cameraHeight = CONFIG.CAMERA_Y_OFFSET || 1.6;

        for (const id in players) {
            if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh?.visible && players[id].mesh.position && players[id].health > 0) {
                const otherMesh = players[id].mesh;
                const otherPos = otherMesh.position; // Visual position

                const distanceXZ = new THREE.Vector2(currentPosition.x - otherPos.x, currentPosition.z - otherPos.z).length();

                if (distanceXZ < collisionRadius * 2) {
                    // Compare approximate vertical positions (feet levels)
                    const currentFeetY = currentPosition.y - cameraHeight;
                    let otherFeetY = otherPos.y; // Assume GLB origin is feet
                    if (otherMesh.geometry instanceof THREE.CylinderGeometry) { otherFeetY = otherPos.y - (CONFIG.PLAYER_HEIGHT || 1.8) / 2; } // Adjust cylinder center
                    const verticalDistance = Math.abs(currentFeetY - otherFeetY);

                    if (verticalDistance < (CONFIG.PLAYER_HEIGHT || 1.8)) { // Check height overlap
                        currentPosition.x = previousPosition.x;
                        currentPosition.z = previousPosition.z;
                        // console.log("Player collision revert");
                        break;
                    }
                }
            }
        }
    }


    // --- 8. Send Network Updates ---
    if (isAlive) { // Only send updates if alive? Or send final position on death? Send if alive.
        const cameraHeight = CONFIG?.CAMERA_Y_OFFSET || 1.6;
        const logicalPosition = new THREE.Vector3(
             controlsObject.position.x,
             controlsObject.position.y - cameraHeight, // Calculate feet Y from controls Y
             controlsObject.position.z
        );
        const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const currentRotationY = currentRotation.y;

        // Compare against cached data
        const pTSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ || 0.0001; const rTh = 0.01;
        const posChanged = logicalPosition.distanceToSquared(new THREE.Vector3(localPlayerData.x??0, localPlayerData.y??0, localPlayerData.z??0)) > pTSq;
        const rotChanged = Math.abs(currentRotationY - (localPlayerData.rotationY??0)) > rTh;

        if (posChanged || rotChanged) {
            // Update local cache object
            localPlayerData.x = logicalPosition.x; localPlayerData.y = logicalPosition.y; localPlayerData.z = logicalPosition.z; localPlayerData.rotationY = currentRotationY;
            if (Network) Network.sendPlayerUpdate({ x: localPlayerData.x, y: localPlayerData.y, z: localPlayerData.z, rotationY: localPlayerData.rotationY });
        }
    }

} // End updateLocalPlayer


/** Updates remote players interpolation (No physics involved) */
function updateRemotePlayers(deltaTime) {
    for (const id in players) {
        if (id !== localPlayerId && players[id] instanceof ClientPlayer) {
            players[id].interpolate(deltaTime); // Uses ClientPlayer's internal lerping
        }
    }
}

console.log("gameLogic.js loaded (Reverted to Manual Physics)");
