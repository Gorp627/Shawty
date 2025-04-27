// docs/gameLogic.js

// Depends on: config.js, stateMachine.js, entities.js, input.js, network.js, uiManager.js
// Accesses globals: camera, controls, players, localPlayerId, CONFIG, THREE, ClientPlayer, Network, Input, UIManager, stateMachine,
//                   mapMesh, velocityY, isOnGround, raycaster

// Controls movement (Horizontal + Vertical), Dash, Collision (Player/Ground), Void Check, and Network updates.

/**
 * Updates the local player's physics, state, movement, dash, collision, and network sync.
 * @param {number} deltaTime Time since last frame.
 */
function updateLocalPlayer(deltaTime) {
    // --- Guard Clause: Ensure active play state and locked controls ---
    const isPlaying = typeof stateMachine !== 'undefined' && stateMachine.is('playing');
    const isLocked = typeof controls !== 'undefined' && controls?.isLocked;
    const localPlayerData = localPlayerId ? players[localPlayerId] : null; // This is the plain object cache

    // STOP processing if not playing, not locked, or local player doesn't exist
    if (!isPlaying || !isLocked || !localPlayerData) {
        return;
    }

    // Check if alive *after* basic checks, allows void check even if server hasn't confirmed death yet
    const isAlive = localPlayerData.health > 0;

    // --- Get References ---
    const controlsObject = controls.getObject(); // Camera / Player Rig

    // --- Store Previous Position for Revert ---
    const previousPosition = controlsObject.position.clone();

    // --- 1. Apply Gravity ---
    // Only apply gravity if alive, otherwise player stays put until respawn packet
    if (isAlive) {
        velocityY -= (CONFIG.GRAVITY || 25.0) * deltaTime;
    } else {
        velocityY = 0; // Ensure dead players don't accumulate velocity
    }

    // --- 2. Update Vertical Position based on Velocity ---
    controlsObject.position.y += velocityY * deltaTime;
    isOnGround = false; // Assume not on ground until proven otherwise by raycast

    // --- 3. Ground Collision Check (Raycast) ---
    if (mapMesh && isAlive) { // Only check ground if map exists and player is alive
        const feetOffset = 0.1; // How far above feet to start the ray
        const groundCheckDistance = feetOffset + 0.1; // Max distance to check for ground (feetOffset + buffer)
        const rayOrigin = new THREE.Vector3(
            controlsObject.position.x,
            controlsObject.position.y - (CONFIG.CAMERA_Y_OFFSET || 1.9) + feetOffset, // Start slightly above logical feet
            controlsObject.position.z
        );
        const rayDirection = new THREE.Vector3(0, -1, 0);

        if (typeof raycaster === 'undefined') { // Safety check if raycaster wasn't init globally
            console.error("Raycaster missing!");
            raycaster = new THREE.Raycaster();
        }
        raycaster.set(rayOrigin, rayDirection);
        raycaster.far = groundCheckDistance; // Only check directly below

        const intersects = raycaster.intersectObject(mapMesh, true); // Check map recursively

        if (intersects.length > 0) {
            const distanceToGround = intersects[0].distance;
            // If the intersection distance is less than or equal to the offset we started above the feet, we are on ground.
            if (distanceToGround <= feetOffset + 0.01) { // Added small tolerance
                isOnGround = true;
                velocityY = 0; // Stop falling
                // Snap player exactly to the ground surface + camera offset
                controlsObject.position.y = intersects[0].point.y + (CONFIG.CAMERA_Y_OFFSET || 1.9);
                // console.log("Ground Hit! Snapped Y:", controlsObject.position.y); // Debug log
            }
        }
    } else if (!mapMesh && isAlive) {
        console.warn("mapMesh not available for ground check.");
        // Fallback: If no map, maybe assume ground at Y=0 if below a certain threshold?
        // if (controlsObject.position.y <= (CONFIG.CAMERA_Y_OFFSET || 1.9)) {
        //     isOnGround = true;
        //     velocityY = 0;
        //     controlsObject.position.y = (CONFIG.CAMERA_Y_OFFSET || 1.9);
        // }
    }


    // --- 4. Void Check (AFTER potential ground snap) ---
    let fellIntoVoid = false;
    if (isAlive) { // Only check if alive
        // Check Y Level
        if (controlsObject.position.y < (CONFIG.VOID_Y_LEVEL || -40)) {
            console.log("Fell below VOID_Y_LEVEL.");
            fellIntoVoid = true;
        }
        // Check X/Z map bounds
        if (Math.abs(controlsObject.position.x) > (CONFIG.MAP_BOUNDS_X || 50) ||
            Math.abs(controlsObject.position.z) > (CONFIG.MAP_BOUNDS_Z || 50)) {
            console.log("Fell outside MAP_BOUNDS.");
            fellIntoVoid = true;
        }

        if (fellIntoVoid) {
            console.log("Player fell into void!");
            // Immediately update local state to prevent further actions
            localPlayerData.health = 0;
            if(typeof UIManager !== 'undefined') UIManager.updateHealthBar(0);
            if(typeof Network !== 'undefined') Network.sendVoidDeath(); // Notify server
            // Optional: stop processing immediately after sending death notice
            return; // Exit update loop for this frame
        }
    }

    // --- 5. Horizontal Movement (Based on Input & Camera Direction) ---
    const moveSpeed = (typeof Input !== 'undefined' && Input.keys['ShiftLeft']) ? CONFIG.MOVEMENT_SPEED_SPRINTING : CONFIG.MOVEMENT_SPEED;
    const deltaSpeed = moveSpeed * deltaTime;
    const forward = new THREE.Vector3(), right = new THREE.Vector3();

    if (typeof camera !== 'undefined') {
        camera.getWorldDirection(forward); forward.y=0; forward.normalize();
        right.crossVectors(camera.up, forward).normalize();
    } else { console.error("Camera missing!"); return; }

    let moveDirection = new THREE.Vector3(0,0,0);
    if(Input.keys['KeyW']){moveDirection.add(forward);} if(Input.keys['KeyS']){moveDirection.sub(forward);}
    if(Input.keys['KeyA']){moveDirection.add(right);} // A = Right (Inverted)
    if(Input.keys['KeyD']){moveDirection.sub(right);} // D = Left (Inverted)

    if(moveDirection.lengthSq() > 0){
        moveDirection.normalize();
        controlsObject.position.addScaledVector(moveDirection, deltaSpeed);
    }

    // --- 6. Dash Movement ---
    if (typeof Input !== 'undefined' && Input.isDashing) {
        // Apply dash force - allowing vertical component based on view direction
        controlsObject.position.addScaledVector(Input.dashDirection, CONFIG.DASH_FORCE * deltaTime);
         // Optional: Reset vertical velocity during dash? Or let gravity affect it?
         // velocityY = 0; // Uncomment to make dash ignore gravity briefly
    }

    // --- 7. Collision (Player-Player - Basic Horizontal Revert) ---
    const currentPosition = controlsObject.position;
    const collisionRadius = CONFIG.PLAYER_RADIUS || 0.4;
    const cameraOffsetCheck = CONFIG.CAMERA_Y_OFFSET || 1.9;
    const playerHeightCheck = CONFIG.PLAYER_HEIGHT || 1.8;

    for (const id in players) {
        if (id !== localPlayerId && players[id] instanceof ClientPlayer && players[id].mesh?.visible && players[id].mesh.position && players[id].health > 0) {
            const otherMesh = players[id].mesh;
            const otherPos = otherMesh.position; // Visual position of the other player

            // Compare on XZ plane
            const distanceXZ = new THREE.Vector2(currentPosition.x - otherPos.x, currentPosition.z - otherPos.z).length();

            if (distanceXZ < collisionRadius * 2) { // Potential collision
                // Check vertical overlap - comparing estimated feet levels
                const currentFeetY = currentPosition.y - cameraOffsetCheck;
                let otherFeetY = otherPos.y; // Assume GLB origin at feet
                if (otherMesh.geometry instanceof THREE.CylinderGeometry) {
                     otherFeetY = otherPos.y - playerHeightCheck / 2; // Adjust for cylinder center origin
                }
                const verticalDistance = Math.abs(currentFeetY - otherFeetY);

                if (verticalDistance < playerHeightCheck) { // Vertical overlap exists
                    // Revert only horizontal position components
                    currentPosition.x = previousPosition.x;
                    currentPosition.z = previousPosition.z;
                    // console.log("Player-Player collision detected, reverting horizontal movement.");
                    break; // Stop checking after one collision
                }
            }
        }
    }


    // --- 8. Send Network Updates (IF state changed significantly AND alive) ---
    if (isAlive) { // Only send updates if alive
        const logicalPosition = new THREE.Vector3(
             controlsObject.position.x,
             controlsObject.position.y - (CONFIG.CAMERA_Y_OFFSET || 1.9), // Calculate feet Y
             controlsObject.position.z
        );
        const currentRotation = new THREE.Euler().setFromQuaternion(controlsObject.quaternion,'YXZ'); const currentRotationY = currentRotation.y;
        const lastSentState = playerState;

        const pTSq = CONFIG.PLAYER_MOVE_THRESHOLD_SQ || 0.0001;
        const rTh = 0.01;

        // Check if position or rotation changed significantly
        // Important: Compare against the *last sent state* stored in the plain object
        const posChanged = logicalPosition.distanceToSquared(new THREE.Vector3(lastSentState?.x ?? 0, lastSentState?.y ?? 0, lastSentState?.z ?? 0)) > pTSq;
        const rotChanged = Math.abs(currentRotationY - (lastSentState?.rotationY ?? 0)) > rTh;

        if (posChanged || rotChanged) {
            // Update local cache immediately (plain object)
            playerState.x = logicalPosition.x;
            playerState.y = logicalPosition.y; // Send feet Y
            playerState.z = logicalPosition.z;
            playerState.rotationY = currentRotationY;

            // Send update to server
            if (typeof Network !== 'undefined') Network.sendPlayerUpdate({ x: playerState.x, y: playerState.y, z: playerState.z, rotationY: currentRotationY });
        }
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

console.log("gameLogic.js loaded (Physics, Ground Check, Void Check Enabled)");
